import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import QRGenerator from '../services/QRGenerator';
import logger from '../utils/logger';

const qrGenerator = new QRGenerator();

interface GenerateParams {
  ticketId: string;
}

interface ValidateBody {
  qr_data: string;
}

export default async function qrRoutes(fastify: FastifyInstance) {
  // GET /api/qr/generate/:ticketId - Generate QR code for a ticket
  fastify.get('/generate/:ticketId', async (request: FastifyRequest<{ Params: GenerateParams }>, reply: FastifyReply) => {
    try {
      const { ticketId } = request.params;
      const result = await qrGenerator.generateRotatingQR(ticketId);

      return reply.send(result);
    } catch (error: any) {
      logger.error('QR generation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'QR_GENERATION_ERROR',
        message: error.message
      });
    }
  });

  // POST /api/qr/validate - Validate a QR code
  fastify.post('/validate', async (request: FastifyRequest<{ Body: ValidateBody }>, reply: FastifyReply) => {
    try {
      const { qr_data } = request.body;

      if (!qr_data) {
        return reply.status(400).send({
          success: false,
          error: 'MISSING_QR_DATA'
        });
      }

      // Parse and validate QR data
      const parts = qr_data.split(':');
      if (parts.length !== 3) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_QR_FORMAT'
        });
      }

      return reply.send({
        success: true,
        valid: true
      });
    } catch (error) {
      logger.error('QR validation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'VALIDATION_ERROR'
      });
    }
  });
}
