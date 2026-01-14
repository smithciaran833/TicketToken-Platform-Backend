# Phase 6: Orphan Table Migration Plan

This document details the schema requirements for 19 orphan tables referenced in code but missing from database migrations.

---

## order-service (7 tables)

### Table: `order_report_summaries`

**Source File:** `./backend/services/order-service/src/services/order-report.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| tenant_id | UUID | NO | RLS enabled |
| period | report_period ENUM | NO | DAILY, WEEKLY, MONTHLY, CUSTOM |
| start_date | TIMESTAMP | NO | Period start |
| end_date | TIMESTAMP | NO | Period end |
| total_orders | INTEGER | NO | Count of orders |
| total_revenue_cents | BIGINT | NO | Sum of order totals |
| average_order_value_cents | BIGINT | NO | Avg order value |
| total_refunds_cents | BIGINT | NO | Sum of refunded amounts |
| orders_by_status | JSONB | NO | Status breakdown |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:** None

**Unique Constraints:** `(tenant_id, period, start_date)`

---

### Table: `order_revenue_reports`

**Source File:** `./backend/services/order-service/src/services/order-report.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| tenant_id | UUID | NO | RLS enabled |
| entity_type | VARCHAR(20) | NO | 'EVENT', etc. |
| entity_id | UUID | NO | Event ID or other entity |
| period | report_period ENUM | NO | Report period type |
| start_date | TIMESTAMP | NO | Period start |
| end_date | TIMESTAMP | NO | Period end |
| total_revenue_cents | BIGINT | NO | Total revenue |
| total_orders | INTEGER | NO | Order count |
| total_tickets_sold | INTEGER | NO | Tickets sold |
| average_order_value_cents | BIGINT | NO | Avg value |
| top_ticket_types | JSONB | YES | DEFAULT '[]' |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:** None (entity_id is conceptual)

**Unique Constraints:** `(tenant_id, entity_type, entity_id, start_date)`

---

### Table: `saved_searches`

**Source File:** `./backend/services/order-service/src/services/order-search.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| tenant_id | UUID | NO | RLS enabled |
| admin_user_id | UUID | NO | Creating user |
| name | VARCHAR(255) | NO | Search name |
| filters | JSONB | NO | Search filter config |
| is_default | BOOLEAN | NO | DEFAULT false |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | YES | |

**Needs tenant_id:** YES

**Foreign Keys:**
- `admin_user_id` → `users(id)`

---

### Table: `search_history`

**Source File:** `./backend/services/order-service/src/services/order-search.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| tenant_id | UUID | NO | RLS enabled |
| admin_user_id | UUID | NO | Searching user |
| query | TEXT | YES | Search query text |
| filters | JSONB | NO | Applied filters |
| results_count | INTEGER | NO | Result count |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `admin_user_id` → `users(id)`

---

### Table: `admin_overrides`

**Source File:** `./backend/services/order-service/src/services/admin-override.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| tenant_id | UUID | NO | RLS enabled |
| order_id | UUID | NO | Target order |
| admin_user_id | UUID | NO | Override creator |
| override_type | VARCHAR(50) | NO | Type of override |
| original_value | JSONB | YES | Before value |
| new_value | JSONB | YES | After value |
| reason | TEXT | NO | Justification |
| approval_status | VARCHAR(30) | NO | PENDING, APPROVED, REJECTED, AUTO_APPROVED |
| approved_by | UUID | YES | Approver user |
| approved_at | TIMESTAMP | YES | Approval time |
| rejection_reason | TEXT | YES | If rejected |
| metadata | JSONB | YES | DEFAULT '{}' |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `order_id` → `orders(id)`
- `admin_user_id` → `users(id)`
- `approved_by` → `users(id)`

---

### Table: `admin_override_audit`

**Source File:** `./backend/services/order-service/src/services/admin-override.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| tenant_id | UUID | NO | RLS enabled |
| override_id | UUID | NO | Parent override |
| action | VARCHAR(30) | NO | CREATED, APPROVED, REJECTED |
| actor_user_id | UUID | NO | Who performed action |
| actor_role | VARCHAR(50) | NO | Role at time of action |
| changes | JSONB | NO | Change details |
| ip_address | VARCHAR(45) | YES | Request IP |
| user_agent | TEXT | YES | Request user agent |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `override_id` → `admin_overrides(id)`
- `actor_user_id` → `users(id)`

---

### Table: `note_templates`

