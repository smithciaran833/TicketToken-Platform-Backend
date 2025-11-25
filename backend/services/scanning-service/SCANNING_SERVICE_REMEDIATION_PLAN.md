# SCANNING SERVICE - PRODUCTION REMEDIATION PLAN

**Generated:** 2025-11-17  
**Based On:** SCANNING_SERVICE_AUDIT.md  
**Current Readiness:** 4/10 🔴  
**Target Readiness:** 9/10 ✅  
**Total Estimated Effort:** 252 hours (~31 working days)

---

## 🎯 REMEDIATION STRATEGY

This plan organizes all audit findings into **5 sequential phases** that systematically address critical blockers, security gaps, production readiness, performance, and enhancements. Each phase builds upon the previous phase and has clear success criteria.

### Phase Breakdown:

| Phase | Focus | Duration | Cost Estimate | Blocker? |
|-------|-------|----------|---------------|----------|
| **Phase 1** | Critical Security & Architecture | 86h (11 days) | $11,000-$18,500 | ✅ YES |
| **Phase 2** | Production Readiness | 21h (3 days) | $2,700-$4,500 | ✅ YES |
| **Phase 3** | Testing & Validation | 48h (6 days) | $6,200-$10,300 | 🟡 Important |
| **Phase 4** | Performance & Optimization | 35h (4 days) | $4,500-$7,500 | 🟡 Important |
| **Phase 5** | Advanced Features | 62h (8 days) | $8,000-$13,300 | ⚪ Enhancement |

**Total:** 252 hours / 32 working days / $32,400-$54,100

---

## 📋 PHASE 1: CRITICAL SECURITY & ARCHITECTURE (BLOCKERS)

**Objective:** Fix all critical security vulnerabilities and architectural issues that prevent the service from functioning correctly.

**Duration:** 86 hours (11 working days)  
**Status:** 🔴 MANDATORY - Cannot deploy without completing this phase  
**Cost:** $11,000-$18,500

### Tasks:

#### 1.1 Remove Default HMAC Secret (CRITICAL) 🔴
**Priority:** P0 - MUST FIX FIRST  
**Time:** 4 hours  
**Files:**
- `src/services/QRValidator.ts:42`
- `src/index.ts` (add startup validation)

**Changes Required:**
```typescript
// BEFORE (INSECURE):
this.hmacSecret = process.env.HMAC_SECRET || 'default-secret-change-in-production';

// AFTER (SECURE):
if (!process.env.HMAC_SECRET) {
  throw new Error('HMAC_SECRET environment variable is required');
}
this.hmacSecret = process.env.HMAC_SECRET;
```

**Additional Work:**
- Add startup validation that checks for all required secrets
- Update .env.example with security warnings
- Document secret rotation procedure
- Generate strong random secrets for all environments

**Success Criteria:**
- [ ] No default fallback secrets in code
- [ ] Service fails fast if HMAC_SECRET not set
- [ ] All secrets are 32+ character random strings
- [ ] Documentation updated

---

#### 1.2 Implement Authentication System (CRITICAL) 🔴
**Priority:** P0 - MUST FIX FIRST  
**Time:** 20 hours  
**Dependencies:** Auth-service integration

**Subtasks:**

**1.2.1 Create JWT Middleware (8h)**
**Files to Create:**
- `src/middleware/auth.middleware.ts`
- `src/middleware/role.middleware.ts`

**Implementation:**
```typescript
// src/middleware/auth.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  venueId?: string;
  permissions: string[];
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ error: 'No authorization token' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    
    // Attach user context to request
    request.user = payload;
    
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}
```

**1.2.2 Apply Auth to All Endpoints (4h)**
**Files to Modify:**
- `src/index.ts` - Register auth middleware globally
- `src/routes/scan.ts`
- `src/routes/qr.ts`
- `src/routes/devices.ts`
- `src/routes/offline.ts`
- `src/routes/policies.ts`

**Implementation Pattern:**
```typescript
// Before
app.post('/api/scan', scanHandler);

// After
app.post('/api/scan', {
  preHandler: [authenticateRequest, requireRole('VENUE_STAFF', 'ADMIN')]
}, scanHandler);
```

**1.2.3 Configure Auth Service Integration (4h)**
- Set up service-to-service communication
- Configure API Gateway integration
- Add JWT secret management
- Test token validation

**1.2.4 Add Role-Based Access Control (4h)**
**Roles Required:**
- `VENUE_STAFF` - Can scan tickets for their venue
- `VENUE_MANAGER` - Can manage devices and policies for their venue
- `ADMIN` - Full access across all venues
- `SYSTEM` - Backend service-to-service calls

**Success Criteria:**
- [ ] All endpoints require authentication
- [ ] JWT tokens validated on every request
- [ ] Role-based permissions enforced
- [ ] Unauthorized requests return 401/403
- [ ] Auth middleware unit tests pass

---

#### 1.3 Implement Venue Staff Isolation (CRITICAL) 🔴
**Priority:** P0 - MUST FIX IMMEDIATELY AFTER AUTH  
**Time:** 12 hours  
**Dependencies:** Task 1.2 (Authentication)

**Files to Modify:**
- `src/services/QRValidator.ts:147-353` (validateScan method)
- `src/routes/scan.ts`
- `src/routes/devices.ts`
- `src/routes/policies.ts`

**Changes Required:**

**1.3.1 Add Venue Validation to Scan (6h)**
```typescript
// src/services/QRValidator.ts - validateScan method
async validateScan(qrData: string, eventId: string, deviceId: string, staffContext: StaffContext) {
  // ... existing QR validation ...
  
  // NEW: Validate staff has access to this venue
  const ticket = await this.getTicket(ticketId);
  const event = await this.getEvent(eventId);
  
  // CRITICAL: Verify staff can scan for this venue
  if (staffContext.role !== 'ADMIN') {
    if (event.venue_id !== staffContext.venueId) {
      return {
        allowed: false,
        reason: 'UNAUTHORIZED_VENUE',
        message: 'You are not authorized to scan tickets for this venue'
      };
    }
  }
  
  // ... rest of validation logic ...
}
```

