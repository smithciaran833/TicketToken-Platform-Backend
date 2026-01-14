# TICKET VALIDATION/ENTRY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Validation & Entry (Beyond Basic Scanning) |

---

## Executive Summary

**WELL IMPLEMENTED - Comprehensive validation system**

| Component | Status |
|-----------|--------|
| QR validation with HMAC | ✅ Complete |
| Replay attack prevention (nonce) | ✅ Complete |
| Duplicate scan detection | ✅ Complete |
| Re-entry policies | ✅ Complete |
| Zone enforcement | ✅ Complete |
| Offline scanning support | ✅ Complete |
| Device management | ✅ Complete |
| Policy templates | ✅ Complete |
| Ticket state machine | ✅ Complete |
| Check-in status tracking | ✅ Complete |
| Multi-entrance support | ⚠️ Partial |
| Blockchain verification | ❌ Not implemented |

**Bottom Line:** The ticket validation/entry system is one of the most complete features in the platform. It handles security, policies, offline mode, and device management well. Only missing blockchain ownership verification.

---

## Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY FLOW                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User presents QR ──> Scanner Device ──> scanning-service   │
│                              │                               │
│                              ▼                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              VALIDATION PIPELINE                     │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Parse QR data (ticketId:timestamp:nonce:hmac)   │   │
│   │  2. Validate HMAC signature (timing-safe)           │   │
│   │  3. Check time window (30 seconds)                  │   │
│   │  4. Check nonce (replay attack prevention)          │   │
│   │  5. Validate device authorization                   │   │
│   │  6. Check venue/tenant isolation                    │   │
│   │  7. Get ticket from database                        │   │
│   │  8. Check ticket status (not used/cancelled/etc)    │   │
│   │  9. Check event timing (not too early, not ended)   │   │
│   │  10. Check validity period (valid_from, valid_until)│   │
│   │  11. Check duplicate scan window                    │   │
│   │  12. Check re-entry policy                          │   │
│   │  13. Check access zone permissions                  │   │
│   │  14. ALLOW or DENY with reason                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│   Record scan ──> Update ticket status ──> Return result     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. QR Validation with Security

**File:** `scanning-service/src/services/QRValidator.ts`
```typescript
// HMAC validation with timing-safe comparison
async validateQRToken(ticketId, timestamp, nonce, providedHmac) {
  // Check time window (30 seconds)
  if (tokenAge > this.timeWindowSeconds * 1000) {
    return { valid: false, reason: 'QR_EXPIRED' };
  }

  // Check nonce (replay attack prevention)
  const nonceKey = `qr-nonce:${nonce}`;
  const alreadyUsed = await redis.get(nonceKey);
  if (alreadyUsed) {
    return { valid: false, reason: 'QR_ALREADY_USED' };
  }

  // Timing-safe HMAC comparison
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  const providedBuffer = Buffer.from(providedHmac, 'hex');
  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { valid: false, reason: 'INVALID_QR' };
  }

  // Mark nonce as used
  await redis.setex(nonceKey, 60, '1');
  return { valid: true };
}
```

**Security Features:**
- ✅ HMAC-SHA256 signature
- ✅ 30-second expiration window
- ✅ Nonce-based replay attack prevention
- ✅ Timing-safe comparison (prevents timing attacks)
- ✅ Redis-backed nonce storage

---

### 2. Scan Policies

**File:** `scanning-service/src/routes/policies.ts`

**Supported Policy Types:**
| Policy | Description | Status |
|--------|-------------|--------|
| `DUPLICATE_WINDOW` | Prevent scanning same ticket within X minutes | ✅ |
| `REENTRY` | Control re-entry cooldown and max re-entries | ✅ |
| `ZONE_ENFORCEMENT` | Restrict access by ticket tier/zone | ✅ |

**Policy Template System:**
```typescript
// Apply a policy template to an event
POST /api/policies/event/:eventId/apply-template
{ "template_id": "standard-concert" }

// Set custom policies
PUT /api/policies/event/:eventId/custom
{
  "duplicate_window_minutes": 10,
  "reentry_enabled": true,
  "reentry_cooldown_minutes": 15,
  "max_reentries": 2,
  "strict_zones": true,
  "vip_all_access": true
}
```

---

### 3. Re-entry Handling

