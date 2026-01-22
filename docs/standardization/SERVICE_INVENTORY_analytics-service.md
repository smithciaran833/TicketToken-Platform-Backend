# analytics-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how analytics-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for user auth + HMAC for internal service auth
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication with issuer/audience validation
- `src/middleware/internal-auth.ts` - HMAC-based internal service authentication
- `src/middleware/auth.ts` - DISABLED (security fix)

### System 1: JWT Authentication (User Requests)

**How it works:**
- Validates Bearer tokens using RS256 or HS256 algorithms
- Validates issuer (`JWT_ISSUER` or `tickettoken-auth-service`)
- Validates audience (`JWT_AUDIENCE` or `analytics-service`)
- 30-second clock skew tolerance
- 24-hour maximum token age
- Falls back to basic verification if issuer/audience missing (backward compatibility)
- RFC 7807 error responses (`application/problem+json`)

**Security Fixes Applied:**
- SEC-1: Explicit algorithm validation (prevents algorithm confusion attacks)
- S2S-2: Issuer validation
- S2S-3: Audience validation
- S2S-4: RFC 7807 error format

**Code Example:**
```typescript
// From auth.middleware.ts
const JWT_CONFIG = {
  algorithms: ['RS256', 'HS256'] as jwt.Algorithm[],
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  audience: process.env.JWT_AUDIENCE || 'analytics-service',
  clockTolerance: 30,
  maxAge: '24h',
};

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = authHeader.substring(7); // Remove 'Bearer '

  // Verify with explicit algorithm, issuer, and audience
  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: JWT_CONFIG.algorithms,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      clockTolerance: JWT_CONFIG.clockTolerance,
      maxAge: JWT_CONFIG.maxAge,
    }) as JWTPayload;
  } catch (jwtError: any) {
    // Fall back to basic verification if issuer/audience not in token
    if (jwtError.message?.includes('jwt issuer') || jwtError.message?.includes('jwt audience')) {
      decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: JWT_CONFIG.algorithms,
        clockTolerance: JWT_CONFIG.clockTolerance,
      }) as JWTPayload;
    } else {
      throw jwtError;
    }
  }

  request.user = {
    id: decoded.userId || decoded.id || decoded.sub,
    tenantId: decoded.tenantId || decoded.tenant_id,
    venueId: decoded.venueId || decoded.venue_id,
    role: decoded.role || 'user',
    permissions: decoded.permissions || []
  };
}
```

### System 2: Internal Service Authentication (S2S)

**How it works:**
- Headers required: `x-internal-service`, `x-internal-signature`, `x-internal-timestamp`
- Payload format: `serviceName:timestamp:method:path:body`
- 5-minute timestamp window for replay attack prevention
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Supports service mesh mode (mTLS) via `SERVICE_MESH_ENABLED` env var
- Service allowlist configurable via `ALLOWED_INTERNAL_SERVICES`

**Allowed Services (default):**
- api-gateway
- event-service
- ticket-service
- order-service
- notification-service

**Code Example:**
```typescript
// From internal-auth.ts
export async function internalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const serviceName = request.headers[INTERNAL_SERVICE_HEADER] as string;
  const signature = request.headers[INTERNAL_SIGNATURE_HEADER] as string;
  const timestamp = request.headers[INTERNAL_TIMESTAMP_HEADER] as string;

  // Validate service name against allowlist
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    throw new ForbiddenError('Service not authorized for internal access', 'S2S_UNAUTHORIZED_SERVICE');
  }

  // If service mesh enabled, trust headers (mTLS handles auth)
  if (SERVICE_MESH_ENABLED) {
    request.internalAuth = { isInternalRequest: true, sourceService: serviceName, verified: true };
    return;
  }

  // Validate timestamp (prevent replay attacks)
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > MAX_REQUEST_AGE_MS) {
    throw new UnauthorizedError('Internal request expired', 'S2S_REQUEST_EXPIRED');
  }

  // Verify HMAC signature
  const body = request.body ? JSON.stringify(request.body) : '';
  const expectedSignature = generateSignature(serviceName, timestamp, request.method, request.url, body);

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    throw new UnauthorizedError('Invalid internal authentication signature', 'S2S_INVALID_SIGNATURE');
  }

  request.internalAuth = { isInternalRequest: true, sourceService: serviceName, verified: true };
}
```

### Security Note: Disabled Mock Auth

