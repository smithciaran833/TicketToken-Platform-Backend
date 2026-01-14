# PAYMENTS-FINANCIAL FLOW AUDIT SUMMARY

> **Generated:** January 2, 2025
> **Category:** payments-financial
> **Total Files:** 21
> **Status:** ✅ Complete (6) | ⚠️ Partial (12) | ❌ Not Implemented (3)

---

## CRITICAL ISSUES

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| **P0** | Venues NEVER credited for primary sales | VENUE_PAYOUT | Money sits in platform Stripe, venues not paid |
| **P0** | Order history not routed through gateway | ORDER_HISTORY | Users cannot view their orders |
| **P0** | Refunds fail - ticket-service endpoints missing | REFUND_CANCELLATION | POST /internal/tickets/release returns 404 |
| **P1** | Stripe chargebacks not handled | DISPUTE_CHARGEBACK | No webhook listeners for charge.dispute.* |
| **P1** | Payouts don't actually transfer money | PAYOUT_SCHEDULING | processPayout() has TODO comment |
| **P1** | Royalty distribution blocked by broken secondary purchase | ROYALTY_DISTRIBUTION | Comprehensive design, can't execute |
| **P1** | Failed payment retry job never scheduled | FAILED_PAYMENT_RETRY | Job exists but not in cron schedule |
| P2 | Tax endpoints all return 501 | TAX_CALCULATION | 15+ endpoints not implemented |
| P2 | Artist payout incomplete | ARTIST_PAYOUT | Schema exists, no onboarding/dashboard |
| P3 | No saved payment methods | PAYMENT_METHOD_MANAGEMENT | One-time tokens only |
| P3 | No invoice generation | INVOICE_GENERATION | No receipts, no PDF invoices |

---

## FILE-BY-FILE BREAKDOWN

---

### 1. ARTIST_PAYOUT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists (Schema):**
```sql
-- events table
artist_royalty_percentage DECIMAL(5,4),
artist_stripe_account_id VARCHAR(255),
artist_wallet_address VARCHAR(255),

-- royalty_distributions table tracks artist payouts
```

**What Works:**
- `RoyaltySplitterService` calculates artist share correctly:
```typescript
calculateSplit(saleAmount: number, event: Event): RoyaltySplit {
  const artistShare = saleAmount * (event.artistRoyaltyPercentage || 0);
  const venueShare = saleAmount * (event.venueRoyaltyPercentage || 0);
  const platformShare = saleAmount - artistShare - venueShare;
  
  return { artistShare, venueShare, platformShare };
}
```

**What's Missing:**
- ❌ No artist onboarding flow
- ❌ No artist Stripe Connect integration
- ❌ No artist wallet connection
- ❌ No artist dashboard endpoints
- ❌ No artist payout history
- ❌ No artist invite flow for events

**Expected Flow (Not Implemented):**
```typescript
// 1. Venue invites artist to event
POST /events/:eventId/artists/invite
{ email, name, royaltyPercentage }

// 2. Artist accepts, connects Stripe
POST /artists/onboard
→ Stripe Connect OAuth

// 3. Artist views earnings
GET /artists/me/earnings
GET /artists/me/payouts
```

**Key Files:**
- `payment-service/src/services/marketplace/royalty-splitter.service.ts` ✅
- No artist service or routes

---

### 2. CURRENCY_MULTICURRENCY_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Exists:**
```typescript
// payment-service/src/services/currency.service.ts
class CurrencyService {
  private rates = {
    USD: 1.0,
    EUR: 0.85,
    GBP: 0.73,
    CAD: 1.25,
    AUD: 1.45,
    JPY: 110.0
  };
  
  convert(amount: number, from: string, to: string): number {
    const inUsd = amount / this.rates[from];
    return Math.round(inUsd * this.rates[to]);
  }
}
```

**What Works:**
- USD as base currency throughout platform
- Currency conversion utility exists
- Integer math (cents) prevents float drift
- Stripe handles currency at payment time

**What's Missing:**
- ❌ No real-time exchange rate API integration
- ❌ Hardcoded rates will become stale
- ❌ No currency preference per venue
- ❌ No currency display formatting per locale
- ❌ International processing fee (configured at 2% but not applied)

**Expected Implementation:**
```typescript
// Real-time rates
async getExchangeRates(): Promise<Rates> {
  return await fetch('https://api.exchangerate.host/latest?base=USD');
}

// Venue currency settings
interface VenueCurrencySettings {
  displayCurrency: string;      // What users see
  settlementCurrency: string;   // What venue receives
  acceptedCurrencies: string[]; // What users can pay with
}
```

**Key Files:**
- `payment-service/src/services/currency.service.ts`
- `packages/shared/src/utils/currency.ts`

---

### 3. DISPUTE_CHARGEBACK_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Works - In-App Disputes:**
```typescript
// payment-service/src/services/dispute.service.ts
class DisputeService {
  async createDispute(orderId, reason, description) {
    return db('payment_disputes').insert({
      order_id: orderId,
      reason,
      description,
      status: 'open',
      created_at: new Date()
    });
  }
  
  async addEvidence(disputeId, evidence) {
    return db('dispute_evidence').insert({
      dispute_id: disputeId,
      type: evidence.type,
      content: evidence.content,
      submitted_at: new Date()
    });
  }
  
  async resolveDispute(disputeId, resolution, refundAmount?) {
    await db('payment_disputes').update({
      status: resolution,
      resolved_at: new Date(),
      refund_amount: refundAmount
    });
  }
}
```

