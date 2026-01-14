import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// Extend FastifyRequest to include internalService property
declare module 'fastify' {
  interface FastifyRequest {
    internalService?: string;
  }
}

// Internal service authentication middleware
export async function validateInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check for internal service header
    const internalService = request.headers['x-internal-service'] as string | undefined;
    const signature = request.headers['x-internal-signature'] as string | undefined;

    if (!internalService || !signature) {
      logger.warn('Internal endpoint called without authentication headers', {
        ip: request.ip,
        path: request.url
      });
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Internal authentication required'
      });
    }

    // Validate the service is allowed
    const allowedServices = ['payment-service', 'ticket-service', 'order-service', 'blockchain-service'];
    if (!allowedServices.includes(internalService)) {
      logger.warn('Invalid internal service attempted access', {
        service: internalService,
        ip: request.ip
      });
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Service not authorized'
      });
    }

    // Verify the signature - MUST be configured in environment
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      logger.error('INTERNAL_SERVICE_SECRET not configured');
      return reply.code(500).send({
        error: 'CONFIGURATION_ERROR',
        message: 'Service authentication not properly configured'
      });
    }

    const timestamp = request.headers['x-timestamp'] as string | undefined;

    if (!timestamp) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Missing timestamp'
      });
    }

    // Check timestamp is within 5 minutes
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      logger.warn('Internal request with expired timestamp', {
        service: internalService,
        timeDiff: Math.abs(now - requestTime)
      });
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Request expired'
      });
    }

    // Verify signature (HMAC-SHA256 of service:timestamp:body)
    const body = JSON.stringify(request.body);
    const payload = `${internalService}:${timestamp}:${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    // First check if lengths match (prevents timing leak from buffer comparison)
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn('Invalid internal service signature (length mismatch)', {
        service: internalService,
        ip: request.ip
      });
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid signature'
      });
    }

    // Use constant-time comparison
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      logger.warn('Invalid internal service signature', {
        service: internalService,
        ip: request.ip
      });
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid signature'
      });
    }

    // Add service info to request
    request.internalService = internalService;
    logger.info('Internal service authenticated', {
      service: internalService,
      path: request.url
    });
  } catch (error) {
    logger.error('Internal auth middleware error:', error);
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Authentication failed'
    });
  }
}
