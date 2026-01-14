# Transfer Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 8 (creates 8, references 1)

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_transfer.ts | Transfer infrastructure with RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| ticket_transactions | uuid | ✅ | ✅ |
| batch_transfers | string (batch_*) | ✅ | ✅ |
| batch_transfer_items | uuid | ✅ | ✅ |
| promotional_codes | uuid | ✅ | ✅ |
| transfer_fees | uuid | ✅ | ✅ |
| transfer_rules | uuid | ✅ | ✅ |
| user_blacklist | uuid | ✅ | ✅ |
| webhook_subscriptions | uuid | ✅ | ✅ |

---

## Table Details

### ticket_transactions
Transaction history for all ticket operations.
- transaction_type: TRANSFER_RECEIVED, TRANSFER_SENT, PURCHASE, SALE
- status: COMPLETED, PENDING, FAILED
- amount, metadata (jsonb)

### batch_transfers
Bulk transfer operations.
- id format: batch_TIMESTAMP_RANDOM (string PK)
- Tracks: total_items, success_count, failure_count
- status: PROCESSING, COMPLETED, CANCELLED

### batch_transfer_items
Individual items within a batch.
- Links to batch_transfers and ticket_transfers
- status: SUCCESS, FAILED
- error_message for failures

### transfer_rules
Business rules engine for transfer validation.
- rule_type: MAX_TRANSFERS_PER_TICKET, MAX_TRANSFERS_PER_USER_PER_DAY, BLACKLIST_CHECK, COOLING_PERIOD, EVENT_DATE_PROXIMITY, IDENTITY_VERIFICATION
- Can scope to ticket_type_id and/or event_id
- priority ordering, is_blocking flag
- config (jsonb) for rule parameters

### user_blacklist
Fraud prevention blacklist.
- Tracks: reason, blacklisted_by, expires_at
- Notes for admin documentation

### promotional_codes
Discount codes for transfers.
- discount_percentage OR discount_flat
- usage_limit, usage_count, expires_at

### transfer_fees
Fee breakdown per transfer.
- base_fee, platform_fee, service_fee, total_fee
- currency, payment_method

### webhook_subscriptions
Tenant webhook configurations.
- url, events (text[]), secret
- is_active flag

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 8 tables + ticket_transfers (9 total).

---

## Foreign Keys

### Within Service
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| batch_transfer_items | batch_id | batch_transfers.id | CASCADE |
| batch_transfer_items | transfer_id | ticket_transfers.id | CASCADE |
| transfer_fees | transfer_id | ticket_transfers.id | CASCADE |

### Cross-Service
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| ticket_transactions | ticket_id | tickets.id | CASCADE |
| ticket_transactions | user_id | users.id | RESTRICT |
| All tables | tenant_id | tenants.id | RESTRICT |
| webhook_subscriptions | tenant_id | tenants.id | CASCADE |

---

## ⚠️ Known Issues

### 1. References ticket_transfers Table
Migration enables RLS on `ticket_transfers` table, but this table is created by ticket-service, not transfer-service. Migration assumes table exists.

### 2. Session Variable Pattern
Uses `app.current_tenant` (TEXT cast) vs `app.current_tenant_id` (UUID cast) used by other services.

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |
