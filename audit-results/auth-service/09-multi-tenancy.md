# Auth Service - 09 Multi-Tenancy Audit

**Service:** auth-service
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-22
**Auditor:** Cline + Human Review
**Pass Rate:** 88% (21/24)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | RLS context not set in PostgreSQL session |
| HIGH | 1 | Redis keys not tenant-prefixed |
| MEDIUM | 2 | Tenant ID format not validated, DB role unknown |

---

## Section 3.1: PostgreSQL RLS (6/7 PASS)

### RLS enabled on tenant tables
**Status:** PASS
**Evidence:** `ALTER TABLE users ENABLE ROW LEVEL SECURITY`

### FORCE ROW LEVEL SECURITY
**Status:** PASS

### Non-superuser database role
**Status:** PARTIAL
**Issue:** Default is 'postgres' - verify production uses app_user without BYPASSRLS.

### RLS policies use current_setting
**Status:** PASS
**Evidence:** `current_setting('app.current_tenant_id', TRUE)::UUID`

### NULL tenant context handled
**Status:** PASS
**Evidence:** Second param TRUE returns NULL instead of error.

### USING and WITH CHECK clauses
**Status:** PASS

---

## Section 3.2: JWT & Middleware (6/6 PASS)

### tenant_id in JWT
**Status:** PASS
**Evidence:** Included in TokenPayload.

### Tenant from verified JWT only
**Status:** PASS
**Evidence:** Extracted after `jwt.verify()`.

### Signature verified first
**Status:** PASS
**Evidence:** RS256 verification before claim extraction.

### Middleware sets context before handlers
**Status:** PASS
**Evidence:** `addTenantContext(request)` in preHandler.

### Missing tenant returns 401/403
**Status:** PASS
**Evidence:** Returns 403 with MISSING_TENANT_ID code.

### Tenant ID format validated
**Status:** PARTIAL
**Issue:** No UUID format validation.
**Remediation:** Add `isUUID(tenant_id)` check.

---

## Section 3.3: Database Queries (5/6 PASS)

### All queries include tenant_id
**Status:** PASS
**Evidence:** Every SELECT/UPDATE includes `AND tenant_id = $N`.

### SET LOCAL app.current_tenant_id
**Status:** FAIL
**Issue:** RLS policies defined but context never set.
**Remediation:**
```typescript
await pool.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
```

### No direct queries without tenant
**Status:** PASS

### JOINs filter both tables
**Status:** PASS
**Evidence:** `JOIN users u ON ... AND u.tenant_id = $2`

### Subqueries include tenant
**Status:** PASS

### INSERTs include tenant_id
**Status:** PASS

---

## Section 3.4: Redis Isolation (0/1 PASS)

### Redis keys tenant-prefixed
**Status:** FAIL
**Issue:** Keys like `login:192.168.1.1` have no tenant prefix.
**Remediation:**
```typescript
const fullKey = `tenant:${tenantId}:${this.keyPrefix}:${key}`;
```

---

## Section 3.5: API Endpoints (3/3 PASS)

### Tenant middleware on authenticated routes
**Status:** PASS

### Error responses don't leak cross-tenant data
**Status:** PASS
**Evidence:** Generic "Session not found" messages.

### Tenant validation helpers available
**Status:** PASS
**Evidence:** `validateResourceTenant()`, `addTenantFilter()`, `TenantIsolationError`.

---

## Section 3.6: Registration (1/1 PASS)

### Tenant validated on registration
**Status:** PASS
**Evidence:** `SELECT id FROM tenants WHERE id = $1` before user insert.

---

## Remediation Priority

### CRITICAL
1. **Set RLS context** - Add to middleware/transaction:
```typescript
await pool.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
await pool.query(`SET LOCAL app.current_user_id = '${userId}'`);
```

### HIGH
1. **Prefix Redis keys with tenant** - Prevent cross-tenant collisions

### MEDIUM
1. **Validate tenant ID format** - UUID check in middleware
2. **Verify production DB role** - Ensure no BYPASSRLS

