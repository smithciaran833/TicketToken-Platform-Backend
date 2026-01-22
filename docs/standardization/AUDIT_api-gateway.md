# Audit Report: api-gateway Internal Endpoints

**Date:** January 21, 2026
**Service:** api-gateway
**Port:** 3000
**Purpose:** Determine if api-gateway needs `/internal/` endpoints

---

## Executive Summary

**RECOMMENDATION: api-gateway does NOT need internal endpoints**

The api-gateway is the platform's single entry point for external API requests. It routes traffic TO services, not the other way around. All service-to-service communication bypasses the gateway by design.

---

## 1. HTTP Calls TO api-gateway

### Search Methodology
Searched the entire codebase (21 services) for:
- `API_GATEWAY_URL` or `GATEWAY_URL` environment variables
- `http://api-gateway` URL patterns
- `gatewayClient` or gateway HTTP client references
- `localhost:3000` or `:3000` port references

### Findings

| Service | Reference Type | Purpose | Is This S2S? |
|---------|---------------|---------|--------------|
| **monitoring-service** | `API_GATEWAY_URL` | Health check monitoring | **NO** - Observability only |
| **auth-service** | `API_GATEWAY_URL` | Email verification/password reset URLs | **NO** - User-facing links |
| **Various services** | `allowedServices: ['api-gateway']` | Gateway can call them | **NO** - Inbound allowlist |

### Detailed Analysis

#### monitoring-service (Health Checks)
```typescript
// From: monitoring-service/src/collectors/application/http.collector.ts:11
{ name: 'api-gateway', url: config.services.apiGateway, port: 3000 }
```
- **Purpose:** Collects health metrics from all services including api-gateway
- **Calls:** `GET /health` endpoint only
- **Verdict:** This is appropriate monitoring behavior, not business S2S communication

#### auth-service (Email Links)
```typescript
// From: auth-service/src/services/email.service.ts:31
const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;
```
- **Purpose:** Generates user-facing URLs for email verification and password reset
- **Calls:** None - these URLs are sent to users, not called by auth-service
- **Note:** auth-service also defines an `apiGateway` HTTP client but **never uses it**

#### Service Allowlists
Multiple services include `api-gateway` in their allowed services list:
- ticket-service: `allowedServices: ['order-service', 'payment-service', 'api-gateway']`
- transfer-service: `ALLOWED_SERVICES.includes('api-gateway')`
- marketplace-service: `ALLOWED_SERVICES.includes('api-gateway')`
- analytics-service: `ALLOWED_INTERNAL_SERVICES.includes('api-gateway')`
- compliance-service: `ALLOWED_SERVICES.includes('api-gateway')`

**This is the CORRECT direction** - it means these services accept calls FROM api-gateway, not that they call TO api-gateway.

### Conclusion
**No service makes business logic HTTP calls to api-gateway. This is correct architecture.**

---

## 2. Queue Messages FROM api-gateway

### Search Methodology
Searched api-gateway source code for:
- `publish`, `emit`, `sendToQueue`, `channel.send`
- `amqp`, `rabbitmq`, `bull`, `redis.*queue`

### Findings

**api-gateway does NOT publish any queue messages.**

This is by design:
- Gateway is a synchronous request/response proxy
- All async operations are delegated to downstream services via HTTP
- Services publish events after completing their operations

### Conclusion
**api-gateway does not need to publish events. No queue-related internal endpoints needed.**

---

## 3. Current /internal/ Routes

### Search Methodology
- Searched for files matching `backend/services/api-gateway/src/routes/internal*.ts`
- Examined `backend/services/api-gateway/src/routes/index.ts`

### Findings

**api-gateway has NO internal routes.**

Current route structure:
```
/health                    - Health check (public)
/api/v1/auth/*            - Authentication (proxied to auth-service)
/api/v1/venues/*          - Venue management (proxied to venue-service)
/api/v1/events/*          - Event management (proxied to event-service)
/api/v1/tickets/*         - Ticket operations (proxied to ticket-service)
/api/v1/payments/*        - Payment processing (proxied to payment-service)
/api/v1/webhooks/*        - Webhook receivers (proxied to various services)
/api/v1/marketplace/*     - NFT marketplace (proxied to marketplace-service)
/api/v1/notifications/*   - Notifications (proxied to notification-service)
/api/v1/compliance/*      - Compliance (proxied to compliance-service)
/api/v1/analytics/*       - Analytics (proxied to analytics-service)
/api/v1/search/*          - Search (proxied to search-service)
/api/v1/queue/*           - Queue management (proxied to queue-service)
/api/v1/files/*           - File operations (proxied to file-service)
/api/v1/monitoring/*      - Monitoring (proxied to monitoring-service)
/api/v1/integrations/*    - Integrations (proxied to integration-service)
```

