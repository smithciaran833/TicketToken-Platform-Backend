# integration-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how integration-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Triple system - JWT for users + Internal service key/HMAC + Webhook signatures
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/internal-auth.ts` - Internal service authentication
- `src/middleware/webhook-verify.middleware.ts` - Provider webhook verification

### System 1: JWT Authentication (User Requests)

**How it works:**
- Configurable algorithm (default: HS256)
- Issuer validation: `JWT_ISSUER` env var
- Audience validation: `JWT_AUDIENCE` env var
- Clock tolerance: 30 seconds
- Validates token structure and claims

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
function getJwtVerifyOptions(): jwt.VerifyOptions {
  const config = getJwtConfig();
  return {
    algorithms: [config.algorithm as jwt.Algorithm],
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: 30,
  };
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const decoded = jwt.verify(token, jwtSecret, getJwtVerifyOptions()) as JWTPayload;

  request.user = decoded;
  request.tenantId = decoded.tenant_id;
}
```

### System 2: Internal Service Authentication

**How it works:**
- Headers required: `x-internal-service-key`, `x-service-name`, `x-request-timestamp`, `x-request-signature`
- HMAC payload format: `serviceName:timestamp:method:url`
- 5-minute replay window
- Service allowlist validation
- Granular permission system per service

**Allowed Services:**
- auth-service
- event-service
- ticket-service
- payment-service
- notification-service

**Service Permissions Map:**
| Service | Permissions |
|---------|-------------|
| auth-service | `integrations:read`, `integrations:write`, `webhooks:*` |
| event-service | `integrations:read`, `sync:events`, `webhooks:receive` |
| ticket-service | `integrations:read`, `sync:tickets`, `webhooks:receive` |
| payment-service | `integrations:read`, `integrations:write`, `sync:payments`, `webhooks:*` |
| notification-service | `integrations:read`, `sync:contacts` |

**Code Example:**
```typescript
// From middleware/internal-auth.ts
const ALLOWED_SERVICES = [
  'auth-service',
  'event-service',
  'ticket-service',
  'payment-service',
  'notification-service',
];

const SERVICE_PERMISSIONS: Record<string, string[]> = {
  'auth-service': ['integrations:read', 'integrations:write', 'webhooks:*'],
  'event-service': ['integrations:read', 'sync:events', 'webhooks:receive'],
  'ticket-service': ['integrations:read', 'sync:tickets', 'webhooks:receive'],
  'payment-service': ['integrations:read', 'integrations:write', 'sync:payments', 'webhooks:*'],
  'notification-service': ['integrations:read', 'sync:contacts'],
};

export async function validateInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceKey = request.headers['x-internal-service-key'] as string;
  const serviceName = request.headers['x-service-name'] as string;
  const timestamp = request.headers['x-request-timestamp'] as string;
  const signature = request.headers['x-request-signature'] as string;

  // Validate service is in allowlist
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    throw new ForbiddenError(`Service ${serviceName} not authorized`);
  }

  // Validate timestamp (5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const timeDiff = Math.abs(Date.now() - requestTime);
  if (timeDiff > 5 * 60 * 1000) {
    throw new UnauthorizedError('Request timestamp expired');
  }

  // Validate HMAC signature
  const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new UnauthorizedError('Invalid request signature');
  }

  request.internalService = serviceName;
  request.servicePermissions = SERVICE_PERMISSIONS[serviceName] || [];
}
```

### System 3: Webhook Signature Verification

**Supported Providers:**

| Provider | Algorithm | Timestamp Window | Signature Format |
|----------|-----------|------------------|------------------|
| Stripe | HMAC-SHA256 | 5 minutes | `t=timestamp,v1=signature` |
| Square | HMAC-SHA256 | N/A | Base64 in header |
| Mailchimp | HMAC-SHA1 | N/A | Sorted params digest |
| QuickBooks | HMAC-SHA256 | N/A | Verifier token + signature |

**Code Example (Stripe):**
```typescript
// From middleware/webhook-verify.middleware.ts
export function verifyStripeWebhook(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const signature = request.headers['stripe-signature'] as string;
    const rawBody = request.rawBody;

    // Parse signature header: t=timestamp,v1=sig1,v1=sig2...
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.slice(2);
    const signatures = elements
      .filter(e => e.startsWith('v1='))
      .map(e => e.slice(3));

    // Validate timestamp (5 minute window)
    const timestampNum = parseInt(timestamp!, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > 300) {
      throw new UnauthorizedError('Webhook timestamp expired');
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Check if any provided signature matches
    const isValid = signatures.some(sig =>
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))
    );

    if (!isValid) {
      throw new UnauthorizedError('Invalid webhook signature');
    }
  };
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/` directory

**Findings:**
- integration-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT or webhook authentication
- Internal services call integration-service via standard API with internal auth middleware

**Public API Routes:**

| Route Category | Path Pattern | Auth |
|---------------|--------------|------|
| Health | `/health` | None |
| Integrations | `/api/v1/integrations/*` | JWT |
| Providers | `/api/v1/providers/*` | JWT |
| Webhooks | `/api/v1/webhooks/stripe` | Stripe signature |
| Webhooks | `/api/v1/webhooks/square` | Square signature |
| Webhooks | `/api/v1/webhooks/mailchimp` | Mailchimp signature |
| Webhooks | `/api/v1/webhooks/quickbooks` | QuickBooks signature |
| Sync | `/api/v1/sync/*` | JWT |
| Admin | `/api/v1/admin/*` | JWT + Admin |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Provider SDKs (not raw HTTP clients)
**Files Examined:**
- `src/services/providers/stripe-sync.service.ts`
- `src/services/providers/square-sync.service.ts`
- `src/services/providers/mailchimp-sync.service.ts`
- `src/services/providers/quickbooks-sync.service.ts`
- `src/services/sync-engine.service.ts`

