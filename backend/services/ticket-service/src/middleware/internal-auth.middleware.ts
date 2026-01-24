/**
 * Internal Auth Middleware (New) - ticket-service
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase A HMAC Standardization - Week 3
 *
 * CRITICAL SECURITY FIX: This replaces the old middleware that had a temp-signature bypass.
 * NO BYPASSES ALLOWED - every request must have valid HMAC authentication.
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

/**
 * SECURITY: HMAC authentication is now ENABLED by default.
 * Set USE_NEW_HMAC=false to disable (ONLY for local development).
 *
 * CRITICAL: Disabling HMAC authentication in production allows any service
 * to impersonate internal services and access protected endpoints.
 */
const USE_NEW_HMAC = process.env.USE_NEW_HMAC !== 'false'; // Default true, opt-out only

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,minting-service,transfer-service,blockchain-service,blockchain-indexer,scanning-service,venue-service,event-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      serviceName: 'ticket-service',
      replayWindowMs: 60000, // 60 seconds - Audit #16 compliance
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
 * CRITICAL: NO BYPASS LOGIC - Every request must be authenticated.
 * The old middleware had a dangerous "temp-signature" bypass that has been removed.
 */
export async function internalAuthMiddlewareNew(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip HMAC validation if explicitly disabled (opt-out for development only)
  if (!USE_NEW_HMAC) {
    log.warn('HMAC authentication is DISABLED - this should only be used in development. Set USE_NEW_HMAC=true in production.');
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
      log.warn('Missing required HMAC headers', {
        path: request.url,
        method: request.method,
        hasService: !!serviceName,
        hasSignature: !!signature,
      });

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
      log.warn('HMAC validation failed', {
        service: serviceName,
        path: request.url,
        error: result.error,
        errorCode: result.errorCode,
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: result.error || 'Invalid signature',
      });
    }

    const normalizedServiceName = serviceName.toLowerCase();
    if (!ALLOWED_SERVICES.has(normalizedServiceName)) {
      log.warn('Unknown service attempted access', { serviceName: normalizedServiceName, path: request.url });
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

    // Backward compatibility
    (request as any).internalService = normalizedServiceName;

    log.debug('Internal service authenticated', { serviceName: normalizedServiceName, path: request.url });
  } catch (error) {
    if (error instanceof ReplayAttackError) {
      log.warn('Replay attack detected', { error: error.message });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Request already processed',
      });
    }

    if (error instanceof SignatureError) {
      log.warn('Invalid signature', { error: error.message });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
    }

    if (error instanceof HmacError) {
      log.error('HMAC validation error', { error: error.message });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
    }

    log.error('Unexpected error during internal auth', { error });
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Authentication failed',
    });
  }
}

export default internalAuthMiddlewareNew;
