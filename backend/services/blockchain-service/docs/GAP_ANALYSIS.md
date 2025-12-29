# Blockchain Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Wallet Security | 3 | CRITICAL |
| Multi-Tenancy | 2 | CRITICAL |
| Data Consistency | 2 | HIGH |
| Idempotency | 1 | HIGH |
| Operational | 3 | MEDIUM |
| Frontend Features | 2 | MEDIUM |

---

## CRITICAL Issues

### GAP-BLOCKCHAIN-001: Private Keys in Plaintext
- **Severity:** CRITICAL
- **Audit:** 36-wallet-security.md, 37-key-management.md
- **Current:** Secret keys stored in plaintext JSON, no HSM/KMS
- **Risk:** 
  - Keys can be stolen from memory/disk
  - No hardware security
  - Single point of compromise
- **Fix:** 
  - Integrate AWS KMS or HashiCorp Vault
  - Never store keys in env vars or files
  - Use HSM for production

### GAP-BLOCKCHAIN-002: No Spending Limits or Multisig
- **Severity:** CRITICAL
- **Audit:** 36-wallet-security.md, 26-blockchain-integration.md
- **Current:** No per-transaction limits, no daily limits, no multisig
- **Risk:** 
  - Compromised key can drain all funds
  - No approval workflow for large transactions
- **Fix:**
  - Implement per-tx spending limits
  - Daily aggregate limits
  - Multisig for high-value operations

### GAP-BLOCKCHAIN-003: No Key Rotation
- **Severity:** CRITICAL
- **Audit:** 37-key-management.md
- **Current:** No mechanism to rotate keys
- **Risk:** Long-lived keys increase compromise window
- **Fix:** Implement key rotation procedures

### GAP-BLOCKCHAIN-004: Multi-Tenancy Broken
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:**
  - RLS FORCE not enabled
  - No WITH CHECK clause
  - Tenant passed as parameter (bypassable)
  - Missing tenant doesn't return 401
  - No UUID validation
- **Risk:** Cross-tenant data access

### GAP-BLOCKCHAIN-005: DB Updated Before Blockchain Confirmation
- **Severity:** CRITICAL
- **Audit:** 31-blockchain-database-consistency.md
- **Current:** Database updated immediately, blockchain async
- **Risk:** 
  - DB says minted, NFT never created
  - Ownership disputes
  - Inconsistent state

---

## HIGH Issues

### GAP-BLOCKCHAIN-006: No Idempotency Keys
- **Severity:** HIGH
- **Audit:** 07-idempotency.md
- **Current:**
  - No Idempotency-Key header support
  - No duplicate detection
  - No recovery points for partial failures
- **Risk:** Double-minting, duplicate transactions

### GAP-BLOCKCHAIN-007: No Reconciliation Job
- **Severity:** HIGH
- **Audit:** 31-blockchain-database-consistency.md
- **Current:** No periodic check comparing DB vs blockchain
- **Risk:** State drift goes undetected

### GAP-BLOCKCHAIN-008: Transaction Blockhash Issues
- **Severity:** HIGH
- **Audit:** 26-blockchain-integration.md
- **Current:**
  - No fresh blockhash on retry
  - No blockhash expiry check
- **Risk:** Failed retries, stuck transactions

---

## MEDIUM Issues

### GAP-BLOCKCHAIN-009: No Health Probes
- **Severity:** MEDIUM
- **Audit:** 12-health-checks.md
- **Current:** Missing /health/live, /health/ready, /health/startup
- **Impact:** Kubernetes can't properly manage pods

### GAP-BLOCKCHAIN-010: Public Routes No Auth
- **Severity:** MEDIUM
- **Current:** All blockchain query routes have NO authentication
- **Routes:**
  - GET /blockchain/balance/:address
  - GET /blockchain/tokens/:address
  - GET /blockchain/nfts/:address
  - GET /blockchain/transaction/:signature
  - GET /blockchain/transactions/:address
  - GET /blockchain/account/:address
  - GET /blockchain/token-supply/:mint
  - GET /blockchain/slot
  - GET /blockchain/blockhash
- **Note:** These may be intentionally public (read-only blockchain data), but should be rate-limited per user

### GAP-BLOCKCHAIN-011: In-Memory Rate Limiting
- **Severity:** MEDIUM
- **Audit:** 08-rate-limiting.md
- **Current:** Rate limiter not using Redis
- **Risk:** Rate limits reset on restart, don't work across instances