**1.3.2 Add Venue Filter to Device Queries (3h)**
```typescript
// Ensure staff can only see devices for their venue
const devices = await pool.query(
  `SELECT * FROM scanner_devices 
   WHERE venue_id = $1 AND is_active = true`,
  [request.user.venueId]
);
```

**1.3.3 Add Venue Filter to Policy Queries (3h)**
```typescript
// Ensure staff can only modify policies for their venue
const policies = await pool.query(
  `SELECT * FROM scan_policies 
   WHERE venue_id = $1 AND event_id = $2`,
  [request.user.venueId, eventId]
);
```

**Success Criteria:**
- [ ] Staff can only scan tickets for their assigned venue
- [ ] Cross-venue scan attempts are denied
- [ ] Clear error messages for unauthorized attempts
- [ ] Audit log records unauthorized attempts
- [ ] Admin users can access all venues
- [ ] Integration tests verify isolation

---

#### 1.4 Resolve Cross-Service Data Architecture (CRITICAL) 🔴
**Priority:** P0 - ARCHITECTURAL DECISION REQUIRED  
**Time:** 40 hours  
**Dependencies:** Architecture team decision

**Problem:** Service queries `tickets` and `events` tables directly, but these exist in separate services.

**Files Affected:**
- `src/services/QRValidator.ts:176-183`
- `src/services/QRGenerator.ts:44-52`
- `src/routes/policies.ts:70-77`
- `src/routes/offline.ts:67-76`

**Solution Options:**

**OPTION A: API-Based Integration (RECOMMENDED)** ⭐
**Time:** 40 hours  
**Pros:** Maintains microservice boundaries, better separation  
**Cons:** Adds network latency

**Implementation Steps:**

**1.4.1 Create Ticket Service Client (12h)**
**Files to Create:**
- `src/clients/ticket-service.client.ts`
- `src/clients/event-service.client.ts`

```typescript
// src/clients/ticket-service.client.ts
import axios, { AxiosInstance } from 'axios';

export class TicketServiceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.TICKET_SERVICE_URL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'scanning-service'
      }
    });
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    const response = await this.client.get(`/api/tickets/${ticketId}`);
    return response.data;
  }

  async validateTicket(ticketId: string, eventId: string): Promise<ValidationResult> {
    const response = await this.client.post('/api/tickets/validate', {
      ticketId,
      eventId
    });
    return response.data;
  }
}
```

**1.4.2 Create Event Service Client (8h)**
```typescript
// src/clients/event-service.client.ts
export class EventServiceClient {
  async getEvent(eventId: string): Promise<Event> {
    // Implementation
  }

  async getEventPolicies(eventId: string): Promise<Policy[]> {
    // Implementation
  }
}
```

**1.4.3 Update QRValidator to Use Clients (12h)**
- Replace direct database queries with API calls
- Add caching layer (Redis) to reduce API calls
- Implement circuit breaker for resilience
- Add fallback behavior for API failures

**1.4.4 Add Response Caching (8h)**
```typescript
// Cache ticket data to reduce API calls
const cacheKey = `ticket:${ticketId}`;
let ticket = await redis.get(cacheKey);

if (!ticket) {
  ticket = await ticketServiceClient.getTicket(ticketId);
  await redis.setex(cacheKey, 300, JSON.stringify(ticket)); // 5 min cache
}
```

**OPTION B: Data Replication**
**Time:** 24 hours + ongoing sync complexity  
**Pros:** Faster queries, no network dependencies  
**Cons:** Data consistency issues, complex sync logic

**NOT RECOMMENDED** due to complexity and potential data staleness.

**OPTION C: Shared Database**
**Time:** 0 hours (no code changes)  
**Pros:** Immediate solution  
**Cons:** Violates microservice principles, tight coupling

**NOT RECOMMENDED** - Goes against microservice architecture.

**Decision Required:**
- [ ] Architecture team approves Option A
- [ ] ticket-service exposes required endpoints
- [ ] event-service exposes required endpoints
- [ ] Service-to-service auth configured

**Success Criteria:**
- [ ] No direct database queries to other services' tables
- [ ] All data fetched via API calls
- [ ] Response caching implemented
- [ ] Circuit breaker prevents cascading failures
- [ ] Integration tests verify cross-service calls
- [ ] Documentation updated with architecture diagram

---

#### 1.5 Add tenant_id to All Tables (HIGH) 🔴
**Priority:** P1 - REQUIRED FOR MULTI-TENANT SYSTEM  
**Time:** 8 hours

**Files to Create:**
- `src/migrations/002_add_tenant_isolation.ts`

**Tables to Modify:**
1. `scanner_devices`
2. `devices`
3. `scans`
4. `scan_policy_templates`
5. `scan_policies`
6. `offline_validation_cache`

**Migration Script:**
```typescript
// src/migrations/002_add_tenant_isolation.ts
export async function up(knex: Knex): Promise<void> {
  // Add tenant_id to all tables
  await knex.schema.alterTable('scanner_devices', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index('tenant_id');
    // Add composite indexes for tenant isolation
    table.index(['tenant_id', 'venue_id']);
    table.index(['tenant_id', 'device_id']);
    table.index(['tenant_id', 'is_active']);
  });

  await knex.schema.alterTable('devices', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index(['tenant_id', 'device_id']);
  });

  await knex.schema.alterTable('scans', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index(['tenant_id', 'ticket_id']);
    table.index(['tenant_id', 'device_id']);
    table.index(['tenant_id', 'scanned_at']);
  });

  await knex.schema.alterTable('scan_policy_templates', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index('tenant_id');
  });

  await knex.schema.alterTable('scan_policies', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index(['tenant_id', 'event_id']);
    table.index(['tenant_id', 'venue_id']);
  });

  await knex.schema.alterTable('offline_validation_cache', (table) => {
    table.uuid('tenant_id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.index(['tenant_id', 'event_id']);
  });

  // Add Row Level Security (RLS) policies
  await knex.raw(`
    ALTER TABLE scanner_devices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON scanner_devices
      USING (tenant_id = current_setting('app.current_tenant')::uuid);
  `);

  // Repeat for other tables...
}

export async function down(knex: Knex): Promise<void> {
  // Remove tenant_id columns and policies
}
```

**Files to Modify:**
- All query files to include `tenant_id` in WHERE clauses
- `src/middleware/tenant.middleware.ts` (create) - Extract tenant_id from JWT

