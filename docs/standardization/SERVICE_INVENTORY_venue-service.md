# venue-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how venue-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - HMAC for internal routes + Per-service credentials for API routes
**Files Examined:**
- `src/routes/internal-validation.routes.ts` - HMAC authentication for `/internal/*` routes
- `src/config/service-auth.ts` - Per-service credential management and endpoint authorization
- `src/middleware/auth.middleware.ts` - User JWT and API key authentication

### System 1: HMAC Authentication (Internal Routes)

**How it works:**
- Uses `INTERNAL_SERVICE_SECRET` environment variable (required, no default)
- Headers required: `x-internal-service`, `x-internal-timestamp`, `x-internal-signature`
- Payload format: `serviceName:timestamp:method:url`
- 5-minute timestamp window for replay attack prevention
- Uses `crypto.timingSafeEqual` for constant-time comparison (HM18 security fix)
- Accepts `temp-signature` in non-production environments (dev bypass)

**Code Example:**
```typescript
// From internal-validation.routes.ts
const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
const expectedSignature = crypto
  .createHmac('sha256', INTERNAL_SECRET)
  .update(payload)
  .digest('hex');

// SECURITY FIX (HM18): Use constant-time comparison
const signatureBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');

if (signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

### System 2: Per-Service Credentials (API Routes)

**How it works:**
- Each calling service has unique credentials configured via environment variables
- Headers: `x-service-id`, `x-service-secret`
- Per-service endpoint allowlist with operation type (read/write)
- Credential rotation tracking with 30-day rotation warning
- Timing-safe secret comparison using SHA-256 hash

**Service Allowlist:**
| Service | Allowed Endpoints | Operations |
|---------|------------------|------------|
| auth-service | `/internal/*`, `/api/v1/venues/validate` | read |
| event-service | `/internal/*`, `/api/v1/venues/:venueId` | read |
| ticket-service | `/internal/*`, `/api/v1/venues/:venueId`, `/api/v1/venues/:venueId/settings` | read |
| payment-service | `/internal/*`, `/api/v1/venues/:venueId/stripe/*` | read, write |

**Code Example:**
```typescript
// From service-auth.ts
export async function authenticateService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceId = request.headers['x-service-id'] as string;
  const serviceSecret = request.headers['x-service-secret'] as string;

  if (!serviceId || !serviceSecret) {
    return reply.code(401).send({ error: 'Missing service credentials' });
  }

  // Verify service credentials
  if (!verifyServiceSecret(serviceId, serviceSecret)) {
    return reply.code(401).send({ error: 'Invalid service credentials' });
  }

  // Check if rotation is needed (30 days)
  if (needsRotation(serviceId)) {
    reply.header('X-Credentials-Rotation-Needed', 'true');
  }

  // Verify endpoint authorization (AZ9-AZ10)
  if (!isEndpointAllowed(serviceId, request.url, request.method)) {
    return reply.code(403).send({ error: 'Endpoint not authorized for this service' });
  }

  (request as any).serviceContext = { serviceId, isServiceRequest: true };
}
```

### System 3: User Authentication (JWT + API Key)

**How it works:**
- JWT (RS256) verification using public key from filesystem
- API key authentication with SHA-256 hashing for secure lookup
- Rate limiting on authentication attempts (10/minute per IP)
- Token validation includes: expiration, issuer, audience

**Security Fixes Applied:**
- SEC-DB6: Hash API keys before lookup (no plaintext storage)
- AE6: Validate token issuer and audience claims
- Rate limiting on auth attempts to prevent brute force

---

## Category 2: Internal Endpoint Patterns

**Implementation:** `/internal/` prefix with HMAC authentication
**Files Examined:**
- `src/routes/internal-validation.routes.ts`
- `src/config/fastify.ts` (route registration)

**Endpoints Found:**

| Endpoint | Method | Description | Used By |
|----------|--------|-------------|---------|
| `/internal/venues/:venueId/validate-ticket/:ticketId` | GET | Validate ticket belongs to venue | scanning-service |
| `/internal/venues/:venueId` | GET | Get venue details with blockchain fields | blockchain-service, compliance-service |
| `/internal/venues/:venueId/bank-info` | GET | Get venue bank account and payout info | compliance-service, payment-service |
| `/internal/venues/:venueId/chargeback-rate` | GET | Get venue chargeback rate and risk metrics | payment-service (chargeback-reserve.service) |

**Auth Applied:** All routes use HMAC preHandler hook (see Category 1, System 1)

**Code Example:**
```typescript
// Venue details endpoint for blockchain-service
fastify.get('/internal/venues/:venueId', async (request, reply) => {
  const { venueId } = request.params as { venueId: string };
  const traceId = request.headers['x-trace-id'] as string;

  const result = await db.raw(`
    SELECT
      v.id, v.tenant_id, v.name, v.slug, v.description,
      v.address_line1, v.city, v.state_province, v.country_code, v.postal_code,
      v.latitude, v.longitude, v.timezone,
      v.max_capacity, v.status, v.is_verified,
      v.wallet_address,  -- Blockchain field
      v.logo_url, v.cover_image_url,
      v.email, v.phone, v.website,
      v.created_by, v.created_at, v.updated_at
    FROM venues v
    WHERE v.id = ? AND v.deleted_at IS NULL
  `, [venueId]);

  return reply.send({
    venue: {
      id: venue.id,
      tenantId: venue.tenant_id,
      walletAddress: venue.wallet_address,  // Critical for blockchain-service
      // ... other fields
    },
  });
});
```

**Chargeback Rate Response Example:**
```typescript
return reply.send({
  venue: { id, tenantId, name, status, isVerified, ageInDays },
  chargebackMetrics: {
    totalChargebacks: 5,
    chargebackRate: 0.75,  // percentage
    riskLevel: 'medium',   // low | medium | high | critical
  },
  reserveRecommendation: {
    recommendedReservePercent: 10,  // Based on risk level
    isHighRisk: false,
    requiresReview: false,
  },
});
```

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Custom HttpClient class with circuit breaker (Opossum)
**Files Examined:**
- `src/utils/httpClient.ts`

**Features:**
- **Library:** Axios with Opossum circuit breaker
- **TLS Configuration:** TLS 1.2/1.3 minimum, certificate validation in production
- **Circuit Breaker:** 50% error threshold, 30s reset timeout
- **Request Tracing:** `X-Request-ID`, `X-Correlation-ID` headers
- **Service Identity:** `X-Service-Name`, `X-Service-Version` headers
- **HMAC Authentication:** Optional internal auth with `enableInternalAuth` flag

**Code Example:**
```typescript
// From httpClient.ts
export class HttpClient {
  private client: ReturnType<typeof axios.create>;
  private circuitBreaker: CircuitBreaker;
  private enableInternalAuth: boolean;

  constructor(options: string | HttpClientOptions, private logger: any) {
    // TLS configuration
    const httpsAgent = new https.Agent({
      rejectUnauthorized: isProduction,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    });

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'X-Service-Name': SERVICE_NAME,
        'X-Service-Version': SERVICE_VERSION,
        'User-Agent': `${SERVICE_NAME}/${SERVICE_VERSION}`,
      }
    });

    this.circuitBreaker = new CircuitBreaker(
      async (requestConfig: any) => this.client.request(requestConfig),
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );
  }

  // Request interceptor adds HMAC authentication if enabled
  private setupInterceptors() {
    this.client.interceptors.request.use((config: any) => {
      const requestId = config.headers?.['X-Request-ID'] || randomUUID();
      const correlationId = config.headers?.['X-Correlation-ID'] || requestId;

      config.headers['X-Request-ID'] = requestId;
      config.headers['X-Correlation-ID'] = correlationId;

      if (this.enableInternalAuth && INTERNAL_SERVICE_SECRET) {
        const timestamp = Date.now().toString();
        const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}`;
        const signature = createHmac('sha256', INTERNAL_SERVICE_SECRET)
          .update(payload)
          .digest('hex');

        config.headers['X-Internal-Service'] = SERVICE_NAME;
        config.headers['X-Internal-Timestamp'] = timestamp;
        config.headers['X-Internal-Signature'] = signature;
      }

      return config;
    });
  }
}

// Factory for internal service calls
export function createInternalHttpClient(baseURL: string, logger: any): HttpClient {
  return new HttpClient({ baseURL, enableInternalAuth: true }, logger);
}
```

**Security Features (NS13, RS9, SC1):**
- HTTPS enforcement in production with `rejectUnauthorized: true`
- TLS 1.2 minimum version
- Service identity headers for traceability
- HMAC signing for internal service calls

---

## Category 4: Message Queues

**Implementation:** RabbitMQ (amqplib) for event publishing + node-cron for scheduled jobs
**Files Examined:**
- `src/services/eventPublisher.ts` - RabbitMQ event publishing
- `src/jobs/index.ts` - Scheduled job orchestration
- `src/jobs/webhook-cleanup.job.ts` - Example cron job

### RabbitMQ Event Publishing

**Features:**
- **Library:** amqplib (RabbitMQ client)
- **Exchange:** `venue-events` (topic exchange, durable)
- **Circuit Breaker:** 2s timeout, 50% error threshold, 30s reset
- **Auto-reconnection:** Automatic reconnection on connection loss
- **Failed Event Queue:** Redis-backed retry queue for failed publishes
- **Tenant Context:** All events include `tenantId` in metadata (TENANT2 security fix)

**Event Types Published:**
| Event | Routing Key | Description |
|-------|------------|-------------|
| venue.created | `venue.created` | New venue created |
| venue.updated | `venue.updated` | Venue details updated |
| venue.deleted | `venue.deleted` | Venue deleted (soft) |

**Code Example:**
```typescript
// From eventPublisher.ts
export class EventPublisher {
  private connection: any = null;
  private channel: any = null;
  private readonly exchangeName = 'venue-events';

  async connect(): Promise<void> {
    this.connection = await amqplib.connect(this.rabbitUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });

    // Auto-reconnection
    this.connection.on('close', () => {
      this.connected = false;
      this.reconnect();
    });
  }

  private async publishInternal(message: EventMessage): Promise<void> {
    const routingKey = `${message.aggregateType}.${message.eventType}`;
    const messageBuffer = Buffer.from(JSON.stringify({
      ...message,
      metadata: {
        ...message.metadata,
        timestamp: message.metadata?.timestamp || new Date(),
      }
    }));

    this.channel.publish(
      this.exchangeName,
      routingKey,
      messageBuffer,
      { persistent: true }
    );
  }

  // SECURITY FIX (TENANT2): Include tenant context
  async publishVenueCreated(venueId: string, venueData: any, userId?: string, tenantId?: string): Promise<void> {
    try {
      await this.publish({
        eventType: 'created',
        aggregateId: venueId,
        aggregateType: 'venue',
        payload: venueData,
        metadata: { userId, tenantId, version: 1 }
      });

      // Also publish to search.sync exchange for search indexing
      await publishSearchSync('venue.created', {
        id: venueId,
        tenant_id: tenantId,
        name: venueData.name,
        // ... other search fields
      });
    } catch (error) {
      // Queue failed events for retry
      await this.queueFailedEvent('created', venueId, venueData, userId, tenantId);
      throw error;
    }
  }
}
```

**Search Sync Integration:**
- Uses `@tickettoken/shared` library's `publishSearchSync()` function
- Publishes to separate `search.sync` exchange for search-service

### Scheduled Jobs (node-cron)

**NOT using Bull/BullMQ** - Uses native `node-cron` for scheduled tasks

| Job | Schedule | Description |
|-----|----------|-------------|
| WebhookCleanupJob | Daily at 3 AM | Delete completed webhook events > 30 days |
| CacheWarmingJob | Hourly at :05 | Pre-warm frequently accessed venue data |
| ComplianceReviewJob | Daily at 2 AM | Check venues needing compliance review |
| ContentCleanupJob | Daily at 4 AM | Clean up orphaned MongoDB content |
| SSLRenewalJob | Daily at 5 AM | Check/renew custom domain SSL certs |

**Code Example:**
```typescript
// From webhook-cleanup.job.ts
export class WebhookCleanupJob {
  private task: ScheduledTask | null = null;

  start(): void {
    // Run daily at 3 AM
    this.task = cron.schedule('0 3 * * *', async () => {
      const deletedCount = await this.webhookService.cleanupOldEvents(30);
      log.info({ deletedCount }, 'Webhook cleanup completed');
    });
  }

  stop(): void {
    this.task?.stop();
  }
}
```

---

## Webhook Handlers (Incoming)

**Implementation:** External webhook receivers for third-party services
**Files Examined:**
- `src/routes/webhooks.routes.ts`

**Webhooks Received:**

| Endpoint | Source | Purpose |
|----------|--------|---------|
| `POST /api/webhooks/plaid` | Plaid | Bank verification status updates |
| `POST /api/webhooks/stripe/identity` | Stripe Identity | Identity verification results |

**Features:**
- Webhook deduplication via WebhookService
- Stripe signature verification using `stripe-signature` header
- Tenant context lookup from verification records
- Graceful error handling (return 200 to prevent retries)

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | HMAC + Per-service credentials | Dual system with endpoint authorization |
| Internal Endpoints | 4 endpoints under `/internal/` | HMAC authenticated |
| HTTP Client (Outgoing) | Axios + Opossum circuit breaker | Optional HMAC signing |
| Message Queues | RabbitMQ (amqplib) + node-cron | Topic exchange for events, cron for jobs |
