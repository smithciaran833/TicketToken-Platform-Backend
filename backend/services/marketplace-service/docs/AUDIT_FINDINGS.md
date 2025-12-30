# Marketplace-Service Audit Findings

**Generated:** 2025-12-29
**Audit Files Reviewed:** 16
**Total Findings:** 240 (168 FAIL, 72 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 38 | 6 | 44 |
| HIGH | 52 | 28 | 80 |
| MEDIUM | 45 | 24 | 69 |
| LOW | 33 | 14 | 47 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 8 | 12 | 20 |
| 02-input-validation.md | 8 | 10 | 18 |
| 03-error-handling.md | 6 | 6 | 12 |
| 04-logging-observability.md | 14 | 4 | 18 |
| 05-s2s-auth.md | 18 | 5 | 23 |
| 06-database-integrity.md | 2 | 5 | 7 |
| 07-idempotency.md | 14 | 4 | 18 |
| 08-rate-limiting.md | 12 | 4 | 16 |
| 09-multi-tenancy.md | 5 | 4 | 9 |
| 10-testing.md | 7 | 3 | 10 |
| 11-documentation.md | 2 | 3 | 5 |
| 12-health-checks.md | 2 | 5 | 7 |
| 13-graceful-degradation.md | 6 | 6 | 12 |
| 19-configuration-management.md | 2 | 4 | 6 |
| 20-deployment-cicd.md | 2 | 1 | 3 |
| 21-database-migrations.md | 2 | 4 | 6 |

---

## CRITICAL Findings (44)

### From 01-security.md

#### SEC-R1: Protected routes
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Route Layer Authentication
- **Evidence:** Cache endpoints unprotected
- **Impact:** Anyone can call /cache/stats and /cache/flush

#### SEC-R6: No hardcoded secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Route Layer Authentication
- **Evidence:** Fallback JWT secret in code
- **Impact:** Auth can be bypassed if JWT_SECRET env not set

#### SEC-DB1: TLS/SSL
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Database Security
- **Evidence:** No ssl config
- **Impact:** Database traffic unencrypted

### From 02-input-validation.md

#### RD1: All routes have schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definitions
- **Evidence:** disputes.routes.ts has NO validation
- **Impact:** Injection, abuse possible on dispute endpoints

#### SD10: Wallet address
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Schema Definitions
- **Evidence:** No Solana format check
- **Impact:** Invalid wallet addresses accepted

### From 03-error-handling.md

#### EH6: Error logging context
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Error Middleware
- **Evidence:** No request ID/user ID/path in logs
- **Impact:** Cannot trace errors to requests

#### EC8: Request ID property
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Error Classes
- **Evidence:** Not in AppError
- **Impact:** Cannot correlate errors

### From 04-logging-observability.md

#### LOG5: Request ID
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Logging Configuration
- **Evidence:** No request ID handling
- **Impact:** Cannot trace requests

#### MT1: Prometheus endpoint
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Metrics & Tracing
- **Evidence:** Not implemented
- **Impact:** No metrics for monitoring

#### MT7: Distributed tracing
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Metrics & Tracing
- **Evidence:** No OpenTelemetry
- **Impact:** Cannot trace across services

#### OB1: Request logging
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Observability Setup
- **Evidence:** `logger: false` in app.ts
- **Impact:** No request logging at all

### From 05-s2s-auth.md

#### CLI3: Circuit breaker
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Service Client Implementation
- **Evidence:** Not implemented
- **Impact:** Cascading failures possible

#### CLI6: Request ID propagation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Service Client Implementation
- **Evidence:** Not implemented
- **Impact:** Cannot trace across services

#### CLI8: Centralized HTTP client
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Service Client Implementation
- **Evidence:** Mixed fetch/axios
- **Impact:** Inconsistent error handling, timeouts

#### AUTH1: Validate internal requests
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Internal Auth Middleware
- **Evidence:** No middleware
- **Impact:** Any service can call any endpoint

#### AUTH2: Service identity validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Internal Auth Middleware
- **Evidence:** No JWT tokens
- **Impact:** Cannot verify caller identity

#### SEC1: mTLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 mTLS/API Key Security
- **Evidence:** Plain HTTP
- **Impact:** Traffic can be intercepted

### From 06-database-integrity.md

#### DB2: SSL/TLS
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.1 Database Configuration
- **Evidence:** rejectUnauthorized: false
- **Impact:** MITM attacks possible

#### TX5: Deadlock handling
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Transaction Handling
- **Evidence:** No retry logic
- **Impact:** Deadlocks cause failures

### From 07-idempotency.md

#### ID1: Middleware exists
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Idempotency Middleware
- **Evidence:** No idempotency.middleware.ts
- **Impact:** Duplicate purchases possible

#### ID2: Header parsed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Idempotency Middleware
- **Evidence:** Not implemented
- **Impact:** Cannot deduplicate requests

#### CTL5: Idempotency key validated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Controller Patterns
- **Evidence:** Type defined, not used
- **Impact:** Idempotency not enforced

#### WH3: Event ID stored with TTL
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.3 Webhook Idempotency
- **Evidence:** In-memory, lost on restart
- **Impact:** Webhooks reprocessed after restart

### From 08-rate-limiting.md

#### RL4: Uses env config
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Global Rate Limiting
- **Evidence:** Hardcoded values
- **Impact:** Cannot adjust limits without deploy

#### RL6: Redis store
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Global Rate Limiting
- **Evidence:** In-memory only
- **Impact:** Rate limits bypass across instances

#### RS1: Listing creation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Route-Specific Limits
- **Evidence:** Global only
- **Impact:** Listing spam possible

#### RS4: Webhooks higher
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Route-Specific Limits
- **Evidence:** Subject to global
- **Impact:** Webhooks may be rate limited

### From 09-multi-tenancy.md

#### TC4: Error handling
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.1 Tenant Context Middleware
- **Evidence:** Throws but caught and ignored
- **Impact:** Requests proceed without tenant context

#### MOD1: tenant_id in inserts
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Model Tenant Isolation
- **Evidence:** Relies on DB default
- **Impact:** Wrong tenant data possible

#### MOD5: Context in model
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Model Tenant Isolation
- **Evidence:** Global db import
- **Impact:** No tenant isolation in models

### From 12-health-checks.md

#### DEP6: External services
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Dependency Checks
- **Evidence:** None checked
- **Impact:** Unknown dependency failures

### From 13-graceful-degradation.md

#### CB1: Blockchain circuit breaker
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Circuit Breaker
- **Evidence:** Not implemented
- **Impact:** Blockchain failures cascade

#### FB3: Cache fallback
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Fallback Mechanisms
- **Evidence:** Not implemented
- **Impact:** DB failure = service failure

### From 19-configuration-management.md

#### VAL3: Range validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Configuration Validation
- **Evidence:** Not implemented
- **Impact:** Invalid config values accepted

### From 20-deployment-cicd.md

#### DOC8: .dockerignore
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Dockerfile Configuration
- **Evidence:** Missing
- **Impact:** Secrets may leak into image

### From 21-database-migrations.md

#### SAF6: Large table safe
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Migration Safety
- **Evidence:** No CONCURRENTLY on index creation
- **Impact:** Table locks during migration

---

## Architecture Issues Summary

### 1. No Service-to-Service Authentication (CRITICAL)

Services call each other without any authentication.

**Evidence:**
| Source | Target | Auth | Issue |
|--------|--------|------|-------|
| wallet.service.ts | blockchain-service | NONE | No auth |
| notification.service.ts | notification-service | NONE | No auth |
| ticket-lookup.service.ts | event-service | X-Internal-Request | Spoofable |
| fee-distribution.service.ts | payment-service | X-Internal-Request | Spoofable |

**Impact:** Any service (or attacker) can call any internal endpoint.

**Required:**
```typescript
// middleware/internal-auth.middleware.ts
export const validateInternalRequest = async (request, reply) => {
  const serviceToken = request.headers['x-service-token'];
  
  if (!serviceToken) {
    return reply.status(403).send({ error: 'Service token required' });
  }
  
  try {
    const decoded = jwt.verify(serviceToken, process.env.INTERNAL_JWT_SECRET);
    request.callingService = decoded.service;
  } catch (error) {
    return reply.status(403).send({ error: 'Invalid service token' });
  }
};

// When making calls
const serviceToken = jwt.sign(
  { service: 'marketplace-service' },
  process.env.INTERNAL_JWT_SECRET,
  { expiresIn: '5m' }
);

headers: {
  'X-Service-Token': serviceToken,
  'X-Request-ID': request.id,
}
```

### 2. No Idempotency for Financial Operations (CRITICAL)

Purchase and transfer operations can be duplicated.

**Evidence:** No idempotency.middleware.ts exists. POST /transfers/purchase and POST /transfers/direct have no idempotency protection.

**Impact:** Users can be charged multiple times for same purchase.

**Required:**
```typescript
// middleware/idempotency.middleware.ts
export const idempotencyMiddleware = async (request, reply) => {
  const key = request.headers['idempotency-key'];
  if (!key) return; // Optional for backwards compatibility
  
  const cacheKey = `idempotency:${request.user.id}:${key}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    reply.header('X-Idempotent-Replayed', 'true');
    return reply.send(JSON.parse(cached));
  }
  
  // Store in-progress marker
  await redis.setex(`${cacheKey}:lock`, 60, 'processing');
  
  const originalSend = reply.send.bind(reply);
  reply.send = async (data) => {
    if (reply.statusCode < 400) {
      await redis.setex(cacheKey, 86400, JSON.stringify(data));
    }
    await redis.del(`${cacheKey}:lock`);
    return originalSend(data);
  };
};

