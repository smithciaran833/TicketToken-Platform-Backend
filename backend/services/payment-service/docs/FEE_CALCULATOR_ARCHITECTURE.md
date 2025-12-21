# Fee Calculator Architecture

## Overview

The payment service intentionally maintains **two separate fee calculators** that serve different purposes and use cases. This is **by design**, not duplication.

---

## Two Fee Calculators by Design

### 1. Simple Fee Calculator
**Location:** `src/services/fee-calculator.service.ts`

**Purpose:** Fast fee estimates for UI preview

**Endpoints:**
- `POST /fees/calculate`
- `POST /fees/breakdown`

**Use Case:** Frontend checkout pages showing estimated fees before payment

**Features:**
- Simple percentage-based calculation
- Service fee (10%)
- Per-ticket fee ($2.00)
- Payment processing fee (2.9%)
- Fetches pricing tier from venue-service via HTTP
- Works in dollars
- No tax calculation
- No blockchain gas fees
- Lightweight and fast

**When to Use:** 
- Quick fee estimates for UI display
- Public API endpoints
- No authentication required
- Frontend checkout preview

---

### 2. Dynamic Fee Calculator
**Location:** `src/services/core/fee-calculator.service.ts`

**Purpose:** Complete fee calculation for actual transactions

**Endpoints:**
- `POST /payments/process`
- `POST /payments/calculate-fees`

**Use Case:** Real payment processing with comprehensive cost breakdown

**Features:**
- Dynamic venue tier pricing (STARTER/PRO/ENTERPRISE)
- Tier-based on monthly volume analytics
- Sales tax calculation (TaxJar integration)
- Blockchain gas fee estimation (Solana/Polygon)
- Redis caching for performance
- Works in integer cents (PCI DSS compliant)
- Database-backed venue analytics
- Comprehensive fee breakdown

**When to Use:**
- Actual payment processing
- Requires authentication
- Need complete cost breakdown including taxes and gas fees
- Transaction records

---

## Key Differences

| Feature | Simple | Dynamic |
|---------|--------|---------|
| **Currency** | Dollars | Integer cents |
| **Tax Calculation** | ❌ No | ✅ Yes (TaxJar) |
| **Gas Fees** | ❌ No | ✅ Yes (Solana/Polygon) |
| **Tier Calculation** | HTTP call | Database analytics |
| **Caching** | ❌ No | ✅ Redis |
| **Performance** | Very fast | Comprehensive |
| **Use Case** | UI preview | Transaction processing |

---

## Architecture Decision

**Why Two Calculators?**

1. **Performance:** Frontend needs fast estimates without database queries or external API calls
2. **Separation of Concerns:** UI preview logic separate from transaction logic
3. **Security:** Simple calculator doesn't need access to payment processor or database
4. **Accuracy:** Transaction calculator provides exact costs including taxes and fees
5. **PCI Compliance:** Transaction calculator uses integer cents to avoid rounding errors

**This is intentional, not technical debt.**

---

## Migration Notes

If you need to consolidate in the future:

1. **Option A:** Add a `mode` parameter to dynamic calculator
   ```typescript
   calculateFees(params, mode: 'preview' | 'transaction')
   ```
   - Preview mode: Skip tax/gas, use cached values
   - Transaction mode: Full calculation

2. **Option B:** Keep both (recommended)
   - Clear separation of concerns
   - Better performance for UI
   - Easier to maintain and test

---

## Related Services

- `src/services/compliance/tax-calculator.service.ts` - Tax calculation (TaxJar)
- `src/services/core/payment-processor.service.ts` - Payment processing
- `src/services/blockchain/gas-estimator.service.ts` - Gas fee estimation
- `src/services/core/venue-analytics.service.ts` - Venue tier calculation

---

**Last Updated:** December 2025
