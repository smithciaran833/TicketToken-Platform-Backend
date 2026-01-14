# Migration Audit Report

This document audits migration files across all backend services to identify:
- Tables created by each service
- External table dependencies (cross-service references)
- Duplicate function definitions
- Row-Level Security (RLS) status
- Modifications to external tables

---

## auth-service

### Files
- `src/migrations/001_auth_baseline.ts`

### Tables Created
1. tenants
2. users
3. user_sessions
4. user_venue_roles
5. audit_logs
6. invalidated_tokens
7. token_refresh_log
8. oauth_connections
9. wallet_connections
10. biometric_credentials
11. trusted_devices
12. user_addresses

### Views Created
- `users_masked` - masked view for support access

### External Dependencies
- `venue_id` in `user_venue_roles` - **soft reference** (no FK constraint, just UUID column)
- `payment_transactions` - referenced conditionally in `backfill_user_aggregates()` function
- `tickets` - referenced conditionally in `backfill_user_aggregates()` function

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function
- `audit_trigger_function()`: **YES** - creates this function

### Additional Functions Created
- `generate_user_referral_code()`
- `increment_referral_count()`
- `backfill_user_aggregates()`
- `mask_email(TEXT)`
- `mask_phone(TEXT)`
- `mask_tax_id(TEXT)`
- `mask_card_number(TEXT)`
- `cleanup_expired_data()`

### RLS Status
- **YES** - RLS enabled on 11 tables:
  - users
  - user_sessions
  - user_venue_roles
  - audit_logs
  - invalidated_tokens
  - token_refresh_log
  - oauth_connections
  - wallet_connections
  - biometric_credentials
  - trusted_devices
  - user_addresses
- **NO RLS**: tenants (intentional - this is the tenant table itself)

### Modifies External Tables
- **NO**

### Notes
- **Primary service for auth/user data** - creates `tenants` and `users` tables that other services depend on
- Creates both `update_updated_at_column()` and `audit_trigger_function()` which are likely duplicated in other services
- Uses `CREATE OR REPLACE FUNCTION` which will overwrite existing function definitions
- `user_venue_roles.venue_id` has no FK constraint - this is a soft reference to venue-service tables (potential data integrity issue)
- The `backfill_user_aggregates()` function conditionally checks for `payment_transactions` and `tickets` tables existence before querying them
- Inserts a default tenant record with fixed UUID `00000000-0000-0000-0000-000000000001`

---

## venue-service

### Files
- `src/migrations/001_baseline_venue.ts`
- `src/migrations/003_add_external_verification_tables.ts`
- `src/migrations/004_add_webhook_events_table.ts`
- `src/migrations/005_add_api_key_hash_column.ts`
- `src/migrations/006_add_rls_with_check.ts`
- `src/migrations/007_add_version_column.ts`
- `src/migrations/008_add_check_constraints.ts`
- `src/migrations/009_enhance_webhook_events.ts`
- `src/migrations/010_add_venue_operations_resale_tables.ts`

