# Event Service Testing Plan

## Overview

This document outlines the comprehensive testing strategy for the event-service, following the **Testing Trophy** methodology (integration-heavy approach).

### Testing Proportions
- **Integration Tests**: ~60% - Test component interactions with real dependencies
- **E2E Tests**: ~20% - Full user journey validation
- **Unit Tests**: ~20% - Pure function and business logic validation

### Test Framework Stack
- **Vitest** or **Jest** - Test runner
- **Supertest** - HTTP assertions
- **Testcontainers** - PostgreSQL, Redis, MongoDB containers
- **MSW** or **nock** - External service mocking

---

## Service Architecture Summary
```
src/
├── index.ts                    # Production entry point
├── app.ts                      # Fastify app builder
├── config/
│   ├── database.ts             # PostgreSQL + Knex setup
│   ├── redis.ts                # Redis client
│   ├── mongodb.ts              # Mongoose connection
│   ├── dependencies.ts         # Awilix DI container
│   ├── env-validation.ts       # Joi env validation
│   └── service-auth.ts         # S2S authentication
├── services/
│   ├── event.service.ts        # Core event operations
│   ├── event-state-machine.ts  # State transitions
│   ├── capacity.service.ts     # Capacity management
│   ├── pricing.service.ts      # Pricing calculations
│   ├── cancellation.service.ts # Basic cancellation
│   ├── event-cancellation.service.ts # Full cancellation workflow
│   ├── reservation-cleanup.service.ts # Background cleanup
│   ├── blockchain.service.ts   # Solana integration
│   ├── venue-service.client.ts # External venue service
│   ├── cache-integration.ts    # Redis cache wrapper
│   ├── databaseService.ts      # PG pool wrapper
│   ├── healthCheck.service.ts  # K8s probes
│   └── event-content.service.ts # MongoDB content
├── models/
│   ├── base.model.ts           # Generic Knex model
│   ├── event.model.ts          # Event table operations
│   ├── event-category.model.ts # Category hierarchy
│   ├── event-metadata.model.ts # Extended event data
│   ├── event-schedule.model.ts # Event timing
│   ├── event-capacity.model.ts # Capacity sections
│   ├── event-pricing.model.ts  # Pricing tiers
│   └── mongodb/
│       └── event-content.model.ts # Mongoose schema
├── controllers/                # Route handlers (12 files)
├── middleware/                 # Auth, tenant, rate-limit, etc. (8 files)
├── routes/                     # Route definitions (14 files)
├── schemas/                    # JSON Schema validation
├── validations/                # Business rule validators
├── utils/                      # Logger, metrics, retry
├── jobs/                       # Bull queue jobs
└── types/                      # TypeScript definitions
```

---

## Test Fixtures Required

### 1. Database Fixtures
```typescript
// fixtures/database.ts
- Test PostgreSQL container with migrations
- Tenant table with test tenants
- RLS policies enabled
- Test event data factory
- Test capacity/pricing data factory
```

### 2. Redis Fixtures
```typescript
// fixtures/redis.ts
- Test Redis container
- Cache key cleanup between tests
- Rate limit reset helpers
- Idempotency key helpers
```

### 3. MongoDB Fixtures
```typescript
// fixtures/mongodb.ts
- Test MongoDB container
- Event content collection
- Index creation
- TTL verification helpers
```

### 4. Authentication Fixtures
```typescript
// fixtures/auth.ts
- RSA key pair for JWT signing
- Test user token generator
- Test service token generator
- Test API key generator
- Admin/user/service role tokens
```

### 5. Mock Services
```typescript
// fixtures/mocks.ts
- Venue service mock (MSW/nock)
- Payment service mock
- Notification service mock
- Blockchain client mock
```

---

## Batch 1: Core App & Entry

### Files
- `src/index.ts`
- `src/app.ts`

### Integration Tests
```typescript
// tests/integration/app.test.ts

describe('Application Lifecycle', () => {
  describe('Startup', () => {
    it('should connect to PostgreSQL on startup');
    it('should connect to Redis on startup');
    it('should connect to MongoDB on startup');
    it('should register all DI container dependencies');
    it('should start HTTP server on configured port');
    it('should initialize background jobs');
  });

  describe('Health Endpoints', () => {
    it('GET /health/live should return 200 immediately');
    it('GET /health/live should respond in <100ms');
    it('GET /health/ready should return 200 when all deps healthy');
    it('GET /health/ready should return 503 when DB down');
    it('GET /health/ready should return 503 when Redis down');
    it('GET /health should return degraded when deps slow');
    it('GET /health?include_deps=true should include external deps');
    it('GET /metrics should return Prometheus format');
  });

  describe('Graceful Shutdown', () => {
    it('should stop accepting new requests on SIGTERM');
    it('should complete in-flight requests before shutdown');
    it('should close background jobs before DB');
    it('should close database connections last');
    it('should respect LB drain delay');
  });

  describe('Under Pressure', () => {
    it('should return 503 when event loop blocked');
    it('should return 503 when heap usage exceeds threshold');
  });
});
```

### Unit Tests
```typescript
// tests/unit/app.test.ts

describe('Configuration Parsing', () => {
  it('should parse grace period from env vars');
  it('should use defaults when env vars missing');
  it('should parse body limit configuration');
});
```

---

## Batch 2: Configuration

### Files
- `src/config/database.ts`
- `src/config/redis.ts`
- `src/config/mongodb.ts`
- `src/config/env-validation.ts`
- `src/config/dependencies.ts`
- `src/config/service-auth.ts`

### Integration Tests
```typescript
// tests/integration/config/database.test.ts

describe('Database Configuration', () => {
  describe('Connection', () => {
    it('should connect with valid credentials');
    it('should retry connection on failure (5 attempts)');
    it('should use exponential backoff between retries');
    it('should throw DatabaseConnectionError after max retries');
    it('should resolve DNS before connecting');
    it('should validate connection via afterCreate hook');
  });

  describe('Error Handling', () => {
    it('withDatabaseErrorHandling should map connection errors to 503');
    it('withDatabaseErrorHandling should map timeout errors to 504');
    it('withDeadlockRetry should retry on PG code 40P01');
    it('withDeadlockRetry should retry on PG code 40001');
    it('withDeadlockRetry should retry on PG code 55P03');
    it('withDeadlockRetry should give up after max attempts');
    it('withTransactionRetry should rollback on failure');
  });

  describe('Pool Management', () => {
    it('should respect min/max pool settings');
    it('should timeout queries after 30s');
    it('should timeout statements after 30s');
  });
});

// tests/integration/config/service-auth.test.ts

describe('Service-to-Service Authentication', () => {
  describe('Token Management', () => {
    it('should generate valid service tokens');
    it('should verify valid service tokens');
    it('should reject expired service tokens');
    it('should reject malformed service tokens');
    it('should auto-refresh tokens before expiry');
  });

  describe('Token Revocation', () => {
    it('should revoke specific tokens');
    it('should revoke all tokens for a service');
    it('should reject revoked tokens');
    it('should cleanup expired revocations');
  });

  describe('Credential Rotation', () => {
    it('should accept old secret during rotation window');
    it('should accept new secret during rotation window');
    it('should reject old secret after rotation window');
  });

  describe('API Key Verification', () => {
    it('should verify valid API keys');
    it('should reject invalid API keys');
    it('should use timing-safe comparison');
  });

  describe('Scopes', () => {
    it('should validate required scopes');
    it('should allow admin scope to access all');
    it('should reject missing scopes');
  });
});

// tests/integration/config/dependencies.test.ts

describe('Dependency Injection', () => {
  it('should resolve config');
  it('should resolve db connection');
  it('should resolve redis client');
  it('should resolve mongodb connection');
  it('should resolve VenueServiceClient');
  it('should resolve EventService');
  it('should resolve PricingService');
  it('should resolve CapacityService');
  it('should resolve EventContentService');
});
```

