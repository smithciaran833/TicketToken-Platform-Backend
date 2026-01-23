# VENUE-SERVICE COMPREHENSIVE AUDIT REPORT

**Service:** venue-service
**Audit Date:** 2026-01-23
**Auditor:** Claude Code
**Files Analyzed:** 85+ TypeScript files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints (Authenticated)

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| GET | /api/v1/venues | venues.controller.ts:113 | List venues for tenant |
| POST | /api/v1/venues | venues.controller.ts:148 | Create new venue |
| GET | /api/v1/venues/user | venues.controller.ts:179 | List user's venues |
| GET | /api/v1/venues/:venueId | venues.controller.ts:198 | Get venue by ID |
| GET | /api/v1/venues/:venueId/capacity | venues.controller.ts:224 | Get venue capacity |
| GET | /api/v1/venues/:venueId/stats | venues.controller.ts:264 | Get venue statistics |
| PUT | /api/v1/venues/:venueId | venues.controller.ts:295 | Update venue |
| DELETE | /api/v1/venues/:venueId | venues.controller.ts:328 | Delete venue (soft) |
| GET | /api/v1/venues/:venueId/check-access | venues.controller.ts:363 | Check user access to venue |
| POST | /api/v1/venues/:venueId/staff | venues.controller.ts:403 | Add staff member |
| GET | /api/v1/venues/:venueId/staff | venues.controller.ts:449 | List venue staff |
| PATCH | /api/v1/venues/:venueId/staff/:staffId | venues.controller.ts:478 | Update staff role |
| DELETE | /api/v1/venues/:venueId/staff/:staffId | venues.controller.ts:519 | Remove staff member |
| GET/PUT | /api/v1/venues/:venueId/settings | settings.controller.ts | Venue settings CRUD |
| GET/POST/DELETE | /api/v1/venues/:venueId/integrations | integrations.controller.ts | Integration management |
| GET/POST | /api/v1/venues/:venueId/compliance | compliance.controller.ts | Compliance reports |
| GET | /api/v1/venues/:venueId/analytics | analytics.controller.ts | Analytics data |

### Stripe Connect Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/venues/:venueId/stripe/connect | Start Stripe Connect onboarding |
| GET | /api/venues/:venueId/stripe/status | Get Connect account status |
| POST | /api/venues/:venueId/stripe/refresh-onboarding | Refresh onboarding link |
| POST | /api/venues/:venueId/stripe/dashboard-link | Get Express dashboard link |

### Webhook Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/stripe/webhooks/venue-connect | Stripe Connect webhooks |
| POST | /api/webhooks/plaid | Plaid bank verification webhooks |
| POST | /api/webhooks/stripe-identity | Stripe Identity webhooks |

### Internal Endpoints (S2S with HMAC)

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| GET | /internal/venues/:venueId | blockchain-service, compliance-service | Get venue with blockchain fields |
| GET | /internal/venues/:venueId/validate-ticket/:ticketId | ticket-service | Validate ticket for venue |
| GET | /internal/venues/:venueId/bank-info | payment-service, compliance-service | Get venue bank/payout info |
| GET | /internal/venues/:venueId/chargeback-rate | payment-service | Get chargeback metrics |

### Content Routes (MongoDB)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | /api/venues/:venueId/content | Venue content management |
| PUT/DELETE | /api/venues/:venueId/content/:contentId | Content CRUD |
| POST | /api/venues/:venueId/content/:contentId/publish | Publish content |
| GET/POST | /api/venues/:venueId/reviews | Venue reviews |

### Business Operations Summary

- **Venue Lifecycle**: Creation, updates, soft deletion with protection rules (no delete if upcoming events)
- **Staff Management**: Role-based access (owner, manager, box_office, door_staff, viewer)
- **Stripe Connect**: Full onboarding flow for venue payouts
- **Multi-tenant**: All operations scoped to tenant_id
- **Compliance**: Automated 90-day compliance review scheduling
- **White-label**: Custom domains, branding, and pricing tiers

---

## 2. DATABASE SCHEMA

### Tables (26 total)