**What's Broken - Stripe Chargebacks NOT Handled:**
```typescript
// payment-service/src/webhooks/stripe-handler.ts
// These events are NOT listened for:
// - charge.dispute.created
// - charge.dispute.updated
// - charge.dispute.closed
// - charge.dispute.funds_withdrawn
// - charge.dispute.funds_reinstated

// ChargebackReserveService exists but is NEVER called:
class ChargebackReserveService {
  async calculateReserve(venueId: string): Promise<number> {
    // Risk-based reserve: 1-5% of balance
    const riskScore = await this.getRiskScore(venueId);
    return balance * (riskScore * 0.01);
  }
  
  async holdReserve(venueId, amount) { /* exists */ }
  async releaseReserve(venueId, amount) { /* exists */ }
}
// But nothing triggers these methods
```

**Impact:**
- When customer disputes charge with bank, Stripe notifies via webhook
- Platform never receives notification
- No evidence submitted to Stripe
- Dispute auto-lost after deadline
- Venue balance never adjusted
- Reserve never held

**Required Webhook Handlers:**
```typescript
// Must add to stripe-handler.ts
case 'charge.dispute.created':
  await this.handleDisputeCreated(event.data.object);
  // Hold funds, notify venue, start evidence collection
  break;

case 'charge.dispute.updated':
  await this.handleDisputeUpdated(event.data.object);
  break;

case 'charge.dispute.closed':
  await this.handleDisputeClosed(event.data.object);
  // Release or deduct funds based on outcome
  break;
```

**Key Files:**
- `payment-service/src/services/dispute.service.ts` ✅ In-app disputes work
- `payment-service/src/webhooks/stripe-handler.ts` ❌ Missing chargeback handlers
- `payment-service/src/services/chargeback-reserve.service.ts` ❌ Never called

---

### 4. ESCROW_HOLD_RELEASE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
```typescript
// payment-service/src/services/marketplace/escrow.service.ts
class EscrowService {
  async createEscrow(transactionId, amount, holdPeriodHours = 24) {
    return db('escrow_holds').insert({
      transaction_id: transactionId,
      amount_cents: amount,
      status: 'held',
      hold_until: addHours(new Date(), holdPeriodHours),
      created_at: new Date()
    });
  }
  
  async releaseEscrow(escrowId, releaseType: 'full' | 'partial', amount?) {
    const escrow = await this.getEscrow(escrowId);
    
    if (releaseType === 'full') {
      await this.creditSellerBalance(escrow.sellerId, escrow.amountCents);
      await db('escrow_holds').update({ status: 'released' });
    } else {
      await this.creditSellerBalance(escrow.sellerId, amount);
      await db('escrow_holds').update({
        amount_cents: escrow.amountCents - amount,
        partial_release_amount: amount
      });
    }
  }
  
  async cancelEscrow(escrowId, reason) {
    await this.refundBuyer(escrow.buyerId, escrow.amountCents);
    await db('escrow_holds').update({ status: 'cancelled', cancel_reason: reason });
  }
  
  async disputeEscrow(escrowId) {
    await db('escrow_holds').update({ status: 'disputed' });
    // Funds remain held until dispute resolution
  }
}
```

**Escrow Statuses:**
- `held` - Funds held, awaiting release
- `released` - Funds sent to seller
- `partial_release` - Some funds released
- `cancelled` - Refunded to buyer
- `disputed` - Frozen pending resolution
- `expired` - Auto-released after hold period

**Auto-Release Job:**
```typescript
// Runs hourly
@Cron('0 * * * *')
async autoReleaseExpiredEscrows() {
  const expired = await db('escrow_holds')
    .where('status', 'held')
    .where('hold_until', '<', new Date());
  
  for (const escrow of expired) {
    await this.releaseEscrow(escrow.id, 'full');
  }
}
```

**Admin Override:**
```typescript
async forceRelease(escrowId, adminId, reason) {
  await this.releaseEscrow(escrowId, 'full');
  await this.auditLog(escrowId, 'force_release', adminId, reason);
}
```

**Tenant Isolation:**
```sql
ALTER TABLE escrow_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY escrow_tenant_isolation ON escrow_holds
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Key Files:**
- `payment-service/src/services/marketplace/escrow.service.ts`
- `payment-service/src/jobs/escrow-auto-release.job.ts`

---

### 5. FAILED_PAYMENT_RETRY_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Exists:**
```typescript
// payment-service/src/jobs/retry-failed-payments.ts
class RetryFailedPaymentsJob {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_HOURS = 1;
  private readonly BATCH_SIZE = 10;
  
  async run() {
    const failedPayments = await db('payments')
      .where('status', 'failed')
      .where('retry_count', '<', this.MAX_RETRIES)
      .where('last_retry_at', '<', subHours(new Date(), this.RETRY_DELAY_HOURS))
      .limit(this.BATCH_SIZE);
    
    for (const payment of failedPayments) {
      try {
        await this.retryPayment(payment);
        await this.markSuccess(payment.id);
      } catch (error) {
        await this.incrementRetryCount(payment.id);
        if (payment.retry_count + 1 >= this.MAX_RETRIES) {
          await this.markPermanentlyFailed(payment.id);
          await this.notifyUser(payment.userId, 'payment_failed_final');
        }
      }
    }
  }
  
  private async retryPayment(payment) {
    const paymentIntent = await stripe.paymentIntents.confirm(
      payment.stripe_payment_intent_id
    );
    return paymentIntent.status === 'succeeded';
  }
}
```

**What's Broken - Job Never Scheduled:**
```typescript
// payment-service/src/index.ts
// The job is imported but NEVER added to the cron schedule

import { RetryFailedPaymentsJob } from './jobs/retry-failed-payments';
// ... but no cron.schedule() call for it

// Expected but missing:
cron.schedule('*/15 * * * *', async () => {
  await retryFailedPaymentsJob.run();
});
```

**Impact:**
- Failed payments stay failed
- No automatic retry
- Users must manually retry
- Revenue lost

**Key Files:**
- `payment-service/src/jobs/retry-failed-payments.ts` ✅ Job exists
- `payment-service/src/index.ts` ❌ Job not scheduled

---

### 6. FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**Two Systems Exist (Both Work):**

**1. Order Service - Simple:**
```typescript
// order-service/src/services/fee-calculator.service.ts
const PLATFORM_FEE_PERCENT = 0.05;      // 5%
const PROCESSING_FEE_PERCENT = 0.029;   // 2.9%
const PROCESSING_FEE_FIXED = 30;        // $0.30

