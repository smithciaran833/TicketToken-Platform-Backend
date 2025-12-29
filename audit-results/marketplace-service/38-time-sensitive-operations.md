# Marketplace Service - 38 Time-Sensitive Operations Audit

**Service:** marketplace-service
**Document:** 38-time-sensitive-operations.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 67% (12/18 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No listing expiration job, Purchase cooldown disabled |
| HIGH | 2 | Expiration buffer not enforced, Generic cutoff message |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Time Constraints (4/6)

- TIME1: Transfer cutoff - PASS (4 hours)
- TIME2: Listing advance limit - PASS (720 hours)
- TIME3: Escrow timeout - PASS (5 minutes)
- TIME4: Transfer timeout - PASS (10 minutes)
- TIME5: Listing expiration buffer - PARTIAL
- TIME6: Purchase cooldown - FAIL (disabled)

## 3.2 Expiration Handling (2/4)

- EXP1: Escrow timeout auto-refund - PASS
- EXP2: Listing expiration check - PASS
- EXP3: Listing auto-expiration - PARTIAL (proc exists)
- EXP4: Expired listing cleanup - FAIL (no cron)

## 3.3 Cutoff Enforcement (3/4)

- CUT1: Transfer cutoff validation - PASS
- CUT2: Listing timing validation - PASS
- CUT3: Per-venue cutoff support - PASS
- CUT4: Cutoff error messages - PARTIAL

## 3.4 Scheduler/Background Jobs (3/4)

- JOB1: Escrow monitor running - PASS
- JOB2: Escrow metrics available - PASS
- JOB3: Manual intervention - PASS
- JOB4: Listing expiration job - FAIL

## Time Constants

| Setting | Value | Status |
|---------|-------|--------|
| Transfer cutoff | 4 hours | Active |
| Listing advance | 720 hours | Active |
| Escrow timeout | 5 minutes | Active |
| Transfer timeout | 10 minutes | Defined |
| Expiration buffer | 30 minutes | Not enforced |
| Purchase cooldown | 0 | Disabled |

## Scheduler Status

| Job | Interval | Status |
|-----|----------|--------|
| Escrow timeout check | 1 minute | Running |
| Listing expiration | None | Not scheduled |
| Transfer timeout | None | Not scheduled |

## Remediations

### P0: Add Listing Expiration Cron Job
```
async expireListings() {
  await db.raw('SELECT expire_marketplace_listings()');
}
// Run every 5 minutes
```

### P0: Enable Purchase Cooldown
```
PURCHASE_COOLDOWN_MINUTES: 5
```

### P1: Enforce Expiration Buffer
Set expires_at on listing creation using buffer

### P1: Improve Cutoff Error Message
Include event time and time remaining

## Strengths

- Escrow monitor running every minute
- Auto-refund for stuck escrows
- Per-venue cutoff configuration
- Transfer timing validation
- Manual intervention available
- Escrow metrics for monitoring

Time-Sensitive Operations Score: 67/100
