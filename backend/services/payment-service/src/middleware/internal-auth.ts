import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });

// SECURITY: No default fallback - secret MUST be provided via environment
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

if (!INTERNAL_SECRET || INTERNAL_SECRET.length < 32) {
  const errorMsg = 'INTERNAL_SERVICE_SECRET must be at least 32 characters';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(errorMsg);
  } else {
    log.warn(`⚠️ ${errorMsg} - this would fail in production`);
  }
}

// ISSUE #25 FIX: Consistent internal service authentication
export async function internalAuth(request: FastifyRequest, reply: FastifyReply) {
  const serviceName = request.headers['x-internal-service'] as string;
  const timestamp = request.headers['x-internal-timestamp'] as string;
  const signature = request.headers['x-internal-signature'] as string;

  // Check all required headers
  if (!serviceName || !timestamp || !signature) {
    log.warn({
      path: request.url,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasSignature: !!signature
    }, 'Internal request missing required headers');
    return reply.status(401).send({ error: 'Missing authentication headers' });
  }

  // Verify timestamp is within 5 minutes
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn({
      service: serviceName,
      timeDiff: timeDiff / 1000
    }, 'Internal request with invalid timestamp');
    return reply.status(401).send({ error: 'Request expired' });
  }

  // SECURITY FIX: Removed dev temp-signature bypass - all environments require proper auth
  
  // Verify HMAC signature
  if (!INTERNAL_SECRET) {
    log.error('INTERNAL_SERVICE_SECRET not configured');
    return reply.status(500).send({ error: 'Service authentication not configured' });
  }

  const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}:${JSON.stringify(request.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  // SECURITY FIX: Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  
  if (signatureBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    log.warn({
      service: serviceName,
      path: request.url
    }, 'Invalid internal service signature');
    return reply.status(401).send({ error: 'Invalid signature' });
  }

  // Add service info to request
  (request as any).internalService = serviceName;
  
  log.debug({
    service: serviceName,
    path: request.url
  }, 'Internal request authenticated');
}
