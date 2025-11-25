import { FastifyReply } from 'fastify';
import { AuthRequest } from '../middleware/auth.middleware';
import { disputeService } from '../services/dispute.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class DisputeController {
  async create(request: AuthRequest, reply: FastifyReply) {
    try {
      const { transferId, listingId, reason, description, evidence } = request.body as any;
      const userId = request.user?.id;

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      const dispute = await disputeService.createDispute(
        transferId,
        listingId,
        userId,
        reason,
        description,
        evidence
      );

      reply.status(201).send({ success: true, data: dispute });
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }

  async getById(request: AuthRequest, reply: FastifyReply) {
    try {
      const { disputeId } = request.params as { disputeId: string };
      const dispute = await disputeService.getDispute(disputeId);

      if (!dispute) {
        return reply.status(404).send({ error: 'Dispute not found' });
      }

      reply.send({ success: true, data: dispute });
    } catch (error) {
      logger.error('Error getting dispute:', error);
      throw error;
    }
  }

  async addEvidence(request: AuthRequest, reply: FastifyReply) {
    try {
      const { disputeId } = request.params as { disputeId: string };
      const { type, content, metadata } = request.body as any;
      const userId = request.user?.id;

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      await disputeService.addEvidence(disputeId, userId, type, content, metadata);

      reply.send({ success: true, message: 'Evidence added' });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }

  async getMyDisputes(request: AuthRequest, reply: FastifyReply) {
    try {
      const userId = request.user?.id;

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      const disputes = await disputeService.getUserDisputes(userId);

      reply.send({ success: true, data: disputes });
    } catch (error) {
      logger.error('Error getting user disputes:', error);
      throw error;
    }
  }
}

export const disputeController = new DisputeController();