calculateFees(subtotalCents: number): FeeBreakdown {
  const platformFee = Math.round(subtotalCents * PLATFORM_FEE_PERCENT);
  const processingFee = Math.round(subtotalCents * PROCESSING_FEE_PERCENT) + PROCESSING_FEE_FIXED;
  
  return {
    subtotal: subtotalCents,
    platformFee,
    processingFee,
    total: subtotalCents + platformFee + processingFee
  };
}
```

**2. Payment Service - Advanced:**
```typescript
// payment-service/src/services/core/fee-calculator.service.ts
class FeeCalculatorService {
  // Tiered pricing based on volume
  private tiers = [
    { maxVolume: 10000_00, platformRate: 0.082 },   // 8.2% under $10k
    { maxVolume: 50000_00, platformRate: 0.078 },   // 7.8% $10k-$50k
    { maxVolume: 100000_00, platformRate: 0.075 },  // 7.5% $50k-$100k
    { maxVolume: Infinity, platformRate: 0.070 },   // 7.0% over $100k
  ];
  
  async calculateFees(venueId, subtotal) {
    const monthlyVolume = await this.getMonthlyVolume(venueId);
    const tier = this.tiers.find(t => monthlyVolume <= t.maxVolume);
    const platformFee = Math.round(subtotal * tier.platformRate);
    
    // TaxJar integration for tax
    const tax = await this.taxService.calculate(subtotal, venueId);
    
    // Gas estimation for NFT
    const gasEstimate = await this.estimateGas();
    
    return { platformFee, processingFee, tax, gasEstimate, total };
  }
}
```

**Fee Distribution:**
```
Sale: $100.00
├── Platform Fee: $5.00 (5%)
├── Processing Fee: $3.20 (2.9% + $0.30)
├── Tax: $8.25 (varies)
├── Venue: $83.55 (remainder)
└── Total Charged: $116.45
```

**Key Files:**
- `order-service/src/services/fee-calculator.service.ts`
- `payment-service/src/services/core/fee-calculator.service.ts`
- `payment-service/src/services/core/tax-calculator.service.ts`

---

### 7. INVOICE_GENERATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
- Order confirmation emails (via notification-service)
- Order data stored in database

**What's Missing:**
- ❌ No Invoice model/table
- ❌ No invoice number generation
- ❌ No PDF invoice generation
- ❌ No invoice download endpoint
- ❌ No tax invoice compliance
- ❌ No receipt generation
- ❌ No invoice email delivery

**Expected Implementation:**
```typescript
// Invoice model
interface Invoice {
  id: string;
  invoiceNumber: string;          // INV-2025-00001
  orderId: string;
  tenantId: string;
  userId: string;
  
  // Billing details
  billingName: string;
  billingAddress: Address;
  billingEmail: string;
  
  // Line items
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  
  // Tax compliance
  taxId?: string;                 // Venue tax ID
  taxBreakdown: TaxBreakdown[];
  
  // Status
  status: 'draft' | 'issued' | 'paid' | 'void';
  issuedAt: Date;
  paidAt?: Date;
  
  // Files
  pdfUrl?: string;
}

// Expected endpoints
GET /orders/:orderId/invoice          // Get invoice
GET /orders/:orderId/invoice/pdf      // Download PDF
POST /orders/:orderId/invoice/email   // Email invoice
```

**Key Files:**
- None exist

---

### 8. ORDER_HISTORY_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P0** |

**Two Services Exist:**

**1. Order Service (Full Featured but Auth Stub):**
```typescript
// order-service/src/services/order.service.ts
class OrderService {
  async getOrderHistory(userId: string, options: QueryOptions) {
    return db('orders')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(options.limit)
      .offset(options.offset);
  }
  
