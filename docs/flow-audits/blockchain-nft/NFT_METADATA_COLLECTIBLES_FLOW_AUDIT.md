# NFT METADATA / COLLECTIBLES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | NFT Metadata / Collectibles |

---

## Executive Summary

**WORKING - Comprehensive metadata system**

| Component | Status |
|-----------|--------|
| MetadataService | ✅ Working |
| IPFS upload | ✅ Working |
| Standard NFT metadata format | ✅ Implemented |
| MetadataCache (Redis) | ✅ Working |
| Event attributes | ✅ Included |
| Ticket attributes | ✅ Included |
| Seat/tier info | ✅ Included |
| Retry logic | ✅ Implemented |
| Collectible features | ⚠️ Basic only |

**Bottom Line:** Full NFT metadata system with IPFS upload, standard Metaplex format, Redis caching, and comprehensive ticket attributes. Metadata includes event name, date, venue, tier, seat, and ticket IDs. Collectible-specific features (rarity, unlockables, post-event content) are not implemented.

---

## Metadata Format

**File:** `backend/services/minting-service/src/services/MetadataService.ts`

### Standard NFT Metadata Structure
```typescript
const nftMetadata: IPFSMetadata = {
  name: `Ticket #${metadata.ticketId}`,
  symbol: 'TCKT',
  description: `Event ticket for ${metadata.eventName}`,
  image: metadata.image || 'https://arweave.net/placeholder-ticket-image',
  
  attributes: [
    { trait_type: 'Event ID', value: metadata.eventId },
    { trait_type: 'Order ID', value: metadata.orderId },
    { trait_type: 'Ticket ID', value: metadata.ticketId },
    { trait_type: 'Issue Date', value: new Date().toISOString() },
    { trait_type: 'Event Name', value: metadata.eventName },
    { trait_type: 'Event Date', value: metadata.eventDate },
    { trait_type: 'Venue', value: metadata.venue },
    { trait_type: 'Tier', value: metadata.tier },
    { trait_type: 'Seat', value: metadata.seatNumber }
  ],
  
  properties: {
    files: [],
    category: 'ticket'
  }
};
```

### Input Interface
```typescript
interface TicketMetadata {
  ticketId: string;
  orderId: string;
  eventId: string;
  eventName?: string;
  eventDate?: string;
  venue?: string;
  tier?: string;
  seatNumber?: string;
  image?: string;
}
```

---

## IPFS Upload

### Upload Flow
```typescript
async function uploadToIPFS(metadata: TicketMetadata): Promise<string> {
  // 1. Prepare NFT metadata in standard format
  const nftMetadata = { ... };
  
  // 2. Upload to IPFS with retry logic
  const ipfsService = getIPFSService();
  const result = await retryAsync(
    () => ipfsService.uploadJSON(nftMetadata),
    3,     // max retries
    2000,  // initial delay
    2      // backoff multiplier
  );
  
  // 3. Return IPFS URL
  return result.ipfsUrl;
}
```

### Result
```typescript
{
  ipfsHash: 'Qm...',
  ipfsUrl: 'ipfs://Qm...',
  pinataUrl: 'https://gateway.pinata.cloud/ipfs/Qm...'
}
```

---

## Metadata Caching

**File:** `backend/services/minting-service/src/services/MetadataCache.ts`

### Features

| Feature | Status |
|---------|--------|
| Redis-based caching | ✅ Working |
| TTL support | ✅ Working (default 1 hour) |
| get/set/delete | ✅ Working |
| getOrSet pattern | ✅ Working |
| Cache IPFS metadata (24 hours) | ✅ Working |
| Cache mint transactions | ✅ Working |
| Invalidation | ✅ Working |
| Cache statistics | ✅ Working |
| Metrics (hits/misses) | ✅ Working |

### Key Methods
```typescript
// Cache IPFS metadata for 24 hours
await metadataCache.cacheIPFSMetadata(ticketId, metadataUri);

// Get cached metadata
const uri = await metadataCache.getCachedIPFSMetadata(ticketId);

// Cache mint transaction
await metadataCache.cacheMintTransaction(ticketId, signature);

// Invalidate all ticket cache
await metadataCache.invalidateTicket(ticketId);
```

---

## What's Missing for Collectibles

### 1. Rarity Attributes
```typescript
// NOT IMPLEMENTED
attributes: [
  { trait_type: 'Rarity', value: 'Legendary' },
  { trait_type: 'Edition', value: '1 of 100' },
  { trait_type: 'Series', value: 'VIP Collection' }
]
```

### 2. Unlockable Content
```typescript
// NOT IMPLEMENTED
properties: {
  files: [
    { uri: 'ipfs://unlockable-video', type: 'video/mp4', isUnlockable: true }
  ],
  unlockable: {
    type: 'video',
    description: 'Exclusive backstage footage'
  }
}
```

### 3. Post-Event Content Update

No mechanism to update metadata after event with:
- Photos from the event
- Commemorative content
- Attendance verification

### 4. Collection Grouping
```typescript
// NOT IMPLEMENTED
collection: {
  name: 'Summer Festival 2025',
  family: 'TicketToken Events'
}
```

---

## Recommendations

### P3 - Add Collectible Features

| Task | Effort |
|------|--------|
| Add rarity/edition attributes | 0.5 day |
| Add collection metadata | 0.5 day |
| Implement metadata update endpoint | 1 day |
| Add unlockable content support | 1.5 days |
| **Total** | **3.5 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `minting-service/src/services/MetadataService.ts` | Metadata preparation |
| `minting-service/src/services/MetadataCache.ts` | Redis caching |
| `minting-service/src/config/ipfs.ts` | IPFS configuration |
| `minting-service/src/services/MintingOrchestrator.ts` | Orchestration |

---

## Related Documents

- `NFT_MINTING_LIFECYCLE_FLOW_AUDIT.md` - Minting process
- `ON_CHAIN_VERIFICATION_FLOW_AUDIT.md` - Verification
