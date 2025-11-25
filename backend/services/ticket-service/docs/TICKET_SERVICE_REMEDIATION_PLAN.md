# TICKET SERVICE - PRODUCTION REMEDIATION PLAN

**Service:** `tickettoken-ticket-service`  
**Current Status:** 5/10 Production Readiness  
**Target Status:** 10/10 Production Ready  
**Created:** 2025-11-13  
**Total Estimated Effort:** 103-143 hours (2.5-3.5 weeks)

---

## OVERVIEW

This document outlines a comprehensive remediation plan to address all critical blockers, warnings, and improvements identified in the Ticket Service Production Readiness Audit. The work is organized into 5 phases, each building on the previous one.

**Current Strengths to Preserve:**
- ✅ Exceptional database schema (integer cents, 45+ indexes, multi-tenancy)
- ✅ Comprehensive testing (100+ test files with real integration tests)
- ✅ Distributed locking with Redlock
- ✅ Excellent webhook security (HMAC, replay protection, nonces)
- ✅ SQL injection protection (parameterized queries)
- ✅ Clean codebase (zero TODO/FIXME comments)

**Critical Issues to Address:**
- 🔴 NFT minting is stub/placeholder only
- 🔴 No graceful shutdown handlers
- 🔴 Hardcoded default secrets in config
- 🔴 123 console.log statements logging sensitive data
- 🔴 Express + Fastify dependency conflict

---

## PHASE 1: CRITICAL BLOCKERS
**Priority:** IMMEDIATE - Must fix before any deployment  
**Estimated Effort:** 24 hours (3 days)  
**Goal:** Eliminate security vulnerabilities and deployment blockers

### 1.1 Remove Express Dependencies (2 hours)
**Problem:** Both Express and Fastify are installed, causing 30MB bloat and confusion

**Files to Modify:**
- `package.json` - Remove unused dependencies
  - Remove: `express`, `cors`, `morgan`, `helmet`
  - Remove corresponding `@types/*` packages
- `package-lock.json` - Will be auto-regenerated

**Actions:**
1. Remove Express and Express-specific middleware from dependencies
2. Verify no imports of removed packages exist in codebase
3. Run `npm install` to update lockfile
4. Run tests to ensure nothing broke
5. Rebuild Docker image and verify size reduction

**Success Criteria:**
- [ ] `express`, `cors`, `morgan`, `helmet` removed from package.json
- [ ] npm install completes without errors
- [ ] All tests pass
- [ ] Docker image size reduced by ~30MB
- [ ] Service starts successfully

**Estimated Effort:** 2 hours

---

### 1.2 Fix Hardcoded Default Secrets (2 hours)
**Problem:** JWT secret, QR encryption key, and webhook secret have fallback defaults in source code

**Files to Modify:**
- `src/config/index.ts` - Remove fallback values, add validation
- `src/routes/webhookRoutes.ts` - Remove default webhook secret
- `src/index.ts` - Add startup validation
- `.env.example` - Document required secrets

**Actions:**
1. Remove all fallback secret values from config
2. Add required environment variable validation on startup
3. Fail fast with clear error messages if secrets missing
4. Add comments explaining where to get/generate each secret
5. Update .env.example with generation instructions
6. Add secret rotation documentation

**Files with Hardcoded Secrets:**
- `src/config/index.ts:40` - JWT_SECRET fallback
- `src/config/index.ts:46` - QR_ENCRYPTION_KEY fallback
- `src/routes/webhookRoutes.ts:8` - INTERNAL_WEBHOOK_SECRET fallback
- `src/services/ticketService.ts:554` - QR encryption key usage

**Success Criteria:**
- [ ] No fallback secrets in any source files
- [ ] Service fails to start if critical env vars missing
- [ ] Clear error messages indicate which secrets are missing
- [ ] .env.example updated with all required secrets
- [ ] Documentation added for secret generation/rotation

**Estimated Effort:** 2 hours

---

### 1.3 Add Graceful Shutdown (4 hours)
**Problem:** No SIGTERM/SIGINT handlers - pod termination causes data loss

**Files to Modify:**
- `src/index.ts` - Add signal handlers
- `src/services/databaseService.ts` - Add close() method
- `src/services/redisService.ts` - Add close() method
- `src/services/queueService.ts` - Add close() method
- `src/workers/reservation-cleanup.worker.ts` - Add stop() method

**Actions:**
1. Implement graceful shutdown handler for SIGTERM/SIGINT
2. Add connection draining logic (30-second timeout)
3. Close Fastify server (stop accepting new requests)
4. Wait for in-flight requests to complete
5. Close database pool
6. Close Redis connections
7. Close RabbitMQ channels
8. Stop background workers
9. Exit with status 0

**New Code Structure:**
```typescript
// src/index.ts - Pseudo-code structure
let isShuttingDown = false;
const shutdownTimeout = 30000; // 30 seconds

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info('Graceful shutdown initiated', { signal });
  
  // 1. Stop accepting new requests
  await app.close();
  
  // 2. Wait for in-flight requests (with timeout)
  await Promise.race([
    waitForInFlightRequests(),
    sleep(shutdownTimeout)
  ]);
  
  // 3. Stop workers
  await reservationCleanupWorker.stop();
  
  // 4. Close connections
  await DatabaseService.close();
  await RedisService.close();
  await QueueService.close();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Success Criteria:**
- [ ] SIGTERM/SIGINT handlers implemented
- [ ] Fastify server closes gracefully
- [ ] Database connections closed properly
- [ ] Redis connections closed properly
- [ ] RabbitMQ connections closed properly
- [ ] Background workers stopped
- [ ] In-flight requests complete before shutdown
- [ ] Clean exit with status 0
- [ ] Test in Docker/Kubernetes environment

**Estimated Effort:** 4 hours

---

### 1.4 Replace console.log with Winston Logger (16 hours)
**Problem:** 123 console.log/error/warn statements logging sensitive data to stdout

**Files to Modify (15+ files):**
- `src/index.ts` - 5 instances
- `src/clients/OrderServiceClient.ts` - 5 instances
- `src/routes/webhookRoutes.ts` - 6 instances (including DEBUG code!)
- `src/sagas/PurchaseSaga.ts` - 15 instances
- `src/controllers/purchaseController.ts` - 4 instances
- `src/controllers/orders.controller.ts` - 3 instances
- `src/middleware/auth.ts` - 3 instances
- `src/middleware/errorHandler.ts` - 1 instance
- `src/middleware/tenant-simple.ts` - 2 instances
- `src/bootstrap/container.ts` - 1 instance
- `src/workers/reservation-expiry.worker.ts` - 5 instances
- `src/services/databaseService.ts` - 2 instances
- `src/utils/async-handler.ts` - 4 instances
- `src/migrations/001_baseline_ticket.ts` - 50+ instances (acceptable - migration output)

**Actions:**
1. Search all .ts files for console.log/error/warn/info/debug
2. Replace with appropriate logger.* calls
3. Remove DEBUG code in webhookRoutes.ts (lines 117-121)
4. Add structured logging metadata where appropriate
5. Set up log levels per environment (debug/info/warn/error)
6. Add PII sanitization to logger configuration
7. Configure log rotation and retention
8. Test log output in different environments

**Logging Standards:**
```typescript
// Bad
console.log('User purchased tickets', userId, ticketIds);

