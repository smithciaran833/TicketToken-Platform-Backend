# compliance-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how compliance-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Triple system - JWT for users + Webhook HMAC + Internal service secret
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT and webhook authentication
- `src/middleware/internal-auth.ts` - Internal service authentication

### System 1: JWT Authentication (User Requests)

**How it works:**
- Algorithm whitelist: `HS256, HS384, HS512` (no 'none' or RS* for shared secret)
- Issuer validation: `JWT_ISSUER` env var (default: `tickettoken`)
- Audience validation: `JWT_AUDIENCE` env var (default: `tickettoken-api`)
- Requires `tenant_id` in token payload (no default fallback)
- Fails fast if `JWT_SECRET` not configured

**Audit Fixes Applied:**
- S2S-3: Added algorithm whitelist, issuer, audience validation

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  // AUDIT FIX S2S-3: Proper JWT verification with algorithm whitelist
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256', 'HS384', 'HS512'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    complete: false
  }) as AuthUser;

  // Require tenant_id in JWT - no default fallback
  if (!decoded.tenant_id) {
    return reply.code(401).send({
      error: 'Token missing tenant_id',
      type: 'urn:error:compliance-service:invalid-token'
    });
  }

  request.user = decoded;
  request.tenantId = decoded.tenant_id;
}
```

### System 2: Webhook HMAC Authentication

**How it works:**
- Headers required: `x-webhook-signature`, `x-webhook-timestamp`
- Payload format: `timestamp.body`
- 5-minute replay window (300 seconds)
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Requires `WEBHOOK_SECRET` in production

**Audit Fixes Applied:**
- SEC-3: Proper HMAC with timing-safe comparison

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export function webhookAuth(secret?: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const signature = request.headers['x-webhook-signature'] as string;
    const timestamp = request.headers['x-webhook-timestamp'] as string;

    // Validate timestamp to prevent replay attacks (5 minute window)
    const timestampNum = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 300; // 5 minutes

    if (now - timestampNum > maxAge) {
      return reply.code(401).send({
        error: 'Webhook timestamp invalid or expired'
      });
    }

    // Generate expected signature
    const signedPayload = `${timestampNum}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // AUDIT FIX: Timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }
  };
}
```

### System 3: Internal Service Authentication

**How it works:**
- Headers required: `x-internal-service`, `x-internal-secret`
- Shared secret validation with timing-safe comparison
- Service allowlist validation

**Allowed Services:**
- api-gateway
- auth-service
- payment-service
- transfer-service
- marketplace-service
- notification-service
- admin-service

**Code Example:**
```typescript
// From middleware/internal-auth.ts
export function internalAuth(options?: { allowedServices?: string[] }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const serviceName = req.headers['x-internal-service'] as string;
    const providedSecret = req.headers['x-internal-secret'] as string;

    // Validate service is allowed
    if (!ALLOWED_INTERNAL_SERVICES.has(serviceName)) {
      throw new ForbiddenError(`Service ${serviceName} not authorized`);
    }

    // Timing-safe comparison
    const secretBuffer = Buffer.from(INTERNAL_SECRET);
    const providedBuffer = Buffer.from(providedSecret);

    if (!timingSafeEqual(secretBuffer, providedBuffer)) {
      throw new UnauthorizedError('Invalid internal service secret');
    }

    req.isInternalRequest = true;
    req.internalService = serviceName;
    next();
  };
}
```

### Role-Based Access Control

| Middleware | Required Roles |
|------------|---------------|
| `requireAdmin` | `admin` |
| `requireComplianceOfficer` | `admin`, `compliance_officer`, `compliance_manager` |

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/server.ts`
- `src/routes/*.routes.ts`

**Findings:**
- compliance-service does **not expose** any `/internal/` routes
- All routes are under `/api/v1/compliance/*` and require JWT authentication
- Internal auth middleware exists but is not used for dedicated internal endpoints
- This service is a **data owner** - other services call it for compliance checks

**Public API Routes (all require JWT):**

| Route Category | Prefix | Auth Required |
|---------------|--------|---------------|
| Health | `/health` | None |
| Webhooks | `/webhooks/*` | HMAC |
| Venues | `/api/v1/compliance/venues/*` | JWT |
| Tax | `/api/v1/compliance/tax/*` | JWT |
| OFAC | `/api/v1/compliance/ofac/*` | JWT |
| Dashboard | `/api/v1/compliance/dashboard/*` | JWT |
| Documents | `/api/v1/compliance/documents/*` | JWT |
| Risk | `/api/v1/compliance/risk/*` | JWT |
| Bank | `/api/v1/compliance/bank/*` | JWT |
| GDPR | `/api/v1/compliance/gdpr/*` | JWT |
| Admin | `/api/v1/compliance/admin/*` | JWT + Admin role |
| Batch | `/api/v1/compliance/batch/*` | JWT + Admin role |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** `@tickettoken/shared/clients` library
**Files Examined:**
- `src/services/risk.service.ts`
- `src/services/bank.service.ts`
- `src/services/scheduler.service.ts`