**Tenant Middleware:**
```typescript
// src/middleware/tenant.middleware.ts
export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const tenantId = request.user?.tenantId;
  
  if (!tenantId) {
    return reply.status(400).send({ error: 'Missing tenant context' });
  }

  // Set PostgreSQL session variable for RLS
  await pool.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant',
    tenantId
  ]);

  request.tenantId = tenantId;
}
```

**Success Criteria:**
- [ ] All tables have tenant_id column
- [ ] All queries filter by tenant_id
- [ ] Row Level Security policies active
- [ ] Indexes optimized for tenant queries
- [ ] Migration tested with rollback
- [ ] No cross-tenant data leakage

---

#### 1.6 Fix Timing Attack Vulnerability (HIGH) 🔴
**Priority:** P1 - SECURITY ISSUE  
**Time:** 2 hours  
**Files:** `src/services/QRValidator.ts:55-66`

**Problem:** HMAC comparison not constant-time, vulnerable to timing attacks.

**Fix:**
```typescript
// BEFORE (VULNERABLE):
if (calculatedHmac !== hmac) {
  return { valid: false, reason: 'Invalid HMAC signature' };
}

// AFTER (SECURE):
import crypto from 'crypto';

const calculatedHmacBuffer = Buffer.from(calculatedHmac, 'hex');
const hmacBuffer = Buffer.from(hmac, 'hex');

if (calculatedHmacBuffer.length !== hmacBuffer.length ||
    !crypto.timingSafeEqual(calculatedHmacBuffer, hmacBuffer)) {
  return { valid: false, reason: 'Invalid HMAC signature' };
}
```

**Success Criteria:**
- [ ] HMAC comparison uses crypto.timingSafeEqual()
- [ ] Buffer lengths validated before comparison
- [ ] Unit tests verify timing-safe comparison
- [ ] Security audit confirms fix

---

### Phase 1 Summary:

**Total Time:** 86 hours  
**Critical Path:** Tasks 1.1 → 1.2 → 1.3 → 1.4 (must be sequential)  
**Parallel Work Possible:** Tasks 1.5 and 1.6 can start after 1.2

**Deliverables:**
- ✅ No default secrets in code
- ✅ Complete authentication system
- ✅ Venue staff isolation enforced
- ✅ Cross-service architecture resolved
- ✅ Multi-tenant database isolation
- ✅ Timing attack vulnerability fixed

**Testing Requirements:**
- [ ] Unit tests for all new middleware
- [ ] Integration tests for auth flows
- [ ] Security penetration testing
- [ ] Cross-venue isolation tests
- [ ] Multi-tenant isolation tests

**Phase 1 Completion Criteria:**
✅ Service can authenticate users  
✅ Staff can only access their venue's data  
✅ No hardcoded secrets  
✅ Proper microservice architecture  
✅ Multi-tenant security enforced  
✅ Security vulnerabilities patched  

**Deployment Readiness After Phase 1:** 6/10 🟡 (Security fixed, but production readiness gaps remain)

---

## 📋 PHASE 2: PRODUCTION READINESS

**Objective:** Ensure service can run reliably in production with proper error handling, graceful shutdown, and configuration management.

**Duration:** 21 hours (3 working days)  
**Status:** 🔴 MANDATORY - Required before production deployment  
**Dependencies:** Phase 1 must be complete  
**Cost:** $2,700-$4,500

### Tasks:

#### 2.1 Implement Graceful Shutdown (HIGH) 🔴
**Priority:** P1 - PREVENTS FAILED REQUESTS  
**Time:** 2 hours  
**Files:** `src/index.ts`

**Problem:** Service exits immediately on SIGTERM, causing in-flight requests to fail during deployments.

**Implementation:**
```typescript
// src/index.ts
let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Received shutdown signal, starting graceful shutdown...');

  // Stop accepting new requests
  await app.close();
  logger.info('HTTP server closed');

  // Close database connections
  await pool.end();
  logger.info('Database connections closed');

  // Close Redis connections
  await redis.quit();
  logger.info('Redis connection closed');

  // Wait for in-flight requests (max 10s)
  await new Promise(resolve => setTimeout(resolve, 10000));

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check endpoint should return 503 during shutdown
app.get('/health', async (request, reply) => {
  if (isShuttingDown) {
    return reply.status(503).send({ status: 'shutting_down' });
  }
  return reply.status(200).send({ status: 'healthy' });
});
```

**Success Criteria:**
- [ ] SIGTERM handled gracefully
- [ ] In-flight requests complete before shutdown
- [ ] Connections closed in correct order
- [ ] Health check returns 503 during shutdown
- [ ] No error logs during normal shutdown
- [ ] Kubernetes readiness probe respects shutdown state

---

#### 2.2 Fix Port Configuration Mismatch (MEDIUM) 🟡
**Priority:** P2 - DEPLOYMENT WILL FAIL  
**Time:** 1 hour

**Problem:** Three different ports configured:
- `src/index.ts:73` = 3009
- `Dockerfile:56` = 3007
- `.env.example` = 3000

**Solution:** Standardize on single port using environment variable.

**Files to Modify:**
- `src/index.ts`
- `Dockerfile`
- `.env.example`
- `k8s/deployment.yaml` (if exists)
- `docker-compose.yml`

**Implementation:**
```typescript
// src/index.ts
const PORT = parseInt(process.env.PORT || '3009', 10);

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    logger.error(err);
    process.exit(1);
  }
  logger.info(`Scanning service listening on ${address}`);
});
```

```dockerfile
# Dockerfile
ENV PORT=3009
EXPOSE 3009
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3009/health || exit 1
```

```env
# .env.example
PORT=3009
```

**Success Criteria:**
- [ ] All files use same PORT environment variable
- [ ] Default port is 3009
- [ ] Health checks use correct port
- [ ] Documentation updated

---

#### 2.3 Add Environment Variable Validation (MEDIUM) 🟡
**Priority:** P2 - PREVENTS RUNTIME FAILURES  
**Time:** 2 hours  
**Files:** `src/config/env.validator.ts` (create), `src/index.ts`