### Tables Created
**From 001_baseline_venue.ts (12 tables):**
1. venues
2. venue_staff
3. venue_settings
4. venue_integrations
5. venue_layouts
6. venue_branding
7. custom_domains
8. white_label_pricing
9. venue_tier_history
10. venue_audit_log
11. api_keys
12. user_venue_roles (conditionally - only if doesn't exist, conflicts with auth-service)

**From 003_add_external_verification_tables.ts (9 tables, some conditional):**
13. external_verifications
14. manual_review_queue
15. notifications
16. email_queue
17. venue_compliance_reviews
18. venue_compliance (conditional)
19. venue_compliance_reports (conditional)
20. venue_documents (conditional)
21. venue_staff (conditional - redundant, already in 001)

**From 004_add_webhook_events_table.ts (1 table):**
22. webhook_events

**From 010_add_venue_operations_resale_tables.ts (4 tables):**
23. venue_operations
24. transfer_history
25. resale_policies
26. seller_verifications

**Total: ~26 tables (some conditional/overlapping)**

### External Dependencies

**Hard FK References to `users` table (auth-service):**
- `venues.created_by` → users(id)
- `venues.updated_by` → users(id)
- `venue_staff.user_id` → users(id)
- `venue_staff.added_by` → users(id)
- `venue_tier_history.changed_by` → users(id)
- `venue_audit_log.user_id` → users(id)
- `api_keys.user_id` → users(id)
- `user_venue_roles.user_id` → users(id)
- `manual_review_queue.assigned_to` → users(id)
- `notifications.user_id` → users(id)
- `venue_compliance_reviews.reviewer_id` → users(id)
- `venue_documents.reviewed_by` → users(id)

**Hard FK Reference to `tenants` table (auth-service):**
- `webhook_events.tenant_id` → tenants(id)

**Soft References (UUID columns without FK constraints):**
- `venues.tenant_id` - tenant_id without FK
- `transfer_history.ticket_id` - references tickets (ticket-service)
- `transfer_history.event_id` - references events (event-service)
- `transfer_history.from_user_id` - references users (auth-service)
- `transfer_history.to_user_id` - references users (auth-service)
- `venue_operations.tenant_id` - references tenants (auth-service)
- `venue_operations.created_by` - references users (auth-service)
- `resale_policies.event_id` - references events (event-service)
- `resale_policies.created_by` - references users (auth-service)
- `resale_policies.approved_by` - references users (auth-service)
- `seller_verifications.user_id` - references users (auth-service)
- `seller_verifications.reviewed_by` - references users (auth-service)

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 001_baseline_venue.ts
- `audit_trigger_function()`: **NO** - checks if exists and attaches to tables, expects auth-service to create it

### RLS Status
- **YES** - RLS enabled on multiple tables:

**From 001_baseline_venue.ts:**
- venues (7 policies: view_own, update_own, delete_own, insert_own, public_view, admin_all, tenant_isolation)

**From 006_add_rls_with_check.ts (enhanced RLS with WITH CHECK):**
- venues
- venue_settings
- venue_integrations
- venue_audit_log

**From 010_add_venue_operations_resale_tables.ts:**
- venue_operations (tenant_isolation)
- transfer_history (tenant_isolation)
- resale_policies (tenant_isolation)
- seller_verifications (tenant_isolation)

**Tables without RLS (potential issue):**
- venue_staff
- venue_layouts
- venue_branding
- custom_domains
- white_label_pricing
- venue_tier_history
- api_keys
- user_venue_roles
- external_verifications
- manual_review_queue
- notifications
- email_queue
- venue_compliance_reviews
- venue_compliance
- venue_compliance_reports
- venue_documents
- webhook_events

### Modifies External Tables
- **NO** - Does not ALTER external tables
- **BUT** creates FKs TO external tables (users, tenants)

### Table Modifications in Later Migrations

**005_add_api_key_hash_column.ts:**
- Adds `key_hash` column to `api_keys` table

**007_add_version_column.ts:**
- Adds `version` column to `venues`, `venue_settings`, `venue_integrations`

**008_add_check_constraints.ts:**
- Adds CHECK constraints to `venue_settings`, `venues`, `venue_integrations`

**009_enhance_webhook_events.ts:**
- Adds multiple columns to `webhook_events`: status, processing_started_at, processing_completed_at, payload, error_message, retry_count, last_retry_at, source_ip, headers_hash, lock_key, lock_expires_at

**010_add_venue_operations_resale_tables.ts:**
- Adds resale policy columns to `venue_settings`: max_resale_price_multiplier, max_resale_price_fixed, use_face_value_cap, max_transfers_per_ticket, require_seller_verification, default_jurisdiction, jurisdiction_rules, resale_cutoff_hours, listing_cutoff_hours, anti_scalping_enabled, purchase_cooldown_minutes, max_tickets_per_buyer, require_artist_approval, approved_resale_platforms

### Notes
- **CRITICAL**: Creates `user_venue_roles` table which is ALSO created by auth-service - potential conflict/duplicate
- **DEPENDENCY ORDER**: Requires auth-service migrations to run first (for `users` and `tenants` tables, and `audit_trigger_function`)
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which auth-service also creates
- **INCONSISTENT RLS**: Only ~4-8 tables have RLS, ~17 tables lack RLS policies
- **HEAVY USER DEPENDENCY**: 12 different columns reference the `users` table with FKs
- **CROSS-SERVICE SOFT REFERENCES**: References `tickets` and `events` tables without FK (data integrity risk)
- Uses `gen_random_uuid()` in some migrations instead of `uuid_generate_v4()` (inconsistent)
- Contains conditional table creation logic checking if tables already exist

---

## event-service

### Files
- `src/migrations/001_baseline_event.ts`
- `src/migrations/002_add_rls_policies.ts`
- `src/migrations/003_add_version_column.ts`
- `src/migrations/004_add_idempotency_keys.ts`
- `src/migrations/005_add_price_percentage_constraints.ts`
- `src/migrations/006_add_status_reason.ts`

### Tables Created
**From 001_baseline_event.ts (6 tables):**
1. event_categories
2. events
3. event_schedules
4. event_capacity
5. event_pricing
6. event_metadata

**From 004_add_idempotency_keys.ts (1 table):**
7. idempotency_keys

**Total: 7 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `events.tenant_id` → tenants(id)
- `event_schedules.tenant_id` → tenants(id)
- `event_capacity.tenant_id` → tenants(id)
- `event_pricing.tenant_id` → tenants(id)
- `event_metadata.tenant_id` → tenants(id)

**Hard FK References to `venues` table (venue-service):**
- `events.venue_id` → venues(id)
- `events.venue_layout_id` → venue_layouts(id)

**Hard FK References to `users` table (auth-service):**
- `events.created_by` → users(id)
- `events.updated_by` → users(id)

**Soft References (UUID columns without FK constraints):**
- `idempotency_keys.tenant_id` - no FK constraint
- `idempotency_keys.user_id` - no FK constraint

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 001_baseline_event.ts
- `audit_trigger_function()`: **NO** - checks if exists, expects auth-service to create it
- `increment_version()`: **YES** - creates this function in 003_add_version_column.ts (unique)

### RLS Status
- **YES** - RLS enabled on 5 tables (from 002_add_rls_policies.ts):
  - events (4 policies: select, insert, update, delete)
  - event_schedules (4 policies)
  - event_capacity (4 policies)
  - event_pricing (4 policies)
  - event_metadata (4 policies)

**Tables without RLS:**
- event_categories (intentional - global categories)
- idempotency_keys (needs RLS!)

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Table Modifications in Later Migrations

**003_add_version_column.ts:**
- Adds `version` column to `events`, `event_schedules`, `event_capacity`, `event_pricing`
- Adds version auto-increment triggers on all 4 tables

**005_add_price_percentage_constraints.ts:**
- Adds multiple CHECK constraints to `event_pricing`, `events`, `event_capacity`
- Uses `SET lock_timeout = '5s'` for safe deployment

**006_add_status_reason.ts:**
- Adds `status_reason`, `status_changed_by`, `status_changed_at` to `events`

### Notes
- **DEPENDENCY ORDER**: Requires auth-service (for tenants, users, audit_trigger_function) and venue-service (for venues, venue_layouts) to run first
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which auth-service and venue-service also create
- **GOOD PRACTICE**: Explicit FK constraints to enforce tenant isolation at DB level
- **GOOD PRACTICE**: Uses `SET lock_timeout` during constraint additions
- **ISSUE**: idempotency_keys table lacks RLS policy
- Creates `event_service_admin` role for RLS bypass
- Seeds default event categories (Music, Sports, Theater, etc.)
- Default tenant_id hardcoded as `00000000-0000-0000-0000-000000000001`

---

## ticket-service

### Files
- `src/migrations/001_baseline_ticket.ts`
- `src/migrations/002_add_ticket_scans.ts`
- `src/migrations/003_add_blockchain_tracking.ts`
- `src/migrations/004_add_rls_role_verification.ts`
- `src/migrations/005_add_idempotency_keys.ts`
- `src/migrations/006_add_ticket_state_machine.ts`
- `src/migrations/007_add_security_tables.ts`
- `src/migrations/008_add_foreign_key_constraints.ts`
- `src/migrations/009_add_unique_constraints.ts`
- `src/migrations/010_add_check_constraints.ts`
- `src/migrations/011_add_ticket_state_history.ts`

### Tables Created
**From 001_baseline_ticket.ts (20 tables):**
1. ticket_types
2. reservations
3. tickets
4. ticket_transfers
5. ticket_validations
6. refunds
7. waitlist
8. ticket_price_history
9. ticket_holds
10. ticket_bundles
11. ticket_bundle_items
12. ticket_audit_log
13. ticket_notifications
14. discounts
15. order_discounts
16. outbox
17. reservation_history
18. webhook_nonces

**From 002_add_ticket_scans.ts (1 table):**
19. ticket_scans

**From 003_add_blockchain_tracking.ts (2 tables):**
20. pending_transactions
21. blockchain_sync_log

**From 004_add_rls_role_verification.ts (1 table + view):**
22. tenant_access_violations
- View: `rls_role_status`

**From 005_add_idempotency_keys.ts (1 table):**
23. idempotency_keys

**From 006_add_ticket_state_machine.ts (modifications + 1 table):**
- ticket_transfers table recreated with blockchain fields
- Adds columns to tickets: status_reason, status_changed_by, etc.
- Creates `revocation_reason` enum type

**From 007_add_security_tables.ts (6 tables):**
24. spending_limits
25. account_lockout_events
26. multisig_approval_requests
27. multisig_approvals
28. multisig_rejections
29. spending_transactions

**From 011_add_ticket_state_history.ts (1 table + view):**
30. ticket_state_history
- View: `v_recent_ticket_transitions`

**Total: ~30 tables + 2 views**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `ticket_types.tenant_id` → tenants(id)
- `reservations.tenant_id` → tenants(id)
- `tickets.tenant_id` → tenants(id)
- `ticket_scans.tenant_id` → tenants(id)
- `pending_transactions.tenant_id` → tenants(id)
- `blockchain_sync_log.tenant_id` → tenants(id)
- `ticket_bundles.tenant_id` → tenants(id)
- `waitlist.tenant_id` → tenants(id)
- `ticket_holds.tenant_id` → tenants(id)
- `ticket_audit_log.tenant_id` → tenants(id)
- `ticket_notifications.tenant_id` → tenants(id)

**Hard FK References to `events` table (event-service):**
- `ticket_types.event_id` → events(id)
- `reservations.event_id` → events(id)
- `tickets.event_id` → events(id)
- `ticket_scans.event_id` → events(id)
- `pending_transactions.event_id` → events(id)

**Hard FK References to `users` table (auth-service):**
- `reservations.user_id` → users(id)
- `tickets.user_id` → users(id)
- `tickets.original_purchaser_id` → users(id)
- `tickets.validated_by` → users(id)
- `ticket_transfers.from_user_id` → users(id)
- `ticket_transfers.to_user_id` → users(id)
- `ticket_validations.validator_id` → users(id)
- `waitlist.user_id` → users(id)
- `ticket_price_history.changed_by` → users(id)
- `ticket_holds.held_by` → users(id)
- `ticket_audit_log.performed_by` → users(id)
- `ticket_notifications.user_id` → users(id)
- `ticket_scans.scanned_by` → users(id)
- `pending_transactions.from_user_id` → users(id)
- `pending_transactions.to_user_id` → users(id)
- `tickets.status_changed_by` → users(id)
- `tickets.checked_in_by` → users(id)

**Soft References (UUID columns without FK constraints):**
- Multiple user references in security tables (spending_limits, multisig tables)
- `idempotency_keys.user_id` - no FK

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - expects auth-service to create it
- **Unique functions created:**
  - `update_ticket_availability_on_reservation()`
  - `release_ticket_availability()`
  - `update_user_ticket_stats()`
  - `update_user_events_attended()`
  - `check_duplicate_scan()`
  - `record_scan_attempt()`
  - `create_pending_transaction()`
  - `confirm_transaction()`
  - `fail_transaction()`
  - `has_pending_transaction()`
  - `get_pending_transaction_status()`
  - `current_tenant_id()`
  - `set_tenant_context()`
  - `clear_tenant_context()`
  - `verify_tenant_context()`
  - `log_tenant_violation()`
  - `acquire_idempotency_key()`
  - `complete_idempotency_key()`
  - `release_idempotency_lock()`
  - `cleanup_expired_idempotency_keys()`
  - `ticket_status_change_trigger()`
  - `can_check_in_ticket()`
  - `get_ticket_transfer_history()`
  - `log_ticket_status_change()`
  - `get_ticket_state_history()`
  - `log_ticket_status_change_manual()`

### RLS Status
- **YES** - RLS enabled on multiple tables:
  - tickets (5 policies: view_own, update_own, venue_owner_view, admin_all, tenant_isolation)
  - ticket_scans (tenant_isolation)
  - pending_transactions (tenant_isolation)
  - blockchain_sync_log (tenant_isolation)
  - idempotency_keys (tenant_isolation)
  - ticket_transfers (tenant_isolation)
  - spending_limits (tenant_isolation - uses different setting name: 'app.tenant_id')
  - multisig_approval_requests (tenant_isolation - uses 'app.tenant_id')
  - spending_transactions (tenant_isolation - uses 'app.tenant_id')
  - ticket_state_history (tenant_isolation + select + insert policies)

**Tables without RLS (potential issue):**
- ticket_types
- reservations
- ticket_validations
- refunds
- waitlist
- ticket_price_history
- ticket_holds
- ticket_bundles
- ticket_bundle_items
- ticket_audit_log
- ticket_notifications
- discounts
- order_discounts
- outbox
- reservation_history
- webhook_nonces
- tenant_access_violations
- account_lockout_events
- multisig_approvals
- multisig_rejections

### Modifies External Tables
- **YES** - Modifies tables from other services:
  - Adds `ticket_purchase_count`, `total_spent` to `users` table (if exists)
  - Adds `tickets_sold`, `revenue` to `events` table (if exists)
  - Adds `seating_capacity` to `venues` table (if exists)

### Table Modifications in Later Migrations

**006_add_ticket_state_machine.ts:**
- Adds columns to `tickets`: status_reason, status_changed_by, status_changed_at, checked_in_at, checked_in_by, token_mint
- Adds status change trigger

**008_add_foreign_key_constraints.ts:**
- Adds soft FK constraints using UUID regex CHECK constraints for cross-service references
- Adds performance indexes

**009_add_unique_constraints.ts:**
- Adds multiple unique indexes using CONCURRENTLY for zero-downtime deployment

**010_add_check_constraints.ts:**
- Adds status validation CHECK constraints to tickets, orders, transfers, etc.
- Adds price/quantity validation constraints

### Notes
- **CRITICAL**: Modifies external `users`, `events`, and `venues` tables!
- **DEPENDENCY ORDER**: Requires auth-service (for tenants, users), event-service (for events), venue-service (for venues)
- **INCONSISTENT RLS SETTING**: Some tables use `app.current_tenant_id`, others use `app.tenant_id`
- **INCONSISTENT RLS COVERAGE**: ~10 tables have RLS, ~20 tables lack RLS
- **CREATES DB ROLE**: Creates `ticket_service_app` role with NOBYPASSRLS
- **BLOCKCHAIN INTEGRATION**: Comprehensive blockchain transaction tracking (pending_transactions, blockchain_sync_log)
- Uses both Knex migrations and raw Pool queries (inconsistent migration style)
- Uses `gen_random_uuid()` instead of `uuid_generate_v4()` in some migrations
- Creates comprehensive state machine audit trail (ticket_state_history)
- Heavy use of stored procedures and triggers for business logic
- Creates helper functions for idempotency handling with atomic operations

---

## payment-service

### Files
- `src/migrations/001_baseline_payment.ts`
- `src/migrations/002_add_rls_policies.ts`
- `src/migrations/003_add_concurrent_indexes.ts`
- `src/migrations/004_add_stripe_connect_tables.ts`
- `src/migrations/005_add_disputes_payouts_jobs.ts`
- `src/migrations/006_add_amount_constraints.ts`

### Tables Created
**From 001_baseline_payment.ts (60 tables):**

*Core Payment Tables:*
1. payment_transactions
2. venue_balances (duplicate - also in 005)
3. payment_refunds
4. payment_intents

*Royalty System:*
5. venue_royalty_settings
6. event_royalty_settings
7. royalty_distributions
8. royalty_payouts
9. royalty_reconciliation_runs
10. royalty_discrepancies

*Group Payments:*
11. group_payments
12. group_payment_members
13. reminder_history

*Tax & Compliance:*
14. tax_collections
15. tax_forms_1099da
16. user_tax_info

*Fraud Detection (19 tables):*
17. fraud_checks
18. device_activity
19. bot_detections
20. known_scalpers
21. ip_reputation
22. behavioral_analytics
23. velocity_limits
24. velocity_records
25. fraud_rules
26. fraud_review_queue
27. card_fingerprints
28. ml_fraud_models
29. ml_fraud_predictions
30. account_takeover_signals
31. scalper_reports

*AML (Anti-Money Laundering):*
32. aml_checks
33. sanctions_list_matches
34. pep_database
35. suspicious_activity_reports

*High-Demand / Waiting Room:*
36. waiting_room_activity
37. event_purchase_limits

*Marketplace / Escrow:*
38. payment_escrows
39. escrow_release_conditions
40. venue_price_rules
41. resale_listings

*Chargeback / Reserves:*
42. payment_reserves

*Inventory / Notifications:*
43. inventory_reservations
44. payment_notifications

*Blockchain / NFT:*
45. nft_mint_queue

*Event Sourcing / Outbox:*
46. outbox_dlq
47. payment_event_sequence
48. payment_state_transitions
49. payment_state_machine (seed data)

*Webhooks:*
50. webhook_inbox
51. webhook_events

*Idempotency:*
52. payment_idempotency

*Reconciliation & Settlement:*
53. reconciliation_reports
54. settlement_batches
55. payment_retries
56. payment_chargebacks
57. payment_attempts
58. purchase_limit_violations
59. outbound_webhooks

**From 004_add_stripe_connect_tables.ts (4 tables):**
60. stripe_transfers
61. pending_transfers
62. payout_schedules
63. connected_accounts

**From 005_add_disputes_payouts_jobs.ts (5 tables + duplicate):**
64. payment_disputes
65. payout_events
66. background_jobs
67. payment_audit_log
68. venue_balances (DUPLICATE of table in 001)

**Total: ~68 tables (some duplicates)**

### External Dependencies

**Hard FK References to `venues` table (venue-service):**
- `payment_transactions.venue_id` → venues(id)
- `venue_balances.venue_id` → venues(id)
- `payment_intents.venue_id` → venues(id)
- `venue_royalty_settings.venue_id` → venues(id)
- `nft_mint_queue.venue_id` → venues(id)
- `venue_price_rules.venue_id` → venues(id)
- `resale_listings.venue_id` → venues(id)

**Hard FK References to `users` table (auth-service):**
- `payment_transactions.user_id` → users(id)
- `royalty_distributions.recipient_id` → users(id)
- `royalty_payouts.recipient_id` → users(id)
- `group_payments.organizer_id` → users(id)
- `group_payment_members.user_id` → users(id)
- `tax_forms_1099da.user_id` → users(id)
- `user_tax_info.user_id` → users(id)
- `user_tax_info.w9_verified_by` → users(id)
- `fraud_checks.user_id` → users(id)
- `device_activity.user_id` → users(id)
- `bot_detections.user_id` → users(id)
- `known_scalpers.user_id` → users(id)
- `fraud_review_queue.user_id` → users(id)
- `fraud_review_queue.assigned_to` → users(id)
- `account_takeover_signals.user_id` → users(id)
- `scalper_reports.reporter_id` → users(id)
- `scalper_reports.suspected_scalper_id` → users(id)
- `scalper_reports.reviewed_by` → users(id)
- `aml_checks.user_id` → users(id)
- `sanctions_list_matches.user_id` → users(id)
- `sanctions_list_matches.reviewed_by` → users(id)
- `pep_database.user_id` → users(id)
- `pep_database.verified_by` → users(id)
- `suspicious_activity_reports.user_id` → users(id)
- `suspicious_activity_reports.filed_by` → users(id)
- `waiting_room_activity.user_id` → users(id)
- `payment_notifications.user_id` → users(id)
- `payment_escrows.buyer_id` → users(id)
- `payment_escrows.seller_id` → users(id)
- `resale_listings.seller_id` → users(id)
- `stripe_transfers.recipient_id` → users(id)
- `pending_transfers.recipient_id` → users(id)
- `connected_accounts.owner_id` → users(id)

**Hard FK References to `events` table (event-service):**
- `payment_transactions.event_id` → events(id)
- `event_royalty_settings.event_id` → events(id)
- `royalty_distributions.event_id` → events(id)
- `group_payments.event_id` → events(id)
- `waiting_room_activity.event_id` → events(id)
- `nft_mint_queue.event_id` → events(id)

**Hard FK References to `orders` table (order-service):**
- `payment_intents.order_id` → orders(id)
- `payment_state_transitions.order_id` → orders(id)
- `stripe_transfers.order_id` → orders(id)
- `pending_transfers.order_id` → orders(id)

**Hard FK References to `tickets` table (ticket-service):**
- `resale_listings.ticket_id` → tickets(id)

**Soft References (UUID columns without FK constraints):**
- `payment_transactions.order_id` - no FK constraint on baseline
- Multiple `tenant_id` columns reference `tenants` (auth-service) without FK

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 001_baseline_payment.ts
- `audit_trigger_function()`: **NO** - expects auth-service to create it
- `update_webhook_inbox_updated_at()`: **YES** - additional function for webhook_inbox
- **Unique functions created:**
  - `validate_payment_state_transition()`
  - `get_next_sequence_number()`
  - `update_user_total_spent()` - trigger function for user aggregates
  - `set_tenant_context()` - tenant context helper
  - `clear_tenant_context()` - tenant context helper
  - `enable_rls_bypass()` - admin RLS bypass
  - `disable_rls_bypass()` - admin RLS bypass

### RLS Status
- **YES** - RLS enabled on multiple tables (from 002_add_rls_policies.ts):

**Tenant-isolated tables (16 tables):**
- payment_transactions (tenant_isolation + service_bypass)
- payment_refunds (tenant_isolation + service_bypass)
- payment_intents (tenant_isolation + service_bypass)
- royalty_distributions (tenant_isolation + service_bypass)
- royalty_payouts (tenant_isolation + service_bypass)
- group_payments (tenant_isolation + service_bypass)
- group_payment_members (tenant_isolation + service_bypass)
- tax_collections (tenant_isolation + service_bypass)
- fraud_checks (tenant_isolation + service_bypass)
- fraud_review_queue (tenant_isolation + service_bypass)
- aml_checks (tenant_isolation + service_bypass)
- webhook_inbox (tenant_isolation + service_bypass)
- payment_reserves (tenant_isolation + service_bypass)
- payment_escrows (tenant_isolation + service_bypass)
- payment_notifications (tenant_isolation + service_bypass)
- outbound_webhooks (tenant_isolation + service_bypass)

**Venue-isolated tables (5 tables):**
- venue_balances (venue_isolation)
- venue_royalty_settings (venue_isolation)
- event_royalty_settings (venue_isolation)
- venue_price_rules (venue_isolation)
- resale_listings (venue_isolation)

**From 004_add_stripe_connect_tables.ts (4 tables):**
- stripe_transfers (tenant_isolation)
- pending_transfers (tenant_isolation)
- payout_schedules (tenant_isolation)
- connected_accounts (tenant_isolation)

**From 005_add_disputes_payouts_jobs.ts (3 tables):**
- payment_disputes (tenant_isolation + service_bypass)
- background_jobs (tenant_isolation + service_bypass)
- venue_balances (duplicate - tenant_isolation + service_bypass)

**Tables without RLS (potential issue - ~40+ tables):**
- venue_royalty_settings (baseline - later gets RLS in 002)
- event_royalty_settings (baseline - later gets RLS in 002)
- royalty_reconciliation_runs
- royalty_discrepancies
- reminder_history
- tax_forms_1099da
- user_tax_info
- device_activity
- bot_detections
- known_scalpers
- ip_reputation
- behavioral_analytics
- velocity_limits
- velocity_records
- fraud_rules
- card_fingerprints
- ml_fraud_models
- ml_fraud_predictions
- account_takeover_signals
- scalper_reports
- sanctions_list_matches
- pep_database
- suspicious_activity_reports
- waiting_room_activity
- event_purchase_limits
- escrow_release_conditions
- inventory_reservations
- nft_mint_queue
- outbox_dlq
- payment_event_sequence
- payment_state_transitions
- payment_state_machine
- webhook_events
- payment_idempotency
- reconciliation_reports
- settlement_batches
- payment_retries
- payment_chargebacks
- payment_attempts
- purchase_limit_violations
- payout_events
- payment_audit_log

### Modifies External Tables
- **NO** - Does not directly ALTER external tables
- **BUT** creates trigger `trigger_update_user_total_spent` on `payment_transactions` that updates `users.total_spent` and `users.lifetime_value` (conditional - checks if table exists)

### Table Modifications in Later Migrations

**002_add_rls_policies.ts:**
- Enables RLS on 21 tables
- Makes `tenant_id` NOT NULL on all tenant tables
- Updates NULL tenant_ids to default UUID `00000000-0000-0000-0000-000000000000`

**003_add_concurrent_indexes.ts:**
- Adds 24+ concurrent indexes for performance (no table structure changes)
- Uses `SET lock_timeout = '5s'` for safety

**004_add_stripe_connect_tables.ts:**
- Creates 4 new tables (stripe_transfers, pending_transfers, payout_schedules, connected_accounts)
- All with RLS enabled

**005_add_disputes_payouts_jobs.ts:**
- Creates 5 new tables (payment_disputes, payout_events, background_jobs, payment_audit_log, venue_balances)
- Adds `stripe_charge_id` column to `payment_transactions`
- Adds columns to `stripe_transfers`: venue_id, dispute_id, reversed_at, reversal_reason, failed_at, failure_reason
- Adds columns to `outbox`: attempts, retry_after, error (conditionally if table exists)

**006_add_amount_constraints.ts:**
- Attempts to add CHECK constraints to tables that may not exist (payments, refunds, transfers, escrow_accounts, disputes, payouts)
- Uses catch blocks for missing tables

### Notes
- **MOST COMPLEX SERVICE**: ~68 tables - largest in the platform
- **DEPENDENCY ORDER**: Requires auth-service (users, tenants, audit_trigger_function), venue-service (venues), event-service (events), order-service (orders), ticket-service (tickets)
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which auth-service, venue-service, event-service also create
- **DUPLICATE TABLE**: `venue_balances` created in both 001 and 005 migrations (conflict!)
- **INCONSISTENT RLS COVERAGE**: ~25 tables have RLS, ~40+ tables lack RLS policies
- **CREATES DB ROLE**: Creates `payment_app` role for tenant-scoped queries
- **USER AGGREGATE TRIGGER**: Creates trigger on payment_transactions that updates users.total_spent/lifetime_value
- **COMPREHENSIVE FRAUD DETECTION**: 19 fraud-related tables
- **COMPREHENSIVE AML/COMPLIANCE**: 4 AML tables + tax tables
- **EVENT SOURCING**: payment_event_sequence with strict ordering
- **STATE MACHINE**: Seeded payment_state_machine with valid transitions
- Uses `gen_random_uuid()` for UUID generation
- Uses `SET lock_timeout` for safe concurrent index creation
- Migration 006 references tables that don't exist (payments, refunds, transfers, escrow_accounts, disputes, payouts) - likely wrong table names

---

## order-service

### Files
- `src/migrations/001_baseline_orders.ts`

### Tables Created
**From 001_baseline_orders.ts (17 tables):**

*Core Order Tables:*
1. orders
2. order_items
3. order_events
4. order_addresses

*Refund System:*
5. order_refunds
6. refund_policies
7. refund_reasons
8. refund_policy_rules
9. refund_compliance_log

*Order Modifications:*
10. order_modifications
11. order_splits

*Bulk Operations:*
12. bulk_operations

*Promo Codes:*
13. promo_codes
14. promo_code_redemptions

*Notes:*
15. order_notes

*Disputes:*
16. order_disputes

**Total: 16 tables (Note: discounts & order_discounts tables are noted as owned by ticket-service)**

### Custom Types Created
- `refund_type` - ENUM ('FULL', 'PARTIAL', 'ITEM')
- `modification_type` - ENUM ('ADD_ITEM', 'REMOVE_ITEM', 'UPGRADE_ITEM', 'DOWNGRADE_ITEM', 'CHANGE_QUANTITY')
- `modification_status` - ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED')
- `bulk_operation_status` - ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL_SUCCESS')
- `bulk_operation_type` - ENUM ('BULK_CANCEL', 'BULK_REFUND', 'BULK_UPDATE', 'BULK_EXPORT')
- `discount_type` - ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'BOGO', 'TIERED', 'EARLY_BIRD')
- `order_note_type` - ENUM ('CUSTOMER_INQUIRY', 'ISSUE_REPORTED', 'RESOLUTION', 'VIP_MARKER', 'FRAUD_SUSPICION', 'PAYMENT_ISSUE', 'DELIVERY_ISSUE', 'GENERAL', 'INTERNAL_NOTE')

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `orders.tenant_id` → tenants(id)
- `order_items.tenant_id` → tenants(id)
- `order_events.tenant_id` → tenants(id)
- `order_addresses.tenant_id` → tenants(id)
- `order_refunds.tenant_id` → tenants(id)

