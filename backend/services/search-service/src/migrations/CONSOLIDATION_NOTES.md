# Search Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 1 file |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 3 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_search_consistency_tables.ts | Initial 3 tables for search consistency |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default on tenant_id | Removed — tenant_id now required |
| 2 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 3 | Text cast in RLS | Changed to NULLIF pattern |
| 4 | No FORCE RLS | Added to all 3 tables |
| 5 | No WITH CHECK clause | Added to all RLS policies |
| 6 | No system bypass | Added `app.is_system_user` check |

---

## Tables Summary

### Tenant-Scoped Tables (3) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `index_versions` | Track index versions for consistency | entity_type, entity_id, version, index_status |
| `index_queue` | Pending index operations | entity_type, operation, payload, priority |
| `read_consistency_tokens` | Client read tracking | token, client_id, required_versions, expires_at |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `index_versions.tenant_id` | tenants(id) | RESTRICT |
| `index_queue.tenant_id` | tenants(id) | RESTRICT |
| `read_consistency_tokens.tenant_id` | tenants(id) | RESTRICT |

---

## RLS Policy Pattern

Applied to all 3 tenant-scoped tables:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

CREATE POLICY {table}_tenant_isolation ON {table}
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  );
```

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`

---

## Files
```
backend/services/search-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    └── 001_search_consistency_tables.ts
```
