# queue-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how queue-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Basic JWT authentication (no HMAC for internal services)
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication

### System 1: JWT Authentication (API Routes)

**How it works:**
- Standard JWT verification using jsonwebtoken library
- Uses `JWT_SECRET` with fallback `'dev-secret-change-in-production'`
- Extracts userId, tenantId, role from token
- **No algorithm whitelist specified** (gap)

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'No authorization header provided'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

  (request as any).user = {
    userId: decoded.userId,
    tenantId: decoded.tenantId,
    role: decoded.role
  };
}
```

### Role-Based Authorization

```typescript
// From middleware/auth.middleware.ts
export function authorize(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    if (!user || !user.role || !roles.includes(user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
  };
}
```

### Optional Authentication

For routes that can work with or without authentication:

```typescript
// From middleware/auth.middleware.ts
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      (request as any).user = { /* ... */ };
    }
  } catch (error) {
    // Continue without authentication - no action needed
  }
}
```

**Standardization Gaps:**
1. JWT secret has insecure fallback in non-production
2. No algorithm whitelist to prevent algorithm confusion attacks
3. No HMAC authentication for internal service calls

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/index.ts`
- `src/routes/` directory

**Findings:**
- queue-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT authentication
- Admin-only routes exist for queue management operations

**Public API Routes:**

| Route Prefix | Auth | Description |
|--------------|------|-------------|
| `/health` | None | Health check endpoints |
| `/metrics` | None/JWT | Prometheus metrics export |
| `/jobs` | JWT | Job management |
| `/jobs/batch` | JWT + Admin | Batch job creation |
| `/queues` | JWT | Queue status and listing |
| `/queues/:name/pause` | JWT + Admin | Pause queue |
| `/queues/:name/resume` | JWT + Admin | Resume queue |
| `/queues/:name/clear` | JWT + Admin | Clear queue |
| `/alerts` | JWT | Alert management |
| `/rate-limits` | JWT | Rate limit configuration |
| `/cache/stats` | None | Cache statistics |
| `/cache/flush` | None | Cache flush |

**Route Authorization Levels:**

| Route | Required Role |
|-------|---------------|
| `GET /jobs/:id` | Any authenticated user |
| `POST /jobs` | Any authenticated user |
| `POST /jobs/:id/retry` | `admin` or `venue_admin` |
| `DELETE /jobs/:id` | `admin` or `venue_admin` |
| `POST /jobs/batch` | `admin` or `venue_admin` |
| `POST /queues/:name/pause` | `admin` only |
| `POST /queues/:name/resume` | `admin` only |
| `POST /queues/:name/clear` | `admin` only |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** axios for external calls + SDKs for external services
**Files Examined:**
- `src/services/webhook.service.ts` - External webhook delivery
- `src/services/email.service.ts` - SMTP email delivery
- `src/services/stripe.service.ts` - Stripe SDK
- `src/services/nft.service.ts` - Solana/Metaplex SDK
- `src/workers/money/nft-mint.processor.ts` - Minting service calls

### Webhook Service (axios)

**Purpose:** Send webhook notifications to external systems

```typescript
// From services/webhook.service.ts
async sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'TicketToken-Queue-Service/1.0',
    },
    timeout: 10000, // 10 second timeout
  });
  return true;
}
```

**Webhook Events Sent:**
| Event | Trigger |
|-------|---------|
| `payment.completed` | Payment successfully processed |
| `refund.completed` | Refund successfully processed |
| `nft.minted` | NFT ticket minted |
| `operation.failed` | Admin alert for failures |

### Email Service (nodemailer)

**Purpose:** Send transactional emails via SMTP

```typescript
// From services/email.service.ts
transporter = nodemailer.createTransport({
  host: EMAIL_HOST,       // Default: smtp.gmail.com
  port: EMAIL_PORT,       // Default: 587
  secure: EMAIL_PORT === 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD,
  },
});
```

**Email Templates:**
| Template | Purpose |
|----------|---------|
| Payment Confirmation | Order confirmation with details |
| Refund Confirmation | Refund processed notification |
| NFT Minted | Ticket NFT ready notification |
| Admin Alert | Operation failure alerts |

### Stripe Service (Stripe SDK)

**Purpose:** Process payments and refunds

```typescript
// From services/stripe.service.ts
import Stripe from 'stripe';
import { stripe, stripeConfig } from '../config/stripe.config';

// Create payment intent
const paymentIntent = await stripe.paymentIntents.create(params);

// Create refund
const refund = await stripe.refunds.create({
  payment_intent: data.paymentIntentId,
  amount: data.amount,
  reason: data.reason,
});

// Webhook signature verification
verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event | null {
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    stripeConfig.webhookSecret
  );
  return event;
}
```

