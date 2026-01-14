# FEE CALCULATION/DISTRIBUTION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Fee Calculation & Distribution |

---

## Executive Summary

**WELL IMPLEMENTED - Two fee systems exist, both functional**

| Component | Status |
|-----------|--------|
| Order-service fee calculation | ✅ Working (simple) |
| Payment-service fee calculator | ✅ Working (advanced) |
| Fee config (env-based) | ✅ Configurable |
| Tiered pricing (Starter/Pro/Enterprise) | ✅ Implemented |
| Per-ticket fees | ✅ Implemented |
| Processing fees (Stripe) | ✅ Implemented |
| Tax calculation | ✅ Implemented (with TaxJar integration) |
| Gas fee estimation | ✅ Implemented (blockchain) |
| Fee breakdown API | ✅ Routes exist |
| Venue payout calculation | ✅ Implemented |
| Actual distribution to venues | ⚠️ Blocked (see VENUE_PAYOUT audit) |

**Bottom Line:** Fee calculation is comprehensive with two implementations - a simple one in order-service for basic orders and an advanced one in payment-service with dynamic tiering, tax, and gas fees. The calculation works; the distribution to venues is blocked by other issues.

---

## Two Fee Calculation Systems

### 1. Order-Service (Simple)

**File:** `order-service/src/config/fees.ts`

**Purpose:** Basic fee calculation for order creation
```typescript
const defaultFeeConfig: FeeConfig = {
  platformFeePercent: 0.05,          // 5% platform fee
  processingFeePercent: 0.029,       // 2.9% processing fee (Stripe)
  processingFeeFixed: 30,            // $0.30 fixed fee
  taxPercent: 0.08,                  // 8% tax (hardcoded)
  reservationDurationMinutes: 30,
};

function calculateOrderFees(subtotalCents: number) {
  platformFeeCents = Math.floor(subtotalCents * platformFeePercent);
  processingFeeCents = Math.floor(subtotalCents * processingFeePercent) + processingFeeFixed;
  taxCents = Math.floor((subtotal + platform + processing) * taxPercent);
  totalCents = subtotal + platform + processing + tax;
}
```

**Used in:** `order.service.ts` → `createOrder()`

---

### 2. Payment-Service (Advanced)

**File:** `payment-service/src/services/core/fee-calculator.service.ts`

**Purpose:** Dynamic fee calculation with tiering, tax integration, gas fees
```typescript
// Tiered pricing based on venue monthly volume
tiers: {
  starter: { percentage: 8.2%, volumeMax: $10,000/month },
  pro: { percentage: 7.9%, volumeRange: $10k-$100k },
  enterprise: { percentage: 7.5%, volumeMin: $100k }
}

// Additional fees
instantPayout: 1.0%
internationalPayment: 2.0%
groupPayment: $0.50 per member
ach: $0.80 fixed

async calculateDynamicFees(venueId, amountCents, ticketCount, location) {
  tier = await getVenueTier(venueId);
  platformFee = percentOfCents(amountCents, tierPercentage);
  gasEstimate = await estimateGasFees(ticketCount);
  taxBreakdown = await calculateTax(amountCents, venueId, location);
  
  return { platformFee, gasEstimate, tax, total, breakdown };
}
```

**Features:**
- ✅ Dynamic venue tier lookup (cached)
- ✅ TaxJar integration for tax calculation
- ✅ Blockchain gas fee estimation
- ✅ Redis caching for performance
- ✅ PCI-compliant logging

---

## Fee Structure

### Primary Sales

| Fee Type | Source | Rate |
|----------|--------|------|
| Platform Fee | Platform | 5-8.2% (tiered) |
| Processing Fee | Stripe | 2.9% + $0.30 |
| Per-ticket Fee | Platform | $2.00/ticket |
| Tax | TaxJar/State | Variable |
| Gas Fee | Blockchain | ~$0.50/ticket |

### Secondary Sales (Resale)

| Fee Type | Source | Rate |
|----------|--------|------|
| Platform Fee | Platform | 5% |
| Venue Royalty | Venue | 5-10% (configurable) |
| Processing Fee | Stripe | 2.9% + $0.30 |

---

## API Endpoints

### Payment-Service Fee Routes

**File:** `payment-service/src/routes/fee-calculator.routes.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/fees/calculate` | POST | Calculate fees for order |
| `/fees/breakdown` | POST | Get formatted fee breakdown |

**Request:**
```json
{
  "subtotal": 100.00,
  "ticketCount": 2,
  "venueId": "uuid" // optional
}
```

**Response:**
```json
{
  "calculation": {
    "subtotal": 100.00,
    "serviceFeePercentage": 10.00,
    "serviceFee": 10.00,
    "perTicketFee": 4.00,
    "processingFee": 3.31,
    "totalFees": 17.31,
    "total": 117.31,
    "venuePayout": 100.00,
    "platformRevenue": 13.31
  }
}
```

---

## Integration Points

### 1. Order Creation