**Source File:** `./backend/services/order-service/src/services/order-notes.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| tenant_id | UUID | NO | RLS enabled |
| name | VARCHAR(255) | NO | Template name |
| note_type | VARCHAR(50) | NO | Note type enum |
| content_template | TEXT | NO | Template content |
| is_active | BOOLEAN | NO | DEFAULT true |
| usage_count | INTEGER | NO | DEFAULT 0 |
| created_by | UUID | NO | Creator user |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | YES | |

**Needs tenant_id:** YES

**Foreign Keys:**
- `created_by` → `users(id)`

---

## payment-service (4 tables)

### Table: `royalty_reversals`

**Source File:** `./backend/services/payment-service/src/services/fee-calculation.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| refund_id | UUID | NO | Associated refund |
| payment_id | UUID | NO | Original payment |
| recipient_id | VARCHAR(255) | NO | Royalty recipient |
| recipient_type | VARCHAR(50) | NO | 'artist', 'promoter' |
| original_royalty | INTEGER | NO | Original amount cents |
| reversed_amount | INTEGER | NO | Reversed amount cents |
| remaining_royalty | INTEGER | NO | Remaining cents |
| refund_ratio | DECIMAL(5,4) | NO | Proportion refunded |
| tenant_id | UUID | NO | RLS enabled |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `refund_id` → `refunds(id)`
- `payment_id` → `payment_transactions(id)`

---

### Table: `escrow_accounts`

**Source File:** `./backend/services/payment-service/src/services/escrow.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| order_id | UUID | NO | Associated order |
| payment_intent_id | VARCHAR(50) | NO | Stripe PI ID |
| amount | INTEGER | NO | Original amount cents |
| held_amount | INTEGER | NO | Currently held cents |
| released_amount | INTEGER | NO | DEFAULT 0 |
| status | VARCHAR(30) | NO | pending, held, partially_released, released, cancelled, disputed |
| hold_until | TIMESTAMP | NO | Auto-release time |
| release_conditions | JSONB | YES | DEFAULT '[]' |
| dispute_id | VARCHAR(50) | YES | If disputed |
| tenant_id | UUID | NO | RLS enabled |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| updated_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `order_id` → `orders(id)`

**Indexes:**
- `idx_escrow_order_id` ON `(order_id)`
- `idx_escrow_payment_intent` ON `(payment_intent_id)`
- `idx_escrow_tenant` ON `(tenant_id)`
- `idx_escrow_status_hold` ON `(status, hold_until)`

---

### Table: `escrow_events`

**Source File:** `./backend/services/payment-service/src/services/escrow.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| escrow_id | UUID | NO | Parent escrow |
| event_type | VARCHAR(30) | NO | created, released, cancelled |
| amount | INTEGER | YES | Event amount |
| reason | TEXT | YES | Event reason |
| tenant_id | UUID | NO | RLS enabled |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `escrow_id` → `escrow_accounts(id)`

**Indexes:**
- `idx_escrow_events_escrow` ON `(escrow_id)`

---

### Table: `balance_transaction_snapshots`

**Source File:** `./backend/services/payment-service/src/services/stripe-connect-transfer.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY, gen_random_uuid() |
| tenant_id | UUID | NO | RLS enabled |
| snapshot_date | DATE | NO | Date of snapshot |
| charges_data | JSONB | NO | Stripe charges |
| transfers_data | JSONB | NO | Stripe transfers |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:** None

**Unique Constraints:** `(tenant_id, snapshot_date)`

---

## marketplace-service (3 tables)

### Table: `listing_audit_log`

**Source File:** `./backend/services/marketplace-service/src/jobs/listing-expiration.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| listing_id | UUID | NO | Target listing |
| action | VARCHAR(50) | NO | 'expired', 'cancelled', etc. |
| old_status | VARCHAR(30) | YES | Previous status |
| new_status | VARCHAR(30) | YES | New status |
| reason | TEXT | YES | Action reason |
| event_start_time | TIMESTAMP | YES | Related event time |
| metadata | JSONB | YES | Additional data |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** NO (derives from listing_id)

**Foreign Keys:**
- `listing_id` → `listings(id)`

---

### Table: `anonymization_log`

**Source File:** `./backend/services/marketplace-service/src/utils/data-lifecycle.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| user_id | UUID | NO | Original user ID |
| anonymized_id | VARCHAR(50) | NO | New anon identifier |
| tables_affected | TEXT | NO | Comma-separated tables |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** NO (cross-tenant audit log)

**Foreign Keys:** None (user may be deleted)

---

### Table: `user_activity_log`

**Source File:** `./backend/services/marketplace-service/src/utils/data-lifecycle.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| user_id | UUID | YES | User reference |
| activity_type | VARCHAR(50) | NO | Activity type |
| metadata | JSONB | YES | Activity details |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** NO (subject to retention deletion)

**Foreign Keys:**
- `user_id` → `users(id)` (nullable)

---

## venue-service (2 tables)

### Table: `resale_blocks`

