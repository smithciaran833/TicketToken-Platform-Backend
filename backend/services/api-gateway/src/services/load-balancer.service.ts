import { createHash } from 'crypto';
import { ServiceInstance, LoadBalancerStrategy } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('load-balancer-service');

export class LoadBalancerService {
  private roundRobinCounters: Map<string, number> = new Map();
  private leastConnectionsMap: Map<string, Map<string, number>> = new Map();

  selectInstance(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy = 'round-robin',
    sessionKey?: string
  ): ServiceInstance {
    if (instances.length === 0) {
      throw new Error(`No instances available for service: ${service}`);
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.healthy);
    
    if (healthyInstances.length === 0) {
      logger.warn({ service }, 'No healthy instances available, using all instances');
      return this.selectByStrategy(service, instances, strategy, sessionKey);
    }

    return this.selectByStrategy(service, healthyInstances, strategy, sessionKey);
  }

  private selectByStrategy(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy,
    sessionKey?: string
  ): ServiceInstance {
    switch (strategy) {
      case 'round-robin':
        return this.roundRobin(service, instances);
      
      case 'least-connections':
        return this.leastConnections(service, instances);
      
      case 'random':
        return this.random(instances);
      
      case 'consistent-hash':
        if (!sessionKey) {
          logger.warn({ service }, 'No session key provided for consistent hash, falling back to random');
          return this.random(instances);
        }
        return this.consistentHash(instances, sessionKey);
      
      default:
        logger.warn({ service, strategy }, 'Unknown strategy, falling back to round-robin');
        return this.roundRobin(service, instances);
    }
  }

  private roundRobin(service: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(service) || 0;
    const index = counter % instances.length;
    
    this.roundRobinCounters.set(service, counter + 1);
    
    const selected = instances[index];
    logger.debug({ service, instance: selected.id }, 'Selected instance (round-robin)');
    
    return selected;
  }

  private leastConnections(service: string, instances: ServiceInstance[]): ServiceInstance {
    if (!this.leastConnectionsMap.has(service)) {
      this.leastConnectionsMap.set(service, new Map());
    }
    
    const connectionCounts = this.leastConnectionsMap.get(service)!;
    
    let leastConnections = Infinity;
    let selectedInstance: ServiceInstance | null = null;
    
    for (const instance of instances) {
      const connections = connectionCounts.get(instance.id) || 0;
      
      if (connections < leastConnections) {
        leastConnections = connections;
        selectedInstance = instance;
      }
    }
    
    if (!selectedInstance) {
      selectedInstance = instances[0];
    }
    
    // Increment connection count
    connectionCounts.set(
      selectedInstance.id,
      (connectionCounts.get(selectedInstance.id) || 0) + 1
    );
    
    logger.debug({ 
      service, 
      instance: selectedInstance.id,
      connections: leastConnections + 1
    }, 'Selected instance (least-connections)');
    
    return selectedInstance;
  }

  private random(instances: ServiceInstance[]): ServiceInstance {
    const index = Math.floor(Math.random() * instances.length);
    const selected = instances[index];
    
    logger.debug({ instance: selected.id }, 'Selected instance (random)');
    
    return selected;
  }

  private consistentHash(instances: ServiceInstance[], key: string): ServiceInstance {
    // Simple consistent hash implementation
    const hash = createHash('md5').update(key).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const index = hashInt % instances.length;
    
    const selected = instances[index];
    
    logger.debug({ 
      instance: selected.id,
      key,
      hash: hash.substring(0, 8)
    }, 'Selected instance (consistent-hash)');
    
    return selected;
  }

  // Update connection count when request completes
  releaseConnection(service: string, instanceId: string) {
    const connectionCounts = this.leastConnectionsMap.get(service);
    
    if (connectionCounts) {
      const current = connectionCounts.get(instanceId) || 0;
      if (current > 0) {
        connectionCounts.set(instanceId, current - 1);
      }
    }
  }

  // Reset counters
  reset(service?: string) {
    if (service) {
      this.roundRobinCounters.delete(service);
      this.leastConnectionsMap.delete(service);
    } else {
      this.roundRobinCounters.clear();
      this.leastConnectionsMap.clear();
    }
    
    logger.info({ service }, 'Load balancer counters reset');
  }

  // Get current state for monitoring
  getState() {
    const state: Record<string, any> = {};
    
    for (const [service, counter] of this.roundRobinCounters) {
      state[service] = {
        roundRobinCounter: counter,
        connections: Object.fromEntries(
          this.leastConnectionsMap.get(service) || new Map()
        ),
      };
    }
    
    return state;
  }
}
