# Blockchain Service - 09 Multi-Tenancy Audit

**Service:** blockchain-service
**Document:** 09-multi-tenancy.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 11% (5/47 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | Tenant from header/default, No tenant in jobs, Hardcoded default tenant, No bulk validation, No FORCE RLS |
| HIGH | 5 | No WITH CHECK, Tenant as parameter, No UUID validation, Shared queue, Missing tenant in WHERE |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## PostgreSQL RLS (2/10)

- RLS enabled on tables - PASS
- FORCE RLS - FAIL
- Non-superuser role - PARTIAL
- No BYPASSRLS - PARTIAL
- current_setting used - PASS
- NULL handled safely - PARTIAL
- WITH CHECK clause - FAIL
- System operations - FAIL
- Audit logging - FAIL

## Knex Query Patterns (0/7)

- Queries in tenant context - FAIL
- SET LOCAL called - PARTIAL
- Tenant-scoped wrapper - FAIL
- INSERT includes tenant_id - PARTIAL
- Raw SQL has tenant - PARTIAL
- No hardcoded tenant IDs - FAIL

## JWT Claims & Middleware (2/10)

- JWT contains tenant_id - PARTIAL
- Tenant from verified JWT only - FAIL
- JWT signature verified - PASS
- Middleware sets context - PASS
- Missing tenant returns 401 - FAIL
- UUID format validated - FAIL
- URL tenant validated - FAIL

## Background Jobs (0/10)

- Job payloads include tenant_id - FAIL
- Processor validates tenant - FAIL
- DB context set before job - FAIL
- All remaining checks - FAIL

## Shared Resources (0/3)

- Redis keys tenant-prefixed - FAIL
- Cache scoped to tenant - FAIL
- Rate limiting per-tenant - FAIL

## API Endpoints (1/4)

- Routes use tenant middleware - PASS
- Errors no cross-tenant data - PARTIAL
- Bulk validates tenant - FAIL

## Critical Evidence

### Tenant from Header (CRITICAL)
```typescript
// tenant-context.ts
if (!tenantId && request.headers['x-tenant-id']) {
  tenantId = request.headers['x-tenant-id']; // Spoofable!
}
if (!tenantId) {
  tenantId = 'default'; // Falls back to default!
}
```

### No Tenant in Jobs (CRITICAL)
```typescript
interface MintJobData {
  ticketId: string;
  userId: string;
  // No tenant_id!
}
```

### Hardcoded Default Tenant
```typescript
table.uuid('tenant_id').notNullable()
  .defaultTo('00000000-0000-0000-0000-000000000001')
```

## Critical Remediations

### P0: Fix Tenant Context Middleware
```typescript
if (!user?.tenant_id) {
  return reply.code(401).send({ error: 'Missing tenant' });
}
// NEVER accept from header or use default
```

### P0: Add Tenant to Job Payloads
```typescript
interface MintJobData {
  ticketId: string;
  tenantId: string; // Required!
}
```

### P0: Remove Default Tenant
```typescript
table.uuid('tenant_id').notNullable(); // No default
```

### P0: Add FORCE RLS
```sql
ALTER TABLE wallet_addresses FORCE ROW LEVEL SECURITY;
```

### P1: Add WITH CHECK Clause
```sql
CREATE POLICY tenant_policy ON wallet_addresses
  USING (tenant_id::text = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));
```

## Strengths

- RLS enabled on all 6 tables
- Uses current_setting for tenant context
- Tenant middleware registered globally
- JWT signature verified before extraction

Multi-Tenancy Score: 11/100
