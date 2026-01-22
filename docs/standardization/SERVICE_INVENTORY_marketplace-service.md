# marketplace-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how marketplace-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for users + HMAC for internal service calls + Webhook signatures
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/internal-auth.ts` - Internal service HMAC authentication
- `src/routes/webhook.routes.ts` - Webhook signature verification

### System 1: JWT Authentication (User Requests)

**How it works:**
- Algorithm whitelist: `HS256, RS256` (no 'none')
- JWT_SECRET required - no fallback in production
- Minimum secret length: 32 characters
- Requires tenant_id from token (logs warning if missing)

**Audit Fixes Applied:**
- SEC-1: Remove hardcoded JWT secret fallback
- SEC-H1: Add JWT algorithm whitelist

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256', 'RS256'];

export async function authMiddleware(request: AuthRequest, reply: FastifyReply) {
  if (!JWT_SECRET) {
    logger.error('JWT_SECRET not configured - rejecting request');
    return reply.status(500).send({
      error: 'Authentication service misconfigured',
      code: 'AUTH_CONFIG_ERROR'
    });
  }

  const token = authHeader.slice(7);

  // Specify allowed algorithms to prevent algorithm confusion attacks
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ALLOWED_ALGORITHMS
  }) as any;

  request.user = decoded;
  request.tenantId = decoded.tenant_id || decoded.tenantId;
}
```

### System 2: Internal Service HMAC Authentication

**How it works:**
- Headers required: `x-internal-service`, `x-internal-signature`, `x-timestamp`
- Payload format: `serviceName:timestamp:body`
- **60-second replay window** (configurable via `HMAC_REPLAY_WINDOW_MS`)
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Service allowlist validation

**Allowed Services:**
- api-gateway
- payment-service
- ticket-service
- order-service
- minting-service
- transfer-service
- blockchain-service
- notification-service
- event-service

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

  // Build signature payload: service:timestamp:body
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

### System 3: Webhook Signature Verification

**Supported Webhooks:**

| Endpoint | Source | Verification |
|----------|--------|--------------|
| `/webhooks/stripe` | Stripe | Stripe SDK signature verification |
| `/webhooks/payment-completed` | Internal services | HMAC-SHA256 with timestamp |

**Internal Webhook Verification:**
```typescript
// From routes/webhook.routes.ts
function verifyInternalWebhookSignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined
): boolean {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;

  // Reject in production without secret
  if (!secret && process.env.NODE_ENV === 'production') {
    return false;
  }

  // Prevent replay attacks - reject requests older than 5 minutes
  const timestampNum = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 5 * 60 * 1000) {
    return false;
  }

  // Verify HMAC: HMAC-SHA256(timestamp + '.' + payload, secret)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

### Role-Based Middleware

| Middleware | Purpose |
|------------|---------|
| `authMiddleware` | Standard JWT authentication |
| `requireAdmin` | Requires admin role |
| `requireVenueOwner` | Requires admin, venue_owner, or venue_manager role |
| `verifyListingOwnership` | Verifies user owns the listing |

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/index.ts`
- `src/routes/webhook.routes.ts`

**Findings:**
- marketplace-service does **not expose** any `/internal/` routes
- Internal services communicate via webhook endpoints with HMAC auth
- All other routes are public API endpoints requiring JWT authentication

**Public API Routes:**

| Route Category | Prefix | Auth |
|---------------|--------|------|
| Health | `/health` | None |
| Listings | `/listings` | JWT |
| Transfers | `/transfers` | JWT |
| Venues | `/venues` | JWT |
| Search | `/search` | JWT |
| Admin | `/admin` | JWT + Admin |
| Disputes | `/disputes` | JWT |
| Tax | `/tax` | JWT |
| Seller Onboarding | `/seller` | JWT |
| Webhooks | `/webhooks` | Stripe/HMAC |
| Stats | `/stats` | JWT |
| Cache | `/cache/*` | JWT + Admin |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Mixed - axios, fetch, and Solana SDK
**Files Examined:**
- `src/services/ticket-lookup.service.ts` - Uses axios
- `src/services/notification.service.ts` - Uses fetch
- `src/services/blockchain.service.ts` - Uses Solana/Anchor SDK
- `src/config/index.ts` - Service URL configuration

### Service URL Configuration

```typescript
// From config/index.ts
export const config = {
  // Service URLs
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  ticketServiceUrl: process.env.TICKET_SERVICE_URL || 'http://event-service:3003',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://analytics-service:3007',
};

export const serviceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};
```

### Ticket Lookup Service (axios)

**Purpose:** Fetch ticket and event information from event-service

```typescript
// From services/ticket-lookup.service.ts
async getTicketInfo(ticketId: string): Promise<TicketInfo | null> {
  // Check cache first
  const cached = await cache.get<string>(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from event service
  const response = await axios.get(
    `${config.ticketServiceUrl}/api/v1/tickets/${ticketId}`,
    {
      headers: {
        'X-Service-Name': 'marketplace-service',
        'X-Internal-Request': 'true'
      },
      timeout: 5000
    }
  );

  // Cache result for 5 minutes
  await cache.set(cacheKey, JSON.stringify(ticketInfo), 300);
  return ticketInfo;
}
```

**Note:** This uses simple headers instead of HMAC authentication - **standardization gap**.

