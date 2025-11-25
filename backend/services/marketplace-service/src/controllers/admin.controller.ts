import { FastifyReply } from 'fastify';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../config/database';

export class AdminController {
  async getStats(request: AuthRequest, reply: FastifyReply) {
    try {
      const stats = await db('marketplace_listings')
        .select(
          db.raw('COUNT(*) as total_listings'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as active_listings', ['active']),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as sold_listings', ['sold']),
          db.raw('AVG(price) as average_price')
        )
        .first();

      reply.send({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting admin stats:', error);
      throw error;
    }
  }

  async getDisputes(request: AuthRequest, reply: FastifyReply) {
    try {
      const disputes = await db('marketplace_disputes')
        .whereIn('status', ['open', 'investigating'])
        .orderBy('created_at', 'desc')
        .limit(50);

      reply.send({ success: true, data: disputes });
    } catch (error) {
      logger.error('Error getting disputes:', error);
      throw error;
    }
  }

  async resolveDispute(request: AuthRequest, reply: FastifyReply) {
    try {
      const { disputeId } = request.params as { disputeId: string };
      const { resolution, reason } = request.body as { resolution: string; reason: string };

      await db('marketplace_disputes')
        .where('id', disputeId)
        .update({
          status: 'resolved',
          resolution,
          resolved_by: request.user?.id,
          resolved_at: new Date(),
          updated_at: new Date()
        });

      reply.send({ success: true, message: 'Dispute resolved' });
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      throw error;
    }
  }

  async getFlaggedUsers(request: AuthRequest, reply: FastifyReply) {
    try {
      const flagged = await db('anti_bot_violations')
        .select('user_id', db.raw('COUNT(*) as violation_count'), db.raw('MAX(flagged_at) as last_flagged'))
        .groupBy('user_id')
        .orderBy('violation_count', 'desc')
        .limit(50);

      reply.send({ success: true, data: flagged });
    } catch (error) {
      logger.error('Error getting flagged users:', error);
      throw error;
    }
  }

  async banUser(request: AuthRequest, reply: FastifyReply) {
    try {
      const { userId, reason, duration } = request.body as { userId: string; reason: string; duration?: number };

      await db('marketplace_blacklist').insert({
        id: require('uuid').v4(),
        user_id: userId,
        reason,
        banned_by: request.user?.id,
        banned_at: new Date(),
        expires_at: duration ? new Date(Date.now() + duration * 86400000) : null,
        is_active: true
      });

      reply.send({ success: true, message: 'User banned' });
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }
}

export const adminController = new AdminController();
