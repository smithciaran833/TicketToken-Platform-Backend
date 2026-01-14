# Payment Service Migration Consolidation

## Overview
- **Date:** 2025-01-13
- **Consolidated:** 7 migrations → 1 baseline
- **Total Tables:** 71 (4 global, 67 tenant-scoped)

## Source Files (Archived)
All original migrations moved to `./archived/`:
- `001_baseline_payment.ts` - 60 tables, no RLS
- `002_add_rls_policies.ts` - RLS policies (broken - referenced missing tenant_id)
- `003_add_concurrent_indexes.ts` - 28 indexes (some duplicates)
- `004_add_stripe_connect_tables.ts` - 4 Stripe Connect tables
- `005_add_disputes_payouts_jobs.ts` - 5 tables (duplicate venue_balances)
- `006_add_amount_constraints.ts` - CHECK constraints (wrong table names)
- `007_add_orphan_tables.ts` - 4 escrow/snapshot tables

## Critical Issues Fixed

### 1. Duplicate Table: venue_balances
- **Problem:** Created in both 001 and 005 with different schemas
- **Fix:** Merged all columns from both into single table

### 2. Missing tenant_id on ~50 Tables
- **Problem:** 002 tried to add RLS to tables without tenant_id column
- **Fix:** Added `tenant_id NOT NULL` to all tenant-scoped tables

### 3. Wrong Table Names in 006
- **Problem:** Referenced `payments`, `refunds`, `transfers` instead of actual names
- **Fix:** Applied constraints to correct tables: `payment_transactions`, `payment_refunds`, `stripe_transfers`

### 4. Inconsistent RLS Patterns
- **Problem:** 4 different RLS patterns across migrations
- **Fix:** Standardized to strict NULLIF pattern with `app.is_system_user`

### 5. Zero UUID Fallback Removed
- **Problem:** Some policies fell back to `'00000000-...'` UUID (security hole)
- **Fix:** Strict pattern - if tenant not set, query returns nothing

### 6. Missing updated_at Triggers
- **Problem:** `payment_disputes`, `background_jobs` had updated_at but no trigger
- **Fix:** Added triggers to all tables with updated_at column

### 7. Duplicate Indexes
- **Problem:** 003 created indexes that already existed in 001
- **Fix:** Deduped - each index created once

### 8. Non-existent outbox Reference
- **Problem:** 005 referenced `outbox` table that doesn't exist
- **Fix:** Removed reference

## Global Tables (No tenant_id, No RLS)
These tables are platform-wide, not tenant-scoped:
1. `payment_state_machine` - State transition rules
2. `ml_fraud_models` - Platform ML models
3. `ip_reputation` - Cross-tenant IP tracking
4. `card_fingerprints` - Cross-tenant card fraud detection

## Escrow Tables (Both Kept)
Two different escrow systems serving different purposes:
1. `payment_escrows` + `escrow_release_conditions` - P2P marketplace resales
2. `escrow_accounts` + `escrow_events` - General order escrow with time-based release

## RLS Policy Standard
All tenant tables use this pattern:
```sql
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
- `venues` (venue-service)
- `users` (auth-service)
- `events` (event-service)
- `orders` (order-service)
- `tickets` (ticket-service)

## Functions Created
1. `update_updated_at_column()` - Generic trigger for updated_at
2. `validate_payment_state_transition()` - State machine validator
3. `get_next_sequence_number()` - Event sequence generator
4. `update_user_total_spent()` - Aggregate trigger for user stats

## Enum Types
1. `escrow_status` - ('pending', 'held', 'partially_released', 'released', 'cancelled', 'disputed')

## Testing
After running migration:
```bash
# Verify table count
psql -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Verify RLS enabled
psql -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;"

# Verify policies exist
psql -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';"
```