**File:** `scanning-service/src/services/QRValidator.ts`
```typescript
async checkReentryPolicy(ticketId, eventId, scanCount, lastScannedAt) {
  // Get event policy
  const policy = await this.getPolicy(eventId, 'REENTRY');

  if (!policy.enabled) {
    return scanCount > 0 
      ? { allowed: false, reason: 'NO_REENTRY' }
      : { allowed: true };
  }

  // Check max re-entries
  if (scanCount >= policy.max_reentries) {
    return { allowed: false, reason: 'MAX_REENTRIES_EXCEEDED' };
  }

  // Check cooldown period
  if (lastScannedAt) {
    const minutesSinceLastScan = (Date.now() - lastScannedAt) / 60000;
    if (minutesSinceLastScan < policy.cooldown_minutes) {
      return { 
        allowed: false, 
        reason: 'REENTRY_COOLDOWN',
        minutesRemaining: policy.cooldown_minutes - minutesSinceLastScan
      };
    }
  }

  return { allowed: true };
}
```

---

### 4. Zone/Access Control

**File:** `scanning-service/src/services/QRValidator.ts`
```typescript
async checkZoneAccess(ticketAccessLevel, deviceZone, eventId) {
  const policy = await this.getPolicy(eventId, 'ZONE_ENFORCEMENT');

  // VIP all-access
  if (policy.vip_all_access && ticketAccessLevel === 'VIP') {
    return { allowed: true };
  }

  // Strict zone matching
  if (policy.strict) {
    const allowed = ZONE_HIERARCHY[ticketAccessLevel]?.includes(deviceZone);
    return allowed 
      ? { allowed: true }
      : { allowed: false, reason: 'ZONE_MISMATCH', required: deviceZone };
  }

  return { allowed: true };
}
```

**Zone Hierarchy:**
- `VIP` → Can access: VIP, GA
- `GA` → Can access: GA only
- `BACKSTAGE` → Can access: BACKSTAGE, VIP, GA

---

### 5. Device Management

**File:** `scanning-service/src/routes/devices.ts`
```typescript
// Register device
POST /api/devices/register
{
  "device_id": "scanner-001",
  "name": "Main Entrance Scanner",
  "zone": "GA"
}

// List devices
GET /api/devices

// Device is associated with venue and zone for isolation
```

---

### 6. Offline Scanning

**File:** `scanning-service/src/routes/offline.ts`
```typescript
// Download manifest for offline scanning
GET /api/offline/manifest/:eventId?device_id=scanner-001

// Returns:
{
  "event": { ... },
  "tickets": [
    {
      "ticketId": "...",
      "validationHash": "...",  // Pre-computed for offline
      "validFrom": "...",
      "validUntil": "..."
    }
  ],
  "policies": { ... },
  "generatedAt": "..."
}

// Reconcile offline scans when back online
POST /api/offline/reconcile
{
  "device_id": "scanner-001",
  "scans": [
    { "ticket_id": "...", "scanned_at": "...", "result": "ALLOW" }
  ]
}
```

---

### 7. Ticket State Machine

**File:** `ticket-service/src/services/ticket-state-machine.ts`
```typescript
export enum TicketStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold',
  MINTED = 'minted',
  ACTIVE = 'active',
  TRANSFERRED = 'transferred',
  CHECKED_IN = 'checked_in',
  USED = 'used',           // Alias for checked_in
  REVOKED = 'revoked',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

// Valid transitions prevent invalid state changes
export const VALID_TRANSITIONS = {
  [TicketStatus.ACTIVE]: [
    TicketStatus.TRANSFERRED,
    TicketStatus.CHECKED_IN,  // Scanning
    TicketStatus.REVOKED,
    TicketStatus.REFUNDED,
  ],
  [TicketStatus.CHECKED_IN]: [],  // Terminal state
  [TicketStatus.USED]: [],        // Terminal state
};
```

---

## What's Partially Implemented ⚠️

### Multi-Entrance Support

**Current state:**
- Devices can be assigned to zones (GA, VIP, BACKSTAGE)
- Tickets can have access levels
- Zone checking exists

**Missing:**
- No explicit "entrance" concept (Main Gate, Side Gate, etc.)
- No entrance-specific capacity tracking
- No entrance-specific policies

---

## What's Missing ❌

### Blockchain Ownership Verification

**Not implemented:**
```typescript
// SHOULD exist but doesn't:
async verifyBlockchainOwnership(ticketId, presentedByUserId) {
  const ticket = await db.getTicket(ticketId);
  const onChainOwner = await blockchain.getNFTOwner(ticket.token_mint);
  const userWallet = await db.getUserWallet(presentedByUserId);
  
  return onChainOwner === userWallet;
}
```

