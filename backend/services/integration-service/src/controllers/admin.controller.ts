// serviceCache is not used - removed
import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../services/monitoring.service';
import { recoveryService } from '../services/recovery.service';
import { db } from '../config/database';
// logger is not used - removed

export class AdminController {
  async getAllVenueIntegrations(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, healthStatus } = req.query;

      let query = db('integration_configs');

      if (status) {
        query = query.where('status', status);
      }

      if (healthStatus) {
        query = query.where('health_status', healthStatus);
      }

      const integrations = await query;

      res.json({
        success: true,
        data: integrations
      });
    } catch (error) {
      next(error);
    }
  }

  async getHealthSummary(_req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await monitoringService.getHealthSummary();

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async getCostAnalysis(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;

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

      res.json({
        success: true,
        data: {
          costs,
          total: costs.reduce((sum, c) => sum + parseFloat(c.total_cost || 0), 0)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async forceSync(req: Request, res: Response, next: NextFunction) {
    try {
      const { venueId, integrationType } = req.body;

      if (!venueId || !integrationType) {
        return res.status(400).json({
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

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
    return; // Added missing return
  }

  async clearQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const { venueId, integrationType, status } = req.body;

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

      res.json({
        success: true,
        message: `${deleted} queue items cleared`
      });
    } catch (error) {
      next(error);
    }
  }

  async processDeadLetter(_req: Request, res: Response, next: NextFunction) {
    try {
      await recoveryService.processDeadLetterQueue();

      res.json({
        success: true,
        message: 'Dead letter queue processing initiated'
      });
    } catch (error) {
      next(error);
    }
  }

  async recoverStale(_req: Request, res: Response, next: NextFunction) {
    try {
      await recoveryService.recoverStaleOperations();

      res.json({
        success: true,
        message: 'Stale operations recovery initiated'
      });
    } catch (error) {
      next(error);
    }
  }

  async getQueueMetrics(_req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await db('sync_queue')
        .select('priority', 'status')
        .count('* as count')
        .groupBy('priority', 'status');

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