**Hard FK References to `users` table (auth-service):**
- `orders.user_id` → users(id)
- `order_events.user_id` → users(id)
- `order_refunds.initiated_by` → users(id)

**Hard FK References to `events` table (event-service):**
- `orders.event_id` → events(id)

**Hard FK References to `ticket_types` table (ticket-service):**
- `order_items.ticket_type_id` → ticket_types(id)

**Soft References (UUID columns without FK constraints):**
- `refund_policies.tenant_id` - no FK
- `refund_reasons.tenant_id` - no FK
- `refund_compliance_log.tenant_id` - no FK
- `refund_compliance_log.refund_id` - no FK
- `order_modifications.tenant_id` - no FK
- `order_modifications.requested_by` - no FK to users
- `order_modifications.approved_by` - no FK to users
- `order_modifications.rejected_by` - no FK to users
- `order_modifications.new_ticket_type_id` - no FK to ticket_types
- `order_splits.tenant_id` - no FK
- `order_splits.split_by` - no FK to users
- `bulk_operations.tenant_id` - no FK
- `bulk_operations.initiated_by` - no FK to users
- `promo_codes.tenant_id` - no FK
- `promo_codes.created_by` - no FK to users
- `promo_code_redemptions.user_id` - no FK to users
- `promo_code_redemptions.tenant_id` - no FK
- `order_notes.tenant_id` - no FK
- `order_notes.user_id` - no FK to users
- `order_notes.admin_user_id` - no FK to users

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 001_baseline_orders.ts
- `audit_trigger_function()`: **NO** - does not create or use this function
- **Unique functions created:**
  - `log_order_status_change()` - trigger function for status tracking
  - `update_event_revenue()` - updates events.revenue when payment_status = 'paid'
  - `calculate_order_total()` - calculates total from components
  - `generate_order_number()` - generates unique order numbers
  - `validate_order_status_transition()` - validates status state machine
  - `orders_search_vector_trigger()` - updates search vector

