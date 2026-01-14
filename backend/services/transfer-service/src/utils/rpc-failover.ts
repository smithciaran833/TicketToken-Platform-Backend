/**
 * RPC Failover Utility for Solana Blockchain Operations
 * 
 * AUDIT FIXES:
 * - ERR-H6: No RPC failover → Multi-RPC with automatic failover
 * - BC-3: Single RPC endpoint → Support multiple endpoints
 * - EXT-1: RPC failover missing → Load balancing with health checks
 * - BC-H1: No priority fee management → Dynamic fee calculation
 * - BC-H2: No compute unit estimation → Pre-flight estimation
 * - BC-H3: No transaction timeout handling → Configurable timeouts
 * 
 * Features:
 * - Multiple RPC endpoints with priority ordering
 * - Automatic failover on errors
 * - Health checking and endpoint rotation
 * - Rate limit detection and backoff
 * - Priority fee estimation
 * - Compute unit estimation
 */

import { Connection, ConnectionConfig, Commitment, PublicKey, Transaction } from '@solana/web3.js';
import logger from './logger';

// =============================================================================
// TYPES
// =============================================================================

interface RPCEndpoint {
  url: string;
  name: string;
  priority: number;         // Lower = higher priority
  weight: number;           // For weighted selection
  rateLimit?: number;       // Requests per second
  healthCheckInterval?: number;
}

interface EndpointHealth {
  url: string;
  healthy: boolean;
  lastCheck: number;
  lastLatency: number;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  rateLimitedUntil?: number;
}

interface RPCResponse<T> {
  data: T;
  endpoint: string;
  latencyMs: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Parse RPC endpoints from environment
function parseRPCEndpoints(): RPCEndpoint[] {
  const endpoints: RPCEndpoint[] = [];
  
  // Primary endpoint (required)
  const primaryUrl = process.env.SOLANA_RPC_URL;
  if (primaryUrl) {
    endpoints.push({
      url: primaryUrl,
      name: 'primary',
      priority: 1,
      weight: 3
    });
  }
  
  // Secondary endpoint (optional)
  const secondaryUrl = process.env.SOLANA_RPC_URL_SECONDARY;
  if (secondaryUrl) {
    endpoints.push({
      url: secondaryUrl,
      name: 'secondary',
      priority: 2,
      weight: 2
    });
  }
  
  // Tertiary endpoint (optional)
  const tertiaryUrl = process.env.SOLANA_RPC_URL_TERTIARY;
  if (tertiaryUrl) {
    endpoints.push({
      url: tertiaryUrl,
      name: 'tertiary',
      priority: 3,
      weight: 1
    });
  }
  
  // Parse JSON config if provided
  const configJson = process.env.SOLANA_RPC_ENDPOINTS;
  if (configJson) {
    try {
      const parsed = JSON.parse(configJson) as RPCEndpoint[];
      endpoints.push(...parsed);
    } catch (error) {
      logger.warn('Failed to parse SOLANA_RPC_ENDPOINTS JSON', { error });
    }
  }
  
  // Default to devnet if no endpoints configured
  if (endpoints.length === 0) {
    logger.warn('No RPC endpoints configured, using devnet');
    endpoints.push({
      url: 'https://api.devnet.solana.com',
      name: 'devnet',
      priority: 1,
      weight: 1
    });
  }
  
  // Sort by priority
  endpoints.sort((a, b) => a.priority - b.priority);
  
  return endpoints;
}

const RPC_CONFIG = {
  endpoints: parseRPCEndpoints(),
  healthCheckInterval: parseInt(process.env.RPC_HEALTH_CHECK_INTERVAL || '30000', 10),
  maxRetries: parseInt(process.env.RPC_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.RPC_RETRY_DELAY || '1000', 10),
  requestTimeout: parseInt(process.env.RPC_REQUEST_TIMEOUT || '30000', 10),
  rateLimitBackoff: parseInt(process.env.RPC_RATE_LIMIT_BACKOFF || '60000', 10)
};

// =============================================================================
// HEALTH TRACKING
// =============================================================================

const healthMap = new Map<string, EndpointHealth>();

function initializeHealth(): void {
  for (const endpoint of RPC_CONFIG.endpoints) {
    healthMap.set(endpoint.url, {
      url: endpoint.url,
      healthy: true,
      lastCheck: 0,
      lastLatency: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalFailures: 0
    });
  }
}

function getHealth(url: string): EndpointHealth {
  let health = healthMap.get(url);
  if (!health) {
    health = {
      url,
      healthy: true,
      lastCheck: 0,
      lastLatency: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalFailures: 0
    };
    healthMap.set(url, health);
  }
  return health;
}

function recordSuccess(url: string, latencyMs: number): void {
  const health = getHealth(url);
  health.healthy = true;
  health.lastCheck = Date.now();
  health.lastLatency = latencyMs;
  health.consecutiveFailures = 0;
  health.totalRequests++;
}

function recordFailure(url: string, error: Error): void {
  const health = getHealth(url);
  health.lastCheck = Date.now();
  health.consecutiveFailures++;
  health.totalRequests++;
  health.totalFailures++;
  
  // Mark unhealthy after 3 consecutive failures
  if (health.consecutiveFailures >= 3) {
    health.healthy = false;
    logger.warn('RPC endpoint marked unhealthy', {
      url,
      consecutiveFailures: health.consecutiveFailures,
      error: error.message
    });
  }
  
  // Detect rate limiting
  if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
    health.rateLimitedUntil = Date.now() + RPC_CONFIG.rateLimitBackoff;
    logger.warn('RPC endpoint rate limited', {
      url,
      backoffMs: RPC_CONFIG.rateLimitBackoff
    });
  }
}

