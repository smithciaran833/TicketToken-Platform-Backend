# ADR-001: Multi-Tenant Data Isolation via Row-Level Security

## Status
Accepted

## Date
2024-12-30

## Context

The Venue Service manages data for multiple tenants (organizations/customers) in a shared database. We need to ensure strict data isolation to prevent:
- Tenant A from accessing Tenant B's venues, settings, or integrations
- Cross-tenant data leakage in API responses
- Accidental exposure through query bugs or missing WHERE clauses

### Requirements
1. All tenant data must be isolated at the database level
2. Application-level bugs should not be able to bypass isolation
3. Performance impact should be minimal
4. Solution must work with existing Knex.js query builder

## Decision

We will implement **Row-Level Security (RLS)** at the PostgreSQL database level as the primary tenant isolation mechanism.

### Implementation Details

1. **Add `tenant_id` column** to all multi-tenant tables:
   ```sql
   ALTER TABLE venues ADD COLUMN tenant_id UUID NOT NULL;
   CREATE INDEX idx_venues_tenant_id ON venues(tenant_id);
   ```

2. **Enable RLS on tables**:
   ```sql
   ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
   ALTER TABLE venues FORCE ROW LEVEL SECURITY;
   ```

3. **Create RLS policies**:
   ```sql
   CREATE POLICY tenant_isolation_select ON venues
     FOR SELECT
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   
   CREATE POLICY tenant_isolation_insert ON venues
     FOR INSERT
     WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
   
   CREATE POLICY tenant_isolation_update ON venues
     FOR UPDATE
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
   
   CREATE POLICY tenant_isolation_delete ON venues
     FOR DELETE
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   ```

4. **Set tenant context per request**:
   ```typescript
   await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
   ```

## Consequences

### Positive
- **Defense in depth**: Even if application code has bugs, RLS prevents cross-tenant access
- **Consistent enforcement**: All queries automatically filtered
- **Audit trail**: Database-level security is easier to audit
- **Performance**: RLS policies are optimized by PostgreSQL query planner

### Negative
- **Complexity**: Requires careful management of tenant context in connection pool
- **Migrations**: All existing data needs tenant_id backfilled
- **Testing**: Need to test with RLS enabled and disabled
- **Superuser bypass**: BYPASSRLS privilege must be carefully controlled

### Risks
- If tenant context is not set, queries will fail (fail-safe)
- Connection pooling requires SET LOCAL (per-transaction) not SET (per-session)
- Need to handle cases where superuser access is legitimately needed

## Alternatives Considered

### 1. Application-Level Filtering Only
- **Rejected**: Single WHERE clause bug could leak all tenant data

### 2. Separate Databases per Tenant
- **Rejected**: Operational complexity too high for current scale

### 3. Schema-per-Tenant
- **Rejected**: Migration complexity, connection pool management issues

## Implementation Checklist

- [x] Add tenant_id to venues table
- [x] Add tenant_id to integrations table
- [x] Add tenant_id to venue_settings table
- [x] Create RLS policies for all tables
- [x] Update application to set tenant context
- [x] Create TenantAwareQueryBuilder utility
- [x] Add integration tests for tenant isolation
- [x] Document in SECURITY.md

## References
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant SaaS Patterns](https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/multi-tenant-saas-storage-strategies.html)