  async getOrderDetails(orderId: string) {
    const order = await db('orders').where('id', orderId).first();
    const items = await db('order_items').where('order_id', orderId);
    const refunds = await db('order_refunds').where('order_id', orderId);
    const events = await db('order_events').where('order_id', orderId);
    
    return { ...order, items, refunds, events };
  }
}
```

**Problem - Auth is Stubbed:**
```typescript
// order-service/src/middleware/auth.middleware.ts
export const authenticate = async (request, reply) => {
  // TODO: Implement JWT validation
  request.user = { id: 'stub-user-id' };  // HARDCODED
};
```

**2. Ticket Service (Simpler but Working Auth):**
```typescript
// ticket-service/src/services/order.service.ts
class OrderService {
  async getUserOrders(userId: string) {
    return db('orders').where('user_id', userId);
  }
}
// Has working JWT auth middleware
```

**What's Broken - Neither Routed Through Gateway:**
```typescript
// api-gateway/src/routes/order.routes.ts
// Routes exist but point to order-service which has stub auth
// Users get stub user's orders, not their own
```

**Impact:**
- Users cannot view their order history
- All users see same orders (stub user's)
- Order details inaccessible

**Key Files:**
- `order-service/src/services/order.service.ts` ✅ Logic works
- `order-service/src/middleware/auth.middleware.ts` ❌ Stub
- `ticket-service/src/services/order.service.ts` ⚠️ Simpler
- `api-gateway/src/routes/order.routes.ts` ❌ Wrong routing

---

### 9. PARTIAL_REFUND_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
```typescript
// payment-service/src/services/refund.service.ts
class RefundService {
  async processPartialRefund(orderId: string, request: PartialRefundRequest) {
    const order = await this.getOrder(orderId);
    
    // Validate refund amount
    const previousRefunds = await this.getTotalRefunded(orderId);
    const maxRefundable = order.totalCents - previousRefunds;
    
    if (request.amountCents > maxRefundable) {
      throw new Error(`Maximum refundable: ${maxRefundable} cents`);
    }
    
    // Process with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: request.amountCents,
    });
    
    // Record refund
    await db('order_refunds').insert({
      order_id: orderId,
      amount_cents: request.amountCents,
      reason: request.reason,
      stripe_refund_id: refund.id,
      refund_type: 'partial',
      processed_at: new Date()
    });
    
    // Update order status
    await this.updateOrderStatus(orderId, 'partially_refunded');
    
    return refund;
  }
  
  async refundSpecificTickets(orderId: string, ticketIds: string[]) {
    const tickets = await this.getTickets(ticketIds);
    const refundAmount = tickets.reduce((sum, t) => sum + t.priceInCents, 0);
    
    await this.processPartialRefund(orderId, {
      amountCents: refundAmount,
      reason: 'ticket_cancellation',
      ticketIds
    });
    
    // Cancel specific tickets
    await this.cancelTickets(ticketIds);
  }
}
```

**Features:**
- ✅ Refund by amount
- ✅ Refund by specific tickets
- ✅ Cumulative refund tracking
- ✅ Promo code adjustment
- ✅ Currency validation
- ✅ Order status update (partially_refunded)
- ✅ Stripe refund integration

**Key Files:**
- `payment-service/src/services/refund.service.ts`
- `order-service/src/services/refund.service.ts`

---

### 10. PAYMENT_METHOD_MANAGEMENT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**Current State:**
- All payments use one-time Stripe tokens
- No PaymentMethod or Customer objects saved
- Users re-enter card details every purchase

**What's Missing:**
- ❌ No Stripe Customer creation
- ❌ No saved PaymentMethods
- ❌ No "Save card for future" checkbox
- ❌ No payment method management UI
- ❌ No default payment method
- ❌ No card update/delete

**Expected Implementation:**
```typescript
// Create Stripe Customer on registration
async createCustomer(userId: string, email: string) {
  const customer = await stripe.customers.create({ email });
  await db('users').update({ stripe_customer_id: customer.id });
}

// Save payment method
async savePaymentMethod(userId: string, paymentMethodId: string) {
  const user = await this.getUser(userId);
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: user.stripeCustomerId
  });
  
  await db('user_payment_methods').insert({
    user_id: userId,
    stripe_payment_method_id: paymentMethodId,
    last_four: pm.card.last4,
    brand: pm.card.brand,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
    is_default: false
  });
}

// Expected endpoints
GET /users/me/payment-methods
POST /users/me/payment-methods
DELETE /users/me/payment-methods/:id
PUT /users/me/payment-methods/:id/default
```

**Key Files:**
- None exist

---

### 11. PAYOUT_SCHEDULING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Works - Balance Tracking:**
```typescript
// payment-service/src/services/core/venue-balance.service.ts
class VenueBalanceService {
  async getBalance(venueId: string): Promise<VenueBalance> {
    return db('venue_balances').where('venue_id', venueId).first();
  }
  
  async creditBalance(venueId: string, amount: number, reason: string) {
    await db('venue_balances')
      .where('venue_id', venueId)
      .increment('available_balance', amount);
    
    await db('balance_transactions').insert({
      venue_id: venueId,
      amount,
      type: 'credit',
      reason,
      created_at: new Date()
    });
  }
}
```

**What Works - Payout Calculation:**
```typescript
class PayoutService {
  async calculatePayout(venueId: string) {
    const balance = await this.getBalance(venueId);
    const settings = await this.getPayoutSettings(venueId);
    
    // Hold reserve based on risk
    const riskScore = await this.getRiskScore(venueId);
    const reservePercent = riskScore < 3 ? 0.05 : riskScore < 7 ? 0.10 : 0.15;
    const reserveAmount = Math.round(balance.available * reservePercent);
    
    const payoutAmount = balance.available - reserveAmount;
    
    // Check minimum
    if (payoutAmount < settings.minimumPayoutCents) {
      return { eligible: false, reason: 'Below minimum' };
    }
    
    return { eligible: true, amount: payoutAmount };
  }
}
```

**What's Broken - Actual Transfer Not Implemented:**
```typescript
async processPayout(venueId: string, amount: number) {
  // TODO: In production, would initiate actual bank transfer here
  // Currently just updates internal balance
  
  await db('venue_balances')
    .where('venue_id', venueId)
    .decrement('available_balance', amount);
  
  await db('payouts').insert({
    venue_id: venueId,
    amount,
    status: 'completed',  // Lies - not actually transferred
    created_at: new Date()
  });
}
```

**What Should Happen:**
```typescript
async processPayout(venueId: string, amount: number) {
  const venue = await this.getVenue(venueId);
  
  // Create Stripe Transfer to connected account
  const transfer = await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination: venue.stripeAccountId,
    transfer_group: `payout_${venueId}_${Date.now()}`
  });
  
  await db('payouts').insert({
    venue_id: venueId,
    amount,
    status: 'pending',
    stripe_transfer_id: transfer.id
  });
  
  // Listen for transfer.paid webhook to confirm
}
```

**Instant Payout (Configured but Not Working):**
```typescript
// Settings exist for instant payout (1% fee)
instantPayoutEnabled: boolean;
instantPayoutFeePercent: 0.01;
// But processPayout doesn't support instant transfers
```

**Key Files:**
- `payment-service/src/services/core/venue-balance.service.ts` ✅
- `payment-service/src/services/core/payout.service.ts` ⚠️ Mock transfer
- `venue-service/src/models/payout-settings.model.ts` ✅

---

### 12. PLATFORM_REVENUE_ACCOUNTING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Exists:**
```sql
-- orders table
platform_fee_cents INTEGER,

