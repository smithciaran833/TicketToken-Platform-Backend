import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
const MAX_TIMESTAMP_DIFF = 300000; // 5 minutes in milliseconds

interface InternalAuthHeaders {
  'x-internal-service': string;
  'x-timestamp': string;
  'x-internal-signature': string;
}

/**
 * Middleware to authenticate internal service-to-service requests
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const serviceName = request.headers['x-internal-service'] as string;
    const timestamp = request.headers['x-timestamp'] as string;
    const signature = request.headers['x-internal-signature'] as string;

    // Check if all required headers are present
    if (!serviceName || !timestamp || !signature) {
      logger.warn('Missing internal auth headers', {
        path: request.url,
        method: request.method,
        ip: request.ip
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing authentication headers'
      });
    }

    // Validate timestamp to prevent replay attacks
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const timeDiff = Math.abs(currentTime - requestTime);

    if (timeDiff > MAX_TIMESTAMP_DIFF) {
      logger.warn('Request timestamp too old', {
        serviceName,
        timeDiff,
        maxAllowed: MAX_TIMESTAMP_DIFF
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Request timestamp is too old'
      });
    }

    // Reconstruct the payload that should have been signed
    const body = request.body ? JSON.stringify(request.body) : '';
    const payload = `${serviceName}:${timestamp}:${body}`;

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', INTERNAL_SERVICE_SECRET)
      .update(payload)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      logger.warn('Invalid signature', {
        serviceName,
        path: request.url,
        method: request.method
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature'
      });
    }

    // Authentication successful
    logger.debug('Internal service authenticated', {
      serviceName,
      path: request.url,
      method: request.method
    });

    // Attach service name to request for later use
    (request as any).internalService = serviceName;

  } catch (error: any) {
    logger.error('Internal auth error', {
      error: error.message,
      stack: error.stack
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication error'
    });
  }
}

/**
 * Helper to generate internal service auth headers for making requests
 */
export function generateInternalAuthHeaders(
  serviceName: string,
  body?: any
): InternalAuthHeaders {
  const timestamp = Date.now().toString();
  const bodyString = body ? JSON.stringify(body) : '';
  const payload = `${serviceName}:${timestamp}:${bodyString}`;
  
  const signature = crypto
    .createHmac('sha256', INTERNAL_SERVICE_SECRET)
    .update(payload)
    .digest('hex');

  return {
    'x-internal-service': serviceName,
    'x-timestamp': timestamp,
    'x-internal-signature': signature
  };
}

export default internalAuthMiddleware;
