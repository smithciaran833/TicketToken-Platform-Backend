# Minting-Service Audit Findings

**Generated:** 2025-01-01
**Audit Files Reviewed:** 23
**Total Findings:** 205

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 99 |
| HIGH | 70 |
| MEDIUM | 36 |
| LOW | 0 |
| **TOTAL** | **205** |

---

## Summary by Audit File

| File | CRITICAL | HIGH | MEDIUM | LOW | Total |
|------|----------|------|--------|-----|-------|
| 01-security.md | 5 | 3 | 0 | 0 | 8 |
| 02-input-validation.md | 6 | 3 | 0 | 0 | 9 |
| 03-error-handling.md | 6 | 4 | 0 | 0 | 10 |
| 04-logging-observability.md | 5 | 2 | 0 | 0 | 7 |
| 05-s2s-auth.md | 6 | 0 | 0 | 0 | 6 |
| 06-database-integrity.md | 6 | 2 | 0 | 0 | 8 |
| 07-idempotency.md | 6 | 2 | 0 | 0 | 8 |
| 08-rate-limiting.md | 6 | 3 | 0 | 0 | 9 |
| 09-multi-tenancy.md | 5 | 4 | 0 | 0 | 9 |
| 10-testing.md | 5 | 4 | 3 | 0 | 12 |
| 11-documentation.md | 5 | 4 | 4 | 0 | 13 |
| 12-health-checks.md | 4 | 4 | 3 | 0 | 11 |
| 13-graceful-degradation.md | 5 | 5 | 4 | 0 | 14 |
| 17-queues-background-jobs.md | 4 | 4 | 4 | 0 | 12 |
| 19-configuration-management.md | 4 | 5 | 3 | 0 | 12 |
| 20-deployment-cicd.md | 4 | 4 | 2 | 0 | 10 |
| 21-database-migrations.md | 3 | 3 | 2 | 0 | 8 |
| 26-blockchain-integration.md | 4 | 4 | 4 | 0 | 12 |
| 31-nft-minting-operations.md | 4 | 4 | 3 | 0 | 11 |
| 36-wallet-security.md | 4 | 4 | 4 | 0 | 12 |
| 37-key-management.md | 2 | 2 | 0 | 0 | 4 |

---

## CRITICAL Findings (99)

### 01-security.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| SEC-R1 | Admin routes unauthenticated | `// Authentication should be added in production` | Anyone can call admin endpoints |
| SEC-R6 | Hardcoded DB password | `password: process.env.DB_PASSWORD \|\| 'TicketToken2024Secure!'` | Password exposed in source |
| SEC-DB1 | No DB SSL | No SSL configuration in database.ts | Data transmitted unencrypted |
| SEC-EXT8/9 | Unencrypted wallet, file path | `fs.readFileSync(walletPath)` | Wallet key compromised if server breached |
| SEC-EXT13 | Wallet in git | `devnet-wallet.json` in repository | Key exposed in version control |

### 02-input-validation.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| RD2-4 | Admin routes no validation | No schema on admin.ts routes | Malformed data accepted |
| RD5 | No response filtering | Raw DB objects returned | Sensitive fields leaked |
| RD9 | Unbounded integers | No min/max on numeric inputs | Integer overflow attacks |
| SD6 | Any type used | `metadata: any` | Type safety bypassed |
| SL4 | No status enum | Status strings not validated | Invalid state transitions |
| SEC2 | Mass assignment | Direct spread of request body | Attackers can set any field |

### 03-error-handling.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| RH6 | Raw errors exposed | Stack traces in responses | Internal details leaked |
| RH8 | No global error handler | Missing setErrorHandler | Unhandled errors crash service |
| RH9-10 | No process handlers | Missing unhandledRejection/uncaughtException | Silent failures |
| DB5 | No deadlock handling | No retry on deadlock errors | Transactions fail permanently |
| DS1 | No circuit breaker | Direct calls to Solana/IPFS | Cascading failures |
| DS9 | No DLQ | Failed jobs lost after retries | Data loss |