// Apply to financial routes
fastify.post('/transfers/purchase', {
  preHandler: [authMiddleware, idempotencyMiddleware]
}, controller.purchase);
```

### 3. Webhook Deduplication In-Memory (CRITICAL)

Webhook event IDs stored in memory, lost on restart.

**Evidence:** Uses in-memory Set instead of Redis.

**Impact:** Webhooks reprocessed after service restart = duplicate operations.

**Required:**
```typescript
// Instead of in-memory Set
const processedEvents = new Set(); // BAD

// Use Redis with TTL
async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const key = `webhook:processed:${eventId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

async function markWebhookProcessed(eventId: string): Promise<void> {
  const key = `webhook:processed:${eventId}`;
  await redis.setex(key, 86400 * 7, 'processed'); // 7 day TTL
}

// In webhook handler
if (await isWebhookProcessed(event.id)) {
  return reply.send({ received: true, duplicate: true });
}

// Process webhook...

await markWebhookProcessed(event.id);
```

### 4. Disputes Route Has Zero Validation (CRITICAL)

disputes.routes.ts has no input validation at all.

**Impact:** SQL injection, invalid data, abuse all possible.

**Required:**
```typescript
// schemas/dispute.schema.ts
import Joi from 'joi';

export const createDisputeSchema = Joi.object({
  transferId: Joi.string().uuid().required(),
  reason: Joi.string().max(1000).required(),
  category: Joi.string().valid('not_received', 'counterfeit', 'damaged', 'wrong_item').required(),
  evidence: Joi.array().items(
    Joi.object({
      type: Joi.string().valid('image', 'document', 'text').required(),
      url: Joi.string().uri().when('type', { is: Joi.valid('image', 'document'), then: Joi.required() }),
      content: Joi.string().max(5000).when('type', { is: 'text', then: Joi.required() })
    })
  ).max(10).optional()
}).unknown(false);

export const updateDisputeSchema = Joi.object({
  status: Joi.string().valid('pending', 'under_review', 'resolved_buyer', 'resolved_seller', 'closed').required(),
  resolution: Joi.string().max(2000).optional(),
  refundAmount: Joi.number().min(0).optional()
}).unknown(false);

// routes/disputes.routes.ts
fastify.post('/', {
  schema: { body: createDisputeSchema },
  preHandler: [authMiddleware]
}, controller.create);

fastify.put('/:id', {
  schema: { 
    body: updateDisputeSchema,
    params: Joi.object({ id: Joi.string().uuid().required() })
  },
  preHandler: [authMiddleware, requireAdmin]
}, controller.update);
```

