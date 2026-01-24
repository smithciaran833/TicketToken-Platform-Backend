# ORDER-SERVICE COMPREHENSIVE AUDIT REPORT

**Service:** order-service
**Audit Date:** 2026-01-23
**Files Analyzed:** 124 TypeScript source files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| POST | `/orders/` | `OrderController.createOrder` | Create a new order |
| GET | `/orders/` | `OrderController.listOrders` | List user's orders |
| GET | `/orders/:orderId` | `OrderController.getOrder` | Get order by ID |
| POST | `/orders/:orderId/reserve` | `OrderController.reserveOrder` | Reserve tickets and create payment intent |
| POST | `/orders/:orderId/cancel` | `OrderController.cancelOrder` | Cancel order |
| POST | `/orders/:orderId/refund` | `OrderController.refundOrder` | Full refund order |
| POST | `/orders/:orderId/refund/partial` | `OrderController.partialRefundOrder` | Partial refund |
| GET | `/orders/:orderId/refunds` | `OrderController.getRefundHistory` | Get refund history |
| GET | `/orders/:orderId/refunds/:refundId` | `OrderController.getRefund` | Get specific refund |
| GET | `/orders/:orderId/events` | `OrderController.getOrderEvents` | Get order event history |
| POST | `/orders/:orderId/modifications` | `OrderController.requestModification` | Request order modification |
| POST | `/orders/:orderId/upgrade` | `OrderController.upgradeOrderItem` | Upgrade ticket |
| GET | `/orders/:orderId/modifications` | `OrderController.getOrderModifications` | List modifications |
| GET | `/orders/:orderId/modifications/:modificationId` | `OrderController.getModification` | Get specific modification |

### Internal Endpoints (S2S)

| Method | Path | Purpose | Consumer |
|--------|------|---------|----------|
| GET | `/internal/orders/:orderId` | Get order details | payment-service |
| GET | `/internal/orders/:orderId/items` | Get order items with ticket info | blockchain-service |
| GET | `/internal/orders/without-tickets` | Find orphaned paid orders | payment-service (reconciliation) |
| GET | `/internal/orders/:orderId/for-payment` | Get order with payment context | payment-service |

### Business Operations

1. **Order Creation** - Creates order with price validation against ticket-service
2. **Ticket Reservation** - Reserves tickets and creates Stripe payment intent
3. **Order Confirmation** - Confirms payment and allocates tickets (with distributed lock)
4. **Order Cancellation** - Releases tickets and refunds if confirmed (with distributed lock)
5. **Order Expiration** - Automatic expiration of stale reservations
6. **Full Refund** - Complete order refund (with distributed lock)
7. **Partial Refund** - Item-level refunds with proportional fee calculation
8. **Order Modification** - Ticket upgrades/downgrades
9. **Discount/Promo Codes** - Multiple discount types with combination rules
10. **Tax Calculation** - Multi-jurisdiction support (stubbed)
11. **Dispute Handling** - Chargeback tracking and refund locking

---

## 2. DATABASE SCHEMA

### Tables (23 total, all tenant-scoped with RLS)

#### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `orders` | Main order records | id, tenant_id, user_id, event_id, order_number, status, total_cents, currency, payment_intent_id, expires_at |
| `order_items` | Line items per order | order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents |
| `order_events` | Order audit trail | order_id, event_type, user_id, metadata |
| `order_addresses` | Billing/shipping addresses | order_id, address_type, first_name, last_name, email, line1, city, country |
| `order_refunds` | Refund records | order_id, refund_amount_cents, refund_type, refund_status, stripe_refund_id |

#### Refund Policy Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `refund_policies` | Policy definitions | policy_name, refund_window_hours, pro_rated, event_type, ticket_type |
| `refund_policy_rules` | Policy rules | policy_id, rule_type, condition_type, condition_value, refund_percentage |
| `refund_reasons` | Predefined refund reasons | reason_code, reason_text, auto_approve |
| `refund_compliance_log` | Regulatory compliance tracking | refund_id, regulation_type, compliance_check, passed |