// Good
logger.info('User purchased tickets', {
  userId: sanitize(userId),
  ticketCount: tickets.length,
  eventId: eventId
});
```

**Critical Removals:**
- `src/routes/webhookRoutes.ts:117-121` - DEBUG code logging signatures and payloads

**Success Criteria:**
- [ ] Zero console.log/error/warn in production code (migrations excluded)
- [ ] All logging uses winston logger with structured format
- [ ] DEBUG webhook code removed
- [ ] PII sanitization configured
- [ ] Log levels configurable via environment
- [ ] Sensitive data (tokens, secrets, signatures) never logged
- [ ] Search confirms 0 instances of console.* in src/ (excluding migrations)

**Estimated Effort:** 16 hours

---

## PHASE 2: ENVIRONMENT & CONFIGURATION
**Priority:** HIGH - Required for reliable deployment  
**Estimated Effort:** 11 hours (1.5 days)  
**Goal:** Robust configuration, validation, and environment setup

### 2.1 Environment Variable Validation (3 hours)
**Problem:** Missing validation for required environment variables

**Files to Create:**
- `src/config/env-validation.ts` - Centralized env validation using Zod

**Files to Modify:**
- `src/config/index.ts` - Use validated config
- `src/index.ts` - Validate env on startup
- `.env.example` - Complete documentation

**Actions:**
1. Create Zod schema for all environment variables
2. Categorize vars: required, optional, with defaults
3. Add type safety to config object
4. Validate on startup before any service initialization
5. Provide clear error messages for missing/invalid vars
6. Add env var documentation with examples
7. Document secret generation/rotation procedures

**Config Categories:**
```typescript
// Required (no defaults)
- JWT_SECRET
- QR_ENCRYPTION_KEY
- INTERNAL_WEBHOOK_SECRET
- DATABASE_URL or (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)

// Optional with safe defaults
- PORT (default: 3004)
- NODE_ENV (default: development)
- LOG_LEVEL (default: info)

// Service URLs (required in production)
- EVENT_SERVICE_URL
- PAYMENT_SERVICE_URL
- ORDER_SERVICE_URL
- etc.
```

**Success Criteria:**
- [ ] Zod schema validates all environment variables
- [ ] Clear error messages for missing required vars
- [ ] Type-safe config object throughout codebase
- [ ] .env.example is complete and well-documented
- [ ] Service fails fast on startup if config invalid
- [ ] Documentation for secret generation added

**Estimated Effort:** 3 hours

---

### 2.2 Add Missing Environment Variables to .env.example (1 hour)
**Problem:** QR_ENCRYPTION_KEY and CLEANUP_INTERVAL_MS used but not documented

**Files to Modify:**
- `.env.example` - Add missing variables with documentation

**Missing Variables:**
- `QR_ENCRYPTION_KEY` - Used in config and services but not in .env.example
- `INTERNAL_WEBHOOK_SECRET` - Used in webhooks but not documented
- `CLEANUP_INTERVAL_MS` - Used in index.ts but not documented
- `SOLANA_WALLET_PRIVATE_KEY` - Mentioned in code but not documented

**Actions:**
1. Audit all process.env.* usage in codebase
2. Cross-reference with .env.example
3. Add missing variables with clear descriptions
4. Add generation/setup instructions
5. Group related variables together
6. Add security warnings where appropriate

**Success Criteria:**
- [ ] All environment variables used in code are documented
- [ ] Clear descriptions and examples provided
- [ ] Security warnings added for sensitive vars
- [ ] Generation instructions included
- [ ] Variables grouped logically

**Estimated Effort:** 1 hour

---

### 2.3 Protect Admin Health Endpoints (1 hour)
**Problem:** Circuit breaker reset endpoint has no authentication

**Files to Modify:**
- `src/routes/health.routes.ts` - Add auth to admin endpoints
- `src/middleware/auth.ts` - Ensure requireRole works correctly

**Actions:**
1. Add authMiddleware to `/health/circuit-breakers` endpoint
2. Add authMiddleware + requireRole(['admin']) to `/health/circuit-breakers/reset`
3. Add authMiddleware to `/health/detailed` endpoint
4. Add rate limiting to admin endpoints
5. Document admin authentication requirements
6. Add integration tests for protected endpoints

**Protected Endpoints:**
```typescript
// GET /health/circuit-breakers - view state (auth required)
fastify.get('/health/circuit-breakers', {
  preHandler: [authMiddleware, requireRole(['admin', 'ops'])]
});

// POST /health/circuit-breakers/reset - reset (admin only)
fastify.post('/health/circuit-breakers/reset', {
  preHandler: [authMiddleware, requireRole(['admin'])]
});

