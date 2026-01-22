# notification-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how notification-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for API routes + Webhook signatures for external providers
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/webhook-auth.middleware.ts` - Twilio/SendGrid webhook verification

### System 1: JWT Authentication (API Routes)

**How it works:**
- Algorithm whitelist: `HS256, HS384, HS512` (SEC-1 audit fix)
- JWT_SECRET from environment configuration
- Extracts userId, email, venueId, role from token

**Audit Fixes Applied:**
- SEC-1: Algorithm whitelist to prevent algorithm confusion attacks

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: 'No authorization token provided',
    });
  }

  // AUDIT FIX SEC-1: Specify allowed algorithms to prevent algorithm confusion attacks
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256', 'HS384', 'HS512']
  }) as any;

  request.user = {
    id: decoded.userId || decoded.id,
    email: decoded.email,
    venueId: decoded.venueId,
    role: decoded.role,
  };
};
```

### System 2: Optional JWT Authentication

For routes that can work with or without authentication:

```typescript
// From middleware/auth.middleware.ts
export const optionalAuthMiddleware = async (
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // AUDIT FIX SEC-1: Specify allowed algorithms
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256', 'HS384', 'HS512']
      }) as any;
      request.user = { /* ... */ };
    }
  } catch (error) {
    // Continue without authentication - no action needed
  }
};
```

### System 3: Webhook Signature Verification

**Supported Providers:**

| Provider | Header | Algorithm | Verification |
|----------|--------|-----------|--------------|
| Twilio | `x-twilio-signature` | HMAC-SHA1 | URL + sorted params |
| SendGrid | `x-twilio-email-event-webhook-signature` | HMAC-SHA256 | timestamp + body |

**Audit Fixes Applied:**
- S2S-2: Timing-safe comparison to prevent timing attacks

**Code Example (Twilio):**
```typescript
// From middleware/webhook-auth.middleware.ts
export const verifyTwilioSignature = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const twilioSignature = request.headers['x-twilio-signature'] as string;

  if (!twilioSignature || !env.TWILIO_AUTH_TOKEN) {
    return reply.status(401).send({ error: 'Unauthorized webhook request' });
  }

  // Twilio signature verification logic
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const params = request.body || {};

  // Sort parameters alphabetically and concatenate
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params as any)[key], url);

  const expectedSignature = crypto
    .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  // AUDIT FIX S2S-2: Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(twilioSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return reply.status(401).send({ error: 'Invalid webhook signature' });
  }
};
```

**SendGrid Verification:**
```typescript
// From middleware/webhook-auth.middleware.ts
export const verifySendGridSignature = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const signature = request.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = request.headers['x-twilio-email-event-webhook-timestamp'] as string;

  const payload = timestamp + request.body;
  const expectedSignature = crypto
    .createHmac('sha256', env.SENDGRID_WEBHOOK_SECRET)
    .update(payload)
    .digest('base64');

  // AUDIT FIX S2S-2: Use timing-safe comparison
  if (signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return reply.status(401).send({ error: 'Invalid webhook signature' });
  }
};
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes - uses RabbitMQ for inter-service communication
**Files Examined:**
- `src/routes/` directory (all route files)

**Findings:**
- notification-service does **not expose** any `/internal/` routes
- Inter-service communication is handled via RabbitMQ message consumption
- All HTTP routes are public API endpoints requiring JWT authentication

**Public API Routes:**

| Route Prefix | Auth | Description |
|--------------|------|-------------|
| `/health` | None | Health check |
| `/api/v1/notifications` | JWT | Send notifications |
| `/api/v1/preferences` | JWT | User notification preferences |
| `/api/v1/campaigns` | JWT | Campaign management |
| `/api/v1/templates` | JWT | Template management |
| `/api/v1/marketing` | JWT | Marketing notifications |
| `/api/v1/analytics` | JWT | Notification analytics |
| `/api/v1/metrics` | JWT | Metrics endpoints |
| `/api/v1/consent` | JWT | Consent management |
| `/api/v1/gdpr` | JWT | GDPR data requests |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Mixed - axios for external calls, fetch for service-to-service
**Files Examined:**
- `src/services/notification.service.ts`
- `src/providers/webhook.provider.ts`
- `src/events/base-event-handler.ts`

### Venue Service Client (axios)

**Purpose:** Fetch venue branding for email customization

```typescript
// From services/notification.service.ts
private async getVenueBranding(venueId: string): Promise<any> {
  try {
    const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
    const response = await axios.get(
      `${venueServiceUrl}/api/v1/branding/${venueId}`,
      { timeout: 2000 }
    );

    return response.data.branding;
  } catch (error: any) {
    logger.warn(`Failed to fetch branding for venue ${venueId}:`, error.message);
    return null; // Graceful degradation
  }
}
```

**Note:** This uses simple axios without HMAC authentication - **standardization gap**.

### Auth/Event Service Client (fetch)

**Purpose:** Fetch user/event details for notification enrichment

```typescript
// From events/base-event-handler.ts
protected async getUserDetails(userId: string): Promise<any> {
  try {
    // First try local database
    const result = await db('users').where('id', userId).first();

    if (!result) {
      // Fallback to auth service API
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
      const response = await fetch(`${authServiceUrl}/api/v1/users/${userId}`, {
        headers: {
          'X-Service-Token': process.env.SERVICE_TOKEN || '',
          'X-Service-Name': this.serviceName
        }
      });

      if (!response.ok) {
        throw new Error(`User not found: ${userId}`);
      }

      return await response.json();
    }

    return result;
  } catch (error) {
    // Return minimal fallback data
    return {
      id: userId,
      email: `user_${userId}@tickettoken.com`,
      name: 'Valued Customer'
    };
  }
}

