import CircuitBreaker from 'opossum';
import logger from './logger';

// Circuit breaker options for different services
const SOLANA_BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 30000,                  // 30 seconds timeout for Solana RPC calls
  errorThresholdPercentage: 50,    // Open circuit after 50% failures
  resetTimeout: 30000,             // Try again after 30 seconds
  volumeThreshold: 5,              // Minimum calls before calculating error %
  rollingCountTimeout: 10000,      // Time window for counting requests
  rollingCountBuckets: 10          // Number of buckets in the rolling window
};

const IPFS_BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 60000,                  // 60 seconds timeout for IPFS (uploads can be slow)
  errorThresholdPercentage: 50,    // Open circuit after 50% failures
  resetTimeout: 30000,             // Try again after 30 seconds
  volumeThreshold: 3,              // Lower threshold for IPFS (fewer calls typically)
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10
};

// Generic async function type for circuit breaker
type AsyncFunction<T> = (...args: any[]) => Promise<T>;

/**
 * Solana RPC Circuit Breaker
 * Wraps Solana RPC calls to prevent cascading failures
 */
class SolanaCircuitBreaker {
  private breaker: CircuitBreaker<any[], any>;
  private name = 'solana-rpc';

  constructor() {
    // Create a pass-through breaker that executes the provided function
    this.breaker = new CircuitBreaker(
      async (fn: AsyncFunction<any>, ...args: any[]) => fn(...args),
      SOLANA_BREAKER_OPTIONS
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.breaker.on('open', () => {
      logger.warn('🔴 Solana circuit breaker OPEN - Solana RPC calls blocked', {
        breaker: this.name,
        state: 'open'
      });
    });

    this.breaker.on('halfOpen', () => {
      logger.info('🟡 Solana circuit breaker HALF-OPEN - Testing Solana RPC', {
        breaker: this.name,
        state: 'halfOpen'
      });
    });

    this.breaker.on('close', () => {
      logger.info('🟢 Solana circuit breaker CLOSED - Solana RPC recovered', {
        breaker: this.name,
        state: 'closed'
      });
    });

    this.breaker.on('timeout', () => {
      logger.warn('⏱️ Solana circuit breaker TIMEOUT', { breaker: this.name });
    });

    this.breaker.on('reject', () => {
      logger.warn('❌ Solana circuit breaker REJECTED - Circuit is open', { breaker: this.name });
    });

    this.breaker.on('fallback', (result: unknown) => {
      logger.info('↩️ Solana circuit breaker FALLBACK executed', { breaker: this.name });
    });
  }

  /**
   * Execute a Solana RPC call through the circuit breaker
   */
  async fire<T>(fn: AsyncFunction<T>, ...args: any[]): Promise<T> {
    return this.breaker.fire(fn, ...args);
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreaker.Stats {
    return this.breaker.stats;
  }

  /**
   * Get current circuit state
   */
  getState(): string {
    if (this.breaker.opened) return 'open';
    if (this.breaker.halfOpen) return 'halfOpen';
    return 'closed';
  }

  /**
   * Check if circuit is healthy (closed)
   */
  isHealthy(): boolean {
    return !this.breaker.opened;
  }
}

/**
 * IPFS Circuit Breaker
 * Wraps IPFS upload calls to prevent cascading failures
 */
class IPFSCircuitBreaker {
  private breaker: CircuitBreaker<any[], any>;
  private name = 'ipfs';

  constructor() {
    this.breaker = new CircuitBreaker(
      async (fn: AsyncFunction<any>, ...args: any[]) => fn(...args),
      IPFS_BREAKER_OPTIONS
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.breaker.on('open', () => {
      logger.warn('🔴 IPFS circuit breaker OPEN - IPFS uploads blocked', {
        breaker: this.name,
        state: 'open'
      });
    });

    this.breaker.on('halfOpen', () => {
      logger.info('🟡 IPFS circuit breaker HALF-OPEN - Testing IPFS', {
        breaker: this.name,
        state: 'halfOpen'
      });
    });

    this.breaker.on('close', () => {
      logger.info('🟢 IPFS circuit breaker CLOSED - IPFS recovered', {
        breaker: this.name,
        state: 'closed'
      });
    });

    this.breaker.on('timeout', () => {
      logger.warn('⏱️ IPFS circuit breaker TIMEOUT', { breaker: this.name });
    });

    this.breaker.on('reject', () => {
      logger.warn('❌ IPFS circuit breaker REJECTED - Circuit is open', { breaker: this.name });
    });
  }

  /**
   * Execute an IPFS call through the circuit breaker
   */
  async fire<T>(fn: AsyncFunction<T>, ...args: any[]): Promise<T> {
    return this.breaker.fire(fn, ...args);
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreaker.Stats {
    return this.breaker.stats;
  }

  /**
   * Get current circuit state
   */
  getState(): string {
    if (this.breaker.opened) return 'open';
    if (this.breaker.halfOpen) return 'halfOpen';
    return 'closed';
  }

  /**
   * Check if circuit is healthy (closed)
   */
  isHealthy(): boolean {
    return !this.breaker.opened;
  }
}

// Singleton instances
let solanaBreaker: SolanaCircuitBreaker | null = null;
let ipfsBreaker: IPFSCircuitBreaker | null = null;

/**
 * Get the Solana circuit breaker instance
 */
export function getSolanaCircuitBreaker(): SolanaCircuitBreaker {
  if (!solanaBreaker) {
    solanaBreaker = new SolanaCircuitBreaker();
    logger.info('Initialized Solana circuit breaker');
  }
  return solanaBreaker;
}

/**
 * Get the IPFS circuit breaker instance
 */
export function getIPFSCircuitBreaker(): IPFSCircuitBreaker {
  if (!ipfsBreaker) {
    ipfsBreaker = new IPFSCircuitBreaker();
    logger.info('Initialized IPFS circuit breaker');
  }
  return ipfsBreaker;
}

/**
 * Get health status of all circuit breakers
 */
export function getCircuitBreakerHealth(): {
  solana: { state: string; healthy: boolean; stats: CircuitBreaker.Stats };
  ipfs: { state: string; healthy: boolean; stats: CircuitBreaker.Stats };
} {
  const solana = getSolanaCircuitBreaker();
  const ipfs = getIPFSCircuitBreaker();

  return {
    solana: {
      state: solana.getState(),
      healthy: solana.isHealthy(),
      stats: solana.getStats()
    },
    ipfs: {
      state: ipfs.getState(),
      healthy: ipfs.isHealthy(),
      stats: ipfs.getStats()
    }
  };
}
