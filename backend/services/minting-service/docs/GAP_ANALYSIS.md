# Minting Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Authentication | 1 | CRITICAL |
| Wallet Security | 3 | CRITICAL |
| Multi-Tenancy | 1 | CRITICAL |
| Idempotency | 1 | HIGH |
| Graceful Degradation | 1 | HIGH |
| Operational | 2 | MEDIUM |
| Frontend Features | 1 | LOW |

---

## CRITICAL Issues

### GAP-MINT-001: Admin Routes Have NO Authentication
- **Severity:** CRITICAL
- **Audit:** 01-security.md
- **Current:**
```typescript
/**
 * Admin routes for managing the minting service
 *
 * Authentication should be added in production
 */
```
- **Unprotected routes:**
  - GET /admin/dashboard
  - POST /admin/batch-mint
  - GET /admin/batch-mint/estimate
  - POST /admin/reconcile/:venueId
  - POST /admin/reconcile/:venueId/fix
  - GET /admin/reconcile/:venueId/history
  - GET /admin/cache/stats
  - DELETE /admin/cache/:ticketId
  - DELETE /admin/cache/clear
  - GET /admin/mints
  - GET /admin/mints/:ticketId
  - GET /admin/system/status
  - GET /admin/stats/:venueId
- **Risk:** Anyone can mint NFTs, clear caches, view all minting data
- **Fix:** Add admin authentication middleware to all /admin/* routes

### GAP-MINT-002: Private Keys Not in HSM/KMS
- **Severity:** CRITICAL
- **Audit:** 36-wallet-security.md, 37-key-management.md
- **Current:** Keys loaded from file (devnet-wallet.json)
- **Risk:** Keys can be stolen, no hardware protection
- **Fix:** Integrate AWS KMS or HashiCorp Vault

### GAP-MINT-003: No Spending Limits or Multisig
- **Severity:** CRITICAL
- **Audit:** 36-wallet-security.md
- **Current:** Single wallet, no limits, no multisig
- **Risk:** Compromised key = unlimited minting
- **Fix:** Implement transaction limits and multisig for large batches

### GAP-MINT-004: No Key Rotation
- **Severity:** CRITICAL
- **Audit:** 36-wallet-security.md
- **Current:** No rotation mechanism
- **Fix:** Implement key rotation procedures

### GAP-MINT-005: Multi-Tenancy Not Implemented
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:**
  - RLS FORCE not enabled
  - No SET LOCAL for tenant
  - No tenant middleware
  - Missing tenant doesn't return 401
  - Jobs don't include tenant_id
- **Risk:** Cross-tenant NFT minting, data leakage

---

## HIGH Issues

### GAP-MINT-006: No Idempotency for Minting
- **Severity:** HIGH
- **Audit:** 07-idempotency.md, 31-nft-minting-operations.md
- **Current:**
  - No idempotency key system
  - No duplicate detection
  - Race conditions possible
- **Risk:** Double-minting same ticket
- **Fix:** Add idempotency_key column, check before mint

### GAP-MINT-007: No Circuit Breakers
- **Severity:** HIGH
- **Audit:** 13-graceful-degradation.md
- **Current:** No circuit breakers on Solana RPC, IPFS
- **Risk:** Cascading failures when dependencies down

### GAP-MINT-008: No User Notification on Mint Failure
- **Severity:** HIGH
- **Audit:** 31-nft-minting-operations.md
- **Current:** Failed mints are logged but user never notified
- **Fix:** Integrate with notification-service

---

## MEDIUM Issues

### GAP-MINT-009: No Input Validation on Admin Routes
- **Severity:** MEDIUM
- **Audit:** 02-input-validation.md
- **Current:** No schema validation on body/params
- **Risk:** Invalid data, injection

### GAP-MINT-010: Missing Health Probes
- **Severity:** MEDIUM
- **Audit:** 12-health-checks.md
- **Current:** Missing /health/startup
- **Impact:** K8s lifecycle management issues

---

## Frontend-Related Gaps

### GAP-MINT-011: No User-Facing Mint Status Endpoint
- **Severity:** LOW
- **User Story:** "I want to see if my ticket NFT has been minted"
- **Current:** Only admin endpoints exist
- **Note:** This may be handled by ticket-service or blockchain-service
- **Verify:** Check if users can see NFT minting status elsewhere

---

## All Routes Inventory

### admin.ts (13 routes) - NO AUTH ❌
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /admin/dashboard | ❌ | Dashboard stats |
| POST | /admin/batch-mint | ❌ | Batch mint NFTs |
| GET | /admin/batch-mint/estimate | ❌ | Cost estimate |
| POST | /admin/reconcile/:venueId | ❌ | Run reconciliation |
| POST | /admin/reconcile/:venueId/fix | ❌ | Fix discrepancies |
| GET | /admin/reconcile/:venueId/history | ❌ | Reconciliation history |
| GET | /admin/cache/stats | ❌ | Cache statistics |
| DELETE | /admin/cache/:ticketId | ❌ | Invalidate cache |
| DELETE | /admin/cache/clear | ❌ | Clear all cache |
| GET | /admin/mints | ❌ | List recent mints |
| GET | /admin/mints/:ticketId | ❌ | Get mint details |
| GET | /admin/system/status | ❌ | System health |
| GET | /admin/stats/:venueId | ❌ | Venue stats |

### internal-mint.ts (1 route) - S2S AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /internal/mint-tickets | ✅ HMAC | Internal mint request |

### webhook.ts (1 route)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /webhook/payment-completed | ? | Payment webhook |

### health.routes.ts / health.ts (4+ routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Basic health |
| GET | /health/full | Full status |
| GET | /health/ready | Readiness |
| GET | /health/live | Liveness |

---

## Database Tables (5 tables)

| Table | RLS | Purpose |
|-------|-----|---------|
| collections | ? | NFT collections |
| nft_mints | ? | Mint records |
| nfts | ? | NFT metadata |
| ticket_mints | ? | Ticket-to-NFT mapping |
| minting_reconciliation_reports | ? | Reconciliation history |

---

## Priority Order for Fixes

### BEFORE LAUNCH (Security)
1. GAP-MINT-001: Add auth to admin routes
2. GAP-MINT-002: Move keys to HSM/KMS
3. GAP-MINT-003: Spending limits + multisig
4. GAP-MINT-005: Fix multi-tenancy

### Immediate (Data Integrity)
5. GAP-MINT-006: Add idempotency for minting
6. GAP-MINT-007: Add circuit breakers
7. GAP-MINT-008: User notification on failure

### This Month
8. GAP-MINT-009: Input validation
9. GAP-MINT-010: Health probes
10. GAP-MINT-004: Key rotation procedures

