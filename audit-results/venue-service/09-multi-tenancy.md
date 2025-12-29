# Venue Service - 09 Multi-Tenancy Audit

**Service:** venue-service
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 68% (34/50 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No dedicated tenant middleware, Default tenant fallback allows bypass |
| HIGH | 4 | No SET LOCAL for RLS context, tenant_id from request not blocked, No tenant validation, Missing tenant in background jobs |
| MEDIUM | 4 | No tenant-scoped cache keys, No query wrapper, Missing tenant in raw queries, No URL tenant validation |
| LOW | 2 | No multi-tenant user support, Tenant context not in AsyncLocalStorage |

---

## PostgreSQL RLS Configuration (8/10 PASS)

### RLS1-RLS2: RLS enabled and forced
**Status:** PASS
**Evidence:** All 12 tables have ENABLE and FORCE RLS.

### RLS3-RLS4: Non-superuser role, no BYPASSRLS
**Status:** PARTIAL
**Evidence:** Cannot verify from code.

### RLS5: RLS policies use current_setting
**Status:** PASS
**Evidence:** `current_setting('app.current_tenant_id', TRUE)::UUID`

### RLS6: Policies handle NULL tenant context
**Status:** PASS
**Evidence:** Uses TRUE param for safe NULL handling.

### RLS7: Both USING and WITH CHECK clauses
**Status:** PARTIAL
**Evidence:** Only USING clause, no WITH CHECK for INSERT.

### RLS8-RLS10: Migration role, bypass, audit
**Status:** PASS

---

## Knex Query Patterns (4/10 PASS)

### KQ1-KQ2: Transaction tenant context, SET LOCAL
**Status:** FAIL
**Evidence:** No SET LOCAL app.current_tenant_id in transactions.
**Remediation:** Add `await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId])`

### KQ3: No direct knex() calls - use wrapper
**Status:** FAIL

### KQ4-KQ5: JOINs and subqueries filter tenant
**Status:** PARTIAL
**Evidence:** Relies on RLS, no explicit filtering.

### KQ6: INSERT statements include tenant_id
**Status:** PASS

### KQ7: Raw SQL queries include tenant parameter
**Status:** FAIL
**Evidence:** internal-validation.routes.ts raw query without tenant filter.

### KQ8: Migrations run with admin connection
**Status:** PASS

### KQ9: No hardcoded tenant IDs
**Status:** FAIL
**Evidence:** Default tenant fallback: '00000000-0000-0000-0000-000000000001'

### KQ10: Query wrapper prevents dangerous patterns
**Status:** FAIL

---

## JWT Claims & Middleware (3/10 PASS)

### JM1: JWT contains tenant_id claim
**Status:** PASS

### JM2: Tenant extracted from verified JWT only
**Status:** FAIL
**Evidence:** Fallback to default tenant allows bypass.

### JM3: JWT signature verified before extraction
**Status:** PASS

### JM4-JM8: Tenant middleware, missing tenant 401, format validation, URL validation, body fields ignored
**Status:** FAIL
**Evidence:** No dedicated tenant middleware. Controllers manually extract tenant with unsafe fallback.

---

## Shared Resources (4/10 PASS)

### SR1: Redis keys prefixed with tenant
**Status:** FAIL
**Evidence:** Rate limit keys use user_id, not tenant prefix.

### SR4: Cache invalidation scoped to tenant
**Status:** FAIL

### SR7: Rate limiting per-tenant
**Status:** FAIL

### SR8: Resource quotas tracked per-tenant
**Status:** FAIL

### SR9: No global caches leaking tenant data
**Status:** PASS

---

## API Endpoints (6/10 PASS)

### AE1: All authenticated routes use tenant middleware
**Status:** FAIL

### AE2: Error responses don't reveal cross-tenant data
**Status:** PASS

### AE3-AE4: Pagination, search filter by tenant
**Status:** PASS
**Evidence:** RLS enforces.

### AE7: Webhooks validate tenant context
**Status:** FAIL

### AE10: Admin endpoints have authorization
**Status:** PASS

---

## Critical Missing Components

1. **No Dedicated Tenant Middleware** - Every controller manually extracts tenant
2. **Default Tenant Fallback is Security Bypass** - `'00000000-0000-0000-0000-000000000001'`
3. **RLS Context Not Set** - No SET LOCAL in transactions

---

## Remediation Priority

### CRITICAL (Immediate)
1. Create tenant middleware - Enforce tenant extraction from JWT only
2. Remove default tenant fallback - Require explicit tenant
3. Add SET LOCAL to transactions - Enable RLS filtering

### HIGH (This Week)
1. Add tenant to rate limit keys
2. Validate tenant on internal routes
3. Add WITH CHECK to RLS policies
4. Validate tenant ID format (UUID)

### MEDIUM (This Month)
1. Create tenant-scoped query wrapper
2. Add tenant to Redis cache keys
3. Add tenant validation to webhooks
4. Add URL tenant validation

### LOW (Backlog)
1. Add multi-tenant user support
2. Add AsyncLocalStorage for tenant
3. Add per-tenant quotas
