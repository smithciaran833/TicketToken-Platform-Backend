# Refund Handling in Ticketing Platforms
## Production Audit Guide for TicketToken

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Ensure accurate, secure, and compliant refund processing for ticket purchases, event cancellations, and marketplace transactions

---

## Table of Contents
1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Patterns](#4-implementation-patterns)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Refund Policies and Timing

A clear, enforceable refund policy is essential for customer trust and operational efficiency.

**Source:** https://loopyah.com/blog/planning/event-refund-policy

#### Industry-Standard Refund Scenarios

| Scenario | Standard Practice | Refund Type |
|----------|-------------------|-------------|
| **Event Cancellation** | Automatic full refund | Full |
| **Event Postponement** | Tickets valid for new date; optional refund window | Full (if requested) |
| **Material Changes** | Headliner cancels, venue changes | Full or Partial |
| **Attendee Illness/Emergency** | Case-by-case with documentation | Credit or Partial |
| **Buyer's Remorse** | Brief window (24-48 hours) or no refund | Varies |
| **No-Show** | No refund | None |

> "A good policy isn't one line that says 'No refunds. Ever.' It clearly explains what happens in different situations."

**Source:** https://loopyah.com/blog/planning/event-refund-policy

#### Refund Policy Best Practices

1. **Make it visible**: Display policy at checkout, in confirmation emails, and on tickets
2. **Define clear timelines**: Specify request deadlines and processing times
3. **Cover all scenarios**: Cancellation, postponement, material changes, emergencies
4. **Automate where possible**: Automatic refunds for cancellations reduce support burden
5. **Communicate proactively**: Notify customers immediately when events are affected

> "Best practice: make full refunds for cancellations automatic. Don't force attendees to chase you. Announce the cancellation and tell them when to expect their money back."

**Source:** https://loopyah.com/blog/planning/event-refund-policy

#### Refund Processing Timelines

| Stage | Typical Duration |
|-------|------------------|
| Refund initiation to Stripe submission | Immediate |
| Stripe to customer's bank | 5-10 business days |
| Bank statement visibility | Up to 30 days total |
| ACH Direct Debit refunds | Must be within 180 days |

> "Refunds are submitted to your customer's bank immediately. Depending on the bank's processing time, it can take anywhere from 5-10 business days to show up on your customer's bank account."

**Source:** https://support.stripe.com/embedded-connect/questions/customer-refund-processing-time

### 1.2 Partial vs Full Refunds

Different refund scenarios require different approaches.

**Source:** https://docs.stripe.com/api/refunds

#### Stripe Partial Refund Capabilities

> "You can optionally refund only part of a charge. You can do so multiple times, until the entire charge has been refunded. Once entirely refunded, a charge can't be refunded again. This method will raise an error when called on an already-refunded charge, or when trying to refund more money than is left on a charge."

**Source:** https://docs.stripe.com/api/refunds

#### When to Use Each Refund Type

| Refund Type | Use Cases |
|-------------|-----------|
| **Full Refund** | Event cancellation, duplicate purchase, fraud |
| **Partial Refund** | Service fee retention, multi-item order partial return, goodwill gesture |
| **Credit/Voucher** | Postponed events, customer preference, retention strategy |

#### Partial Refund Considerations

```javascript
// Example: Refund ticket price but retain service fee
const ticketPrice = 100.00;
const serviceFee = 15.00;
const totalCharge = 115.00;

// Partial refund of ticket price only
const refund = await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  amount: ticketPrice * 100, // $100.00 in cents
  reason: 'requested_by_customer',
  metadata: {
    refund_type: 'ticket_only',
    service_fee_retained: serviceFee
  }
});
```

### 1.3 Stripe Refund Handling

Stripe provides robust refund APIs with built-in protections.

**Source:** https://docs.stripe.com/refunds

#### Stripe Refund API Overview

```javascript
// Create a full refund
const refund = await stripe.refunds.create({
  payment_intent: 'pi_xxx'
});

// Create a partial refund
const partialRefund = await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  amount: 5000, // $50.00 in cents
  reason: 'requested_by_customer' // or 'duplicate', 'fraudulent'
});

// Refund with metadata
const refundWithMeta = await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  metadata: {
    ticket_id: 'tkt_123',
    event_id: 'evt_456',
    reason_detail: 'Event cancelled by organizer'
  }
});
```

#### Stripe Refund Statuses

| Status | Description |
|--------|-------------|
| `pending` | Refund submitted, awaiting processing |
| `requires_action` | Customer action needed (bank info collection) |
| `succeeded` | Refund completed successfully |
| `failed` | Refund failed (see failure reason) |
| `canceled` | Refund was canceled |

**Source:** https://docs.stripe.com/api/refunds/object

#### Stripe Refund Protections

> "Stripe will raise an error when called on an already-refunded charge, or when trying to refund more money than is left on a charge."

**Source:** https://docs.stripe.com/api/refunds

Key protections:
- Cannot refund more than original charge amount
- Cannot refund already fully-refunded charges
- Tracks remaining refundable amount automatically
- Disputes/chargebacks not possible on fully refunded charges

#### Refund Time Limits

> "You can issue a refund at any time up to 90 days after the charge. After 90 days, it becomes more likely that certain circumstances may cause a refund to fail - for example if the client's card has expired."

**Source:** https://help.vsee.com/kb/articles/stripe-issue-a-refund

For ACH Direct Debit:
> "Refunds for ACH Direct Debit payments must be initiated within 180 days."

**Source:** https://support.stripe.com/questions/refunds-for-ach-direct-debit-payments

### 1.4 Event Cancellation Refunds

Event cancellations require systematic, often automated, refund processing.

**Source:** https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled

#### Industry Standards

**Ticketmaster's approach:**
> "If an event is canceled, no action is required to obtain a refund. It will be processed to the original method of payment used at time of purchase as soon as funds are received from the Event Organizer."

**Source:** https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled

#### Event Status Handling Matrix

| Event Status | Ticket Validity | Refund Approach |
|--------------|-----------------|-----------------|
| **Canceled** | Invalid | Automatic full refund |
| **Postponed** | Valid for TBD date | Hold; offer optional refund window |
| **Rescheduled** | Valid for new date | Hold; offer refund window (7-30 days) |
| **Venue Changed** | Valid for new venue | Offer refund if significant change |
| **Lineup Changed** | Valid | Offer refund if headliner affected |

#### Cancellation Refund Flow

```javascript
async function processEventCancellation(eventId) {
  // 1. Mark event as cancelled
  await db('events')
    .where({ id: eventId })
    .update({ status: 'cancelled', cancelled_at: new Date() });
  
  // 2. Stop further ticket sales
  await db('tickets')
    .where({ event_id: eventId, status: 'available' })
    .update({ status: 'cancelled' });
  
  // 3. Get all sold tickets needing refund
  const soldTickets = await db('tickets')
    .where({ event_id: eventId, status: 'sold' })
    .select('*');
  
  // 4. Queue refunds for each order
  const orders = groupTicketsByOrder(soldTickets);
  
  for (const order of orders) {
    await refundQueue.add('process_cancellation_refund', {
      orderId: order.id,
      eventId: eventId,
      reason: 'event_cancelled',
      automatic: true
    });
  }
  
  // 5. Notify customers
  await notificationService.sendBulkEmail({
    templateId: 'event_cancelled_refund',
    recipients: orders.map(o => o.customer_email),
    data: { eventName: event.name, refundTimeline: '5-10 business days' }
  });
  
  return { ordersQueued: orders.length };
}
```

### 1.5 Chargeback Handling

Chargebacks (disputes) are costly and can threaten your payment processing ability.

**Source:** https://docs.stripe.com/disputes

#### Understanding Chargebacks

> "A dispute (also known as a chargeback) occurs when a cardholder questions your payment with their card issuer. To process a chargeback, the issuer creates a formal dispute on the card network, which immediately reverses the payment. This pulls the money for the payment—as well as one or more network dispute fees—from Stripe."

**Source:** https://docs.stripe.com/disputes

#### Chargeback Costs

| Cost Component | Amount |
|----------------|--------|
| Disputed amount | Full charge amount |
| Stripe dispute fee | $15-25 (varies by region) |
| Visa compliance dispute fee | $500 (if escalated) |
| Win rate | ~20-30% industry average |

#### Chargeback Prevention Strategies

> "Clear and frequent contact with your customers can help prevent many of the reasons for disputes. By responding to issues and processing refunds or replacement orders quickly, your customers are far less likely to take the time to dispute a payment."

**Source:** https://docs.stripe.com/disputes/prevention/best-practices

**Key prevention tactics:**

1. **Proactive refunds**: Refund before customer disputes
2. **Clear billing descriptors**: Use recognizable business name
3. **Email receipts**: Send detailed purchase confirmations
4. **Easy contact**: Make customer service accessible
5. **Fraud detection**: Use Stripe Radar or similar tools

#### When to Refund vs Fight

| Scenario | Recommended Action |
|----------|-------------------|
| Legitimate customer complaint | Refund proactively |
| Clear fraud (stolen card) | Fight with evidence |
| "Friendly fraud" (buyer's remorse) | Fight with delivery proof |
| Unrecognized transaction | Respond to inquiry stage |
| High dispute rate risk | Refund aggressively |

> "If any of the conditions described under the Best practices for preventing fraud apply to your situation, it makes sense to more aggressively refund."

**Source:** https://docs.stripe.com/disputes/how-disputes-work

#### Chargeback Response Workflow

```javascript
// Webhook handler for dispute events
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    
    await handleDisputeCreated({
      disputeId: dispute.id,
      chargeId: dispute.charge,
      amount: dispute.amount,
      reason: dispute.reason,
      evidenceDueBy: dispute.evidence_details.due_by
    });
  }
  
  res.json({ received: true });
});

async function handleDisputeCreated(dispute) {
  // 1. Log dispute
  await db('disputes').insert({
    stripe_dispute_id: dispute.disputeId,
    charge_id: dispute.chargeId,
    amount: dispute.amount,
    reason: dispute.reason,
    evidence_due_by: new Date(dispute.evidenceDueBy * 1000),
    status: 'needs_response'
  });
  
  // 2. Alert team
  await alertOpsTeam('Chargeback Received', dispute);
  
  // 3. Gather evidence automatically
  const order = await getOrderByChargeId(dispute.chargeId);
  const evidence = await gatherDisputeEvidence(order);
  
  // 4. Queue for review or auto-submit
  if (evidence.autoSubmit) {
    await submitDisputeEvidence(dispute.disputeId, evidence);
  }
}
```

### 1.6 Refund for Resold Tickets

Secondary market transactions add complexity to refund handling.

**Source:** https://www.natb.org/ticket-bill-of-rights/

#### Resale Refund Standards

The National Association of Ticket Brokers (NATB) standards:

> "Your ticket purchase should be guaranteed unless notified to the contrary during your order. If purchased tickets are not delivered as promised, or in some way are not accepted, you are entitled to a refund."

**Source:** https://www.natb.org/ticket-bill-of-rights/

> "NATB Members offer a refund of up to 200% of the contracted price for each guaranteed ticket not delivered as specified."

**Source:** https://www.natb.org/ticket-bill-of-rights/

#### Resale Refund Scenarios

| Scenario | Buyer Refund | Seller Impact |
|----------|--------------|---------------|
| **Event Cancelled** | Full refund from platform | Platform recovers from seller |
| **Invalid Ticket** | Full refund + compensation | Seller penalized, funds clawed back |
| **Non-Delivery** | Full refund | Seller penalized |
| **Seller Cancels** | Full refund | Seller may face fees/suspension |
| **Buyer Cancels** | Per platform policy | Seller may receive cancellation fee |

#### Resale Platform Refund Flow

> "The secondary isn't going to refund until the primary is refunded."

**Source:** https://www.wcpo.com/money/consumer/dont-waste-your-money/buying-from-a-third-party-concert-ticket-seller-refunds-can-be-tricky

```javascript
async function handleResaleEventCancellation(eventId) {
  // 1. Get all resale transactions for this event
  const resaleOrders = await db('resale_orders')
    .where({ event_id: eventId, status: 'completed' })
    .select('*');
  
  for (const order of resaleOrders) {
    // 2. Refund buyer
    await processResaleBuyerRefund(order);
    
    // 3. Determine seller refund (they paid for original ticket)
    // This depends on whether original ticket is refunded
    await queueSellerRefundCheck(order);
    
    // 4. Handle platform fees
    // Typically refunded on cancellation
    await refundPlatformFees(order);
  }
}

async function processResaleBuyerRefund(order) {
  const refund = await stripe.refunds.create({
    payment_intent: order.buyer_payment_intent,
    metadata: {
      refund_type: 'resale_event_cancelled',
      original_order_id: order.id,
      seller_id: order.seller_id
    }
  });
  
  await db('resale_orders')
    .where({ id: order.id })
    .update({ 
      buyer_refund_id: refund.id,
      buyer_refund_status: 'processed',
      buyer_refunded_at: new Date()
    });
}
```

### 1.7 Multi-Party Payment Refunds (Stripe Connect)

Ticketing platforms using Stripe Connect must handle refunds across multiple parties.

**Source:** https://docs.stripe.com/connect/destination-charges

#### Connect Refund Behavior

For **destination charges**:

> "When refunding a charge with transfer_data[destination], by default the destination account keeps the funds that were transferred to it, leaving the platform account to cover the negative balance from the refund. To pull back the funds from the connected account, set the reverse_transfer parameter to true."

**Source:** https://docs.stripe.com/connect/destination-charges

For **application fees**:

> "By default, the entire charge is refunded, but you can create a partial refund by setting an amount value. If the refund results in the entire charge being refunded, the entire application fee is refunded as well. Otherwise, a proportional amount of the application fee is refunded."

**Source:** https://docs.stripe.com/connect/destination-charges

#### Connect Refund Parameters

```javascript
// Full refund with transfer reversal and application fee refund
const refund = await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  reverse_transfer: true,           // Pull funds from connected account
  refund_application_fee: true      // Return platform fee to connected account
});

// Partial refund with proportional splits
const partialRefund = await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  amount: 5000,                     // $50.00
  reverse_transfer: true,           // Proportionally reverse transfer
  refund_application_fee: true      // Proportionally refund app fee
});
```

#### Multi-Party Refund Considerations

| Component | Default Behavior | Override |
|-----------|------------------|----------|
| Customer refund | Full amount returned | Specify `amount` for partial |
| Transfer to seller | Kept by seller | Set `reverse_transfer: true` |
| Application fee | Kept by platform | Set `refund_application_fee: true` |
| Stripe fees | Not refunded | Cannot override |

> "Refunding a charge doesn't affect any associated transfers. It's your platform's responsibility to reconcile any amount owed back by reducing subsequent transfer amounts or by reversing transfers."

**Source:** https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes

#### Royalty Handling on Refund

For NFT tickets with creator royalties:

```javascript
async function processRefundWithRoyalties(orderId) {
  const order = await getOrderWithRoyalties(orderId);
  
  // Calculate who gets what back
  const refundBreakdown = {
    customerRefund: order.total_amount,
    sellerReversal: order.seller_amount,
    platformFeeRefund: order.platform_fee,
    royaltyReversal: order.royalty_amount,
    creatorRoyaltyRefund: order.creator_royalty
  };
  
  // 1. Refund customer (full amount)
  const refund = await stripe.refunds.create({
    payment_intent: order.payment_intent_id,
    reverse_transfer: true,
    refund_application_fee: true
  });
  
  // 2. Handle royalty reversal separately if needed
  if (order.royalty_transfer_id) {
    await stripe.transfers.createReversal(order.royalty_transfer_id, {
      amount: order.royalty_amount
    });
  }
  
  // 3. Update internal records
  await db('orders').where({ id: orderId }).update({
    status: 'refunded',
    refund_id: refund.id,
    royalties_reversed: true,
    refunded_at: new Date()
  });
  
  // 4. Log for audit trail
  await db('refund_audit_log').insert({
    order_id: orderId,
    refund_breakdown: JSON.stringify(refundBreakdown),
    stripe_refund_id: refund.id
  });
}
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Double Refunds

The most critical vulnerability in refund processing.

**Source:** https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb

#### How Double Refunds Occur

1. **Race condition**: Two refund requests processed simultaneously
2. **Retry storms**: Failed request retried, but original succeeded
3. **UI double-click**: User clicks refund button multiple times
4. **System integration**: Both automated and manual refund triggered
5. **Webhook replay**: Duplicate webhook events processed

> "Multiple identical requests can be fired due to multiple user-clicks or if the client has an aggressive retry policy. This could potentially create race conditions on the server or double payments for our community."

**Source:** https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb

#### Prevention: Idempotency Keys

> "Idempotency in payment processing ensures that duplicate requests for the same transaction do not result in multiple charges, authorizations, or refunds. By using an idempotent string, merchants can prevent unintended duplicate transactions."

**Source:** https://developers.tap.company/docs/idempotency

```javascript
class RefundService {
  async processRefund(orderId, amount, requestId) {
    // Generate deterministic idempotency key
    const idempotencyKey = `refund:${orderId}:${amount}:${requestId}`;
    
    // Check if already processed
    const existing = await this.getExistingRefund(idempotencyKey);
    if (existing) {
      console.log(`Duplicate refund request detected: ${idempotencyKey}`);
      return existing; // Return existing result, don't process again
    }
    
    // Acquire lock to prevent concurrent processing
    const lock = await this.acquireLock(idempotencyKey);
    if (!lock) {
      throw new Error('Refund already in progress');
    }
    
    try {
      // Double-check after acquiring lock
      const existingAfterLock = await this.getExistingRefund(idempotencyKey);
      if (existingAfterLock) {
        return existingAfterLock;
      }
      
      // Process the refund
      const refund = await stripe.refunds.create({
        payment_intent: order.payment_intent_id,
        amount: amount,
        idempotency_key: idempotencyKey // Stripe's idempotency
      });
      
      // Store result
      await this.storeRefundResult(idempotencyKey, refund);
      
      return refund;
    } finally {
      await this.releaseLock(idempotencyKey);
    }
  }
}
```

#### Database-Level Protection

```sql
-- Unique constraint on refund records
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    payment_intent_id VARCHAR(255) NOT NULL,
    stripe_refund_id VARCHAR(255) UNIQUE,
    amount INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Prevent multiple pending/successful refunds for same order
    CONSTRAINT unique_successful_refund 
        UNIQUE (order_id, status) 
        WHERE status IN ('pending', 'succeeded')
);

-- Index for idempotency lookups
CREATE INDEX idx_refunds_idempotency ON refunds(idempotency_key);
```

### 2.2 Refund Exceeds Original Payment

Attempting to refund more than was charged.

**Source:** https://docs.stripe.com/api/refunds

#### Stripe's Built-in Protection

> "Can refund only up to the remaining, unrefunded amount of the charge."

**Source:** https://docs.stripe.com/api/refunds

#### Additional Application-Level Validation

```javascript
async function validateRefundAmount(orderId, requestedAmount) {
  const order = await db('orders')
    .where({ id: orderId })
    .first();
  
  if (!order) {
    throw new RefundValidationError('Order not found');
  }
  
  // Get total already refunded
  const refundedTotal = await db('refunds')
    .where({ order_id: orderId, status: 'succeeded' })
    .sum('amount as total')
    .first();
  
  const alreadyRefunded = refundedTotal?.total || 0;
  const maxRefundable = order.total_amount - alreadyRefunded;
  
  if (requestedAmount > maxRefundable) {
    throw new RefundValidationError(
      `Requested refund ($${requestedAmount / 100}) exceeds ` +
      `maximum refundable amount ($${maxRefundable / 100}). ` +
      `Original: $${order.total_amount / 100}, Already refunded: $${alreadyRefunded / 100}`
    );
  }
  
  return {
    valid: true,
    originalAmount: order.total_amount,
    alreadyRefunded: alreadyRefunded,
    maxRefundable: maxRefundable,
    requestedAmount: requestedAmount
  };
}
```

#### Common Causes

| Cause | Example | Prevention |
|-------|---------|------------|
| Currency confusion | Refunding $100 instead of 100 cents | Consistent currency handling |
| Multiple partial refunds | Not tracking cumulative total | Database tracking + validation |
| Manual + automatic | Both customer service and system refund | Idempotency + state machine |
| Exchange rate issues | Refunding in different currency | Lock refund to original currency |

### 2.3 No Validation of Refund Eligibility

Processing refunds without checking business rules.

#### Eligibility Checks Required

```javascript
async function checkRefundEligibility(orderId, requesterId, reason) {
  const order = await getOrderWithDetails(orderId);
  const errors = [];
  
  // 1. Order exists and belongs to requester
  if (!order) {
    errors.push('Order not found');
    return { eligible: false, errors };
  }
  
  // 2. Order is in refundable state
  const refundableStatuses = ['completed', 'delivered'];
  if (!refundableStatuses.includes(order.status)) {
    errors.push(`Order status '${order.status}' is not eligible for refund`);
  }
  
  // 3. Within refund window
  const refundWindowDays = getRefundWindowForEvent(order.event);
  const daysSincePurchase = daysBetween(order.created_at, new Date());
  if (daysSincePurchase > refundWindowDays) {
    errors.push(`Refund window of ${refundWindowDays} days has expired`);
  }
  
  // 4. Event hasn't occurred (unless cancelled)
  if (order.event.status === 'completed' && reason !== 'event_issue') {
    errors.push('Cannot refund after event has occurred');
  }
  
  // 5. Not already refunded
  if (order.refund_status === 'fully_refunded') {
    errors.push('Order has already been fully refunded');
  }
  
  // 6. Ticket not transferred/resold
  if (order.tickets.some(t => t.current_owner_id !== order.user_id)) {
    errors.push('Cannot refund tickets that have been transferred');
  }
  
  // 7. Check for chargebacks
  if (order.has_dispute) {
    errors.push('Cannot refund order with active dispute');
  }
  
  // 8. Stripe payment intent is refundable
  const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
  if (paymentIntent.status !== 'succeeded') {
    errors.push('Payment is not in a refundable state');
  }
  
  return {
    eligible: errors.length === 0,
    errors: errors,
    order: order,
    maxRefundable: calculateMaxRefundable(order)
  };
}
```

#### Refund State Machine

```
┌─────────────┐
│   ORDERED   │
└──────┬──────┘
       │ payment succeeded
       ▼
┌─────────────┐     request refund    ┌──────────────────┐
│  COMPLETED  │ ───────────────────▶  │ REFUND_REQUESTED │
└──────┬──────┘                       └────────┬─────────┘
       │                                       │
       │ event occurs                          │ validate + process
       ▼                                       ▼
┌─────────────┐                       ┌──────────────────┐
│   ATTENDED  │                       │ REFUND_PROCESSING│
└─────────────┘                       └────────┬─────────┘
   (no refund)                                 │
                                               │ Stripe confirms
                                               ▼
                               ┌───────────────────────────┐
                               │  REFUNDED / PARTIAL_REFUND│
                               └───────────────────────────┘
```

### 2.4 Missing Refund for Multi-Party Payments

Forgetting to refund all parties in marketplace transactions.

**Source:** https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes

#### The Problem

When using Stripe Connect, a single customer payment involves multiple parties:
- **Customer**: Paid $100
- **Seller (Connected Account)**: Received $85
- **Platform**: Received $15 (application fee)
- **Stripe**: Kept ~$3 in processing fees

If you only refund the customer without reversing transfers:

> "Refunding a charge doesn't affect any associated transfers. It's your platform's responsibility to reconcile any amount owed back."

**Source:** https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes

#### Correct Multi-Party Refund

```javascript
async function processMultiPartyRefund(orderId, refundAmount) {
  const order = await getOrderWithPaymentDetails(orderId);
  
  // Calculate proportional amounts
  const proportion = refundAmount / order.total_amount;
  const sellerRefundAmount = Math.round(order.seller_amount * proportion);
  const platformFeeRefund = Math.round(order.platform_fee * proportion);
  
  // Validate connected account has sufficient balance
  const connectedAccount = await stripe.accounts.retrieve(order.seller_stripe_id);
  const balance = await stripe.balance.retrieve({
    stripeAccount: order.seller_stripe_id
  });
  
  if (balance.available[0].amount < sellerRefundAmount) {
    // Handle insufficient balance
    await handleInsufficientSellerBalance(order, sellerRefundAmount);
  }
  
  // Process refund with all reversals
  const refund = await stripe.refunds.create({
    payment_intent: order.payment_intent_id,
    amount: refundAmount,
    reverse_transfer: true,           // ← Critical: reverse seller transfer
    refund_application_fee: true,     // ← Critical: reverse platform fee
    metadata: {
      order_id: orderId,
      seller_reversal: sellerRefundAmount,
      platform_fee_reversal: platformFeeRefund
    }
  });
  
  // Record all components
  await db('refunds').insert({
    order_id: orderId,
    stripe_refund_id: refund.id,
    customer_refund_amount: refundAmount,
    seller_reversal_amount: sellerRefundAmount,
    platform_fee_reversal_amount: platformFeeRefund,
    status: 'succeeded'
  });
  
  return refund;
}
```

#### Verification Query

```sql
-- Find refunds where multi-party reversals may have been missed
SELECT 
  r.id AS refund_id,
  r.stripe_refund_id,
  r.customer_refund_amount,
  r.seller_reversal_amount,
  r.platform_fee_reversal_amount,
  o.total_amount,
  o.seller_amount,
  o.platform_fee,
  CASE 
    WHEN r.seller_reversal_amount IS NULL THEN 'MISSING_SELLER_REVERSAL'
    WHEN r.platform_fee_reversal_amount IS NULL THEN 'MISSING_FEE_REVERSAL'
    ELSE 'OK'
  END AS status
FROM refunds r
JOIN orders o ON r.order_id = o.id
WHERE o.is_marketplace_order = true
  AND (r.seller_reversal_amount IS NULL 
       OR r.platform_fee_reversal_amount IS NULL);
```

### 2.5 Chargebacks Not Handled

Ignoring or mishandling dispute events.

**Source:** https://docs.stripe.com/disputes

#### Common Mistakes

| Mistake | Consequence |
|---------|-------------|
| No webhook handler for disputes | Disputes go unnoticed |
| Missing evidence deadline | Automatic loss |
| Refunding after dispute filed | Double loss (refund + chargeback) |
| No internal tracking | Can't analyze patterns |
| Ignoring dispute rate | Account termination risk |

#### Required Webhook Handlers

```javascript
const disputeWebhooks = [
  'charge.dispute.created',      // New dispute filed
  'charge.dispute.updated',      // Status changed
  'charge.dispute.closed',       // Final resolution
  'charge.dispute.funds_withdrawn',   // Funds removed
  'charge.dispute.funds_reinstated'   // Won dispute, funds returned
];

app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  switch (event.type) {
    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object);
      break;
    case 'charge.dispute.updated':
      await handleDisputeUpdated(event.data.object);
      break;
    case 'charge.dispute.closed':
      await handleDisputeClosed(event.data.object);
      break;
  }
  
  res.json({ received: true });
});

