# Event Service - 09 Multi-Tenancy Audit

**Service:** event-service
**Document:** 09-multi-tenancy.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 45% (13/29 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No RLS on event tables, No SET LOCAL app.current_tenant_id |
| HIGH | 1 | searchEvents method missing tenant filter |
| MEDIUM | 2 | Redis cache keys missing tenant prefix, Rate limits not tenant-scoped |
| LOW | 1 | No UUID format validation in tenant middleware |

---

## PostgreSQL RLS Configuration (1/7)

| Check | Status | Evidence |
|-------|--------|----------|
| RLS enabled on tenant tables | FAIL | No ENABLE ROW LEVEL SECURITY in migration |
| FORCE ROW LEVEL SECURITY | FAIL | Not implemented |
| RLS policies use current_setting | FAIL | No RLS policies exist |
| Policies handle NULL safely | FAIL | No policies |
| USING and WITH CHECK clauses | FAIL | No policies |
| Audit logging for cross-tenant | PASS | audit_trigger_function attached |

**Critical Gap:** Other services (auth, venue, ticket, order, marketplace) all have RLS. Event-service does NOT.

---

## JWT Claims & Middleware (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| JWT contains tenant_id | PASS | user.tenant_id extracted |
| Tenant from verified JWT only | PASS | Only from request.user |
| JWT verified before extraction | PASS | Requires auth middleware first |
| Middleware sets tenant context | PASS | request.tenantId = tenantId |
| Missing tenant returns 401/400 | PASS | Returns 400 for missing |
| Tenant ID format validated | PARTIAL | No explicit UUID validation |
| Body tenant fields ignored | PASS | Uses param tenantId, not body |

---

## Knex Query Patterns (4/9)

| Check | Status | Evidence |
|-------|--------|----------|
| Queries in tenant context transaction | FAIL | No SET LOCAL calls |
| SET LOCAL app.current_tenant_id | FAIL | Not implemented |
| Tenant-scoped query wrapper | FAIL | Direct this.db() calls |
| JOIN queries filter by tenant | PASS | Joins include tenant_id |
| Subqueries include tenant filter | PASS | checkForDuplicateEvent filters |
| INSERT includes tenant_id | PASS | tenant_id in eventData |
| Raw SQL includes tenant | PASS | No raw SQL without tenant |
| No hardcoded tenant IDs | PARTIAL | Default tenant in migrations |
| Query wrapper prevents dangerous patterns | FAIL | No wrapper |

---

## Shared Resources (0/2)

| Check | Status | Evidence |
|-------|--------|----------|
| Redis keys prefixed with tenant | FAIL | Uses `venue:events:${venue_id}` - NO TENANT |
| Cache invalidation scoped | FAIL | No tenant in cache keys |

---

## API Endpoints (3/5)

| Check | Status | Evidence |
|-------|--------|----------|
| Routes use tenant middleware | PASS | tenantHook imported |
| Error responses don't leak | PASS | Generic NotFoundError |
| Pagination filters by tenant | PASS | listEvents filters |
| Search filters by tenant | FAIL | searchEvents has NO tenant filter |
| Rate limits per-tenant | PARTIAL | Exists but not tenant-scoped |

---

## Comparison with Other Services

| Service | RLS Enabled | Session Variable |
|---------|-------------|------------------|
| auth-service | ✅ YES | ✅ YES |
| venue-service | ✅ YES | ✅ YES |
| ticket-service | ✅ YES | ✅ YES |
| order-service | ✅ YES | ✅ YES |
| marketplace-service | ✅ YES | ✅ YES |
| **event-service** | ❌ **NO** | ❌ **NO** |

---

## Remediation Priority

### CRITICAL (Immediate - Security Gap)
1. **Add RLS migration:**
```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON events
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
-- Repeat for event_schedules, event_capacity, event_pricing, event_metadata
```

2. **Add SET LOCAL to transactions:**
```typescript
await trx.raw(`SET LOCAL app.current_tenant_id = ?`, [tenantId]);
```

### HIGH (This Week)
1. Add tenant filter to searchEvents method in event.model.ts

### MEDIUM (This Month)
1. Add tenant prefix to Redis cache keys: `tenant:${tenantId}:venue:events:${venueId}`
2. Add tenant-scoped rate limiting

### LOW (Backlog)
1. Add UUID format validation in tenant middleware