### Shared Library Clients Used

| Client | Purpose |
|--------|---------|
| `authServiceClient` | Get admin users for notifications |
| `venueServiceClient` | Validate venue ownership, get venue names |

### Usage Pattern

```typescript
// From services/risk.service.ts
import { authServiceClient, venueServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

function createSystemContext(tenantId?: string): RequestContext {
  return {
    tenantId: tenantId || 'system',
    traceId: `risk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

// Get admin users for risk flag notifications
const admins = await authServiceClient.getAdminUsers(ctx, {
  roles: ['admin', 'compliance_admin', 'super_admin']
});

// Get venue info
const venueInfo = await venueServiceClient.getVenueBasicInfo(venueId, ctx);

// Batch get venue names
const venueNamesResponse = await venueServiceClient.batchGetVenueNames(venueIds, ctx);
```

### Operations Called

**authServiceClient:**
| Method | Purpose |
|--------|---------|
| `getAdminUsers(ctx, { roles })` | Get admins for notifications |

**venueServiceClient:**
| Method | Purpose |
|--------|---------|
| `getVenueBasicInfo(venueId, ctx)` | Get venue name/details |
| `batchGetVenueNames(venueIds, ctx)` | Batch lookup venue names |
| `venueExists(venueId, ctx)` | Validate venue ownership |

### Internal Headers Helper

```typescript
// From middleware/internal-auth.ts
export function createInternalHeaders(serviceName: string = 'compliance-service'): Record<string, string> {
  return {
    'x-internal-service': serviceName,
    'x-internal-secret': INTERNAL_SECRET
  };
}
```

---

## Category 4: Message Queues

**Implementation:** None - uses native setTimeout scheduling
**Files Examined:**
- Searched for: amqplib, rabbitmq, Bull, bullmq, pg-boss
- `src/services/scheduler.service.ts`

**Findings:**
- compliance-service does **not use any message queues**
- Uses native JavaScript `setTimeout` for scheduled jobs
- Jobs are rescheduled recursively after completion

### Scheduled Jobs (setTimeout-based)

| Job | Schedule | Description |
|-----|----------|-------------|
| `ofac-update` | Daily 3 AM | Download and update OFAC sanctions list |
| `compliance-checks` | Daily 4 AM | Run daily compliance checks |
| `weekly-report` | Sunday 2 AM | Generate weekly compliance report |
| `1099-generation` | Jan 15 yearly | Generate 1099 forms for previous year |

**Code Example:**
```typescript
// From services/scheduler.service.ts
export class SchedulerService {
  private jobs: Map<string, NodeJS.Timeout> = new Map();

  startScheduledJobs() {
    // Daily OFAC update (3 AM)
    this.scheduleDaily('ofac-update', 3, async () => {
      await realOFACService.downloadAndUpdateOFACList();
    });

    // Daily compliance checks (4 AM)
    this.scheduleDaily('compliance-checks', 4, async () => {
      await batchService.dailyComplianceChecks("system");
    });

    // Weekly report generation (Sunday 2 AM)
    this.scheduleWeekly('weekly-report', 0, 2, async () => {
      await this.generateWeeklyComplianceReport();
    });
  }

  private scheduleDaily(name: string, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);

    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    const timeout = scheduled.getTime() - now.getTime();

    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next day
      this.scheduleDaily(name, hour, callback);
    }, timeout);

    this.jobs.set(name, job);
  }

  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      clearTimeout(job);
    }
    this.jobs.clear();
  }
}
```

### Notification Queue (Database-based)

Instead of a message queue, compliance-service uses a database table for notification queuing:

```typescript
// Queue email notification to database
await db.query(
  `INSERT INTO notification_queue
   (recipient_email, recipient_name, notification_type, subject, body, priority, status, created_at)
   VALUES ($1, $2, 'admin_risk_alert', $3, $4, 'high', 'pending', NOW())`,
  [admin.email, adminName, subject, body]
);
```

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + Webhook HMAC + Internal secret | Triple auth system |
| Internal Endpoints | **None** | Service is data owner, not provider |
| HTTP Client (Outgoing) | `@tickettoken/shared/clients` | authServiceClient, venueServiceClient |
| Message Queues | **None** | Uses setTimeout scheduling |

**Key Characteristics:**
- compliance-service is a **data owner** for compliance-related tables
- Uses RFC 7807 Problem Details format for error responses (ERR-3 audit fix)
- Rate limiting registered via `setupRateLimiting()` (RL-1 audit fix)
- Request ID/correlation ID added to all requests (LOG-2 audit fix)
- Database-based notification queue instead of message broker
- Native JavaScript scheduling instead of Bull/BullMQ
