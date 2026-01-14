# CURRENCY/MULTI-CURRENCY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Currency & Multi-currency Handling |

---

## Executive Summary

**BASIC IMPLEMENTATION - USD-centric with conversion stub**

| Component | Status |
|-----------|--------|
| Currency field on orders | ✅ Exists (defaults USD) |
| Currency field on events | ✅ Exists (defaults USD) |
| Currency validation | ✅ 3-char ISO pattern |
| CurrencyService | ✅ Exists (hardcoded rates) |
| Currency conversion | ⚠️ Works but rates hardcoded |
| International payment fee | ✅ Configured (2%) |
| Real-time exchange rates | ❌ Not integrated |
| Multi-currency checkout | ❌ Not implemented |
| Currency display/formatting | ❌ Not implemented |
| Stripe multi-currency | ⚠️ Partially supported |

**Bottom Line:** The platform stores currency codes and has a basic conversion service, but it's USD-centric. Multi-currency is a stub - hardcoded exchange rates, no real-time API, no multi-currency checkout flow.

---

## What Exists

### 1. Currency Fields

**Orders (order-service):**
```typescript
interface Order {
  currency: string;  // Defaults to 'USD'
}

interface CreateOrderRequest {
  currency?: string;  // Optional, defaults 'USD'
}
```

**Events (event-service):**
```typescript
// Schema validation
currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'USD' }
```

**Transfers:**
```typescript
interface TransferFeeResult {
  currency: string;  // From ticket_types.currency
}
```

---

### 2. CurrencyService

**File:** `payment-service/src/services/launch-features.ts`
```typescript
export class CurrencyService {
  // Hardcoded rates (integer-based to prevent float drift)
  private ratesInCents = {
    USD: 10000,  // 1.0000
    EUR: 8500,   // 0.8500
    GBP: 7300,   // 0.7300
    CAD: 12500   // 1.2500
  };

  async convert(amount: number, from: string, to: string): Promise<number> {
    const amountInCents = Math.round(amount * 100);
    const fromRate = this.ratesInCents[from];
    const toRate = this.ratesInCents[to];
    
    // Integer math to avoid floating point issues
    const usdCentsTimesBase = (amountInCents * 10000) / fromRate;
    const targetCents = Math.round((usdCentsTimesBase * toRate) / 10000);
    
    return targetCents / 100;
  }

  getSupportedCurrencies() {
    return ['USD', 'EUR', 'GBP', 'CAD'];
  }

  getExchangeRate(from: string, to: string): number {
    return Math.round((toRate / fromRate) * 10000) / 10000;
  }
}
```

**Pros:**
- ✅ Integer-based math (prevents float drift)
- ✅ Clean API

**Cons:**
- ❌ Hardcoded rates (never update)
- ❌ Only 4 currencies
- ❌ No external API integration

---

### 3. International Payment Fee

**File:** `payment-service/src/config/fees.ts`
```typescript
internationalPayment: {
  percentage: 2.0  // 2% additional fee
}
```

**Status:** Configured but not applied anywhere in code.

---

### 4. Stripe Currency Support

**File:** `payment-service/src/services/core/payment-processor.service.ts`
```typescript
async createPaymentIntent(data) {
  return stripe.paymentIntents.create({
    amount: data.amountCents,
    currency: data.currency,  // Passed through to Stripe
    // ...
  });
}
```

**Status:** Currency is passed to Stripe, but:
- No validation that currency matches venue/event
- No conversion at checkout
- Stripe handles currency display

---

## What's NOT Implemented

### 1. Real-time Exchange Rates ❌

**Expected:**
```typescript
class CurrencyService {
  // Fetch from external API
  async updateRates(): Promise<void> {
    const response = await axios.get('https://api.exchangerate.host/latest');
    this.rates = response.data.rates;
  }

  // Scheduled job
  @Cron('0 * * * *')  // Every hour
  async refreshRates() {
    await this.updateRates();
  }
}
```

**Current:** Hardcoded rates from 2024, never update.

---

### 2. Multi-currency Checkout ❌

**Expected flow:**
```
1. User visits event (priced in EUR)
2. System detects user location/preference (USD)
3. Display: "€100.00 (~$117.65 USD)"
4. User checks out in their currency
5. Platform converts and settles
```

