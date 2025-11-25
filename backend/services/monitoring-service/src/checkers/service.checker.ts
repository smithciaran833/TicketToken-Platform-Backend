import axios from 'axios';
import { logger } from '../logger';

export class ServiceHealthChecker {
  constructor(private serviceName: string, private serviceUrl: string) {}
  
  getName(): string {
    return `ServiceHealthChecker-${this.serviceName}`;
  }
  
  async check(): Promise<any> {
    const start = Date.now();
    
    try {
      // Try to reach the service's health endpoint
      const response = await axios.get(`${this.serviceUrl}/health`, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept 4xx as service is up
      });
      
      const latency = Date.now() - start;

      // Service responded
      if (response.status === 200) {
        return {
          status: latency < 2000 ? 'healthy' : 'degraded',
          latency,
          httpStatus: response.status,
          service: this.serviceName,
          url: this.serviceUrl,
          details: response.data,
          message: latency < 2000 ? 'Service responsive' : 'Service slow',
        };
      } else if (response.status >= 400 && response.status < 500) {
        // Service is up but responding with client error (maybe auth issue)
        return {
          status: 'degraded',
          latency,
          httpStatus: response.status,
          service: this.serviceName,
          url: this.serviceUrl,
          message: `Service returned ${response.status}`,
        };
      } else {
        return {
          status: 'unhealthy',
          latency,
          httpStatus: response.status,
          service: this.serviceName,
          url: this.serviceUrl,
          message: `Service returned ${response.status}`,
        };
      }
    } catch (error: any) {
      const latency = Date.now() - start;
      
      // Check specific error types
      if (error.code === 'ECONNREFUSED') {
        logger.error(`Service health check failed for ${this.serviceName}: Connection refused`);
        return {
          status: 'unhealthy',
          error: 'Connection refused',
          service: this.serviceName,
          url: this.serviceUrl,
          latency,
          message: 'Service not reachable',
        };
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        logger.error(`Service health check failed for ${this.serviceName}: Timeout`);
        return {
          status: 'unhealthy',
          error: 'Timeout',
          service: this.serviceName,
          url: this.serviceUrl,
          latency,
          message: 'Service timeout',
        };
      } else if (error.response) {
        // Service responded with error
        return {
          status: 'unhealthy',
          httpStatus: error.response.status,
          error: error.message,
          service: this.serviceName,
          url: this.serviceUrl,
          latency,
          message: `Service error: ${error.response.status}`,
        };
      } else {
        logger.error(`Service health check failed for ${this.serviceName}:`, error);
        return {
          status: 'unhealthy',
          error: error.message,
          code: error.code,
          service: this.serviceName,
          url: this.serviceUrl,
          latency,
          message: 'Service check failed',
        };
      }
    }
  }
}
