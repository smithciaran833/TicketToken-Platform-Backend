/**
 * Performance Monitoring Utility
 * Tracks and reports search service performance metrics
 */

import { logger } from './logger';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface PerformanceStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private slowQueryThreshold: number = 1000; // ms
  private metricsRetentionLimit: number = 10000; // Keep last 10k metrics per operation

  /**
   * Track operation performance
   */
  async trackOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.recordMetric({
        operation,
        duration,
        timestamp: new Date(),
        metadata
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.recordMetric({
        operation: `${operation}_error`,
        duration,
        timestamp: new Date(),
        metadata: { ...metadata, error: (error as Error).message }
      });
      
      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    const { operation, duration, metadata } = metric;
    
    // Store metric
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);
    
    // Limit retention
    if (operationMetrics.length > this.metricsRetentionLimit) {
      operationMetrics.shift();
    }
    
    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      logger.warn({
        operation,
        duration,
        metadata,
        threshold: this.slowQueryThreshold
      }, 'Slow operation detected');
    }
    
    // Log to console for monitoring
    if (process.env.NODE_ENV !== 'production' && duration > 500) {
      console.log(`⚠️  Slow operation: ${operation} took ${duration}ms`);
    }
  }

  /**
   * Get statistics for an operation
   */
  getStats(operation: string): PerformanceStats | null {
    const metrics = this.metrics.get(operation);
    
    if (!metrics || metrics.length === 0) {
      return null;
    }
    
    const sorted = [...metrics].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / count,
      p50: this.percentile(sorted, 0.50),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      count
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all statistics
   */
  getAllStats(): Record<string, PerformanceStats> {
    const stats: Record<string, PerformanceStats> = {};
    
    for (const [operation, _] of this.metrics) {
      const operationStats = this.getStats(operation);
      if (operationStats) {
        stats[operation] = operationStats;
      }
    }
    
    return stats;
  }

  /**
   * Reset metrics for an operation
   */
  resetMetrics(operation?: string): void {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(ms: number): void {
    this.slowQueryThreshold = ms;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Map<string, number[]> {
    return this.metrics;
  }

  /**
   * Check if operation is consistently slow
   */
  isOperationSlow(operation: string): boolean {
    const stats = this.getStats(operation);
    
    if (!stats) {
      return false;
    }
    
    // Consider slow if p95 exceeds threshold
    return stats.p95 > this.slowQueryThreshold;
  }

  /**
   * Get slow operations report
   */
  getSlowOperationsReport(): Array<{ operation: string; stats: PerformanceStats }> {
    const slowOps: Array<{ operation: string; stats: PerformanceStats }> = [];
    
    for (const [operation, _] of this.metrics) {
      if (this.isOperationSlow(operation)) {
        const stats = this.getStats(operation);
        if (stats) {
          slowOps.push({ operation, stats });
        }
      }
    }
    
    return slowOps.sort((a, b) => b.stats.p95 - a.stats.p95);
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const allStats = this.getAllStats();
    
    logger.info({
      stats: allStats,
      slowOperations: this.getSlowOperationsReport().length
    }, 'Performance monitoring summary');
    
    // Console output for visibility
    console.log('\n📊 Performance Monitoring Summary:');
    console.log('================================');
    
    for (const [operation, stats] of Object.entries(allStats)) {
      const isSlow = stats.p95 > this.slowQueryThreshold;
      const icon = isSlow ? '🔴' : '✅';
      
      console.log(`\n${icon} ${operation}:`);
      console.log(`   Count: ${stats.count}`);
      console.log(`   Avg: ${stats.avg.toFixed(2)}ms`);
      console.log(`   P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`   P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`   P99: ${stats.p99.toFixed(2)}ms`);
      console.log(`   Min/Max: ${stats.min.toFixed(2)}ms / ${stats.max.toFixed(2)}ms`);
    }
    
    const slowOps = this.getSlowOperationsReport();
    if (slowOps.length > 0) {
      console.log('\n⚠️  Slow Operations Detected:');
      slowOps.forEach(({ operation, stats }) => {
        console.log(`   - ${operation}: P95=${stats.p95.toFixed(2)}ms (threshold: ${this.slowQueryThreshold}ms)`);
      });
    }
    
    console.log('\n================================\n');
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Helper function for tracking
export async function trackPerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return performanceMonitor.trackOperation(operation, fn, metadata);
}

// Export types
export type { PerformanceMetric, PerformanceStats };
