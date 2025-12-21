# Tax Calculator Consolidation Analysis

## Issue: Cannot Consolidate Without Breaking Changes

After analyzing both tax calculator implementations, consolidation is **not feasible** without significant interface changes that would break existing code.

---

## Interface Comparison

### Compliance Tax Calculator
**Location:** `src/services/compliance/tax-calculator.service.ts`

**Method Signature:**
```typescript
async calculateTax(
  amountCents: number,
  venueAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  },
  customerAddress?: {
    city?: string;
    state?: string;
    zip?: string;
  }
): Promise<{
  taxableAmount: number;
  stateTax: number;
  localTax: number;
  specialTax: number;
  totalTax: number;
  breakdown: any;
}>
```

**Used By:** `routes/internal-tax.routes.ts`

---

### Core Tax Calculator
**Location:** `src/services/core/tax-calculator.service.ts`

**Method Signature:**
```typescript
async calculateTax(
  amountCents: number,
  location: TaxLocation, // { country, zip, state?, city?, street? }
  venueId: string
): Promise<{
  state: number;
  county: number;
  city: number;
  special: number;
  total: number;
  rate: number;
}>
```

**Used By:** `core/fee-calculator.service.ts`

---

## Key Differences

### 1. Parameter Structure
- **Compliance:** Takes separate `venueAddress` and `customerAddress` objects
- **Core:** Takes single `location` object and `venueId` string

### 2. Return Field Names
- **Compliance:** `stateTax`, `localTax`, `specialTax`, `totalTax`
- **Core:** `state`, `county`, `city`, `special`, `total`

### 3. Additional Fields
- **Compliance:** Includes `taxableAmount` and detailed `breakdown`
- **Core:** Includes `rate` percentage

### 4. Database Persistence
- **Compliance:** Has `recordTaxCollection()` method, integrates with `tax_collections` table
- **Core:** No database operations, purely computational

---

## Why Consolidation Fails

The `core/fee-calculator.service.ts` expects this interface:

```typescript
const taxBreakdown = await this.taxCalculatorService.calculateTax(
  amountCents,
  taxLocation,  // TaxLocation type
  venueId
);

// Accesses these fields:
taxBreakdown.state
taxBreakdown.county
taxBreakdown.city
taxBreakdown.special
taxBreakdown.total
```

Simply swapping to the compliance version would break because:
1. Different parameter types (`TaxLocation` vs `venueAddress`)
2. Different return field names (`state` vs `stateTax`)
3. Missing fields (`county` doesn't exist in compliance version - only `localTax`)

---

## Recommendation: Keep Both

### Why Two Tax Calculators Make Sense

1. **Different Use Cases:**
   - **Compliance:** Standalone tax service for other microservices, includes audit trail
   - **Core:** Embedded in fee calculation, optimized for speed with caching

2. **Different Contexts:**
   - **Compliance:** Service-to-service communication, requires persistence
   - **Core:** Internal fee calculation, no persistence needed

3. **Different Clients:**
   - **Compliance:** External services (order-service, venue-service)
   - **Core:** Fee calculator only

---

## Alternative Approaches (Future Work)

If consolidation is desired in the future:

### Option A: Create Unified Service with Adapters
```typescript
class UnifiedTaxCalculator {
  async calculateTax(params: TaxParams, options?: { persist?: boolean }): Promise<TaxResult> {
    // Normalize input
    // Calculate tax
    // Return in requested format
  }
}
```

### Option B: Make Core Version a Wrapper
```typescript
// Core calls compliance version but adapts the interface
class CoreTaxCalculator {
  private compliance: ComplianceTaxCalculator;
  
  async calculateTax(amountCents, location, venueId) {
    const result = await this.compliance.calculateTax(...);
    // Transform result to core format
    return { state: result.stateTax, county: result.localTax, ... };
  }
}
```

---

## Current Decision

**Keep both tax calculators as-is.**

They serve different purposes with incompatible interfaces. Consolidation would require:
- Changing fee calculator implementation
- Updating all call sites
- Modifying return types throughout the codebase
- Extensive testing

This is beyond the scope of simple consolidation and would be a breaking change.

---

**Status:** Tax calculator consolidation **SKIPPED** due to interface incompatibility.

**Date:** December 2025
