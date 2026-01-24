# EVENT-SERVICE SECURITY FIX SUMMARY

**Date:** 2026-01-23
**Service:** event-service
**Auditor:** Claude Opus 4.5

---

## 1. EXECUTIVE SUMMARY

### What Was Broken

Event-service had **critical data leakage vulnerabilities** where sensitive internal data was being exposed through public API responses:

1. **Blockchain Wallet Addresses**: `mint_authority`, `artist_wallet`, `event_pda` were exposed
2. **Business Intelligence**: Artist/venue royalty percentages revealed pricing strategy
3. **Pricing Algorithms**: `price_adjustment_rules` exposed proprietary pricing logic
4. **Service Boundary Violation**: Direct database query to `tickets` table owned by ticket-service
5. **Missing Token Revocation**: Compromised tokens could not be invalidated

### What We Fixed

| Category | Before | After |
|----------|--------|-------|
| Data Leakage | Full DB rows returned | Serializers strip 36+ sensitive fields |
| Service Boundaries | Direct `db('tickets')` | HTTP call to ticket-service |
| Token Security | No revocation check | Auth-service revocation validation |
| Logging | `console.log` statements | Winston structured logging |
| Documentation | Bare TODOs | Comprehensive TODO documentation |

### Impact

- **Security**: Eliminated data leakage of blockchain wallets and business secrets
- **Architecture**: Restored proper microservices boundaries
- **Observability**: Structured logs enable proper monitoring
- **Maintainability**: Clear documentation for incomplete features

---

## 2. COMPLETE ISSUE LIST

### CRITICAL (1 Issue)

#### Issue #1: Service Boundary Violation - Direct Tickets Table Query

**File:** `src/routes/internal.routes.ts:223`

**Before:**
```typescript
const ticketStats = await db('tickets')
  .where('event_id', eventId)
  .whereNull('deleted_at')
  .select(/* aggregations */)
  .first();
```

**After:**
```typescript
const ticketStatsFromService = await getTicketStatsFromTicketService(
  eventId,
  tenantId,
  traceId
);
```

**Why It Matters:**
- Violates microservices architecture
- Schema changes in tickets table would break event-service
- RLS policies may not apply correctly

---

### HIGH PRIORITY (3 Issues)

#### Issue #2: Data Leakage - No Response Serialization

**Files:** All controllers (events, pricing, capacity, schedule)

**Before:**
```typescript
return reply.send({ event }); // Full DB row with all fields
```

**After:**
```typescript
return reply.send({ event: serializeEvent(event) }); // Only safe fields
```

**Protected Fields by Entity:**

| Entity | Forbidden Fields |
|--------|-----------------|
| Event | mint_authority, artist_wallet, event_pda, collection_address, artist_percentage, venue_percentage, royalty_percentage, blockchain_status, streaming_config, created_by, updated_by, version, deleted_at, status_reason, status_changed_by, status_changed_at, metadata |
| Pricing | price_adjustment_rules, created_by, updated_by, version, deleted_at |
| Capacity | locked_price_data, seat_map, row_config, reserved_at, reserved_expires_at, created_by, updated_by, version, deleted_at |
| Schedule | metadata, status_reason, created_by, updated_by, version, deleted_at |

---

#### Issue #3: Missing Token Revocation Check

**File:** `src/middleware/auth.ts:277`

**Before:**
```typescript
// TODO Phase 2: Token Revocation Check
```

**After:**
```typescript
async function checkTokenRevocation(jti: string): Promise<boolean> {
  try {
    const response = await axios.get(
      `${AUTH_SERVICE_URL}/internal/token-status/${jti}`,
      {
        headers: {
          'x-internal-service': 'event-service',
          'x-service-name': 'event-service',
        },
        timeout: 2000,
      }
    );
    return response.data.revoked === true;
  } catch (error) {
    // Fail open to prevent cascading failures
    logger.warn({ jti, error: error.message }, 'Token revocation check failed');
    return false;
  }
}

// In authentication flow:
if (decoded.jti) {
  const isRevoked = await checkTokenRevocation(decoded.jti);
  if (isRevoked) {
    throw new UnauthorizedError('Token has been revoked');
  }
}
```

---

#### Issue #4: console.log Usage Instead of Logger

**Files:**
- `src/middleware/auth.ts` (6 locations)
- `src/middleware/tenant.ts` (1 location)
- `src/config/secrets.ts` (7 locations)

**Before:**
```typescript
console.log('✓ Event Service: JWT public key loaded');
console.error('✗ Event Service: Failed to load JWT public key:', error);
```

**After:**
```typescript
logger.info({ path: publicKeyPath }, 'JWT public key loaded for token verification');
logger.error({ error: error.message, path: publicKeyPath }, 'Failed to load JWT public key');
```

---

### MEDIUM PRIORITY (3 Issues)

#### Issue #5: Incomplete Event Cancellation TODOs

**File:** `src/services/event-cancellation.service.ts`