protected async getEventDetails(eventId: string): Promise<any> {
  // Similar pattern for event-service
  const eventServiceUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:3003';
  const response = await fetch(`${eventServiceUrl}/api/v1/events/${eventId}`, {
    headers: {
      'X-Service-Token': process.env.SERVICE_TOKEN || '',
      'X-Service-Name': this.serviceName
    }
  });
  // ...
}
```

**Note:** Uses simple `X-Service-Token` header instead of HMAC - **standardization gap**.

### Webhook Provider (axios with HMAC)

**Purpose:** Deliver webhooks to customer endpoints

```typescript
// From providers/webhook.provider.ts
async send(options: WebhookOptions): Promise<NotificationResponse> {
  // Generate signature if secret provided
  const signature = options.secret
    ? this.generateSignature(options.data, options.secret)
    : undefined;

  const headers = {
    'Content-Type': 'application/json',
    'X-TicketToken-Signature': signature,
    'X-TicketToken-Timestamp': Date.now().toString(),
    ...options.headers,
  };

  const response = await axios.post(options.url, options.data, {
    headers,
    timeout: 10000,
  });

  return { /* ... */ };
}

private generateSignature(data: any, secret: string): string {
  const payload = JSON.stringify(data);
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

async validateWebhook(body: string, signature: string, secret: string): Promise<boolean> {
  const expectedSignature = this.generateSignature(JSON.parse(body), secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib) + BullMQ (Redis)
**Files Examined:**
- `src/config/rabbitmq.ts` - RabbitMQ configuration
- `src/services/queue.service.ts` - BullMQ queue service
- `src/events/base-event-handler.ts` - Bull event handlers

### RabbitMQ (Event Consumption)

**Purpose:** Consume platform events from other services

**Audit Fixes Applied:**
- S2S-1: TLS enforcement for RabbitMQ in production

**Configuration:**
```typescript
// From config/rabbitmq.ts
export class RabbitMQService {
  async connect(): Promise<void> {
    const url = env.RABBITMQ_URL;

    // AUDIT FIX S2S-1: Enforce TLS for RabbitMQ in production
    if (env.NODE_ENV === 'production') {
      if (!url.startsWith('amqps://')) {
        throw new Error(
          'SECURITY: RabbitMQ must use TLS (amqps://) in production. ' +
          'Current URL uses unencrypted connection.'
        );
      }
      logger.info('RabbitMQ TLS enabled for production');
    }

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    await this.channel.assertQueue(env.RABBITMQ_QUEUE, { durable: true });

    // Bind to routing keys
    const routingKeys = [
      'payment.completed',
      'ticket.purchased',
      'ticket.transferred',
      'event.reminder',
      'event.cancelled',
      'event.updated',
      'user.registered',
      'user.password_reset',
      'venue.announcement',
      'marketing.campaign'
    ];

    for (const key of routingKeys) {
      await this.channel.bindQueue(env.RABBITMQ_QUEUE, env.RABBITMQ_EXCHANGE, key);
    }

    await this.channel.prefetch(1);
  }

  async consume(callback: (msg: any) => Promise<void>): Promise<void> {
    await this.channel.consume(env.RABBITMQ_QUEUE, async (msg: any) => {
      if (msg) {
        try {
          await callback(msg);
          this.channel.ack(msg);
        } catch (error) {
          this.channel.nack(msg, false, true); // Requeue on failure
        }
      }
    });
  }
}
```

**Routing Keys Subscribed:**
| Routing Key | Source Service | Trigger |
|-------------|----------------|---------|
| `payment.completed` | payment-service | Payment success |
| `ticket.purchased` | order-service | Ticket purchase |
| `ticket.transferred` | transfer-service | Ticket transfer |
| `event.reminder` | scheduler | Event reminder trigger |
| `event.cancelled` | event-service | Event cancellation |
| `event.updated` | event-service | Event details change |
| `user.registered` | auth-service | New user signup |
| `user.password_reset` | auth-service | Password reset request |
| `venue.announcement` | venue-service | Venue announcement |
| `marketing.campaign` | internal | Campaign trigger |

### BullMQ (Internal Job Processing)

**Purpose:** Process notification jobs with retries and monitoring

**Queues:**
| Queue | Name | Purpose |
|-------|------|---------|
| Notifications | `notifications` | Single notification delivery |
| Batch | `batch-notifications` | Batch notification processing |
| Webhooks | `webhook-processing` | Webhook delivery |
| Retry | `retry-notifications` | Failed notification retries |
| Dead Letter | `dead-letter` | Permanently failed jobs |

**Configuration:**
```typescript
// From services/queue.service.ts
class QueueService {
  async initialize(): Promise<void> {
    this.createQueue(QueueName.NOTIFICATIONS);
    this.createQueue(QueueName.BATCH_NOTIFICATIONS);
    this.createQueue(QueueName.WEBHOOK_PROCESSING);
    this.createQueue(QueueName.RETRY);
    this.createQueue(QueueName.DEAD_LETTER);
  }

  private createQueue(name: string): Queue {
    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600,  // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 3600,  // 7 days
        },
      },
    });

    // Event tracking
    const events = new QueueEvents(name, { connection: redis });

    events.on('completed', ({ jobId }) => {
      metricsService.incrementCounter('queue_jobs_completed_total', { queue: name });
    });

    events.on('failed', ({ jobId, failedReason }) => {
      metricsService.incrementCounter('queue_jobs_failed_total', { queue: name });
    });

    events.on('stalled', ({ jobId }) => {
      metricsService.incrementCounter('queue_jobs_stalled_total', { queue: name });
    });

    return queue;
  }
}
```

### Bull (Event Handlers)

The base event handler also uses Bull for queue management:

```typescript
// From events/base-event-handler.ts
export abstract class BaseEventHandler {
  protected queue: Bull.Queue;

  constructor(queueName: string, serviceName: string) {
    this.queue = new Bull(queueName, {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'redis',
        password: process.env.REDIS_PASSWORD
      }
    });
  }
}
```

### Idempotency Support

Requests are protected by Redis-based idempotency:

```typescript
// From middleware/idempotency.ts
const IDEMPOTENT_ROUTES = new Set([
  'POST:/api/v1/notifications/email',
  'POST:/api/v1/notifications/sms',
  'POST:/api/v1/notifications/push',
  'POST:/api/v1/notifications/batch',
  'POST:/api/v1/campaigns/:id/send',
  'PUT:/api/v1/preferences',
]);

// 24-hour TTL for idempotency records
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
```

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT (algorithm whitelist) + Webhook signatures | Twilio/SendGrid with timing-safe comparison |
| Internal Endpoints | **None** | Uses RabbitMQ for inter-service events |
| HTTP Client (Outgoing) | axios + fetch | **Gap**: Simple tokens instead of HMAC |
| Message Queues | RabbitMQ + BullMQ | Event consumption + job processing |

**Key Characteristics:**
- notification-service is the **notification hub** for all platform communications
- Receives events via RabbitMQ from all platform services
- Uses BullMQ for internal job processing with retry and DLQ
- Supports multiple channels: email, SMS, push, webhook
- White-label support via venue branding integration
- Consent and GDPR compliance built-in

**Standardization Gaps:**
1. **Venue Service Calls:** Uses simple axios without HMAC authentication
2. **Auth/Event Service Calls:** Uses `X-Service-Token` header instead of HMAC
3. **Should use:** `@tickettoken/shared/clients` for internal service calls

**Security Features:**
- JWT algorithm whitelist (HS256/HS384/HS512)
- Twilio webhook signature verification (HMAC-SHA1)
- SendGrid webhook signature verification (HMAC-SHA256)
- Timing-safe comparison for all signature verification
- RabbitMQ TLS enforcement in production
- Redis-based request idempotency

