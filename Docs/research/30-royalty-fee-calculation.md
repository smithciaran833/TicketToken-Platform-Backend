# Royalty and Fee Calculation Audit Guide
## TicketToken Blockchain Ticketing Platform

**Research Date:** December 20, 2025  
**Applies To:** Node.js/TypeScript, PostgreSQL, Stripe Connect, Solana NFTs

---

## 1. Standards & Best Practices

### 1.1 Fee Calculation Methods

**Industry Standard Fee Structures:**

Ticketing platforms typically use one or more of these fee models:

| Fee Type | Structure | Example |
|----------|-----------|---------|
| **Percentage-based** | % of ticket price | 3.7% of face value |
| **Flat per-ticket** | Fixed amount per ticket | $1.50/ticket |
| **Hybrid** | Percentage + flat fee | 4% + $1.50/ticket |
| **Capped fees** | Hybrid with maximum | 4% + $1.50, max $20 |

**Sources:**
- Service fee calculated at a rate of 4% of the ticket price plus $1.50 per paid ticket, capped at $20 per ticket
- Platforms charge a combination of commission fees (percentage of ticket price) and payment processing fees

**Best Practice for TicketToken:**
```typescript
// Fee calculation should be deterministic and auditable
interface FeeCalculation {
  basePriceCents: number;      // Always in smallest currency unit
  platformFeePercent: number;  // e.g., 400 = 4.00%
  platformFeeFlat: number;     // In cents
  platformFeeCap: number;      // Maximum fee in cents
  paymentProcessingPercent: number;
  paymentProcessingFlat: number;
}
```

### 1.2 Rounding Rules for Splits

**Banker's Rounding (Round Half to Even) - Industry Standard:**

Round-half-to-even minimizes the expected error when summing over rounded figures. This variant is also called convergent rounding, statistician's rounding, Dutch rounding, Gaussian rounding, or bankers' rounding. This is the default rounding mode used in IEEE 754 operations.

**Why Banker's Rounding Matters:**
- Traditional rounding tends to create a slight upward bias over a large set of calculations. Banker's rounding reduces this bias by distributing rounding events more evenly. This is especially important in financial calculations where even small biases can accumulate over time.

**Implementation Rules:**
1. Store all money as integers (cents/smallest unit)
2. Perform all calculations in integers
3. Apply rounding only at final display/transfer
4. Use consistent rounding across all services
5. Document which party absorbs rounding residuals

**For Multi-Party Splits:**
```typescript
// Distribute with remainder handling
function distributeAmount(totalCents: number, splits: Split[]): number[] {
  const totalPercent = splits.reduce((sum, s) => sum + s.percent, 0);
  if (totalPercent !== 10000) throw new Error('Splits must equal 100.00%');
  
  const amounts = splits.map(s => Math.floor(totalCents * s.percent / 10000));
  let remainder = totalCents - amounts.reduce((a, b) => a + b, 0);
  
  // Distribute remainder to largest recipients first (or platform last)
  for (let i = 0; i < remainder; i++) {
    amounts[i % amounts.length]++;
  }
  
  return amounts;
}
```

### 1.3 Multi-Party Payment Distribution

**Stripe Connect Charge Types:**

| Type | Use Case | Fee Responsibility |
|------|----------|-------------------|
| **Direct Charges** | Customer transacts with connected account | Connected account |
| **Destination Charges** | Platform charges, transfers to one account | Platform |
| **Separate Charges + Transfers** | Split to multiple accounts | Platform |

You create a charge on your platform's account and also transfer funds to your connected accounts. You can transfer funds to multiple connected accounts. Your account balance is debited for the cost of the Stripe fees, refunds, and chargebacks. This charge type helps marketplaces split payments between multiple parties.

**For TicketToken Resale with Royalties:**
Use **Separate Charges and Transfers** because:
- Separate Charges and Transfers is more flexible for complex split logic or multiple contractors - most flexible for marketplaces that need to split payments between multiple parties
- Allows venue royalty + artist royalty + seller payout + platform fee

**Critical Implementation Detail:**
Transfer and charge amounts don't have to match. You can split a single charge between multiple transfers or include multiple charges in a single transfer.