### RLS Status
- **YES** - RLS enabled on 16 tables:
  - orders (tenant_isolation using `app.current_tenant`)
  - order_items (tenant_isolation)
  - order_events (tenant_isolation)
  - order_addresses (tenant_isolation)
  - order_refunds (tenant_isolation)
  - order_modifications (tenant_isolation)
  - order_splits (tenant_isolation)
  - bulk_operations (tenant_isolation)
  - promo_codes (tenant_isolation)
  - promo_code_redemptions (tenant_isolation)
  - order_notes (tenant_isolation)
  - refund_policies (tenant_isolation)
  - refund_reasons (tenant_isolation)
  - refund_policy_rules (RLS enabled but NO policy created!)
  - refund_compliance_log (tenant_isolation)
  - order_disputes (RLS enabled but NO policy created!)

**NOTE: Different RLS setting name!**
- Uses `app.current_tenant` instead of `app.current_tenant_id` (inconsistent with other services!)

### Modifies External Tables
- **YES** - Creates trigger `trg_update_event_revenue` that updates `events.revenue`:
  ```sql
  UPDATE events SET revenue = revenue + COALESCE(NEW.total_amount, NEW.total_cents) WHERE id = event_id_var
  ```
- References `ticket_types` table in `update_event_revenue()` function

### Notes
- **INCONSISTENT RLS SETTING**: Uses `app.current_tenant` instead of `app.current_tenant_id` used by other services!
- **MISSING RLS POLICIES**: `refund_policy_rules` and `order_disputes` have RLS enabled but NO isolation policy created
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), event-service (events), ticket-service (ticket_types)
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which auth-service, venue-service, event-service, payment-service also create
- **MODIFIES EXTERNAL TABLE**: Trigger updates `events.revenue` column (event-service)
- **GOOD PRACTICE**: Uses CHECK constraints for data validation (subtotal_cents >= 0, total_cents >= 0, quantity > 0)
- **GOOD PRACTICE**: Sets `lock_timeout = '10s'` and `statement_timeout = '60s'` to prevent blocking
- Uses `uuid_generate_v4()` for UUID generation (requires `uuid-ossp` extension)
- Creates `pg_trgm` extension for full-text search
- Creates extensive partial indexes for status-based queries
- Creates comprehensive indexes including GIN indexes for search_vector and arrays
- Full-text search implementation with tsvector column on orders
- Self-referential FKs for order modifications (parent_order_id, split_from_order_id)
- Dispute tracking fields integrated into orders table
- Payout tracking fields integrated into orders table

---

## blockchain-service

### Files
- `src/migrations/001_baseline_blockchain_service.ts`
- `src/migrations/002_add_rls_force_and_fix_tenant_defaults.ts`
- `src/migrations/003_add_check_constraints.ts`
- `src/migrations/004_add_migration_safety.ts`
- `src/migrations/005_add_wallet_soft_delete_columns.ts`
- `src/migrations/006_add_partial_unique_indexes.ts`
- `src/migrations/007_fix_foreign_key_actions.ts`
- `src/migrations/008_ensure_extensions.ts`

### Tables Created
**From 001_baseline_blockchain_service.ts (6 tables):**
1. wallet_addresses
2. user_wallet_connections
3. treasury_wallets
4. blockchain_events
5. blockchain_transactions
6. mint_jobs

**From 002_add_rls_force_and_fix_tenant_defaults.ts (1 table):**
7. blockchain_tenant_audit

**From 004_add_migration_safety.ts (1 table):**
8. migration_config

**Total: 8 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `wallet_addresses.tenant_id` → tenants(id)
- `user_wallet_connections.tenant_id` → tenants(id)
- `treasury_wallets.tenant_id` → tenants(id)
- `blockchain_events.tenant_id` → tenants(id)
- `blockchain_transactions.tenant_id` → tenants(id)
- `mint_jobs.tenant_id` → tenants(id)

**Hard FK References to `users` table (auth-service):**
- `wallet_addresses.user_id` → users(id) (CASCADE → RESTRICT in 007)
- `user_wallet_connections.user_id` → users(id) (CASCADE → RESTRICT in 007)

**Hard FK References to `tickets` table (ticket-service):**
- `blockchain_transactions.ticket_id` → tickets(id) (ON DELETE SET NULL)

**Hard FK References to `orders` table (order-service):**
- `mint_jobs.order_id` → orders(id) (ON DELETE CASCADE)

**Hard FK References to `tickets` table (ticket-service):**
- `mint_jobs.ticket_id` → tickets(id) (ON DELETE CASCADE)

**Soft References (UUID columns without FK constraints):**
- `wallet_addresses.deleted_by` - no FK to users
- `blockchain_tenant_audit.record_id` - no FK

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create this function
- **Unique functions created:**
  - `current_tenant_id()` - returns tenant from session variable
  - `is_admin_user()` - returns admin status from session variable
  - `applyMigrationSafetySettings()` - helper exported (not DB function)
  - `safeAlterTable()` - helper exported (not DB function)
  - `createIndexConcurrently()` - helper exported (not DB function)

### RLS Status
- **YES** - RLS enabled with FORCE on 6 tables (from 001 and enhanced in 002):
  - wallet_addresses (tenant_isolation_select, _insert, _update, _delete)
  - user_wallet_connections (tenant_isolation_select, _insert, _update, _delete)
  - treasury_wallets (tenant_isolation_select, _insert, _update, _delete)
  - blockchain_events (tenant_isolation_select, _insert, _update, _delete)
  - blockchain_transactions (tenant_isolation_select, _insert, _update, _delete)
  - mint_jobs (tenant_isolation_select, _insert, _update, _delete)

**NOTE: FORCE RLS enabled!** (migration 002) - policies apply even to table owners

**RLS Setting Name:** Uses `app.current_tenant` (baseline) → `app.current_tenant_id` (002 enhancement)

**Tables without RLS:**
- blockchain_tenant_audit (audit table)
- migration_config (config table)

### Modifies External Tables
- **YES** - Migration 003 adds CHECK constraints to external tables IF they exist:
  - `tickets` table: status, token_id, mint_address, mint_transaction_id, price constraints
  - `wallets` table: address, type, balance constraints  
  - `nft_mints` table: status, retry_count, signature, mint_address constraints
  - `events` table: event_pda, ticket_price, total_tickets constraints

### Table Modifications in Later Migrations

**002_add_rls_force_and_fix_tenant_defaults.ts:**
- Removes default tenant UUID from all tables
- Adds FORCE RLS
- Creates per-operation RLS policies (SELECT, INSERT, UPDATE, DELETE)
- Creates `blockchain_app` role
- Grants permissions to blockchain_app

**003_add_check_constraints.ts:**
- Adds CHECK constraints to blockchain_transactions (type, status, slot, signature, mint_address)
- Adds CHECK constraints to external tables (tickets, wallets, nft_mints, events) conditionally

**005_add_wallet_soft_delete_columns.ts:**
- Adds to `wallet_addresses`: deleted_at, deleted_by, disconnection_reason
- Adds to `user_wallet_connections`: connection_ip, connection_type, disconnection_reason
- Creates partial index `idx_wallet_addresses_active` WHERE deleted_at IS NULL

**006_add_partial_unique_indexes.ts:**
- Creates `idx_wallet_addresses_tenant_user_active` partial unique index
- Creates `idx_user_wallet_connections_tenant_user_active` partial unique index
- Creates supporting indexes for soft delete queries

**007_fix_foreign_key_actions.ts:**
- Changes user FKs from CASCADE to RESTRICT (wallet_addresses, user_wallet_connections)
- Changes nft_mints, mint_requests FK to RESTRICT
- Changes idempotency_keys FK to SET NULL

**008_ensure_extensions.ts:**
- Creates uuid-ossp extension
- Creates pgcrypto extension
- Creates btree_gin extension (optional)

### Notes
- **GOOD PRACTICE**: Uses FORCE RLS - policies apply even to table owner
- **GOOD PRACTICE**: Per-operation RLS policies (SELECT/INSERT/UPDATE/DELETE) with WITH CHECK
- **GOOD PRACTICE**: Creates application role `blockchain_app` with limited permissions
- **GOOD PRACTICE**: Uses soft delete pattern with partial unique indexes
- **GOOD PRACTICE**: Migration 007 changes CASCADE to RESTRICT to prevent accidental data loss
- **GOOD PRACTICE**: Sets lock_timeout and statement_timeout in migrations
- **INCONSISTENT RLS SETTING**: Baseline uses `app.current_tenant`, enhanced uses `app.current_tenant_id`
- **MODIFIES EXTERNAL TABLES**: Adds CHECK constraints to tickets, wallets, nft_mints, events tables
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), ticket-service (tickets), order-service (orders)
- Uses `uuid_generate_v4()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001` (removed in 002)
- Creates migration_config table for migration metadata and best practices

---

## blockchain-indexer

### Files
- `src/migrations/001_baseline_blockchain_indexer.ts`
- `src/migrations/20260102_add_failed_writes_table.ts`
- `src/migrations/20260102_add_rls_force.ts`

### Tables Created
**From 001_baseline_blockchain_indexer.ts (6 tables):**
1. indexer_state
2. indexed_transactions
3. marketplace_activity
4. reconciliation_runs
5. ownership_discrepancies
6. reconciliation_log

**From 20260102_add_failed_writes_table.ts (1 table):**
7. failed_mongodb_writes

**Total: 7 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `indexer_state.tenant_id` → tenants(id)
- `indexed_transactions.tenant_id` → tenants(id)
- `marketplace_activity.tenant_id` → tenants(id)
- `reconciliation_runs.tenant_id` → tenants(id)
- `ownership_discrepancies.tenant_id` → tenants(id)
- `reconciliation_log.tenant_id` → tenants(id)

**Hard FK References to `tickets` table (ticket-service):**
- `marketplace_activity.ticket_id` → tickets(id) (ON DELETE SET NULL)
- `ownership_discrepancies.ticket_id` → tickets(id) (ON DELETE CASCADE)
- `reconciliation_log.ticket_id` → tickets(id) (ON DELETE CASCADE)

**Internal FK:**
- `reconciliation_log.reconciliation_run_id` → reconciliation_runs(id)

**Soft References (UUID columns without FK constraints):**
- `marketplace_activity.token_id` - Solana token ID string (not FK)
- `marketplace_activity.seller`, `buyer` - wallet addresses (not FK)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create this function

### RLS Status
- **YES** - RLS enabled on 6 tables (from 001):
  - indexer_state (tenant_isolation_policy using `app.current_tenant`)
  - indexed_transactions (tenant_isolation_policy)
  - marketplace_activity (tenant_isolation_policy)
  - reconciliation_runs (tenant_isolation_policy)
  - ownership_discrepancies (tenant_isolation_policy)
  - reconciliation_log (tenant_isolation_policy)

**From 20260102_add_rls_force.ts:**
- Adds FORCE RLS to tables
- Creates additional policies with `app.tenant_id` setting (different from baseline!)

**NOTE: INCONSISTENT RLS SETTING**:
- Baseline uses `app.current_tenant`
- Force migration uses `app.tenant_id` (different!)

**Tables without RLS:**
- failed_mongodb_writes (DLQ table - no tenant_id column)

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **INCONSISTENT RLS SETTING**: Uses `app.current_tenant` in baseline but `app.tenant_id` in force migration!
- **DEPENDENCY ORDER**: Requires auth-service (tenants), ticket-service (tickets)
- **MONGODB INTEGRATION**: Has a DLQ table for failed MongoDB writes (failed_mongodb_writes)
- Uses `uuid_generate_v4()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Tracks marketplace activity from external sources (Magic Eden, Tensor, etc.)
- Comprehensive reconciliation system (runs, logs, discrepancies)
- Force RLS migration references tables that may not exist (wallet_activity, marketplace_events, nft_ownership)
- indexer_state uses singleton pattern (id = 1)

---

## minting-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_minting.ts`

