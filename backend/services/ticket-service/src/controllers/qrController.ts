import { FastifyRequest, FastifyReply } from 'fastify';
import { qrService } from '../services/qrService';
import { ticketService } from '../services/ticketService';
import { ForbiddenError } from '../utils/errors';

export class QRController {
  async generateQR(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId } = request.params as any;
    const user = (request as any).user;
    const tenantId = (request as any).tenantId;

    // SECURITY FIX: Verify ticket ownership with tenant isolation
    const ticket = await ticketService.getTicket(ticketId, tenantId);

    if (ticket.userId !== user!.id && user!.role !== 'admin') {
      throw new ForbiddenError('You do not own this ticket');
    }

    const { qrCode, qrImage } = await qrService.generateRotatingQR(ticketId);

    reply.send({
      success: true,
      data: {
        qrCode,
        qrImage,
        expiresIn: 30 // seconds
      }
    });
  }

  async validateQR(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { qrCode, eventId, entrance, deviceId } = request.body as any;
    const user = (request as any).user;

    const validation = await qrService.validateQR(qrCode, {
      eventId,
      entrance,
      deviceId,
      validatorId: user?.id
    });

    reply.send({
      success: validation.isValid,
      data: validation
    });
  }

  async refreshQR(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId } = request.body as any;
    const user = (request as any).user;
    const tenantId = (request as any).tenantId;

    // SECURITY FIX: Verify ticket ownership with tenant isolation
    const ticket = await ticketService.getTicket(ticketId, tenantId);

    if (ticket.userId !== user!.id && user!.role !== 'admin') {
      throw new ForbiddenError('You do not own this ticket');
    }

    const { qrCode, qrImage } = await qrService.generateRotatingQR(ticketId);

    reply.send({
      success: true,
      data: {
        qrCode,
        qrImage,
        expiresIn: 30
      }
    });
  }
}

export const qrController = new QRController();