async function handleDisputeCreated(dispute) {
  // 1. Create internal record
  await db('disputes').insert({
    stripe_dispute_id: dispute.id,
    charge_id: dispute.charge,
    amount: dispute.amount,
    reason: dispute.reason,
    status: dispute.status,
    evidence_due_by: new Date(dispute.evidence_details.due_by * 1000)
  });
  
  // 2. Link to order
  const order = await db('orders')
    .where({ stripe_charge_id: dispute.charge })
    .first();
  
  if (order) {
    await db('orders')
      .where({ id: order.id })
      .update({ has_dispute: true, dispute_id: dispute.id });
    
    // CRITICAL: Prevent refund while dispute is active
    await db('orders')
      .where({ id: order.id })
      .update({ refund_locked: true, refund_lock_reason: 'active_dispute' });
  }
  
  // 3. Alert team with deadline
  const daysUntilDue = Math.ceil(
    (dispute.evidence_details.due_by * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
  );
  
  await alertOpsTeam('URGENT: Chargeback Received', {
    disputeId: dispute.id,
    amount: dispute.amount / 100,
    reason: dispute.reason,
    daysToRespond: daysUntilDue,
    orderId: order?.id
  });
}
```

#### Dispute Rate Monitoring

> "Visa and MasterCard tolerate up to 0.65% dispute rate."

**Source:** https://byedispute.com/

```javascript
async function checkDisputeRate() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const stats = await db.raw(`
    SELECT 
      COUNT(*) FILTER (WHERE created_at >= $1) AS total_charges,
      COUNT(*) FILTER (WHERE created_at >= $1 AND has_dispute = true) AS disputed_charges
    FROM orders
    WHERE created_at >= $1
  `, [thirtyDaysAgo]);
  
  const disputeRate = stats.rows[0].disputed_charges / stats.rows[0].total_charges;
  
  if (disputeRate > 0.0065) { // 0.65%
    await alertOpsTeam('CRITICAL: Dispute Rate Exceeded', {
      currentRate: (disputeRate * 100).toFixed(2) + '%',
      threshold: '0.65%',
      totalCharges: stats.rows[0].total_charges,
      disputes: stats.rows[0].disputed_charges
    });
  }
  
  return {
    disputeRate: disputeRate,
    totalCharges: stats.rows[0].total_charges,
    disputes: stats.rows[0].disputed_charges,
    status: disputeRate > 0.0065 ? 'CRITICAL' : 
            disputeRate > 0.005 ? 'WARNING' : 'OK'
  };
}
```

---

## 3. Audit Checklist

### 3.1 Refund Scenarios Coverage

| Check | Status | Notes |
|-------|--------|-------|
| □ Full refund for event cancellation | | |
| □ Partial refund for service fee retention | | |
| □ Refund for postponed event (optional window) | | |
| □ Refund for rescheduled event (can't attend new date) | | |
| □ Refund for duplicate purchase | | |
| □ Refund for fraudulent transaction | | |
| □ Refund for invalid/counterfeit ticket (resale) | | |
| □ Refund for non-delivery (resale) | | |
| □ Refund after ticket transfer | | |
| □ Partial refund (one ticket of many) | | |
| □ Refund with promo code/discount applied | | |
| □ Refund crossing billing periods | | |

### 3.2 Double Refund Prevention

| Check | Status | Notes |
|-------|--------|-------|
| □ Idempotency keys used for all refund requests | | |
| □ Database unique constraint on refund records | | |
| □ State machine prevents invalid transitions | | |
| □ UI prevents double-click submission | | |
| □ Webhook handlers are idempotent | | |
| □ Distributed lock for concurrent requests | | |
| □ Stripe idempotency_key parameter used | | |
| □ Refund amount validation before processing | | |
| □ Total refunded tracked per order | | |
| □ Maximum refundable calculated correctly | | |

### 3.3 Refund Eligibility Validation

| Check | Status | Notes |
|-------|--------|-------|
| □ Order exists and is valid | | |
| □ Order status is refundable | | |
| □ Within refund time window | | |
| □ Event hasn't occurred (or is cancelled) | | |
| □ Not already fully refunded | | |
| □ Tickets not transferred to another user | | |
| □ No active dispute on order | | |
| □ Payment intent is in refundable state | | |
| □ Requester is authorized | | |
| □ Amount doesn't exceed maximum refundable | | |

### 3.4 Multi-Party Payment Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ `reverse_transfer: true` used for Connect refunds | | |
| □ `refund_application_fee: true` used when appropriate | | |
| □ Seller balance checked before reversal | | |
| □ Insufficient balance handling implemented | | |
| □ Royalty transfers reversed on refund | | |
| □ All parties' amounts tracked in database | | |
| □ Proportional refunds calculated correctly | | |
| □ Platform responsible for negative balance | | |

### 3.5 Royalty Handling on Refund

| Check | Status | Notes |
|-------|--------|-------|
| □ Creator royalties reversed on full refund | | |
| □ Proportional royalty reversal on partial refund | | |
| □ Royalty transfer reversal tracked | | |
| □ Creator notified of royalty reversal | | |
| □ Royalty reversal reflected in creator dashboard | | |
| □ Tax implications documented | | |

### 3.6 Chargeback Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ Webhook handler for `charge.dispute.created` | | |
| □ Webhook handler for `charge.dispute.updated` | | |
| □ Webhook handler for `charge.dispute.closed` | | |
| □ Disputes linked to orders in database | | |
| □ Refund locked when dispute active | | |
| □ Evidence collection automated | | |
| □ Evidence submission before deadline | | |
| □ Team alerted on new disputes | | |
| □ Dispute rate monitored | | |
| □ Dispute rate alerts configured (< 0.65%) | | |

### 3.7 Refund Communication

| Check | Status | Notes |
|-------|--------|-------|
| □ Refund confirmation email sent to customer | | |
| □ Expected timeline communicated (5-10 business days) | | |
| □ Refund reference number provided | | |
| □ Seller notified of reversal | | |
| □ Creator notified of royalty reversal | | |
| □ Support team has refund visibility | | |

### 3.8 Audit Trail & Compliance

| Check | Status | Notes |
|-------|--------|-------|
| □ All refund actions logged with timestamp | | |
| □ User who initiated refund recorded | | |
| □ Reason for refund stored | | |
| □ Amount breakdown stored (customer, seller, platform, royalty) | | |
| □ Stripe refund ID stored | | |
| □ Original payment linked to refund | | |
| □ Refund policy version at time of purchase stored | | |
| □ Audit log immutable (append-only) | | |

### 3.9 Edge Cases

| Check | Status | Notes |
|-------|--------|-------|
| □ Refund for expired card handled | | |
| □ Refund for closed bank account handled | | |
| □ Failed refund retry mechanism | | |
| □ Currency mismatch handling | | |
| □ Refund after payout to seller | | |
| □ Refund for subscription/recurring tickets | | |
| □ Bulk refund for event cancellation | | |
| □ Refund timeout handling | | |

---

## 4. Implementation Patterns

### 4.1 Complete Refund Service

```javascript
class RefundService {
  constructor(stripe, db, notificationService) {
    this.stripe = stripe;
    this.db = db;
    this.notificationService = notificationService;
    this.redis = new Redis();
  }

