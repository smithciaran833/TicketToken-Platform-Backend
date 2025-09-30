import os from 'os';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class MemoryCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'MemoryCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, config.intervals.metricCollection);
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memUsagePercent = (usedMem / totalMem) * 100;

      await metricsService.pushMetrics({
        name: 'system_memory_usage_bytes',
        type: 'gauge',
        service: 'monitoring-service',
        value: usedMem,
        labels: {
          hostname: os.hostname(),
        },
      });

      await metricsService.pushMetrics({
        name: 'system_memory_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: memUsagePercent,
        labels: {
          hostname: os.hostname(),
        },
      });

      if (memUsagePercent > config.thresholds.memory) {
        logger.warn(`High memory usage detected: ${memUsagePercent.toFixed(2)}%`);
      }
    } catch (error) {
      logger.error('Error collecting memory metrics:', error);
    }
  }
}