**Required Environment Variables:**
```typescript
// src/config/env.validator.ts
import * as Joi from 'joi';

const envSchema = Joi.object({
  // Service Config
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),
  PORT: Joi.number().default(3009),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),

  // Security
  HMAC_SECRET: Joi.string().min(32).required(),
  JWT_SECRET: Joi.string().min(32).required(),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_POOL_MAX: Joi.number().default(20),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // Service URLs
  TICKET_SERVICE_URL: Joi.string().uri().required(),
  EVENT_SERVICE_URL: Joi.string().uri().required(),
  AUTH_SERVICE_URL: Joi.string().uri().required(),

  // Features
  DUPLICATE_SCAN_WINDOW_SECONDS: Joi.number().default(600),
  QR_EXPIRATION_SECONDS: Joi.number().default(30),
  OFFLINE_MANIFEST_VALIDITY_HOURS: Joi.number().default(4),
}).unknown(true);

export function validateEnv() {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false
  });

  if (error) {
    const errors = error.details.map(d => `  - ${d.message}`).join('\n');
    console.error('❌ Environment validation failed:\n' + errors);
    process.exit(1);
  }

  return value;
}
```

**Integration:**
```typescript
// src/index.ts
import { validateEnv } from './config/env.validator';

// Validate environment before anything else
const env = validateEnv();
logger.info('✅ Environment variables validated');
```

**Success Criteria:**
- [ ] All required variables validated on startup
- [ ] Service fails fast with clear error if missing
- [ ] Default values documented
- [ ] Validation covers all config sections

---

#### 2.4 Add Request Timeout Configuration (MEDIUM) 🟡
**Priority:** P2 - PREVENTS RESOURCE EXHAUSTION  
**Time:** 1 hour  
**Files:** `src/index.ts`

**Problem:** Long-running requests can pile up and exhaust memory.

**Implementation:**
```typescript
// src/index.ts
import Fastify from 'fastify';

const app = Fastify({
  logger: true,
  requestTimeout: 30000, // 30 seconds
  connectionTimeout: 10000, // 10 seconds
  keepAliveTimeout: 5000, // 5 seconds
});

// Add timeout middleware for scanning operations
app.addHook('preHandler', async (request, reply) => {
  const timeout = setTimeout(() => {
    reply.status(408).send({ error: 'Request timeout' });
  }, 30000);

  reply.raw.on('finish', () => clearTimeout(timeout));
});
```

**Success Criteria:**
- [ ] Request timeout configured
- [ ] Connection timeout configured
- [ ] Timeout errors logged
- [ ] Metrics track timeout occurrences

---

#### 2.5 Add Input Validation with Joi (MEDIUM) 🟡
**Priority:** P2 - SECURITY & STABILITY  
**Time:** 8 hours

**Problem:** Joi declared in package.json but never used. Manual validation is error-prone.

**Files to Create:**
- `src/validators/scan.validator.ts`
- `src/validators/device.validator.ts`
- `src/validators/policy.validator.ts`

**Implementation:**

**2.5.1 Scan Validation (3h)**
```typescript
// src/validators/scan.validator.ts
import * as Joi from 'joi';

export const scanRequestSchema = Joi.object({
  qrData: Joi.string()
    .regex(/^[a-f0-9]{8}:[0-9]{13}:[a-f0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid QR code format'
    }),
  eventId: Joi.string().uuid().required(),
  deviceId: Joi.string().uuid().required(),
  timestamp: Joi.number().integer().min(0).optional(),
  metadata: Joi.object().optional()
});

export const bulkScanRequestSchema = Joi.object({
  scans: Joi.array().items(scanRequestSchema).min(1).max(100).required()
});
```

**2.5.2 Device Validation (2h)**
```typescript
// src/validators/device.validator.ts
export const registerDeviceSchema = Joi.object({
  deviceId: Joi.string().uuid().required(),
  deviceName: Joi.string().min(1).max(100).required(),
  deviceType: Joi.string()
    .valid('MOBILE', 'TABLET', 'SCANNER_GUN', 'POS')
    .required(),
  venueId: Joi.string().uuid().required(),
  canScanOffline: Joi.boolean().default(false),
  zone: Joi.string().max(50).optional()
});
```

**2.5.3 Apply Validation Middleware (3h)**
```typescript
// src/middleware/validation.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { Schema } from 'joi';

export function validateRequest(schema: Schema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = await schema.validateAsync(request.body, {
        abortEarly: false,
        stripUnknown: true
      });
      request.body = validated;
    } catch (error) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: error.details
      });
    }
  };
}

// Usage in routes
app.post('/api/scan', {
  preHandler: [
    authenticateRequest,
    requireRole('VENUE_STAFF'),
    validateRequest(scanRequestSchema)
  ]
}, scanHandler);
```

**Success Criteria:**
- [ ] All endpoints have Joi validation
- [ ] Validation errors return 400 with details
- [ ] Invalid QR formats rejected
- [ ] UUID format enforced
- [ ] Array size limits enforced

---

#### 2.6 Improve Error Messages (Generic) (LOW) 🟡
**Priority:** P3 - SECURITY HARDENING  
**Time:** 2 hours

**Problem:** Error messages leak information that could help attackers enumerate valid tickets/devices.

**Examples:**
```typescript
// BEFORE (LEAKS INFO):
return { error: 'Ticket not found' };
return { error: 'Device not authorized' };
return { error: 'Invalid QR signature' };

// AFTER (GENERIC):
return { error: 'Scan failed', code: 'VALIDATION_ERROR' };
return { error: 'Scan failed', code: 'VALIDATION_ERROR' };
return { error: 'Scan failed', code: 'VALIDATION_ERROR' };
```

**Files to Modify:**
- All route handlers
- QRValidator.ts
- Error responses

**Implementation:**
```typescript
// src/utils/errors.ts
export enum ScanErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Log detailed error internally, return generic error to client
function handleScanError(error: ScanError, ticketId: string) {
  logger.warn('Scan validation failed', {
    ticketId,
    reason: error.reason,
    code: error.code
  });
  
  return {
    error: 'Scan failed',
    code: ScanErrorCode.VALIDATION_ERROR
  };
}
```

**Success Criteria:**
- [ ] Generic error messages for validation failures
- [ ] Detailed errors logged internally
- [ ] Security audit confirms no information leakage
- [ ] Error codes documented

