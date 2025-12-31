# TICKETTOKEN FEE STRUCTURE REMEDIATION

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Planning |
| Priority | Critical |

---

## Executive Summary

During a comprehensive audit of the TicketToken codebase, we discovered fee configuration values scattered across 14+ files with conflicting values. This document captures the business model, the problems found, and the work required to fix them.

---

## Part 1: Business Model

### Why We Were Looking

We needed to validate our competitive positioning against Ticketmaster, AXS, StubHub, and other ticketing platforms. During that research, we compared our product brief against the actual codebase implementation and found discrepancies.

### How We Found It

1. Searched entire codebase for fee-related terms (fee, royalty, percent, commission)
2. Found 14+ files defining fee values
3. Discovered conflicting values (2.5%, 5%, 8%, 10%, 12%) for the same fees
4. No single source of truth exists

### TicketToken Fee Structure

#### Primary Market (Venue Sells to Fan)
```
$100 ticket sale:

Venue receives:     $88.00  (88%)
Platform receives:  $12.00  (12%)
Buyer pays:         $100 + Stripe processing (2.9% + $0.30)
```

- Platform fee: 12% (negotiable per venue, minimum 6%)
- Fee comes from venue's revenue
- Stripe processing passed to buyer

#### Secondary Market (Fan Resells to Fan)
```
$100 resale:

Seller receives:    $85.00  (85%)
Platform receives:  $5.00   (5%)
Venue/Artist:       $10.00  (10% royalty, split per agreement)
Buyer pays:         $100 + 5% service fee + Stripe processing
```

- Platform fee: 5%
- Venue/Artist royalty: 10% (perpetual - applies to every resale)
- Buyer service fee: 5% (added on top)
- Stripe processing passed to buyer

### Competitive Advantage

TicketToken is the only platform offering perpetual royalties to venues and artists on secondary sales. Competitors like Ticketmaster, AXS, and StubHub keep 100% of resale fees after the first transaction. Our model ensures venues and artists earn from every resale, forever.

---

## Part 2: Problems Found

### Wrong Fee Values

| File | Current Value | Should Be |
|------|---------------|-----------|
| `marketplace-service/src/config/constants.ts` | Platform: 5%, Venue: 5% | Platform: 5%, Venue: 10% |
| `marketplace-service/src/utils/constants.ts` | Platform: 2.5% | Should match above or be removed |
| `marketplace-service/src/services/fee-distribution.service.ts` | Platform: 2.5%, Venue: 5% | Platform: 5%, Venue: 10% |
| `marketplace-service/src/services/stripe-payment.service.ts` | Platform: 5% or 2.5%, Venue: 5% | Platform: 5%, Venue: 10% |
| `marketplace-service/src/services/fee.service.ts` | Uses wrong constants | Import from shared |
| `marketplace-service/src/models/fee.model.ts` | Venue default: 5% | Venue default: 10% |
| `marketplace-service/src/models/venue-settings.model.ts` | Royalty default: 5% | Royalty default: 10% |
| `payment-service/src/config/fees.ts` | Tiered: 8.2%/7.9%/7.5% | Default: 12% |
| `payment-service/src/services/fee-calculator.service.ts` | 10% + $2 per ticket | 12%, no per-ticket fee |
| `payment-service/src/services/core/fee-calculator.service.ts` | Uses wrong tier config | Import from shared |
| `payment-service/src/services/marketplace/royalty-splitter.service.ts` | Hardcoded 10% | Import from shared |
| `payment-service/src/services/marketplace/escrow.service.ts` | Hardcoded 5% | Import from shared |
| `order-service/src/config/fees.ts` | 5% | 12% |
| `order-service/src/config/order.config.ts` | 5% | 12% |

### Missing Features

| Feature | Status |
|---------|--------|
| Per-venue fee override | Not implemented |
| Fee expiration for negotiated deals | Not implemented |
| Buyer service fee on resales (5%) | Not implemented |
| Artist split on resales | Code exists but not connected to payment flow |

### Architecture Issues

| Issue | Description |
|-------|-------------|
| No single source of truth | Fees hardcoded in 14+ files |
| Conflicting values | Same fee has 5 different values across codebase |
| Format inconsistency | Some files use decimals (0.05), others use percentages (5.00) |
| No audit trail | No tracking when venue fees are changed |

---

## Part 3: Files to Create

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `backend/shared/src/config/fees.config.ts` | Single source of truth for all fee values |
| 2 | `backend/shared/src/services/venue-fees.service.ts` | Get correct fees for a venue, handle overrides and expiration |
| 3 | `backend/services/venue-service/src/migrations/XXX_add_venue_fee_override.ts` | Add per-venue fee override columns to database |

---

## Part 4: Files to Update