#### venues (Core)
**Columns:**
- id: uuid, primary key, gen_random_uuid()
- tenant_id: uuid, indexed (RLS)
- name: varchar(200), not null
- slug: varchar(200), unique, not null
- email: varchar(255), not null
- phone: varchar(20)
- website: varchar(500)
- description: text
- address_line1: varchar(255), not null
- address_line2: varchar(255)
- city: varchar(100), not null
- state_province: varchar(100), not null
- postal_code: varchar(20)
- country_code: varchar(2), default 'US'
- latitude: decimal(10,8)
- longitude: decimal(11,8)
- timezone: varchar(50)
- venue_type: varchar(50), not null
- max_capacity: integer, not null
- standing_capacity: integer
- seated_capacity: integer
- vip_capacity: integer
- logo_url: varchar(1000)
- cover_image_url: varchar(1000)
- image_gallery: text[]
- wallet_address: varchar(44)
- collection_address: varchar(44)
- royalty_percentage: decimal(5,2), default 2.50
- stripe_connect_account_id: varchar
- stripe_connect_status: varchar
- stripe_connect_charges_enabled: boolean
- stripe_connect_payouts_enabled: boolean
- status: varchar(20), default 'active'
- is_verified: boolean, default false
- version: integer, default 1 (optimistic locking)
- created_by: uuid, FK -> users
- created_at: timestamptz
- updated_at: timestamptz
- deleted_at: timestamptz (soft delete)

**Generated Columns:**
- capacity: integer (mirrors max_capacity)
- type: varchar(50) (mirrors venue_type)

**Indexes:**
- PRIMARY KEY on id
- idx_venues_tenant_id on tenant_id
- idx_venues_slug on slug (unique)
- idx_venues_email on email
- idx_venues_city on city
- idx_venues_status on status
- idx_venues_venue_type on venue_type
- idx_venues_location on (latitude, longitude)
- idx_venues_search (GIN full-text search)
- idx_venues_metadata_gin (GIN on metadata JSONB)

**RLS:** Yes - Full tenant isolation with SELECT/INSERT/UPDATE/DELETE policies

**CHECK Constraints:**
- chk_max_capacity_positive: max_capacity > 0
- chk_venue_status_valid: status IN ('active', 'inactive', 'pending', 'suspended')

#### venue_staff
- id: uuid, primary key
- venue_id: uuid, FK -> venues, cascade delete
- user_id: uuid, FK -> users, not null
- tenant_id: uuid
- role: varchar(50), not null
- permissions: text[]
- is_active: boolean, default true

**Indexes:**
- UNIQUE on (venue_id, user_id)
- idx_venue_staff_role
- idx_venue_staff_tenant_id

**RLS:** Yes

#### venue_settings
- id: uuid, primary key
- venue_id: uuid, FK -> venues, unique
- tenant_id: uuid
- max_tickets_per_order: integer, default 10
- ticket_resale_allowed: boolean, default true
- service_fee_percentage: decimal(5,2), default 10.00
- max_resale_price_multiplier: decimal(5,2)
- anti_scalping_enabled: boolean, default false
- version: integer, default 1

**RLS:** Yes

#### venue_integrations
- id: uuid, primary key
- venue_id: uuid, FK -> venues
- tenant_id: uuid
- integration_type: varchar(50), constrained
- config_data: jsonb
- encrypted_credentials: text
- is_active: boolean
- version: integer, default 1

**CHECK Constraints:**
- chk_integration_provider_valid: integration_type IN ('stripe', 'square', 'toast', 'mailchimp', 'twilio')

**RLS:** Yes

#### Additional Tables

