# SELLER VERIFICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Seller Verification |

---

## Executive Summary

**NOT IMPLEMENTED - Only a venue setting flag exists**

| Component | Status |
|-----------|--------|
| auto_approve_verified_sellers flag | ✅ Exists (venue setting) |
| Seller verification process | ❌ Not implemented |
| Verification levels/badges | ❌ Not implemented |
| Verified seller table | ❌ Does not exist |
| Identity verification for sellers | ❌ Not implemented |
| Sales history verification | ❌ Not implemented |
| Verification API endpoints | ❌ Not implemented |

**Bottom Line:** There's a venue setting `auto_approve_verified_sellers` that suggests verified sellers can have listings auto-approved, but there's no actual seller verification system. No way to become a "verified seller."

---

## What Exists

### Venue Setting

**File:** `backend/services/marketplace-service/src/migrations/001_baseline_marketplace.ts`
```sql
auto_approve_verified_sellers BOOLEAN DEFAULT false
```

This setting would allow venues to auto-approve listings from verified sellers, but there's no verification system.

---

## What's Missing

### 1. Verified Sellers Table
```sql
-- NOT IMPLEMENTED
CREATE TABLE verified_sellers (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  verification_level VARCHAR(20), -- 'basic', 'pro', 'elite'
  verified_at TIMESTAMP,
  verified_by UUID,  -- admin or system
  verification_method VARCHAR(50), -- 'identity', 'sales_history', 'manual'
  identity_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  sales_count INTEGER DEFAULT 0,
  dispute_rate DECIMAL(5,2) DEFAULT 0,
  average_rating DECIMAL(3,2),
  badge_type VARCHAR(30),
  expires_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active'
);
```

### 2. Verification Requirements

Expected verification tiers:
```typescript
// NOT IMPLEMENTED
const VERIFICATION_TIERS = {
  basic: {
    requirements: ['email_verified', 'phone_verified'],
    badge: 'verified_basic',
    benefits: ['faster_listing_approval']
  },
  pro: {
    requirements: ['identity_verified', 'min_10_sales', 'dispute_rate_under_5'],
    badge: 'verified_pro',
    benefits: ['instant_listing', 'lower_fees', 'priority_support']
  },
  elite: {
    requirements: ['identity_verified', 'min_100_sales', 'dispute_rate_under_2', 'avg_rating_4.5'],
    badge: 'verified_elite',
    benefits: ['instant_listing', 'lowest_fees', 'featured_seller']
  }
};
```

### 3. API Endpoints

Expected but not implemented:
```
GET  /api/v1/sellers/:sellerId/verification-status
POST /api/v1/sellers/apply-verification
POST /api/v1/sellers/verify-identity
GET  /api/v1/sellers/verified-sellers
GET  /api/v1/admin/verification-requests
POST /api/v1/admin/verify-seller/:userId
```

### 4. Verification Flow
```
1. Seller applies for verification
2. System checks automatic criteria (sales, disputes)
3. If identity needed, redirect to KYC flow
4. Admin reviews edge cases
5. Verification granted with badge
6. Badge displayed on listings
```

---

## Impact

| Area | Impact |
|------|--------|
| Buyer trust | No way to identify trustworthy sellers |
| Seller incentives | No reward for good behavior |
| Platform quality | Cannot distinguish established vs new sellers |
| Fraud prevention | Harder to build seller reputation |

---

## Recommendations

### P3 - Implement Seller Verification

| Task | Effort |
|------|--------|
| Create verified_sellers table | 0.25 day |
| Define verification tiers | 0.25 day |
| Auto-verification by criteria | 1 day |
| Identity verification integration | 1 day (reuse KYC) |
| Admin verification UI | 1 day |
| Display badges on listings | 0.5 day |
| **Total** | **4 days** |

---

## Related Documents

- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Identity verification (reusable)
- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Stripe verification
- `SELLER_PROTECTION_FLOW_AUDIT.md` - Seller trust
