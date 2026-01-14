/**
 * Internal Service Authentication Middleware
 * 
 * Issues Fixed:
 * - #24: No internal service auth → HMAC-SHA256 signature verification
 * - #25: Missing auth middleware → Proper request validation
 * - #26-30: Auth verification → Timing-safe comparison
 * - #16: Reduce HMAC replay window → 60 seconds instead of 5 minutes
 */

import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { AuthenticationError, ErrorCode } from '../errors';

// Extend FastifyRequest to include internalService property
declare module 'fastify' {
  interface FastifyRequest {
    internalService?: string;
  }
}

// Allowed internal services that can call blockchain-service
const ALLOWED_SERVICES = [
  'payment-service',
  'ticket-service',
  'order-service',
  'minting-service',
  'transfer-service',
  'marketplace-service'
];

// =============================================================================
// CONFIGURATION - AUDIT FIX #16
// =============================================================================

// AUDIT FIX #16: Reduce replay window from 5 minutes to 60 seconds
// This limits the window for replay attacks while allowing for reasonable clock skew
// between services. If services have significant clock drift, consider using NTP.
const HMAC_REPLAY_WINDOW_MS = parseInt(
  process.env.HMAC_REPLAY_WINDOW_MS || '60000', // Default 60 seconds
  10
);

// Warning threshold - log warning when timestamp is close to expiration
// Set to 75% of window (45 seconds by default)
const HMAC_TIMESTAMP_WARNING_THRESHOLD_MS = HMAC_REPLAY_WINDOW_MS * 0.75;

// =============================================================================
// METRICS
// =============================================================================

interface HmacMetrics {
  requestsTotal: number;
  successTotal: number;
  failedTotal: number;
  replayAttemptsTotal: number;
  timestampDriftHistogram: number[];
}

const hmacMetrics: HmacMetrics = {
  requestsTotal: 0,
  successTotal: 0,
  failedTotal: 0,
  replayAttemptsTotal: 0,
  timestampDriftHistogram: []
};

/**
 * Get HMAC authentication metrics
 */
export function getHmacMetrics(): HmacMetrics & { averageDriftMs: number } {
  const totalDrift = hmacMetrics.timestampDriftHistogram.reduce((a, b) => a + b, 0);
  const avgDrift = hmacMetrics.timestampDriftHistogram.length > 0 
    ? totalDrift / hmacMetrics.timestampDriftHistogram.length 
    : 0;
  
  return {
    ...hmacMetrics,
    averageDriftMs: Math.round(avgDrift)
  };
}

/**
 * Record timestamp drift for metrics
 */
function recordTimestampDrift(driftMs: number): void {
  // Keep last 1000 samples for histogram
  if (hmacMetrics.timestampDriftHistogram.length >= 1000) {
    hmacMetrics.timestampDriftHistogram.shift();
  }
  hmacMetrics.timestampDriftHistogram.push(driftMs);
}

// Legacy alias for backwards compatibility
const TIMESTAMP_VALIDITY_MS = HMAC_REPLAY_WINDOW_MS;

/**
 * Validate internal service-to-service requests
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
      
      throw AuthenticationError.invalidToken();
    }

    // Validate the service is in allow list
    if (!ALLOWED_SERVICES.includes(internalService)) {
      logger.warn('Invalid internal service attempted access', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      
      throw AuthenticationError.forbidden('internal-service');
    }

    // Get secret from environment - MUST be configured
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      logger.error('INTERNAL_SERVICE_SECRET not configured - rejecting request');
      throw new AuthenticationError(
        'Service authentication not properly configured',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }

    // Validate timestamp is present and within validity window
    if (!timestamp) {
      throw new AuthenticationError(
        'Missing timestamp header',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);
    
    if (isNaN(requestTime) || timeDiff > TIMESTAMP_VALIDITY_MS) {
      logger.warn('Internal request with invalid or expired timestamp', {
        service: internalService,
        timeDiff,
        maxAllowed: TIMESTAMP_VALIDITY_MS,
        requestId
      });
      
      throw new AuthenticationError(
        'Request timestamp expired or invalid',
        ErrorCode.UNAUTHORIZED,
        401
      );
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
      throw AuthenticationError.invalidToken();
    }

    // Check length first (prevents timing leak from buffer comparison)
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn('Invalid internal service signature (length mismatch)', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      throw AuthenticationError.invalidToken();
    }

    // Use constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      logger.warn('Invalid internal service signature', {
        service: internalService,
        ip: request.ip,
        requestId
      });
      throw AuthenticationError.invalidToken();
    }

    // Authentication successful
    request.internalService = internalService;
    
    logger.info('Internal service authenticated', {
      service: internalService,
      path: request.url,
      requestId
    });

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(error.toProblemDetails(request.id as string, request.url));
    }
    
    logger.error('Internal auth middleware error', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    
    return reply.code(500).send({
      type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Authentication failed due to internal error'
    });
  }
}

/**
 * Generate signature for outgoing internal service requests
 * Use this when blockchain-service calls other services
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
 */
export function buildInternalHeaders(body: any): Record<string, string> {
  const { signature, timestamp } = generateInternalSignature('blockchain-service', body);
  
  return {
    'x-internal-service': 'blockchain-service',
    'x-internal-signature': signature,
    'x-timestamp': timestamp,
    'Content-Type': 'application/json'
  };
}

// Alias for backwards compatibility
export const internalAuthMiddleware = validateInternalRequest;