**However, you MUST validate:**
```typescript
// Before creating transfers
const totalTransfers = venueTransfer + artistTransfer + sellerPayout + platformFee;
const chargeAmount = paymentIntent.amount - stripeFees;

if (totalTransfers > chargeAmount) {
  throw new Error('Transfer total exceeds available funds');
}
```

### 1.4 NFT Royalty Percentage Limits

**Industry Standards for NFT Royalties:**

| Marketplace | Max Royalty | Enforced? |
|-------------|-------------|-----------|
| OpenSea | 10% | Optional |
| Rarible | 50% | Yes |
| Foundation | 5% (platform level) | Yes |
| SuperRare | 10%+ (creator choice) | Yes |

OpenSea allows a maximum royalty limit of up to 10% rather than the 50% permitted on Rarible.

A typical NFT royalty falls between the range of 5–10%. The majority of NFT markets allow creators to select the percentage of their royalties.

**Recommendation for TicketToken:**
- **Primary Sales:** Platform fee 5-15% (industry norm for ticketing)
- **Resale Royalties:** Cap at 10% combined (venue + artist)
- **Reason:** In most cases, creators set their royalties somewhere between 6% to 10% to avoid discouraging people from buying their tokens.

### 1.5 Fee Transparency Requirements

**FTC Junk Fees Rule (Effective May 12, 2025):**

The Rule requires that businesses that advertise prices tell consumers the whole truth up-front about total prices and fees.

**Key Requirements:**
- Businesses in the live-event ticketing sector must clearly disclose total prices — inclusive of mandatory fees — up front and more prominently than any other pricing terms.

**What Must Be Included in "Total Price":**
- All amounts that the consumer will be required to pay, or cannot reasonably avoid paying (for example, processing fees for concert tickets)

**What Can Be Excluded:**
- Government charges, shipping charges, and fees or charges for optional ancillary goods or services that people choose to add to the transaction

**Penalties:**
- Civil penalties of up to $51,744 per violation may apply beginning May 12, 2025

**Implementation Requirement:**
```typescript
interface PriceDisplay {
  basePrice: number;        // Face value
  serviceFee: number;       // Platform fee
  facilityFee: number;      // Venue fee
  totalPrice: number;       // MUST be displayed prominently
  // Optional fees shown separately:
  taxEstimate?: number;     // If applicable
  deliveryFee?: number;     // If physical delivery chosen
}
```

### 1.6 Stripe Connect Best Practices

**Use Integer Amounts (Minor Currency Units):**
application_fees: Platform fee amount deducted from the transaction (in minor currency units)

**Link Transfers to Source Charges:**
To prevent a transfer from executing before the funds from the associated charge are available, use the transfer's source_transaction parameter.

**Use Transfer Groups for Auditing:**
```typescript
const transferGroup = `ORDER_${orderId}`;

// All transfers for this order share the group
await stripe.transfers.create({
  amount: venueAmount,
  currency: 'usd',
  destination: venueStripeAccountId,
  transfer_group: transferGroup,
  source_transaction: chargeId,
});
```

**Funds Segregation (if available):**
Funds segregation keeps payment funds in a protected holding state before you transfer them to connected accounts. This prevents allocated funds from being used for unrelated platform operations.

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Floating Point Errors in Money Calculations

**The Core Problem:**
Floating-point numbers are stored in binary, and many decimal fractions cannot be represented exactly as binary fractions. This inaccuracy can lead to significant problems in financial transactions where every cent counts.

**Classic Example:**
```javascript
// WRONG - Never do this
0.1 + 0.2 // Returns 0.30000000000000004

// This affects real money
const price = 10.99;
const quantity = 3;
const total = price * quantity; // 32.97 or 32.969999999999...?
```

**Cascading Errors:**
With floating point math, when numbers are rounded and the order of operations can create subtle differences. Worse, these errors only happen in a small fraction of cases so it's easy for it to slip by unnoticed, but even one error can cascade into large financial systems not fully adding up.

