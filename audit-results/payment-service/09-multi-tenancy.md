# Payment Service - 09 Multi-Tenancy Audit

**Service:** payment-service
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 21% (11/52 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No Row Level Security on ANY table |
| HIGH | 3 | Nullable tenant_id, No tenant context setting, No tenant validation in auth |
| MEDIUM | 2 | Hardcoded default tenant, No query wrapper |
| LOW | 0 | None |

---

## PostgreSQL RLS (0/7)

| Check | Status | Evidence |
|-------|--------|----------|
| RLS enabled | FAIL | No ENABLE ROW LEVEL SECURITY |
| FORCE RLS | FAIL | Not found |
| RLS policies exist | FAIL | None |
| NULL handling | FAIL | No policies |
| USING + WITH CHECK | FAIL | No policies |
| Bypass connection | FAIL | Not found |
| Audit logging | PARTIAL | Basic only |

**CRITICAL: No RLS - relies entirely on application filtering!**

---

## JWT/Middleware (3/8)

| Check | Status | Evidence |
|-------|--------|----------|
| JWT contains tenant_id | PASS | Extracts tenantId |
| From verified JWT only | PASS | After jwt.verify() |
| Signature verified first | PASS | jwt.verify() |
| Middleware sets context | PASS | authenticate middleware |
| Missing tenant returns 401 | FAIL | Proceeds without |
| UUID format validated | FAIL | No validation |
| URL vs JWT validated | FAIL | No matching |
| Body tenant ignored | PARTIAL | Some use body |

---

## Query Patterns (2/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Queries in tenant transaction | FAIL | Only 1 set_config usage |
| SET LOCAL tenant_id | PARTIAL | Only refundController |
| No direct knex without wrapper | FAIL | Direct queries |
| JOINs filter by tenant | PARTIAL | Inconsistent |
| Subqueries include tenant | PARTIAL | Inconsistent |
| INSERTs include tenant | PASS | Most do |
| Raw SQL includes tenant | PASS | Services filter |
| No hardcoded tenant IDs | PARTIAL | Some defaults found |
| Query wrapper exists | FAIL | None |

---

## Tenant Validation (1/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Required for auth routes | FAIL | Not enforced |
| Missing returns 401/403 | PARTIAL | Only refundController |
| Body tenant rejected | FAIL | Some use body |
| Logged for audit | PASS | In some logs |
| Cross-tenant blocked | PARTIAL | Some validation |

---

## Background Jobs (0/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Payloads include tenant | PARTIAL | Some outbox entries |
| Processor validates tenant | FAIL | None |
| DB context set | FAIL | No tenant context |
| Failed job no leak | PARTIAL | Some sanitization |
| Retries maintain tenant | PARTIAL | In payload |
| Recurring iterates tenants | FAIL | Not found |
| Logs include tenant | PARTIAL | Inconsistent |
| Queue names by tenant | FAIL | Global queues |
| DLQ respects tenant | FAIL | No isolation |
| Scheduling per tenant | FAIL | Global |

---

## Shared Resources (1/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Redis keys tenant-prefixed | PARTIAL | Idempotency yes |
| Cache invalidation scoped | PARTIAL | Some keys |
| Rate limiting per-tenant | PASS | tenantId in key |
| Quotas tracked per-tenant | FAIL | None |

---

## Database Schema (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Tables have tenant_id | PASS | On main tables |
| tenant_id NOT NULL | FAIL | Most are nullable! |
| tenant_id indexed | PARTIAL | Some indexed |
| Composite indexes | PASS | Idempotency |
| FKs include tenant | FAIL | Standard FKs |

---

## Strengths

- JWT-based tenant extraction
- Application-level filtering present
- Tenant in cache keys
- refundController validates tenant properly
- Outbox includes tenant_id
- PCI scrubber prevents cross-tenant PII leak

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Add Row Level Security:**
```sql
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON payment_transactions
  FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### HIGH (This Week)
1. **Make tenant_id NOT NULL:**
```typescript
table.uuid('tenant_id').notNullable();
```

2. **Add tenant validation in auth.ts:**
```typescript
if (!decoded.tenantId && !decoded.tenant_id) {
  return reply.status(401).send({ error: 'Missing tenant context' });
}
```

3. **Create tenant context middleware:**
```typescript
await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
```

### MEDIUM (This Month)
1. Remove hardcoded default tenant UUID
2. Create withTenantContext() query wrapper
