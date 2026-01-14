# TAX CALCULATION/REPORTING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Tax Calculation & Reporting |

---

## Executive Summary

**TWO SYSTEMS - One works, one is stub**

| Component | Status |
|-----------|--------|
| Order-service tax routes | ❌ All return 501 (stub) |
| Order-service tax types | ✅ Comprehensive definitions |
| Order-service tax schemas | ✅ Validation exists |
| Payment-service TaxCalculatorService | ✅ Works (TaxJar + fallback) |
| Basic tax on orders | ✅ Applied (hardcoded or TaxJar) |
| Tax jurisdictions management | ❌ Not implemented |
| Tax exemptions | ❌ Not implemented |
| Tax reporting/filing | ❌ Not implemented |

**Bottom Line:** Tax is calculated and applied to orders using either TaxJar API or state-specific fallback rates. However, the comprehensive tax management system in order-service (jurisdictions, exemptions, reporting) is completely stubbed - all endpoints return 501.

---

## Two Tax Systems

### 1. Payment-Service TaxCalculatorService ✅ WORKS

**File:** `payment-service/src/services/core/tax-calculator.service.ts`

**What it does:**
- Integrates with TaxJar API for real-time rates
- Falls back to state-specific hardcoded rates
- Caches rates for 24 hours
- Returns breakdown: state, county, city, special
- Supports nexus checking
```typescript
class TaxCalculatorService {
  async calculateTax(amountCents, location, venueId): Promise<TaxBreakdown> {
    if (taxJarEnabled) {
      return calculateTaxWithTaxJar(amountCents, location);
    } else {
      return calculateFallbackTax(amountCents, location);
    }
  }
}
```

**Fallback Rates (by state):**
| State | State Tax | Local | Total |
|-------|-----------|-------|-------|
| TN | 7.00% | 2.25% | 9.25% |
| CA | 7.25% | 2.00% | 9.25% |
| TX | 6.25% | 2.00% | 8.25% |
| NY | 4.00% | 4.00% | 8.00% |
| FL | 6.00% | 1.00% | 7.00% |
| Default | 7.00% | 2.00% | 9.00% |

---

### 2. Order-Service Tax Management ❌ STUBBED

**File:** `order-service/src/controllers/tax.controller.ts`

**All endpoints return 501:**
```typescript
async createJurisdiction(req, reply) {
  return reply.status(501).send({ error: 'Not implemented' });
}
// ... ALL 15 methods return 501
```

**Routes that exist but don't work:**
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /tax/jurisdictions` | Create tax jurisdiction | ❌ 501 |
| `GET /tax/jurisdictions` | List jurisdictions | ❌ 501 |
| `PATCH /tax/jurisdictions/:id` | Update jurisdiction | ❌ 501 |
| `POST /tax/rates` | Create tax rate | ❌ 501 |
| `GET /tax/rates` | List rates | ❌ 501 |
| `POST /tax/categories` | Create tax category | ❌ 501 |
| `GET /tax/categories` | List categories | ❌ 501 |
| `POST /tax/exemptions` | Create exemption | ❌ 501 |
| `GET /tax/exemptions/customer/:id` | Get customer exemptions | ❌ 501 |
| `POST /tax/exemptions/:id/verify` | Verify exemption | ❌ 501 |
| `POST /tax/calculate` | Calculate tax | ❌ 501 |
| `GET /tax/orders/:orderId` | Get order tax | ❌ 501 |
| `POST /tax/provider/configure` | Configure provider | ❌ 501 |
| `GET /tax/provider/config` | Get provider config | ❌ 501 |
| `POST /tax/reports` | Generate report | ❌ 501 |
| `GET /tax/reports` | List reports | ❌ 501 |
| `POST /tax/reports/:id/file` | File report | ❌ 501 |

---

## What Works ✅

### Tax Applied to Orders

**File:** `order-service/src/services/order.service.ts`
```typescript
// Tax calculated during order creation
const taxCents = Math.floor(
  (subtotalCents + platformFeeCents + processingFeeCents) * 
  (orderConfig.fees.defaultTaxRate / 100)
);

const order = await this.orderModel.create({
  subtotalCents,
  platformFeeCents,
  processingFeeCents,
  taxCents,  // ✅ Applied
  totalCents,
});
```

### TaxJar Integration

**File:** `payment-service/src/services/core/tax-calculator.service.ts`
```typescript
// TaxJar API call
const response = await axios.post(`${this.taxJarBaseUrl}/taxes`, {
  from_country: 'US',
  from_zip: venueZip,
  to_country: location.country,
  to_zip: location.zip,
  to_state: location.state,
  amount: amountCents / 100,
  shipping: 0,
}, {
  headers: { Authorization: `Bearer ${this.taxJarApiKey}` }
});

// Returns breakdown
return {
  state: breakdown.state_tax_collectable,
  county: breakdown.county_tax_collectable,
  city: breakdown.city_tax_collectable,
  special: breakdown.special_tax_collectable,
  total: tax.amount_to_collect,
  rate: tax.rate
};
```

### Tax Rate Caching
```typescript
const TAX_RATE_CACHE_TTL = 86400; // 24 hours

