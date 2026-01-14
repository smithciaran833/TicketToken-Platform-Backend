# PARTIAL REFUND FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Partial Refund |

---

## Executive Summary

**WORKING - Comprehensive implementation**

| Component | Status |
|-----------|--------|
| Partial refund by amount | ✅ Working |
| Partial refund by tickets | ✅ Working |
| Track cumulative refunds | ✅ Working |
| Max refundable calculation | ✅ Working |
| Promo code adjustment | ✅ Working |
| Currency validation | ✅ Working |
| Payment status update (partially_refunded) | ✅ Working |
| Ticket status update | ✅ Working |

**Bottom Line:** Partial refunds are fully implemented with two methods: by amount or by specific ticket IDs. The system tracks cumulative refunds, calculates max refundable amounts, handles promo code adjustments, and properly updates both payment and ticket statuses.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/refunds/create` | POST | Create refund by amount | ✅ Working |
| `/refunds/tickets` | POST | Refund specific tickets | ✅ Working |
| `/refunds/info/:paymentIntentId` | GET | Get refundable info | ✅ Working |
| `/refunds/promo-adjustment/:paymentIntentId` | GET | Calculate promo adjustment | ✅ Working |
| `/refunds/:refundId` | GET | Get refund details | ✅ Working |
| `/refunds` | GET | List refunds | ✅ Working |

---

## Partial Refund by Amount

**Endpoint:** `POST /api/v1/refunds/create`
```json
{
  "paymentIntentId": "pi_xxx",
  "amount": 5000,  // Partial amount in cents
  "reason": "requested_by_customer"
}
```

---

## Partial Refund by Tickets

**Endpoint:** `POST /api/v1/refunds/tickets`
```json
{
  "paymentIntentId": "pi_xxx",
  "ticketIds": ["uuid1", "uuid2"],
  "reason": "requested_by_customer"
}
```

**Response:**
```json
{
  "refundId": "re_xxx",
  "status": "succeeded",
  "amount": 10000,
  "ticketIds": ["uuid1", "uuid2"],
  "ticketDetails": [
    { "ticketId": "uuid1", "amount": 5000 },
    { "ticketId": "uuid2", "amount": 5000 }
  ],
  "remainingTickets": 3
}
```

---

## Refundable Info

**Endpoint:** `GET /api/v1/refunds/info/:paymentIntentId`

**Response:**
```json
{
  "paymentIntentId": "pi_xxx",
  "originalAmount": 50000,
  "totalRefunded": 10000,
  "maxRefundable": 40000,
  "stripeFee": 1500,
  "platformFee": 2500,
  "ticketCount": 5,
  "ticketsRefunded": 2,
  "currency": "USD",
  "promoDiscount": {
    "promoCode": "SAVE20",
    "discountAmount": 10000,
    "discountPercent": 20
  },
  "isFullyRefunded": false
}
```

---

## Implementation Details

### Ticket Refund Flow

**File:** `backend/services/payment-service/src/controllers/refundController.ts`
```typescript
async createTicketRefund(request, reply) {
  // 1. Validate authentication and tenant
  // 2. Get ticket prices and validate ownership
  // 3. Calculate total refund amount
  // 4. Create Stripe refund
  // 5. Store refund with ticket associations
  // 6. Update ticket statuses to 'refunded'
  // 7. Update payment status:
  //    - If all tickets refunded: 'refunded'
  //    - Otherwise: 'partially_refunded'
  // 8. Return refund details
}
```

### Payment Status Updates
```typescript
// Full refund
if (remaining === 0) {
  await client.query(
    `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
    [paymentIntentId]
  );
} else {
  // Partial refund
  await client.query(
    `UPDATE payment_intents SET status = 'partially_refunded' WHERE stripe_intent_id = $1`,
    [paymentIntentId]
  );
}
```

### Promo Code Adjustment

When refunding orders that used a promo code, the refund amount is adjusted proportionally:
```typescript
// Example: 20% off order, refunding 2 of 5 tickets
// Original: $500 - 20% = $400 paid
// Refund 2 tickets ($200 face value)
// Adjusted refund: $200 - 20% = $160
```

---

## Validation

### Currency Validation
```typescript
function validateCurrency(requestCurrency: string | undefined, paymentCurrency: string): void {
  const reqCurrency = (requestCurrency || 'USD').toUpperCase();
  const payCurrency = paymentCurrency.toUpperCase();

  if (reqCurrency !== payCurrency) {
    throw new BadRequestError(
      `Currency mismatch: requested ${reqCurrency} but payment is in ${payCurrency}`
    );
  }
}
```

### Schema Validation

- `paymentIntentId`: Pattern `^pi_[a-zA-Z0-9]+$`
- `amount`: Integer, minimum 1, maximum 100,000,000
- `ticketIds`: Array of UUIDs, 1-100 items, unique
- `reason`: Enum `['duplicate', 'fraudulent', 'requested_by_customer', 'other']`

---

## Files Involved

| File | Purpose |
|------|---------|
| `payment-service/src/routes/refund.routes.ts` | Route definitions |
| `payment-service/src/controllers/refundController.ts` | Business logic |
| `payment-service/src/validators/refund.validator.ts` | Validation |

---

## Related Documents

- `REFUND_CANCELLATION_FLOW_AUDIT.md` - General refund flow
- `FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md` - Fee handling
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Original purchase
