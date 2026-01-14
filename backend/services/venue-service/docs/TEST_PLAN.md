# Venue Service - Comprehensive Testing Plan

## Overview

**Service Location:** `backend/services/venue-service`
**Test Framework:** Jest 29.x with ts-jest
**Last Updated:** January 2026

## Test Summary

### Current Status

| Test Type | Files | Tests | Status |
|-----------|-------|-------|--------|
| Unit | 64 | 1,974 | ✅ Complete |
| Integration | 0 | 0 | 🔴 Not Started |
| E2E | 0 | 0 | 🔴 Not Started |
| **Total** | **64** | **1,974** | **In Progress** |

### Coverage Thresholds

| Scope | Target | Current |
|-------|--------|---------|
| Global Statements | 80% | 57% |
| Global Branches | 80% | 56% |
| Global Functions | 80% | 62% |
| Global Lines | 80% | 57% |
| Services | 80-85% | 79.5% |
| Middleware | 85-90% | 98% |

---

## Unit Tests (✅ COMPLETE)

### Summary by Category

| Category | Files | Tests | Coverage |
|----------|-------|-------|----------|
| Controllers | 8 | 104 | 4.5% |
| Routes | 8 | 157 | 15% |
| Models | 7 | 250 | 87% |
| Schemas | 4 | 165 | 64% |
| Services | 17 | 480 | 79.5% |
| Middleware | 7 | 188 | 98% |
| Utils | 12 | 586 | 70% |
| Integrations | 1 | 44 | 95% |
| **Total** | **64** | **1,974** | **57%** |

### Unit Test Files

#### Controllers (8 files, 104 tests)
- `venues.controller.test.ts` - 24 tests
- `settings.controller.test.ts` - 18 tests
- `integrations.controller.test.ts` - 16 tests
- `compliance.controller.test.ts` - 13 tests
- `venue-reviews.controller.test.ts` - 12 tests
- `venue-stripe.controller.test.ts` - 8 tests
- `venue-content.controller.test.ts` - 7 tests
- `analytics.controller.test.ts` - 6 tests

#### Routes (8 files, 157 tests)
- `venue-reviews.routes.test.ts` - 33 tests
- `venue-content.routes.test.ts` - 28 tests
- `health.routes.test.ts` - 24 tests
- `internal-validation.routes.test.ts` - 18 tests
- `venue-stripe.routes.test.ts` - 18 tests
- `domain.routes.test.ts` - 13 tests
- `branding.routes.test.ts` - 12 tests
- `venues.routes.test.ts` - 11 tests

#### Models (7 files, 250 tests)
- `venue.model.test.ts` - 57 tests
- `staff.model.test.ts` - 47 tests
- `venue-content.model.test.ts` - 40 tests
- `base.model.test.ts` - 37 tests
- `integration.model.test.ts` - 26 tests
- `settings.model.test.ts` - 23 tests
- `layout.model.test.ts` - 20 tests

#### Schemas (4 files, 165 tests)
- `params.schema.test.ts` - 55 tests
- `integration.schema.test.ts` - 52 tests
- `venue.schema.test.ts` - 32 tests
- `settings.schema.test.ts` - 26 tests

#### Services (17 files, 480 tests)
- `cache.service.test.ts` - 54 tests
- `webhook.service.test.ts` - 46 tests
- `resale.service.test.ts` - 45 tests
- `venue.service.test.ts` - 44 tests
- `compliance.service.test.ts` - 44 tests
- `domain-management.service.test.ts` - 32 tests
- `venue-operations.service.test.ts` - 30 tests
- `healthCheck.service.test.ts` - 25 tests
- `eventPublisher.test.ts` - 25 tests
- `cache-integration.test.ts` - 25 tests
- `venue-content.service.test.ts` - 23 tests
- `venue-stripe-onboarding.service.test.ts` - 21 tests
- `branding.service.test.ts` - 19 tests
- `integration.service.test.ts` - 18 tests
- `onboarding.service.test.ts` - 12 tests
- `analytics.service.test.ts` - 12 tests
- `verification.service.test.ts` - 5 tests

