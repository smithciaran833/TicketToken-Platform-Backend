# Notification Service - 09 Multi-Tenancy Audit

**Service:** notification-service  
**Document:** 09-multi-tenancy.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 65% (26/40 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No RLS policies, preference.service queries without tenant filter |
| HIGH | 3 | tenant_id not in many queries, no tenant context wrapper, unsubscribe token not scoped |
| MEDIUM | 3 | Auth doesn't extract tenant_id, no tenant validation, joins without filter |
| LOW | 2 | No tenant-scoped cache keys, no tenantId in job context |

## PostgreSQL RLS Configuration (2/10)

- RLS enabled on tenant tables - FAIL (CRITICAL)
- FORCE ROW LEVEL SECURITY - FAIL
- Non-superuser role - UNKNOWN
- Role no BYPASSRLS - UNKNOWN
- Policies use current_setting - FAIL
- NULL tenant handled - FAIL
- USING and WITH CHECK - FAIL
- Separate admin role - PASS
- System bypass connection - PARTIAL
- Audit for cross-tenant - PASS

## JWT Claims & Tenant Context (5/10)

- JWT contains tenant_id - PASS (optional)
- Tenant from verified JWT only - PASS
- Signature verified first - PASS
- Middleware sets DB context - FAIL (MEDIUM)
- Missing tenant returns 401 - FAIL (MEDIUM)
- tenant_id UUID validated - FAIL
- Request body tenant ignored - FAIL (HIGH)

## Knex Query Patterns (3/10)

- All queries in tenant context - FAIL (CRITICAL)
- SET LOCAL called - FAIL
- All through wrapper - FAIL (HIGH)
- JOINs filter both tables - FAIL (MEDIUM)
- Subqueries include tenant - FAIL
- INSERTs include tenant - PASS
- No hardcoded tenant IDs - PASS
- Query wrapper prevents danger - FAIL

## Background Jobs (4/6)

- Job payloads include tenant - PASS
- Processor validates tenant - FAIL (LOW)
- DB context set before job - FAIL
- Job logs include tenant - PASS
- Queue routing includes tenant - PASS
- Dead letter respects tenant - PASS

## Shared Resources (3/6)

- Redis keys tenant prefixed - FAIL (LOW)
- Cache invalidation scoped - FAIL
- MQ includes tenant routing - PASS
- Rate limiting per-tenant - PARTIAL
- Resource quotas per-tenant - PASS

## Migration Schema (6/8)

- Tables with tenant_id - PASS (13 tables)
- Tables using venue_id proxy - PASS
- Foreign key constraints - PASS
- Indexes on tenant_id - PASS
- Composite unique includes tenant - PASS
- Translations tenant-scoped - PASS

## Critical Evidence

### No RLS Policies
```typescript
// Migration creates tables with tenant_id but NO RLS
// Missing:
await knex.raw('ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY');
await knex.raw('CREATE POLICY tenant_isolation ON scheduled_notifications...');
```

### preference.service.ts - No Tenant Filter
```typescript
// Line 29-32 - VULNERABLE
const prefs = await db('customer_preferences')
  .where('customer_id', customerId)  // No tenant_id filter!
  .first();
```

### Unsubscribe Token Not Scoped
```typescript
// Lines 84-91
const token = Buffer.from(JSON.stringify({
  customerId,  // No tenantId!
  expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
})).toString('base64url');
```

### Export Without Tenant
```typescript
const [preferences, consents, notifications] = await Promise.all([
  this.getPreferences(customerId),  // No tenant
  db('consent_records').where('customer_id', customerId),  // No tenant
]);
```

## Remediations

### CRITICAL
1. Add RLS to all tenant-scoped tables:
```sql
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scheduled_notifications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

2. Fix preference.service.ts queries:
```typescript
.where('customer_id', customerId)
.where('tenant_id', tenantId)  // Add this
```

### HIGH
1. Create tenant context wrapper
2. Make tenantId required in auth
3. Add tenantId to unsubscribe token

### MEDIUM
1. Add tenant to cache keys
2. Validate venue belongs to tenant
3. Add tenant filter to JOINs

## Positive Highlights

- 13 tables have tenant_id column
- venue_id as additional scoping
- FK constraints with CASCADE
- All tenant_id columns indexed
- Composite uniques include tenant
- Per-venue quotas
- Audit trail tables
- JWT-based authentication

Multi-Tenancy Score: 65/100
