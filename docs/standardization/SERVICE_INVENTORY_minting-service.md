# minting-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how minting-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Triple system - Internal HMAC + JWT for admin + Webhook signatures
**Files Examined:**
- `src/middleware/internal-auth.ts` - Internal service HMAC authentication
- `src/middleware/admin-auth.ts` - JWT authentication for admin endpoints
- `src/routes/webhook.ts` - Webhook signature verification

### System 1: Internal Service HMAC Authentication

**How it works:**
- Headers required: `x-internal-service`, `x-internal-signature`, `x-timestamp`
- Payload format: `serviceName:timestamp:body`
- 5-minute replay window
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Service allowlist validation
- No hardcoded secrets - fails fast if INTERNAL_SERVICE_SECRET not configured

**Allowed Services:**
- payment-service
- ticket-service
- order-service
- blockchain-service

**Code Example:**
```typescript
// From middleware/internal-auth.ts
export async function validateInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const internalService = request.headers['x-internal-service'] as string;
  const signature = request.headers['x-internal-signature'] as string;
  const timestamp = request.headers['x-timestamp'] as string;

  // Validate the service is allowed
  const allowedServices = ['payment-service', 'ticket-service', 'order-service', 'blockchain-service'];
  if (!allowedServices.includes(internalService)) {
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Service not authorized'
    });
  }

  // Get secret from environment - MUST be configured
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    logger.error('INTERNAL_SERVICE_SECRET not configured');
    return reply.code(500).send({
      error: 'CONFIGURATION_ERROR',
      message: 'Service authentication not properly configured'
    });
  }

  // Check timestamp is within 5 minutes
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Request expired'
    });
  }

  // Verify signature (HMAC-SHA256 of service:timestamp:body)
  const body = JSON.stringify(request.body);
  const payload = `${internalService}:${timestamp}:${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Check length first (prevents timing leak)
  if (signatureBuffer.length !== expectedBuffer.length) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid signature' });
  }

  // Constant-time comparison
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid signature' });
  }

  request.internalService = internalService;
}
```

### System 2: JWT Authentication (Admin Endpoints)

**How it works:**
- Standard JWT verification with jsonwebtoken library
- Extracts user from Bearer token
- Used in combination with internal auth for admin-level operations
- No algorithm whitelist (gap - should be added)

**Role-Based Middleware:**

| Middleware | Purpose |
|------------|---------|
| `authMiddleware` | JWT token verification |
| `requireAdmin` | Requires admin, super_admin, or platform_admin role |
| `requirePermission(perm)` | Requires specific permission (admins bypass) |

**Code Example:**
```typescript
// From middleware/admin-auth.ts
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = authHeader.split(' ')[1];

  // Get JWT secret - MUST be configured
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return reply.code(500).send({
      error: 'CONFIGURATION_ERROR',
      message: 'Authentication not properly configured'
    });
  }

  const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

  request.user = {
    id: decoded.sub,
    tenant_id: decoded.tenant_id,
    email: decoded.email,
    role: decoded.role,
    permissions: decoded.permissions
  };
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const adminRoles = ['admin', 'super_admin', 'platform_admin'];

  if (!adminRoles.includes(request.user.role)) {
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }
}
```

### System 3: Webhook Signature Verification

**Supported Webhooks:**

| Webhook | Algorithm | Timestamp Window | Payload Format |
|---------|-----------|------------------|----------------|
| Payment Complete | HMAC-SHA256 | 5 minutes | `timestamp:body` |
| Stripe | HMAC-SHA256 | 5 minutes (300s) | `timestamp.body` |

**Code Example (Payment Webhook):**
```typescript
// From routes/webhook.ts
function validateWebhookSignature(request: FastifyRequest): boolean {
  const signature = request.headers['x-webhook-signature'] as string;
  const timestamp = request.headers['x-webhook-timestamp'] as string;

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    logger.error('WEBHOOK_SECRET not configured');
    return false;
  }

  // Check timestamp is within 5 minutes (replay attack protection)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return false;
  }

  // Calculate expected signature (timestamp + body)
  const body = JSON.stringify(request.body);
  const payload = `${timestamp}:${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Webhook Idempotency

Webhooks are protected by Redis-based idempotency:

```typescript
// From middleware/webhook-idempotency.ts
const WEBHOOK_TTL_SECONDS = 86400; // 24 hours
const WEBHOOK_KEY_PREFIX = 'webhook:processed:';

export async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