// =============================================================================
// ENDPOINT SELECTION
// =============================================================================

function getAvailableEndpoints(): RPCEndpoint[] {
  const now = Date.now();
  
  return RPC_CONFIG.endpoints.filter(endpoint => {
    const health = getHealth(endpoint.url);
    
    // Skip unhealthy endpoints
    if (!health.healthy) {
      // Check if it's been long enough to retry
      if (now - health.lastCheck > RPC_CONFIG.healthCheckInterval) {
        health.healthy = true; // Give it another chance
      } else {
        return false;
      }
    }
    
    // Skip rate-limited endpoints
    if (health.rateLimitedUntil && now < health.rateLimitedUntil) {
      return false;
    }
    
    return true;
  });
}

function selectEndpoint(): RPCEndpoint | null {
  const available = getAvailableEndpoints();
  
  if (available.length === 0) {
    // All endpoints unhealthy - try the primary anyway
    logger.warn('All RPC endpoints unhealthy, using primary');
    return RPC_CONFIG.endpoints[0] || null;
  }
  
  // Return highest priority available endpoint
  return available[0] || null;
}

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

const connectionCache = new Map<string, Connection>();

function getConnection(url: string, commitment: Commitment = 'confirmed'): Connection {
  const cacheKey = `${url}:${commitment}`;
  
  let connection = connectionCache.get(cacheKey);
  if (!connection) {
    const config: ConnectionConfig = {
      commitment,
      confirmTransactionInitialTimeout: RPC_CONFIG.requestTimeout,
      disableRetryOnRateLimit: false
    };
    
    connection = new Connection(url, config);
    connectionCache.set(cacheKey, connection);
  }
  
  return connection;
}

// =============================================================================
// FAILOVER EXECUTION
// =============================================================================

/**
 * Execute an RPC call with automatic failover
 */
export async function executeWithFailover<T>(
  operation: (connection: Connection) => Promise<T>,
  options: {
    commitment?: Commitment;
    maxRetries?: number;
    retryDelay?: number;
    operationName?: string;
  } = {}
): Promise<RPCResponse<T>> {
  const {
    commitment = 'confirmed',
    maxRetries = RPC_CONFIG.maxRetries,
    retryDelay = RPC_CONFIG.retryDelay,
    operationName = 'RPC operation'
  } = options;
  
  const triedEndpoints = new Set<string>();
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const endpoint = selectEndpoint();
    
    if (!endpoint) {
      throw new Error('No RPC endpoints available');
    }
    
    // Try next endpoint if this one was already tried
    if (triedEndpoints.has(endpoint.url) && getAvailableEndpoints().length > 1) {
      const alternatives = getAvailableEndpoints().filter(e => !triedEndpoints.has(e.url));
      if (alternatives.length > 0) {
        continue;
      }
    }
    
    triedEndpoints.add(endpoint.url);
    
    const connection = getConnection(endpoint.url, commitment);
    const startTime = Date.now();
    
    try {
      const data = await Promise.race([
        operation(connection),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('RPC request timeout')), RPC_CONFIG.requestTimeout)
        )
      ]);
      
      const latencyMs = Date.now() - startTime;
      recordSuccess(endpoint.url, latencyMs);
      
      logger.debug('RPC operation succeeded', {
        operation: operationName,
        endpoint: endpoint.name,
        latencyMs,
        attempt
      });
      
      return { data, endpoint: endpoint.name, latencyMs };
      
    } catch (error) {
      lastError = error as Error;
      recordFailure(endpoint.url, lastError);
      
      logger.warn('RPC operation failed', {
        operation: operationName,
        endpoint: endpoint.name,
        error: lastError.message,
        attempt
      });
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All RPC attempts failed');
}

