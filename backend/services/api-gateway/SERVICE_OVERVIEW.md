# API Gateway Service - Architecture Overview

## Service Description
The API Gateway is the single entry point for all client requests to the TicketToken platform. It acts as a reverse proxy that routes requests to appropriate backend microservices, handles authentication, rate limiting, circuit breaking, load balancing, and provides cross-cutting concerns like logging, monitoring, and caching.

**Technology Stack:** Fastify, TypeScript, Redis, Axios, Opossum (Circuit Breaker)

---

## Directory Structure Analysis

### 📁 **routes/** - API Route Definitions

The gateway proxies requests to downstream services using an authenticated proxy pattern. All routes use the base prefix `/api/v1/`.

#### Core Routes

| Route File | Prefix | Target Service | Public Paths | Methods | Description |
|------------|--------|----------------|--------------|---------|-------------|
| `health.routes.ts` | `/` (root) | N/A | All | GET | Health checks, readiness, liveness |
| `auth.routes.ts` | `/auth` | auth-service:3001 | `/login`, `/register`, `/refresh`, `/forgot-password`, `/reset-password`, `/verify-email` | ALL | Authentication & user management |
| `venues.routes.ts` | `/venues` | venue-service:3002 | `/health`, `/metrics` | ALL | Venue management (multi-tenant) |
| `events.routes.ts` | `/events` | event-service:3003 | `/health`, `/metrics` | ALL | Event management |
| `tickets.routes.ts` | `/tickets` | ticket-service:3004 | `/health`, `/metrics` | ALL | Ticket operations |
| `payment.routes.ts` | `/payments` | payment-service:3005 | `/health`, `/metrics`, `/webhooks/*` | ALL | Payment processing |
| `webhook.routes.ts` | `/webhooks` | payment-service:3005 | All | POST | External webhooks (Stripe, etc.) |
| `marketplace.routes.ts` | `/marketplace` | marketplace-service:3006 | `/health`, `/metrics` | ALL | NFT marketplace operations |
| `analytics.routes.ts` | `/analytics` | analytics-service:3007 | `/health`, `/metrics` | ALL | Analytics & reporting |
| `notification.routes.ts` | `/notifications` | notification-service:3008 | `/health`, `/metrics` | ALL | Notification management |
| `compliance.routes.ts` | `/compliance` | compliance-service:3010 | `/health`, `/metrics` | ALL | Compliance & KYC |
| `queue.routes.ts` | `/queue` | queue-service:3011 | `/health`, `/metrics` | ALL | Queue management |
| `search.routes.ts` | `/search` | search-service:3012 | `/*` (all public) | ALL | Search functionality |
| `file.routes.ts` | `/files` | file-service:3013 | `/health`, `/metrics` | ALL | File uploads & management |
| `monitoring.routes.ts` | `/monitoring` | monitoring-service:3014 | `/health`, `/metrics` | ALL | System monitoring |
| `integration.routes.ts` | `/integrations` | integration-service:3009 | `/health`, `/metrics` | ALL | Third-party integrations |
| `event.routes.ts` | `/event` | event-service:3003 | `/health`, `/metrics` | ALL | Single event operations |
| `ticket.routes.ts` | `/ticket` | ticket-service:3004 | `/health`, `/metrics` | ALL | Single ticket operations |
| `venue.routes.ts` | `/venue` | venue-service:3002 | N/A | ALL | Venue proxy (uses @fastify/http-proxy) |

#### Health Check Routes (Root Level)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/health` | Basic health status | Service uptime, memory, circuit breaker states |
| GET | `/ready` | Readiness check with downstream service verification | Checks Redis, auth-service, venue-service |
| GET | `/live` | Liveness probe | Simple alive status |

#### Special Route Features

