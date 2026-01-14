# Blockchain Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 9 files (001-009) |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 9 (6 tenant-scoped, 3 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_blockchain_service.ts | Initial 6 tables, basic RLS |
| 002_add_rls_force_and_fix_tenant_defaults.ts | FORCE RLS, remove zero UUID defaults |
| 003_add_check_constraints.ts | CHECK constraints for validation |
| 004_add_migration_safety.ts | migration_config table, safety helpers |
| 005_add_wallet_soft_delete_columns.ts | Soft delete columns |
| 006_add_partial_unique_indexes.ts | Partial indexes for soft delete |
| 007_fix_foreign_key_actions.ts | CASCADE → RESTRICT |
| 008_ensure_extensions.ts | PostgreSQL extensions |
| 009_add_orphan_tables.ts | queue_jobs table |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default (`00000000-0000-0000-0000-000000000001`) | Removed — tenant_id now required |
| 2 | Wrong RLS pattern (text cast) | Changed to `NULLIF(..., '')::uuid` |
| 3 | Wrong setting name (`app.is_admin`) | Changed to `app.is_system_user` |
| 4 | No FORCE RLS | Added to all 6 tenant tables |
| 5 | 4 separate policies per table | Consolidated to single FOR ALL policy |
| 6 | NULL tenant bypass (`OR current_tenant_id() IS NULL`) | Removed — was security hole |
| 7 | External FKs enforced | Converted to comments (cross-service) |
| 8 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 9 | `user_wallet_connections.deleted_at` missing | Added for partial indexes |
| 10 | Helper functions (`current_tenant_id()`, `is_admin_user()`) | Removed — inline pattern |
| 11 | `blockchain_app` role creation | Excluded — infra concern |
| 12 | Extensions (`uuid-ossp`, `pgcrypto`) | Removed — PostgreSQL 13+ native |

---

## Tables Summary

### Tenant-Scoped Tables (6) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `wallet_addresses` | User wallet registry | user_id, wallet_address, blockchain_type |
| `user_wallet_connections` | Wallet connection history | user_id, wallet_address, connected_at |
| `treasury_wallets` | Platform treasury wallets | wallet_address, purpose, balance |
| `blockchain_events` | Blockchain event log | event_type, program_id, slot |
| `blockchain_transactions` | Transaction records | ticket_id, type, status, transaction_signature |
| `mint_jobs` | NFT minting queue | order_id, ticket_id, status, nft_address |

### Global Tables (3) — No RLS

| Table | Purpose | Reason for No RLS |
|-------|---------|-------------------|
| `blockchain_tenant_audit` | Cross-tenant security audit log | Needs to track all tenant activity |
| `migration_config` | Platform-wide migration settings | Infrastructure table |
| `queue_jobs` | Job queue for background workers | Workers process across all tenants |

---

## External FK References (Comments Only)

| Table | Column | References | Service |
|-------|--------|------------|---------|
| `wallet_addresses` | user_id | users(id) | auth-service |
| `user_wallet_connections` | user_id | users(id) | auth-service |
| `blockchain_transactions` | ticket_id | tickets(id) | ticket-service |
| `mint_jobs` | order_id | orders(id) | order-service |
| `mint_jobs` | ticket_id | tickets(id) | ticket-service |

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

## CHECK Constraints

Applied to `blockchain_transactions`:

| Constraint | Rule |
|------------|------|
| `chk_blockchain_transactions_type` | IN ('MINT', 'TRANSFER', 'BURN', 'METADATA_UPDATE', 'VERIFY_COLLECTION') |
| `chk_blockchain_transactions_status` | IN ('PENDING', 'MINTING', 'PROCESSING', 'CONFIRMED', 'FINALIZED', 'FAILED', 'EXPIRED') |
| `chk_blockchain_transactions_slot_non_negative` | slot_number IS NULL OR slot_number >= 0 |
| `chk_blockchain_transactions_signature_length` | length BETWEEN 64 AND 128 |
| `chk_blockchain_transactions_mint_address_length` | length BETWEEN 32 AND 44 |

---

## Enum Types

| Type | Values |
|------|--------|
| `queue_job_status` | 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED' |

---

## Index Summary

| Table | Index Count | Notable Indexes |
|-------|-------------|-----------------|
| `wallet_addresses` | 9 | Partial unique for soft delete |
| `user_wallet_connections` | 7 | Partial unique for soft delete |
| `treasury_wallets` | 4 | Standard |
| `blockchain_events` | 7 | Composite for type+processed |
| `blockchain_transactions` | 6 | Standard |
| `mint_jobs` | 6 | Composite for status+created |
| `blockchain_tenant_audit` | 2 | Standard |
| `migration_config` | 0 | PK only |
| `queue_jobs` | 8 | Multiple partial for status filtering |

---

## Breaking Changes

1. **tenant_id now required** — No default value, must be explicitly provided on INSERT
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level

---

## Migration Instructions

### For New Environments
Run consolidated baseline only:
```bash
npx knex migrate:latest
```

### For Existing Environments
If original migrations (001-009) were already applied:
1. Mark them as complete in knex_migrations table
2. OR drop and recreate schema using consolidated baseline

---

## Files
```
backend/services/blockchain-service/src/migrations/
├── 001_consolidated_baseline.ts    # New consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation (preserved)
└── archived/                       # Original 9 migration files
    ├── 001_baseline_blockchain_service.ts
    ├── 002_add_rls_force_and_fix_tenant_defaults.ts
    ├── 003_add_check_constraints.ts
    ├── 004_add_migration_safety.ts
    ├── 005_add_wallet_soft_delete_columns.ts
    ├── 006_add_partial_unique_indexes.ts
    ├── 007_fix_foreign_key_actions.ts
    ├── 008_ensure_extensions.ts
    └── 009_add_orphan_tables.ts
```