**migrations/ (5 files):**
- `migrations/20260102_add_check_constraints.ts`
- `migrations/20260102_add_foreign_keys.ts`
- `migrations/20260102_add_rls_policies.ts`
- `migrations/20260102_create_app_user_role.ts`
- `migrations/20260102_migration_best_practices.ts` (documentation only)

### Tables Created
**From src/migrations/001_baseline_minting.ts (5 tables):**
1. collections
2. nft_mints
3. nfts
4. ticket_mints
5. minting_reconciliation_reports

**From migrations/20260102_add_rls_policies.ts (1 table):**
6. nft_mints_audit (audit log table)

**From migrations/20260102_add_foreign_keys.ts (conditional):**
- May create `nft_mints` table if it doesn't exist (different schema from baseline)

**Total: 6 tables**

### External Dependencies

**Soft References (UUID columns WITHOUT FK constraints in baseline):**
- `nft_mints.ticket_id` - no FK in baseline (added in 20260102_add_foreign_keys.ts)
- `ticket_mints.ticket_id` - no FK
- `ticket_mints.venue_id` - no FK to venues
- `minting_reconciliation_reports.venue_id` - no FK to venues

**FK References added in migrations/20260102_add_foreign_keys.ts:**
- `nft_mints.ticket_id` → tickets(id) (ON DELETE CASCADE)
- `nft_mints.tenant_id` → tenants(id) (ON DELETE CASCADE)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function in baseline
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created (from migrations/):**
  - `current_tenant_id()` - returns tenant from session variable
  - `is_admin_user()` - returns admin status from session variable
  - `nft_mints_audit_trigger()` - audit trigger function

### RLS Status
- **YES** - RLS enabled on 5 tables (from baseline):
  - collections (tenant_isolation_policy using `app.current_tenant`)
  - nft_mints (tenant_isolation_policy)
  - nfts (tenant_isolation_policy)
  - ticket_mints (tenant_isolation_policy)
  - minting_reconciliation_reports (tenant_isolation_policy)

**Enhanced in migrations/20260102_add_rls_policies.ts:**
- nft_mints gets FORCE RLS + per-operation policies (SELECT/INSERT/UPDATE/DELETE)

**RLS Setting Names Used:**
- Baseline: `app.current_tenant`
- Enhanced (migrations/): `app.current_tenant_id` (different!)

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Table Modifications in Later Migrations

**migrations/20260102_add_check_constraints.ts:**
- Adds CHECK constraints to `nft_mints`:
  - status: IN ('pending', 'minting', 'completed', 'failed', 'cancelled')
  - retry_count: >= 0 AND <= 10
  - blockchain: IN ('solana', 'solana-devnet', 'solana-testnet')
  - mint_address: length 32-64
  - transaction_signature: length 64-128
  - metadata_uri: regex for https/ipfs/ar protocols
  - completed_at consistency check
  - created_at <= updated_at

**migrations/20260102_add_foreign_keys.ts:**
- Adds FK constraint `nft_mints.ticket_id` → tickets(id)
- Adds FK constraint `nft_mints.tenant_id` → tenants(id)
- May create nft_mints table if missing (with different schema)

**migrations/20260102_add_rls_policies.ts:**
- Creates audit table `nft_mints_audit`
- Creates audit trigger `nft_mints_audit`
- Creates per-operation RLS policies with FORCE RLS

**migrations/20260102_create_app_user_role.ts:**
- Creates `minting_app` database role
- Grants table/sequence permissions
- Sets role-specific timeouts (statement_timeout = 30s, lock_timeout = 10s)

### Notes
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories - potential confusion
- **INCONSISTENT RLS SETTING**: Baseline uses `app.current_tenant`, migrations/ uses `app.current_tenant_id`
- **MISSING FKs IN BASELINE**: ticket_id, venue_id references have no FK constraints in baseline
- **DEPENDENCY ORDER**: Requires auth-service (tenants), ticket-service (tickets), venue-service (venues)
- **CREATES DB ROLE**: Creates `minting_app` role with NOSUPERUSER, limited permissions
- Uses `gen_random_uuid()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000000` (different from other services using ...001!)
- Comprehensive audit logging with audit trigger and audit table
- Creates indexes on audit table for performance

---

## transfer-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_transfer.ts`

**migrations/ (1 file):**
- `migrations/20260103_add_rls_policies.ts`

### Tables Created
**From src/migrations/001_baseline_transfer.ts (8 tables):**
1. ticket_transactions
2. batch_transfers
3. batch_transfer_items
4. promotional_codes
5. transfer_fees
6. transfer_rules
7. user_blacklist
8. webhook_subscriptions

**Note:** Migration also enables RLS on `ticket_transfers` but doesn't create it (assumes it exists from ticket-service)

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `ticket_transactions.tenant_id` → tenants(id)
- `batch_transfers.tenant_id` → tenants(id)
- `batch_transfer_items.tenant_id` → tenants(id)
- `promotional_codes.tenant_id` → tenants(id)
- `transfer_fees.tenant_id` → tenants(id)
- `transfer_rules.tenant_id` → tenants(id)
- `user_blacklist.tenant_id` → tenants(id)
- `webhook_subscriptions.tenant_id` → tenants(id)

**Hard FK References to `tickets` table (ticket-service):**
- `ticket_transactions.ticket_id` → tickets(id) (ON DELETE CASCADE)

**Hard FK References to `users` table (auth-service):**
- `ticket_transactions.user_id` → users(id) (ON DELETE RESTRICT)

**Hard FK References to `ticket_transfers` table (ticket-service):**
- `batch_transfer_items.transfer_id` → ticket_transfers(id)
- `transfer_fees.transfer_id` → ticket_transfers(id)

**Soft References (UUID columns without FK constraints):**
- `batch_transfers.user_id` - no FK to users
- `transfer_rules.ticket_type_id` - no FK to ticket_types
- `transfer_rules.event_id` - no FK to events
- `user_blacklist.blacklisted_by` - no FK to users

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 20260103_add_rls_policies.ts
- `audit_trigger_function()`: **NO**
- **Unique functions created:**
  - `set_tenant_id(uuid)` - sets tenant context
  - `clear_tenant_context()` - clears tenant context

### RLS Status
- **YES** - RLS enabled on 9 tables (from baseline):
  - ticket_transactions (tenant_isolation_policy using `app.current_tenant`)
  - ticket_transfers (tenant_isolation_policy - assumes table exists)
  - batch_transfers (tenant_isolation_policy)
  - batch_transfer_items (tenant_isolation_policy)
  - promotional_codes (tenant_isolation_policy)
  - transfer_fees (tenant_isolation_policy)
  - transfer_rules (tenant_isolation_policy)
  - user_blacklist (tenant_isolation_policy)
  - webhook_subscriptions (tenant_isolation_policy)

**Enhanced in migrations/20260103_add_rls_policies.ts:**
- `transfers` (FORCE RLS + per-operation policies) - different table name!
- `blockchain_transfers` (FORCE RLS + per-operation policies) - not in baseline!
- `transfer_audit_log` (FORCE RLS) - not in baseline!

**RLS Setting Names Used:**
- Baseline: `app.current_tenant`
- Enhanced (migrations/): `app.current_tenant_id` (different!)

**Also supports:** `app.bypass_rls = 'true'` for admin bypass

### Modifies External Tables
- **NO** - Does not ALTER external tables
- **BUT** enables RLS on `ticket_transfers` which is owned by ticket-service!

### Notes
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories
- **TABLE NAME MISMATCH**: Baseline creates `ticket_transactions`, migrations/ expects `transfers`, `blockchain_transfers`, `transfer_audit_log` - tables don't match!
- **REFERENCES EXTERNAL TABLE**: Enables RLS on `ticket_transfers` which is owned by ticket-service
- **INCONSISTENT RLS SETTING**: Baseline uses `app.current_tenant`, migrations/ uses `app.current_tenant_id`
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which many other services also create
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), ticket-service (tickets, ticket_transfers)
- **CREATES DB ROLE**: Creates `app_user` role in 20260103_add_rls_policies.ts
- Uses `uuid_generate_v4()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Creates CHECK constraint to prevent null/default tenant_id
- Comprehensive transfer rules engine with priority-based evaluation
- User blacklist system for fraud prevention
- Webhook subscription system for event notifications

---

## notification-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_notification_schema.ts`

**migrations/ (1 file):**
- `migrations/20260103_add_rls_and_webhook_events.ts`

### Tables Created
**From src/migrations/001_baseline_notification_schema.ts (36 tables):**

*Core Notification Tables:*
1. scheduled_notifications
2. notification_history

*Consent Management:*
3. consent_records
4. suppression_list

*User Preferences:*
5. notification_preferences
6. notification_preference_history

*Delivery Stats:*
7. notification_delivery_stats

*Analytics Tables:*
8. notification_tracking
9. notification_analytics
10. notification_engagement
11. notification_clicks

*Template Management:*
12. notification_templates
13. notification_campaigns
14. audience_segments
15. email_automation_triggers

*A/B Testing:*
16. ab_tests
17. ab_test_variants
18. ab_test_metrics

*Automation:*
19. automation_executions

*Bounce Tracking:*
20. bounces

*Campaign Analytics:*
21. campaign_stats
22. engagement_events
23. notification_analytics_daily

*GDPR & Data Management:*
24. pending_deletions

*Template Tracking:*
25. template_usage
26. template_versions

*Internationalization:*
27. translations

*Venue Monitoring:*
28. venue_health_scores

*Abandoned Cart:*
29. abandoned_carts

*Settings:*
30. venue_notification_settings

*Costs:*
31. notification_costs

**From migrations/20260103_add_rls_and_webhook_events.ts (1 table):**
32. webhook_events

**Total: 32 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- `scheduled_notifications.tenant_id` → tenants(id)

**Hard FK References to `users` table (auth-service):**
- `scheduled_notifications.user_id` → users(id)
- `notification_history.recipient_id` → users(id)
- `consent_records.customer_id` → users(id)
- `suppression_list.suppressed_by` → users(id)
- `notification_preferences.user_id` → users(id)
- `notification_preference_history.changed_by` → users(id)
- `notification_engagement.user_id` → users(id)
- `notification_clicks.user_id` → users(id)
- `abandoned_carts.user_id` → users(id)

**Hard FK References to `venues` table (venue-service):**
- `notification_history.venue_id` → venues(id)
- `consent_records.venue_id` → venues(id)
- `notification_templates.venue_id` → venues(id)
- `notification_campaigns.venue_id` → venues(id)
- `audience_segments.venue_id` → venues(id)
- `email_automation_triggers.venue_id` → venues(id)
- `ab_tests.venue_id` → venues(id)
- `abandoned_carts.venue_id` → venues(id)
- `venue_notification_settings.venue_id` → venues(id)
- `notification_costs.venue_id` → venues(id)

**Hard FK References to `orders` table (order-service):**
- `scheduled_notifications.order_id` → orders(id)
- `abandoned_carts.order_id` → orders(id)

**Hard FK References to `events` table (event-service):**
- `abandoned_carts.event_id` → events(id)

**Internal FK References:**
- `notification_preference_history.user_id` → notification_preferences(user_id)
- `notification_engagement.notification_id` → notification_history(id)
- `notification_clicks.notification_id` → notification_history(id)
- `notification_campaigns.template_id` → notification_templates(id)
- `email_automation_triggers.template_id` → notification_templates(id)
- `ab_test_variants.ab_test_id` → ab_tests(id)
- `ab_test_variants.template_id` → notification_templates(id)
- `notification_costs.notification_id` → notification_history(id)

