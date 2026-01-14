# Blockchain Architecture Documentation

## Overview

The minting service interacts with the Solana blockchain to create compressed NFTs (cNFTs) representing tickets. This document covers the key architectural components and operational procedures.

---

## Table of Contents

1. [Wallet Architecture](#wallet-architecture)
2. [Key Rotation Procedures](#key-rotation-procedures)
3. [Metadata Storage](#metadata-storage)
4. [IPFS Media Guidelines](#ipfs-media-guidelines)
5. [Asset ID Management](#asset-id-management)
6. [Event Loop Monitoring](#event-loop-monitoring)

---

## Wallet Architecture

### Overview

The minting service uses a hierarchical wallet structure to manage different operational needs:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Wallet Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  Master Wallet  │    │  Treasury       │                    │
│  │  (Cold Storage) │───▶│  (Multi-sig)    │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
│                    ┌─────────────┴─────────────┐               │
│                    ▼                           ▼                │
│           ┌───────────────┐         ┌───────────────┐          │
│           │ Fee Payer     │         │ Collection    │          │
│           │ Wallet (Hot)  │         │ Authority     │          │
│           └───────────────┘         └───────────────┘          │
│                    │                           │                │
│                    ▼                           ▼                │
│           ┌───────────────┐         ┌───────────────┐          │
│           │ Minting       │         │ Update        │          │
│           │ Operations    │         │ Authority     │          │
│           └───────────────┘         └───────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Wallet Types

| Wallet | Purpose | Security Level | Location |
|--------|---------|----------------|----------|
| Master | Emergency recovery, policy changes | Highest | Cold storage (hardware wallet) |
| Treasury | Fund distribution, large transfers | High | Multi-sig (2-of-3) |
| Fee Payer | Transaction fees for minting | Medium | Hot wallet (KMS) |
| Collection Authority | Manages collection NFT | Medium | Hot wallet (KMS) |
| Update Authority | Metadata updates | Low | Service wallet |

### Security Layers

1. **Master Wallet**: Ledger/Trezor hardware wallet, never connected to service
2. **Treasury**: Squads multi-sig or similar, requires 2 of 3 signers
3. **Fee Payer**: AWS KMS or HashiCorp Vault, automated access
4. **Collection Authority**: Can be same as Fee Payer or separate

### Configuration

```typescript
// Environment variables for wallet configuration
MINTING_WALLET_PRIVATE_KEY     // Fee payer (base58 or JSON array)
COLLECTION_AUTHORITY_KEYPAIR   // Collection authority
MASTER_WALLET_ADDRESS          // For balance alerts (public key only)
TREASURY_WALLET_ADDRESS        // For refills (public key only)
```

---

## Key Rotation Procedures

### When to Rotate

- **Scheduled**: Quarterly or per security policy
- **Reactive**: After suspected compromise
- **Proactive**: Before key expiration

### Rotation Checklist

#### 1. Pre-Rotation

- [ ] Generate new keypair in secure environment
- [ ] Test new keypair on devnet
- [ ] Notify operations team
- [ ] Schedule maintenance window
- [ ] Back up current key (encrypted)

#### 2. Rotation Process

```bash
# 1. Generate new keypair (offline machine)
solana-keygen new --outfile new-minting-wallet.json

# 2. Get public key
solana-keygen pubkey new-minting-wallet.json

# 3. Fund new wallet from treasury
solana transfer <NEW_PUBKEY> 2 --from treasury.json

# 4. Update secrets manager
aws secretsmanager update-secret \
  --secret-id minting-service/wallet \
  --secret-string "$(cat new-minting-wallet.json)"

# 5. If using collection authority, transfer authority
# (requires current authority signature)
```

#### 3. Service Update

```bash
# 1. Deploy with new configuration
kubectl set env deployment/minting-service \
  MINTING_WALLET_VERSION=v2

# 2. Rolling restart
kubectl rollout restart deployment/minting-service

# 3. Verify minting works
curl -X POST http://minting-service/health/detailed
```

#### 4. Post-Rotation

- [ ] Verify new wallet is functioning
- [ ] Monitor for errors (30 minutes)
- [ ] Update documentation
- [ ] Securely destroy old key (if not needed for recovery)
- [ ] Update multi-sig configurations if needed

### Emergency Rotation

In case of suspected compromise:

1. **Immediately**: Pause minting operations
2. **Transfer**: Move remaining funds to treasury
3. **Generate**: Create new keypair
4. **Update**: Deploy with new key
5. **Investigate**: Determine breach cause
6. **Document**: File incident report

---

## Metadata Storage

### On-Chain vs Off-Chain

| Data Type | Location | Reason |
|-----------|----------|--------|
| Name, Symbol | On-chain | Core identity |
| URI (link to full metadata) | On-chain | Reference pointer |
| Attributes | Off-chain (IPFS) | Size/cost |
| Image | Off-chain (IPFS) | Size |
| Animation | Off-chain (IPFS) | Size |

### Metadata JSON Schema

```json
{
  "name": "Event Name - Ticket #001",
  "symbol": "TICKET",
  "description": "VIP ticket for Event Name on 2026-01-15",
  "image": "ipfs://QmXXXXXXXXXXXXXXXXXXXXX",
  "animation_url": "ipfs://QmYYYYYYYYYYYYYYYYYYYYY",
  "external_url": "https://tickettoken.io/ticket/xxx",
  "attributes": [
    { "trait_type": "Event", "value": "Event Name" },
    { "trait_type": "Date", "value": "2026-01-15" },
    { "trait_type": "Venue", "value": "Madison Square Garden" },
    { "trait_type": "Section", "value": "A" },
    { "trait_type": "Row", "value": "1" },
    { "trait_type": "Seat", "value": "15" },
    { "trait_type": "Tier", "value": "VIP" },
    { "trait_type": "Transferable", "value": "true" }
  ],
  "properties": {
    "files": [
      { "uri": "ipfs://QmXXX", "type": "image/png" }
    ],
    "category": "ticket",
    "creators": [
      { "address": "...", "share": 100 }
    ]
  }
}
```

### Storage Best Practices

1. **Pin Content**: Always pin to multiple IPFS providers
2. **Verify CID**: Compute and verify CID before storing
3. **Backup**: Store original files in S3/GCS as backup
4. **Immutability**: Never update IPFS content; create new CID
5. **Cache**: Cache metadata locally for quick access

---

## IPFS Media Guidelines

### Supported Formats

| Type | Format | Max Size | Recommended |
|------|--------|----------|-------------|
| Image | PNG, JPEG, WebP | 10 MB | PNG @1024x1024 |
| Animation | GIF, MP4, WebM | 50 MB | MP4 @720p |
| 3D Model | GLB, GLTF | 25 MB | GLB optimized |

### Upload Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Client  │───▶│ Service │───▶│ Pinata  │───▶│  IPFS   │
│ Upload  │    │ Process │    │ Pin     │    │ Network │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                    │              │
                    ▼              ▼
              ┌─────────┐    ┌─────────┐
              │ Verify  │    │ NFT.Stg │
              │ CID     │    │ Backup  │
              └─────────┘    └─────────┘
```

### CID Verification

```typescript
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

async function verifyCID(content: Buffer, expectedCid: string): Promise<boolean> {
  const hash = await sha256.digest(content);
  const cid = CID.create(1, raw.code, hash);
  return cid.toString() === expectedCid;
}
```

### Failover Strategy

1. **Primary**: Pinata (paid, reliable)
2. **Secondary**: NFT.Storage (free, decentralized)
3. **Backup**: S3/GCS (centralized, always available)

---

## Asset ID Management

### What is Asset ID?

The Asset ID is the unique identifier for a compressed NFT on Solana. Unlike regular NFTs, cNFTs don't have separate mint accounts; they're identified by their position in the Merkle tree.

### Format

```
Asset ID = hash(tree_address + leaf_index + data_hash)
```

### Retrieval Methods

#### 1. From Minting Transaction

```typescript
// After minting, extract from transaction
const assetId = await getAssetIdFromTransaction(signature, connection);
```

#### 2. From DAS API

```typescript
// Query by creator/collection
const assets = await das.getAssetsByCreator(creatorAddress);
const assetId = assets[0].id;
```

#### 3. From Database

```sql
SELECT asset_id, ticket_id, tenant_id
FROM mints
WHERE ticket_id = 'xxx' AND status = 'completed';
```

### Storage Schema

```sql
CREATE TABLE mints (
  id UUID PRIMARY KEY,
  ticket_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  asset_id VARCHAR(255),  -- Populated after successful mint
  tree_address VARCHAR(255),
  leaf_index BIGINT,
  signature VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Index for quick lookups
  CONSTRAINT idx_mints_asset_id UNIQUE (asset_id) WHERE asset_id IS NOT NULL
);
```

### Asset ID Validation

```typescript
function isValidAssetId(assetId: string): boolean {
  // Asset IDs are base58-encoded 32-byte hashes
  try {
    const decoded = bs58.decode(assetId);
    return decoded.length === 32;
  } catch {
    return false;
  }
}
```

---

## Event Loop Monitoring

### Why Monitor Event Loop?

Node.js is single-threaded. If the event loop is blocked, the service cannot:
- Process HTTP requests
- Handle queue jobs
- Respond to health checks

### Monitoring Implementation

```typescript
// Already implemented in health.ts
export function startEventLoopMonitoring(intervalMs: number = 1000): void {
  setInterval(() => {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      eventLoopLagGauge.set(lag);
      
      if (lag > 100) {
        logger.warn('High event loop lag', { lagMs: lag });
      }
    });
  }, intervalMs);
}
```

### Thresholds

| Lag (ms) | Severity | Action |
|----------|----------|--------|
| < 10 | Normal | None |
| 10-50 | Warning | Monitor |
| 50-100 | High | Investigate |
| > 100 | Critical | Alert ops team |

### Common Causes

1. **Synchronous operations**: Large JSON parsing, crypto
2. **External calls**: Unoptimized database queries
3. **Memory pressure**: GC pauses
4. **CPU-bound work**: Complex computations

### Mitigation

1. Use worker threads for CPU-bound work
2. Stream large data instead of loading all at once
3. Use async/await properly
4. Profile with `--prof` flag

---

## References

- [Solana Compressed NFTs](https://docs.solana.com/developing/programming-model/overview)
- [Metaplex Bubblegum](https://docs.metaplex.com/programs/compression/)
- [IPFS Documentation](https://docs.ipfs.tech/)
- [Digital Asset Standard API](https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api)