**Locations:** Lines 371, 387, 432, 451, 464

Each TODO now has comprehensive documentation:
```typescript
/**
 * TODO: Replace with actual ticket-service HTTP client call
 *
 * WHAT: [Detailed explanation]
 * WHY NOT DONE: [Dependencies and blockers]
 * IMPACT: [Current consequences]
 * DEPENDENCIES: [Required services/features]
 * EFFORT: [Estimated hours]
 * PRIORITY: [LOW/MEDIUM/HIGH]
 */
```

---

#### Issue #6: Missing OpenAPI Documentation

**File:** `src/routes/internal.routes.ts`

Added `@openapi` JSDoc comments to 3 internal endpoints:
- `GET /internal/events/:eventId`
- `GET /internal/events/:eventId/pda`
- `GET /internal/events/:eventId/scan-stats`

---

#### Issue #7: Notification Controller Placeholder

**File:** `src/controllers/notification.controller.ts`

Added comprehensive architectural documentation explaining:
- Why this is a placeholder
- How notifications are actually handled (RabbitMQ)
- Future options for this controller

---

## 3. SERIALIZER PATTERN EXPLANATION

### Defense-in-Depth Approach

The serialization layer provides **multiple levels of protection**:

1. **Field Whitelisting**: Only explicitly listed fields are included
2. **Forbidden Field Detection**: Utility functions to detect leakage
3. **Type Safety**: TypeScript interfaces for safe response types
4. **Case Conversion**: snake_case (DB) to camelCase (API)

### Code Example

```typescript
// src/serializers/event.serializer.ts

// Whitelist of safe fields
export const SAFE_EVENT_FIELDS = [
  'id', 'tenant_id', 'venue_id', 'name', 'status', 'created_at', 'updated_at',
  // ... 48 fields total
] as const;

// Blacklist of forbidden fields
export const FORBIDDEN_EVENT_FIELDS = [
  'mint_authority', 'artist_wallet', 'event_pda', 'artist_percentage',
  // ... 17 fields total
] as const;

// Serialization function
export function serializeEvent(event: Record<string, any>): SafeEvent {
  if (!event) {
    throw new Error('Cannot serialize null or undefined event');
  }

  return {
    id: event.id,
    tenantId: event.tenant_id,  // Case conversion
    venueId: event.venue_id,
    name: event.name,
    // ... only safe fields included
  };
}

// Detection utility
export function findForbiddenEventFields(obj: Record<string, any>): string[] {
  const forbiddenSet = new Set([...FORBIDDEN_EVENT_FIELDS, ...FORBIDDEN_EVENT_FIELDS_CAMEL]);
  return Object.keys(obj).filter(key => forbiddenSet.has(key));
}
```

### Controller Usage

```typescript
// Before (DANGEROUS)
const event = await eventService.getEvent(eventId);
return reply.send({ event }); // Leaks ALL fields

// After (SAFE)
import { serializeEvent } from '../serializers';
const event = await eventService.getEvent(eventId);
return reply.send({ event: serializeEvent(event) }); // Only safe fields
```

---

## 4. PROTECTED FIELDS REFERENCE

### Event Entity (17 Forbidden Fields)

| Field | Why Protected |
|-------|---------------|
| `mint_authority` | Blockchain private key reference |
| `artist_wallet` | Solana wallet address - target for attacks |
| `event_pda` | Program Derived Address - blockchain internal |
| `collection_address` | NFT collection - internal reference |
| `artist_percentage` | Revenue split - business confidential |
| `venue_percentage` | Revenue split - business confidential |
| `royalty_percentage` | Resale royalty - business strategy |
| `blockchain_status` | Internal sync status |
| `streaming_config` | May contain API keys |
| `created_by` | Internal user ID |
| `updated_by` | Internal user ID |
| `version` | Optimistic locking - internal |
| `deleted_at` | Soft delete marker |
| `status_reason` | Internal approval notes |
| `status_changed_by` | Internal admin ID |
| `status_changed_at` | Internal audit |
| `metadata` | May contain sensitive internal data |

### Pricing Entity (5 Forbidden Fields)

| Field | Why Protected |
|-------|---------------|
| `price_adjustment_rules` | Proprietary pricing algorithm |
| `created_by` | Internal user ID |
| `updated_by` | Internal user ID |
| `version` | Optimistic locking |
| `deleted_at` | Soft delete marker |

### Capacity Entity (8 Forbidden Fields)

| Field | Why Protected |
|-------|---------------|
| `locked_price_data` | Price locking internals |
| `seat_map` | Venue layout - may be proprietary |
| `row_config` | Seating configuration |
| `reserved_at` | Reservation timing |
| `reserved_expires_at` | Expiration timing |
| `created_by` | Internal user ID |
| `updated_by` | Internal user ID |
| `version` | Optimistic locking |

### Schedule Entity (6 Forbidden Fields)