// Cached by location
const cacheKey = `tax:rate:${location.country}:${location.state}:${location.zip}`;
```

---

## What's NOT Implemented ❌

### 1. Tax Jurisdiction Management

**Expected:**
- Create/manage tax jurisdictions (countries, states, counties, cities)
- Configure rates per jurisdiction
- Handle overlapping jurisdictions

**Status:** Types defined, no implementation

---

### 2. Tax Exemptions

**Expected:**
```typescript
enum ExemptionType {
  NON_PROFIT = 'NON_PROFIT',
  GOVERNMENT = 'GOVERNMENT',
  RESELLER = 'RESELLER',
  DIPLOMATIC = 'DIPLOMATIC',
  EDUCATIONAL = 'EDUCATIONAL',
  RELIGIOUS = 'RELIGIOUS'
}
```

**What should work:**
- Customer uploads exemption certificate
- Platform verifies certificate
- Tax not collected for exempt purchases

**Status:** Types defined, no implementation

---

### 3. Tax Categories

**Expected:**
```typescript
enum TaxType {
  SALES_TAX = 'SALES_TAX',
  VAT = 'VAT',
  GST = 'GST',
  ENTERTAINMENT_TAX = 'ENTERTAINMENT_TAX',
  AMUSEMENT_TAX = 'AMUSEMENT_TAX',
  TOURISM_TAX = 'TOURISM_TAX',
  FACILITY_FEE = 'FACILITY_FEE'
}
```

**What should work:**
- Different tax rates for different event types
- Entertainment tax on top of sales tax
- Special venue taxes

**Status:** Types defined, no implementation

---

### 4. Tax Reporting & Filing

**Expected:**
```typescript
enum ReportType {
  SALES_TAX = 'SALES_TAX',
  VAT_RETURN = 'VAT_RETURN',
  GST_RETURN = 'GST_RETURN'
}

enum ReportStatus {
  DRAFT = 'DRAFT',
  FILED = 'FILED',
  AMENDED = 'AMENDED',
  ACCEPTED = 'ACCEPTED'
}
```

**What should work:**
- Generate tax reports by jurisdiction
- Track filing deadlines
- Export data for tax software
- Mark reports as filed

**Status:** Types defined, no implementation

---

### 5. Multi-Provider Support

**Expected:**
```typescript
enum TaxProvider {
  MANUAL = 'MANUAL',
  AVALARA = 'AVALARA',
  TAXJAR = 'TAXJAR',
  VERTEX = 'VERTEX'
}
```

**Current:** Only TaxJar supported (with fallback to manual rates)

---

## Database Schema

### What Exists
```sql
-- orders table
tax_cents BIGINT NOT NULL DEFAULT 0
```

### What's Defined but Not Created

Based on types, these tables should exist:
```sql
-- Tax Jurisdictions
CREATE TABLE tax_jurisdictions (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  jurisdiction_code VARCHAR(50),
  jurisdiction_name VARCHAR(255),
  jurisdiction_type VARCHAR(50),  -- COUNTRY, STATE, COUNTY, CITY
  parent_jurisdiction_id UUID,
  country_code VARCHAR(3),
  is_active BOOLEAN
);

-- Tax Rates
CREATE TABLE tax_rates (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  jurisdiction_id UUID,
  tax_type VARCHAR(50),
  rate_percentage DECIMAL(6,4),
  effective_date DATE,
  end_date DATE,
  category_id UUID
);

-- Tax Categories  
CREATE TABLE tax_categories (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  name VARCHAR(100),
  description TEXT,
  default_rate DECIMAL(6,4)
);

-- Tax Exemptions
CREATE TABLE tax_exemptions (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  customer_id UUID,
  exemption_type VARCHAR(50),
  certificate_number VARCHAR(100),
  issuing_jurisdiction_id UUID,
  verification_status VARCHAR(50),
  valid_from DATE,
  valid_until DATE
);

-- Tax Reports
CREATE TABLE tax_reports (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  report_type VARCHAR(50),
  jurisdiction_id UUID,
  period_start DATE,
  period_end DATE,
  status VARCHAR(50),
  total_taxable BIGINT,
  total_tax_collected BIGINT,
  filed_at TIMESTAMP
);
```

**Status:** Tables NOT created - migrations don't include them.

---

## What Would Need to Be Built

### Phase 1: Implement Tax Management (5-7 days)

| Task | Effort |
|------|--------|
| Create tax tables migration | 1 day |
| Implement TaxManagementService | 2 days |
| Wire up tax controller endpoints | 1 day |
| Add tax category support | 1 day |
| Tests | 1-2 days |

### Phase 2: Tax Exemptions (3-4 days)

| Task | Effort |
|------|--------|
| Exemption certificate upload | 1 day |
| Verification workflow | 1 day |
| Apply exemption at checkout | 1 day |
| Tests | 0.5 day |

### Phase 3: Tax Reporting (4-5 days)

| Task | Effort |
|------|--------|
| Report generation | 2 days |
| Filing workflow | 1 day |
| Export formats (CSV, PDF) | 1 day |
| Dashboard integration | 1 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| Basic tax calculation | ✅ Works |
| TaxJar integration | ✅ Works |
| Fallback rates by state | ✅ Works |
| Tax on orders | ✅ Applied |
| Rate caching | ✅ 24hr cache |
| Nexus checking | ✅ Basic |
| Jurisdiction management | ❌ Stubbed (501) |
| Tax rates management | ❌ Stubbed (501) |
| Tax categories | ❌ Stubbed (501) |
| Tax exemptions | ❌ Stubbed (501) |
| Tax reporting | ❌ Stubbed (501) |
| Tax filing | ❌ Stubbed (501) |
| Multi-provider | ❌ TaxJar only |

**Bottom Line:** Tax calculation works for basic orders via TaxJar or state-specific fallbacks. The comprehensive tax management system (jurisdictions, exemptions, reporting) has types/routes defined but returns 501 on all endpoints.

---

## Related Documents

- `FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md` - Fee calculation includes tax
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Order creation applies tax
- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Tax compliance tracking
