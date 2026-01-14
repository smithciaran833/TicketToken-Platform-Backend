# Minting Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 (Updated) |
| **Source Migrations** | 6 files |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 6 (5 tenant-scoped, 1 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_minting.ts | Initial 5 tables |
| 20260102_add_check_constraints.ts | CHECK constraints on nft_mints |
| 20260102_add_foreign_keys.ts | FKs + additional nft_mints columns |
| 20260102_add_rls_policies.ts | RLS + audit table |
| 20260102_create_app_user_role.ts | minting_app role (excluded) |
| 20260102_migration_best_practices.ts | Indexes + extensions (excluded) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default on tenant_id | Removed — tenant_id now required |
| 2 | Wrong RLS pattern | Changed to NULLIF + app.is_system_user |
| 3 | No FORCE RLS | Added to all 5 tenant tables |
| 4 | Missing columns in nft_mints | Added 6 columns (see below) |
| 5 | Column name: transaction_hash | Renamed to transaction_signature |
| 6 | Column name: error | Renamed to error_message |
| 7 | Missing nft_mints_audit table | Added with trigger |
| 8 | Missing CHECK constraints | Added 8 constraints on nft_mints |
| 9 | Helper functions | Removed — use inline pattern |
| 10 | minting_app role | Excluded — infra concern |
| 11 | Extensions (pgcrypto, uuid-ossp) | Excluded — PostgreSQL 13+ native |
| 12 | Missing updated_at trigger on nft_mints | Added |

---

## Tables Summary

### Tenant-Scoped Tables (5) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `collections` | NFT collection registry | name, symbol, contract_address, blockchain |
| `nft_mints` | Mint job tracking | ticket_id, mint_address, asset_id, status |
| `nfts` | Minted NFT records | token_id, contract_address, owner_address |
| `ticket_mints` | Ticket-to-mint mapping | ticket_id, venue_id, status |
| `minting_reconciliation_reports` | Reconciliation reports | venue_id, report_date, discrepancy_count |

### Global Tables (1) — No RLS

| Table | Purpose | Reason for No RLS |
|-------|---------|-------------------|
| `nft_mints_audit` | Audit log for nft_mints operations | Needs to track all tenant activity |

---

## nft_mints Schema (Updated)

| Column | Type | Status | Notes |
|--------|------|--------|-------|
| id | uuid | Original | PK |
| tenant_id | uuid | Original | NOT NULL |
| ticket_id | uuid | Original | NOT NULL, FK comment |
| nft_id | uuid | Original | |
| transaction_signature | varchar(255) | **Renamed** | Was transaction_hash |
| mint_address | varchar(255) | **Added** | Solana mint address |
| asset_id | varchar(255) | **Added** | Compressed NFT asset ID |
| metadata_uri | text | **Added** | IPFS/Arweave link |
| merkle_tree | varchar(255) | **Added** | Compressed NFT tree |
| owner_address | varchar(255) | **Added** | NFT owner wallet |
| blockchain | varchar(50) | Original | NOT NULL |
| status | varchar(50) | Original | NOT NULL, CHECK constraint |
| retry_count | integer | Original | CHECK 0-10 |
| error_message | text | **Renamed** | Was error |
| created_at | timestamp | Original | |
| updated_at | timestamp | **Added** | With trigger |
| completed_at | timestamp | Original | |

---

## CHECK Constraints

### On `nft_mints` (8 constraints)

| Constraint | Rule |
|------------|------|
| `ck_nft_mints_status` | IN ('pending', 'minting', 'completed', 'failed', 'cancelled') |
| `ck_nft_mints_retry_count` | >= 0 AND <= 10 |
| `ck_nft_mints_blockchain` | IN ('solana', 'solana-devnet', 'solana-testnet') |
| `ck_nft_mints_mint_address_length` | NULL OR length 32-64 |
| `ck_nft_mints_signature_length` | NULL OR length 64-128 |
| `ck_nft_mints_metadata_uri_format` | NULL OR matches ^(https?://|ipfs://|ar://) |
| `ck_nft_mints_completed_at` | status='completed' → completed_at NOT NULL |
| `ck_nft_mints_timestamps` | created_at <= updated_at |

### On `ticket_mints` (1 constraint)

| Constraint | Rule |
|------------|------|
| `ck_ticket_mints_status` | IN ('pending', 'minting', 'minted', 'failed') |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `nft_mints.ticket_id` | tickets(id) | ticket-service |
| `ticket_mints.ticket_id` | tickets(id) | ticket-service |
| `ticket_mints.venue_id` | venues(id) | venue-service |
| `minting_reconciliation_reports.venue_id` | venues(id) | venue-service |

---

## RLS Policy Pattern

Applied to all 5 tenant-scoped tables:
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

## Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update updated_at on row changes |
| `nft_mints_audit_trigger()` | Insert audit records on nft_mints changes |

---

## Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| `update_collections_updated_at` | collections | update_updated_at_column() |
| `update_nft_mints_updated_at` | nft_mints | update_updated_at_column() |
| `update_nfts_updated_at` | nfts | update_updated_at_column() |
| `update_ticket_mints_updated_at` | ticket_mints | update_updated_at_column() |
| `nft_mints_audit` | nft_mints | nft_mints_audit_trigger() |

---

## Excluded Items (Infra Concerns)

| Item | Reason |
|------|--------|
| `minting_app` role | Database role management is infra |
| `current_tenant_id()` function | Using inline NULLIF pattern |
| `is_admin_user()` function | Using `app.is_system_user` setting |
| `pgcrypto` extension | PostgreSQL 13+ native gen_random_uuid() |
| `uuid-ossp` extension | Not needed |
| `mints` table indexes | File referenced wrong table name |

---

## Breaking Changes

1. **tenant_id now required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **Column renames** — `transaction_hash` → `transaction_signature`, `error` → `error_message`
4. **External FKs removed** — Cross-service references no longer enforced at DB level

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
backend/services/minting-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
└── archived/                       # Original migration files
    ├── 001_baseline_minting.ts
    ├── 20260102_add_check_constraints.ts
    ├── 20260102_add_foreign_keys.ts
    ├── 20260102_add_rls_policies.ts
    ├── 20260102_create_app_user_role.ts
    ├── 20260102_migration_best_practices.ts
    └── MIGRATIONS.md
```