**Authenticated Proxy Pattern:**
- Most routes use `createAuthenticatedProxy()` which:
  - Filters and sanitizes request headers (blocks `x-internal-*`, `x-tenant-id` from clients)
  - Extracts `tenant_id` from verified JWT and adds as internal header
  - Supports public paths that bypass authentication
  - Forwards requests with proper headers to downstream services
  - Returns service responses with filtered headers

**Webhook Route Special Handling:**
- Preserves raw body for Stripe signature verification
- Special `POST /webhooks/stripe` endpoint with raw body support
- Forwards critical headers: `stripe-signature`, `stripe-webhook-id`

---

### 📁 **services/** - Business Logic Services

Core services that provide gateway functionality using dependency injection (Awilix).

| Service File | Class | Purpose | Key Methods |
|--------------|-------|---------|-------------|
| `proxy.service.ts` | `ProxyService` | HTTP request forwarding to backend services | `forward()`, `getServiceUrl()`, `setForwardedHeaders()` |
| `circuit-breaker.service.ts` | `CircuitBreakerService` | Protects against cascading failures with Opossum | `execute()`, `getState()`, `getStats()`, `getAllStats()` |
| `load-balancer.service.ts` | `LoadBalancerService` | Load balancing across service instances | `selectInstance()` (round-robin, least-connections, random, consistent-hash) |
| `service-discovery.service.ts` | `ServiceDiscoveryService` | Service registry & health checks | `discover()`, `register()`, `deregister()`, `getHealthyInstances()`, `performHealthCheck()` |
| `aggregator.service.ts` | `AggregatorService` | Combines data from multiple services | `aggregate()`, `getEventDetails()`, `getUserDashboard()` |
| `retry.service.ts` | `RetryService` | Exponential backoff retry logic | `executeWithRetry()`, `getServiceRetryConfig()` |
| `timeout.service.ts` | `TimeoutService` | Request timeout management | `executeWithTimeout()`, `calculateTimeout()`, `createTimeoutController()` |
| `index.ts` | N/A | Service initialization & DI container | `setupServices()` - Registers all services in Awilix container |

#### Service Details

**ProxyService:**
- Maintains service URL mapping for 20+ backend services
- Sets forwarded headers: `x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-host`, `x-forwarded-port`
- Configurable timeout (default 10s)

**CircuitBreakerService:**
- Per-service circuit breakers with configurable thresholds
- States: OPEN (failing), HALF_OPEN (testing), CLOSED (healthy)
- Event logging for: open, close, halfOpen, failure, timeout, reject, success
- Default config: 10s timeout, 50% error threshold, 30s reset timeout

**LoadBalancerService:**
- **Strategies:**
  - Round-robin: Distributes requests evenly
  - Least-connections: Routes to instance with fewest active connections
  - Random: Random selection
  - Consistent-hash: Session-based routing with key hashing
- Tracks connection counts per service instance
- Auto-filters unhealthy instances

**ServiceDiscoveryService:**
- Caches service instances (30s TTL)
- Periodic health checks (every 2 minutes)
- Redis-backed service registration (optional)
- Falls back to static configuration from environment

**AggregatorService:**
- Pre-defined patterns: `getEventDetails()`, `getUserDashboard()`
- Executes required data sources in parallel (fails if any fail)
- Executes optional data sources with timeouts (uses fallback on failure)
- Transforms and merges results with metadata

**RetryService:**
- Exponential backoff with configurable jitter
- Service-specific retry configs (NFT: 5 retries up to 10min, Payment: 3 retries up to 1min)
- Retries on: network errors, 5xx responses, timeouts
- Never retries on 4xx client errors

**TimeoutService:**
- Service-specific and endpoint-specific timeouts
- Example configs: NFT minting (120s), payment processing (45s), ticket purchase (30s)
- Cascade timeout control with `TimeoutController` for multi-step operations

---

### 📁 **middleware/** - Request Processing Pipeline

Middleware executes in the following order (defined in `index.ts`):