  /**
   * Process a refund request
   */
  async processRefund(params) {
    const { orderId, amount, reason, requestedBy, requestId } = params;
    
    // 1. Generate idempotency key
    const idempotencyKey = this.generateIdempotencyKey(orderId, amount, requestId);
    
    // 2. Check for existing refund with same key
    const existing = await this.checkExistingRefund(idempotencyKey);
    if (existing) {
      return { success: true, refund: existing, duplicate: true };
    }
    
    // 3. Acquire distributed lock
    const lock = await this.acquireLock(idempotencyKey);
    if (!lock) {
      throw new RefundError('REFUND_IN_PROGRESS', 'A refund is already being processed');
    }
    
    try {
      // 4. Validate eligibility
      const eligibility = await this.validateEligibility(orderId, amount, reason);
      if (!eligibility.eligible) {
        throw new RefundError('NOT_ELIGIBLE', eligibility.errors.join('; '));
      }
      
      const order = eligibility.order;
      
      // 5. Create pending refund record
      const refundRecord = await this.createRefundRecord({
        orderId,
        amount,
        reason,
        requestedBy,
        idempotencyKey,
        status: 'pending'
      });
      
      // 6. Process with Stripe
      const stripeRefund = await this.processStripeRefund(order, amount, idempotencyKey);
      
      // 7. Update refund record
      await this.updateRefundRecord(refundRecord.id, {
        stripeRefundId: stripeRefund.id,
        status: stripeRefund.status,
        processedAt: new Date()
      });
      
      // 8. Update order status
      await this.updateOrderRefundStatus(order, amount);
      
      // 9. Handle post-refund actions
      await this.handlePostRefundActions(order, stripeRefund, reason);
      
      return {
        success: true,
        refund: {
          id: refundRecord.id,
          stripeRefundId: stripeRefund.id,
          amount: amount,
          status: stripeRefund.status
        }
      };
      
    } catch (error) {
      await this.handleRefundError(orderId, idempotencyKey, error);
      throw error;
    } finally {
      await this.releaseLock(idempotencyKey);
    }
  }