### Unit Tests
```typescript
// tests/unit/config/database.test.ts

describe('Database Utilities', () => {
  it('isRetryableError should identify PG deadlock codes');
  it('isRetryableError should reject non-retryable codes');
  it('calculateBackoffDelay should use exponential growth');
  it('calculateBackoffDelay should respect max delay');
  it('calculateBackoffDelay should add jitter');
});

// tests/unit/config/service-auth.test.ts

describe('Service Auth Utilities', () => {
  it('validateTokenScopes should handle admin scope');
  it('validateTokenScopes should check specific scopes');
  it('hasScope should return true for matching scope');
  it('hasScope should return false for missing scope');
  it('timingSafeEqual should compare strings safely');
});
```

---

## Batch 3: Core Event Domain

### Files
- `src/services/event.service.ts`
- `src/services/event-state-machine.ts`
- `src/models/event.model.ts`

### Integration Tests
```typescript
// tests/integration/services/event.service.test.ts

describe('EventService', () => {
  describe('createEvent', () => {
    it('should create event with valid data');
    it('should validate venue access via VenueServiceClient');
    it('should validate timezone');
    it('should reject duplicate name+date+venue');
    it('should create event in transaction with metadata and schedule');
    it('should trigger blockchain sync asynchronously');
    it('should set blockchain_status to pending');
    it('should invalidate cache after creation');
    it('should publish search sync message');
    it('should reject invalid venue_id');
  });

  describe('getEvent', () => {
    it('should return event with tenant isolation');
    it('should enrich with schedule data');
    it('should enrich with capacity data');
    it('should return null for non-existent event');
    it('should return null for other tenant event');
  });

  describe('listEvents', () => {
    it('should paginate results');
    it('should filter by status');
    it('should enforce tenant isolation');
    it('should cap limit at 100');
  });

  describe('updateEvent', () => {
    it('should update with valid data');
    it('should check ownership (creator or admin)');
    it('should validate venue access on venue change');
    it('should reject update if tickets sold (critical fields)');
    it('should validate state transition');
    it('should use optimistic locking (version field)');
    it('should return ConflictError on version mismatch');
    it('should increment version on success');
    it('should invalidate cache after update');
  });

  describe('deleteEvent', () => {
    it('should soft delete event');
    it('should set status to CANCELLED');
    it('should reject if tickets sold (non-admin)');
    it('should allow admin with forceDelete flag');
    it('should invalidate cache after delete');
  });

  describe('Blockchain Sync', () => {
    it('should set blockchain_status to synced on success');
    it('should set blockchain_status to failed on error');
    it('should store event PDA on success');
  });
});

// tests/integration/services/event-state-machine.test.ts

describe('EventStateMachine', () => {
  describe('State Transitions', () => {
    it('DRAFT -> REVIEW should be valid');
    it('REVIEW -> APPROVED should be valid');
    it('APPROVED -> PUBLISHED should be valid');
    it('PUBLISHED -> ON_SALE should be valid');
    it('ON_SALE -> SOLD_OUT should be valid');
    it('ON_SALE -> IN_PROGRESS should be valid');
    it('IN_PROGRESS -> COMPLETED should be valid');
    it('COMPLETED -> any should be invalid (terminal)');
    it('CANCELLED -> any should be invalid (terminal)');
    it('ON_SALE -> SALES_PAUSED should be valid');
    it('SALES_PAUSED -> ON_SALE should be valid');
    it('any -> POSTPONED should be valid');
    it('any -> RESCHEDULED should be valid');
  });

  describe('Sales Blocking', () => {
    it('areSalesBlocked should return false for ON_SALE');
    it('areSalesBlocked should return true for DRAFT');
    it('areSalesBlocked should return reason for blocked state');
  });

  describe('Permission Checks', () => {
    it('canSellTickets should check SALES_ALLOWED_STATES');
    it('canModify should check MODIFICATION_ALLOWED_STATES');
    it('canDelete should check DELETION_ALLOWED_STATES');
  });
});

// tests/integration/models/event.model.test.ts

describe('EventModel', () => {
  describe('createWithDefaults', () => {
    it('should handle ON CONFLICT for slug collision');
    it('should generate unique slug');
  });

  describe('searchEvents', () => {
    it('should require tenant_id');
    it('should throw without tenant_id');
    it('should sanitize LIKE patterns (%, _, \\)');
    it('should whitelist sort columns');
    it('should enforce max limit of 100');
  });

  describe('Increment Methods', () => {
    it('should increment view_count atomically');
    it('should increment interest_count atomically');
    it('should increment share_count atomically');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/event-lifecycle.test.ts

describe('Event Lifecycle', () => {
  it('should complete full lifecycle: create -> publish -> start sales -> sell out -> complete');
  it('should handle event cancellation with ticket holders');
  it('should handle concurrent update conflicts');
});
```

### Unit Tests
```typescript
// tests/unit/services/event-state-machine.test.ts

describe('State Machine Logic', () => {
  it('validateTransition should return valid for allowed transitions');
  it('validateTransition should return invalid for disallowed transitions');
  it('getValidTransitions should return correct list per state');
  it('isTerminalState should identify COMPLETED and CANCELLED');
});

// tests/unit/models/event.model.test.ts

describe('Event Model Utilities', () => {
  it('generateSlug should handle special characters');
  it('generateSlug should truncate long names');
  it('transformForDb should map domain to db fields');
  it('transformFromDb should map db to domain fields');
});
```

---

## Batch 4: Capacity & Pricing

### Files
- `src/services/capacity.service.ts`
- `src/services/pricing.service.ts`
- `src/models/event-capacity.model.ts`
- `src/models/event-pricing.model.ts`

