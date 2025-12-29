# Marketplace Service - 30 Royalty Fee Calculation Audit

**Service:** marketplace-service
**Document:** 30-royalty-fee-calculation.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 89% (16/18 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 2 | Platform fee not transferred, Network fee hardcoded |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Fee Calculation (5/6)

- FEE1: Platform fee calculated - PASS (2.5%)
- FEE2: Venue fee calculated - PASS (5%)
- FEE3: Seller receives calculated - PASS
- FEE4: Fee rates configurable - PASS
- FEE5: Rounding applied - PASS (Math.round)
- FEE6: Network fee tracked - PARTIAL (hardcoded)

## 3.2 Royalty Distribution (3/4)

- ROY1: Distribution service - PASS
- ROY2: Platform wallet payment - PARTIAL (no transfer)
- ROY3: Venue wallet payment - PASS (Stripe)
- ROY4: Reconciliation - PASS

## 3.3 Fee Model (4/4 PASS)

- MOD1: Fee record created - PASS
- MOD2: Collection status tracked - PASS
- MOD3: Transfer IDs recorded - PASS
- MOD4: Statistics available - PASS

## 3.4 Integer Cents Handling (4/4 PASS)

- INT1: Amounts as integers - PASS
- INT2: Parsed as integers - PASS
- INT3: Percentages as decimals - PASS
- INT4: Shared utility used - PASS (percentOfCents)

## Fee Calculation Formula
```
Sale Price:     $100.00 (10000 cents)
Platform (2.5%): -$2.50 (250 cents)
Venue (5%):      -$5.00 (500 cents)
Seller Gets:    $92.50 (9250 cents)
```

## Fee Configuration

| Setting | Default | Configurable |
|---------|---------|--------------|
| Platform Fee | 2.5% | Yes (env) |
| Venue Fee | 5.0% | Yes (env) |
| Max Total Fee | 20% | No |
| Min Seller % | 80% | No |
| Network Fee | 0.00025 SOL | No |

## Remediations

### P1: Implement On-Chain Fee Transfer
Actually transfer platform fees for crypto payments

### P1: Make Network Fee Configurable
```
NETWORK_FEE = parseFloat(process.env.SOLANA_NETWORK_FEE || '0.00025')
```

## Strengths

- Integer cents throughout
- percentOfCents shared utility
- Math.round for precision
- Fee reconciliation available
- Stripe transfer tracking
- Statistics reporting
- Clear documentation

Royalty Fee Calculation Score: 89/100
