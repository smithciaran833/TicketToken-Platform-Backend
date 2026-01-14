# PRIMARY PURCHASE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Primary Purchase |

---

## Executive Summary

**CRITICAL FINDING:** There are TWO completely different purchase flows that are not compatible with each other. The services call endpoints that don't exist in each other.

---

## Architecture Overview

### Two Purchase Flows Exist

#### Flow A: ticket-service → order-service (Feature Flagged)
- **Entry:** `POST /api/v1/purchase` on ticket-service
- **Controlled by:** `USE_ORDER_SERVICE=true` feature flag
- **Uses:** PurchaseSaga pattern
- **ticket-service calls order-service** to create orders

#### Flow B: order-service → ticket-service (BROKEN)
- **Entry:** `POST /orders` on order-service  
- **Uses:** Direct API calls to ticket-service
- **order-service calls ticket-service** internal endpoints
- **PROBLEM:** The endpoints don't exist!

---

## Flow A: ticket-service → order-service (Working with Caveats)

### Step-by-Step

**1. Fan calls `POST /api/v1/purchase` on ticket-service**

**File:** `backend/services/ticket-service/src/controllers/purchaseController.ts`

**What happens:**
- Check feature flag `USE_ORDER_SERVICE`
- If true → Use PurchaseSaga
- If false → Use legacy direct DB write

**2. PurchaseSaga Executes (if flag enabled)**

**File:** `backend/services/ticket-service/src/sagas/PurchaseSaga.ts`

**Steps:**
1. **Reserve Inventory** (local DB transaction)
   - Atomic decrement of `available_quantity`
   - Increment `reserved_quantity`
2. **Create Order** (call order-service API)
   - `POST /api/v1/orders` via OrderServiceClient
3. **Create Tickets** (local DB insert)
   - Insert into `tickets` table with status 'SOLD'

**Compensation on failure:**
- Delete created tickets
- Cancel order via order-service
- Release inventory

**3. Order Created in order-service**

**File:** `backend/services/order-service/src/services/order.service.ts`

**What happens:**
- Validate request
- Create order in `orders` table
- Create order items in `order_items` table
- Return order details

**Status:** ✅ This flow works IF `USE_ORDER_SERVICE=true`

---

## Flow B: order-service → ticket-service (COMPLETELY BROKEN)

### The Problem

**order-service expects these ticket-service endpoints:**

| Endpoint | Purpose | EXISTS? |
|----------|---------|---------|
| `POST /internal/tickets/availability` | Check stock | ❌ NO |
| `POST /internal/tickets/reserve` | Reserve tickets | ❌ NO |
| `POST /internal/tickets/confirm` | Confirm purchase | ❌ NO |
| `POST /internal/tickets/release` | Release reservation | ❌ NO |
| `POST /internal/tickets/prices` | Get prices | ❌ NO |

**ticket-service actually has:**

| Endpoint | Purpose | CALLED? |
|----------|---------|---------|
| `GET /internal/tickets/:ticketId/status` | Check ticket status | ❌ Not by order-service |
| `POST /internal/tickets/cancel-batch` | Cancel tickets | ❌ Not by order-service |
| `POST /internal/tickets/calculate-price` | Calculate price | ❌ Not by order-service |

### What Happens

When order-service tries to create an order:
1. Calls `POST /internal/tickets/availability` → **404 Not Found**
2. Order creation fails immediately
3. **No tickets can be purchased through order-service**

**Files:**
- `backend/services/order-service/src/services/ticket.client.ts` - Calls non-existent endpoints
- `backend/services/ticket-service/src/routes/internalRoutes.ts` - Has different endpoints

---

## Flow C: Legacy Direct DB (When Flag is False)

**File:** `backend/services/ticket-service/src/controllers/purchaseController.ts` → `createOrderLegacy()`

**What happens:**
1. Check idempotency
2. Validate items and calculate totals
3. Apply discounts
4. Calculate fees (7.5% platform + 2.9% processing)
5. Insert into `orders` table
6. Insert into `order_items` table
7. Update `ticket_types` inventory