### Integration Tests
```typescript
// tests/integration/services/capacity.service.test.ts

describe('CapacityService', () => {
  describe('createCapacity', () => {
    it('should create capacity section');
    it('should validate venue capacity via VenueServiceClient');
    it('should reject if exceeds venue max_capacity');
  });

  describe('reserveCapacity', () => {
    it('should use row locking (FOR UPDATE)');
    it('should prevent double-booking with concurrent requests');
    it('should decrease available_capacity');
    it('should increase reserved_capacity');
    it('should set reservation expiration timestamp');
    it('should lock price if pricing_id provided');
    it('should store locked_price_data snapshot');
    it('should reject if insufficient capacity');
  });

  describe('releaseReservation', () => {
    it('should restore available_capacity');
    it('should decrease reserved_capacity');
  });

  describe('confirmReservation', () => {
    it('should increase sold_count');
    it('should decrease reserved_capacity');
    it('should use locked price for final amount');
  });

  describe('releaseExpiredReservations', () => {
    it('should batch cleanup expired reservations');
    it('should restore capacity for each expired reservation');
  });

  describe('Venue Validation', () => {
    it('should allow when total capacity <= venue max_capacity');
    it('should reject when total capacity > venue max_capacity');
    it('should skip validation gracefully on venue client failure');
  });
});

// tests/integration/services/pricing.service.test.ts

describe('PricingService', () => {
  describe('createPricing', () => {
    it('should create pricing tier');
    it('should validate base_price >= 0');
    it('should validate min_price <= max_price');
  });

  describe('calculatePrice', () => {
    it('should compute subtotal = base_price * quantity');
    it('should add service_fee');
    it('should add facility_fee');
    it('should calculate tax');
    it('should return per_ticket breakdown');
  });

  describe('Dynamic Pricing', () => {
    it('should update price within min/max bounds');
    it('should reject update if not is_dynamic');
    it('should apply demand_factor');
    it('should apply time_factor');
  });

  describe('Time-Based Pricing', () => {
    it('should apply early_bird_price when within window');
    it('should apply last_minute_price when within window');
    it('should use base_price outside special windows');
  });

  describe('getActivePricing', () => {
    it('should filter by sales_start_at <= now');
    it('should filter by sales_end_at >= now');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/reservation-flow.test.ts

describe('Reservation Flow', () => {
  it('should complete: check availability -> reserve -> confirm');
  it('should handle: reserve -> expire -> availability restored');
  it('should handle: dynamic pricing -> calculate -> reserve with locked price');
});
```

### Unit Tests
```typescript
// tests/unit/services/capacity.service.test.ts

describe('Capacity Utilities', () => {
  it('parseDecimalFields should convert strings to numbers');
  it('parseLockedPriceData should handle null');
  it('parseLockedPriceData should parse JSON string');
});

// tests/unit/services/pricing.service.test.ts

describe('Pricing Calculations', () => {
  it('calculatePrice should compute correct total');
  it('calculatePrice should round to 2 decimals');
  it('should reject negative capacity');
  it('should reject negative price');
  it('should reject min_price > max_price');
  it('should reject quantity <= 0');
});
```

---

## Batch 5: Cancellation & Cleanup

### Files
- `src/services/cancellation.service.ts`
- `src/services/event-cancellation.service.ts`
- `src/services/reservation-cleanup.service.ts`

### Integration Tests
```typescript
// tests/integration/services/cancellation.service.test.ts

describe('CancellationService', () => {
  describe('cancelEvent', () => {
    it('should update event status to CANCELLED');
    it('should check cancellation deadline');
    it('should allow creator to bypass deadline');
    it('should create audit log entry');
  });

  describe('validateCancellationPermission', () => {
    it('should allow event creator');
    it('should reject non-creator');
  });
});

// tests/integration/services/event-cancellation.service.test.ts

describe('EventCancellationService', () => {
  describe('Full Cancellation Workflow', () => {
    it('should update event status');
    it('should fetch all tickets');
    it('should trigger refunds via payment-service');
    it('should invalidate tickets (capacity to 0)');
    it('should cancel resale listings via marketplace-service');
    it('should notify ticket holders via notification-service');
    it('should create audit log');
    it('should generate cancellation report');
    it('should store report in event_cancellation_reports');
  });

  describe('Partial Failure Handling', () => {
    it('should continue if refund step fails');
    it('should record errors in result');
    it('should set status to partial on failures');
  });

  describe('canCancelEvent', () => {
    it('should return warnings for already started events');
    it('should return warnings for events with tickets sold');
  });
});

// tests/integration/services/reservation-cleanup.service.test.ts

describe('ReservationCleanupService', () => {
  describe('Lifecycle', () => {
    it('should start cleanup interval');
    it('should stop cleanup interval');
    it('should run immediately on start');
  });

  describe('Cleanup Execution', () => {
    it('should release expired reservations');
    it('should restore capacity for each');
    it('should be triggered manually via triggerCleanup()');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/cancellation-flow.test.ts

describe('Event Cancellation', () => {
  it('should complete: event with tickets -> cancel -> refunds triggered -> notifications sent -> report generated');
  it('should reject cancellation for non-owner');
});
```

### Unit Tests
```typescript
// tests/unit/services/cancellation.service.test.ts

describe('Cancellation Logic', () => {
  it('should calculate deadline correctly (hours before event)');
  it('CancellationResult.getStatus should return correct state');
});

// tests/unit/services/reservation-cleanup.service.test.ts

describe('Cleanup Interval', () => {
  it('should parse cleanup interval from env');
  it('should use default interval when not set');
});
```

---

## Batch 6: External Services

### Files
- `src/services/blockchain.service.ts`
- `src/services/venue-service.client.ts`
- `src/services/cache-integration.ts`

### Integration Tests
```typescript
// tests/integration/services/blockchain.service.test.ts

describe('EventBlockchainService', () => {
  describe('createEventOnChain', () => {
    it('should convert dates to Unix timestamps');
    it('should convert percentages to basis points');
    it('should validate total royalties <= 100%');
    it('should derive venue PDA from venueId');
    it('should return event PDA and signature');
    it('should throw BlockchainError on failure');
  });

  describe('deriveVenuePDA', () => {
    it('should return consistent PDA for same venueId');
  });

  describe('close', () => {
    it('should cleanup blockchain client resources');
  });
});

// tests/integration/services/venue-service.client.test.ts

describe('VenueServiceClient', () => {
  describe('Circuit Breaker', () => {
    it('should open after 50% error rate');
    it('should enter half-open after 30s');
    it('should close after successful request in half-open');
    it('should track isDegraded state');
  });

  describe('Retry Logic', () => {
    it('should retry 3 times with exponential backoff');
    it('should not retry 4xx errors (except 429)');
    it('should retry 5xx errors');
    it('should retry 429 errors');
  });

  describe('S2S Authentication', () => {
    it('should include S2S headers in requests');
    it('should include X-Tenant-ID header');
  });

  describe('HTTPS Enforcement', () => {
    it('should convert http to https in production');
    it('should allow http when ALLOW_INSECURE_SERVICE_CALLS=true');
  });

  describe('Idempotency', () => {
    it('should generate idempotency key for POST');
    it('should generate idempotency key for PUT');
    it('should not add idempotency key for GET');
  });

  describe('Venue Caching', () => {
    it('should cache venue data with tenant prefix');
    it('should return cached data when circuit open');
    it('should expire cache after 5 minutes');
    it('should isolate cache by tenant');
  });

  describe('validateVenueAccess', () => {
    it('should return true for valid venue');
    it('should throw NotFoundError for 404');
    it('should throw ForbiddenError for 403');
    it('should return true in degraded mode with cache');
    it('should return true in degraded mode without cache (with warning)');
  });

  describe('getVenue', () => {
    it('should return venue details');
    it('should return cached data when circuit open');
    it('should return default data when no cache available');
  });

  describe('healthCheck', () => {
    it('should return healthy status and latency');
    it('should return unhealthy on timeout');
  });
});

// tests/integration/services/cache-integration.test.ts

describe('ServiceCache', () => {
  describe('Basic Operations', () => {
    it('should set and get values');
    it('should serialize/deserialize JSON');
    it('should respect TTL');
    it('should return null for missing keys');
  });

  describe('Delete Operations', () => {
    it('should delete single key');
    it('should delete array of keys');
    it('should delete keys matching wildcard pattern');
  });

  describe('Error Handling', () => {
    it('should return null on get error');
    it('should log error on set failure');
    it('should not throw on delete failure');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/venue-degradation.test.ts

describe('Venue Service Degradation', () => {
  it('should create event when venue-service down (using cache)');
  it('should create event when venue-service down (degraded mode)');
});
```

