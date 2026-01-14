# TicketToken Platform - Database Migration Audit

**Audit Date:** $(date +%Y-%m-%d)
**Services Audited:** 20 of 24 (baseline migrations only)
**Total Migration Files:** 82

---

## Executive Summary

This audit reveals critical architectural problems in the TicketToken Platform database layer:

1. **No table ownership** - Multiple services create/modify the same tables
2. **No RLS on 4 services** - Major security gaps (event, payment, compliance, file, notification)
3. **Inconsistent RLS syntax** - 3 different patterns used across services
4. **11+ duplicate function definitions** - `update_updated_at_column()` created repeatedly
5. **Cross-service table modifications** - Services add columns/triggers to tables they don't own
6. **4+ minting queues** - Same concept implemented in 4 different services
7. **4+ discount/promo tables** - Same concept fragmented across services
8. **5+ webhook tables** - No centralized webhook handling
9. **Missing FK constraints** - Many services reference tables without foreign keys

---

## Critical Problems Detail

### 1. Services Without Row Level Security (RLS)

| Service | Tables | Security Risk |
|---------|--------|---------------|
| event-service | 6 | Multi-tenant data leakage |
| payment-service | 60 | Financial data exposure |
| compliance-service | 15 | Regulatory violation |
| file-service | 4 | File access across tenants |
| notification-service | 31 | PII exposure |

**Total: 116 tables without tenant isolation**

### 2. Duplicate `update_updated_at_column()` Function

Created by these services (each overwrites the previous):
- auth-service
- venue-service
- event-service
- order-service
- payment-service
- monitoring-service
- notification-service

### 3. RLS Syntax Inconsistency

**Variant A** - UUID cast on setting:
```sql
tenant_id = current_setting('app.current_tenant_id', true)::UUID
```
Used by: auth-service, venue-service, ticket-service

**Variant B** - Text cast on column:
```sql
tenant_id::text = current_setting('app.current_tenant', true)
```
Used by: blockchain-indexer, blockchain-service, integration-service, marketplace-service, minting-service, monitoring-service, queue-service, scanning-service, search-service, transfer-service

**Variant C** - Different setting name:
```sql
tenant_id = current_setting('app.current_tenant')::uuid
```
Used by: order-service, analytics-service

**Problem:** Setting names differ (`app.current_tenant_id` vs `app.current_tenant`). If application sets one, half the RLS policies won't work.

### 4. Fragmented Concepts (Same Thing, Multiple Tables)

**Minting Queues (4 implementations):**
| Service | Table |
|---------|-------|
| payment-service | nft_mint_queue |
| blockchain-service | mint_jobs |
| minting-service | nft_mints, ticket_mints |

**Discount/Promo Codes (3 implementations):**
| Service | Table |
|---------|-------|
| ticket-service | discounts |
| order-service | promo_codes |
| transfer-service | promotional_codes |

**Blacklists (2 implementations):**
| Service | Table |
|---------|-------|
| marketplace-service | marketplace_blacklist |
| transfer-service | user_blacklist |

**Webhook Tables (5+ implementations):**
- compliance-service: webhook_logs
- integration-service: webhooks, integration_webhooks
- payment-service: webhook_inbox, webhook_events, outbound_webhooks
- transfer-service: webhook_subscriptions

**Alert/Metrics Tables (4 implementations):**
| Service | Tables |
|---------|--------|
| analytics-service | analytics_alerts, analytics_metrics |
| monitoring-service | alerts, alert_rules, metrics |
| queue-service | alert_history, queue_metrics |

**Tax Tables (3 implementations):**
| Service | Tables |
|---------|--------|
| compliance-service | tax_records, form_1099_records |
| payment-service | tax_collections, tax_forms_1099da, user_tax_info |
| marketplace-service | tax_transactions |

**Fraud Detection (3 implementations):**
| Service | Tables |
|---------|--------|
| payment-service | fraud_checks, fraud_rules, fraud_review_queue, bot_detections, etc. |
| monitoring-service | fraud_events |
| marketplace-service | anti_bot_activities, anti_bot_violations |

### 5. Cross-Service Table Modifications

| Service | Modifies | How |
|---------|----------|-----|
| ticket-service | users, events, venues | Adds columns (ticket_purchase_count, total_spent, tickets_sold, revenue, seating_capacity) |
| order-service | events | Trigger updates events.revenue |
| payment-service | users | Trigger updates users.total_spent, users.lifetime_value |
| monitoring-service | nft_mints | Creates trigger on minting-service's table |
| transfer-service | ticket_transfers | Enables RLS and creates policy on ticket-service's table |

