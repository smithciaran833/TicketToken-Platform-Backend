# TICKET SCANNING/VALIDATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Scanning/Validation |

---

## Executive Summary

**FINDING:** The scanning service is **well-implemented** with comprehensive security, but **does NOT verify blockchain ownership**. It only checks database ownership, which can be out of sync with the actual NFT owner on Solana.

---

## What Works Well ✅

The scanning service is one of the most complete services in the codebase:

| Feature | Status |
|---------|--------|
| QR code generation with HMAC | ✅ |
| QR rotation (30 seconds) | ✅ |
| Nonce-based replay attack prevention | ✅ |
| Timing-safe HMAC comparison | ✅ |
| Duplicate scan detection | ✅ |
| Re-entry policies | ✅ |
| Access zone enforcement | ✅ |
| Tenant isolation | ✅ |
| Venue isolation | ✅ |
| Device authorization | ✅ |
| Offline scanning support | ✅ |
| Rate limiting | ✅ |
| Comprehensive logging | ✅ |
| Metrics/Prometheus | ✅ |
| Graceful shutdown | ✅ |

---

## The Flow

### Step 1: Generate QR Code

**Endpoint:** `POST /api/qr/generate`

**File:** `backend/services/scanning-service/src/services/QRGenerator.ts`

**What happens:**
1. Get ticket from database
2. Generate timestamp + nonce
3. Create HMAC signature: `HMAC(ticketId:timestamp:nonce)`
4. Generate QR code image
5. Return QR with 30-second expiration

**Format:** `ticketId:timestamp:nonce:hmac`

---

### Step 2: Scan QR Code

**Endpoint:** `POST /api/scan`

**File:** `backend/services/scanning-service/src/services/QRValidator.ts`

**Authentication Required:** Yes (VENUE_STAFF, VENUE_MANAGER, ADMIN)

**Validation Steps:**

1. **Parse QR data** - Extract ticketId, timestamp, nonce, hmac
2. **Validate HMAC** - Timing-safe comparison
3. **Check nonce** - Prevent replay attacks (Redis)
4. **Check expiration** - 30-second window
5. **Validate device** - Must be registered and active
6. **Check venue isolation** - Staff can only scan at their venue
7. **Check tenant isolation** - Cross-tenant blocked
8. **Get ticket** - From database
9. **Check ticket tenant** - Must match staff tenant
10. **Check ticket venue** - Must match device venue
11. **Check event timing** - Not too early, not ended
12. **Check ticket validity period** - valid_from, valid_until
13. **Check ticket status** - REFUNDED, CANCELLED, TRANSFERRED blocked
14. **Check access zone** - GA, VIP, BACKSTAGE permissions
15. **Check duplicate scan** - Configurable window (default 10 min)
16. **Check re-entry policy** - Cooldowns, max re-entries
17. **Allow entry** - Update scan_count, log scan

---

## What's NOT Checked ❌

### No Blockchain Verification

The scanning service **never verifies**:
- Who owns the NFT on Solana
- If the NFT exists on blockchain
- If the NFT has been transferred on-chain

**Current validation:**
```typescript
// Only checks database
const ticketResult = await client.query(`
  SELECT t.*, e.name as event_name
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  WHERE t.id = $1
`, [ticketId]);
```

**What should also happen:**
```typescript
// Verify blockchain ownership
const nftOwner = await blockchainClient.getTicketOwner(ticket.ticket_pda);
const expectedOwner = await getUserWallet(ticket.user_id);

if (nftOwner !== expectedOwner) {
  return { valid: false, reason: 'BLOCKCHAIN_MISMATCH' };
}
```

---

## The Risk

### Scenario: Database/Blockchain Mismatch
```
1. Fan A buys ticket
   - Database: owner = Fan A ✅
   - Blockchain: owner = Fan A ✅

2. Fan A transfers to Fan B (gift)
   - Database: owner = Fan B ✅
   - Blockchain: owner = Fan A ❌ (transfer didn't call blockchain)

3. Fan A generates QR from their app
   - App still shows ticket (cached or API bug)
   - QR contains valid ticketId

4. Fan A scans at venue
   - Database check: ticket exists ✅
   - Database says owner = Fan B
   - But Fan A has the QR...
```

**Wait, this is actually protected!**

Looking closer at the flow:
- QR is generated from ticket ID
- But the app should only show tickets owned by the user
- If database says Fan B owns it, Fan A shouldn't see it

**The real risk is the opposite:**
```
1. Fan A owns ticket in database
2. Hacker transfers NFT on blockchain directly
3. Database still says Fan A owns it
4. Fan A can still scan in
5. Hacker also has NFT (could potentially sell it)
```

But since NFTs are fake (mock addresses), this isn't exploitable today.

---

## Security Features ✅

### QR Security

| Feature | Implementation |
|---------|----------------|
| HMAC signing | SHA-256 with secret key |
| Time-based expiration | 30 seconds |
| Nonce for replay prevention | 16-char random, stored in Redis |
| Timing-safe comparison | `crypto.timingSafeEqual()` |

### Access Control