---

## Frontend-Related Gaps

### GAP-BLOCKCHAIN-012: No User Wallet Connection Flow
- **Severity:** MEDIUM
- **User Story:** "I want to connect my Phantom wallet to my account"
- **Current:**
  - `user_wallet_connections` table exists
  - No endpoint to connect wallet
  - No endpoint to list my connected wallets
  - No endpoint to disconnect wallet
- **Needed:**
  - POST /wallets/connect - initiate wallet connection (sign message)
  - POST /wallets/verify - verify signed message, link wallet
  - GET /wallets/me - list my connected wallets
  - DELETE /wallets/:address - disconnect wallet
- **Impact:** Can't build wallet connection UI

### GAP-BLOCKCHAIN-013: No User NFT Portfolio View
- **Severity:** MEDIUM
- **User Story:** "Show me all my ticket NFTs"
- **Current:**
  - GET /blockchain/nfts/:address exists (queries blockchain)
  - No user-friendly endpoint
  - No filtering by ticket type/event
  - No caching
- **Needed:**
  - GET /me/nfts - my NFT portfolio (requires auth)
  - Filter by: event, status, date
  - Include ticket metadata (event name, date, seat)
- **Impact:** Can't build "My NFTs" screen properly

---

## All Routes Inventory

### blockchain.routes.ts (10 routes) - NO AUTH (public blockchain queries)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /blockchain/balance/:address | ❌ | SOL balance |
| GET | /blockchain/tokens/:address | ❌ | Token accounts |
| GET | /blockchain/nfts/:address | ❌ | NFTs by owner |
| GET | /blockchain/transaction/:signature | ❌ | Transaction details |
| GET | /blockchain/transactions/:address | ❌ | Recent transactions |
| POST | /blockchain/confirm-transaction | ❌ | Confirm tx |
| GET | /blockchain/account/:address | ❌ | Account info |
| GET | /blockchain/token-supply/:mint | ❌ | Token supply |
| GET | /blockchain/slot | ❌ | Current slot |
| GET | /blockchain/blockhash | ❌ | Latest blockhash |

### internal-mint.routes.ts (1 route) - INTERNAL AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /internal/mint-tickets | ✅ HMAC | Mint tickets (S2S) |

### health.routes.ts (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Basic health |
| GET | /health/detailed | Full status |
| GET | /health/db | Database check |
| GET | /health/solana | Solana RPC check |
| GET | /health/treasury | Treasury balance |

---

## Database Tables (6 tables)

| Table | RLS | Purpose |
|-------|-----|---------|
| wallet_addresses | ? | Wallet registry |
| user_wallet_connections | ? | User-wallet links |
| treasury_wallets | ? | Platform wallets |
| blockchain_events | ? | On-chain events |
| blockchain_transactions | ? | Transaction log |
| mint_jobs | ? | Minting queue |

---

## What Works Well

- RPC failover with multiple endpoints
- Circuit breaker implementation
- HMAC authentication on internal mint endpoint
- Basic validation middleware
- Graceful shutdown handlers

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| auth-service | User verification for wallet connection |
| ticket-service | Ticket data for minting |
| event-service | Event metadata for NFTs |

| Other services need from this | What |
|------------------------------|------|
| ticket-service | Mint tickets, verify ownership |
| minting-service | Execute mints |
| marketplace-service | Verify NFT ownership for listings |

---

## Priority Order for Fixes

### BEFORE LAUNCH (Security)
1. GAP-BLOCKCHAIN-001: Move keys to HSM/KMS
2. GAP-BLOCKCHAIN-002: Implement spending limits + multisig
3. GAP-BLOCKCHAIN-003: Key rotation procedures
4. GAP-BLOCKCHAIN-004: Fix multi-tenancy

### Immediate (Data Integrity)
5. GAP-BLOCKCHAIN-005: Don't update DB before blockchain confirms
6. GAP-BLOCKCHAIN-006: Add idempotency keys
7. GAP-BLOCKCHAIN-007: Reconciliation job
8. GAP-BLOCKCHAIN-008: Fix blockhash handling

### This Month (Frontend Features)
9. GAP-BLOCKCHAIN-012: Wallet connection endpoints
10. GAP-BLOCKCHAIN-013: User NFT portfolio endpoint
11. GAP-BLOCKCHAIN-009: Add K8s health probes
12. GAP-BLOCKCHAIN-011: Redis rate limiting

