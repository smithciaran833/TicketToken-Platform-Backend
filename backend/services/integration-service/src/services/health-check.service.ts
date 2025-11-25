/**
 * Health Check Service
 * 
 * Monitors connection health for all third-party providers
 */

import { mailchimpSyncService } from './providers/mailchimp-sync.service';
import { quickbooksSyncService } from './providers/quickbooks-sync.service';
import { squareSyncService } from './providers/square-sync.service';
import { stripeSyncService } from './providers/stripe-sync.service';

export interface ProviderHealthStatus {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  lastSuccessful?: Date;
  lastError?: {
    message: string;
    timestamp: Date;
  };
  responseTime?: number;
  consecutiveFailures: number;
}

export class HealthCheckService {
  private healthStatuses: Map<string, ProviderHealthStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 300000; // 5 minutes
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor() {
    this.initializeStatuses();
  }

  /**
   * Initialize health statuses for all providers
   */
  private initializeStatuses(): void {
    const providers = ['mailchimp', 'quickbooks', 'square', 'stripe'];

    for (const provider of providers) {
      this.healthStatuses.set(provider, {
        provider,
        status: 'healthy',
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Start periodic health checks
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    console.log('Starting provider health monitoring...');
    
    // Run initial check
    this.checkAllProviders();

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllProviders();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic health checks
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Stopped provider health monitoring');
    }
  }

  /**
   * Check all providers
   */
  async checkAllProviders(): Promise<void> {
    console.log('Running health checks for all providers...');

    const providers = Array.from(this.healthStatuses.keys());

    await Promise.all(
      providers.map((provider) =>
        this.checkProvider(provider, 'default-venue-health-check')
      )
    );
  }

  /**
   * Check specific provider health
   */
  async checkProvider(provider: string, venueId: string): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    const status = this.healthStatuses.get(provider);

    if (!status) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    try {
      let isHealthy = false;

      // Check provider connection
      switch (provider) {
        case 'mailchimp':
          isHealthy = await mailchimpSyncService.verifyConnection(venueId);
          break;

        case 'quickbooks':
          isHealthy = await quickbooksSyncService.verifyConnection(venueId);
          break;

        case 'square':
          isHealthy = await squareSyncService.verifyConnection(venueId);
          break;

        case 'stripe':
          isHealthy = await stripeSyncService.verifyConnection(venueId);
          break;

        default:
          throw new Error(`Health check not implemented for provider: ${provider}`);
      }

      const responseTime = Date.now() - startTime;

      // Update status based on health check result
      if (isHealthy) {
        status.status = 'healthy';
        status.lastSuccessful = new Date();
        status.consecutiveFailures = 0;
        status.responseTime = responseTime;
      } else {
        status.consecutiveFailures++;
        status.status =
          status.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES
            ? 'unhealthy'
            : 'degraded';
      }

      status.lastChecked = new Date();

      console.log(
        `Health check for ${provider}: ${status.status} (${responseTime}ms)`
      );
    } catch (error) {
      console.error(`Health check failed for ${provider}:`, error);

      status.consecutiveFailures++;
      status.status =
        status.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES
          ? 'unhealthy'
          : 'degraded';
      status.lastChecked = new Date();
      status.lastError = {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }

    this.healthStatuses.set(provider, status);
    return status;
  }

  /**
   * Get health status for specific provider
   */
  getProviderStatus(provider: string): ProviderHealthStatus | undefined {
    return this.healthStatuses.get(provider);
  }

  /**
   * Get health status for all providers
   */
  getAllStatuses(): ProviderHealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: ProviderHealthStatus[];
  } {
    const statuses = this.getAllStatuses();
    
    const unhealthyCount = statuses.filter((s) => s.status === 'unhealthy').length;
    const degradedCount = statuses.filter((s) => s.status === 'degraded').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      providers: statuses,
    };
  }

  /**
   * Reset health status for a provider
   */
  resetProviderStatus(provider: string): void {
    const status = this.healthStatuses.get(provider);
    
    if (status) {
      status.consecutiveFailures = 0;
      status.status = 'healthy';
      status.lastError = undefined;
      this.healthStatuses.set(provider, status);
    }
  }

  /**
   * Check if provider is healthy enough to use
   */
  isProviderAvailable(provider: string): boolean {
    const status = this.healthStatuses.get(provider);
    return status?.status !== 'unhealthy';
  }

  /**
   * Get health metrics for monitoring
   */
  getHealthMetrics(): {
    totalProviders: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    averageResponseTime: number;
  } {
    const statuses = this.getAllStatuses();
    
    const healthy = statuses.filter((s) => s.status === 'healthy').length;
    const degraded = statuses.filter((s) => s.status === 'degraded').length;
    const unhealthy = statuses.filter((s) => s.status === 'unhealthy').length;

    const responseTimes = statuses
      .map((s) => s.responseTime)
      .filter((rt): rt is number => rt !== undefined);

    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    return {
      totalProviders: statuses.length,
      healthy,
      degraded,
      unhealthy,
      averageResponseTime: Math.round(averageResponseTime),
    };
  }
}

// Export singleton instance
export const healthCheckService = new HealthCheckService();

// Start monitoring when module is loaded (optional - can be started manually)
// healthCheckService.startMonitoring();