| Order | Middleware File | Purpose | Key Features |
|-------|----------------|---------|--------------|
| 1 | `error-handler.middleware.ts` | Process-level error recovery | Uncaught exception handling, graceful shutdown |
| 2 | `redis.middleware.ts` | Redis connection setup | Connects to Redis for caching, rate limiting, session storage |
| 3 | `metrics.middleware.ts` | Prometheus metrics collection | Request counts, response times, error rates per route |
| 4 | N/A (Helmet) | Security headers | CSP, XSS protection, HSTS |
| 5 | `cors.middleware.ts` | CORS policy enforcement | Configurable origins, credentials support |
| 6 | N/A (onRequest hook) | Request ID & start time | Adds `X-Request-ID` header, tracks request timing |
| 7 | `domain-routing.middleware.ts` | White-label domain routing | Routes requests based on hostname for multi-tenancy |
| 8 | `logging.middleware.ts` | Request/response logging | Structured logging with Pino |
| 9 | `rate-limit.middleware.ts` | Rate limiting | Per-IP, per-user, endpoint-specific limits with Redis backing |
| 10 | `circuit-breaker.middleware.ts` | Circuit breaker setup | Initializes per-service circuit breakers |
| 11 | `validation.middleware.ts` | Request validation | Schema validation for request bodies, query params |
| 12 | `auth.middleware.ts` | JWT authentication | Verifies JWT tokens, extracts user context |
| 13 | `venue-isolation.middleware.ts` | Multi-tenant data isolation | Enforces venue/tenant boundaries |
| 14 | `timeout.middleware.ts` | Request timeout handling | Per-endpoint timeout enforcement |
| 15 | `error-handler.middleware.ts` | Error response formatting | Catches and formats all errors as JSON |
| 16 | N/A (onSend hook) | Response time header | Adds `X-Response-Time` header |

#### Additional Middleware Files

| File | Purpose |
|------|---------|
| `response-cache.ts` | Redis-based response caching for GET requests |
| `auth-with-public-routes.ts` | Conditional authentication (allows public routes) |

#### Middleware Details

**Rate Limiting:**
- Global: 100 req/min per IP
- Ticket purchase: 5 req/min with 5min block on violation
- Dynamic rate limit adjustment based on system load
- Redis-backed distributed rate limiting

**Authentication:**
- Verifies JWT tokens (access & refresh)
- Extracts user context: `user_id`, `tenant_id`, `role`, `email`
- Public routes bypass authentication
- Supports both `JWT_SECRET` and separate `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`

**Circuit Breaker:**
- Automatic failure detection and recovery
- Prevents cascading failures to downstream services
- Tracks failure rates, timeouts, and request volumes

**Venue Isolation:**
- Extracts `tenant_id` from JWT
- Validates venue access permissions
- Prevents cross-tenant data access

---

### 📁 **config/** - Configuration Files

| File | Purpose | Key Configuration |
|------|---------|-------------------|
| `index.ts` | Main configuration | Server, Redis, JWT, rate limits, timeouts, circuit breaker settings |
| `services.ts` | Service URL mapping | Maps 19 backend services to Docker hostnames or env vars |
| `redis.ts` | Redis key patterns | Key prefixes for caching, sessions, rate limiting, service discovery |
| `secrets.ts` | Secret management | JWT secrets, API keys (likely) |
| `env-validation.ts` | Environment variable validation | Schema validation for required env vars |

#### Key Configuration Values

**Server:**
- Port: 3000 (default)
- Host: 0.0.0.0

**JWT:**
- Access token: 24h (default)
- Refresh token: 7d (default)
- Issuer: `tickettoken-api`

**Timeouts:**
- Default: 10s
- Payment: 30s
- NFT Minting: 120s

**Circuit Breaker:**
- Timeout: 10s
- Error threshold: 50%
- Reset timeout: 30s
- Volume threshold: 10 requests

