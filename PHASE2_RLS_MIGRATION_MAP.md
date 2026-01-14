# Phase 2 RLS Migration Map - Batch 1 of 5

**Generated:** 2026-01-12  
**Last Updated:** 2026-01-12  
**Services Scanned:** auth-service, ticket-service, order-service, payment-service

## 🔄 Progress Summary

| Service | Status | Tables Fixed |
|---------|--------|--------------|
| auth-service | ✅ Already Compliant | 0 (11 already done) |
| order-service | ✅ **COMPLETE** | 1 (order_disputes) |
| ticket-service | ⏳ Pending | 16 tables need work |
| payment-service | ⏳ Pending | ~35 tables need work |

### Completed Changes

#### order-service (001_baseline_orders.ts)
- ✅ Added `tenant_id` column to `order_disputes` table
- ✅ Added index on `tenant_id`
- ✅ Added RLS policy `order_disputes_tenant_isolation`
- ✅ Added DROP POLICY in down migration

---

## auth-service

### ./backend/services/auth-service/src/migrations/001_auth_baseline.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| tenants | ❌ (IS tenant table) | ❌ | Skip - Master tenant table |
| users | ✅ | ✅ | Already done |
| user_sessions | ✅ | ✅ | Already done |
| user_venue_roles | ✅ | ✅ | Already done |
| audit_logs | ✅ | ✅ | Already done |
| invalidated_tokens | ✅ | ✅ | Already done |
| token_refresh_log | ✅ | ✅ | Already done |
| oauth_connections | ✅ | ✅ | Already done |
| wallet_connections | ✅ | ✅ | Already done |
| biometric_credentials | ✅ | ✅ | Already done |
| trusted_devices | ✅ | ✅ | Already done |
| user_addresses | ✅ | ✅ | Already done |

---

## ticket-service

### ./backend/services/ticket-service/src/migrations/001_baseline_ticket.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| ticket_types | ✅ | ❌ | Add RLS |
| reservations | ✅ | ❌ | Add RLS |
| tickets | ✅ | ✅ (partial) | Review policies |
| ticket_transfers | ✅ | ❌ | Add RLS |
| ticket_validations | ❌ | ❌ | Add tenant_id + RLS |
| refunds | ❌ | ❌ | Add tenant_id + RLS |
| waitlist | ✅ | ❌ | Add RLS |
| ticket_price_history | ❌ | ❌ | Add tenant_id + RLS |
| ticket_holds | ✅ | ❌ | Add RLS |
| ticket_bundles | ✅ | ❌ | Add RLS |
| ticket_bundle_items | ❌ | ❌ | Skip (FK to bundles) |
| ticket_audit_log | ✅ | ❌ | Add RLS |
| ticket_notifications | ✅ | ❌ | Add RLS |
| discounts | ✅ | ❌ | Add RLS |
| order_discounts | ✅ | ❌ | Add RLS |
| outbox | ✅ (nullable) | ❌ | Add RLS |
| reservation_history | ❌ | ❌ | Add tenant_id + RLS |
| webhook_nonces | ❌ | ❌ | Skip (no tenant data) |

### ./backend/services/ticket-service/src/migrations/002_add_ticket_scans.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| ticket_scans | ✅ | ✅ | Already done |

### ./backend/services/ticket-service/src/migrations/003_add_blockchain_tracking.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| pending_transactions | ✅ | ✅ | Already done |
| blockchain_sync_log | ✅ | ✅ | Already done |

### ./backend/services/ticket-service/src/migrations/004_add_rls_role_verification.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| tenant_access_violations | ❌ | ❌ | Skip (security audit table) |

### ./backend/services/ticket-service/src/migrations/005_add_idempotency_keys.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| idempotency_keys | ✅ | ✅ | Already done |

### ./backend/services/ticket-service/src/migrations/006_add_ticket_state_machine.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| ticket_transfers | ✅ | ✅ | Already done |

### ./backend/services/ticket-service/src/migrations/007_add_security_tables.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| spending_limits | ✅ | ✅ | Already done |
| account_lockout_events | ✅ (nullable) | ❌ | Add RLS |
| multisig_approval_requests | ✅ | ✅ | Already done |
| multisig_approvals | ❌ | ❌ | Skip (FK to requests) |
| multisig_rejections | ❌ | ❌ | Skip (FK to requests) |
| spending_transactions | ✅ | ✅ | Already done |

### ./backend/services/ticket-service/src/migrations/008_add_foreign_key_constraints.ts