### Unit Tests
```typescript
// tests/unit/services/blockchain.service.test.ts

describe('Blockchain Utilities', () => {
  it('should convert percentage to basis points correctly');
  it('should convert date to Unix timestamp correctly');
});

// tests/unit/services/venue-service.client.test.ts

describe('Venue Client Utilities', () => {
  it('generateIdempotencyKey should have correct format');
  it('validateServiceUrl should convert http to https');
  it('getCacheKey should format tenant:venueId');
});
```

---

## Batch 7: Health & Content Services

### Files
- `src/services/databaseService.ts`
- `src/services/healthCheck.service.ts`
- `src/services/event-content.service.ts`

### Integration Tests
```typescript
// tests/integration/services/databaseService.test.ts

describe('DatabaseService', () => {
  describe('initialize', () => {
    it('should create pool from DATABASE_URL');
    it('should create pool from individual params');
    it('should verify connection on init');
  });

  describe('getPool', () => {
    it('should return pool when initialized');
    it('should throw when not initialized');
  });
});

// tests/integration/services/healthCheck.service.test.ts

describe('HealthCheckService', () => {
  describe('performLivenessCheck', () => {
    it('should return ok immediately');
    it('should complete in <100ms');
    it('should not check any dependencies');
  });

  describe('performReadinessCheck', () => {
    it('should return ready when DB and Redis up');
    it('should return not_ready when DB down');
    it('should return not_ready when Redis down');
  });

  describe('performHealthCheck', () => {
    it('should return healthy when all deps up');
    it('should return degraded when deps slow');
    it('should return unhealthy when deps down');
    it('should include external deps when requested');
    it('should cache external dep status for 30s');
  });

  describe('Response Time Thresholds', () => {
    it('should mark DB degraded when >1000ms');
    it('should mark Redis degraded when >500ms');
  });

  describe('Timeouts', () => {
    it('should timeout DB check after 2s');
    it('should timeout Redis check after 1s');
  });

  describe('checkClockDrift', () => {
    it('should return ok for <2.5s drift');
    it('should return warning for 2.5-5s drift');
    it('should return error for >5s drift');
  });

  describe('performDetailedHealthCheck', () => {
    it('should include clock drift');
    it('should include memory usage');
    it('should include process info');
  });
});

// tests/integration/services/event-content.service.test.ts

describe('EventContentService', () => {
  describe('CRUD Operations', () => {
    it('should create content with all fields');
    it('should get content by ID');
    it('should update content and increment version');
    it('should delete content');
    it('should query by eventId');
    it('should query by contentType');
    it('should query by status');
    it('should sort by displayOrder');
  });

  describe('Status Transitions', () => {
    it('should publish content (draft -> published)');
    it('should set publishedAt on publish');
    it('should archive content (published -> archived)');
    it('should set archivedAt on archive');
  });

  describe('Specialized Queries', () => {
    it('getGallery should return published GALLERY content');
    it('getLineup should return published LINEUP content');
    it('getSchedule should return published SCHEDULE content');
    it('getPerformers should return published PERFORMER_BIO content');
  });
});
```

### Unit Tests
```typescript
// tests/unit/services/healthCheck.service.test.ts

describe('Health Check Logic', () => {
  it('should calculate drift correctly');
  it('getServerTime should return ISO string and unix_ms');
});
```

---

## Batch 8: Models

### Files
- `src/models/base.model.ts`
- `src/models/event-category.model.ts`
- `src/models/event-metadata.model.ts`
- `src/models/event-schedule.model.ts`
- `src/models/mongodb/event-content.model.ts`

### Integration Tests
```typescript
// tests/integration/models/base.model.test.ts

describe('BaseModel', () => {
  describe('CRUD Operations', () => {
    it('findAll should return records with tenant isolation');
    it('findAll should exclude soft-deleted records');
    it('findAll should include deleted with includeDeleted option');
    it('findAll should respect limit and offset');
    it('findOne should return single record');
    it('findById should return by ID');
    it('create should insert and return record');
    it('update should modify and set updated_at');
    it('delete should soft delete (set deleted_at)');
    it('hardDelete should remove record');
  });

  describe('Column Selection', () => {
    it('should use selectColumns when defined');
    it('should fall back to * when not defined');
    it('should allow column override in options');
  });

  describe('count and exists', () => {
    it('count should return correct number');
    it('exists should return true when record exists');
    it('exists should return false when not found');
  });
});

// tests/integration/models/event-category.model.test.ts

describe('EventCategoryModel', () => {
  it('findBySlug should find active category');
  it('findTopLevel should return categories without parent');
  it('findByParentId should return child categories');
  it('findFeatured should return featured categories (limit 10)');
  it('getCategoryTree should build nested structure');
});

// tests/integration/models/event-metadata.model.test.ts

describe('EventMetadataModel', () => {
  it('findByEventId should return metadata');
  it('upsert should insert when not exists');
  it('upsert should update when exists');
});

// tests/integration/models/event-schedule.model.test.ts

describe('EventScheduleModel', () => {
  it('findById should not check deleted_at');
  it('findByEventId should order by starts_at');
  it('findByEventId should filter by tenant');
  it('findUpcomingSchedules should filter by date and status');
  it('findSchedulesByDateRange should return in range');
  it('getNextSchedule should return first upcoming');
  it('updateWithTenant should enforce tenant isolation');
});

// tests/integration/models/mongodb/event-content.model.test.ts

describe('EventContent MongoDB Model', () => {
  it('should create content document');
  it('should index by eventId');
  it('should index by contentType + status');
  it('should auto-delete archived content after 30 days (TTL)');
});
```

### Unit Tests
```typescript
// tests/unit/models/base.model.test.ts

describe('BaseModel Utilities', () => {
  it('getSelectColumns should return array when defined');
  it('getSelectColumns should return * when not defined');
});
```

---

## Batch 9-10: Controllers

### Files
- `src/controllers/events.controller.ts`
- `src/controllers/capacity.controller.ts`
- `src/controllers/pricing.controller.ts`
- `src/controllers/schedule.controller.ts`
- `src/controllers/cancellation.controller.ts`
- `src/controllers/tickets.controller.ts`
- `src/controllers/notification.controller.ts`
- `src/controllers/customer-analytics.controller.ts`
- `src/controllers/venue-analytics.controller.ts`
- `src/controllers/report-analytics.controller.ts`
- `src/controllers/event-content.controller.ts`
- `src/controllers/event-reviews.controller.ts`