### 04-logging-observability.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| LC7-8 | No prod log transport | Console only | Logs lost in production |
| LC9 | No data redaction | Secrets may be logged | Credential exposure |
| LC10/SL6 | No request ID | Missing correlation ID | Cannot trace requests |
| HC7-8 | Missing Redis/Queue health | Not in health checks | Silent dependency failures |
| DT1-12 | No distributed tracing | No OpenTelemetry | Cannot debug distributed issues |

### 05-s2s-auth.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| HM5 | No timing-safe compare | `signature === expected` | Timing attack vulnerability |
| SI6 | Hardcoded allowlist | Static array in code | Cannot update without deploy |
| SI7 | Single shared secret | One secret for all services | Compromise affects all |
| SM4 | No secret length validation | Accepts any length | Weak secrets allowed |
| MA4 | Admin routes unprotected | No auth middleware on admin.ts | Full admin access to anyone |
| HM7 | JSON.stringify body | Non-deterministic serialization | Signature verification fails |

### 06-database-integrity.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| SD9 | No CHECK constraints | Status/enum not validated | Invalid data in DB |
| SD10 | No FK constraints | No REFERENCES clauses | Orphaned records |
| MT3 | RLS context never set | No SET LOCAL anywhere | RLS policies ineffective |
| MT4/6 | No tenant filter | Queries don't filter by tenant | Cross-tenant data access |
| MT8 | Tenant_id modifiable | Not excluded from updates | Tenant hijacking |
| CP7 | SSL not verified | `rejectUnauthorized: false` | MITM attacks possible |

### 07-idempotency.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| IK1-5 | No idempotency key system | No X-Idempotency-Key handling | Duplicate operations |
| IK7 | No in-progress blocking | Concurrent requests proceed | Race conditions |
| QJ1-3 | Queue jobs not deduplicated | No deterministic job ID | Duplicate mints |
| WI1-6 | Webhook not deduplicated | No event ID tracking | Duplicate processing |
| NM3-5 | NFT can duplicate on retry | No status check before mint | Double minting |
| DL1-6 | No distributed lock | No Redlock implementation | Race conditions |

### 08-rate-limiting.md (6 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| ES1-7 | No endpoint-specific limits | Same limit for all routes | Sensitive endpoints unprotected |
| ST1 | No Redis store | In-memory only | Limits reset on restart |
| QR1 | No queue concurrency | Default concurrency | Resource exhaustion |
| BR1 | No Solana throttling | Unlimited RPC calls | Rate limited by provider |
| ER5 | No metrics | Rate limits not tracked | Cannot monitor abuse |
| MA1-4 | No rate limit metrics | Missing Prometheus counters | No visibility |

### 09-multi-tenancy.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| JWT-TENANT | Tenant from body not JWT | `const { tenantId } = validation.data` | Tenant spoofing |
| ADMIN-AUTH | Admin unprotected | No auth on admin routes | Full data access |
| QUERY-FILTER | Queries unfiltered | `await db('ticket_mints').orderBy(...)` | Cross-tenant data leak |
| RLS-CONTEXT | RLS context never set | No SET LOCAL | RLS bypassed |
| SUPERUSER | Superuser default | `user: process.env.DB_USER \|\| 'postgres'` | RLS bypassed |

### 10-testing.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| ORCH-TEST | MintingOrchestrator 0 tests | No test file exists | Core logic untested |
| INT-TEST | Integration empty | Empty tests/integration/ | No integration coverage |
| ROUTE-TEST | Routes untested | No route tests | API untested |
| MT-TEST | Multi-tenant untested | No tenant isolation tests | Security untested |
| WH-TEST | Webhook untested | No signature verification tests | Auth untested |

### 11-documentation.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| README | No README.md | File missing | No project overview |
| OPENAPI | No OpenAPI spec | No swagger/openapi | API undocumented |
| RUNBOOKS | No runbooks | No ops procedures | Incidents mishandled |
| ADR | No ADRs | No architecture decisions | Context lost |
| CODEDOCS | No code docs | No TSDoc comments | Code hard to understand |

### 12-health-checks.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| STARTUP | No /health/startup | Endpoint missing | K8s probe fails |
| REDIS | Redis not checked | Not in health checks | Silent Redis failure |
| TIMEOUT | No timeouts | Health checks can hang | Probe timeouts |
| EXTERNAL | External in readiness | Solana in readiness probe | False unready status |

