import { FastifyRequest, FastifyReply } from 'fastify';
import { qrCodeService } from '../services/qr-code.service';
import { logger } from '../utils/logger';

export class QRController {
  async generateQRCode(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { data, ticketId, eventId } = request.body as any;
      
      let buffer: Buffer;
      if (ticketId && eventId) {
        buffer = await qrCodeService.generateTicketQR(ticketId, eventId);
      } else if (data) {
        buffer = await qrCodeService.generateQRCode(data);
      } else {
        return reply.status(400).send({ error: 'Missing data or ticket information' });
      }
      
      reply.type('image/png').send(buffer);
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'QR generation failed');
      reply.status(500).send({ error: error.message });
    }
  }

  async generateAndStore(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { data, ticketId, eventId } = request.body as any;
      
      let buffer: Buffer;
      if (ticketId && eventId) {
        buffer = await qrCodeService.generateTicketQR(ticketId, eventId);
      } else if (data) {
        buffer = await qrCodeService.generateQRCode(data);
      } else {
        return reply.status(400).send({ error: 'Missing data or ticket information' });
      }

      // For now, just return the QR code as base64
      reply.send({
        success: true,
        qrCodeBase64: buffer.toString('base64'),
        mimeType: 'image/png'
      });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'QR generation failed');
      reply.status(500).send({ error: error.message });
    }
  }
}

export const qrController = new QRController();