### 6. Services With No FK Constraints

| Service | Issue |
|---------|-------|
| compliance-service | All IDs are strings, no FKs at all |
| file-service | No tenant_id, no FKs to users |
| minting-service | References ticket_id, venue_id without FKs |

---

## Required Migration Order
```
1. auth-service (creates tenants, users)
   ↓
2. venue-service (needs users)
   ↓
3. event-service (needs users, venues, venue_layouts)
   ↓
4. ticket-service (needs tenants, users, events, venues)
   ↓
5. order-service (needs tenants, users, events, ticket_types)
   ↓
6. payment-service (needs users, venues, events, orders, tickets)
   ↓
7. All other services (various dependencies)
```

**This order is NOT enforced anywhere in the codebase.**

---

## Table Ownership Conflicts

### `user_venue_roles`
- **auth-service:** Creates WITH tenant_id column
- **venue-service:** Creates WITHOUT tenant_id (IF NOT EXISTS)
- **Result:** Schema depends on migration order

### `orders`
- **order-service:** Creates table
- **ticket-service:** Has OrderModel with full CRUD operations
- **Result:** Two services writing to same table

### `ticket_transfers`
- **ticket-service:** Creates table
- **transfer-service:** Modifies RLS, references via FK
- **Result:** Ownership unclear

---

## Per-Service Audit Details

### auth-service ✓
**Migration:** `001_auth_baseline.ts`

**Tables Created (12):**
tenants, users, user_sessions, user_venue_roles, audit_logs, invalidated_tokens, token_refresh_log, oauth_connections, wallet_connections, biometric_credentials, trusted_devices, user_addresses

**Functions Created:**
- `update_updated_at_column()` - YES (original source)
- `audit_trigger_function()` - YES (original source)
- `generate_user_referral_code()`, `increment_referral_count()`, `mask_email()`, `mask_phone()` - unique

**External Dependencies:** None (root service)

**Modifies External Tables:** No

**Has RLS:** YES - all 12 tables
- Syntax: `tenant_id = current_setting('app.current_tenant_id', true)::UUID`

**Quality:** GOLD STANDARD - Clean, proper RLS, proper down() function

---

### venue-service ✓
**Migration:** `001_baseline_venue.ts`

**Tables Created (12):**
venues, venue_staff, venue_settings, venue_integrations, venue_layouts, venue_branding, custom_domains, white_label_pricing, venue_tier_history, venue_audit_log, api_keys, user_venue_roles (conditional)

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE

**External Dependencies:**
- `users` (auth-service) - FK

**Modifies External Tables:** No

**Has RLS:** PARTIAL - only venues table has RLS, other 11 tables don't

**Issues:**
1. `user_venue_roles` created WITHOUT tenant_id if table doesn't exist (conflicts with auth-service's version WITH tenant_id)
2. 11 of 12 tables missing RLS

---

### event-service ✓
**Migration:** `001_baseline_event.ts`

**Tables Created (6):**
event_categories, events, event_schedules, event_capacity, event_pricing, event_metadata

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE

**External Dependencies:**
- `tenants` (auth-service) - FK
- `users` (auth-service) - FK
- `venues` (venue-service) - FK
- `venue_layouts` (venue-service) - FK

**Modifies External Tables:** No

**Has RLS:** NO ❌

**Uses createTableIfNotExists:** YES - hides conflicts

**Issues:**
1. NO RLS - security gap
2. Uses createTableIfNotExists - masks migration failures

---

### ticket-service ✓
**Migration:** `001_baseline_ticket.ts`

**Tables Created (18):**
ticket_types, reservations, tickets, ticket_transfers, ticket_validations, refunds, waitlist, ticket_price_history, ticket_holds, ticket_bundles, ticket_bundle_items, ticket_audit_log, ticket_notifications, discounts, order_discounts, outbox, reservation_history, webhook_nonces

**Functions Created:** None

**External Dependencies:**
- `tenants`, `users` (auth-service)
- `events` (event-service)
- `venues` (venue-service) - in RLS policy

**Modifies External Tables:** YES
- Adds to `users`: ticket_purchase_count, total_spent
- Adds to `events`: tickets_sold, revenue
- Adds to `venues`: seating_capacity

**Has RLS:** PARTIAL - only tickets table