### 13-graceful-degradation.md (5 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| CIRCUIT | No circuit breakers | Direct external calls | Cascading failures |
| IPFS-TO | No IPFS timeout | No timeout configured | Hanging requests |
| SOL-TO | No Solana timeout | No timeout configured | Hanging transactions |
| JITTER | No jitter | Backoff without jitter | Thundering herd |
| SHUTDOWN | No shutdown cleanup | DB/Redis not closed | Resource leaks |

### 17-queues-background-jobs.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| JOB-TO | No job timeout | No timeout in job options | Jobs run forever |
| JOB-ID | No deterministic ID | Random job IDs | Duplicate jobs |
| IPFS-IDEMP | IPFS not idempotent | Re-uploads on retry | Wasted resources |
| QUEUE-SHUT | No queue shutdown | Queue not closed on SIGTERM | Lost jobs |

### 19-configuration-management.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| HARDCODE | Hardcoded DB password | `'TicketToken2024Secure!'` | Password in source |
| SECRETS | Secrets manager not called | `loadSecrets()` never invoked | Secrets not loaded |
| PRECOMMIT | No pre-commit scanning | No git hooks | Secrets committed |
| DB-SSL | No DB SSL | SSL not configured | Unencrypted traffic |

### 20-deployment-cicd.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| SCAN | No container scanning | No Trivy/Snyk | Vulnerable images |
| CICD | No CI/CD pipeline | No workflow files | Manual deployments |
| SIGN | No image signing | No cosign | Image tampering |
| HEALTH | No HEALTHCHECK | Missing in Dockerfile | Container health unknown |

### 21-database-migrations.md (3 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| BACKUP | No backup before migration | No pg_dump | Data loss on failure |
| CI-MIG | No CI/CD testing | Migrations not tested | Breaking migrations |
| SSL-REJECT | SSL rejectUnauthorized:false | Accepts any certificate | MITM attacks |

### 26-blockchain-integration.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| WALLET-FILE | Wallet from file | `fs.readFileSync(walletPath)` | Key exposure |
| PUBLIC-RPC | Public RPC endpoint | Fallback to public RPC | Rate limited, unreliable |
| BLOCKHASH | No blockhash refresh | Same blockhash on retry | Transaction expiry |
| DAS | No DAS API | Cannot verify ownership | Ownership unverified |

### 31-nft-minting-operations.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| PRE-MINT | No pre-mint check | Mints without checking existing | Duplicate NFTs |
| IDEMP-KEY | No idempotency key | No job deduplication | Duplicate mints |
| RACE | No race protection | No row-level locking | Concurrent duplicates |
| CENTRAL-URL | Centralized URL fallback | HTTP fallback in metadata | Metadata centralization |

### 36-wallet-security.md (4 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| PLAINTEXT | Keys in plaintext JSON | `devnet-wallet.json` | Key theft |
| SINGLE | Single wallet | One wallet for all ops | Single point of failure |
| MULTISIG | No multisig | Single signer | No approval workflow |
| LIMITS | No spending limits | Unlimited transactions | Drain attack |

### 37-key-management.md (2 CRITICAL)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| WALLET-PLAIN | Wallet in plaintext file | JSON file on disk | Key exposure |
| WALLET-SM | Wallet not in secrets manager | Not using AWS/Vault | No key protection |

---

## HIGH Findings (70)

### 01-security.md (3 HIGH)

- No RBAC implementation
- No webhook idempotency
- No key rotation procedure

### 02-input-validation.md (3 HIGH)

- No maxLength on strings
- No cross-field validation
- Dynamic columns allowed

### 03-error-handling.md (4 HIGH)

- No custom error classes
- No error codes
- No job timeout
- No stale job detection

### 04-logging-observability.md (2 HIGH)

- No request logging middleware
- No query timing metrics

### 05-s2s-auth.md (0 HIGH)

(None)

### 06-database-integrity.md (2 HIGH)

- No soft delete pattern
- No deadlock handling

### 07-idempotency.md (2 HIGH)

- No status check before mint
- No RETURNING clause on upserts

### 08-rate-limiting.md (3 HIGH)

- No tenant-based rate limit key
- No health endpoint bypass
- No RPC fallback on rate limit

### 09-multi-tenancy.md (4 HIGH)

