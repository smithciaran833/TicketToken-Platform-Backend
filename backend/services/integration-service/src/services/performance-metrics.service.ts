/**
 * Performance Metrics Service
 * 
 * Tracks and reports performance metrics for API calls, sync operations,
 * and third-party integrations
 */

import { getRequestId } from '../middleware/request-id.middleware';
import { FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  requestId?: string;
  provider?: string;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface OperationTimer {
  startTime: number;
  operation: string;
  metadata?: Record<string, any>;
}

class PerformanceMetricsService {
  private metrics: PerformanceMetric[] = [];
  private maxMetricsStorage = 1000;
  private timers: Map<string, OperationTimer> = new Map();

  /**
   * Start timing an operation
   */
  startTimer(
    operation: string,
    timerId?: string,
    metadata?: Record<string, any>
  ): string {
    const id = timerId || `${operation}-${Date.now()}-${Math.random()}`;
    
    this.timers.set(id, {
      startTime: Date.now(),
      operation,
      metadata,
    });

    return id;
  }

  /**
   * Stop timing an operation and record metric
   */
  stopTimer(
    timerId: string,
    success: boolean = true,
    additionalMetadata?: Record<string, any>
  ): number | null {
    const timer = this.timers.get(timerId);
    
    if (!timer) {
      logger.warn(`Timer not found: ${timerId}`);
      return null;
    }

    const duration = Date.now() - timer.startTime;
    
    this.recordMetric({
      operation: timer.operation,
      duration,
      timestamp: Date.now(),
      success,
      metadata: {
        ...timer.metadata,
        ...additionalMetadata,
      },
    });

    this.timers.delete(timerId);
    
    return duration;
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only recent metrics to prevent memory bloat
    if (this.metrics.length > this.maxMetricsStorage) {
      this.metrics.shift();
    }

    // Log slow operations
    if (metric.duration > 5000) {
      logger.warn('Slow operation detected', {
        operation: metric.operation,
        duration: metric.duration,
        provider: metric.provider,
      });
    }
  }

  /**
   * Track API call performance
   */
  async trackApiCall<T>(
    operation: string,
    provider: string,
    fn: () => Promise<T>,
    request?: FastifyRequest
  ): Promise<T> {
    const timerId = this.startTimer(operation, undefined, {
      provider,
      requestId: request ? getRequestId(request) : undefined,
    });

    try {
      const result = await fn();
      
      this.stopTimer(timerId, true, { provider });
      
      return result;
    } catch (error) {
      this.stopTimer(timerId, false, {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  }

  /**
   * Get metrics for a specific operation
   */
  getMetricsByOperation(operation: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.operation === operation);
  }

  /**
   * Get metrics for a specific provider
   */
  getMetricsByProvider(provider: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.metadata?.provider === provider);
  }

  /**
   * Get average duration for an operation
   */
  getAverageDuration(operation: string): number {
    const operationMetrics = this.getMetricsByOperation(operation);
    
    if (operationMetrics.length === 0) {
      return 0;
    }

    const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
    return Math.round(total / operationMetrics.length);
  }

  /**
   * Get p95 duration for an operation
   */
  getP95Duration(operation: string): number {
    const operationMetrics = this.getMetricsByOperation(operation);
    
    if (operationMetrics.length === 0) {
      return 0;
    }

    const sorted = operationMetrics
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[p95Index] || 0;
  }

  /**
   * Get success rate for an operation
   */
  getSuccessRate(operation: string): number {
    const operationMetrics = this.getMetricsByOperation(operation);
    
    if (operationMetrics.length === 0) {
      return 0;
    }

    const successful = operationMetrics.filter(m => m.success).length;
    return (successful / operationMetrics.length) * 100;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalOperations: number;
    operations: {
      [operation: string]: {
        count: number;
        avgDuration: number;
        p95Duration: number;
        successRate: number;
      };
    };
    providers: {
      [provider: string]: {
        count: number;
        avgDuration: number;
        successRate: number;
      };
    };
  } {
    const operations: Record<string, any> = {};
    const providers: Record<string, any> = {};

    // Group by operation
    const uniqueOperations = [...new Set(this.metrics.map(m => m.operation))];
    
    for (const operation of uniqueOperations) {
      operations[operation] = {
        count: this.getMetricsByOperation(operation).length,
        avgDuration: this.getAverageDuration(operation),
        p95Duration: this.getP95Duration(operation),
        successRate: this.getSuccessRate(operation),
      };
    }

    // Group by provider
    const uniqueProviders = [
      ...new Set(
        this.metrics
          .map(m => m.metadata?.provider)
          .filter((p): p is string => !!p)
      ),
    ];

    for (const provider of uniqueProviders) {
      const providerMetrics = this.getMetricsByProvider(provider);
      
      const successful = providerMetrics.filter(m => m.success).length;
      const totalDuration = providerMetrics.reduce((sum, m) => sum + m.duration, 0);

      providers[provider] = {
        count: providerMetrics.length,
        avgDuration: Math.round(totalDuration / providerMetrics.length),
        successRate: (successful / providerMetrics.length) * 100,
      };
    }

    return {
      totalOperations: this.metrics.length,
      operations,
      providers,
    };
  }

  /**
   * Get recent slow operations
   */
  getSlowOperations(threshold: number = 3000, limit: number = 10): PerformanceMetric[] {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThan: number = 3600000): void {
    const cutoff = Date.now() - olderThan;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
    this.timers.clear();
  }
}

// Export singleton instance
export const performanceMetricsService = new PerformanceMetricsService();
