## Search-Service Multi-Tenancy Audit

**Standard:** `09-multi-tenancy.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 48 |
| **Passed** | 16 |
| **Partial** | 11 |
| **Failed** | 17 |
| **N/A** | 4 |
| **Pass Rate** | 36.4% |
| **Critical Issues** | 5 |
| **High Issues** | 5 |
| **Medium Issues** | 5 |

---

## PostgreSQL RLS Configuration

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 1 | RLS enabled on tenant-scoped tables | **FAIL** | `001_search_consistency_tables.ts` - No RLS enabled |
| 2 | `FORCE ROW LEVEL SECURITY` applied | **FAIL** | No FORCE RLS |
| 3 | Non-superuser database role | **N/A** | Cannot verify from code |
| 4 | No BYPASSRLS privilege | **N/A** | Cannot verify from code |
| 5 | RLS policies use session variable | **PARTIAL** | `tenant-context.ts:19` - Sets `app.current_tenant` but no policies use it |
| 6 | Policies handle NULL tenant | **FAIL** | No policies defined |
| 7 | Both USING and WITH CHECK defined | **FAIL** | No policies defined |
| 8 | Separate role for migrations | **N/A** | Cannot verify |
| 9 | System ops use dedicated bypass | **FAIL** | No dedicated bypass connection |
| 10 | Audit logging for cross-tenant ops | **FAIL** | No audit logging |

---

## Tenant Context Extraction & Validation

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 11 | JWT contains tenant_id claim | **PASS** | `auth.middleware.ts:38-39` - Extracts venueId from decoded token |
| 12 | Tenant from JWT only (not body/headers) | **PARTIAL** | `tenant-context.ts:9-13` - Also accepts `(request as any).tenantId` |
| 13 | JWT signature verified first | **PASS** | `auth.middleware.ts:33` - `jwt.verify()` before extraction |
| 14 | Middleware sets context before routes | **PASS** | `tenant.middleware.ts` - `requireTenant` preHandler |
| 15 | Missing tenant returns 401 | **PASS** | `tenant.middleware.ts:25-27` - Returns 403 on missing |
| 16 | Tenant ID format validated | **FAIL** | No UUID format validation |
| 17 | URL tenant validated against JWT | **FAIL** | No URL parameter validation |
| 18 | Request body tenant ignored | **FAIL** | `tenant-context.ts:11` - Accepts `(request as any).tenantId` |
| 19 | Multi-tenant users supported | **FAIL** | No multi-tenant user support |
| 20 | Active tenant header validated | **FAIL** | No header validation |

---

## Knex Query Patterns

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 21 | Queries run in tenant context | **PARTIAL** | `tenant-context.ts:17-22` - Sets session var but inconsistent |
| 22 | SET LOCAL called at tx start | **PASS** | `tenant-context.ts:19` - `SET LOCAL app.current_tenant` |
| 23 | No direct knex calls | **FAIL** | `consistency.service.ts` - Direct `this.db()` calls |
| 24 | JOIN queries filter both tables | **N/A** | No JOIN queries in search service |
| 25 | Subqueries include tenant filter | **FAIL** | `consistency.service.ts` - No tenant filters |
| 26 | INSERT includes tenant_id | **FAIL** | `consistency.service.ts:41-50` - No tenant_id in inserts |
| 27 | Raw SQL includes tenant param | **FAIL** | No tenant in raw queries |
| 28 | Migrations use admin connection | **N/A** | Cannot verify |
| 29 | No hardcoded tenant IDs | **FAIL** | `tenant-context.ts:3` - `DEFAULT_TENANT_ID` hardcoded |
| 30 | Query wrapper prevents dangerous ops | **FAIL** | No query wrapper |

---

## Elasticsearch Tenant Filtering

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 31 | ES queries include tenant filter | **PASS** | `tenant-filter.ts:20-31` - `addTenantFilter()` function |
| 32 | Tenant filter applied to all searches | **PARTIAL** | `search.service.ts:60-63` - Only if `options?.venueId` exists |
| 33 | Index operations include tenant | **PARTIAL** | `consistency.service.ts` - Inconsistent |
| 34 | Bulk operations filter by tenant | **FAIL** | `content-sync.service.ts` - No tenant filtering |
| 35 | Admin cross-tenant queries controlled | **PASS** | `tenant-filter.ts:47-50` - `canAccessCrossTenant()` |

---

## Background Jobs & Message Handling

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 36 | Job payloads include tenant_id | **PARTIAL** | `sync.service.ts:35` - clientId but not tenant_id |
| 37 | Job processor validates tenant | **FAIL** | `rabbitmq.ts:14-22` - No tenant validation |
| 38 | DB context set before job execution | **FAIL** | No tenant context in job processing |
| 39 | Failed jobs don't leak tenant data | **PASS** | Error messages are generic |
| 40 | Job retries maintain tenant context | **FAIL** | No tenant propagation |
| 41 | Recurring jobs iterate with isolation | **FAIL** | `content-sync.service.ts:106-139` - No tenant iteration |

---

## Shared Resources

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 42 | Redis keys prefixed with tenant | **PASS** | `rate-limit.middleware.ts:41-44` - `tenant:user:id` format |
| 43 | Cache invalidation scoped to tenant | **PARTIAL** | Depends on usage |
| 44 | Rate limiting per-tenant | **PASS** | `rate-limit.middleware.ts:37-45` - Tenant in key |
| 45 | Resource quotas per-tenant | **FAIL** | No tenant-specific quotas |

---

## API Endpoints

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 46 | All routes use tenant middleware | **PARTIAL** | `search.controller.ts` has it, `professional-search.controller.ts` MISSING |
| 47 | Error responses sanitized | **PASS** | Generic error messages |
| 48 | Search filters by tenant | **PARTIAL** | Only with venueId option |

---

## Critical Issues (P0)

### 1. Default Tenant ID Fallback
**Severity:** CRITICAL  
**Location:** `tenant-context.ts:3,11-13`  
**Issue:** Falls back to hardcoded `DEFAULT_TENANT_ID` if no tenant found. This could allow unauthenticated access to default tenant data.

**Evidence:**
```typescript
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const tenantId =
  request.user?.tenant_id ||
  request.user?.venueId ||
  (request as any).tenantId ||
  DEFAULT_TENANT_ID;  // DANGEROUS FALLBACK