### Integration Tests
```typescript
// tests/integration/controllers/events.controller.test.ts

describe('EventsController', () => {
  describe('POST /events', () => {
    it('should create event with valid data (201)');
    it('should reject without auth (401)');
    it('should reject without tenant (400)');
    it('should return RFC 7807 error format');
  });

  describe('GET /events/:id', () => {
    it('should return event (200)');
    it('should return 404 for not found');
    it('should enforce tenant isolation');
  });

  describe('GET /events', () => {
    it('should paginate results');
    it('should filter by status');
  });

  describe('PUT /events/:id', () => {
    it('should update event');
    it('should return 404 for not found');
    it('should pass request info for audit');
  });

  describe('DELETE /events/:id', () => {
    it('should return 204 on success');
  });

  describe('POST /events/:id/publish', () => {
    it('should change status to PUBLISHED');
  });
});

// tests/integration/controllers/capacity.controller.test.ts

describe('CapacityController', () => {
  describe('GET /events/:eventId/capacity', () => {
    it('should return all sections');
  });

  describe('GET /events/:eventId/capacity/total', () => {
    it('should aggregate totals correctly');
  });

  describe('POST /capacity/:id/check', () => {
    it('should return available: true when sufficient');
    it('should return available: false when insufficient');
    it('should reject quantity < 1 (400)');
  });

  describe('POST /capacity/:id/reserve', () => {
    it('should reserve capacity');
    it('should return locked_price when pricing_id provided');
    it('should reject invalid quantity (400)');
  });
});

// tests/integration/controllers/pricing.controller.test.ts

describe('PricingController', () => {
  describe('GET /events/:eventId/pricing', () => {
    it('should return all pricing tiers');
  });

  describe('GET /events/:eventId/pricing/active', () => {
    it('should filter by sales window');
  });

  describe('POST /pricing/:id/calculate', () => {
    it('should return price breakdown');
    it('should reject quantity < 1');
  });
});

// tests/integration/controllers/schedule.controller.test.ts

describe('ScheduleController', () => {
  describe('GET /events/:eventId/schedules', () => {
    it('should verify event access first');
    it('should return schedules');
  });

  describe('POST /events/:eventId/schedules', () => {
    it('should validate with Joi schema');
    it('should return 422 on validation error');
    it('should create schedule with tenant');
  });

  describe('GET /events/:eventId/schedules/:scheduleId', () => {
    it('should check tenant isolation');
    it('should check event_id matches');
  });
});

// tests/integration/controllers/cancellation.controller.test.ts

describe('CancellationController', () => {
  describe('POST /events/:eventId/cancel', () => {
    it('should require cancellation_reason');
    it('should check permission');
    it('should return 403 for unauthorized');
    it('should return 404 for not found');
    it('should return 409 for already cancelled');
    it('should return 400 for past deadline');
  });
});

// tests/integration/controllers/tickets.controller.test.ts

describe('TicketsController', () => {
  describe('GET /events/:id/ticket-types', () => {
    it('should return pricing tiers as ticket types');
  });

  describe('POST /events/:id/ticket-types', () => {
    it('should validate with Joi schema');
    it('should create pricing tier');
  });

  describe('PUT /events/:id/ticket-types/:typeId', () => {
    it('should verify ownership');
    it('should return 404 for wrong event');
  });
});

// tests/integration/controllers/analytics.controller.test.ts

describe('Analytics Controllers', () => {
  describe('CustomerAnalytics', () => {
    it('GET /customers/:customerId/profile should return purchase history');
  });

  describe('VenueAnalytics', () => {
    it('GET /venues/:venueId/dashboard should return stats');
    it('GET /venues/:venueId/analytics should return revenue data');
  });

  describe('ReportAnalytics', () => {
    it('GET /reports/sales should aggregate sales');
    it('GET /reports/venue-comparison should group by venue');
    it('GET /reports/customer-insights should group by category');
  });
});

// tests/integration/controllers/event-content.controller.test.ts

describe('EventContentController', () => {
  it('POST /:eventId/content should create');
  it('GET /:eventId/content should list with filters');
  it('GET /:eventId/content/:contentId should return single');
  it('PUT /:eventId/content/:contentId should update');
  it('DELETE /:eventId/content/:contentId should delete');
  it('POST /:eventId/content/:contentId/publish should publish');
  it('POST /:eventId/content/:contentId/archive should archive');
  it('GET /:eventId/gallery should return gallery');
  it('GET /:eventId/lineup should return lineup');
});

// tests/integration/controllers/event-reviews.controller.test.ts

describe('EventReviewsController', () => {
  describe('Reviews', () => {
    it('POST /:eventId/reviews should create');
    it('GET /:eventId/reviews should list with pagination');
    it('PUT /:eventId/reviews/:reviewId should update own review');
    it('DELETE /:eventId/reviews/:reviewId should delete own review');
    it('POST /:eventId/reviews/:reviewId/helpful should mark helpful');
    it('POST /:eventId/reviews/:reviewId/report should report');
  });

  describe('Ratings', () => {
    it('POST /:eventId/ratings should submit');
    it('GET /:eventId/ratings/summary should return summary');
    it('GET /:eventId/ratings/me should return user rating');
  });
});
```

### Unit Tests
```typescript
// tests/unit/controllers/capacity.controller.test.ts

describe('Capacity Aggregation', () => {
  it('should sum totals correctly');
});

// tests/unit/controllers/schedule.controller.test.ts

describe('Schedule Validation', () => {
  it('Joi schema should validate required fields');
  it('Joi schema should validate date formats');
  it('Joi schema should validate status enum');
});
```

---

## Batch 11: Middleware

### Files
- `src/middleware/auth.ts`
- `src/middleware/tenant.ts`
- `src/middleware/rate-limit.ts`
- `src/middleware/error-handler.ts`
- `src/middleware/input-validation.ts`
- `src/middleware/idempotency.middleware.ts`
- `src/middleware/api-key.middleware.ts`
- `src/middleware/response.middleware.ts`