- No FORCE RLS on tables
- No WITH CHECK on policies
- Cache not tenant-scoped
- Webhook has no tenant context

### 10-testing.md (4 HIGH)

- No database tests
- No Solana mint tests
- Coverage 70% not 80%
- No test factories

### 11-documentation.md (4 HIGH)

- No CHANGELOG
- No incident playbooks
- No error codes documented
- Incomplete .env descriptions

### 12-health-checks.md (4 HIGH)

- No event loop monitoring
- No DB pool cleanup on shutdown
- No queue cleanup on shutdown
- Detailed endpoints public

### 13-graceful-degradation.md (5 HIGH)

- No blockhash validation
- No Redis timeout
- No query timeout
- No queue cleanup
- Pool min:2 (should be 0)

### 17-queues-background-jobs.md (4 HIGH)

- No DLQ configured
- No stalled job handling
- Concurrency=1 (too low)
- No pre-mint status check

### 19-configuration-management.md (5 HIGH)

- No centralized config module
- process.env scattered
- Wallet loaded from file
- No per-service DB credentials
- API keys may appear in logs

### 20-deployment-cicd.md (4 HIGH)

- No base image digest pinning
- No secret scanning in CI
- No SBOM generation
- No rollback documentation

### 21-database-migrations.md (3 HIGH)

- No lock_timeout configured
- pgcrypto extension not verified
- Sequential naming (not timestamp)

### 26-blockchain-integration.md (4 HIGH)

- Hardcoded priority fees
- No transaction timeout
- Collection not verified
- No reconciliation service

### 31-nft-minting-operations.md (4 HIGH)

- Not using finalized commitment
- No CID verification
- No DLQ for failed mints
- No user notification on failure

### 36-wallet-security.md (4 HIGH)

- No key rotation procedure
- No external alerting (PagerDuty)
- No transaction monitoring
- No address allowlist

### 37-key-management.md (2 HIGH)

- IPFS keys in env vars (not secrets manager)
- Auth secrets in env vars (not secrets manager)

---

## MEDIUM Findings (36)

### 10-testing.md (3 MEDIUM)

- No E2E tests
- No CI workflow
- No security tests

### 11-documentation.md (4 MEDIUM)

- No C4 diagrams
- No glossary
- No CONTRIBUTING.md
- Incomplete validation docs

### 12-health-checks.md (3 MEDIUM)

- Inconsistent status values
- Uptime exposed publicly
- Duplicate health files

### 13-graceful-degradation.md (4 MEDIUM)

- No IPFS failover
- No priority shedding
- No queue depth limits
- No bulkhead pattern

### 17-queues-background-jobs.md (4 MEDIUM)

- No queue depth monitoring
- No error handler on queue
- No Redis timeout
- No Bull dashboard

### 19-configuration-management.md (3 MEDIUM)

- No env-specific config files
- No log sanitization
- No Redis TLS

### 20-deployment-cicd.md (2 MEDIUM)

- NPM cache not cleared
- No SUID binary removal

### 21-database-migrations.md (2 MEDIUM)

- Pool min:2 (should be 0)
- No CONCURRENTLY on indexes

### 26-blockchain-integration.md (4 MEDIUM)

- No spending limits
- No key rotation
- Centralized metadata storage
- Single wallet architecture

### 31-nft-minting-operations.md (3 MEDIUM)

- HTTP image URLs allowed
- No metadata validation
- Improper asset ID derivation

### 36-wallet-security.md (4 MEDIUM)

- No hardware wallet support
- No incident response plan
- No disaster recovery plan
- No approval workflows

---

## Priority Remediation Plan

### P0 - Do Today (Security Critical) ~6 hours

| # | Issue | File(s) | Time |
|---|-------|---------|------|
| 1 | Add auth to admin routes | routes/admin.ts | 1h |
| 2 | Remove hardcoded DB password | config/database.ts | 15m |
| 3 | Remove wallet from git & rotate | .gitignore, new keypair | 30m |
| 4 | Fix tenant from JWT not body | routes/internal-mint.ts | 1h |
| 5 | Add SET LOCAL for RLS | middleware/tenant.ts | 2h |
| 6 | Call loadSecrets() at startup | index.ts | 5m |
| 7 | Add SSL to database | config/database.ts | 30m |
| 8 | Add timing-safe compare | middleware/internal-auth.ts | 15m |