### 5. In-Memory Rate Limiting (CRITICAL)

Rate limits stored in memory, not Redis.

**Impact:** Each instance has separate counters. Attacker can bypass by hitting different instances.

**Required:**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

await app.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  redis: redis,
  keyGenerator: (request) => {
    // User-based if authenticated, IP-based otherwise
    if (request.user?.id) {
      return `ratelimit:user:${request.user.id}`;
    }
    return `ratelimit:ip:${request.ip}`;
  },
  errorResponseBuilder: (request, context) => ({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retryAfter: Math.ceil(context.ttl / 1000)
    }
  })
});

// Route-specific limits
fastify.post('/transfers/purchase', {
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute' }
  }
}, controller.purchase);

// Exempt webhooks
fastify.post('/webhooks/stripe', {
  config: { rateLimit: false }
}, controller.handleStripeWebhook);
```

### 6. Tenant Context Silently Fails (CRITICAL)

Tenant context errors are caught and ignored, allowing requests to proceed.

**Required:**
```typescript
// middleware/tenant.middleware.ts
export const tenantMiddleware = async (request, reply) => {
  try {
    const tenantId = request.user?.tenant_id;
    
    if (!tenantId) {
      return reply.status(401).send({ 
        error: 'MISSING_TENANT',
        message: 'Tenant context required' 
      });
    }
    
    // Validate UUID format
    if (!uuidValidate(tenantId)) {
      return reply.status(401).send({ 
        error: 'INVALID_TENANT',
        message: 'Invalid tenant ID format' 
      });
    }
    
    // Set for RLS
    await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    
    request.tenantId = tenantId;
  } catch (error) {
    // DO NOT ignore - fail the request
    logger.error({ error }, 'Failed to establish tenant context');
    return reply.status(500).send({ 
      error: 'TENANT_CONTEXT_FAILED',
      message: 'Failed to establish tenant context' 
    });
  }
};
```

### 7. No Circuit Breakers (CRITICAL)

External service calls (blockchain, Stripe, other services) have no circuit breakers.

**Required:**
```typescript
import CircuitBreaker from 'opossum';