---

#### 2.7 Add Rate Limiting to Missing Endpoints (MEDIUM) 🟡
**Priority:** P2 - DoS PREVENTION  
**Time:** 4 hours

**Problem:** Several endpoints lack rate limiting:
- `/api/qr/generate/:ticketId` - QR generation DoS vector
- `/api/devices/register` - Device registration spam
- All policy endpoints

**Files to Modify:**
- `src/routes/qr.ts`
- `src/routes/devices.ts`
- `src/routes/policies.ts`

**Implementation:**
```typescript
// src/routes/qr.ts
app.get('/api/qr/generate/:ticketId', {
  preHandler: [
    authenticateRequest,
    rateLimiter.createRateLimit({
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (req) => `qr-gen:${req.user.userId}:${req.params.ticketId}`
    })
  ]
}, generateQRHandler);

// src/routes/devices.ts
app.post('/api/devices/register', {
  preHandler: [
    authenticateRequest,
    rateLimiter.createRateLimit({
      max: 10,
      timeWindow: '1 hour',
      keyGenerator: (req) => `device-reg:${req.user.venueId}`
    })
  ]
}, registerDeviceHandler);
```

**Success Criteria:**
- [ ] All public endpoints have rate limiting
- [ ] Rate limits appropriate for use case
- [ ] Rate limit exceeded returns 429
- [ ] Metrics track rate limit hits

---

#### 2.8 Add Replay Attack Prevention (MEDIUM) 🟡
**Priority:** P2 - SECURITY ENHANCEMENT  
**Time:** 6 hours

**Problem:** Within the 30-second QR expiration window, the same QR can be used at multiple devices.

**Solution:** Add nonce to QR code format and track used nonces in Redis.

**Files to Modify:**
- `src/services/QRGenerator.ts`
- `src/services/QRValidator.ts`

**Implementation:**
```typescript
// src/services/QRGenerator.ts
async generateQR(ticketId: string): Promise<string> {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex'); // NEW
  const data = `${ticketId}:${timestamp}:${nonce}`;
  const hmac = this.generateHMAC(data);
  
  return `${data}:${hmac}`;
}

// src/services/QRValidator.ts
async validateQR(qrData: string): Promise<ValidationResult> {
  const [ticketId, timestamp, nonce, hmac] = qrData.split(':');
  
  // Validate HMAC (existing)
  // Validate timestamp (existing)
  
  // NEW: Check if nonce already used
  const nonceKey = `qr-nonce:${nonce}`;
  const alreadyUsed = await this.redis.get(nonceKey);
  
  if (alreadyUsed) {
    return {
      valid: false,
      reason: 'QR_ALREADY_USED'
    };
  }
  
  // Mark nonce as used (expire after QR expiration window + buffer)
  await this.redis.setex(nonceKey, 60, '1');
  
  return { valid: true };
}
```

**Success Criteria:**
- [ ] QR codes include unique nonce
- [ ] Nonces tracked in Redis
- [ ] Replay attempts within window are blocked
- [ ] Old nonces auto-expire
- [ ] Integration tests verify replay prevention

---

### Phase 2 Summary:

**Total Time:** 21 hours  
**Critical Path:** All tasks can be done in parallel  
**Dependencies:** Phase 1 must be complete

**Deliverables:**
- ✅ Graceful shutdown implemented
- ✅ Port configuration standardized
- ✅ Environment validation on startup
- ✅ Request timeouts configured
- ✅ All endpoints have Joi validation
- ✅ Generic error messages
- ✅ Rate limiting on all endpoints
- ✅ Replay attack prevention

**Testing Requirements:**
- [ ] Graceful shutdown tests (K8s simulations)
- [ ] Environment validation tests
- [ ] Input validation tests for all endpoints
- [ ] Rate limiting tests
- [ ] Replay attack tests

**Phase 2 Completion Criteria:**
✅ Service shuts down gracefully  
✅ All configuration validated on startup  
✅ All inputs validated with Joi  
✅ Rate limiting prevents DoS  
✅ Replay attacks blocked  
✅ Port configuration consistent  

**Deployment Readiness After Phase 2:** 7/10 🟡 (Production-ready infrastructure, but needs testing)

---

## 📋 PHASE 3: TESTING & VALIDATION

**Objective:** Achieve comprehensive test coverage to verify critical functionality works correctly.

**Duration:** 48 hours (6 working days)  
**Status:** 🟡 IMPORTANT - Required for confidence in production  
**Dependencies:** Phases 1 & 2 must be complete  
**Cost:** $6,200-$10,300

### Tasks:

#### 3.1 Set Up Test Infrastructure (4h)
**Files to Create:**
- `tests/setup.ts` (update)
- `tests/helpers/test-data.ts`
- `tests/helpers/mock-services.ts`
- `jest.config.js` (update)

**Implementation:**
```typescript
// tests/helpers/test-data.ts
export const testData = {
  validTicket: {
    id: 'ticket-123',
    eventId: 'event-456',
    status: 'ACTIVE',
    accessZone: 'VIP'
  },
  validEvent: {
    id: 'event-456',
    venueId: 'venue-789',
    startTime: new Date(Date.now() + 86400000),
    endTime: new Date(Date.now() + 90000000)
  },
  validStaff: {
    userId: 'user-123',
    tenantId: 'tenant-123',
    venueId: 'venue-789',
    role: 'VENUE_STAFF'
  }
};

// tests/helpers/mock-services.ts
export class MockTicketService {
  async getTicket(ticketId: string) {
    return testData.validTicket;
  }
}
```

---

#### 3.2 Unit Tests for Core Services (16h)

**3.2.1 QRValidator Tests (6h)**
**Files:** `tests/unit/services/qr-validator.test.ts`

