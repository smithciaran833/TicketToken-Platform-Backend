import { Connection, ConnectionConfig } from '@solana/web3.js';
import { CircuitBreaker } from './circuit-breaker';
import logger from './logger';
import { rpcErrorsTotal } from './metrics';

export interface RPCEndpoint {
  url: string;
  priority: number;
  circuitBreaker: CircuitBreaker;
  healthCheckInterval?: NodeJS.Timeout;
  isHealthy: boolean;
  consecutiveFailures: number;
}

export interface RPCFailoverConfig {
  endpoints: string[];
  healthCheckIntervalMs?: number;
  maxConsecutiveFailures?: number;
  connectionConfig?: ConnectionConfig;
}

/**
 * RPC Failover Manager - Manages multiple Solana RPC endpoints with automatic failover
 */
export class RPCFailoverManager {
  private endpoints: RPCEndpoint[] = [];
  private currentEndpointIndex: number = 0;
  private readonly config: Required<Omit<RPCFailoverConfig, 'endpoints' | 'connectionConfig'>> & Pick<RPCFailoverConfig, 'connectionConfig'>;

  constructor(config: RPCFailoverConfig) {
    this.config = {
      healthCheckIntervalMs: config.healthCheckIntervalMs || 30000,
      maxConsecutiveFailures: config.maxConsecutiveFailures || 3,
      connectionConfig: config.connectionConfig
    };

    // Initialize endpoints
    config.endpoints.forEach((url, index) => {
      this.endpoints.push({
        url,
        priority: index, // Lower index = higher priority
        circuitBreaker: new CircuitBreaker({
          failureThreshold: 5,
          resetTimeout: 60000,
          successThreshold: 3
        }),
        isHealthy: true,
        consecutiveFailures: 0
      });
    });

    if (this.endpoints.length === 0) {
      throw new Error('At least one RPC endpoint must be configured');
    }

    logger.info({
      endpoints: this.endpoints.map(e => e.url),
      healthCheckIntervalMs: this.config.healthCheckIntervalMs
    }, 'RPC Failover Manager initialized');

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Get current active connection
   */
  getConnection(): Connection {
    const endpoint = this.getCurrentEndpoint();
    return new Connection(endpoint.url, this.config.connectionConfig);
  }

  /**
   * Execute a function with automatic failover
   */
  async executeWithFailover<T>(
    fn: (connection: Connection) => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error | undefined;
    const triedEndpoints = new Set<number>();

    while (triedEndpoints.size < this.endpoints.length) {
      const endpoint = this.getCurrentEndpoint();
      
      // Skip if we already tried this endpoint
      if (triedEndpoints.has(this.currentEndpointIndex)) {
        this.failoverToNext();
        continue;
      }

      triedEndpoints.add(this.currentEndpointIndex);

      try {
        const connection = new Connection(endpoint.url, this.config.connectionConfig);
        
        // Execute through circuit breaker
        const result = await endpoint.circuitBreaker.execute(
          () => fn(connection)
        );

        // Reset failure count on success
        endpoint.consecutiveFailures = 0;
        endpoint.isHealthy = true;

        return result;

      } catch (error) {
        lastError = error as Error;
        
        logger.warn({
          endpoint: endpoint.url,
          error: lastError.message,
          context
        }, 'RPC call failed, attempting failover');

        // Track failure
        endpoint.consecutiveFailures++;
        rpcErrorsTotal.inc({ error_type: lastError.name || 'unknown' });

        // Mark as unhealthy if too many failures
        if (endpoint.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          endpoint.isHealthy = false;
          logger.error({
            endpoint: endpoint.url,
            consecutiveFailures: endpoint.consecutiveFailures
          }, 'RPC endpoint marked as unhealthy');
        }

        // Try next endpoint
        this.failoverToNext();
      }
    }

    // All endpoints failed
    logger.error({ context, triedEndpoints: Array.from(triedEndpoints) }, 'All RPC endpoints failed');
    throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get current endpoint
   */
  private getCurrentEndpoint(): RPCEndpoint {
    return this.endpoints[this.currentEndpointIndex];
  }

  /**
   * Failover to next endpoint
   */
  private failoverToNext(): void {
    const previousUrl = this.endpoints[this.currentEndpointIndex].url;
    
    // Find next healthy endpoint
    let attempts = 0;
    do {
      this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
      attempts++;
      
      if (attempts >= this.endpoints.length) {
        // No healthy endpoints, use first one
        this.currentEndpointIndex = 0;
        break;
      }
    } while (!this.endpoints[this.currentEndpointIndex].isHealthy);

    const newUrl = this.endpoints[this.currentEndpointIndex].url;
    
    if (previousUrl !== newUrl) {
      logger.warn({
        from: previousUrl,
        to: newUrl
      }, 'Failed over to different RPC endpoint');
    }
  }

  /**
   * Start health check intervals for all endpoints
   */
  private startHealthChecks(): void {
    this.endpoints.forEach((endpoint, index) => {
      endpoint.healthCheckInterval = setInterval(async () => {
        await this.checkEndpointHealth(endpoint, index);
      }, this.config.healthCheckIntervalMs);
    });

    logger.info('RPC health checks started');
  }

  /**
   * Check health of a single endpoint
   */
  private async checkEndpointHealth(endpoint: RPCEndpoint, index: number): Promise<void> {
    try {
      const connection = new Connection(endpoint.url, this.config.connectionConfig);
      
      // Simple health check: get slot
      await connection.getSlot();
      
      // Mark as healthy
      if (!endpoint.isHealthy) {
        logger.info({ endpoint: endpoint.url }, 'RPC endpoint recovered and is now healthy');
      }
      
      endpoint.isHealthy = true;
      endpoint.consecutiveFailures = 0;
      endpoint.circuitBreaker.reset();

    } catch (error) {
      logger.debug({
        endpoint: endpoint.url,
        error: (error as Error).message
      }, 'RPC endpoint health check failed');
      
      // Health check failures don't count toward consecutive failures
      // Only actual operation failures do
    }
  }

  /**
   * Stop all health checks
   */
  stop(): void {
    this.endpoints.forEach(endpoint => {
      if (endpoint.healthCheckInterval) {
        clearInterval(endpoint.healthCheckInterval);
      }
    });
    logger.info('RPC health checks stopped');
  }

  /**
   * Get status of all endpoints
   */
  getStatus(): Array<{
    url: string;
    isHealthy: boolean;
    isCurrent: boolean;
    consecutiveFailures: number;
    circuitBreakerState: string;
  }> {
    return this.endpoints.map((endpoint, index) => ({
      url: endpoint.url,
      isHealthy: endpoint.isHealthy,
      isCurrent: index === this.currentEndpointIndex,
      consecutiveFailures: endpoint.consecutiveFailures,
      circuitBreakerState: endpoint.circuitBreaker.getState()
    }));
  }
}
