# Service Communication Inventory
**Date:** January 21, 2026  
**Purpose:** Document how each of the 21 services implements the 4 connection patterns

---

## auth-service

### Category 1: Service-to-Service Authentication (Incoming)
**Implementation:** JWT with RS256 algorithm  
**Files Examined:**
- `src/middleware/s2s.middleware.ts`

**How it works:**
- Services send JWT token in `x-service-token` header
- Uses RS256 (public/private key pairs)
- Separate S2S keys from user JWT keys
- Service allowlist: auth-service, event-service, payment-service, notification-service, venue-service, blockchain-service, order-service, scanning-service, transfer-service, marketplace-service, api-gateway

**Code Example:**
```typescript
// From s2s.middleware.ts
const decoded = jwt.verify(serviceToken, s2sKeyManager.getPublicKey(), {
  algorithms: ['RS256'],
}) as ServiceTokenPayload;

if (decoded.type !== 'service') {
  throw new Error('Invalid token type');
}
```

### Category 2: Internal Endpoint Patterns
**Implementation:** `/internal/` prefix with mixed REST/action patterns  
**Files Examined:**
- `src/routes/internal.routes.ts`

**Endpoints Found:**
- `POST /internal/validate-permissions` - Check user permissions
- `POST /internal/validate-users` - Bulk validate users
- `GET /internal/user-tenant/:userId` - Get tenant context
- `GET /internal/health` - Service health
- `GET /internal/users/:userId` - Get user by ID
- `GET /internal/users/by-email/:email` - Get user by email
- `GET /internal/users/admins` - Get admin users

**Auth Applied:** All routes use `verifyServiceToken` preHandler

### Category 3: HTTP Client (Outgoing)
**Implementation:** Custom axios client with retry and circuit breaker  
**Files Examined:**
- `src/utils/http-client.ts`

**Features:**
- Axios-based
- Exponential backoff retry (3 retries, 1000ms base delay)
- Circuit breaker integration
- Correlation ID tracking via `x-correlation-id` header
- Pre-configured clients for venue-service, notification-service, api-gateway

**Code Example:**
```typescript
// From http-client.ts
const client = axios.create({
  baseURL: options.baseURL,
  timeout: options.timeout || 5000,
});

// Retry logic with exponential backoff
const delay = calculateBackoff(config.__retryCount, retryConfig.retryDelay);
await sleep(delay);
return client.request(config);
```

### Category 4: Message Queues
**Implementation:** None  
**Files Examined:**
- Searched entire service - no queue publishing/consuming found

---

## ticket-service

### Category 1: Service-to-Service Authentication (Incoming)
**Implementation:** HMAC with shared secret  
**Files Examined:**
- `src/routes/internalRoutes.ts` (verifyInternalService function)

**How it works:**
- Services send signature in `x-internal-signature` header
- Also requires `x-internal-service` (service name) and `x-internal-timestamp`
- Signature format: HMAC-SHA256(serviceName:timestamp:url, INTERNAL_SERVICE_SECRET)
- 5 minute timestamp window to prevent replay attacks
- Accepts "temp-signature" in non-production

**Code Example:**
```typescript
// From internalRoutes.ts
const expectedSignature = crypto
  .createHmac('sha256', INTERNAL_SECRET)
  .update(`${serviceName}:${timestamp}:${request.url}`)
  .digest('hex');

if (signature !== expectedSignature) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

### Category 1b: Service-to-Service Authentication (Outgoing)
**Implementation:** JWT (preferred) + HMAC (legacy fallback) - sends BOTH  
**Files Examined:**
- `src/services/interServiceClient.ts`
- `src/config/service-auth.ts`

**How it works:**
- Generates short-lived JWT token (60s expiry) with body hash
- Also generates HMAC signature for backwards compatibility
- Sends both `Authorization: Bearer <jwt>` AND `X-Signature: <hmac>`

**Code Example:**
```typescript
// From interServiceClient.ts
jwtToken = generateServiceToken(fullServiceName, {
  subject: requestConfig.url,
  bodyHash,
  expiresIn: 60
});

// Add JWT Bearer token (preferred)
if (jwtToken) {
  additionalHeaders['Authorization'] = `Bearer ${jwtToken}`;
}