| Table | RLS | Purpose |
|-------|-----|---------|
| venue_branding | Yes | White-label branding (colors, logos, fonts) |
| custom_domains | Yes | Custom domain management with SSL |
| venue_layouts | Yes | Seating layouts and sections |
| venue_audit_log | Yes | Action audit trail |
| content_audit_log | Yes | MongoDB content audit trail |
| api_keys | Yes | API key management with hash storage |
| venue_compliance | Yes | Compliance settings |
| venue_compliance_reviews | Yes | Scheduled compliance reviews |
| venue_compliance_reports | Yes | Generated compliance reports |
| venue_documents | Yes | Document uploads (W9, licenses) |
| venue_webhook_events | Yes | Webhook idempotency tracking |
| venue_operations | Yes | Long-running operation checkpoints |
| transfer_history | Yes | Ticket transfer tracking |
| resale_policies | Yes | Per-venue/event resale rules |
| seller_verifications | Yes | Seller identity verification |
| resale_blocks | Yes | Blocked sellers |
| fraud_logs | Yes | Fraud detection logs |
| white_label_pricing | No | Global pricing tiers |
| email_queue | No | Global email queue |
| notifications | Yes | User notifications |
| external_verifications | Yes | Third-party verification status |
| manual_review_queue | Yes | Manual review items |
| venue_tier_history | Yes | Pricing tier change history |

### Schema Issues

- ✅ All parameterized queries (no SQL injection)
- ✅ Optimistic locking with `version` field
- ✅ RLS on 24/26 tables
- ✅ Soft delete with `deleted_at`
- ✅ Full-text search indexes
- ⚠️ `database-helpers.ts:69` - Table name interpolation (see Security section)

---

## 3. SECURITY ANALYSIS

### HMAC Implementation

- **File:** `src/middleware/internal-auth.middleware.ts`
- **Algorithm:** HMAC-SHA256 via `@tickettoken/shared`
- **Matches Standardization:** Yes (Phase B compliant)
- **Replay Protection:** 60-second window
- **Feature Flag:** `USE_NEW_HMAC=true` required

```typescript
const hmacValidator = createHmacValidator({
  secret: INTERNAL_HMAC_SECRET,
  serviceName: 'venue-service',
  replayWindowMs: 60000,
});
```

**Issues:** None - Uses shared library correctly

### SQL Injection Check

- ✅ All service methods use parameterized queries via Knex
- ⚠️ **Medium Risk:** `database-helpers.ts:69,88` - Table name in template literal
  ```typescript
  `SELECT * FROM "${table}" WHERE id = ? ${lockMode}`
  ```
  - **Mitigation:** `table` parameter is always from internal code, never user input
  - **Recommendation:** Add allowlist validation for table names

### Authentication Security

- ✅ JWT verification with RS256
- ✅ Token expiration (`exp`) required
- ✅ Issuer validation
- ✅ Audience validation
- ✅ Rate limiting on auth attempts (10/min per IP)
- ✅ API key hashing with SHA-256
- ✅ Reduced API key cache TTL (60s vs 300s)

### Stripe Security

- ✅ API keys from environment (`STRIPE_SECRET_KEY`)
- ✅ Webhook signature verification via `stripe.webhooks.constructEvent()`
- ✅ API version locked (`2024-11-20.acacia`)
- ✅ Circuit breaker for API calls
- ✅ Idempotency keys for account creation
- ✅ Timeout configured (30s)
- ✅ Max network retries (2)

### Tenant Isolation

- ✅ `tenant_id` validated as UUID format
- ✅ User-tenant association verified against database
- ✅ RLS context set via `set_config('app.current_tenant_id', ...)`
- ✅ Cross-tenant access blocked with logging
- ✅ Dedicated tenant middleware (`tenant.middleware.ts`)

### Encryption

- ✅ AES-256-GCM for credentials (`encryption.ts`)
- ✅ Proper IV/AuthTag handling
- ✅ Key validation (64 hex chars)

### Rate Limiting

- ✅ Global: 100 req/min read, 20 req/min write
- ✅ Auth attempts: 10/min per IP
- ✅ Redis-backed with fail-open

### Critical Vulnerabilities

None identified.

### High Priority Issues

1. **[HIGH]** `database-helpers.ts:69,88` - Table name interpolation could be exploited if function is called with user input. Currently safe but should add validation.

### Medium Priority Issues

1. **[MEDIUM]** HMAC bypass via feature flag - `USE_NEW_HMAC=false` disables all internal auth. Should require explicit disable, not default.

---

## 4. CODE QUALITY

### Dead Code

None significant identified.

### TODO/FIXME Comments (Total: 5)

