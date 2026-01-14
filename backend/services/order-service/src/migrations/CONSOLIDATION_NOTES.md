# Order Service Migration Consolidation

## Overview
- **Date:** 2025-01-13
- **Consolidated:** 2 migrations → 1 baseline
- **Total Tables:** 23 (all tenant-scoped)

## Source Files (Archived)
All original migrations moved to `./archived/`:
- `001_baseline_orders.ts` - 16 tables, core order functionality
- `002_add_orphan_tables.ts` - 7 tables, reporting and admin features

## Critical Issues Fixed

### 1. RLS Pattern Wrong
- **Problem:** Used `current_setting('app.current_tenant')::uuid` without `true` parameter
- **Fix:** Changed to `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`
- **Benefit:** Won't error if setting not defined, returns NULL instead

### 2. No System Bypass in RLS
- **Problem:** No way for system/admin processes to access data across tenants
- **Fix:** Added `OR current_setting('app.is_system_user', true) = 'true'` to all policies

### 3. No FORCE ROW LEVEL SECURITY
- **Problem:** Only `ENABLE ROW LEVEL SECURITY` was set
- **Fix:** Added `FORCE ROW LEVEL SECURITY` to all 23 tables
- **Benefit:** RLS applies even to table owners

### 4. refund_policy_rules Missing tenant_id
- **Problem:** Table had no tenant_id column, no RLS
- **Fix:** Added `tenant_id uuid NOT NULL` + full RLS policy

### 5. UUID Function Inconsistent
- **Problem:** Mixed `uuid_generate_v4()` and `gen_random_uuid()`
- **Fix:** Standardized to `gen_random_uuid()` (PostgreSQL 13+ native)
- **Benefit:** No uuid-ossp extension required

### 6. External FK Constraints Enforced
- **Problem:** Foreign keys to `tenants`, `users`, `events`, `ticket_types` were enforced
- **Fix:** Removed FK constraints, kept as comments
- **Reason:** Cross-service FKs can't be enforced at DB level in microservices

### 7. Removed uuid-ossp Extension
- **Problem:** Extension loaded but not needed with gen_random_uuid()
- **Fix:** Removed extension, kept only pg_trgm for trigram search

## Tables Summary

### Core Order Tables (from 001)
| # | Table | Purpose |
|---|-------|---------|
| 1 | orders | Main order records with dispute/payout tracking |
| 2 | order_items | Line items linked to ticket types |
| 3 | order_events | Event sourcing / audit log |
| 4 | order_addresses | Billing/shipping addresses |
| 5 | refund_policies | Configurable refund rules |
| 6 | refund_reasons | Reason codes for refunds |
| 7 | order_refunds | Refund transactions |
| 8 | refund_policy_rules | Rule definitions for policies |
| 9 | refund_compliance_log | Regulatory compliance tracking |
| 10 | order_modifications | Order change requests |
| 11 | order_splits | Split order tracking |
| 12 | bulk_operations | Bulk order operations |
| 13 | promo_codes | Discount codes |
| 14 | promo_code_redemptions | Code usage tracking |
| 15 | order_notes | Admin notes on orders |
| 16 | order_disputes | Stripe dispute tracking |

### Reporting & Admin Tables (from 002)
| # | Table | Purpose |
|---|-------|---------|
| 17 | order_report_summaries | Daily/weekly/monthly summaries |
| 18 | order_revenue_reports | Revenue by entity |
| 19 | saved_searches | Admin saved search configs |
| 20 | search_history | Admin search tracking |
| 21 | admin_overrides | Override requests with approval |
| 22 | admin_override_audit | Audit log for overrides |
| 23 | note_templates | Templates for order notes |

## Enum Types (9)

| Type | Values |
|------|--------|
| refund_type | FULL, PARTIAL, ITEM |
| modification_type | ADD_ITEM, REMOVE_ITEM, UPGRADE_ITEM, DOWNGRADE_ITEM, CHANGE_QUANTITY |
| modification_status | PENDING, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED |
| bulk_operation_status | PENDING, PROCESSING, COMPLETED, FAILED, PARTIAL_SUCCESS |
| bulk_operation_type | BULK_CANCEL, BULK_REFUND, BULK_UPDATE, BULK_EXPORT |
| discount_type | PERCENTAGE, FIXED_AMOUNT, BOGO, TIERED, EARLY_BIRD |
| order_note_type | CUSTOMER_INQUIRY, ISSUE_REPORTED, RESOLUTION, VIP_MARKER, FRAUD_SUSPICION, PAYMENT_ISSUE, DELIVERY_ISSUE, GENERAL, INTERNAL_NOTE |
| report_period | DAILY, WEEKLY, MONTHLY, CUSTOM |
| override_approval_status | PENDING, APPROVED, REJECTED, AUTO_APPROVED |

## Functions (7)

| Function | Purpose |
|----------|---------|
| update_updated_at_column() | Generic trigger for updated_at |
| log_order_status_change() | Log status changes to order_events |
| update_event_revenue() | Update event revenue on payment |
| calculate_order_total() | Immutable total calculation |
| generate_order_number() | Random order number generator |
| validate_order_status_transition() | State machine validator |
| orders_search_vector_trigger() | Full-text search vector update |

## RLS Policy Standard
All 23 tables use this pattern:
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

## External FK References (Comments Only)
Cross-service references kept as comments, not enforced:
- `users` (auth-service) - orders.user_id, order_events.user_id, order_refunds.initiated_by
- `events` (event-service) - orders.event_id
- `ticket_types` (ticket-service) - order_items.ticket_type_id

## Internal FK Constraints
All internal FKs properly enforced with appropriate ON DELETE behavior:
- CASCADE for child records (order_items, order_events, etc.)
- SET NULL for optional references (policy_id, reason_id, etc.)
- Self-referential FKs for order splits/modifications

## Testing
After running migration:
```bash
# Verify table count
psql -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Verify RLS enabled and forced
psql -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;"

# Verify policies exist
psql -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';"

# Test RLS with tenant context
psql -c "SET app.current_tenant_id = 'your-tenant-uuid'; SELECT * FROM orders LIMIT 1;"

# Test system bypass
psql -c "SET app.is_system_user = 'true'; SELECT COUNT(*) FROM orders;"
```