**Test Cases:**
```typescript
describe('QRValidator', () => {
  describe('validateQR', () => {
    it('should validate valid QR code', async () => {});
    it('should reject expired QR code', async () => {});
    it('should reject tampered HMAC', async () => {});
    it('should reject used nonce (replay attack)', async () => {});
    it('should handle malformed QR data', async () => {});
  });
  
  describe('validateScan', () => {
    it('should allow valid ticket scan', async () => {});
    it('should block duplicate scan within window', async () => {});
    it('should allow scan after cooldown', async () => {});
    it('should block expired tickets', async () => {});
    it('should block wrong event tickets', async () => {});
    it('should enforce access zone restrictions', async () => {});
    it('should enforce re-entry limits', async () => {});
    it('should block refunded tickets', async () => {});
  });
  
  describe('checkDuplicate', () => {
    it('should detect duplicate from Redis cache', async () => {});
    it('should detect duplicate from database', async () => {});
    it('should handle Redis failure gracefully', async () => {});
  });
});
```

**3.2.2 QRGenerator Tests (4h)**
**Files:** `tests/unit/services/qr-generator.test.ts`

**Test Cases:**
- Generate valid QR code format
- Include valid HMAC signature
- Include unique nonce
- Generate offline manifest
- Handle missing tickets

**3.2.3 Offline Cache Tests (6h)**
**Files:** `tests/unit/services/offline-cache.test.ts`

**Test Cases:**
- Generate validation hashes
- Validate offline scans
- Handle expired manifests
- Reconcile offline scans
- Handle network failures during reconciliation

---

#### 3.3 Integration Tests (16h)

**3.3.1 Authentication Flow Tests (4h)**
**Files:** `tests/integration/auth.test.ts`

**Test Cases:**
```typescript
describe('Authentication Integration', () => {
  it('should reject requests without token', async () => {});
  it('should reject invalid JWT', async () => {});
  it('should accept valid JWT', async () => {});
  it('should enforce role-based access', async () => {});
  it('should extract tenant context', async () => {});
});
```

**3.3.2 Scanning Flow Tests (8h)**
**Files:** `tests/integration/scanning.test.ts`

**Test Cases:**
```typescript
describe('Scanning Integration', () => {
  it('should complete full scan flow', async () => {
    // Generate QR
    // Scan QR
    // Verify scan recorded
    // Verify metrics updated
  });
  
  it('should enforce venue isolation', async () => {
    // Staff A tries to scan venue B ticket
    // Should be denied
  });
  
  it('should enforce tenant isolation', async () => {
    // Tenant A tries to access tenant B data
    // Should be denied
  });
  
  it('should handle offline mode', async () => {
    // Generate manifest
    // Validate offline
    // Reconcile scans
  });
});
```

**3.3.3 Policy Enforcement Tests (4h)**
**Files:** `tests/integration/policies.test.ts`

**Test Cases:**
- Apply re-entry policy
- Apply cooldown period
- Apply max re-entries
- Apply zone restrictions
- Custom policy overrides

---

#### 3.4 End-to-End Tests (8h)

**3.4.1 Door Operation Scenarios (8h)**
**Files:** `tests/e2e/door-operations.test.ts`

**Test Cases:**
```typescript
describe('E2E Door Operations', () => {
  it('should handle opening night rush (1000 scans)', async () => {
    // Simulate 1000 concurrent scans
    // Verify <500ms response time
    // Verify no duplicate admissions
  });
  
  it('should handle internet outage', async () => {
    // Pre-download manifest
    // Disconnect network
    // Perform offline scans
    // Reconnect
    // Reconcile scans
  });
  
  it('should prevent fraud scenarios', async () => {
    // Screenshot attack
    // Duplicate device attack
    // Cross-venue attack
    // All should be blocked
  });
});
```

---

#### 3.5 Load Tests (4h)
**Files:** `tests/load/scan-load-test.js`

**Implementation:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 1000 }, // Peak load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% failures
  },
};

