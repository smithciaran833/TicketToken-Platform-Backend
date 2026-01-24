# Venue Service Security Fix Summary

**Date:** 2026-01-23
**Author:** Security Remediation Team
**Status:** Complete

---

## 1. Executive Summary

### What Was Broken

The venue-service had **critical data leakage vulnerabilities** where sensitive information was being returned in API responses:

1. **Business Tax Information**: Employer Identification Numbers (EIN/tax_id) and business registration numbers were exposed in venue API responses
2. **Staff HR Data**: PIN codes, hourly rates, salaries, commission percentages, and emergency contact information were returned when listing staff members
3. **Payment Credentials**: Stripe Connect account IDs and integration API keys could leak through venue and integration endpoints

### What We Fixed

Implemented a **defense-in-depth serialization pattern** that ensures sensitive data never leaves the service:

1. **Created Serializers**: New `venue.serializer.ts` and `staff.serializer.ts` with explicit field whitelisting
2. **Query-Level Protection**: Added explicit `.select()` calls to database queries
3. **Controller-Level Protection**: All API responses now pass through serializers before returning
4. **Security Hardening**: Fixed SQL injection risk, enabled HMAC by default, improved error handling

### Impact

| Before | After |
|--------|-------|
| `GET /venues/:id` returned `tax_id`, `stripe_connect_account_id` | Only safe fields returned |
| `GET /venues/:id/staff` returned `pin_code`, `hourly_rate` | Only safe fields returned |
| Internal validation returned all ticket fields | Only necessary validation fields |
| HMAC auth disabled by default | HMAC auth enabled by default |

---

## 2. Issues Addressed

### Critical Issues (2)

| ID | Issue | Before | After |
|----|-------|--------|-------|
| C1 | Venue API leaks tax_id, business data | `reply.send(venue)` returns all DB columns | `reply.send(serializeVenue(venue))` returns only safe fields |
| C2 | Staff API leaks PIN codes, salary | `reply.send(staff)` returns all columns | `reply.send(serializeStaff(staff))` returns only safe fields |

### High Priority Issues (6)

| ID | Issue | Fix |
|----|-------|-----|
| H1 | Table name interpolation allows SQL injection | Added `ALLOWED_TABLES` allowlist with validation |
| H2 | HMAC auth disabled by default | Changed to `USE_NEW_HMAC !== 'false'` (opt-out) |
| H4 | Internal validation uses SELECT * | Explicit column list for ticket validation |
| H5 | Staff model returns all columns | Added `SAFE_STAFF_COLUMNS` with explicit `.select()` |
| H6 | listUserVenues spreads all fields | Venues now serialized before response |

### Medium Priority Issues (4)

| ID | Issue | Fix |
|----|-------|-----|
| M1 | Excessive `any` type usage | Added 15+ typed interfaces |
| M2 | Incomplete TODOs | Documented 5 TODOs with WHAT/WHY/IMPACT/EFFORT |
| M3 | Generic error messages | 6 endpoints now return specific error messages |
| M4 | Integration model returns encrypted creds | Added explicit `.select()` excluding encrypted fields |

---

## 3. Serializer Pattern

### Defense-in-Depth Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Request                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Query-Level Protection                                 │
│  ─────────────────────────────────────────────────────────────  │
│  db('venues').select(SAFE_VENUE_COLUMNS).where('id', venueId)   │
│  → Only fetches necessary columns from database                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Model-Level Protection                                 │
│  ─────────────────────────────────────────────────────────────  │
│  StaffModel.SAFE_STAFF_COLUMNS excludes pin_code, hourly_rate   │
│  → Model methods use explicit column selection                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Serializer Protection (LAST LINE OF DEFENSE)          │
│  ─────────────────────────────────────────────────────────────  │
│  serializeVenue(venue) → Only whitelisted fields pass through   │
│  → Even if query returns extra fields, they're stripped here    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Response                             │
│                    (Safe fields only)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Code Examples

**Serializer Definition:**
```typescript
// src/serializers/venue.serializer.ts

export const SAFE_VENUE_FIELDS = [
  'id', 'tenant_id', 'name', 'slug', 'description',
  'city', 'state_province', 'country_code',
  'max_capacity', 'status', 'is_verified',
  'created_at', 'updated_at',
] as const;

export const FORBIDDEN_VENUE_FIELDS = [
  'tax_id',                    // CRITICAL - business tax ID
  'business_registration',      // CRITICAL - registration number
  'stripe_connect_account_id',  // CRITICAL - payment credentials
  'total_revenue',              // HIGH - financial data
  'wallet_address',             // HIGH - blockchain credentials
] as const;

export function serializeVenue(venue: Record<string, any>): SafeVenue {
  if (!venue) throw new Error('Cannot serialize null venue');

  return {
    id: venue.id,
    tenantId: venue.tenant_id,
    name: venue.name,
    // ... only safe fields
  };
}
```

**Controller Usage:**
```typescript
// src/controllers/venues.controller.ts

// BEFORE (vulnerable):
const venue = await venueService.getVenue(venueId, userId, tenantId);
return reply.send(venue); // ❌ Leaks tax_id, stripe_connect_account_id

// AFTER (secure):
const venue = await venueService.getVenue(venueId, userId, tenantId);
return reply.send(serializeVenue(venue)); // ✅ Only safe fields
```

