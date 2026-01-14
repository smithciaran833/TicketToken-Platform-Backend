# PAYOUT SCHEDULING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Payout Scheduling |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Manual payouts only, no scheduling**

| Component | Status |
|-----------|--------|
| Venue balance tracking | ✅ Exists |
| Payout calculation (with reserves) | ✅ Works |
| Manual payout request | ✅ Works (routes exist) |
| Instant payout option | ✅ Configured (1% fee) |
| Payout thresholds | ✅ Configured ($100 min, $50k max) |
| Chargeback reserves | ✅ Configured (5-15%) |
| Bank verification | ✅ Basic (Plaid mock) |
| Scheduled/automatic payouts | ❌ Not implemented |
| Actual bank transfer | ❌ Mock only |
| Payout history | ❌ Stubbed (returns []) |

**Bottom Line:** Venues can request payouts manually through the API, and the system correctly calculates available funds after reserves. However, there's no automated scheduling, and actual bank transfers are mocked.

---

## What Exists

### 1. Venue Balance Service

**File:** `payment-service/src/services/core/venue-balance.service.ts`
```typescript
class VenueBalanceService {
  async getBalance(venueId: string): Promise<VenueBalance> {
    return VenueBalanceModel.getBalance(venueId);
  }

  async calculatePayoutAmount(venueId: string): Promise<{
    available: number;
    reserved: number;
    payable: number;
  }> {
    const balance = await this.getBalance(venueId);
    const riskLevel = await this.getVenueRiskLevel(venueId);
    const reservePercentage = chargebackReserves[riskLevel];
    const requiredReserve = balance.available * (reservePercentage / 100);
    
    const payable = Math.max(
      0,
      balance.available - requiredReserve - payoutThresholds.minimum
    );
    
    return { available, reserved, payable };
  }

  async processPayout(venueId: string, amount: number): Promise<void> {
    // Validates amount against payable
    // Updates balance
    // DOES NOT actually transfer money
  }
}
```

**Status:** ✅ Logic works, but no real transfer

---

### 2. Payout Configuration

**File:** `payment-service/src/config/fees.ts`
```typescript
export const chargebackReserves = {
  low: 5,      // 5% for established venues
  medium: 10,  // 10% for normal venues
  high: 15     // 15% for new/risky venues
};

export const payoutThresholds = {
  minimum: 100,     // $100 minimum payout
  maximumDaily: 50000  // $50k daily limit
};
```

---

### 3. Payout Routes

**File:** `payment-service/src/routes/venue.routes.ts`

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/:venueId/balance` | GET | Get balance & payout info | ✅ Works |
| `/:venueId/payout` | POST | Request payout | ✅ Works (mock) |
| `/:venueId/payouts` | GET | Get payout history | ❌ Returns [] |

**Request Payout:**
```typescript
POST /venues/:venueId/payout
{
  "amount": 1000,
  "instant": false  // true = 1% fee, 30min; false = free, 1-2 days
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payout initiated",
  "amount": 1000,
  "type": "standard",
  "estimatedArrival": "1-2 business days"
}
```

---

### 4. Instant Payout Service

**File:** `payment-service/src/services/launch-features.ts`
```typescript
class InstantPayoutService {
  async requestPayout(venueId: string, amount: number, instant: boolean = false) {
    const amountInCents = Math.round(amount * 100);
    const feeCents = instant ? Math.round(amountInCents * 0.01) : 0; // 1% fee
    const netAmountCents = amountInCents - feeCents;

    return {
      payoutId: `po_${Date.now()}`,  // MOCK ID
      venueId,
      amount: netAmountCents / 100,
      fee: feeCents / 100,
      type: instant ? 'instant' : 'standard',
      estimatedArrival: instant ? 'Within 30 minutes' : '1-2 business days',
      status: 'processing'
    };
  }
}
```

**Status:** ✅ Logic exists, but returns mock data

---

### 5. Bank Verification

**File:** `compliance-service/src/services/bank.service.ts`
```typescript
class BankService {
  async verifyBankAccount(venueId, accountNumber, routingNumber) {
    // Mock Plaid verification
    const mockVerified = !accountNumber.includes('000');
    
    // Store verification result
    await db.query(`INSERT INTO bank_verifications ...`);
    
    return {
      verified: mockVerified,
      accountName: 'Mock Business Checking',
      accountType: 'checking'
    };
  }

  async createPayoutMethod(venueId, accountToken) {
    const payoutId = `payout_${Date.now()}`;
    await db.query(`INSERT INTO payout_methods ...`);
    return payoutId;
  }
}
```

**Status:** ✅ Routes exist, but Plaid integration is mocked

---

## What's NOT Implemented ❌

### 1. Scheduled/Automatic Payouts

**Expected:**
```typescript
// Venue settings
interface PayoutSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  dayOfWeek?: number;  // For weekly
  dayOfMonth?: number; // For monthly
  minimumAmount?: number;
}

// Scheduled job
@Cron('0 9 * * *')  // Daily at 9am
async processScheduledPayouts() {
  const venues = await getVenuesWithScheduledPayouts();
  for (const venue of venues) {
    if (shouldPayout(venue)) {
      await processPayout(venue);
    }
  }
}
```

**Status:** Does not exist - all payouts must be manually requested

---

### 2. Actual Bank Transfers

**Expected:**
```typescript
// Stripe Connect payout
await stripe.transfers.create({
  amount: amountCents,
  currency: 'usd',
  destination: venue.stripeConnectAccountId,
  description: `Payout for ${venue.name}`,
});

