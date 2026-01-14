# Payment Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 6
> **Tables Created:** 70+
> **Functions Created:** 10+

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_payment.ts | Core payment tables, fraud detection, AML, royalties |
| 2 | 002_add_rls_policies.ts | Enable RLS + tenant isolation policies |
| 3 | 003_add_concurrent_indexes.ts | Performance indexes (CONCURRENTLY) |
| 4 | 004_add_stripe_connect_tables.ts | Stripe Connect transfers |
| 5 | 005_add_disputes_payouts_jobs.ts | Disputes, payouts, background jobs |
| 6 | 006_add_amount_constraints.ts | CHECK constraints for amounts |

---

## Table Categories

### Core Payment Tables
- payment_transactions
- payment_refunds
- payment_intents
- venue_balances
- payment_idempotency

### Royalty System
- venue_royalty_settings
- event_royalty_settings
- royalty_distributions
- royalty_payouts
- royalty_reconciliation_runs
- royalty_discrepancies

### Group Payments
- group_payments
- group_payment_members
- reminder_history

### Tax & Compliance
- tax_collections
- tax_forms_1099da
- user_tax_info

### Fraud Detection (15 tables)
- fraud_checks
- device_activity
- bot_detections
- known_scalpers
- ip_reputation
- behavioral_analytics
- velocity_limits
- velocity_records
- fraud_rules
- fraud_review_queue
- card_fingerprints
- ml_fraud_models
- ml_fraud_predictions
- account_takeover_signals
- scalper_reports

### AML (Anti-Money Laundering)
- aml_checks
- sanctions_list_matches
- pep_database
- suspicious_activity_reports

### Marketplace/Escrow
- payment_escrows
- escrow_release_conditions
- venue_price_rules
- resale_listings

### Stripe Connect
- stripe_transfers
- pending_transfers
- payout_schedules
- connected_accounts

### Disputes & Chargebacks
- payment_disputes
- payment_chargebacks
- payment_reserves

### Background Processing
- background_jobs
- nft_mint_queue
- inventory_reservations

### Event Sourcing
- outbox_dlq
- payment_event_sequence
- payment_state_transitions
- payment_state_machine (seeded with state transitions)

### Webhooks
- webhook_inbox
- webhook_events
- outbound_webhooks

### Other
- payment_notifications
- waiting_room_activity
- event_purchase_limits
- reconciliation_reports
- settlement_batches
- payment_retries
- payment_attempts
- purchase_limit_violations
- payment_audit_log
- payout_events

---

## RLS Implementation

### Session Variables Used
- `app.current_tenant_id` (UUID cast)
- `app.bypass_rls` (boolean for service/admin bypass)
- `app.current_venue_id` (for venue-scoped tables)

### Policy Pattern (migration 002)
```sql
CREATE POLICY {table}_tenant_isolation_policy ON {table}
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = COALESCE(
      NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  )
  WITH CHECK (...same...);

CREATE POLICY {table}_service_bypass_policy ON {table}
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR current_user = 'postgres'
  );
```

### Helper Functions
- `set_tenant_context(uuid)` - Set tenant for queries
- `clear_tenant_context()` - Clear tenant context
- `enable_rls_bypass()` - Admin bypass
- `disable_rls_bypass()` - Disable bypass

---

## State Machine

Seeded transition rules in `payment_state_machine`:
```
PENDING → PROCESSING (payment.processing)
PENDING → PAID (payment.succeeded)
PENDING → PAYMENT_FAILED (payment.failed)
PENDING → CANCELLED (payment.cancelled)
PROCESSING → PAID (payment.succeeded)
PROCESSING → PAYMENT_FAILED (payment.failed)
PAID → REFUNDING (refund.initiated)
PAID → PARTIALLY_REFUNDED (refund.partial)
PAID → REFUNDED (refund.completed)
REFUNDING → REFUNDED (refund.completed)
```

---

## Key Functions

| Function | Purpose |
|----------|---------|
| update_updated_at_column() | Auto-update timestamps |
| validate_payment_state_transition() | Validate state machine |
| get_next_sequence_number(payment_id) | Event sequence numbers |
| update_user_total_spent() | Update user aggregates |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth | payment_transactions |
| users | auth | 25+ tables |
| venues | venue | 10+ tables |
| events | event | 10+ tables |
| orders | order | payment_intents, stripe_transfers |
| tickets | ticket | resale_listings |

---

## ⚠️ Known Issues

### 1. Migration 006 References Non-Existent Tables
References tables: `payments`, `refunds`, `transfers`, `escrow_accounts`, `disputes`, `payouts`
Actual tables: `payment_transactions`, `payment_refunds`, `stripe_transfers`, `payment_escrows`, `payment_disputes`, `royalty_payouts`

### 2. Duplicate venue_balances Table
- Created in 001_baseline_payment.ts
- Created again in 005_add_disputes_payouts_jobs.ts (different schema)

### 3. outbox Table Referenced But Not Created
Migration 005 adds columns to `outbox` table which doesn't exist in payment-service.

---

## Concurrent Indexes (migration 003)

Must run with `transaction: false` in knex config.
Creates 27 indexes using `CREATE INDEX CONCURRENTLY`.