**Note:** This creates orders directly in ticket-service's DB, bypassing order-service entirely.

**Status:** ✅ Works but doesn't integrate with order-service

---

## Payment Flow (After Order Created)

### Regardless of which flow created the order...

**1. Fan pays via Stripe**
- Frontend uses `clientSecret` from payment intent
- Stripe processes payment

**2. Stripe Webhook fires**

**File:** `backend/services/payment-service/src/webhooks/stripe-handler.ts`

**What happens:**
- Verify webhook signature
- Check idempotency
- Process `payment_intent.succeeded` event
- Call state transition service

**3. Payment State Updated**

**File:** `backend/services/payment-service/src/services/state-machine/transitions.ts`

**What happens:**
- Update payment status to 'completed'
- Triggers downstream events

**4. Order Confirmed (IF using order-service flow)**

**File:** `backend/services/order-service/src/services/order.service.ts` → `confirmOrder()`

**What happens:**
1. Confirm payment via payment-service
2. Call `ticketClient.confirmAllocation(orderId)` → **FAILS (endpoint doesn't exist)**
3. Update order status to CONFIRMED
4. Publish ORDER_CONFIRMED event

**Problem:** Step 2 fails because the endpoint doesn't exist.

---

## NFT Minting Flow

### Multiple Minting Systems Exist (Disconnected)

#### System 1: ticket-service mintWorker (FAKE)

**File:** `backend/services/ticket-service/src/workers/mintWorker.ts`
```typescript
private async mintNFT(_ticketId: string, _userId: string, _eventId: string) {
  const mockAddress = `mock_nft_${Date.now()}_${Math.random()...}`;
  const mockSignature = `sig_${Date.now()}_${Math.random()...}`;
  return { address: mockAddress, signature: mockSignature };
}
```

**Status:** ❌ FAKE - produces mock addresses

#### System 2: MintingServiceClient (UNUSED)

**File:** `backend/services/ticket-service/src/clients/MintingServiceClient.ts`

- Full circuit breaker implementation
- Retry logic with exponential backoff
- Batch minting support
- **NEVER CALLED ANYWHERE**

**Status:** ❌ Built but unused

#### System 3: minting-service (REAL but wrong queue)

**File:** `backend/services/minting-service/src/services/MintingOrchestrator.ts`

- Real Solana compressed NFT minting
- IPFS metadata upload
- Wallet balance checks
- Blockchain ticket registration

**But listens on:** Bull/Redis queue `'ticket-minting'`
**ticket-service publishes to:** RabbitMQ queue `'ticket.mint'`

**Status:** ❌ Queue mismatch - never receives messages

#### System 4: blockchain-service mint-worker (REAL, correct queue)

**File:** `backend/services/blockchain-service/src/workers/mint-worker.ts`

- Listens on RabbitMQ `'ticket.mint'` ✅
- Uses Metaplex for minting
- Real Solana transactions

**Status:** ⚠️ Exists and listens on correct queue, but needs verification

---

## Queue Analysis

| Producer | Queue | Consumer | Connected? |
|----------|-------|----------|------------|
| ticket-service (ticketService.ts) | RabbitMQ `ticket.mint` | blockchain-service mint-worker | ✅ YES |
| ticket-service (paymentEventHandler.ts) | RabbitMQ `ticket.mint` | blockchain-service mint-worker | ✅ YES |
| minting-service | Bull `ticket-minting` | minting-service worker | ❌ Different system |

**Finding:** blockchain-service DOES consume `ticket.mint` queue. Let me verify it actually runs.

---

## What Actually Works End-to-End

### Scenario 1: `USE_ORDER_SERVICE=false` (Legacy)
```
Fan → ticket-service/purchase → Direct DB write → Order in ticket-service DB
                                                           ↓
                                               No payment intent created
                                                           ↓
                                                     Flow stops
```

**Result:** Order created but no payment flow

### Scenario 2: `USE_ORDER_SERVICE=true` (Saga)
```
Fan → ticket-service/purchase → PurchaseSaga
           ↓
    Reserve inventory (ticket-service DB)
           ↓
    Create order (order-service) ✅
           ↓
    Create tickets (ticket-service DB) ✅
           ↓
    Return order to fan ✅
           ↓
    Fan pays via Stripe ✅
           ↓
    Webhook → payment-service ✅
           ↓
    order-service confirms order
           ↓
    Calls ticketClient.confirmAllocation() ❌ FAILS
```

**Result:** Order created, payment works, but confirmation fails

### Scenario 3: Direct to order-service
```
Fan → order-service/orders → ticketClient.checkAvailability() ❌ 404
```

**Result:** Immediate failure

---

## Critical Gaps Summary

### Gap 1: Missing Internal Endpoints

**5 endpoints expected by order-service don't exist in ticket-service**

**Impact:** order-service → ticket-service integration is 100% broken

**Fix Required:**
| File | Change |
|------|--------|
| `ticket-service/src/routes/internalRoutes.ts` | Add 5 missing endpoints |

### Gap 2: Queue Mismatch (Partially Resolved)

**Finding:** blockchain-service DOES listen to `ticket.mint` RabbitMQ queue

**But:** Need to verify blockchain-service is:
1. Actually running in docker-compose
2. Successfully minting NFTs
3. Updating ticket records with mint addresses

### Gap 3: NFT Minting Still Has Issues

Even if blockchain-service works:
1. Events don't have `event_pda` (event not on blockchain)
2. Venues don't exist on blockchain
3. Ticket blockchain registration will fail

### Gap 4: Venue Balance Not Credited

**File:** `backend/services/payment-service/src/webhooks/stripe-handler.ts`

Primary sale payments:
- Go to platform Stripe account ✅
- Venue never receives their share ❌
- `venue_balances` table never updated ❌

---

## Database Tables Touched

| Table | Service | Flow A | Flow B | Legacy |
|-------|---------|--------|--------|--------|
| `orders` | order-service | ✅ | ❌ | - |
| `orders` | ticket-service | - | - | ✅ |
| `order_items` | order-service | ✅ | ❌ | - |
| `order_items` | ticket-service | - | - | ✅ |
| `tickets` | ticket-service | ✅ | ❌ | - |
| `ticket_types` | ticket-service | ✅ | ❌ | ✅ |
| `reservations` | ticket-service | - | - | - |
| `payment_transactions` | payment-service | ✅ | ✅ | - |
| `venue_balances` | payment-service | ❌ | ❌ | ❌ |

---

## Files That Need Changes

### Critical (Flow Broken)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service/src/routes/internalRoutes.ts` | Add 5 missing endpoints | P0 |

### High (Minting Broken)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service/src/workers/mintWorker.ts` | Use real minting or remove | P1 |
| `venue-service/src/services/venue.service.ts` | Create venue on blockchain | P1 |
| `event-service/src/services/event.service.ts` | Ensure event_pda exists | P1 |

### Medium (Revenue Broken)

| File | Change | Priority |
|------|--------|----------|
| `payment-service/src/webhooks/stripe-handler.ts` | Credit venue balance | P2 |
| `payment-service/src/services/primary-sale-settlement.service.ts` | CREATE NEW | P2 |

---

## Verification Needed

1. **Is blockchain-service running?**
   - Check docker-compose logs
   - Verify it connects to RabbitMQ

2. **Does blockchain-service successfully mint?**
   - Check for successful mint logs
   - Verify tickets table has real mint addresses (not mock_nft_xxx)

3. **What is `USE_ORDER_SERVICE` set to in production?**
   - This determines which flow is active

---

## Dependency Chain
```
1. Venue on blockchain (BLOCKED - Flow 1)
         ↓
2. Event on blockchain (BLOCKED - Flow 2)
         ↓
3. Internal endpoints created (BLOCKED)
         ↓
4. Order flow works end-to-end
         ↓
5. NFT minting works
         ↓
6. Venue gets paid
```

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue blockchain gap
- `EVENT_CREATION_FLOW_AUDIT.md` - Event blockchain gap
- `BLOCKCHAIN_INTEGRATION_REMEDIATION.md` - Overall blockchain fixes