### P1 - Do This Week

| # | Issue | File(s) |
|---|-------|---------|
| 1 | Add circuit breakers | services/*.ts |
| 2 | Add idempotency checks | services/RealCompressedNFT.ts |
| 3 | Add distributed locking (Redlock) | services/lock.ts (new) |
| 4 | Add deterministic job IDs | queues/mintQueue.ts |
| 5 | Add global error handler | index.ts |
| 6 | Add process error handlers | index.ts |
| 7 | Add request ID middleware | middleware/requestId.ts (new) |
| 8 | Add Redis health check | routes/health.ts |
| 9 | Add job timeouts | queues/mintQueue.ts |
| 10 | Add graceful shutdown | index.ts |

### P2 - Do This Sprint

| # | Issue | File(s) |
|---|-------|---------|
| 1 | Add comprehensive input validation | validators/*.ts |
| 2 | Add CHECK constraints | migrations/ |
| 3 | Add foreign key constraints | migrations/ |
| 4 | Add OpenTelemetry tracing | config/tracing.ts (new) |
| 5 | Write unit tests | tests/unit/*.ts |
| 6 | Write integration tests | tests/integration/*.ts |
| 7 | Create README.md | README.md |
| 8 | Create OpenAPI spec | docs/openapi.yaml |
| 9 | Create runbooks | docs/runbooks/ |
| 10 | Add DLQ for failed jobs | queues/dlq.ts (new) |

---

## Quick Fix Code Snippets

### P0-1: Add Auth to Admin Routes
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

### P0-2: Remove Hardcoded Password
```typescript
// config/database.ts
import { cleanEnv, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  DB_HOST: str(),
  DB_PORT: num({ default: 5432 }),
  DB_USER: str(),
  DB_PASSWORD: str(), // Required, no default!
  DB_NAME: str(),
});

export const dbConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: { rejectUnauthorized: true }
};
```

### P0-3: Remove Wallet from Git
```bash
# Run these commands
git rm --cached devnet-wallet.json
echo "devnet-wallet.json" >> .gitignore
echo "*-wallet.json" >> .gitignore

# Rotate the compromised key
solana-keygen new -o new-devnet-wallet.json
```

### P0-4: Fix Tenant from JWT
```typescript
// routes/internal-mint.ts
fastify.post('/mint', {
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  // Get tenant from verified JWT, NOT from body
  const tenantId = request.user.tenant_id;
  
  // Remove this line:
  // const { tenantId } = validation.data;
  
  // Continue with tenantId from JWT...
});
```

### P0-5: Add RLS Context Middleware
```typescript
// middleware/tenant.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { knex } from '../config/database';

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = request.user?.tenant_id;

  if (!tenantId) {
    return reply.code(401).send({ error: 'Missing tenant context' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return reply.code(401).send({ error: 'Invalid tenant ID format' });
  }

  // Set RLS context for this transaction
  await knex.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);

  request.tenantId = tenantId;
}
```

### P0-6: Call loadSecrets at Startup
```typescript
// index.ts
import { loadSecrets } from './config/secrets';

async function main(): Promise<void> {
  // Add this line!
  await loadSecrets();
  
  await initializeDatabase();
  await startServer();
}
```

### P0-7: Add Database SSL
```typescript
// config/database.ts
ssl: {
  rejectUnauthorized: true,
  ca: process.env.DB_CA_CERT
}
```

### P0-8: Add Timing-Safe Compare
```typescript
// middleware/internal-auth.ts
import crypto from 'crypto';

function verifySignature(signature: string, expected: string): boolean {
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}
```

### P1: Add Circuit Breaker
```typescript
// services/circuit-breaker.ts
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

// Usage
const result = await solanaBreaker.fire(async () => {
  return connection.sendTransaction(tx);
});
```

### P1: Add Distributed Lock
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
```

### P1: Add Pre-Mint Idempotency Check
```typescript
// services/RealCompressedNFT.ts
async mintCompressedNFT(ticketData: TicketData): Promise<MintResult> {
  // Check for existing mint first
  const existing = await db('nft_mints')
    .where({ 
      ticket_id: ticketData.ticketId, 
      tenant_id: ticketData.tenantId 
    })
    .first();

  if (existing?.status === 'completed') {
    return { success: true, ...existing };
  }
  
  if (existing?.status === 'minting') {
    throw new Error('Mint already in progress');
  }

  // Use distributed lock
  const lockKey = `mint:${ticketData.tenantId}:${ticketData.ticketId}`;
  
  return withLock(lockKey, 30000, async () => {
    // Re-check after acquiring lock
    const recheck = await db('nft_mints')
      .where({ 
        ticket_id: ticketData.ticketId, 
        tenant_id: ticketData.tenantId 
      })
      .first();

    if (recheck?.status === 'completed') {
      return { success: true, ...recheck };
    }

    // Proceed with mint
    await this.updateStatus(ticketData.ticketId, 'minting');
    const result = await this.doMint(ticketData);
    await this.updateStatus(ticketData.ticketId, 'completed', result);
    return result;
  });
}
```

### P1: Add Deterministic Job IDs
```typescript
// queues/mintQueue.ts
async function queueMintJob(ticketData: TicketMintData) {
  // Deterministic job ID prevents duplicates
  const jobId = `mint:${ticketData.tenantId}:${ticketData.ticketId}`;

  await mintQueue.add('mint-ticket', ticketData, {
    jobId,
    attempts: 3,
    timeout: 300000, // 5 minutes
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  });
}
```

### P1: Add Global Error Handler
```typescript
// index.ts
app.setErrorHandler((error, request, reply) => {
  logger.error({ 
    err: error, 
    requestId: request.id,
    tenantId: request.tenantId 
  });
  
  // Don't expose internal errors
  reply.status(500).send({ 
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId: request.id
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});
```

### P1: Add Graceful Shutdown
```typescript
// index.ts
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  // Stop accepting new requests
  await app.close();
  
  // Close queue connections
  await getMintQueue().close();
  
  // Close database pool
  await knex.destroy();
  
  // Close Redis
  await redis.quit();
  
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

---

## Architecture Issues Summary

### 1. Multi-Tenancy is Broken

The service has RLS policies defined but they're never activated because:
- Tenant ID comes from request body, not verified JWT
- SET LOCAL app.current_tenant_id is never called
- Admin routes return ALL tenant data
- Default DB user is postgres (bypasses RLS)

### 2. Wallet Security is Critical

The Solana wallet is:
- Stored in plaintext JSON file
- Committed to git (key compromised)
- Single wallet for all operations
- No spending limits
- No multisig

### 3. No Idempotency Protection

NFT minting can duplicate because:
- No pre-mint status check
- No distributed locking
- Queue jobs have random IDs
- No idempotency key header support

### 4. External Services Unprotected

Calls to Solana RPC and IPFS have:
- No circuit breakers
- No timeouts
- No fallback strategies
- Cascading failure risk

---

## Audit File Scores

| File | Score | Status |
|------|-------|--------|
| 01-security.md | 33% | Critical |
| 02-input-validation.md | 23% | Critical |
| 03-error-handling.md | 37% | Critical |
| 04-logging-observability.md | 65% | Needs Work |
| 05-s2s-auth.md | 84% | Good |
| 06-database-integrity.md | 55% | Needs Work |
| 07-idempotency.md | 31% | Critical |
| 08-rate-limiting.md | 10% | Critical |
| 09-multi-tenancy.md | 10% | Critical |
| 10-testing.md | 22% | Critical |
| 11-documentation.md | 18% | Critical |
| 12-health-checks.md | 57% | Needs Work |
| 13-graceful-degradation.md | 27% | Critical |
| 17-queues-background-jobs.md | 33% | Critical |
| 19-configuration-management.md | 21% | Critical |
| 20-deployment-cicd.md | 59% | Needs Work |
| 21-database-migrations.md | 52% | Needs Work |
| 26-blockchain-integration.md | 30% | Critical |
| 31-nft-minting-operations.md | 42% | Critical |
| 36-wallet-security.md | 9% | Critical |
| 37-key-management.md | 84% | Good |

**Average Score: 38%**

---

## Next Steps

1. Complete all P0 items today
2. Review and merge P0 changes
3. Start P1 items tomorrow
4. Schedule P2 for sprint planning
5. Re-run audit after P0/P1 complete
