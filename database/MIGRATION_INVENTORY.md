# MIGRATION INVENTORY
**Date:** November 2, 2025
**Database:** tickettoken_db
**Total Services:** 21
**Services with Migrations:** 19
**Total Tables in Migrations:** 157
**Total Tables in Database:** 157

## Service Overview

| Service | Migration File | Tables | Status |
|---------|---------------|--------|--------|
| analytics-service | 001_analytics_baseline.ts | 6 | ✅ Complete |
| auth-service | 001_auth_baseline.ts | 10 | ✅ Complete |
| blockchain-indexer | 001_baseline_blockchain_indexer.ts | 6 | ✅ Complete |
| blockchain-service | 001_baseline_blockchain_service.ts | 6 | ✅ Complete |
| compliance-service | 001_baseline_compliance.ts | 15 | ✅ Complete |
| event-service | 001_baseline_event.ts | 7 | ✅ Complete |
| file-service | 001_baseline_files.ts | 4 | ✅ Complete |
| integration-service | 001_baseline_integration.ts | 10 | ✅ Complete |
| marketplace-service | 001_baseline_marketplace.ts | 6 | ✅ Complete |
| minting-service | 001_baseline_minting.ts | 3 | ✅ Complete |
| monitoring-service | 001_baseline_monitoring_schema.ts | 7 | ✅ Complete |
| notification-service | 001_baseline_notification_schema.ts | 13 | ✅ Complete |
| payment-service | 001_baseline_payment.ts | 27 | ✅ Complete |
| queue-service | 001_baseline_queue.ts | 4 | ✅ Complete |
| scanning-service | 001_baseline_scanning.ts | 6 | ✅ Complete |
| search-service | 001_search_consistency_tables.ts | 3 | ✅ Complete |
| ticket-service | 001_baseline_ticket.ts | 9 | ✅ Complete |
| transfer-service | 001_baseline_transfer.ts | 1 | ✅ Complete |
| venue-service | 001_baseline_venue.ts | 5 | ✅ Complete |
| api-gateway | N/A | 0 | ✅ No tables needed |
| order-service | N/A | 0 | ❌ Missing migrations |

## Tables by Service

### analytics-service (6 tables)
- analytics_metrics
- analytics_aggregations
- analytics_alerts
- analytics_dashboards
- analytics_widgets
- analytics_exports

### auth-service (10 tables)
- tenants
- users
- user_sessions
- user_venue_roles
- audit_logs
- invalidated_tokens
- oauth_connections
- wallet_connections
- biometric_credentials
- trusted_devices

### blockchain-indexer (6 tables)
- indexer_state
- indexed_transactions
- marketplace_activity
- reconciliation_runs
- ownership_discrepancies
- reconciliation_log

### blockchain-service (6 tables)
- wallet_addresses
- user_wallet_connections
- treasury_wallets
- blockchain_events
- blockchain_transactions
- mint_jobs

### compliance-service (15 tables)
- venue_verifications
- tax_records
- ofac_checks
- risk_assessments
- risk_flags
- compliance_documents
- bank_verifications
- payout_methods
- notification_log
- compliance_settings
- compliance_batch_jobs
- form_1099_records
- webhook_logs
- ofac_sdn_list
- compliance_audit_log
- anti_bot_activities
- anti_bot_violations
- user_blacklists

### event-service (7 tables)
- event_categories
- events
- event_schedules
- event_capacity
- event_pricing
- event_metadata
- audit_logs (shared)

### file-service (4 tables)
- files
- file_access_logs
- file_versions
- upload_sessions

### integration-service (10 tables)
- integrations
- connections
- field_mappings
- webhooks
- integration_configs
- integration_health
- integration_webhooks
- sync_queue
- sync_logs
- integration_costs

### marketplace-service (6 tables)
- marketplace_listings
- marketplace_disputes
- marketplace_blacklist
- marketplace_price_history
- marketplace_transfers
- marketplace_activity

### minting-service (3 tables)
- collections
- mints
- nfts

### monitoring-service (7 tables)
- alerts
- alert_rules
- dashboards
- metrics
- nft_mints
- nft_transfers
- fraud_events

### notification-service (13 tables)
- notification_history
- consent_records
- suppression_list
- notification_preferences
- notification_preference_history
- notification_delivery_stats
- notification_analytics
- notification_engagement
- notification_clicks
- notification_templates
- notification_campaigns
- venue_notification_settings
- notification_costs

### payment-service (27 tables)
- payment_transactions
- venue_balances
- payment_refunds
- payment_intents
- payment_escrows
- royalty_distributions
- group_payments
- group_payment_members
- tax_collections
- tax_forms_1099da
- fraud_checks
- device_activity
- bot_detections
- known_scalpers
- waiting_room_activity
- event_purchase_limits
- nft_mint_queue
- outbox_dlq
- payment_event_sequence
- payment_state_transitions
- payment_state_machine
- webhook_inbox
- webhook_events
- payment_idempotency
- reconciliation_reports
- settlement_batches
- payment_retries
- discounts
- platform_fees
- tax_transactions
- idempotency_keys
- outbox

### queue-service (4 tables)
- queues
- jobs
- schedules
- rate_limits

### scanning-service (6 tables)
- scanner_devices
- devices
- scans
- scan_policy_templates
- scan_policies
- offline_validation_cache

### search-service (3 tables)
- index_versions
- index_queue
- read_consistency_tokens

### ticket-service (9 tables)
- tickets
- ticket_types
- ticket_validations
- ticket_transfers
- qr_codes
- reservations
- reservation_history
- ticket_transactions

### transfer-service (1 table)
- ticket_transactions

### venue-service (5 tables)
- venues
- venue_staff
- venue_settings
- venue_integrations
- venue_layouts
- venue_marketplace_settings
- venue_notification_settings
- venue_balances

## Issues Found and Resolved

### ✅ Schema Drift (RESOLVED)
**Issue:** 4 tables existed in database but not in migrations
- integrations
- connections
- field_mappings
- webhooks

**Resolution:** Added all 4 tables to integration-service migration (001_baseline_integration.ts)
**Date Fixed:** November 2, 2025

### ❌ Missing Service Migrations
**Issue:** order-service has no migrations
**Impact:** Cannot create orders, order_items, or order_discounts tables
**Status:** Needs to be created
**Priority:** HIGH - blocks order functionality

## Migration Status

✅ **All services with migrations are in sync with database**
✅ **No duplicate table definitions found**
✅ **No schema conflicts found**
❌ **order-service needs migration file created**

## Next Steps

1. Create order-service migrations folder and baseline migration
2. Add orders, order_items, order_discounts tables to order-service
3. Run order-service migrations
4. Complete Phase 1 remaining tasks (seed data, type definitions, repositories)