// GET /health/detailed - detailed stats (auth required)
fastify.get('/health/detailed', {
  preHandler: [authMiddleware]
});
```

**Success Criteria:**
- [ ] All admin endpoints require authentication
- [ ] Circuit breaker endpoints require admin role
- [ ] Unauthorized requests return 401
- [ ] Tests verify endpoint protection
- [ ] Documentation updated

**Estimated Effort:** 1 hour

---

### 2.4 Add Missing Route Authentication (4 hours)
**Problem:** Several sensitive endpoints lack authentication

**Files to Modify:**
- `src/routes/ticketRoutes.ts` - Add auth to public endpoints
- `src/routes/orderRoutes.ts` - Add auth if missing
- `src/routes/qrRoutes.ts` - Add auth to sensitive operations
- `src/routes/validationRoutes.ts` - Review auth requirements

**Unprotected Endpoints to Fix:**
- GET `/api/v1/tickets/users/:userId` - Users can view other users' tickets!
- GET `/api/v1/tickets/events/:eventId/types` - Should be public (OK)
- GET `/api/v1/orders/:orderId` - No auth check in route definition
- POST `/api/v1/tickets/validate-qr` - Consider auth requirement

**Actions:**
1. Audit all route definitions for auth middleware
2. Add authMiddleware where missing
3. Add tenantMiddleware for multi-tenant endpoints
4. Implement user ownership checks (users can only see their own data)
5. Add role checks where appropriate
6. Write integration tests for auth enforcement
7. Document authentication requirements per endpoint

**Example Fix:**
```typescript
// Before
fastify.get('/users/:userId', async (request, reply) => {
  // Anyone can view any user's tickets!
});

// After
fastify.get('/users/:userId', {
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  // Verify requesting user owns the tickets or is admin
  if (request.params.userId !== request.userId && !request.user.isAdmin) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
  // ... rest of handler
});
```

**Success Criteria:**
- [ ] All sensitive endpoints protected by authMiddleware
- [ ] User ownership validation implemented
- [ ] Tenant isolation enforced
- [ ] Authorization matrix documented
- [ ] Integration tests verify auth enforcement
- [ ] No endpoints allow viewing other users' data

**Estimated Effort:** 4 hours

---

### 2.5 Implement Endpoint-Specific Rate Limiting (2 hours)
**Problem:** Only global rate limit (100/min) - no per-endpoint limits

**Files to Modify:**
- `src/app.ts` - Configure tiered rate limiting
- `src/routes/ticketRoutes.ts` - Add stricter limits to write operations
- `src/routes/purchaseRoutes.ts` - Strict limits on purchases
- `src/routes/transferRoutes.ts` - Limit transfer operations
- `src/routes/webhookRoutes.ts` - Separate webhook rate limits

**Actions:**
1. Keep global rate limit (100/min) as default
2. Add stricter limits for write operations (10/min)
3. Add stricter limits for expensive operations (5/min)
4. Configure rate limits per endpoint
5. Add rate limit headers to responses
6. Configure Redis-backed rate limiting
7. Add monitoring for rate limit hits
8. Document rate limits in API documentation

**Rate Limit Tiers:**
```typescript
- Global: 100 requests/min (all endpoints)
- Read operations: 100 requests/min (GET)
- Write operations: 10 requests/min (POST/PUT/DELETE)
- Purchase operations: 5 requests/min (ticket purchases)
- Transfer operations: 5 requests/min (ticket transfers)
- Admin operations: 20 requests/min (admin endpoints)
- Webhook: 100 requests/min per tenant
```

**Success Criteria:**
- [ ] Endpoint-specific rate limits configured
- [ ] Redis-backed rate limiting for distributed deployment
- [ ] Rate limit headers in responses
- [ ] Monitoring alerts for rate limit abuse
- [ ] Documentation updated with limits
- [ ] Load tests verify rate limiting works

**Estimated Effort:** 2 hours

---

## PHASE 3: TEST COVERAGE & STABILITY
**Priority:** MEDIUM-HIGH - Required for confidence in deployment  
**Estimated Effort:** 16 hours (2 days)  
**Goal:** Achieve 85%+ test coverage with focus on critical paths

### 3.1 Run Test Coverage Report (1 hour)
**Problem:** No current test coverage metrics available

**Files to Work With:**
- `jest.config.js` - Configure coverage thresholds
- `package.json` - Verify test:coverage script

**Actions:**
1. Run `npm run test:coverage` to generate baseline
2. Analyze coverage report by category (controllers, services, middleware, utils)
3. Identify untested critical paths
4. Set coverage thresholds in jest.config.js
5. Document coverage gaps
6. Prioritize missing coverage

**Coverage Thresholds to Set:**
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 85,
    lines: 85,
    statements: 85
  },
  './src/services/': {
    branches: 85,
    functions: 90,
    lines: 90,
    statements: 90
  }
}
```

**Success Criteria:**
- [ ] Coverage report generated
- [ ] Baseline coverage metrics documented
- [ ] Coverage thresholds configured
- [ ] Critical gaps identified
- [ ] Prioritized list of tests to add

**Estimated Effort:** 1 hour

---

### 3.2 Add Tests for Graceful Shutdown (3 hours)
**Problem:** New graceful shutdown functionality needs testing

**Files to Create:**
- `tests/unit/graceful-shutdown.test.ts` - Unit tests for shutdown logic

**Actions:**
1. Test SIGTERM handler triggers shutdown sequence
2. Test SIGINT handler triggers shutdown sequence
3. Test in-flight requests complete before shutdown
4. Test 30-second timeout enforced
5. Test all services close properly
6. Test workers stop correctly
7. Mock all external connections
8. Verify exit code is 0 on clean shutdown
9. Test shutdown idempotency (multiple signal handling)

**Test Scenarios:**
- Shutdown with no in-flight requests
- Shutdown with in-flight requests (complete within timeout)
- Shutdown with slow requests (timeout enforced)
- Shutdown called twice (idempotent)
- Database close failure (handled gracefully)
- Redis close failure (handled gracefully)

**Success Criteria:**
- [ ] All shutdown paths covered
- [ ] Signal handlers tested
- [ ] Timeout enforcement tested
- [ ] Service close failures handled
- [ ] Integration with actual services tested
- [ ] 95%+ coverage on shutdown code

