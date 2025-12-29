# Minting-Service Audit Findings

**Generated:** 2025-12-29
**Audit Files Reviewed:** 16
**Total Findings:** 327 (238 FAIL, 89 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 52 | 8 | 60 |
| HIGH | 78 | 32 | 110 |
| MEDIUM | 62 | 31 | 93 |
| LOW | 46 | 18 | 64 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 17 | 4 | 21 |
| 02-input-validation.md | 18 | 8 | 26 |
| 03-error-handling.md | 26 | 10 | 36 |
| 04-logging-observability.md | 13 | 2 | 15 |
| 05-s2s-auth.md | 6 | 2 | 8 |
| 06-database-integrity.md | 17 | 7 | 24 |
| 07-idempotency.md | 16 | 6 | 22 |
| 08-rate-limiting.md | 32 | 8 | 40 |
| 09-multi-tenancy.md | 35 | 12 | 47 |
| 10-testing.md | 22 | 8 | 30 |
| 11-documentation.md | 18 | 7 | 25 |
| 12-health-checks.md | 12 | 5 | 17 |
| 13-graceful-degradation.md | 18 | 6 | 24 |
| 19-configuration-management.md | 14 | 10 | 24 |
| 20-deployment-cicd.md | 10 | 3 | 13 |
| 21-database-migrations.md | 8 | 2 | 10 |

---

## CRITICAL Findings (60)

### From 01-security.md

#### SEC-R1: Protected routes use auth
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Route Layer - Authentication
- **Evidence:** Admin routes open
- **Impact:** Anyone can call admin endpoints without authentication

#### SEC-R6: No hardcoded secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Route Layer - Authentication
- **Evidence:** DB password fallback in code

#### SEC-DB1: DB uses TLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Database Layer
- **Evidence:** No SSL configuration

#### SEC-EXT8: Keys encrypted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** External - Solana Keys
- **Evidence:** Unencrypted wallet

#### SEC-EXT9: Secure storage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** External - Solana Keys
- **Evidence:** Wallet loaded from file path

#### SEC-EXT13: No secrets in git
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** External - Solana Keys
- **Evidence:** devnet-wallet.json in repository

### From 02-input-validation.md

#### RD2: Body schema POST/PUT
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** Admin routes no validation

#### RD3: Params schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** Admin routes no validation

#### RD4: Query schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** Admin routes no validation

#### RD5: Response schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** No response filtering

#### RD9: Integers min/max
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** Unbounded integers

#### SD6: No Type.Any
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Schema Definition
- **Evidence:** metadata: any used

#### SL4: State transitions
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Service Layer
- **Evidence:** No status enum

#### SL8: Filter sensitive
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Service Layer
- **Evidence:** No response filtering

#### SEC2: Mass assignment
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Security
- **Evidence:** Mass assignment vulnerability

#### SEC9: Integer bounds
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Security
- **Evidence:** Unbounded integers

### From 03-error-handling.md

#### RH6: No stack trace
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** Raw errors exposed to clients

#### RH8: Global error handler
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** No global error handler

#### RH9: Unhandled rejection
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** No process handlers

#### RH10: Uncaught exception
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** No process handlers

#### DB5: Deadlock retry
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Database
- **Evidence:** No deadlock handling

#### DS1: Circuit breaker
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Distributed Systems
- **Evidence:** No circuit breaker

#### DS9: DLQ configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Distributed Systems
- **Evidence:** No DLQ

### From 04-logging-observability.md

#### LC7: File/external prod
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Logger Configuration
- **Evidence:** No prod log transport

#### LC8: Log rotation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Logger Configuration
- **Evidence:** No prod log transport

#### LC9: Sensitive redaction
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Logger Configuration
- **Evidence:** No data redaction

#### LC10: Request ID correlation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Logger Configuration
- **Evidence:** No request ID

#### SL6: Request ID
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Structured Logging
- **Evidence:** No request ID

#### HC7: Redis check
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Health Checks
- **Evidence:** Missing Redis/Queue health

#### HC8: Queue check
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Health Checks
- **Evidence:** Missing Redis/Queue health

#### DT1-12: All tracing checks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Distributed Tracing
- **Evidence:** No distributed tracing

### From 05-s2s-auth.md

#### HM5: Timing-safe compare
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 HMAC Signature
- **Evidence:** No timing-safe compare

#### SI6: Configurable allowlist
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Service Identity
- **Evidence:** Hardcoded allowlist

#### SI7: Unique per-service secret
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Service Identity
- **Evidence:** Single shared secret

#### SM4: Min length enforced
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Secret Management
- **Evidence:** No secret length validation

#### MA4: All endpoints protected
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Middleware Application
- **Evidence:** Admin routes unprotected

### From 06-database-integrity.md

#### SD9: Enum CHECK
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Schema Design
- **Evidence:** No CHECK constraints

#### SD10: Foreign keys
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Schema Design
- **Evidence:** No FK constraints

#### CN3: CHECK enums
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Constraints
- **Evidence:** No CHECK constraints

#### CN4: CHECK ranges
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Constraints
- **Evidence:** No CHECK constraints

#### MT3: Tenant context set
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Multi-Tenancy
- **Evidence:** RLS not activated

#### MT4: Tenant in queries
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Multi-Tenancy
- **Evidence:** No tenant filter in models

#### MT6: Cross-tenant prevented
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Multi-Tenancy
- **Evidence:** No tenant filter in models

#### MT8: Tenant immutable
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Multi-Tenancy
- **Evidence:** Tenant_id modifiable

### From 07-idempotency.md

#### IK1-5: All idempotency key checks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Idempotency Key
- **Evidence:** No idempotency key system

#### IK7: In-progress blocking
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Idempotency Key
- **Evidence:** No idempotency key

#### QJ1: Deterministic job ID
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Queue Job
- **Evidence:** Queue jobs not deduplicated

#### QJ2: Job deduplication
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Queue Job
- **Evidence:** Queue jobs not deduplicated

#### QJ3: Idempotency key in data
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Queue Job
- **Evidence:** Queue jobs not deduplicated

#### WI1-6: All webhook idempotency
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Webhook
- **Evidence:** Webhook not deduplicated

#### NM3: Status checked
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 NFT Minting
- **Evidence:** NFT can duplicate on retry

#### NM4: In-progress blocks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 NFT Minting
- **Evidence:** NFT can duplicate on retry

#### NM5: Return existing
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 NFT Minting
- **Evidence:** NFT can duplicate on retry

#### AE2: Batch atomic
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 API Endpoint
- **Evidence:** Batch not atomic

#### DL1-6: All distributed lock
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.7 Distributed Lock
- **Evidence:** No locking implemented

### From 08-rate-limiting.md

#### ES1-7: All endpoint-specific limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Endpoint-Specific
- **Evidence:** No endpoint-specific limits

#### ST1: Redis store
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Storage
- **Evidence:** No Redis store (in-memory only)

#### QR1: Concurrency limited
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.7 Queue
- **Evidence:** No queue concurrency

#### BR1: RPC rate limit
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.8 Blockchain
- **Evidence:** No Solana throttling

#### ER5: Metrics incremented
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.9 Error Response
- **Evidence:** No metrics

#### MA1-4: Rate limit metrics
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.10 Monitoring
- **Evidence:** No rate limit metrics

### From 09-multi-tenancy.md

#### Tenant context transaction
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 2. Knex Query Patterns
- **Evidence:** RLS context never set - No SET LOCAL app.current_tenant_id anywhere

#### Tenant from verified JWT
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. JWT Claims & Middleware
- **Evidence:** `const { tenantId } = validation.data;` - From body, not JWT!

#### Admin additional auth
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 6. API Endpoints
- **Evidence:** Admin routes return ALL tenants data without authentication

#### Non-superuser role
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 1. PostgreSQL RLS
- **Evidence:** Defaults to postgres superuser

### From 10-testing.md

#### Unit tests present
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 2. Test Pyramid
- **Evidence:** MintingOrchestrator 0 tests, only 3/15+ modules tested

#### Integration tests
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 2. Test Pyramid
- **Evidence:** Empty folder

#### All routes tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 4. Fastify Testing
- **Evidence:** Routes untested

#### Multi-tenant tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5. Knex Database Testing
- **Evidence:** Multi-tenant untested

#### Signature verification tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 7. Webhook Testing
- **Evidence:** Webhook untested

### From 11-documentation.md

#### README.md
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 1. Project-Level Documentation
- **Evidence:** Missing

#### ADRs
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 2. Architecture Documentation
- **Evidence:** No ADRs

#### OpenAPI/Swagger
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. API Documentation
- **Evidence:** No OpenAPI

#### Runbooks exist
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 4. Operational Documentation
- **Evidence:** No runbooks

#### Public functions docstrings
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 7. Code Documentation
- **Evidence:** No code docs

### From 12-health-checks.md

#### /health/startup
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 1. Required Endpoints
- **Evidence:** Missing startup probe

#### Query timeout
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. Readiness Probe
- **Evidence:** No timeouts on health checks

#### No external services
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3. Readiness Probe
- **Evidence:** Solana in readiness probe

#### Redis PING check
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5. Redis Health
- **Evidence:** Redis not checked

### From 13-graceful-degradation.md

#### Circuit breakers on external calls
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 1. Circuit Breaker Pattern
- **Evidence:** No circuit breakers

#### Jitter added
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 2. Retry/Backoff
- **Evidence:** No jitter

#### HTTP client timeout
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. Timeout Configuration
- **Evidence:** No IPFS timeout

#### Solana RPC timeout
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. Timeout Configuration
- **Evidence:** No Solana timeout

#### Database closed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 6. Graceful Shutdown
- **Evidence:** No shutdown cleanup

### From 19-configuration-management.md

#### No secrets in git
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 1. Repository & Version Control
- **Evidence:** Hardcoded DB password: `TicketToken2024Secure!`

#### Pre-commit hooks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 1. Repository & Version Control
- **Evidence:** No pre-commit scanning

#### SSL/TLS required
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5. Database Credentials
- **Evidence:** No DB SSL

#### All secrets validated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 9. Startup Validation
- **Evidence:** loadSecrets() never called

### From 20-deployment-cicd.md

#### Container scanning
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 7. Image Scanning
- **Evidence:** No container scanning

#### CI/CD workflow exists
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5. CI/CD Pipeline
- **Evidence:** No CI/CD pipeline

#### Images signed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 8. Artifact Signing
- **Evidence:** No image signing

#### HEALTHCHECK defined
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3. Runtime Security
- **Evidence:** No HEALTHCHECK in Dockerfile

### From 21-database-migrations.md

#### Backup before migration
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 6. Rollback & CI/CD
- **Evidence:** No backup before migration

#### CI/CD migration testing
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 6. Rollback & CI/CD
- **Evidence:** No CI/CD testing

#### SSL in production
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 4. Knexfile Configuration
- **Evidence:** rejectUnauthorized: false

---

## Architecture Issues Summary

### 1. Admin Routes Completely Unprotected (CRITICAL)

Admin routes have no authentication at all and return data from ALL tenants.

**Evidence:**
```typescript
// routes/admin.ts:14
// Authentication should be added in production

// routes/admin.ts:178-182
const mints = await db('ticket_mints')
  .orderBy('created_at', 'desc')
  .limit(100)  // Returns ALL tenants!
```

**Impact:** Anyone can call admin endpoints and access all tenant data.

**Required:**
```typescript
// routes/admin.ts
fastify.addHook('preHandler', authMiddleware);
fastify.addHook('preHandler', requireAdmin);

// All queries must filter by tenant
const mints = await db('ticket_mints')
  .where('tenant_id', tenantId)
  .orderBy('created_at', 'desc')
  .limit(100);
```

### 2. Hardcoded Database Password (CRITICAL)

Database password is hardcoded as a fallback in source code.

**Evidence:**
```typescript
// config/database.ts:9
password: process.env.DB_PASSWORD || 'TicketToken2024Secure!'
```

**Impact:** Password exposed in source control. Anyone with repo access knows the DB password.

**Required:**
```typescript
// config/database.ts
password: process.env.DB_PASSWORD,

// In startup validation
if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD environment variable required');
}
```

### 3. Wallet File in Git (CRITICAL)

Solana wallet file is committed to the repository.

**Evidence:** `devnet-wallet.json` in repository

**Impact:** Devnet wallet key compromised. If this pattern exists for mainnet, funds are at risk.

**Required:**
```bash
# Remove from git
git rm --cached devnet-wallet.json
echo "devnet-wallet.json" >> .gitignore
echo "*-wallet.json" >> .gitignore

# Rotate compromised key
solana-keygen new -o new-devnet-wallet.json
```

### 4. Tenant from Body Instead of JWT (CRITICAL)

Tenant ID is extracted from request body instead of verified JWT.

**Evidence:**
```typescript
// routes/internal-mint.ts:36
const { tenantId } = validation.data; // From body, not JWT!
```

**Impact:** Any caller can spoof tenant ID and access/modify other tenants' data.

**Required:**
```typescript
// Extract tenant from verified JWT only
const tenantId = request.user.tenant_id;

// Never trust body/header for tenant
// const { tenantId } = validation.data; // REMOVE THIS
```

### 5. RLS Context Never Set (CRITICAL)

SET LOCAL app.current_tenant_id is never called anywhere.

**Evidence:** No SET LOCAL app.current_tenant_id anywhere in codebase

**Impact:** Row Level Security policies have no effect. All data accessible.

**Required:**
```typescript
// Middleware to set tenant context
async function setTenantContext(request, reply) {
  const tenantId = request.user.tenant_id;
  await knex.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

// Or wrapper function
async function withTenantContext(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return knex.transaction(async (trx) => {
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    return fn();
  });
}
```

### 6. Secrets Manager Never Called (CRITICAL)

loadSecrets() function exists but is never invoked at startup.

**Evidence:**
```typescript
// index.ts - missing loadSecrets() call
async function main(): Promise<void> {
  // No loadSecrets() call!
  await initializeDatabase();
```

**Required:**
```typescript
// index.ts
async function main(): Promise<void> {
  await loadSecrets(); // Add this!
  await initializeDatabase();
  // ...
}
```

### 7. No Circuit Breakers (CRITICAL)

External service calls (Solana RPC, IPFS) have no circuit breakers.

**Impact:** Single external service failure cascades to entire service.

**Required:**
```typescript
import CircuitBreaker from 'opossum';

const solanaBreaker = new CircuitBreaker(solanaRpcCall, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

const ipfsBreaker = new CircuitBreaker(ipfsService.upload, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

// Use with fallback
ipfsBreaker.fallback(() => cachedMetadata);
```

### 8. NFT Can Duplicate on Retry (CRITICAL)

No idempotency checks before minting. Retries can create duplicate NFTs.

**Required:**
```typescript
async mintCompressedNFT(ticketData: TicketData): Promise<MintResult> {
  // Check for existing mint first
  const existing = await this.findExistingMint(ticketData.ticketId);
  if (existing?.status === 'completed') {
    return { success: true, ...existing };
  }
  if (existing?.status === 'minting') {
    throw new Error('Mint already in progress');
  }
  
  // Use distributed lock
  const lockKey = `mint:${ticketData.tenantId}:${ticketData.ticketId}`;
  const lock = await redlock.acquire([lockKey], 30000);
  try {
    // Re-check after acquiring lock
    const recheck = await this.findExistingMint(ticketData.ticketId);
    if (recheck?.status === 'completed') {
      return { success: true, ...recheck };
    }
    
    // Proceed with mint
    await this.updateStatus(ticketData.ticketId, 'minting');
    const result = await this.doMint(ticketData);
    await this.updateStatus(ticketData.ticketId, 'completed', result);
    return result;
  } finally {
    await lock.release();
  }
}
```

---

## Quick Fix Priority

### P0 - Do Today (Security Critical)

1. **Add auth to admin routes** - ~1 hour
2. **Remove hardcoded DB password** - ~15 minutes
3. **Remove wallet file from git & rotate key** - ~30 minutes
4. **Fix tenant extraction (JWT not body)** - ~1 hour
5. **Add SET LOCAL for RLS** - ~2 hours
6. **Call loadSecrets() at startup** - ~5 minutes
7. **Add SSL to database connection** - ~30 minutes

### P1 - Do This Week

1. Add circuit breakers for external services
2. Add idempotency checks for minting
3. Add distributed locking (Redlock)
4. Add deterministic job IDs
5. Add global error handler
6. Add process error handlers

### P2 - Do This Sprint

1. Add comprehensive input validation
2. Add CHECK constraints to database
3. Add foreign key constraints
4. Add OpenTelemetry tracing
5. Write tests
6. Create documentation

---

## Quick Fix Code Snippets

### Fix Admin Routes (P0)
```typescript
// routes/admin.ts
import { authMiddleware, requireAdmin } from '../middleware/auth';

export async function adminRoutes(fastify: FastifyInstance) {
  // Add auth to ALL admin routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', requireAdmin);
  
  fastify.get('/mints', async (request, reply) => {
    const tenantId = request.user.tenant_id;
    
    // ALWAYS filter by tenant
    const mints = await db('ticket_mints')
      .where('tenant_id', tenantId)
      .orderBy('created_at', 'desc')
      .limit(100);
    
    return mints;
  });
}
```

### Remove Hardcoded Password (P0)
```typescript
// config/database.ts
import { cleanEnv, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  DB_HOST: str(),
  DB_PORT: num({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(), // Required, no default
  DB_NAME: str(),
});

export const dbConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD, // No fallback!
  database: env.DB_NAME,
  ssl: {
    rejectUnauthorized: true
  }
};
```

### Fix Tenant Context (P0)
```typescript
// middleware/tenant.ts
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // ONLY get tenant from verified JWT
  const tenantId = request.user?.tenant_id;
  
  if (!tenantId) {
    return reply.code(401).send({ error: 'Missing tenant context' });
  }
  
  // Validate UUID format
  if (!isUUID(tenantId)) {
    return reply.code(401).send({ error: 'Invalid tenant ID' });
  }
  
  // Set RLS context
  await knex.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  
  request.tenantId = tenantId;
}

// routes/internal-mint.ts
fastify.post('/mint', {
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  const tenantId = request.tenantId; // From middleware, not body
  // ...
});
```

### Add Circuit Breakers (P1)
```typescript
// services/circuit-breakers.ts
import CircuitBreaker from 'opossum';

export const solanaBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5
  }
);

export const ipfsBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    timeout: 60000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 3
  }
);

// Add fallbacks
ipfsBreaker.fallback(() => {
  logger.warn('IPFS circuit open, using cached metadata');
  return cachedMetadata;
});

// Usage
const result = await solanaBreaker.fire(async () => {
  return connection.sendTransaction(tx);
});
```

### Add Distributed Lock (P1)
```typescript
// services/lock.ts
import Redlock from 'redlock';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const redlock = new Redlock([redis], {
  retryCount: 3,
  retryDelay: 200
});

export async function withLock<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const lock = await redlock.acquire([`lock:${key}`], ttl);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

// Usage in minting
async function mintNFT(ticketId: string, tenantId: string) {
  const lockKey = `mint:${tenantId}:${ticketId}`;
  
  return withLock(lockKey, 30000, async () => {
    // Check if already minted
    const existing = await db('ticket_mints')
      .where({ ticket_id: ticketId, tenant_id: tenantId })
      .first();
    
    if (existing?.status === 'completed') {
      return existing;
    }
    
    // Proceed with mint
    return doMint(ticketId, tenantId);
  });
}
```

### Add Deterministic Job IDs (P1)
```typescript
// services/queue.ts
async function queueMintJob(ticketData: TicketMintData) {
  // Deterministic job ID prevents duplicates
  const jobId = `mint:${ticketData.tenantId}:${ticketData.ticketId}`;
  
  await mintQueue.add('mint-ticket', ticketData, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  });
}
```