export async function markWebhookProcessed(eventId: string, metadata?: any): Promise<void> {
  const redis = getRedisClient();
  const key = `${WEBHOOK_KEY_PREFIX}${eventId}`;
  await redis.setex(key, WEBHOOK_TTL_SECONDS, JSON.stringify(metadata));
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** `/internal/` prefix with HMAC + JWT authentication
**Files Examined:**
- `src/routes/internal-mint.ts`

**Endpoints Found:**

| Endpoint | Method | Rate Limit | Description |
|----------|--------|------------|-------------|
| `/internal/mint` | POST | 10/min | Single/multi ticket mint (max 10 tickets) |
| `/internal/mint/batch` | POST | 5/min | Batch mint (max 100 tickets) |
| `/internal/mint/status/:ticketId` | GET | 60/min | Get mint status |

**Auth Applied:** All endpoints use `[validateInternalRequest, authMiddleware]` preHandlers

**Security Features:**
- **Tenant from JWT:** Tenant context extracted from verified JWT, NOT from request body
- **Tenant mismatch warning:** Logs warning if body tenantId differs from JWT tenantId
- **Batch size limits:** Single mint max 10, batch mint max 100 tickets

**Code Example:**
```typescript
// From routes/internal-mint.ts
fastify.post<{ Body: InternalMintRequest }>(
  '/internal/mint',
  {
    ...SINGLE_MINT_RATE_LIMIT,
    preHandler: [validateInternalRequest, authMiddleware]
  },
  async (request, reply) => {
    const validation = internalMintSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten()
      });
    }

    const { ticketIds, eventId, userId, queue, orderId } = validation.data;

    // Enforce maximum tickets per single request
    if (ticketIds.length > MAX_SINGLE_MINT_TICKETS) {
      return reply.code(400).send({
        success: false,
        error: 'Batch size exceeds maximum for single mint',
        code: 'BATCH_SIZE_EXCEEDED',
        maxAllowed: MAX_SINGLE_MINT_TICKETS,
        suggestion: `Use /internal/mint/batch for larger batches (up to ${MAX_BATCH_SIZE} tickets)`
      });
    }

    // SECURITY: Extract tenant from verified JWT, NOT from request body
    const tenantId = request.user?.tenant_id;

    if (!tenantId) {
      return reply.code(401).send({
        success: false,
        error: 'Missing tenant context in JWT'
      });
    }

    // Warn if body tenantId differs from JWT tenantId (potential attack or bug)
    if (validation.data.tenantId && validation.data.tenantId !== tenantId) {
      logger.warn('Tenant ID mismatch: body differs from JWT', {
        bodyTenantId: validation.data.tenantId,
        jwtTenantId: tenantId,
        service: request.internalService
      });
    }

    // Process minting...
  }
);
```

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** `@tickettoken/shared/clients` + Solana SDK + IPFS
**Files Examined:**
- `src/services/MintingOrchestrator.ts`
- `src/services/MetadataService.ts`
- `src/services/DASClient.ts`

### Shared Library Clients

| Client | Purpose |
|--------|---------|
| `eventServiceClient` | Get event PDA for blockchain registration |
| `ticketServiceClient` | Update ticket NFT data after minting |

**Code Example:**
```typescript
// From services/MintingOrchestrator.ts
import { eventServiceClient, ticketServiceClient } from '@tickettoken/shared/clients';
import type { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

function createRequestContext(tenantId: string, userId?: string): RequestContext {
  return {
    tenantId,
    userId: userId || 'system',
    traceId: `mint-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  };
}

// Get event PDA for blockchain registration
const ctx = createRequestContext(tenantId, ticketData.userId);
const eventPdaResponse = await eventServiceClient.getEventPda(ticketData.eventId, ctx);

// Update ticket with NFT data
await ticketServiceClient.updateNft(ticketId, {
  nftMintAddress: mintResult.mintAddress,
  nftTransferSignature: mintResult.signature,
  metadataUri: mintResult.metadataUri,
  isMinted: true,
  mintedAt: new Date().toISOString(),
}, ctx);
```

### Solana/Blockchain Connections

| Component | Purpose |
|-----------|---------|
| `@solana/web3.js` | Solana RPC connection |
| `@coral-xyz/anchor` | Anchor program interaction |
| `RealCompressedNFT` | Compressed NFT minting via Bubblegum |
| `DASClient` | Digital Asset Standard API for asset verification |

### IPFS Integration

**Purpose:** Upload ticket metadata for NFT

```typescript
// From services/MetadataService.ts
export async function uploadToIPFS(metadata: TicketMetadata): Promise<string> {
  // Upload to IPFS (Pinata/nft.storage)
  // Returns IPFS URI for NFT metadata
}
```

---

## Category 4: Message Queues

**Implementation:** Bull (Redis-backed) with Dead Letter Queue
**Files Examined:**
- `src/queues/mintQueue.ts`
- `src/workers/mintingWorker.ts`

### Queue Configuration

**Library:** Bull (Redis-backed)

**Queues:**

| Queue | Name | Purpose |
|-------|------|---------|
| Main | `ticket-minting` | Primary minting jobs |
| Retry | `ticket-minting-retry` | Failed job retries |
| DLQ | `minting-dlq` | Permanently failed jobs |

**Default Job Options:**
```typescript
const DEFAULT_JOB_OPTIONS: JobOptions = {
  timeout: 300000,           // 5 minutes max execution time
  attempts: 3,               // Maximum retry attempts
  backoff: {
    type: 'exponential',
    delay: 2000              // 2 second base delay
  },
  removeOnComplete: 100,     // Keep last 100 completed jobs
  removeOnFail: 500          // Keep last 500 failed jobs
};
```

### Concurrency & Rate Limiting

| Setting | Value | Configurable Via |
|---------|-------|------------------|
| Concurrency | 5 | `MINT_CONCURRENCY` |
| Rate Limit | 10 ops/sec | `QUEUE_RATE_MAX`, `QUEUE_RATE_DURATION` |
| Max Queue Size | 10,000 | `MAX_QUEUE_SIZE` |
| High Water Mark | 5,000 | `QUEUE_HIGH_WATER_MARK` |

### Idempotency

Jobs use deterministic IDs to prevent duplicates:

```typescript
// Generate deterministic job ID from ticket and tenant
function generateJobId(tenantId: string, ticketId: string): string {
  return `mint-${tenantId}-${ticketId}`;
}