**Estimated Effort:** 3 hours

---

### 3.3 Add Tests for Environment Validation (2 hours)
**Problem:** New environment validation needs testing

**Files to Create:**
- `tests/unit/env-validation.test.ts` - Test env validation logic

**Actions:**
1. Test successful validation with all required vars
2. Test failure with missing required vars
3. Test failure with invalid var formats
4. Test default values applied correctly
5. Test error messages are clear
6. Test type conversion (string to number, etc.)
7. Test validation runs before service initialization
8. Mock process.env for testing

**Test Scenarios:**
- All required vars present and valid
- Missing JWT_SECRET
- Missing QR_ENCRYPTION_KEY
- Invalid PORT (non-numeric)
- Invalid DATABASE_URL format
- Missing service URL in production
- Default values applied in development

**Success Criteria:**
- [ ] All validation paths tested
- [ ] Error messages verified
- [ ] Type conversions tested
- [ ] Default application tested
- [ ] 95%+ coverage on validation code

**Estimated Effort:** 2 hours

---

### 3.4 Add Tests for Protected Endpoints (4 hours)
**Problem:** New authentication on endpoints needs testing

**Files to Create:**
- `tests/integration/endpoint-auth.test.ts` - Test endpoint protection
- `tests/integration/admin-endpoints.test.ts` - Test admin-only endpoints

**Actions:**
1. Test all endpoints with no auth token (401)
2. Test all endpoints with invalid token (401)
3. Test all endpoints with expired token (401)
4. Test endpoints with valid token but insufficient permissions (403)
5. Test admin endpoints require admin role
6. Test user can only access own resources
7. Test tenant isolation enforced
8. Generate valid JWT tokens for testing
9. Test rate limiting on protected endpoints

**Test Scenarios:**
```typescript
// GET /api/v1/tickets/users/:userId
- No token -> 401
- Valid token, own userId -> 200
- Valid token, other userId -> 403
- Admin token, any userId -> 200

// POST /health/circuit-breakers/reset
- No token -> 401
- User token -> 403
- Admin token -> 200

// GET /api/v1/orders/:orderId
- No token -> 401
- Valid token, own order -> 200
- Valid token, other tenant's order -> 403
```

**Success Criteria:**
- [ ] All protected endpoints tested
- [ ] Authentication requirement verified
- [ ] Authorization (role/ownership) verified
- [ ] Tenant isolation verified
- [ ] Clear test coverage report

**Estimated Effort:** 4 hours

---

### 3.5 Add Tests for Rate Limiting (2 hours)
**Problem:** New rate limiting needs verification

**Files to Create:**
- `tests/integration/rate-limiting.test.ts` - Test rate limits

**Actions:**
1. Test global rate limit (100/min)
2. Test write operation limits (10/min)
3. Test purchase operation limits (5/min)
4. Test rate limit headers in responses
5. Test rate limit reset after window
6. Test rate limiting per IP/user
7. Test distributed rate limiting with Redis
8. Verify 429 status on rate limit exceeded

**Test Scenarios:**
- Make 100 requests in 1 minute -> success
- Make 101 requests in 1 minute -> 429 on last request
- Make 10 POST requests in 1 minute -> success
- Make 11 POST requests in 1 minute -> 429
- Check X-RateLimit-* headers present

**Success Criteria:**
- [ ] Rate limits enforced correctly
- [ ] Appropriate status codes returned
- [ ] Rate limit headers present
- [ ] Redis-backed limiting works
- [ ] Different limits per endpoint verified

**Estimated Effort:** 2 hours

---

### 3.6 Add Edge Case Tests (4 hours)
**Problem:** Need more edge case coverage for robustness

**Files to Create:**
- `tests/unit/edge-cases.test.ts` - Edge case scenarios
- `tests/integration/concurrency.test.ts` - Concurrent operations

**Actions:**
1. Test concurrent reservations for same tickets
2. Test order creation with insufficient inventory
3. Test ticket transfer to blacklisted user
4. Test QR code expiration edge cases
5. Test idempotency key collision handling
6. Test webhook replay attack prevention
7. Test database connection failure scenarios
8. Test Redis connection failure scenarios
9. Test large batch operations
10. Test boundary values (max tickets per purchase, etc.)

**Edge Cases to Cover:**
- Exactly 10 tickets purchased (limit)
- 11 tickets purchased (over limit)
- Reservation expires during purchase
- Order created but payment fails
- NFT mint request queued but service down
- User transfers ticket to themselves
- Transfer with expired transfer deadline
- QR code scanned multiple times
- Webhook received out of order
- Database deadlock during concurrent updates

**Success Criteria:**
- [ ] Critical edge cases identified and tested
- [ ] Concurrent operation handling verified
- [ ] Error scenarios properly handled
- [ ] Boundary conditions tested
- [ ] Race conditions addressed

**Estimated Effort:** 4 hours

---

## PHASE 4: PERFORMANCE & MONITORING
**Priority:** MEDIUM - Required for production observability  
**Estimated Effort:** 18 hours (2-3 days)  
**Goal:** Comprehensive monitoring, alerting, and performance optimization

### 4.1 Add Foreign Key Constraints (8 hours)
**Problem:** No FK constraints - orphaned records possible

**Files to Create:**
- `src/migrations/002_add_foreign_keys.ts` - Add FK constraints

**Actions:**
1. Analyze all table relationships
2. Add FK constraints with appropriate ON DELETE actions
3. Add indexes for FK columns (if missing)
4. Test data integrity enforcement
5. Test cascading deletes work correctly
6. Handle constraint violations gracefully
7. Document FK relationships
8. Run migration on test database first

**Foreign Keys to Add:**
```sql
-- ticket_types
ALTER TABLE ticket_types 
  ADD CONSTRAINT fk_ticket_types_event 
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- tickets
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_ticket_type
  FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tickets_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tickets_order
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- orders
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- order_items
ALTER TABLE order_items
  ADD CONSTRAINT fk_order_items_order
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_order_items_ticket_type
  FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT;

-- reservations
ALTER TABLE reservations
  ADD CONSTRAINT fk_reservations_ticket_type
  FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_reservations_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- And more for remaining tables...
```