| File | Line | Comment |
|------|------|---------|
| integration.service.ts | 182 | `TODO: Implement actual Stripe API test call` |
| integration.service.ts | 195 | `TODO: Implement actual Square API test call` |
| integration.service.ts | 240 | `TODO: Implement actual sync logic with external system` |
| venues.controller.ts | 246 | `TODO: Calculate available capacity from active events` |
| ssl-renewal.job.ts | 110 | `TODO: Integrate with Let's Encrypt ACME protocol` |

### `any` Type Usage

- **Total:** 375 occurrences across 70 files
- **Highest in:**
  - `venues.controller.ts`: 30 occurrences
  - `venue-content.controller.ts`: 15 occurrences
  - `verification.service.ts`: 14 occurrences
  - `interfaces.ts`: 14 occurrences

**Impact:** Reduces type safety, makes refactoring harder.

### Error Handling

- ✅ Custom error classes with status codes
- ✅ Global error handler in `error-handler.middleware.ts`
- ✅ Service methods use try-catch
- ✅ Circuit breaker for external calls (Stripe, RabbitMQ)
- ⚠️ Some controller catch blocks return generic 500

### Dependencies

| Package | Current | Notes |
|---------|---------|-------|
| stripe | 20.1.0 | Up to date |
| fastify | 4.24.0 | Current |
| knex | 3.0.1 | Current |
| ioredis | 5.3.2 | Current |
| mongoose | 8.0.3 | Current |
| amqplib | 0.10.9 | Current |

All major dependencies are reasonably current.

---

## 5. SERVICE INTEGRATION

### Inbound Dependencies

| Service | Endpoint | Purpose |
|---------|----------|---------|
| event-service | GET /internal/venues/:id | Validate venue for event creation |
| ticket-service | GET /internal/venues/:id/validate-ticket/:ticketId | Ticket validation |
| payment-service | GET /internal/venues/:id/bank-info | Payout information |
| payment-service | GET /internal/venues/:id/chargeback-rate | Reserve calculation |
| compliance-service | GET /internal/venues/:id | Venue compliance checks |
| blockchain-service | GET /internal/venues/:id | Wallet address lookup |

### Outbound Dependencies

| Service | Endpoint | Implementation |
|---------|----------|----------------|
| RabbitMQ | venue-events exchange | Circuit breaker + retry queue |
| Stripe Connect | accounts, accountLinks | Circuit breaker + idempotency |
| search.sync | (via shared lib) | Event publishing |

### RabbitMQ Events

**Published:**
- `venue.created` - When venue is created
- `venue.updated` - When venue is modified
- `venue.deleted` - When venue is soft-deleted

**Search Sync:**
- `venue.created` - Add to search index
- `venue.updated` - Update search index
- `venue.deleted` - Remove from search index

**Consumed:** None (venue-service is a producer only)

### External Services

| Service | Purpose | Security |
|---------|---------|----------|
| Stripe Connect | Venue payouts | Webhook signature, circuit breaker |
| Stripe Identity | Document verification | Webhook signature |
| Plaid | Bank account verification | Webhook signature |

---

## 6. APPLICATION SETUP

### Fastify Configuration

```typescript
{
  logger: { level: process.env.LOG_LEVEL || 'info' },
  requestIdHeader: 'x-request-id',
  trustProxy: [private ranges], // Configurable via TRUSTED_PROXIES
  bodyLimit: 10485760, // 10MB
  requestTimeout: 30000 // 30s
}
```

### Plugins (in order)

1. `@fastify/cors` - CORS handling
2. `@fastify/helmet` - Security headers
3. `@fastify/jwt` - JWT authentication
4. `@fastify/rate-limit` - Rate limiting
5. `@fastify/swagger` - API documentation
6. `@fastify/swagger-ui` - Swagger UI
7. Custom raw body parser (for Stripe webhooks)

### Error Handler

- Custom handler in `error-handler.middleware.ts`
- Maps custom errors to HTTP status codes
- Structured JSON response format
- Logs errors with correlation IDs

### Graceful Shutdown

