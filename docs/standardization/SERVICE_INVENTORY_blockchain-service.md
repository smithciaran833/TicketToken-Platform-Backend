# blockchain-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how blockchain-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** HMAC-SHA256 signature verification with tight replay window
**Files Examined:**
- `src/middleware/internal-auth.ts` - HMAC authentication and signature generation

### HMAC Authentication

**How it works:**
- Headers required: `x-internal-service`, `x-internal-signature`, `x-timestamp`
- Payload format: `serviceName:timestamp:body` (includes request body)
- **60-second replay window** (configurable via `HMAC_REPLAY_WINDOW_MS`)
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Service allowlist validation

**Allowed Services:**
- payment-service
- ticket-service
- order-service
- minting-service
- transfer-service
- marketplace-service

**Security Audit Fixes Applied:**
- #16: Reduced HMAC replay window from 5 minutes to 60 seconds
- #24: Added internal service auth (HMAC-SHA256)
- #25: Proper request validation middleware
- #26-30: Timing-safe comparison

**Code Example:**
```typescript
// From middleware/internal-auth.ts
const HMAC_REPLAY_WINDOW_MS = parseInt(
  process.env.HMAC_REPLAY_WINDOW_MS || '60000', // Default 60 seconds
  10
);

export async function validateInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const internalService = request.headers['x-internal-service'] as string;
  const signature = request.headers['x-internal-signature'] as string;
  const timestamp = request.headers['x-timestamp'] as string;

  // Validate the service is in allow list
  if (!ALLOWED_SERVICES.includes(internalService)) {
    throw AuthenticationError.forbidden('internal-service');
  }

  // Validate timestamp is within validity window
  const requestTime = parseInt(timestamp, 10);
  const timeDiff = Math.abs(Date.now() - requestTime);

  if (isNaN(requestTime) || timeDiff > HMAC_REPLAY_WINDOW_MS) {
    throw new AuthenticationError('Request timestamp expired or invalid', 401);
  }

  // Build signature payload: service:timestamp:body
  const body = JSON.stringify(request.body || {});
  const payload = `${internalService}:${timestamp}:${body}`;

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )) {
    throw AuthenticationError.invalidToken();
  }

  request.internalService = internalService;
}
```

### Outgoing Signature Generation

```typescript
// From middleware/internal-auth.ts
export function generateInternalSignature(
  serviceName: string,
  body: any,
  secret?: string
): { signature: string; timestamp: string } {
  const timestamp = Date.now().toString();
  const payload = `${serviceName}:${timestamp}:${JSON.stringify(body || {})}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return { signature, timestamp };
}

export function buildInternalHeaders(body: any): Record<string, string> {
  const { signature, timestamp } = generateInternalSignature('blockchain-service', body);

  return {
    'x-internal-service': 'blockchain-service',
    'x-internal-signature': signature,
    'x-timestamp': timestamp,
    'Content-Type': 'application/json'
  };
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** `/internal/` prefix with HMAC authentication
**Files Examined:**
- `src/routes/internal-mint.routes.ts`

**Endpoints Found:**

| Endpoint | Method | Description | Used By |
|----------|--------|-------------|---------|
| `/internal/mint-tickets` | POST | Request NFT minting for tickets | payment-service, order-service |

**Auth Applied:** Uses `internalAuthMiddleware` + `validateMintRequest` preHandlers

**Code Example:**
```typescript
// From routes/internal-mint.routes.ts
fastify.post('/internal/mint-tickets', {
  preHandler: [internalAuthMiddleware, validateMintRequest]
}, async (request, reply) => {
  const body = request.body as {
    ticketIds: string[];
    eventId: string;
    userId: string;
    queue?: string;
  };

  // Forward to minting service with proper authentication
  const timestamp = Date.now().toString();
  const payload = `blockchain-service:${timestamp}:${JSON.stringify(requestBody)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const response = await axios.post(`${mintingUrl}/internal/mint`, requestBody, {
    headers: {
      'x-internal-service': 'blockchain-service',
      'x-timestamp': timestamp,
      'x-internal-signature': signature,
    }
  });

  return response.data;
});
```

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** InternalServiceClient with circuit breakers, HTTPS enforcement, retries
**Files Examined:**
- `src/services/internal-client.ts` - Full-featured internal HTTP client
- `src/config/services.ts` - Service URL configuration
- `src/routes/internal-mint.routes.ts` - Direct axios calls for minting

### Internal Service Client

**Features:**
- **TLS Enforcement:** HTTPS required in production (HTTP fails fast)
- **TLS Verification:** Configurable via `INTERNAL_TLS_REJECT_UNAUTHORIZED`
- **Circuit Breakers:** Per-service with threshold of 5 failures, 60s reset
- **Retries:** Exponential backoff (3 attempts by default)
- **Connection Pooling:** HTTP/HTTPS agents with keepAlive
- **Request Tracing:** X-Correlation-ID, X-Request-ID, X-Tenant-ID headers
- **Timeout:** 30s default (configurable)

**Pre-configured Clients:**
| Client | Target Service |
|--------|---------------|
| `mintingServiceClient` | minting-service:3010 |
| `orderServiceClient` | order-service:3003 |
| `eventServiceClient` | event-service:3004 |
| `ticketServiceClient` | ticket-service:3002 |
| `authServiceClient` | auth-service:3001 |
| `notificationServiceClient` | notification-service:3006 |

**Code Example:**
```typescript
// From services/internal-client.ts
export class InternalServiceClient {
  private serviceName: string;
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor(serviceName: string, baseUrl: string) {
    this.serviceName = serviceName;
    this.baseUrl = baseUrl;
    this.circuitBreaker = getCircuitBreaker(serviceName);

    // AUDIT FIX #27: Validate URL on construction
    validateUrl(baseUrl, serviceName);
  }