**Impact:** Low (since NFTs aren't really minted anyway)

---

## Validation Pipeline (Full)

### Step-by-Step

1. **Parse QR** → Extract `ticketId:timestamp:nonce:hmac`
2. **Validate HMAC** → Timing-safe comparison
3. **Check Expiration** → 30-second window
4. **Check Nonce** → Prevent replay attacks (Redis)
5. **Validate Device** → Must be registered and active
6. **Check Venue Isolation** → Device venue matches ticket venue
7. **Check Tenant Isolation** → Multi-tenant security
8. **Get Ticket** → From database
9. **Check Ticket Status** → Not USED, CANCELLED, REFUNDED, etc.
10. **Check Event Timing** → Event has started, not ended
11. **Check Validity Period** → `valid_from` and `valid_until`
12. **Check Duplicate Window** → Configurable (default 10 min)
13. **Check Re-entry Policy** → Cooldown, max re-entries
14. **Check Zone Access** → GA, VIP, BACKSTAGE
15. **Allow/Deny** → Record scan, update ticket

---

## API Endpoints

### Scanning Service

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `POST /api/scan` | Main scan endpoint | ✅ VENUE_STAFF+ |
| `POST /api/scan/bulk` | Bulk scanning | ✅ VENUE_STAFF+ |
| `GET /api/devices` | List devices | ✅ |
| `POST /api/devices/register` | Register device | ✅ |
| `GET /api/policies/templates` | List policy templates | ✅ |
| `GET /api/policies/event/:eventId` | Get event policies | ✅ |
| `POST /api/policies/event/:eventId/apply-template` | Apply template | ✅ |
| `PUT /api/policies/event/:eventId/custom` | Set custom policies | ✅ |
| `GET /api/offline/manifest/:eventId` | Get offline manifest | ✅ |
| `POST /api/offline/reconcile` | Reconcile offline scans | ✅ |
| `POST /api/qr/generate` | Generate QR code | ✅ |

### Ticket Service

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /tickets/:ticketId/qr` | Get QR code | ✅ Owner |
| `POST /tickets/validate-qr` | Validate QR | ✅ VENUE_STAFF+ |

---

## Database Tables

### scans
```sql
CREATE TABLE scans (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  device_id UUID REFERENCES devices(id),
  event_id UUID REFERENCES events(id),
  result VARCHAR(20),        -- 'ALLOW', 'DENY'
  reason VARCHAR(50),        -- Denial reason
  scanned_at TIMESTAMP,
  scan_count INTEGER,        -- Which scan number this was
  location VARCHAR(100),
  staff_user_id UUID
);
```

### devices
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  device_id VARCHAR(100) UNIQUE,
  name VARCHAR(100),
  zone VARCHAR(20),          -- GA, VIP, BACKSTAGE
  venue_id UUID,
  is_active BOOLEAN,
  last_seen_at TIMESTAMP
);
```

### scan_policies
```sql
CREATE TABLE scan_policies (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  venue_id UUID REFERENCES venues(id),
  policy_type VARCHAR(50),   -- DUPLICATE_WINDOW, REENTRY, ZONE_ENFORCEMENT
  name VARCHAR(100),
  config JSONB,
  is_active BOOLEAN
);
```

### scan_policy_templates
```sql
CREATE TABLE scan_policy_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(100),
  description TEXT,
  policy_set JSONB,          -- All policies for template
  is_default BOOLEAN
);
```

---

## Metrics & Monitoring

**File:** `scanning-service/src/utils/metrics.ts`
```typescript
// Prometheus metrics
scansAllowedTotal      // Counter: successful scans
scansDeniedTotal       // Counter: denied scans (by reason)
scanLatency            // Histogram: scan processing time
reentryAllowed         // Counter: re-entries allowed
reentryDenied          // Counter: re-entries denied
accessZoneViolations   // Counter: zone access denials
```

---

## Summary

| Aspect | Status |
|--------|--------|
| QR validation | ✅ Complete with security |
| HMAC signatures | ✅ Timing-safe |
| Replay prevention | ✅ Nonce-based |
| Duplicate detection | ✅ Configurable |
| Re-entry policies | ✅ Full support |
| Zone enforcement | ✅ Hierarchical |
| Device management | ✅ Complete |
| Policy templates | ✅ Complete |
| Offline scanning | ✅ Complete |
| Ticket state machine | ✅ Complete |
| Multi-entrance | ⚠️ Partial (zones only) |
| Blockchain verification | ❌ Not implemented |

**Bottom Line:** This is one of the most complete features in the platform. Production-ready for database-based validation with comprehensive security measures.

---

## Related Documents

- `TICKET_SCANNING_FLOW_AUDIT.md` - Basic scanning overview
- `BLOCKCHAIN_FLOW_AUDIT.md` - Why blockchain verification isn't available
- `EVENT_CREATION_FLOW_AUDIT.md` - Event setup including scan policies