### NFT Service (Metaplex SDK)

**Purpose:** Mint NFT tickets on Solana

```typescript
// From services/nft.service.ts
import { metaplex, connection, wallet, solanaConfig } from '../config/solana.config';

// Upload metadata and mint NFT
const { uri: metadataUri } = await metaplex.nfts().uploadMetadata({ /* ... */ });
const { nft } = await metaplex.nfts().create({
  uri: metadataUri,
  name: request.metadata.name,
  symbol: request.metadata.symbol,
  tokenOwner: recipientPublicKey,
});
```

### Minting Service Client (axios)

**Purpose:** Delegate NFT minting to minting-service

```typescript
// From workers/money/nft-mint.processor.ts
const MINTING_SERVICE_URL = process.env.MINTING_SERVICE_URL || 'http://minting-service:3000';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Internal-Service-Key': INTERNAL_SERVICE_KEY!
};

if (tenantId) {
  headers['X-Tenant-ID'] = tenantId;
}

const response = await axios.post(
  `${MINTING_SERVICE_URL}/api/v1/mint/compressed`,
  payload,
  {
    headers,
    timeout: 60000 // 60 second timeout for minting
  }
);
```

**Note:** Uses simple `X-Internal-Service-Key` header instead of HMAC - **standardization gap**.

### Solana RPC Client (axios)

**Purpose:** Direct Solana blockchain interaction

```typescript
// From workers/money/nft-mint.processor.ts
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const response = await axios.post(
  SOLANA_RPC_URL,
  {
    jsonrpc: '2.0',
    id: ticketId,
    method: 'mintCompressedNft',
    params: mintParams
  },
  {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  }
);
```

---

## Category 4: Message Queues

**Implementation:** pg-boss (PostgreSQL-backed job queue)
**Files Examined:**
- `src/config/queues.config.ts` - Queue configuration
- `src/config/constants.ts` - Queue names and job types
- `src/queues/factories/queue.factory.ts` - pg-boss initialization
- `src/queues/definitions/money.queue.ts` - Money queue
- `src/queues/definitions/communication.queue.ts` - Communication queue
- `src/queues/definitions/background.queue.ts` - Background queue

### Queue System: pg-boss (PostgreSQL)

**Why pg-boss:** Uses PostgreSQL for job persistence, eliminating need for separate Redis dependency for job queuing. Provides ACID guarantees for critical financial jobs.

**Configuration:**
```typescript
// From config/queues.config.ts
export const PG_BOSS_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  schema: 'pgboss', // Use separate schema for pg-boss tables
  noSupervisor: false,
  noScheduling: false,
  deleteAfterDays: 7, // Archive completed jobs after 7 days
  retentionDays: 30, // Keep archived jobs for 30 days
  monitorStateIntervalSeconds: 60,
  archiveCompletedAfterSeconds: 3600 * 24, // Archive after 24 hours
};
```

### Queue Definitions

| Queue | Name | Persistence Tier | Retry Limit | Retry Delay | Expiry |
|-------|------|------------------|-------------|-------------|--------|
| Money | `money-queue` | TIER_1 (PostgreSQL + Redis AOF) | 10 | 2s (exponential) | 24 hours |
| Communication | `communication-queue` | TIER_2 (Redis RDB) | 5 | 5s (fixed) | 12 hours |
| Background | `background-queue` | TIER_3 (Memory only) | 2 | 10s (fixed) | 6 hours |

### Job Types

**Money Queue Jobs (Critical):**
| Job Type | Purpose |
|----------|---------|
| `payment-process` | Process Stripe payment intents |
| `refund-process` | Process Stripe refunds |
| `payout-process` | Process venue payouts |
| `nft-mint` | Mint NFT tickets on Solana |

**Communication Queue Jobs:**
| Job Type | Purpose |
|----------|---------|
| `send-email` | Send transactional emails |
| `send-sms` | Send SMS notifications |
| `send-push` | Send push notifications |

**Background Queue Jobs:**
| Job Type | Purpose |
|----------|---------|
| `analytics-track` | Track analytics events |
| `cleanup-old-data` | Clean up expired data |
| `generate-report` | Generate reports |

### Queue Priority System

```typescript
// From config/constants.ts
export const QUEUE_PRIORITIES = {
  CRITICAL: 10,
  HIGH: 7,
  NORMAL: 5,
  LOW: 3,
  BACKGROUND: 1
} as const;
```

### Persistence Tiers