### Integration Tests
```typescript
// tests/integration/middleware/auth.test.ts

describe('Authentication Middleware', () => {
  describe('authenticateFastify', () => {
    it('should accept valid JWT');
    it('should reject missing Authorization header (401)');
    it('should reject malformed token (401)');
    it('should reject expired token (401)');
    it('should reject wrong token type (401)');
    it('should reject missing tenant_id (401)');
    it('should attach user to request');
  });

  describe('requireAdmin', () => {
    it('should allow admin role');
    it('should reject non-admin (403)');
    it('should reject unauthenticated (401)');
  });

  describe('requireRole', () => {
    it('should allow any of specified roles');
    it('should reject role not in list (403)');
  });

  describe('authenticateUserOrService', () => {
    it('should authenticate via X-Service-Token');
    it('should authenticate via X-API-Key');
    it('should fall back to Bearer token');
    it('should set source=service for service auth');
    it('should set source=user for user auth');
    it('should set isInternalRequest for trusted services');
  });

  describe('requireServiceAuth', () => {
    it('should allow service requests');
    it('should reject user requests (403)');
  });

  describe('requireInternalAuth', () => {
    it('should allow trusted services');
    it('should reject non-trusted services (403)');
  });
});

// tests/integration/middleware/tenant.test.ts

describe('Tenant Middleware', () => {
  describe('tenantHook', () => {
    it('should extract tenant_id from JWT');
    it('should validate UUID format');
    it('should reject invalid UUID (400)');
    it('should verify tenant exists in DB');
    it('should reject non-existent tenant (403)');
    it('should verify tenant is active');
    it('should reject inactive tenant (403)');
    it('should set RLS context (SET LOCAL)');
    it('should attach tenantId to request');
  });

  describe('setTenantContext', () => {
    it('should set tenant in transaction');
    it('should reject invalid UUID');
  });

  describe('withTenantContext', () => {
    it('should run callback in tenant transaction');
  });

  describe('optionalTenantHook', () => {
    it('should set tenant for authenticated users');
    it('should allow unauthenticated requests');
  });
});

// tests/integration/middleware/rate-limit.test.ts

describe('Rate Limiting', () => {
  describe('Limits by Operation Type', () => {
    it('should allow 100 read requests per minute');
    it('should allow 30 write requests per minute');
    it('should allow 20 search requests per minute');
    it('should allow 10 bulk requests per minute');
    it('should return 429 when limit exceeded');
  });

  describe('Key Generation', () => {
    it('should include tenantId in key');
    it('should include userId in key when authenticated');
    it('should use IP when not authenticated');
  });

  describe('Exemptions', () => {
    it('should exempt authenticated services');
    it('should exempt health endpoints');
    it('should use configurable IP allowlist');
  });

  describe('Failure Handling', () => {
    it('should fail open when Redis unavailable');
  });
});

// tests/integration/middleware/error-handler.test.ts

describe('Error Handler', () => {
  describe('RFC 7807 Format', () => {
    it('should return type URI');
    it('should return title');
    it('should return status code');
    it('should return detail');
    it('should return instance (request ID)');
    it('should return code');
  });

  describe('Error Type Mapping', () => {
    it('should map ValidationError to 422');
    it('should map NotFoundError to 404');
    it('should map UnauthorizedError to 401');
    it('should map ForbiddenError to 403');
    it('should map PG 23503 to 400');
    it('should map PG 23505 to 409');
  });

  describe('Production Safety', () => {
    it('should hide internal details in production');
    it('should show details in development');
    it('should never expose stack traces in production');
  });

  describe('Validation Errors', () => {
    it('should include field-level errors array');
    it('should map validation keywords to codes');
  });

  describe('Logging', () => {
    it('should redact sensitive headers');
    it('should redact sensitive body fields');
  });
});

// tests/integration/middleware/input-validation.test.ts

describe('Input Validation', () => {
  describe('sanitizeRequestBody', () => {
    it('should normalize Unicode to NFC');
    it('should strip HTML tags');
    it('should strip script tags');
    it('should strip event handlers');
    it('should strip control characters');
    it('should sanitize nested objects');
    it('should sanitize arrays');
  });

  describe('validateUrl', () => {
    it('should accept http URLs');
    it('should accept https URLs');
    it('should reject localhost');
    it('should reject 127.0.0.1');
    it('should reject 10.x.x.x');
    it('should reject 172.16-31.x.x');
    it('should reject 192.168.x.x');
    it('should reject 169.254.x.x');
    it('should reject .local domains');
  });

  describe('validateDateRange', () => {
    it('should accept valid range');
    it('should reject end before start');
    it('should reject start in past');
    it('should reject range > 2 years');
  });

  describe('validatePagination', () => {
    it('should accept valid limit and offset');
    it('should reject limit > 100');
    it('should reject limit < 1');
    it('should reject offset < 0');
  });
});

// tests/integration/middleware/idempotency.test.ts

describe('Idempotency Middleware', () => {
  describe('Key Handling', () => {
    it('should process request without key normally');
    it('should validate key format');
    it('should reject invalid key format (400)');
    it('should accept alphanumeric, hyphens, underscores');
    it('should reject keys > 256 chars');
  });

  describe('Request Deduplication', () => {
    it('should cache response on first request');
    it('should return cached response on retry');
    it('should set Idempotency-Replayed header on replay');
    it('should cache for 24 hours');
  });

  describe('Concurrent Requests', () => {
    it('should acquire lock on first request');
    it('should return 409 for concurrent requests');
    it('should release lock after response');
  });

  describe('Tenant Isolation', () => {
    it('should include tenant in cache key');
    it('should not return other tenant cached responses');
  });
});

// tests/integration/middleware/api-key.test.ts

describe('API Key Middleware', () => {
  describe('apiKeyMiddleware', () => {
    it('should accept valid API key');
    it('should reject missing key (401)');
    it('should reject invalid key (401)');
    it('should set service context');
  });

  describe('serviceTokenMiddleware', () => {
    it('should accept valid service token');
    it('should reject missing token (401)');
    it('should reject invalid token (401)');
  });

  describe('s2sAuthMiddleware', () => {
    it('should accept either API key or service token');
    it('should prefer service token');
    it('should reject when both invalid (401)');
  });

  describe('optionalS2sMiddleware', () => {
    it('should set context when valid');
    it('should set isServiceRequest=false when invalid');
  });
});

// tests/integration/middleware/response.test.ts

describe('Response Middleware', () => {
  it('should add X-Request-ID to all responses');
  it('should add Cache-Control: no-store to POST');
  it('should add Cache-Control: no-store to PUT');
  it('should add Cache-Control: no-store to PATCH');
  it('should add Cache-Control: no-store to DELETE');
  it('should not add Cache-Control to GET');
});
```

### Unit Tests
```typescript
// tests/unit/middleware/input-validation.test.ts

describe('Input Validation Utilities', () => {
  it('normalizeUnicode should convert to NFC');
  it('sanitizeString should handle null/undefined');
  it('validateEmail should accept valid emails');
  it('validateEmail should reject invalid emails');
  it('validateUUID should accept valid UUIDs');
  it('validateUUID should reject invalid UUIDs');
});

// tests/unit/middleware/rate-limit.test.ts

describe('Rate Limit Utilities', () => {
  it('getLimitType should return bulk for /bulk paths');
  it('getLimitType should return search for /search paths');
  it('getLimitType should return write for POST/PUT/PATCH/DELETE');
  it('getLimitType should return read for GET');
  it('getConfigurableAllowlist should parse env var');
});

// tests/unit/middleware/error-handler.test.ts

describe('Error Handler Utilities', () => {
  it('getValidationErrorCode should map keywords');
  it('normalizeEndpoint should replace UUIDs');
  it('normalizeEndpoint should remove query strings');
});
```

---

## Batch 12: Routes

### Files
- `src/routes/index.ts`
- `src/routes/events.routes.ts`
- `src/routes/capacity.routes.ts`
- `src/routes/pricing.routes.ts`
- `src/routes/schedules.routes.ts`
- `src/routes/cancellation.routes.ts`
- `src/routes/tickets.routes.ts`
- `src/routes/health.routes.ts`
- `src/routes/notifications.routes.ts`
- `src/routes/customers.routes.ts`
- `src/routes/reports.routes.ts`
- `src/routes/venue-analytics.routes.ts`
- `src/routes/event-content.routes.ts`
- `src/routes/event-reviews.routes.ts`