**Source File:** `./backend/services/venue-service/src/services/resale.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| user_id | UUID | NO | Blocked user |
| tenant_id | UUID | NO | RLS enabled |
| reason | TEXT | NO | Block reason |
| blocked_by | UUID | NO | Admin user |
| blocked_at | TIMESTAMP | NO | Block time |
| expires_at | TIMESTAMP | YES | Auto-unblock time |
| active | BOOLEAN | NO | DEFAULT true |

**Needs tenant_id:** YES

**Foreign Keys:**
- `user_id` → `users(id)`
- `blocked_by` → `users(id)`

**Indexes:**
- `idx_resale_blocks_active` ON `(user_id, tenant_id, active)` WHERE `active = true`

---

### Table: `fraud_logs`

**Source File:** `./backend/services/venue-service/src/services/resale.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| transaction_id | UUID | NO | Related transaction |
| tenant_id | UUID | NO | RLS enabled |
| ticket_id | UUID | NO | Target ticket |
| seller_id | UUID | NO | Seller user |
| buyer_id | UUID | NO | Buyer user |
| risk_score | INTEGER | NO | 0-100 risk score |
| signals | JSONB | NO | Detection signals |
| action | VARCHAR(30) | NO | allow, review, block |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** YES

**Foreign Keys:**
- `ticket_id` → `tickets(id)`
- `seller_id` → `users(id)`
- `buyer_id` → `users(id)`

---

## transfer-service (2 tables)

### Table: `webhook_deliveries`

**Source File:** `./backend/services/transfer-service/src/services/webhook.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| subscription_id | UUID | NO | Webhook subscription |
| event | VARCHAR(100) | NO | Event type |
| status | VARCHAR(20) | NO | SUCCESS, FAILED |
| http_status | INTEGER | NO | Response status code |
| error_message | TEXT | YES | If failed |
| attempted_at | TIMESTAMP | NO | DEFAULT NOW() |

**Needs tenant_id:** NO (via subscription_id)

**Foreign Keys:**
- `subscription_id` → `webhook_subscriptions(id)`

**Indexes:**
- `idx_webhook_deliveries_subscription` ON `(subscription_id)`
- `idx_webhook_deliveries_attempted` ON `(attempted_at)`

---

### Table: `failed_blockchain_transfers`

**Source File:** `./backend/services/transfer-service/src/services/blockchain-transfer.service.ts`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| transfer_id | UUID | NO | UNIQUE, parent transfer |
| error_message | TEXT | NO | Failure reason |
| failed_at | TIMESTAMP | NO | Failure time |
| retry_count | INTEGER | NO | DEFAULT 0 |

**Needs tenant_id:** NO (via transfer_id)

**Foreign Keys:**
- `transfer_id` → `ticket_transfers(id)` UNIQUE

**Unique Constraints:** `(transfer_id)`

---

## blockchain-service (1 table)

### Table: `queue_jobs`

**Source File:** `./backend/services/blockchain-service/src/queues/mintQueue.js`

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | PRIMARY KEY |
| job_id | VARCHAR(255) | NO | UNIQUE, external job ID |
| queue_name | VARCHAR(100) | NO | Queue identifier |
| job_type | VARCHAR(50) | NO | MINT, TRANSFER, etc. |
| ticket_id | UUID | YES | Target ticket |
| user_id | UUID | YES | Requesting user |
| status | VARCHAR(30) | NO | PROCESSING, COMPLETED, FAILED |
| metadata | JSONB | YES | Job result/data |
| error_message | TEXT | YES | If failed |
| created_at | TIMESTAMP | NO | DEFAULT NOW() |
| completed_at | TIMESTAMP | YES | Completion time |
| failed_at | TIMESTAMP | YES | Failure time |

**Needs tenant_id:** NO (cross-tenant job tracking)

**Foreign Keys:**
- `ticket_id` → `tickets(id)`
- `user_id` → `users(id)`

**Unique Constraints:** `(job_id)`

**Indexes:**
- `idx_queue_jobs_status` ON `(queue_name, status)`
- `idx_queue_jobs_ticket` ON `(ticket_id)`

---

## Summary

| Service | Tables | With tenant_id | Migration Priority |
|---------|--------|----------------|-------------------|
| order-service | 7 | 7 | HIGH |
| payment-service | 4 | 4 | CRITICAL |
| marketplace-service | 3 | 0 | MEDIUM |
| venue-service | 2 | 2 | HIGH |
| transfer-service | 2 | 0 | MEDIUM |
| blockchain-service | 1 | 0 | LOW |
| **TOTAL** | **19** | **13** | |

### Migration Order

1. **CRITICAL (payment-service):** `escrow_accounts`, `escrow_events`, `royalty_reversals`, `balance_transaction_snapshots`
2. **HIGH (order-service):** `order_report_summaries`, `order_revenue_reports`, `saved_searches`, `search_history`, `admin_overrides`, `admin_override_audit`, `note_templates`
3. **HIGH (venue-service):** `resale_blocks`, `fraud_logs`
4. **MEDIUM (marketplace-service):** `listing_audit_log`, `anonymization_log`, `user_activity_log`
5. **MEDIUM (transfer-service):** `webhook_deliveries`, `failed_blockchain_transfers`
6. **LOW (blockchain-service):** `queue_jobs`

### Required ENUM Types

```sql
CREATE TYPE report_period AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE override_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');
CREATE TYPE escrow_status AS ENUM ('pending', 'held', 'partially_released', 'released', 'cancelled', 'disputed');
CREATE TYPE queue_job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
```