```typescript
// From config/constants.ts
export const PERSISTENCE_TIERS = {
  TIER_1: 'TIER_1', // PostgreSQL + Redis AOF (highest durability)
  TIER_2: 'TIER_2', // Redis RDB (medium durability)
  TIER_3: 'TIER_3'  // Memory only (lowest durability)
} as const;
```

### Queue Factory Initialization

```typescript
// From queues/factories/queue.factory.ts
export class QueueFactory {
  static async initialize(): Promise<void> {
    // Create pg-boss instance
    this.boss = new PgBoss(PG_BOSS_CONFIG);

    // Event handlers
    this.boss.on('error', (error) => {
      logger.error('pg-boss error:', error);
    });

    this.boss.on('maintenance', () => {
      logger.debug('pg-boss maintenance running');
    });

    // Start pg-boss
    await this.boss.start();

    // Create persistence services for each tier
    this.persistenceServices.set('money', new PersistenceService(PERSISTENCE_TIERS.TIER_1));
    this.persistenceServices.set('communication', new PersistenceService(PERSISTENCE_TIERS.TIER_2));
    this.persistenceServices.set('background', new PersistenceService(PERSISTENCE_TIERS.TIER_3));
  }
}
```

### Idempotency Service

**Purpose:** Prevent duplicate job processing

```typescript
// From services/idempotency.service.ts
export class IdempotencyService {
  private readonly DEFAULT_TTL = 86400; // 24 hours

  generateKey(jobType: string, data: any): string {
    switch(jobType) {
      case 'payment-process':
        return `payment-${data.venueId}-${data.userId}-${data.eventId}-${data.amount}`;
      case 'refund-process':
        return `refund-${data.transactionId}`;
      case 'nft-mint':
        return `nft-${data.eventId}-${data.seatId || data.ticketId}`;
      case 'payout-process':
        return `payout-${data.venueId}-${data.period || data.payoutId}`;
      case 'send-email':
        const date = new Date().toISOString().split('T')[0];
        return `email-${data.template}-${data.to}-${date}`;
      case 'send-sms':
        const hour = new Date().getHours();
        return `sms-${data.to}-${data.template}-${hour}`;
      default:
        // Generic SHA-256 hash
        const hash = crypto.createHash('sha256');
        hash.update(jobType);
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }
  }

  async check(key: string): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT result FROM queue_idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0].result : null;
  }

  async store(key: string, queueName: string, jobType: string, result: any, ttlSeconds: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO queue_idempotency_keys
       (key, queue_name, job_type, result, processed_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (key) DO UPDATE SET result = $4, processed_at = NOW()`,
      [key, queueName, jobType, result, expiresAt]
    );
  }
}
```

**Idempotency TTLs:**
| Job Type | TTL |
|----------|-----|
| NFT minting | 1 year (permanent records) |
| Payments/Refunds | 24 hours |
| Emails | 24 hours (daily limit) |
| SMS | 1 hour (hourly limit) |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT only | **Gap**: No algorithm whitelist, no HMAC for internal |
| Internal Endpoints | **None** | All routes are public API |
| HTTP Client (Outgoing) | axios + SDKs | **Gap**: Simple service key instead of HMAC |
| Message Queues | pg-boss (PostgreSQL) | ACID guarantees, tiered persistence |

**Key Characteristics:**
- queue-service is the **centralized job processing hub** for the platform
- Uses pg-boss (PostgreSQL-backed) instead of Redis-only solutions for critical jobs
- Three-tier persistence model: TIER_1 (critical), TIER_2 (important), TIER_3 (background)
- Integrates with Stripe (payments), Solana (NFTs), and SMTP (emails)
- PostgreSQL-based idempotency for duplicate prevention
- Rate limiting for Solana RPC calls

**External SDKs Used:**
| SDK | Purpose |
|-----|---------|
| `stripe` | Payment processing |
| `@solana/web3.js` | Solana blockchain |
| `@metaplex-foundation/js` | NFT minting |
| `nodemailer` | Email delivery |
| `pg-boss` | PostgreSQL job queue |

**Standardization Gaps:**
1. **JWT Authentication:** No algorithm whitelist, insecure fallback secret
2. **Internal Service Calls:** Uses `X-Internal-Service-Key` header instead of HMAC
3. **No HMAC validation:** Service does not validate HMAC signatures from callers
4. **Webhook delivery:** No signature generation for outgoing webhooks

**Security Features:**
- Role-based authorization (admin, venue_admin)
- Stripe webhook signature verification
- PostgreSQL-backed idempotency (ACID guarantees)
- Rate limiting for external service calls
- Job TTLs to prevent stale job execution

