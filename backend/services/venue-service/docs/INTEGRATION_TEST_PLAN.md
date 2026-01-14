# Integration Test Implementation Plan

## Overview

Integration tests verify components working together with real dependencies using **testcontainers** for PostgreSQL, Redis, and MongoDB.

## Infrastructure Files to Create

### 1. Test Setup & Helpers
```
tests/
├── integration/
│   ├── setup.ts                    # Global setup - start containers
│   ├── teardown.ts                 # Global teardown - stop containers
│   ├── jest.config.js              # Integration-specific jest config
│   ├── helpers/
│   │   ├── index.ts                # Re-exports
│   │   ├── containers.ts           # Testcontainer management
│   │   ├── db.ts                   # PostgreSQL utilities
│   │   ├── redis.ts                # Redis utilities  
│   │   ├── mongodb.ts              # MongoDB utilities
│   │   ├── fixtures.ts             # Test data factories
│   │   ├── auth.ts                 # JWT token generation
│   │   └── app.ts                  # Fastify app builder for tests
```

### 2. Container Management (`helpers/containers.ts`)
```typescript
// Manages testcontainers lifecycle
- startPostgres(): Promise<StartedPostgreSqlContainer>
- startRedis(): Promise<StartedRedisContainer>
- startMongoDB(): Promise<StartedMongoDBContainer>
- getContainerUrls(): { postgres, redis, mongodb }
- stopAll(): Promise<void>
```

### 3. Database Utilities (`helpers/db.ts`)
```typescript
// PostgreSQL test utilities
- getTestDb(): Knex
- runMigrations(): Promise<void>
- truncateAllTables(): Promise<void>
- seedTestData(fixtures): Promise<void>
- closeDb(): Promise<void>
```

### 4. Redis Utilities (`helpers/redis.ts`)
```typescript
// Redis test utilities
- getTestRedis(): Redis
- flushAll(): Promise<void>
- closeRedis(): Promise<void>
```

### 5. MongoDB Utilities (`helpers/mongodb.ts`)
```typescript
// MongoDB test utilities
- getTestMongoDB(): Connection
- dropAllCollections(): Promise<void>
- closeMongoDB(): Promise<void>
```

### 6. Test Fixtures (`helpers/fixtures.ts`)
```typescript
// Factory functions for test data
- createVenue(overrides?): VenueData
- createStaff(venueId, overrides?): StaffData
- createIntegration(venueId, overrides?): IntegrationData
- createSettings(venueId, overrides?): SettingsData
- createUser(overrides?): UserData
- createTenant(overrides?): TenantData
```

### 7. Auth Helpers (`helpers/auth.ts`)
```typescript
// JWT and auth utilities
- generateToken(payload): string
- generateAdminToken(): string
- generateServiceToken(): string
- generateHmacSignature(payload, secret): string
```

### 8. App Builder (`helpers/app.ts`)
```typescript
// Build Fastify app for testing
- buildTestApp(): Promise<FastifyInstance>
- injectRequest(app, options): Promise<Response>
```

## Environment Variables for Tests
```env
# Set by testcontainers dynamically
DB_HOST=localhost
DB_PORT=<dynamic>
DB_USER=test
DB_PASSWORD=test
DB_NAME=venue_test

REDIS_HOST=localhost
REDIS_PORT=<dynamic>

MONGODB_URI=mongodb://localhost:<dynamic>/venue_test

# Test-specific
NODE_ENV=test
JWT_SECRET=test-secret-key
INTERNAL_SERVICE_SECRET=test-internal-secret
```

## Jest Configuration for Integration Tests
```javascript
// tests/integration/jest.config.js
module.exports = {
  ...require('../../jest.config.js'),
  testMatch: ['**/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  globalSetup: '<rootDir>/globalSetup.ts',
  globalTeardown: '<rootDir>/globalTeardown.ts',
  testTimeout: 60000, // Longer timeout for containers
  maxWorkers: 1, // Run sequentially
  coverageDirectory: '../../coverage/integration',
};
```

## Test File Structure

