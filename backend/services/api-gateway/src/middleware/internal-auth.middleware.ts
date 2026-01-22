/**
 * Internal Auth Middleware (New) - api-gateway
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase A HMAC Standardization - Week 1
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createHmacValidator,
  createHmacSigner,
  HmacValidationResult,
  HmacError,
  ReplayAttackError,
  SignatureError,
  HmacSigner,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });

const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';
const SERVICE_NAME = 'api-gateway';

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'auth-service,event-service,ticket-service,venue-service,payment-service,order-service,notification-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      replayWindowMs: 60000, // 60 seconds
      allowedServices: Array.from(ALLOWED_SERVICES),
    })
  : null;

// Signer for outgoing requests
let hmacSigner: HmacSigner | null = null;
if (INTERNAL_HMAC_SECRET && USE_NEW_HMAC) {
  hmacSigner = createHmacSigner({
    secret: INTERNAL_HMAC_SECRET,
    serviceName: SERVICE_NAME,
  });
}

export interface InternalServiceClaims {
  serviceName: string;
  isInternal: true;
  authenticatedAt: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalServiceNew?: InternalServiceClaims;
  }
}

/**
 * Generate HMAC headers for outgoing internal service calls
 * Uses the new standardized format with nonce and body hash
 */
export function generateInternalAuthHeadersNew(
  method: string,
  url: string,
  body?: any
): Record<string, string> {
  if (!USE_NEW_HMAC || !hmacSigner) {
    // Fall back to legacy format if new HMAC is disabled
    const crypto = require('crypto');
    const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-internal-service-secret-change-in-production';
    const timestamp = Date.now().toString();
    const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}:${JSON.stringify(body || {})}`;
    const signature = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');

    return {
      'x-internal-service': SERVICE_NAME,
      'x-internal-timestamp': timestamp,
      'x-internal-signature': signature,
    };
  }

  // Use new standardized HMAC format
  return hmacSigner.sign(method, url, body);
}

/**
 * HMAC-based internal authentication using shared library
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip HMAC validation if feature flag is disabled
  if (!USE_NEW_HMAC) {
    log.debug('HMAC validation disabled (USE_NEW_HMAC=false)');
    return;
  }

  if (!hmacValidator) {
    log.error('INTERNAL_HMAC_SECRET not configured');
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Service authentication not configured',
    });
  }

  try {
    // Extract HMAC headers
    const headers = {
      'x-internal-service': request.headers['x-internal-service'] as string,
      'x-internal-timestamp': request.headers['x-internal-timestamp'] as string,
      'x-internal-nonce': request.headers['x-internal-nonce'] as string,
      'x-internal-signature': request.headers['x-internal-signature'] as string,
      'x-internal-body-hash': request.headers['x-internal-body-hash'] as string,
    };

    if (!headers['x-internal-service'] || !headers['x-internal-signature']) {
      log.warn({
        path: request.url,
        method: request.method,
        hasService: !!headers['x-internal-service'],
        hasSignature: !!headers['x-internal-signature'],
      }, 'Missing required HMAC headers');

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing authentication headers',
      });
    }

    const result: HmacValidationResult = await hmacValidator.validate({
      serviceName: headers['x-internal-service'],
      timestamp: headers['x-internal-timestamp'],
      nonce: headers['x-internal-nonce'],
      signature: headers['x-internal-signature'],
      bodyHash: headers['x-internal-body-hash'],
      method: request.method,
      path: request.url,
      body: request.body,
    });

    if (!result.valid) {
      log.warn({
        service: headers['x-internal-service'],
        path: request.url,
        reason: result.reason,
      }, 'HMAC validation failed');

      return reply.status(401).send({
        error: 'Unauthorized',
        message: result.reason || 'Invalid signature',
      });
    }

    const serviceName = headers['x-internal-service'].toLowerCase();
    if (!ALLOWED_SERVICES.has(serviceName)) {
      log.warn({ serviceName, path: request.url }, 'Unknown service attempted access');
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Service not authorized',
      });
    }

    request.internalServiceNew = {
      serviceName,
      isInternal: true,
      authenticatedAt: Date.now(),
    };

    log.debug({ serviceName, path: request.url }, 'Internal service authenticated');
  } catch (error) {
    if (error instanceof ReplayAttackError) {
      log.warn({ error: error.message }, 'Replay attack detected');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Request already processed',
      });
    }

    if (error instanceof SignatureError) {
      log.warn({ error: error.message }, 'Invalid signature');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
    }

    if (error instanceof HmacError) {
      log.error({ error: error.message }, 'HMAC validation error');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
    }

    log.error({ error }, 'Unexpected error during internal auth');
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Require internal service authentication - fails if not authenticated
 */
export async function requireInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!USE_NEW_HMAC) {
    return; // Let legacy auth handle it
  }

  if (!request.internalServiceNew?.isInternal) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Internal service authentication required',
    });
  }
}

export default internalAuthMiddleware;
