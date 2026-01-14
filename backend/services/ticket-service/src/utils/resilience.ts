/**
 * RESILIENCE UTILITIES
 * 
 * Fixes Batch 8 audit findings:
 * - DS4: Circuit breaker implementation
 * - Fallback support
 * - Jitter in retries
 * - Cache fallback
 * - Degraded service mode
 * 
 * MEDIUM/LOW Batch 24 fixes:
 * - GD2: Circuit breaker metrics exposed
 * - GD1: Feature flags support for circuit breakers
 */

import { Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger';
import { registry } from './metrics';

const log = logger.child({ component: 'Resilience' });

// =============================================================================
// CIRCUIT BREAKER METRICS - GD2 Fix (Batch 24)
// =============================================================================

export const circuitBreakerMetrics = {
  /** State transitions counter */
  stateTransitionsTotal: new Counter({
    name: 'circuit_breaker_transitions_total',
    help: 'Total circuit breaker state transitions',
    labelNames: ['name', 'from', 'to'] as const,
    registers: [registry],
  }),
  
  /** Success counter */
  successTotal: new Counter({
    name: 'circuit_breaker_success_total',
    help: 'Total successful operations through circuit breaker',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
  
  /** Failure counter */
  failureTotal: new Counter({
    name: 'circuit_breaker_failure_total',
    help: 'Total failed operations through circuit breaker',
    labelNames: ['name', 'reason'] as const,
    registers: [registry],
  }),
  
  /** Fallback executions */
  fallbackTotal: new Counter({
    name: 'circuit_breaker_fallback_total',
    help: 'Total fallback executions',
    labelNames: ['name', 'reason'] as const,
    registers: [registry],
  }),
  
  /** Rejected requests (circuit open) */
  rejectedTotal: new Counter({
    name: 'circuit_breaker_rejected_total',
    help: 'Total requests rejected due to open circuit',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
  
  /** Current state gauge (0=closed, 1=open, 2=half-open) */
  state: new Gauge({
    name: 'circuit_breaker_state_current',
    help: 'Current circuit breaker state (0=closed, 1=open, 2=half-open)',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
  
  /** Failure count gauge */
  failureCount: new Gauge({
    name: 'circuit_breaker_failure_count',
    help: 'Current consecutive failure count',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
  
  /** Execution duration histogram */
  executionDurationSeconds: new Histogram({
    name: 'circuit_breaker_execution_duration_seconds',
    help: 'Circuit breaker operation execution duration',
    labelNames: ['name', 'result'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  }),
  
  /** Time in open state gauge */
  openDurationSeconds: new Gauge({
    name: 'circuit_breaker_open_duration_seconds',
    help: 'Time the circuit breaker has been in open state',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
};

// =============================================================================
// FEATURE FLAGS - GD1 Fix (Batch 24)
// =============================================================================

/**
 * Feature flag configuration
 */
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  conditions?: FeatureFlagCondition[];
  metadata?: Record<string, unknown>;
}

/**
 * Feature flag condition for dynamic evaluation
 */
export interface FeatureFlagCondition {
  type: 'percentage' | 'tenant' | 'user' | 'time' | 'environment';
  value: unknown;
}

/**
 * Context for feature flag evaluation
 */
export interface FeatureFlagContext {
  tenantId?: string;
  userId?: string;
  environment?: string;
  requestId?: string;
}

/**
 * Feature flags store
 */
const featureFlags = new Map<string, FeatureFlag>();

/**
 * Default feature flags for circuit breakers
 */
const DEFAULT_CIRCUIT_BREAKER_FLAGS: FeatureFlag[] = [
  {
    name: 'circuit_breaker.enabled',
    enabled: true,
    description: 'Global circuit breaker enable/disable',
  },
  {
    name: 'circuit_breaker.fallback.enabled',
    enabled: true,
    description: 'Enable fallback execution when circuit is open',
  },
  {
    name: 'circuit_breaker.metrics.enabled',
    enabled: true,
    description: 'Enable circuit breaker metrics collection',
  },
  {
    name: 'circuit_breaker.logging.verbose',
    enabled: process.env.NODE_ENV !== 'production',
    description: 'Enable verbose circuit breaker logging',
  },
];

// Initialize default flags
DEFAULT_CIRCUIT_BREAKER_FLAGS.forEach(flag => featureFlags.set(flag.name, flag));

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(
  flagName: string,
  context?: FeatureFlagContext
): boolean {
  const flag = featureFlags.get(flagName);
  
  if (!flag) {
    // Check environment variable as fallback
    const envVar = `FEATURE_${flagName.toUpperCase().replace(/\./g, '_')}`;
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      return envValue === 'true' || envValue === '1';
    }
    return false;
  }
  
  // If no conditions, return static value
  if (!flag.conditions || flag.conditions.length === 0) {
    return flag.enabled;
  }
  
  // Evaluate conditions
  return evaluateConditions(flag.conditions, context);
}

/**
 * Evaluate feature flag conditions
 */
function evaluateConditions(
  conditions: FeatureFlagCondition[],
  context?: FeatureFlagContext
): boolean {
  for (const condition of conditions) {
    switch (condition.type) {
      case 'percentage':
        // Percentage rollout
        const percentage = condition.value as number;
        const hash = context?.userId || context?.tenantId || Math.random().toString();
        const bucket = Math.abs(hashCode(hash)) % 100;
        if (bucket >= percentage) return false;
        break;
        
      case 'tenant':
        // Specific tenant allowlist
        const allowedTenants = condition.value as string[];
        if (!context?.tenantId || !allowedTenants.includes(context.tenantId)) {
          return false;
        }
        break;
        
      case 'user':
        // Specific user allowlist
        const allowedUsers = condition.value as string[];
        if (!context?.userId || !allowedUsers.includes(context.userId)) {
          return false;
        }
        break;
        
      case 'environment':
        // Environment restriction
        const allowedEnvs = condition.value as string[];
        const currentEnv = context?.environment || process.env.NODE_ENV || 'development';
        if (!allowedEnvs.includes(currentEnv)) {
          return false;
        }
        break;
        
      case 'time':
        // Time-based activation
        const { start, end } = condition.value as { start?: string; end?: string };
        const now = new Date();
        if (start && now < new Date(start)) return false;
        if (end && now > new Date(end)) return false;
        break;
    }
  }
  
  return true;
}

/**
 * Simple hash function for consistent bucketing
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Set a feature flag value
 */
export function setFeatureFlag(flag: FeatureFlag): void {
  featureFlags.set(flag.name, flag);
  log.info('Feature flag updated', { flag: flag.name, enabled: flag.enabled });
}

/**
 * Get all feature flags
 */
export function getAllFeatureFlags(): FeatureFlag[] {
  return Array.from(featureFlags.values());
}

/**
 * Remove a feature flag
 */
export function removeFeatureFlag(name: string): boolean {
  const result = featureFlags.delete(name);
  if (result) {
    log.info('Feature flag removed', { flag: name });
  }
  return result;
}

/**
 * Get feature flag by name
 */
export function getFeatureFlag(name: string): FeatureFlag | undefined {
  return featureFlags.get(name);
}

// =============================================================================
// CIRCUIT BREAKER (Batch 8 Fix #3)
// =============================================================================

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;  // Number of failures before opening
  resetTimeout?: number;      // Ms to wait before half-open
  halfOpenSuccessThreshold?: number;  // Successes needed to close
  timeout?: number;           // Request timeout in ms
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastStateChange: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly options: Required<CircuitBreakerOptions>;
  private openedAt: number = 0;  // Track when circuit opened for metrics

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: options.name,
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 30000,
      halfOpenSuccessThreshold: options.halfOpenSuccessThreshold || 3,
      timeout: options.timeout || 10000,
    };
    
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now(),
    };
    
    // Initialize metrics
    this.updateMetrics();
  }

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
    context?: FeatureFlagContext
  ): Promise<T> {
    const metricsEnabled = isFeatureEnabled('circuit_breaker.metrics.enabled', context);
    const circuitEnabled = isFeatureEnabled('circuit_breaker.enabled', context);
    const fallbackEnabled = isFeatureEnabled('circuit_breaker.fallback.enabled', context);
    const verboseLogging = isFeatureEnabled('circuit_breaker.logging.verbose', context);
    
    // If circuit breaker is disabled via feature flag, bypass it
    if (!circuitEnabled) {
      if (verboseLogging) {
        log.debug('Circuit breaker disabled via feature flag', { name: this.options.name });
      }
      return fn();
    }
    
    const startTime = Date.now();
    
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state.state === 'OPEN') {
      // Update open duration metric
      if (metricsEnabled && this.openedAt > 0) {
        const openDuration = (Date.now() - this.openedAt) / 1000;
        circuitBreakerMetrics.openDurationSeconds.set({ name: this.options.name }, openDuration);
      }
      
      if (Date.now() - this.state.lastFailureTime > this.options.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        // Track rejected request
        if (metricsEnabled) {
          circuitBreakerMetrics.rejectedTotal.inc({ name: this.options.name });
        }
        
        if (verboseLogging) {
          log.warn('Circuit breaker OPEN, using fallback', { 
            name: this.options.name 
          });
        }
        
        if (fallback && fallbackEnabled) {
          if (metricsEnabled) {
            circuitBreakerMetrics.fallbackTotal.inc({ name: this.options.name, reason: 'circuit_open' });
          }
          return fallback();
        }
        throw new CircuitBreakerOpenError(this.options.name);
      }
    }

    try {
      // Add timeout wrapper
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Operation timed out')), this.options.timeout)
        )
      ]);
      
      this.onSuccess();
      
      // Track success metrics
      if (metricsEnabled) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        circuitBreakerMetrics.successTotal.inc({ name: this.options.name });
        circuitBreakerMetrics.executionDurationSeconds.observe(
          { name: this.options.name, result: 'success' },
          durationSeconds
        );
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown';
      const isTimeout = errorMessage === 'Operation timed out';
      
      this.onFailure();
      
      // Track failure metrics
      if (metricsEnabled) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        circuitBreakerMetrics.failureTotal.inc({
          name: this.options.name,
          reason: isTimeout ? 'timeout' : 'error'
        });
        circuitBreakerMetrics.executionDurationSeconds.observe(
          { name: this.options.name, result: 'failure' },
          durationSeconds
        );
      }
      
      if (fallback && fallbackEnabled) {
        if (verboseLogging) {
          log.warn('Primary failed, using fallback', { 
            name: this.options.name,
            error: errorMessage
          });
        }
        
        if (metricsEnabled) {
          circuitBreakerMetrics.fallbackTotal.inc({ 
            name: this.options.name, 
            reason: isTimeout ? 'timeout' : 'error' 
          });
        }
        
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      if (this.state.successCount >= this.options.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.state.failureCount = 0;
      this.updateMetrics();
    }
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    this.updateMetrics();

    if (this.state.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else if (this.state.failureCount >= this.options.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    const oldState = this.state.state;
    this.state.state = newState;
    this.state.lastStateChange = Date.now();
    
    if (newState === 'CLOSED') {
      this.state.failureCount = 0;
      this.state.successCount = 0;
      this.openedAt = 0;
    } else if (newState === 'HALF_OPEN') {
      this.state.successCount = 0;
    } else if (newState === 'OPEN') {
      this.openedAt = Date.now();
    }
    
    // Track state transition in metrics
    if (isFeatureEnabled('circuit_breaker.metrics.enabled')) {
      circuitBreakerMetrics.stateTransitionsTotal.inc({
        name: this.options.name,
        from: oldState,
        to: newState
      });
    }
    
    this.updateMetrics();
    
    log.info('Circuit breaker state change', {
      name: this.options.name,
      from: oldState,
      to: newState,
    });
  }

  /**
   * Update all metrics for this circuit breaker
   */
  private updateMetrics(): void {
    if (!isFeatureEnabled('circuit_breaker.metrics.enabled')) {
      return;
    }
    
    // State gauge: 0=closed, 1=open, 2=half-open
    const stateValue = this.state.state === 'CLOSED' ? 0 
      : this.state.state === 'OPEN' ? 1 
      : 2;
    
    circuitBreakerMetrics.state.set({ name: this.options.name }, stateValue);
    circuitBreakerMetrics.failureCount.set({ name: this.options.name }, this.state.failureCount);
    
    // Update open duration if open
    if (this.state.state === 'OPEN' && this.openedAt > 0) {
      const openDuration = (Date.now() - this.openedAt) / 1000;
      circuitBreakerMetrics.openDurationSeconds.set({ name: this.options.name }, openDuration);
    } else {
      circuitBreakerMetrics.openDurationSeconds.set({ name: this.options.name }, 0);
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  isOpen(): boolean {
    return this.state.state === 'OPEN';
  }

  reset(): void {
    this.transitionTo('CLOSED');
  }
  
  /**
   * Get metrics summary for this circuit breaker
   */
  async getMetricsSummary(): Promise<{
    name: string;
    state: string;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    openDurationSeconds: number;
  }> {
    return {
      name: this.options.name,
      state: this.state.state,
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      lastFailureTime: this.state.lastFailureTime,
      openDurationSeconds: this.state.state === 'OPEN' && this.openedAt > 0
        ? (Date.now() - this.openedAt) / 1000
        : 0,
    };
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// =============================================================================
// RETRY WITH JITTER (Batch 8 Fix #5)
// =============================================================================

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;          // Add randomness to delay
  jitterFactor?: number;     // 0-1, how much randomness
  exponentialBackoff?: boolean;
  retryOn?: (error: Error) => boolean;  // Custom retry condition
}

/**
 * Add jitter to a delay value
 * @param delayMs Base delay
 * @param factor Jitter factor 0-1
 */
function addJitter(delayMs: number, factor: number = 0.3): number {
  const jitterRange = delayMs * factor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;  // -jitterRange to +jitterRange
  return Math.max(0, Math.round(delayMs + jitter));
}

/**
 * Retry a function with exponential backoff and jitter
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    jitter = true,
    jitterFactor = 0.3,
    exponentialBackoff = true,
    retryOn = () => true,
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt >= maxAttempts) {
        break;
      }
      
      if (!retryOn(lastError)) {
        break;
      }
      
      // Calculate delay with exponential backoff
      let delayMs = exponentialBackoff
        ? baseDelayMs * Math.pow(2, attempt - 1)
        : baseDelayMs;
      
      // Cap at max delay
      delayMs = Math.min(delayMs, maxDelayMs);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delayMs = addJitter(delayMs, jitterFactor);
      }
      
      log.debug('Retrying after failure', {
        attempt,
        maxAttempts,
        delayMs,
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

// =============================================================================
// CACHE WITH FALLBACK (Batch 8 Fix #7)
// =============================================================================

export interface CacheOptions<T> {
  key: string;
  ttlSeconds: number;
  fallback: () => Promise<T>;   // Called when cache miss or error
  staleWhileRevalidate?: boolean;  // Return stale value while refreshing
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt?: number;  // When to start revalidating
}

// Simple in-memory cache for fallback
const localCache = new Map<string, CacheEntry<unknown>>();

/**
 * Get from cache with fallback to source
 */
export async function cacheWithFallback<T>(
  options: CacheOptions<T>,
  cacheGet: (key: string) => Promise<string | null>,
  cacheSet: (key: string, value: string, ttl: number) => Promise<void>
): Promise<T> {
  const { key, ttlSeconds, fallback, staleWhileRevalidate = false } = options;

  try {
    // Try to get from primary cache (e.g., Redis)
    const cached = await cacheGet(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (cacheError) {
    log.warn('Primary cache error, checking local fallback', { 
      key, 
      error: cacheError instanceof Error ? cacheError.message : 'Unknown'
    });
    
    // Try local fallback cache
    const local = localCache.get(key) as CacheEntry<T> | undefined;
    if (local && local.expiresAt > Date.now()) {
      return local.value;
    }
  }

  // Cache miss - fetch from source
  const value = await fallback();
  
  // Try to store in primary cache
  try {
    await cacheSet(key, JSON.stringify(value), ttlSeconds);
  } catch (cacheError) {
    log.warn('Failed to store in primary cache', { key });
  }
  
  // Also store in local fallback cache
  localCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  
  return value;
}

// =============================================================================
// DEGRADED SERVICE MODE (Batch 8 Fix #9)
// =============================================================================

export interface ServiceStatus {
  name: string;
  healthy: boolean;
  degraded: boolean;
  lastCheck: number;
  error?: string;
}

class DegradedServiceManager {
  private services = new Map<string, ServiceStatus>();
  private degradedFeatures = new Set<string>();

  registerService(name: string): void {
    this.services.set(name, {
      name,
      healthy: true,
      degraded: false,
      lastCheck: Date.now(),
    });
  }

  markHealthy(name: string): void {
    const service = this.services.get(name);
    if (service) {
      service.healthy = true;
      service.degraded = false;
      service.lastCheck = Date.now();
      service.error = undefined;
    }
  }

  markDegraded(name: string, error?: string): void {
    const service = this.services.get(name);
    if (service) {
      service.healthy = true;  // Still running, just degraded
      service.degraded = true;
      service.lastCheck = Date.now();
      service.error = error;
      
      log.warn('Service marked degraded', { name, error });
    }
  }

  markUnhealthy(name: string, error?: string): void {
    const service = this.services.get(name);
    if (service) {
      service.healthy = false;
      service.degraded = false;
      service.lastCheck = Date.now();
      service.error = error;
      
      log.error('Service marked unhealthy', { name, error });
    }
  }

  isServiceHealthy(name: string): boolean {
    return this.services.get(name)?.healthy ?? false;
  }

  isServiceDegraded(name: string): boolean {
    return this.services.get(name)?.degraded ?? false;
  }

  /**
   * Mark a feature as degraded (reduced functionality)
   */
  enableDegradedFeature(feature: string): void {
    this.degradedFeatures.add(feature);
    log.info('Feature entering degraded mode', { feature });
  }

  disableDegradedFeature(feature: string): void {
    this.degradedFeatures.delete(feature);
    log.info('Feature exiting degraded mode', { feature });
  }

  isFeatureDegraded(feature: string): boolean {
    return this.degradedFeatures.has(feature);
  }

  getOverallStatus(): {
    healthy: boolean;
    degraded: boolean;
    services: ServiceStatus[];
    degradedFeatures: string[];
  } {
    const serviceList = Array.from(this.services.values());
    const anyUnhealthy = serviceList.some(s => !s.healthy);
    const anyDegraded = serviceList.some(s => s.degraded);

    return {
      healthy: !anyUnhealthy,
      degraded: anyDegraded || this.degradedFeatures.size > 0,
      services: serviceList,
      degradedFeatures: Array.from(this.degradedFeatures),
    };
  }
}

export const degradedService = new DegradedServiceManager();

// Register core services
degradedService.registerService('database');
degradedService.registerService('redis');
degradedService.registerService('solana');
degradedService.registerService('notification');

// =============================================================================
// TIMEOUT WRAPPER
// =============================================================================

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new TimeoutError(errorMessage)), timeoutMs)
    )
  ]);
}

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// =============================================================================
// BULKHEAD (Concurrency Limiter)
// =============================================================================

export class Bulkhead {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number, private maxQueue: number = 100) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error('Bulkhead queue full');
      }
      
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getStatus(): { running: number; queued: number } {
    return { running: this.running, queued: this.queue.length };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  CircuitBreaker,
  CircuitBreakerOpenError,
  retryWithBackoff,
  cacheWithFallback,
  degradedService,
  withTimeout,
  TimeoutError,
  Bulkhead,
};
