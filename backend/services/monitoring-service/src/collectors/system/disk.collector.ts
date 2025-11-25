import * as os from 'os';
import { execSync } from 'child_process';
import { logger } from '../../logger';
import { metricsService } from '../../services/metrics.service';

export class DiskCollector {
  private name = 'DiskCollector';
  private interval: NodeJS.Timeout | null = null;
  private collectInterval: number;

  constructor(collectInterval: number = 30000) {
    this.collectInterval = collectInterval;
  }
  
  getName(): string {
    return this.name;
  }
  
  async start(): Promise<void> {
    logger.info(`Starting ${this.name}...`);
    
    // Collect immediately
    await this.collect();
    
    // Then collect at regular intervals
    this.interval = setInterval(async () => {
      try {
        await this.collect();
      } catch (error) {
        logger.error(`${this.name} collection error:`, error);
      }
    }, this.collectInterval);
    
    logger.info(`${this.name} started, collecting every ${this.collectInterval}ms`);
  }
  
  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info(`${this.name} stopped`);
  }

  private async collect(): Promise<void> {
    try {
      const platform = os.platform();
      
      if (platform === 'linux' || platform === 'darwin') {
        await this.collectUnixDiskMetrics();
      } else if (platform === 'win32') {
        await this.collectWindowsDiskMetrics();
      } else {
        logger.warn(`Disk metrics not supported on platform: ${platform}`);
      }
    } catch (error: any) {
      logger.error('Failed to collect disk metrics:', error);
    }
  }

  private async collectUnixDiskMetrics(): Promise<void> {
    try {
      // Use df command to get disk usage
      const dfOutput = execSync('df -k / | tail -1').toString().trim();
      const parts = dfOutput.split(/\s+/);
      
      // df output: Filesystem 1K-blocks Used Available Use% Mounted
      const totalKB = parseInt(parts[1], 10);
      const usedKB = parseInt(parts[2], 10);
      const availableKB = parseInt(parts[3], 10);
      const usagePercent = parseFloat(parts[4].replace('%', ''));

      // Convert to GB
      const totalGB = totalKB / (1024 * 1024);
      const usedGB = usedKB / (1024 * 1024);
      const availableGB = availableKB / (1024 * 1024);

      // Push metrics
      const hostname = os.hostname();
      
      await metricsService.pushMetrics({
        name: 'system_disk_total_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: totalGB,
        labels: { hostname, mount: '/' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_used_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: usedGB,
        labels: { hostname, mount: '/' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_available_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: availableGB,
        labels: { hostname, mount: '/' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: usagePercent,
        labels: { hostname, mount: '/' }
      });

      // Warn if disk usage is high
      if (usagePercent > 85) {
        logger.warn(`High disk usage detected: ${usagePercent}% on ${hostname}`);
      }

    } catch (error: any) {
      logger.error('Failed to collect Unix disk metrics:', error);
      throw error;
    }
  }

  private async collectWindowsDiskMetrics(): Promise<void> {
    try {
      // Use wmic command on Windows
      const wmicOutput = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv')
        .toString()
        .trim();
      
      const lines = wmicOutput.split('\n').filter(line => line.trim() && !line.includes('Node'));
      if (lines.length === 0) {
        throw new Error('No disk information found');
      }

      const parts = lines[0].split(',');
      const freeBytes = parseInt(parts[1], 10);
      const totalBytes = parseInt(parts[2], 10);
      
      const usedBytes = totalBytes - freeBytes;
      const usagePercent = (usedBytes / totalBytes) * 100;

      // Convert to GB
      const totalGB = totalBytes / (1024 * 1024 * 1024);
      const usedGB = usedBytes / (1024 * 1024 * 1024);
      const availableGB = freeBytes / (1024 * 1024 * 1024);

      const hostname = os.hostname();

      await metricsService.pushMetrics({
        name: 'system_disk_total_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: totalGB,
        labels: { hostname, mount: 'C:' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_used_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: usedGB,
        labels: { hostname, mount: 'C:' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_available_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: availableGB,
        labels: { hostname, mount: 'C:' }
      });

      await metricsService.pushMetrics({
        name: 'system_disk_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: usagePercent,
        labels: { hostname, mount: 'C:' }
      });

      if (usagePercent > 85) {
        logger.warn(`High disk usage detected: ${usagePercent}% on ${hostname}`);
      }

    } catch (error: any) {
      logger.error('Failed to collect Windows disk metrics:', error);
      throw error;
    }
  }
}
