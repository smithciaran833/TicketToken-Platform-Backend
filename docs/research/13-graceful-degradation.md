# Graceful Degradation and Resilience Patterns: Standards Audit

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Audit checklist and best practices for resilient microservices

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - [Circuit Breaker Pattern](#11-circuit-breaker-pattern)
   - [Retry with Exponential Backoff](#12-retry-with-exponential-backoff)
   - [Timeout Configuration](#13-timeout-configuration)
   - [Bulkhead Pattern](#14-bulkhead-pattern)
   - [Fallback Strategies](#15-fallback-strategies)
   - [Graceful Shutdown](#16-graceful-shutdown)
   - [Load Shedding](#17-load-shedding)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklists](#3-audit-checklists)
   - [Fastify Server](#31-fastify-server)
   - [HTTP Clients](#32-http-clients)
   - [Stripe Integration](#33-stripe-integration)
   - [Solana RPC](#34-solana-rpc)
   - [Redis](#35-redis)
   - [PostgreSQL](#36-postgresql)
4. [Quick Reference: Timeout Values](#4-quick-reference-timeout-values)
5. [Sources & References](#5-sources--references)

---

## 1. Standards & Best Practices

### 1.1 Circuit Breaker Pattern

The circuit breaker pattern prevents cascading failures by detecting when a service is unhealthy and stopping requests to give it time to recover.

**Three States:**
| State | Behavior |
|-------|----------|
| **Closed** | Normal operation - requests flow through, failures are monitored |
| **Open** | Requests are blocked immediately (fail fast) - allows service recovery |
| **Half-Open** | Limited test requests allowed to probe if service has recovered |

**Key Configuration Parameters (Resilience4j):**

```yaml
resilience4j:
  circuitbreaker:
    instances:
      backendService:
        slidingWindowSize: 10              # Number of calls to track
        failureRateThreshold: 50           # % failures to open circuit
        slowCallRateThreshold: 50          # % slow calls to open circuit
        slowCallDurationThreshold: 2s      # What counts as "slow"
        waitDurationInOpenState: 30s       # Time before half-open
        permittedNumberOfCallsInHalfOpenState: 3  # Test calls in half-open
        minimumNumberOfCalls: 5            # Min calls before calculating rates
```

**Best Practices:**
- Use count-based sliding window for steady traffic, time-based for variable traffic
- Set `failureRateThreshold` between 40-60% depending on criticality
- `waitDurationInOpenState` should allow dependent service recovery (15-60 seconds typical)
- Always implement a fallback method for when circuit is open
- Monitor circuit breaker state transitions with metrics/alerts

> **Sources:**  
> - https://microservices.io/patterns/reliability/circuit-breaker.html  
> - https://resilience4j.readme.io/docs/circuitbreaker  
> - https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html

---

### 1.2 Retry with Exponential Backoff

Retries handle transient failures, but must be implemented carefully to avoid retry storms.

**Exponential Backoff Formula:**
```
wait_interval = min(base * 2^attempt, max_delay)
```

**With Jitter (Recommended):**
```javascript
// Full Jitter (AWS recommended)
const delay = Math.random() * Math.min(maxDelay, baseDelay * Math.pow(2, attempt));

// Equal Jitter
const temp = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
const delay = temp / 2 + Math.random() * (temp / 2);

// Decorrelated Jitter
delay = Math.min(maxDelay, Math.random() * (previousDelay * 3 - baseDelay) + baseDelay);
```

**Why Jitter is Critical:**
Without jitter, all clients retry at the same time creating synchronized "thundering herd" spikes that can overwhelm recovering services.

**Configuration Guidelines:**

| Parameter | Recommended Value | Notes |
|-----------|-------------------|-------|
| Base delay | 100-500ms | Initial wait time |
| Max delay | 10-30s | Cap exponential growth |
| Max retries | 3-5 | Prevent infinite loops |
| Jitter factor | 0.2-0.5 | Randomization range |

**What to Retry:**
- ✅ Network timeouts
- ✅ 5xx server errors
- ✅ 429 rate limit (honor Retry-After header)
- ❌ 4xx client errors (except 429)
- ❌ Validation failures
- ❌ Authentication errors

**Example Implementation (TypeScript):**
```typescript
interface RetryConfig {
  baseDelay: number;      // e.g., 1000ms
  maxDelay: number;       // e.g., 30000ms
  maxRetries: number;     // e.g., 5
  jitterFactor: number;   // e.g., 0.2
}

function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.maxDelay,
    config.baseDelay * Math.pow(2, attempt)
  );
  const jitterRange = exponentialDelay * config.jitterFactor;
  const jitter = Math.random() * jitterRange;
  return Math.floor(exponentialDelay + jitter);
}
```

> **Sources:**  
> - https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/  
> - https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/  
> - https://www.baeldung.com/resilience4j-backoff-jitter

---

### 1.3 Timeout Configuration

Timeouts prevent resource exhaustion from hanging requests. Configure multiple timeout types:

**Timeout Types:**

| Type | Purpose | Typical Value |
|------|---------|---------------|
| **Connection timeout** | Time to establish TCP connection | 3-10s |
| **Request/Read timeout** | Time waiting for response after connected | 5-30s |
| **Socket timeout** | Idle connection timeout | 30-60s |
| **Statement timeout** | Database query execution | 3-30s |

**Setting Timeout Values:**

1. **Measure baseline latency** - Use p99 latency as starting point
2. **Add buffer** - Typically 2-3x p99 for normal operations
3. **Consider downstream timeouts** - Caller timeout should be greater than callee's
4. **Different timeouts per operation** - Critical operations may need shorter timeouts

**Zalando's Formula:**
```
request_timeout = p99.9_latency  // For 0.1% false timeout rate
```

**Timeout Chain Rule:**
```
Service A timeout > Service B timeout > Service C timeout

// Example:
API Gateway: 30s → Backend Service: 15s → Database: 5s
```

**Anti-Pattern Warning:**
Never use the same timeout across all services in a call chain. This causes avalanche failures where deeper services are still retrying when callers have given up.

> **Sources:**  
> - https://engineering.zalando.com/posts/2023/07/all-you-need-to-know-about-timeouts.html  
> - https://medium.com/@FromConceptToCloud/dont-let-time-slip-away-mastering-timeouts-in-your-microservices-java-edition-c889e28ffcd2

---

### 1.4 Bulkhead Pattern

Isolates resources to prevent failures from cascading. Named after ship compartments that contain flooding.

**Implementation Types:**

| Type | Description | Use Case |
|------|-------------|----------|
| **Thread Pool Bulkhead** | Separate thread pools per service | CPU-bound operations |
| **Semaphore Bulkhead** | Limit concurrent calls | I/O-bound operations |
| **Connection Pool Bulkhead** | Separate connection pools | Database/cache calls |
| **Container Bulkhead** | Separate processes/containers | Service-level isolation |

**Configuration Example (Resilience4j):**
```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:
        maxConcurrentCalls: 10       # Max parallel calls
        maxWaitDuration: 10ms        # Wait time if at capacity
      ratingService:
        maxConcurrentCalls: 5
        maxWaitDuration: 0ms         # Fail fast
```

**Best Practices:**
- Isolate external API calls from internal operations
- Critical services should have larger bulkheads than non-critical
- Monitor bulkhead saturation with metrics
- Combine with circuit breaker for comprehensive protection
- Formula: `max_pool × num_services ≤ total_available_threads`

**When to Use:**
- ✅ Varying load patterns between services
- ✅ External API integrations
- ✅ Multi-tenant systems
- ✅ Previous cascading failure incidents
- ❌ Simple services with single dependencies

> **Sources:**  
> - https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead  
> - https://dzone.com/articles/resilient-microservices-pattern-bulkhead-pattern  
> - https://blog.vinsguru.com/bulkhead-pattern/

---

### 1.5 Fallback Strategies

Fallbacks provide alternative responses when primary operations fail, maintaining partial functionality.

**Fallback Types:**

| Strategy | Description | Example |
|----------|-------------|---------|
| **Cached response** | Return stale cached data | Show last known prices |
| **Default response** | Return safe default values | Empty array, default config |
| **Degraded service** | Call backup/simplified service | Generic recommendations |
| **Fail silent** | Return null, log error | Optional enhancement fails silently |
| **Fail fast** | Return error immediately | Critical data unavailable |

**Implementation Pattern:**
```typescript
@CircuitBreaker(name = "recommendationService", fallbackMethod = "fallbackRecommendations")
async getRecommendations(userId: string): Promise<Product[]> {
  return await recommendationService.getPersonalized(userId);
}

// Fallback returns cached/default data
async fallbackRecommendations(userId: string, error: Error): Promise<Product[]> {
  logger.warn(`Recommendations failed for ${userId}: ${error.message}`);
  
  // Try cache first
  const cached = await cache.get(`recommendations:${userId}`);
  if (cached) return cached;
  
  // Fall back to popular items
  return await getPopularProducts();
}
```

**Best Practices:**
- Fallback methods should NOT throw exceptions
- Log when fallbacks are triggered (indicates service issues)
- Don't hide failures - monitor fallback rate
- Stale data warning: clearly indicate when returning cached data
- Chain fallbacks: cache → default → fail fast

**Real-World Examples:**
- Netflix: Shows generic recommendations when personalization service fails
- Spotify: Plays popular playlist when recommendation engine is down
- Amazon: Shows "out of stock" rather than failing entire page

> **Sources:**  
> - https://badia-kharroubi.gitbooks.io/microservices-architecture/content/patterns/communication-patterns/fallback-pattern.html  
> - https://medium.com/@AlexanderObregon/spring-microservices-resilience-with-retry-and-fallback-mechanisms-8500208fc463  
> - https://www.geeksforgeeks.org/system-design/microservices-resilience-patterns/

---

### 1.6 Graceful Shutdown

Graceful shutdown prevents data loss and connection errors during deployments and restarts.

**Kubernetes Pod Termination Sequence:**

1. Pod receives `SIGTERM` signal
2. Pod removed from Service endpoints (async - may take seconds)
3. `preStop` hook executes (if configured)
4. Application handles SIGTERM and starts shutdown
5. Wait for `terminationGracePeriodSeconds` (default 30s)
6. If still running, `SIGKILL` is sent

**Node.js/Fastify Implementation:**

```typescript
import closeWithGrace from 'close-with-grace';

// Configure graceful shutdown
const closeListeners = closeWithGrace(
  { delay: 10000 }, // 10 second grace period
  async ({ signal, err }) => {
    if (err) {
      fastify.log.error(err, 'Server closing due to error');
    }
    fastify.log.info(`Received ${signal}, starting graceful shutdown`);
    
    // Stop accepting new connections
    await fastify.close();
    
    // Close database connections
    await knex.destroy();
    
    // Close Redis connections
    await redis.quit();
    
    fastify.log.info('Graceful shutdown complete');
  }
);

// Uninstall listeners on close
fastify.addHook('onClose', async () => {
  closeListeners.uninstall();
});
```

**Kubernetes Configuration:**
```yaml
spec:
  terminationGracePeriodSeconds: 60  # Time for graceful shutdown
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]  # Allow LB to drain
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 8080
        periodSeconds: 5
        failureThreshold: 3
```

**Best Practices:**
- Handle both `SIGTERM` and `SIGINT`
- Stop accepting new connections immediately
- Wait for in-flight requests to complete
- Set `terminationGracePeriodSeconds` > expected request completion time
- Use `preStop` hook to delay shutdown (allows LB to stop routing)
- Close database/cache connections after requests drain
- Use `@godaddy/terminus` or `close-with-grace` packages

> **Sources:**  
> - https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/  
> - https://kubernetes.io/blog/2021/04/21/graceful-node-shutdown-beta/  
> - https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace  
> - https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html

---

### 1.7 Load Shedding

Load shedding intentionally drops low-priority requests to maintain service for critical operations during overload.

**Netflix Priority System:**
| Priority | Score | Examples |
|----------|-------|----------|
| Critical | 0-20 | Playback, authentication |
| Important | 21-50 | Browse, search |
| Normal | 51-80 | Recommendations, ratings |
| Low | 81-100 | Logging, analytics, prefetch |

**Load Shedding Strategies:**

1. **Priority-based**: Shed lowest priority first, escalate as needed
2. **Rate-based**: Limit requests per client/tenant
3. **Resource-based**: Shed when CPU/memory exceeds threshold
4. **Adaptive**: Dynamically adjust based on current capacity

**Implementation Approach:**

```typescript
// Simplified priority-based load shedding
function shouldShedRequest(request: Request, systemLoad: number): boolean {
  const priority = calculateRequestPriority(request);
  
  // Cubic function: shed more aggressively as load increases
  const shedThreshold = Math.pow(1 - (systemLoad / 100), 3) * 100;
  
  return priority > shedThreshold;
}

// AWS/Stripe approach: Fleet-level load shedder
const CRITICAL_RESERVE = 0.2;  // 20% reserved for critical
const currentNonCriticalLoad = getNonCriticalLoad();
const maxNonCriticalLoad = 1 - CRITICAL_RESERVE;

if (currentNonCriticalLoad > maxNonCriticalLoad && !isCritical(request)) {
  return res.status(503).send('Service temporarily unavailable');
}
```

**Google SRE Guidelines:**
- Define clear request priorities before implementing
- Start shedding at ~80% capacity, not 100%
- Use 429 (rate limit) or 503 (overload) status codes
- Include `Retry-After` header when possible
- Monitor shed rate as key metric
- Test load shedding in pre-production with chaos engineering

**When to Implement:**
- High-traffic public APIs
- Services with mixed priority workloads
- Systems that have experienced cascading failures
- Multi-tenant platforms

> **Sources:**  
> - https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/  
> - https://blog.quastor.org/p/netflix-implements-load-shedding-1  
> - https://cloud.google.com/blog/products/gcp/using-load-shedding-to-survive-a-success-disaster-cre-life-lessons

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 No Timeouts on External Calls

**Problem:** HTTP clients without timeouts will wait indefinitely for responses, exhausting thread pools and causing cascading failures.

```typescript
// ❌ BAD: No timeout configured
const response = await fetch('https://api.external.com/data');

// ✅ GOOD: Explicit timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch('https://api.external.com/data', {
    signal: controller.signal
  });
} finally {
  clearTimeout(timeout);
}
```

**Impact:** A single slow dependency can bring down entire service.

---

### 2.2 Retry Storms

**Problem:** Aggressive retries without backoff/jitter create synchronized traffic spikes that overwhelm recovering services.

**Math:** With K services each retrying N times:
```
Total requests = Original × 2^(K-1)
Example: 100 requests × 2^4 = 1,600 requests hitting the deepest service
```

**Prevention:**
- Always use exponential backoff with jitter
- Limit total retries (3-5 max)
- Implement retry budgets (max 10-20% of requests can be retries)
- Honor `Retry-After` headers
- Use circuit breakers to stop retries when service is down

---

### 2.3 Missing Circuit Breakers

**Problem:** Without circuit breakers, failing services continue receiving requests, preventing recovery and wasting resources.

**Signs You Need Circuit Breakers:**
- Repeated timeout errors to same service
- Thread pool exhaustion
- Cascading latency increases
- External service failures affecting entire system

**Where to Add:**
- All external API calls
- Database connections (per-query or per-service)
- Cache operations
- Inter-service communication

---

### 2.4 Cascading Failures

**Problem:** Failure in one service propagates upstream, bringing down the entire system.

**Common Causes:**
- Circular dependencies in health checks
- Shared resource exhaustion
- Retry storms
- Missing bulkheads
- Timeout mismatches

**Prevention Checklist:**
- [ ] Circuit breakers on all external calls
- [ ] Bulkhead isolation for critical paths
- [ ] Async communication where possible
- [ ] Fail-fast with graceful degradation
- [ ] No circular dependencies
- [ ] Timeout values decrease downstream

---

### 2.5 No Fallback Behavior

**Problem:** When dependencies fail, entire features become unavailable instead of degrading gracefully.

```typescript
// ❌ BAD: No fallback
async getProductDetails(id: string) {
  const product = await productService.get(id);
  const reviews = await reviewService.get(id);  // Fails = entire request fails
  return { ...product, reviews };
}

// ✅ GOOD: With fallback
async getProductDetails(id: string) {
  const product = await productService.get(id);
  
  let reviews = [];
  try {
    reviews = await reviewService.get(id);
  } catch (error) {
    logger.warn(`Reviews unavailable for ${id}`, error);
    reviews = await cache.get(`reviews:${id}`) || [];  // Cached fallback
  }
  
  return { ...product, reviews, reviewsStale: reviews.length > 0 };
}
```

---

### 2.6 Ungraceful Shutdown Losing In-Flight Requests

**Problem:** Server stops immediately on SIGTERM, dropping active connections and causing client errors.

**Symptoms:**
- 502/504 errors during deployments
- Lost transactions
- Incomplete database operations
- WebSocket disconnections without cleanup

**Prevention:**
```typescript
// ❌ BAD: Immediate exit
process.on('SIGTERM', () => process.exit(0));

// ✅ GOOD: Wait for requests to drain
process.on('SIGTERM', async () => {
  isShuttingDown = true;
  
  // Stop health check (triggers LB to stop routing)
  // Wait for LB to drain (5-10 seconds)
  await sleep(5000);
  
  // Stop accepting new connections
  await server.close();
  
  // Wait for in-flight requests (with timeout)
  await Promise.race([
    waitForRequestsDrain(),
    sleep(25000)  // Force exit after 25s
  ]);
  
  // Close DB/cache connections
  await closeConnections();
  
  process.exit(0);
});
```

---

## 3. Audit Checklists

### 3.1 Fastify Server

#### Graceful Shutdown
- [ ] SIGTERM handler registered
- [ ] SIGINT handler registered (for local dev)
- [ ] `fastify.close()` called on shutdown signal
- [ ] Delay before close (allow LB drain): 5-10 seconds recommended
- [ ] In-flight requests complete before exit
- [ ] Database connections closed in `onClose` hook
- [ ] Redis connections closed in `onClose` hook
- [ ] Maximum shutdown time configured (terminationGracePeriodSeconds)

```typescript
// Verify these are configured:
import closeWithGrace from 'close-with-grace';

closeWithGrace({ delay: 10000 }, async ({ signal }) => {
  await fastify.close();
});
```

#### Health Checks
- [ ] Liveness endpoint exists (`/health/live`)
- [ ] Readiness endpoint exists (`/health/ready`)
- [ ] Readiness returns 503 during shutdown
- [ ] Health check timeouts configured in Kubernetes

#### Request Handling
- [ ] Request timeout configured: `connectionTimeout`, `keepAliveTimeout`
- [ ] Body size limits: `bodyLimit`
- [ ] Rate limiting plugin installed

**Recommended Fastify Configuration:**
```typescript
const fastify = Fastify({
  logger: true,
  connectionTimeout: 10000,       // 10 seconds
  keepAliveTimeout: 72000,        // 72 seconds (> ALB 60s)
  bodyLimit: 1048576,             // 1MB
  requestTimeout: 30000,          // 30 seconds
});
```

---

### 3.2 HTTP Clients

#### Timeout Configuration
- [ ] Connection timeout configured: 3-10 seconds
- [ ] Request/read timeout configured: 5-30 seconds
- [ ] Timeout values documented per service

```typescript
// Using undici (Node.js built-in)
import { request } from 'undici';

const response = await request(url, {
  headersTimeout: 5000,      // Time to receive headers
  bodyTimeout: 30000,        // Time to receive body
  connect: {
    timeout: 5000            // Connection timeout
  }
});

// Using axios
const client = axios.create({
  timeout: 10000,            // Total request timeout
  timeoutErrorMessage: 'Request timed out'
});
```

#### Retry Logic
- [ ] Retries implemented for transient errors
- [ ] Exponential backoff configured
- [ ] Jitter added to backoff
- [ ] Max retries limited (3-5)
- [ ] Idempotency keys for POST requests

```typescript
// Verify retry configuration
const retryConfig = {
  retries: 3,
  retryDelay: (retryCount) => {
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  },
  retryCondition: (error) => {
    return error.code === 'ECONNRESET' || 
           error.response?.status >= 500 ||
           error.response?.status === 429;
  }
};
```

#### Circuit Breaker
- [ ] Circuit breaker wraps external calls
- [ ] Failure threshold configured (40-60%)
- [ ] Recovery timeout configured (15-60s)
- [ ] Fallback method defined
- [ ] Circuit breaker metrics exposed

---

### 3.3 Stripe Integration

#### SDK Configuration
- [ ] API timeout configured

```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  timeout: 30000,              // 30 seconds
  maxNetworkRetries: 2,        // SDK handles retries
});
```

#### Idempotency
- [ ] Idempotency keys used for all POST requests
- [ ] Keys generated uniquely per logical operation
- [ ] Keys stored for retry scenarios

```typescript
// Correct idempotency key usage
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: 1000,
    currency: 'usd',
  },
  {
    idempotencyKey: `order-${orderId}-payment`,  // Tied to business operation
  }
);
```

#### Error Handling
- [ ] Network errors trigger retry with same idempotency key
- [ ] Card declines handled (do NOT retry)
- [ ] Rate limit errors handled (honor Retry-After)
- [ ] API errors logged with request ID

**Stripe Error Categories:**
| Error Type | Retry? | New Idempotency Key? |
|------------|--------|----------------------|
| Network/timeout | Yes | No (same key) |
| 500 server error | Yes | No (same key) |
| 429 rate limit | Yes (with delay) | No (same key) |
| Card declined | No | Yes (if retrying) |
| Invalid request | No | Yes (if fixing params) |

#### Circuit Breaker
- [ ] **DO NOT** include Stripe in health checks
- [ ] Circuit breaker configured for Stripe calls
- [ ] Fallback: queue for later processing or graceful error

> **Sources:**  
> - https://docs.stripe.com/error-low-level  
> - https://docs.stripe.com/api/idempotent_requests  
> - https://stripe.com/blog/idempotency

---

### 3.4 Solana RPC

#### Connection Configuration
- [ ] Multiple RPC endpoints configured (failover)
- [ ] Connection timeout: 5-10 seconds
- [ ] Request timeout varies by operation type

**Recommended Timeouts:**
| Operation | Timeout |
|-----------|---------|
| `getHealth` | 5s |
| `getBalance` | 10s |
| `getTransaction` | 15s |
| `sendTransaction` | 30s |
| `confirmTransaction` | 60s |

#### Retry Logic
- [ ] Custom retry logic implemented (don't rely on RPC defaults)
- [ ] `maxRetries: 0` for transactions (handle manually)
- [ ] Blockhash expiry checked before retry
- [ ] Never re-sign until blockhash confirmed expired

```typescript
const { blockhash, lastValidBlockHeight } = 
  await connection.getLatestBlockhash();

// Monitor blockhash validity
while (await connection.getBlockHeight() <= lastValidBlockHeight) {
  // Safe to retry with same signature
  await connection.sendRawTransaction(serializedTx, {
    skipPreflight: true,
    maxRetries: 0
  });
  await sleep(2000);
}
// Blockhash expired - must re-sign transaction
```

#### Rate Limiting
- [ ] Rate limits understood per endpoint
- [ ] 429 errors handled with exponential backoff
- [ ] Consider premium RPC provider for production

**Solana Public RPC Limits:**
| Network | Limit |
|---------|-------|
| Mainnet | 100 req/10s per IP |
| Devnet | 100 req/10s per IP |
| Testnet | 100 req/10s per IP |

#### Health Checks
- [ ] **DO NOT** include RPC health in liveness probe
- [ ] Readiness can check RPC if critical path
- [ ] Handle "behind" status gracefully

> **Sources:**  
> - https://solana.com/developers/guides/advanced/retry  
> - https://docs.solana.com/cluster/rpc-endpoints  
> - https://helius.dev/docs/sending-transactions/optimizing-transactions

---

### 3.5 Redis

#### Client Configuration (ioredis)
- [ ] Command timeout configured
- [ ] Connection timeout configured
- [ ] Retry strategy defined
- [ ] `maxRetriesPerRequest` set (not null in production)

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  
  // Timeouts
  connectTimeout: 10000,           // Initial connection: 10s
  commandTimeout: 5000,            // Per-command timeout: 5s
  
  // Retry configuration
  maxRetriesPerRequest: 3,         // Fail after 3 retries (default: 20)
  retryStrategy: (times) => {
    if (times > 10) return null;   // Stop retrying
    return Math.min(times * 100, 3000);  // Exponential backoff, max 3s
  },
  
  // Reconnection
  reconnectOnError: (err) => {
    return err.message.includes('READONLY');
  },
});
```

#### Error Handling
- [ ] Error event listener registered
- [ ] Connection failures don't crash app
- [ ] Fallback for cache misses during outage

```typescript
redis.on('error', (err) => {
  logger.error('Redis error', err);
  // Don't crash - degrade gracefully
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));
```

#### Graceful Shutdown
- [ ] `redis.quit()` called on shutdown (waits for pending commands)
- [ ] NOT `redis.disconnect()` (immediate, loses pending)

#### Health Checks
- [ ] PING used for health check
- [ ] Timeout on health check: 1-2 seconds
- [ ] Fallback behavior when Redis unavailable

> **Sources:**  
> - https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html  
> - https://github.com/redis/ioredis  
> - https://redis.io/docs/latest/develop/clients/nodejs/produsage/

---

### 3.6 PostgreSQL (via Knex.js)

#### Pool Configuration
- [ ] `pool.min` set to 0 (allows idle connection cleanup)
- [ ] `pool.max` appropriate for workload
- [ ] Pool size formula: `pool.max × instances ≤ max_connections`

```typescript
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 0,                        // Allow full cleanup
    max: 10,                       // Based on workload
    
    // Timeouts
    acquireTimeoutMillis: 30000,   // Wait for connection: 30s
    createTimeoutMillis: 10000,    // Create connection: 10s
    idleTimeoutMillis: 30000,      // Idle before release: 30s
    
    // Validation
    propagateCreateError: false,   // Don't crash on create failure
  },
  acquireConnectionTimeout: 30000,  // Knex-level timeout
});
```

#### Query Timeouts
- [ ] Statement timeout configured per-query or globally
- [ ] Long-running queries have appropriate limits

```typescript
// Per-query timeout
await knex.raw('SET statement_timeout = 5000');  // 5 seconds
await knex('large_table').select('*');

// Or use afterCreate hook for all connections
pool: {
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', (err) => {
      done(err, conn);
    });
  }
}
```

#### Transaction Handling
- [ ] Transactions have timeout limits
- [ ] All queries in transaction use `.transacting(trx)`
- [ ] Transaction released on error (rollback)

```typescript
// Correct transaction pattern
await knex.transaction(async (trx) => {
  await trx('users').insert({ name: 'test' });
  await trx('logs').insert({ action: 'user_created' });
  // Commits automatically, rolls back on error
});
```

#### Graceful Shutdown
- [ ] `knex.destroy()` called on shutdown
- [ ] Wait for active queries before destroy

```typescript
process.on('SIGTERM', async () => {
  try {
    await knex.destroy();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database', error);
  }
});
```

#### Error Handling
- [ ] Connection errors don't crash app
- [ ] "Pool full" errors monitored
- [ ] Query errors logged with context

> **Sources:**  
> - https://knexjs.org/guide/  
> - https://cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-timeout  
> - https://www.kmaschta.me/blog/2023/02/26/db-connections-pool-configuration

---

## 4. Quick Reference: Timeout Values

### Recommended Defaults

| Component | Timeout Type | Recommended Value |
|-----------|--------------|-------------------|
| **HTTP Client** | Connection | 5s |
| **HTTP Client** | Request/Read | 10-30s |
| **Stripe** | API timeout | 30s |
| **Stripe** | SDK retries | 2 |
| **Solana RPC** | Health check | 5s |
| **Solana RPC** | sendTransaction | 30s |
| **Solana RPC** | confirmTransaction | 60s |
| **Redis** | Connection | 10s |
| **Redis** | Command | 5s |
| **Redis** | Max retries | 3 |
| **PostgreSQL** | Connection acquire | 30s |
| **PostgreSQL** | Connection create | 10s |
| **PostgreSQL** | Statement | 30s |
| **PostgreSQL** | Idle | 30s |
| **Fastify** | Connection | 10s |
| **Fastify** | Keep-alive | 72s |
| **Fastify** | Request | 30s |
| **Kubernetes** | terminationGracePeriod | 60s |
| **Circuit Breaker** | Wait in open state | 30s |
| **Circuit Breaker** | Sliding window | 10 calls |
| **Retry** | Max attempts | 3-5 |
| **Retry** | Max delay | 30s |

### Timeout Chain Example

```
Client → API Gateway → Service A → Service B → Database

Client:         60s
API Gateway:    45s
Service A:      30s
Service B:      15s
Database:       5s
```

---

## 5. Sources & References

### Circuit Breaker Pattern
- https://microservices.io/patterns/reliability/circuit-breaker.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html
- https://resilience4j.readme.io/docs/circuitbreaker
- https://www.baeldung.com/cs/microservices-circuit-breaker-pattern

### Retry & Backoff
- https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- https://www.baeldung.com/resilience4j-backoff-jitter
- https://encore.dev/blog/retries

### Timeouts
- https://engineering.zalando.com/posts/2023/07/all-you-need-to-know-about-timeouts.html
- https://www.vinsguru.com/timeout-pattern/
- https://www.geeksforgeeks.org/timeout-strategies-in-microservices-architecture/

### Bulkhead Pattern
- https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
- https://dzone.com/articles/resilient-microservices-pattern-bulkhead-pattern
- https://blog.vinsguru.com/bulkhead-pattern/
- https://www.splunk.com/en_us/blog/learn/bulkhead-sidecar-design-patterns.html

### Fallback Strategies
- https://badia-kharroubi.gitbooks.io/microservices-architecture/content/patterns/communication-patterns/fallback-pattern.html
- https://www.geeksforgeeks.org/system-design/microservices-resilience-patterns/
- https://openliberty.io/guides/microprofile-fallback.html

### Graceful Shutdown
- https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
- https://kubernetes.io/blog/2021/04/21/graceful-node-shutdown-beta/
- https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace
- https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
- https://github.com/godaddy/terminus
- https://www.npmjs.com/package/fastify-graceful-shutdown

### Load Shedding
- https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/
- https://blog.quastor.org/p/netflix-implements-load-shedding-1
- https://cloud.google.com/blog/products/gcp/using-load-shedding-to-survive-a-success-disaster-cre-life-lessons

### Cascading Failures
- https://learn.microsoft.com/en-us/azure/architecture/antipatterns/retry-storm/
- https://isdown.app/blog/microservices-and-cascading-failures
- https://medium.com/agoda-engineering/how-agoda-solved-retry-storms-to-boost-system-reliability-9568320f2068

### Stripe
- https://docs.stripe.com/error-low-level
- https://docs.stripe.com/api/idempotent_requests
- https://stripe.com/blog/idempotency

### Solana RPC
- https://solana.com/developers/guides/advanced/retry
- https://docs.solana.com/cluster/rpc-endpoints
- https://helius.dev/docs/sending-transactions/optimizing-transactions
- https://drpc.org/blog/solana-rpc-optimization/

### Redis
- https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html
- https://github.com/redis/ioredis
- https://redis.io/docs/latest/develop/clients/nodejs/produsage/
- https://redis.io/docs/latest/develop/reference/clients/

### PostgreSQL / Knex
- https://knexjs.org/guide/
- https://cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-timeout
- https://cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-limit
- https://www.kmaschta.me/blog/2023/02/26/db-connections-pool-configuration

### Resilience Libraries
- https://resilience4j.readme.io/docs/getting-started
- https://docs.spring.io/spring-cloud-circuitbreaker/docs/current/reference/html/spring-cloud-circuitbreaker-resilience4j.html

---

## Audit Summary Checklist

### Pre-Production Checklist

#### Architecture
- [ ] Circuit breakers on all external service calls
- [ ] Bulkheads isolate critical from non-critical paths
- [ ] Fallbacks defined for all dependencies
- [ ] Timeout values decrease down the call chain
- [ ] No circular dependencies in health checks
- [ ] Load shedding strategy for high traffic scenarios

#### Fastify/HTTP Layer
- [ ] Graceful shutdown handles SIGTERM/SIGINT
- [ ] Health endpoints return 503 during shutdown
- [ ] Request timeouts configured
- [ ] Body size limits set
- [ ] Kubernetes terminationGracePeriod > shutdown time

#### Database (PostgreSQL/Knex)
- [ ] Pool min: 0, max: appropriate for load
- [ ] Connection acquire timeout: 30s
- [ ] Statement timeout: 30s
- [ ] `knex.destroy()` in shutdown handler
- [ ] Transaction timeout limits

#### Cache (Redis)
- [ ] Command timeout: 5s
- [ ] Connection timeout: 10s
- [ ] Max retries: 3
- [ ] `redis.quit()` in shutdown handler
- [ ] Error event handler prevents crashes

#### External APIs (Stripe/Solana)
- [ ] SDK timeouts configured
- [ ] Idempotency keys for mutations
- [ ] Retry logic with exponential backoff + jitter
- [ ] Rate limit handling (429 responses)
- [ ] NOT included in health checks

#### Observability
- [ ] Circuit breaker state metrics
- [ ] Retry rate metrics
- [ ] Timeout rate metrics
- [ ] Fallback invocation metrics
- [ ] Connection pool metrics

---

*Document generated: December 2025*