*No new tables created - FK constraints only*

### ./backend/services/ticket-service/src/migrations/009_add_unique_constraints.ts

*No new tables created - unique constraints only*

### ./backend/services/ticket-service/src/migrations/010_add_check_constraints.ts

*No new tables created - check constraints only*

### ./backend/services/ticket-service/src/migrations/011_add_ticket_state_history.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| ticket_state_history | ✅ | ✅ | Already done |

---

## order-service

### ./backend/services/order-service/src/migrations/001_baseline_orders.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| orders | ✅ | ✅ | Already done |
| order_items | ✅ | ✅ | Already done |
| order_events | ✅ | ✅ | Already done |
| order_addresses | ✅ | ✅ | Already done |
| refund_policies | ✅ | ✅ | Already done |
| refund_reasons | ✅ | ✅ | Already done |
| order_refunds | ✅ | ✅ | Already done |
| refund_policy_rules | ❌ | ✅ | Skip (FK to refund_policies) |
| refund_compliance_log | ✅ | ✅ | Already done |
| order_modifications | ✅ | ✅ | Already done |
| order_splits | ✅ | ✅ | Already done |
| bulk_operations | ✅ | ✅ | Already done |
| promo_codes | ✅ | ✅ | Already done |
| promo_code_redemptions | ✅ | ✅ | Already done |
| order_notes | ✅ | ✅ | Already done |
| order_disputes | ✅ | ✅ | ✅ **FIXED** |

---

## payment-service

### ./backend/services/payment-service/src/migrations/001_baseline_payment.ts

| Table | Has tenant_id | Has RLS | Action |
|-------|---------------|---------|--------|
| payment_transactions | ✅ (nullable) | ❌ | Add RLS (done in 002) |
| venue_balances | ❌ | ❌ | Skip (venue-scoped) |
| payment_refunds | ✅ (nullable) | ❌ | Add RLS (done in 002) |
| payment_intents | ✅ (nullable) | ❌ | Add RLS (done in 002) |
| venue_royalty_settings | ❌ | ❌ | Skip (venue-scoped) |
| event_royalty_settings | ❌ | ❌ | Skip (event-scoped) |
| royalty_distributions | ❌ | ❌ | Add tenant_id + RLS |
| royalty_payouts | ❌ | ❌ | Add tenant_id + RLS |
| royalty_reconciliation_runs | ❌ | ❌ | Add tenant_id + RLS |
| royalty_discrepancies | ❌ | ❌ | Add tenant_id + RLS |
| group_payments | ❌ | ❌ | Add tenant_id + RLS |
| group_payment_members | ❌ | ❌ | Add tenant_id + RLS |
| reminder_history | ❌ | ❌ | Add tenant_id + RLS |
| tax_collections | ❌ | ❌ | Add tenant_id + RLS |
| tax_forms_1099da | ❌ | ❌ | Add tenant_id + RLS |
| user_tax_info | ❌ | ❌ | Add tenant_id + RLS |
| fraud_checks | ❌ | ❌ | Add tenant_id + RLS |
| device_activity | ❌ | ❌ | Add tenant_id + RLS |
| bot_detections | ❌ | ❌ | Add tenant_id + RLS |
| known_scalpers | ❌ | ❌ | Add tenant_id + RLS |
| ip_reputation | ❌ | ❌ | Skip (global lookup table) |
| behavioral_analytics | ❌ | ❌ | Add tenant_id + RLS |
| velocity_limits | ❌ | ❌ | Add tenant_id + RLS |
| velocity_records | ❌ | ❌ | Add tenant_id + RLS |
| fraud_rules | ❌ | ❌ | Add tenant_id + RLS |
| fraud_review_queue | ❌ | ❌ | Add tenant_id + RLS |
| card_fingerprints | ❌ | ❌ | Skip (global lookup table) |
| ml_fraud_models | ❌ | ❌ | Skip (global models) |
| ml_fraud_predictions | ❌ | ❌ | Add tenant_id + RLS |
| account_takeover_signals | ❌ | ❌ | Add tenant_id + RLS |
| scalper_reports | ❌ | ❌ | Add tenant_id + RLS |
| aml_checks | ❌ | ❌ | Add tenant_id + RLS |
| sanctions_list_matches | ❌ | ❌ | Add tenant_id + RLS |
| pep_database | ❌ | ❌ | Add tenant_id + RLS |
| suspicious_activity_reports | ❌ | ❌ | Add tenant_id + RLS |
| waiting_room_activity | ❌ | ❌ | Add tenant_id + RLS |
| event_purchase_limits | ❌ | ❌ | Add tenant_id + RLS |
| payment_escrows | ❌ | ❌ | Add tenant_id + RLS |
| escrow_release_conditions | ❌ | ❌ | Skip (FK to escrows) |
| venue_price_rules | ❌ | ❌ | Skip (venue-scoped) |
| resale_listings | ❌ | ❌ | Add tenant_id + RLS |
| payment_reserves | ✅ | ❌ | Add RLS (done in 002) |
| inventory_reservations | ❌ | ❌ | Add tenant_id + RLS |
| payment_notifications | ✅ | ❌ | Add RLS (done in 002) |
| nft_mint_queue | ❌ | ❌ | Add tenant_id + RLS |
| outbox_dlq | ❌ | ❌ | Add tenant_id + RLS |
| payment_event_sequence | ❌ | ❌ | Add tenant_id + RLS |
| payment_state_transitions | ❌ | ❌ | Add tenant_id + RLS |
| payment_state_machine | ❌ | ❌ | Skip (config table) |
| webhook_inbox | ✅ (nullable) | ❌ | Add RLS (done in 002) |
| webhook_events | ❌ | ❌ | Add tenant_id + RLS |
| payment_idempotency | ❌ | ❌ | Add tenant_id + RLS |
| reconciliation_reports | ❌ | ❌ | Add tenant_id + RLS |
| settlement_batches | ❌ | ❌ | Add tenant_id + RLS |
| payment_retries | ❌ | ❌ | Add tenant_id + RLS |
| payment_chargebacks | ❌ | ❌ | Add tenant_id + RLS |
| payment_attempts | ❌ | ❌ | Add tenant_id + RLS |
| purchase_limit_violations | ❌ | ❌ | Add tenant_id + RLS |
| outbound_webhooks | ✅ | ❌ | Add RLS (done in 002) |

