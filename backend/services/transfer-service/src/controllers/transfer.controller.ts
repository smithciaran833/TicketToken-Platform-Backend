import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { TransferService } from '../services/transfer.service';
import { TransferError } from '../models/transfer.model';
import logger from '../utils/logger';

/**
 * TRANSFER CONTROLLER
 * 
 * HTTP request handlers for transfer endpoints
 * Phase 2: Controller Layer
 */

export class TransferController {
  private transferService: TransferService;

  constructor(pool: Pool) {
    this.transferService = new TransferService(pool);
  }

  /**
   * POST /api/v1/transfers/gift
   * Create a gift transfer
   */
  async createGiftTransfer(
    request: FastifyRequest<{
      Body: {
        ticketId: string;
        toEmail: string;
        message?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const fromUserId = request.user!.id;
      const { ticketId, toEmail, message } = request.body;

      const result = await this.transferService.createGiftTransfer(fromUserId, {
        ticketId,
        toEmail,
        message
      });

      reply.code(201).send(result);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * POST /api/v1/transfers/:transferId/accept
   * Accept a transfer
   */
  async acceptTransfer(
    request: FastifyRequest<{
      Params: { transferId: string };
      Body: {
        acceptanceCode: string;
        userId: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { transferId } = request.params;
      const { acceptanceCode, userId } = request.body;

      const result = await this.transferService.acceptTransfer(transferId, {
        acceptanceCode,
        userId
      });

      reply.send(result);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Error handler
   */
  private handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof TransferError) {
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message
      });
      return;
    }

    const err = error as Error;
    logger.error({ err }, 'Unhandled controller error');
    
    reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}