-- payments table  
platform_fee_cents INTEGER,
```

**What Works:**
```typescript
// PaymentAnalyticsService
async getTotalRevenue(startDate: Date, endDate: Date) {
  const result = await db('payments')
    .whereBetween('created_at', [startDate, endDate])
    .where('status', 'completed')
    .sum('amount_cents as total');
  
  return result.total;
}
```

**What's Missing:**
- ❌ No platform fee aggregation endpoint
- ❌ No revenue dashboard
- ❌ No revenue by venue report
- ❌ No revenue by event report
- ❌ No revenue trends/projections
- ❌ No accounting export

**Expected Implementation:**
```typescript
// Admin endpoints
GET /admin/revenue/summary
{
  totalRevenue: 1000000,
  platformFees: 50000,
  processingFees: 32000,
  netRevenue: 918000,
  period: { start, end }
}

GET /admin/revenue/by-venue
GET /admin/revenue/by-event
GET /admin/revenue/trends?period=monthly
GET /admin/revenue/export?format=csv
```

**Key Files:**
- `payment-service/src/services/analytics/payment-analytics.service.ts`
- No admin revenue routes

---

### 13. REFUND_CANCELLATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P0** |

**What Works - Stripe Refund:**
```typescript
// order-service/src/services/refund.service.ts
async processRefund(orderId: string, reason: string) {
  const order = await this.getOrder(orderId);
  
  // Stripe refund works
  const refund = await stripe.refunds.create({
    payment_intent: order.stripePaymentIntentId,
  });
  
  // Record refund
  await db('order_refunds').insert({
    order_id: orderId,
    stripe_refund_id: refund.id,
    status: 'completed'
  });
  
  // Try to cancel tickets - THIS FAILS
  await this.cancelAssociatedTickets(orderId);
}
```

**What's Broken - Ticket Cancellation Fails:**
```typescript
// order-service/src/services/refund.service.ts
async cancelAssociatedTickets(orderId: string) {
  // Calls ticket-service internal endpoint
  await axios.post(`${ticketServiceUrl}/internal/tickets/release`, {
    orderId
  });
  // Returns 404 - endpoint doesn't exist in ticket-service
}

// ticket-service/src/routes/internal.routes.ts
// POST /internal/tickets/release does NOT exist
// These endpoints don't exist either:
// POST /internal/tickets/cancel
// POST /internal/tickets/bulk-cancel
// POST /internal/tickets/invalidate
// POST /internal/tickets/void
```

**Impact:**
- Refund processed in Stripe ✓
- User gets money back ✓
- Tickets remain VALID ✗
- Can still use refunded tickets ✗
- NFTs never burned ✗

**Two Disconnected Refund Systems:**
```
order-service/refund.service.ts
├── Calls Stripe ✓
├── Calls ticket-service (404) ✗
└── Updates order status ✓

ticket-service/refundService.ts  (separate)
├── Has refund logic
├── But not exposed via routes
└── Not called by order-service
```

**Key Files:**
- `order-service/src/services/refund.service.ts` ⚠️ Stripe works, ticket cancel fails
- `ticket-service/src/routes/internal.routes.ts` ❌ Missing endpoints

---

### 14. REFUND_POLICIES_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
```typescript
// order-service/src/services/refund-policy.service.ts
class RefundPolicyService {
  async getPolicy(venueId: string, eventId?: string): Promise<RefundPolicy> {
    // Event-specific policy takes precedence
    if (eventId) {
      const eventPolicy = await db('refund_policies')
        .where({ event_id: eventId })
        .first();
      if (eventPolicy) return eventPolicy;
    }
    
    // Fall back to venue policy
    return db('refund_policies')
      .where({ venue_id: venueId, event_id: null })
      .first();
  }
  
  async checkEligibility(orderId: string): Promise<RefundEligibility> {
    const order = await this.getOrder(orderId);
    const policy = await this.getPolicy(order.venueId, order.eventId);
    const event = await this.getEvent(order.eventId);
    
    const hoursUntilEvent = differenceInHours(event.startDate, new Date());
    
    // Time-based rules
    for (const rule of policy.rules) {
      if (hoursUntilEvent >= rule.hoursBeforeEvent) {
        return {
          eligible: true,
          refundPercent: rule.refundPercent,
          amount: Math.round(order.totalCents * rule.refundPercent),
          rule: rule.name
        };
      }
    }
    
    return { eligible: false, reason: 'Past refund deadline' };
  }
}
```

**Refund Policy Schema:**
```typescript
interface RefundPolicy {
  id: string;
  venueId: string;
  eventId?: string;           // Optional event override
  name: string;
  rules: RefundRule[];
  autoApprove: boolean;       // Auto-approve if rules met
  manualReviewRequired: boolean;
}