  /**
   * Validate refund eligibility
   */
  async validateEligibility(orderId, requestedAmount, reason) {
    const errors = [];
    
    // Get order with all related data
    const order = await this.db('orders')
      .where({ id: orderId })
      .first();
    
    if (!order) {
      return { eligible: false, errors: ['Order not found'] };
    }
    
    // Check order status
    const refundableStatuses = ['completed', 'delivered', 'event_cancelled'];
    if (!refundableStatuses.includes(order.status)) {
      errors.push(`Order status '${order.status}' is not eligible for refund`);
    }
    
    // Check for active dispute
    if (order.has_dispute) {
      errors.push('Cannot process refund while dispute is active');
    }
    
    // Check refund lock
    if (order.refund_locked) {
      errors.push(`Refund locked: ${order.refund_lock_reason}`);
    }
    
    // Calculate max refundable
    const existingRefunds = await this.db('refunds')
      .where({ order_id: orderId, status: 'succeeded' })
      .sum('amount as total')
      .first();
    
    const alreadyRefunded = existingRefunds?.total || 0;
    const maxRefundable = order.total_amount - alreadyRefunded;
    
    if (requestedAmount > maxRefundable) {
      errors.push(
        `Requested amount (${requestedAmount}) exceeds maximum refundable (${maxRefundable})`
      );
    }
    
    // Check Stripe payment status
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        order.payment_intent_id
      );
      if (paymentIntent.status !== 'succeeded') {
        errors.push('Payment is not in a refundable state');
      }
    } catch (stripeError) {
      errors.push('Unable to verify payment status');
    }
    
    return {
      eligible: errors.length === 0,
      errors,
      order,
      maxRefundable
    };
  }

  /**
   * Process refund through Stripe
   */
  async processStripeRefund(order, amount, idempotencyKey) {
    const refundParams = {
      payment_intent: order.payment_intent_id,
      amount: amount,
      reason: 'requested_by_customer',
      metadata: {
        order_id: order.id,
        platform: 'tickettoken'
      }
    };
    
    // Handle marketplace orders
    if (order.is_marketplace_order) {
      refundParams.reverse_transfer = true;
      refundParams.refund_application_fee = true;
    }
    
    return await this.stripe.refunds.create(refundParams, {
      idempotencyKey: idempotencyKey
    });
  }

  /**
   * Handle post-refund actions
   */
  async handlePostRefundActions(order, refund, reason) {
    // Notify customer
    await this.notificationService.sendEmail({
      to: order.customer_email,
      template: 'refund_confirmation',
      data: {
        orderNumber: order.order_number,
        refundAmount: refund.amount / 100,
        reason: reason,
        expectedDays: '5-10 business days'
      }
    });
    
    // Handle ticket status
    if (refund.amount === order.total_amount) {
      await this.db('tickets')
        .where({ order_id: order.id })
        .update({ status: 'refunded', refunded_at: new Date() });
    }
    
    // Notify seller (marketplace)
    if (order.is_marketplace_order && order.seller_id) {
      await this.notificationService.sendEmail({
        to: order.seller_email,
        template: 'seller_refund_notification',
        data: {
          orderNumber: order.order_number,
          reversalAmount: (refund.amount * order.seller_share) / 100,
          reason: reason
        }
      });
    }
    
    // Log for audit
    await this.db('refund_audit_log').insert({
      order_id: order.id,
      refund_id: refund.id,
      action: 'REFUND_COMPLETED',
      amount: refund.amount,
      reason: reason,
      timestamp: new Date()
    });
  }

  // Helper methods
  generateIdempotencyKey(orderId, amount, requestId) {
    return `refund:${orderId}:${amount}:${requestId || Date.now()}`;
  }

  async checkExistingRefund(idempotencyKey) {
    return await this.db('refunds')
      .where({ idempotency_key: idempotencyKey })
      .whereIn('status', ['pending', 'succeeded'])
      .first();
  }

  async acquireLock(key) {
    const result = await this.redis.set(
      `lock:${key}`,
      process.pid,
      'NX', 'EX', 30
    );
    return result === 'OK';
  }

  async releaseLock(key) {
    await this.redis.del(`lock:${key}`);
  }
}
```

### 4.2 Event Cancellation Bulk Refund

```javascript
class EventCancellationService {
  async cancelEventWithRefunds(eventId, reason) {
    const event = await this.db('events').where({ id: eventId }).first();
    
    if (!event) {
      throw new Error('Event not found');
    }
    
    // 1. Mark event as cancelled
    await this.db('events')
      .where({ id: eventId })
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: new Date()
      });
    
    // 2. Get all orders needing refund
    const orders = await this.db('orders')
      .where({ event_id: eventId })
      .whereIn('status', ['completed', 'delivered'])
      .where('refund_status', '!=', 'fully_refunded')
      .select('*');
    
    console.log(`Processing ${orders.length} orders for refund`);
    
    // 3. Queue refunds in batches
    const batchSize = 50;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      for (const order of batch) {
        await this.refundQueue.add('process_cancellation_refund', {
          orderId: order.id,
          eventId: eventId,
          reason: 'event_cancelled',
          automatic: true
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }
        });
      }
      
      // Small delay between batches
      await sleep(100);
    }
    
    // 4. Send bulk notification
    await this.notificationService.sendBulkEmail({
      templateId: 'event_cancelled',
      recipients: orders.map(o => ({
        email: o.customer_email,
        data: {
          customerName: o.customer_name,
          eventName: event.name,
          orderNumber: o.order_number,
          refundAmount: o.total_amount / 100,
          refundTimeline: '5-10 business days'
        }
      }))
    });
    
    return {
      eventId: eventId,
      ordersQueued: orders.length,
      status: 'processing'
    };
  }
}
```

### 4.3 Dispute Handler

```javascript
class DisputeHandler {
  async handleDisputeCreated(dispute) {
    // 1. Store dispute
    await this.db('disputes').insert({
      stripe_dispute_id: dispute.id,
      charge_id: dispute.charge,
      payment_intent_id: dispute.payment_intent,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidence_due_by: new Date(dispute.evidence_details.due_by * 1000),
      created_at: new Date()
    });
    
    // 2. Find and lock associated order
    const order = await this.db('orders')
      .where({ payment_intent_id: dispute.payment_intent })
      .first();
    
    if (order) {
      await this.db('orders')
        .where({ id: order.id })
        .update({
          has_dispute: true,
          dispute_id: dispute.id,
          refund_locked: true,
          refund_lock_reason: 'active_chargeback'
        });
    }
    
    // 3. Gather evidence automatically
    const evidence = await this.gatherEvidence(order, dispute);
    
    // 4. Calculate days until due
    const daysUntilDue = Math.ceil(
      (dispute.evidence_details.due_by * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    // 5. Alert team
    await this.alertService.send({
      channel: 'disputes',
      priority: 'high',
      title: `New Chargeback: $${dispute.amount / 100}`,
      body: `
        Reason: ${dispute.reason}
        Order: ${order?.order_number || 'Unknown'}
        Days to respond: ${daysUntilDue}
        Evidence gathered: ${evidence.items.length} items
      `,
      actions: [
        { label: 'View in Stripe', url: `https://dashboard.stripe.com/disputes/${dispute.id}` },
        { label: 'View Order', url: `/admin/orders/${order?.id}` }
      ]
    });
    
    // 6. Auto-submit if high confidence
    if (evidence.confidence > 0.8 && evidence.items.length >= 3) {
      await this.submitEvidence(dispute.id, evidence);
    }
    
    return { disputeId: dispute.id, orderId: order?.id };
  }

  async gatherEvidence(order, dispute) {
    const evidence = { items: [], confidence: 0 };
    
    if (!order) return evidence;
    
    // Customer details
    if (order.customer_email) {
      evidence.customer_email_address = order.customer_email;
      evidence.items.push('customer_email');
    }
    
    if (order.customer_name) {
      evidence.customer_name = order.customer_name;
      evidence.items.push('customer_name');
    }
    
    // Purchase details
    evidence.product_description = `Ticket for ${order.event_name}`;
    evidence.items.push('product_description');
    
    // Transaction data
    if (order.customer_ip) {
      evidence.customer_purchase_ip = order.customer_ip;
      evidence.items.push('customer_ip');
    }
    
    // Receipt
    const receipt = await this.generateReceipt(order);
    if (receipt) {
      const file = await this.stripe.files.create({
        purpose: 'dispute_evidence',
        file: { data: receipt, name: 'receipt.pdf', type: 'application/pdf' }
      });
      evidence.receipt = file.id;
      evidence.items.push('receipt');
    }
    
    // Calculate confidence based on evidence gathered
    evidence.confidence = evidence.items.length / 6; // 6 possible items
    
    return evidence;
  }

  async submitEvidence(disputeId, evidence) {
    try {
      await this.stripe.disputes.update(disputeId, {
        evidence: evidence,
        submit: true
      });
      
      await this.db('disputes')
        .where({ stripe_dispute_id: disputeId })
        .update({
          evidence_submitted: true,
          evidence_submitted_at: new Date()
        });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to submit dispute evidence:', error);
      return { success: false, error: error.message };
    }
  }
}
```

---

## 5. Sources

### Stripe Documentation
1. Stripe Refunds API
   https://docs.stripe.com/api/refunds

2. Refund and Cancel Payments
   https://docs.stripe.com/refunds

3. Stripe Disputes Overview
   https://docs.stripe.com/disputes

4. How Disputes Work
   https://docs.stripe.com/disputes/how-disputes-work

5. Responding to Disputes
   https://docs.stripe.com/disputes/responding

6. Dispute Prevention Best Practices
   https://docs.stripe.com/disputes/prevention/best-practices

7. Dispute Evidence Best Practices
   https://docs.stripe.com/disputes/best-practices

8. Stripe Connect - Destination Charges
   https://docs.stripe.com/connect/destination-charges

9. Stripe Connect - Direct Charges
   https://docs.stripe.com/connect/direct-charges

10. Handle Refunds and Disputes (Connect)
    https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes

11. Application Fee Refunds
    https://stripe.com/docs/api/fee_refunds

12. Transfer Reversals
    https://docs.stripe.com/api/transfer_reversals

13. Customer Refund Processing Time
    https://support.stripe.com/embedded-connect/questions/customer-refund-processing-time

14. Refunds for ACH Direct Debit
    https://support.stripe.com/questions/refunds-for-ach-direct-debit-payments

### Ticketing Industry Sources
15. Ticketmaster - Event Cancellation Help
    https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled

16. Ticketmaster - Refund Information
    https://blog.ticketmaster.com/refund-credit-canceled-postponed-rescheduled-events/

17. Event Refund Policy Best Practices
    https://loopyah.com/blog/planning/event-refund-policy

18. When and Why You Should Offer Event Ticket Refunds
    https://www.yapsody.com/ticketing/blog/when-and-why-you-should-offer-event-ticket-refunds/

19. Best Practices for Managing Event Ticket Refunds
    https://imagina.com/en/blog/article/refund-ticket-event/

20. Event Cancellation Guide
    https://www.eventcube.io/blog/event-cancellation-guide

21. Event Ticket Refunds Guide for Organizers and Attendees
    https://www.ticketbud.com/blog/event-ticket-refunds-a-guide-for-event-organizers-and-attendees/

22. Can You Return Concert, Comedy, or Broadway Tickets?
    https://www.concertsandtickets.com/blog/return-event-tickets-guide/

### Resale & Secondary Market
23. NATB Ticket Bill of Rights
    https://www.natb.org/ticket-bill-of-rights/

24. Protect Ticket Rights - Your Ticket Rights
    https://www.protectticketrights.com/your-ticket-rights

25. Third-Party Ticket Seller Refund Challenges
    https://www.wcpo.com/money/consumer/dont-waste-your-money/buying-from-a-third-party-concert-ticket-seller-refunds-can-be-tricky

### Idempotency & Double Payment Prevention
26. Avoiding Double Payments in a Distributed Payments System (Airbnb)
    https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb

27. What is Idempotency and Why It Matters in Payments
    https://www.moderntreasury.com/journal/why-idempotency-matters-in-payments

28. Idempotency in Payment Processing
    https://developers.tap.company/docs/idempotency

29. Why Idempotency Matters in Payment Processing Architectures
    https://www.computer.org/publications/tech-news/trends/idempotency-in-payment-processing-architecture

30. Ensuring Reliable Payment Systems with Idempotency
    https://dev.to/budiwidhiyanto/ensuring-reliable-payment-systems-with-idempotency-2d0l

31. Idempotency's Role in Financial Services
    https://www.cockroachlabs.com/blog/idempotency-in-finance/

32. API Idempotency (Adyen)
    https://docs.adyen.com/development-resources/api-idempotency/

### Multi-Party Payments
33. Split Payments Implementation Guide
    https://stripe.com/resources/more/how-to-implement-split-payment-systems-what-businesses-need-to-do-to-make-it-work

34. Multi-vendor Payment Orchestration for Marketplaces
    https://www.nauticalcommerce.com/blog/multi-vendor-payment-orchestration

35. Split Payments in eCommerce
    https://www.cs-cart.com/blog/split-payments/

36. Split Payments Explained: Benefits, Challenges, and Best Practices
    https://www.ryftpay.com/blog/split-payments-explained-benefits-challenges-and-best-practices

---

## Summary

Refund handling in ticketing platforms requires:

1. **Clear Policies**
   - Define scenarios explicitly (cancellation, postponement, changes)
   - Automate refunds for cancellations
   - Communicate timelines clearly

2. **Technical Safeguards**
   - Idempotency keys prevent double refunds
   - Database constraints enforce limits
   - State machines control valid transitions

3. **Multi-Party Handling**
   - Use `reverse_transfer` and `refund_application_fee` for Connect
   - Track all party amounts in database
   - Handle royalty reversals explicitly

4. **Chargeback Management**
   - Implement all dispute webhooks
   - Lock refunds during active disputes
   - Monitor dispute rate (< 0.65%)
   - Respond with evidence before deadline

5. **Audit Trail**
   - Log all refund actions
   - Store amount breakdowns
   - Link to Stripe records
   - Maintain immutable history

The most critical rule: **Implement idempotency at every layer** - UI debouncing, API idempotency keys, database constraints, and Stripe's built-in protections work together to prevent costly double refunds.