**Success Criteria:**
- [ ] All FK constraints identified and added
- [ ] Appropriate ON DELETE actions chosen
- [ ] Indexes exist for all FK columns
- [ ] Migration tested on development database
- [ ] Data integrity enforced
- [ ] Application handles constraint violations
- [ ] Documentation updated with FK diagram

**Estimated Effort:** 8 hours

---

### 4.2 Add Database Performance Indexes (4 hours)
**Problem:** Additional indexes needed for common query patterns

**Files to Create:**
- `src/migrations/003_add_performance_indexes.ts` - Performance indexes

**Actions:**
1. Analyze slow query logs (if available)
2. Review common query patterns in code
3. Add composite indexes for frequent WHERE clauses
4. Add indexes for ORDER BY columns
5. Add partial indexes where appropriate
6. Test index effectiveness with EXPLAIN
7. Monitor index size and maintenance overhead
8. Document index purpose

**Indexes to Consider:**
```sql
-- Composite indexes for common queries
CREATE INDEX idx_tickets_user_status 
  ON tickets(user_id, status) 
  WHERE status IN ('AVAILABLE', 'SOLD', 'USED');

CREATE INDEX idx_tickets_event_type_status
  ON tickets(event_id, ticket_type_id, status);

CREATE INDEX idx_orders_user_status_created
  ON orders(user_id, status, created_at DESC);

CREATE INDEX idx_reservations_user_active
  ON reservations(user_id, status)
  WHERE status = 'ACTIVE';

-- Covering indexes for hot queries
CREATE INDEX idx_tickets_lookup_covering
  ON tickets(id, user_id, event_id, status, nft_token_id)
  INCLUDE (ticket_type_id, purchase_price_cents);
```

**Success Criteria:**
- [ ] Query patterns analyzed
- [ ] Indexes added for slow queries
- [ ] EXPLAIN plans show index usage
- [ ] Query performance improved (measure before/after)
- [ ] Index maintenance overhead acceptable
- [ ] Documentation includes index rationale

**Estimated Effort:** 4 hours

---

### 4.3 Create Grafana Dashboard (3 hours)
**Problem:** No monitoring dashboard for metrics

**Files to Create:**
- `infrastructure/monitoring/grafana/dashboards/ticket-service-dashboard.json` - Grafana dashboard

**Actions:**
1. Create dashboard with key metrics panels
2. Add request rate and latency graphs
3. Add database connection pool metrics
4. Add Redis cache hit/miss rates
5. Add reservation cleanup metrics
6. Add error rate and status code distribution
7. Add NFT minting queue depth
8. Add business metrics (tickets sold, revenue)
9. Configure alerts for critical thresholds
10. Test dashboard with live data

**Dashboard Panels:**
```yaml
Row 1: Service Health
  - Request Rate (requests/sec)
  - Response Time (p50, p95, p99)
  - Error Rate (%)
  - Active Connections

Row 2: Database
  - Connection Pool Usage
  - Query Duration (p95)
  - Transactions/sec
  - Deadlocks

Row 3: Redis
  - Cache Hit Rate (%)
  - Cache Size
  - Connection Count
  - Operation Latency

Row 4: Business Metrics
  - Tickets Sold (24h)
  - Revenue (24h)
  - Active Reservations
  - Expired Reservations

Row 5: Background Jobs
  - Cleanup Worker Status
  - NFT Mint Queue Depth
  - Webhook Delivery Success Rate
```

**Success Criteria:**
- [ ] Dashboard created with all key metrics
- [ ] Metrics updating in real-time
- [ ] Time range selectors working
- [ ] Drill-down links functional
- [ ] Dashboard exported to JSON
- [ ] Documentation added for dashboard usage

**Estimated Effort:** 3 hours

---

### 4.4 Create Prometheus Alerts (3 hours)
**Problem:** No automated alerting for service issues

**Files to Create:**
- `infrastructure/monitoring/prometheus/alerts/ticket-service-alerts.yml` - Alert rules

**Actions:**
1. Define critical alert rules
2. Define warning alert rules
3. Set appropriate thresholds
4. Configure alert routing
5. Add alert descriptions and runbooks
6. Test alerts trigger correctly
7. Configure notification channels
8. Document alert response procedures

**Alert Rules:**
```yaml
Critical Alerts:
  - Service Down (no metrics for 1 minute)
  - Error Rate > 5% (for 5 minutes)
  - Database Connection Pool Exhausted
  - Redis Down
  - Response Time p99 > 5 seconds
  - NFT Mint Queue Depth > 1000
  - Reservation Cleanup Worker Failed

Warning Alerts:
  - Error Rate > 1% (for 10 minutes)
  - Response Time p95 > 2 seconds
  - Database Connection Pool > 80% utilized
  - Redis Memory > 80% used
  - NFT Mint Queue Depth > 500
  - Webhook Delivery Failure Rate > 5%
  - Reservation Expiry Rate > 20%
```

**Success Criteria:**
- [ ] Critical alert rules defined and tested
- [ ] Warning alert rules defined and tested
- [ ] Alert routing configured
- [ ] Notification channels tested
- [ ] Runbook links added to alerts
- [ ] Alert descriptions are clear
- [ ] False positive rate < 1%

**Estimated Effort:** 3 hours

---

## PHASE 5: PRODUCTION HARDENING & NFT INTEGRATION
**Priority:** HIGH - Required for full production deployment  
**Estimated Effort:** 34-74 hours (4-9 days)  
**Goal:** Implement NFT minting, load testing, and production deployment readiness

### 5.1 Implement Real NFT Minting - Option A: Internal Implementation (40-80 hours)
**Problem:** NFT minting is stub only - core product functionality missing

**IMPORTANT NOTE:** This is the most significant work item. There are two options:

**Option A: Implement NFT minting internally in ticket-service**
- More control over the minting process
- Tighter integration with ticket lifecycle
- Requires significant Solana/Metaplex expertise
- Estimated: 40-80 hours