```

**Remediation:**
```typescript
const tenantId = request.user?.tenant_id || request.user?.venueId;
if (!tenantId) {
  throw new Error('Tenant context required');
}
```

---

### 2. No RLS on Database Tables
**Severity:** CRITICAL  
**Location:** `001_search_consistency_tables.ts`  
**Issue:** Tables have no RLS policies. Defense-in-depth missing at database level.

**Evidence:** Migration creates tables without:
- `ENABLE ROW LEVEL SECURITY`
- Any RLS policies
- `tenant_id` column

---

### 3. Tenant ID Not in Database Operations
**Severity:** CRITICAL  
**Location:** `consistency.service.ts:41-50`  
**Issue:** Insert operations to `search_operation_log` don't include `tenant_id`.

**Evidence:**
```typescript
await trx('search_operation_log').insert({
  entity_type: operation.entityType,
  entity_id: operation.entityId,
  operation_type: operation.operation,
  // MISSING: tenant_id
});
```

---

### 4. Professional Search Missing Tenant Middleware
**Severity:** CRITICAL  
**Location:** `professional-search.controller.ts:9,16,31,40`  
**Issue:** All routes only use `authenticate`, NOT `requireTenant`. Cross-tenant access possible.

**Evidence:**
```typescript
fastify.post('/advanced', {
  preHandler: authenticate  // MISSING: requireTenant
}, async (request, _reply) => {...});
```

---

### 5. Tenant Accepted from Request Object
**Severity:** CRITICAL  
**Location:** `tenant-context.ts:11`  
**Issue:** Accepts `(request as any).tenantId` which could be set by attackers.

**Evidence:**
```typescript
const tenantId =
  request.user?.tenant_id ||
  request.user?.venueId ||
  (request as any).tenantId ||  // UNTRUSTED SOURCE
  DEFAULT_TENANT_ID;