**Current:** Everything is USD, no conversion at checkout.

---

### 3. Currency Display/Formatting ❌

**Expected:**
```typescript
formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

// Examples:
formatCurrency(100, 'USD', 'en-US')  // "$100.00"
formatCurrency(100, 'EUR', 'de-DE')  // "100,00 €"
formatCurrency(100, 'GBP', 'en-GB')  // "£100.00"
```

**Current:** No formatting utilities.

---

### 4. Venue Currency Settings ❌

**Expected:**
```typescript
interface VenueSettings {
  defaultCurrency: string;
  acceptedCurrencies: string[];
  settlementCurrency: string;
}
```

**Current:** All venues implicitly USD.

---

### 5. Currency in Reports/Exports ❌

**Expected:**
- Reports show transactions in original currency
- Option to convert all to settlement currency
- Exchange rate recorded at time of transaction

**Current:** `exchange_rate` field exists in audit types but never populated.

---

## Database Schema

### What Exists
```sql
-- orders table
currency VARCHAR(3) DEFAULT 'USD'

-- event_pricing table
currency VARCHAR(3) DEFAULT 'USD'

-- ticket_types table (implied)
currency VARCHAR(3)
```

### What's Missing
```sql
-- Exchange rate history
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  from_currency VARCHAR(3),
  to_currency VARCHAR(3),
  rate DECIMAL(10, 6),
  fetched_at TIMESTAMP,
  source VARCHAR(50)  -- 'manual', 'exchangerate.host', etc.
);

-- Transaction exchange rate snapshot
ALTER TABLE orders ADD COLUMN exchange_rate DECIMAL(10, 6);
ALTER TABLE orders ADD COLUMN exchange_rate_date TIMESTAMP;
ALTER TABLE orders ADD COLUMN settlement_currency VARCHAR(3);
ALTER TABLE orders ADD COLUMN settlement_amount_cents INTEGER;
```

---

## Integration Points

### Stripe Multi-currency

Stripe supports 135+ currencies. To fully enable:

1. **Presentment Currency:** Show prices in buyer's currency
2. **Settlement Currency:** Receive funds in your currency
3. **Automatic Conversion:** Stripe handles conversion

**Current Status:** Currency passed to Stripe but not leveraged.

---

## What Would Need to Be Built

### Phase 1: Real Exchange Rates (2-3 days)

| Task | Effort |
|------|--------|
| Integrate exchange rate API (exchangerate.host) | 1 day |
| Create rate caching (Redis, 1hr TTL) | 0.5 day |
| Add rate refresh scheduled job | 0.5 day |
| Record rate at transaction time | 0.5 day |

### Phase 2: Multi-currency Display (2-3 days)

| Task | Effort |
|------|--------|
| Currency formatting utilities | 0.5 day |
| Price display with conversion | 1 day |
| User currency preference | 0.5 day |
| Geo-detection for default currency | 0.5 day |

### Phase 3: Multi-currency Checkout (3-4 days)

| Task | Effort |
|------|--------|
| Venue currency settings | 1 day |
| Checkout currency selection | 1 day |
| Settlement currency tracking | 1 day |
| International fee application | 0.5 day |

### Phase 4: Reporting (1-2 days)

| Task | Effort |
|------|--------|
| Multi-currency reports | 1 day |
| Currency conversion in exports | 0.5 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| Currency field storage | ✅ Exists |
| Currency validation | ✅ ISO 3-char |
| CurrencyService | ✅ Basic (hardcoded) |
| Integer math | ✅ No float drift |
| Stripe currency passthrough | ✅ Works |
| Real-time rates | ❌ Hardcoded |
| Multi-currency checkout | ❌ Not implemented |
| Currency formatting | ❌ Not implemented |
| Venue currency settings | ❌ Not implemented |
| Exchange rate tracking | ❌ Not implemented |
| International fees | ⚠️ Configured, not applied |

**Bottom Line:** The platform is USD-centric with minimal multi-currency support. A CurrencyService exists but uses hardcoded rates. For international events, significant work is needed.

---

## Related Documents

- `FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md` - Fee calculation (USD only)
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow (USD default)
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Settlement (USD only)
