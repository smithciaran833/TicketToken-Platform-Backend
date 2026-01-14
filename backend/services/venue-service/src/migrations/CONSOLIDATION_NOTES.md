# Venue Service Migration Consolidation

**Date:** 2026-01-13
**Consolidated From:** 10 migration files → 1 baseline

## What Was Done

### Files Archived
The following files were moved to `./archived/`:
- 001_baseline_venue.ts
- 003_add_external_verification_tables.ts
- 004_add_webhook_events_table.ts
- 005_add_api_key_hash_column.ts
- 006_add_rls_with_check.ts
- 007_add_version_column.ts
- 008_add_check_constraints.ts
- 009_enhance_webhook_events.ts
- 010_add_venue_operations_resale_tables.ts
- 011_add_orphan_tables.ts

### New File Created
- 001_consolidated_baseline.ts

## Issues Fixed During Consolidation

### 1. RLS Setting Name Inconsistency
**Problem:** Migration 011 used `app.current_tenant` but application code sets `app.current_tenant_id`
**Fix:** All RLS policies now use `app.current_tenant_id`

### 2. Status Case Mismatch
**Problem:** venues.status defaulted to 'ACTIVE' (uppercase) but CHECK constraint expected 'active' (lowercase)
**Fix:** Default changed to 'active', venues_public_view policy updated to match

### 3. Invalid CHECK Constraints Removed
**Problem:** Two CHECK constraints referenced wrong tables/columns
- `chk_royalty_percentage_range` on venue_settings (column is on venues)
- `chk_integration_status_valid` on venue_integrations.status (column is is_active)
**Fix:** Both constraints removed

### 4. Missing tenant_id Columns
**Problem:** 15 tables had no tenant_id column but needed RLS
**Fix:** Added tenant_id to all tables that need tenant isolation

### 5. Missing RLS Policies
**Problem:** 17 tables had no RLS policies
**Fix:** Added RLS with tenant isolation to 25 tables (2 intentionally global)

### 6. venue_staff Duplicate Definition
**Problem:** Both 001 and 003 defined venue_staff with different schemas
**Fix:** Single definition using 001's schema (full HR fields)

## Final Schema Summary

### Tables (27 total)
| Category | Tables |
|----------|--------|
| Core | venues, venue_staff, venue_settings, venue_integrations, venue_layouts, venue_branding, custom_domains, white_label_pricing, venue_tier_history, venue_audit_log, api_keys, user_venue_roles |
| Verification | external_verifications, manual_review_queue, venue_compliance, venue_compliance_reviews, venue_compliance_reports, venue_documents |
| Notifications | notifications, email_queue |
| Webhooks | webhook_events |
| Operations | venue_operations, transfer_history, resale_policies, seller_verifications, resale_blocks, fraud_logs |

### RLS Coverage
- **25 tables** with tenant isolation RLS
- **2 global tables** (no RLS): white_label_pricing, email_queue

### Absorbed Columns
Columns from later migrations now in base table definitions:
- `api_keys.key_hash` (from 005)
- `venues.version`, `venue_settings.version`, `venue_integrations.version` (from 007)
- `webhook_events.status`, `processing_started_at`, `processing_completed_at`, `payload`, `error_message`, `retry_count`, `last_retry_at`, `source_ip`, `headers_hash`, `lock_key`, `lock_expires_at` (from 009)
- `venue_settings` resale columns: `max_resale_price_multiplier`, `max_resale_price_fixed`, `use_face_value_cap`, `max_transfers_per_ticket`, `require_seller_verification`, `default_jurisdiction`, `jurisdiction_rules`, `resale_cutoff_hours`, `listing_cutoff_hours`, `anti_scalping_enabled`, `purchase_cooldown_minutes`, `max_tickets_per_buyer`, `require_artist_approval`, `approved_resale_platforms` (from 010)

### Seed Data
- white_label_pricing: 3 tiers (standard, white_label, enterprise)

## Session Variables Used by RLS
- `app.current_tenant_id` — tenant UUID for isolation
- `app.current_user_id` — user UUID for owner-based policies
- `app.current_user_role` — role string for admin policies
- `app.is_system_user` — bypass flag for system operations