export default function () {
  const qrData = generateMockQR();
  const response = http.post(`${BASE_URL}/api/scan`, JSON.stringify({
    qrData,
    eventId: EVENT_ID,
    deviceId: DEVICE_ID,
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
  });
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

---

### Phase 3 Summary:

**Total Time:** 48 hours  
**Test Coverage Target:** 80%+  
**Critical Path:** Setup → Unit → Integration → E2E → Load

**Deliverables:**
- ✅ Comprehensive unit test suite
- ✅ Integration tests for all flows
- ✅ E2E tests for door scenarios
- ✅ Load tests for performance validation
- ✅ 80%+ code coverage

**Testing Requirements:**
- [ ] All tests pass in CI/CD
- [ ] Coverage reports generated
- [ ] Load test results documented
- [ ] Performance benchmarks established

**Phase 3 Completion Criteria:**
✅ 80%+ code coverage  
✅ All critical flows tested  
✅ Load tests prove <500ms response time  
✅ E2E tests verify door operations  
✅ Security tests pass  

**Deployment Readiness After Phase 3:** 8/10 ✅ (High confidence, performance validated)

---

## 📋 PHASE 4: PERFORMANCE & OPTIMIZATION

**Objective:** Optimize performance to handle high-volume scanning scenarios reliably.

**Duration:** 35 hours (4 working days)  
**Status:** 🟡 IMPORTANT - Required for scalability  
**Dependencies:** Phase 3 load tests must reveal bottlenecks  
**Cost:** $4,500-$7,500

### Tasks:

#### 4.1 Implement Circuit Breaker Pattern (8h)
**Priority:** P2 - PREVENTS CASCADING FAILURES  
**Files:** `src/utils/circuit-breaker.ts` (create)

**Problem:** If ticket-service or event-service is down, scanning-service keeps making failed requests.

**Implementation:**
```typescript
// src/utils/circuit-breaker.ts
import CircuitBreaker from 'opossum';

interface CircuitBreakerOptions {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
}

export class ServiceCircuitBreaker {
  private breakers: Map<string, CircuitBreaker> = new Map();

  createBreaker(serviceName: string, action: Function, options?: Partial<CircuitBreakerOptions>) {
    const defaultOptions = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      ...options
    };

    const breaker = new CircuitBreaker(action, defaultOptions);

    // Monitor circuit breaker events
    breaker.on('open', () => {
      logger.warn(`Circuit breaker OPEN for ${serviceName}`);
      metrics.circuitBreakerOpen.inc({ service: serviceName });
    });

    breaker.on('halfOpen', () => {
      logger.info(`Circuit breaker HALF-OPEN for ${serviceName}`);
    });

    breaker.on('close', () => {
      logger.info(`Circuit breaker CLOSED for ${serviceName}`);
    });

    this.breakers.set(serviceName, breaker);
    return breaker;
  }

  async execute(serviceName: string, action: Function, fallback?: Function) {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) {
      throw new Error(`No circuit breaker for ${serviceName}`);
    }

    try {
      return await breaker.fire();
    } catch (error) {
      if (fallback) {
        logger.warn(`Using fallback for ${serviceName}`, { error });
        return await fallback();
      }
      throw error;
    }
  }
}
```

**Apply to Service Clients:**
```typescript
// src/clients/ticket-service.client.ts
export class TicketServiceClient {
  private circuitBreaker: ServiceCircuitBreaker;

  async getTicket(ticketId: string): Promise<Ticket> {
    return this.circuitBreaker.execute(
      'ticket-service',
      () => this.client.get(`/api/tickets/${ticketId}`),
      async () => {
        // Fallback: Check offline cache
        return await this.offlineCache.getTicket(ticketId);
      }
    );
  }
}
```

**Success Criteria:**
- [ ] Circuit breakers on all external service calls
- [ ] Fallback behavior for critical operations
- [ ] Metrics track circuit breaker state
- [ ] Graceful degradation during outages

---

#### 4.2 Optimize Redis Caching Strategy (6h)
**Priority:** P2 - REDUCES DATABASE LOAD  
**Files:** Multiple service files

**Optimizations:**

**4.2.1 Cache Ticket Data (3h)**
```typescript
// Cache frequently accessed ticket data
async getTicketCached(ticketId: string): Promise<Ticket> {
  const cacheKey = `ticket:${ticketId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    metrics.cacheHit.inc({ type: 'ticket' });
    return JSON.parse(cached);
  }
  
  metrics.cacheMiss.inc({ type: 'ticket' });
  const ticket = await ticketServiceClient.getTicket(ticketId);
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(ticket));
  
  return ticket;
}
```

**4.2.2 Cache Event Data (2h)**
```typescript
// Events change less frequently, cache longer
async getEventCached(eventId: string): Promise<Event> {
  const cacheKey = `event:${eventId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const event = await eventServiceClient.getEvent(eventId);
  
  // Cache for 15 minutes
  await redis.setex(cacheKey, 900, JSON.stringify(event));
  
  return event;
}
```

**4.2.3 Cache Policy Data (1h)**
```typescript
// Policies rarely change during event, cache aggressively
async getPolicyCached(eventId: string): Promise<Policy> {
  const cacheKey = `policy:${eventId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const policy = await this.getPolicyFromDB(eventId);
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(policy));
  
  return policy;
}
```

**Success Criteria:**
- [ ] Cache hit rate > 80%
- [ ] Database queries reduced by 70%+
- [ ] Response times improved
- [ ] Cache metrics tracked

---

#### 4.3 Fix N+1 Query Pattern (4h)
**Priority:** P2 - DATABASE PERFORMANCE  
**Files:** `src/routes/offline.ts:55-122`

**Problem:** Reconciliation loops through scans and queries device for each scan.

**Before:**
```typescript
for (const scan of scans) {
  const device = await pool.query(
    'SELECT * FROM scanner_devices WHERE device_id = $1',
    [scan.deviceId]
  );
  // Process scan...
}
```

**After:**
```typescript
// Get all unique device IDs
const deviceIds = [...new Set(scans.map(s => s.deviceId))];

// Batch query all devices
const devices = await pool.query(
  'SELECT * FROM scanner_devices WHERE device_id = ANY($1)',
  [deviceIds]
);

// Create lookup map
const deviceMap = new Map(devices.rows.map(d => [d.device_id, d]));

// Process scans with lookup
for (const scan of scans) {
  const device = deviceMap.get(scan.deviceId);
  // Process scan...
}
```

**Success Criteria:**
- [ ] Reconciliation uses batch queries
- [ ] Database query count reduced
- [ ] Reconciliation time improved by 50%+

---

#### 4.4 Add Database Connection Pooling Optimization (3h)
**Priority:** P3 - RESOURCE MANAGEMENT  
**Files:** `src/config/database.ts`

**Optimizations:**
```typescript
// src/config/database.ts
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // Optimize pool settings
  max: 20,                    // Maximum pool size
  min: 5,                     // Minimum idle connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Wait 5s for connection
  maxUses: 7500,              // Retire connections after 7500 uses
  
  // Add connection validation
 statement_timeout: 30000,   // Query timeout 30s
  query_timeout: 30000,
  
  // Enable SSL for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Monitor pool metrics
pool.on('connect', () => {
  metrics.dbConnectionsTotal.inc();
});

pool.on('acquire', () => {
  metrics.dbConnectionsActive.inc();
});

pool.on('release', () => {
  metrics.dbConnectionsActive.dec();
});

pool.on('error', (err) => {
  logger.error('Database pool error', { error: err });
  metrics.dbErrors.inc();
});
```

**Success Criteria:**
- [ ] Pool size optimized for load
- [ ] Connections properly released
- [ ] Pool metrics monitored
- [ ] No connection leaks

---

#### 4.5 Optimize Database Indexes (4h)
**Priority:** P2 - QUERY PERFORMANCE  
**Files:** `src/migrations/003_optimize_indexes.ts` (create)

**Analysis:** Review slow query log to identify missing indexes.

**Implementation:**
```typescript
// src/migrations/003_optimize_indexes.ts
export async function up(knex: Knex): Promise<void> {
  // Composite index for common scan queries
  await knex.raw(`
    CREATE INDEX CONCURRENTLY idx_scans_ticket_device_time 
    ON scans (tenant_id, ticket_id, device_id, scanned_at DESC);
  `);

  // Index for duplicate detection queries
  await knex.raw(`
    CREATE INDEX CONCURRENTLY idx_scans_duplicate_check 
    ON scans (tenant_id, ticket_id, result, scanned_at DESC) 
    WHERE scanned_at > NOW() - INTERVAL '10 minutes';
  `);

  // Index for device lookups
  await knex.raw(`
    CREATE INDEX CONCURRENTLY idx_devices_venue_active 
    ON scanner_devices (tenant_id, venue_id, is_active) 
    WHERE is_active = true;
  `);

  // Index for policy lookups
  await knex.raw(`
    CREATE INDEX CONCURRENTLY idx_policies_event_active 
    ON scan_policies (tenant_id, event_id, is_active) 
    WHERE is_active = true;
  `);

  // Analyze tables
  await knex.raw('ANALYZE scans;');
  await knex.raw('ANALYZE scanner_devices;');
  await knex.raw('ANALYZE scan_policies;');
}
```

**Success Criteria:**
- [ ] All slow queries identified
- [ ] Appropriate indexes created
- [ ] Query execution plans reviewed
- [ ] Query performance improved by 50%+

---

#### 4.6 Implement Request Compression (2h)
**Priority:** P3 - BANDWIDTH OPTIMIZATION  
**Files:** `src/index.ts`

**Implementation:**
```typescript
// src/index.ts
import compress from '@fastify/compress';