### Integration Tests
```typescript
// tests/integration/routes/events.routes.test.ts

describe('Event Routes Schema Validation', () => {
  describe('POST /events', () => {
    it('should accept valid body');
    it('should reject extra properties (additionalProperties: false)');
    it('should validate UUID pattern for venue_id');
    it('should validate date-time pattern for starts_at');
    it('should validate URI format for banner_image_url');
    it('should validate name length (1-300)');
    it('should validate description length (max 10000)');
    it('should apply idempotency middleware');
  });

  describe('GET /events', () => {
    it('should validate status enum');
    it('should validate limit bounds (1-100)');
    it('should validate offset minimum (0)');
    it('should validate sort_by enum');
  });

  describe('GET /events/:id', () => {
    it('should validate UUID pattern for id');
  });
});

// tests/integration/routes/capacity.routes.test.ts

describe('Capacity Routes Schema Validation', () => {
  describe('POST /events/:eventId/capacity', () => {
    it('should require section_name');
    it('should require total_capacity');
    it('should validate capacity bounds (1-1000000)');
    it('should apply idempotency middleware');
  });

  describe('POST /capacity/:id/reserve', () => {
    it('should require quantity');
    it('should validate quantity bounds (1-100)');
    it('should validate pricing_id UUID');
    it('should apply idempotency middleware');
  });
});

// tests/integration/routes/health.routes.test.ts

describe('Health Routes', () => {
  describe('GET /health/live', () => {
    it('should not require auth');
    it('should return immediately');
  });

  describe('GET /health/ready', () => {
    it('should not require auth');
    it('should check local dependencies');
  });

  describe('GET /health', () => {
    it('should accept include_deps query param');
  });

  describe('GET /metrics', () => {
    it('should return text/plain');
    it('should return Prometheus format');
  });
});
```

### Unit Tests
```typescript
// tests/unit/routes/schema-validation.test.ts

describe('Schema Patterns', () => {
  it('uuidPattern should match valid UUIDs');
  it('uuidPattern should reject invalid UUIDs');
  it('dateTimePattern should match ISO 8601');
  it('dateTimePattern should reject invalid dates');
});
```

---

## Batch 13: Schemas & Validations

### Files
- `src/schemas/event.schema.ts`
- `src/schemas/capacity.schema.ts`
- `src/schemas/pricing.schema.ts`
- `src/schemas/common.schema.ts`
- `src/validations/event-security.ts`

### Integration Tests
```typescript
// tests/integration/validations/event-security.test.ts

describe('EventSecurityValidator', () => {
  describe('validateEventModification', () => {
    it('should allow modification when no tickets sold');
    it('should block critical field changes after sales');
    it('should allow admin override with flag');
    it('should block modification of COMPLETED events');
    it('should block modification of CANCELLED events');
  });

  describe('validateEventDeletion', () => {
    it('should allow deletion when no tickets sold');
    it('should block deletion after sales');
    it('should allow admin override with forceDelete');
    it('should block deletion of COMPLETED events');
    it('should block deletion of past events');
  });

  describe('validateModificationTiming', () => {
    it('should block critical changes within 72 hours');
    it('should allow critical changes beyond 72 hours');
    it('should allow non-critical changes anytime');
  });

  describe('calculateRefundWindow', () => {
    it('should return null when no tickets sold');
    it('should return 48hr window for venue change');
    it('should return 48hr window for date change (>1hr)');
    it('should not trigger for minor time adjustments');
  });

  describe('Confirmation Flow', () => {
    it('generateCriticalChangeConfirmation should return token');
    it('generateCriticalChangeConfirmation should include affected fields');
    it('generateCriticalChangeConfirmation should expire in 5 minutes');
    it('validateConfirmationToken should accept valid token');
    it('validateConfirmationToken should reject invalid token');
    it('validateConfirmationToken should reject expired token');
  });

  describe('validateStatusTransition', () => {
    it('should block DRAFT return after sales');
    it('should block publishing CANCELLED events');
    it('should block cancelling COMPLETED events');
  });

  describe('validateVenueCapacity', () => {
    it('should allow event capacity <= venue capacity');
    it('should reject event capacity > venue capacity');
  });

  describe('validateTicketPurchase', () => {
    it('should allow within per-order limit');
    it('should reject exceeding per-order limit');
    it('should reject exceeding per-customer total');
  });
});
```

### Unit Tests
```typescript
// tests/unit/schemas/common.schema.test.ts

describe('Common Schema Utilities', () => {
  describe('isValidUuid', () => {
    it('should accept valid UUID v4');
    it('should reject UUID v1');
    it('should reject invalid format');
    it('should reject null');
    it('should reject undefined');
    it('should reject empty string');
  });

  describe('UUID_V4_REGEX', () => {
    it('should be case insensitive');
    it('should require version 4');
    it('should require variant bits');
  });
});

// tests/unit/validations/event-security.test.ts

describe('Event Security Logic', () => {
  it('CRITICAL_FIELDS_AFTER_SALES should include venue_id');
  it('CRITICAL_FIELDS_AFTER_SALES should include starts_at');
  it('CRITICAL_FIELDS_AFTER_SALES should include ends_at');
  it('CRITICAL_FIELDS_AFTER_SALES should include total_capacity');
  it('CRITICAL_FIELDS_AFTER_SALES should include timezone');
  it('LOCKED_STATUSES should include COMPLETED');
  it('LOCKED_STATUSES should include CANCELLED');
  it('requiresConfirmation should return fields list');
  it('default refundWindowHours should be 48');
  it('default minHoursBeforeEventForModification should be 72');
});
```

---

## Batch 14: Utils & Jobs

### Files
- `src/utils/logger.ts`
- `src/utils/metrics.ts`
- `src/utils/retry.ts`
- `src/jobs/event-transitions.job.ts`

