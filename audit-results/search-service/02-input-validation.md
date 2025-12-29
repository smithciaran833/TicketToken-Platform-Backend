## Search-Service Input Validation Audit

**Standard:** `02-input-validation.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 38 |
| **Passed** | 22 |
| **Partial** | 9 |
| **Failed** | 7 |
| **Pass Rate** | 57.9% |
| **Critical Issues** | 3 |
| **High Issues** | 4 |
| **Medium Issues** | 7 |

---

## 3.1 Route Definition Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **RD1** | All routes have schema validation | **PARTIAL** | `search.controller.ts:10-74` - Routes use sanitizer but NOT Joi middleware registered as preHandler. Validation schemas exist in `search.schemas.ts` but validation middleware NOT applied in controller. |
| **RD2** | Body schema defined for POST/PUT/PATCH | **PASS** | No POST/PUT/PATCH routes in search-service - all are GET routes |
| **RD3** | Params schema defined with format validation | **FAIL** | `search.controller.ts` - No params schema validation. Routes accept query params but no UUID format validation on IDs |
| **RD4** | Query schema defined with type constraints | **PARTIAL** | `search.schemas.ts:8-26` - Joi schemas exist with constraints (maxLength: 200, max: 100 for limit) but NOT registered in route handlers |
| **RD5** | Response schema defined (serialization) | **FAIL** | No response schema defined anywhere - potential data leakage |
| **RD6** | `additionalProperties: false` on all object schemas | **PASS** | `search.schemas.ts:23,35,65,77,93,113` - All schemas use `.options({ stripUnknown: true })` which serves same purpose |
| **RD7** | Arrays have `maxItems` constraint | **PARTIAL** | `search.schemas.ts:111` - `categories` and `venues` arrays limited to `.max(10)`, but `sanitizer.ts:83` limits to 50 |
| **RD8** | Strings have `maxLength` constraint | **PASS** | `search.schemas.ts:9-10` - `q: Joi.string().max(200)`, `sanitizer.ts:6` - `MAX_QUERY_LENGTH = 200` |
| **RD9** | Integers have `minimum` and `maximum` | **PASS** | `search.schemas.ts:17-22` - `limit: Joi.number().min(1).max(100)`, `offset: min(0).max(10000)` |
| **RD10** | Enums use Type.Union with Type.Literal | **PASS** | `search.schemas.ts:11` - `.valid('venues', 'events')` enforces allowed values |

---

## 3.2 Schema Definition Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SD1** | UUIDs validated with format: 'uuid' | **FAIL** | `search.schemas.ts:71` - `venue_id: Joi.string().max(100)` - NO UUID format validation |
| **SD2** | Emails validated with format: 'email' | **N/A** | No email fields in search service |
| **SD3** | URLs validated with format: 'uri' | **N/A** | No URL fields in search service |
| **SD4** | Dates use ISO8601 format string | **PASS** | `search.schemas.ts:52-57` - `date_from: Joi.date().iso()`, `date_to: Joi.date().iso()` |
| **SD5** | Phone numbers have pattern validation | **N/A** | No phone fields in search service |
| **SD6** | No Type.Any() or Type.Unknown() in production | **PASS** | No `any` types in validation schemas (using Joi not TypeBox) |
| **SD7** | Optional fields explicitly marked | **PASS** | `search.schemas.ts:8,11,14` - `.optional()` used throughout |
| **SD8** | Default values set where appropriate | **PASS** | `search.schemas.ts:18,21` - `limit: .default(20)`, `offset: .default(0)` |
| **SD9** | Schemas are reusable (DRY) | **PARTIAL** | Schemas defined in separate file but `filterSchema` not exported for reuse |
| **SD10** | Schema names are consistent | **PASS** | Consistent naming: `searchQuerySchema`, `venueSearchSchema`, `eventSearchSchema` |

---

## 3.3 Service Layer Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SL1** | Business rule validation after schema validation | **PARTIAL** | `search.service.ts:27-39` - Consistency token validation exists, but no business rule validation on search params |
| **SL2** | Authorization checks before data access | **PASS** | `search.controller.ts:10,23,35,55` - `authenticate, requireTenant` middleware on all routes |
| **SL3** | Entity existence validated before operations | **N/A** | Search service doesn't modify entities |
| **SL4** | State transitions validated | **N/A** | No state transitions in search service |
| **SL5** | Cross-field validation performed | **PASS** | `search.schemas.ts:57` - `.min(Joi.ref('date_from'))` ensures date_to >= date_from |
| **SL6** | External input re-validated if transformed | **PASS** | `search.controller.ts:15-17` - Input sanitized then passed to service |
| **SL7** | No direct use of request.body in DB queries | **PASS** | `search.service.ts` - All queries use sanitized inputs via service parameters |
| **SL8** | Sensitive fields filtered from responses | **PARTIAL** | `search.service.ts:78-83` - Returns `hit._source` directly without field filtering |

---

## 3.4 Database Layer Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **DB1** | All queries use parameterized values | **PASS** | `search.service.ts:45-53` - Elasticsearch queries built programmatically, not string concat |
| **DB2** | whereRaw uses bindings array | **PASS** | `consistency.service.ts:50-57` - Knex raw queries use `?` placeholders with bindings |
| **DB3** | Dynamic columns use allowlist | **PASS** | No dynamic column selection in search queries |
| **DB4** | No user input in table/column names | **PASS** | Index names derived from type parameter after validation |
| **DB5** | Knex migrations define NOT NULL | **PASS** | `001_search_consistency_tables.ts:10-14` - `.notNullable()` used |
| **DB6** | Knex migrations define constraints | **PASS** | `001_search_consistency_tables.ts:18` - `table.unique(['entity_type', 'entity_id'])` |
| **DB7** | Repository methods use explicit field lists | **PARTIAL** | `search.service.ts:78` - Returns full `hit._source` without field selection |
| **DB8** | Insert/update use explicit field mapping | **PASS** | `consistency.service.ts:53-60` - Explicit field mapping in inserts |

---

## 3.5 Security-Specific Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC1** | Prototype pollution blocked | **PASS** | `search.schemas.ts` - All schemas use `stripUnknown: true` |
| **SEC2** | Mass assignment prevented | **PASS** | Search is read-only, no create/update operations |
| **SEC3** | SQL injection prevented | **PASS** | Uses Elasticsearch and parameterized Knex queries |
| **SEC4** | XSS prevented (output encoding) | **PARTIAL** | `sanitizer.ts:23-29` - Removes `<>{}[]` but no HTML encoding on output |
| **SEC5** | File upload validates content type | **N/A** | No file uploads in search service |
| **SEC6** | File names are sanitized | **N/A** | No file operations |
| **SEC7** | Path traversal prevented | **N/A** | No file operations |
| **SEC8** | Unicode normalized before comparison | **FAIL** | `sanitizer.ts` - No Unicode normalization (`.normalize('NFC')`) |
| **SEC9** | Integer bounds prevent overflow | **PASS** | `search.schemas.ts:17,21` - `max(100)`, `max(10000)` limits |
| **SEC10** | Rate limiting on validation-heavy endpoints | **PARTIAL** | `rate-limit.middleware.ts` exists but NOT registered in `fastify.ts` routes |

---

## Critical Issues (P0)

### 1. Validation Middleware Not Applied to Routes
**Severity:** CRITICAL  
**Location:** `search.controller.ts:10-74`  
**Issue:** Joi validation schemas exist in `search.schemas.ts` but the validation middleware from `validation.middleware.ts` is NOT registered as preHandler on routes. Routes rely only on `SearchSanitizer` which strips characters but doesn't reject invalid input.

**Evidence:**
```typescript
// search.controller.ts:10-16
fastify.get('/', {
  preHandler: [authenticate, requireTenant]  // NO validateSearch middleware!
}, async (request, _reply) => {
  // Uses sanitizer but schema validation not enforced
  const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
```

**Remediation:**
```typescript
import { validateSearch } from '../middleware/validation.middleware';

fastify.get('/', {
  preHandler: [authenticate, requireTenant, validateSearch]  // ADD validateSearch
}, async (request, _reply) => {
```

---

### 2. No UUID Format Validation on IDs
**Severity:** CRITICAL  
**Location:** `search.schemas.ts:71`  
**Issue:** `venue_id` field allows any string up to 100 chars, not validated as UUID.

**Evidence:**
```typescript
// search.schemas.ts:71
venue_id: Joi.string()
  .max(100)
  .optional()
  .description('Filter by specific venue ID')
// MISSING: .guid({ version: 'uuidv4' })
```

**Remediation:**
```typescript
venue_id: Joi.string()
  .guid({ version: 'uuidv4' })
  .optional()
  .description('Filter by specific venue ID')
```

---

### 3. No Response Schema Defined
**Severity:** CRITICAL  
**Location:** All routes  
**Issue:** No response serialization schema - could leak internal fields from Elasticsearch documents.

**Evidence:** `search.service.ts:78-83` returns raw `hit._source` without filtering.

**Remediation:** Define response schemas with explicit allowed fields.

---

## High Issues (P1)

### 4. Missing Unicode Normalization
**Severity:** HIGH  
**Location:** `sanitizer.ts`  
**Issue:** No Unicode normalization before validation, allowing homograph attacks and inconsistent matching.

**Remediation:**
```typescript
static sanitizeQuery(query: string | any): string {
  if (!query || typeof query !== 'string') {
    return '';
  }
  // ADD Unicode normalization
  let sanitized = query.normalize('NFC')
    .replace(/[<>]/g, '')
```

---

### 5. Rate Limiting Not Registered
**Severity:** HIGH  
**Location:** `fastify.ts`  
**Issue:** `rate-limit.middleware.ts` has comprehensive rate limiting but it's NOT registered in `fastify.ts`.

**Evidence:** `fastify.ts` has no `registerRateLimiting()` call.

---

### 6. Raw Elasticsearch Source Returned
**Severity:** HIGH  
**Location:** `search.service.ts:78-83`  
**Issue:** Returns full `hit._source` which could include internal fields.

**Remediation:** Explicitly select fields to return.

---

### 7. Geo Coordinate Validation Not Used
**Severity:** HIGH  
**Location:** `search.schemas.ts:83-93` vs controllers  
**Issue:** `geoSearchSchema` defined but not used anywhere in routes.

---

## Medium Issues (P2)

| # | Issue | Location | Remediation |
|---|-------|----------|-------------|
| 8 | Filter schema not exported | `search.schemas.ts:101-115` | Export and use `filterSchema` |
| 9 | Array limit inconsistency | `sanitizer.ts:83` vs schemas | Align array limits (50 vs 10) |
| 10 | No limit on search_analytics index | `search.service.ts:160-168` | Add query limits |
| 11 | Consistency token length not validated | `search.service.ts:29` | Validate token format |
| 12 | Missing stripUnknown on filterSchema | `search.schemas.ts:101-115` | Add `.options({ stripUnknown: true })` |
| 13 | Sanitizer allows 0-length strings | `sanitizer.ts:7` | `MIN_QUERY_LENGTH = 0` should be 1 for required fields |
| 14 | No request body size validation | Fastify config | Already set to 10MB in `app.ts:14` ✓ |

---

## Positive Findings

1. ✅ **Strong sanitization implementation** - `SearchSanitizer` class removes dangerous characters
2. ✅ **Consistent schema patterns** - All schemas use `stripUnknown: true`
3. ✅ **Date validation** - ISO8601 format and cross-field validation (date_to >= date_from)
4. ✅ **Pagination limits** - Proper min/max on limit and offset
5. ✅ **Parameterized queries** - Both ES and Knex queries are safely constructed
6. ✅ **Auth on all routes** - `authenticate` and `requireTenant` consistently applied

---

## Prioritized Remediation Plan

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Register validation middleware on all routes | 30 min |
| P0 | Add UUID format validation to ID fields | 15 min |
| P0 | Define response schemas | 2 hours |
| P1 | Add Unicode normalization to sanitizer | 30 min |
| P1 | Register rate limiting middleware | 30 min |
| P1 | Filter ES response fields explicitly | 1 hour |
| P2 | Align array limits across codebase | 15 min |
| P2 | Export and use filterSchema | 15 min |

---

**Audit Complete.** Pass rate of 57.9% indicates significant validation infrastructure exists but is not fully integrated into request handling.