app.register(compress, {
  global: true,
  threshold: 1024, // Only compress responses > 1KB
  encodings: ['gzip', 'deflate']
});
```

**Success Criteria:**
- [ ] Response compression enabled
- [ ] Bandwidth reduced for large responses
- [ ] Compression metrics tracked

---

#### 4.7 Add Response Time Monitoring (3h)
**Priority:** P2 - OBSERVABILITY  
**Files:** `src/middleware/timing.middleware.ts` (create)

**Implementation:**
```typescript
// src/middleware/timing.middleware.ts
export async function timingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const start = Date.now();

  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    
    // Record metrics
    metrics.httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routerPath,
        status: reply.statusCode
      },
      duration / 1000
    );

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: request.method,
        url: request.url,
        duration,
        statusCode: reply.statusCode
      });
    }
  });
}
```

**Success Criteria:**
- [ ] All requests timed
- [ ] Slow requests logged
- [ ] P95/P99 metrics available
- [ ] Alerting on slow requests

---

#### 4.8 Performance Testing & Benchmarking (5h)
**Priority:** P1 - VALIDATION  
**Files:** `tests/performance/benchmark.test.ts`

**Benchmarks to Establish:**
- Single scan latency (target: <200ms)
- Concurrent scan throughput (target: 1000/second)
- Database query times
- Cache hit rates
- API response times

**Success Criteria:**
- [ ] Baseline metrics documented
- [ ] Performance regressions detected
- [ ] Meets <500ms requirement
- [ ] Can handle 1000+ concurrent scans

---

### Phase 4 Summary:

**Total Time:** 35 hours  
**Performance Target:** <500ms P95 response time  
**Critical Path:** Load testing → Identify bottlenecks → Optimize → Re-test

**Deliverables:**
- ✅ Circuit breakers implemented
- ✅ Redis caching optimized
- ✅ N+1 queries eliminated
- ✅ Database indexes optimized
- ✅ Connection pooling tuned
- ✅ Performance benchmarks established

**Testing Requirements:**
- [ ] Load tests show <500ms P95
- [ ] Circuit breakers tested under failure
- [ ] Cache hit rate > 80%
- [ ] No connection leaks under load

**Phase 4 Completion Criteria:**
✅ <500ms P95 response time  
✅ Handles 1000+ concurrent scans  
✅ Circuit breakers prevent cascading failures  
✅ 80%+ cache hit rate  
✅ No performance regressions  

**Deployment Readiness After Phase 4:** 9/10 ✅ (Production-ready, battle-tested)

---

## 📋 PHASE 5: ADVANCED FEATURES & ENHANCEMENTS

**Objective:** Implement advanced features and polish that improve operational excellence.

**Duration:** 62 hours (8 working days)  
**Status:** ⚪ ENHANCEMENT - Nice to have, not required for launch  
**Dependencies:** Phases 1-4 complete  
**Cost:** $8,000-$13,300

### Tasks:

#### 5.1 Implement Ticket Expiration Checks (8h)
**Priority:** P2 - MISSING FEATURE  
**Files:** `src/services/QRValidator.ts`

**Implementation:**
```typescript
// Add to validateScan method
const event = await this.getEventCached(eventId);
const now = new Date();

// Check if event has started
if (now < event.startTime) {
  return {
    allowed: false,
    reason: 'EVENT_NOT_STARTED',
    eventStartTime: event.startTime
  };
}

// Check if event has ended
if (now > event.endTime) {
  return {
    allowed: false,
    reason: 'EVENT_ENDED',
    eventEndTime: event.endTime
  };
}

// Check ticket validity period
if (ticket.validFrom && now < ticket.validFrom) {
  return {
    allowed: false,
    reason: 'TICKET_NOT_YET_VALID'
  };
}

if (ticket.validUntil && now > ticket.validUntil) {
  return {
    allowed: false,
    reason: 'TICKET_EXPIRED'
  };
}
```

**Success Criteria:**
- [ ] Event time validation
- [ ] Ticket validity period checked
- [ ] Clear error messages
- [ ] Tests verify expiration logic

---

#### 5.2 Add Refunded Ticket Handling (2h)
**Priority:** P3 - SECURITY FEATURE  
**Files:** `src/services/QRValidator.ts`

**Implementation:**
```typescript
// Check ticket status
if (ticket.status === 'REFUNDED') {
  return {
    allowed: false,
    reason: 'TICKET_REFUNDED'
  };
}

if (ticket.status === 'CANCELLED') {
  return {
    allowed: false,
    reason: 'TICKET_CANCELLED'
  };
}
```

**Success Criteria:**
- [ ] Refunded tickets rejected
- [ ] Cancelled tickets rejected
- [ ] Status tracked in audit log

---

#### 5.3 Implement Transferred Ticket Handling (4h)
**Priority:** P3 - FEATURE ENHANCEMENT  
**Files:** `src/services/QRValidator.ts`

**Implementation:**
```typescript
// Handle transferred tickets
if (ticket.status === 'TRANSFERRED') {
  // Get new ticket ID from transfer record
  const newTicketId = await this.getTransferredTicketId(ticketId);
  
  return {
    allowed: false,
    reason: 'TICKET_TRANSFERRED',
    newTicketId,
    message: 'This ticket has been transferred. Please use the new ticket.'
  };
}
```

**Success Criteria:**
- [ ] Transferred tickets tracked
- [ ] Clear messaging to staff
- [ ] New ticket ID provided
- [ ] Transfer audit trail

---

#### 5.4 Implement