**Rate Limiting:**
- Global: 100 req/60s
- Ticket purchase: 5 req/60s (block 5min on violation)

**Backend Services (19 total):**
- auth-service:3001
- venue-service:3002
- event-service:3003
- ticket-service:3004
- payment-service:3005
- marketplace-service:3006
- analytics-service:3007
- notification-service:3008
- integration-service:3009
- compliance-service:3010
- queue-service:3011
- search-service:3012
- file-service:3013
- monitoring-service:3014
- blockchain-service:3015
- order-service:3016
- minting-service:3018
- transfer-service:3019
- scanning-service:3020

---

### 📁 **clients/** - Service Client Libraries

HTTP client wrappers for communicating with downstream services.

| File | Class | Target Service | Methods |
|------|-------|----------------|---------|
| `AuthServiceClient.ts` | `AuthServiceClient` | auth-service:3001 | `getUserById()`, `validateToken()`, `healthCheck()` |
| `VenueServiceClient.ts` | `VenueServiceClient` | venue-service:3002 | (Similar pattern - venue operations) |

**Client Features:**
- Circuit breaker integration
- Automatic error handling and retries
- Health check capabilities
- Internal gateway authentication header (`x-gateway-internal: true`)
- Timeout: 5s (default)

---

### 📁 **plugins/** - Fastify Plugins

| File | Purpose |
|------|---------|
| `swagger.ts` | OpenAPI/Swagger documentation setup |

Likely provides API documentation at `/docs` or `/api-docs`.

---

### 📁 **types/** - TypeScript Type Definitions

| File | Purpose |
|------|---------|
| `index.ts` | Main type exports |
| `auth-service.types.ts` | Auth service request/response types |
| `venue-service.types.ts` | Venue service request/response types |

Common types include:
- `ServiceInstance`: Service discovery metadata
- `LoadBalancerStrategy`: 'round-robin' | 'least-connections' | 'random' | 'consistent-hash'
- `CircuitBreakerState`: 'OPEN' | 'HALF_OPEN' | 'CLOSED'
- `DataSource`: Aggregator data source configuration
- `RetryOptions`: Retry configuration
- `AuthServiceUser`: User object from auth service
- `AuthServiceErrorResponse`: Error responses from auth service

---

### 📁 **utils/** - Utility Functions

| File | Purpose |
|------|---------|
| `logger.ts` | Pino logger instance creation |
| `errors.ts` | Custom error classes (likely) |
| `helpers.ts` | General helper functions |
| `metrics.ts` | Prometheus metrics helpers |
| `security.ts` | Security utilities (header filtering, sanitization) |
| `tracing.ts` | Distributed tracing setup (OpenTelemetry likely) |
| `graceful-shutdown.ts` | Graceful shutdown handling |

---

### 📄 **controllers/** - ❌ Not Present
The API Gateway uses a proxy pattern rather than controllers. All request handling is done through route files that proxy to downstream services.

---

### 📄 **repositories/** - ❌ Not Present
The API Gateway does not own any database tables. It's a stateless proxy that relies on Redis for caching and session management only.

---

### 📄 **migrations/** - ❌ Not Present
No database migrations exist as the API Gateway doesn't own any persistent data stores.

---

### 📄 **validators/** - ❌ Not Present
Validation is handled inline in middleware (`validation.middleware.ts`) and route schemas. There's one schema file:
- `search.routes.schema.ts` - Search query validation schemas

---

## Key Architecture Patterns

### 1. **API Gateway Pattern**
- Single entry point for all client requests
- Reverse proxy to microservices
- Centralized cross-cutting concerns

### 2. **Circuit Breaker Pattern**
- Protects against cascading failures
- Per-service failure detection and recovery
- Automatic fallback and retry logic

### 3. **Multi-Tenancy (Venue Isolation)**
- Tenant ID extracted from JWT
- Enforced at gateway level
- Prevents cross-tenant data access

