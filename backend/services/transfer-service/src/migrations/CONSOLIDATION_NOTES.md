# Transfer Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 13, 2026 |
| **Source Migrations** | 3 files |
| **Consolidated To** | 001_baseline_transfer_service.ts |
| **Total Tables** | 10 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_transfer.ts | Initial 8 tables, wrong RLS, references missing table |
| 002_add_orphan_tables.ts | 2 tables without tenant_id |
| 20260103_add_rls_policies.ts | RLS for non-existent tables (transfers, blockchain_transfers) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `batch_transfers` had string PK | Changed to UUID PK |
| 2 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 3 | Zero UUID default on tenant_id | Removed default |
| 4 | External FK to tenants table | Removed |
| 5 | External FKs to tickets, users, ticket_transfers | Converted to comments |
| 6 | `webhook_deliveries` missing tenant_id | Added |
| 7 | `failed_blockchain_transfers` missing tenant_id | Added |
| 8 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 9 | No FORCE RLS | Added to all 10 tables |
| 10 | No WITH CHECK clause | Added to all RLS policies |
| 11 | No system bypass | Added `app.is_system_user` check |
| 12 | `promotional_codes.code` global unique | Changed to unique per tenant |
| 13 | `user_blacklist.user_id` global unique | Changed to unique per tenant |
| 14 | RLS migration targeted wrong tables | Ignored (transfers, blockchain_transfers don't exist) |
| 15 | `set_tenant_id()` function | Removed |
| 16 | `clear_tenant_context()` function | Removed |
| 17 | `app_user` role | Excluded (infra concern) |

---

## Tables Summary

### All Tables Are Tenant-Scoped (10) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ticket_transactions` | Transaction history | ticket_id, user_id, transaction_type, amount |
| `batch_transfers` | Bulk transfer operations | user_id, total_items, success/failure counts |
| `batch_transfer_items` | Batch transfer details | batch_id, ticket_id, transfer_id, status |
| `promotional_codes` | Discount codes | code, discount_percentage, discount_flat |
| `transfer_fees` | Fee tracking | transfer_id, base_fee, platform_fee, total_fee |
| `transfer_rules` | Business rules engine | rule_name, rule_type, config |
| `user_blacklist` | Fraud prevention | user_id, reason, expires_at |
| `webhook_subscriptions` | Event notification config | url, events, secret |
| `webhook_deliveries` | Webhook delivery tracking | subscription_id, status, http_status |
| `failed_blockchain_transfers` | Blockchain retry queue | transfer_id, error_message, retry_count |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `ticket_transactions.ticket_id` | tickets(id) | ticket-service |
| `ticket_transactions.user_id` | users(id) | auth-service |
| `batch_transfers.user_id` | users(id) | auth-service |
| `batch_transfer_items.ticket_id` | tickets(id) | ticket-service |
| `batch_transfer_items.transfer_id` | ticket_transfers(id) | ticket-service |
| `transfer_fees.transfer_id` | ticket_transfers(id) | ticket-service |
| `transfer_rules.ticket_type_id` | ticket_types(id) | ticket-service |
| `transfer_rules.event_id` | events(id) | event-service |
| `user_blacklist.user_id` | users(id) | auth-service |
| `user_blacklist.blacklisted_by` | users(id) | auth-service |
| `failed_blockchain_transfers.transfer_id` | ticket_transfers(id) | ticket-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `batch_transfer_items.batch_id` | batch_transfers(id) | CASCADE |
| `webhook_deliveries.subscription_id` | webhook_subscriptions(id) | CASCADE |

---

## Unique Constraints

| Table | Columns | Notes |
|-------|---------|-------|
| `promotional_codes` | (tenant_id, code) | Unique per tenant |
| `user_blacklist` | (tenant_id, user_id) | Unique per tenant |
| `transfer_fees` | (transfer_id) | One fee record per transfer |
| `failed_blockchain_transfers` | (transfer_id) | One failure record per transfer |

---

## CHECK Constraints

| Constraint | Table | Rule |
|------------|-------|------|
| `chk_retry_count_positive` | failed_blockchain_transfers | `retry_count >= 0` |

---

## RLS Policy Pattern

Applied to all 10 tables:
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

## Key Design Decision: ticket_transfers Location

The `ticket_transfers` table lives in **ticket-service**, not transfer-service.

**Rationale:**
- Transfer records are tightly coupled with tickets
- ticket-service already has ticket_transfers (Table 4)
- transfer-service handles rules, fees, batching — not core transfer records

**Impact:**
- `batch_transfer_items.transfer_id` → comment reference
- `transfer_fees.transfer_id` → comment reference
- `failed_blockchain_transfers.transfer_id` → comment reference

---

## Excluded Items

| Item | Reason |
|------|--------|
| `app_user` role | Infra concern |
| `set_tenant_id()` function | Use inline setting |
| `clear_tenant_context()` function | Use inline setting |
| External FK to tenants table | Cross-service FK |
| External FKs to tickets, users | Cross-service FKs |
| RLS on non-existent tables | transfers, blockchain_transfers don't exist |

---

## Breaking Changes

1. **batch_transfers PK changed** — Was string, now UUID
2. **tenant_id required** — No default value, must be explicitly provided
3. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
4. **External FKs removed** — Cross-service references no longer enforced at DB level
5. **Unique constraints scoped to tenant** — promotional_codes.code and user_blacklist.user_id now unique per tenant

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

**Note:** If batch_transfers has existing data with string IDs, data migration required.

---

## Files
```
backend/services/transfer-service/src/migrations/
├── 001_baseline_transfer_service.ts  # Consolidated migration
├── CONSOLIDATION_NOTES.md            # This file
├── MIGRATIONS.md                     # Original documentation
└── archived/                         # Original migration files
    ├── 001_baseline_transfer.ts
    ├── 002_add_orphan_tables.ts
    └── 20260103_add_rls_policies.ts
```