**The Solution - Integer Cents:**
Using integer values to represent money in cents. This method is inherently more precise because integers represent whole numbers exactly, without any rounding errors.

```typescript
// CORRECT - Always use integer cents
const priceCents = 1099;  // $10.99
const quantity = 3;
const totalCents = priceCents * quantity; // Exactly 3297
```

### 2.2 Rounding That Loses or Creates Money

**Money Disappearing:**
```typescript
// BAD: Money lost due to truncation
const total = 1000; // cents
const splits = [
  { party: 'venue', percent: 33.33 },
  { party: 'artist', percent: 33.33 },
  { party: 'platform', percent: 33.34 },
];

// Each gets 333 cents = 999 cents total
// 1 cent LOST
```

**Money Being Created:**
```typescript
// BAD: Money created due to rounding up
const fee1 = Math.ceil(100 * 0.025); // 3 cents
const fee2 = Math.ceil(100 * 0.025); // 3 cents
const fee3 = Math.ceil(100 * 0.025); // 3 cents
// Total fees: 9 cents from 7.5 cents of actual fees
```

**Correct Approach:**
```typescript
function splitWithRemainder(
  totalCents: number, 
  percentages: number[]
): number[] {
  // Calculate base amounts (floor)
  const amounts = percentages.map(p => 
    Math.floor(totalCents * p / 100)
  );
  
  // Calculate and distribute remainder
  let remainder = totalCents - amounts.reduce((a, b) => a + b, 0);
  
  // Give remainder to specific party (document this!)
  // Option 1: Platform absorbs shortage
  // Option 2: Distribute round-robin
  // Option 3: Give to largest share holder
  
  let i = 0;
  while (remainder > 0) {
    amounts[i % amounts.length]++;
    remainder--;
    i++;
  }
  
  // CRITICAL: Validate
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum !== totalCents) {
    throw new Error(`Split mismatch: ${sum} !== ${totalCents}`);
  }
  
  return amounts;
}
```

### 2.3 Fees That Exceed Payment Amount

**The Problem:**
When percentage fees + flat fees + multiple royalties exceed 100% of the payment.

```typescript
// DANGEROUS: No validation
const resalePrice = 500;  // $5.00 ticket resale
const platformFee = resalePrice * 0.15; // 15% = $0.75
const venueRoyalty = resalePrice * 0.10; // 10% = $0.50
const artistRoyalty = resalePrice * 0.10; // 10% = $0.50
const stripeFee = resalePrice * 0.029 + 30; // 2.9% + $0.30 = $0.45
const sellerPayout = resalePrice - platformFee - venueRoyalty - artistRoyalty - stripeFee;
// sellerPayout = $2.80

// But what if resale is only $2.00?
// Fees alone = $0.30 + $0.20 + $0.20 + $0.36 = $1.06
// Seller gets $0.94 - but that might not cover original purchase!
```

**Required Validations:**
```typescript
interface FeeValidation {
  minimumResalePrice: number;  // Enforce minimum
  maximumTotalFeePercent: number;  // Cap total fees
  guaranteedSellerMinimum: number;  // Seller always gets X%
}

function validateFees(
  salePrice: number,
  fees: Fee[],
  config: FeeValidation
): ValidationResult {
  const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);
  const totalFeePercent = (totalFees / salePrice) * 100;
  
  const errors: string[] = [];
  
  if (totalFees >= salePrice) {
    errors.push('Total fees exceed or equal sale price');
  }
  
  if (totalFeePercent > config.maximumTotalFeePercent) {
    errors.push(`Fee percent ${totalFeePercent}% exceeds max ${config.maximumTotalFeePercent}%`);
  }
  
  const sellerAmount = salePrice - totalFees;
  const sellerPercent = (sellerAmount / salePrice) * 100;
  
  if (sellerPercent < config.guaranteedSellerMinimum) {
    errors.push(`Seller would receive only ${sellerPercent}%`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 2.4 Missing Validation of Percentage Totals

**Common Mistake: Unchecked User Input**
```typescript
// BAD: No validation that percentages sum to 100%
interface RoyaltySplit {
  venuePercent: number;
  artistPercent: number;
}