### Services (~170 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `venue.service.test.ts` | 15 | Create with transaction, cache hit/miss, event publishing |
| `cache.service.test.ts` | 12 | Tenant isolation, TTL expiry, pattern deletion |
| `webhook.service.test.ts` | 15 | Dedup, distributed lock, retry after cooldown |
| `resale.service.test.ts` | 12 | Jurisdiction rules, fraud signals, transfer limits |
| `venue-operations.service.test.ts` | 10 | Checkpoint save/resume, lock acquisition |
| `compliance.service.test.ts` | 10 | Report generation, notification queue |
| `domain-management.service.test.ts` | 10 | Domain lifecycle, DNS mock |
| `branding.service.test.ts` | 8 | Tier changes, history |
| `verification.service.test.ts` | 10 | Document flow, status updates |
| `onboarding.service.test.ts` | 8 | Step completion, progress |
| `healthCheck.service.test.ts` | 8 | Real health checks |
| `integration.service.test.ts` | 8 | CRUD with encryption |
| `eventPublisher.test.ts` | 8 | Connection, publishing (RabbitMQ mocked) |
| `venue-content.service.test.ts` | 10 | MongoDB CRUD |
| `venue-stripe-onboarding.service.test.ts` | 8 | Stripe mocked, DB real |
| `analytics.service.test.ts` | 4 | HTTP mocked |
| `cache-integration.test.ts` | 4 | Cache patterns |

### Models (~70 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `venue.model.test.ts` | 15 | CRUD, soft delete, search, slug uniqueness |
| `staff.model.test.ts` | 12 | 50-limit enforcement, reactivation |
| `integration.model.test.ts` | 10 | Credential mapping, is_active soft delete |
| `settings.model.test.ts` | 10 | Upsert, defaults |
| `layout.model.test.ts` | 8 | setAsDefault atomicity |
| `base.model.test.ts` | 8 | Soft delete, transactions |
| `venue-content.model.test.ts` | 7 | MongoDB indexes |

### Routes (~100 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `venues.routes.test.ts` | 15 | Full HTTP lifecycle with supertest |
| `internal-validation.routes.test.ts` | 10 | HMAC auth, timing-safe |
| `health.routes.test.ts` | 10 | Real dependency checks |
| `venue-stripe.routes.test.ts` | 12 | Webhook signature |
| `venue-content.routes.test.ts` | 10 | MongoDB via HTTP |
| `venue-reviews.routes.test.ts` | 10 | Review lifecycle |
| `branding.routes.test.ts` | 8 | Tier validation |
| `domain.routes.test.ts` | 8 | DNS mocked |
| `settings.routes.test.ts` | 8 | Settings CRUD |
| `integrations.routes.test.ts` | 9 | Integration CRUD |

### Middleware (~40 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `auth.middleware.test.ts` | 10 | Real JWT verify, API key hash lookup |
| `tenant.middleware.test.ts` | 10 | RLS enforcement via SET app.tenant_id |
| `rate-limit.middleware.test.ts` | 10 | Real Redis counters |
| `idempotency.middleware.test.ts` | 5 | Real Redis locking |
| `error-handler.middleware.test.ts` | 5 | Error serialization |

### Config (~25 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `database.test.ts` | 5 | Pool, migrations |
| `redis.test.ts` | 5 | Connection, health |
| `mongodb.test.ts` | 5 | Connection, health |
| `fastify.test.ts` | 5 | Plugin registration |
| `service-auth.test.ts` | 5 | Token generation |

### Migrations (~27 tests)

| File | Tests | Key Scenarios |
|------|-------|---------------|
| `migrations.test.ts` | 27 | All migrations up/down in sequence |

## Implementation Order

### Week 1: Infrastructure
1. `helpers/containers.ts` - Testcontainer management
2. `helpers/db.ts` - PostgreSQL utilities
3. `helpers/redis.ts` - Redis utilities
4. `helpers/mongodb.ts` - MongoDB utilities
5. `helpers/fixtures.ts` - Test data factories
6. `helpers/auth.ts` - JWT helpers
7. `helpers/app.ts` - Fastify builder
8. `setup.ts` / `teardown.ts` - Global hooks

### Week 2: Critical Services
1. `services/venue.service.test.ts`
2. `services/cache.service.test.ts`
3. `services/webhook.service.test.ts`
4. `services/resale.service.test.ts`

### Week 3: Routes & Middleware
1. `routes/venues.routes.test.ts`
2. `routes/internal-validation.routes.test.ts`
3. `middleware/auth.middleware.test.ts`
4. `middleware/tenant.middleware.test.ts`

### Week 4: Remaining Tests
1. All remaining services
2. All remaining routes
3. All models
4. Config tests
5. Migration tests

## Running Integration Tests
```bash
# Run all integration tests
npm run test:integration

# Run specific file
npm run test:integration -- --testPathPattern="venue.service"

# With coverage
npm run test:integration -- --coverage

# Debug mode (verbose containers)
DEBUG=testcontainers* npm run test:integration
```

## Notes

- Testcontainers start once per test run (globalSetup)
- Each test file gets clean state (truncate tables, flush redis)
- External APIs (Stripe, Plaid, RabbitMQ) are mocked
- Tests run sequentially (maxWorkers: 1) for container stability
- Container ports are dynamic - use helper functions to get URLs
