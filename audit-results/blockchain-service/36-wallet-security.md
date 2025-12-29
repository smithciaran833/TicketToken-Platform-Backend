# Blockchain Service - 36 Wallet Security Audit

**Service:** blockchain-service
**Document:** 36-wallet-security.md (combined with 37)
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 9% (7/78 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Plaintext keys, No HSM/KMS, No multisig, No spending limits |
| HIGH | 5 | Replay attack, No rate limiting, No input validation, Hard delete, Config commented |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## Treasury Wallet (1/66)

See 37-key-management.md for full details.

- Secret keys in plaintext JSON - CRITICAL FAIL
- No HSM/KMS - FAIL
- No multisig - FAIL
- No spending limits - FAIL
- No key rotation - FAIL

## User Wallet Manager (4/9)

- Signature verification - PASS (tweetnacl Ed25519)
- Signature required for connect - PASS
- Connection history logged - PASS
- Ownership verification - PASS
- Replay attack prevention - FAIL
- Rate limiting - FAIL
- Input validation - FAIL
- Error message safety - PARTIAL
- Audit trail - PARTIAL

## Fee Manager (2/3)

- Dynamic fee calculation - PASS
- Balance check - PASS
- Config initialization - FAIL (commented out)

## Critical Evidence

### Replay Attack Vulnerability
```typescript
const signMessage = message || `Connect wallet to TicketToken: ${userId}`;
// MISSING: nonce, timestamp, expiration
```

### No Input Validation
```typescript
async connectWallet(userId: string, walletAddress: string, ...) {
  // No validation that walletAddress is valid base58
}
```

### Hard Delete (No Audit Trail)
```typescript
await this.db.query(`
  DELETE FROM wallet_addresses  // HARD DELETE
  WHERE user_id = $1 AND wallet_address = $2
`, [userId, walletAddress]);
```

### Fee Config Commented Out
```typescript
constructor(connection: Connection) {
  this.connection = connection;
  // this.fees = config.fees; // COMMENTED OUT!
}
```

## Critical Remediations

### P0: Add Nonce for Replay Prevention
```typescript
async generateConnectionNonce(userId: string) {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const message = `Connect wallet\nUser: ${userId}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
  return { nonce, message, expiresAt };
}
```

### P0: Add Input Validation
```typescript
import { PublicKey } from '@solana/web3.js';
function validateWalletAddress(address: string): boolean {
  try { new PublicKey(address); return true; }
  catch { return false; }
}
```

### P1: Use Soft Delete
```typescript
UPDATE wallet_addresses SET deleted_at = NOW() WHERE user_id = $1
```

### P1: Add Rate Limiting
Apply per-user rate limit on connection attempts

### P1: Fix Fee Config
```typescript
this.fees = config.fees; // Uncomment
```

## Strengths

- Ed25519 signature verification (tweetnacl)
- Parameterized SQL queries (no injection)
- Connection history stored
- Ownership verification method
- Dynamic priority fee calculation

Wallet Security Score: 9/100