| Field | Why Protected |
|-------|---------------|
| `metadata` | Internal operational data |
| `status_reason` | Internal notes |
| `created_by` | Internal user ID |
| `updated_by` | Internal user ID |
| `version` | Optimistic locking |
| `deleted_at` | Soft delete marker |

---

## 5. VERIFICATION GUIDE

### How to Verify Fixes Work

```bash
# 1. Run TypeScript check (pre-existing errors unrelated to fixes are OK)
npx tsc --noEmit

# 2. Run serializer tests (should be 91 passing)
npm test -- tests/unit/serializers/

# 3. Verify no console.log in middleware
grep -r "console\." src/middleware/ | grep -v "// console" | wc -l
# Expected: 0

# 4. Verify serializers are used in controllers
grep -r "serializeEvent\|serializePricing\|serializeCapacity\|serializeSchedule" src/controllers/
# Should show multiple matches in each controller

# 5. Verify token revocation check exists
grep -r "checkTokenRevocation" src/middleware/auth.ts
# Should show function definition and usage
```

### Manual API Verification

```bash
# Test that forbidden fields are NOT in response
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/events/123 | jq 'has("mint_authority")'
# Expected: false

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/events/123 | jq 'has("artist_percentage")'
# Expected: false
```

---

## 6. REPLICATION CHECKLIST

### Pattern for Other Services

If you need to add serialization to another service, follow these steps:

#### Step 1: Create Serializer File

```bash
# Create serializers directory
mkdir -p src/serializers

# Create serializer for each entity
touch src/serializers/{entity}.serializer.ts
touch src/serializers/index.ts
```

#### Step 2: Define Safe and Forbidden Fields

```typescript
// src/serializers/{entity}.serializer.ts

export const SAFE_{ENTITY}_FIELDS = [
  // List ALL fields that are safe to expose
] as const;

export const FORBIDDEN_{ENTITY}_FIELDS = [
  // List ALL fields that must NEVER be exposed
] as const;
```

#### Step 3: Implement Serialization Function

```typescript
export function serialize{Entity}(raw: Record<string, any>): Safe{Entity} {
  if (!raw) throw new Error('Cannot serialize null');

  return {
    id: raw.id,
    // Map each safe field, converting snake_case to camelCase
  };
}
```

#### Step 4: Update Controllers

```typescript
import { serialize{Entity} } from '../serializers';

// Wrap ALL responses:
return reply.send({ entity: serialize{Entity}(entity) });
```

#### Step 5: Add Unit Tests

```typescript
describe('{Entity} Serializer', () => {
  it('should strip forbidden fields', () => {
    const result = serialize{Entity}(mockRaw{Entity});
    expect(result.forbiddenField).toBeUndefined();
  });
});
```

#### Step 6: Verify

```bash
npm test -- tests/unit/serializers/
npx tsc --noEmit
```

---

## 7. FILES MODIFIED

### New Files Created (9)

| File | Purpose |
|------|---------|
| `src/serializers/event.serializer.ts` | Event entity serializer |
| `src/serializers/pricing.serializer.ts` | Pricing entity serializer |
| `src/serializers/capacity.serializer.ts` | Capacity entity serializer |
| `src/serializers/schedule.serializer.ts` | Schedule entity serializer |
| `src/serializers/index.ts` | Barrel export |
| `tests/unit/serializers/event.serializer.test.ts` | Event serializer tests |
| `tests/unit/serializers/pricing.serializer.test.ts` | Pricing serializer tests |
| `tests/unit/serializers/capacity.serializer.test.ts` | Capacity serializer tests |
| `tests/unit/serializers/schedule.serializer.test.ts` | Schedule serializer tests |

### Files Modified (8)

| File | Changes |
|------|---------|
| `src/controllers/events.controller.ts` | Added serializer imports and wrapped returns |
| `src/controllers/pricing.controller.ts` | Added serializer imports and wrapped returns |
| `src/controllers/capacity.controller.ts` | Added serializer imports and wrapped returns |
| `src/controllers/schedule.controller.ts` | Added serializer imports and wrapped returns |
| `src/middleware/auth.ts` | Added token revocation, replaced console.log |
| `src/middleware/tenant.ts` | Replaced console.error with logger |
| `src/config/secrets.ts` | Replaced console.log with logger |
| `src/routes/internal.routes.ts` | Fixed service boundary, added OpenAPI docs |

### Documentation Files (2)

| File | Purpose |
|------|---------|
| `CHANGELOG.md` | Updated with security fix details |
| `EVENT_SERVICE_FIX_SUMMARY.md` | This file |

---

## 8. TEST RESULTS

```
Test Suites: 4 passed, 4 total
Tests:       91 passed, 91 total
Snapshots:   0 total
Time:        1.312 s
```

All serializer security tests pass, validating that:
- Safe fields are included
- Forbidden fields are stripped
- Null/undefined inputs throw errors
- Case conversion works correctly
- Detection utilities function properly

---

**Report Generated:** 2026-01-23
**Fixes Implemented By:** Claude Opus 4.5
