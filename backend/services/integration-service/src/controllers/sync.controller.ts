import { FastifyRequest, FastifyReply } from 'fastify';
import { integrationService } from '../services/integration.service';
import { db } from '../config/database';

export class SyncController {
  async triggerSync(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, syncType, options } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const result = await integrationService.syncNow(
        venueId,
        provider as any,
        { syncType, ...options }
      );

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      throw error;
    }
  }

  async stopSync(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      // Update sync queue to pause
      await db('sync_queue')
        .where({
          venue_id: venueId,
          integration_type: provider,
          status: 'pending'
        })
        .update({
          status: 'paused',
          updated_at: new Date()
        });

      return reply.send({
        success: true,
        message: 'Sync stopped successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  async getSyncStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.query as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const status = await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .first();

      const queueStatus = await db('sync_queue')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .select('status')
        .count('* as count')
        .groupBy('status');

      return reply.send({
        success: true,
        data: {
          integration: status,
          queue: queueStatus
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async getSyncHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, limit = 50, offset = 0 } = request.query as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const history = await db('sync_logs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .orderBy('started_at', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));

      return reply.send({
        success: true,
        data: history
      });
    } catch (error) {
      throw error;
    }
  }

  async retryFailed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, queueItemId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const query = db('sync_queue')
        .where({
          venue_id: venueId,
          integration_type: provider,
          status: 'failed'
        });

      if (queueItemId) {
        query.where('id', queueItemId);
      }

      await query.update({
        status: 'pending',
        attempts: 0,
        updated_at: new Date()
      });

      return reply.send({
        success: true,
        message: 'Failed items re-queued for retry'
      });
    } catch (error) {
      throw error;
    }
  }
}

export const syncController = new SyncController();
