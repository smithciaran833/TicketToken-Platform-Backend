# transfer-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how transfer-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for users + HMAC-SHA256 for internal services
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/internal-auth.ts` - Internal service HMAC authentication

### System 1: JWT Authentication (User Requests)

**How it works:**
- Comprehensive algorithm whitelist (no 'none' algorithm)
- JWKS support for RS256 (asymmetric keys)
- Issuer and audience validation
- Clock tolerance: 5 minutes (300 seconds)
- Required claims: `sub` (subject), `tenant_id`

**Audit Fixes Applied:**
- SEC-H1: JWT algorithm not specified → Explicit whitelist
- S2S-H1: No JWT algorithm enforcement → Whitelist allowed algorithms
- S2S-H2: No issuer validation → Validate issuer claim
- S2S-H3: No audience validation → Validate audience claim
- S2S-H7: Shared JWT_SECRET → Support per-service secrets
- S2S-H8: Consider RS256 over HS256 → Support both with preference

**Allowed Algorithms:**
```typescript
// From middleware/auth.middleware.ts
export const ALLOWED_ALGORITHMS: Algorithm[] = [
  'RS256',   // RSA-SHA256 (asymmetric - preferred)
  'RS384',   // RSA-SHA384
  'RS512',   // RSA-SHA512
  'ES256',   // ECDSA-SHA256
  'ES384',   // ECDSA-SHA384
  'ES512',   // ECDSA-SHA512
  'HS256',   // HMAC-SHA256 (symmetric)
  'HS384',   // HMAC-SHA384
  'HS512'    // HMAC-SHA512
];
```

**JWT Configuration:**
```typescript
// From middleware/auth.middleware.ts
export const JWT_CONFIG = {
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  audience: process.env.JWT_AUDIENCE || 'tickettoken-services',
  jwksUri: process.env.JWKS_URI || 'https://auth.tickettoken.io/.well-known/jwks.json',
  clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '300', 10),
  preferredAlgorithm: (process.env.JWT_ALGORITHM as Algorithm) || 'RS256'
};
```

**JWKS Client (for RS256):**
```typescript
// From middleware/auth.middleware.ts
let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    jwksClient = jwksRsa({
      jwksUri: JWT_CONFIG.jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }
  return jwksClient;
}
```

**Token Verification:**
```typescript
// From middleware/auth.middleware.ts
async function verifyToken(token: string): Promise<AuthenticatedUser> {
  // First, decode without verification to check algorithm
  const decoded = jwt.decode(token, { complete: true });

  const algorithm = decoded.header.alg as Algorithm;

  // Enforce algorithm whitelist
  if (!ALLOWED_ALGORITHMS.includes(algorithm)) {
    logger.warn('Rejected token with disallowed algorithm', { algorithm });
    throw new UnauthorizedError(`Algorithm ${algorithm} not allowed`);
  }

  // Get appropriate secret/key
  const secretOrKey = await getSecretOrKey(algorithm);

  // Configure strict verification options
  const verifyOptions: VerifyOptions = {
    algorithms: [algorithm],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    clockTolerance: JWT_CONFIG.clockTolerance,
    complete: false
  };

  return new Promise((resolve, reject) => {
    jwt.verify(token, secretOrKey, verifyOptions, (err, decoded) => {
      // Validation logic...
    });
  });
}
```

### Role and Permission Middleware

| Middleware | Purpose |
|------------|---------|
| `authenticate` | Main JWT authentication |
| `optionalAuth` | Optional authentication (doesn't fail without token) |
| `requireRole(...roles)` | Require specific role(s) |
| `requirePermission(...perms)` | Require specific permission(s) |
| `requireOwnerOrAdmin(param)` | Require owner or admin access |

### System 2: Internal Service HMAC Authentication

**How it works:**
- Headers required: `x-internal-service`, `x-internal-signature`, `x-timestamp`
- Payload format: `serviceName:timestamp:body`
- **60-second replay window** (configurable via `HMAC_REPLAY_WINDOW_MS`)
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Service allowlist validation

**Allowed Services:**
```typescript
// From middleware/internal-auth.ts
export const ALLOWED_SERVICES = [
  'api-gateway',
  'payment-service',
  'ticket-service',
  'order-service',
  'minting-service',
  'marketplace-service',
  'blockchain-service',
  'notification-service',
  'event-service',
  'scanning-service'
];
```

**Audit Fixes Applied:**
- S2S-2: No service identity validation → HMAC-SHA256 signature verification
- S2S-3: No service ACL → Allowed services list
- S2S-H1: No timestamp validation → Replay attack prevention
- S2S-H2: No request ID propagation → X-Request-ID pass-through

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

  // Validate service is in allow list
  if (!ALLOWED_SERVICES.includes(internalService)) {
    return reply.status(403).send({
      error: 'Service not authorized',
      code: 'INVALID_SERVICE'
    });
  }

  // Validate timestamp within window
  const requestTime = parseInt(timestamp, 10);
  const timeDiff = Math.abs(Date.now() - requestTime);

  if (isNaN(requestTime) || timeDiff > HMAC_REPLAY_WINDOW_MS) {
    return reply.status(401).send({
      error: 'Request timestamp expired or invalid',
      code: 'TIMESTAMP_EXPIRED'
    });
  }

  // Build signature payload
  const body = JSON.stringify(request.body || {});
  const payload = `${internalService}:${timestamp}:${body}`;

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return reply.status(401).send({
      error: 'Invalid signature',
      code: 'INVALID_SIGNATURE'
    });
  }

  request.internalService = internalService;
  request.isInternalRequest = true;
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/transfer.routes.ts`
- `src/app.ts`