All routes are public-facing proxies to downstream services.

### Conclusion
**No internal routes exist. This is correct.**

---

## 4. Analysis: Are Internal Endpoints Needed?

### Architecture Review

```
┌─────────────────────────────────────────────────────────────┐
│                     EXTERNAL WORLD                          │
│  (Users, Mobile Apps, Web Browsers, External Webhooks)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                            │
│  - JWT Authentication                                       │
│  - Rate Limiting                                            │
│  - Request Routing                                          │
│  - Header Enrichment (tenant, user context)                 │
│  - HMAC Signing for downstream calls                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (HMAC-authenticated HTTP)
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND SERVICES                         │
│                                                             │
│  auth-service ←──────→ venue-service                        │
│       ↑                     ↑                               │
│       │                     │                               │
│       ▼                     ▼                               │
│  event-service ←───→ ticket-service ←───→ payment-service   │
│       │                     │                     │         │
│       └─────────────────────┴─────────────────────┘         │
│                    (Direct S2S calls)                       │
└─────────────────────────────────────────────────────────────┘
```

### Why api-gateway Should NOT Have Internal Endpoints

1. **Single Responsibility**: Gateway routes external requests, services handle business logic
2. **No Service-to-Service Role**: Gateway doesn't provide data or operations to other services
3. **Latency**: Adding gateway as middleman for S2S calls adds unnecessary latency
4. **Complexity**: Would create circular dependencies (gateway calls service, service calls gateway)
5. **Architecture Violation**: Breaks the unidirectional flow (External → Gateway → Services)

### What api-gateway DOES Provide (Correctly)

| Function | How It's Used |
|----------|--------------|
| User JWT validation | Validates tokens, extracts user/tenant context |
| Request enrichment | Adds `x-tenant-id`, `x-user-id` from JWT to downstream requests |
| HMAC signing | Signs requests to downstream services |
| Rate limiting | Protects services from external abuse |
| Circuit breakers | Prevents cascade failures |
| Health endpoint | `/health` for monitoring and load balancers |

### Potential Misuse Patterns (To Avoid)

**WRONG:** Service calling gateway to get user info
```typescript
// BAD - auth-service should be called directly
const user = await gatewayClient.get('/api/v1/users/123');
```

**RIGHT:** Service calling auth-service directly
```typescript
// GOOD - direct S2S call
const user = await authServiceClient.get('/internal/users/123');
```

---

## 5. Final Recommendation

### Decision: NO Internal Endpoints Needed

| Criterion | Assessment |
|-----------|------------|
| Services calling api-gateway | **None** (monitoring health checks don't count) |
| Queue messages from gateway | **None** |
| Current internal routes | **None** |
| Architectural need | **None** |

### Action Items

1. **No changes required** - api-gateway is correctly architected
2. **Remove unused code** - auth-service has an unused `apiGateway` HTTP client that should be removed
3. **Document pattern** - Ensure team understands that S2S calls bypass the gateway

### Code Cleanup (Optional)

Remove unused api-gateway client from auth-service:
```typescript
// File: auth-service/src/utils/http-client.ts
// Lines 183-188 - apiGateway client is defined but never used

// TO REMOVE:
apiGateway: createHttpClient({
  baseURL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
  timeout: 5000,
  retries: 2,
  retryDelay: 1000,
}),
```

---

## Appendix: Search Results Summary

### Files Examined
- All 21 services in `backend/services/`
- `backend/shared/` directory
- All `*Client.ts` files
- All `httpClient.ts` files
- All `.env.example` files

### Search Patterns Used
```bash
# Pattern 1: Environment variables
API_GATEWAY_URL|GATEWAY_URL|api-gateway|gatewayClient

# Pattern 2: HTTP methods
gateway\.get|gateway\.post|gateway\.put|gateway\.delete

# Pattern 3: Port references
localhost:3000|:3000

# Pattern 4: Queue publishing
publish|emit|sendToQueue|channel\.send

# Pattern 5: Queue libraries
amqp|rabbitmq|bull|redis\..*queue
```

### References Found
- monitoring-service: 6 references (all health monitoring)
- auth-service: 8 references (email URLs + unused client)
- Various services: ~40 references (allowlists for inbound calls)
- api-gateway itself: ~80 references (self-references)

---

## Conclusion

**api-gateway is correctly designed as an entry point, not a service provider.**

It should:
- Authenticate external requests
- Route to downstream services
- Sign outbound requests with HMAC

It should NOT:
- Expose internal endpoints
- Be called by other services
- Publish queue messages

**Status: CONFIRMED - No internal endpoints needed**
