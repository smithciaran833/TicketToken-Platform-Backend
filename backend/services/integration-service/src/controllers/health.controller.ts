// serviceCache is not used - removed
import { Request, Response, NextFunction } from 'express';
// monitoringService is not used - removed
import { db } from '../config/database';
// logger is not used - removed

export class HealthController {
  async getIntegrationHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider } = req.params;
      const { venueId } = req.query;

      if (!venueId) {
        return res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const health = await db('integration_health')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .first();

      res.json({
        success: true,
        data: health || { status: 'unknown' }
      });
    } catch (error) {
      next(error);
    }
    return; // Added missing return
  }

  async getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider } = req.params;
      const { venueId, period = '24h' } = req.query;

      if (!venueId) {
        return res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const startDate = new Date();
      if (period === '24h') {
        startDate.setHours(startDate.getHours() - 24);
      } else if (period === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      }

      const metrics = await db('sync_logs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .where('started_at', '>=', startDate)
        .select(
          db.raw('COUNT(*) as total_syncs'),
          db.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as successful', ['completed']),
          db.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as failed', ['failed']),
          db.raw('AVG(duration_ms) as avg_duration'),
          db.raw('SUM(success_count) as total_success_count'),
          db.raw('SUM(error_count) as total_error_count')
        )
        .first();

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      next(error);
    }
    return; // Added missing return
  }

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;

      if (!venueId) {
        return res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
      }

      // Get provider and test
      const providers: any = {
        square: require('../providers/square/square.provider').SquareProvider,
        stripe: require('../providers/stripe/stripe.provider').StripeProvider,
        mailchimp: require('../providers/mailchimp/mailchimp.provider').MailchimpProvider,
        quickbooks: require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider
      };

      const ProviderClass = providers[provider];
      if (!ProviderClass) {
        return res.status(400).json({
          success: false,
          error: 'Invalid provider'
        });
      }

      const tokenVault = require('../services/token-vault.service').tokenVault;
      const credentials = await tokenVault.getToken(venueId, provider) ||
                        await tokenVault.getApiKey(venueId, provider);

      if (!credentials) {
        return res.status(404).json({
          success: false,
          error: 'No credentials found'
        });
      }

      const providerInstance = new ProviderClass();
      await providerInstance.initialize(credentials);
      const isConnected = await providerInstance.testConnection();

      res.json({
        success: true,
        data: {
          connected: isConnected,
          timestamp: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
    return; // Added missing return
  }
}

export const healthController = new HealthController();