// Or ACH via Stripe
await stripe.payouts.create({
  amount: amountCents,
  currency: 'usd',
}, {
  stripeAccount: venue.stripeConnectAccountId,
});
```

**Current:** `processPayout()` only updates balance, doesn't transfer

---

### 3. Payout History

**Current implementation:**
```typescript
async getPayoutHistory(request, reply) {
  // TODO: Implement getPayoutHistory method
  const history: any[] = []; // Hardcoded empty array
  return reply.send(history);
}
```

**Expected:** Query `payouts` or `payout_history` table

---

### 4. Payout Status Tracking

**Expected table:**
```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY,
  venue_id UUID,
  amount_cents INTEGER,
  fee_cents INTEGER,
  net_amount_cents INTEGER,
  payout_type VARCHAR(20),  -- 'instant', 'standard'
  status VARCHAR(20),        -- 'pending', 'processing', 'completed', 'failed'
  stripe_payout_id VARCHAR(100),
  bank_account_last4 VARCHAR(4),
  initiated_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT
);
```

**Status:** Table structure unknown, likely doesn't exist with this schema

---

### 5. Payout Notifications

**Expected:**
- Email when payout initiated
- Email when payout completed
- Email when payout failed
- Weekly payout summary

**Status:** Not implemented

---

## Payout Flow (Current)
```
1. Venue calls GET /venues/:venueId/balance
   └── Returns: available, reserved, payable
         │
         ▼
2. Venue calls POST /venues/:venueId/payout
   └── Body: { amount: 1000, instant: false }
         │
         ▼
3. VenueBalanceService.processPayout()
   ├── Validates amount <= payable ✅
   ├── Validates amount <= daily limit ✅
   ├── Updates balance (subtract from available) ✅
   └── Logs "Processing payout" ✅
         │
         ▼
4. Response: { success: true, estimatedArrival: '1-2 days' }
         │
         ▼
5. ??? Money never actually transfers ???
```

---

## Database Tables

### Exists (compliance-service)
```sql
-- Bank verifications
bank_verifications (venue_id, account_last_four, routing_number, verified, ...)

-- Payout methods  
payout_methods (venue_id, payout_id, status, created_at)
```

### Needs to Exist
```sql
-- Payout history
CREATE TABLE payouts (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  venue_id UUID,
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER DEFAULT 0,
  net_amount_cents INTEGER NOT NULL,
  payout_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  stripe_transfer_id VARCHAR(100),
  stripe_payout_id VARCHAR(100),
  initiated_by UUID,
  initiated_at TIMESTAMP NOT NULL,
  processing_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  metadata JSONB
);

-- Payout schedules
CREATE TABLE payout_schedules (
  id UUID PRIMARY KEY,
  venue_id UUID UNIQUE,
  frequency VARCHAR(20) NOT NULL,  -- daily, weekly, monthly, manual
  day_of_week INTEGER,             -- 0-6 for weekly
  day_of_month INTEGER,            -- 1-31 for monthly
  minimum_amount_cents INTEGER DEFAULT 10000,
  is_active BOOLEAN DEFAULT true,
  last_payout_at TIMESTAMP,
  next_payout_at TIMESTAMP
);
```

---

## What Would Need to Be Built

### Phase 1: Actual Transfers (2-3 days)

| Task | Effort |
|------|--------|
| Integrate Stripe Connect payouts | 1.5 days |
| Handle payout webhooks (success/fail) | 1 day |
| Create payouts table | 0.5 day |

### Phase 2: Payout History (1-2 days)

| Task | Effort |
|------|--------|
| Implement getPayoutHistory() | 0.5 day |
| Add payout detail endpoint | 0.5 day |
| Track payout status changes | 0.5 day |

### Phase 3: Scheduled Payouts (2-3 days)

| Task | Effort |
|------|--------|
| Create payout_schedules table | 0.5 day |
| Venue schedule configuration API | 1 day |
| Scheduled payout job | 1 day |
| Tests | 0.5 day |

### Phase 4: Notifications (1 day)

| Task | Effort |
|------|--------|
| Payout initiated email | 0.25 day |
| Payout completed email | 0.25 day |
| Payout failed email | 0.25 day |
| Weekly summary | 0.25 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| Venue balance tracking | ✅ Works |
| Payout calculation | ✅ Works |
| Chargeback reserves | ✅ Configured |
| Payout thresholds | ✅ Configured |
| Instant payout option | ✅ Configured (1% fee) |
| Manual payout request | ✅ Route exists |
| Bank verification | ⚠️ Mock Plaid |
| Actual bank transfer | ❌ Not implemented |
| Payout history | ❌ Returns [] |
| Scheduled payouts | ❌ Not implemented |
| Payout notifications | ❌ Not implemented |
| Payout status tracking | ❌ Not implemented |

**Bottom Line:** The calculation and validation logic for payouts exists and works correctly. However, no money actually moves - transfers are mocked, history is empty, and there's no automated scheduling. Venues must manually request payouts, which then don't actually transfer funds.

---

## Related Documents

- `VENUE_PAYOUT_FLOW_AUDIT.md` - Why venues don't get credited in first place
- `FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md` - Fee calculation
- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Stripe Connect setup