  private async request<T>(path: string, options: RequestOptions): Promise<InternalResponse<T>> {
    return this.circuitBreaker.execute(async () => {
      const response = await makeRequest<T>(url, options);
      return response;
    });
  }
}

// HTTPS enforcement in production
function validateUrl(url: string, serviceName: string): void {
  const parsed = new URL(url);

  if (isProduction && parsed.protocol === 'http:' && !isLocalhost(url)) {
    throw new Error(
      `SECURITY: HTTP is not allowed in production for ${serviceName}. ` +
      `URL ${url} must use HTTPS.`
    );
  }
}
```

### Shared Library Client

The mint queue also uses the shared ticketServiceClient:

```typescript
// From queues/mintQueue.ts
import { ticketServiceClient } from '@tickettoken/shared/clients';

// Update ticket status via service client
await ticketServiceClient.updateStatus(ticketId, ticketStatus, ctx);

// Update ticket NFT data via service client
await ticketServiceClient.updateNft(ticketId, {
  nftMintAddress: data.mintAddress,
  metadataUri: data.metadataUri,
  nftTransferSignature: data.signature,
  isMinted: true,
  mintedAt: new Date().toISOString(),
}, ctx);
```

---

## Category 4: Message Queues

**Implementation:** Bull (Redis-backed) for job processing
**Files Examined:**
- `src/config/queue.ts` - Queue configuration
- `src/queues/mintQueue.ts` - NFT minting queue
- `src/queues/baseQueue.ts` - Base queue class

### Queue Configuration

**Library:** Bull (Redis-backed)
**TLS Support:** Via centralized Redis config (`redis.ts`)

**Configured Queues:**

| Queue | Concurrency | Rate Limit | Purpose |
|-------|-------------|------------|---------|
| `nft-minting` | 5 | 10 ops/sec | Mint NFT tickets |
| `nft-transfer` | 10 | 20 ops/sec | Transfer NFT ownership |
| `nft-burn` | 3 | 5 ops/sec | Burn/invalidate NFTs |

**Default Job Options:**
```typescript
{
  removeOnComplete: 100,  // Keep last 100 completed jobs
  removeOnFail: 500,      // Keep last 500 failed jobs
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000  // Start with 2s, exponential
  }
}
```

### MintQueue Implementation

**Features:**
- **Distributed Locking:** Redis-based locks prevent concurrent mints for same ticket
- **Idempotency:** Deterministic job ID based on `tenantId:ticketId`
- **Circuit Breaker:** Wraps Metaplex operations
- **Blockchain-First Pattern:** Confirms on-chain THEN updates database
- **RPC Failover:** Multiple Solana RPC endpoints with automatic failover

**Audit Fixes Applied:**
- #86: Real MetaplexService.mintNFT() (not simulation)
- #87: Real blockchain data written to DB
- #89: Confirm on-chain THEN update DB

**Code Example:**
```typescript
// From queues/mintQueue.ts
export class MintQueue extends BaseQueue {
  constructor() {
    super('nft-minting', {
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000 // 5 seconds
        },
        removeOnComplete: 50,
        removeOnFail: 100
      }
    });
  }

  async addMintJob(
    ticketId: string,
    tenantId: string,
    userId: string,
    eventId: string,
    metadata: NFTMetadataInput
  ): Promise<any> {
    // Generate deterministic job ID for idempotency
    const jobId = `mint:${tenantId}:${ticketId}`;

    return await this.addJob({
      ticketId, tenantId, userId, eventId, metadata
    }, { jobId });
  }
}
```

**Mint Flow:**
1. Acquire distributed lock for `ticketId`
2. Check idempotency (already minted?)
3. Update ticket status to `MINTING`
4. Call `MetaplexService.mintNFT()` via circuit breaker
5. Wait for `finalized` confirmation (not just `confirmed`)
6. **Only after confirmation:** Update DB with real signature, tokenId, slot
7. Mark ticket as `MINTED` with real on-chain data
8. If confirmation fails: Mark as `MINT_FAILED`, do NOT write fake data
9. Release distributed lock

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | HMAC-SHA256 with 60s replay window | Service allowlist, timing-safe |
| Internal Endpoints | `/internal/mint-tickets` | Proxies to minting-service |
| HTTP Client (Outgoing) | InternalServiceClient + shared client | Circuit breakers, HTTPS enforcement |
| Message Queues | Bull (Redis) | 3 queues for minting, transfer, burn |

**Key Characteristics:**
- blockchain-service acts as a **coordination layer** for blockchain operations
- Uses Bull queues for reliable, retryable job processing
- **Blockchain-first pattern:** Never writes to DB until on-chain confirmation
- Distributed locking prevents double-minting
- Circuit breakers protect against Solana RPC failures
- RPC failover with multiple endpoints for resilience
- Tight 60-second HMAC replay window (stricter than other services)
