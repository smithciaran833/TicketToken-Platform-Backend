# Marketplace Service - Code Issues & Concerns

> **Generated**: January 2025
> **Service**: marketplace-service
> **Status**: Issues Identified During Test Plan Review
> **Last Reviewed**: January 2026

---

## Review Summary

| Category | Total | Fixed | Remaining | To Review |
|----------|-------|-------|-----------|-----------|
| Critical Issues | 5 | 5 | 0 | 0 |
| High Priority | 6 | 6 | 0 | 0 |
| Medium Priority | 9 | 6 | 1 | 2 |
| Low Priority | 10 | 4 | 0 | 6 |
| Security Concerns | 3 | 3 | 0 | 0 |
| Architectural | 4 | 0 | 0 | 4 |
| Testing Concerns | 3 | 0 | 0 | 3 |

> **January 2026 Update**: Fixed/Reviewed 11 issues (#8, #13, #19, #21, #22, #25, #30, #31, #32, #33 + review findings)

---

## Critical Issues

### 1. ✅ FIXED - Fee Calculation - Potential Rounding Errors

**Location**: `src/services/fee.service.ts`, `src/services/fee-distribution.service.ts`

**Issue**: The code uses `percentOfCents` utility but I didn't see validation that `platform_fee + venue_fee + seller_proceeds === sale_price`. Without explicit sum validation, rounding errors could cause cents to be lost or duplicated.

**Status**: ✅ **FIXED** - `fee.service.ts` now includes:
- `AUDIT FIX PAY-1`: Validates payment split sums correctly (lines 105-115)
- `AUDIT FIX PAY-H1`: Ensures no negative payouts (lines 117-125)

**Note**: `fee-distribution.service.ts` has potential inconsistent logic where total adds fees but sellerReceives subtracts from listing price - may need review for business logic correctness.

---

### 2. ✅ FIXED - Hardcoded Default Tenant ID

**Location**: `src/migrations/001_baseline_marketplace.ts`

**Issue**: All tables were defaulting tenant_id to `'00000000-0000-0000-0000-000000000001'`.

**Status**: ✅ **FIXED** - Removed `.defaultTo()` from all 11 tables:
- All `tenant_id` columns now require explicit value on insert
- Inserts without tenant_id will fail rather than silently routing to default tenant
- RLS policies remain in place as additional safeguard
- Added header comment explaining the design decision

**Fix Applied**: Removed `.defaultTo('00000000-0000-0000-0000-000000000001')` from all tenant_id definitions in migration.

---

### 3. ✅ FIXED - Stub/Incomplete Controller Implementations

**Location**: `src/controllers/venue-settings.controller.ts`

**Issue**: Controller methods were stubs that didn't actually do anything.

**Status**: ✅ **FIXED** - All 4 methods now fully implemented:
- `getSettings`: Queries `venue_marketplace_settings` table, returns all settings with proper field mapping
- `updateSettings`: Validates all input fields with bounds checking, updates database
- `getVenueListings`: Queries `marketplace_listings` with pagination support
- `getSalesReport`: Aggregates data from `marketplace_transfers` and `platform_fees` with daily breakdown

**Fix Applied**: Complete rewrite with database queries, validation, and pagination.

---

### 4. ✅ FIXED - Missing Await on Async Calls

**Location**: `src/jobs/listing-expiration.ts`

**Issue**: `notifySellerOfExpiration` is called without await in some paths, meaning notification failures won't be caught.

**Status**: ✅ **FIXED** - Now properly uses `await` with try-catch error handling (lines 165-172).

---

### 5. ✅ FIXED - Inconsistent Price Storage

**Location**: `src/seeds/test-data.ts`, `src/seeds/marketplace-test-data.ts`

**Issue**: Seeds were storing prices as decimals (e.g., `150.00`, `200.00`) but the schema and validation enforce INTEGER CENTS.

**Status**: ✅ **FIXED** - Seed file now correctly stores prices as INTEGER CENTS:
```typescript
price: 20000,  // INTEGER CENTS ($200.00)
original_face_value: 15000,  // INTEGER CENTS ($150.00)
```

**Fix Applied**: All prices in `test-data.ts` converted to INTEGER CENTS (multiplied by 100).

---

## High Priority Issues

### 6. ✅ FIXED - Race Condition in Webhook Idempotency

**Location**: `src/controllers/webhook.controller.ts`

**Issue**: The idempotency check and mark were not atomic.

**Status**: ✅ **FIXED** - Implemented atomic idempotency using Redis SETNX:
- `tryAcquireEventLock()`: Uses `cache.setNX()` for atomic set-if-not-exists with TTL
- Single atomic operation replaces check-then-set pattern
- Returns false if event already being processed

**Fix Applied**: Complete rewrite of idempotency logic to use atomic Redis SETNX.

---

### 7. ✅ FIXED - Memory Fallback for Idempotency

**Location**: `src/controllers/webhook.controller.ts`

**Issue**: When Redis is unavailable, idempotency fell back to in-memory storage.

**Status**: ✅ **FIXED** - Removed memory fallback, now fails OPEN with loud logging:
- If Redis fails, allows processing but logs `ERROR` level alert
- No in-memory Map fallback that would fail in distributed environment
- Added `releaseEventLock()` method to allow retry on processing failure

**Fix Applied**: Removed memory fallback, added fail-open with prominent logging.

---

### 8. ✅ FIXED - Circuit Breaker State Not Persisted

**Location**: `src/utils/circuit-breaker.ts`

**Issue**: Circuit breaker state is in-memory only (`Map<string, CircuitBreakerState>`). If service restarts, circuit resets even if external service is still down.

**Status**: ✅ **FIXED** (January 2026) - Added Redis persistence for circuit breaker state:
- `localCircuits`: In-memory cache for fast reads
- `saveCircuitToRedis()`: Persists state to Redis with 1-hour TTL
- `loadCircuitFromRedis()`: Loads state on service startup
- `initCircuitFromRedis()`: Initializes circuit from Redis on first access
- Graceful fallback to local cache if Redis unavailable

**Fix Applied**: Circuit state now synced to Redis with key prefix `marketplace:circuit:`.

---

### 9. ✅ FIXED - No Transaction Rollback on Partial Failure

**Location**: `src/controllers/listings.controller.ts`

**Issue**: `createListing` does multiple operations without transaction.

**Status**: ✅ **FIXED** - Now uses proper database transactions with `db.transaction()`. Both listing insert and outbox write are wrapped in same transaction with proper rollback handling.

---

### 10. ✅ FIXED - Unvalidated Venue Royalty Wallet

**Location**: `src/seeds/test-data.ts`

**Issue**: Royalty wallet addresses in seeds were invalid (too short, invalid characters).

**Status**: ✅ **FIXED** - All wallet addresses now use valid Solana devnet address format:
```typescript
royalty_wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsM8zD76aHvf3'
wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsM8zD76aHvf3'
```

**Fix Applied**: Updated all wallet addresses in `test-data.ts` to valid 44-character base58 Solana addresses.

---

### 11. 🔍 TO REVIEW - No Index on stripe_payment_intent_id Lookup

**Location**: `src/migrations/001_baseline_marketplace.ts`

**Issue**: The webhook lookup pattern may not use the index efficiently if querying by payment_intent_id alone without tenant_id.

**Status**: Index exists (`idx_marketplace_transfers_stripe_payment_intent`) but usage pattern needs verification.

---

## Medium Priority Issues

### 12. 🔍 TO REVIEW - Inconsistent Error Handling in Event Bus

**Location**: `src/events/event-bus.ts`

**Issue**: Some errors are caught and logged, others are re-thrown. Inconsistent behavior.

---

### 13. ✅ FIXED - DLQ Entry Retention Not Enforced

**Location**: `src/events/event-bus.ts`

**Issue**: `DLQ_RETENTION_HOURS` is defined as 168 (7 days) but no cleanup job.

**Status**: ✅ **FIXED** (January 2026) - Added DLQ cleanup scheduler:
- `cleanupExpiredDLQEntries()`: Removes expired entries from sorted set
- `startDLQCleanupScheduler()`: Runs cleanup every hour (configurable)
- `stopDLQCleanupScheduler()`: Graceful shutdown
- Removes entries where data has expired (via Redis TTL)
- Also removes entries older than retention period from sorted set
- Exported on `eventBus.dlq` interface

**Fix Applied**: Added cleanup functions and scheduler to event-bus.ts.

---

### 14. ✅ FIXED - Hardcoded Limits in Admin Controller

**Location**: `src/controllers/admin.controller.ts`

**Issue**: Hard-coded limit of 50 for queries with no pagination.

**Status**: ✅ **FIXED** - Added full pagination support:
- `parsePagination()`: Helper method validates and parses limit/offset from query params
- `getDisputes`: Now returns `{ data, pagination: { total, limit, offset, hasMore } }`
- `getFlaggedUsers`: Now returns pagination metadata with total count
- Limits: min 1, max 200 (configurable via `MAX_LIMIT`)

**Fix Applied**: Added pagination support with count queries and response metadata.

---

### 15. ✅ FIXED - No Validation on Ban Duration

**Location**: `src/controllers/admin.controller.ts`

**Issue**: `banUser` accepted a `duration` parameter without validating it's positive or within reasonable bounds.

**Status**: ✅ **FIXED** - Added comprehensive validation:
- `MIN_BAN_DURATION_DAYS`: 1 day minimum
- `MAX_BAN_DURATION_DAYS`: 3650 days (10 years) maximum
- Type validation: must be a finite number
- Returns 400 error with specific message if validation fails
- Null/undefined duration = permanent ban (preserved behavior)

**Fix Applied**: Added bounds checking and type validation for ban duration.

---

### 16. ⚠️ OPEN - Search Controller Returns Hardcoded Data

**Location**: `src/controllers/search.controller.ts`

**Issue**: `getPriceRange` and `getCategories` return hardcoded values.

**Status**: ⚠️ **CONFIRMED** - Multiple methods return static data:
- `getPriceRange`: `{ min: 50, max: 500, average: 150, median: 125 }`
- `getCategories`: Hardcoded array with static counts
- `getRecommended` / `getWatchlist`: Return empty arrays

---

### 17. 🔍 TO REVIEW - Missing Environment Variable Validation

**Location**: `src/config/` files

**Issue**: Many env vars are parsed without validation.

---

### 18. ✅ FIXED - Retry Logic Without Jitter

**Location**: `src/utils/circuit-breaker.ts`

**Issue**: Exponential backoff was implemented but no jitter was being added.

**Status**: ✅ **FIXED** - Added configurable jitter to prevent thundering herd:
- `jitterFactor`: New config option (default 0.2 = 20% jitter)
- `calculateDelayWithJitter()`: New helper function applies randomized jitter
- Formula: `delay ± (delay * jitterFactor * random)`
- Creates uniform distribution around base delay

**Fix Applied**: Added jitter calculation with configurable factor in `withRetry()` function.

---

### 19. ✅ ALREADY FIXED - Health Check Timeout Properly Enforced

**Location**: `src/routes/health.routes.ts`

**Issue**: `HEALTH_CHECK_TIMEOUT` defined but individual checks may not respect it.

**Status**: ✅ **ALREADY FIXED** - Timeout is properly enforced:
- `checkDatabase()`: Uses `Promise.race()` with timeout
- `checkRedis()`: Uses `Promise.race()` with timeout  
- `checkExternalService()`: Uses `AbortController` with `setTimeout()`
- All checks properly timeout after `HEALTH_CHECK_TIMEOUT` ms (default 5000)

---

### 20. 🔍 TO REVIEW - No Rate Limit on Webhook Endpoints

**Location**: `src/routes/webhook.routes.ts`

**Issue**: Webhook routes skip auth but don't have rate limiting.

---

## Low Priority Issues (Not Yet Reviewed)

### 21. ✅ FIXED - Console.log in Migration

**Location**: `src/migrations/001_baseline_marketplace.ts`

**Issue**: Uses `console.log` instead of structured logger.

**Status**: ✅ **FIXED** (January 2026) - Added migration logger:
- `migrationLog.info()`: Logs via structured logger when available
- `migrationLog.error()`: Logs errors with error object
- Graceful fallback to console if logger not available (CLI context)
- All 19 `console.log` calls replaced with `migrationLog.info()`
- ESLint disable comments added for fallback console usage

### 22. ✅ FIXED - Duplicate BASE58_REGEX Definition

**Location**: `src/schemas/validation.ts`, `src/schemas/wallet.schema.ts`

**Status**: ✅ **FIXED** (January 2026) - Removed duplicate definition:
- `wallet.schema.ts`: Now exports `BASE58_REGEX`, `SOLANA_MIN_LENGTH`, `SOLANA_MAX_LENGTH`
- `validation.ts`: Now imports these constants from `wallet.schema.ts`
- Single source of truth for Solana address validation constants

### 23. 🔍 TO REVIEW - Magic Numbers

**Location**: Various files

### 24. 🔍 TO REVIEW - Unused Imports Likely

**Location**: Various files

### 25. ✅ ALREADY FIXED - Input Sanitization for Logs

**Location**: `src/middleware/request-logger.ts`

**Status**: ✅ **ALREADY FIXED** - Comprehensive sanitization in place:
- `redactHeaders()`: Redacts authorization, cookie, api-key, auth-token, etc.
- `redactBody()`: Redacts password, token, cardNumber, cvv, ssn, etc.
- `REDACTED_HEADERS` and `REDACTED_BODY_FIELDS` constants define sensitive fields
- Recursive depth limit (5) prevents infinite loops
- All request/response logs use sanitized data

### 26. 🔍 TO REVIEW - Inconsistent Null vs Undefined Handling

**Location**: Various service files

### 27. 🔍 TO REVIEW - No Connection Pool Limits in Seeds

**Location**: `src/seeds/*.ts`

### 28. 🔍 TO REVIEW - Event Bus Singleton Pattern Issues

**Location**: `src/events/event-bus.ts`

### 29. 🔍 TO REVIEW - Missing TypeScript Strict Checks

**Location**: Inferred from code patterns

### 30. ✅ ALREADY FIXED - Outbox Pattern Properly Implemented

**Location**: `src/controllers/listings.controller.ts`

**Status**: ✅ **ALREADY FIXED** - Transactional outbox pattern is correct:
- `createListing()`: Uses `db.transaction()` with proper rollback
- Writes to `outbox` table with topic and payload in same transaction
- `cancelListing()`: Also uses transaction with outbox write
- Topics: `marketplace.listing.created`, `marketplace.listing.cancelled`
- Proper rollback on any failure within transaction

**Note**: Outbox processor/worker may be separate concern for consuming outbox entries.

---

## Security Concerns

### 31. ✅ FIXED - CORS Origin from Environment Without Validation

**Location**: `src/app.ts`

**Status**: ✅ **FIXED** (January 2026) - Added comprehensive CORS validation:
- `getValidatedCorsOrigins()`: Validates all CORS origins before use
- URL format validation using `new URL()`
- Only allows http/https protocols
- Rejects wildcard (*) in production
- Logs warnings for invalid origins
- Returns `false` (disabled CORS) if no valid origins configured

### 32. ✅ FIXED - JWT Secret Fallback Insecure

**Location**: `src/config/index.ts`

**Status**: ✅ **FIXED** (January 2026) - Removed insecure default:
- `getJwtSecret()`: New function validates JWT_SECRET properly
- **Production**: Throws error if missing (no fallback)
- **Development**: Generates random 32-byte secret with warning
- Warns if secret is < 32 characters (weak)
- No more known default key (`'default-secret-key'` removed)

### 33. ✅ FIXED - Internal Service Header Easily Spoofed

**Location**: `src/routes/webhook.routes.ts`

**Status**: ✅ **FIXED** (January 2026) - Added HMAC signature verification:
- `verifyInternalWebhookSignature()`: Validates HMAC-SHA256 signature
- Requires `x-internal-signature` header with hex signature
- Requires `x-internal-timestamp` header (prevents replay attacks, 5-min window)
- Uses `INTERNAL_WEBHOOK_SECRET` env var for shared secret
- Uses timing-safe comparison to prevent timing attacks
- Graceful degradation in dev mode with loud warning
- **Production**: Requires valid signature (no bypass)

---

## Architectural Concerns (Not Yet Reviewed)

### 34. 🔍 TO REVIEW - Mixed Responsibility in Controllers

**Location**: `src/controllers/buy.controller.ts`

### 35. 🔍 TO REVIEW - No Repository Layer

**Location**: `src/models/`

### 36. 🔍 TO REVIEW - Circular Dependency Risk

**Location**: Service files

### 37. 🔍 TO REVIEW - No API Versioning Strategy

**Location**: `src/app.ts`

---

## Testing Concerns (Not Yet Reviewed)

### 38. 🔍 TO REVIEW - Seeds Use Real Password Hashing

**Location**: `src/seeds/test-data.ts` - bcrypt with cost 10 is slow for tests.

### 39. 🔍 TO REVIEW - No Test Database Isolation

**Location**: Seed files

### 40. 🔍 TO REVIEW - Integration Tests Need Real Services

**Location**: Inferred

---

## Priority Remediation Plan

### Immediate (Critical - Week 1)
1. ⚠️ **#2**: Remove default tenant_id from migrations, require explicit tenant_id
2. ⚠️ **#3**: Implement venue-settings controller methods
3. ⚠️ **#5**: Fix seed data to use INTEGER CENTS (multiply by 100)

### Short-Term (High Priority - Week 2)
1. ⚠️ **#6**: Implement atomic webhook idempotency with Redis SETNX
2. ⚠️ **#7**: Consider removing memory fallback or implementing distributed lock
3. ⚠️ **#8**: Persist circuit breaker state to Redis
4. ⚠️ **#10**: Fix wallet addresses in seeds to valid Solana format

### Medium-Term (Medium Priority - Week 3-4)
1. ⚠️ **#14**: Add pagination to admin queries
2. ⚠️ **#15**: Add duration validation to banUser
3. ⚠️ **#16**: Implement real database queries for search endpoints
4. ⚠️ **#18**: Add jitter to retry logic
