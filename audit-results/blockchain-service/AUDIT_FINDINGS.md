# Blockchain-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 18
**Total Findings:** 328 (230 FAIL, 98 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 68 | 8 | 76 |
| HIGH | 89 | 42 | 131 |
| MEDIUM | 43 | 31 | 74 |
| LOW | 30 | 17 | 47 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 6 | 5 | 11 |
| 02-input-validation.md | 4 | 7 | 11 |
| 03-error-handling.md | 11 | 7 | 18 |
| 04-logging-observability.md | 15 | 4 | 19 |
| 05-s2s-auth.md | 16 | 7 | 23 |
| 06-database-integrity.md | 11 | 6 | 17 |
| 07-idempotency.md | 17 | 4 | 21 |
| 08-rate-limiting.md | 13 | 5 | 18 |
| 09-multi-tenancy.md | 21 | 8 | 29 |
| 10-testing.md | 17 | 7 | 24 |
| 11-documentation.md | 21 | 7 | 28 |
| 12-health-checks.md | 15 | 5 | 20 |
| 13-graceful-degradation.md | 9 | 7 | 16 |
| 19-configuration-management.md | 5 | 5 | 10 |
| 20-deployment-cicd.md | 4 | 4 | 8 |
| 21-database-migrations.md | 9 | 4 | 13 |
| 36-wallet-security.md | 10 | 2 | 12 |
| 37-key-management.md | 26 | 4 | 30 |

---

## CRITICAL Findings (76)

### From 01-security.md

#### SEC-R6: No hardcoded secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer
- **Evidence:** Hardcoded default secret

#### SEC-EXT8: Keys encrypted at rest
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 External/Blockchain
- **Evidence:** Treasury key plaintext

#### SEC-EXT9: Keys from secure storage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 External/Blockchain
- **Evidence:** No KMS/Vault

### From 02-input-validation.md

#### RD5: Response schema defined
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** No response schemas

#### RD6: additionalProperties false
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** No additionalProperties:false

### From 03-error-handling.md

#### RH3: Not Found handler
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** No 404 handler

#### RH5: RFC 7807 format
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** No RFC 7807

#### RH7: Stack traces not exposed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler
- **Evidence:** Stack traces exposed

#### DB2: Transactions for multi-ops
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Database
- **Evidence:** No DB transactions

#### DS5: Timeout on inter-service
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Distributed Systems
- **Evidence:** No axios timeout

#### Process error handlers
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.6 Process Level
- **Evidence:** Missing unhandledRejection

### From 04-logging-observability.md

#### LC3: Redaction configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Log Configuration
- **Evidence:** No log redaction

#### LC4: Correlation ID middleware
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Log Configuration
- **Evidence:** No correlation ID

#### SD1: Passwords never logged
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Sensitive Data Protection
- **Evidence:** No log redaction

#### SD2: Tokens redacted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Sensitive Data Protection
- **Evidence:** No log redaction

#### SD3: PII fields redacted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Sensitive Data Protection
- **Evidence:** No log redaction

#### SD5: Session tokens redacted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Sensitive Data Protection
- **Evidence:** No log redaction

#### SD8: Request body filtered
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Sensitive Data Protection
- **Evidence:** No log redaction

#### FP1: Fastify logger enabled
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Fastify/Pino
- **Evidence:** Fastify Pino disabled

#### DT1: OpenTelemetry SDK
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Distributed Tracing
- **Evidence:** No OpenTelemetry

#### DT2: Auto-instrumentation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Distributed Tracing
- **Evidence:** No OpenTelemetry

#### DT4: Trace ID in logs
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Distributed Tracing
- **Evidence:** No OpenTelemetry

#### DT5: Context propagation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Distributed Tracing
- **Evidence:** No OpenTelemetry

### From 05-s2s-auth.md

#### Credentials not hardcoded
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Client Auth Config
- **Evidence:** Default secret hardcoded

#### Per-service credentials
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Client Auth Config
- **Evidence:** Shared secret all services

#### Uses HTTPS/TLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Client Request Security
- **Evidence:** HTTP default

#### Per-endpoint rules
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Endpoint Authorization
- **Evidence:** No service ACL

#### Service allowlist
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Endpoint Authorization
- **Evidence:** No service ACL

#### Per-service secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** HMAC Verification
- **Evidence:** Shared secret all services

#### No secrets in source
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Secrets Management
- **Evidence:** Default secret hardcoded

#### Unique secrets per service
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Secrets Management
- **Evidence:** Shared secret all services

### From 06-database-integrity.md

#### Multi-step in transactions
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Transaction Usage
- **Evidence:** No transactions in userWallet

#### Transaction passed through
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Transaction Usage
- **Evidence:** No transactions in userWallet

#### Error handling rollback
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Transaction Usage
- **Evidence:** No transactions in userWallet

#### tenant_id in all queries
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.7 Multi-Tenant Queries
- **Evidence:** No tenant_id in queries

#### Pool sized
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.8 Knex Configuration
- **Evidence:** No pool config

#### SSL/TLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.8 Knex Configuration
- **Evidence:** No SSL/TLS

### From 07-idempotency.md

#### Unique idempotency key
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** NFT Minting
- **Evidence:** `jobId: mint_${ticketId}_${Date.now()}` - Not idempotent!

#### Atomic ticket update
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** NFT Minting
- **Evidence:** Race window between check and update

#### Idempotency-Key header
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket Purchase Flow
- **Evidence:** No API idempotency keys

#### Key validated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket Purchase Flow
- **Evidence:** No API idempotency keys

#### Duplicate returns original
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket Purchase Flow
- **Evidence:** No API idempotency keys

#### Atomic reservation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket Purchase Flow
- **Evidence:** Race conditions in mint

#### Tenant_id in key
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket Purchase Flow
- **Evidence:** No tenant scoping

#### POST supports idempotency
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State-Changing Operations
- **Evidence:** No API idempotency keys

#### Atomic checks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State-Changing Operations
- **Evidence:** Non-atomic DB ops

#### Tenant scoped
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State-Changing Operations
- **Evidence:** No tenant scoping

### From 08-rate-limiting.md

#### Redis storage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Rate Limit Config
- **Evidence:** In-memory rate limiting, No Redis

#### Route-specific limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Rate Limit Config
- **Evidence:** No route-specific limits

#### Custom keyGenerator
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Rate Limit Config
- **Evidence:** No custom keyGenerator

### From 09-multi-tenancy.md

#### FORCE RLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** No FORCE RLS

#### No hardcoded tenant IDs
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Query Patterns
- **Evidence:** Hardcoded `00000000-0000-0000-0000-000000000001`

#### Tenant from verified JWT only
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** Accepts x-tenant-id header (spoofable) and falls back to 'default'

#### Job payloads include tenant_id
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Background Jobs
- **Evidence:** No tenant_id in MintJobData

#### Processor validates tenant
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Background Jobs
- **Evidence:** No tenant in jobs

#### DB context set before job
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Background Jobs
- **Evidence:** No tenant in jobs

#### Bulk validates tenant
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** API Endpoints
- **Evidence:** No bulk validation

### From 10-testing.md

#### Coverage thresholds
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Jest Configuration
- **Evidence:** No coverage thresholds

#### Test scripts configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Package.json
- **Evidence:** No test scripts

#### Jest devDependency
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Package.json
- **Evidence:** Jest missing deps

#### All routes tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Testing
- **Evidence:** No route tests

#### Migrations run before tests
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Database
- **Evidence:** No DB tests

#### Database cleaned between
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Database
- **Evidence:** No DB tests

#### Multi-tenant tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Database
- **Evidence:** No tenant tests

#### RLS policies verified
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Database
- **Evidence:** No tenant tests

#### NFT minting tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Solana Devnet
- **Evidence:** No NFT tests

#### Token transfers tested
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Solana Devnet
- **Evidence:** No NFT tests

### From 11-documentation.md

#### README.md
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Project-Level Docs
- **Evidence:** No README.md

#### ADRs
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Architecture Docs
- **Evidence:** No ADRs

#### OpenAPI/Swagger
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** API Documentation
- **Evidence:** No OpenAPI/Swagger

#### Runbooks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operational Docs
- **Evidence:** No runbooks

#### Incident playbooks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operational Docs
- **Evidence:** No runbooks

#### On-call rotation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operational Docs
- **Evidence:** No runbooks

### From 12-health-checks.md

#### /health/live
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Required Endpoints
- **Evidence:** No /health/live

#### /health/ready
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Required Endpoints
- **Evidence:** No /health/ready

#### /health/startup
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Required Endpoints
- **Evidence:** No /health/startup

#### Event loop monitoring
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Checks
- **Evidence:** No under-pressure

#### Timeouts on dep checks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Checks
- **Evidence:** No query timeouts

#### Query timeout (PostgreSQL)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL Checks
- **Evidence:** No query timeouts

#### All probes (Kubernetes)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Kubernetes
- **Evidence:** Missing all K8s probes

#### @fastify/under-pressure
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Event Loop
- **Evidence:** No under-pressure

### From 13-graceful-degradation.md

#### Jitter added
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Retry Logic
- **Evidence:** No jitter in retry

#### Circuit breaker fallback
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fallback Strategies
- **Evidence:** No fallback strategies

#### Service-level fallbacks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fallback Strategies
- **Evidence:** No fallback strategies

#### LB drain delay
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Graceful Shutdown
- **Evidence:** No LB drain delay

#### Shutdown timeout
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Graceful Shutdown
- **Evidence:** No shutdown timeout

### From 19-configuration-management.md

#### SSL/TLS required (Database)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Database Credentials
- **Evidence:** No DB SSL

#### TLS enabled (Redis)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Redis Credentials
- **Evidence:** No Redis TLS

#### No defaults bypass validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Config Consistency
- **Evidence:** Config defaults bypass validation

#### All critical secrets loaded
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Secrets Manager
- **Evidence:** Wallet key not in secrets manager

#### Production in HSM/secrets
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Solana Wallet Keypairs
- **Evidence:** Wallet key not in secrets manager

### From 20-deployment-cicd.md

#### Cache cleared
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Build Security
- **Evidence:** npm cache not cleaned

#### dumb-init used
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Signal Handling
- **Evidence:** Installed but not in ENTRYPOINT

### From 21-database-migrations.md

#### One change per file
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** File Structure
- **Evidence:** 6 tables in one migration

#### No hardcoded values
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Up Function
- **Evidence:** Hardcoded tenant UUID

#### lock_timeout set
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Performance
- **Evidence:** No lock_timeout

#### Pool settings
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Config
- **Evidence:** No pool settings

#### Pool configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Pool/SSL
- **Evidence:** No pool config

#### SSL for production
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Pool/SSL
- **Evidence:** No SSL

### From 36-wallet-security.md

#### Secret keys in plaintext JSON
- **Status:** CRITICAL FAIL
- **Severity:** CRITICAL
- **Section:** Treasury Wallet
- **Evidence:** Plaintext keys written to JSON file

#### No HSM/KMS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Treasury Wallet
- **Evidence:** No HSM/KMS

#### No multisig
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Treasury Wallet
- **Evidence:** No multisig

#### No spending limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Treasury Wallet
- **Evidence:** No spending limits

### From 37-key-management.md

#### In HSM/KMS
- **Status:** CRITICAL FAIL
- **Severity:** CRITICAL
- **Section:** Private Key Storage
- **Evidence:** Plaintext keys in JSON file

#### FIPS 140-3 Level 3
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Private Key Storage
- **Evidence:** No HSM/KMS

#### Key never leaves HSM
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Private Key Storage
- **Evidence:** No HSM/KMS

#### Per-tx limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Wallet Architecture
- **Evidence:** No spending limits

#### Daily limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Wallet Architecture
- **Evidence:** No spending limits

#### All checks (Multi-Sig/MPC)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Multi-Sig/MPC
- **Evidence:** No multisig

#### All checks (Key Rotation)
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Key Rotation
- **Evidence:** No key rotation

---

## Architecture Issues Summary

### 1. Treasury Keys in Plaintext JSON (CRITICAL - IMMEDIATE ACTION)

The treasury wallet private key is stored as a plaintext JSON file on the filesystem.

**Evidence:**
```typescript
// treasury.ts
const walletData = {
  publicKey: this.publicKey.toString(),
  secretKey: Array.from(this.keypair.secretKey), // PLAINTEXT!
  createdAt: new Date().toISOString()
};
await fs.writeFile(walletPath, JSON.stringify(walletData, null, 2));
```

**Impact:** Anyone with filesystem access owns your treasury. Container escape, backup leak, log aggregator = total loss.

**Required (IMMEDIATE):**
```typescript
// Use AWS KMS for signing
import { KMSClient, SignCommand } from "@aws-sdk/client-kms";

class SecureTreasuryWallet {
  private kms: KMSClient;
  private keyId: string;

  async signTransaction(tx: Transaction): Promise<Transaction> {
    const response = await this.kms.send(new SignCommand({
      KeyId: this.keyId,
      Message: tx.serializeMessage(),
      SigningAlgorithm: "ECDSA_SHA_256"
    }));
    tx.addSignature(this.publicKey, response.Signature!);
    return tx;
  }
}
```

### 2. No Spending Limits (CRITICAL)

There are no per-transaction or daily limits on treasury spending. A bug or compromise can drain everything.

**Required:**
```typescript
class TreasuryWallet {
  private perTxLimit = 10 * LAMPORTS_PER_SOL; // 10 SOL
  private dailyLimit = 100 * LAMPORTS_PER_SOL; // 100 SOL
  private dailySpent = 0;
  
  async transfer(amount: number, destination: PublicKey) {
    if (amount > this.perTxLimit) {
      throw new Error(`Exceeds per-tx limit of ${this.perTxLimit}`);
    }
    if (this.dailySpent + amount > this.dailyLimit) {
      throw new Error(`Exceeds daily limit of ${this.dailyLimit}`);
    }
    
    // Execute transfer
    this.dailySpent += amount;
  }
}
```

### 3. No Multisig (CRITICAL)

Single-key treasury means single point of failure.

**Required:** Implement Solana multisig or use a multisig program like Squads.

### 4. Tenant ID Spoofable (CRITICAL)

Tenant is accepted from header and falls back to a default value.

**Evidence:**
```typescript
// tenant-context.ts
if (!tenantId && request.headers['x-tenant-id']) {
  tenantId = request.headers['x-tenant-id']; // Spoofable!
}
if (!tenantId) {
  tenantId = 'default'; // Falls back to default!
}
```

**Required:**
```typescript
export async function tenantContext(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.user?.tenant_id;
  
  if (!tenantId) {
    return reply.code(401).send({ error: 'Missing tenant context' });
  }
  
  // Validate UUID format
  if (!isUUID(tenantId)) {
    return reply.code(401).send({ error: 'Invalid tenant ID' });
  }
  
  // NEVER accept from header
  // NEVER use a default
  
  request.tenantId = tenantId;
}
```

### 5. Hardcoded Default Tenant UUID (CRITICAL)

Migration has a hardcoded tenant UUID that bypasses isolation.

**Evidence:**
```typescript
table.uuid('tenant_id').notNullable()
  .defaultTo('00000000-0000-0000-0000-000000000001')
```

**Required:**
```typescript
table.uuid('tenant_id').notNullable(); // NO DEFAULT
```

### 6. No DB/Redis TLS (CRITICAL)

Data in transit is unencrypted.

**Required:**
```typescript
// Database
ssl: process.env.NODE_ENV === 'production' ? {
  rejectUnauthorized: true
} : false

// Redis
tls: process.env.NODE_ENV === 'production' ? {} : undefined
```

### 7. Replay Attacks on Wallet Connection (HIGH)

Wallet connection signatures can be replayed.

**Evidence:**
```typescript
const signMessage = message || `Connect wallet to TicketToken: ${userId}`;
// MISSING: nonce, timestamp, expiration
```

**Required:**
```typescript
async generateConnectionNonce(userId: string) {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  
  await redis.set(`wallet:nonce:${nonce}`, userId, 'EX', 300);
  
  const message = `Connect wallet to TicketToken
User: ${userId}
Nonce: ${nonce}
Expires: ${new Date(expiresAt).toISOString()}`;
  
  return { nonce, message, expiresAt };
}

async verifyConnection(nonce: string, signature: string, walletAddress: string) {
  const userId = await redis.get(`wallet:nonce:${nonce}`);
  if (!userId) {
    throw new Error('Invalid or expired nonce');
  }
  
  // Verify signature
  // Delete nonce (one-time use)
  await redis.del(`wallet:nonce:${nonce}`);
}
```

### 8. dumb-init Installed But Not Used (CRITICAL)

Container won't handle signals properly.

**Evidence:**
```dockerfile
RUN apk add --no-cache dumb-init
# But ENTRYPOINT doesn't use it:
ENTRYPOINT ["/app/entrypoint.sh"]
```

**Required:**
```dockerfile
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/entrypoint.sh"]
```

---

## Quick Fix Priority

### P0 - Do Today (Security Critical)

1. **Move treasury key to AWS KMS** - ~4 hours
2. **Add spending limits** - ~2 hours
3. **Fix tenant context middleware** - ~1 hour
4. **Remove hardcoded tenant UUID** - ~30 minutes
5. **Add DB/Redis TLS** - ~1 hour
6. **Fix dumb-init in Dockerfile** - ~5 minutes

### P1 - Do This Week

1. Add wallet connection nonces
2. Implement RLS policies
3. Add idempotency keys
4. Set up health check endpoints
5. Add log redaction

### P2 - Do This Sprint

1. Implement multisig
2. Add OpenTelemetry
3. Write tests
4. Create documentation
5. Set up monitoring

---

## Quick Fix Code Snippets

### Move Treasury to KMS (P0)
```typescript
import { KMSClient, SignCommand, GetPublicKeyCommand } from "@aws-sdk/client-kms";

export class KMSTreasuryWallet {
  private kms: KMSClient;
  private keyId: string;
  private publicKey: PublicKey;
  
  constructor(keyId: string) {
    this.kms = new KMSClient({ region: process.env.AWS_REGION });
    this.keyId = keyId;
  }
  
  async init() {
    const response = await this.kms.send(new GetPublicKeyCommand({
      KeyId: this.keyId
    }));
    // Convert to Solana PublicKey
    this.publicKey = new PublicKey(response.PublicKey!);
  }
  
  async signTransaction(tx: Transaction): Promise<Transaction> {
    const message = tx.serializeMessage();
    
    const response = await this.kms.send(new SignCommand({
      KeyId: this.keyId,
      Message: message,
      MessageType: "RAW",
      SigningAlgorithm: "ECDSA_SHA_256"
    }));
    
    tx.addSignature(this.publicKey, Buffer.from(response.Signature!));
    return tx;
  }
}
```

### Add Spending Limits (P0)
```typescript
interface SpendingLimits {
  perTransaction: number;
  daily: number;
  hourly: number;
}

class RateLimitedTreasury {
  private limits: SpendingLimits = {
    perTransaction: 10 * LAMPORTS_PER_SOL,
    daily: 100 * LAMPORTS_PER_SOL,
    hourly: 25 * LAMPORTS_PER_SOL
  };
  
  private async getSpentAmount(window: 'hour' | 'day'): Promise<number> {
    const key = `treasury:spent:${window}:${this.getWindowKey(window)}`;
    return parseInt(await redis.get(key) || '0');
  }
  
  async validateTransfer(amount: number): Promise<void> {
    if (amount > this.limits.perTransaction) {
      throw new SpendingLimitError('PER_TX_LIMIT', amount, this.limits.perTransaction);
    }
    
    const hourlySpent = await this.getSpentAmount('hour');
    if (hourlySpent + amount > this.limits.hourly) {
      throw new SpendingLimitError('HOURLY_LIMIT', hourlySpent + amount, this.limits.hourly);
    }
    
    const dailySpent = await this.getSpentAmount('day');
    if (dailySpent + amount > this.limits.daily) {
      throw new SpendingLimitError('DAILY_LIMIT', dailySpent + amount, this.limits.daily);
    }
  }
  
  async recordSpend(amount: number): Promise<void> {
    const hourKey = `treasury:spent:hour:${this.getWindowKey('hour')}`;
    const dayKey = `treasury:spent:day:${this.getWindowKey('day')}`;
    
    await redis.incrby(hourKey, amount);
    await redis.expire(hourKey, 3600);
    
    await redis.incrby(dayKey, amount);
    await redis.expire(dayKey, 86400);
  }
}
```

### Fix Tenant Context (P0)
```typescript
export async function tenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // ONLY accept tenant from verified JWT
  const tenantId = request.user?.tenant_id;
  
  if (!tenantId) {
    return reply.code(401).send({
      error: 'MISSING_TENANT',
      message: 'Authentication required with tenant context'
    });
  }
  
  // Validate UUID format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(tenantId)) {
    return reply.code(401).send({
      error: 'INVALID_TENANT',
      message: 'Invalid tenant ID format'
    });
  }
  
  // Set for RLS
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  
  request.tenantId = tenantId;
}
```

### Add Wallet Nonces (P1)
```typescript
export class WalletConnectionService {
  async generateChallenge(userId: string): Promise<WalletChallenge> {
    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    
    const message = [
      'Connect wallet to TicketToken',
      '',
      `User: ${userId}`,
      `Nonce: ${nonce}`,
      `Expires: ${new Date(expiresAt).toISOString()}`,
      '',
      'This signature proves you own this wallet.'
    ].join('\n');
    
    await redis.setex(`wallet:challenge:${nonce}`, 300, JSON.stringify({
      userId,
      expiresAt
    }));
    
    return { nonce, message, expiresAt };
  }
  
  async verifyChallenge(
    nonce: string,
    walletAddress: string,
    signature: string
  ): Promise<{ userId: string }> {
    const data = await redis.get(`wallet:challenge:${nonce}`);
    if (!data) {
      throw new ValidationError('INVALID_NONCE', 'Challenge expired or invalid');
    }
    
    const { userId, expiresAt } = JSON.parse(data);
    
    if (Date.now() > expiresAt) {
      await redis.del(`wallet:challenge:${nonce}`);
      throw new ValidationError('EXPIRED_CHALLENGE', 'Challenge has expired');
    }
    
    // Verify signature
    const message = this.reconstructMessage(userId, nonce, expiresAt);
    const isValid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      new PublicKey(walletAddress).toBytes()
    );
    
    if (!isValid) {
      throw new ValidationError('INVALID_SIGNATURE', 'Signature verification failed');
    }
    
    // Delete nonce (one-time use)
    await redis.del(`wallet:challenge:${nonce}`);
    
    return { userId };
  }
}
```
