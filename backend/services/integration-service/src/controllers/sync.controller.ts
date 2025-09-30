import { Request, Response, NextFunction } from 'express';
import { integrationService } from '../services/integration.service';
import { db } from '../config/database';

export class SyncController {
  async triggerSync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, syncType, options } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      const result = await integrationService.syncNow(
        venueId,
        provider as any,
        { syncType, ...options }
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async stopSync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
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
      
      res.json({
        success: true,
        message: 'Sync stopped successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async getSyncStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.query;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
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
      
      res.json({
        success: true,
        data: {
          integration: status,
          queue: queueStatus
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getSyncHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, limit = 50, offset = 0 } = req.query;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      const history = await db('sync_logs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .orderBy('started_at', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }

  async retryFailed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, queueItemId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
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
      
      res.json({
        success: true,
        message: 'Failed items re-queued for retry'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const syncController = new SyncController();