// User could submit: venue: 60%, artist: 60% = 120% !
```

**Required Validation:**
```typescript
const PERCENTAGE_PRECISION = 10000; // Represents 100.00%

function validateRoyaltySplits(splits: RoyaltySplit): void {
  // Use integers for percentage comparison
  const venuePermyriad = Math.round(splits.venuePercent * 100);
  const artistPermyriad = Math.round(splits.artistPercent * 100);
  const total = venuePermyriad + artistPermyriad;
  
  if (total > PERCENTAGE_PRECISION) {
    throw new Error(`Royalty total ${total/100}% exceeds 100%`);
  }
  
  // Individual limits
  const MAX_SINGLE_ROYALTY = 1000; // 10.00%
  if (venuePermyriad > MAX_SINGLE_ROYALTY || artistPermyriad > MAX_SINGLE_ROYALTY) {
    throw new Error('Individual royalty cannot exceed 10%');
  }
}
```

### 2.5 Incorrect Stripe Transfer Calculations

**Mistake 1: Not Accounting for Stripe Fees**
```typescript
// WRONG: Transferring full amount
const charge = await stripe.charges.create({ amount: 10000 }); // $100.00

// Stripe takes 2.9% + $0.30 = $3.20
// Available to transfer: $96.80, NOT $100.00

await stripe.transfers.create({
  amount: 10000, // WILL FAIL - insufficient balance
  destination: connectedAccount,
});
```

**Mistake 2: Creating Transfers Before Funds Available**
```typescript
// WRONG: Transfer before charge settles
const paymentIntent = await stripe.paymentIntents.create({...});
// Immediately trying to transfer - funds not yet available!
await stripe.transfers.create({...});
```

**Correct Pattern:**
```typescript
// Use source_transaction to link transfer to specific charge
const transfer = await stripe.transfers.create({
  amount: calculatedAmount,
  currency: 'usd',
  destination: connectedAccountId,
  source_transaction: chargeId, // Links to specific charge
  transfer_group: `ORDER_${orderId}`,
});
```

**Mistake 3: Transfers Exceeding Available Allocated Funds**
You can split allocated funds across multiple transfers, as long as the total doesn't exceed the original payment amount.

```typescript
// Always validate before transfer
async function createSafeTransfers(
  chargeId: string,
  transfers: TransferRequest[]
): Promise<void> {
  const charge = await stripe.charges.retrieve(chargeId);
  const availableAmount = charge.amount - (charge.application_fee_amount || 0);
  
  const totalTransferAmount = transfers.reduce((sum, t) => sum + t.amount, 0);
  
  if (totalTransferAmount > availableAmount) {
    throw new Error(
      `Transfer total ${totalTransferAmount} exceeds available ${availableAmount}`
    );
  }
  
  // Proceed with transfers...
}
```

---

## 3. Audit Checklist for TicketToken

### 3.1 Data Storage & Types

| Check | Expected | File/Location to Verify |
|-------|----------|------------------------|
| ☐ All money stored as integers (cents) | `INTEGER` or `BIGINT` in PostgreSQL | Database schema, migrations |
| ☐ No `FLOAT`, `DOUBLE`, `REAL` for money | Should use `INTEGER` or `NUMERIC` | All price/amount columns |
| ☐ Currency stored alongside amounts | `currency VARCHAR(3)` column | Transaction tables |
| ☐ Percentages stored as integers | `permyriad INTEGER` (100.00% = 10000) | Fee configuration tables |

**PostgreSQL Best Practice:**
numeric is widely considered the ideal datatype for storing money in Postgres.

The type numeric can store numbers with a very large number of digits. It is especially recommended for storing monetary amounts and other quantities where exactness is required.

**Recommended Schema:**
```sql
-- Option 1: Integer cents (recommended for performance)
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- ...
);

