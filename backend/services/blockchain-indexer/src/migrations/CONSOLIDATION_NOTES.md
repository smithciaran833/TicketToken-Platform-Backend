# Blockchain Indexer - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 3 files |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 7 (6 tenant-scoped, 1 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_blockchain_indexer.ts | Initial 6 tables, basic RLS |
| 20260102_add_failed_writes_table.ts | Dead letter queue table |
| 20260102_add_rls_force.ts | FORCE RLS (partial, wrong table names) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default (`00000000-0000-0000-0000-000000000001`) | Removed — tenant_id now required |
| 2 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 3 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 4 | Text cast in RLS (`tenant_id::text`) | Changed to `NULLIF(..., '')::uuid` |
| 5 | No FORCE RLS | Added to all 6 tenant tables |
| 6 | No WITH CHECK clause | Added to all RLS policies |
| 7 | No system bypass | Added `app.is_system_user` check |
| 8 | External FKs enforced | Converted to comments (cross-service) |
| 9 | Phantom tables in RLS file | Ignored (`wallet_activity`, `marketplace_events`, `nft_ownership` don't exist) |

---

## Tables Summary

### Tenant-Scoped Tables (6) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `indexer_state` | Singleton state tracking | last_processed_slot, is_running |
| `indexed_transactions` | Processed blockchain transactions | signature, slot, instruction_type |
| `marketplace_activity` | NFT marketplace events | token_id, marketplace, activity_type, price |
| `reconciliation_runs` | Reconciliation job tracking | status, tickets_checked, discrepancies_found |
| `ownership_discrepancies` | DB vs blockchain mismatches | ticket_id, discrepancy_type, resolved |
| `reconciliation_log` | Reconciliation change history | field_name, old_value, new_value |

### Global Tables (1) — No RLS

| Table | Purpose | Reason for No RLS |
|-------|---------|-------------------|
| `failed_mongodb_writes` | Dead letter queue for failed writes | System-level error tracking, not tenant-specific |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `marketplace_activity.ticket_id` | tickets(id) | ticket-service |
| `ownership_discrepancies.ticket_id` | tickets(id) | ticket-service |
| `reconciliation_log.ticket_id` | tickets(id) | ticket-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `indexer_state.tenant_id` | tenants(id) | RESTRICT |
| `indexed_transactions.tenant_id` | tenants(id) | RESTRICT |
| `marketplace_activity.tenant_id` | tenants(id) | RESTRICT |
| `reconciliation_runs.tenant_id` | tenants(id) | RESTRICT |
| `ownership_discrepancies.tenant_id` | tenants(id) | RESTRICT |
| `reconciliation_log.tenant_id` | tenants(id) | RESTRICT |
| `reconciliation_log.reconciliation_run_id` | reconciliation_runs(id) | CASCADE |

---

## RLS Policy Pattern

Applied to all 6 tenant-scoped tables:
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

## Ignored Items

| Item | Reason |
|------|--------|
| `wallet_activity` table | Referenced in RLS file but doesn't exist |
| `marketplace_events` table | Referenced in RLS file but doesn't exist (actual table is `marketplace_activity`) |
| `nft_ownership` table | Referenced in RLS file but doesn't exist |

---

## Breaking Changes

1. **tenant_id now required** — No default value, must be explicitly provided on INSERT
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references to `tickets` no longer enforced at DB level

---

## Migration Instructions

### For New Environments
Run consolidated baseline only:
```bash
npx knex migrate:latest
```

### For Existing Environments
If original migrations were already applied:
1. Mark them as complete in knex_migrations table
2. OR drop and recreate schema using consolidated baseline

---

## Files
```
backend/services/blockchain-indexer/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation (preserved)
└── archived/                       # Original migration files
    ├── 001_baseline_blockchain_indexer.ts
    ├── 20260102_add_failed_writes_table.ts
    └── 20260102_add_rls_force.ts
```