// Also add legacy signature for services not yet upgraded
if (signature) {
  additionalHeaders['X-Signature'] = signature;
}
```

### Category 2: Internal Endpoint Patterns
**Implementation:** `/internal/` prefix with descriptive resource-based patterns  
**Files Examined:**
- `src/routes/internalRoutes.ts`

**Endpoints Found:**
- `GET /internal/tickets/:ticketId/status` - Get ticket status
- `POST /internal/tickets/cancel-batch` - Batch cancel tickets
- `POST /internal/tickets/calculate-price` - Calculate total price
- `GET /internal/tickets/:ticketId/full` - Full ticket with event data
- `GET /internal/tickets/by-event/:eventId` - All tickets for event
- `GET /internal/tickets/by-token/:tokenId` - Get by blockchain token
- `POST /internal/tickets/:ticketId/transfer` - Transfer ticket
- `GET /internal/orders/:orderId/tickets/count` - Count tickets in order
- `POST /internal/tickets/:ticketId/record-scan` - Record scan event
- `POST /internal/tickets/:ticketId/update-nft` - Update NFT fields
- `POST /internal/tickets/batch-by-token` - Batch lookup by tokens
- `GET /internal/tickets/:ticketId/for-validation` - Validation-specific data
- `GET /internal/tickets/:ticketId/for-refund` - Refund eligibility data

**Auth Applied:** All routes use `verifyInternalService` preHandler (HMAC)

### Category 3: HTTP Client (Outgoing)
**Implementation:** Custom InterServiceClient class with circuit breaker  
**Files Examined:**
- `src/services/interServiceClient.ts`

**Features:**
- Axios-based with custom wrapper
- Circuit breaker for service failures (5 failures opens circuit, 30s recovery timeout)
- Exponential backoff retry
- Health checking every 30 seconds
- Pre-configured for: auth, event, payment, notification services
- Both JWT and HMAC authentication on outgoing requests

**Code Example:**
```typescript
// From interServiceClient.ts
if (!circuitBreaker.allowRequest(fullServiceName)) {
  throw new Error(`Circuit breaker OPEN for ${fullServiceName}`);
}

// Success tracking
circuitBreaker.recordSuccess(fullServiceName);

// Failure tracking for 5xx
if (!error.response || error.response.status >= 500) {
  circuitBreaker.recordFailure(fullServiceName, error);
}
```

### Category 4: Message Queues
**Implementation:** RabbitMQ (amqplib) with DLQ support  
**Files Examined:**
- `src/services/queueService.ts`
- `src/config/service-auth.ts` (RABBITMQ_CONFIG)

**Features:**
- Uses amqplib library
- Separate publish and consume channels
- Dead Letter Queue (DLQ) for failed messages (3 retries, 24h TTL)
- Auto-reconnection with exponential backoff (max 10 attempts)
- TLS required in production (amqps://)
- Per-service credentials (not shared admin account)

**Code Example:**
```typescript
// From queueService.ts
this.connection = await amqplib.connect(config.rabbitmq.url);
this.publishChannel = await this.connection.createChannel();
this.consumeChannel = await this.connection.createChannel();