-- Option 2: NUMERIC for maximum precision
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- ...
);
```

### 3.2 Calculation Implementation

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Money library used consistently | Dinero.js or currency.js | Package.json, import statements |
| ☐ No `Number` arithmetic for money | All calculations use library | Search: `/\d+\.\d+\s*[\+\-\*\/]/` |
| ☐ Rounding only at final step | Intermediate calculations keep precision | Fee calculation functions |
| ☐ Consistent rounding mode | Banker's rounding or documented alternative | Rounding function implementations |

**Recommended Library:**
Dinero.js lets you create, calculate, and format money safely in JavaScript and TypeScript. Money is complex, and the primitives of the language aren't enough to properly represent it.

An immutable library is safer and more predictable. Mutable operations and reference copies are a source of bugs. Immutability avoids them altogether.

**Implementation Pattern:**
```typescript
import { dinero, add, subtract, multiply, allocate } from 'dinero.js';
import { USD } from '@dinero.js/currencies';

// Create money object
const ticketPrice = dinero({ amount: 9999, currency: USD }); // $99.99

// Calculate platform fee (5%)
const feeAmount = multiply(ticketPrice, { amount: 5, scale: 2 }); // 5.00%

// Split royalties
const [venueCut, artistCut, platformCut] = allocate(
  ticketPrice,
  [30, 20, 50] // 30%, 20%, 50%
);
```

### 3.3 Fee Configuration Validation

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Percentage validation on input | Sum ≤ 100%, each ≤ max | API validators, form handlers |
| ☐ Fee cap enforcement | Platform fee max enforced | Fee calculation service |
| ☐ Minimum price enforcement | Prevents negative seller payout | Listing creation logic |
| ☐ Fee change audit trail | All fee config changes logged | Admin audit logs |

**Validation Function:**
```typescript
const MAX_PLATFORM_FEE_PERCENT = 2000;      // 20.00%
const MAX_VENUE_ROYALTY_PERCENT = 1000;      // 10.00%
const MAX_ARTIST_ROYALTY_PERCENT = 1000;     // 10.00%
const MAX_TOTAL_FEES_PERCENT = 4000;         // 40.00%

interface FeeConfig {
  platformFeePercent: number;   // In permyriad (100 = 1%)
  venueRoyaltyPercent: number;
  artistRoyaltyPercent: number;
}