interface RefundRule {
  name: string;
  hoursBeforeEvent: number;   // 168 = 7 days, 24 = 1 day
  refundPercent: number;      // 1.0 = 100%, 0.5 = 50%
  reasonCodes: string[];      // Which reasons apply
}
```

**Example Policy:**
```json
{
  "name": "Standard Refund Policy",
  "rules": [
    { "name": "Full refund", "hoursBeforeEvent": 168, "refundPercent": 1.0 },
    { "name": "75% refund", "hoursBeforeEvent": 72, "refundPercent": 0.75 },
    { "name": "50% refund", "hoursBeforeEvent": 24, "refundPercent": 0.50 },
    { "name": "No refund", "hoursBeforeEvent": 0, "refundPercent": 0 }
  ]
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/refund-policies` | GET | List policies | ✅ Working |
| `/refund-policies/:id` | GET | Get policy | ✅ Working |
| `/refund-policies` | POST | Create policy | ✅ Working |
| `/refund-policies/:id` | PUT | Update policy | ✅ Working |
| `/orders/:id/refund-eligibility` | GET | Check eligibility | ✅ Working |

**Key Files:**
- `order-service/src/services/refund-policy.service.ts`
- `order-service/src/routes/refund-policy.routes.ts`

---

### 15. ROYALTY_DISTRIBUTION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Exists (Comprehensive Design):**
```typescript
// payment-service/src/services/marketplace/royalty-splitter.service.ts
class RoyaltySplitterService {
  async calculateRoyalties(saleAmount: number, listing: Listing): Promise<RoyaltySplit> {
    const venueRoyalty = await this.getVenueRoyalty(listing.venueId);
    const artistRoyalty = await this.getArtistRoyalty(listing.eventId);
    
    const venueShare = Math.round(saleAmount * venueRoyalty);
    const artistShare = Math.round(saleAmount * artistRoyalty);
    const sellerShare = saleAmount - venueShare - artistShare - platformFee;
    
    return { venueShare, artistShare, sellerShare, platformFee };
  }
}

// payment-service/src/services/marketplace/escrow.service.ts
// Holds funds until distribution

// payment-service/src/services/reconciliation/royalty-reconciliation.service.ts
class RoyaltyReconciliationService {
  async reconcile(period: DateRange) {
    // Verify all royalties distributed correctly
    // Flag discrepancies
    // Generate reconciliation report
  }
}
```

**Feature Flag Required:**
```typescript
// Feature flag: ENABLE_VENUE_ROYALTY_SPLIT
// Must be enabled for royalties to flow
```

**What's Broken - Blocked by Secondary Purchase:**
- Secondary purchase flow is STUB (see SECONDARY_PURCHASE_FLOW_AUDIT.md)
- Royalties calculated but never distributed
- Escrow service works but rarely triggered
- Artist royalties incomplete (no onboarding)

**Expected Flow:**
```
Secondary Sale: $150
├── Original Price: $100
├── Seller Premium: $50
│
├── Venue Royalty (10%): $15 → Venue Balance
├── Artist Royalty (5%): $7.50 → Artist Balance
├── Platform Fee (5%): $7.50 → Platform
└── Seller Net: $120 → Seller Balance (via escrow)
```

**Key Files:**
- `payment-service/src/services/marketplace/royalty-splitter.service.ts` ✅
- `payment-service/src/services/marketplace/escrow.service.ts` ✅
- `payment-service/src/services/reconciliation/royalty-reconciliation.service.ts` ✅
- All blocked by broken secondary purchase flow

---

### 16. SELLER_PAYOUT_VIEW_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists:**
```typescript
// marketplace-service/src/routes/seller.routes.ts
router.get('/sellers/:sellerId/payouts', authenticate, async (req, res) => {
  const sellerId = req.params.sellerId;
  
  // TODO: Implement seller payout history
  return res.json([]);  // Empty array
});
```

**What's Missing:**
- ❌ No seller balance tracking
- ❌ No payout history query
- ❌ No pending/completed/failed status
- ❌ No payout breakdown (by sale)
- ❌ No earnings analytics

**Expected Implementation:**
```typescript
// Seller balance
GET /sellers/me/balance
{
  availableBalance: 50000,
  pendingBalance: 25000,  // In escrow
  lifetimeEarnings: 150000
}

// Payout history
GET /sellers/me/payouts
[
  {
    id: 'payout_1',
    amount: 25000,
    status: 'completed',
    method: 'bank_transfer',
    completedAt: '2025-01-01'
  }
]

// Earnings breakdown
GET /sellers/me/earnings
[
  {
    saleId: 'sale_1',
    grossAmount: 15000,
    platformFee: 750,
    royalties: 1500,
    netAmount: 12750,
    status: 'released',
    saleDate: '2024-12-28'
  }
]
```

**Key Files:**
- `marketplace-service/src/routes/seller.routes.ts` ❌ Returns empty

---

### 17. STRIPE_CONNECT_DISCONNECT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works - Onboarding:**
```typescript
// venue-service/src/services/stripe-connect.service.ts
class StripeConnectService {
  async createConnectedAccount(venueId: string) {
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    
    await db('venues').update({
      stripe_account_id: account.id,
      stripe_account_status: 'pending'
    });
    
    return account;
  }
  
  async createOnboardingLink(venueId: string) {
    const venue = await this.getVenue(venueId);
    
    const accountLink = await stripe.accountLinks.create({
      account: venue.stripeAccountId,
      refresh_url: `${baseUrl}/venues/${venueId}/stripe/refresh`,
      return_url: `${baseUrl}/venues/${venueId}/stripe/complete`,
      type: 'account_onboarding',
    });
    
    return accountLink.url;
  }
}
```

**What's Missing - Disconnect:**
```typescript
// No disconnect endpoint exists
// Expected:
POST /venues/:venueId/stripe/disconnect
async disconnectStripeAccount(venueId: string) {
  // 1. Check for pending payouts
  // 2. Process final payout
  // 3. Revoke OAuth connection
  await stripe.oauth.deauthorize({
    client_id: process.env.STRIPE_CLIENT_ID,
    stripe_user_id: venue.stripeAccountId
  });
  // 4. Update venue record
  // 5. Notify venue owner
}

// No webhook handler for account.application.deauthorized
// If venue disconnects from Stripe dashboard, we don't know
```

**Impact:**
- Venues can connect Stripe ✓
- Venues cannot disconnect from platform ✗
- If venue disconnects via Stripe, platform unaware ✗
- Payouts fail silently ✗

**Key Files:**
- `venue-service/src/services/stripe-connect.service.ts` ⚠️ Connect only
- `payment-service/src/webhooks/stripe-handler.ts` ❌ No deauth handler

---

### 18. TAX_1099_REPORTING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
```typescript
// payment-service/src/services/tax/form-1099-da.service.ts
class Form1099DAService {
  // 1099-DA for digital asset (NFT) transactions
  
  async generateForm(userId: string, taxYear: number): Promise<Form1099DA> {
    const transactions = await this.getQualifyingTransactions(userId, taxYear);
    
    // Sum all sales proceeds
    const totalProceeds = transactions.reduce((sum, t) => sum + t.salePrice, 0);
    
    // Calculate cost basis (original purchase price)
    const totalCostBasis = transactions.reduce((sum, t) => sum + t.purchasePrice, 0);
    
    // Calculate gains/losses
    const totalGain = totalProceeds - totalCostBasis;
    
    return {
      recipientTin: user.taxId,
      recipientName: user.legalName,
      recipientAddress: user.address,
      
      // Box 1a: Description
      assetDescription: 'NFT Event Tickets',
      
      // Box 1b: Date acquired (various)
      // Box 1c: Date sold (various)
      
      // Box 1d: Proceeds
      grossProceeds: totalProceeds,
      
      // Box 1e: Cost basis
      costBasis: totalCostBasis,
      
      // Box 1f: Gain/loss
      gainOrLoss: totalGain,
      
      transactions: transactions.map(t => ({
        transactionId: t.id,
        assetId: t.ticketId,
        dateAcquired: t.purchaseDate,
        dateSold: t.saleDate,
        proceeds: t.salePrice,
        costBasis: t.purchasePrice,
        gain: t.salePrice - t.purchasePrice
      }))
    };
  }
  
  async shouldGenerate(userId: string, taxYear: number): Promise<boolean> {
    const totalProceeds = await this.getTotalProceeds(userId, taxYear);
    return totalProceeds >= 60000;  // $600 threshold
  }
}
```

**What's Missing:**
- ❌ PDF generation is placeholder
- ❌ No IRS e-filing integration
- ❌ No 1099-K for venues (payment processor reporting)

**Key Files:**
- `payment-service/src/services/tax/form-1099-da.service.ts`

---

### 19. TAX_CALCULATION_REPORTING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works - TaxJar Integration:**
```typescript
// payment-service/src/services/core/tax-calculator.service.ts
class TaxCalculatorService {
  private taxjar = new Taxjar({ apiKey: process.env.TAXJAR_API_KEY });
  
  async calculateTax(order: Order, address: Address): Promise<TaxResult> {
    try {
      const result = await this.taxjar.taxForOrder({
        from_country: 'US',
        from_zip: venue.postalCode,
        from_state: venue.state,
        to_country: address.country,
        to_zip: address.postalCode,
        to_state: address.state,
        amount: order.subtotalCents / 100,
        shipping: 0,
        line_items: order.items.map(i => ({
          id: i.id,
          quantity: i.quantity,
          unit_price: i.priceInCents / 100,
          product_tax_code: '90100'  // Entertainment
        }))
      });
      
      return {
        taxableAmount: result.taxable_amount,
        taxAmount: Math.round(result.amount_to_collect * 100),
        rate: result.rate,
        jurisdiction: result.jurisdictions
      };
    } catch (error) {
      // Fallback to state-specific rates
      return this.calculateFallbackTax(order, address);
    }
  }
  
  private fallbackRates = {
    CA: 0.0725,
    NY: 0.08,
    TX: 0.0625,
    // ... other states
  };
}
```

**What's Broken - Order Service Tax Endpoints:**
```typescript
// order-service/src/controllers/tax.controller.ts
// ALL 15+ endpoints return 501 Not Implemented:

async getJurisdictions(req, res) {
  return res.status(501).json({ error: 'Not implemented' });
}

async getRates(req, res) {
  return res.status(501).json({ error: 'Not implemented' });
}

async getCategories(req, res) {
  return res.status(501).json({ error: 'Not implemented' });
}

async createExemption(req, res) {
  return res.status(501).json({ error: 'Not implemented' });
}

async generateReport(req, res) {
  return res.status(501).json({ error: 'Not implemented' });
}

// Plus 10 more endpoints all returning 501
```

**Summary:**
- payment-service: TaxJar works ✓
- order-service: All tax endpoints return 501 ✗

**Key Files:**
- `payment-service/src/services/core/tax-calculator.service.ts` ✅
- `order-service/src/controllers/tax.controller.ts` ❌ All 501

---

### 20. VENUE_PAYOUT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P0** |

**THE CRITICAL BUG:**
```
Fan pays $100 for ticket
├── Stripe processes payment ✓
├── Webhook fires (payment_intent.succeeded) ✓
├── Order status updated ✓
├── Ticket created ✓
└── Venue balance credited: ✗ NEVER HAPPENS
```

**What Actually Happens:**
```typescript
// payment-service/src/webhooks/stripe-handler.ts
case 'payment_intent.succeeded':
  // Updates payment record
  await db('payments').update({ status: 'completed' });
  
  // Publishes event
  await messageQueue.publish('payment.completed', data);
  
  // MISSING: Credit venue balance
  // await venueBalanceService.credit(venueId, venueShare);
```

**Only Resale Royalties Work:**
```typescript
// payment-service/src/services/marketplace/escrow.service.ts
// This DOES credit venue balance on secondary sales
async releaseEscrow(escrowId) {
  // ... releases funds and credits venue
  await this.venueBalanceService.credit(venueId, royaltyAmount);
}
```

**Impact:**
- Primary sales: Venue never credited
- Secondary sales: Venue gets royalty only
- Money accumulates in platform Stripe
- Venues cannot withdraw earnings from primary sales

**Fix Required:**
```typescript
// In stripe-handler.ts, payment_intent.succeeded:
case 'payment_intent.succeeded':
  const payment = event.data.object;
  const order = await this.getOrderByPaymentIntent(payment.id);
  
  // Calculate venue share
  const feeBreakdown = this.feeCalculator.calculate(order.subtotal);
  const venueShare = order.subtotal - feeBreakdown.platformFee;
  
  // CRITICAL: Credit venue balance
  await this.venueBalanceService.credit(order.venueId, venueShare);
  
  // ... rest of handler
```

**Key Files:**
- `payment-service/src/webhooks/stripe-handler.ts` ❌ Missing venue credit
- `payment-service/src/services/core/venue-balance.service.ts` ✅ Works if called
- `payment-service/src/services/marketplace/escrow.service.ts` ✅ Works for secondary

---

### 21. FRAUD_DETECTION_DASHBOARD_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
```typescript
// payment-service/src/services/fraud/fraud-detection.service.ts
class FraudDetectionService {
  async analyzeTransaction(transaction: Transaction): Promise<FraudScore> {
    const signals = await this.gatherSignals(transaction);
    const score = await this.mlModel.predict(signals);
    
    return {
      score: score,                    // 0-100
      riskLevel: this.getRiskLevel(score),
      signals: signals,
      recommendation: this.getRecommendation(score)
    };
  }
  
  private async gatherSignals(t: Transaction): Promise<FraudSignals> {
    return {
      // Velocity
      transactionsLast24h: await this.countRecent(t.userId, 24),
      uniqueCardsLast7d: await this.countCards(t.userId, 7),
      
      // User
      accountAgeDays: await this.getAccountAge(t.userId),
      isEmailVerified: await this.checkEmailVerified(t.userId),
      previousChargebacks: await this.countChargebacks(t.userId),
      
      // Device/IP
      isVpn: await this.checkVpn(t.ipAddress),
      ipCountryMatchesBilling: await this.checkIpCountry(t),
      isKnownDevice: await this.checkDevice(t.deviceFingerprint),
      
      // Behavioral
      timeOnPage: t.metadata.timeOnPage,
      mouseMovements: t.metadata.mouseMovements > 100,
      copiedCardNumber: t.metadata.cardPasted
    };
  }
}
```

**Dashboard Endpoints:**
```typescript
// Full analyst dashboard
GET /admin/fraud/queue           // Cases pending review
GET /admin/fraud/stats           // Fraud stats
GET /admin/fraud/trends          // Trend analysis
GET /admin/fraud/:caseId         // Case details
POST /admin/fraud/:caseId/review // Submit review
POST /admin/fraud/rules          // Custom rules
```

**Custom Rule Engine:**
```typescript
interface FraudRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  action: 'block' | 'review' | 'flag' | 'allow';
  priority: number;
  isActive: boolean;
}

