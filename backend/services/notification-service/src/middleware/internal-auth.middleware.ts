/**
 * Internal Auth Middleware - notification-service
 *
 * Validates HMAC-authenticated requests from other internal services
 * using the shared library's standardized validation.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createHmacValidator,
  HmacValidationResult,
  HmacError,
  ReplayAttackError,
  SignatureError,
} from '@tickettoken/shared';
import { logger } from '../config/logger';

const log = logger.child({ component: 'InternalAuth' });

// Get HMAC configuration from environment
const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

// Allowed services that can make internal calls
const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'ticket-service,order-service,event-service,payment-service,marketplace-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

// Create HMAC validator instance
const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      replayWindowMs: 60000, // 60 seconds
      allowedServices: Array.from(ALLOWED_SERVICES),
    })
  : null;

export interface InternalServiceClaims {
  serviceName: string;
  isInternal: true;
  authenticatedAt: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalService?: InternalServiceClaims;
  }
}

/**
 * Middleware to validate internal service requests using HMAC
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

    // Check for required headers
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

    // Validate HMAC signature
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

    // Check if service is allowed
    const serviceName = headers['x-internal-service'].toLowerCase();
    if (!ALLOWED_SERVICES.has(serviceName)) {
      log.warn({ serviceName, path: request.url }, 'Unknown service attempted access');
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Service not authorized',
      });
    }

    // Attach service info to request
    request.internalService = {
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

export default internalAuthMiddleware;