---

## 4. Verification

### How to Verify the Fixes Work

**Run Security Tests:**
```bash
npm test -- tests/unit/serializers/
```

Expected output: 34 passing tests

**Manual Verification:**

1. Start the service:
```bash
npm run dev
```

2. Make a request to get a venue:
```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/venues/$VENUE_ID
```

3. Verify response does NOT contain:
   - `tax_id`
   - `business_registration`
   - `stripe_connect_account_id`
   - `wallet_address`
   - `total_revenue`

4. Make a request to get staff:
```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/venues/$VENUE_ID/staff
```

5. Verify response does NOT contain:
   - `pin_code`
   - `hourly_rate`
   - `salary`
   - `commission_percentage`
   - `emergency_contact`
   - `ssn`

### Automated Verification Function

```typescript
import { findForbiddenVenueFields } from './serializers/venue.serializer';
import { findForbiddenStaffFields } from './serializers/staff.serializer';

// Use in tests or monitoring
function verifyNoDataLeakage(response: any): void {
  const venueIssues = findForbiddenVenueFields(response);
  const staffIssues = findForbiddenStaffFields(response);

  if (venueIssues.length > 0 || staffIssues.length > 0) {
    throw new Error(`DATA LEAKAGE DETECTED: ${[...venueIssues, ...staffIssues].join(', ')}`);
  }
}
```

---

## 5. Replication Guide

### How to Apply This Pattern to Other Services

#### Step 1: Identify Sensitive Fields

Review your database schema and identify:
- **CRITICAL**: Passwords, API keys, tax IDs, SSNs, payment credentials
- **HIGH**: Personal contact info, salary, internal tracking
- **MEDIUM**: Internal notes, audit data, system fields

#### Step 2: Create Serializers

```bash
mkdir -p src/serializers
```

Create `src/serializers/<entity>.serializer.ts`:

```typescript
export const SAFE_<ENTITY>_FIELDS = [
  // List ONLY fields safe for API responses
] as const;

export const FORBIDDEN_<ENTITY>_FIELDS = [
  // List ALL fields that must NEVER be returned
] as const;

export function serialize<Entity>(entity: Record<string, any>): Safe<Entity> {
  if (!entity) throw new Error('Cannot serialize null');

  return {
    // Map only safe fields, convert snake_case to camelCase
  };
}
```

#### Step 3: Update Controllers

Find all `reply.send()` calls that return entity data:

```typescript
// Find and replace:
return reply.send(entity);
// With:
return reply.send(serialize<Entity>(entity));
```

#### Step 4: Update Models (Defense in Depth)

Add explicit `.select()` to queries:

```typescript
// Before:
async findById(id: string) {
  return this.db(this.tableName).where({ id }).first();
}

// After:
private static readonly SAFE_COLUMNS = ['id', 'name', ...];

async findById(id: string) {
  return this.db(this.tableName)
    .select(Model.SAFE_COLUMNS)
    .where({ id })
    .first();
}
```

#### Step 5: Add Security Tests

```typescript
describe('Serializer Security', () => {
  it('should EXCLUDE all forbidden fields', () => {
    const result = serialize<Entity>(mockEntityWithAllFields);
    const forbidden = findForbidden<Entity>Fields(result);
    expect(forbidden).toHaveLength(0);
  });
});
```

### Checklist for Other Services

- [ ] Identified all sensitive database columns
- [ ] Created serializer with SAFE_FIELDS whitelist
- [ ] Created serializer with FORBIDDEN_FIELDS blacklist
- [ ] Updated all controllers to use serializers
- [ ] Updated model queries with explicit `.select()`
- [ ] Added security tests for serializers
- [ ] Verified no forbidden fields in API responses
- [ ] Updated CHANGELOG.md

---

## 6. Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/serializers/venue.serializer.ts` | NEW | Venue field whitelisting |
| `src/serializers/staff.serializer.ts` | NEW | Staff field whitelisting |
| `src/serializers/index.ts` | NEW | Barrel export |
| `src/utils/database-helpers.ts` | MODIFIED | Table name allowlist |
| `src/middleware/internal-auth.middleware.ts` | MODIFIED | HMAC default enabled |
| `src/routes/internal-validation.routes.ts` | MODIFIED | Explicit column selection |
| `src/models/integration.model.ts` | MODIFIED | Exclude encrypted credentials |
| `src/models/staff.model.ts` | MODIFIED | Safe column selection |
| `src/controllers/venues.controller.ts` | MODIFIED | Serializer usage + types |
| `src/controllers/venue-content.controller.ts` | MODIFIED | Type definitions |
| `src/services/integration.service.ts` | MODIFIED | TODO documentation |
| `src/jobs/ssl-renewal.job.ts` | MODIFIED | TODO documentation |
| `tests/unit/serializers/*.test.ts` | NEW | Security tests |

---

## 7. Related Documentation

- [Auth Service Serializer Pattern](../auth-service/src/serializers/user.serializer.ts)
- [CLAUDE.md Project Guidelines](../../../CLAUDE.md)
- [Venue Service Audit Report](./VENUE_SERVICE_AUDIT_REPORT.md)