**Soft References (UUID columns without FK constraints):**
- Multiple `tenant_id` columns without FK (notification_tracking, ab_test_metrics, automation_executions, bounces, campaign_stats, engagement_events, notification_analytics_daily, pending_deletions, template_usage, template_versions, venue_health_scores)
- Multiple `notification_id` columns without FK
- Multiple `venue_id` columns without FK (bounces, notification_tracking, template_usage, venue_health_scores)

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function in 001_baseline_notification_schema.ts
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created:**
  - `aggregate_notification_analytics()` - aggregates analytics data

### RLS Status
- **NONE IN BASELINE!** - The baseline migration creates 32 tables but NO RLS policies!

**RLS added in migrations/20260103_add_rls_and_webhook_events.ts:**
- `notifications` (FORCE RLS + tenant_isolation policy) - but this table doesn't exist in baseline!
- `notification_preferences` (FORCE RLS + tenant_isolation policy) - adds tenant_id column if missing
- `notification_templates` (FORCE RLS + tenant_isolation policy) - adds tenant_id column if missing

**RLS Setting Name:** Uses `app.current_tenant`

**CRITICAL: 29+ tables have NO RLS:**
- scheduled_notifications
- notification_history
- consent_records
- suppression_list
- notification_preference_history
- notification_delivery_stats
- notification_tracking
- notification_analytics
- notification_engagement
- notification_clicks
- notification_campaigns
- audience_segments
- email_automation_triggers
- ab_tests
- ab_test_variants
- ab_test_metrics
- automation_executions
- bounces
- campaign_stats
- engagement_events
- notification_analytics_daily
- pending_deletions
- template_usage
- template_versions
- translations
- venue_health_scores
- abandoned_carts
- venue_notification_settings
- notification_costs
- webhook_events

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Table Modifications in Later Migrations

**migrations/20260103_add_rls_and_webhook_events.ts:**
- Creates `webhook_events` table for deduplication
- Conditionally adds `tenant_id` column to `notifications`, `notification_preferences`, `notification_templates` if missing
- Backfills tenant_id with `00000000-0000-0000-0000-000000000000` (all zeros)
- Creates `notification_service_app` database role
- Grants permissions to app role

### Notes
- **LARGEST TABLE COUNT**: 32 tables - second largest in the platform (after payment-service's 68)
- **CRITICAL: NO RLS IN BASELINE**: The baseline creates 32 tables but NO RLS policies!
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories
- **TABLE MISMATCH**: migrations/ expects `notifications` table but baseline creates `notification_history` and `scheduled_notifications`
- **INCONSISTENT tenant_id**: migrations/ uses `00000000-...000000000000` (all zeros), different from other services
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which many other services also create
- **HEAVY EXTERNAL DEPENDENCIES**: 21 cross-service FK constraints to users, venues, orders, events, tenants
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), venue-service (venues), order-service (orders), event-service (events)
- **CREATES DB ROLE**: Creates `notification_service_app` role
- Uses `uuid_generate_v4()` for UUID generation
- Comprehensive analytics system (hourly, daily aggregations)
- Comprehensive A/B testing system
- GDPR compliance with pending_deletions and PII encryption support
- Email automation with triggers and execution tracking
- Bounce tracking with type classification (hard, soft, complaint, transient)
- Venue health monitoring with scoring
- Abandoned cart tracking with recovery email support
- Cost tracking per notification
- Internationalization with translations table
- Quiet hours support in preferences and venue settings
- CHECK constraints for hour values (0-23), scores (0-100)
- Creates 10+ update triggers for updated_at columns

---

## marketplace-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_marketplace.ts`

**migrations/ (2 files):**
- `migrations/20260103_add_rls_policies.ts`
- `migrations/20260103_add_indexes_and_audit.ts`

### Tables Created
**From src/migrations/001_baseline_marketplace.ts (11 tables):**
1. marketplace_listings
2. marketplace_transfers
3. platform_fees
4. venue_marketplace_settings
5. marketplace_price_history
6. marketplace_disputes
7. dispute_evidence
8. tax_transactions
9. anti_bot_activities
10. anti_bot_violations
11. marketplace_blacklist

**Total: 11 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 11 tables have `tenant_id` → tenants(id) with NO DEFAULT (by design!)

**Hard FK References to `users` table (auth-service):**
- `marketplace_listings.seller_id` → users(id)
- `marketplace_listings.approved_by` → users(id)
- `marketplace_transfers.buyer_id` → users(id)
- `marketplace_transfers.seller_id` → users(id)
- `marketplace_price_history.changed_by` → users(id)
- `marketplace_disputes.filed_by` → users(id)
- `marketplace_disputes.filed_against` → users(id)
- `marketplace_disputes.resolved_by` → users(id)
- `dispute_evidence.submitted_by` → users(id)
- `tax_transactions.seller_id` → users(id)
- `anti_bot_activities.user_id` → users(id)
- `anti_bot_violations.user_id` → users(id)
- `marketplace_blacklist.user_id` → users(id)
- `marketplace_blacklist.banned_by` → users(id)

**Hard FK References to `tickets` table (ticket-service):**
- `marketplace_listings.ticket_id` → tickets(id) (CASCADE)

**Hard FK References to `events` table (event-service):**
- `marketplace_listings.event_id` → events(id)
- `marketplace_transfers.event_id` → events(id)
- `marketplace_price_history.event_id` → events(id)

**Hard FK References to `venues` table (venue-service):**
- `marketplace_listings.venue_id` → venues(id)
- `marketplace_transfers.venue_id` → venues(id)
- `venue_marketplace_settings.venue_id` → venues(id)

**Internal FK References:**
- `marketplace_transfers.listing_id` → marketplace_listings(id)
- `platform_fees.transfer_id` → marketplace_transfers(id)
- `marketplace_price_history.listing_id` → marketplace_listings(id)
- `marketplace_disputes.transfer_id` → marketplace_transfers(id)
- `marketplace_disputes.listing_id` → marketplace_listings(id)
- `dispute_evidence.dispute_id` → marketplace_disputes(id)
- `tax_transactions.transfer_id` → marketplace_transfers(id)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created:**
  - `expire_marketplace_listings()` - auto-expire listings
  - `calculate_marketplace_fees()` - fee calculation
  - `get_user_active_listings_count()` - count user listings
  - `set_tenant_context()` (in migrations/) - tenant context setter

### RLS Status
- **YES** - RLS enabled on all 11 tables (from baseline):
  - marketplace_listings (tenant_isolation_policy using `app.current_tenant`)
  - marketplace_transfers (tenant_isolation_policy)
  - platform_fees (tenant_isolation_policy)
  - venue_marketplace_settings (tenant_isolation_policy)
  - marketplace_price_history (tenant_isolation_policy)
  - marketplace_disputes (tenant_isolation_policy)
  - dispute_evidence (tenant_isolation_policy)
  - tax_transactions (tenant_isolation_policy)
  - anti_bot_activities (tenant_isolation_policy)
  - anti_bot_violations (tenant_isolation_policy)
  - marketplace_blacklist (tenant_isolation_policy)

**Enhanced in migrations/20260103_add_rls_policies.ts:**
- Adds FORCE RLS to tables (`listings`, `transfers`, `fees`, `disputes`, `venue_settings`) - NOTE: different table names!
- Creates per-operation policies (SELECT, INSERT, UPDATE, DELETE)
- Creates `marketplace_app` role with limited privileges
- Uses `app.current_tenant_id` AND `app.current_user_id` (different from baseline!)

**RLS Setting Names Used:**
- Baseline: `app.current_tenant`
- Enhanced (migrations/): `app.current_tenant_id` + `app.current_user_id` (different!)

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **GOOD PRACTICE: NO DEFAULT tenant_id** - Explicitly requires tenant_id on every insert (prevents silent data leakage)
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories
- **TABLE NAME MISMATCH**: Baseline creates `marketplace_*` prefixed tables, but migrations/ expects `listings`, `transfers`, `fees`, `disputes`, `venue_settings` (no prefix!)
- **INCONSISTENT RLS SETTING**: Baseline uses `app.current_tenant`, migrations/ uses `app.current_tenant_id`
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), venue-service (venues), event-service (events), ticket-service (tickets)
- **CREATES DB ROLE**: Creates `marketplace_app` role with limited permissions
- Uses `uuid_generate_v4()` for UUID generation
- All monetary values stored as INTEGER CENTS (good practice)
- Soft delete pattern with `deleted_at` column
- Comprehensive dispute resolution system with evidence tracking
- Tax reporting for IRS compliance (1099 forms)
- Anti-bot protection (activities tracking, violations, blacklist)
- Stripe Connect integration for fiat payments
- Blockchain integration for crypto payments
- 29 FK constraints (7 internal + 22 cross-service)
- CHECK constraint for payment_method IN ('crypto', 'fiat')

---

## queue-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_queue.ts`

### Tables Created
**From src/migrations/001_baseline_queue.ts (10 tables):**
1. queues
2. jobs
3. schedules
4. rate_limits
5. critical_jobs
6. queue_metrics
7. idempotency_keys
8. rate_limiters
9. alert_history
10. dead_letter_jobs

**Total: 10 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 10 tables have `tenant_id` → tenants(id) with DEFAULT `00000000-0000-0000-0000-000000000001`

**Soft References (UUID columns without FK constraints):**
- `alert_history.acknowledged_by` - no FK to users
- `dead_letter_jobs.original_job_id` - no FK to jobs

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create

### RLS Status
- **YES** - RLS enabled on all 10 tables (from baseline):
  - queues (tenant_isolation_policy using `app.current_tenant`)
  - jobs (tenant_isolation_policy)
  - schedules (tenant_isolation_policy)
  - rate_limits (tenant_isolation_policy)
  - critical_jobs (tenant_isolation_policy)
  - queue_metrics (tenant_isolation_policy)
  - idempotency_keys (tenant_isolation_policy)
  - rate_limiters (tenant_isolation_policy)
  - alert_history (tenant_isolation_policy)
  - dead_letter_jobs (tenant_isolation_policy)

**RLS Setting Name:** Uses `app.current_tenant`

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Seed Data
- Inserts initial rate limiter configurations for:
  - `stripe` (100 tokens, 10 concurrent max)
  - `twilio` (10 tokens, 5 concurrent max)
  - `sendgrid` (50 tokens, 10 concurrent max)
  - `solana_rpc` (25 tokens, 5 concurrent max)