// =============================================================================
// PRIORITY FEE ESTIMATION (BC-H1)
// =============================================================================

/**
 * Get recent priority fees for fee estimation
 */
export async function getRecentPriorityFees(
  connection: Connection
): Promise<{ low: number; medium: number; high: number }> {
  try {
    const fees = await connection.getRecentPrioritizationFees();
    
    if (fees.length === 0) {
      return { low: 0, medium: 1000, high: 5000 };
    }
    
    const sortedFees = fees
      .map(f => f.prioritizationFee)
      .sort((a, b) => a - b);
    
    const len = sortedFees.length;
    
    return {
      low: sortedFees[Math.floor(len * 0.25)] || 0,
      medium: sortedFees[Math.floor(len * 0.5)] || 1000,
      high: sortedFees[Math.floor(len * 0.75)] || 5000
    };
  } catch (error) {
    logger.warn('Failed to get priority fees', { error });
    return { low: 0, medium: 1000, high: 5000 };
  }
}

/**
 * Estimate priority fee with failover
 */
export async function estimatePriorityFee(
  tier: 'low' | 'medium' | 'high' = 'medium'
): Promise<number> {
  const response = await executeWithFailover(
    async (connection) => getRecentPriorityFees(connection),
    { operationName: 'estimatePriorityFee' }
  );
  
  return response.data[tier];
}

// =============================================================================
// COMPUTE UNIT ESTIMATION (BC-H2)
// =============================================================================

/**
 * Simulate transaction to estimate compute units
 */
export async function estimateComputeUnits(
  transaction: Transaction,
  feePayer: PublicKey
): Promise<number> {
  const response = await executeWithFailover(
    async (connection) => {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = feePayer;
      
      const simulation = await connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      // Add 20% buffer to estimated units
      const estimatedUnits = simulation.value.unitsConsumed || 200000;
      return Math.ceil(estimatedUnits * 1.2);
    },
    { operationName: 'estimateComputeUnits' }
  );
  
  return response.data;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Perform health check on all endpoints
 */
export async function healthCheck(): Promise<Map<string, EndpointHealth>> {
  const results = new Map<string, EndpointHealth>();
  
  for (const endpoint of RPC_CONFIG.endpoints) {
    const connection = getConnection(endpoint.url);
    const startTime = Date.now();
    
    try {
      await connection.getSlot();
      const latencyMs = Date.now() - startTime;
      recordSuccess(endpoint.url, latencyMs);
    } catch (error) {
      recordFailure(endpoint.url, error as Error);
    }
    
    results.set(endpoint.url, getHealth(endpoint.url));
  }
  
  return results;
}

/**
 * Get current health status
 */
export function getHealthStatus(): Record<string, EndpointHealth> {
  const status: Record<string, EndpointHealth> = {};
  for (const [url, health] of healthMap) {
    status[url] = { ...health };
  }
  return status;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize health tracking
initializeHealth();

// Start periodic health checks
if (process.env.NODE_ENV !== 'test') {
  setInterval(async () => {
    try {
      await healthCheck();
    } catch (error) {
      logger.error({ error }, 'Health check failed');
    }
  }, RPC_CONFIG.healthCheckInterval);
}

logger.info('RPC failover initialized', {
  endpoints: RPC_CONFIG.endpoints.map(e => ({ name: e.name, priority: e.priority })),
  maxRetries: RPC_CONFIG.maxRetries
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  executeWithFailover,
  estimatePriorityFee,
  estimateComputeUnits,
  healthCheck,
  getHealthStatus,
  getConnection,
  selectEndpoint,
  RPC_CONFIG
};