// Blockchain circuit breaker
const blockchainBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5
  }
);

blockchainBreaker.on('open', () => {
  logger.warn('Blockchain circuit breaker opened');
  metrics.circuitBreakerState.set({ service: 'blockchain' }, 1);
});

blockchainBreaker.on('halfOpen', () => {
  logger.info('Blockchain circuit breaker half-open');
});

blockchainBreaker.on('close', () => {
  logger.info('Blockchain circuit breaker closed');
  metrics.circuitBreakerState.set({ service: 'blockchain' }, 0);
});

// Usage
const result = await blockchainBreaker.fire(async () => {
  return blockchainService.syncOwnership(ticketId);
});

// Stripe circuit breaker
const stripeBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000
  }
);

// Fallback for non-critical operations
blockchainBreaker.fallback(() => {
  logger.warn('Using fallback for blockchain sync');
  return { synced: false, queued: true };
});
```

---

## Quick Fix Priority

### P0 - Do Today (Security Critical)

1. **Add S2S auth middleware** - ~2 hours
2. **Add idempotency middleware** - ~2 hours
3. **Move webhook dedup to Redis** - ~30 minutes
4. **Add dispute route validation** - ~1 hour
5. **Move rate limiting to Redis** - ~30 minutes
6. **Fix tenant context error handling** - ~30 minutes
7. **Remove hardcoded JWT secret** - ~15 minutes
8. **Add auth to cache endpoints** - ~15 minutes

### P1 - Do This Week

1. Add circuit breakers
2. Add Solana wallet validation
3. Enable request logging
4. Add request ID middleware
5. Add DB SSL verification
6. Add deadlock retry logic

### P2 - Do This Sprint

1. Add Prometheus metrics
2. Add OpenTelemetry tracing
3. Add comprehensive input validation
4. Write tests
5. Create OpenAPI spec
6. Add health check routes

---

## Quick Fix Code Snippets

### Add S2S Auth (P0)
```typescript
// middleware/internal-auth.middleware.ts
import jwt from 'jsonwebtoken';

const INTERNAL_SECRET = process.env.INTERNAL_JWT_SECRET;
if (!INTERNAL_SECRET) throw new Error('INTERNAL_JWT_SECRET required');

export const validateInternalRequest = async (request, reply) => {
  const serviceToken = request.headers['x-service-token'];
  
  if (!serviceToken) {
    return reply.status(403).send({ error: 'Service token required' });
  }
  
  try {
    const decoded = jwt.verify(serviceToken, INTERNAL_SECRET);
    request.callingService = decoded.service;
    request.internalRequest = true;
  } catch (error) {
    return reply.status(403).send({ error: 'Invalid service token' });
  }
};

// Generate token for outbound calls
export function getServiceToken(): string {
  return jwt.sign(
    { service: 'marketplace-service', iat: Math.floor(Date.now() / 1000) },
    INTERNAL_SECRET,
    { expiresIn: '5m' }
  );
}

// Centralized HTTP client
export const internalClient = axios.create({
  timeout: 5000,
});