**Issues:**
1. CRITICAL: Modifies 3 other services' tables
2. Broken RLS policy references venue_id column that doesn't exist on tickets
3. Has OrderModel doing CRUD on orders table (should use order-service API)
4. Creates `refunds` but payment-service also handles refunds
5. Creates `discounts` but order-service has `promo_codes`

---

### order-service ✓
**Migration:** `001_baseline_orders.ts`

**Tables Created (16):**
orders, order_items, order_events, order_addresses, refund_policies, refund_reasons, order_refunds, refund_policy_rules, refund_compliance_log, order_modifications, order_splits, bulk_operations, promo_codes, promo_code_redemptions, order_notes, order_disputes

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE
- `log_order_status_change()`, `update_event_revenue()`, `calculate_order_total()`, `generate_order_number()`, `validate_order_status_transition()`, `orders_search_vector_trigger()` - unique

**External Dependencies:**
- `tenants`, `users` (auth-service)
- `events` (event-service)
- `ticket_types` (ticket-service)

**Modifies External Tables:** YES
- `update_event_revenue()` trigger UPDATEs `events.revenue`

**Has RLS:** YES - all 16 tables
- Syntax: `tenant_id = current_setting('app.current_tenant')::uuid`
- NOTE: Different setting name than auth-service

**Issues:**
1. Trigger modifies events.revenue (cross-service write)
2. Creates `promo_codes` (duplicate of ticket-service's `discounts`)
3. RLS uses `app.current_tenant` not `app.current_tenant_id`

---

### payment-service ✓
**Migration:** `001_baseline_payment.ts`

**Tables Created (60):**
payment_transactions, venue_balances, payment_refunds, payment_intents, venue_royalty_settings, event_royalty_settings, royalty_distributions, royalty_payouts, royalty_reconciliation_runs, royalty_discrepancies, group_payments, group_payment_members, reminder_history, tax_collections, tax_forms_1099da, user_tax_info, fraud_checks, device_activity, bot_detections, known_scalpers, ip_reputation, behavioral_analytics, velocity_limits, velocity_records, fraud_rules, fraud_review_queue, card_fingerprints, ml_fraud_models, ml_fraud_predictions, account_takeover_signals, scalper_reports, aml_checks, sanctions_list_matches, pep_database, suspicious_activity_reports, waiting_room_activity, event_purchase_limits, payment_escrows, escrow_release_conditions, venue_price_rules, resale_listings, payment_reserves, inventory_reservations, payment_notifications, nft_mint_queue, outbox_dlq, payment_event_sequence, payment_state_transitions, payment_state_machine, webhook_inbox, webhook_events, payment_idempotency, reconciliation_reports, settlement_batches, payment_retries, payment_chargebacks, payment_attempts, purchase_limit_violations, outbound_webhooks

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE
- `update_user_total_spent()` - modifies external table

**External Dependencies:**
- `tenants`, `users` (auth-service)
- `venues` (venue-service)
- `events` (event-service)
- `orders` (order-service)
- `tickets` (ticket-service)

**Modifies External Tables:** YES
- Trigger UPDATEs `users.total_spent` and `users.lifetime_value`

**Has RLS:** NO ❌

**Uses createTableIfNotExists:** YES - for reconciliation_reports

**Issues:**
1. NO RLS on 60 tables - massive security gap
2. Creates tables belonging elsewhere: venue_royalty_settings, event_royalty_settings, venue_price_rules, venue_balances, event_purchase_limits, nft_mint_queue, resale_listings
3. 60 tables is too many for one service - should be split

---

### analytics-service ✓
**Migration:** `001_analytics_baseline.ts`

**Tables Created (13):**
analytics_metrics, analytics_aggregations, analytics_alerts, analytics_dashboards, analytics_widgets, analytics_exports, customer_rfm_scores, customer_segments, customer_lifetime_value, realtime_metrics, venue_alerts, price_history, pending_price_changes

**Views Created (20+):**
event_summary, venue_analytics (materialized), ticket_status_details, ticket_inventory_summary, financial_summary chain, customer_360 chain, marketplace_activity chain, compliance_reporting chain, user_dashboard_view (materialized)

**Functions Created:** None duplicate

**External Dependencies (via views):**
- events, event_schedules, event_capacity (event-service)
- venues (venue-service)
- tickets, ticket_types (ticket-service)
- users (auth-service)
- payment_transactions (payment-service)
- marketplace_transfers, marketplace_listings, platform_fees (marketplace-service)
- audit_logs (auth-service)

**Modifies External Tables:** No (read-only views)

**Has RLS:** YES - 11 tables
- Syntax: `tenant_id = current_setting('app.current_tenant')::uuid`

**Issues:**
1. Views reference `platform_fees` - fragile dependency
2. Views break if source table schemas change
3. Materialized views need refresh scheduling

---

### blockchain-indexer ✓
**Migration:** `001_baseline_blockchain_indexer.ts`

**Tables Created (6):**
indexer_state, indexed_transactions, marketplace_activity, reconciliation_runs, ownership_discrepancies, reconciliation_log

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK
- `tickets` (ticket-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - 6 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)` - DIFFERENT

**Issues:**
1. RLS uses text cast (inconsistent)
2. `marketplace_activity` may conflict with marketplace-service

---

### blockchain-service ✓
**Migration:** `001_baseline_blockchain_service.ts`

**Tables Created (6):**
wallet_addresses, user_wallet_connections, treasury_wallets, blockchain_events, blockchain_transactions, mint_jobs

**Functions Created:** None

**External Dependencies:**
- `tenants`, `users` (auth-service) - FK
- `tickets` (ticket-service) - FK
- `orders` (order-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - 6 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. RLS syntax inconsistent with core services
2. `wallet_addresses`/`user_wallet_connections` overlaps with auth-service's `wallet_connections`
3. `mint_jobs` is 2nd minting queue (payment-service has `nft_mint_queue`)

---

### compliance-service ✓
**Migration:** `001_baseline_compliance.ts`

**Tables Created (15):**
venue_verifications, tax_records, ofac_checks, risk_assessments, risk_flags, compliance_documents, bank_verifications, payout_methods, notification_log, compliance_settings, compliance_batch_jobs, form_1099_records, webhook_logs, ofac_sdn_list, compliance_audit_log

**Functions Created:** None

**External Dependencies:** NONE - no FK constraints at all

**Modifies External Tables:** No

**Has RLS:** NO ❌

**Issues:**
1. NO RLS - 15 tables without tenant isolation
2. Uses INTEGER primary keys (increments) instead of UUID
3. venue_id, user_id, tenant_id are STRING columns with no FKs - no referential integrity
4. Duplicates: notification_log, webhook_logs, payout_methods, tax tables, audit_log

---

### file-service ✓
**Migration:** `001_baseline_files.ts`

**Tables Created (4):**
files, file_access_logs, file_versions, upload_sessions

**Functions Created:** None

**External Dependencies:** NONE - no FK constraints

**Modifies External Tables:** No

**Has RLS:** NO ❌

**Issues:**
1. NO RLS
2. NO tenant_id column - cannot implement multi-tenant isolation
3. No FKs to users for uploaded_by, accessed_by, created_by
4. Completely isolated - no referential integrity possible

---

### integration-service ✓
**Migration:** `001_baseline_integration.ts`

**Tables Created (10):**
integrations, connections, field_mappings, webhooks, integration_configs, integration_health, integration_webhooks, sync_queue, sync_logs, integration_costs

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK
- `users` (auth-service) - FK
- `venues` (venue-service) - FK on 7 tables

**Modifies External Tables:** No

**Has RLS:** YES - all 10 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. RLS syntax uses text cast
2. `webhooks` duplicates concept from other services

---

### marketplace-service ✓
**Migration:** `001_baseline_marketplace.ts`

**Tables Created (11):**
marketplace_listings, marketplace_transfers, platform_fees, venue_marketplace_settings, marketplace_price_history, marketplace_disputes, dispute_evidence, tax_transactions, anti_bot_activities, anti_bot_violations, marketplace_blacklist

**Functions Created:**
- `expire_marketplace_listings()`, `calculate_marketplace_fees()`, `get_user_active_listings_count()` - unique

**External Dependencies:**
- `tenants` (auth-service) - FK
- `users` (auth-service) - FK on 9 tables
- `tickets` (ticket-service) - FK
- `events` (event-service) - FK
- `venues` (venue-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - all 11 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Uses createTableIfNotExists:** YES - hides conflicts

**Issues:**
1. Uses createTableIfNotExists
2. `platform_fees` referenced by analytics-service views
3. `tax_transactions` is 3rd tax implementation
4. `anti_bot_*` duplicates payment-service fraud tables
5. GOOD: tenant_id has NO default - prevents silent data leakage

---

### minting-service ✓
**Migration:** `001_baseline_minting.ts`

**Tables Created (5):**
collections, nft_mints, nfts, ticket_mints, minting_reconciliation_reports

**Functions Created:** None

**External Dependencies:** NONE - no FK constraints
- References ticket_id, venue_id without FKs
- Uses hardcoded fake tenant: `'00000000-0000-0000-0000-000000000000'`

**Modifies External Tables:** No

**Has RLS:** YES - all 5 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. NO FK constraints - no referential integrity
2. Hardcoded fake tenant UUID as default
3. 3rd/4th minting queue (nft_mints, ticket_mints)
4. `minting_reconciliation_reports` overlaps payment-service

---

### monitoring-service ✓
**Migration:** `001_baseline_monitoring_schema.ts`

**Tables Created (11):**
alerts, alert_rules, dashboards, metrics, nft_transfers, fraud_events, incidents, sla_metrics, performance_metrics, reports, report_history

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE
- `cleanup_old_metrics()`, `cleanup_old_fraud_events()` - unique

**External Dependencies:**
- `tenants` (auth-service) - FK

**Modifies External Tables:** YES
- Creates trigger `update_nft_mints_updated_at` on minting-service's `nft_mints` table

**Has RLS:** YES - all 11 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Uses createTableIfNotExists:** YES - uses hasTable check

**Issues:**
1. Duplicate function
2. Creates trigger on another service's table
3. `dashboards` overlaps analytics_dashboards
4. `alerts`/`alert_rules` overlaps analytics_alerts
5. `fraud_events` overlaps payment-service fraud tables
6. `metrics` overlaps analytics_metrics

---

### notification-service ✓
**Migration:** `001_baseline_notification_schema.ts`

**Tables Created (31):**
scheduled_notifications, notification_history, consent_records, suppression_list, notification_preferences, notification_preference_history, notification_delivery_stats, notification_tracking, notification_analytics, notification_engagement, notification_clicks, notification_templates, notification_campaigns, audience_segments, email_automation_triggers, ab_tests, ab_test_variants, ab_test_metrics, automation_executions, bounces, campaign_stats, engagement_events, notification_analytics_daily, pending_deletions, template_usage, template_versions, translations, venue_health_scores, abandoned_carts, venue_notification_settings, notification_costs

**Functions Created:**
- `update_updated_at_column()` - DUPLICATE
- `aggregate_notification_analytics()` - unique

**External Dependencies:**
- `tenants` (auth-service) - FK
- `users` (auth-service) - FK many tables
- `venues` (venue-service) - FK many tables
- `orders` (order-service) - FK
- `events` (event-service) - FK

**Modifies External Tables:** No

**Has RLS:** NO ❌

**Issues:**
1. NO RLS on 31 tables - major security gap
2. Duplicate function
3. Missing tenant_id on some tables (notification_preferences, notification_delivery_stats)
4. 31 tables too many - should split
5. `notification_analytics` overlaps analytics-service
6. `venue_health_scores` is monitoring concern
7. `translations` should be shared service
8. `abandoned_carts` should be in order-service
9. PII encryption fields exist but no encryption implemented

---

### queue-service ✓
**Migration:** `001_baseline_queue.ts`

**Tables Created (10):**
queues, jobs, schedules, rate_limits, critical_jobs, queue_metrics, idempotency_keys, rate_limiters, alert_history, dead_letter_jobs

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - all 10 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. `rate_limiters` uses STRING primary key (`service_name`) instead of UUID
2. Hardcoded seed data with fake tenant `'00000000-0000-0000-0000-000000000001'`
3. Missing FKs:
   - `alert_history.acknowledged_by` - no FK to users
   - `dead_letter_jobs.original_job_id` - no FK to jobs
   - `jobs.queue` - STRING referencing queues.name, no FK
4. `critical_jobs.idempotency_key` duplicates `idempotency_keys` table in same service
5. Overlaps:
   - `idempotency_keys` vs payment-service's `payment_idempotency`
   - `dead_letter_jobs` vs payment-service's `outbox_dlq`
   - `alert_history` vs monitoring-service's `alerts`
   - `queue_metrics` vs monitoring-service's `metrics`

---

### scanning-service ✓
**Migration:** `001_baseline_scanning.ts`

**Tables Created (7):**
scanner_devices, devices, scans, scan_policy_templates, scan_policies, offline_validation_cache, scan_anomalies

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK
- `venues` (venue-service) - FK
- `users` (auth-service) - FK
- `tickets` (ticket-service) - FK
- `events` (event-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - all 7 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. TWO device tables (`scanner_devices` and `devices`) - unclear why both exist
2. `scans.device_id` is UUID - comment says links to "either table" - no FK, polymorphic reference
3. `scan_anomalies.device_id` is STRING (varchar 255) but device tables use UUID - type mismatch
4. `scan_anomalies` overlaps payment-service fraud detection
5. `scans` overlaps ticket-service's `ticket_validations`

---

### search-service ✓
**Migration:** `001_search_consistency_tables.ts`

**Tables Created (3):**
index_versions, index_queue, read_consistency_tokens

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK

**Modifies External Tables:** No

**Has RLS:** YES - all 3 tables
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. `index_queue` has `idempotency_key` - yet another idempotency implementation
2. `index_queue` is another job queue (queue-service, payment-service, minting-service all have queues)
3. `index_versions.entity_id` is STRING not UUID - inconsistent
4. `read_consistency_tokens.client_id` is STRING with no FK - unclear what client means
5. No indication of what search backend this supports

---

### transfer-service ✓
**Migration:** `001_baseline_transfer.ts`

**Tables Created (8):**
ticket_transactions, batch_transfers, batch_transfer_items, promotional_codes, transfer_fees, transfer_rules, user_blacklist, webhook_subscriptions

**Functions Created:** None

**External Dependencies:**
- `tenants` (auth-service) - FK
- `tickets` (ticket-service) - FK
- `users` (auth-service) - FK
- `ticket_transfers` (ticket-service) - FK on batch_transfer_items, transfer_fees

**Modifies External Tables:** YES
- Enables RLS on `ticket_transfers` (ticket-service's table)
- Creates RLS policy on `ticket_transfers`

**Has RLS:** YES - 9 tables (including one it doesn't own)
- Syntax: `tenant_id::text = current_setting('app.current_tenant', true)`

**Issues:**
1. Modifies ticket-service's `ticket_transfers` table (enables RLS, creates policy)
2. `batch_transfers.id` is STRING (varchar 100) not UUID
3. `promotional_codes` is 3rd discount/promo table
4. `user_blacklist` duplicates marketplace-service's `marketplace_blacklist`
5. `transfer_fees` overlaps marketplace-service's `platform_fees`
6. `webhook_subscriptions` is yet another webhook table
7. Missing FKs:
   - `transfer_rules.ticket_type_id` - no FK
   - `transfer_rules.event_id` - no FK
   - `user_blacklist.blacklisted_by` - no FK to users

---

## Recommendations

### Immediate (Security Critical)

1. **Add RLS to all tables** - event-service, payment-service, compliance-service, file-service, notification-service
2. **Standardize RLS syntax** - Pick ONE pattern, update all services
3. **Add tenant_id to file-service** - Currently impossible to isolate

### Short-term (Data Integrity)

4. **Add missing FK constraints** - compliance-service, minting-service, queue-service, transfer-service
5. **Remove cross-service table modifications** - ticket-service, order-service, payment-service, monitoring-service, transfer-service should not modify other services' tables
6. **Consolidate duplicate concepts** - Pick one service to own each: minting queue, discounts, webhooks, alerts, tax, fraud detection

### Medium-term (Architecture)

7. **Define table ownership** - Document which service owns which table
8. **Enforce migration order** - Add dependencies to migration tooling
9. **Split large services** - payment-service (60 tables), notification-service (31 tables)
10. **Remove duplicate functions** - Have auth-service own `update_updated_at_column()`, others reference it

---

## Appendix: Table Count by Service

| Service | Tables | RLS | Functions |
|---------|--------|-----|-----------|
| auth-service | 12 | ✓ | 6 |
| venue-service | 12 | Partial | 1 dup |
| event-service | 6 | ❌ | 1 dup |
| ticket-service | 18 | Partial | 0 |
| order-service | 16 | ✓ | 7 (1 dup) |
| payment-service | 60 | ❌ | 2 (1 dup) |
| analytics-service | 13 + views | ✓ | 0 |
| blockchain-indexer | 6 | ✓ | 0 |
| blockchain-service | 6 | ✓ | 0 |
| compliance-service | 15 | ❌ | 0 |
| file-service | 4 | ❌ | 0 |
| integration-service | 10 | ✓ | 0 |
| marketplace-service | 11 | ✓ | 3 |
| minting-service | 5 | ✓ | 0 |
| monitoring-service | 11 | ✓ | 3 (1 dup) |
| notification-service | 31 | ❌ | 2 (1 dup) |
| queue-service | 10 | ✓ | 0 |
| scanning-service | 7 | ✓ | 0 |
| search-service | 3 | ✓ | 0 |
| transfer-service | 8 | ✓ | 0 |
| **TOTAL** | **264** | | |