// DLQ setup
const dlqName = `${queue}${DLQ_CONFIG.dlqSuffix}`;
await this.publishChannel.assertQueue(dlqName, {
  durable: true,
  arguments: { 'x-message-ttl': DLQ_CONFIG.dlqMessageTtl }
});
```

---

## event-service

### Category 1: Service-to-Service Authentication (Incoming)
**Implementation:** Multiple methods - JWT + Service Token + API Key + HMAC  
**Files Examined:**
- `src/middleware/auth.ts` - Main authentication middleware
- `src/config/service-auth.ts` - S2S token generation and verification
- `src/routes/internal.routes.ts` - HMAC authentication for internal routes

**How it works:**
Event-service supports **3 different authentication methods** for incoming requests:

1. **User JWT (RS256)** - For end-user requests
   - Bearer token in Authorization header
   - Verifies with public key from filesystem
   - Auto-reloads key every 5 minutes for rotation support

2. **Service Token (HMAC-based)** - For S2S requests
   - Custom token in `X-Service-Token` header
   - Base64-encoded JSON with HMAC signature
   - Token format: `{ iss, sub, iat, exp, nonce, env, scopes, sig }`
   - Supports token revocation via Redis
   - Trusted services: auth-service, venue-service, ticket-service, order-service

3. **API Key** - Alternative S2S authentication
   - API key in `X-API-Key` header
   - Configured via SERVICE_API_KEYS environment variable
   - Format: "service1:key1,service2:key2"

4. **HMAC Signature (Internal routes only)** - For `/internal/*` endpoints
   - Signature in `x-internal-signature` header
   - Also requires `x-internal-service` and `x-internal-timestamp`
   - Format: HMAC-SHA256(serviceName:timestamp:url, INTERNAL_SERVICE_SECRET)
   - 5 minute timestamp window

**Special Features:**
- **Token Revocation**: Redis-backed revocation list with fallback to in-memory
- **Credential Rotation**: Supports SERVICE_SECRET and SERVICE_SECRET_PREVIOUS
- **Scope-based Authorization**: Service tokens include scopes (events:read, events:write, etc.)
- **Unified Middleware**: `authenticateUserOrService()` handles both users and services

**Code Examples:**
```typescript
// Service token verification (from service-auth.ts)
export async function verifyServiceToken(token: string): Promise<{
  valid: boolean;
  serviceId?: string;
  scopes?: TokenScope[];
  error?: string;
}> {
  const tokenHash = hashToken(token);
  if (await isTokenRevoked(tokenHash)) {
    return { valid: false, error: 'Token revoked' };
  }

  const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Token expired' };
  }

  // Verify signature
  const { sig, ...payload } = decoded;
  const expectedSig = crypto
    .createHmac('sha256', SERVICE_CONFIG.serviceSecret)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (!timingSafeEqual(sig, expectedSig)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, serviceId: decoded.iss, scopes: decoded.scopes };
}
```

```typescript
// HMAC signature verification (from internal.routes.ts)
const expectedSignature = crypto
  .createHmac('sha256', INTERNAL_SECRET)
  .update(`${serviceName}:${timestamp}:${request.url}`)
  .digest('hex');

if (!crypto.timingSafeEqual(
  Buffer.from(signature, 'hex'),
  Buffer.from(expectedSignature, 'hex')
)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

```typescript
// Unified authentication middleware (from auth.ts)
export async function authenticateUserOrService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check for service token first
  const serviceToken = request.headers['x-service-token'];
  if (serviceToken) {
    const result = await verifyServiceToken(serviceToken);
    if (result.valid && result.serviceId) {
      (request as any).user = {
        id: result.serviceId,
        source: 'service',
        serviceId: result.serviceId,
        permissions: ['*'],
        role: 'service',
        isInternalRequest: isTrustedService(result.serviceId),
      };
      return;
    }
  }

  // Try API key
  const apiKey = request.headers['x-api-key'];
  if (apiKey) {
    const result = await verifyApiKey(apiKey);
    // Similar handling...
  }

  // Fall back to user JWT
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, publicKey, {
      issuer: process.env.JWT_ISSUER,
      algorithms: ['RS256'],
    });
    // Set user context...
  }
}
```

### Category 2: Internal Endpoint Patterns
**Implementation:** `/internal/` prefix with HMAC authentication  
**Files Examined:**
- `src/routes/internal.routes.ts`

**Endpoints Found:**
- `GET /internal/events/:eventId` - Get full event details with blockchain fields
- `GET /internal/events/:eventId/pda` - Get blockchain PDA (Program Derived Address) data
- `GET /internal/events/:eventId/scan-stats` - Get aggregated scan statistics

**Auth Applied:** All routes use `verifyInternalService` preHandler (HMAC signature)

**Usage Context:**
- Used by minting-service for blockchain operations
- Used by payment-service for event validation
- Used by scanning-service for analytics dashboards

**Code Example:**
```typescript
// Internal route with HMAC auth (from internal.routes.ts)
export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes
  fastify.addHook('preHandler', verifyInternalService);

  fastify.get('/internal/events/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const tenantId = request.headers['x-tenant-id'];
    
    const event = await db('events')
      .select(
        'id', 'tenant_id', 'name', 'description',
        // Blockchain fields - critical for minting-service
        'event_pda', 'artist_wallet', 'artist_percentage',
        'venue_percentage', 'resaleable'
      )
      .where('id', eventId)
      .whereNull('deleted_at')
      .first();

    return reply.send({ event });
  });
}
```

### Category 3: HTTP Client (Outgoing)
**Implementation:** Custom VenueServiceClient with circuit breaker  
**Files Examined:**
- `src/services/venue-service.client.ts`
- `src/config/service-auth.ts`

**Features:**
- node-fetch based (not axios like other services)
- Circuit breaker using **opossum** library
- Exponential backoff retry via custom `withRetry()` utility
- S2S authentication using `getS2SHeaders()`
- In-memory cache fallback for degraded mode (tenant-isolated)
- HTTPS enforced in production (unless ALLOW_INSECURE_SERVICE_CALLS=true)
- Idempotency key generation for mutating operations

**Pre-configured Clients:**
- venue-service (for venue validation and details)

**Code Example:**
```typescript
// VenueServiceClient with circuit breaker (from venue-service.client.ts)
export class VenueServiceClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    const rawUrl = config.services?.venueServiceUrl || process.env.VENUE_SERVICE_URL;
    this.baseUrl = validateServiceUrl(rawUrl); // Enforces HTTPS in prod

    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
    };

    this.circuitBreaker = new CircuitBreaker(this.requestWithRetry.bind(this), options);

    this.circuitBreaker.on('open', () => {
      this.isDegraded = true;
      logger.warn('Circuit breaker opened - entering degraded mode');
    });
  }

  async getVenue(venueId: string, tenantId: string): Promise<any> {
    try {
      const venue = await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: { 'X-Tenant-ID': tenantId },
      });
      
      // Cache for fallback
      this.cacheVenue(tenantId, venue);
      return venue;
    } catch (error) {
      // Fallback to cache in degraded mode
      if (this.isDegraded) {
        const cached = this.getCachedVenue(tenantId, venueId);
        if (cached) {
          logger.warn('Returning cached venue data');
          return { ...cached, _cached: true };
        }
      }
      throw error;
    }
  }

  private async request(path: string, options: any = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const s2sHeaders = getS2SHeaders(); // S2S authentication

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...s2sHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Venue service error: ${response.status}`);
    }

    return response.json();
  }
}
```

```typescript
// S2S headers generation (from service-auth.ts)
export function getS2SHeaders(): Record<string, string> {
  const token = generateServiceToken();

  return {
    'X-Service-Token': token.token,
    'X-Service-ID': SERVICE_CONFIG.serviceId,
    'X-Service-Name': SERVICE_CONFIG.serviceName,
    'X-Request-ID': crypto.randomBytes(8).toString('hex'),
    'User-Agent': `${SERVICE_CONFIG.serviceName}/${SERVICE_CONFIG.version}`,
    // W3C Trace Context headers if available
    'traceparent': getTraceParentHeader(),
  };
}
```

### Category 4: Message Queues
**Implementation:** Bull (Redis-backed job queue) - Internal jobs only, NOT inter-service messaging  
**Files Examined:**
- `src/jobs/index.ts`
- `src/jobs/event-transitions.job.ts`

**Important Note:** Unlike ticket-service which uses RabbitMQ for inter-service messaging, event-service uses Bull only for **internal scheduled jobs** (event transitions, notifications, cleanup). It does NOT publish/consume messages from other services.

**Features:**
- Uses Bull library with Redis backend
- Three queues: event-transitions, event-notifications, event-cleanup
- Distributed locking for multi-instance coordination
- Exponential backoff retry (3 attempts, 1000ms base delay)
- Scheduled/recurring jobs with cron support
- Keeps last 100 completed, 500 failed jobs

**Code Example:**
```typescript
// Queue setup (from jobs/index.ts)
export function getQueue(queueName: string): Queue {
  const queue = new Bull(queueName, {
    redis: getRedisConfig(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
    settings: {
      lockDuration: 30000,      // 30 seconds lock
      lockRenewTime: 15000,     // Renew lock every 15 seconds
      stalledInterval: 30000,   // Check for stalled jobs
      maxStalledCount: 1,
    },
  });

  queue.on('failed', (job: Job, error: Error) => {
    logger.error({
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      attempts: job.attemptsMade,
    }, 'Job failed');
  });

  return queue;
}

// Schedule recurring job
export async function scheduleRecurringJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  cronExpression: string,
): Promise<void> {
  const queue = getQueue(queueName);
  
  await queue.add(jobName, data, {
    repeat: { cron: cronExpression },
    jobId: `${jobName}-recurring`,
  });
}
```

---

## payment-service

### Category 1: Service-to-Service Authentication (Incoming)
**Implementation:** Dual HMAC systems with different payload formats  
**Files Examined:**
- `src/middleware/internal-auth.ts` - Internal routes authentication
- `src/middleware/service-auth.middleware.ts` - Service allowlist with granular permissions
- `src/utils/crypto.util.ts` - Cryptographic utilities

**How it works:**
Payment-service implements **TWO separate HMAC authentication systems** that use different payload formats:

**System 1: Internal Auth Middleware** (for `/internal/*` routes)
- Headers: `x-internal-service`, `x-internal-timestamp`, `x-internal-signature`
- Payload format: `serviceName:timestamp:method:url:JSON.stringify(body)`
- Secret: `INTERNAL_SERVICE_SECRET` (must be 32+ chars in production)
- 5-minute timestamp window for replay attack prevention
- Uses timing-safe comparison (`crypto.timingSafeEqual`)
- Dev bypass removed - all environments require proper auth

**System 2: Service Auth Middleware** (for regular API routes with `/api/v1/*`)
- Headers: `x-service-name`, `x-service-signature`, `x-service-timestamp`
- Payload format: `serviceName:timestamp:body` (simpler than System 1)
- Secret: `SERVICE_AUTH_SECRET` or `HMAC_SECRET`
- 5-minute timestamp window
- **Service Allowlist with Granular Endpoint Permissions:**
  - `ticket-service`: payment intents, captures, cancels, refunds, internal payment status
  - `order-service`: payment intents, captures, cancels, refunds, internal order payments
  - `venue-service`: connected accounts, transfers, internal venue earnings
  - `marketplace-service`: payment intents, escrow operations (hold/release/refund)
  - `notification-service`: internal payment details, refund details (read-only)
  - `admin-service`: wildcard access to all endpoints (`*`)

**Code Examples:**
```typescript
// System 1: Internal Auth (from internal-auth.ts)
const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}:${JSON.stringify(request.body)}`;
const expectedSignature = crypto
  .createHmac('sha256', INTERNAL_SECRET)
  .update(payload)
  .digest('hex');

// SECURITY FIX: Use timing-safe comparison
const signatureBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');

if (signatureBuffer.length !== expectedBuffer.length || 
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

```typescript
// System 2: Service Auth with Allowlist (from service-auth.middleware.ts)
const SERVICE_ALLOWLIST: Record<string, EndpointPermission[]> = {
  'ticket-service': [
    { method: 'POST', path: '/api/v1/payments/intents' },
    { method: 'GET', path: '/api/v1/payments/:id' },
    { method: 'POST', path: '/api/v1/payments/:id/capture' },
    { method: 'POST', path: '/api/v1/refunds' },
    { method: 'GET', path: '/internal/payment-status/:id' },
  ],
  'marketplace-service': [
    { method: 'POST', path: '/api/v1/escrow/hold' },
    { method: 'POST', path: '/api/v1/escrow/release' },
  ],
  // ... more services
};

// Verify service has permission for endpoint
function checkEndpointPermission(
  serviceName: string,
  method: string,
  path: string
): boolean {
  const permissions = SERVICE_ALLOWLIST[serviceName];
  if (!permissions) return false;

  for (const permission of permissions) {
    if (permission.method !== '*' && permission.method !== method) continue;
    if (matchPath(permission.path, path)) return true;
  }
  return false;
}
```

```typescript
// Crypto utilities (from crypto.util.ts)
export function signServiceRequest(
  serviceName: string,
  body?: object | string
): ServiceRequestSignature {
  const timestamp = Date.now().toString();
  const bodyString = body ? JSON.stringify(body) : '';
  const payload = `${serviceName}:${timestamp}:${bodyString}`;
  const signature = generateHmac(payload, secret);

  return { serviceName, signature, timestamp };
}

export function verifyServiceRequest(
  signature: string,
  serviceName: string,
  timestamp: string,
  body?: object | string
): VerifyServiceRequestResult {
  // Check timestamp freshness (5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;

  if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
    return { valid: false, error: 'Request timestamp expired or invalid' };
  }

  const bodyString = body ? JSON.stringify(body) : '';
  const payload = `${serviceName}:${timestamp}:${bodyString}`;
  const expectedSignature = generateHmac(payload, secret);

  if (!secureCompare(signature, expectedSignature)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}
```

### Category 2: Internal Endpoint Patterns
**Implementation:** `/internal/` prefix with HMAC authentication  
**Files Examined:**
- `src/routes/internal.routes.ts`
- `src/routes/internal-tax.routes.ts`

**Endpoints Found:**
- `POST /internal/payment-complete` - Update payment transaction status to completed
- `POST /internal/calculate-tax` - Calculate tax for venue/customer address combination

**Auth Applied:** All routes use `internalAuth` preHandler (System 1 HMAC with extended payload)

**Usage Context:**
- `/internal/payment-complete` - Called by order-service after successful order creation
- `/internal/calculate-tax` - Called by order-service/ticket-service during checkout

**Code Example:**
```typescript
// From internal.routes.ts
export default async function internalRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/internal/payment-complete',
    { preHandler: [internalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, paymentId } = request.body as any;

      const result = await db('payment_transactions')
        .where('id', paymentId)
        .update({ status: 'completed', updated_at: new Date() })
        .returning('*');

      return reply.send({ 
        success: true, 
        orderId, 
        paymentId, 
        transaction: result[0] 
      });
    }
  );
}
```

### Category 3: HTTP Client (Outgoing)
**Implementation:** Custom SecureHttpClient with circuit breaker  
**Files Examined:**
- `src/utils/http-client.util.ts`

**Features:**
- **Library:** Native Node.js `https`/`http` modules (NOT axios)
- Custom agent with keep-alive, max 50 sockets
- Circuit breaker: 5 failures opens circuit, 30s reset timeout
- Exponential backoff retry (max 3 attempts)
- HTTPS enforcement in production with automatic URL upgrade
- HMAC request signing via `X-Signature`, `X-Timestamp`, `X-Nonce` headers
- TLS certificate validation (`rejectUnauthorized` in production)

**Pre-configured Service Clients:**
- auth-service
- event-service
- ticket-service
- venue-service
- marketplace-service

**Code Example:**
```typescript
// From http-client.util.ts
export class SecureHttpClient {
  private baseUrl: URL;
  private agent: https.Agent | http.Agent;

  constructor(baseUrl: string, options: Partial<HttpClientConfig> = {}) {
    this.config = { ...defaultConfig, ...options };
    this.baseUrl = this.validateAndUpgradeUrl(baseUrl);

    if (this.baseUrl.protocol === 'https:') {
      this.agent = new https.Agent({
        keepAlive: true,
        maxSockets: 50,
        timeout: this.config.timeoutMs,
        rejectUnauthorized: config.server.env === 'production',
      });
    }
  }

  private signRequest(method: string, path: string, body?: unknown) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const bodyString = body ? JSON.stringify(body) : '';

    const payload = `${timestamp}:${nonce}:${method}:${path}:${bodyString}`;
    const signature = generateHmac(payload, this.config.hmacSecret);

    return { signature, timestamp, nonce };
  }

  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `${this.config.serviceName}/1.0`,
      'X-Request-ID': crypto.randomUUID(),
      'X-Source-Service': this.config.serviceName,
      ...options.headers,
    };

    // Add HMAC signature
    if (this.config.hmacSecret && !options.skipHmac) {
      const sig = this.signRequest(options.method, fullPath, options.body);
      headers['X-Signature'] = sig.signature;
      headers['X-Timestamp'] = sig.timestamp;
      headers['X-Nonce'] = sig.nonce;
    }

    // Retry with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.doRequest<T>(options, attempt);
      } catch (error) {
        if (attempt >= maxRetries) throw error;
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Circuit breaker for S2S calls
export async function makeS2SRequest<T>(
  serviceName: string,
  client: SecureHttpClient,
  options: HttpRequestOptions
): Promise<HttpResponse<T>> {
  if (!canMakeRequest(serviceName)) {
    throw new Error(`Circuit breaker open for ${serviceName}`);
  }

  try {
    const response = await client.request<T>(options);
    recordSuccess(serviceName);
    return response;
  } catch (error) {
    recordFailure(serviceName);
    throw error;
  }
}

// Pre-configured service clients
export const serviceClients = {
  get auth(): SecureHttpClient {
    return createServiceClient('authUrl');
  },
  get event(): SecureHttpClient {
    return createServiceClient('eventUrl');
  },
  get ticket(): SecureHttpClient {
    return createServiceClient('ticketUrl');
  },
  // ... more services
};
```

### Category 4: Message Queues
**Implementation:** RabbitMQ (amqplib) with Outbox Pattern  
**Files Examined:**
- `src/services/queueService.ts` - Basic RabbitMQ publish wrapper
- `src/workers/outbox.processor.ts` - Outbox pattern implementation

**Important Note:** Payment-service is **publish-only** - no message consumers found. Uses Outbox Pattern for guaranteed delivery.

**Features:**
- **Library:** amqplib (RabbitMQ client)
- Outbox Pattern for reliability:
  - Events stored in PostgreSQL `outbox` table first
  - Background processor polls every 5 seconds
  - `FOR UPDATE SKIP LOCKED` for multi-instance safety
  - Exponential backoff retry (max 5 attempts)
  - Dead Letter Queue (`outbox_dlq`) for permanently failed events
- Connection URL: `AMQP_URL` environment variable (defaults to `amqp://rabbitmq:5672`)

**Event Types Published:**
1. `order.paid` → HTTP webhook to ticket-service at `/api/v1/webhooks/payment-confirmed`
2. `order.payment_failed` → HTTP webhook to ticket-service at `/api/v1/webhooks/payment-failed`
3. `tickets.create` → RabbitMQ queue `ticket.mint` for minting-service

**Webhook Authentication:**
- Uses HMAC signature with `x-internal-signature`, `x-webhook-timestamp`, `x-webhook-nonce` headers
- Payload: `timestamp.nonce.JSON.stringify(body)`
- Secret: `INTERNAL_WEBHOOK_SECRET` environment variable
- Includes `x-idempotency-key` for deduplication

**Code Example:**
```typescript
// Basic RabbitMQ service (from queueService.ts)
export class QueueService {
  private connection: any = null;
  private channel: any = null;

  async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect(process.env.AMQP_URL);
      this.channel = await this.connection.createChannel();
    }
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.channel) await this.connect();

    await this.channel.assertQueue(queue, { durable: true });
    const buffer = Buffer.from(JSON.stringify(message));
    await this.channel.sendToQueue(queue, buffer, { persistent: true });
  }
}
```

```typescript
// Outbox processor (from outbox.processor.ts)
export class OutboxProcessor {
  async processOutboxEvents() {
    await withSystemContextPool(this.pool, async (client) => {
      const result = await client.query(`
        SELECT * FROM outbox
        WHERE processed_at IS NULL
          AND attempts < $1
          AND (
            last_attempt_at IS NULL
            OR last_attempt_at < NOW() - INTERVAL '1 second' * $2
          )
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `, [MAX_RETRY_ATTEMPTS, retryDelay]);

      for (const event of result.rows) {
        await this.processEvent(client, event);
      }
    });
  }

  private async handleOrderPaid(event: any): Promise<boolean> {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    const requestBody = {
      orderId: payload.orderId,
      paymentId: payload.paymentId,
      amount: payload.amount,
      ticketQuantity: payload.ticketQuantity,
      idempotencyKey: `payment-${payload.orderId}-${payload.paymentId}`,
    };

    // Create webhook signature
    const signaturePayload = `${timestamp}.${nonce}.${JSON.stringify(requestBody)}`;
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signaturePayload)
      .digest('hex');

    const response = await axios.post(
      'http://ticket:3004/api/v1/webhooks/payment-confirmed',
      requestBody,
      {
        headers: {
          'x-internal-signature': signature,
          'x-webhook-timestamp': timestamp,
          'x-webhook-nonce': nonce,
          'x-idempotency-key': requestBody.idempotencyKey,
        },
        timeout: 10000
      }
    );

    return response.status >= 200 && response.status < 300;
  }

  private async handleTicketCreation(event: any): Promise<boolean> {
    const queueService = require('../services/queueService').queueService;
    await queueService.publish('ticket.mint', payload);
    return true;
  }

  private async moveToDeadLetterQueue(client: any, event: any, error: string) {
    await client.query(`
      INSERT INTO outbox_dlq (
        original_id, aggregate_id, aggregate_type, event_type,
        payload, attempts, last_error, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [/* ... */]);

    await client.query(`
      UPDATE outbox SET processed_at = NOW(),
        last_error = 'Moved to DLQ after max retries'
      WHERE id = $1
    `, [event.id]);
  }
}
```

---

## Services Remaining (17)
- venue-service
- order-service
- notification-service
- marketplace-service
- blockchain-service
- blockchain-indexer
- minting-service
- scanning-service
- transfer-service
- compliance-service
- file-service
- integration-service
- monitoring-service
- queue-service
- search-service
- analytics-service
- api-gateway
