import { FastifyRequest, FastifyReply } from 'fastify';
import { monitoringService } from '../services/monitoring.service';
import { recoveryService } from '../services/recovery.service';
import { db } from '../config/database';

export class AdminController {
  async getAllVenueIntegrations(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { status, healthStatus } = request.query as any;

      let query = db('integration_configs');

      if (status) {
        query = query.where('status', status);
      }

      if (healthStatus) {
        query = query.where('health_status', healthStatus);
      }

      const integrations = await query;

      return reply.send({
        success: true,
        data: integrations
      });
    } catch (error) {
      throw error;
    }
  }

  async getHealthSummary(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const summary = await monitoringService.getHealthSummary();

      return reply.send({
        success: true,
        data: summary
      });
    } catch (error) {
      throw error;
    }
  }

  async getCostAnalysis(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { startDate, endDate } = request.query as any;

      let query = db('integration_costs')
        .select(
          'venue_id',
          'integration_type',
          db.raw('SUM(api_calls) as total_api_calls'),
          db.raw('SUM(data_synced_mb) as total_data_mb'),
          db.raw('SUM(total_cost) as total_cost')
        )
        .groupBy('venue_id', 'integration_type');

      if (startDate) {
        query = query.where('period_start', '>=', startDate);
      }

      if (endDate) {
        query = query.where('period_end', '<=', endDate);
      }

      const costs = await query;

      return reply.send({
        success: true,
        data: {
          costs,
          total: costs.reduce((sum: number, c: { total_cost?: string | number }) => sum + parseFloat(String(c.total_cost || 0)), 0)
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async forceSync(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId, integrationType } = request.body as any;

      if (!venueId || !integrationType) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID and integration type are required'
        });
      }

      const integrationService = require('../services/integration.service').integrationService;
      const result = await integrationService.syncNow(
        venueId,
        integrationType,
        { force: true }
      );

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      throw error;
    }
  }

  async clearQueue(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId, integrationType, status } = request.body as any;

      let query = db('sync_queue');

      if (venueId) {
        query = query.where('venue_id', venueId);
      }

      if (integrationType) {
        query = query.where('integration_type', integrationType);
      }

      if (status) {
        query = query.where('status', status);
      }

      const deleted = await query.delete();

      return reply.send({
        success: true,
        message: `${deleted} queue items cleared`
      });
    } catch (error) {
      throw error;
    }
  }

  async processDeadLetter(_request: FastifyRequest, reply: FastifyReply) {
    try {
      await recoveryService.processDeadLetterQueue();

      return reply.send({
        success: true,
        message: 'Dead letter queue processing initiated'
      });
    } catch (error) {
      throw error;
    }
  }

  async recoverStale(_request: FastifyRequest, reply: FastifyReply) {
    try {
      await recoveryService.recoverStaleOperations();

      return reply.send({
        success: true,
        message: 'Stale operations recovery initiated'
      });
    } catch (error) {
      throw error;
    }
  }

  async getQueueMetrics(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = await db('sync_queue')
        .select('priority', 'status')
        .count('* as count')
        .groupBy('priority', 'status');

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      throw error;
    }
  }
}

export const adminController = new AdminController();
