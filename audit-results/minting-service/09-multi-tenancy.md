# Minting Service - 09 Multi-Tenancy Audit

**Service:** minting-service
**Document:** 09-multi-tenancy.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 10% (5/52 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | Tenant from body not JWT, Admin unprotected, Queries unfiltered, RLS context never set, Superuser default |
| HIGH | 4 | No FORCE RLS, No WITH CHECK, Cache not tenant-scoped, Webhook no tenant |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 1. PostgreSQL RLS (3/10)

- RLS enabled - PASS
- FORCE RLS - FAIL
- Non-superuser role - PARTIAL (defaults to postgres)
- Role without BYPASSRLS - FAIL
- current_setting used - PASS
- NULL tenant safe - PASS
- WITH CHECK clause - FAIL
- Migration admin role - FAIL
- System bypass connection - FAIL
- Audit logging - FAIL

## 2. Knex Query Patterns (0/10)

- Tenant context transaction - FAIL
- SET LOCAL called - FAIL
- Tenant-scoped wrapper - FAIL
- JOIN filters - PARTIAL (no JOINs)
- Subqueries filter - FAIL
- INSERT includes tenant - PARTIAL
- Raw SQL tenant param - PARTIAL
- Migration admin connection - FAIL
- No hardcoded tenants - PARTIAL
- Query wrapper prevents dangerous - FAIL

## 3. JWT Claims & Middleware (2/10)

- JWT contains tenant_id - PARTIAL
- Tenant from verified JWT - FAIL
- JWT signature verified - PARTIAL
- Middleware sets context - FAIL
- Missing tenant returns 401 - FAIL
- Tenant format validated - PASS
- URL tenant vs JWT - FAIL
- Body tenant ignored - FAIL
- Multi-tenant users - FAIL
- Active tenant header - FAIL

## 4. Background Jobs (0/10)

- Job payloads include tenant - FAIL
- Processor validates tenant - PARTIAL
- DB context before job - FAIL
- Error no tenant leak - PARTIAL
- Retries maintain context - PARTIAL
- Recurring jobs isolated - FAIL
- Logs include tenant - PARTIAL
- Queue names include tenant - FAIL
- DLQ respects tenant - FAIL
- Scheduling per tenant - FAIL

## 5. Shared Resources (0/5)

- Redis keys tenant prefixed - FAIL
- Cache invalidation scoped - FAIL
- Message queue tenant routing - FAIL
- Rate limiting per-tenant - FAIL
- No global cache leaks - FAIL

## 6. API Endpoints (0/7)

- Routes use tenant middleware - FAIL
- Errors no cross-tenant - PARTIAL
- Pagination tenant filtered - FAIL
- Bulk validates tenant - FAIL
- Webhooks validate tenant - FAIL
- Rate limits per-tenant - FAIL
- Admin additional auth - FAIL

## Critical Evidence

### Tenant from Body (CRITICAL)
```typescript
// routes/internal-mint.ts:36
const { tenantId } = validation.data; // From body, not JWT!
```

### Admin Routes Unprotected (CRITICAL)
```typescript
// routes/admin.ts:14
// Authentication should be added in production
```

### Queries Unfiltered (CRITICAL)
```typescript
// routes/admin.ts:178-182
const mints = await db('ticket_mints')
  .orderBy('created_at', 'desc')
  .limit(100)  // Returns ALL tenants!
```

### RLS Context Never Set (CRITICAL)
No SET LOCAL app.current_tenant_id anywhere in codebase

### Superuser Default (CRITICAL)
```typescript
// config/database.ts:9
user: process.env.DB_USER || 'postgres'
```

## Remediations

### P0: Extract Tenant from JWT
```typescript
const tenantId = request.user.tenant_id; // From verified JWT
```

### P0: Add Auth Middleware to Admin
```typescript
fastify.addHook('preHandler', authMiddleware);
```

### P0: Set RLS Context
```typescript
async function withTenantContext(tenantId, fn) {
  await knex.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  return fn();
}
```

### P0: Create Non-Superuser Role
```sql
CREATE ROLE app_user NOINHERIT;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES TO app_user;
```

### P1: Add Tenant to Cache Keys
```typescript
private prefixKey(tenantId, key) {
  return `minting:${tenantId}:${key}`;
}
```

## Strengths

- RLS enabled on all tables
- RLS policies use current_setting
- NULL tenant handled safely
- tenant_id format validated (UUID)
- Some logs include tenant_id

Multi-Tenancy Score: 10/100