#### Promo/Discount Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `promo_codes` | Promo code definitions | code, discount_type, discount_value, valid_from, valid_until, usage_limit |
| `promo_code_redemptions` | Redemption tracking | promo_code_id, order_id, user_id, discount_applied_cents |
| `discount_combination_rules` | Combination rules (referenced) | rule_type, promo_code_ids, max_combined_discount_percent |

#### Admin/Operational Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `order_modifications` | Modification requests | order_id, modification_type, status, price_difference_cents |
| `order_splits` | Order split tracking | parent_order_id, split_count, child_order_ids |
| `bulk_operations` | Bulk operation tracking | operation_type, status, order_ids, success_count, failed_count |
| `order_notes` | Admin notes | order_id, note_type, content, is_internal |
| `order_disputes` | Dispute tracking | order_id, dispute_id, amount_cents, status, outcome |
| `admin_overrides` | Admin override requests | order_id, override_type, approval_status, approved_by |
| `admin_override_audit` | Override audit log | override_id, action, actor_user_id, changes |

#### Reporting Tables

| Table | Purpose |
|-------|---------|
| `order_report_summaries` | Aggregated order stats by period |
| `order_revenue_reports` | Revenue reports by entity |
| `saved_searches` | Admin saved searches |
| `search_history` | Search tracking |
| `note_templates` | Note templates for admins |

### Order State Machine

```
PENDING ─────► RESERVED ─────► CONFIRMED ─────► COMPLETED
    │              │               │
    ▼              ▼               ▼
CANCELLED     CANCELLED       CANCELLED
    │              │               │
    ▼              ▼               ▼
EXPIRED        EXPIRED         REFUNDED
```

**Valid Transitions:**
- `PENDING` → `RESERVED`, `CANCELLED`, `EXPIRED`
- `RESERVED` → `CONFIRMED`, `CANCELLED`, `EXPIRED`
- `CONFIRMED` → `COMPLETED`, `CANCELLED`, `REFUNDED`
- `COMPLETED` → (terminal state) - Note: Migration has `COMPLETED → REFUNDED` in DB function
- `CANCELLED`, `EXPIRED`, `REFUNDED` → (terminal states)

### Database Security Features

1. **RLS Enabled** - All 23 tables have RLS with `FORCE ROW LEVEL SECURITY`
2. **Tenant Isolation** - Policy checks `app.current_tenant_id` or `app.is_system_user`
3. **Check Constraints**:
   - `ck_orders_subtotal_positive` - subtotal_cents >= 0
   - `ck_orders_total_positive` - total_cents >= 0
   - `ck_order_items_quantity_positive` - quantity > 0
   - `ck_order_refunds_amount_positive` - refund_amount_cents > 0
   - `valid_split_count` - split_count between 2 and 10

### Schema Issues

1. **State machine inconsistency** - `OrderStateMachine.ts` shows `COMPLETED` as terminal, but DB function allows `COMPLETED → REFUNDED`
2. **External FK references as comments** - No enforcement for cross-service references (user_id, event_id, ticket_type_id)
3. **Payout tracking columns** - `payout_completed`, `payout_amount_cents`, `payout_completed_at` exist but payout integration appears incomplete

---

## 3. SECURITY ANALYSIS

### A. S2S Authentication

All service clients extend `BaseServiceClient` from `@tickettoken/shared` which provides standardized HMAC authentication.

#### Outbound HTTP Calls

