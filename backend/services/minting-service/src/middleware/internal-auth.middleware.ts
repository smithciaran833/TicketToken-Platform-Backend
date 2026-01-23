/**
 * Internal Auth Middleware (New) - minting-service
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase A HMAC Standardization - Week 2
 *
 * SECURITY FIXES:
 * - Added nonce validation to prevent replay attacks (was MISSING - HIGH severity)
 * - Added Redis nonce store for replay prevention
 * - Reduced replay window from 5 minutes to 60 seconds (Audit #16)
 * - Standardized header format to include x-internal-nonce and x-internal-body-hash
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
  (process.env.ALLOWED_INTERNAL_SERVICES || 'payment-service,ticket-service,order-service,blockchain-service,api-gateway,marketplace-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      serviceName: 'minting-service',
      replayWindowMs: 60000, // 60 seconds (FIXED: was 5 minutes - Audit #16)
    })
  : null;

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
 * HMAC-based internal authentication using shared library
 *
 * SECURITY FIX: This replaces the old middleware which had NO nonce validation,
 * making it vulnerable to replay attacks within the 5-minute window.
 */
export async function internalAuthMiddlewareNew(
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

    // SECURITY: Nonce validation now happens inside hmacValidator.validate()
    // This prevents replay attacks even within the timestamp window
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

    request.internalServiceNew = {
      serviceName: normalizedServiceName,
      isInternal: true,
      authenticatedAt: Date.now(),
    };

    // Backward compatibility: set legacy property for existing route handlers
    (request as any).internalService = normalizedServiceName;

    log.debug({ serviceName: normalizedServiceName, path: request.url }, 'Internal service authenticated');
  } catch (error) {
    if (error instanceof ReplayAttackError) {
      // SECURITY: This is the new protection against replay attacks
      log.warn({ error: error.message }, 'Replay attack detected and blocked');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Request already processed (replay attack blocked)',
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
export async function requireInternalAuthNew(
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

export default internalAuthMiddlewareNew;
