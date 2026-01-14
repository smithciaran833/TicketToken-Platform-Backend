# Marketplace Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 2025 |
| **Source Migrations** | 4 files |
| **Consolidated To** | 001_consolidated_baseline.ts |
| **Total Tables** | 16 (12 tenant-scoped, 4 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_marketplace.ts | Initial 11 tables, 3 functions |
| 002_add_orphan_tables.ts | 3 global audit/compliance tables |
| 20260103_add_indexes_and_audit.ts | refunds table, refund_audit_log, immutability triggers |
| 20260103_add_rls_policies.ts | RLS policies (wrong table names - ignored) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `uuid_generate_v4()` | Changed to `gen_random_uuid()` |
| 2 | `uuid-ossp` extension | Removed |
| 3 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 4 | Text cast in RLS | Changed to NULLIF pattern |
| 5 | No FORCE RLS | Added to all 12 tenant tables |
| 6 | No WITH CHECK clause | Added to all RLS policies |
| 7 | No system bypass | Added `app.is_system_user` check |
| 8 | 22 external FKs enforced | Converted to comments |
| 9 | `refunds` missing UUID default | Added `gen_random_uuid()` |
| 10 | `refunds` wrong FK table names | Fixed to `marketplace_transfers`, `marketplace_listings` |
| 11 | `refunds` missing RLS | Added RLS policy |
| 12 | Duplicate `listing_audit_log` | Kept version from 002 |
| 13 | `marketplace_app` role | Excluded (infra concern) |
| 14 | `set_tenant_context()` function | Excluded (use inline pattern) |
| 15 | Wrong table names in RLS file | Entire file ignored |

---

## Tables Summary

### Tenant-Scoped Tables (12) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `marketplace_listings` | Ticket resale listings | ticket_id, seller_id, price, status |
| `marketplace_transfers` | Transfer transactions | listing_id, buyer_id, seller_id, payment_currency |
| `platform_fees` | Fee breakdown per transfer | transfer_id, platform_fee_amount, venue_fee_amount |
| `venue_marketplace_settings` | Per-venue marketplace config | venue_id, max_resale_multiplier, royalty_percentage |
| `marketplace_price_history` | Price change audit trail | listing_id, old_price, new_price |
| `marketplace_disputes` | Dispute tracking | transfer_id, filed_by, dispute_type, status |
| `dispute_evidence` | Evidence for disputes | dispute_id, evidence_type, content |
| `tax_transactions` | Tax reporting records | transfer_id, seller_id, tax_year, transaction_type |
| `anti_bot_activities` | Bot detection activity log | user_id, action_type, ip_address |
| `anti_bot_violations` | Bot violation flags | user_id, reason, severity |
| `marketplace_blacklist` | Banned users/wallets | user_id, wallet_address, reason |
| `refunds` | Refund records | transfer_id, listing_id, refund_amount, status |

### Global Tables (4) — No RLS

| Table | Purpose | Notes |
|-------|---------|-------|
| `listing_audit_log` | Audit log for listing changes | Immutable (triggers prevent update/delete) |
| `anonymization_log` | GDPR anonymization tracking | Compliance requirement |
| `user_activity_log` | User activity for retention | Data lifecycle management |
| `refund_audit_log` | Audit log for refund operations | Immutable (triggers prevent update/delete) |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `marketplace_listings.ticket_id` | tickets(id) | ticket-service |
| `marketplace_listings.seller_id` | users(id) | auth-service |
| `marketplace_listings.event_id` | events(id) | event-service |
| `marketplace_listings.venue_id` | venues(id) | venue-service |
| `marketplace_listings.approved_by` | users(id) | auth-service |
| `marketplace_transfers.buyer_id` | users(id) | auth-service |
| `marketplace_transfers.seller_id` | users(id) | auth-service |
| `marketplace_transfers.event_id` | events(id) | event-service |
| `marketplace_transfers.venue_id` | venues(id) | venue-service |
| `venue_marketplace_settings.venue_id` | venues(id) | venue-service |
| `marketplace_price_history.event_id` | events(id) | event-service |
| `marketplace_price_history.changed_by` | users(id) | auth-service |
| `marketplace_disputes.filed_by` | users(id) | auth-service |
| `marketplace_disputes.filed_against` | users(id) | auth-service |
| `marketplace_disputes.resolved_by` | users(id) | auth-service |
| `dispute_evidence.submitted_by` | users(id) | auth-service |
| `tax_transactions.seller_id` | users(id) | auth-service |
| `anti_bot_activities.user_id` | users(id) | auth-service |
| `anti_bot_violations.user_id` | users(id) | auth-service |
| `marketplace_blacklist.user_id` | users(id) | auth-service |
| `marketplace_blacklist.banned_by` | users(id) | auth-service |
| `refunds.buyer_id` | users(id) | auth-service |
| `refunds.seller_id` | users(id) | auth-service |
| `refunds.initiated_by` | users(id) | auth-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `*.tenant_id` | tenants(id) | RESTRICT |
| `marketplace_transfers.listing_id` | marketplace_listings(id) | CASCADE |
| `platform_fees.transfer_id` | marketplace_transfers(id) | CASCADE |
| `marketplace_price_history.listing_id` | marketplace_listings(id) | CASCADE |
| `marketplace_disputes.transfer_id` | marketplace_transfers(id) | CASCADE |
| `marketplace_disputes.listing_id` | marketplace_listings(id) | RESTRICT |
| `dispute_evidence.dispute_id` | marketplace_disputes(id) | CASCADE |
| `tax_transactions.transfer_id` | marketplace_transfers(id) | CASCADE |
| `refunds.transfer_id` | marketplace_transfers(id) | CASCADE |
| `refunds.listing_id` | marketplace_listings(id) | CASCADE |

---

## Enums

| Enum | Values |
|------|--------|
| `marketplace_listing_status` | active, sold, cancelled, expired, pending_approval |
| `marketplace_payment_currency` | USDC, SOL |
| `marketplace_transfer_status` | initiated, pending, completed, failed, disputed |
| `marketplace_dispute_type` | payment_not_received, ticket_not_transferred, fraudulent_listing, price_dispute, other |
| `marketplace_dispute_status` | open, under_review, resolved, closed |
| `tax_transaction_type` | short_term, long_term |
| `bot_violation_severity` | low, medium, high |

---

## Functions

| Function | Purpose |
|----------|---------|
| `expire_marketplace_listings()` | Auto-expire listings past expires_at |
| `calculate_marketplace_fees(price, platform_pct, venue_pct)` | Calculate fee breakdown |
| `get_user_active_listings_count(user_id, event_id)` | Count active listings for user |
| `prevent_audit_log_update()` | Raises exception on UPDATE (immutability) |
| `prevent_audit_log_delete()` | Raises exception on DELETE (immutability) |

---

## Triggers

| Trigger | Table | Function | Purpose |
|---------|-------|----------|---------|
| `prevent_listing_audit_update` | listing_audit_log | prevent_audit_log_update() | Immutability |
| `prevent_listing_audit_delete` | listing_audit_log | prevent_audit_log_delete() | Immutability |
| `prevent_refund_audit_update` | refund_audit_log | prevent_audit_log_update() | Immutability |
| `prevent_refund_audit_delete` | refund_audit_log | prevent_audit_log_delete() | Immutability |

---

## CHECK Constraints

| Constraint | Table | Rule |
|------------|-------|------|
| `chk_marketplace_transfers_payment_method` | marketplace_transfers | IN ('crypto', 'fiat') |

---

## RLS Policy Pattern

Applied to all 12 tenant-scoped tables:
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

## Excluded Items

| Item | Reason |
|------|--------|
| `marketplace_app` role | Infra concern |
| `set_tenant_context()` function | Use inline pattern |
| `uuid-ossp` extension | PostgreSQL 13+ native |
| Wrong table names in 20260103_add_rls_policies.ts | File referenced non-existent tables |

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level
4. **Enums used** — Status columns now use PostgreSQL enums instead of strings

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
backend/services/marketplace-service/src/migrations/
├── 001_consolidated_baseline.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    ├── 001_baseline_marketplace.ts
    ├── 002_add_orphan_tables.ts
    ├── 20260103_add_indexes_and_audit.ts
    └── 20260103_add_rls_policies.ts
```
