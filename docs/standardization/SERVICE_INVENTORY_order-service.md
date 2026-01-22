# order-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how order-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual HMAC systems with nonce-based replay protection
**Files Examined:**
- `src/middleware/internal-auth.middleware.ts` - Primary internal authentication
- `src/routes/internal.routes.ts` - Internal routes HMAC verification

### System 1: Internal Auth Middleware (For API routes)

**How it works:**
- Headers required: `x-internal-auth`, `x-service-name`, `x-request-timestamp`, `x-request-nonce`
- Payload format: `serviceName:timestamp:nonce:method:url`
- 5-minute timestamp window for replay attack prevention
- **Nonce tracking**: In-memory Map with 5-minute TTL to prevent replay attacks
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Service allowlist configurable via `ALLOWED_INTERNAL_SERVICES` env var

**Allowed Services (default):**
- payment-service
- ticket-service
- event-service

**Code Example:**
```typescript
// From internal-auth.middleware.ts
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers['x-internal-auth'] as string;
  const serviceName = request.headers['x-service-name'] as string;
  const timestamp = request.headers['x-request-timestamp'] as string;
  const nonce = request.headers['x-request-nonce'] as string;

  // S2S3: Validate timestamp (within 5 minute window)
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Request timestamp invalid or expired' });
    return;
  }

  // Check for replay attack (nonce reuse)
  const tokenKey = `${serviceName}:${nonce}`;
  if (usedTokens.has(tokenKey)) {
    logger.warn('Potential replay attack - nonce reused', { serviceName, nonce });
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid request' });
    return;
  }

  // S2S4: Validate service identity against whitelist
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    reply.status(403).send({ error: 'Forbidden', message: 'Service not authorized' });
    return;
  }

  // S2S2: Validate HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SERVICE_SECRET)
    .update(`${serviceName}:${timestamp}:${nonce}:${request.method}:${request.url}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedSignature))) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid authentication signature' });
    return;
  }

  // Mark nonce as used
  usedTokens.set(tokenKey, now);

  (request as any).internalService = { name: serviceName, authenticatedAt: now };
}
```

### System 2: Internal Routes HMAC (For /internal/* routes)

**How it works:**
- Headers required: `x-internal-service`, `x-internal-timestamp`, `x-internal-signature`
- Payload format: `serviceName:timestamp:url` (simpler than System 1)
- 5-minute timestamp window
- Uses `crypto.timingSafeEqual` for constant-time comparison
- Accepts `temp-signature` in non-production environments

**Code Example:**
```typescript
// From internal.routes.ts
const expectedSignature = crypto
  .createHmac('sha256', INTERNAL_SECRET)
  .update(`${serviceName}:${timestamp}:${request.url}`)
  .digest('hex');

// Timing-safe comparison
const signatureBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');

