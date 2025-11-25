import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import QRValidator from '../services/QRValidator';
import logger from '../utils/logger';
import { scansAllowedTotal, scansDeniedTotal, scanLatency } from '../utils/metrics';
import { scanRateLimiter } from '../middleware/rate-limit.middleware';
import { authenticateRequest, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { scanRequestSchema, bulkScanRequestSchema } from '../validators/scan.validator';

const qrValidator = new QRValidator();

interface ScanBody {
  qr_data: string;
  device_id: string;
  location?: string;
  staff_user_id?: string;
}

export default async function scanRoutes(fastify: FastifyInstance) {
  // Register rate limiter for this route
  await fastify.register(rateLimit, scanRateLimiter);

  // POST /api/scan - Main scanning endpoint with authentication and rate limiting
  // SECURITY FIX: Added authentication - only VENUE_STAFF and ADMIN can scan tickets
  // Phase 2.5: Added Joi validation
  fastify.post<{ Body: ScanBody }>('/', {
    preHandler: [
      authenticateRequest, 
      requireRole('VENUE_STAFF', 'VENUE_MANAGER', 'ADMIN'),
      validateRequest(scanRequestSchema)
    ]
  }, async (request, reply) => {
    const startTime = Date.now();

    try {
      const { qr_data, device_id, location, staff_user_id } = request.body;

      if (!qr_data || !device_id) {
        scansDeniedTotal.labels('missing_parameters').inc();
        return reply.status(400).send({
          success: false,
          error: 'MISSING_PARAMETERS',
          message: 'qr_data and device_id are required'
        });
      }

      // SECURITY: Log scan attempts with authenticated user context
      logger.info('Scan attempt', {
        deviceId: device_id,
        staffUser: staff_user_id,
        authenticatedUser: request.user?.userId,
        tenantId: request.user?.tenantId,
        venueId: request.user?.venueId,
        role: request.user?.role,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      const result = await qrValidator.validateScan(
        qr_data,
        device_id,
        location,
        staff_user_id,
        request.user // Pass authenticated user context for venue/tenant isolation
      );

      const duration = (Date.now() - startTime) / 1000;
      scanLatency.observe(duration);

      if (result.valid) {
        scansAllowedTotal.inc();
        return reply.send(result);
      } else {
        scansDeniedTotal.labels(result.reason || 'unknown').inc();

        // ISSUE #26 FIX: Track failed scan attempts for security monitoring
        if (result.reason === 'INVALID_QR' || result.reason === 'TICKET_NOT_FOUND') {
          logger.warn('Invalid QR scan attempt', {
            deviceId: device_id,
            reason: result.reason,
            ip: request.ip
          });
        }

        return reply.status(400).send(result);
      }
    } catch (error) {
      logger.error('Scan error:', error);
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to process scan'
      });
    }
  });

  // ISSUE #26 FIX: Add bulk scan endpoint with stricter rate limiting
  const bulkScanLimiter = {
    global: false,
    max: 5,
    timeWindow: 5 * 60 * 1000,
    errorResponseBuilder: () => ({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many bulk scan requests'
    })
  };

  await fastify.register(async (instance) => {
    await instance.register(rateLimit, bulkScanLimiter);
    
    // SECURITY FIX: Added authentication to bulk scan endpoint
    // Phase 2.5: Added Joi validation
    instance.post('/bulk', {
      preHandler: [
        authenticateRequest, 
        requireRole('VENUE_STAFF', 'VENUE_MANAGER', 'ADMIN'),
        validateRequest(bulkScanRequestSchema)
      ]
    }, async (request, reply) => {
      // Bulk scanning logic here
      return reply.status(501).send({ error: 'Bulk scanning not implemented' });
    });
  });
}