### Integration Tests
```typescript
// tests/integration/utils/logger.test.ts

describe('Logger', () => {
  describe('PII Redaction', () => {
    it('should redact email field');
    it('should redact password field');
    it('should redact token field');
    it('should redact authorization header');
    it('should redact nested PII fields');
    it('should redact req.headers.authorization');
  });

  describe('Request Logging', () => {
    it('should log request start at debug level');
    it('should log response with duration');
    it('should log 5xx at error level');
    it('should log 4xx at warn level');
    it('should log 2xx at info level');
    it('should include tenantId and userId');
  });

  describe('Sampling', () => {
    it('should sample based on LOG_SAMPLING_RATE');
    it('should log all when rate is 1.0');
  });
});

// tests/integration/utils/metrics.test.ts

describe('Metrics', () => {
  describe('Counter Metrics', () => {
    it('eventCreatedTotal should increment');
    it('eventUpdatedTotal should increment');
    it('errorsTotal should increment with labels');
  });

  describe('Histogram Metrics', () => {
    it('eventOperationDuration should observe');
    it('httpRequestDuration should observe');
    it('databaseQueryDuration should observe');
  });

  describe('Gauge Metrics', () => {
    it('capacityAvailable should set value');
  });

  describe('incrementErrorMetric', () => {
    it('should normalize endpoint path');
    it('should not throw on failure');
  });
});

// tests/integration/utils/retry.test.ts

describe('Retry Utility', () => {
  describe('withRetry', () => {
    it('should return result on success');
    it('should retry on network errors');
    it('should retry on 5xx errors');
    it('should retry on 429 errors');
    it('should not retry on 4xx errors');
    it('should respect maxRetries');
    it('should use exponential backoff');
    it('should add jitter to delays');
    it('should respect AbortSignal');
  });

  describe('isRetryableError', () => {
    it('should return true for ECONNREFUSED');
    it('should return true for ECONNRESET');
    it('should return true for ETIMEDOUT');
    it('should return true for status >= 500');
    it('should return true for status 429');
    it('should return false for status 400-499 (except 429)');
  });
});

// tests/integration/jobs/event-transitions.test.ts

describe('Event Transitions Job', () => {
  describe('Distributed Locking', () => {
    it('should acquire lock before processing');
    it('should release lock after processing');
    it('should prevent concurrent processing');
    it('should timeout lock after 30s');
  });

  describe('State Transitions', () => {
    it('SALES_START should transition PUBLISHED -> ON_SALE');
    it('SALES_END should transition ON_SALE -> SALES_PAUSED');
    it('EVENT_START should transition ON_SALE -> IN_PROGRESS');
    it('EVENT_END should transition IN_PROGRESS -> COMPLETED');
  });

  describe('Scan Job', () => {
    it('should find events where sales should start');
    it('should find events where sales should end');
    it('should find events that should start');
    it('should find events that should end');
    it('should schedule transition jobs for each');
  });

  describe('Job Scheduling', () => {
    it('scheduleEventTransition should use event-specific jobId');
    it('scheduleTransitionAt should delay until runAt');
    it('should deduplicate jobs by jobId');
  });

  describe('Failure Handling', () => {
    it('should retry failed jobs (5 attempts)');
    it('should use exponential backoff');
    it('should timeout after 30s');
  });
});
```

### E2E Tests
```typescript
// tests/e2e/event-transitions.test.ts

describe('Event Transition Lifecycle', () => {
  it('should auto-transition: PUBLISHED -> ON_SALE at sales_start_date');
  it('should auto-transition: ON_SALE -> IN_PROGRESS at start_date');
  it('should auto-transition: IN_PROGRESS -> COMPLETED at end_date');
});
```

### Unit Tests
```typescript
// tests/unit/utils/logger.test.ts

describe('Logger Utilities', () => {
  describe('sanitizeEventData', () => {
    it('should include safe fields');
    it('should exclude description content');
    it('should include description_length');
    it('should exclude sensitive metadata');
  });

  describe('sanitizePricingData', () => {
    it('should include price fields');
    it('should exclude internal fields');
  });

  describe('sanitizeCapacityData', () => {
    it('should include capacity counts');
    it('should exclude internal fields');
  });
});

// tests/unit/utils/metrics.test.ts

describe('Metrics Utilities', () => {
  describe('normalizeEndpoint', () => {
    it('should replace UUID with :id');
    it('should replace numeric IDs with :id');
    it('should remove query strings');
    it('should return unknown for empty path');
  });
});

// tests/unit/utils/retry.test.ts

describe('Retry Utilities', () => {
  describe('calculateDelay', () => {
    it('should use exponential growth');
    it('should cap at maxDelay');
    it('should add jitter within bounds');
    it('should not add jitter when disabled');
  });
});

// tests/unit/jobs/event-transitions.test.ts

describe('Event Transitions Utilities', () => {
  it('LOCK_PREFIX should be event-transition-lock:');
  it('job timeout should be 30000ms');
  it('job attempts should be 5');
});
```

---

## Batch 15: Types

### Files
- `src/types/index.ts`

### Unit Tests
```typescript
// tests/unit/types/errors.test.ts

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should set message');
    it('should set statusCode');
    it('should set code');
    it('should set details');
    it('should capture stack trace');
  });

  describe('ValidationError', () => {
    it('should set status 422');
    it('should set code VALIDATION_ERROR');
    it('should include details array');
  });

  describe('NotFoundError', () => {
    it('should set status 404');
    it('should set code NOT_FOUND');
    it('should include resource in message');
  });

  describe('UnauthorizedError', () => {
    it('should set status 401');
    it('should set code UNAUTHORIZED');
  });

  describe('ForbiddenError', () => {
    it('should set status 403');
    it('should set code FORBIDDEN');
  });
});
```

---

## Test Execution Strategy

### Local Development
```bash
# Run all tests
npm test

# Run specific batch
npm test -- --grep "EventService"

# Run with coverage
npm run test:coverage

# Run integration tests only
npm run test:integration

# Run unit tests only
npm run test:unit

# Run E2E tests only
npm run test:e2e
```

### CI/CD Pipeline
```yaml
test:
  stages:
    - unit
    - integration
    - e2e

  unit:
    script: npm run test:unit
    coverage: true

  integration:
    services:
      - postgres:15
      - redis:7
      - mongo:6
    script: npm run test:integration

  e2e:
    services:
      - postgres:15
      - redis:7
      - mongo:6
    script: npm run test:e2e
```

### Test Database Setup
```sql
-- Create test tenant
INSERT INTO tenants (id, name, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'Test Tenant', 'active');

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

## Coverage Requirements

| Category | Target | Critical Paths |
|----------|--------|----------------|
| Services | 80% | Event CRUD, State Machine, Capacity Reserve |
| Controllers | 70% | All endpoints |
| Middleware | 90% | Auth, Tenant, Rate Limit |
| Models | 70% | CRUD operations |
| Utils | 80% | Retry, Logger |
| Overall | 75% | - |

---

## Security Test Checklist

- [ ] Tenant isolation (RLS) prevents cross-tenant access
- [ ] JWT validation rejects invalid/expired tokens
- [ ] S2S auth validates service tokens
- [ ] Rate limiting prevents abuse
- [ ] Idempotency prevents duplicate operations
- [ ] Input sanitization blocks XSS
- [ ] URL validation blocks SSRF
- [ ] PII redaction in logs
- [ ] additionalProperties: false blocks prototype pollution
- [ ] Admin endpoints require admin role
- [ ] Critical field changes blocked after sales

---

## Performance Test Scenarios

1. **Capacity Reserve Under Load**
   - 100 concurrent reserve requests
   - Verify no double-booking
   - Measure lock contention

2. **Event List Pagination**
   - 10,000 events in DB
   - Query with various filters
   - Verify response time <200ms

3. **Rate Limit Accuracy**
   - 150 requests in 1 minute
   - Verify 429 after limit
   - Verify reset after window

---

## Appendix: Test Data Factories
```typescript
// factories/event.factory.ts
export function createTestEvent(overrides = {}) {
  return {
    name: 'Test Event',
    venue_id: '00000000-0000-4000-8000-000000000002',
    status: 'DRAFT',
    ...overrides
  };
}

// factories/user.factory.ts
export function createTestUser(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    tenant_id: '00000000-0000-4000-8000-000000000001',
    role: 'user',
    permissions: [],
    ...overrides
  };
}

// factories/token.factory.ts
export function createTestToken(user) {
  return jwt.sign({
    sub: user.id,
    type: 'access',
    tenant_id: user.tenant_id,
    role: user.role,
    permissions: user.permissions,
  }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}
```

---

*Document generated from codebase analysis. Last updated: 2025-01-05*