| File | Line | Service | Endpoint | Auth Method | Notes |
|------|------|---------|----------|-------------|-------|
| `event.client.ts` | 52-56 | event-service | `/internal/events/:eventId` | HMAC (BaseServiceClient) | Has graceful fallback |
| `event.client.ts` | 92-100 | event-service | `/internal/events/:eventId/status` | HMAC (BaseServiceClient) | Has graceful fallback |
| `payment.client.ts` | 54-64 | payment-service | `/internal/payment-intents` | HMAC (BaseServiceClient) | No fallback (write) |
| `payment.client.ts` | 77-81 | payment-service | `/internal/payment-intents/:id/confirm` | HMAC (BaseServiceClient) | No fallback (write) |
| `payment.client.ts` | 94-98 | payment-service | `/internal/payment-intents/:id/cancel` | HMAC (BaseServiceClient) | No fallback (write) |
| `payment.client.ts` | 118-131 | payment-service | `/internal/refunds` | HMAC (BaseServiceClient) | No fallback (write) |
| `payment.client.ts` | 145-158 | payment-service | `/internal/payment-intents/:id/status` | HMAC (BaseServiceClient) | Fail-closed fallback |
| `ticket.client.ts` | 58-63 | ticket-service | `/internal/tickets/availability` | HMAC (BaseServiceClient) | Empty fallback (conservative) |
| `ticket.client.ts` | 81-85 | ticket-service | `/internal/tickets/reserve` | HMAC (BaseServiceClient) | No fallback (write) |
| `ticket.client.ts` | 95-99 | ticket-service | `/internal/tickets/confirm` | HMAC (BaseServiceClient) | No fallback (write) |
| `ticket.client.ts` | 109-113 | ticket-service | `/internal/tickets/release` | HMAC (BaseServiceClient) | No fallback (write) |
| `ticket.client.ts` | 127-133 | ticket-service | `/internal/tickets/prices` | HMAC (BaseServiceClient) | Empty fallback |
| `ticket.client.ts` | 146-150 | ticket-service | `/internal/tickets/:ticketId` | HMAC (BaseServiceClient) | No fallback (security critical) |
| `ticket.client.ts` | 208-212 | ticket-service | `/internal/tickets/order/:orderId` | HMAC (BaseServiceClient) | No fallback (security critical) |

**Assessment:** All S2S calls properly use HMAC authentication via BaseServiceClient. Write operations correctly have no fallbacks. Read operations use appropriate fail-closed or conservative fallbacks.

### B. Service Boundary Check

**Direct database access to external tables:**

| Check | File | Status |
|-------|------|--------|
| `tickets` table | N/A | **PASS** - Uses ticket.client.ts API calls |
| `events` table | N/A | **PASS** - Uses event.client.ts API calls |
| `venues` table | N/A | **PASS** - No direct access found |
| `payments` table | N/A | **PASS** - Uses payment.client.ts API calls |
| `users` table | N/A | **PASS** - No direct access (user_id from JWT) |
| `transfers` table | N/A | **PASS** - No direct access found |

**Internal routes issue:** `internal.routes.ts:144-145` has a `LEFT JOIN ticket_types tt ON oi.ticket_type_id = tt.id` - this appears to reference a table that should belong to ticket-service. This is likely a schema mistake or the table exists locally for caching.

### C. Input Validation

1. **Request validation** - Uses Zod schemas via `validate()` middleware
2. **Rate limiting** - Configured per endpoint (3-10 requests/minute for critical operations)
3. **Idempotency** - 30-minute TTL for create/reserve/cancel/refund operations
4. **UUID validation** - Schema validates UUIDs for orderId, userId, etc.

### D. SQL Injection Prevention

- Uses parameterized queries throughout (`$1`, `$2`, etc.)
- No string concatenation in SQL queries observed
- RLS provides additional defense layer

### E. Price Manipulation Prevention

**CRITICAL SECURITY FEATURE** (`order.service.ts:96-114`):
```typescript
// 3. Validate prices against ticket service (CRITICAL SECURITY)
const actualPrices = await this.ticketClient.getPrices(ticketTypeIds, ctx);

for (const item of request.items) {
  const actualPrice = actualPrices[item.ticketTypeId];
  if (item.unitPriceCents !== actualPrice) {
    logger.warn('Price manipulation attempt detected', {...});
    throw new Error(`Invalid price for ticket type...`);
  }
}
```

### F. Double-Spend Prevention (Refunds)