// Example rule: Block VPN + new account + high amount
{
  name: 'Suspicious new account',
  conditions: [
    { field: 'isVpn', operator: 'eq', value: true },
    { field: 'accountAgeDays', operator: 'lt', value: 7 },
    { field: 'amount', operator: 'gt', value: 50000 }
  ],
  action: 'block'
}
```

**IP Reputation Tracking:**
```typescript
class IpReputationService {
  async checkIp(ip: string): Promise<IpReputation> {
    // Check internal blacklist
    const blacklisted = await this.isBlacklisted(ip);
    
    // Check external services
    const externalScore = await this.checkExternalServices(ip);
    
    // Check recent fraud from this IP
    const recentFraud = await this.getRecentFraudCount(ip);
    
    return {
      ip,
      reputationScore: this.calculateScore(blacklisted, externalScore, recentFraud),
      isProxy: externalScore.isProxy,
      isVpn: externalScore.isVpn,
      country: externalScore.country
    };
  }
}
```

**Key Files:**
- `payment-service/src/services/fraud/fraud-detection.service.ts`
- `payment-service/src/services/fraud/ml-fraud-model.service.ts`
- `payment-service/src/services/fraud/ip-reputation.service.ts`
- `payment-service/src/routes/admin/fraud.routes.ts`

---

## STATISTICS

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Complete | 6 | 29% |
| ⚠️ Partial | 12 | 57% |
| ❌ Not Implemented | 3 | 14% |

---

## CROSS-CUTTING CONCERNS

### Money Flow
```
Primary Sale:
Customer → Stripe → Platform Account
                         ↓
              (SHOULD) → Venue Balance → Payout
              (ACTUAL) → Stuck in platform

