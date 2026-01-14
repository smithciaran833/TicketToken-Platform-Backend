# Event Service Migration Consolidation

**Date:** 2026-01-13
**Consolidated From:** 6 migration files → 1 baseline

## What Was Done

### Files Archived
The following files were moved to `./archived/`:
- 001_baseline_event.ts
- 002_add_rls_policies.ts
- 003_add_version_column.ts
- 004_add_idempotency_keys.ts
- 005_add_price_percentage_constraints.ts
- 006_add_status_reason.ts

### New File Created
- 001_consolidated_baseline.ts

## Issues Fixed During Consolidation

### 1. idempotency_keys Missing RLS
**Problem:** Table had tenant_id but no RLS policies
**Fix:** Added 4 RLS policies (select, insert, update, delete) with tenant isolation

### 2. idempotency_keys Missing FK Constraints
**Problem:** tenant_id and user_id had no foreign key constraints
**Fix:** Added FK constraints to tenants and users tables

### 3. RLS SELECT Policy Security Hole
**Problem:** SELECT policies used COALESCE fallback that allowed all rows when no tenant set:
```sql
-- BROKEN: Falls back to tenant_id = tenant_id (always true)
USING (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', true), '')::uuid, tenant_id))
```
**Fix:** Changed to strict matching:
```sql
-- FIXED: Returns nothing if no tenant set (unless system user)
USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
       OR current_setting('app.is_system_user', true) = 'true')
```

### 4. No System User Bypass
**Problem:** No way for service-to-service calls to bypass RLS
**Fix:** Added `app.is_system_user` check to all RLS policies

### 5. Duplicate updated_at Assignment
**Problem:** Both `update_updated_at_column()` and `increment_version()` were setting updated_at
**Fix:** Removed `NEW.updated_at = NOW();` from `increment_version()` function

### 6. UUID Function Inconsistency
**Problem:** 001 used `uuid_generate_v4()`, 004 used `gen_random_uuid()`
**Fix:** Standardized on `gen_random_uuid()` everywhere

### 7. Hardcoded Default tenant_id
**Problem:** Tables had default `'00000000-0000-0000-0000-000000000001'` for tenant_id
**Fix:** Removed default - tenant_id must be explicitly provided

## Final Schema Summary

### Tables (7 total)
| Category | Tables |
|----------|--------|
| Global | event_categories |
| Tenant | events, event_schedules, event_capacity, event_pricing, event_metadata, idempotency_keys |

### RLS Coverage
- **6 tables** with tenant isolation RLS
- **1 global table** (no RLS): event_categories

### Absorbed Columns
Columns from later migrations now in base table definitions:
- `events.version` (from 003)
- `events.status_reason` (from 006)
- `events.status_changed_by` (from 006)
- `events.status_changed_at` (from 006)
- `event_schedules.version` (from 003)
- `event_capacity.version` (from 003)
- `event_pricing.version` (from 003)

### CHECK Constraints (25 total)
- events: 9 constraints (status, visibility, event_type, royalty, age, priority, view/interest/share counts)
- event_schedules: 1 constraint (status)
- event_capacity: 5 constraints (total, available, reserved, sold, min_purchase)
- event_pricing: 10 constraints (all price and percentage fields)

### Triggers (11 total)
- 6 `update_updated_at_column()` triggers
- 4 `increment_version()` triggers
- 1 audit trigger (conditional on audit_trigger_function)

### Seed Data
- event_categories: 10 default categories (Music, Sports, Theater, Comedy, Arts, Conference, Workshop, Festival, Family, Nightlife)

## Session Variables Used by RLS
- `app.current_tenant_id` — tenant UUID for isolation
- `app.is_system_user` — bypass flag for system operations

## Design Decisions

### event_categories as Global
Categories are shared across all tenants. This allows:
- Consistent categorization platform-wide
- Easier discovery and search
- No duplicate category management per tenant

### event_metadata Without Version Column
Intentionally excluded because:
- 1:1 relationship with events (low concurrency risk)
- Contains mostly static data (performers, sponsors, requirements)
- Updates are infrequent compared to pricing/capacity
