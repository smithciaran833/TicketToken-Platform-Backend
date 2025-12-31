import { FastifyPluginAsync } from 'fastify';
import { db } from '../config/database';
import * as crypto from 'crypto';

// SECURITY FIX (SC2/SM2): Remove hardcoded default secret
// Service will fail to start if INTERNAL_SERVICE_SECRET is not set
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

if (!INTERNAL_SECRET) {
  throw new Error('CRITICAL: INTERNAL_SERVICE_SECRET environment variable is required but not set');
}

const internalValidationRoutes: FastifyPluginAsync = async (fastify) => {
  // ISSUE #25 FIX: Add authentication hook for internal routes
  fastify.addHook('preHandler', async (request, reply) => {
    const serviceName = request.headers['x-internal-service'] as string;
    const timestamp = request.headers['x-internal-timestamp'] as string;
    const signature = request.headers['x-internal-signature'] as string;

    if (!serviceName || !timestamp || !signature) {
      return reply.status(401).send({ error: 'Missing authentication headers' });
    }

    // Verify timestamp
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);

    if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
      return reply.status(401).send({ error: 'Request expired' });
    }

    // Accept temp-signature in development
    if (signature === 'temp-signature' && process.env.NODE_ENV !== 'production') {
      (request as any).internalService = serviceName;
      return;
    }

    // Verify signature using constant-time comparison (HM18 fix)
    const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
    const expectedSignature = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');

    // SECURITY FIX (HM18): Use constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length || 
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    (request as any).internalService = serviceName;
  });

  fastify.get('/internal/venues/:venueId/validate-ticket/:ticketId', async (request, reply) => {
    const { venueId, ticketId } = request.params as { venueId: string; ticketId: string };
    
    // Pino logger format: object first, message second
    fastify.log.info({
      venueId,
      ticketId,
      requestingService: (request as any).internalService
    }, 'Internal ticket validation request');

    try {
      // Use the imported db directly instead of container.resolve
      const result = await db.raw(`
        SELECT t.*, e.venue_id, e.start_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = ? AND e.venue_id = ?
      `, [ticketId, venueId]);

      if (!result.rows[0]) {
        return reply.send({ valid: false, reason: 'Ticket not found for venue' });
      }

      // Check if already scanned
      const scanCheck = await db('ticket_validations')
        .where('ticket_id', ticketId)
        .first();

      return reply.send({
        valid: !scanCheck,
        alreadyScanned: !!scanCheck,
        ticket: result.rows[0]
      });
    } catch (error: any) {
      fastify.log.error('Validation error:', error);
      return reply.status(500).send({ error: 'Validation failed', details: error.message });
    }
  });
};

export default internalValidationRoutes;