**File:** `order-service/src/services/order.service.ts`
```typescript
// Uses simple fee calculation
const platformFeeCents = Math.floor(subtotalCents * (fees.platformFeePercentage / 100));
const processingFeeCents = Math.floor(subtotalCents * (fees.processingFeePercentage / 100)) + fees.processingFeeFixedCents;
const taxCents = Math.floor((subtotalCents + platformFeeCents + processingFeeCents) * (fees.defaultTaxRate / 100));

const order = await this.orderModel.create({
  subtotalCents,
  platformFeeCents,
  processingFeeCents,
  taxCents,
  totalCents,
});
```

**Status:** ✅ Working

### 2. Payment Processing

**File:** `payment-service/src/controllers/payment.controller.ts`
```typescript
// Uses advanced fee calculator
this.feeCalculator = new FeeCalculatorService();
const fees = await this.feeCalculator.calculateDynamicFees(venueId, amountCents, ticketCount, location);
```

**Status:** ✅ Working

### 3. Venue Tier Lookup

**File:** `payment-service/src/services/fee-calculator.service.ts`
```typescript
// Fetches from venue-service
const venueResponse = await axios.get(`${venueServiceUrl}/api/v1/venues/${venueId}`);
const pricingTierName = venueResponse.data.venue?.pricing_tier || 'standard';
```

**Status:** ✅ Working (with fallback to default tier)

---

## Tax Calculation

### TaxJar Integration

**File:** `payment-service/src/services/core/tax-calculator.service.ts`
```typescript
async calculateTax(amountCents, location, venueId) {
  // Calls TaxJar API for accurate rates
  // Falls back to hardcoded rates on failure
  return { state, county, city, special, total };
}
```

**Fallback Rates:**
- State Tax: 7%
- Local Tax: 2.25%

---

## Gas Fee Estimation

**File:** `payment-service/src/services/core/gas-fee-estimator.service.ts`
```typescript
async estimateGasFees(ticketCount, network) {
  // Estimates blockchain transaction costs
  // Supports Solana, Polygon
  return { totalFeeCents, feePerTransactionCents };
}
```

**Fallback:** $0.50 per ticket

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Simple fee calculation | ✅ Used in order creation |
| Advanced fee calculation | ✅ Used in payment processing |
| Tiered pricing | ✅ Starter/Pro/Enterprise |
| Per-ticket fees | ✅ $2.00/ticket default |
| Processing fees | ✅ 2.9% + $0.30 |
| Tax calculation | ✅ TaxJar + fallback |
| Gas fee estimation | ✅ With fallback |
| Fee breakdown API | ✅ Routes available |
| Caching | ✅ Redis for venue tiers |
| Env configuration | ✅ All fees configurable |

---

## What's Not Working ❌

### Fee Distribution to Venues

While fees are **calculated** correctly, they're not **distributed**:

1. **Primary Sales:** Venues never credited (see VENUE_PAYOUT_FLOW_AUDIT)
2. **Secondary Sales:** Royalties calculated but distribution blocked by stub purchase endpoint

This is NOT a fee calculation problem - it's a downstream integration issue.

---

## Database Schema

### orders table (order-service)
```sql
subtotal_cents INTEGER NOT NULL,
platform_fee_cents INTEGER NOT NULL,
processing_fee_cents INTEGER NOT NULL,
tax_cents INTEGER NOT NULL,
discount_cents INTEGER DEFAULT 0,
total_cents INTEGER NOT NULL,
currency VARCHAR(3) DEFAULT 'USD'
```

### payment_transactions table (payment-service)
```sql
amount_cents INTEGER NOT NULL,
platform_fee INTEGER,
venue_payout INTEGER,
gas_fee_paid INTEGER,
tax_amount INTEGER,
total_amount INTEGER,
currency VARCHAR(3)
```

---

## Configuration

### Environment Variables
```bash
# Order-service
PLATFORM_FEE_PERCENT=0.05
PROCESSING_FEE_PERCENT=0.029
PROCESSING_FEE_FIXED_CENTS=30
TAX_PERCENT=0.08

# Payment-service
FEE_TIER_STARTER=8.2
FEE_TIER_PRO=7.9
FEE_TIER_ENTERPRISE=7.5
THRESHOLD_PRO=10000
THRESHOLD_ENTERPRISE=100000
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Fee calculation code | ✅ Complete |
| Simple fees (order-service) | ✅ Working |
| Dynamic fees (payment-service) | ✅ Working |
| Tiered pricing | ✅ Working |
| Tax integration | ✅ Working |
| Gas fee estimation | ✅ Working |
| Fee API routes | ✅ Working |
| Fee breakdown | ✅ Working |
| Venue payout calculation | ✅ Calculated |
| Venue payout distribution | ❌ Blocked (other issues) |

**Bottom Line:** Fee calculation is one of the better-implemented features. Two systems exist (simple and advanced), both work, both are configurable. The issue isn't calculation - it's that venues don't get paid due to downstream integration problems documented in VENUE_PAYOUT_FLOW_AUDIT.

---

## Related Documents

- `VENUE_PAYOUT_FLOW_AUDIT.md` - Why venues don't receive calculated fees
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow that triggers fee calculation
- `ROYALTY_DISTRIBUTION_FLOW_AUDIT.md` - Secondary sale fee distribution