**CRITICAL SECURITY FEATURE** (`refund-eligibility.service.ts:137-148`, `ticket.client.ts:161-196`):
- Before processing refunds, checks if tickets have been transferred
- Uses `checkOrderTicketsNotTransferred()` to verify original buyer still owns tickets
- Fails closed if verification cannot be completed

---

## 4. ORDER STATE MACHINE

### Statuses

| Status | Description | Terminal |
|--------|-------------|----------|
| `PENDING` | Order created, awaiting reservation | No |
| `RESERVED` | Tickets reserved, payment pending | No |
| `CONFIRMED` | Payment confirmed, tickets allocated | No |
| `COMPLETED` | Order fulfilled | Yes |
| `CANCELLED` | Order cancelled by user/admin/system | Yes |
| `EXPIRED` | Reservation timeout | Yes |
| `REFUNDED` | Full refund processed | Yes |

### Transition Rules (`order-state-machine.ts`)

```typescript
private static readonly transitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.RESERVED, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.RESERVED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.COMPLETED]: [], // Terminal
  [OrderStatus.CANCELLED]: [], // Terminal
  [OrderStatus.EXPIRED]: [], // Terminal
  [OrderStatus.REFUNDED]: [], // Terminal
};
```

### Validation Logic

- `canTransition(from, to)` - Returns boolean
- `validateTransition(from, to)` - Throws if invalid
- `isTerminalState(status)` - Checks if no valid transitions
- `validateTransitionPath(path)` - Validates entire transition sequence

### Guards

- **Distributed locks** on confirmation (`withLock(LockKeys.orderConfirmation)`)
- **Distributed locks** on cancellation (`withLock(LockKeys.orderCancellation)`)
- **Distributed locks** on refund (`withLock(LockKeys.order)`)
- **Status check** before each state change in service layer

---

## 5. SAGA COORDINATION

### Saga Coordinator (`saga-coordinator.ts`)

**Pattern:** Classic Saga with compensating transactions

**Interface:**
```typescript
interface SagaStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  compensate: (result?: T) => Promise<void>;
}
```

### Order Creation Saga (implicit in `order.service.ts`)

| Step | Execute | Compensate |
|------|---------|------------|
| 1. Validate Event | `eventClient.getEvent()` | N/A (read-only) |
| 2. Check Availability | `ticketClient.checkAvailability()` | N/A (read-only) |
| 3. Validate Prices | `ticketClient.getPrices()` | N/A (read-only) |
| 4. Create Order | `orderModel.create()` | Delete order record |
| 5. Create Items | `orderItemModel.createBulk()` | Delete items (CASCADE) |
| 6. Create Event | `orderEventModel.create()` | Delete event (CASCADE) |
| 7. Publish Event | `eventPublisher.publishOrderCreated()` | N/A |

### Reserve Order Saga

| Step | Execute | Compensate |
|------|---------|------------|
| 1. Reserve Tickets | `ticketClient.reserveTickets()` | `ticketClient.releaseTickets()` |
| 2. Create Payment Intent | `paymentClient.createPaymentIntent()` | `paymentClient.cancelPaymentIntent()` |
| 3. Update Order Status | `orderModel.update()` | Revert status |

### Compensation Logic

```typescript
private async compensate(steps: SagaStep[]): Promise<void> {
  // Compensate in reverse order
  for (let i = this.executedSteps.length - 1; i >= 0; i--) {
    const executedStep = this.executedSteps[i];
    const step = steps.find((s) => s.name === executedStep.name);
    if (step) {
      try {
        await step.compensate(executedStep.result);
      } catch (compensationError) {
        logger.error(`Compensation failed for step: ${step.name}`);
        // Continue compensating other steps
      }
    }
  }
}
```

**Note:** Compensation continues even if individual steps fail, ensuring best-effort rollback.

---

## 6. DISCOUNT & PROMO CODES

### Supported Discount Types

