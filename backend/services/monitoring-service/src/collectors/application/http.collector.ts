import axios from 'axios';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class HTTPMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'HTTPMetricsCollector';
  
  private services = [
    { name: 'api-gateway', url: config.services.apiGateway, port: 3000 },
    { name: 'auth', url: config.services.auth, port: 3001 },
    { name: 'venue', url: config.services.venue, port: 3002 },
    { name: 'event', url: config.services.event, port: 3003 },
    { name: 'ticket', url: config.services.ticket, port: 3004 },
    { name: 'payment', url: config.services.payment, port: 3005 },
    { name: 'marketplace', url: config.services.marketplace, port: 3006 },
    { name: 'analytics', url: config.services.analytics, port: 3007 },
  ];

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, 30000); // Check every 30 seconds
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    for (const service of this.services) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${service.url}/health`, {
          timeout: 5000,
          validateStatus: () => true // Accept any status
        });
        const responseTime = Date.now() - startTime;

        // Record response time
        await metricsService.pushMetrics({
          name: 'http_response_time_ms',
          type: 'histogram',
          service: service.name,
          value: responseTime,
          labels: {
            endpoint: '/health',
            status: response.status.toString(),
          },
        });

        // Record availability
        await metricsService.pushMetrics({
          name: 'service_up',
          type: 'gauge',
          service: service.name,
          value: response.status < 500 ? 1 : 0,
          labels: {
            port: service.port.toString(),
          },
        });

        if (response.status >= 500) {
          logger.warn(`Service ${service.name} returned error status: ${response.status}`);
        }
      } catch (error: any) {
        // Service is down
        await metricsService.pushMetrics({
          name: 'service_up',
          type: 'gauge',
          service: service.name,
          value: 0,
          labels: {
            port: service.port.toString(),
          },
        });
        
        const errorMessage = error?.message || 'Unknown error';
        logger.debug(`Service ${service.name} health check failed: ${errorMessage}`);
      }
    }
  }
}