**Findings:**
- transfer-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT authentication
- Internal services call transfer-service via standard API with HMAC authentication

**Public API Routes:**

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/health` | GET | None | Health check |
| `/health/ready` | GET | None | Kubernetes readiness probe |
| `/health/live` | GET | None | Kubernetes liveness probe |
| `/health/db` | GET | None | Database health check |
| `/metrics` | GET | None | Prometheus metrics |
| `/api/v1/transfers/gift` | POST | JWT | Create gift transfer |
| `/api/v1/transfers/:transferId/accept` | POST | JWT | Accept transfer |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Shared service clients + axios + Metaplex SDK
**Files Examined:**
- `src/services/transfer.service.ts` - Uses shared clients
- `src/services/blockchain-transfer.service.ts` - Uses shared clients + Metaplex
- `src/services/webhook.service.ts` - Uses axios for webhooks
- `src/services/nft.service.ts` - Uses Metaplex SDK
- `src/middleware/internal-auth.ts` - Signature generation for outgoing calls

### Shared Service Clients (HMAC-authenticated)

**Library:** `@tickettoken/shared/clients`

```typescript
// From services/transfer.service.ts
import { ticketServiceClient, authServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

function createRequestContext(tenantId: string): RequestContext {
  return {
    tenantId,
    traceId: `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}
```

**Services Called:**

| Client | Methods Used | Purpose |
|--------|--------------|---------|
| `ticketServiceClient` | `getTicketForTransfer()`, `transferTicket()`, `updateNft()`, `getTicketFull()` | Ticket operations |
| `authServiceClient` | `getOrCreateUser()` | User lookup/creation |

**Code Example (Ticket Service):**
```typescript
// From services/transfer.service.ts
const ctx = createRequestContext(tenantId);

// Verify ticket ownership and transferability
const ticketResult = await ticketServiceClient.getTicketForTransfer(ticketId, fromUserId, ctx);

if (!ticketResult.ticket) {
  throw new TicketNotFoundError();
}

if (!ticketResult.transferable) {
  throw new TicketNotTransferableError(ticketResult.reason);
}

// Transfer ticket ownership
await ticketServiceClient.transferTicket(
  transfer.ticket_id,
  transfer.to_user_id,
  ctx,
  `Gift transfer from ${transfer.from_user_id}`
);
```

**Code Example (Auth Service):**
```typescript
// From services/transfer.service.ts
// Get or create recipient user
const userResult = await authServiceClient.getOrCreateUser(toEmail, ctx, 'gift_transfer');
const toUserId = userResult.userId;
```

### Internal Headers Generation

**For making HMAC-signed outgoing calls:**

```typescript
// From middleware/internal-auth.ts
export function generateInternalSignature(
  serviceName: string,
  body: any,
  secret?: string
): { signature: string; timestamp: string } {
  const actualSecret = secret || process.env.INTERNAL_SERVICE_SECRET;
  const timestamp = Date.now().toString();
  const payload = `${serviceName}:${timestamp}:${JSON.stringify(body || {})}`;

  const signature = crypto
    .createHmac('sha256', actualSecret)
    .update(payload)
    .digest('hex');

  return { signature, timestamp };
}

export function buildInternalHeaders(body: any, requestId?: string): Record<string, string> {
  const { signature, timestamp } = generateInternalSignature('transfer-service', body);

  return {
    'x-internal-service': 'transfer-service',
    'x-internal-signature': signature,
    'x-timestamp': timestamp,
    'Content-Type': 'application/json',
    ...(requestId && { 'x-request-id': requestId })
  };
}
```

### Webhook Service (axios)

**Purpose:** Send webhook notifications to external endpoints

```typescript
// From services/webhook.service.ts
private async deliverWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload
): Promise<void> {
  // Generate signature
  const signature = this.generateSignature(payload, subscription.secret);

  // Send webhook
  const response = await axios.post(subscription.url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': payload.event,
      'User-Agent': 'TicketToken-Webhooks/1.0'
    },
    timeout: 5000
  });
}

private generateSignature(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

// Verify incoming webhooks (timing-safe)
static verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Webhook Events:**
| Event | Trigger |
|-------|---------|
| `transfer.created` | New transfer initiated |
| `transfer.accepted` | Transfer accepted by recipient |
| `transfer.rejected` | Transfer rejected |
| `transfer.completed` | Transfer fully completed |
| `transfer.failed` | Transfer failed |
| `transfer.cancelled` | Transfer cancelled |
| `blockchain.confirmed` | Blockchain transaction confirmed |

### NFT Service (Metaplex SDK)

**Purpose:** Execute NFT transfers on Solana blockchain

```typescript
// From services/nft.service.ts
import { PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

export class NFTService {
  private metaplex: Metaplex;

  async transferNFT(params: TransferNFTParams): Promise<TransferNFTResult> {
    const mint = new PublicKey(mintAddress);
    const from = new PublicKey(fromWallet);
    const to = new PublicKey(toWallet);

    // Find NFT
    const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });

    // Execute transfer
    const { response } = await this.metaplex.nfts().transfer({
      nftOrSft: nft,
      fromOwner: from,
      toOwner: to
    });

    return {
      success: true,
      signature: response.signature,
      explorerUrl: getExplorerUrl(response.signature)
    };
  }

  async verifyOwnership(mintAddress: string, walletAddress: string): Promise<boolean> {
    const tokenAccounts = await this.metaplex.connection.getTokenAccountsByOwner(
      wallet,
      { mint: mint }
    );
    return tokenAccounts.value.length > 0;
  }
}
```

---

## Category 4: Message Queues

**Implementation:** None - uses Redis-backed idempotency
**Files Examined:**
- Searched for: `amqplib`, `rabbitmq`, `bull`, `bullmq`, `pg-boss`
- `src/middleware/idempotency.ts`

**Findings:**
- transfer-service does **not use any message queues**
- Uses Redis-backed idempotency middleware for request deduplication
- All operations are synchronous HTTP requests + database transactions

### Idempotency Middleware

**Purpose:** Prevent duplicate transfer operations

**Audit Fixes Applied:**
- IDP-1: No idempotency middleware → Request deduplication via idempotency keys
- IDP-2: No idempotency header support → Idempotency-Key header implementation
- IDP-3: No idempotency key type → Proper typing throughout
- IDP-H1: No replay detection headers → X-Idempotent-Replayed header

**Features:**
- Redis-backed with memory fallback
- 24-hour TTL for idempotency keys
- Status tracking: `processing`, `completed`, `failed`
- Replay headers for debugging

**Code Example:**
```typescript
// From middleware/idempotency.ts
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to mutating requests
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }

  const idempotencyKey = request.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    return;
  }

  const existingEntry = await getEntry(cacheKey, cache);

  if (existingEntry) {
    if (existingEntry.status === 'processing') {
      return reply.status(409).send({
        error: 'Request with this Idempotency-Key is still being processed',
        code: 'IDEMPOTENCY_CONFLICT'
      });
    }

    if (existingEntry.status === 'completed' && existingEntry.response) {
      // Return cached response with replay headers
      reply.header('X-Idempotent-Replayed', 'true');
      reply.header('X-Idempotent-Original-Timestamp', new Date(existingEntry.createdAt).toISOString());
      reply.header('X-Idempotent-Original-Request-Id', existingEntry.requestId);

      return reply
        .code(existingEntry.response.statusCode)
        .send(existingEntry.response.body);
    }
  }

  // Mark request as processing
  await setEntry(cacheKey, entry, DEFAULT_TTL_MS, cache);
  request.idempotencyCacheKey = cacheKey;
}
```

### Blockchain Transfer Deduplication

**Purpose:** Prevent duplicate blockchain transactions

```typescript
// From services/blockchain-transfer.service.ts
// AUDIT FIX IDP-4: Check if transfer already has blockchain signature
const existingTransfer = await this.checkExistingBlockchainTransfer(client, transferId);

