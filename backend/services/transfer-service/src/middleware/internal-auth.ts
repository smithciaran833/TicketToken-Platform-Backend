/**
 * Internal Service Authentication Middleware for Transfer Service
 * 
 * AUDIT FIXES:
 * - S2S-2: No service identity validation → HMAC-SHA256 signature verification
 * - S2S-3: No service ACL → Allowed services list
 * - S2S-H1: No timestamp validation → Replay attack prevention
 * - S2S-H2: No request ID propagation → X-Request-ID pass-through
 * 
 * Features:
 * - HMAC-SHA256 signature verification
 * - Timestamp-based replay attack prevention
 * - Service identity validation
 * - Request ID propagation for distributed tracing
 */

import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    internalService?: string;
    isInternalRequest?: boolean;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// AUDIT FIX S2S-3: Allowed internal services that can call transfer-service
export const ALLOWED_SERVICES = [
  'api-gateway',
  'payment-service',
  'ticket-service',
  'order-service',
  'minting-service',
  'marketplace-service',
  'blockchain-service',
  'notification-service',
  'event-service',
  'scanning-service'
];

// AUDIT FIX S2S-H1: Replay window - 60 seconds to prevent replay attacks
const HMAC_REPLAY_WINDOW_MS = parseInt(
  process.env.HMAC_REPLAY_WINDOW_MS || '60000',
  10
);

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

/**
 * AUDIT FIX S2S-2: Validate internal service-to-service requests
 * Uses HMAC-SHA256 signature verification with timing-safe comparison
 */
export async function validateInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const internalService = request.headers['x-internal-service'] as string | undefined;
    const signature = request.headers['x-internal-signature'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const requestId = request.id as string;

    // Check for required headers
    if (!internalService || !signature) {
      logger.warn('Internal endpoint called without authentication headers', {
        ip: request.ip,
        path: request.url,
        requestId,
        hasService: !!internalService,
        hasSignature: !!signature
      });
      
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'MISSING_INTERNAL_AUTH'
      });
    }

    // AUDIT FIX S2S-3: Validate the service is in allow list
    if (!ALLOWED_SERVICES.includes(internalService)) {
      logger.warn('Invalid internal service attempted access', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      
      return reply.status(403).send({
        error: 'Service not authorized',
        code: 'INVALID_SERVICE'
      });
    }

    // Get secret from environment - MUST be configured
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      logger.error('INTERNAL_SERVICE_SECRET not configured - rejecting request');
      return reply.status(500).send({
        error: 'Service authentication not properly configured',
        code: 'AUTH_CONFIG_ERROR'
      });
    }

    // AUDIT FIX S2S-H1: Validate timestamp is present and within validity window
    if (!timestamp) {
      return reply.status(401).send({
        error: 'Missing timestamp header',
        code: 'MISSING_TIMESTAMP'
      });
    }

    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);
    
    if (isNaN(requestTime) || timeDiff > HMAC_REPLAY_WINDOW_MS) {
      logger.warn('Internal request with invalid or expired timestamp', {
        service: internalService,
        timeDiff,
        maxAllowed: HMAC_REPLAY_WINDOW_MS,
        requestId
      });
      
      return reply.status(401).send({
        error: 'Request timestamp expired or invalid',
        code: 'TIMESTAMP_EXPIRED'
      });
    }

    // Build signature payload: service:timestamp:body
    const body = JSON.stringify(request.body || {});
    const payload = `${internalService}:${timestamp}:${body}`;
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Validate signature format and convert to buffers
    let signatureBuffer: Buffer;
    let expectedBuffer: Buffer;
    
    try {
      signatureBuffer = Buffer.from(signature, 'hex');
      expectedBuffer = Buffer.from(expectedSignature, 'hex');
    } catch (e) {
      logger.warn('Invalid signature format', {
        service: internalService,
        requestId
      });
      return reply.status(401).send({
        error: 'Invalid signature format',
        code: 'INVALID_SIGNATURE_FORMAT'
      });
    }

    // Check length first (prevents timing leak from buffer comparison)
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn('Invalid internal service signature (length mismatch)', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      return reply.status(401).send({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Use constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      logger.warn('Invalid internal service signature', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      return reply.status(401).send({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Authentication successful
    request.internalService = internalService;
    request.isInternalRequest = true;
    
    logger.debug('Internal service authenticated', {
      service: internalService,
      path: request.url,
      requestId
    });

  } catch (error: any) {
    logger.error('Internal auth middleware error', {
      error: error.message,
      stack: error.stack
    });
    
    return reply.status(500).send({
      error: 'Authentication failed due to internal error',
      code: 'INTERNAL_ERROR'
    });
  }
}

// =============================================================================
// SIGNATURE GENERATION (for outgoing requests)
// =============================================================================

/**
 * Generate signature for outgoing internal service requests
 * Use this when transfer-service calls other services
 */
export function generateInternalSignature(
  serviceName: string,
  body: any,
  secret?: string
): { signature: string; timestamp: string } {
  const actualSecret = secret || process.env.INTERNAL_SERVICE_SECRET;
  
  if (!actualSecret) {
    throw new Error('INTERNAL_SERVICE_SECRET not configured');
  }

  const timestamp = Date.now().toString();
  const payload = `${serviceName}:${timestamp}:${JSON.stringify(body || {})}`;
  
  const signature = crypto
    .createHmac('sha256', actualSecret)
    .update(payload)
    .digest('hex');

  return { signature, timestamp };
}

/**
 * Build headers for internal service calls
 * AUDIT FIX S2S-H2: Includes request ID propagation
 */
export function buildInternalHeaders(body: any, requestId?: string): Record<string, string> {
  const { signature, timestamp } = generateInternalSignature('transfer-service', body);
  
  const headers: Record<string, string> = {
    'x-internal-service': 'transfer-service',
    'x-internal-signature': signature,
    'x-timestamp': timestamp,
    'Content-Type': 'application/json'
  };
  
  // S2S-H2: Propagate request ID for distributed tracing
  if (requestId) {
    headers['x-request-id'] = requestId;
  }
  
  return headers;
}

/**
 * Validate internal auth configuration at startup
 *
 * NOTE: For outgoing service calls, use the shared library clients instead:
 * import { ticketServiceClient, authServiceClient } from '@tickettoken/shared';
 */
export function validateInternalAuthConfig(): void {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!secret) {
    if (isProduction) {
      throw new Error('INTERNAL_SERVICE_SECRET is required in production');
    }
    logger.warn('INTERNAL_SERVICE_SECRET not set - internal auth will reject all requests');
  } else if (secret.length < 32) {
    logger.warn('INTERNAL_SERVICE_SECRET should be at least 32 characters');
  } else {
    logger.info('Internal auth configuration validated');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateInternalRequest,
  generateInternalSignature,
  buildInternalHeaders,
  validateInternalAuthConfig,
  ALLOWED_SERVICES
};
