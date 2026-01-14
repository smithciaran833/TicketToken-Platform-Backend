# EVENT CREATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Creation |

---

## Flow Overview

**Goal:** Venue creates an event with ticket types, pricing, and capacity so fans can purchase tickets.

---

## Step-by-Step Flow

### Step 1: Create Event

**Endpoint:** `POST /events`

**Service:** event-service

**File:** `backend/services/event-service/src/services/event.service.ts`

**What happens:**
1. Authenticate user
2. Validate tenant context
3. Validate venue access via VenueServiceClient
4. Get venue details (timezone, capacity)
5. Validate event date (future date)
6. Check for duplicate events (same venue, date, name)
7. **Transaction begins:**
   - Create event in `events` table
   - Create event metadata in `event_metadata` table
   - Create event schedule in `event_schedules` table (if dates provided)
   - Create event capacity in `event_capacity` table (if capacity provided)
   - Log to audit
8. **Transaction commits**
9. **Attempt blockchain event creation** (if artist_wallet provided)
10. Invalidate Redis cache
11. Publish to search sync

**Database writes:**
- `events` table
- `event_metadata` table
- `event_schedules` table
- `event_capacity` table

**External calls:**
- VenueServiceClient.validateVenueAccess()
- VenueServiceClient.getVenue()
- BlockchainService.createEventOnChain() ⚠️
- Redis cache invalidation
- RabbitMQ: `event.created` to search sync

**Status:** ⚠️ Partially Working

---

### Step 2: Blockchain Event Creation (Within Step 1)

**File:** `backend/services/event-service/src/services/blockchain.service.ts`

**What happens:**
1. Generate blockchain event ID from UUID
2. Derive venue PDA from venueId
3. Convert timestamps to Unix seconds
4. Convert percentages to basis points
5. Call `blockchainClient.createEvent()`
6. Update event with `event_pda` and `blockchain_status = 'synced'`

**The Problem:**
```typescript
// Derive venue PDA (venues not yet on-chain, so we derive from venueId)
const [venuePda] = deriveVenuePDA(this.programId, eventData.venueId);
```

The venue doesn't exist on-chain. The smart contract will fail:
```rust
constraint = venue.verified @ TicketTokenError::VenueNotVerified
constraint = venue.active @ TicketTokenError::VenueInactive
```

**What actually happens:**
- Blockchain call fails
- `blockchain_status = 'failed'` is set
- Event exists in database but not on-chain
- Error is logged but not surfaced to user

**Status:** ❌ Will Fail (venue not on-chain)

---

### Step 3: Create Ticket Types (Pricing Tiers)

**Endpoint:** `POST /events/:id/ticket-types`

**Service:** event-service

**File:** `backend/services/event-service/src/services/pricing.service.ts`

**What happens:**
1. Validate event exists
2. Create pricing record in `event_pricing` table with:
   - base_price
   - current_price
   - service_fee
   - facility_fee
   - tax_rate
   - Dynamic pricing options (min/max, early bird, last minute)

**Database writes:**
- `event_pricing` table

**Status:** ✅ Working

---

### Step 4: Create Capacity Sections

**Endpoint:** `POST /events/:id/capacity`

**Service:** event-service

**File:** `backend/services/event-service/src/services/capacity.service.ts`

**What happens:**
1. Validate section name and capacity
2. Validate total won't exceed venue max capacity
3. Create capacity record with:
   - section_name
   - total_capacity
   - available_capacity (initially = total)
   - sold_count (initially = 0)
   - pending_count (initially = 0)

**Database writes:**
- `event_capacity` table

**Status:** ✅ Working

---

### Step 5: Create Event Schedule

**Endpoint:** `POST /events/:id/schedules`

**Service:** event-service

**File:** `backend/services/event-service/src/routes/schedules.routes.ts`

**What happens:**
1. Create schedule with:
   - starts_at
   - ends_at
   - doors_open_at
   - timezone
   - status (SCHEDULED)

**Database writes:**
- `event_schedules` table

**Status:** ✅ Working

---

### Step 6: Publish Event

**Endpoint:** `POST /events/:id/publish`

**Service:** event-service

**File:** `backend/services/event-service/src/services/event.service.ts`

**What happens:**
1. Validate event exists
2. Update status to 'PUBLISHED'
3. Publish to search sync

**State Machine Transition:**
- DRAFT → PUBLISHED (via PUBLISH transition)
- Or DRAFT → REVIEW → APPROVED → PUBLISHED

**Database writes:**
- `events` table (status update)

**What's published:**
- `event.updated` to search sync

**Status:** ✅ Working

---

### Step 7: Start Sales

**Endpoint:** `PUT /events/:id` with `{ status: 'ON_SALE' }`

**Service:** event-service

**State Machine Transition:**
- PUBLISHED → ON_SALE (via START_SALES transition)

**What happens:**
1. Validate state transition is valid
2. Update status to 'ON_SALE'
3. Event is now available for ticket purchases

**Status:** ✅ Working

---

