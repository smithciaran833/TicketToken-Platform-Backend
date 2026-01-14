# Payment Split Accuracy with Stripe Connect
## Production Audit Guide for TicketToken

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Ensure accurate payment splits between platform, event organizers, and royalty recipients

---

## Table of Contents
1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Patterns](#4-implementation-patterns)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Stripe Connect Transfer Patterns

Stripe Connect offers three primary charge types for multi-party payments. Choosing the correct pattern is critical for TicketToken's royalty distribution model.

**Source:** https://docs.stripe.com/connect/charges

#### Comparison of Charge Types

| Feature | Direct Charges | Destination Charges | Separate Charges & Transfers |
|---------|---------------|--------------------|-----------------------------|
| **Merchant of Record** | Connected Account | Platform | Platform |
| **Split to Multiple Recipients** | No | No (single destination) | **Yes** |
| **Timing Control** | Immediate | Immediate | Flexible |
| **Atomicity** | N/A | Atomic (charge + transfer) | Non-atomic |
| **Use Case** | SaaS platforms | Simple marketplaces | **Complex royalty splits** |

**Source:** https://www.cjav.dev/articles/picking-the-right-charge-type-for-your-stripe-connect-platform

#### Recommendation for TicketToken

For a ticketing platform with royalty splits to multiple parties (organizer, artists, platform), **Separate Charges and Transfers** is the appropriate pattern because:

1. Single payment can be split to multiple connected accounts
2. Transfer timing can be controlled (hold until event completion)
3. Supports complex fee structures with royalties

> "Create separate charges and transfers to transfer funds from one payment to multiple connected accounts, or when a specific user isn't known at the time of the payment."

**Source:** https://docs.stripe.com/connect/separate-charges-and-transfers

### 1.2 Destination Charges vs Separate Charges and Transfers

#### Destination Charges

Best for simple one-to-one payment flows where the entire payment goes to a single connected account minus platform fee.

```javascript
// Destination charge - atomic, single recipient
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000, // $100.00
  currency: 'usd',
  application_fee_amount: 1000, // $10.00 platform fee
  transfer_data: {
    destination: 'acct_organizer123',
  },
});
```

**Key Characteristics:**
- Charge and transfer happen atomically in one API call
- Platform fee collected via `application_fee_amount`
- Connected account receives `amount - application_fee_amount`
- Stripe fees deducted from platform balance

**Source:** https://docs.stripe.com/connect/destination-charges

#### Separate Charges and Transfers

Required when splitting payments to multiple parties or when transfer timing must be controlled.

```javascript
// Step 1: Create charge on platform
const charge = await stripe.charges.create({
  amount: 10000,
  currency: 'usd',
  source: 'tok_visa',
  transfer_group: 'ORDER_123',
});

// Step 2: Create transfers to multiple recipients
await stripe.transfers.create({
  amount: 7000, // $70 to organizer
  currency: 'usd',
  destination: 'acct_organizer123',
  transfer_group: 'ORDER_123',
  source_transaction: charge.id, // Link to original charge
});

await stripe.transfers.create({
  amount: 2000, // $20 to artist (royalty)
  currency: 'usd',
  destination: 'acct_artist456',
  transfer_group: 'ORDER_123',
  source_transaction: charge.id,
});
// Platform keeps $10 (remaining $10.00 minus Stripe fees)
```

**Key Characteristics:**
- Charge and transfers are separate API calls (non-atomic)
- Can split to multiple connected accounts
- Use `transfer_group` to associate related operations
- Use `source_transaction` to link transfers to original charge

**Source:** https://docs.stripe.com/connect/separate-charges-and-transfers

### 1.3 Handling Transfer Failures

Transfer failures require explicit handling—Stripe does not automatically retry failed transfers.

**Source:** https://docs.stripe.com/connect/separate-charges-and-transfers

#### Transfer Failure Scenarios

| Scenario | Cause | Solution |
|----------|-------|----------|
| Insufficient balance | Platform balance < transfer amount | Use `source_transaction` to tie to charge |
| Connected account issue | Account restricted/closed | Monitor `account.updated` webhook |
| Cross-border restriction | Unsupported region transfer | Verify regions before transfer |

#### Using source_transaction for Reliability

> "To avoid this problem, when creating a transfer, tie it to an existing charge by specifying the charge ID as the source_transaction, the transfer request returns success regardless of your available balance if the related charge hasn't settled yet."

**Source:** https://docs.stripe.com/connect/separate-charges-and-transfers

```javascript
// CORRECT: Link transfer to source charge
const transfer = await stripe.transfers.create({
  amount: 7000,
  currency: 'usd',
  destination: 'acct_organizer123',
  source_transaction: charge.id, // Ensures funds availability
});
```

#### Automatic Reversal on Payment Failure

For platforms created after January 1, 2025, Stripe automatically reverses transfers when asynchronous payment methods (ACH, SEPA) fail.

> "For platforms created on or after January 1, 2025, Stripe automatically reverses transfers from connected accounts when asynchronous payment methods fail. This type of failure no longer requires custom handling."

**Source:** https://support.stripe.com/questions/getting-the-transfer-is-already-fully-reversed-errors-after-handling-charge-failed-webhook

### 1.4 Reconciliation of Transfers

Stripe provides multiple tools for reconciling transfers with charges and payouts.

**Source:** https://docs.stripe.com/plan-integration/get-started/reporting-reconciliation

#### Balance Transactions API

Balance transactions are the foundation of all reconciliation in Stripe. Every credit and debit creates a balance transaction.

```javascript
// Fetch balance transactions for a payout
const transactions = await stripe.balanceTransactions.list({
  payout: 'po_xxx',
  expand: ['data.source'],
});

// Each transaction has:
// - type: 'charge', 'transfer', 'refund', 'payout', etc.
// - source: the underlying object (ch_xxx, tr_xxx, etc.)
// - amount: credit (+) or debit (-)
```

**Source:** https://docs.stripe.com/payouts/reconciliation

#### Reconciliation Best Practices

1. **Use `transfer_group`** to associate charges with transfers
2. **Store `source_transaction`** to link transfers back to charges
3. **Listen to webhooks** for real-time reconciliation:
   - `charge.succeeded` / `charge.failed`
   - `transfer.created` / `transfer.reversed`
   - `payout.paid` / `payout.failed`
4. **Use Payout Reconciliation Report** for batch reconciliation

**Source:** https://docs.stripe.com/reports/payout-reconciliation

#### Reconciliation Query Pattern

```sql
-- Reconcile expected vs actual transfers
SELECT 
  o.order_id,
  o.total_amount,
  o.expected_organizer_amount,
  o.expected_artist_royalty,
  o.expected_platform_fee,
  COALESCE(SUM(t.amount) FILTER (WHERE t.destination = o.organizer_account), 0) as actual_organizer,
  COALESCE(SUM(t.amount) FILTER (WHERE t.destination = o.artist_account), 0) as actual_artist,
  o.total_amount - COALESCE(SUM(t.amount), 0) - o.stripe_fee as actual_platform
FROM orders o
LEFT JOIN stripe_transfers t ON t.transfer_group = o.stripe_transfer_group
WHERE o.status = 'completed'
GROUP BY o.order_id
HAVING 
  ABS(o.expected_organizer_amount - COALESCE(SUM(t.amount) FILTER (WHERE t.destination = o.organizer_account), 0)) > 0
  OR ABS(o.expected_artist_royalty - COALESCE(SUM(t.amount) FILTER (WHERE t.destination = o.artist_account), 0)) > 0;
```

### 1.5 Payout Timing Considerations

Understanding settlement timing is critical to prevent transferring funds before they're available.

**Source:** https://docs.stripe.com/payments/balances

#### Balance States

| State | Description | Can Transfer? |
|-------|-------------|---------------|
| **Pending** | Payment received, not yet settled | Only with `source_transaction` |
| **Available** | Funds settled, ready for use | Yes |

#### Settlement Timing by Country

| Country | Card Settlement | ACH Settlement |
|---------|----------------|----------------|
| US | T+2 business days | T+4 business days (T+2 with faster ACH) |
| UK | T+2 business days | N/A |
| EU | T+2 business days | SEPA: T+4 business days |

**Source:** https://docs.stripe.com/financial-accounts/connect/money-movement/timelines

#### Payout Schedule Configuration

```javascript
// Configure connected account payout schedule
await stripe.accounts.update('acct_xxx', {
  settings: {
    payouts: {
      schedule: {
        interval: 'daily', // or 'weekly', 'monthly', 'manual'
        delay_days: 2, // Minimum based on country
      },
    },
  },
});
```

**Source:** https://docs.stripe.com/connect/manage-payout-schedule

#### Manual Payouts for Escrow-like Behavior

For ticketing (hold funds until event completion):

```javascript
// Set to manual payouts
await stripe.accounts.update('acct_organizer123', {
  settings: {
    payouts: {
      schedule: { interval: 'manual' },
    },
  },
});

// After event completes, trigger payout
await stripe.payouts.create({
  amount: 70000,
  currency: 'usd',
}, {
  stripeAccount: 'acct_organizer123',
});
```

**Source:** https://docs.stripe.com/connect/manual-payouts

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Transfers Not Atomic with Charges

**The Problem:** With separate charges and transfers, the charge can succeed but transfers can fail, leaving funds stranded on the platform.

```javascript
// ❌ WRONG: No error handling for transfer failures
async function processPayment(order) {
  const charge = await stripe.charges.create({
    amount: order.total,
    currency: 'usd',
    source: order.paymentMethod,
  });
  
  // If this fails, charge succeeded but organizer doesn't get paid
  await stripe.transfers.create({
    amount: order.organizerAmount,
    destination: order.organizerAccount,
  });
  
  return { success: true };
}
```

**Why It's Dangerous:**
- Customer charged but organizer/artist not paid
- Platform holds funds indefinitely
- No automatic retry mechanism

**Correct Pattern:**

```javascript
// ✅ CORRECT: Track transfer state and implement retry
async function processPayment(order) {
  const charge = await stripe.charges.create({
    amount: order.total,
    currency: 'usd',
    source: order.paymentMethod,
    transfer_group: `ORDER_${order.id}`,
  });
  
  // Store pending transfers in database
  await db.query(`
    INSERT INTO pending_transfers (order_id, charge_id, recipient, amount, status)
    VALUES ($1, $2, $3, $4, 'pending')
  `, [order.id, charge.id, order.organizerAccount, order.organizerAmount]);
  
  try {
    const transfer = await stripe.transfers.create({
      amount: order.organizerAmount,
      destination: order.organizerAccount,
      source_transaction: charge.id, // Link to charge
      transfer_group: `ORDER_${order.id}`,
    });
    
    await db.query(`
      UPDATE pending_transfers SET status = 'completed', transfer_id = $1
      WHERE order_id = $2
    `, [transfer.id, order.id]);
    
  } catch (error) {
    // Log failure, will be retried by background job
    await db.query(`
      UPDATE pending_transfers SET status = 'failed', error = $1
      WHERE order_id = $2
    `, [error.message, order.id]);
    
    await alertOpsTeam(`Transfer failed for order ${order.id}: ${error.message}`);
  }
  
  return { success: true, chargeId: charge.id };
}
```

### 2.2 Missing Transfer Failure Handling

**The Problem:** No webhook handlers for transfer failures or connected account issues.

**Required Webhook Events:**

| Event | Purpose | Action Required |
|-------|---------|-----------------|
| `charge.failed` | Payment declined | Cancel pending transfers |
| `charge.refunded` | Refund issued | Reverse associated transfers |
| `transfer.reversed` | Transfer reversed | Update database, notify affected party |
| `account.updated` | Connected account status change | Check `charges_enabled`, `payouts_enabled` |
| `payout.failed` | Payout to bank failed | Alert, retry with different method |

**Source:** https://docs.stripe.com/connect/webhooks

```javascript
// Webhook handler for critical events
app.post('/stripe/webhooks', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    webhookSecret
  );
  
  switch (event.type) {
    case 'charge.failed':
      // Cancel any pending transfers for this charge
      await cancelPendingTransfers(event.data.object.id);
      break;
      
    case 'charge.refunded':
      // Reverse proportional transfers
      await handleRefund(event.data.object);
      break;
      
    case 'account.updated':
      // Check if account can still receive transfers
      const account = event.data.object;
      if (!account.charges_enabled || !account.payouts_enabled) {
        await pauseTransfersToAccount(account.id);
        await alertOpsTeam(`Account ${account.id} disabled`);
      }
      break;
      
    case 'payout.failed':
      await handlePayoutFailure(event.data.object);
      break;
  }
  
  res.json({ received: true });
});
```

**Source:** https://docs.stripe.com/webhooks

### 2.3 Incorrect Fee Calculations

**The Problem:** Platform fee calculations don't account for Stripe fees, rounding errors, or edge cases.

**Source:** https://docs.stripe.com/connect/destination-charges

#### Fee Calculation Methods

**Method 1: `application_fee_amount`** (Platform takes fixed fee)
```javascript
// Customer pays $100
// Organizer receives: $100 - $10 (app fee) = $90
// Platform receives: $10 - $2.90 (Stripe fee) = $7.10
const payment = await stripe.paymentIntents.create({
  amount: 10000,
  application_fee_amount: 1000, // Platform fee
  transfer_data: { destination: 'acct_organizer' },
});
```

**Method 2: `transfer_data[amount]`** (Platform specifies transfer amount)
```javascript
// Customer pays $100
// Organizer receives: $90 (specified amount)
// Platform receives: $100 - $90 = $10, minus Stripe fees
const payment = await stripe.paymentIntents.create({
  amount: 10000,
  transfer_data: {
    destination: 'acct_organizer',
    amount: 9000, // Organizer receives this
  },
});
```

**Source:** https://docs.stripe.com/connect/marketplace/tasks/app-fees

#### Common Calculation Errors

| Error | Example | Fix |
|-------|---------|-----|
| Ignoring Stripe fees | Platform expects $10, gets $7.10 | Factor in 2.9% + $0.30 |
| Rounding errors | $10.00 * 0.05 = 0.50000001 | Use integer cents, round properly |
| Currency mismatch | Calculating USD fee on EUR charge | Convert at charge time |
| Partial captures | Fee on $100, capture $50 | Proportional fee adjustment |

```javascript
// ✅ CORRECT: Precise fee calculation
function calculateFees(chargeAmountCents, platformFeePercent) {
  const stripeFeePercent = 0.029;
  const stripeFeeFixed = 30; // cents
  
  // Calculate platform fee (before Stripe fees)
  const grossPlatformFee = Math.round(chargeAmountCents * platformFeePercent);
  
  // Stripe takes fees from platform for destination charges
  const stripeFee = Math.round(chargeAmountCents * stripeFeePercent) + stripeFeeFixed;
  
  // Net platform revenue
  const netPlatformFee = grossPlatformFee - stripeFee;
  
  // Organizer receives
  const organizerAmount = chargeAmountCents - grossPlatformFee;
  
  return {
    chargeAmount: chargeAmountCents,
    applicationFee: grossPlatformFee,
    stripeFee: stripeFee,
    netPlatformRevenue: netPlatformFee,
    organizerAmount: organizerAmount,
  };
}
```

### 2.4 No Reconciliation of Actual vs Expected

**The Problem:** Platform calculates expected transfers but never verifies actual transfers match.

**Consequences:**
- Silent revenue leakage
- Undetected failed transfers
- Incorrect payouts to organizers/artists

#### Required Reconciliation Checks

```javascript
// Daily reconciliation job
async function reconcileTransfers() {
  const orders = await db.query(`
    SELECT * FROM orders 
    WHERE created_at > NOW() - INTERVAL '24 hours'
    AND status = 'completed'
  `);
  
  for (const order of orders.rows) {
    // Fetch actual transfers from Stripe
    const transfers = await stripe.transfers.list({
      transfer_group: `ORDER_${order.id}`,
    });
    
    const actualTotal = transfers.data.reduce((sum, t) => sum + t.amount, 0);
    const expectedTotal = order.expected_organizer_amount + order.expected_artist_royalty;
    
    if (Math.abs(actualTotal - expectedTotal) > 0) {
      await createReconciliationAlert({
        orderId: order.id,
        expected: expectedTotal,
        actual: actualTotal,
        difference: expectedTotal - actualTotal,
      });
    }
    
    // Check for missing transfers
    if (order.expected_artist_royalty > 0) {
      const artistTransfer = transfers.data.find(
        t => t.destination === order.artist_account
      );
      if (!artistTransfer) {
        await createMissingTransferAlert({
          orderId: order.id,
          recipient: 'artist',
          expectedAmount: order.expected_artist_royalty,
        });
      }
    }
  }
}
```

### 2.5 Payout Before Settlement

**The Problem:** Transferring or paying out funds before the original charge has settled.

**Source:** https://docs.stripe.com/payments/balances

#### Risk Scenarios

| Scenario | Risk | Impact |
|----------|------|--------|
| ACH payment + immediate transfer | ACH fails after transfer | Platform negative balance |
| Card charge + instant payout | Chargeback after payout | Can't recover funds |
| Manual payout before settlement | Funds not yet available | Payout fails |

#### Correct Pattern: Wait for Settlement

```javascript
// ❌ WRONG: Immediate payout after charge
async function processAndPayout(order) {
  const charge = await stripe.charges.create({ ... });
  
  // Dangerous! Funds may not be settled
  await stripe.payouts.create({
    amount: order.organizerAmount,
    currency: 'usd',
  }, { stripeAccount: order.organizerAccount });
}

// ✅ CORRECT: Use source_transaction and scheduled payouts
async function processAndPayout(order) {
  const charge = await stripe.charges.create({ ... });
  
  // Transfer with source_transaction waits for settlement
  await stripe.transfers.create({
    amount: order.organizerAmount,
    destination: order.organizerAccount,
    source_transaction: charge.id, // Waits for charge settlement
  });
  
  // Payouts happen on connected account's schedule (T+2 default)
  // No manual payout needed
}
```

#### For Asynchronous Payment Methods (ACH, SEPA)

```javascript
// ❌ WRONG: Transfer immediately for ACH
async function handleACHPayment(paymentIntent) {
  // ACH takes days to settle and can fail
  await stripe.transfers.create({
    amount: paymentIntent.amount * 0.9,
    destination: 'acct_xxx',
  });
}

// ✅ CORRECT: Wait for charge.succeeded webhook
async function handleACHWebhook(event) {
  if (event.type === 'charge.succeeded') {
    // Now safe to transfer
    await stripe.transfers.create({
      amount: calculateTransferAmount(event.data.object),
      destination: 'acct_xxx',
      source_transaction: event.data.object.id,
    });
  }
}
```

**Source:** https://docs.stripe.com/connect/separate-charges-and-transfers

---

## 3. Audit Checklist

### 3.1 Transfer Pattern Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Documented which charge type is used (Direct/Destination/SCT) | | |
| □ Charge type matches business requirements | | |
| □ Multi-party splits use Separate Charges & Transfers | | |
| □ Simple single-recipient uses Destination Charges | | |
| □ `transfer_group` used to associate related transactions | | |
| □ `source_transaction` used to link transfers to charges | | |
| □ Idempotency keys used for all Stripe API calls | | |
| □ Transfer amounts calculated in integer cents (no floats) | | |

### 3.2 Failure Handling Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Webhook endpoint configured for Connect events | | |
| □ `charge.failed` handler cancels pending transfers | | |
| □ `charge.refunded` handler reverses transfers | | |
| □ `transfer.reversed` handler updates database | | |
| □ `account.updated` handler checks account capabilities | | |
| □ `payout.failed` handler alerts and retries | | |
| □ Pending transfers table exists in database | | |
| □ Background job retries failed transfers | | |
| □ Maximum retry limit configured | | |
| □ Dead letter queue for unrecoverable failures | | |
| □ Alerting configured for transfer failures | | |

### 3.3 Reconciliation Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Daily reconciliation job exists | | |
| □ Compares expected vs actual transfer amounts | | |
| □ Detects missing transfers | | |
| □ Alerts on discrepancies | | |
| □ Stores Stripe transaction IDs in database | | |
| □ Uses Balance Transactions API for verification | | |
| □ Payout reconciliation report reviewed regularly | | |
| □ Reconciliation history retained ≥90 days | | |

### 3.4 Fee Calculation Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Fee calculation uses integer cents (not floats) | | |
| □ Stripe processing fees factored into calculations | | |
| □ Platform fee calculation documented | | |
| □ Royalty split calculation documented | | |
| □ Rounding policy defined and implemented | | |
| □ Partial refund fee adjustment implemented | | |
| □ Multi-currency fee conversion handled | | |
| □ Fee calculations have unit tests | | |

### 3.5 Payout Timing Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Connected account payout schedules configured | | |
| □ `source_transaction` used to prevent premature transfers | | |
| □ ACH/SEPA payments wait for `charge.succeeded` | | |
| □ Manual payouts only after funds available | | |
| □ Payout schedule appropriate for business (escrow, immediate) | | |
| □ `delay_days` appropriate for risk profile | | |
| □ Instant payouts only for settled funds | | |

### 3.6 Refund & Dispute Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ `reverse_transfer: true` set on refunds for destination charges | | |
| □ Transfer reversals implemented for separate charges | | |
| □ Partial refund → proportional transfer reversal | | |
| □ Dispute webhook handler implemented | | |
| □ Transfer reversal on dispute created | | |
| □ Re-transfer on dispute won | | |
| □ Connected account balance checked before reversal | | |

### 3.7 Database Schema Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ `stripe_charge_id` stored on orders | | |
| □ `stripe_transfer_group` stored on orders | | |
| □ `stripe_transfers` table exists with transfer details | | |
| □ `expected_amounts` stored for reconciliation | | |
| □ `pending_transfers` table for retry tracking | | |
| □ Indexes on Stripe IDs for fast lookups | | |
| □ Audit trail for all financial operations | | |

### 3.8 Monitoring & Alerting Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Alert: Transfer failure rate > threshold | | |
| □ Alert: Reconciliation discrepancy detected | | |
| □ Alert: Connected account disabled | | |
| □ Alert: Payout failure | | |
| □ Dashboard: Transfer success rate | | |
| □ Dashboard: Average transfer delay | | |
| □ Dashboard: Platform revenue tracking | | |
| □ Runbook: Transfer failure resolution | | |

---

## 4. Implementation Patterns

### 4.1 Complete Payment Split Flow

```javascript
class PaymentSplitService {
  async processTicketPurchase(order) {
    const idempotencyKey = `order_${order.id}`;
    
    // Step 1: Calculate splits
    const splits = this.calculateSplits(order);
    
    // Step 2: Store expected amounts
    await this.db.query(`
      INSERT INTO order_financials 
      (order_id, total_amount, platform_fee, organizer_amount, royalty_amount, stripe_fee_estimate)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [order.id, splits.total, splits.platformFee, splits.organizerAmount, 
        splits.royaltyAmount, splits.stripeFeeEstimate]);
    
    // Step 3: Create charge
    const charge = await stripe.charges.create({
      amount: splits.total,
      currency: 'usd',
      source: order.paymentMethod,
      transfer_group: `ORDER_${order.id}`,
      metadata: {
        order_id: order.id,
        event_id: order.eventId,
      },
    }, { idempotencyKey: `${idempotencyKey}_charge` });
    
    // Step 4: Create transfers (with error handling)
    const transfers = [];
    
    // Transfer to organizer
    try {
      const organizerTransfer = await stripe.transfers.create({
        amount: splits.organizerAmount,
        currency: 'usd',
        destination: order.organizerStripeAccount,
        source_transaction: charge.id,
        transfer_group: `ORDER_${order.id}`,
        metadata: { type: 'organizer', order_id: order.id },
      }, { idempotencyKey: `${idempotencyKey}_organizer` });
      
      transfers.push({ type: 'organizer', id: organizerTransfer.id, status: 'completed' });
    } catch (error) {
      transfers.push({ type: 'organizer', error: error.message, status: 'failed' });
      await this.queueForRetry(order.id, 'organizer', splits.organizerAmount);
    }
    
    // Transfer royalty to artist (if applicable)
    if (splits.royaltyAmount > 0 && order.artistStripeAccount) {
      try {
        const royaltyTransfer = await stripe.transfers.create({
          amount: splits.royaltyAmount,
          currency: 'usd',
          destination: order.artistStripeAccount,
          source_transaction: charge.id,
          transfer_group: `ORDER_${order.id}`,
          metadata: { type: 'royalty', order_id: order.id },
        }, { idempotencyKey: `${idempotencyKey}_royalty` });
        
        transfers.push({ type: 'royalty', id: royaltyTransfer.id, status: 'completed' });
      } catch (error) {
        transfers.push({ type: 'royalty', error: error.message, status: 'failed' });
        await this.queueForRetry(order.id, 'royalty', splits.royaltyAmount);
      }
    }
    
    // Step 5: Store transfer results
    await this.db.query(`
      UPDATE order_financials 
      SET charge_id = $1, transfers = $2, status = $3
      WHERE order_id = $4
    `, [charge.id, JSON.stringify(transfers), 
        transfers.every(t => t.status === 'completed') ? 'completed' : 'partial',
        order.id]);
    
    return { chargeId: charge.id, transfers };
  }
  
  calculateSplits(order) {
    const total = order.totalCents;
    const stripeFeeEstimate = Math.round(total * 0.029) + 30;
    
    // Platform takes 10% before Stripe fees
    const grossPlatformFee = Math.round(total * 0.10);
    
    // Artist royalty: 5% of total
    const royaltyAmount = order.artistStripeAccount 
      ? Math.round(total * 0.05) 
      : 0;
    
    // Organizer gets remainder
    const organizerAmount = total - grossPlatformFee - royaltyAmount;
    
    return {
      total,
      platformFee: grossPlatformFee,
      organizerAmount,
      royaltyAmount,
      stripeFeeEstimate,
    };
  }
}
```

### 4.2 Webhook Handler for Transfer Events

```javascript
const transferWebhookHandler = async (event) => {
  switch (event.type) {
    case 'transfer.created':
      await db.query(`
        INSERT INTO stripe_transfers 
        (transfer_id, amount, destination, transfer_group, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (transfer_id) DO NOTHING
      `, [event.data.object.id, event.data.object.amount, 
          event.data.object.destination, event.data.object.transfer_group,
          new Date(event.data.object.created * 1000)]);
      break;
      
    case 'transfer.reversed':
      await db.query(`
        UPDATE stripe_transfers 
        SET reversed_amount = reversed_amount + $1, status = 'reversed'
        WHERE transfer_id = $2
      `, [event.data.object.amount, event.data.object.transfer]);
      
      // Alert if unexpected reversal
      const transfer = await db.query(
        'SELECT * FROM stripe_transfers WHERE transfer_id = $1',
        [event.data.object.transfer]
      );
      
      if (!transfer.rows[0]?.expected_reversal) {
        await alertOpsTeam(`Unexpected transfer reversal: ${event.data.object.transfer}`);
      }
      break;
  }
};
```

### 4.3 Reconciliation Job

```javascript
async function dailyReconciliation() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Fetch all orders from yesterday
  const orders = await db.query(`
    SELECT o.*, of.* 
    FROM orders o
    JOIN order_financials of ON o.id = of.order_id
    WHERE o.created_at >= $1 AND o.created_at < $2
    AND o.status = 'completed'
  `, [startOfDay(yesterday), endOfDay(yesterday)]);
  
  const discrepancies = [];
  
  for (const order of orders.rows) {
    // Fetch actual transfers from Stripe
    const transfers = await stripe.transfers.list({
      transfer_group: `ORDER_${order.id}`,
      limit: 100,
    });
    
    const actualOrganizerAmount = transfers.data
      .filter(t => t.destination === order.organizer_stripe_account)
      .reduce((sum, t) => sum + t.amount - (t.amount_reversed || 0), 0);
    
    const actualRoyaltyAmount = transfers.data
      .filter(t => t.destination === order.artist_stripe_account)
      .reduce((sum, t) => sum + t.amount - (t.amount_reversed || 0), 0);
    
    // Check for discrepancies
    if (actualOrganizerAmount !== order.organizer_amount) {
      discrepancies.push({
        orderId: order.id,
        type: 'organizer',
        expected: order.organizer_amount,
        actual: actualOrganizerAmount,
        difference: order.organizer_amount - actualOrganizerAmount,
      });
    }
    
    if (actualRoyaltyAmount !== order.royalty_amount) {
      discrepancies.push({
        orderId: order.id,
        type: 'royalty',
        expected: order.royalty_amount,
        actual: actualRoyaltyAmount,
        difference: order.royalty_amount - actualRoyaltyAmount,
      });
    }
  }
  
  // Log and alert
  if (discrepancies.length > 0) {
    await db.query(`
      INSERT INTO reconciliation_discrepancies (date, discrepancies)
      VALUES ($1, $2)
    `, [yesterday, JSON.stringify(discrepancies)]);
    
    await alertOpsTeam(`Found ${discrepancies.length} transfer discrepancies for ${yesterday.toISOString().split('T')[0]}`);
  }
  
  return { date: yesterday, discrepancies };
}
```

---

## 5. Sources

### Stripe Connect Charge Types
1. Create a charge - Stripe Documentation
   https://docs.stripe.com/connect/charges

2. Create destination charges - Stripe Documentation
   https://docs.stripe.com/connect/destination-charges

3. Create separate charges and transfers - Stripe Documentation
   https://docs.stripe.com/connect/separate-charges-and-transfers

4. Picking the right charge type for your Stripe Connect platform - @cjav_dev
   https://www.cjav.dev/articles/picking-the-right-charge-type-for-your-stripe-connect-platform

5. Recommended Connect integrations and charge types - Stripe Documentation
   https://docs.stripe.com/connect/integration-recommendations

### Application Fees & Fee Calculation
6. Collect application fees - Stripe Documentation
   https://docs.stripe.com/connect/marketplace/tasks/app-fees

7. Create direct charges - Stripe Documentation
   https://docs.stripe.com/connect/direct-charges

8. Platform pricing tool - Stripe Documentation
   https://docs.stripe.com/connect/platform-pricing-tools

9. Application Fees - Stripe API Reference
   https://docs.stripe.com/api/application_fees

10. Revenue Recognition for destination charges - Stripe Documentation
    https://stripe.com/docs/revenue-recognition/connect/destination-charges

### Transfer Failures & Handling
11. Transfer is already fully reversed errors - Stripe Support
    https://support.stripe.com/questions/getting-the-transfer-is-already-fully-reversed-errors-after-handling-charge-failed-webhook

12. Error handling - Stripe Documentation
    https://docs.stripe.com/error-handling

13. Handle refunds and disputes - Stripe Documentation
    https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes

14. Transfer Reversals - Stripe API Reference
    https://docs.stripe.com/api/transfer_reversals

### Webhooks
15. Connect webhooks - Stripe Documentation
    https://docs.stripe.com/connect/webhooks

16. Receive Stripe events in your webhook endpoint - Stripe Documentation
    https://docs.stripe.com/webhooks

17. Process undelivered webhook events - Stripe Documentation
    https://docs.stripe.com/webhooks/process-undelivered-events

### Reconciliation & Reporting
18. Payout reconciliation report - Stripe Documentation
    https://docs.stripe.com/reports/payout-reconciliation

19. Payout reconciliation - Stripe Documentation
    https://docs.stripe.com/payouts/reconciliation

20. Reporting and reconciliation - Stripe Documentation
    https://docs.stripe.com/plan-integration/get-started/reporting-reconciliation

21. Bank reconciliation - Stripe Documentation
    https://docs.stripe.com/bank-reconciliation

22. How to select a report - Stripe Documentation
    https://stripe.com/docs/reports/select-a-report

### Payouts & Settlement
23. Balances and settlement time - Stripe Documentation
    https://docs.stripe.com/payments/balances

24. Manage payout schedule - Stripe Documentation
    https://docs.stripe.com/connect/manage-payout-schedule

25. Using manual payouts - Stripe Documentation
    https://docs.stripe.com/connect/manual-payouts

26. Receive payouts - Stripe Documentation
    https://docs.stripe.com/payouts

27. Money movement timelines - Stripe Documentation
    https://docs.stripe.com/financial-accounts/connect/money-movement/timelines

### Idempotency
28. Idempotent requests - Stripe API Reference
    https://docs.stripe.com/api/idempotent_requests

29. Designing robust and predictable APIs with idempotency - Stripe Blog
    https://stripe.com/blog/idempotency

30. Implementing Stripe-like Idempotency Keys in Postgres - brandur.org
    https://brandur.org/idempotency-keys

### Refunds & Disputes
31. Refund and cancel payments - Stripe Documentation
    https://docs.stripe.com/refunds

32. Disputes on Connect platforms - Stripe Support
    https://support.stripe.com/questions/what-controls-do-stripe-connect-platforms-have-for-handling-refunds-and-disputes-with-custom-and-express

### Split Payments Best Practices
33. Split payments: How to implement them for your business - Stripe
    https://stripe.com/resources/more/how-to-implement-split-payment-systems-what-businesses-need-to-do-to-make-it-work

34. Stripe Connect Setup: Marketplace Payments That Actually Work - BuildThatMVP
    https://www.buildthatmvp.com/getting-started/stripe-connect

35. Stripe Split Payments Guide - Brocoders
    https://brocoders.com/blog/stripe-connect-split-payments-guide/

---

## Summary

Payment split accuracy with Stripe Connect requires:

1. **Choose the right pattern** - Use Separate Charges & Transfers for multi-party royalty splits
2. **Link transfers to charges** - Always use `source_transaction` to prevent premature transfers
3. **Handle failures explicitly** - Stripe doesn't retry transfers automatically
4. **Reconcile daily** - Compare expected vs actual transfers and alert on discrepancies
5. **Use idempotency keys** - Prevent duplicate charges and transfers
6. **Wait for settlement** - Don't payout before funds are available, especially for ACH/SEPA
7. **Reverse proportionally on refund** - Set `reverse_transfer: true` or manually reverse for SCT

The most critical mistake is assuming transfers are atomic with charges. They are not. Always track transfer state independently and implement retry logic for failures.