if (existingTransfer.alreadyExecuted) {
  logger.warn('Blockchain transfer already executed - returning existing result', {
    transferId,
    existingSignature: existingTransfer.signature
  });

  return {
    success: true,
    signature: existingTransfer.signature,
    explorerUrl: existingTransfer.explorerUrl
  };
}

if (existingTransfer.inProgress) {
  throw new Error('TRANSFER_IN_PROGRESS: Another blockchain transfer is in progress');
}

// Mark transfer as in-progress to prevent duplicate execution
await this.markBlockchainTransferInProgress(client, transferId);
```

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + HMAC-SHA256 | Comprehensive algorithm whitelist, JWKS support |
| Internal Endpoints | **None** | All routes are public API |
| HTTP Client (Outgoing) | Shared clients + axios + Metaplex | Uses `@tickettoken/shared/clients` |
| Message Queues | **None** | Uses Redis-backed idempotency |

**Key Characteristics:**
- transfer-service handles **ticket ownership transfers** (gift, resale)
- Uses shared service clients with HMAC authentication for internal calls
- Direct Solana blockchain integration via Metaplex SDK
- Comprehensive idempotency for request and blockchain deduplication
- Webhook delivery for external integrations
- Multi-tenant with RLS isolation

**Security Features:**
- JWT algorithm whitelist (9 algorithms, no 'none')
- JWKS support for RS256 asymmetric keys
- Issuer and audience validation
- 60-second HMAC replay window
- Timing-safe signature comparison
- Service allowlist for internal requests
- Request ID propagation for distributed tracing
- Blockchain transaction deduplication
- Idempotency-Key header support
- Cryptographically secure acceptance codes

**External SDKs Used:**
| SDK | Purpose |
|-----|---------|
| `@solana/web3.js` | Solana blockchain |
| `@metaplex-foundation/js` | NFT operations |
| `jwks-rsa` | JWKS key retrieval |
| `axios` | Webhook delivery |

**Standardization Status:**
- **Fully compliant** with service communication standards
- Uses `@tickettoken/shared/clients` for internal service calls
- HMAC-SHA256 signature generation for outgoing requests
- Comprehensive audit fixes applied