```typescript
fastify.addHook('onClose', async () => {
  stopScheduledJobs();
  await eventPublisher.close();
  await closeRedisConnections();
  await db.destroy();
});
```

### Required Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| DB_HOST | PostgreSQL host | Yes |
| DB_PASSWORD | PostgreSQL password | Yes |
| REDIS_HOST | Redis host | Yes |
| RABBITMQ_URL | RabbitMQ connection | Yes |
| JWT_SECRET | JWT signing | Yes |
| STRIPE_SECRET_KEY | Stripe API | Yes (for payments) |
| STRIPE_WEBHOOK_SECRET_VENUE | Webhook verification | Yes (for webhooks) |
| INTERNAL_HMAC_SECRET | S2S authentication | Yes |
| USE_NEW_HMAC | Enable HMAC auth | Recommended |
| CREDENTIALS_ENCRYPTION_KEY | AES key (64 hex) | Yes (for integrations) |

### Issues

- ⚠️ `USE_NEW_HMAC` defaults to `false` - internal auth disabled by default

---

## 7. BACKGROUND JOBS

### Jobs Defined

#### webhook-cleanup.job.ts
- **Purpose:** Clean up processed webhook events older than 30 days
- **Schedule:** Daily at 3 AM (`0 3 * * *`)
- **Error Handling:** Logs errors, continues on failure
- **Issues:** None

#### cache-warming.job.ts
- **Purpose:** Pre-warm venue cache for popular venues
- **Schedule:** Hourly at :05 (`5 * * * *`)
- **Error Handling:** Logs errors, continues
- **Issues:** None

#### compliance-review.job.ts
- **Purpose:** Process pending compliance reviews, schedule next review (+90 days)
- **Schedule:** Daily at 2 AM (`0 2 * * *`)
- **Error Handling:** Updates review status to 'failed' with error message
- **Issues:** None

#### content-cleanup.job.ts
- **Purpose:** Clean up orphaned MongoDB content
- **Schedule:** Daily at 4 AM (`0 4 * * *`)
- **Error Handling:** Logs errors
- **TTL Index:** Verified at startup

#### ssl-renewal.job.ts
- **Purpose:** Check and renew SSL certificates for custom domains
- **Schedule:** Daily at 5 AM (`0 5 * * *`)
- **Error Handling:** Logs errors
- **Issues:** TODO - Let's Encrypt ACME integration not implemented

### Job Health Endpoint

`/health` includes job status:
```json
{
  "jobs": {
    "initialized": true,
    "jobs": ["webhookCleanup", "cacheWarming", ...]
  }
}
```

---

## 8. STRIPE INTEGRATION

### Webhook Handling

- **Signature Verification:** Yes (`stripe.webhooks.constructEvent`)
- **Idempotency:** Yes (via `venue_webhook_events` table)
- **Error Handling:** Logged, returns 200 for processed events
- **Supported Events:**
  - `account.updated` - Sync Connect status

```typescript
// From webhooks.routes.ts
const event = stripe.webhooks.constructEvent(
  request.rawBody,
  signature,
  webhookSecret
);
```

### Connect Onboarding

- **OAuth Flow:** Express accounts (not Standard)
- **Account Linking:** Stores `stripe_connect_account_id` on venue
- **Idempotency:** Uses `idempotencyKey` for account creation
- **Circuit Breaker:** 5 failures, 30s reset timeout

```typescript
// From venue-stripe-onboarding.service.ts
const account = await stripeCircuitBreaker.execute(
  () => this.stripe.accounts.create({...}, { idempotencyKey }),
  'accounts.create'
);
```

### Security

- ✅ API version locked to prevent breaking changes
- ✅ Timeout configured (30s)
- ✅ Max retries (2)
- ✅ Tenant validation before operations
- ✅ Circuit breaker prevents cascade failures

### Critical Issues

None identified.

---

## 9. TEST COVERAGE

### Test Files

- **Unit Tests:** 65 files in `tests/unit/`
- **Integration Tests:** 25 files in `tests/integration/`
- **E2E Tests:** Directory exists
- **Contract Tests:** Directory exists
- **Security Tests:** Directory exists
- **Chaos Tests:** Directory exists
- **Load Tests:** k6 scripts present

