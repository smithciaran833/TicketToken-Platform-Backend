# api-gateway Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how api-gateway implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** JWT authentication with RBAC + Token blacklisting
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication and RBAC
- `src/utils/internal-auth.ts` - Internal auth signature verification (for receiving internal calls)
- `src/routes/authenticated-proxy.ts` - Header filtering for security

### JWT Authentication

**How it works:**
- Uses `@fastify/jwt` plugin with HS256 algorithm
- Validates token type (must be 'access')
- Validates tenant_id presence (required for multi-tenancy)
- Token blacklisting via Redis
- User details cached in Redis (5 minutes)
- RBAC with role-based permissions and venue scoping

**Supported Roles:**

| Role | Permissions | Venue Scoped |
|------|------------|--------------|
| admin | `*` (all) | No |
| venue-owner | `*` (all) | Yes |
| venue-manager | events:*, tickets:view/validate, reports:* | Yes |
| box-office | tickets:sell/view/validate, payments:process, reports:daily | Yes |
| door-staff | tickets:validate/view | Yes |
| customer | tickets:purchase/*-own, profile:update-own | No |

**Code Example:**
```typescript
// From auth.middleware.ts
export async function setupAuthMiddleware(server: FastifyInstance) {
  await server.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: {
      algorithm: 'HS256',
      expiresIn: config.jwt.accessTokenExpiry,
      issuer: config.jwt.issuer,
    },
    verify: {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
    },
  });

  server.decorate('authenticate', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await server.redis.get(`${REDIS_KEYS.SESSION}blacklist:${token}`);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify JWT
    const decoded = await request.jwtVerify() as JWTPayload;

    // Validate token type
    if (decoded.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    // Validate tenant_id is present
    if (!decoded.tenant_id) {
      throw new AuthenticationError('Invalid token - missing tenant context');
    }

    // Get user details from cache or auth-service
    const user = await getUserDetails(server, decoded.sub);

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role || decoded.role,
      tenant_id: decoded.tenant_id,  // Always from JWT, never from headers
      permissions: decoded.permissions || getUserPermissions(user.role),
      venueId: user.venueId,
    };
  });
}
```

### Internal Auth Verification (Receiving)

The api-gateway can also receive internal service calls and verify them:

```typescript
// From internal-auth.ts
export function verifyInternalSignature(
  serviceName: string,
  timestamp: string,
  signature: string,
  method: string,
  url: string,
  body?: any
): boolean {
  // Check timestamp is within 5 minutes
  const requestTime = parseInt(timestamp, 10);
  const timeDiff = Math.abs(Date.now() - requestTime);

  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    return false;
  }

  // Recreate and verify signature
  const payload = `${serviceName}:${timestamp}:${method}:${url}:${JSON.stringify(body || {})}`;
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** None - api-gateway is an entry point, not a provider of internal APIs
**Files Examined:**
- `src/routes/index.ts`
- All route files

**Findings:**
- api-gateway does **not expose** any `/internal/` routes
- It is the **consumer** of internal APIs from other services
- All routes are public-facing (under `/api/v1/*`)

**Public API Routes:**
- `/api/v1/auth/*` - Authentication
- `/api/v1/venues/*` - Venue management
- `/api/v1/events/*` - Event management
- `/api/v1/tickets/*` - Ticket operations
- `/api/v1/payments/*` - Payment processing
- `/api/v1/webhooks/*` - Webhook receivers
- `/api/v1/marketplace/*` - NFT marketplace
- `/api/v1/notifications/*` - Notifications
- `/api/v1/compliance/*` - Compliance
- `/api/v1/analytics/*` - Analytics
- `/api/v1/search/*` - Search
- `/health` - Health check

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Axios with HMAC authentication + Circuit breakers (Opossum)
**Files Examined:**
- `src/services/proxy.service.ts` - Generic proxy service
- `src/routes/authenticated-proxy.ts` - Authenticated proxy with header filtering
- `src/clients/AuthServiceClient.ts` - Auth service client
- `src/clients/VenueServiceClient.ts` - Venue service client
- `src/utils/internal-auth.ts` - HMAC signature generation
- `src/services/circuit-breaker.service.ts` - Circuit breaker management
- `src/config/services.ts` - Service URL configuration

### Service URL Configuration

```typescript
// From config/services.ts
export const serviceUrls = {
  auth:         getServiceUrl('AUTH_SERVICE_URL',         'auth-service',         3001),
  venue:        getServiceUrl('VENUE_SERVICE_URL',        'venue-service',        3002),
  event:        getServiceUrl('EVENT_SERVICE_URL',        'event-service',        3003),
  ticket:       getServiceUrl('TICKET_SERVICE_URL',       'ticket-service',       3004),
  payment:      getServiceUrl('PAYMENT_SERVICE_URL',      'payment-service',      3005),
  marketplace:  getServiceUrl('MARKETPLACE_SERVICE_URL',  'marketplace-service',  3006),
  analytics:    getServiceUrl('ANALYTICS_SERVICE_URL',    'analytics-service',    3007),
  notification: getServiceUrl('NOTIFICATION_SERVICE_URL', 'notification-service', 3008),
  integration:  getServiceUrl('INTEGRATION_SERVICE_URL',  'integration-service',  3009),
  compliance:   getServiceUrl('COMPLIANCE_SERVICE_URL',   'compliance-service',   3010),
  queue:        getServiceUrl('QUEUE_SERVICE_URL',        'queue-service',        3011),
  search:       getServiceUrl('SEARCH_SERVICE_URL',       'search-service',       3012),
  file:         getServiceUrl('FILE_SERVICE_URL',         'file-service',         3013),
  monitoring:   getServiceUrl('MONITORING_SERVICE_URL',   'monitoring-service',   3014),
  blockchain:   getServiceUrl('BLOCKCHAIN_SERVICE_URL',   'blockchain-service',   3015),
  order:        getServiceUrl('ORDER_SERVICE_URL',        'order-service',        3016),
  scanning:     getServiceUrl('SCANNING_SERVICE_URL',     'scanning-service',     3020),
  minting:      getServiceUrl('MINTING_SERVICE_URL',      'minting-service',      3018),
  transfer:     getServiceUrl('TRANSFER_SERVICE_URL',     'transfer-service',     3019),
};
```

### HMAC Signature Generation

```typescript
// From internal-auth.ts
export function generateInternalAuthHeaders(
  method: string,
  url: string,
  body?: any
): Record<string, string> {
  const timestamp = Date.now().toString();

  // Payload: serviceName:timestamp:method:url:body
  const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}:${JSON.stringify(body || {})}`;

  const signature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  return {
    'x-internal-service': SERVICE_NAME,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signature
  };
}
```

### Header Filtering (Security)

**Blocked Headers** (stripped from incoming requests):
- `x-gateway-internal`, `x-gateway-forwarded`
- `x-venue-id`, `x-tenant-id` (must come from JWT)
- `x-internal-service`, `x-internal-signature`, `x-internal-timestamp`
- `x-admin-token`, `x-privileged`
- `host`, `content-length`, `connection`, `keep-alive`, `transfer-encoding`

**Allowed Headers** (forwarded to downstream):
- `accept`, `accept-language`, `accept-encoding`
- `authorization`, `content-type`
- `user-agent`, `referer`, `origin`
- `x-request-id`, `x-correlation-id`
- `x-api-key`, `idempotency-key`
- Custom headers: `x-custom-*`

**Headers Added by Gateway:**
- `x-request-id`, `x-correlation-id` - Distributed tracing
- `x-gateway-forwarded: true` - Gateway marker
- `x-original-ip` - Client IP
- `x-tenant-id` (from JWT), `x-tenant-source: jwt`
- `x-user-id` (from JWT)
- HMAC auth headers (`x-internal-service`, `x-internal-signature`, `x-internal-timestamp`)

### Dedicated Service Clients

**AuthServiceClient:**
- Endpoints called: `/users/{userId}`, `/auth/validate`
- Uses circuit breaker
- Caches user details in Redis

**VenueServiceClient:**
- Endpoints called: `/internal/access-check`, `/internal/users/{userId}/venues`, `/api/v1/venues/{venueId}`
- Uses circuit breaker
- **Fail-secure**: Returns `false` on error for access checks

**Code Example:**
```typescript
// From VenueServiceClient.ts
async checkUserVenueAccess(userId: string, venueId: string, permission: string): Promise<boolean> {
  const circuitBreaker = getCircuitBreaker('venue-service');
  const path = '/internal/access-check';
  const body = { userId, venueId, permission };

  try {
    const makeRequest = async () => {
      const internalHeaders = generateInternalAuthHeaders('POST', path, body);
      const response = await this.httpClient.post<VenueAccessCheck>(path, body, {
        headers: internalHeaders
      });
      return response.data;
    };

    const result = circuitBreaker ? await circuitBreaker.fire(makeRequest) : await makeRequest();
    return result.hasAccess;
  } catch (error) {
    // CRITICAL: Fail secure - deny access when service unavailable
    logSecurityEvent('venue_access_check_failed', { userId, venueId, permission }, 'high');
    return false;
  }
}
```

### Circuit Breaker Configuration

```typescript
// From circuit-breaker.service.ts
const options = {
  timeout: config.circuitBreaker.timeout,
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
  resetTimeout: config.circuitBreaker.resetTimeout,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  volumeThreshold: config.circuitBreaker.volumeThreshold,
};
```

### Proxy Service Error Handling

```typescript
// From proxy.service.ts - Categorized error types
export class ServiceNotFoundError extends ProxyError { /* 500 SERVICE_NOT_FOUND */ }
export class ServiceUnavailableError extends ProxyError { /* 503 SERVICE_UNAVAILABLE */ }
export class ServiceTimeoutError extends ProxyError { /* 504 SERVICE_TIMEOUT */ }
export class BadGatewayError extends ProxyError { /* 502 BAD_GATEWAY */ }
```

---

## Category 4: Message Queues

**Implementation:** None
**Files Examined:**
- Searched for: amqplib, rabbitmq, Bull, bullmq, pg-boss

**Findings:**
- api-gateway does **not use any message queues**
- This is by design - the gateway is a synchronous request/response proxy
- All async operations are delegated to downstream services via HTTP

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT (HS256) + RBAC + Token blacklist | Tenant from JWT only, venue scoping |
| Internal Endpoints | **None** | Gateway is entry point, not provider |
| HTTP Client (Outgoing) | Axios + HMAC auth + Circuit breakers | 19 downstream services configured |
| Message Queues | **None** | Sync proxy by design |

**Key Characteristics:**
- api-gateway is the **single entry point** for all external API requests
- Authenticates users via JWT and enriches requests with tenant/user context
- **Never trusts** external headers like `x-tenant-id` or `x-venue-id` - always extracts from JWT
- Adds HMAC signatures to all downstream requests for service-to-service authentication
- Uses circuit breakers for resilience
- **Fail-secure** on authorization checks - denies access when downstream services are unavailable
- No message queue usage - purely synchronous request/response pattern