**Option B: Delegate to existing minting-service**
- The platform already has a minting-service with Metaplex integration
- Ticket-service would call minting-service via internal API
- Less code, faster implementation
- Estimated: 8-16 hours

**Recommendation: Choose Option B (delegate to minting-service)**

This section describes Option A if needed. See Section 5.2 for Option B.

**Files to Modify (Option A):**
- `src/services/solanaService.ts` - Replace stub with real implementation
- `src/config/index.ts` - Add Metaplex configuration
- `src/workers/nft-mint.worker.ts` - Create background mint worker

**Files to Create (Option A):**
- `src/services/MetaplexService.ts` - Metaplex integration
- `src/services/NFTMetadataService.ts` - Metadata preparation
- `scripts/setup-nft-collection.ts` - Collection setup script

**Actions (Option A):**
1. Study Metaplex Bubblegum (Compressed NFTs) documentation
2. Set up Solana wallet management
3. Create/configure Merkle tree for compressed NFTs
4. Implement NFT metadata preparation
5. Implement actual minting with Metaplex
6. Add retry logic for failed mints
7. Implement NFT transfer functionality
8. Add NFT burn functionality (for cancellations)
9. Store NFT token IDs and transaction hashes
10. Update ticket status after successful mint
11. Handle mint failures gracefully
12. Add comprehensive error handling
13. Test on Solana devnet extensively
14. Document NFT minting process

**Key Implementation Details:**
```typescript
// Metaplex Compressed NFT minting
- Create collection
- Set up Merkle tree
- Prepare metadata (name, symbol, URI)
- Upload metadata to IPFS/Arweave
- Mint compressed NFT
- Store leaf index and tree address
- Update ticket with NFT info
```

**Success Criteria:**
- [ ] Real NFT minting implemented
- [ ] Minting tested on devnet
- [ ] NFT transfer working
- [ ] Error handling comprehensive
- [ ] Retry logic implemented
- [ ] Transaction confirmations verified
- [ ] Metadata properly formatted
- [ ] Integration tests passing

**Estimated Effort (Option A):** 40-80 hours

---

### 5.2 Implement NFT Minting - Option B: Delegate to Minting-Service (8-16 hours) ⭐ RECOMMENDED
**Problem:** NFT minting is stub only - core product functionality missing

**RECOMMENDED APPROACH:** Use existing minting-service

The platform already has a production-ready minting-service that:
- ✅ Handles Solana/Metaplex integration
- ✅ Manages wallet security
- ✅ Implements retry logic and error handling
- ✅ Provides batch minting capabilities
- ✅ Has comprehensive tests and monitoring

**Files to Modify:**
- `src/services/solanaService.ts` - Replace stub with minting-service client
- `src/clients/MintingServiceClient.ts` - Create client (similar to OrderServiceClient)
- `src/sagas/PurchaseSaga.ts` - Add NFT minting step
- `src/config/index.ts` - Add minting-service URL

**Files to Create:**
- `src/clients/MintingServiceClient.ts` - HTTP client for minting-service
- `src/types/nft.types.ts` - NFT-related types

**Actions:**
1. Create MintingServiceClient with circuit breaker
2. Add minting-service URL to configuration
3. Implement mint request payload preparation
4. Call minting-service `/mint` endpoint after order completion
5. Store NFT token ID and transaction hash from response
6. Update ticket status to AWAITING_MINT → MINTED
7. Handle minting failures (leave in AWAITING_MINT for retry)
8. Add minting retry worker (check AWAITING_MINT tickets)
9. Add NFT transfer via minting-service
10. Test integration with minting-service on devnet
11. Add monitoring for minting success/failure rates
12. Document minting flow

**Implementation Flow:**
```typescript
1. User purchases ticket
2. Order created and paid
3. Ticket created with status=AWAITING_MINT
4. Call minting-service to mint NFT
5. Minting-service returns token_id and tx_hash
6. Update ticket: status=MINTED, nft_token_id, nft_tx_hash
7. If mint fails: ticket stays AWAITING_MINT for retry
```

**API Integration:**
```typescript
POST http://minting-service:3010/api/v1/mint
{
  "eventId": "event-uuid",
  "ticketId": "ticket-uuid", 
  "metadata": {
    "name": "VIP Ticket #1234",
    "description": "...",
    "attributes": [...]
  }
}

Response:
{
  "tokenId": "...",
  "transactionHash": "...",
  "status": "minted"
}
```

**Success Criteria:**
- [ ] MintingServiceClient implemented with circuit breaker
- [ ] Minting integrated into purchase saga
- [ ] NFT token IDs stored in tickets table
- [ ] Failed mints handled gracefully
- [ ] Retry worker for failed mints
- [ ] Transfer calls minting-service
- [ ] Integration tests with minting-service
- [ ] Monitoring metrics added
- [ ] Documentation complete

**Estimated Effort (Option B):** 8-16 hours

---

### 5.3 Load Testing (6 hours)
**Problem:** No load testing to verify performance under stress

**Files to Create:**
- `tests/load/ticket-service-load-test.js` - k6 load test script
- `tests/load/README.md` - Load testing documentation

**Actions:**
1. Install k6 load testing tool
2. Create load test scenarios
3. Test critical endpoints under load
4. Measure response times and throughput
5. Identify bottlenecks
6. Test concurrent purchases
7. Test reservation expiry under load
8. Monitor resource usage during tests
9. Document performance baselines
10. Create performance optimization recommendations

**Load Test Scenarios:**
```javascript
Scenario 1: Read-Heavy Traffic
  - 1000 VU (virtual users)
  - 10 min duration
  - 80% GET ticket types
  - 20% GET user tickets

Scenario 2: Concurrent Purchases
  - 500 VU  
  - Simultaneous ticket purchases
  - 5 min duration
  - Check for inventory race conditions

Scenario 3: Mixed Workload
  - 300 VU
  - 15 min duration
  - 50% reads, 30% writes, 20% transfers

Scenario 4: Spike Test
  - Ramp 0 → 500 VU in 30 seconds
  - Hold for 2 minutes
  - Measure recovery time
```