function validateFeeConfig(config: FeeConfig): ValidationResult {
  const errors: string[] = [];
  
  if (config.platformFeePercent > MAX_PLATFORM_FEE_PERCENT) {
    errors.push(`Platform fee ${config.platformFeePercent/100}% exceeds max 20%`);
  }
  
  if (config.venueRoyaltyPercent > MAX_VENUE_ROYALTY_PERCENT) {
    errors.push(`Venue royalty ${config.venueRoyaltyPercent/100}% exceeds max 10%`);
  }
  
  if (config.artistRoyaltyPercent > MAX_ARTIST_ROYALTY_PERCENT) {
    errors.push(`Artist royalty ${config.artistRoyaltyPercent/100}% exceeds max 10%`);
  }
  
  const totalPercent = config.platformFeePercent + 
                       config.venueRoyaltyPercent + 
                       config.artistRoyaltyPercent;
  
  if (totalPercent > MAX_TOTAL_FEES_PERCENT) {
    errors.push(`Total fees ${totalPercent/100}% exceeds max 40%`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 3.4 Stripe Integration

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ All amounts in cents | `amount: 1000` not `amount: 10.00` | Stripe API calls |
| ☐ `source_transaction` used for transfers | Links transfer to charge | Transfer creation code |
| ☐ `transfer_group` for related transfers | All splits share group | Order processing service |
| ☐ Transfer total validation | Sum ≤ charge amount - fees | Pre-transfer validation |
| ☐ Idempotency keys used | Prevents duplicate transfers | All Stripe mutation calls |

**Stripe Transfer Validation:**
```typescript
async function processResalePayout(
  orderId: string,
  chargeId: string,
  splits: PayoutSplit[]
): Promise<void> {
  // 1. Retrieve charge to get actual available amount
  const charge = await stripe.charges.retrieve(chargeId);
  const stripeFee = charge.balance_transaction 
    ? (await stripe.balanceTransactions.retrieve(charge.balance_transaction)).fee
    : Math.ceil(charge.amount * 0.029) + 30; // Estimate if not available
    
  const availableAmount = charge.amount - stripeFee;
  
  // 2. Calculate all transfer amounts
  const totalTransfers = splits.reduce((sum, s) => sum + s.amountCents, 0);
  
  // 3. Validate
  if (totalTransfers > availableAmount) {
    throw new Error(
      `Transfer total ${totalTransfers} exceeds available ${availableAmount} ` +
      `(charge: ${charge.amount}, stripe fee: ${stripeFee})`
    );
  }
  
  // 4. Create transfers with idempotency
  const transferGroup = `RESALE_${orderId}`;
  
  for (const split of splits) {
    await stripe.transfers.create({
      amount: split.amountCents,
      currency: 'usd',
      destination: split.stripeAccountId,
      source_transaction: chargeId,
      transfer_group: transferGroup,
      metadata: {
        order_id: orderId,
        recipient_type: split.recipientType,
      },
    }, {
      idempotencyKey: `transfer_${orderId}_${split.recipientType}`,
    });
  }
}
```

### 3.5 Resale Royalty Distribution

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Royalty percentages from event config | Not hardcoded | Resale listing service |
| ☐ Original purchase price tracked | For profit calculations | Ticket ownership records |
| ☐ Split calculation is deterministic | Same input = same output | Unit tests |
| ☐ Remainder handling documented | Platform absorbs or round-robin | Fee calculation comments |
| ☐ NFT metadata matches payout | On-chain royalty = actual payout | Minting service |

**Resale Payout Calculation:**
```typescript
interface ResalePayoutCalculation {
  salePriceCents: number;
  sellerPayoutCents: number;
  venueRoyaltyCents: number;
  artistRoyaltyCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
}

function calculateResalePayout(
  salePriceCents: number,
  eventConfig: EventFeeConfig
): ResalePayoutCalculation {
  // 1. Calculate Stripe fee first (unavoidable)
  const stripeFeeCents = Math.ceil(salePriceCents * 0.029) + 30;
  
  // 2. Calculate net amount after Stripe
  const netAmount = salePriceCents - stripeFeeCents;
  
  // 3. Calculate royalties from SALE PRICE (not net)
  const venueRoyaltyCents = Math.floor(
    salePriceCents * eventConfig.venueRoyaltyPermyriad / 10000
  );
  const artistRoyaltyCents = Math.floor(
    salePriceCents * eventConfig.artistRoyaltyPermyriad / 10000
  );
  
  // 4. Calculate platform fee
  const platformFeeCents = Math.floor(
    salePriceCents * eventConfig.platformFeePermyriad / 10000
  );
  
  // 5. Seller gets remainder
  const sellerPayoutCents = netAmount - venueRoyaltyCents - artistRoyaltyCents - platformFeeCents;
  
  // 6. Validate no negative payout
  if (sellerPayoutCents < 0) {
    throw new Error(
      `Seller payout would be negative: ${sellerPayoutCents}. ` +
      `Sale price too low for configured fees.`
    );
  }
  
  // 7. Validate sum equals net
  const sum = sellerPayoutCents + venueRoyaltyCents + artistRoyaltyCents + platformFeeCents;
  if (sum !== netAmount) {
    throw new Error(`Payout sum ${sum} !== net amount ${netAmount}`);
  }
  
  return {
    salePriceCents,
    sellerPayoutCents,
    venueRoyaltyCents,
    artistRoyaltyCents,
    platformFeeCents,
    stripeFeeCents,
  };
}
```

### 3.6 FTC Compliance (Fee Transparency)

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Total price shown prominently | Before any base price | Checkout UI, API responses |
| ☐ All mandatory fees included in total | Service fees, facility fees | Price display logic |
| ☐ Fee breakdown available | Itemized but not overshadowing total | Checkout details |
| ☐ No drip pricing | Fees shown upfront, not at checkout | Purchase flow testing |
| ☐ Fee descriptions are specific | Not vague "service fee" | UI copy, API labels |

**API Response Structure:**
```typescript
interface PriceBreakdown {
  // MUST be displayed most prominently
  totalPrice: {
    amountCents: number;
    display: string; // "$54.99"
  };
  
  // Breakdown (can be itemized but not overshadow total)
  breakdown: {
    baseTicketPrice: {
      amountCents: number;
      display: string;
      description: "Face value";
    };
    serviceFee: {
      amountCents: number;
      display: string;
      description: "Platform service and technology fee";
    };
    facilityFee: {
      amountCents: number;
      display: string;
      description: "Venue operations fee";
    };
  };
  
  // Optional fees (shown separately)
  optionalFees?: {
    ticketInsurance?: {...};
    premiumDelivery?: {...};
  };
  
  // Government fees (can be shown separately)
  taxes?: {
    estimated: boolean;
    amountCents: number;
  };
}
```

### 3.7 Database Integrity

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Transaction isolation for payouts | `SERIALIZABLE` or `REPEATABLE READ` | Payout transaction code |
| ☐ Atomic multi-table updates | Within single transaction | Order completion service |
| ☐ Reconciliation queries exist | Sum of parts = total | Admin/reporting queries |
| ☐ Audit log for all fee calculations | Input, output, timestamp | Audit table |

**Transaction Pattern:**
```typescript
async function processOrderWithPayouts(
  orderId: string,
  paymentIntentId: string
): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. Lock the order row
    const order = await trx('orders')
      .where({ id: orderId })
      .forUpdate()
      .first();
    
    if (order.status !== 'payment_received') {
      throw new Error(`Invalid order status: ${order.status}`);
    }
    
    // 2. Calculate all payouts
    const payouts = calculatePayouts(order);
    
    // 3. Record payout intentions
    await trx('payout_records').insert(
      payouts.map(p => ({
        order_id: orderId,
        recipient_type: p.type,
        recipient_id: p.recipientId,
        amount_cents: p.amountCents,
        status: 'pending',
      }))
    );
    
    // 4. Verify sum matches
    const totalPayouts = payouts.reduce((s, p) => s + p.amountCents, 0);
    const expectedTotal = order.net_amount_cents;
    
    if (totalPayouts !== expectedTotal) {
      throw new Error(`Payout mismatch: ${totalPayouts} vs ${expectedTotal}`);
    }
    
    // 5. Update order status
    await trx('orders')
      .where({ id: orderId })
      .update({ 
        status: 'payouts_pending',
        payout_calculated_at: new Date(),
      });
    
    // 6. Queue actual Stripe transfers (outside transaction)
  }, { isolationLevel: 'serializable' });
}
```

---

## 4. Test Cases to Implement

### Unit Tests

```typescript
describe('Fee Calculation', () => {
  describe('splitWithRemainder', () => {
    it('should distribute 1000 cents into 33.33/33.33/33.34 without losing money', () => {
      const result = splitWithRemainder(1000, [3333, 3333, 3334]);
      expect(result.reduce((a, b) => a + b, 0)).toBe(1000);
    });
    
    it('should handle edge case of 1 cent split 3 ways', () => {
      const result = splitWithRemainder(1, [3333, 3333, 3334]);
      expect(result.reduce((a, b) => a + b, 0)).toBe(1);
    });
    
    it('should throw if percentages exceed 100%', () => {
      expect(() => splitWithRemainder(1000, [5000, 6000])).toThrow();
    });
  });
  
  describe('calculateResalePayout', () => {
    it('should never produce negative seller payout', () => {
      const lowPrice = 100; // $1.00 ticket
      const config = { 
        venueRoyaltyPermyriad: 1000,   // 10%
        artistRoyaltyPermyriad: 1000,  // 10%
        platformFeePermyriad: 500,     // 5%
      };
      
      expect(() => calculateResalePayout(lowPrice, config)).toThrow();
    });
    
    it('should sum to net amount after Stripe fees', () => {
      const price = 10000; // $100.00
      const result = calculateResalePayout(price, defaultConfig);
      
      const expectedNet = price - result.stripeFeeCents;
      const actualSum = result.sellerPayoutCents + 
                        result.venueRoyaltyCents + 
                        result.artistRoyaltyCents + 
                        result.platformFeeCents;
      
      expect(actualSum).toBe(expectedNet);
    });
  });
});
```

### Integration Tests

```typescript
describe('Stripe Transfer Integration', () => {
  it('should not create transfers exceeding charge amount', async () => {
    const chargeAmount = 10000;
    const stripeFee = 320; // 2.9% + $0.30
    
    const transfers = [
      { amount: 5000, recipient: 'venue' },
      { amount: 3000, recipient: 'artist' },
      { amount: 2000, recipient: 'platform' }, // This would exceed!
    ];
    
    await expect(
      processTransfers(chargeId, transfers)
    ).rejects.toThrow(/exceeds available/);
  });
  
  it('should use idempotency keys to prevent duplicate transfers', async () => {
    // First call succeeds
    await processResalePayout(orderId, chargeId, splits);
    
    // Second call should be idempotent (no new transfers created)
    await processResalePayout(orderId, chargeId, splits);
    
    const transfers = await stripe.transfers.list({ transfer_group });
    expect(transfers.data.length).toBe(splits.length); // Not 2x
  });
});
```

### Reconciliation Query

```sql
-- Verify no money lost or created in completed orders
WITH order_totals AS (
  SELECT 
    o.id,
    o.total_amount_cents,
    o.stripe_fee_cents,
    o.total_amount_cents - o.stripe_fee_cents as expected_net,
    COALESCE(SUM(p.amount_cents), 0) as actual_payouts
  FROM orders o
  LEFT JOIN payout_records p ON p.order_id = o.id AND p.status = 'completed'
  WHERE o.status = 'completed'
  GROUP BY o.id
)
SELECT 
  id,
  expected_net,
  actual_payouts,
  expected_net - actual_payouts as discrepancy
FROM order_totals
WHERE expected_net != actual_payouts;

-- This query should return 0 rows if fee calculations are correct
```

---

## 5. Sources

### Official Documentation
- Stripe Connect Separate Charges and Transfers: https://docs.stripe.com/connect/separate-charges-and-transfers
- Stripe Connect Charges Overview: https://docs.stripe.com/connect/charges
- Stripe Connect Calculation Methods: https://stripe.com/docs/connect/calculation-methods
- Stripe Funds Segregation: https://docs.stripe.com/connect/funds-segregation
- PostgreSQL Numeric Types: https://www.postgresql.org/docs/current/datatype-numeric.html

### Regulatory
- FTC Rule on Unfair or Deceptive Fees: https://www.ftc.gov/news-events/news/press-releases/2025/05/ftc-rule-unfair-or-deceptive-fees-take-effect-may-12-2025
- FTC Junk Fees FAQ: https://www.ftc.gov/business-guidance/resources/rule-unfair-or-deceptive-fees-frequently-asked-questions
- Federal Register Final Rule: https://www.federalregister.gov/documents/2025/01/10/2024-30293/trade-regulation-rule-on-unfair-or-deceptive-fees

### Technical Best Practices
- Modern Treasury on Floats and Money: https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents
- Dinero.js Documentation: https://v2.dinerojs.com/docs
- Currency.js: https://currency.js.org/
- Crunchy Data - Working with Money in Postgres: https://www.crunchydata.com/blog/working-with-money-in-postgres
- Wikipedia - Rounding (Banker's Rounding): https://en.wikipedia.org/wiki/Rounding

### NFT Royalties
- a16z Crypto - How NFT Royalties Work: https://a16zcrypto.com/posts/article/how-nft-royalties-work/
- Crypto Council - NFT Royalties: https://cryptoforinnovation.org/how-nft-royalties-work-and-sometimes-dont/
- 101 Blockchains - NFT Royalties Explained: https://101blockchains.com/nft-royalties-explained/

### Ticketing Industry
- Ticketmaster Fee Structure: https://help.ticketmaster.com/hc/en-us/articles/9663528775313-How-are-ticket-prices-and-fees-determined
- Mighty Tix - Ticketing Fees Explained: https://mightytix.com/docs/ticketing-fees
- TicketPeak - Service Fee Pricing Guide: https://ticketpeak.com/blog/guide-to-service-fee-pricing/

---

*Document Version: 1.0*  
*Last Updated: December 20, 2025*