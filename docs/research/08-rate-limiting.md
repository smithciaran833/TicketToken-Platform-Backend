# Rate Limiting Audit Guide

**TicketToken Security Audit Series**  
*Blockchain Ticketing Platform - Microservices Architecture*

---

## Section 1: Standards & Best Practices

### Rate Limiting Algorithms

**Token Bucket Algorithm**

The token bucket is one of the most widely used rate limiting algorithms, particularly favored by companies like Stripe for its flexibility with burst traffic.

**How it works:**
- A bucket holds tokens up to a maximum capacity
- Tokens are added at a fixed rate (e.g., 10 tokens per second)
- Each request consumes one token
- If no tokens available, request is rejected
- Allows temporary bursts up to bucket capacity

**Advantages:**
- Allows controlled bursting for real-world traffic patterns
- Memory efficient (only tracks token count and timestamp)
- Simple to implement and understand

**Disadvantages:**
- Doesn't guarantee a perfectly smooth request rate
- Bucket size must be tuned carefully

```typescript
// Token Bucket implementation pattern
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

function consumeToken(bucket: TokenBucket): boolean {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  
  // Refill tokens based on elapsed time
  bucket.tokens = Math.min(
    bucket.capacity,
    bucket.tokens + elapsed * bucket.refillRate
  );
  bucket.lastRefill = now;
  
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true; // Request allowed
  }
  return false; // Rate limited
}
```