Secondary Sale:
Buyer → Stripe → Escrow
                    ↓
         Release → Platform Fee
                 → Venue Royalty ✓
                 → Artist Royalty (incomplete)
                 → Seller Balance
```

### Service Dependencies
```
Order Creation:
order-service → payment-service → Stripe → webhooks → venue-balance

Refund:
order-service → payment-service → Stripe (works)
order-service → ticket-service (404, broken)

Payout:
venue-service → payment-service → Stripe Connect (not implemented)
```

### Critical Path
1. Customer pays → Payment processed ✓
2. Venue credited → **BROKEN**
3. Payout scheduled → Works but no real transfer
4. Money arrives in venue bank → **NEVER**

---

## RECOMMENDED FIX ORDER

1. **P0: Credit venues for primary sales**
   - Add venue balance credit to payment webhook
   - Most critical - venues not getting paid
   - Effort: 0.5 days

2. **P0: Route order history through gateway**
   - Fix auth middleware in order-service OR
   - Route to ticket-service which has working auth
   - Effort: 1 day

3. **P0: Fix ticket cancellation on refund**
   - Add POST /internal/tickets/release to ticket-service
   - Or expose existing refund logic
   - Effort: 1 day

4. **P1: Implement Stripe chargeback handlers**
   - Add charge.dispute.* webhook handlers
   - Wire ChargebackReserveService
   - Effort: 2 days

5. **P1: Implement real Stripe transfers for payouts**
   - Replace TODO with stripe.transfers.create
   - Add transfer.paid webhook handler
   - Effort: 1 day

6. **P1: Schedule failed payment retry job**
   - Add cron.schedule call in index.ts
   - Effort: 0.25 days

7. **P2: Implement tax endpoints in order-service**
   - Wire controllers to TaxJar service
   - Or deprecate in favor of payment-service
   - Effort: 2-3 days

8. **P3: Add payment method management**
   - Stripe Customer creation
   - PaymentMethod attachment
   - Effort: 2-3 days

9. **P3: Add invoice generation**
   - Invoice model
   - PDF generation
   - Effort: 3-4 days