| Type | Description | Implementation |
|------|-------------|----------------|
| `PERCENTAGE` | Percentage off total | `calculatePercentageDiscount()` |
| `FIXED_AMOUNT` | Fixed amount off (capped at order total) | `calculateFixedAmountDiscount()` |
| `BOGO` | Buy X Get Y at Z% off | `calculateBOGODiscount()` - applies to lowest-priced items |
| `TIERED` | Quantity-based tiers | `calculateTieredDiscount()` |
| `EARLY_BIRD` | Time-limited discount | `calculateEarlyBirdDiscount()` |

### Promo Code Validation (`promo-code.service.ts`)

1. Code lookup (case-insensitive)
2. Date range check (`valid_from`, `valid_until`)
3. Usage limit check (global)
4. Per-user limit check (via `promo_code_redemptions`)
5. Minimum purchase check
6. Event applicability check

### Combination Rules (`discount-combination.service.ts`)

| Rule Type | Behavior |
|-----------|----------|
| `MUTUALLY_EXCLUSIVE` | Cannot combine listed codes |
| `STACKABLE` | Can combine with max discount cap |

**Stacking Order:**
1. Fixed amount discounts applied first
2. Percentage discounts applied to remaining amount

### Edge Cases Handled

- BOGO applies discount to lowest-priced items
- Tiered discounts use highest qualifying tier
- Early bird checks current time vs cutoff
- Maximum combined discount enforcement

---

## 7. REFUND LOGIC

### Refund Policies (`refund-policy.service.ts`)

**Policy Matching Priority:**
1. Exact match (event_type AND ticket_type)
2. Event type only match
3. Ticket type only match
4. Default policy (no type filters)

### Refund Eligibility Checks (`refund-eligibility.service.ts`)

| Check | Priority | Behavior |
|-------|----------|----------|
| Order exists | CRITICAL | Block if not found |
| User ownership | CRITICAL | Block if different user |
| Order status | CRITICAL | Only CONFIRMED/COMPLETED eligible |
| Currency validation | MEDIUM | Block if unsupported or mismatch |
| Active dispute | CRITICAL | Block if has_dispute AND refund_locked |
| Ticket transfers | CRITICAL | Block if any ticket transferred |
| Event cancelled | HIGH | Auto-approve, bypass policy |
| Event postponed | HIGH | Bypass policy window |
| Event rescheduled | HIGH | Bypass policy window |
| Payout completed | HIGH | Requires manual review |
| Payment refundable | HIGH | Check Stripe status |
| Event date passed | MEDIUM | Warning, may still allow |
| Policy window | HIGH | Block if outside window |

### Supported Currencies

`USD`, `EUR`, `GBP`, `CAD`, `AUD`

### Partial Refunds (`partial-refund.service.ts`)

**Calculation:**
```typescript
const refundPercentage = subtotalRefundCents / order.subtotalCents;
const proportionalPlatformFeeCents = Math.round(order.platformFeeCents * refundPercentage);
const proportionalProcessingFeeCents = 0; // Non-refundable
const proportionalTaxCents = Math.round(order.taxCents * refundPercentage);
```

**Validations:**
- Item exists in order
- Quantity available (not already refunded)
- Minimum $0.50 refund amount

### Integration with Payment Service

- `paymentClient.initiateRefund()` for actual refund
- `paymentClient.getPaymentStatus()` for refundability check
- Fail-closed on payment service unavailability

---

## 8. TAX CALCULATION

### Current Status

**Tax controller exists but is stubbed:**

```typescript
// src/controllers/tax.controller.ts:16
// TODO: Tax services not yet implemented - stubbed for now
```

### Default Behavior (`order.service.ts:122`)

```typescript
const taxCents = Math.floor(
  (subtotalCents + platformFeeCents + processingFeeCents) *
  (orderConfig.fees.defaultTaxRate / 100)
);
```

### Planned Features (based on schema)

- `event_type` and `ticket_type` based policies
- Jurisdiction support (columns exist)
- Tax exemption handling
- External tax service integration

---

## 9. BACKGROUND JOBS

### Active Jobs