### 4. **Service Aggregation**
- Combines multiple service responses
- Required vs optional data sources
- Transform and merge results

### 5. **Load Balancing**
- Multiple strategies available
- Health-aware instance selection
- Connection tracking

### 6. **Rate Limiting**
- Distributed rate limiting with Redis
- Per-IP and per-user limits
- Endpoint-specific configurations
- Dynamic adjustment based on load

### 7. **Observability**
- Structured logging with Pino
- Prometheus metrics
- Distributed tracing
- Request ID propagation

### 8. **Security**
- JWT authentication
- Header sanitization (blocks `x-internal-*`, `x-tenant-id` from clients)
- CORS enforcement
- Security headers (Helmet)
- Tenant isolation

---

## Entry Points

- **Main Entry:** `index.ts` - Application bootstrap
- **Server Setup:** `server.ts` - Fastify server configuration, middleware, route registration
- **Port:** 3000 (default)

## Dependencies & External Services

### External Services Configured:
1. **Redis** - Caching, rate limiting, session storage
2. **19 Backend Microservices** - Auth, Venue, Event, Ticket, Payment, Marketplace, Analytics, Notification, Integration, Compliance, Queue, Search, File, Monitoring, Blockchain, Order, Minting, Transfer, Scanning

### Key NPM Packages:
- `fastify` - Web framework
- `axios` - HTTP client
- `opossum` - Circuit breaker
- `ioredis` - Redis client
- `@fastify/helmet` - Security headers
- `@fastify/cors` - CORS handling
- `@fastify/rate-limit` - Rate limiting
- `@fastify/http-proxy` - HTTP proxy
- `awilix` - Dependency injection
- `pino` - Logging

---

## Deployment & Scaling

**Container:**
- Docker service name: `api-gateway`
- Port: 3000
- Environment: Requires 19 backend service URLs + Redis connection

**Scaling Considerations:**
- Stateless design (all state in Redis)
- Horizontal scaling supported
- Load balancer placement recommended
- Redis clustering for high availability

**Health Checks:**
- Liveness: `GET /live`
- Readiness: `GET /ready` (checks Redis + critical services)
- Metrics: Service-specific `/metrics` endpoints

---

## Request Flow Example

1. **Client → Gateway:** `POST /api/v1/tickets/purchase`
2. **CORS Check:** Validates origin
3. **Rate Limit:** Checks 5 req/min limit
4. **Authentication:** Verifies JWT, extracts user
5. **Venue Isolation:** Validates tenant access
6. **Circuit Breaker:** Checks ticket-service health
7. **Timeout:** Sets 30s timeout
8. **Proxy:** Forwards to ticket-service:3004
9. **ticket-service:** Processes purchase
10. **Response:** Returns to client with timing header
11. **Metrics:** Records latency, status code

---

## Security Considerations

1. **Header Sanitization:** Blocks dangerous headers from clients (`x-internal-*`, `x-tenant-id`, `x-admin-token`)
2. **Tenant ID from JWT:** Never trust client-provided tenant IDs - always extract from verified JWT
3. **Rate Limiting:** Prevents abuse and DDoS attacks
4. **Circuit Breakers:** Prevents cascading failures
5. **Timeout Enforcement:** Prevents resource exhaustion
6. **Helmet Security Headers:** CSP, XSS protection, etc.

---

## Future Considerations

- **Service Mesh Integration:** Consider Istio/Linkerd for advanced traffic management
- **GraphQL Gateway:** Could add GraphQL layer on top
- **API Versioning:** Currently v1, plan for v2
- **WebSocket Support:** Real-time communication for live updates
- **gRPC Support:** For internal service-to-service communication
- **Advanced Caching:** More sophisticated cache invalidation strategies
- **API Key Management:** Support for API key-based authentication

---

**Last Updated:** 2025-12-21
**Service Version:** 1.0.0
**Maintainer:** TicketToken Platform Team
