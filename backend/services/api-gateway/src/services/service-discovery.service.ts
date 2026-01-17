import { ServiceInstance } from '../types';
import { REDIS_KEYS } from '../config/redis';
import { createLogger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';

const logger = createLogger('service-discovery');

export class ServiceDiscoveryService {
  private cache = new Map<string, { instances: ServiceInstance[]; timestamp: number }>();
  private redis: any;

  constructor(dependencies: any = {}) {
    this.redis = dependencies.redis;
    if (!this.redis) {
      logger.warn('Redis not available for service discovery - using in-memory cache only');
    }
    this.startHealthCheckInterval();
  }

  async discover(serviceName: string): Promise<ServiceInstance[]> {
    // Check cache first
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.instances;
    }

    // For now, return static instances
    const instances = this.getStaticInstances(serviceName);

    // Update cache
    this.cache.set(serviceName, {
      instances,
      timestamp: Date.now(),
    });

    return instances;
  }

  async register(service: ServiceInstance): Promise<void> {
    if (!this.redis) {
      logger.debug('Skipping Redis registration - Redis not available');
      return;
    }

    const key = `${REDIS_KEYS.SERVICE_DISCOVERY}${service.name}:${service.id}`;

    await this.redis.setex(
      key,
      REDIS_KEYS.SERVICE_DISCOVERY,
      JSON.stringify({
        ...service,
        registeredAt: Date.now(),
      })
    );

    logger.info({
      service: service.name,
      id: service.id,
      address: `${service.address}:${service.port}`,
    }, 'Service instance registered');
  }

  async deregister(serviceId: string): Promise<void> {
    if (!this.redis) return;

    const keys = await this.redis.keys(`${REDIS_KEYS.SERVICE_DISCOVERY}*:${serviceId}`);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getHealthyInstances(serviceName: string): Promise<ServiceInstance[]> {
    const allInstances = await this.discover(serviceName);
    const healthyInstances: ServiceInstance[] = [];

    for (const instance of allInstances) {
      if (await this.checkInstanceHealth(instance)) {
        healthyInstances.push(instance);
      }
    }

    return healthyInstances;
  }

  private getStaticInstances(serviceName: string): ServiceInstance[] {
    const services = config.services as Record<string, string>;
    const serviceUrl = services[serviceName];

    if (!serviceUrl) {
      return [];
    }

    try {
      const url = new URL(serviceUrl);
      return [{
        id: `${serviceName}-static`,
        name: serviceName,
        address: url.hostname,
        port: parseInt(url.port) || 80,
        healthy: true,
        metadata: {
          static: true,
        },
      }];
    } catch (error) {
      logger.error({ error, serviceName }, 'Invalid service URL');
      return [];
    }
  }

  private async checkInstanceHealth(instance: ServiceInstance): Promise<boolean> {
    if (!this.redis) {
      // Without Redis, just return true for now
      return true;
    }

    const healthKey = `${REDIS_KEYS.SERVICE_HEALTH}${instance.name}:${instance.id}`;
    const health = await this.redis.get(healthKey);

    if (health === null) {
      // No health data, perform health check
      await this.performHealthCheck(instance);
      return true; // Assume healthy on first check
    }

    const healthData = JSON.parse(health);
    return healthData.status === 'healthy';
  }

  private startHealthCheckInterval() {
    setInterval(async () => {
      try {
        const allServices = await this.getAllServices();

        for (const instance of allServices) {
          await this.performHealthCheck(instance);
        }
      } catch (error) {
        logger.error({ error }, 'Health check cycle failed');
      }
    }, 120000); // Every 2 minutes
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    const healthKey = `${REDIS_KEYS.SERVICE_HEALTH}${instance.name}:${instance.id}`;

    try {
      // Perform HTTP health check
      const response = await axios.get(`http://${instance.address}:${instance.port}/health`, {
        timeout: 5000,
      });

      const healthData = {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        lastCheck: Date.now(),
        responseTime: response.headers['x-response-time'],
      };

      // Only store in Redis if available
      if (this.redis) {
        await this.redis.setex(
          healthKey,
          60, // 1 minute TTL
          JSON.stringify(healthData)
        );
      }
    } catch (error) {
      logger.error({
        instance: instance.name,
        id: instance.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Health check failed');

      // Mark as unhealthy - only if Redis available
      if (this.redis) {
        await this.redis.setex(
          healthKey,
          60,
          JSON.stringify({
            status: 'unhealthy',
            lastCheck: Date.now(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      }
    }
  }

  private async getAllServices(): Promise<ServiceInstance[]> {
    const services = ['auth-service', 'venue-service', 'event-service'];
    const allInstances: ServiceInstance[] = [];

    for (const service of services) {
      const instances = await this.discover(service);
      allInstances.push(...instances);
    }

    return allInstances;
  }

  async getServiceTopology(): Promise<Record<string, ServiceInstance[]>> {
    const topology: Record<string, ServiceInstance[]> = {};
    
    // Map short names to full service names
    const serviceMap = {
      'auth': 'auth-service',
      'venue': 'venue-service',
      'event': 'event-service',
    };

    for (const [shortName, fullName] of Object.entries(serviceMap)) {
      topology[shortName] = await this.discover(fullName);
    }

    return topology;
  }
}
