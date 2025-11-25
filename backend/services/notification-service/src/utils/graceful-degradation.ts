import { logger } from '../config/logger';
import { metricsService } from '../services/metrics.service';

/**
 * Degradation modes
 */
export enum DegradationMode {
  NORMAL = 'normal',
  PARTIAL = 'partial',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
}

/**
 * Service health status
 */
interface ServiceHealth {
  database: boolean;
  redis: boolean;
  email: boolean;
  sms: boolean;
}

/**
 * Graceful Degradation Manager
 * 
 * Manages service degradation based on dependency health
 * Provides fallback strategies when services fail
 */
class GracefulDegradationManager {
  private currentMode: DegradationMode = DegradationMode.NORMAL;
  private serviceHealth: ServiceHealth = {
    database: true,
    redis: true,
    email: true,
    sms: true,
  };

  /**
   * Update service health status
   */
  updateServiceHealth(service: keyof ServiceHealth, isHealthy: boolean): void {
    const previousHealth = this.serviceHealth[service];
    this.serviceHealth[service] = isHealthy;

    if (previousHealth !== isHealthy) {
      logger.info(`Service health changed: ${service}`, {
        from: previousHealth ? 'healthy' : 'unhealthy',
        to: isHealthy ? 'healthy' : 'unhealthy',
      });

      // Recalculate degradation mode
      this.updateDegradationMode();
    }
  }

  /**
   * Update degradation mode based on service health
   */
  private updateDegradationMode(): void {
    const previousMode = this.currentMode;
    
    // Critical: Database down
    if (!this.serviceHealth.database) {
      this.currentMode = DegradationMode.CRITICAL;
    }
    // Degraded: Redis or both notification providers down
    else if (!this.serviceHealth.redis || 
             (!this.serviceHealth.email && !this.serviceHealth.sms)) {
      this.currentMode = DegradationMode.DEGRADED;
    }
    // Partial: One notification provider down
    else if (!this.serviceHealth.email || !this.serviceHealth.sms) {
      this.currentMode = DegradationMode.PARTIAL;
    }
    // Normal: All services healthy
    else {
      this.currentMode = DegradationMode.NORMAL;
    }

    if (previousMode !== this.currentMode) {
      logger.warn('Degradation mode changed', {
        from: previousMode,
        to: this.currentMode,
        serviceHealth: this.serviceHealth,
      });

      // Update metrics
      metricsService.setGauge('degradation_mode', this.getModeValue(), {
        mode: this.currentMode,
      });

      // Track mode changes
      metricsService.incrementCounter('degradation_mode_changes_total', {
        from: previousMode,
        to: this.currentMode,
      });
    }
  }

  /**
   * Get numeric value for degradation mode (for metrics)
   */
  private getModeValue(): number {
    switch (this.currentMode) {
      case DegradationMode.NORMAL:
        return 0;
      case DegradationMode.PARTIAL:
        return 1;
      case DegradationMode.DEGRADED:
        return 2;
      case DegradationMode.CRITICAL:
        return 3;
      default:
        return -1;
    }
  }

  /**
   * Get current degradation mode
   */
  getCurrentMode(): DegradationMode {
    return this.currentMode;
  }

  /**
   * Get service health status
   */
  getServiceHealth(): ServiceHealth {
    return { ...this.serviceHealth };
  }

  /**
   * Check if service can handle requests
   */
  canHandleRequests(): boolean {
    // Can handle requests unless in critical mode
    return this.currentMode !== DegradationMode.CRITICAL;
  }

  /**
   * Check if specific feature is available
   */
  isFeatureAvailable(feature: 'email' | 'sms' | 'database' | 'redis'): boolean {
    return this.serviceHealth[feature];
  }

  /**
   * Get user-friendly degradation message
   */
  getDegradationMessage(): string {
    switch (this.currentMode) {
      case DegradationMode.NORMAL:
        return 'All systems operational';
      case DegradationMode.PARTIAL:
        return 'Some features may be unavailable. Service running in partial mode.';
      case DegradationMode.DEGRADED:
        return 'Service experiencing issues. Some features unavailable.';
      case DegradationMode.CRITICAL:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return 'Service status unknown';
    }
  }

