import { FastifyRequest, FastifyReply } from 'fastify';
import { transferService } from '../services/transferService';
import { auditService } from '@tickettoken/shared';
import {
  serializeTransfer,
  serializeTransferForSender,
  serializeTransfers,
  serializeTransfersForSender,
} from '../serializers';

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

      // Serialize for sender - includes masked recipient email
      reply.send({
        success: true,
        data: serializeTransferForSender(transfer)
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

    // Serialize transfers - strip sensitive fields like acceptance_code, to_email
    reply.send({
      success: true,
      data: serializeTransfers(history)
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

    // Validation response contains only valid/reason, no sensitive data to serialize
    reply.send({
      success: validation.valid,
      data: {
        valid: validation.valid,
        reason: validation.reason,
      }
    });
  }
}

export const transferController = new TransferController();