### Notes
- **GOOD RLS COVERAGE**: All 10 tables have RLS policies!
- **NO MIGRATION DIRECTORY SPLIT**: Only has `src/migrations/` (no `migrations/` directory)
- **DEPENDENCY ORDER**: Only requires auth-service (tenants)
- **MINIMAL EXTERNAL DEPENDENCIES**: No FKs to users, events, venues, tickets, etc.
- Uses `gen_random_uuid()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Comprehensive job queue system with priority, scheduling, and metrics
- Token bucket rate limiting with configurable refill rates
- Dead letter queue for failed jobs
- Alert history for monitoring
- Idempotency key support to prevent duplicate processing
- Critical jobs table for high-priority persistence
- Supports multiple queue types with configurable settings

---

## compliance-service

### Files
**src/migrations/ (5 files):**
- `src/migrations/001_baseline_compliance.ts`
- `src/migrations/002_add_missing_tables.ts`
- `src/migrations/003_add_tenant_isolation.ts`
- `src/migrations/004_add_foreign_keys.ts`
- `src/migrations/005_add_phase5_6_tables.ts`

**migrations/ (2 files):**
- `migrations/20260103_add_partial_indexes_and_safety.ts`
- `migrations/20260103_add_rls_policies.ts`

### Tables Created
**From src/migrations/001_baseline_compliance.ts (15 tables):**
1. venue_verifications
2. tax_records
3. ofac_checks
4. risk_assessments
5. risk_flags
6. compliance_documents
7. bank_verifications
8. payout_methods
9. notification_log
10. compliance_settings
11. compliance_batch_jobs
12. form_1099_records
13. webhook_logs
14. ofac_sdn_list
15. compliance_audit_log

**From src/migrations/002_add_missing_tables.ts (6 tables):**
16. gdpr_deletion_requests
17. pci_access_logs
18. state_compliance_rules
19. customer_profiles
20. customer_preferences
21. customer_analytics

**Total: ~21 tables**

### External Dependencies

**CRITICAL: NO FK CONSTRAINTS TO EXTERNAL TABLES IN BASELINE!**
- Only `compliance_audit_log` has `tenant_id` in baseline (as string, not FK)
- All other tables use `venue_id` as STRING, not UUID with FK!

**Tables added tenant_id via migration 003:**
- All 21 tables get UUID `tenant_id` column
- Backfilled with default `00000000-0000-0000-0000-000000000001`

**FKs added in migrations/20260103_add_rls_policies.ts:**
- `tax_records.venue_id` → venues(id) (ON DELETE RESTRICT)
- `tax_summaries.venue_id` → venues(id) (ON DELETE RESTRICT)
- `ofac_screenings.venue_id` → venues(id) (ON DELETE SET NULL)

**Soft References (STRING columns, no FK):**
- `venue_verifications.venue_id` - STRING not UUID!
- `tax_records.venue_id` - STRING
- `ofac_checks.venue_id` - STRING
- `compliance_documents.venue_id` - STRING
- Many more...

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create
- `audit_trigger_function()`: **NO** - creates different function: `compliance.audit_trigger_func()`
- **Unique functions created:**
  - `compliance.get_current_tenant_id()` - returns tenant from session
  - `compliance.audit_trigger_func()` - audit trigger for compliance tables

### RLS Status
- **NONE IN BASELINE!** - Original 15 tables have NO RLS!
- **RLS added in migrations/20260103_add_rls_policies.ts:**
  - venue_verifications (FORCE RLS + tenant_isolation)
  - venue_documents (FORCE RLS)
  - tax_records (FORCE RLS)
  - tax_summaries (FORCE RLS)
  - ofac_screenings (FORCE RLS)
  - risk_assessments (FORCE RLS)
  - risk_flags (FORCE RLS)
  - bank_verifications (FORCE RLS)
  - gdpr_requests (FORCE RLS)
  - compliance_settings (FORCE RLS)
  - audit_logs (FORCE RLS)

**NOTE: Different table names!** Migration references tables that may not exist (venue_documents, tax_summaries, ofac_screenings, gdpr_requests, audit_logs)

**RLS Setting Name:** Uses `app.current_tenant_id` via `compliance.get_current_tenant_id()` function

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **CRITICAL: USES INCREMENTAL INTEGER IDs** instead of UUIDs - inconsistent with other services!
- **CRITICAL: BASELINE HAS NO TENANT_ID ON MOST TABLES** - added via migration 003
- **CRITICAL: NO RLS IN BASELINE** - added via migrations/20260103_add_rls_policies.ts
- **STRING venue_id INSTEAD OF UUID FK** - data integrity risk!
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories
- **TABLE NAME MISMATCH**: Migration expects tables that don't exist (venue_documents, tax_summaries, etc.)
- **CREATES DB ROLE**: Creates `app_compliance` role
- **CREATES SCHEMA**: Uses `compliance` schema for functions
- **DEPENDENCY ORDER**: Requires venue-service (venues) for FKs
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Comprehensive tax reporting (1099 forms, thresholds)
- OFAC screening and SDN list management
- Risk assessment and flagging system
- Bank verification with Plaid integration
- GDPR deletion request tracking
- PCI access logging
- Multi-state compliance rules
- Customer analytics with preferences
- Seeds default compliance settings
- CHECK constraints for EIN format, amounts, risk scores, status values
- Audit triggers on sensitive tables (tax_records, bank_verifications, etc.)

---

## integration-service

### Files
**src/migrations/ (3 files):**
- `src/migrations/001_baseline_integration.ts`
- `src/migrations/002_add_missing_tables.ts`
- `src/migrations/20260103_add_rls_policies.ts`

### Tables Created
**From src/migrations/001_baseline_integration.ts (10 tables):**
1. integrations
2. connections
3. field_mappings
4. webhooks
5. integration_configs
6. integration_health
7. integration_webhooks
8. sync_queue
9. sync_logs
10. integration_costs

**Total: 10 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 10 tables have `tenant_id` → tenants(id) with DEFAULT `00000000-0000-0000-0000-000000000001`

**Hard FK References to `users` table (auth-service):**
- `connections.user_id` → users(id) (ON DELETE SET NULL)

**Hard FK References to `venues` table (venue-service):**
- `connections.venue_id` → venues(id) (ON DELETE SET NULL)
- `integration_configs.venue_id` → venues(id) (ON DELETE CASCADE)
- `integration_health.venue_id` → venues(id) (ON DELETE CASCADE)
- `integration_webhooks.venue_id` → venues(id) (ON DELETE SET NULL)
- `sync_queue.venue_id` → venues(id) (ON DELETE CASCADE)
- `sync_logs.venue_id` → venues(id) (ON DELETE CASCADE)
- `integration_costs.venue_id` → venues(id) (ON DELETE CASCADE)

**Internal FK References:**
- `connections.integration_id` → integrations(id) (ON DELETE CASCADE)
- `field_mappings.connection_id` → connections(id) (ON DELETE CASCADE)
- `webhooks.connection_id` → connections(id) (ON DELETE CASCADE)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create
- `audit_trigger_function()`: **NO** - does not create

### RLS Status
- **YES** - RLS enabled on all 10 tables (from baseline):
  - integrations (tenant_isolation_policy using `app.current_tenant`)
  - connections (tenant_isolation_policy)
  - field_mappings (tenant_isolation_policy)
  - webhooks (tenant_isolation_policy)
  - integration_configs (tenant_isolation_policy)
  - integration_health (tenant_isolation_policy)
  - integration_webhooks (tenant_isolation_policy)
  - sync_queue (tenant_isolation_policy)
  - sync_logs (tenant_isolation_policy)
  - integration_costs (tenant_isolation_policy)

**RLS Setting Name:** Uses `app.current_tenant`

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **GOOD RLS COVERAGE**: All 10 tables have RLS policies in baseline!
- **NO MIGRATION DIRECTORY SPLIT** - Only `src/migrations/`
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), venue-service (venues)
- Uses `gen_random_uuid()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Comprehensive integration management (integrations, connections, configs)
- OAuth token management with encryption (access_token_encrypted, refresh_token_encrypted)
- Field mapping system for data transformation
- Webhook event storage and processing
- Health monitoring with uptime tracking
- Sync queue with priority and retry support
- Sync logs with success/error/skip counts
- Cost tracking for API usage
- Provider integrations: Mailchimp, QuickBooks, Square, Stripe
- 8 FK constraints (3 internal + 5 cross-service)
- Comprehensive indexes including unique composite indexes

---

## scanning-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_scanning.ts`

### Tables Created
**From src/migrations/001_baseline_scanning.ts (7 tables):**
1. scanner_devices
2. devices
3. scans
4. scan_policy_templates
5. scan_policies
6. offline_validation_cache
7. scan_anomalies

**Total: 7 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 7 tables have `tenant_id` → tenants(id) with DEFAULT `00000000-0000-0000-0000-000000000001`

**Hard FK References to `users` table (auth-service):**
- `scanner_devices.registered_by` → users(id) (ON DELETE SET NULL)
- `scanner_devices.revoked_by` → users(id) (ON DELETE SET NULL)

**Hard FK References to `venues` table (venue-service):**
- `scanner_devices.venue_id` → venues(id) (ON DELETE SET NULL)
- `scan_policies.venue_id` → venues(id) (ON DELETE SET NULL)

**Hard FK References to `tickets` table (ticket-service):**
- `scans.ticket_id` → tickets(id) (ON DELETE RESTRICT)
- `offline_validation_cache.ticket_id` → tickets(id) (ON DELETE CASCADE)
- `scan_anomalies.ticket_id` → tickets(id) (ON DELETE RESTRICT)

**Hard FK References to `events` table (event-service):**
- `scan_policies.event_id` → events(id) (ON DELETE CASCADE)
- `offline_validation_cache.event_id` → events(id) (ON DELETE CASCADE)

**Soft References:**
- `scans.device_id` - UUID, no FK constraint
- `scan_anomalies.device_id` - STRING, no FK

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create

### RLS Status
- **YES** - RLS enabled on all 7 tables (from baseline):
  - scanner_devices (tenant_isolation_policy using `app.current_tenant`)
  - devices (tenant_isolation_policy)
  - scans (tenant_isolation_policy)
  - scan_policy_templates (tenant_isolation_policy)
  - scan_policies (tenant_isolation_policy)
  - offline_validation_cache (tenant_isolation_policy)
  - scan_anomalies (tenant_isolation_policy)

**RLS Setting Name:** Uses `app.current_tenant`

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **GOOD RLS COVERAGE**: All 7 tables have RLS policies in baseline!
- **NO MIGRATION DIRECTORY SPLIT** - Only `src/migrations/`
- **DEPENDENCY ORDER**: Requires auth-service (tenants, users), venue-service (venues), ticket-service (tickets), event-service (events)
- Uses `uuid_generate_v4()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- 9 FK constraints (all cross-service)
- Comprehensive offline validation support with cached ticket data
- Anomaly detection with risk scoring (0-100) and PostgreSQL array type for anomaly_types
- Scan policy system with templates for reuse
- Zone-based access control (VIP, General, Backstage, etc.)
- Device registry with offline capability tracking
- Supports duplicate detection with composite index

---

## monitoring-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_baseline_monitoring_schema.ts`

### Tables Created
**From src/migrations/001_baseline_monitoring_schema.ts (11 tables):**
1. alerts
2. alert_rules
3. dashboards
4. metrics
5. nft_transfers
6. fraud_events
7. incidents
8. sla_metrics
9. performance_metrics
10. reports
11. report_history

**Total: 11 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 11 tables have `tenant_id` → tenants(id) with DEFAULT `00000000-0000-0000-0000-000000000001`

**Internal FK References:**
- `report_history.report_id` → reports(id) (ON DELETE CASCADE)

**Soft References (UUID/STRING columns without FK constraints):**
- `dashboards.owner` - STRING (no FK to users)
- `fraud_events.user_id` - STRING (no FK to users!)
- `reports.user_id` - UUID (no FK to users)
- `nft_transfers.token_address` - STRING (no FK)
- `nft_transfers.from_address`, `to_address` - STRING wallet addresses

### Duplicate Functions
- `update_updated_at_column()`: **YES** - creates this function!
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created:**
  - `cleanup_old_metrics()` - data retention (90 days)
  - `cleanup_old_fraud_events()` - data retention (1 year for investigated)

### RLS Status
- **YES** - RLS enabled on all 11 tables (from baseline):
  - alerts (tenant_isolation_policy using `app.current_tenant`)
  - alert_rules (tenant_isolation_policy)
  - dashboards (tenant_isolation_policy)
  - metrics (tenant_isolation_policy)
  - nft_transfers (tenant_isolation_policy)
  - fraud_events (tenant_isolation_policy)
  - incidents (tenant_isolation_policy)
  - sla_metrics (tenant_isolation_policy)
  - performance_metrics (tenant_isolation_policy)
  - reports (tenant_isolation_policy)
  - report_history (tenant_isolation_policy)

**RLS Setting Name:** Uses `app.current_tenant`