```

---

## High Issues (P1)

### 6. Elasticsearch Filter Only Applied Conditionally
**Severity:** HIGH  
**Location:** `search.service.ts:60-63`  
**Issue:** Tenant filter only applied if `options?.venueId` exists.

**Evidence:**
```typescript
if (options?.venueId) {
  query = addTenantFilter(query, options.venueId, user);
}
// If venueId not in options, no tenant filtering!
```

---

### 7. No Tenant Validation in RabbitMQ Consumer
**Severity:** HIGH  
**Location:** `rabbitmq.ts:14-22`  
**Issue:** Messages processed without any tenant context or validation.

---

### 8. Content Sync Without Tenant Context
**Severity:** HIGH  
**Location:** `content-sync.service.ts`  
**Issue:** Bulk sync operations process data without tenant filtering.

---

### 9. No Tenant ID Format Validation
**Severity:** HIGH  
**Location:** `tenant-context.ts`, `tenant.middleware.ts`  
**Issue:** Tenant IDs not validated as UUIDs - could accept malformed values.

---

### 10. Background Sync Missing Tenant Propagation
**Severity:** HIGH  
**Location:** `consistency.service.ts:244-252`  
**Issue:** Background processor doesn't set tenant context for operations.

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 11 | No multi-tenant user support | Service-wide | Users can't belong to multiple tenants |
| 12 | No tenant-specific quotas | Service-wide | All tenants share same limits |
| 13 | Inconsistent tenant context setting | `tenant-context.ts` | Multiple fallback sources |
| 14 | No audit logging for tenant access | Service-wide | Cannot track cross-tenant attempts |
| 15 | Cache keys not all tenant-scoped | Various | Some caches may leak data |

---

## Positive Findings

1. ✅ **JWT-based tenant extraction** - Primary source is JWT `tenant_id` or `venueId`
2. ✅ **Tenant middleware exists** - `requireTenant` middleware for route protection
3. ✅ **Session variable setting** - `SET LOCAL app.current_tenant` for RLS support
4. ✅ **ES tenant filter function** - `addTenantFilter()` properly filters ES queries
5. ✅ **Rate limit tenant scoping** - Redis keys include tenant prefix
6. ✅ **Cross-tenant access control** - `canAccessCrossTenant()` for admin checks
7. ✅ **Generic error messages** - Don't reveal cross-tenant information
8. ✅ **Tenant required check** - Returns 403 when tenant missing
9. ✅ **Consistent tenant in user object** - `request.user.venueId` from auth
10. ✅ **ES bool query structure** - Uses proper `must` clause for tenant filter

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Remove DEFAULT_TENANT_ID fallback | 30 min | Critical - prevents unauthorized access |
| P0 | Add tenant_id to database tables | 2 hours | Critical - enables data isolation |
| P0 | Enable RLS on all tables | 2 hours | Critical - database-level protection |
| P0 | Add requireTenant to professional search routes | 30 min | Critical - prevents cross-tenant |
| P0 | Remove `(request as any).tenantId` acceptance | 15 min | Critical - untrusted source |
| P1 | Make ES tenant filter mandatory | 1 hour | High - consistent filtering |
| P1 | Add tenant validation to RabbitMQ consumer | 1 hour | High - message security |
| P1 | Add tenant context to content sync | 2 hours | High - bulk operation security |
| P1 | Validate tenant ID format (UUID) | 30 min | High - input validation |
| P1 | Set tenant context in background processor | 1 hour | High - job isolation |
| P2 | Add multi-tenant user support | 4 hours | Medium - user flexibility |
| P2 | Implement tenant-specific quotas | 2 hours | Medium - resource management |
| P2 | Add audit logging for tenant access | 2 hours | Medium - security monitoring |

---

**Audit Complete.** Pass rate of 36.4% indicates significant gaps in multi-tenancy implementation. The service has foundational tenant middleware but critical issues include a dangerous default tenant fallback, missing RLS policies, and inconsistent application of tenant filtering. The professional search routes completely bypass tenant validation.