### Skipped Tests

No `.skip` or `test.only` found.

### Coverage Gaps

- SSL renewal job (ACME not implemented)
- Integration sync logic (TODO in code)
- Capacity calculation from events (TODO in code)

---

## 10. TYPE SAFETY

### Schema Validation

- **Framework:** Joi
- **Coverage:** All public endpoints validated
- **Strictness:** `.unknown(false)` rejects extra fields

```typescript
// Example from venue.schema.ts
export const createVenueSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().max(255).required(),
    // ... comprehensive validation
  }).unknown(false)
};
```

### `any` Type Usage

- **Total:** 375 occurrences
- **Worst Files:**
  - venues.controller.ts (30)
  - venue-content.controller.ts (15)
  - verification.service.ts (14)

### Route Types

- **File:** `src/types/routes.ts`
- **Coverage:** Partial - some endpoints use `any`

### Issues

- ⚠️ High `any` usage reduces type safety
- ⚠️ Controller parameters often typed as `any`

---

## FINAL SUMMARY

### CRITICAL ISSUES (Must Fix)

None identified.

### HIGH PRIORITY (Should Fix)

1. **Table name validation** - `database-helpers.ts:69,88` - Add allowlist for table names to prevent potential SQL injection if function misused.

2. **HMAC default** - `internal-auth.middleware.ts:23` - `USE_NEW_HMAC` defaults to false, meaning internal auth is disabled by default. Should require explicit disable.

### MEDIUM PRIORITY

1. **`any` type cleanup** - 375 occurrences reduce type safety. Priority files:
   - venues.controller.ts
   - venue-content.controller.ts
   - verification.service.ts

2. **Incomplete TODOs:**
   - SSL renewal ACME integration (ssl-renewal.job.ts:110)
   - Capacity calculation from events (venues.controller.ts:246)
   - Integration sync logic (integration.service.ts:240)

3. **Test coverage** - Add tests for:
   - SSL renewal job
   - Stripe webhook edge cases
   - Cross-tenant access attempts

### TECHNICAL DEBT

1. **`any` type usage** - 375 occurrences
2. **TODO comments** - 5 incomplete features
3. **Generic error handling** - Some controllers return generic 500 instead of specific errors

### BUSINESS CAPABILITIES SUMMARY

**venue-service enables:**
- Complete venue lifecycle management
- Staff role management with permissions
- Stripe Connect payment onboarding
- Multi-tenant data isolation
- Compliance tracking and reporting
- White-label branding and custom domains
- Integration with external payment systems

**If venue-service goes down:**
- No new venues can be created
- Venue updates and settings changes fail
- Staff management unavailable
- Stripe Connect onboarding broken
- Event creation blocked (depends on venue validation)
- Ticket validation for venues fails
- Payment service cannot get bank info for payouts

### COMPARISON TO AUTH-SERVICE

| Area | Venue | Auth | Notes |
|------|-------|------|-------|
| HMAC Implementation | ✅ | ✅ | Both use shared library |
| Tenant Isolation | ✅ | ✅ | Both have dedicated middleware |
| SQL Injection | ⚠️ | ✅ | Venue has table interpolation |
| Error Handling | ✅ | ✅ | Both have custom error classes |
| Test Coverage | 90 files | Similar | Both well-tested |
| Type Safety | ⚠️ | ⚠️ | Both have `any` usage |
| Rate Limiting | ✅ | ✅ | Both Redis-backed |
| Circuit Breakers | ✅ | ✅ | Both for external calls |

**Better than auth-service in:**
- Stripe integration (circuit breaker, idempotency)
- Background jobs (5 scheduled tasks)
- Content management (MongoDB integration)

**Worse than auth-service in:**
- `any` type usage (375 vs ~200)
- Table name validation

**Similar quality:**
- HMAC authentication
- Tenant isolation
- Error handling
- Test coverage

---

**Files Analyzed:** 85+
**Critical Issues:** 0
**High Priority Issues:** 2
**Medium Issues:** 3
**Code Quality:** Good

---

*Report generated by Claude Code audit process*