internalClient.interceptors.request.use((config) => {
  config.headers['X-Service-Token'] = getServiceToken();
  config.headers['X-Request-ID'] = asyncLocalStorage.getStore()?.requestId || uuidv4();
  return config;
});
```

### Add Idempotency Middleware (P0)
```typescript
// middleware/idempotency.middleware.ts
import { getRedis } from '../config/redis';

export const idempotencyMiddleware = async (request, reply) => {
  const key = request.headers['idempotency-key'];
  if (!key) return;
  
  const redis = getRedis();
  const userId = request.user?.id || 'anonymous';
  const cacheKey = `idempotency:${userId}:${key}`;
  
  // Check for existing response
  const cached = await redis.get(cacheKey);
  if (cached) {
    reply.header('X-Idempotent-Replayed', 'true');
    const parsed = JSON.parse(cached);
    return reply.status(parsed.statusCode).send(parsed.body);
  }
  
  // Check for in-progress
  const lockKey = `${cacheKey}:lock`;
  const locked = await redis.set(lockKey, 'processing', 'EX', 60, 'NX');
  if (!locked) {
    return reply.status(409).send({ 
      error: 'REQUEST_IN_PROGRESS',
      message: 'Duplicate request is being processed' 
    });
  }
  
  // Capture response
  const originalSend = reply.send.bind(reply);
  reply.send = async (body) => {
    try {
      if (reply.statusCode < 500) {
        await redis.setex(cacheKey, 86400, JSON.stringify({
          statusCode: reply.statusCode,
          body
        }));
      }
    } finally {
      await redis.del(lockKey);
    }
    return originalSend(body);
  };
};
```

### Fix Webhook Dedup (P0)
```typescript
// services/webhook.service.ts
import { getRedis } from '../config/redis';

export async function processStripeWebhook(event: Stripe.Event, reply: FastifyReply) {
  const redis = getRedis();
  const eventKey = `webhook:stripe:${event.id}`;
  
  // Check if already processed
  const processed = await redis.get(eventKey);
  if (processed) {
    logger.info({ eventId: event.id }, 'Duplicate webhook, skipping');
    return reply.send({ received: true, duplicate: true });
  }
  
  // Mark as processing
  await redis.setex(eventKey, 86400 * 7, 'processing');
  
  try {
    // Process the event
    await handleWebhookEvent(event);
    
    // Mark as completed
    await redis.setex(eventKey, 86400 * 7, 'completed');
    
    return reply.send({ received: true });
  } catch (error) {
    // Mark as failed for retry
    await redis.setex(eventKey, 3600, 'failed');
    throw error;
  }
}
```

### Remove Hardcoded JWT Secret (P0)
```typescript
// middleware/auth.middleware.ts
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

// Verify with explicit algorithm
const decoded = jwt.verify(token, JWT_SECRET, { 
  algorithms: ['HS256'] 
});
```

### Add Cache Endpoint Auth (P0)
```typescript
// routes/index.ts
fastify.get('/cache/stats', { 
  preHandler: [authMiddleware, requireAdmin] 
}, async (request, reply) => {
  // ... existing handler
});

fastify.post('/cache/flush', { 
  preHandler: [authMiddleware, requireAdmin] 
}, async (request, reply) => {
  // ... existing handler
});
```

### Add Circuit Breaker (P1)
```typescript
// services/circuit-breaker.ts
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger';

const defaultOptions = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5
};

export function createBreaker(name: string, options = {}) {
  const breaker = new CircuitBreaker(
    async (fn: () => Promise<any>) => fn(),
    { ...defaultOptions, ...options }
  );
  
  breaker.on('open', () => logger.warn({ breaker: name }, 'Circuit opened'));
  breaker.on('halfOpen', () => logger.info({ breaker: name }, 'Circuit half-open'));
  breaker.on('close', () => logger.info({ breaker: name }, 'Circuit closed'));
  breaker.on('fallback', () => logger.info({ breaker: name }, 'Fallback executed'));
  
  return breaker;
}

export const blockchainBreaker = createBreaker('blockchain');
export const stripeBreaker = createBreaker('stripe', { timeout: 15000 });
export const notificationBreaker = createBreaker('notification', { timeout: 5000 });

// Usage
const result = await blockchainBreaker.fire(async () => {
  return blockchainService.syncOwnership(ticketId);
});
```
