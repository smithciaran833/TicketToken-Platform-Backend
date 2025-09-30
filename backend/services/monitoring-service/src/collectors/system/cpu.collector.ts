import os from 'os';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class SystemMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'SystemMetricsCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, config.intervals.metricCollection);
    
    // Collect immediately
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
      const cpus = os.cpus();
      const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const totalTick = cpus.reduce((acc, cpu) => {
        return acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      }, 0);
      
      const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
      
      await metricsService.pushMetrics({
        name: 'system_cpu_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: cpuUsage,
        labels: {
          hostname: os.hostname(),
        },
      });

      // Alert if CPU usage is high
      if (cpuUsage > config.thresholds.cpu) {
        logger.warn(`High CPU usage detected: ${cpuUsage}%`);
      }
    } catch (error) {
      logger.error('Error collecting CPU metrics:', error);
    }
  }
}