*Source: Stripe Blog - Scaling your API with rate limiters (https://stripe.com/blog/rate-limiters)*

---

**Fixed Window Algorithm**

The fixed window counter divides time into fixed intervals and counts requests within each window.

**How it works:**
- Time divided into fixed windows (e.g., 1-minute intervals)
- Counter tracks requests in current window
- Counter resets when new window begins
- Requests rejected if counter exceeds limit

**Advantages:**
- Simple to implement and understand
- Low memory footprint
- Clear, predictable limits for users

**Disadvantages:**
- Boundary problem: 2x limit possible at window edges
- Example: 10 requests at 0:59, 10 more at 1:00 = 20 in 2 seconds

```typescript
// Fixed Window vulnerability example
// If limit is 10/minute:
// User sends 10 requests at 0:00:59 (allowed)
// User sends 10 requests at 0:01:00 (allowed - new window)
// Result: 20 requests in 2 seconds despite 10/minute limit
```

*Source: AlgoMaster - Rate Limiting Algorithms Explained with Code (https://blog.algomaster.io/p/rate-limiting-algorithms-explained-with-code)*

---

**Sliding Window Algorithm**

The sliding window combines fixed window efficiency with improved boundary handling.

**How it works:**
- Tracks request counts in current and previous windows
- Calculates weighted average based on current position in window
- Provides smooth limiting across window boundaries

**Formula:**
```
weighted_count = (previous_window_count × overlap_percentage) + current_window_count
```

**Advantages:**
- Smooths out bursts at window boundaries
- More accurate than fixed window
- Good balance of precision and performance

**Disadvantages:**
- Slightly more complex than fixed window
- Approximate (not perfectly accurate)

**Recommendation:** Kong and other API gateways recommend the sliding window approach for its balance of flexibility, performance, and accuracy.

*Source: Kong - How to Design a Scalable Rate Limiting Algorithm (https://konghq.com/blog/engineering/how-to-design-a-scalable-rate-limiting-algorithm)*

---

### Per-User vs Per-IP vs Per-API-Key Limits

**Per-IP Rate Limiting**

```typescript
// Key generation for IP-based limiting
keyGenerator: (request) => request.ip
```

**When to use:**
- Unauthenticated endpoints (login, registration, password reset)
- Public APIs without authentication
- DDoS protection at network edge

**Limitations:**
- Shared IPs (NAT, corporate networks) affect multiple users
- IPv6 makes IP tracking more complex
- Easily bypassed with proxies or VPNs

---

**Per-User Rate Limiting**

```typescript
// Key generation for user-based limiting
keyGenerator: (request) => request.userId || request.ip
```

**When to use:**
- Authenticated API endpoints
- Fair usage enforcement
- Subscription tier limits

**Advantages:**
- Accurate per-customer limiting
- Works regardless of IP changes
- Enables tiered pricing models

---

**Per-API-Key Rate Limiting**

```typescript
// Key generation for API key limiting
keyGenerator: (request) => request.headers['x-api-key']
```

**When to use:**
- Third-party API access
- B2B integrations
- Developer APIs with usage tiers

**Best Practice - Layered Approach:**
```typescript
// Combine multiple limiting strategies
await fastify.register(rateLimit, {
  global: true,
  keyGenerator: (request) => {
    // Priority: API key > User ID > IP
    return request.headers['x-api-key'] 
      || request.userId 
      || request.ip;
  }
});
```

*Source: Redis Glossary - Rate Limiting (https://redis.io/glossary/rate-limiting/)*

---

### Rate Limit Headers (IETF Draft Standard)

The IETF HTTPAPI working group has developed a draft standard for rate limit headers (draft-ietf-httpapi-ratelimit-headers). Modern implementations should follow this standard.

**Current Draft (Version 10) Headers:**

```http
RateLimit-Policy: quota;q=100;w=60
RateLimit: quota;r=45;t=30
```

**Legacy Headers (Still Widely Used):**

| Header | Purpose | Example |
|--------|---------|---------|
| `RateLimit-Limit` | Maximum requests allowed | `RateLimit-Limit: 100` |
| `RateLimit-Remaining` | Requests remaining in window | `RateLimit-Remaining: 45` |
| `RateLimit-Reset` | Seconds until window resets | `RateLimit-Reset: 30` |
| `Retry-After` | Seconds to wait before retrying | `Retry-After: 60` |

**Implementation Example:**

```typescript
// Fastify rate limit response headers
fastify.addHook('onSend', (request, reply, payload, done) => {
  if (request.rateLimit) {
    reply.header('RateLimit-Limit', request.rateLimit.max);
    reply.header('RateLimit-Remaining', request.rateLimit.remaining);
    reply.header('RateLimit-Reset', request.rateLimit.ttl);
  }
  done();
});

// On 429 response, include Retry-After
reply.code(429).header('Retry-After', ttlSeconds).send({
  error: 'Too Many Requests',
  message: 'Rate limit exceeded',
  retryAfter: ttlSeconds
});
```

**Key Requirements from RFC:**
- `RateLimit-Reset` SHOULD use delta-seconds (compatible with `Retry-After`)
- Headers MAY be returned in both successful and rate-limited responses
- When multiple windows apply, return the one with lowest remaining quota

*Source: IETF Draft - RateLimit header fields for HTTP (https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)*

---

### Distributed Rate Limiting with Redis

In distributed systems, rate limiting must be centralized to prevent bypass via different server instances.

**Why Redis?**
- Sub-millisecond latency for counter operations
- Atomic operations (INCR, SETNX) prevent race conditions
- Built-in TTL for automatic key expiration
- Horizontal scaling with Redis Cluster
- Lua scripting for complex atomic operations

**Race Condition Problem:**

```typescript
// VULNERABLE: Race condition in read-then-write
const count = await redis.get(key);
if (count < limit) {
  await redis.incr(key); // Another request may increment between read and write
  return true;
}
return false;
```

**Solution: Atomic Lua Script**

```lua
-- Atomic rate limiting with Lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call("INCR", key)
if current == 1 then
  redis.call("EXPIRE", key, window)
end

if current > limit then
  return 0  -- Rate limited
else
  return 1  -- Allowed
end
```

**Sliding Window with Redis Sorted Sets:**

```typescript
// Precise sliding window using sorted sets
async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart); // Remove old entries
  multi.zadd(key, now, `${now}-${Math.random()}`); // Add current request
  multi.zcard(key); // Count requests in window
  multi.expire(key, Math.ceil(windowMs / 1000)); // Set TTL
  
  const results = await multi.exec();
  const count = results[2][1] as number;
  
  return count <= limit;
}
```

**GitHub's Approach:**
- Sharded Redis with client-side sharding
- Single primary for writes, replicas for reads per shard
- Lua scripts for atomic operations
- Application manages TTL (not relying on Redis expiration for replicas)

*Source: GitHub Engineering - How we scaled the GitHub API with a sharded, replicated rate limiter in Redis (https://github.blog/2021-04-05-how-we-scaled-github-api-sharded-replicated-rate-limiter-redis/)*

---

### Different Limits for Different Operations

Not all API operations are equal. Stripe uses a tiered approach with four types of limiters.

**Stripe's Four-Layer Defense:**

1. **Request Rate Limiter**: N requests per second per user
2. **Concurrent Request Limiter**: Max simultaneous in-flight requests
3. **Fleet Usage Load Shedder**: Protects overall system capacity
4. **Worker Utilization Load Shedder**: Protects individual workers

**Operation-Based Limits:**

| Operation Type | Suggested Limit | Rationale |
|----------------|-----------------|-----------|
| Authentication (login) | 5/minute | Brute force protection |
| Password reset | 3/hour | Account takeover prevention |
| Payment creation | 100/minute | Business operations |
| Payment reads | 1000/minute | Less resource intensive |
| Search/Analytics | 20/minute | Expensive operations |
| File uploads | 20/minute | Bandwidth/storage |
| Webhooks inbound | 100/second | Burst protection |

**Stripe Specific Limits:**
- Default: 25 requests per second
- Payment Intents: 1000 updates per PaymentIntent per hour
- Files API: 20 read/write operations per second
- Meter events: 1000 calls per second

**Implementation Pattern:**

```typescript
// Different limits per route in Fastify
fastify.get('/api/search', {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute'
    }
  }
}, searchHandler);

fastify.post('/api/payments', {
  config: {
    rateLimit: {
      max: 100,
      timeWindow: '1 minute'
    }
  }
}, paymentHandler);

fastify.post('/auth/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  }
}, loginHandler);
```

*Source: Stripe Documentation - Rate limits (https://docs.stripe.com/rate-limits)*

---

### Graceful Degradation Under Load

Rate limiting is part of a broader resilience strategy that includes load shedding and circuit breakers.

**Load Shedding Strategies:**

1. **Priority-based shedding**: Critical operations proceed, non-critical rejected
2. **Random shedding**: Drop percentage of requests randomly
3. **LIFO shedding**: Newest requests dropped first
4. **Quota-based shedding**: Per-customer quotas enforced

**Circuit Breaker Pattern:**

```typescript
// Circuit breaker states
enum CircuitState {
  CLOSED,    // Normal operation
  OPEN,      // Failing, reject immediately
  HALF_OPEN  // Testing if service recovered
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private threshold = 5;
  private timeout = 30000;
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = CircuitState.OPEN;
      setTimeout(() => this.state = CircuitState.HALF_OPEN, this.timeout);
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }
}
```

**Response Strategies Under Load:**

| Scenario | Response | HTTP Code |
|----------|----------|-----------|
| Rate limit exceeded | Retry later | 429 |
| System overloaded | Service unavailable | 503 |
| Dependency down | Partial response | 200 (degraded) |
| Circuit open | Fast fail | 503 |

**Best Practices:**
- Always include `Retry-After` header with 429/503 responses
- Return cached/stale data when possible instead of errors
- Prioritize authenticated users over anonymous traffic
- Shed read operations before write operations
- Log all rate-limited requests for analysis

*Source: AWS Well-Architected - Implement graceful degradation (https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_graceful_degradation.html)*

---

## Section 2: Common Vulnerabilities & Mistakes

### No Rate Limiting on Authentication Endpoints

**The Vulnerability:**
Authentication endpoints without rate limiting are vulnerable to brute force attacks, credential stuffing, and account enumeration.

**OWASP API Security Top 10:**
This vulnerability maps to both API2:2023 (Broken Authentication) and API4:2023 (Unrestricted Resource Consumption).

**Endpoints That MUST Have Stricter Limits:**
- `/auth/login` - Brute force attacks
- `/auth/register` - Spam account creation
- `/auth/forgot-password` - Account enumeration, email bombing
- `/auth/reset-password` - Token brute forcing
- `/auth/verify-otp` - OTP bypass attempts
- `/auth/verify-email` - Token guessing

**Recommended Limits:**

```typescript
// Authentication endpoint rate limits
const authLimits = {
  login: { max: 5, timeWindow: '1 minute', blockDuration: '15 minutes' },
  register: { max: 3, timeWindow: '1 hour' },
  forgotPassword: { max: 3, timeWindow: '1 hour' },
  verifyOtp: { max: 5, timeWindow: '5 minutes' },
  passwordReset: { max: 3, timeWindow: '1 hour' }
};
```

**GraphQL Batching Bypass:**
Rate limiting per request can be bypassed with GraphQL query batching:

```graphql
# Single request, multiple login attempts
[
  {"query":"mutation{login(username:\"victim\",password:\"password1\"){token}}"},
  {"query":"mutation{login(username:\"victim\",password:\"password2\"){token}}"},
  {"query":"mutation{login(username:\"victim\",password:\"password3\"){token}}"}
]
```

**Fix:** Rate limit by operation count, not just HTTP requests.

*Source: OWASP - API2:2023 Broken Authentication (https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)*

---

### Bypassing Rate Limits with Header Manipulation

**The Vulnerability:**
Attackers can spoof IP addresses via `X-Forwarded-For` and similar headers to bypass IP-based rate limiting.

**Spoofable Headers:**
```http
X-Forwarded-For: 127.0.0.1
X-Originating-IP: 127.0.0.1
X-Remote-IP: 192.168.1.1
X-Remote-Addr: 10.0.0.1
X-Client-IP: 172.16.0.1
X-Host: different-host.com
X-Real-IP: 8.8.8.8
True-Client-IP: 1.2.3.4
```

**Attack Pattern:**
```bash
# First 5 requests with real IP - rate limited
curl https://api.example.com/login # 429 after 5 attempts

# Bypass by spoofing X-Forwarded-For
curl -H "X-Forwarded-For: 192.168.1.100" https://api.example.com/login # 200 OK
curl -H "X-Forwarded-For: 192.168.1.101" https://api.example.com/login # 200 OK
# Continue with unlimited attempts...
```

**The Root Cause:**
Most frameworks use the first value in `X-Forwarded-For` header, which is attacker-controlled.

**Secure Configuration:**

```typescript
// Fastify trustProxy configuration
const fastify = Fastify({
  trustProxy: true, // Only if behind a known proxy
  // Or specify trusted proxies explicitly:
  // trustProxy: ['127.0.0.1', '10.0.0.0/8']
});

// Custom key generator that doesn't trust X-Forwarded-For from unknown sources
keyGenerator: (request) => {
  // Prefer authenticated user ID
  if (request.userId) return `user:${request.userId}`;
  
  // For unauthenticated: use real connection IP, not forwarded
  // Your reverse proxy should set a trusted header
  return request.headers['x-real-client-ip'] || request.socket.remoteAddress;
}
```

**Defense Strategies:**
1. Configure trusted proxy list explicitly
2. Prefer user ID over IP for authenticated endpoints
3. Use the rightmost (last) IP in X-Forwarded-For chain
4. Have your reverse proxy overwrite (not append) client headers
5. Validate IP format before using

*Source: HackTricks - Rate Limit Bypass (https://book.hacktricks.xyz/pentesting-web/rate-limit-bypass)*

---

### In-Memory Rate Limiting in Distributed Systems

**The Vulnerability:**
Using in-memory rate limiting in a horizontally scaled environment allows bypasses.

**Vulnerable Pattern:**
```typescript
// VULNERABLE: In-memory storage
const requestCounts = new Map<string, number>();

app.use((req, res, next) => {
  const key = req.ip;
  const count = requestCounts.get(key) || 0;
  
  if (count >= 100) {
    return res.status(429).send('Rate limited');
  }
  
  requestCounts.set(key, count + 1);
  next();
});
```

**Why It Fails:**
- Each server instance has its own counter
- With 4 instances, effective limit is 4x
- Server restart resets all counters
- No consistency across deployments

**Correct Pattern with Redis:**

```typescript
// SECURE: Centralized Redis storage
import { Redis } from 'ioredis';
import rateLimit from '@fastify/rate-limit';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  enableOfflineQueue: false // Fail fast if Redis is down
});

await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis: redis, // Centralized storage
  skipOnError: true, // Fail open if Redis is down
  keyGenerator: (request) => request.userId || request.ip
});
```

**Fallback Strategy:**
```typescript
// Fail open: if Redis unavailable, allow requests but log
skipOnError: true,
onExceeding: (req, key) => {
  logger.warn(`Rate limit approaching for ${key}`);
},
onExceeded: (req, key) => {
  logger.error(`Rate limit exceeded for ${key}`);
  metrics.increment('rate_limit.exceeded', { key });
}
```

*Source: freeCodeCamp - Build Rate Limiting System Using Redis and Lua (https://www.freecodecamp.org/news/build-rate-limiting-system-using-redis-and-lua/)*

---

### Same Limits for Cheap vs Expensive Operations

**The Vulnerability:**
Applying uniform rate limits ignores resource consumption differences between endpoints.

**Problem Scenario:**
```typescript
// VULNERABLE: Same limit for all operations
await fastify.register(rateLimit, {
  global: true,
  max: 1000,
  timeWindow: '1 minute'
});

// These are NOT equal:
// GET /api/users/123 - Simple DB lookup (1ms)
// GET /api/reports/generate - Complex aggregation (5000ms)
// POST /api/search - Elasticsearch query (500ms)
```

**Attack Vector:**
An attacker can consume all system resources with expensive operations while staying under rate limits.

**Tiered Limit Strategy:**

```typescript
// Operation cost tiers
const rateLimitTiers = {
  // Lightweight reads
  cheap: { max: 1000, timeWindow: '1 minute' },
  
  // Standard operations
  standard: { max: 100, timeWindow: '1 minute' },
  
  // Expensive operations (reports, exports, search)
  expensive: { max: 10, timeWindow: '1 minute' },
  
  // Critical operations (payments, transfers)
  critical: { max: 50, timeWindow: '1 minute' }
};

// Apply per-route
fastify.get('/api/users/:id', {
  config: { rateLimit: rateLimitTiers.cheap }
}, getUserHandler);

fastify.post('/api/reports/generate', {
  config: { rateLimit: rateLimitTiers.expensive }
}, generateReportHandler);

fastify.post('/api/payments', {
  config: { rateLimit: rateLimitTiers.critical }
}, createPaymentHandler);
```

**Concurrent Request Limiting:**

Stripe uses concurrent request limiters specifically for expensive endpoints:

```typescript
// Limit concurrent in-flight requests
const concurrentLimit = {
  maxConcurrent: 20, // Only 20 simultaneous expensive operations
  queueTimeout: 30000 // Wait max 30s in queue
};
```

*Source: Stripe Blog - Scaling your API with rate limiters (https://stripe.com/blog/rate-limiters)*

---

### Missing Rate Limiting on Webhooks

**The Vulnerability:**
Inbound webhooks without rate limiting can be abused for DoS attacks or resource exhaustion.

**Attack Vectors:**
1. **Webhook storms**: Misconfigured sender floods your endpoint
2. **Malicious payloads**: Large payloads consume memory/bandwidth
3. **Replay attacks**: Legitimate webhooks replayed many times
4. **Fake webhooks**: Attacker sends fabricated webhook events

**Protection Strategy:**

```typescript
// Webhook endpoint with layered protection
fastify.post('/webhooks/stripe', {
  config: {
    rateLimit: {
      max: 100,      // Per IP/source
      timeWindow: '1 second'
    }
  },
  preHandler: [
    verifyWebhookSignature,  // Verify authenticity
    checkIdempotency,        // Prevent replays
    validatePayloadSize      // Limit body size
  ]
}, async (request, reply) => {
  // Queue for async processing, respond immediately
  await queue.add('webhook-processing', request.body);
  reply.code(200).send({ received: true });
});
```

**Outbound Webhook Rate Limiting:**

Don't overwhelm your downstream consumers:

```typescript
// Rate limit outbound webhooks per destination
const outboundLimiter = {
  perDestination: {
    max: 100,
    timeWindow: '1 second'
  },
  global: {
    max: 1000,
    timeWindow: '1 second'
  }
};
```

**Best Practices:**
- Verify signatures BEFORE rate limit check
- Use separate rate limits for each webhook source
- Implement payload size limits
- Queue webhooks for async processing
- Track and deduplicate by event ID

*Source: Svix - Webhook Rate Limit (https://www.svix.com/resources/glossary/webhook-rate-limit/)*

---

### Not Communicating Limits to Clients

**The Vulnerability:**
Clients without rate limit information can't implement proper backoff strategies, leading to repeated failures and poor user experience.

**What Clients Need:**
1. **Current quota status** in every response
2. **Clear error messages** when limited
3. **Retry timing** in 429 responses
4. **Documentation** of all limits

**Required Response Headers:**

```typescript
// Add to ALL API responses
reply.header('RateLimit-Limit', '100');
reply.header('RateLimit-Remaining', '45');
reply.header('RateLimit-Reset', '30');

// Add to 429 responses
reply.header('Retry-After', '30');
```

**Clear Error Response:**

```typescript
// POOR: Vague error
{ "error": "Too many requests" }

// GOOD: Actionable information
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Please retry after 30 seconds.",
  "code": "RATE_LIMITED",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetAt": "2024-01-15T10:30:00Z",
    "retryAfter": 30
  },
  "documentation": "https://docs.tickettoken.com/rate-limits"
}
```

**API Documentation Requirements:**
- Document all rate limits per endpoint
- Explain limit scopes (per-user, per-IP, per-key)
- Provide code examples for handling 429 responses
- Describe exponential backoff recommendations

*Source: IETF Draft - RateLimit Header Fields (https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers)*

---

## Section 3: Audit Checklist

### Fastify Rate Limit Configuration

| # | Check | Status |
|---|-------|--------|
| 1 | `@fastify/rate-limit` plugin is registered | ☐ |
| 2 | Redis storage configured (not in-memory) for production | ☐ |
| 3 | `trustProxy` configured correctly if behind load balancer | ☐ |
| 4 | Global rate limit is set as baseline | ☐ |
| 5 | Route-specific limits for sensitive endpoints | ☐ |
| 6 | `skipOnError: true` set to fail open if Redis unavailable | ☐ |
| 7 | `keyGenerator` uses user ID for authenticated routes | ☐ |
| 8 | `onExceeded` callback logs rate limit violations | ☐ |
| 9 | Error response includes actionable information | ☐ |
| 10 | `ban` option configured for repeat offenders | ☐ |

**Configuration Verification:**
```typescript
// Verify Fastify rate limit configuration
await fastify.register(rateLimit, {
  global: true,                    // [1] Applied globally
  max: 100,                        // Default limit
  timeWindow: '1 minute',
  redis: redisClient,              // [2] Redis storage
  keyGenerator: (req) => req.userId || req.ip, // [7] User-based
  skipOnError: true,               // [6] Fail open
  ban: 3,                          // [10] Ban after 3 violations
  onExceeded: (req, key) => {      // [8] Logging
    logger.warn({ key, path: req.url }, 'Rate limit exceeded');
  }
});
```

---

### Redis Rate Limiting Infrastructure

| # | Check | Status |
|---|-------|--------|
| 1 | Redis Cluster or Sentinel configured for high availability | ☐ |
| 2 | Connection pooling configured with appropriate limits | ☐ |
| 3 | Redis connection timeout set (prevent blocking) | ☐ |
| 4 | Atomic operations used (Lua scripts or MULTI/EXEC) | ☐ |
| 5 | Key namespacing prevents collisions (`rate-limit:user:123`) | ☐ |
| 6 | TTL set on all rate limit keys (prevents memory leaks) | ☐ |
| 7 | Redis memory limits configured | ☐ |
| 8 | Fallback behavior defined if Redis unavailable | ☐ |
| 9 | Redis latency monitored (p95, p99) | ☐ |
| 10 | Separate Redis instance for rate limiting (recommended) | ☐ |

**Redis Configuration Check:**
```bash
# Verify Redis configuration
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy  # Should be volatile-lru or similar
redis-cli INFO clients                  # Check connection count
redis-cli SLOWLOG GET 10               # Check for slow operations
```

---

### Authentication Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | `/auth/login` has strict rate limit (5-10/minute) | ☐ |
| 2 | `/auth/register` rate limited to prevent spam | ☐ |
| 3 | `/auth/forgot-password` rate limited (3/hour) | ☐ |
| 4 | `/auth/reset-password` rate limited | ☐ |
| 5 | `/auth/verify-otp` has very strict limits (5/5-minutes) | ☐ |
| 6 | Rate limiting applies by username/email, not just IP | ☐ |
| 7 | Failed attempts tracked separately from successful | ☐ |
| 8 | Account lockout after N failed attempts | ☐ |
| 9 | CAPTCHA triggers after N failed attempts | ☐ |
| 10 | GraphQL batching attacks prevented | ☐ |

**Code Search Pattern:**
```bash
# Find auth endpoints and verify rate limit configuration
grep -rn "auth" --include="*.ts" | grep -E "(post|put|patch)" 
grep -rn "rateLimit" --include="*.ts" | grep -E "(login|register|password)"
```

---

### Payment Endpoints (Stripe)

| # | Check | Status |
|---|-------|--------|
| 1 | Payment creation endpoint rate limited | ☐ |
| 2 | Limits respect Stripe's 25 req/sec default | ☐ |
| 3 | PaymentIntent updates limited (1000/hour per PI) | ☐ |
| 4 | Refund endpoints have appropriate limits | ☐ |
| 5 | Concurrent request limiting for expensive operations | ☐ |
| 6 | Webhook endpoint rate limited per source | ☐ |
| 7 | Stripe rate limit headers monitored | ☐ |
| 8 | Exponential backoff on 429 from Stripe | ☐ |
| 9 | `Stripe-Rate-Limited-Reason` header logged | ☐ |
| 10 | Test mode has same limits as production | ☐ |

**Stripe Integration Check:**
```typescript
// Verify Stripe error handling includes rate limit detection
if (error.type === 'StripeRateLimitError') {
  const retryAfter = error.headers?.['retry-after'];
  logger.warn({ retryAfter }, 'Stripe rate limit hit');
  await delay(retryAfter * 1000 || 5000);
  // Retry with exponential backoff
}
```

---

### API Endpoints by Type

**Read Operations (GET):**
| # | Check | Status |
|---|-------|--------|
| 1 | List endpoints have higher limits than writes | ☐ |
| 2 | Search endpoints have lower limits (expensive) | ☐ |
| 3 | Export/report endpoints have strict limits | ☐ |
| 4 | Pagination limits enforced (max items per page) | ☐ |
| 5 | Caching reduces load on rate-limited resources | ☐ |

**Write Operations (POST/PUT/PATCH/DELETE):**
| # | Check | Status |
|---|-------|--------|
| 1 | Create operations have moderate limits | ☐ |
| 2 | Bulk operations have stricter per-item limits | ☐ |
| 3 | Delete operations rate limited | ☐ |
| 4 | Resource-intensive writes have concurrent limits | ☐ |
| 5 | Idempotency keys required for payment writes | ☐ |

---

### Response Header Verification

| # | Check | Status |
|---|-------|--------|
| 1 | `RateLimit-Limit` header present on all responses | ☐ |
| 2 | `RateLimit-Remaining` header present on all responses | ☐ |
| 3 | `RateLimit-Reset` header present on all responses | ☐ |
| 4 | `Retry-After` header present on 429 responses | ☐ |
| 5 | 429 response body includes machine-readable error code | ☐ |
| 6 | 429 response body includes retry timing | ☐ |
| 7 | 429 response body includes documentation link | ☐ |
| 8 | 503 used (instead of 429) for system overload | ☐ |

**Header Verification Test:**
```bash
# Test rate limit headers are present
curl -v https://api.tickettoken.com/api/events 2>&1 | grep -i ratelimit

# Test 429 response format
for i in {1..100}; do
  curl -s -w "%{http_code}" https://api.tickettoken.com/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}' 
done
```

---

### Webhook Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | Inbound webhook endpoints have rate limits | ☐ |
| 2 | Rate limit checked AFTER signature verification | ☐ |
| 3 | Separate limits per webhook source (Stripe, Solana, etc.) | ☐ |
| 4 | Payload size limits enforced | ☐ |
| 5 | Async processing (queue) to meet response time requirements | ☐ |
| 6 | Idempotency prevents replay abuse | ☐ |
| 7 | Outbound webhooks rate limited per destination | ☐ |
| 8 | Circuit breaker on outbound webhook failures | ☐ |

---

### Header Manipulation Protection

| # | Check | Status |
|---|-------|--------|
| 1 | `X-Forwarded-For` not blindly trusted | ☐ |
| 2 | Trusted proxy list explicitly configured | ☐ |
| 3 | Rate limiting prefers user ID over IP when authenticated | ☐ |
| 4 | Rightmost IP used from forwarded header chain | ☐ |
| 5 | IP validation before use in rate limiting | ☐ |
| 6 | Test: spoofed `X-Forwarded-For` doesn't bypass limits | ☐ |
| 7 | Test: multiple `X-Forwarded-For` headers handled correctly | ☐ |

**Bypass Test:**
```bash
# Test X-Forwarded-For bypass (should still be rate limited)
for i in {1..10}; do
  curl -H "X-Forwarded-For: 192.168.1.$i" \
    https://api.tickettoken.com/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Should see 429 after normal limit, not 10 successful requests
```

---

## Priority Matrix for TicketToken

### P0 - Critical (Implement Immediately)

1. **Redis-based distributed rate limiting** for all production services
2. **Strict limits on authentication endpoints** (login, password reset, OTP)
3. **Payment endpoint protection** matching Stripe's recommended limits
4. **X-Forwarded-For spoofing prevention** via trusted proxy configuration
5. **Rate limit headers on all API responses** (RateLimit-Limit, Remaining, Reset)

### P1 - High (Implement Within Sprint)

1. **Tiered limits by operation cost** (cheap reads vs expensive operations)
2. **Webhook endpoint rate limiting** with signature verification first
3. **Concurrent request limiting** for expensive endpoints
4. **Proper 429 error responses** with Retry-After and documentation
5. **Rate limit monitoring and alerting** dashboards

### P2 - Medium (Implement Within Quarter)

1. **Circuit breaker integration** for graceful degradation
2. **Load shedding strategy** for traffic spikes
3. **Per-user fair usage quotas** for subscription tiers
4. **GraphQL query cost analysis** to prevent batching attacks
5. **Exponential backoff** in client SDKs

### P3 - Low (Backlog)

1. **Dynamic rate limit adjustment** based on system load
2. **Machine learning anomaly detection** for abuse patterns
3. **Geographic rate limiting** for regional compliance
4. **Advanced analytics** on rate limit patterns
5. **Developer portal** with real-time quota visibility

---

## Sources

1. IETF Draft - RateLimit header fields for HTTP (draft-ietf-httpapi-ratelimit-headers-10)  
   https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/

2. Stripe Blog - Scaling your API with rate limiters  
   https://stripe.com/blog/rate-limiters

3. Stripe Documentation - Rate limits  
   https://docs.stripe.com/rate-limits

4. GitHub Engineering - How we scaled the GitHub API with a sharded, replicated rate limiter in Redis  
   https://github.blog/2021-04-05-how-we-scaled-github-api-sharded-replicated-rate-limiter-redis/

5. Fastify Rate Limit Plugin Documentation  
   https://github.com/fastify/fastify-rate-limit

6. Redis Glossary - Rate Limiting  
   https://redis.io/glossary/rate-limiting/

7. Redis Tutorial - How to build a Rate Limiter using Redis  
   https://redis.io/learn/howtos/ratelimiting

8. OWASP - API2:2023 Broken Authentication  
   https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/

9. OWASP - API4:2019 Lack of Resources and Rate Limiting  
   https://owasp.org/API-Security/editions/2019/en/0xa4-lack-of-resources-and-rate-limiting/

10. OWASP - Blocking Brute Force Attacks  
    https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks

11. OWASP Cheat Sheet - Authentication  
    https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

12. HackTricks - Rate Limit Bypass  
    https://book.hacktricks.xyz/pentesting-web/rate-limit-bypass

13. StackHawk - Beware of X-Forwarded-For Header  
    https://www.stackhawk.com/blog/do-you-trust-your-x-forwarded-for-header/

14. Kong - How to Design a Scalable Rate Limiting Algorithm  
    https://konghq.com/blog/engineering/how-to-design-a-scalable-rate-limiting-algorithm

15. freeCodeCamp - Build Rate Limiting System Using Redis and Lua  
    https://www.freecodecamp.org/news/build-rate-limiting-system-using-redis-and-lua/

16. AlgoMaster - Rate Limiting Algorithms Explained with Code  
    https://blog.algomaster.io/p/rate-limiting-algorithms-explained-with-code

17. AWS Well-Architected - Implement graceful degradation  
    https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_graceful_degradation.html

18. Svix - Webhook Rate Limit  
    https://www.svix.com/resources/glossary/webhook-rate-limit/

19. Hookdeck - How We Built a Rate Limiter for Outbound Webhooks  
    https://hookdeck.com/blog/how-we-built-a-rate-limiter-for-outbound-webhooks

20. Hello Interview - Design a Distributed Rate Limiter  
    https://www.hellointerview.com/learn/system-design/problem-breakdowns/distributed-rate-limiter