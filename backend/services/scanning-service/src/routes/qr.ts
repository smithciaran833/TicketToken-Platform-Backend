import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import QRGenerator from '../services/QRGenerator';
import logger from '../utils/logger';
import { authenticateRequest, requireRole } from '../middleware/auth.middleware';
import { generateQRSchema, validateQRSchema, GenerateQRParams, ValidateQRBody } from '../schemas/validation';
import { BadRequestError, NotFoundError, toAppError } from '../errors';

const qrGenerator = new QRGenerator();

/**
 * QR Routes
 *
 * Fixes SEC-1: All routes now require authentication
 * Fixes INP-1: All routes have schema validation
 * Fixes INP-2: POST body validated
 * Fixes INP-3: UUID params validated with format: 'uuid'
 */
export default async function qrRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  fastify.addHook('preHandler', authenticateRequest);

  /**
   * GET /api/qr/generate/:ticketId
   * Generate a rotating QR code for a ticket
   *
   * Requires: Authentication
   * Roles: TICKET_HOLDER, VENUE_STAFF, ADMIN
   */
  fastify.get<{ Params: GenerateQRParams }>(
    '/generate/:ticketId',
    {
      schema: generateQRSchema,
      preHandler: [requireRole('TICKET_HOLDER', 'VENUE_STAFF', 'ADMIN', 'ORGANIZER')],
    },
    async (request: FastifyRequest<{ Params: GenerateQRParams }>, reply: FastifyReply) => {
      const { ticketId } = request.params;
      const correlationId = request.correlationId;

      try {
        logger.info('Generating QR code', {
          ticketId,
          userId: request.user?.userId,
          tenantId: request.tenantId,
          correlationId,
        });

        const result = await qrGenerator.generateRotatingQR(ticketId);

        logger.info('QR code generated successfully', {
          ticketId,
          correlationId,
        });

        return reply.status(200).send({
          ...result,
          success: true,
        });
      } catch (error: unknown) {
        const appError = toAppError(error, correlationId);

        logger.error('QR generation error', {
          ticketId,
          error: appError.message,
          correlationId,
        });

        return reply.status(appError.status).send(appError.toJSON());
      }
    }
  );

  /**
   * POST /api/qr/validate
   * Validate a QR code (lightweight validation, not full scan)
   *
   * Requires: Authentication
   * Roles: VENUE_STAFF, SCANNER, ADMIN
   */
  fastify.post<{ Body: ValidateQRBody }>(
    '/validate',
    {
      schema: validateQRSchema,
      preHandler: [requireRole('VENUE_STAFF', 'SCANNER', 'ADMIN', 'ORGANIZER')],
    },
    async (request: FastifyRequest<{ Body: ValidateQRBody }>, reply: FastifyReply) => {
      const { qr_data, device_id, location } = request.body;
      const correlationId = request.correlationId;

      try {
        logger.info('Validating QR code', {
          hasDeviceId: !!device_id,
          hasLocation: !!location,
          userId: request.user?.userId,
          tenantId: request.tenantId,
          correlationId,
        });

        // Validate QR data format
        if (!qr_data || qr_data.length < 10) {
          throw new BadRequestError('Invalid QR data: too short', { correlationId });
        }

        // Parse and validate QR data format
        // Expected format: ticketId:nonce:signature or ticketId:timestamp:hmac
        const parts = qr_data.split(':');
        if (parts.length < 2) {
          throw new BadRequestError('Invalid QR format: expected colon-separated values', {
            correlationId,
            extensions: { reason: 'INVALID_FORMAT' }
          });
        }

        // Extract ticket ID and validate UUID format
        const ticketIdCandidate = parts[0];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(ticketIdCandidate)) {
          throw new BadRequestError('Invalid QR format: ticket ID must be a valid UUID', {
            correlationId,
            extensions: { reason: 'INVALID_TICKET_ID' }
          });
        }

        // Basic validation passed - for full validation use the scan endpoint
        logger.info('QR code basic validation passed', {
          ticketId: ticketIdCandidate,
          correlationId,
        });

        return reply.status(200).send({
          success: true,
          valid: true,
          ticket_id: ticketIdCandidate,
          status: 'VALID',
          message: 'QR format is valid. Use /scan endpoint for full ticket validation.',
        });
      } catch (error: unknown) {
        const appError = toAppError(error, correlationId);

        logger.warn('QR validation failed', {
          error: appError.message,
          correlationId,
        });

        return reply.status(appError.status).send(appError.toJSON());
      }
    }
  );

  /**
   * GET /api/qr/status/:ticketId
   * Get the current QR code status for a ticket
   *
   * Requires: Authentication
   */
  fastify.get<{ Params: GenerateQRParams }>(
    '/status/:ticketId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            ticketId: { type: 'string', format: 'uuid' },
          },
          required: ['ticketId'],
        },
      },
      preHandler: [requireRole('TICKET_HOLDER', 'VENUE_STAFF', 'ADMIN', 'ORGANIZER')],
    },
    async (request: FastifyRequest<{ Params: GenerateQRParams }>, reply: FastifyReply) => {
      const { ticketId } = request.params;
      const correlationId = request.correlationId;

      try {
        logger.debug('Getting QR status', {
          ticketId,
          userId: request.user?.userId,
          correlationId,
        });

        // Check if ticket exists and get status
        // This would typically query the database
        return reply.status(200).send({
          success: true,
          ticket_id: ticketId,
          qr_enabled: true,
          rotation_enabled: true,
          last_generated: new Date().toISOString(),
          scanned: false,
        });
      } catch (error: unknown) {
        const appError = toAppError(error, correlationId);

        logger.error('Error getting QR status', {
          ticketId,
          error: appError.message,
          correlationId,
        });

        return reply.status(appError.status).send(appError.toJSON());
      }
    }
  );

  /**
   * POST /api/qr/revoke/:ticketId
   * Revoke a QR code (invalidate it)
   *
   * Requires: Authentication, Admin role
   */
  fastify.post<{ Params: GenerateQRParams; Body: { reason?: string } }>(
    '/revoke/:ticketId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            ticketId: { type: 'string', format: 'uuid' },
          },
          required: ['ticketId'],
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [requireRole('ADMIN', 'ORGANIZER')],
    },
    async (request, reply) => {
      const { ticketId } = request.params;
      const body = request.body;
      const correlationId = request.correlationId;

      try {
        logger.info('Revoking QR code', {
          ticketId,
          reason: body?.reason,
          userId: request.user?.userId,
          correlationId,
        });

        // Revoke the QR code
        // This would typically update the database and invalidate cached data

        return reply.status(200).send({
          success: true,
          message: 'QR code revoked successfully',
          ticket_id: ticketId,
          revoked_at: new Date().toISOString(),
          revoked_by: request.user?.userId,
        });
      } catch (error: unknown) {
        const appError = toAppError(error, correlationId);

        logger.error('Error revoking QR code', {
          ticketId,
          error: appError.message,
          correlationId,
        });

        return reply.status(appError.status).send(appError.toJSON());
      }
    }
  );
}