### Modifies External Tables
- **YES** - Creates trigger on `nft_mints` table (which doesn't exist in this service!):
  ```sql
  CREATE TRIGGER update_nft_mints_updated_at BEFORE UPDATE ON nft_mints
  ```

### Notes
- **GOOD RLS COVERAGE**: All 11 tables have RLS policies in baseline!
- **NO MIGRATION DIRECTORY SPLIT** - Only `src/migrations/`
- **DEPENDENCY ORDER**: Only requires auth-service (tenants) - minimal external dependencies!
- **DUPLICATE FUNCTION**: Creates `update_updated_at_column()` which many other services also create
- **REFERENCES EXTERNAL TABLE**: Creates trigger on `nft_mints` (minting-service table) - will fail if table doesn't exist
- Uses `uuid_generate_v4()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Uses conditional table creation (`hasTable` check before CREATE)
- Uses PostgreSQL ENUM types for alert/incident types and severities
- Comprehensive alerting system with rules, severity levels, and resolution tracking
- Dashboard system with widget and layout support
- Metrics collection with service/endpoint tracking
- NFT transfer tracking
- Fraud event detection with investigation workflow
- Incident management system
- SLA metrics with uptime and response time tracking
- Performance metrics per endpoint
- Reporting system with scheduling and history
- Data retention functions for automatic cleanup
- Multiple partial indexes (WHERE clauses) for efficient querying
- Comprehensive composite indexes for time-series queries

---

## analytics-service

### Files
**src/migrations/ (3 files):**
- `src/migrations/001_analytics_baseline.ts`
- `src/migrations/002_create_external_analytics_tables.ts`
- `src/migrations/003_add_rls_to_price_tables.ts`

**migrations/ (1 file):**
- `migrations/20260103_add_rls_policies.ts`

### Tables Created
**From src/migrations/001_analytics_baseline.ts (13 tables):**
1. analytics_metrics
2. analytics_aggregations
3. analytics_alerts
4. analytics_dashboards
5. analytics_widgets
6. analytics_exports
7. customer_rfm_scores
8. customer_segments
9. customer_lifetime_value
10. realtime_metrics
11. venue_alerts
12. price_history
13. pending_price_changes

**Total: 13 tables + ~25 views + 4 materialized views**

### Views Created (Extensive!)
**Core Analytics Views:**
- event_summary
- venue_analytics
- ticket_status_details
- ticket_inventory_summary

**Customer 360 Views (8-layer hierarchy):**
- customer_360_basic
- customer_360_with_preferences
- customer_360_with_purchases
- customer_360_with_engagement
- customer_360_with_segments
- customer_360_with_churn_risk
- customer_360 (final view)
- customer_segment_summary
- churn_risk_dashboard
- customer_360_gdpr

**Financial Views:**
- financial_summary_basic
- financial_summary_payment_methods
- financial_summary_with_refunds
- financial_summary_with_fees
- financial_summary
- daily_revenue_summary

**Marketplace Views:**
- marketplace_activity_basic
- marketplace_activity_with_listings
- marketplace_activity_with_users
- marketplace_activity_with_fees
- marketplace_activity
- daily_marketplace_summary
- seller_performance

**Compliance Views:**
- compliance_reporting_basic
- compliance_reporting_user_activity
- compliance_reporting_data_changes
- compliance_reporting_risk_analysis
- compliance_reporting
- daily_compliance_summary
- user_risk_profile
- compliance_reporting_gdpr

**User Dashboard View:**
- user_dashboard_view

**Materialized Views:**
- venue_analytics_mv
- customer_360_materialized
- marketplace_activity_materialized
- compliance_reporting_materialized
- user_dashboard_materialized

### External Dependencies

**Soft References (UUID columns without FK constraints):**
- `analytics_dashboards.created_by` - no FK to users
- `analytics_alerts.resolved_by` - no FK to users
- `analytics_exports.requested_by` - no FK to users
- `customer_rfm_scores.customer_id` - no FK to users
- `customer_rfm_scores.venue_id` - no FK to venues
- `customer_segments.venue_id` - no FK to venues
- `customer_lifetime_value.customer_id` - no FK to users
- `customer_lifetime_value.venue_id` - no FK to venues
- `realtime_metrics.venue_id` - no FK to venues
- `venue_alerts.venue_id` - no FK to venues
- `price_history.event_id` - no FK to events
- `price_history.changed_by` - no FK to users
- `pending_price_changes.event_id` - no FK to events
- `pending_price_changes.approved_by`/`rejected_by` - no FK to users

**Views Reference External Tables (READ-ONLY):**
- `events`, `venues`, `tickets`, `ticket_types` (event/venue/ticket-service)
- `users` (auth-service)
- `payment_transactions` (payment-service)
- `marketplace_transfers`, `marketplace_listings`, `platform_fees` (marketplace-service)
- `audit_logs` (auth-service)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created:**
  - `refresh_venue_analytics_mv()` - refresh materialized view
  - `refresh_user_dashboard(uuid[])` - refresh user dashboard view
  - `refresh_compliance_reporting_materialized()` - refresh compliance view

### RLS Status
- **YES** - RLS enabled on 11 tables (from baseline):
  - analytics_metrics (tenant_isolation_policy using `app.current_tenant`)
  - analytics_aggregations (tenant_isolation_policy)
  - analytics_alerts (tenant_isolation_policy)
  - analytics_dashboards (tenant_isolation_policy)
  - analytics_widgets (tenant_isolation_policy)
  - analytics_exports (tenant_isolation_policy)
  - customer_rfm_scores (tenant_isolation_policy)
  - customer_segments (tenant_isolation_policy)
  - customer_lifetime_value (tenant_isolation_policy)
  - realtime_metrics (tenant_isolation_policy)
  - venue_alerts (tenant_isolation_policy)

**Tables without RLS:**
- price_history (no tenant_id column!)
- pending_price_changes (no tenant_id column!)

**RLS Setting Name:** Uses `app.current_tenant` (UUID cast!)

### Modifies External Tables
- **NO** - Does not ALTER external tables
- **BUT** Views SELECT from many external tables (read-only cross-service access)

### Notes
- **MOST COMPREHENSIVE VIEWS**: Creates ~25 views + 4 materialized views
- **TWO MIGRATION DIRECTORIES**: Has both `src/migrations/` and `migrations/` directories
- **RLS WITH UUID CAST**: Uses `current_setting('app.current_tenant')::uuid` (consistent cast)
- **PRICE TABLES MISSING tenant_id**: `price_history` and `pending_price_changes` have NO tenant_id!
- **NO FK CONSTRAINTS**: All external references are soft references (no data integrity)
- **DEPENDENCY ORDER**: Views depend on many other services (events, venues, tickets, users, payments, marketplace, auth)
- Uses `gen_random_uuid()` for UUID generation
- Materialized views for performance (with CONCURRENTLY refresh)
- Customer 360 view with 8-layer composition for maintainability
- Compliance reporting with risk scoring
- GDPR-compliant views that exclude PII
- RFM scoring (Recency, Frequency, Monetary) for customer segmentation
- Customer lifetime value prediction
- Real-time metrics with expiration
- Dynamic pricing support (price history, pending changes)

---

## file-service

### Files
**src/migrations/ (6 files):**
- `src/migrations/001_baseline_files.ts`
- `src/migrations/002_add_missing_tables.ts`
- `src/migrations/003_add_storage_quotas.ts`
- `src/migrations/20260104_add_idempotency_and_rls_force.ts`
- `src/migrations/20260104_add_rls_policies.ts`
- `src/migrations/20260104_database_hardening.ts`

### Tables Created
**From src/migrations/001_baseline_files.ts (4 tables):**
1. files
2. file_access_logs
3. file_versions
4. upload_sessions

**Total: 4+ tables (additional in 002, 003 migrations)**

### External Dependencies

**CRITICAL: NO EXTERNAL FK CONSTRAINTS IN BASELINE!**
- `files.uploaded_by` - no FK to users
- `file_versions.created_by` - no FK to users
- `upload_sessions.uploaded_by` - no FK to users

**Internal FK References:**
- `file_access_logs.file_id` → files(id) (ON DELETE CASCADE)
- `file_versions.file_id` → files(id) (ON DELETE CASCADE)

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create
- `audit_trigger_function()`: **NO** - does not create
- **Unique functions created (from RLS migration):**
  - `set_tenant_context(uuid, boolean)` - sets tenant context
  - `set_tenant_id_on_insert()` - trigger to auto-set tenant_id

### RLS Status
- **NONE IN BASELINE!** - Original 4 tables have NO RLS and NO tenant_id!
- **RLS added in src/migrations/20260104_add_rls_policies.ts:**
  - files (FORCE RLS + per-operation policies using `app.tenant_id`)
  - file_versions (conditionally, per-operation policies)
  - file_thumbnails (conditionally, per-operation policies)
  - file_access_logs (conditionally, per-operation policies)

**RLS Setting Name:** Uses `app.tenant_id` (different from most services using `app.current_tenant`!)

**RLS Features:**
- FORCE RLS enabled (applies even to table owner)
- Per-operation policies (SELECT/INSERT/UPDATE/DELETE)
- System admin bypass via `app.is_system_admin = 'true'`
- Auto-set trigger for tenant_id on INSERT

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **CRITICAL: BASELINE HAS NO TENANT_ID!** - Added via 20260104_add_rls_policies.ts
- **CRITICAL: NO RLS IN BASELINE!** - Added via 20260104_add_rls_policies.ts
- **NO FK TO EXTERNAL TABLES**: uploaded_by, created_by have no FK constraints!
- **DIFFERENT RLS SETTING**: Uses `app.tenant_id` instead of `app.current_tenant`
- **GOOD PRACTICE**: FORCE RLS enabled
- **GOOD PRACTICE**: Auto-set tenant_id trigger
- Uses `gen_random_uuid()` for UUID generation
- No default tenant_id - requires explicit setting
- Chunked upload support with session tracking
- File versioning support
- Access logging for audit trail
- Storage provider abstraction (local, S3)
- CDN URL support
- SHA-256 hash for deduplication/integrity
- Soft delete pattern with deleted_at
- Entity polymorphic association (entity_type, entity_id)
- File tagging with PostgreSQL array

---

## search-service

### Files
**src/migrations/ (1 file):**
- `src/migrations/001_search_consistency_tables.ts`

### Tables Created
**From src/migrations/001_search_consistency_tables.ts (3 tables):**
1. index_versions
2. index_queue
3. read_consistency_tokens

**Total: 3 tables**

### External Dependencies

**Hard FK References to `tenants` table (auth-service):**
- All 3 tables have `tenant_id` → tenants(id) with DEFAULT `00000000-0000-0000-0000-000000000001`

**No other external FK references** - This service is self-contained!

### Duplicate Functions
- `update_updated_at_column()`: **NO** - does not create this function
- `audit_trigger_function()`: **NO** - does not create

### RLS Status
- **YES** - RLS enabled on all 3 tables (from baseline):
  - index_versions (tenant_isolation_policy using `app.current_tenant`)
  - index_queue (tenant_isolation_policy)
  - read_consistency_tokens (tenant_isolation_policy)

**RLS Setting Name:** Uses `app.current_tenant`

### Modifies External Tables
- **NO** - Does not ALTER external tables

### Notes
- **GOOD RLS COVERAGE**: All 3 tables have RLS policies in baseline!
- **NO MIGRATION DIRECTORY SPLIT** - Only `src/migrations/`
- **MINIMAL DEPENDENCIES**: Only requires auth-service (tenants) - no FKs to events, venues, tickets, users, etc.
- **SELF-CONTAINED SERVICE**: Search indexes are managed externally (Elasticsearch/OpenSearch), PostgreSQL just tracks consistency
- Uses `gen_random_uuid()` for UUID generation
- Uses hardcoded default tenant `00000000-0000-0000-0000-000000000001`
- Index versioning for consistency across distributed systems
- Queue-based index operations with priority and idempotency
- Read consistency tokens for eventual consistency management
- Client read tracking for consistency guarantees
- Uses JSONB for flexible version tracking (required_versions)
- Includes retry tracking (retry_count, last_error)
- Token expiration support (expires_at)

---
