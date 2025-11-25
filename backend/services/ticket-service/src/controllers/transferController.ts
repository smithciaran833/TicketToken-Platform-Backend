import { FastifyRequest, FastifyReply } from 'fastify';
import { transferService } from '../services/transferService';
import { auditService } from '@tickettoken/shared';

export class TransferController {
  async transferTicket(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId, toUserId, reason } = request.body as any;
    const fromUserId = (request as any).user!.id;

    try {
      const transfer = await transferService.transferTicket(
        ticketId,
        fromUserId,
        toUserId,
        reason
      );

      // Audit log: Ticket transfer (CRITICAL - ownership change)
      await auditService.logAction({
        service: 'ticket-service',
        action: 'transfer_ticket',
        actionType: 'UPDATE',
        userId: fromUserId,
        resourceType: 'ticket',
        resourceId: ticketId,
        previousValue: {
          ownerId: fromUserId,
        },
        newValue: {
          ownerId: toUserId,
          reason,
        },
        metadata: {
          toUserId,
          transferMethod: 'direct_transfer',
          reason,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({
        success: true,
        data: transfer
      });
    } catch (error) {
      // Audit log: Failed transfer attempt
      await auditService.logAction({
        service: 'ticket-service',
        action: 'transfer_ticket',
        actionType: 'UPDATE',
        userId: fromUserId,
        resourceType: 'ticket',
        resourceId: ticketId,
        metadata: {
          toUserId,
          reason,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async getTransferHistory(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId } = request.params as any;

    const history = await transferService.getTransferHistory(ticketId);

    reply.send({
      success: true,
      data: history
    });
  }

  async validateTransfer(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId, toUserId } = request.body as any;
    const fromUserId = (request as any).user!.id;

    const validation = await transferService.validateTransferRequest(
      ticketId,
      fromUserId,
      toUserId
    );

    reply.send({
      success: validation.valid,
      data: validation
    });
  }
}

export const transferController = new TransferController();