| Feature | Implementation |
|---------|----------------|
| Authentication required | JWT middleware |
| Role-based access | VENUE_STAFF, VENUE_MANAGER, ADMIN |
| Tenant isolation | PostgreSQL RLS + explicit checks |
| Venue isolation | Staff can only scan at their venue |
| Device authorization | Registered devices only |

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Regular scan | Configured via `scanRateLimiter` |
| Bulk scan | 5 requests per 5 minutes |

---

## Database Tables

### scans

| Column | Type | Purpose |
|--------|------|---------|
| ticket_id | UUID | Which ticket was scanned |
| device_id | UUID | Which device scanned it |
| result | VARCHAR | 'ALLOW' or 'DENY' |
| reason | VARCHAR | Why allowed/denied |
| scanned_at | TIMESTAMP | When scanned |

### scan_policies

| Column | Type | Purpose |
|--------|------|---------|
| event_id | UUID | Which event |
| policy_type | VARCHAR | 'REENTRY', 'DUPLICATE_WINDOW' |
| config | JSONB | Policy configuration |
| is_active | BOOLEAN | Is policy active |

### scanner_devices (or devices)

| Column | Type | Purpose |
|--------|------|---------|
| device_id | VARCHAR | Unique device identifier |
| venue_id | UUID | Which venue |
| zone | VARCHAR | GA, VIP, BACKSTAGE |
| is_active | BOOLEAN | Is device authorized |

---

## Offline Scanning

**File:** `backend/services/scanning-service/src/services/QRGenerator.ts`

The service supports offline scanning:
1. Download manifest of all tickets for event
2. Manifest includes offline tokens (HMAC-based)
3. Device can validate locally without network
4. Sync scans when back online

---

## What Would Blockchain Verification Add?

### Option 1: On-Scan Verification (Slow)
```typescript
// In validateScan(), after database checks:
const ticketPda = ticket.ticket_pda;
if (ticketPda) {
  const onChainOwner = await blockchainClient.getTicketOwner(ticketPda);
  const userWallet = await getUserWallet(ticket.user_id);
  
  if (onChainOwner !== userWallet) {
    return { valid: false, reason: 'BLOCKCHAIN_OWNER_MISMATCH' };
  }
}
```

**Problem:** Adds 200-500ms latency per scan. Not practical for high-volume entry.

### Option 2: Background Sync (Recommended)
```typescript
// Separate background job
async function syncBlockchainOwnership() {
  const tickets = await getTicketsNeedingSync();
  
  for (const ticket of tickets) {
    const onChainOwner = await blockchainClient.getTicketOwner(ticket.ticket_pda);
    const userWallet = await getUserWallet(ticket.user_id);
    
    if (onChainOwner !== userWallet) {
      await flagTicketForReview(ticket.id, 'OWNERSHIP_MISMATCH');
    }
  }
}
```

**Benefit:** Scanning stays fast. Mismatches caught asynchronously.

### Option 3: Pre-Event Verification

Before event starts, verify all tickets match blockchain state.

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `routes/scan.ts` | Scan endpoint | ✅ Complete |
| `routes/qr.ts` | QR generation | ✅ Complete |
| `routes/devices.ts` | Device management | ✅ Complete |
| `routes/offline.ts` | Offline support | ✅ Complete |
| `routes/policies.ts` | Policy management | ✅ Complete |
| `services/QRValidator.ts` | Main validation logic | ✅ Complete |
| `services/QRGenerator.ts` | QR code generation | ✅ Complete |
| `services/DeviceManager.ts` | Device registration | ✅ Complete |
| `services/OfflineCache.ts` | Offline sync | ✅ Complete |

---

## What Needs to Change?

### If Blockchain Verification is Required

| File | Change | Priority |
|------|--------|----------|
| `services/QRValidator.ts` | Add blockchain ownership check | P2 |
| `workers/blockchain-sync.ts` | CREATE - Background sync job | P2 |

### Prerequisites

1. Real NFT minting (currently fake)
2. Tickets have valid `ticket_pda`
3. Users have wallet addresses linked

---

## Summary

| Aspect | Status |
|--------|--------|
| QR generation | ✅ Secure |
| QR validation | ✅ Comprehensive |
| Replay attack prevention | ✅ Implemented |
| Duplicate detection | ✅ Implemented |
| Re-entry policies | ✅ Implemented |
| Access zones | ✅ Implemented |
| Tenant isolation | ✅ Implemented |
| Venue isolation | ✅ Implemented |
| Device authorization | ✅ Implemented |
| Offline support | ✅ Implemented |
| Rate limiting | ✅ Implemented |
| Blockchain verification | ❌ Not implemented |

---

## Verdict

**The scanning service is production-ready for database-based validation.** 

Blockchain verification is a nice-to-have but:
1. Would add latency
2. Requires real NFTs first (currently fake)
3. Current security is solid for database ownership model

**Recommendation:** Add background blockchain sync job AFTER fixing upstream minting issues.

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue setup
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Ticket creation
- `TICKET_TRANSFER_GIFT_FLOW_AUDIT.md` - Ownership changes