#### Middleware (7 files, 188 tests)
- `rate-limit.middleware.test.ts` - 35 tests
- `idempotency.middleware.test.ts` - 30 tests
- `versioning.middleware.test.ts` - 29 tests
- `tenant.middleware.test.ts` - 26 tests
- `error-handler.middleware.test.ts` - 24 tests
- `auth.middleware.test.ts` - 23 tests
- `validation.middleware.test.ts` - 21 tests

#### Utils (12 files, 586 tests)
- `metrics.test.ts` - 77 tests
- `sanitize.test.ts` - 73 tests
- `retry.test.ts` - 71 tests
- `resilience.test.ts` - 54 tests
- `tracing.test.ts` - 51 tests
- `errors.test.ts` - 48 tests
- `error-handler.test.ts` - 47 tests
- `circuitBreaker.test.ts` - 39 tests
- `httpClient.test.ts` - 35 tests
- `dbWithRetry.test.ts` - 33 tests
- `venue-audit-logger.test.ts` - 30 tests
- `logger.test.ts` - 28 tests

#### Integrations (1 file, 44 tests)
- `verification-adapters.test.ts` - 44 tests

---

## Integration Tests (🔴 NOT STARTED)

Integration tests verify components working together with real dependencies (PostgreSQL, Redis, MongoDB).

### Test Infrastructure Required
```
tests/
├── integration/
│   ├── setup.ts                    # Global setup/teardown
│   ├── helpers/
│   │   ├── db.ts                   # PostgreSQL test utilities
│   │   ├── redis.ts                # Redis test utilities
│   │   ├── mongodb.ts              # MongoDB test utilities
│   │   ├── fixtures.ts             # Test data factories
│   │   └── auth.ts                 # JWT/auth token helpers
```

### Planned Integration Tests

#### Services (17 files, ~170 tests estimated)

| File | Priority | Tests | Dependencies | What to Test |
|------|----------|-------|--------------|--------------|
| `venue.service.test.ts` | 🔴 CRITICAL | 15 | PostgreSQL, Redis | Transaction rollback, cache invalidation, event publishing |
| `cache.service.test.ts` | 🔴 CRITICAL | 12 | Redis | Tenant isolation, TTL, pattern deletion |
| `webhook.service.test.ts` | 🔴 CRITICAL | 15 | PostgreSQL, Redis | Deduplication, distributed locking, retry logic |
| `resale.service.test.ts` | 🔴 CRITICAL | 12 | PostgreSQL | Jurisdiction rules, fraud detection with real data |
| `venue-operations.service.test.ts` | 🔴 CRITICAL | 10 | PostgreSQL, Redis | Checkpoints, resume, distributed locks |
| `compliance.service.test.ts` | 🟠 HIGH | 10 | PostgreSQL | Report generation, notification queuing |
| `domain-management.service.test.ts` | 🟠 HIGH | 10 | PostgreSQL | DNS verification (mocked), SSL lifecycle |
| `branding.service.test.ts` | 🟠 HIGH | 8 | PostgreSQL | Tier changes, history tracking |
| `verification.service.test.ts` | 🟠 HIGH | 10 | PostgreSQL | Document submission, verification workflow |
| `onboarding.service.test.ts` | 🟠 HIGH | 8 | PostgreSQL | Step completion, progress calculation |
| `healthCheck.service.test.ts` | 🟠 HIGH | 8 | PostgreSQL, Redis, MongoDB | Real dependency checks |
| `integration.service.test.ts` | 🟡 MEDIUM | 8 | PostgreSQL | CRUD with encryption |
| `eventPublisher.test.ts` | 🟡 MEDIUM | 8 | RabbitMQ (mocked) | Connection handling, message publishing |
| `venue-content.service.test.ts` | 🟡 MEDIUM | 10 | MongoDB | CRUD, versioning, status workflow |
| `venue-stripe-onboarding.service.test.ts` | 🟡 MEDIUM | 8 | PostgreSQL | Stripe API (mocked), status sync |
| `analytics.service.test.ts` | 🟢 LOW | 4 | HTTP (mocked) | External API calls |
| `cache-integration.test.ts` | 🟢 LOW | 4 | Redis | Cache patterns |

