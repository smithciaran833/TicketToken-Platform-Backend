# PAYMENT METHOD MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Payment Method Management (Saved Cards) |

---

## Executive Summary

**NOT IMPLEMENTED - Token-per-transaction only**

| Component | Status |
|-----------|--------|
| payment_methods table | ❌ Does not exist |
| Save card for later | ❌ Not implemented |
| List saved cards | ❌ Not implemented |
| Delete saved card | ❌ Not implemented |
| Set default card | ❌ Not implemented |
| Use saved card for purchase | ❌ Not implemented |
| Stripe Customer object | ❌ Not created |

**Bottom Line:** The payment system uses one-time payment tokens per transaction. There is no concept of saved payment methods - users must enter card details for every purchase. No `payment_methods` table exists, and Stripe Customer objects are not created to store cards.

---

## Current Implementation

### Payment Request Structure

**File:** `backend/services/payment-service/src/types/payment.types.ts`
```typescript
export interface PaymentRequest {
  userId: string;
  venueId: string;
  eventId: string;
  tickets: TicketSelection[];
  paymentMethod: PaymentMethod;  // One-time token
  idempotencyKey: string;
}

export interface PaymentMethod {
  type: 'card' | 'ach' | 'paypal' | 'crypto';
  token?: string;           // One-time Stripe token
  paymentMethodId?: string; // Or existing Stripe PaymentMethod ID
}
```

### How Payments Work Now

1. Frontend collects card → Stripe.js creates one-time token
2. Token sent to backend in `paymentMethod.token`
3. Backend creates PaymentIntent with token
4. Token used once, discarded
5. Next purchase requires new card entry

---

## What's Missing

### 1. Database Table
```sql
-- NOT IMPLEMENTED
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stripe_payment_method_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  type VARCHAR(20),  -- 'card', 'ach'
  last_four VARCHAR(4),
  brand VARCHAR(20),  -- 'visa', 'mastercard'
  exp_month INT,
  exp_year INT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Stripe Customer Creation
```typescript
// NOT IMPLEMENTED
async createStripeCustomer(userId: string, email: string) {
  const customer = await stripe.customers.create({ email, metadata: { userId } });
  await db('users').where({ id: userId }).update({ stripe_customer_id: customer.id });
  return customer;
}
```

### 3. API Endpoints

Expected but not implemented:
```
GET    /api/v1/payment-methods           - List saved cards
POST   /api/v1/payment-methods           - Save a new card
DELETE /api/v1/payment-methods/:id       - Remove saved card
PUT    /api/v1/payment-methods/:id/default - Set as default
```

### 4. Use Saved Card for Purchase
```typescript
// NOT IMPLEMENTED
if (paymentRequest.savedPaymentMethodId) {
  const paymentMethod = await db('payment_methods')
    .where({ id: savedPaymentMethodId, user_id: userId })
    .first();
  
  await stripe.paymentIntents.create({
    customer: paymentMethod.stripe_customer_id,
    payment_method: paymentMethod.stripe_payment_method_id,
    confirm: true,
  });
}
```

---

## Impact

| Area | Impact |
|------|--------|
| User experience | Must enter card every purchase |
| Conversion rate | Higher cart abandonment |
| Repeat purchases | Friction for returning customers |
| Mobile experience | Tedious on small screens |
| Subscription/recurring | Not possible without saved cards |

---

## Recommendations

### P2 - Implement Saved Payment Methods

| Task | Effort |
|------|--------|
| Create payment_methods table | 0.25 day |
| Stripe Customer creation | 0.5 day |
| Save payment method endpoint | 0.5 day |
| List payment methods endpoint | 0.25 day |
| Delete payment method endpoint | 0.25 day |
| Set default endpoint | 0.25 day |
| Update purchase flow to use saved | 0.5 day |
| **Total** | **2.5 days** |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase uses one-time tokens
- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Stripe Connect (different flow)