### Provider SDKs Used

| Provider | SDK | Purpose |
|----------|-----|---------|
| Stripe | `stripe` | Payment processing, customer sync |
| Square | `square` | POS integration, payment sync |
| Mailchimp | `@mailchimp/mailchimp_marketing` | Email marketing, contact sync |
| QuickBooks | `intuit-oauth` + REST API | Accounting, financial sync |

**Code Example (Stripe SDK):**
```typescript
// From services/providers/stripe-sync.service.ts
import Stripe from 'stripe';

export class StripeSyncService {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }

  async syncCustomers(tenantId: string, lastSyncTime?: Date): Promise<SyncResult> {
    const customers = await this.stripe.customers.list({
      limit: 100,
      created: lastSyncTime ? { gte: Math.floor(lastSyncTime.getTime() / 1000) } : undefined,
    });

    // Process and sync customers...
    return { synced: customers.data.length, errors: [] };
  }

  async syncPayments(tenantId: string, lastSyncTime?: Date): Promise<SyncResult> {
    const paymentIntents = await this.stripe.paymentIntents.list({
      limit: 100,
      created: lastSyncTime ? { gte: Math.floor(lastSyncTime.getTime() / 1000) } : undefined,
    });

    // Process and sync payments...
    return { synced: paymentIntents.data.length, errors: [] };
  }
}
```

### Sync Engine

The sync engine coordinates data synchronization across all providers:

```typescript
// From services/sync-engine.service.ts
export class SyncEngine {
  private providers: Map<string, ProviderSyncService>;

  async executeSync(
    tenantId: string,
    provider: string,
    syncType: string
  ): Promise<SyncResult> {
    const providerService = this.providers.get(provider);

    if (!providerService) {
      throw new NotFoundError(`Provider ${provider} not configured`);
    }

    // Get last sync timestamp from database
    const lastSync = await this.getLastSyncTime(tenantId, provider, syncType);

    // Execute provider-specific sync
    const result = await providerService.sync(tenantId, syncType, lastSync);

    // Update sync status in database
    await this.updateSyncStatus(tenantId, provider, syncType, result);

    return result;
  }
}
```

**Note:** integration-service does **not use** the `@tickettoken/shared/clients` library because it primarily communicates with external third-party APIs via their SDKs rather than internal services.

---

## Category 4: Message Queues

**Implementation:** Bull (Redis-backed) with priority levels
**Files Examined:**
- `src/config/queue.ts`
- `src/workers/sync.worker.ts`

### Queue Configuration

**Library:** Bull (Redis-backed)
**Priority Levels:** 4 queues for different job priorities

| Queue | Name | Purpose |
|-------|------|---------|
| Critical | `integration-critical` | Webhook processing, urgent syncs |
| High | `integration-high` | User-initiated syncs |
| Normal | `integration-normal` | Scheduled background syncs |
| Low | `integration-low` | Batch operations, cleanup |

**Code Example:**
```typescript
// From config/queue.ts
import Bull from 'bull';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

export const queues = {
  critical: new Bull('integration-critical', { redis: redisConfig }),
  high: new Bull('integration-high', { redis: redisConfig }),
  normal: new Bull('integration-normal', { redis: redisConfig }),
  low: new Bull('integration-low', { redis: redisConfig }),
};

// Default job options per priority
export const jobOptions = {
  critical: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
  high: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
  normal: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
  low: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
};
```

### Sync Worker

```typescript
// From workers/sync.worker.ts
export class SyncWorker {
  constructor(private syncEngine: SyncEngine) {
    this.setupProcessors();
  }

  private setupProcessors(): void {
    // Process critical queue (webhooks)
    queues.critical.process('webhook', 10, async (job) => {
      const { provider, event, payload } = job.data;
      return this.processWebhook(provider, event, payload);
    });

    // Process high queue (user-initiated)
    queues.high.process('sync', 5, async (job) => {
      const { tenantId, provider, syncType } = job.data;
      return this.syncEngine.executeSync(tenantId, provider, syncType);
    });

    // Process normal queue (scheduled)
    queues.normal.process('scheduled-sync', 3, async (job) => {
      const { tenantId, provider, syncType } = job.data;
      return this.syncEngine.executeSync(tenantId, provider, syncType);
    });

    // Process low queue (batch)
    queues.low.process('batch', 1, async (job) => {
      const { tenantId, provider, operation } = job.data;
      return this.processBatchOperation(tenantId, provider, operation);
    });
  }
}
```

### Job Types

| Job Type | Queue | Description |
|----------|-------|-------------|
| `webhook` | Critical | Process incoming webhook events |
| `sync` | High | User-initiated data sync |
| `scheduled-sync` | Normal | Background scheduled sync |
| `batch` | Low | Batch import/export operations |
| `cleanup` | Low | Old data cleanup |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + Internal HMAC + Webhook signatures | Triple auth system for different callers |
| Internal Endpoints | **None** | All routes are public API |
| HTTP Client (Outgoing) | Provider SDKs (Stripe, Square, etc.) | No shared client library |
| Message Queues | Bull (Redis) | 4 priority queues |

**Key Characteristics:**
- integration-service is a **third-party integration hub** connecting external providers
- Uses official SDKs for each provider (Stripe, Square, Mailchimp, QuickBooks)
- Webhook verification is provider-specific with timing-safe comparisons
- Priority-based queue system for different job urgencies
- Granular permission system for internal service access
- No internal endpoints - other services use standard API with internal auth

**Security Features:**
- Timing-safe HMAC comparison for all signature verification
- 5-minute replay window for webhook timestamps
- Service allowlist with granular permissions
- JWT validation with issuer/audience claims
- Per-provider webhook secret management

