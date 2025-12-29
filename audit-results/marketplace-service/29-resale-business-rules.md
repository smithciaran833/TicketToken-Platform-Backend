# Marketplace Service - 29 Resale Business Rules Audit

**Service:** marketplace-service
**Document:** 29-resale-business-rules.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 95% (19/20 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 1 | Validation before lock acquisition |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Price Validation (6/6 PASS)

- PRICE1: Max multiplier enforced - PASS (3x default)
- PRICE2: Min multiplier enforced - PASS (1x default)
- PRICE3: Below face value configurable - PASS
- PRICE4: Absolute min price - PASS ($1.00)
- PRICE5: Absolute max price - PASS ($10,000)
- PRICE6: Price multiplier calculated - PASS

## 3.2 Listing Constraints (5/6)

- LIST1: Duplicate prevention - PASS
- LIST2: Per-event limit - PASS (8 default)
- LIST3: Total limit - PASS (50 default)
- LIST4: Advance timing - PASS (720 hours)
- LIST5: Past event check - PASS
- LIST6: Distributed lock - PARTIAL

## 3.3 Transfer Constraints (4/4 PASS)

- TRANS1: Transfer cutoff - PASS (4 hours)
- TRANS2: Self-purchase prevention - PASS
- TRANS3: Listing status check - PASS
- TRANS4: Expiration check - PASS

## 3.4 Venue Rules (4/4 PASS)

- VENUE1: Settings loaded - PASS
- VENUE2: Max markup per venue - PASS
- VENUE3: Transfer cutoff per venue - PASS
- VENUE4: Listing limits per venue - PASS

## Business Rules Matrix

| Rule | Default | Configurable |
|------|---------|--------------|
| Max price multiplier | 3.0x | Per-venue |
| Min price multiplier | 1.0x | Per-venue |
| Allow below face | false | Per-venue |
| Transfer cutoff | 4 hours | Per-venue |
| Listing advance | 720 hours | Per-venue |
| Max per event | 8 | Per-venue |
| Max total | 50 | Per-venue |
| Absolute min | $1.00 | Global |
| Absolute max | $10,000 | Global |

## Remediations

### P1: Move Validation Inside Lock
Ensure duplicate checks happen inside withLock to prevent race conditions

## Strengths

- Comprehensive price validation
- Per-venue configurable rules
- Timing constraints enforced
- User listing limits
- Self-purchase prevention
- Clear error messages
- Well-organized constants

Resale Business Rules Score: 95/100
