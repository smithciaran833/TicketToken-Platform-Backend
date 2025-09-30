import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../config/database';

export class AdminController {
  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await db('marketplace_listings')
        .select(
          db.raw('COUNT(*) as total_listings'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as active_listings', ['active']),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as sold_listings', ['sold']),
          db.raw('AVG(price) as average_price')
        )
        .first();
      
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting admin stats:', error);
      next(error);
    }
  }
  
  async getDisputes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const disputes = await db('marketplace_disputes')
        .whereIn('status', ['open', 'investigating'])
        .orderBy('created_at', 'desc')
        .limit(50);
      
      res.json({ success: true, data: disputes });
    } catch (error) {
      logger.error('Error getting disputes:', error);
      next(error);
    }
  }
  
  async resolveDispute(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { disputeId } = req.params;
      const { resolution, reason } = req.body;
      
      await db('marketplace_disputes')
        .where('id', disputeId)
        .update({
          status: 'resolved',
          resolution,
          resolved_by: req.user?.id,
          resolved_at: new Date(),
          updated_at: new Date()
        });
      
      res.json({ success: true, message: 'Dispute resolved' });
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      next(error);
    }
  }
  
  async getFlaggedUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const flagged = await db('anti_bot_violations')
        .select('user_id', db.raw('COUNT(*) as violation_count'), db.raw('MAX(flagged_at) as last_flagged'))
        .groupBy('user_id')
        .orderBy('violation_count', 'desc')
        .limit(50);
      
      res.json({ success: true, data: flagged });
    } catch (error) {
      logger.error('Error getting flagged users:', error);
      next(error);
    }
  }
  
  async banUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { userId, reason, duration } = req.body;
      
      await db('marketplace_blacklist').insert({
        id: require('uuid').v4(),
        user_id: userId,
        reason,
        banned_by: req.user?.id,
        banned_at: new Date(),
        expires_at: duration ? new Date(Date.now() + duration * 86400000) : null,
        is_active: true
      });
      
      res.json({ success: true, message: 'User banned' });
    } catch (error) {
      logger.error('Error banning user:', error);
      next(error);
    }
  }
}

export const adminController = new AdminController();