if (signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** `/internal/` prefix with HMAC authentication
**Files Examined:**
- `src/routes/internal.routes.ts`

**Endpoints Found:**

| Endpoint | Method | Description | Used By |
|----------|--------|-------------|---------|
| `/internal/orders/:orderId` | GET | Get order details by ID | payment-service |
| `/internal/orders/:orderId/items` | GET | Get order items with ticket info | blockchain-service |
| `/internal/orders/without-tickets` | GET | Find paid orders missing tickets | payment-service (reconciliation) |
| `/internal/orders/:orderId/for-payment` | GET | Get order with payment context | payment-service |

**Auth Applied:** All routes use `verifyInternalService` preHandler (System 2 HMAC)

**Notable Endpoint Details:**

**`/internal/orders/without-tickets`** - Reconciliation endpoint:
- Query params: `minutesOld` (default 5), `status` (default PAID), `limit` (max 500)
- Finds orphaned orders that were paid but never got tickets
- Used by payment reconciliation to detect failed ticket creation

**`/internal/orders/:orderId/for-payment`** - Payment validation endpoint:
- Returns order with `paymentContext` object containing:
  - `canProcessPayment`: Boolean indicating if payment can proceed
  - `isExpired`: Whether order has expired
  - `validationErrors`: Array of reasons why payment cannot proceed
  - `version`: For optimistic locking

**Code Example:**
```typescript
// For-payment endpoint response
return reply.send({
  order: {
    id: order.id,
    orderNumber: order.order_number,
    totalCents: order.total_cents,
    paymentIntentId: order.payment_intent_id,
    version: order.version, // For optimistic locking
    // ... other fields
  },
  items: itemsResult.rows.map(item => ({
    id: item.id,
    ticketTypeId: item.ticket_type_id,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
  })),
  paymentContext: {
    itemCount: parseInt(order.item_count || '0'),
    ticketCount: parseInt(order.ticket_count || '0'),
    canProcessPayment,
    isExpired,
    validationErrors: !canProcessPayment ? getOrderValidationErrors(order, isExpired) : [],
  },
});
```

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Custom secure client factory with circuit breakers and HMAC authentication
**Files Examined:**
- `src/utils/http-client.util.ts` - Secure HTTP client factory
- `src/services/payment.client.ts` - Payment service client
- `src/services/ticket.client.ts` - Ticket service client
- `src/services/event.client.ts` - Event service client

### Secure HTTP Client Factory

**Features:**
- **Library:** Axios with custom interceptors
- **TLS:** Enforces HTTPS in production, TLS 1.2 minimum, certificate validation
- **Authentication:** HMAC signature with timestamp and nonce
- **Context Propagation:** Request ID, Trace ID, Span ID, Tenant ID, User ID
- **Retry:** Exponential backoff with 30% jitter

**Security Headers Added:**
- `X-Service-Name`: Source service identity
- `X-Request-Timestamp`: Unix timestamp
- `X-Request-Nonce`: Random 16-byte hex string
- `X-Internal-Auth`: HMAC signature
- `X-Request-ID`, `X-Trace-ID`, `X-Span-ID`: Distributed tracing
- `X-Tenant-ID`, `X-User-ID`: Context propagation

**Code Example:**
```typescript
// From http-client.util.ts
export function createSecureServiceClient(config: ServiceClientConfig): AxiosInstance {
  // SC1: Enforce HTTPS in production
  if (NODE_ENV === 'production' && !baseURL.startsWith('https://')) {
    throw new Error(`HTTPS required for ${config.serviceName} in production`);
  }

  const client = axios.create({
    baseURL,
    timeout: config.timeout || 10000,
    httpsAgent: NODE_ENV === 'production' ? httpsAgent : undefined,
  });

  // Request interceptor adds authentication
  client.interceptors.request.use((axiosConfig) => {
    const timestamp = Date.now().toString();
    const nonce = generateNonce();
    const method = axiosConfig.method?.toUpperCase() || 'GET';
    const path = axiosConfig.url || '/';

    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', INTERNAL_SERVICE_SECRET)
      .update(`${SERVICE_NAME}:${timestamp}:${nonce}:${method}:${path}`)
      .digest('hex');

    axiosConfig.headers['X-Service-Name'] = SERVICE_NAME;
    axiosConfig.headers['X-Request-Timestamp'] = timestamp;
    axiosConfig.headers['X-Request-Nonce'] = nonce;
    axiosConfig.headers['X-Internal-Auth'] = signature;

    return axiosConfig;
  });

  return client;
}
```

### Pre-configured Service Clients

**PaymentClient** (`src/services/payment.client.ts`):
- Target: `PAYMENT_SERVICE_URL` (default: `http://tickettoken-payment:3006`)
- Circuit breakers per operation
- **Fallback for reads**: `getPaymentStatus` returns fail-closed default (`refundable: false`)
- **No fallback for writes**: `createPaymentIntent`, `confirmPayment`, `initiateRefund` must fail explicitly

**TicketClient** (`src/services/ticket.client.ts`):
- Target: `TICKET_SERVICE_URL` (default: `http://tickettoken-ticket:3004`)
- **Security-critical operations**: `getTicket`, `checkTicketNotTransferred`, `getTicketsForOrder` - NO fallback
- **Fallback for reads**: `checkAvailability`, `getPrices` return empty defaults
- Includes transfer check for refund validation (prevents double-spend)

**EventClient** (`src/services/event.client.ts`):
- Target: `EVENT_SERVICE_URL` (default: `http://tickettoken-event:3003`)
- **Fallback for all reads**: Returns safe defaults when service unavailable
- Used for refund eligibility (cancelled/postponed events)

**Code Example - Fail-Closed Pattern:**
```typescript
// From ticket.client.ts - Security-critical operation
async checkTicketNotTransferred(ticketId: string, originalBuyerId: string, context?: RequestContext): Promise<boolean> {
  try {
    const ticket = await this.getTicket(ticketId, context);

    if (ticket.ownerId !== originalBuyerId || ticket.hasBeenTransferred) {
      logger.warn('Ticket has been transferred - refund not allowed', {
        ticketId, originalBuyerId, currentOwnerId: ticket.ownerId,
      });
      return false;
    }

    return true;
  } catch (error) {
    // CRITICAL: Fail closed - if we can't verify, don't allow refund
    throw error;
  }
}
```

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib) with DLQ support + Custom job scheduler
**Files Examined:**
- `src/config/rabbitmq.ts` - RabbitMQ configuration and connection
- `src/events/event-publisher.ts` - Event publishing
- `src/events/event-subscriber.ts` - Event consumption
- `src/jobs/index.ts`, `src/jobs/job-manager.ts` - Scheduled jobs

### RabbitMQ Configuration