The file `src/middleware/auth.ts` has been **intentionally disabled** as a security fix (SEC-5). It previously contained mock authentication that bypassed all security by accepting any Bearer token. The file now throws an error if imported.

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/index.ts`
- `src/routes/*.routes.ts`

**Findings:**
- analytics-service does **not expose** any `/internal/` routes
- The `internalAuthMiddleware` and `requireInternalAuth` middleware are available but not currently used
- All routes use standard user JWT authentication
- This service is primarily a consumer of data from other services, not a provider of internal APIs

**Available Routes (all public/user-facing):**
- `/analytics/*` - Core analytics endpoints
- `/dashboards/*` - Dashboard management
- `/widgets/*` - Widget configuration
- `/alerts/*` - Alert management
- `/exports/*` - Data export
- `/insights/*` - Business insights
- `/metrics/*` - Metrics endpoints
- `/realtime/*` - Real-time streaming
- `/customers/*` - Customer analytics
- `/campaigns/*` - Campaign analytics
- `/predictions/*` - Predictive analytics
- `/reports/*` - Report generation

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Helper function for generating internal auth headers
**Files Examined:**
- `src/middleware/internal-auth.ts` - Auth header generator
- `src/config/index.ts` - Service URL configuration

### Service URL Configuration

```typescript
// From config/index.ts
services: {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  venue: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
  event: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
  ticket: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
  marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006',
}
```

### Internal Auth Header Generator

The service provides a helper function for making authenticated internal calls:

```typescript
// From internal-auth.ts
export function generateInternalAuthHeaders(
  targetMethod: string,
  targetPath: string,
  body?: object
): Record<string, string> {
  const serviceName = process.env.SERVICE_NAME || 'analytics-service';
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';

  const signature = generateSignature(
    serviceName,
    timestamp,
    targetMethod,
    targetPath,
    bodyStr
  );

  return {
    'x-internal-service': serviceName,
    'x-internal-signature': signature,
    'x-internal-timestamp': timestamp,
  };
}
```

### Usage Pattern (Not Implemented)

The analytics service has the infrastructure to call other services but **does not currently make outbound HTTP calls** to other services. It primarily:
1. Consumes events via RabbitMQ
2. Reads data from shared databases (PostgreSQL, MongoDB)
3. Uses Redis for real-time data

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib) + Bull + Redis Pub/Sub
**Files Examined:**
- `src/config/rabbitmq.ts` - RabbitMQ connection and publishing
- `src/services/event-stream.service.ts` - Bull queues for event processing
- `src/services/message-gateway.service.ts` - Notification message publishing

### RabbitMQ Configuration

**Features:**
- **Library:** amqplib (callback API)
- **Exchange:** `tickettoken_events` (topic type, durable)
- **Queue:** `analytics_events` (durable)
- **Binding:** `#` (receives all events)

**Code Example:**
```typescript
// From config/rabbitmq.ts
export async function connectRabbitMQ(): Promise<void> {
  amqp.connect(config.rabbitmq.url, (error, conn) => {
    connection = conn;

    connection.createChannel((error, ch) => {
      channel = ch;

      // Create exchange
      channel.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });

      // Create queue
      channel.assertQueue(config.rabbitmq.queue, {
        durable: true,
        exclusive: false,
        autoDelete: false,
      }, (error, queue) => {
        // Bind queue to ALL events
        channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
      });
    });
  });
}

export async function publishEvent(routingKey: string, data: any) {
  const message = Buffer.from(JSON.stringify(data));
  channel.publish(config.rabbitmq.exchange, routingKey, message, { persistent: true });
}
```

### Bull Queues (Event Stream Processing)

**Features:**
- **Library:** Bull (Redis-backed)
- **Purpose:** Real-time event processing and metrics updates
- **Queues:** ticket-purchase, ticket-scan, page-view, cart-update, venue-update

**Code Example:**
```typescript
// From event-stream.service.ts
export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();

  private initializeQueues() {
    const eventTypes = ['ticket-purchase', 'ticket-scan', 'page-view', 'cart-update', 'venue-update'];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  async pushEvent(type: string, event: StreamEvent) {
    const queue = this.queues.get(type);
    if (queue) {
      await queue.add(event, { removeOnComplete: true, removeOnFail: false });
    }
  }
}
```

### Redis Pub/Sub (Cross-Service Events)

**Code Example:**
```typescript
// From event-stream.service.ts
async subscribeToExternalEvents() {
  const subscriber = this.redis.duplicate();
  subscriber.subscribe('analytics:events');

  subscriber.on('message', async (_channel: string, message: string) => {
    const event = JSON.parse(message);
    await this.pushEvent(event.type, event);
  });
}
```

### Message Gateway Service (Outbound Notifications)

**Features:**
- Templated message sending (email, SMS, push, Slack)
- Alert notifications
- Report delivery notifications
- Queues messages via RabbitMQ

**Routing Keys Published:**
- `messages.email` - Email notifications
- `messages.sms` - SMS notifications
- `messages.push` - Push notifications
- `messages.slack` - Slack notifications

**Code Example:**
```typescript
// From message-gateway.service.ts
private async queueMessage(message: Message): Promise<void> {
  const channel = getChannel();
  const routingKey = `messages.${message.channel}`;

  channel.publish(
    'tickettoken_events',
    routingKey,
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );
}
```

### Workers

| Worker | Schedule | Description |
|--------|----------|-------------|
| PricingWorker | Every 15 minutes | Dynamic pricing calculations for events |
| RfmCalculatorWorker | Scheduled | RFM (Recency, Frequency, Monetary) customer scoring |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + HMAC internal auth | Algorithm/issuer/audience validation |
| Internal Endpoints | **None** | Service is data consumer, not provider |
| HTTP Client (Outgoing) | Helper available, not used | Reads from shared DBs instead |
| Message Queues | RabbitMQ + Bull + Redis Pub/Sub | Consumes all events (`#` binding) |

**Key Characteristics:**
- Analytics service is primarily a **data aggregation service**
- Receives events from all services via RabbitMQ wildcard binding
- Uses Bull queues for real-time event processing
- Publishes notification messages back to RabbitMQ for delivery
- Does not expose internal APIs or make outbound HTTP calls to other services
