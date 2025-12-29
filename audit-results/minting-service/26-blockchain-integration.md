# Minting Service - 26 Blockchain Integration Audit

**Service:** minting-service
**Document:** 26-blockchain-integration.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 30% (16/53 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Wallet from file, Public RPC, No blockhash refresh, No DAS API |
| HIGH | 4 | Hardcoded priority fees, No tx timeout, Collection unverified, No reconciliation |
| MEDIUM | 4 | No spending limits, No key rotation, Centralized metadata, Single wallet |
| LOW | 0 | None |

## 1. Transaction Handling (3/10)

- Confirmed before DB update - PARTIAL
- Exponential backoff - PASS
- Fresh blockhash on retry - FAIL
- Blockhash expiry check - FAIL
- Transaction timeout - FAIL
- Failed tx logged - PASS
- Priority fees dynamic - PARTIAL
- Compute units estimated - FAIL
- Idempotency keys - FAIL

## 2. RPC Configuration (3/8)

- Multiple endpoints - PASS (3)
- Automatic failover - PASS
- No public RPC in prod - FAIL
- RPC health checks - FAIL
- Credentials in secrets - FAIL
- Rate limiting handled - PASS
- DAS API configured - FAIL

## 3. Wallet Security (3/10)

- Keys not in source - PASS
- Keys not in env vars - PASS
- Keys from secrets/HSM - FAIL
- Separate wallets - FAIL
- Spending limits - PARTIAL
- Multisig - FAIL
- Key rotation - FAIL
- Whitelist addresses - FAIL
- Local signing - PASS

## 4. cNFT Operations (1/9)

- DAS API used - FAIL
- Asset ownership verified - FAIL
- Collection authority set - PARTIAL
- Merkle tree sized - PASS
- Tree creator secured - FAIL
- Permanent metadata - PARTIAL
- Batch limited - PASS
- Finalized for asset ID - FAIL

## 5. State Reconciliation (2/8)

- Periodic reconciliation - FAIL
- Stale tx detection - FAIL
- Status re-check - FAIL
- Failed tx marked - PASS
- Audit trail - PASS
- Alerting on failures - FAIL
- Manual tools - FAIL

## 6. Metaplex Integration (4/8)

- Official packages - PASS
- Bubblegum ID - PASS
- Token Metadata ID - PASS
- Collection verified - FAIL
- Creator verified - FAIL
- Royalty basis points - PASS (500)
- Update authority - PARTIAL
- Metadata standard - PARTIAL

## Critical Remediations

### P0: Migrate Wallet to Secrets Manager
```typescript
const secretName = 'minting-service/wallet';
const walletData = await secretsManager.getSecretValue(secretName);
const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletData)));
```

### P0: Use Private RPC Endpoint
```typescript
const rpcUrl = process.env.HELIUS_RPC_URL; // Required, no fallback
```

### P0: Fresh Blockhash on Retry
```typescript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  // Then send...
}
```

### P0: Add DAS API for Ownership
```typescript
const response = await fetch(`${dasUrl}/getAsset`, {
  method: 'POST',
  body: JSON.stringify({ id: assetId })
});
const asset = await response.json();
if (asset.ownership.owner !== expectedOwner) throw new Error('Invalid owner');
```

### P1: Add Transaction Timeout
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60000);
await connection.confirmTransaction(signature, { signal: controller.signal });
```

### P1: Verify Collection on Mint
```typescript
collection: {
  key: umiPublicKey(collectionMint),
  verified: true // Requires collection authority signature
}
```

## Strengths

- Multiple RPC endpoints (3)
- Rate limit failover
- Exponential backoff on retries
- Official Metaplex packages
- Local key signing
- Transaction failures logged
- Failed transactions marked in DB
- Royalty fees configured (5%)
- Queue-based minting
- Balance check before mint

Blockchain Integration Score: 30/100