#### Models (7 files, ~70 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `venue.model.test.ts` | 🔴 CRITICAL | 15 | CRUD, soft delete, search, transformations |
| `staff.model.test.ts` | 🔴 CRITICAL | 12 | 50-member limit, role permissions, reactivation |
| `integration.model.test.ts` | 🟠 HIGH | 10 | Credential mapping, soft delete via is_active |
| `settings.model.test.ts` | 🟠 HIGH | 10 | Upsert, validation, defaults |
| `layout.model.test.ts` | 🟡 MEDIUM | 8 | setAsDefault transaction |
| `base.model.test.ts` | 🟡 MEDIUM | 8 | Soft delete, pagination, transactions |
| `venue-content.model.test.ts` | 🟡 MEDIUM | 7 | MongoDB indexes, TTL |

#### Routes (10 files, ~100 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `venues.routes.test.ts` | 🔴 CRITICAL | 15 | Full CRUD lifecycle, auth, pagination |
| `internal-validation.routes.test.ts` | 🔴 CRITICAL | 10 | HMAC authentication, timing-safe comparison |
| `health.routes.test.ts` | 🔴 CRITICAL | 10 | Real dependency checks, access control |
| `venue-stripe.routes.test.ts` | 🔴 CRITICAL | 12 | Webhook signature verification, raw body |
| `venue-content.routes.test.ts` | 🟠 HIGH | 10 | MongoDB CRUD via HTTP |
| `venue-reviews.routes.test.ts` | 🟠 HIGH | 10 | Review lifecycle, rating calculations |
| `branding.routes.test.ts` | 🟠 HIGH | 8 | Tier validation, CSS generation |
| `domain.routes.test.ts` | 🟠 HIGH | 8 | Domain lifecycle, DNS verification |
| `settings.routes.test.ts` | 🟡 MEDIUM | 8 | Settings CRUD |
| `integrations.routes.test.ts` | 🟡 MEDIUM | 9 | Integration CRUD, connection testing |

#### Controllers (8 files, ~80 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `venues.controller.test.ts` | 🔴 CRITICAL | 15 | Full flow with real services |
| `venue-stripe.controller.test.ts` | 🔴 CRITICAL | 12 | Stripe webhooks with signature |
| `integrations.controller.test.ts` | 🟠 HIGH | 10 | Credential encryption/decryption |
| `settings.controller.test.ts` | 🟠 HIGH | 10 | Settings with validation |
| `compliance.controller.test.ts` | 🟠 HIGH | 8 | Report generation |
| `venue-content.controller.test.ts` | 🟡 MEDIUM | 8 | MongoDB operations |
| `venue-reviews.controller.test.ts` | 🟡 MEDIUM | 8 | Review with caching |
| `analytics.controller.test.ts` | 🟢 LOW | 5 | External API calls |

#### Middleware (5 files, ~40 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `auth.middleware.test.ts` | 🔴 CRITICAL | 10 | Real JWT verification, API key hashing |
| `tenant.middleware.test.ts` | 🔴 CRITICAL | 10 | RLS enforcement in PostgreSQL |
| `rate-limit.middleware.test.ts` | 🔴 CRITICAL | 10 | Real Redis rate limiting |
| `idempotency.middleware.test.ts` | 🟠 HIGH | 5 | Real Redis locking |
| `error-handler.middleware.test.ts` | 🟡 MEDIUM | 5 | Error serialization |

#### Config (5 files, ~25 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `database.ts` | 🟠 HIGH | 5 | Connection pooling, migrations |
| `redis.ts` | 🟠 HIGH | 5 | Connection, cluster mode |
| `mongodb.ts` | 🟠 HIGH | 5 | Connection, indexes |
| `fastify.ts` | 🟡 MEDIUM | 5 | Plugin registration |
| `service-auth.ts` | 🟡 MEDIUM | 5 | Service token generation |

#### Migrations (9 files, ~27 tests estimated)

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `001_baseline_venue.ts` | 🟠 HIGH | 3 | Up/down, RLS policies |
| `003_add_external_verification_tables.ts` | 🟡 MEDIUM | 3 | Up/down |
| `004_add_webhook_events_table.ts` | 🟡 MEDIUM | 3 | Up/down, dedup constraint |
| `005_add_api_key_hash_column.ts` | 🟡 MEDIUM | 3 | Migration of existing keys |
| `006_add_rls_with_check.ts` | 🟠 HIGH | 3 | WITH CHECK policies |
| `007_add_version_column.ts` | 🟡 MEDIUM | 3 | Optimistic locking column |
| `008_add_check_constraints.ts` | 🟡 MEDIUM | 3 | Constraint enforcement |
| `009_enhance_webhook_events.ts` | 🟡 MEDIUM | 3 | Enhanced webhook columns |
| `010_add_venue_operations_resale_tables.ts` | 🟡 MEDIUM | 3 | Operations/resale tables |