| Job | File | Schedule | Purpose |
|-----|------|----------|---------|
| `ExpirationJob` | `expiration.job.ts` | Every 60 seconds | Expire stale RESERVED orders |
| `ReconciliationJob` | `reconciliation.job.ts` | Every 60 minutes | Reconcile order state with external services |
| `OrderArchivingJob` | `order-archiving.job.ts` | Every 24 hours | Archive old orders to reduce table size |
| `ReminderJob` | `reminder.job.ts` | (exported) | Send reminders for expiring reservations |
| `EventReminderJob` | `event-reminder.job.ts` | (exported) | Send event reminders |

### Expiration Job Details

- **Retry:** Max 2 attempts, 5s delay, 2x backoff
- **Circuit breaker:** 5 failures, 5 minute reset
- **Distributed lock:** 2 minute TTL
- **Timeout:** 3 minutes
- Processes all tenants with reserved orders

### Reconciliation Job Details

- Finds RESERVED orders older than 1 hour
- Finds CONFIRMED orders without payment confirmation (last 24h)
- Records reconciliation events for audit

### Archiving Job Details

- Configurable retention period (`orderConfig.archiving.retentionDays`)
- Moves to `archive.*` schema
- Supports dry-run mode
- Batch processing with configurable size
- Full audit logging of archive operations

### Commented Out Jobs

- `metrics-aggregation.job`
- `dlq-cleanup.job`
- `cache-warming.job`
- `notification-scheduler.job`
- `notification-digest.job`
- `report-generation.job`
- `customer-analytics.job`
- `export-scheduler.job`

---

## 10. SERVICE CLIENTS

### EventClient (`event.client.ts`)

| Method | Purpose | Fallback |
|--------|---------|----------|
| `getEvent()` | Get event details | Returns `null` |
| `getEventStatus()` | Check cancellation/postponement | Returns safe default (unknown, not cancelled) |

**Configuration:**
- Base URL: `EVENT_SERVICE_URL` or `http://event-service:3004`
- Timeout: 5000ms
- Auth: HMAC via BaseServiceClient

### PaymentClient (`payment.client.ts`)

| Method | Purpose | Fallback |
|--------|---------|----------|
| `createPaymentIntent()` | Create Stripe intent | No fallback (throws) |
| `confirmPayment()` | Confirm payment | No fallback (throws) |
| `cancelPaymentIntent()` | Cancel payment | No fallback (throws) |
| `initiateRefund()` | Process refund | No fallback (throws) |
| `getPaymentStatus()` | Check refundability | Fail-closed (refundable=false) |

**Configuration:**
- Base URL: `PAYMENT_SERVICE_URL` or `http://payment-service:3005`
- Timeout: 15000ms (longer for payments)
- Auth: HMAC via BaseServiceClient

### TicketClient (`ticket.client.ts`)

| Method | Purpose | Fallback |
|--------|---------|----------|
| `checkAvailability()` | Check ticket counts | Empty object (no availability) |
| `reserveTickets()` | Reserve for order | No fallback (throws) |
| `confirmAllocation()` | Allocate after payment | No fallback (throws) |
| `releaseTickets()` | Release on cancel/expire | No fallback (throws) |
| `getPrices()` | Get ticket prices | Empty object |
| `getTicket()` | Get ticket info | No fallback (throws) |
| `checkTicketNotTransferred()` | Verify ownership | No fallback (throws) |
| `getTicketsForOrder()` | Get order's tickets | No fallback (throws) |
| `checkOrderTicketsNotTransferred()` | Batch transfer check | No fallback (throws) |

**Configuration:**
- Base URL: `TICKET_SERVICE_URL` or `http://ticket-service:3002`
- Timeout: 10000ms
- Auth: HMAC via BaseServiceClient

### Error Handling Pattern

All clients use `ServiceClientError` from shared library with:
- Status code extraction
- Logging with context
- Appropriate fallback or rethrow based on operation criticality

---

## 11. CODE QUALITY

### TODO/FIXME Comments

