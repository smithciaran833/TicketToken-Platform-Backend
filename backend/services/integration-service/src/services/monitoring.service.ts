import { logger } from '../utils/logger';
import { db } from '../config/database';
import { redisClient } from '../config/redis';

// Define the type for our metrics query result
interface MetricsResult {
  total: string | number;
  connected: string | number;
  healthy: string | number;
  degraded: string | number;
  unhealthy: string | number;
}

export class MonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  async startHealthChecks() {
    logger.info('Starting health monitoring...');
    
    // Check health every minute
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllIntegrations();
    }, 60000);

    // Calculate metrics every 5 minutes
    this.metricsInterval = setInterval(async () => {
      await this.calculateMetrics();
    }, 300000);

    // Run initial checks
    await this.checkAllIntegrations();
    await this.calculateMetrics();
  }

  private async checkAllIntegrations() {
    try {
      const integrations = await db('integration_configs')
        .where('status', 'connected');

      for (const integration of integrations) {
        await this.checkIntegrationHealth(integration);
      }
    } catch (error) {
      logger.error('Health check failed', error);
    }
  }

  private async checkIntegrationHealth(integration: any) {
    try {
      const startTime = Date.now();
      let isHealthy = true;
      let errorMessage = null;

      // Try to get credentials and test connection
      try {
        const provider = this.getProvider(integration.integration_type);
        const credentials = await this.getCredentials(
          integration.venue_id,
          integration.integration_type
        );
        
        if (provider && credentials) {
          await provider.initialize(credentials);
          isHealthy = await provider.testConnection();
        }
      } catch (error: any) {
        isHealthy = false;
        errorMessage = error.message;
      }

      const responseTime = Date.now() - startTime;

      // Calculate 24-hour metrics
      const metrics = await this.calculate24HourMetrics(
        integration.venue_id,
        integration.integration_type
      );

      // Update or insert health record - use upsert pattern
      const existingHealth = await db('integration_health')
        .where({ venue_id: integration.venue_id, integration_type: integration.integration_type })
        .first();

      const queueDepth = await this.getQueueDepth(
        integration.venue_id,
        integration.integration_type
      );

      const healthData = {
        success_rate: metrics.successRate,
        average_sync_time_ms: metrics.avgSyncTime,
        last_success_at: isHealthy ? new Date() : undefined,
        last_failure_at: !isHealthy ? new Date() : undefined,
        sync_count_24h: metrics.syncCount,
        success_count_24h: metrics.successCount,
        failure_count_24h: metrics.failureCount,
        api_calls_24h: metrics.apiCalls,
        queue_depth: queueDepth,
        calculated_at: new Date()
      };

      if (existingHealth) {
        await db('integration_health')
          .where({ venue_id: integration.venue_id, integration_type: integration.integration_type })
          .update({ ...healthData, updated_at: new Date() });
      } else {
        await db('integration_health')
          .insert({
            venue_id: integration.venue_id,
            integration_type: integration.integration_type,
            ...healthData
          });
      }

      // Update integration status if health changed
      const newHealthStatus = this.determineHealthStatus(
        isHealthy,
        metrics.successRate,
        responseTime
      );

      if (integration.health_status !== newHealthStatus) {
        await db('integration_configs')
          .where('id', integration.id)
          .update({
            health_status: newHealthStatus,
            health_checked_at: new Date(),
            last_error: errorMessage,
            updated_at: new Date()
          });

        logger.info('Integration health status changed', {
          venueId: integration.venue_id,
          integration: integration.integration_type,
          oldStatus: integration.health_status,
          newStatus: newHealthStatus
        });
      }
    } catch (error) {
      logger.error('Failed to check integration health', {
        integrationId: integration.id,
        error
      });
    }
  }

  private async calculate24HourMetrics(venueId: string, integrationType: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await db('sync_logs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('started_at', '>=', twentyFourHoursAgo);

    const syncCount = logs.length;
    const successCount = logs.filter((l: any) => l.status === 'completed').length;
    const failureCount = logs.filter((l: any) => l.status === 'failed').length;
    const successRate = syncCount > 0 ? (successCount / syncCount) * 100 : 100;
    
    const avgSyncTime = logs.length > 0
      ? logs.reduce((sum: number, log: any) => sum + (log.duration_ms || 0), 0) / logs.length
      : 0;

    const apiCalls = logs.reduce((sum: number, log: any) => sum + (log.api_calls_made || 0), 0);

    return {
      syncCount,
      successCount,
      failureCount,
      successRate,
      avgSyncTime,
      apiCalls
    };
  }

  private async getQueueDepth(venueId: string, integrationType: string): Promise<number> {
    const count = await db('sync_queue')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('status', 'pending')
      .count('id as count')
      .first();

    return parseInt(count?.count as string || '0');
  }

  private determineHealthStatus(
    isConnected: boolean,
    successRate: number,
    responseTime: number
  ): string {
    if (!isConnected) {
      return 'unhealthy';
    }
    
    if (successRate < 50 || responseTime > 10000) {
      return 'unhealthy';
    }
    
    if (successRate < 90 || responseTime > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  private async calculateMetrics() {
    try {
      // Properly typed query result
      const result = await db('integration_configs')
        .select(
          db.raw('COUNT(id) as total'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as connected', ['connected']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as healthy', ['healthy']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as degraded', ['degraded']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as unhealthy', ['unhealthy'])
        )
        .first() as unknown as MetricsResult;

      // Calculate queue metrics
      const queueMetrics = await db('sync_queue')
        .select('status')
        .count('id as count')
        .groupBy('status');

      // Store in Redis for quick access
      if (redisClient) {
        await redisClient.setex(
          'integration:metrics:platform',
          300, // 5 minutes
          JSON.stringify({
            integrations: result,
            queues: queueMetrics,
            timestamp: new Date()
          })
        );
      }

      logger.info('Platform metrics calculated', {
        total: result?.total || 0,
        connected: result?.connected || 0,
        healthy: result?.healthy || 0
      });
    } catch (error) {
      logger.error('Failed to calculate metrics', error);
    }
  }

  private getProvider(integrationType: string) {
    const providers: Record<string, any> = {
      square: require('../providers/square/square.provider').SquareProvider,
      stripe: require('../providers/stripe/stripe.provider').StripeProvider,
      mailchimp: require('../providers/mailchimp/mailchimp.provider').MailchimpProvider,
      quickbooks: require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider
    };

    const ProviderClass = providers[integrationType];
    return ProviderClass ? new ProviderClass() : null;
  }

  private async getCredentials(venueId: string, integrationType: string) {
    const tokenVault = require('./token-vault.service').tokenVault;
    
    // Try OAuth token first
    const token = await tokenVault.getToken(venueId, integrationType);
    if (token) {
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };
    }

    // Try API key
    const apiKey = await tokenVault.getApiKey(venueId, integrationType);
    if (apiKey) {
      return {
        apiKey: apiKey.api_key,
        apiSecret: apiKey.api_secret
      };
    }

    return null;
  }

  async stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    logger.info('Health monitoring stopped');
  }

  async getHealthSummary(): Promise<any> {
    try {
      // Get cached metrics from Redis
      if (redisClient) {
        const cached = await redisClient.get('integration:metrics:platform');
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Calculate fresh if not cached
      await this.calculateMetrics();
      if (redisClient) {
        const fresh = await redisClient.get('integration:metrics:platform');
        return fresh ? JSON.parse(fresh) : null;
      }
      return null;
    } catch (error) {
      logger.error('Failed to get health summary', error);
      return null;
    }
  }
}

export const monitoringService = new MonitoringService();