// Check if job already exists before adding
const existingJob = await mintQueue.getJob(jobId);
if (existingJob) {
  const state = await existingJob.getState();
  if (state === 'waiting' || state === 'active' || state === 'delayed') {
    return existingJob; // Return existing job
  }
}
```

### Dead Letter Queue

Jobs move to DLQ after exhausting retries:

```typescript
// From queues/mintQueue.ts
async function moveJobToDLQ(job: Job, error: Error): Promise<void> {
  const dlqData: DLQJobData = {
    originalJobId: job.id,
    data: job.data as TicketMintData,
    error: error.message,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade,
    reason: categorizeError(error.message)
  };

  await dlq.add('failed-mint', dlqData, {
    attempts: 1,               // No retries for DLQ
    removeOnComplete: false,   // Never remove from DLQ
    removeOnFail: false
  });
}

function categorizeError(errorMessage: string): string {
  if (errorMessage.includes('Insufficient wallet balance')) return 'insufficient_balance';
  if (errorMessage.includes('IPFS')) return 'ipfs_failure';
  if (errorMessage.includes('Transaction failed')) return 'transaction_failure';
  if (errorMessage.includes('timeout')) return 'timeout';
  if (errorMessage.includes('Bubblegum')) return 'bubblegum_error';
  if (errorMessage.includes('rate limit')) return 'rate_limited';
  return 'unknown';
}
```

### Stale Job Detection

Periodic check for stuck jobs:

| Threshold | Value | Configurable Via |
|-----------|-------|------------------|
| Active job stale | 10 minutes | `STALE_ACTIVE_JOB_THRESHOLD_MS` |
| Waiting job stale | 30 minutes | `STALE_WAITING_JOB_THRESHOLD_MS` |
| Check interval | 60 seconds | `STALE_JOB_CHECK_INTERVAL_MS` |

```typescript
export function startStaleJobDetection(): void {
  staleJobCheckInterval = setInterval(async () => {
    await detectStaleJobs();
    await updateQueueMetrics();
  }, STALE_JOB_CHECK_INTERVAL_MS);
}
```

### Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `minting_queue_depth` | Gauge | queue, state |
| `minting_stalled_jobs_total` | Counter | queue, action |
| `minting_stale_jobs_total` | Counter | queue, state, action |
| `minting_job_duration_seconds` | Histogram | queue, status |
| `minting_dlq_jobs` | Gauge | reason |
| `minting_worker_jobs_processed_total` | Counter | status |
| `minting_worker_errors_total` | Counter | type |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | HMAC + JWT + Webhook signatures | 5-min replay, timing-safe |
| Internal Endpoints | `/internal/mint`, `/internal/mint/batch`, `/internal/mint/status/:ticketId` | HMAC + JWT preHandlers |
| HTTP Client (Outgoing) | `@tickettoken/shared/clients` + Solana SDK | eventServiceClient, ticketServiceClient |
| Message Queues | Bull (Redis) | 3 queues, DLQ, stale detection |

**Key Characteristics:**
- minting-service is the **NFT minting orchestrator** for compressed NFTs on Solana
- Uses distributed locking to prevent concurrent mints for the same ticket
- Idempotent job processing with deterministic job IDs
- Dead Letter Queue for forensics and manual requeue
- Stale job detection with configurable thresholds
- Comprehensive Prometheus metrics for monitoring
- Tenant context always from JWT, never from request body

**Security Features:**
- HMAC-SHA256 with timing-safe comparison
- Service allowlist for internal requests
- No hardcoded secrets - fails fast if not configured
- Webhook idempotency via Redis (24-hour TTL)
- Tenant validation from JWT prevents spoofing
- Length check before timingSafeEqual prevents timing leaks

**Standardization Gap:**
- JWT authentication in `admin-auth.ts` does not specify algorithm whitelist