| # | File Path | Change Required |
|---|-----------|-----------------|
| 1 | `backend/shared/src/index.ts` | Export new fee config and service |
| 2 | `backend/services/venue-service/src/models/venue.model.ts` | Add fee override fields to interface and transforms |
| 3 | `backend/services/marketplace-service/src/config/constants.ts` | Import from shared config, fix venue fee to 10% |
| 4 | `backend/services/marketplace-service/src/utils/constants.ts` | Import from shared config or remove duplicate |
| 5 | `backend/services/marketplace-service/src/services/fee-distribution.service.ts` | Import from shared config |
| 6 | `backend/services/marketplace-service/src/services/stripe-payment.service.ts` | Import from shared config |
| 7 | `backend/services/marketplace-service/src/services/fee.service.ts` | Import from shared config |
| 8 | `backend/services/marketplace-service/src/services/transfer.service.ts` | Use venue-specific fees from service |
| 9 | `backend/services/marketplace-service/src/models/fee.model.ts` | Import from shared config |
| 10 | `backend/services/marketplace-service/src/models/venue-settings.model.ts` | Import from shared config |
| 11 | `backend/services/payment-service/src/config/fees.ts` | Import from shared config, fix default to 12% |
| 12 | `backend/services/payment-service/src/services/fee-calculator.service.ts` | Import from shared config, remove per-ticket fee |
| 13 | `backend/services/payment-service/src/services/core/fee-calculator.service.ts` | Import from shared config |
| 14 | `backend/services/payment-service/src/services/marketplace/royalty-splitter.service.ts` | Import from shared config |
| 15 | `backend/services/payment-service/src/services/marketplace/escrow.service.ts` | Import from shared config |
| 16 | `backend/services/order-service/src/config/fees.ts` | Import from shared config |
| 17 | `backend/services/order-service/src/config/order.config.ts` | Import from shared config |

---

## Part 5: Database Changes

### New Columns for `venues` Table

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `primary_fee_percentage` | decimal(5,2) | NULL | Override default 12% for this venue |
| `secondary_royalty_percentage` | decimal(5,2) | NULL | Override default 10% royalty |
| `fee_notes` | varchar(500) | NULL | "Year 1 launch partner deal" |
| `fee_expires_at` | timestamp | NULL | When negotiated rate expires |
| `fee_approved_by` | varchar(100) | NULL | Who approved the deal |

### Logic

- NULL = use system default
- Value set = use override
- If `fee_expires_at` has passed, revert to default

---

## Part 6: Implementation Order

### Phase 1: Foundation
1. Create `backend/shared/src/config/fees.config.ts`
2. Create `backend/shared/src/services/venue-fees.service.ts`
3. Update `backend/shared/src/index.ts` to export new modules

### Phase 2: Database
4. Create venue fee override migration
5. Run migration
6. Update `venue.model.ts` with new fields

### Phase 3: Marketplace Service
7. Update `config/constants.ts`
8. Update `utils/constants.ts`
9. Update `fee-distribution.service.ts`
10. Update `stripe-payment.service.ts`
11. Update `fee.service.ts`
12. Update `transfer.service.ts`
13. Update `fee.model.ts`
14. Update `venue-settings.model.ts`

### Phase 4: Payment Service
15. Update `config/fees.ts`
16. Update `fee-calculator.service.ts`
17. Update `core/fee-calculator.service.ts`
18. Update `royalty-splitter.service.ts`
19. Update `escrow.service.ts`

### Phase 5: Order Service
20. Update `config/fees.ts`
21. Update `order.config.ts`

### Phase 6: Testing
22. Update test files with correct expected values
23. Run full test suite
24. Manual verification with test transactions

---

## Part 7: Summary

| Category | Count |
|----------|-------|
| New files to create | 3 |
| Existing files to update | 17 |
| Database migrations | 1 |
| Total files affected | 21 |

---

## Part 8: Correct Fee Values Reference

After remediation, these are the authoritative values:

### Primary Market

| Item | Value | Source |
|------|-------|--------|
| Default platform fee | 12% | `FEE_CONFIG.PRIMARY.DEFAULT_PERCENTAGE` |
| Minimum platform fee | 6% | `FEE_CONFIG.PRIMARY.MIN_PERCENTAGE` |
| Maximum platform fee | 15% | `FEE_CONFIG.PRIMARY.MAX_PERCENTAGE` |

### Secondary Market

| Item | Value | Source |
|------|-------|--------|
| Platform fee | 5% | `FEE_CONFIG.SECONDARY.PLATFORM_FEE_PERCENTAGE` |
| Default venue/artist royalty | 10% | `FEE_CONFIG.SECONDARY.DEFAULT_ROYALTY_PERCENTAGE` |
| Buyer service fee | 5% | `FEE_CONFIG.SECONDARY.BUYER_SERVICE_FEE_PERCENTAGE` |
| Minimum seller take | 85% | `FEE_CONFIG.SECONDARY.MIN_SELLER_PERCENTAGE` |

### Processing

| Item | Value | Source |
|------|-------|--------|
| Stripe percentage | 2.9% | `FEE_CONFIG.PROCESSING.STRIPE_PERCENTAGE` |
| Stripe fixed fee | $0.30 | `FEE_CONFIG.PROCESSING.STRIPE_FIXED_CENTS` |

---

## Related Documents

- `FEE_CALCULATOR_ARCHITECTURE.md` - Technical architecture of fee calculation
- `AUDIT_FINDINGS.md` - General audit findings
- `GAP_ANALYSIS.md` - Feature gap analysis
- `REMEDIATION_PLAN.md` - Overall remediation plan