  /**
   * Get recommended action for current mode
   */
  getRecommendedAction(): string {
    switch (this.currentMode) {
      case DegradationMode.NORMAL:
        return 'none';
      case DegradationMode.PARTIAL:
        return 'Use alternative notification channel if available';
      case DegradationMode.DEGRADED:
        return 'Critical notifications only. Queue non-critical requests.';
      case DegradationMode.CRITICAL:
        return 'Queue all requests for later processing';
      default:
        return 'unknown';
    }
  }

  /**
   * Should queue request instead of processing immediately?
   */
  shouldQueueRequest(priority: 'high' | 'medium' | 'low'): boolean {
    switch (this.currentMode) {
      case DegradationMode.NORMAL:
      case DegradationMode.PARTIAL:
        return false;
      case DegradationMode.DEGRADED:
        // Queue low-priority requests
        return priority === 'low';
      case DegradationMode.CRITICAL:
        // Queue everything except high priority
        return priority !== 'high';
      default:
        return true;
    }
  }

  /**
   * Get fallback strategy
   */
  getFallbackStrategy(requestedChannel: 'email' | 'sms'): {
    useChannel: 'email' | 'sms' | null;
    shouldQueue: boolean;
    reason: string;
  } {
    // Check if requested channel is available
    if (this.serviceHealth[requestedChannel]) {
      return {
        useChannel: requestedChannel,
        shouldQueue: false,
        reason: 'primary_channel_available',
      };
    }

    // Try fallback channel
    const fallbackChannel = requestedChannel === 'email' ? 'sms' : 'email';
    
    if (this.serviceHealth[fallbackChannel]) {
      logger.info('Using fallback channel', {
        requested: requestedChannel,
        fallback: fallbackChannel,
      });

      metricsService.incrementCounter('fallback_channel_used_total', {
        from: requestedChannel,
        to: fallbackChannel,
      });

      return {
        useChannel: fallbackChannel,
        shouldQueue: false,
        reason: 'fallback_channel_available',
      };
    }

    // Both channels down, queue the request
    logger.warn('All notification channels unavailable, queueing request', {
      requestedChannel,
      mode: this.currentMode,
    });

    metricsService.incrementCounter('notifications_queued_due_to_degradation_total', {
      channel: requestedChannel,
    });

    return {
      useChannel: null,
      shouldQueue: true,
      reason: 'all_channels_unavailable',
    };
  }

  /**
   * Get comprehensive status report
   */
  getStatusReport(): {
    mode: DegradationMode;
    message: string;
    recommendedAction: string;
    serviceHealth: ServiceHealth;
    canHandleRequests: boolean;
  } {
    return {
      mode: this.currentMode,
      message: this.getDegradationMessage(),
      recommendedAction: this.getRecommendedAction(),
      serviceHealth: this.getServiceHealth(),
      canHandleRequests: this.canHandleRequests(),
    };
  }

  /**
   * Reset to normal mode (for testing)
   */
  reset(): void {
    this.currentMode = DegradationMode.NORMAL;
    this.serviceHealth = {
      database: true,
      redis: true,
      email: true,
      sms: true,
    };
    logger.info('Degradation manager reset to normal mode');
  }
}

export const degradationManager = new GracefulDegradationManager();

/**
 * Error messages for different degradation modes
 */
export const DEGRADATION_ERROR_MESSAGES = {
  [DegradationMode.NORMAL]: null,
  [DegradationMode.PARTIAL]: 'Some notification channels are temporarily unavailable. Your request has been processed using an alternative method.',
  [DegradationMode.DEGRADED]: 'The notification service is experiencing issues. Your request has been queued and will be processed when service is restored.',
  [DegradationMode.CRITICAL]: 'The notification service is temporarily unavailable. Please try again later.',
};

/**
 * HTTP status codes for degradation modes
 */
export const DEGRADATION_STATUS_CODES = {
  [DegradationMode.NORMAL]: 200,
  [DegradationMode.PARTIAL]: 200, // Still processing requests
  [DegradationMode.DEGRADED]: 202, // Accepted for processing later
  [DegradationMode.CRITICAL]: 503, // Service unavailable
};