## Complete Flow Diagram
```
Venue Creates Event (event-service)
    ↓
    ├── events table created
    ├── event_metadata table created
    ├── event_schedules table created
    ├── event_capacity table created
    ├── event.created published to search
    │
    └── Blockchain Event Creation Attempted
        ↓
        └── ❌ FAILS: Venue not on-chain
            └── blockchain_status = 'failed'
            └── event_pda = null

Venue Creates Ticket Types (event-service)
    ↓
    └── event_pricing table created ✅

Venue Creates Capacity Sections (event-service)
    ↓
    └── event_capacity table created ✅

Venue Publishes Event (event-service)
    ↓
    └── events.status = 'PUBLISHED' ✅

Venue Starts Sales (event-service)
    ↓
    └── events.status = 'ON_SALE' ✅

Event Ready for Purchases
    ↓
    └── ⚠️ BUT tickets will be fake (no real NFTs)
        because event doesn't exist on blockchain
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `backend/services/event-service/src/services/event.service.ts` | Main event creation |
| `backend/services/event-service/src/services/blockchain.service.ts` | Blockchain integration |
| `backend/services/event-service/src/services/pricing.service.ts` | Ticket type pricing |
| `backend/services/event-service/src/services/capacity.service.ts` | Capacity management |
| `backend/services/event-service/src/services/event-state-machine.ts` | State transitions |
| `backend/services/event-service/src/services/venue-service.client.ts` | Venue validation |
| `backend/services/event-service/src/controllers/events.controller.ts` | HTTP handlers |
| `backend/services/event-service/src/routes/events.routes.ts` | Route definitions |

---

## Database Tables Touched

| Table | Service | Action |
|-------|---------|--------|
| `events` | event-service | INSERT, UPDATE |
| `event_metadata` | event-service | INSERT |
| `event_schedules` | event-service | INSERT |
| `event_capacity` | event-service | INSERT, UPDATE |
| `event_pricing` | event-service | INSERT, UPDATE |

---

## External Services Called

| Service | Purpose | Status |
|---------|---------|--------|
| venue-service | Validate venue access | ✅ |
| venue-service | Get venue details | ✅ |
| Redis | Cache invalidation | ✅ |
| RabbitMQ | Search sync events | ✅ |
| **Solana Blockchain** | **Create event on-chain** | ❌ FAILS |

---

## State Machine

### Valid States
- DRAFT
- REVIEW
- APPROVED
- PUBLISHED
- ON_SALE
- SALES_PAUSED
- SOLD_OUT
- IN_PROGRESS
- COMPLETED
- CANCELLED
- POSTPONED

### Sales Allowed States
- ON_SALE only

### Terminal States (no exit)
- COMPLETED
- CANCELLED

### Key Transitions
```
DRAFT ──PUBLISH──> PUBLISHED ──START_SALES──> ON_SALE ──SOLD_OUT──> SOLD_OUT
                                    │
                                    └──START_EVENT──> IN_PROGRESS ──END_EVENT──> COMPLETED
```

---

## Gaps Found

### Gap 1: Blockchain Event Creation Fails

**Problem:**
Event blockchain creation requires venue to exist on-chain. Venue is never created on-chain (see Venue Onboarding audit).

**Impact:**
- All events have `blockchain_status = 'failed'`
- `event_pda` is null
- Tickets can't be minted as real NFTs (they reference event PDA)
- Royalty splits not enforced on-chain

**Root Cause:**
Venue onboarding doesn't create venue on blockchain.

**Dependency:**
Must fix Venue Onboarding first.

---

### Gap 2: No Retry for Failed Blockchain Creation

**Problem:**
When blockchain creation fails, error is logged but:
- No retry mechanism
- No queue for failed operations
- No admin alert
- No reconciliation

**What happens:**
```typescript
} catch (blockchainError) {
  logger.error({...});
  await this.db('events')
    .where({ id: result.event.id, tenant_id: tenantId })
    .update({
      blockchain_status: 'failed',
      updated_at: new Date()
    });
  result.event.blockchain_status = 'failed';
  // Silent failure - event creation continues
}
```

**Impact:**
Events appear to be created successfully but are not on blockchain.

---

### Gap 3: No Validation That Event Is On-Chain Before Sales

**Problem:**
When event status changes to ON_SALE, there's no check that:
- Event exists on blockchain
- Venue exists on blockchain
- Royalty splits are set up

**Impact:**
Tickets are sold for events that don't exist on-chain.

---

### Gap 4: Ticket Types Not Linked to Blockchain

**Problem:**
Ticket types (pricing tiers) are database-only. No on-chain representation.

**What this means:**
- Pricing not enforced on-chain
- No on-chain record of ticket tiers
- Resale royalties not tied to ticket type

---

## Summary

| Component | Status |
|-----------|--------|
| Event Database Creation | ✅ Complete |
| Event Metadata | ✅ Complete |
| Event Schedules | ✅ Complete |
| Event Capacity | ✅ Complete |
| Ticket Types (Pricing) | ✅ Complete |
| State Machine | ✅ Complete |
| Venue Validation | ✅ Complete |
| Search Sync | ✅ Complete |
| **Blockchain Event Creation** | ❌ Fails (venue not on-chain) |
| **Blockchain Retry** | ❌ Missing |
| **Pre-Sale Blockchain Validation** | ❌ Missing |

---

## Files That Need Changes

### To Fix Blockchain Integration

| File | Change |
|------|--------|
| `backend/services/venue-service/src/services/venue.service.ts` | Create venue on-chain first (prerequisite) |
| `backend/services/event-service/src/services/event.service.ts` | Add retry queue for failed blockchain ops |
| `backend/services/event-service/src/services/event.service.ts` | Validate blockchain status before ON_SALE |

### New Files Needed

| File | Purpose |
|------|---------|
| `backend/services/event-service/src/jobs/blockchain-retry.job.ts` | Retry failed blockchain operations |
| `backend/services/event-service/src/services/blockchain-reconciliation.service.ts` | Reconcile events with blockchain |

---

## Dependencies
```
Venue Onboarding Blockchain Fix
         ↓
    Must complete first
         ↓
Event Creation Blockchain Works
         ↓
    Then can fix
         ↓
Ticket Minting Works
```

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Prerequisite fix
- `BLOCKCHAIN_INTEGRATION_REMEDIATION.md` - Overall blockchain fixes