**Metrics to Measure:**
- Requests per second
- Response time (p50, p95, p99)
- Error rate
- Database connection pool usage
- Redis memory usage
- CPU and memory utilization

**Success Criteria:**
- [ ] Load tests created for critical paths
- [ ] Tests run successfully without errors
- [ ] Performance baselines documented
- [ ] Response time < 500ms for p95 under normal load
- [ ] Error rate < 0.1% under load
- [ ] Service handles 500 concurrent users
- [ ] No race conditions in concurrent operations
- [ ] Bottlenecks identified and documented

**Estimated Effort:** 6 hours

---

### 5.4 Production Deployment Checklist (4 hours)
**Problem:** No formal deployment checklist

**Files to Create:**
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md` - Comprehensive deployment checklist

**Actions:**
1. Create pre-deployment checklist
2. Create deployment steps
3. Create post-deployment verification
4. Create rollback procedures
5. Document smoke tests
6. Create deployment runbook
7. Document required secrets/config
8. Add database migration procedures
9. Add monitoring verification steps
10. Document incident response procedures

**Checklist Sections:**
```markdown
1. Pre-Deployment
   - [ ] All Phase 1-4 items complete
   - [ ] Test suite passing (95%+ coverage)
   - [ ] Load tests completed
   - [ ] Security scan completed
   - [ ] Database migrations tested
   - [ ] Secrets configured in production
   - [ ] Service URLs verified
   - [ ] Monitoring dashboards created
   - [ ] Alerts configured
   - [ ] Backup procedures tested

2. Deployment
   - [ ] Tag release version
   - [ ] Run database migrations
   - [ ] Deploy new Docker image
   - [ ] Rolling deployment (zero downtime)
   - [ ] Health checks passing
   - [ ] Smoke tests passing

3. Post-Deployment
   - [ ] All health endpoints green
   - [ ] Metrics flowing to Grafana
   - [ ] No error alerts firing
   - [ ] Sample transactions tested
   - [ ] NFT minting verified
   - [ ] Monitor for 30 minutes
   - [ ] Notify team of completion

4. Rollback Procedure
   - [ ] Revert to previous image
   - [ ] Run rollback migrations if needed
   - [ ] Verify service health
   - [ ] Document rollback reason
```

**Success Criteria:**
- [ ] Comprehensive checklist created
- [ ] Deployment runbook documented
- [ ] Rollback procedures tested
- [ ] Smoke tests defined
- [ ] Team trained on deployment process
- [ ] Incident response documented

**Estimated Effort:** 4 hours

---

### 5.5 Security Review (8 hours)
**Problem:** Final security audit needed before production

**Files to Create:**
- `SECURITY_REVIEW.md` - Security review documentation

**Actions:**
1. Review all authentication/authorization
2. Review secret management
3. Review input validation
4. Review SQL injection protection
5. Review rate limiting
6. Review logging for sensitive data
7. Review webhook security
8. Review NFT wallet security
9. Scan dependencies for vulnerabilities
10. Perform penetration testing
11. Review GDPR compliance
12. Document security findings
13. Address all MEDIUM+ severity issues
14. Create security hardening guide

**Security Checklist:**
```markdown
Authentication & Authorization:
  - [ ] JWT verification correct
  - [ ] All endpoints have auth
  - [ ] RBAC enforced correctly
  - [ ] Session management secure
  - [ ] Multi-tenant isolation verified

Input Validation:
  - [ ] All inputs validated
  - [ ] SQL injection protected
  - [ ] XSS protected
  - [ ] CSRF tokens used
  - [ ] File uploads validated

Secrets Management:
  - [ ] No secrets in code
  - [ ] Secrets in secure storage
  - [ ] Secret rotation documented
  - [ ] Environment-specific secrets

Data Protection:
  - [ ] PII properly handled
  - [ ] Data encrypted at rest
  - [ ] Data encrypted in transit
  - [ ] Audit logs immutable
  - [ ] GDPR compliant

Dependencies:
  - [ ] No critical vulnerabilities
  - [ ] All deps up to date
  - [ ] License compliance checked
```

**Security Tools:**
- `npm audit` for dependency scanning
- `snyk` for vulnerability scanning  
- OWASP ZAP for penetration testing
- SonarQube for code analysis

**Success Criteria:**
- [ ] Security review completed
- [ ] All CRITICAL vulnerabilities fixed
- [ ] All HIGH vulnerabilities fixed
- [ ] MEDIUM vulnerabilities documented
- [ ] Security hardening guide created
- [ ] Team trained on security practices
- [ ] Compliance requirements verified

**Estimated Effort:** 8 hours

---

### 5.6 Performance Optimization (8 hours)
**Problem:** Optimize for production performance

**Files to Modify:**
- Various files based on profiling results

**Actions:**
1. Profile application under load
2. Identify slow database queries
3. Add missing indexes
4. Optimize N+1 query problems
5. Implement query result caching
6. Optimize Redis usage
7. Review connection pool sizes
8. Implement request coalescing
9. Add response compression
10. Optimize JSON serialization
11. Review and optimize hot paths
12. Document performance improvements

**Optimization Areas:**
```typescript
Database:
  - Add indexes for slow queries
  - Optimize complex joins
  - Use connection pooling effectively
  - Consider read replicas for read-heavy ops

Caching:
  - Cache frequent queries (ticket types)
  - Implement cache warming
  - Set appropriate TTLs
  - Use cache tags for invalidation

Application:
  - Minimize middleware overhead
  - Optimize JSON serialization
  - Use streaming for large responses
  - Implement request batching
  - Remove unnecessary logging in hot paths
