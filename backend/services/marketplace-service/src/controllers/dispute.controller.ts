import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { disputeService } from '../services/dispute.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class DisputeController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { transferId, listingId, reason, description, evidence } = req.body;
      const userId = req.user?.id;
      
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
      
      res.status(201).json({ success: true, data: dispute });
    } catch (error) {
      logger.error('Error creating dispute:', error);
      next(error);
    }
  }
  
  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { disputeId } = req.params;
      const dispute = await disputeService.getDispute(disputeId);
      
      if (!dispute) {
        return res.status(404).json({ error: 'Dispute not found' });
      }
      
      res.json({ success: true, data: dispute });
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return next(error);
    }
  }
  
  async addEvidence(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { disputeId } = req.params;
      const { type, content, metadata } = req.body;
      const userId = req.user?.id;
      
      if (!userId) {
        throw new ValidationError('User ID required');
      }
      
      await disputeService.addEvidence(disputeId, userId, type, content, metadata);
      
      res.json({ success: true, message: 'Evidence added' });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      next(error);
    }
  }
  
  async getMyDisputes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new ValidationError('User ID required');
      }
      
      const disputes = await disputeService.getUserDisputes(userId);
      
      res.json({ success: true, data: disputes });
    } catch (error) {
      logger.error('Error getting user disputes:', error);
      next(error);
    }
  }
}

export const disputeController = new DisputeController();
