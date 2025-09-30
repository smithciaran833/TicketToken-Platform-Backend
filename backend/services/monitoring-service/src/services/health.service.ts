import axios from 'axios';
import { config } from '../config';
import { pgPool, redisClient, mongoClient, esClient } from '../utils/database';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services?: any;
  dependencies?: any;
  uptime?: number;
  details?: any;
}

class HealthService {
  private startTime = Date.now();

  async getOverallHealth(): Promise<HealthStatus> {
    const [services, dependencies] = await Promise.all([
      this.getAllServicesHealth(),
      this.getDependenciesHealth(),
    ]);

    const allHealthy = 
      services.every(s => s.status === 'healthy') &&
      Object.values(dependencies).every((d: any) => d.status === 'healthy');

    const anyUnhealthy = 
      services.some(s => s.status === 'unhealthy') ||
      Object.values(dependencies).some((d: any) => d.status === 'unhealthy');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      services: services.length,
      dependencies: Object.keys(dependencies).length,
    };
  }

  async getServiceHealth(serviceName: string): Promise<any> {
    try {
      const serviceUrl = (config.services as any)[serviceName];
      if (!serviceUrl) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      const response = await axios.get(`${serviceUrl}/health`, {
        timeout: 5000,
      });

      return {
        service: serviceName,
        status: 'healthy',
        responseTime: response.headers['x-response-time'] || null,
        timestamp: new Date(),
        details: response.data,
      };
    } catch (error: any) {
      return {
        service: serviceName,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async getAllServicesHealth(): Promise<any[]> {
    const services = Object.keys(config.services);
    const healthChecks = await Promise.allSettled(
      services.map(service => this.getServiceHealth(service))
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: services[index],
          status: 'unhealthy',
          error: result.reason.message,
          timestamp: new Date(),
        };
      }
    });
  }

  async getDependenciesHealth(): Promise<any> {
    const dependencies: any = {};

    // PostgreSQL
    try {
      await pgPool.query('SELECT 1');
      dependencies.postgresql = { status: 'healthy' };
    } catch (error: any) {
      dependencies.postgresql = { status: 'unhealthy', error: error.message };
    }

    // Redis
    try {
      await redisClient.ping();
      dependencies.redis = { status: 'healthy' };
    } catch (error: any) {
      dependencies.redis = { status: 'unhealthy', error: error.message };
    }

    // MongoDB
    try {
      await mongoClient.db().admin().ping();
      dependencies.mongodb = { status: 'healthy' };
    } catch (error: any) {
      dependencies.mongodb = { status: 'unhealthy', error: error.message };
    }

    // Elasticsearch
    try {
      await esClient.ping();
      dependencies.elasticsearch = { status: 'healthy' };
    } catch (error: any) {
      dependencies.elasticsearch = { status: 'unhealthy', error: error.message };
    }

    return dependencies;
  }
}

export const healthService = new HealthService();