```

**Success Criteria:**
- [ ] Profiling completed
- [ ] Slow queries optimized
- [ ] Response times improved
- [ ] Cache hit rates > 80%
- [ ] Database query time < 50ms (p95)
- [ ] API response time < 200ms (p95)
- [ ] Performance benchmarks documented

**Estimated Effort:** 8 hours

---

## PHASE PROGRESSION & DECISION POINTS

### Recommended Implementation Order:

**Week 1: Critical Blockers (Phase 1)**
- Days 1-3: Remove Express deps + Fix secrets + Graceful shutdown
- Days 4-5: Replace console.log with Winston

**Week 2: Configuration & Auth (Phase 2)**
- Days 1-2: Environment validation + Auth fixes
- Day 3: Rate limiting + .env.example

**Week 3: Testing (Phase 3)**
- Days 1-2: Coverage analysis + Test additions
- Day 3: Edge case tests

**Week 4: Monitoring & Performance (Phase 4)**
- Days 1-2: Foreign keys + Indexes
- Day 3: Grafana + Prometheus

**Week 5: Production Hardening (Phase 5)**
- Days 1-3: NFT minting (Option B recommended)
- Day 4: Load testing
- Day 5: Security review + Deployment checklist

**Critical Decision Point After Phase 1:**
- **IF** NFT minting is NOT needed immediately → Skip to Phase 6 deployment with stub
- **IF** NFT minting IS critical → Must complete 5.2 (minting-service integration)

---

## SUCCESS METRICS

### Phase 1 Complete:
- ✅ Production readiness: **6/10** (critical blockers fixed)
- ✅ Zero console.log statements (except migrations)
- ✅ Service survives pod termination
- ✅ No secrets in source code

### Phase 2 Complete:
- ✅ Production readiness: **7/10** (config & auth hardened)
- ✅ All endpoints properly authenticated
- ✅ Configuration validated on startup
- ✅ Admin endpoints protected

### Phase 3 Complete:
- ✅ Production readiness: **8/10** (test coverage adequate)
- ✅ Test coverage > 85%
- ✅ Critical paths covered
- ✅ Edge cases handled

### Phase 4 Complete:
- ✅ Production readiness: **9/10** (monitoring in place)
- ✅ Grafana dashboard live
- ✅ Prometheus alerts configured
- ✅ Performance optimized

### Phase 5 Complete:
- ✅ Production readiness: **10/10** (production ready!)
- ✅ NFT minting working (if Option B chosen)
- ✅ Load tests passing
- ✅ Security review complete
- ✅ Deployment checklist verified

---

## MAINTENANCE PLAN

**Ongoing Tasks After Production:**

### Daily:
- Monitor error rates and alerts
- Review performance metrics
- Check NFT minting success rates

### Weekly:
- Review dependency updates
- Analyze slow query logs
- Check test coverage trends
- Review security advisories

### Monthly:
- Rotate secrets
- Review and optimize indexes
- Update load test scenarios
- Security vulnerability scan
- Performance benchmarking

### Quarterly:
- Major dependency upgrades
- Architecture review
- Capacity planning
- Disaster recovery drill

---

## APPENDIX A: FILE MODIFICATION SUMMARY

**Phase 1 Files:**
- `package.json` - Remove Express deps
- `src/config/index.ts` - Remove secret defaults
- `src/index.ts` - Add graceful shutdown
- `src/services/*Service.ts` - Add close() methods
- 15+ files - Replace console.log

**Phase 2 Files:**
- `src/config/env-validation.ts` - NEW
- `src/routes/health.routes.ts` - Add auth
- `src/routes/ticketRoutes.ts` - Add auth
- `src/app.ts` - Rate limiting
- `.env.example` - Complete documentation

**Phase 3 Files:**
- `tests/unit/graceful-shutdown.test.ts` - NEW
- `tests/unit/env-validation.test.ts` - NEW
- `tests/integration/endpoint-auth.test.ts` - NEW
- `tests/integration/rate-limiting.test.ts` - NEW
- `jest.config.js` - Coverage thresholds

**Phase 4 Files:**
- `src/migrations/002_add_foreign_keys.ts` - NEW
- `src/migrations/003_add_performance_indexes.ts` - NEW
- `infrastructure/monitoring/grafana/dashboards/ticket-service-dashboard.json` - NEW
- `infrastructure/monitoring/prometheus/alerts/ticket-service-alerts.yml` - NEW

**Phase 5 Files:**
- `src/clients/MintingServiceClient.ts` - NEW (Option B)
- `tests/load/ticket-service-load-test.js` - NEW
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md` - NEW
- `SECURITY_REVIEW.md` - NEW

**Total New Files:** ~15  
**Total Modified Files:** ~25+  
**Total Effort:** 103-143 hours

---

## APPENDIX B: TEAM RESPONSIBILITIES

**Backend Engineer (Phase 1-3):**
- Remove Express dependencies
- Fix hardcoded secrets
- Implement graceful shutdown
- Replace console.log statements
- Add environment validation
- Implement auth fixes
- Write tests

**DevOps Engineer (Phase 2, 4-5):**
- Configure production secrets
- Set up monitoring dashboards
- Configure Prometheus alerts
- Run load tests
- Create deployment procedures
- Database migration management

**Security Engineer (Phase 5):**
- Security review
- Penetration testing
- Dependency scanning
- GDPR compliance review
- Security documentation

**QA Engineer (Phase 3, 5):**
- Test coverage verification
- Integration testing
- Load testing execution
- Smoke test creation
- Deployment verification

---

## APPENDIX C: ROLLBACK PROCEDURES

**If issues arise during any phase:**

1. **Immediate Rollback:**
   - Revert to previous Docker image
   - Run database rollback migrations (if any)
   - Verify health checks
   - Monitor for 15 minutes

2. **Partial Rollback:**
   - If specific feature failing, disable via feature flag
   - Keep rest of changes deployed
   - Fix issue in next deployment

3. **Hot Fixes:**
   - For critical security issues
   - Follow expedited deployment process
   - Skip non-critical steps
   - Full testing after the fact

4. **Communication:**
   - Notify team immediately
   - Update status page
   - Post-mortem within 24 hours
   - Document lessons learned

---

**END OF REMEDIATION PLAN**

Next Steps:
1. Review this plan with the engineering team
2. Get approval for Phase 1 start
3. Begin with Phase 1.1 (Remove Express dependencies)
4. Track progress using GitHub issues or Jira
5. Schedule Phase completion reviews
6. Document any deviations from plan
