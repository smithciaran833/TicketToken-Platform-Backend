import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * S2S1, S2S2, IR2: Internal service authentication middleware
 * Validates requests from other internal services using shared secret
 */

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const ALLOWED_SERVICES = (process.env.ALLOWED_INTERNAL_SERVICES || 'payment-service,ticket-service,event-service').split(',');

// Service token cache to prevent replay attacks (5 minute window)
const usedTokens = new Map<string, number>();

// Clean up old tokens every minute
setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of usedTokens.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      usedTokens.delete(token);
    }
  }
}, 60 * 1000);

/**
 * Validates internal service authentication
 * Uses HMAC-based authentication with timestamp and nonce for replay protection
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!INTERNAL_SERVICE_SECRET) {
    logger.error('INTERNAL_SERVICE_SECRET not configured');
    reply.status(500).send({ error: 'Internal server error', message: 'Service authentication not configured' });
    return;
  }

  // S2S1: Check for internal auth header
  const authHeader = request.headers['x-internal-auth'] as string;
  const serviceName = request.headers['x-service-name'] as string;
  const timestamp = request.headers['x-request-timestamp'] as string;
  const nonce = request.headers['x-request-nonce'] as string;

  if (!authHeader || !serviceName || !timestamp || !nonce) {
    logger.warn('Missing internal auth headers', {
      hasAuth: !!authHeader,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasNonce: !!nonce,
      path: request.url,
    });
    reply.status(401).send({ error: 'Unauthorized', message: 'Missing internal authentication headers' });
    return;
  }

  // S2S3: Validate timestamp (within 5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    logger.warn('Invalid or expired request timestamp', { timestamp, now, serviceName });
    reply.status(401).send({ error: 'Unauthorized', message: 'Request timestamp invalid or expired' });
    return;
  }

  // Check for replay attack (nonce reuse)
  const tokenKey = `${serviceName}:${nonce}`;
  if (usedTokens.has(tokenKey)) {
    logger.warn('Potential replay attack - nonce reused', { serviceName, nonce });
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid request' });
    return;
  }

  // S2S4: Validate service identity against whitelist
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    logger.warn('Unknown service attempted access', { serviceName, path: request.url });
    reply.status(403).send({ error: 'Forbidden', message: 'Service not authorized' });
    return;
  }

  // S2S2: Validate HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SERVICE_SECRET)
    .update(`${serviceName}:${timestamp}:${nonce}:${request.method}:${request.url}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedSignature))) {
    logger.warn('Invalid internal auth signature', { serviceName, path: request.url });
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid authentication signature' });
    return;
  }

  // Mark nonce as used
  usedTokens.set(tokenKey, now);

  // Attach service info to request
  (request as any).internalService = {
    name: serviceName,
    authenticatedAt: now,
  };

  logger.debug('Internal service authenticated', { serviceName, path: request.url });
}

/**
 * Optional middleware for routes that can be accessed by both users and internal services
 */
export async function optionalInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers['x-internal-auth'];
  
  if (authHeader) {
    // If internal auth header present, validate it
    await internalAuthMiddleware(request, reply);
  }
  // Otherwise, continue without internal auth (user auth will be checked separately)
}

export default internalAuthMiddleware;
