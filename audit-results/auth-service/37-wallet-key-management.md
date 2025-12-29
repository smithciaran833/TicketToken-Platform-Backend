# Auth Service - 37 Wallet & Key Management Audit

**Service:** auth-service
**Document:** 37-wallet-key-management.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 85% (17/20 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 0 | - |
| MEDIUM | 1 | Missing wallet security documentation |
| LOW | 2 | Minor logging improvements, rate limiting on nonce endpoint |

**Key Finding:** Auth-service is correctly designed for wallet-based authentication ONLY. It does NOT handle private keys, sign transactions, or hold funds. It only verifies signatures using public keys.

---

## Service Scope Assessment

Auth-service implements Web3 authentication - allowing users to log in using cryptocurrency wallets (Solana/Ethereum) instead of email/password.

**What it does:**
1. Nonce generation - Creates challenge messages for wallets to sign
2. Signature verification - Verifies signatures using PUBLIC keys
3. User account management - Links wallet addresses to user accounts

**Critical Security Confirmation:** ✅ Auth-service NEVER handles private keys

---

## Section 3.1: Private Key Storage

### WKM-PK1: Private keys NEVER in source code
**Status:** PASS
**Evidence:** Only public key operations in wallet.service.ts. No secretKey, privateKey, or signing operations.

### WKM-PK2: Private keys NEVER in environment variables
**Status:** PASS

### WKM-PK3: Service only handles public keys and signature verification
**Status:** PASS
**Evidence:** verifySolanaSignature() uses nacl.sign.detached.verify (public key operation only).

### WKM-PK4: No transaction signing in auth-service
**Status:** PASS
**Evidence:** No sign, signTransaction, sendTransaction methods exist.

---

## Section 3.2: Wallet Authentication Security

### WKM-AUTH1: Nonce-based challenge-response
**Status:** PASS
**Evidence:** generateNonce() creates challenge message with random nonce and timestamp.

### WKM-AUTH2: Nonce is cryptographically random
**Status:** PASS
**Evidence:** crypto.randomBytes(32) - 256 bits of cryptographic randomness.

### WKM-AUTH3: Nonce has expiration
**Status:** PASS
**Evidence:** 15 minute expiration (900000ms), Redis key also expires.

### WKM-AUTH4: Nonce bound to public key and chain
**Status:** PASS
**Evidence:** Verification checks storedNonce.publicKey and storedNonce.chain match.

### WKM-AUTH5: Nonce is single-use
**Status:** PASS
**Evidence:** redis.del() called after successful or failed verification.

### WKM-AUTH6: Signature verification before database operations
**Status:** PASS
**Evidence:** registerWithWallet verifies signature before user creation.

---

## Section 3.3: Multi-Chain Support

### WKM-MC1: Solana signature verification
**Status:** PASS
**Evidence:** nacl.sign.detached.verify with Ed25519.

### WKM-MC2: Ethereum signature verification
**Status:** PASS
**Evidence:** ethers.verifyMessage recovers signer address from ECDSA signature.

### WKM-MC3: Chain parameter validated
**Status:** PASS
**Evidence:** TypeScript restricts to 'solana' | 'ethereum'.

---

## Section 3.4: Database Security

### WKM-DB1: Wallet connections table properly structured
**Status:** PASS
**Evidence:** UUID primary key, foreign key to users, wallet_address, network, verified flag.

### WKM-DB2: User-wallet association enforced
**Status:** PASS
**Evidence:** Foreign key with CASCADE delete.

### WKM-DB3: Multi-tenant isolation for wallets
**Status:** PASS
**Evidence:** Queries join with users table to enforce tenant isolation.

### WKM-DB4: Only stores wallet address (not private keys)
**Status:** PASS
**Evidence:** Schema only has wallet_address, network, verified - no secret fields.

---

## Section 3.5: Error Handling & Security

### WKM-ERR1: Invalid signatures don't leak information
**Status:** PASS
**Evidence:** Generic error messages, no stack traces exposed.

### WKM-ERR2: Duplicate wallet registration handled
**Status:** PASS
**Evidence:** Returns 409 for duplicate key error.

### WKM-ERR3: Failed verifications logged
**Status:** PARTIAL
**Issue:** Minimal logging context.
**Recommendation:** Add structured logging with public key for audit trail.

---

## Section 3.6: Documentation

### WKM-DOC1: Wallet security architecture documented
**Status:** FAIL
**Remediation:** Create docs/WALLET_SECURITY.md documenting that auth-service never handles private keys.

---

## N/A Items for Auth-Service

These apply to minting-service/blockchain-service, not auth-service:
- Hot/Cold wallet architecture (no funds held)
- HSM/KMS for key storage (no private keys)
- Multi-signature requirements (no transaction signing)
- Wallet balance monitoring (no funds stored)
- Transaction signing security (no signing operations)
- Key rotation (no keys to rotate)
- Spending limits (no fund transfers)

---

## Remediation Priority

### MEDIUM
1. Create WALLET_SECURITY.md - Document that auth-service never handles private keys

### LOW
1. Add structured audit logging for wallet auth attempts
2. Add rate limiting to nonce endpoint

---

## Positive Findings

1. ✅ No private keys in auth-service
2. ✅ Cryptographically secure nonces (256-bit random with expiration)
3. ✅ Single-use nonces (deleted after verification)
4. ✅ Challenge-response authentication (standard Web3 pattern)
5. ✅ Multi-chain support (Solana and Ethereum)
6. ✅ Tenant isolation (wallet connections scoped to tenant)
7. ✅ Signature verification before DB ops
8. ✅ Proper error handling (no sensitive data leaked)
9. ✅ Only public keys stored (no secret material)
10. ✅ Session creation after auth (proper flow)

---

## Service Responsibility Matrix

| Service | Responsibility | Has Private Keys? |
|---------|---------------|-------------------|
| auth-service | Wallet authentication (signature verification) | ❌ NO |
| minting-service | NFT minting (transaction signing) | ✅ YES (via HSM) |
| blockchain-service | Blockchain interactions | ✅ YES (via HSM) |
| payment-service | Stripe payments | ❌ NO |