### ./backend/services/payment-service/src/migrations/002_add_rls_policies.ts

*Adds RLS to 16 tables (payment_transactions, payment_refunds, payment_intents, royalty_distributions, royalty_payouts, group_payments, group_payment_members, tax_collections, fraud_checks, fraud_review_queue, aml_checks, webhook_inbox, payment_reserves, payment_escrows, payment_notifications, outbound_webhooks)*

### ./backend/services/payment-service/src/migrations/003_add_concurrent_indexes.ts

*No new tables - index optimization only*

### ./backend/services/payment-service/src/migrations/004_add_stripe_connect_tables.ts

*Need to scan for additional tables*

### ./backend/services/payment-service/src/migrations/005_add_disputes_payouts_jobs.ts

*Need to scan for additional tables*

### ./backend/services/payment-service/src/migrations/006_add_amount_constraints.ts

*No new tables - constraints only*

---

## Summary

| Category | Count |
|----------|-------|
| **Tables Found** | 118 |
| **Already Has RLS** | 45 |
| **Need RLS (has tenant_id)** | 28 |
| **Need tenant_id + RLS** | 35 |
| **Skip (no tenant_id needed)** | 10 |

### Breakdown by Action Required

#### Already Complete (45 tables)
- auth-service: 11 tables
- ticket-service: 9 tables (via migrations 002-007, 011)
- order-service: 15 tables
- payment-service: 10 tables (via migration 002)

#### Add RLS Only (28 tables)
Tables that have tenant_id but no RLS policies:
- ticket-service: ticket_types, reservations, ticket_transfers, waitlist, ticket_holds, ticket_bundles, ticket_audit_log, ticket_notifications, discounts, order_discounts, outbox, account_lockout_events
- payment-service: (covered by 002_add_rls_policies.ts)

#### Need tenant_id + RLS (35 tables)
Tables missing both tenant_id column and RLS:
- ticket-service: ticket_validations, refunds, ticket_price_history, reservation_history
- order-service: order_disputes
- payment-service: 30+ tables (royalty_*, fraud_*, tax_*, etc.)

#### Skip - No tenant_id Needed (10 tables)
- tenants (master table)
- ticket_bundle_items (FK to bundles)
- webhook_nonces (ephemeral)
- tenant_access_violations (audit)
- multisig_approvals/rejections (FK to requests)
- refund_policy_rules (FK to policies)
- ip_reputation, card_fingerprints, ml_fraud_models, payment_state_machine (global/config)
- venue_balances, venue_royalty_settings, event_royalty_settings, venue_price_rules (venue-scoped)
