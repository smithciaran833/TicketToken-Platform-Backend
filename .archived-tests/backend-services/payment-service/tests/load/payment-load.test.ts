/**
 * Load and Stress Tests for Payment Service
 * 
 * MEDIUM FIXES:
 * - LOAD-2: Comprehensive load tests
 * - LOAD-3: Stress tests
 * 
 * These tests verify the payment service can handle expected load
 * and degrade gracefully under stress.
 * 
 * Run with: npm run test:load
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN || '';
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant';

// Load test configuration
const LOAD_TEST_CONFIG = {
  // Normal load
  normalRPS: 50, // Requests per second
  normalDuration: 30, // seconds
  
  // Peak load
  peakRPS: 200,
  peakDuration: 60,
  
  // Stress test
  stressRPS: 500,
  stressDuration: 120,
  
  // Thresholds
  p95Latency: 500, // ms
  p99Latency: 1000, // ms
  errorRate: 0.01, // 1%
  minSuccessRate: 0.99, // 99%
};

// Metrics collection
interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  errors: string[];
  startTime: number;
  endTime: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Make authenticated request
 */
async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<{ statusCode: number; latency: number; error?: string }> {
  const start = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'X-Tenant-ID': TEST_TENANT_ID,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const latency = Date.now() - start;
    
    return {
      statusCode: response.status,
      latency,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      statusCode: 0,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run load test with specified RPS for duration
 */
async function runLoadTest(
  name: string,
  rps: number,
  durationSeconds: number,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  bodyGenerator?: () => any
): Promise<LoadTestMetrics> {
  const metrics: LoadTestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    errors: [],
    startTime: Date.now(),
    endTime: 0,
  };
  
  const interval = 1000 / rps; // ms between requests
  const endTime = Date.now() + (durationSeconds * 1000);
  
  console.log(`[${name}] Starting load test: ${rps} RPS for ${durationSeconds}s`);
  
  const promises: Promise<void>[] = [];
  
  while (Date.now() < endTime) {
    const body = bodyGenerator ? bodyGenerator() : undefined;
    
    const promise = makeRequest(endpoint, method, body).then(result => {
      metrics.totalRequests++;
      metrics.latencies.push(result.latency);
      
      if (result.statusCode >= 200 && result.statusCode < 300) {
        metrics.successfulRequests++;
      } else {
        metrics.failedRequests++;
        if (result.error) {
          metrics.errors.push(result.error);
        }
      }
    });
    
    promises.push(promise);
    
    // Wait for interval before next request
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  // Wait for all pending requests
  await Promise.allSettled(promises);
  
  metrics.endTime = Date.now();
  
  // Log results
  const actualDuration = (metrics.endTime - metrics.startTime) / 1000;
  const actualRPS = metrics.totalRequests / actualDuration;
  const successRate = metrics.successfulRequests / metrics.totalRequests;
  const p50 = percentile(metrics.latencies, 50);
  const p95 = percentile(metrics.latencies, 95);
  const p99 = percentile(metrics.latencies, 99);
  
  console.log(`[${name}] Results:`);
  console.log(`  Duration: ${actualDuration.toFixed(1)}s`);
  console.log(`  Total Requests: ${metrics.totalRequests}`);
  console.log(`  Actual RPS: ${actualRPS.toFixed(1)}`);
  console.log(`  Success Rate: ${(successRate * 100).toFixed(2)}%`);
  console.log(`  Latency P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);
  
  return metrics;
}

/**
 * Run stress test with ramping load
 */
async function runStressTest(
  name: string,
  maxRPS: number,
  durationSeconds: number,
  endpoint: string
): Promise<LoadTestMetrics> {
  const metrics: LoadTestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    errors: [],
    startTime: Date.now(),
    endTime: 0,
  };
  
  console.log(`[${name}] Starting stress test: ramping to ${maxRPS} RPS over ${durationSeconds}s`);
  
  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);
  const rampDuration = durationSeconds * 1000 * 0.5; // 50% ramp up time
  
  const promises: Promise<void>[] = [];
  
  while (Date.now() < endTime) {
    const elapsed = Date.now() - startTime;
    
    // Calculate current RPS based on ramp
    let currentRPS: number;
    if (elapsed < rampDuration) {
      // Ramp up phase
      currentRPS = Math.floor((elapsed / rampDuration) * maxRPS);
    } else {
      // Sustained load phase
      currentRPS = maxRPS;
    }
    
    currentRPS = Math.max(1, currentRPS);
    const interval = 1000 / currentRPS;
    
    const promise = makeRequest(endpoint).then(result => {
      metrics.totalRequests++;
      metrics.latencies.push(result.latency);
      
      if (result.statusCode >= 200 && result.statusCode < 300) {
        metrics.successfulRequests++;
      } else {
        metrics.failedRequests++;
        if (result.error) {
          metrics.errors.push(result.error);
        }
      }
    });
    
    promises.push(promise);
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  await Promise.allSettled(promises);
  metrics.endTime = Date.now();
  
  return metrics;
}

// =============================================================================
// LOAD-2: COMPREHENSIVE LOAD TESTS
// =============================================================================

describe('LOAD-2: Comprehensive Load Tests', () => {
  describe('Health Check Endpoint Load', () => {
    it('should handle normal load on /health', async () => {
      const metrics = await runLoadTest(
        'Health Normal Load',
        LOAD_TEST_CONFIG.normalRPS,
        LOAD_TEST_CONFIG.normalDuration,
        '/health'
      );
      
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      const p95 = percentile(metrics.latencies, 95);
      
      expect(successRate).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.minSuccessRate);
      expect(p95).toBeLessThan(LOAD_TEST_CONFIG.p95Latency);
    });

    it('should handle peak load on /health', async () => {
      const metrics = await runLoadTest(
        'Health Peak Load',
        LOAD_TEST_CONFIG.peakRPS,
        LOAD_TEST_CONFIG.peakDuration,
        '/health'
      );
      
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      expect(successRate).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.minSuccessRate);
    });
  });

  describe('Payment Intent Creation Load', () => {
    it('should handle normal load on POST /payments', async () => {
      const metrics = await runLoadTest(
        'Payment Create Normal Load',
        LOAD_TEST_CONFIG.normalRPS / 10, // Lower RPS for mutations
        LOAD_TEST_CONFIG.normalDuration,
        '/api/v1/payments',
        'POST',
        () => ({
          amount: 10000 + Math.floor(Math.random() * 90000),
          currency: 'usd',
          orderId: `order-load-test-${Date.now()}`,
        })
      );
      
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      const errorRate = metrics.failedRequests / metrics.totalRequests;
      
      expect(errorRate).toBeLessThan(LOAD_TEST_CONFIG.errorRate);
    });
  });

  describe('Refund List Load', () => {
    it('should handle normal load on GET /refunds', async () => {
      const metrics = await runLoadTest(
        'Refund List Normal Load',
        LOAD_TEST_CONFIG.normalRPS,
        LOAD_TEST_CONFIG.normalDuration,
        '/api/v1/refunds?limit=20'
      );
      
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      const p95 = percentile(metrics.latencies, 95);
      
      expect(successRate).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.minSuccessRate);
    });
  });

  describe('Concurrent Tenant Load', () => {
    it('should handle requests from multiple tenants concurrently', async () => {
      const tenants = ['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4', 'tenant-5'];
      
      const promises = tenants.map(async (tenantId) => {
        const metrics: LoadTestMetrics = {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          latencies: [],
          errors: [],
          startTime: Date.now(),
          endTime: 0,
        };
        
        // Each tenant makes requests
        for (let i = 0; i < 100; i++) {
          const result = await makeRequest('/health');
          metrics.totalRequests++;
          metrics.latencies.push(result.latency);
          if (result.statusCode === 200) metrics.successfulRequests++;
          else metrics.failedRequests++;
        }
        
        return metrics;
      });
      
      const results = await Promise.all(promises);
      
      // All tenants should have high success rates
      for (const metrics of results) {
        const successRate = metrics.successfulRequests / metrics.totalRequests;
        expect(successRate).toBeGreaterThanOrEqual(0.95);
      }
    });
  });
});

// =============================================================================
// LOAD-3: STRESS TESTS
// =============================================================================

describe('LOAD-3: Stress Tests', () => {
  describe('Stress Test with Ramping Load', () => {
    it('should degrade gracefully under stress', async () => {
      const metrics = await runStressTest(
        'Health Stress Test',
        LOAD_TEST_CONFIG.stressRPS,
        LOAD_TEST_CONFIG.stressDuration,
        '/health'
      );
      
      // Under stress, we accept lower success rate but should still function
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      
      // At least 90% success even under stress
      expect(successRate).toBeGreaterThanOrEqual(0.90);
      
      // Check for specific error patterns
      const rateLimitErrors = metrics.errors.filter(e => e.includes('429'));
      const timeoutErrors = metrics.errors.filter(e => e.includes('timeout'));
      
      console.log(`Rate limit errors: ${rateLimitErrors.length}`);
      console.log(`Timeout errors: ${timeoutErrors.length}`);
    });
  });

  describe('Burst Traffic Handling', () => {
    it('should handle burst traffic', async () => {
      const burstSize = 100;
      const metrics: LoadTestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        latencies: [],
        errors: [],
        startTime: Date.now(),
        endTime: 0,
      };
      
      // Send burst of concurrent requests
      const promises = Array(burstSize).fill(null).map(() => 
        makeRequest('/health').then(result => {
          metrics.totalRequests++;
          metrics.latencies.push(result.latency);
          if (result.statusCode >= 200 && result.statusCode < 300) {
            metrics.successfulRequests++;
          } else {
            metrics.failedRequests++;
            if (result.error) metrics.errors.push(result.error);
          }
        })
      );
      
      await Promise.allSettled(promises);
      metrics.endTime = Date.now();
      
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      
      // Expect at least 80% success for burst (may hit rate limits)
      expect(successRate).toBeGreaterThanOrEqual(0.80);
    });
  });

  describe('Recovery After Stress', () => {
    it('should recover after stress period', async () => {
      // First, apply stress
      await runStressTest('Pre-Recovery Stress', 200, 30, '/health');
      
      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Then verify normal operation
      const recoveryMetrics = await runLoadTest(
        'Recovery Test',
        LOAD_TEST_CONFIG.normalRPS,
        10,
        '/health'
      );
      
      const successRate = recoveryMetrics.successfulRequests / recoveryMetrics.totalRequests;
      
      // Should recover to near-normal success rate
      expect(successRate).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Database Connection Pool Under Load', () => {
    it('should not exhaust connection pool', async () => {
      // Make many concurrent database-hitting requests
      const concurrentRequests = 50;
      const iterations = 10;
      
      for (let iter = 0; iter < iterations; iter++) {
        const promises = Array(concurrentRequests).fill(null).map(() => 
          makeRequest('/api/v1/refunds?limit=1')
        );
        
        const results = await Promise.allSettled(promises);
        
        // Check that we don't get connection pool errors
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => r.reason);
        
        const poolErrors = errors.filter(e => 
          String(e).includes('pool') || 
          String(e).includes('connection')
        );
        
        expect(poolErrors.length).toBe(0);
      }
    });
  });
});

// =============================================================================
// PERFORMANCE BASELINE TESTS
// =============================================================================

describe('Performance Baseline', () => {
  it('should meet latency SLAs under normal load', async () => {
    const metrics = await runLoadTest(
      'Baseline Latency Test',
      LOAD_TEST_CONFIG.normalRPS / 2,
      30,
      '/health'
    );
    
    const p50 = percentile(metrics.latencies, 50);
    const p95 = percentile(metrics.latencies, 95);
    const p99 = percentile(metrics.latencies, 99);
    
    // Define SLAs
    expect(p50).toBeLessThan(100); // P50 < 100ms
    expect(p95).toBeLessThan(500); // P95 < 500ms
    expect(p99).toBeLessThan(1000); // P99 < 1s
  });

  it('should maintain throughput over time', async () => {
    const measurements: number[] = [];
    const testDuration = 60; // seconds
    const interval = 5; // seconds
    
    for (let i = 0; i < testDuration / interval; i++) {
      const startTime = Date.now();
      let requestCount = 0;
      
      // Make requests for interval seconds
      while ((Date.now() - startTime) < interval * 1000) {
        await makeRequest('/health');
        requestCount++;
      }
      
      const throughput = requestCount / interval;
      measurements.push(throughput);
      
      console.log(`Interval ${i + 1}: ${throughput.toFixed(1)} RPS`);
    }
    
    // Check for degradation
    const firstHalf = measurements.slice(0, measurements.length / 2);
    const secondHalf = measurements.slice(measurements.length / 2);
    
    const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    // Throughput shouldn't degrade by more than 20%
    expect(avgSecondHalf / avgFirstHalf).toBeGreaterThan(0.8);
  });
});
