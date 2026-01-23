/**
 * Internal Auth Middleware (Fastify) - compliance-service
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase B HMAC Standardization - Fastify version for internal routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createHmacValidator,
  HmacValidationResult,
  HmacError,
  ReplayAttackError,
  SignatureError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });

const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,auth-service,payment-service,order-service,event-service,ticket-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,marketplace-service,scanning-service,analytics-service,file-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      serviceName: 'compliance-service',
      replayWindowMs: 60000, // 60 seconds
    })
  : null;

export interface InternalServiceClaims {
  serviceName: string;
  isInternal: true;
  authenticatedAt: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalService?: InternalServiceClaims | string;
  }
}

/**
 * HMAC-based internal authentication using shared library (Fastify middleware)
 */
export async function internalAuthMiddlewareFastify(
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
    // Check for required headers first
    const serviceName = request.headers['x-internal-service'] as string;
    const signature = request.headers['x-internal-signature'] as string;

    if (!serviceName || !signature) {
      log.warn({
        path: request.url,
        method: request.method,
        hasService: !!serviceName,
        hasSignature: !!signature,
      }, 'Missing required HMAC headers');

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing authentication headers',
      });
    }

    // Validate using the shared library - correct API
    const result: HmacValidationResult = await hmacValidator.validate(
      request.headers as Record<string, string | string[] | undefined>,
      request.method,
      request.url,
      request.body
    );

    if (!result.valid) {
      log.warn({
        service: serviceName,
        path: request.url,
        error: result.error,
        errorCode: result.errorCode,
      }, 'HMAC validation failed');

      return reply.status(401).send({
        error: 'Unauthorized',
        message: result.error || 'Invalid signature',
      });
    }

    const normalizedServiceName = serviceName.toLowerCase();
    if (!ALLOWED_SERVICES.has(normalizedServiceName)) {
      log.warn({ serviceName: normalizedServiceName, path: request.url }, 'Unknown service attempted access');
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Service not authorized',
      });
    }

    // Set both formats for backward compatibility
    request.internalService = normalizedServiceName;

    log.debug({ serviceName: normalizedServiceName, path: request.url }, 'Internal service authenticated');
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

export default internalAuthMiddlewareFastify;
