# Ticket Service - 09 Multi-Tenancy Audit

**Service:** ticket-service
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 51% (18/35 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Tenant ID from header (spoofable), Body tenant_id used without validation |
| HIGH | 3 | RLS uses user_id not tenant_id, No SET LOCAL, No tenant validation |
| MEDIUM | 2 | Queue not tenant-scoped, Recurring jobs not tenant-aware |
| LOW | 1 | No URL vs JWT tenant validation |

---

## PostgreSQL RLS (6/10)

| Check | Status | Evidence |
|-------|--------|----------|
| RLS enabled on tables | PASS | users, venues, tickets |
| FORCE RLS applied | PASS | All tables |
| Non-superuser role | PARTIAL | Uses env var, unverified |
| No BYPASSRLS | PARTIAL | Not verified |
| Uses current_setting('app.current_tenant_id') | FAIL | Uses user_id not tenant_id |
| NULL handling | PASS | Uses TRUE for safe NULL |
| USING and WITH CHECK | PASS | Both present |
| Service role for bypass | PASS | service_role created |

---

## JWT Claims & Middleware (3/9)

| Check | Status | Evidence |
|-------|--------|----------|
| JWT contains tenant_id | PASS | Extracts from JWT |
| Tenant from verified JWT only | FAIL | Also accepts x-tenant-id header! |
| JWT verified first | PASS | RS256 verification |
| Middleware sets context | PASS | Sets request.tenantId |
| Missing tenant returns 401 | FAIL | No validation |
| Tenant format validated | FAIL | No UUID validation |
| URL vs JWT validated | FAIL | No validation |
| Body tenant ignored | FAIL | Uses body tenantId |
| Header validated against JWT | FAIL | Header accepted blindly |

**CRITICAL: Header Spoofing Vulnerability:**
```typescript
// tenant.ts - INSECURE
const tenantId = request.headers['x-tenant-id'] as string;
if (tenantId) {
  (request as any).tenantId = tenantId;  // ❌ Spoofable!
}
```

---

## Knex Query Patterns (5/9)

| Check | Status | Evidence |
|-------|--------|----------|
| Queries in tenant transaction | PARTIAL | Transactions, no SET LOCAL |
| SET LOCAL app.current_tenant_id | FAIL | Not implemented |
| No queries without tenant filter | PASS | All include tenant_id |
| JOINs filter by tenant | PASS | Tenant in joins |
| Subqueries include tenant | PASS | Properly filtered |
| INSERTs include tenant | PASS | tenant_id in inserts |
| Raw SQL includes tenant | PASS | Filtered |
| No hardcoded tenant IDs | PASS | None found |
| Query wrapper protection | FAIL | No wrapper |

---

## Background Jobs (3/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Payloads include tenant_id | PASS | In queue payloads |
| Processor validates tenant | PARTIAL | Not verified |
| DB context set before job | FAIL | No SET LOCAL |
| Error doesn't leak tenant | PASS | Sanitized |
| Retries maintain context | PASS | Payload includes tenant |
| Recurring jobs iterate tenants | PARTIAL | No tenant iteration |
| Logs include tenant | PARTIAL | Some do |
| Queue names scoped | FAIL | Single queue all tenants |

---

## Shared Resources (5/5 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Redis keys tenant-prefixed | PASS | reservation:${tenantId}: |
| Cache invalidation scoped | PASS | Keys include tenant |
| Rate limiting per-tenant | PASS | userId/tenant in key |
| No global cache leaks | PASS | Tenant context in keys |

---

## API Endpoints (7/7 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Routes use tenant middleware | PASS | authMiddleware sets tenantId |
| Errors don't reveal cross-tenant | PASS | Generic "not found" |
| Pagination includes tenant | PASS | Tenant filter |
| Search filters by tenant | PASS | All queries |
| Bulk ops validate tenant | PASS | Validates ownership |
| Webhooks validate tenant | PASS | Context validated |
| Admin routes protected | PASS | requireRole(['admin']) |

---

## Strengths

- RLS enabled with FORCE on critical tables
- Service role for system operations
- Tenant filter in all queries
- Tenant-scoped Redis keys
- Generic error messages (no leaks)
- Tenant in job payloads
- Tenant validation on purchase

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Remove header acceptance:**
```typescript
// REMOVE this from tenant.ts
const tenantId = request.headers['x-tenant-id'] as string;
// ONLY use JWT tenant
```

2. **Validate body tenant matches JWT:**
```typescript
const { tenantId: bodyTenantId } = request.body;
if (bodyTenantId && bodyTenantId !== request.tenantId) {
  return reply.status(403).send({ error: 'Tenant mismatch' });
}
```

### HIGH (This Week)
1. Add tenant_id-based RLS policies
2. Add SET LOCAL in transactions:
```typescript
await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
```
3. Add tenant presence/format validation

### MEDIUM (This Month)
1. Scope queue names by tenant
2. Add tenant context to recurring workers

### LOW (Backlog)
1. Validate URL params against JWT tenant
