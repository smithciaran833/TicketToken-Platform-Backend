# Order Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 16
> **Enums Created:** 7
> **Functions Created:** 6

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_orders.ts | Create order tables, enums, functions, RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| orders | uuid | ✅ | ✅ |
| order_items | uuid | ✅ | ✅ |
| order_events | uuid | ✅ | ✅ |
| order_addresses | uuid | ✅ | ✅ |
| order_refunds | uuid | ✅ | ✅ |
| order_modifications | uuid | ✅ | ✅ |
| order_splits | uuid | ✅ | ✅ |
| order_notes | uuid | ✅ | ✅ |
| order_disputes | uuid | ✅ | ✅ |
| refund_policies | uuid | ✅ | ✅ |
| refund_reasons | uuid | ✅ | ✅ |
| refund_policy_rules | uuid | ❌ | ✅ |
| refund_compliance_log | uuid | ✅ | ✅ |
| bulk_operations | uuid | ✅ | ✅ |
| promo_codes | uuid | ✅ | ✅ |
| promo_code_redemptions | uuid | ✅ | ✅ |

---

## Enums Created

| Enum | Values |
|------|--------|
| refund_type | FULL, PARTIAL, ITEM |
| modification_type | ADD_ITEM, REMOVE_ITEM, UPGRADE_ITEM, DOWNGRADE_ITEM, CHANGE_QUANTITY |
| modification_status | PENDING, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED |
| bulk_operation_status | PENDING, PROCESSING, COMPLETED, FAILED, PARTIAL_SUCCESS |
| bulk_operation_type | BULK_CANCEL, BULK_REFUND, BULK_UPDATE, BULK_EXPORT |
| discount_type | PERCENTAGE, FIXED_AMOUNT, BOGO, TIERED, EARLY_BIRD |
| order_note_type | CUSTOMER_INQUIRY, ISSUE_REPORTED, RESOLUTION, VIP_MARKER, FRAUD_SUSPICION, PAYMENT_ISSUE, DELIVERY_ISSUE, GENERAL, INTERNAL_NOTE |

---

## Key Tables

### orders
- Main order table with 50+ columns
- Supports: disputes, payouts, splits, modifications
- Full-text search via search_vector column
- All monetary values in cents (BIGINT)

### order_items
- Line items for orders
- FK to ticket_types

### order_refunds
- Refund tracking with policy/reason links
- Supports partial and item-level refunds

### order_disputes
- Stripe dispute tracking
- Links to payment_intent_id

---

## Foreign Keys

### Cross-Service FKs
| Table | Column | References |
|-------|--------|------------|
| orders | tenant_id | tenants.id |
| orders | user_id | users.id |
| orders | event_id | events.id |
| order_items | ticket_type_id | ticket_types.id |
| order_events | user_id | users.id |
| order_refunds | initiated_by | users.id |

### Internal FKs
| Table | Column | References |
|-------|--------|------------|
| orders | parent_order_id | orders.id |
| orders | split_from_order_id | orders.id |
| order_items | order_id | orders.id |
| order_events | order_id | orders.id |
| order_addresses | order_id | orders.id |
| order_refunds | order_id | orders.id |
| order_refunds | policy_id | refund_policies.id |
| order_refunds | reason_id | refund_reasons.id |
| order_modifications | order_id | orders.id |
| order_modifications | original_item_id | order_items.id |
| order_modifications | refund_id | order_refunds.id |
| order_splits | parent_order_id | orders.id |
| order_notes | order_id | orders.id |
| order_disputes | order_id | orders.id |
| refund_policy_rules | policy_id | refund_policies.id |
| promo_code_redemptions | promo_code_id | promo_codes.id |
| promo_code_redemptions | order_id | orders.id |

---

## CHECK Constraints

| Table | Constraint | Expression |
|-------|------------|------------|
| orders | ck_orders_subtotal_positive | subtotal_cents >= 0 |
| orders | ck_orders_total_positive | total_cents >= 0 |
| order_items | ck_order_items_quantity_positive | quantity > 0 |
| order_items | ck_order_items_unit_price_positive | unit_price_cents >= 0 |
| order_items | ck_order_items_total_price_positive | total_price_cents >= 0 |
| order_refunds | ck_order_refunds_amount_positive | refund_amount_cents > 0 |
| order_splits | valid_split_count | split_count >= 2 AND split_count <= 10 |

---

## RLS Policies
```sql
CREATE POLICY {table}_tenant_isolation ON {table}
FOR ALL
USING (tenant_id = current_setting('app.current_tenant')::uuid)
```

**Note:** Uses `current_setting('app.current_tenant')::uuid` without `true` parameter - will error if not set.

---

## Functions Created

| Function | Purpose |
|----------|---------|
| update_updated_at_column() | Auto-update updated_at |
| log_order_status_change() | Log status changes to order_events |
| update_event_revenue() | Update event revenue on payment |
| calculate_order_total(...) | Calculate order total from components |
| generate_order_number() | Generate unique ORD-XXXXXXXX |
| validate_order_status_transition(old, new) | Validate status transitions |
| orders_search_vector_trigger() | Update search vector |

---

## Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| log_order_status_changes | orders | log_order_status_change() |
| trg_update_event_revenue | orders | update_event_revenue() |
| orders_search_vector_update | orders | orders_search_vector_trigger() |
| update_order_notes_updated_at | order_notes | update_updated_at_column() |

---

## Notable Indexes

### Full-Text Search
```sql
CREATE INDEX idx_orders_search_vector ON orders USING GIN (search_vector)
```

### Partial Indexes by Status
```sql
CREATE INDEX idx_orders_status_pending ON orders (tenant_id, created_at DESC) WHERE status = 'PENDING'
CREATE INDEX idx_orders_status_confirmed ON orders (tenant_id, created_at DESC) WHERE status = 'CONFIRMED'
-- etc.
```

### Dispute Tracking
```sql
CREATE INDEX idx_orders_dispute_id ON orders (dispute_id) WHERE dispute_id IS NOT NULL
CREATE INDEX idx_orders_has_dispute ON orders (tenant_id, has_dispute) WHERE has_dispute = TRUE
```

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | UUID | RLS tenant isolation |

---

## Migration Safety Settings
```sql
SET lock_timeout = '10s';
SET statement_timeout = '60s';
```

---

## ⚠️ Known Issues

### 1. RLS Policy Strictness
Uses `current_setting('app.current_tenant')::uuid` without `true` - will throw error if setting not defined.

### 2. refund_policy_rules Missing tenant_id
Table has policy_id FK but no tenant_id column.

### 3. Depends on ticket_types Table
order_items references ticket_types which is owned by ticket-service.
