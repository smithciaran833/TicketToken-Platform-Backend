import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../config/database';

// FIX #14: Default pagination constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_BAN_DURATION_DAYS = 1;
const MAX_BAN_DURATION_DAYS = 3650; // 10 years

interface PaginationQuery {
  limit?: string;
  offset?: string;
}

interface BanUserBody {
  userId: string;
  reason: string;
  duration?: number; // days
}

export class AdminController {
  /**
   * Helper to parse and validate pagination parameters
   * FIX #14: Added pagination support
   */
  private parsePagination(query: PaginationQuery): { limit: number; offset: number } {
    const limit = Math.min(Math.max(parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);
    return { limit, offset };
  }

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

  /**
   * FIX #14: Added pagination support for disputes
   */
  async getDisputes(request: AuthRequest, reply: FastifyReply) {
    try {
      const { limit, offset } = this.parsePagination(request.query as PaginationQuery);

      // Get total count
      const [{ count }] = await db('marketplace_disputes')
        .whereIn('status', ['open', 'investigating'])
        .count('id as count');

      const disputes = await db('marketplace_disputes')
        .whereIn('status', ['open', 'investigating'])
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      reply.send({
        success: true,
        data: disputes,
        pagination: {
          total: parseInt(String(count), 10),
          limit,
          offset,
          hasMore: offset + limit < parseInt(String(count), 10)
        }
      });
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

  /**
   * FIX #14: Added pagination support for flagged users
   */
  async getFlaggedUsers(request: AuthRequest, reply: FastifyReply) {
    try {
      const { limit, offset } = this.parsePagination(request.query as PaginationQuery);

      // Get total count of unique flagged users
      const [{ count }] = await db('anti_bot_violations')
        .countDistinct('user_id as count');

      const flagged = await db('anti_bot_violations')
        .select('user_id', db.raw('COUNT(*) as violation_count'), db.raw('MAX(flagged_at) as last_flagged'))
        .groupBy('user_id')
        .orderBy('violation_count', 'desc')
        .limit(limit)
        .offset(offset);

      reply.send({
        success: true,
        data: flagged,
        pagination: {
          total: parseInt(String(count), 10),
          limit,
          offset,
          hasMore: offset + limit < parseInt(String(count), 10)
        }
      });
    } catch (error) {
      logger.error('Error getting flagged users:', error);
      throw error;
    }
  }

  /**
   * FIX #15: Added ban duration validation
   */
  async banUser(request: AuthRequest, reply: FastifyReply) {
    try {
      const { userId, reason, duration } = request.body as BanUserBody;

      // Validate required fields
      if (!userId || typeof userId !== 'string') {
        return reply.status(400).send({ error: 'userId is required and must be a string' });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return reply.status(400).send({ error: 'reason is required and must be a non-empty string' });
      }

      // FIX #15: Validate duration if provided
      if (duration !== undefined && duration !== null) {
        if (typeof duration !== 'number' || !Number.isFinite(duration)) {
          return reply.status(400).send({ error: 'duration must be a valid number' });
        }

        if (duration < MIN_BAN_DURATION_DAYS) {
          return reply.status(400).send({ 
            error: `duration must be at least ${MIN_BAN_DURATION_DAYS} day(s)` 
          });
        }

        if (duration > MAX_BAN_DURATION_DAYS) {
          return reply.status(400).send({ 
            error: `duration cannot exceed ${MAX_BAN_DURATION_DAYS} days (10 years). Use no duration for permanent ban.` 
          });
        }
      }

      // Calculate expiry date
      const expiresAt = duration 
        ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) 
        : null; // null = permanent ban

      await db('marketplace_blacklist').insert({
        id: require('uuid').v4(),
        user_id: userId,
        reason: reason.trim(),
        banned_by: request.user?.id,
        banned_at: new Date(),
        expires_at: expiresAt,
        is_active: true
      });

      logger.info('User banned', { 
        userId, 
        bannedBy: request.user?.id, 
        duration: duration || 'permanent',
        expiresAt 
      });

      reply.send({ 
        success: true, 
        message: 'User banned',
        details: {
          userId,
          duration: duration ? `${duration} days` : 'permanent',
          expiresAt
        }
      });
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }
}

export const adminController = new AdminController();