### Notification Service (fetch)

**Purpose:** Send notifications to users

```typescript
// From services/notification.service.ts
private async sendNotification(payload: NotificationPayload): Promise<void> {
  const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  // Non-blocking - doesn't throw on failure
}
```

**Note:** Uses simple fetch without HMAC - **standardization gap**.

### Blockchain Service (Solana SDK)

**Purpose:** Execute on-chain NFT transfers, escrow operations

```typescript
// From services/blockchain.service.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    // Retry with exponential backoff (3 attempts)
    // Execute on-chain transaction via Anchor program
    // Return signature, blockHeight, fee
  }

  async verifyNFTOwnership(walletAddress: string, tokenId: string): Promise<boolean> {
    // Query on-chain listing account
  }

  async createEscrowAccount(params: EscrowParams): Promise<{ escrowAddress: string }> {
    // Create on-chain escrow via program
  }

  async releaseEscrowToSeller(params: ReleaseParams): Promise<{ signature: string }> {
    // Release escrow funds to seller
  }

  async refundEscrowToBuyer(params: RefundParams): Promise<{ signature: string }> {
    // Refund escrow to buyer
  }
}
```

### Outgoing Signature Generation

**For internal service calls:**
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

export function buildInternalHeaders(body: any, requestId?: string): Record<string, string> {
  const { signature, timestamp } = generateInternalSignature('marketplace-service', body);

  return {
    'x-internal-service': 'marketplace-service',
    'x-internal-signature': signature,
    'x-timestamp': timestamp,
    'Content-Type': 'application/json',
    ...(requestId && { 'x-request-id': requestId })
  };
}
```

**Gap:** The `buildInternalHeaders` function exists but is not consistently used by the ticket-lookup and notification services.

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib) - Currently simulated/stubbed
**Files Examined:**
- `src/config/rabbitmq.ts`

### Queue Configuration

**Library:** amqplib (connection stubbed)
**Status:** Configuration exists, but operations are simulated (logged only)

**Exchanges:**

| Exchange | Name | Purpose |
|----------|------|---------|
| Marketplace | `marketplace.exchange` | Marketplace-specific events |
| Events | `events.exchange` | General event distribution |

**Queues:**

| Queue | Name | Purpose |
|-------|------|---------|
| Listings | `marketplace.listings.queue` | Listing create/update events |
| Transfers | `marketplace.transfers.queue` | NFT transfer events |
| Disputes | `marketplace.disputes.queue` | Dispute handling events |
| Notifications | `marketplace.notifications.queue` | User notification events |

**Routing Keys:**

| Key | Event |
|-----|-------|
| `listing.created` | New listing created |
| `listing.sold` | Listing purchased |
| `transfer.complete` | NFT transfer completed |
| `dispute.created` | New dispute opened |

**Code Example:**
```typescript
// From config/rabbitmq.ts
export const rabbitmqConfig: RabbitMQConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
  exchanges: {
    marketplace: 'marketplace.exchange',
    events: 'events.exchange'
  },
  queues: {
    listings: 'marketplace.listings.queue',
    transfers: 'marketplace.transfers.queue',
    disputes: 'marketplace.disputes.queue',
    notifications: 'marketplace.notifications.queue'
  },
  routingKeys: {
    listingCreated: 'listing.created',
    listingSold: 'listing.sold',
    transferComplete: 'transfer.complete',
    disputeCreated: 'dispute.created'
  }
};

// Simulated connection (not using real amqplib yet)
class RabbitMQConnection {
  async publish(exchange: string, routingKey: string, message: any): Promise<void> {
    // In production: channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)))
    logger.debug(`Published to ${exchange}/${routingKey}:`, message);
  }

  async subscribe(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    // In production: channel.consume(queue, handler)
    logger.info(`Subscribed to queue: ${queue}`);
  }
}
```

**Note:** RabbitMQ is configured but operations are stubbed/simulated. This is a **standardization gap** - needs real amqplib integration.

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + HMAC + Webhook signatures | 60s replay window, timing-safe |
| Internal Endpoints | **None** | Uses webhook endpoints with HMAC |
| HTTP Client (Outgoing) | axios + fetch + Solana SDK | **Gap**: Not using shared HMAC client |
| Message Queues | RabbitMQ (simulated) | **Gap**: Stubbed, needs real implementation |

**Key Characteristics:**
- marketplace-service is an **NFT secondary marketplace** for ticket resale
- Direct blockchain integration via Solana/Anchor SDK
- Escrow-based payment flow with on-chain verification
- Internal HMAC helpers exist but not consistently used for outgoing calls
- RabbitMQ configured but not actively used (simulated)

**Standardization Gaps:**
1. **HTTP Client:** Should use `@tickettoken/shared/clients` or consistently use `buildInternalHeaders()` for outgoing service calls
2. **Ticket Lookup Service:** Uses simple headers instead of HMAC authentication
3. **Notification Service:** Uses plain fetch without authentication headers
4. **RabbitMQ:** Stubbed implementation - needs real amqplib connection

**Security Features:**
- JWT algorithm whitelist prevents algorithm confusion attacks
- 60-second HMAC replay window (configurable)
- Timing-safe signature comparison
- Service allowlist for internal requests
- Webhook signature verification with replay protection
- No JWT secret fallback in production