| File | Line | Comment |
|------|------|---------|
| `tax.controller.ts` | 16 | `TODO: Tax services not yet implemented - stubbed for now` |
| `order-search.service.ts` | 153 | `TODO: Join with events table if needed` |
| `order-modification.service.ts` | 43 | `TODO: Fetch from ticket service` (newPrice = 0) |
| `pdf-generator.ts` | 26 | `TODO: Implement actual PDF generation using PDFKit or similar` |
| `pdf-generator.ts` | 42 | `TODO: Implement multi-ticket PDF generation` |
| `pdf-generator.ts` | 56 | `TODO: Implement actual QR code generation using 'qrcode' npm package` |

### `any` Type Usage

**Total occurrences:** 110 across 47 files

**High-count files:**
- `internal.routes.ts` - 9 occurrences
- `order-notes.service.ts` - 7 occurrences
- `admin-override.service.ts` - 6 occurrences
- `order-modification.service.ts` - 5 occurrences
- `events/event-subscriber.ts` - 5 occurrences

### Error Handling

- Controllers consistently log errors and return appropriate status codes
- Services wrap operations in try/catch with logging
- Audit logging captures both success and failure
- Distributed locks prevent race conditions on critical operations

### Code Organization

- Clear separation: routes → controllers → services → models
- Shared utilities in `@tickettoken/shared`
- Type definitions in `/types/` directory
- Validators using Zod schemas
- Response schemas defined for API documentation

---

## 12. COMPARISON TO PREVIOUS AUDITS

Based on platform patterns observed:

| Area | Status | Notes |
|------|--------|-------|
| HMAC S2S Auth | **IMPLEMENTED** | Phase 5c completed, all clients use BaseServiceClient |
| RLS | **IMPLEMENTED** | All 23 tables with FORCE ROW LEVEL SECURITY |
| Price Validation | **IMPLEMENTED** | Server-side price verification against ticket-service |
| Idempotency | **IMPLEMENTED** | 30-minute TTL on critical write operations |
| Distributed Locks | **IMPLEMENTED** | Using `withLock` from shared library |
| Audit Logging | **IMPLEMENTED** | Using `auditService` from shared library |
| Response Schemas | **IMPLEMENTED** | Defined to prevent data leakage |
| Rate Limiting | **IMPLEMENTED** | Per-endpoint configuration |
| Circuit Breakers | **IMPLEMENTED** | Via BaseServiceClient |

---

## FINAL SUMMARY

### CRITICAL ISSUES

1. **State machine inconsistency** - Code says `COMPLETED` is terminal, but DB function allows `COMPLETED → REFUNDED`. This could cause unexpected behavior if both paths are used.

2. **Internal route joins external table** - `internal.routes.ts:144` joins `ticket_types` table which belongs to ticket-service. Should use API call instead.

### HIGH PRIORITY

1. **Tax service not implemented** - `tax.controller.ts` is stubbed. Tax calculation uses a fixed default rate which may not be compliant for all jurisdictions.

2. **Order modification price fetching** - `order-modification.service.ts:43` has `const newPrice = 0` with TODO. Modifications won't calculate correct pricing.

3. **PDF generation not implemented** - Three TODO items in `pdf-generator.ts` for receipt/ticket PDF generation.

### MEDIUM PRIORITY

1. **High `any` usage** - 110 occurrences across 47 files reduces type safety.

2. **Commented out jobs** - 8 background jobs are commented out in index.ts, suggesting incomplete features.

3. **Payout tracking incomplete** - Schema has payout columns but full payout flow integration appears incomplete based on code review.

4. **Event search TODO** - `order-search.service.ts:153` may need event name join.

---

**Files Analyzed:** 124
**Critical Issues:** 2
**High Priority:** 3
**Medium Priority:** 4

**Overall Assessment:** The order-service demonstrates solid architecture with proper security measures including HMAC authentication, RLS, price validation, idempotency, and distributed locking. The primary concerns are the state machine inconsistency and several incomplete features (tax, PDF generation, order modifications). The codebase follows consistent patterns and uses shared infrastructure appropriately. Security-critical operations like refunds have robust checks including double-spend prevention via ticket transfer verification.