**Features:**
- **Library:** amqplib (callback API)
- **Exchange:** `tickettoken_events` (topic type, durable)
- **Queue:** `order_service_queue` (durable, with DLQ)
- **Dead Letter Queue:** `order_service_dlq` via `tickettoken_events_dlx` exchange
- **Auto-reconnection:** Exponential backoff with jitter (1s initial, 30s max)
- **Bindings:** `order.*`, `payment.*`, `dispute.*` routing keys

**Code Example:**
```typescript
// From rabbitmq.ts
ch.assertQueue(QUEUE_NAME, {
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    // Route failed messages to DLQ
    'x-dead-letter-exchange': DLQ_EXCHANGE_NAME,
    'x-dead-letter-routing-key': 'order.failed',
  },
}, (error, queue) => {
  // Bind queue to exchange for events
  ch.bindQueue(queue.queue, EXCHANGE_NAME, 'order.*');
  ch.bindQueue(queue.queue, EXCHANGE_NAME, 'payment.*');
  ch.bindQueue(queue.queue, EXCHANGE_NAME, 'dispute.*');
});
```

### Event Publishing

**Features:**
- Payload validation before publishing
- Event versioning with `getLatestVersion()`
- Idempotency key generation
- Retry with exponential backoff (3 attempts)

**Events Published:**

| Event | Routing Key | Description |
|-------|-------------|-------------|
| ORDER_CREATED | `order.created` | New order created |
| ORDER_RESERVED | `order.reserved` | Tickets reserved for order |
| ORDER_CONFIRMED | `order.confirmed` | Payment confirmed |
| ORDER_CANCELLED | `order.cancelled` | Order cancelled |
| ORDER_EXPIRED | `order.expired` | Order expired |
| ORDER_REFUNDED | `order.refunded` | Order refunded |
| ORDER_FAILED | `order.failed` | Order processing failed |

**Code Example:**
```typescript
// From event-publisher.ts
private async storeAndPublish(
  eventType: OrderEvents,
  payload: any,
  tenantId: string
): Promise<void> {
  const validatedPayload = validateEventPayloadOrThrow(eventType, payload);
  const version = getLatestVersion(eventType);
  const idempotencyKey = generateTimestampedIdempotencyKey(eventType, payload.orderId);

  const eventData = {
    version,
    type: eventType,
    idempotencyKey,
    sequenceNumber,
    aggregateId: payload.orderId,
    payload: validatedPayload,
    timestamp: new Date(),
  };

  await retry(
    () => publishEvent(eventType, eventData),
    { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
  );
}
```

### Event Subscription

**Features:**
- **Idempotency**: Redis-backed event deduplication (24-hour TTL)
- **DLQ Handling**: Failed messages not requeued, sent to DLQ
- Handles payment and dispute events from payment-service

**Events Consumed:**

| Event | Description |
|-------|-------------|
| `payment.succeeded` | Payment completed (informational) |
| `payment.failed` | Payment failed (informational) |
| `dispute.created` | Chargeback initiated - locks refunds |
| `dispute.updated` | Dispute status changed |
| `dispute.closed` | Dispute resolved - unlocks refunds if won |

**Code Example:**
```typescript
// From event-subscriber.ts
channel.consume('order_service_queue', async (msg) => {
  const event = JSON.parse(msg.content.toString());

  // Idempotency check
  const eventId = event.id || `${event.type}:${event.payload?.orderId}:${Date.now()}`;
  if (await this.isEventProcessed(eventId)) {
    logger.info('Skipping duplicate event', { eventId, type: event.type });
    channel.ack(msg);
    return;
  }

  switch (event.type) {
    case 'dispute.created':
      await this.handleDisputeCreated(event);
      break;
    case 'dispute.closed':
      await this.handleDisputeClosed(event);
      break;
    // ...
  }

  await this.markEventProcessed(eventId);
  channel.ack(msg);
});
```

### Scheduled Jobs

**Implementation:** Custom JobManager with graceful shutdown (NOT Bull/BullMQ)
**Files:** `src/jobs/job-manager.ts`, `src/jobs/*.job.ts`

**Registered Jobs:**

| Job | Description |
|-----|-------------|
| ExpirationJob | Expire pending orders past deadline |
| ReminderJob | Send order reminders |
| ReconciliationJob | Reconcile order states |
| OrderArchivingJob | Archive old orders |
| EventReminderJob | Send event reminders |

**Features:**
- Graceful shutdown with 30s timeout
- Per-job circuit breakers
- Process signal handlers (SIGTERM, SIGINT)
- Status monitoring API

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | Dual HMAC with nonce replay protection | Service allowlist, timing-safe comparison |
| Internal Endpoints | 4 endpoints under `/internal/` | Payment/reconciliation focus |
| HTTP Client (Outgoing) | Secure Axios with HMAC | Fail-closed for security operations |
| Message Queues | RabbitMQ (amqplib) + Custom jobs | DLQ support, Redis idempotency |