### Integration Test Summary

| Category | Files | Est. Tests |
|----------|-------|------------|
| Services | 17 | 170 |
| Models | 7 | 70 |
| Routes | 10 | 100 |
| Controllers | 8 | 80 |
| Middleware | 5 | 40 |
| Config | 5 | 25 |
| Migrations | 9 | 27 |
| **Total** | **61** | **~512** |

---

## E2E Tests (🔴 NOT STARTED)

End-to-end tests verify complete user workflows across the entire system.

### Planned E2E Tests

| File | Priority | Tests | What to Test |
|------|----------|-------|--------------|
| `venue-lifecycle.test.ts` | 🔴 CRITICAL | 5 | Create → Configure → Activate → Archive |
| `stripe-onboarding.test.ts` | 🔴 CRITICAL | 5 | Connect → Verify → Payments enabled |
| `staff-management.test.ts` | 🟠 HIGH | 4 | Add → Promote → Remove |
| `resale-flow.test.ts` | 🟠 HIGH | 4 | List → Validate → Transfer |
| `compliance-flow.test.ts` | 🟡 MEDIUM | 3 | Check → Submit docs → Approve |

### E2E Test Summary

| Category | Files | Est. Tests |
|----------|-------|------------|
| E2E Workflows | 5 | ~21 |

---

## Security Tests

Security-specific tests are tagged and distributed across unit/integration tests.

### Security Test Categories

| Tag | Description | Location |
|-----|-------------|----------|
| SEC-DB | Database security (RLS, encryption) | Integration |
| SEC-AUTH | Authentication/authorization | Unit + Integration |
| SEC-INPUT | Input validation, injection prevention | Unit |
| SEC-RATE | Rate limiting, DDoS protection | Integration |
| SEC-HMAC | Service-to-service authentication | Unit + Integration |
| SEC-STRIPE | Stripe webhook security | Unit + Integration |

---

## Test Commands
```bash
# Unit tests
npm run test:unit

# Integration tests (requires docker-compose)
npm run test:integration

# E2E tests (requires running services)
npm run test:e2e

# All tests with coverage
npm test

# CI mode (JUnit output, fail fast)
npm run test:ci

# Watch mode
npm run test:watch

# Specific file
npm test -- --testPathPattern="venue.service"

# Coverage report
npm test -- --coverage
```

---

## Implementation Priority

### Phase 1: Integration Test Infrastructure (Week 1)
1. Set up `tests/integration/setup.ts`
2. Create `tests/integration/helpers/` utilities
3. Configure test database, Redis, MongoDB
4. Write first integration tests for `venue.service.ts`

### Phase 2: Critical Services Integration (Week 2)
1. `cache.service.test.ts` - Redis operations
2. `webhook.service.test.ts` - Distributed locking
3. `venue-operations.service.test.ts` - Checkpoints
4. `resale.service.test.ts` - Business rules

### Phase 3: Routes & Middleware Integration (Week 3)
1. `venues.routes.test.ts` - Full HTTP lifecycle
2. `internal-validation.routes.test.ts` - HMAC auth
3. `auth.middleware.test.ts` - JWT verification
4. `tenant.middleware.test.ts` - RLS enforcement

### Phase 4: Remaining Integration Tests (Week 4)
1. All remaining services
2. All remaining routes
3. Config/migration tests

### Phase 5: E2E Tests (Week 5)
1. `venue-lifecycle.test.ts`
2. `stripe-onboarding.test.ts`
3. Remaining E2E workflows

---

## Notes

- Integration tests require Docker Compose for PostgreSQL, Redis, MongoDB
- E2E tests run with `--runInBand` for sequential execution
- External APIs (Stripe, Plaid) are mocked even in integration tests
- Security tests should cover all SEC-* tagged requirements
- Target: 80% coverage with integration tests included
