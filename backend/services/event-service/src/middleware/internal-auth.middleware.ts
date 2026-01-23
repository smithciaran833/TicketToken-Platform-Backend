/**
 * Internal Auth Middleware (New) - event-service
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase A HMAC Standardization - Week 3
 *
 * NOTE: This service previously used a hybrid auth system with:
 * - X-Service-Token (base64 JSON with embedded HMAC signature)
 * - X-API-Key (for S2S API key authentication)
 *
 * The new standardized HMAC middleware uses x-internal-* headers and
 * provides consistent authentication across all services.
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

const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';
const SERVICE_NAME = process.env.SERVICE_NAME || 'event-service';

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,auth-service,ticket-service,venue-service,order-service,payment-service,notification-service,search-service,analytics-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      serviceName: SERVICE_NAME,
      replayWindowMs: 60000, // 60 seconds - Audit #16 compliance
    })
  : null;

// Signer for outgoing calls to other services
let hmacSigner: HmacSigner | null = null;
if (INTERNAL_HMAC_SECRET) {
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
 * Generate standard HMAC headers for outgoing service calls
 *
 * This replaces the old X-Service-Token format with standardized headers.
 */
export function generateInternalAuthHeaders(
  method: string,
  path: string,
  body?: any
): Record<string, string> {
  if (!hmacSigner) {
    log.warn('HMAC signer not configured - falling back to legacy auth');
    return {};
  }

  return hmacSigner.sign(method, path, body);
}

/**
 * HMAC-based internal authentication using shared library
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

    // Validate using the shared library
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
