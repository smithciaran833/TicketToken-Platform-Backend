import { Connection, ConnectionConfig, Commitment } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface RPCEndpoint {
  url: string;
  priority: number;
  healthy: boolean;
  lastCheck: number;
  failureCount: number;
  latency?: number;
}

interface RPCFailoverConfig {
  endpoints: string[];
  healthCheckInterval?: number; // milliseconds
  maxFailures?: number;
  timeout?: number; // milliseconds
  commitment?: Commitment;
}

export class RPCFailoverService {
  private endpoints: RPCEndpoint[];
  private currentEndpointIndex: number;
  private healthCheckInterval: number;
  private maxFailures: number;
  private timeout: number;
  private commitment: Commitment;
  private healthCheckTimer?: NodeJS.Timeout;
  private connectionConfig: ConnectionConfig;

  constructor(config: RPCFailoverConfig) {
    this.endpoints = config.endpoints.map((url, index) => ({
      url,
      priority: index,
      healthy: true,
      lastCheck: Date.now(),
      failureCount: 0
    }));

    this.currentEndpointIndex = 0;
    this.healthCheckInterval = config.healthCheckInterval || 30000; // 30 seconds
    this.maxFailures = config.maxFailures || 3;
    this.timeout = config.timeout || 30000;
    this.commitment = config.commitment || 'confirmed';

    this.connectionConfig = {
      commitment: this.commitment,
      confirmTransactionInitialTimeout: this.timeout
    };

    logger.info('RPC Failover Service initialized', {
      endpoints: this.endpoints.length,
      healthCheckInterval: this.healthCheckInterval,
      maxFailures: this.maxFailures
    });

    this.startHealthChecks();
  }

  /**
   * Get current connection
   */
  getConnection(): Connection {
    const endpoint = this.getCurrentEndpoint();
    return new Connection(endpoint.url, this.connectionConfig);
  }

  /**
   * Get current endpoint
   */
  private getCurrentEndpoint(): RPCEndpoint {
    // Find first healthy endpoint
    const healthyEndpoint = this.endpoints.find(e => e.healthy);
    
    if (!healthyEndpoint) {
      // All endpoints unhealthy, use primary with warning
      logger.warn('All RPC endpoints unhealthy, using primary');
      return this.endpoints[0];
    }

    return healthyEndpoint;
  }

  /**
   * Execute operation with automatic failover
   */
  async executeWithFailover<T>(
    operation: (connection: Connection) => Promise<T>,
    retries: number = this.endpoints.length
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < retries) {
      const endpoint = this.getCurrentEndpoint();
      const connection = new Connection(endpoint.url, this.connectionConfig);

      try {
        const startTime = Date.now();
        const result = await operation(connection);
        const latency = Date.now() - startTime;

        // Update endpoint metrics on success
        endpoint.latency = latency;
        endpoint.failureCount = 0;
        endpoint.healthy = true;
        endpoint.lastCheck = Date.now();

        logger.debug('RPC operation successful', {
          endpoint: endpoint.url,
          latency,
          attempts: attempts + 1
        });

        return result;
      } catch (error: any) {
        lastError = error;
        attempts++;

        logger.warn('RPC operation failed, attempting failover', {
          endpoint: endpoint.url,
          error: error.message,
          attempts,
          retries
        });

        // Mark endpoint as potentially unhealthy
        endpoint.failureCount++;
        if (endpoint.failureCount >= this.maxFailures) {
          endpoint.healthy = false;
          logger.error('RPC endpoint marked unhealthy', {
            endpoint: endpoint.url,
            failureCount: endpoint.failureCount
          });
        }

        // Try next endpoint if available
        if (attempts < retries) {
          this.rotateToNextEndpoint();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
        }
      }
    }

    logger.error('All RPC failover attempts exhausted', {
      attempts,
      lastError: lastError?.message
    });

    throw lastError || new Error('All RPC endpoints failed');
  }

  /**
   * Rotate to next healthy endpoint
   */
  private rotateToNextEndpoint(): void {
    const startIndex = this.currentEndpointIndex;
    let checked = 0;

    while (checked < this.endpoints.length) {
      this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
      checked++;

      if (this.endpoints[this.currentEndpointIndex].healthy) {
        logger.info('Rotated to next RPC endpoint', {
          endpoint: this.endpoints[this.currentEndpointIndex].url,
          index: this.currentEndpointIndex
        });
        return;
      }
    }

    // No healthy endpoint found, reset to primary
    this.currentEndpointIndex = 0;
    logger.warn('No healthy endpoints found, reset to primary');
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health check on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    logger.debug('Performing RPC health checks');

    const checks = this.endpoints.map(async (endpoint) => {
      try {
        const connection = new Connection(endpoint.url, this.connectionConfig);
        const startTime = Date.now();
        
        // Simple health check - get recent blockhash
        await connection.getLatestBlockhash();
        
        const latency = Date.now() - startTime;
        
        // Update endpoint status
        endpoint.healthy = true;
        endpoint.latency = latency;
        endpoint.failureCount = 0;
        endpoint.lastCheck = Date.now();

        logger.debug('Health check passed', {
          endpoint: endpoint.url,
          latency
        });
      } catch (error: any) {
        endpoint.failureCount++;
        endpoint.lastCheck = Date.now();

        if (endpoint.failureCount >= this.maxFailures) {
          endpoint.healthy = false;
        }

        logger.warn('Health check failed', {
          endpoint: endpoint.url,
          error: error.message,
          failureCount: endpoint.failureCount,
          healthy: endpoint.healthy
        });
      }
    });

    await Promise.allSettled(checks);

    // Log overall health status
    const healthyCount = this.endpoints.filter(e => e.healthy).length;
    logger.info('Health check complete', {
      total: this.endpoints.length,
      healthy: healthyCount,
      unhealthy: this.endpoints.length - healthyCount
    });
  }

  /**
   * Get health status of all endpoints
   */
  getHealthStatus(): Array<{
    url: string;
    healthy: boolean;
    latency?: number;
    failureCount: number;
    lastCheck: number;
  }> {
    return this.endpoints.map(e => ({
      url: e.url,
      healthy: e.healthy,
      latency: e.latency,
      failureCount: e.failureCount,
      lastCheck: e.lastCheck
    }));
  }

  /**
   * Manually mark endpoint as healthy
   */
  markEndpointHealthy(url: string): void {
    const endpoint = this.endpoints.find(e => e.url === url);
    if (endpoint) {
      endpoint.healthy = true;
      endpoint.failureCount = 0;
      logger.info('Endpoint manually marked healthy', { url });
    }
  }

  /**
   * Manually mark endpoint as unhealthy
   */
  markEndpointUnhealthy(url: string): void {
    const endpoint = this.endpoints.find(e => e.url === url);
    if (endpoint) {
      endpoint.healthy = false;
      endpoint.failureCount = this.maxFailures;
      logger.info('Endpoint manually marked unhealthy', { url });
    }
  }

  /**
   * Stop health checks and cleanup
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info('RPC health checks stopped');
    }
  }
}

export default RPCFailoverService;
