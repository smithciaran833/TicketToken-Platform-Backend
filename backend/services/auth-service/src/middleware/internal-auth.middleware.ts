/**
 * Internal Auth Middleware (New) - auth-service
 *
 * Supports BOTH JWT and HMAC authentication for service-to-service communication.
 * This allows gradual migration of calling services from JWT to HMAC.
 *
 * Phase A HMAC Standardization - Week 3
 *
 * Authentication priority:
 * 1. If x-internal-signature header present → validate HMAC
 * 2. Else if x-service-token header present → validate JWT
 * 3. Else → reject as unauthorized
 *
 * This parallel auth approach allows services to migrate one at a time
 * without breaking existing integrations.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createHmacValidator,
  HmacValidationResult,
  HmacError,
  ReplayAttackError,
  SignatureError,
} from '@tickettoken/shared';
import { verifyServiceToken } from './s2s.middleware';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });

const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,ticket-service,payment-service,order-service,event-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,scanning-service,compliance-service,analytics-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      replayWindowMs: 60000, // 60 seconds - Audit #16 compliance
      allowedServices: Array.from(ALLOWED_SERVICES),
    })
  : null;

export interface InternalServiceClaims {
  serviceName: string;
  isInternal: true;
  authenticatedAt: number;
  authMethod: 'hmac' | 'jwt';
}

declare module 'fastify' {
  interface FastifyRequest {
    internalServiceNew?: InternalServiceClaims;
  }
}

/**
 * Validate HMAC headers
 */
async function validateHMAC(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  if (!hmacValidator) {
    log.error('INTERNAL_HMAC_SECRET not configured');
    reply.status(500).send({
      error: 'Internal server error',
      message: 'Service authentication not configured',
    });
    return false;
  }

  try {
    const headers = {
      'x-internal-service': request.headers['x-internal-service'] as string,
      'x-internal-timestamp': request.headers['x-internal-timestamp'] as string,
      'x-internal-nonce': request.headers['x-internal-nonce'] as string,
      'x-internal-signature': request.headers['x-internal-signature'] as string,
      'x-internal-body-hash': request.headers['x-internal-body-hash'] as string,
    };

    if (!headers['x-internal-service'] || !headers['x-internal-signature']) {
      return false; // Not an HMAC request
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

      reply.status(401).send({
        error: 'Unauthorized',
        message: result.reason || 'Invalid signature',
      });
      return false;
    }

    const serviceName = headers['x-internal-service'].toLowerCase();
    if (!ALLOWED_SERVICES.has(serviceName)) {
      log.warn({ serviceName, path: request.url }, 'Unknown service attempted access');
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Service not authorized',
      });
      return false;
    }

    request.internalServiceNew = {
      serviceName,
      isInternal: true,
      authenticatedAt: Date.now(),
      authMethod: 'hmac',
    };

    log.debug({ serviceName, path: request.url, authMethod: 'hmac' }, 'Internal service authenticated via HMAC');
    return true;
  } catch (error) {
    if (error instanceof ReplayAttackError) {
      log.warn({ error: error.message }, 'Replay attack detected');
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Request already processed',
      });
      return false;
    }

    if (error instanceof SignatureError) {
      log.warn({ error: error.message }, 'Invalid signature');
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
      return false;
    }

    if (error instanceof HmacError) {
      log.error({ error: error.message }, 'HMAC validation error');
      reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
      return false;
    }

    throw error;
  }
}

/**
 * Parallel authentication middleware for internal service calls.
 *
 * Accepts BOTH JWT (x-service-token) and HMAC (x-internal-*) authentication.
 * This enables gradual migration from JWT to HMAC.
 */
export async function internalAuthMiddlewareNew(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip new auth if feature flag is disabled
  if (!USE_NEW_HMAC) {
    log.debug('New internal auth disabled (USE_NEW_HMAC=false)');
    return;
  }

  // Priority 1: Check for HMAC authentication headers
  const hasHmacHeaders = !!request.headers['x-internal-signature'];

  // Priority 2: Check for JWT service token
  const hasJwtToken = !!request.headers['x-service-token'];

  if (hasHmacHeaders) {
    // Validate HMAC
    const hmacValid = await validateHMAC(request, reply);
    if (!hmacValid && !reply.sent) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'HMAC authentication failed',
      });
    }
    return;
  }

  if (hasJwtToken) {
    // Fall back to JWT authentication
    // The existing verifyServiceToken will handle the response if invalid
    await verifyServiceToken(request, reply);

    // If JWT auth succeeded, set internalServiceNew for compatibility
    if (!reply.sent && (request as any).service?.authenticated) {
      request.internalServiceNew = {
        serviceName: (request as any).service.name,
        isInternal: true,
        authenticatedAt: Date.now(),
        authMethod: 'jwt',
      };
      log.debug({ serviceName: (request as any).service.name, authMethod: 'jwt' }, 'Internal service authenticated via JWT');
    }
    return;
  }

  // No authentication provided
  log.warn({
    path: request.url,
    method: request.method,
    hasHmacHeaders,
    hasJwtToken,
  }, 'No authentication provided for internal endpoint');

  return reply.status(401).send({
    error: 'Unauthorized',
    message: 'No authentication provided. Use x-internal-signature (HMAC) or x-service-token (JWT)',
  });
}

/**
 * Require internal service authentication - fails if not authenticated
 */
export async function requireInternalAuthNew(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!USE_NEW_HMAC) {
    return; // Let legacy auth handle it
  }

  // Check for new-style auth
  if (request.internalServiceNew?.isInternal) {
    return;
  }

  // Check for legacy JWT auth
  if ((request as any).service?.authenticated) {
    return;
  }

  return reply.status(403).send({
    error: 'Forbidden',
    message: 'Internal service authentication required',
  });
}

export default internalAuthMiddlewareNew;
