# TICKETING FLOW AUDIT SUMMARY

> **Generated:** January 2, 2025
> **Category:** ticketing
> **Total Files:** 21
> **Status:** ✅ Complete (7) | ⚠️ Partial (9) | ❌ Not Implemented/Dead Code (5)

---

## CRITICAL ISSUES

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| **P0** | Primary purchase flow broken | PRIMARY_PURCHASE | order-service calls 5 ticket-service endpoints that don't exist, returns 404 |
| **P0** | Secondary purchase is STUB | SECONDARY_PURCHASE | POST /transfers/purchase returns { success: true } and does nothing |
| **P0** | Ticket transfer never updates blockchain | TICKET_TRANSFER_GIFT | Two transfer systems, neither calls blockchain, NFT ownership mismatch |
| **P0** | SECURITY: Unprotected QR routes | VIEW_SINGLE_TICKET_QR | /api/v1/qr/* endpoints have NO authentication |
| **P1** | Wallet passes dead code | ADD_TO_WALLET | WalletPassService exists but sendTicketConfirmation never called |
| **P1** | No post-event ticket expiry | TICKET_LIFECYCLE_EXPIRY | Tickets stay ACTIVE forever after event ends |
| P2 | Upgrade price calculation broken | TICKET_UPGRADES_DOWNGRADES | Hardcoded to $0, no payment/refund processing |
| P2 | View my tickets inconsistent | VIEW_MY_TICKETS | Duplicate endpoints, /orders not routed, different response formats |
| P3 | No comp tickets | COMP_TICKETS | Cannot issue free tickets to VIPs/press/staff |
| P3 | No will-call | WILL_CALL_BOX_OFFICE | Role exists but no pickup functionality |
| P3 | No ticket reissuance | TICKET_REISSUANCE | Cannot reissue lost/stolen tickets |

---

## FILE-BY-FILE BREAKDOWN

---

### 1. ADD_TO_WALLET_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ DEAD CODE |
| Priority | **P1** |

**What Exists:**
- WalletPassService in notification-service
- Apple pass structure (mock - not signed .pkpass)
- Google pass structure (mock - unsigned JWT)
- NotificationOrchestrator.sendTicketConfirmation() uses it

**What's Broken:**
- `sendTicketConfirmation()` is NEVER CALLED by any service
- Apple pass returns JSON, not signed .pkpass file
- Google pass returns unsigned URL that won't work
- No API endpoints for pass download

**Apple Pass (Mock):**
```typescript
const pass = {
  formatVersion: 1,
  passTypeIdentifier: 'pass.com.tickettoken',
  serialNumber: data.ticketId,
  eventTicket: { ... },
  barcode: { format: 'PKBarcodeFormatQR', message: qrCodeData }
};
// Returns JSON buffer, NOT signed .pkpass
return Buffer.from(JSON.stringify(pass));
```

**What's Missing:**
- Apple Developer certificates
- .pkpass signing with PKCS#7
- Google Wallet API credentials
- JWT RS256 signing
- API endpoints: GET /passes/apple/:ticketId, GET /passes/google/:ticketId
- Integration with purchase flow

**Build Effort:** 4-5 days

**Key Files:**
- notification-service/src/services/wallet-pass.service.ts (mock)
- notification-service/src/services/notification-orchestrator.ts (dead code)

---

### 2. COMP_TICKETS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
- Nothing relevant - `createTicketType` creates definitions, not individual tickets

**What's Missing:**
- `is_comp` flag on tickets table
- `comp_reason` field
- `comp_issued_by` field
- Admin endpoint to issue comps (POST /admin/tickets/comp)
- Comp reasons enum (press_pass, artist_guest, vip_guest, staff, promotional, sponsor, contest_winner, customer_service)
- Comp ticket limits per event
- Comp ticket reporting

**Impact:**
- Cannot issue press passes
- Cannot provide artist guest list tickets
- Cannot run giveaways/contests
- Cannot comp tickets for customer complaints
- Cannot provide staff tickets
- Cannot fulfill sponsor allocations

**Build Effort:** 5-6 days

**Key Files:**
- None exist

---

### 3. GROUP_PURCHASES_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Full group payment service
- Organizer creates group payment
- Per-person amount calculation
- Payment links sent to members
- Individual payment tracking
- Reminder system (max 3 reminders)
- Expiration handling (10 minutes)
- Partial payment handling
- Contribution history

**Flow:**
1. Organizer creates group → calculates per-person amounts
2. Payment links sent to all members
3. Members pay individually via links
4. System tracks who paid
5. When all paid → complete purchase
6. If expired → handle partial/cancel

**Database Tables:**
- group_payments (organizer, event, total, status, expires_at)
- group_payment_members (email, name, amount_due, paid status)
- reminder_history

**Minor Issues:**
- sendReminders authorization bug (getGroupPayment is private)
- Email integration is placeholder (logs only)
- Payment processing is stubbed

**Key Files:**
- payment-service/src/services/group/group-payment.service.ts
- payment-service/src/routes/group-payment.routes.ts
- payment-service/src/controllers/group-payment.controller.ts

---

### 4. INVENTORY_RESERVATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Reservation expiry worker (every 60 seconds)
- Stored procedure `release_expired_reservations()`
- Outbox pattern for events
- Reservation cleanup worker (orphan detection)
- Inventory reconciliation
- Quantity tracking
- 30-minute reservation window (configurable)

**Features:**
- Atomic decrement of available_quantity
- Increment reserved_quantity
- Automatic release on expiry
- Orphan reservation detection (no_order, order_failed, should_be_expired)
- Stale Redis cleanup
- Negative inventory detection (critical alert)

**Key Files:**
- ticket-service/src/workers/reservation-expiry.worker.ts
- ticket-service/src/workers/reservation-cleanup.worker.ts
- ticket-service/src/services/ticket-state-machine.ts

---

### 5. MULTIDAY_SEASON_PASS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Exists (Schema Only):**
```sql
CREATE TABLE ticket_bundles (
  id UUID PRIMARY KEY,
  name VARCHAR(100),
  price DECIMAL(10,2),
  discount_percentage DECIMAL(5,2),
  is_active BOOLEAN
);

CREATE TABLE ticket_bundle_items (
  bundle_id UUID REFERENCES ticket_bundles(id),
  ticket_type_id UUID REFERENCES ticket_types(id),
  quantity INTEGER
);
```

- Event types: 'single', 'recurring', 'series'
- Event schedules with recurrence_rule (RRULE format)

**What's Missing:**
- BundleService
- Bundle routes (CRUD)
- Season pass service
- Multi-day ticket validation (per-day scan tracking)
- Recurring event generation from RRULE
- Pass-to-event linking
- bundle_type column (multi_day, season, custom)
- event_series table

**Expected But Not Built:**
```typescript
// Multi-day validation
validateMultiDayPass(ticketId, currentDate) {
  // Check if ticket is valid for today
  // Check if already scanned today
}
```

**Impact:** Cannot support:
- Music festivals (3-day passes)
- Sports seasons (season tickets)
- Theater residencies
- Conference badges

**Build Effort:** 13-19 days (3 phases)

**Key Files:**
- ticket-service/src/migrations/001_baseline_ticket.ts (schema exists)
- No service or routes

---

### 6. OFFLINE_SCANNING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Generate offline manifest (GET /offline/manifest/:eventId)
- Reconcile offline scans (POST /offline/reconcile)
- Duplicate detection during reconciliation
- Ticket status updates
- Transaction support

**Flow:**
1. BEFORE EVENT: Device downloads manifest with all valid ticket IDs
2. DURING EVENT: Device validates locally against manifest
3. AFTER EVENT: Device reconciles scans when connectivity restored

**Manifest Structure:**
```typescript
{
  eventId, generatedAt, expiresAt,
  tickets: [{ ticketId, ticketCode, tier, zone, maxScans, currentScans, status }],
  policies: { duplicateWindow, reentryRules }
}
```

**Reconciliation:**
- Checks for duplicates before inserting
- Updates ticket scan_count, last_scanned_at, first_scanned_at
- Returns per-ticket status (SUCCESS, DUPLICATE, ERROR)

**Key Files:**
- scanning-service/src/routes/offline.ts
- scanning-service/src/services/QRGenerator.ts

---

### 7. PRIMARY_PURCHASE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ CRITICAL - TWO BROKEN FLOWS |
| Priority | **P0** |

**Two Incompatible Flows Exist:**

**Flow A: ticket-service → order-service (Feature Flagged)**
- Entry: POST /api/v1/purchase on ticket-service
- Controlled by: USE_ORDER_SERVICE=true
- Uses PurchaseSaga pattern
- Status: ✅ Works if flag enabled

**Flow B: order-service → ticket-service (BROKEN)**
- Entry: POST /orders on order-service
- Calls internal endpoints that DON'T EXIST
- Status: ❌ Immediate 404 failure

**Missing Endpoints (order-service expects, ticket-service doesn't have):**
```
POST /internal/tickets/availability   ❌ 404
POST /internal/tickets/reserve        ❌ 404
POST /internal/tickets/confirm        ❌ 404
POST /internal/tickets/release        ❌ 404
POST /internal/tickets/prices         ❌ 404
```

**Flow C: Legacy Direct DB (When Flag is False)**
- Creates orders directly in ticket-service DB
- Bypasses order-service entirely
- Works but no payment integration

**NFT Minting Issues:**
- ticket-service mintWorker: FAKE (returns mock_nft_xxx)
- MintingServiceClient: Built but NEVER CALLED
- minting-service: Real but listens on wrong queue (Bull vs RabbitMQ)
- blockchain-service: Listens on correct queue but needs verification

**Venue Balance:** Never credited for primary sales

**Key Files:**
- ticket-service/src/controllers/purchaseController.ts
- ticket-service/src/sagas/PurchaseSaga.ts
- order-service/src/services/ticket.client.ts (calls non-existent endpoints)
- ticket-service/src/routes/internalRoutes.ts (has different endpoints)

---

### 8. SCANNING_DEVICE_MANAGEMENT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- List devices (GET /devices)
- Register device (POST /devices/register)
- Device zones (GA, VIP, BACKSTAGE)
- Upsert on conflict (re-register updates info)
- Active device filtering

**Device Model:**
```typescript
interface Device {
  device_id: string;    // Unique hardware identifier
  name: string;         // Human-readable name
  zone: string;         // GA, VIP, BACKSTAGE
  is_active: boolean;
}
```

**Key Files:**
- scanning-service/src/routes/devices.ts

---

### 9. SCAN_POLICIES_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Policy templates (list, apply to event)
- Custom policies per event
- Duplicate window (prevent re-scan within X minutes)
- Re-entry rules (cooldown, max re-entries)
- Zone enforcement (strict matching, VIP all-access)

**Policy Types:**
```typescript
DUPLICATE_WINDOW: { window_minutes: 5 }
REENTRY: { enabled: true, cooldown_minutes: 15, max_reentries: 2 }
ZONE_ENFORCEMENT: { strict: true, vip_all_access: true }
```

**Policy Templates:**
- Standard: 5-min duplicate, no re-entry
- Festival: 30-min window, unlimited re-entry
- Concert: 10-min window, 1 re-entry, strict zones
- Conference: No duplicate window, unlimited re-entry
- VIP Event: 5-min window, VIP all-access

**Key Files:**
- scanning-service/src/routes/policies.ts

---

### 10. SEATED_TICKETS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists (Schema):**
```sql
CREATE TABLE venue_layouts (
  venue_id UUID,
  name VARCHAR(200),
  type VARCHAR(50),  -- 'fixed', 'general_admission', 'mixed'
  sections JSONB,
  capacity INTEGER
);
```

- Layout model with sections (rows, seatsPerRow, pricing)
- Ticket seat fields: section, row, seat columns
- Layout types: fixed, general_admission, mixed

**What's Missing:**
- Layout management API (no routes)
- event_seats table for per-event inventory
- SeatAvailabilityService
- Seat selection during purchase
- Seat map visualization endpoint
- "Best available" algorithm
- Seat hold/release during checkout

**Current Behavior:**
- Purchase flow: reserves quantity, not specific seats
- Tickets created with section/row/seat = NULL

**Build Effort:** 12-14 days (4 phases)

**Key Files:**
- venue-service/src/migrations/001_baseline_venue.ts (schema)
- venue-service/src/models/layout.model.ts
- No seat selection service or routes

---

### 11. SECONDARY_PURCHASE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ CRITICAL STUB |
| Priority | **P0** |

**What's Broken - Purchase Endpoint is STUB:**
```typescript
// marketplace-service/src/controllers/transfer.controller.ts
async purchaseListing(_request: WalletRequest, reply: FastifyReply) {
  try {
    reply.send({ success: true });  // DOES NOTHING
  } catch (error) {
    throw error;
  }
}
```

Also stub:
- `directTransfer()` → returns { success: true }
- `getTransferHistory()` → returns { history: [] }
- `cancelTransfer()` → returns { success: true }

**Real Implementation Exists But Unused:**
```typescript
// marketplace-service/src/controllers/buy.controller.ts
// FULLY IMPLEMENTED with:
// - Distributed locking
// - Price validation
// - Self-purchase prevention
// - Crypto purchase flow
// - Fiat purchase flow (Stripe Connect)
// BUT NOT WIRED TO ANY ROUTE
```

**Services That Work (If Called):**
- TransferService: initiateTransfer, completeFiatTransfer
- StripePaymentService: createPaymentIntent, createTransferToSeller
- Webhook handling: payment_intent.succeeded

**Fee Structure (As Designed):**
- Platform Fee: 2.5%
- Venue Royalty: 5%
- Seller Receives: 92.5%

**Fix Required:**
```typescript
// In transfers.routes.ts, replace stub:
fastify.post('/purchase', buyController.buyListing.bind(buyController));
```

**Key Files:**
- marketplace-service/src/controllers/transfer.controller.ts ❌ STUB
- marketplace-service/src/controllers/buy.controller.ts ✅ Real (unused)
- marketplace-service/src/services/transfer.service.ts ✅ Works
- marketplace-service/src/services/stripe-payment.service.ts ✅ Works

---

### 12. TICKET_LIFECYCLE_EXPIRY_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Works:**
- Ticket state machine (complete)
- Valid state transitions defined
- Terminal states (CHECKED_IN, USED, REVOKED, REFUNDED, EXPIRED, CANCELLED)
- RBAC on sensitive transitions (revoke, refund, cancel require admin)
- Check-in time window validation (4 hours before to 2 hours after)
- Reservation expiry worker
- Reservation cleanup worker
- Orphan reservation detection
- Inventory reconciliation

**Ticket States:**
```
AVAILABLE → RESERVED → SOLD → MINTED → ACTIVE
                                         ↓
ACTIVE → TRANSFERRED → CHECKED_IN (terminal)
      → REFUNDED
      → REVOKED
```

**What's Missing - Post-Event Expiry:**
```typescript
// ticket-expiry.worker.ts DOES NOT EXIST
// Tickets stay ACTIVE forever after event ends

// Expected:
async processExpiredTickets() {
  UPDATE tickets SET status = 'expired'
  FROM events
  WHERE events.end_time < NOW() - INTERVAL '24 hours'
    AND tickets.status IN ('active', 'transferred')
}
```

**Workers:**
| Worker | Status |
|--------|--------|
| ReservationExpiryWorker | ✅ Working |
| ReservationCleanupWorker | ✅ Working |
| TicketExpiryWorker | ❌ Missing |

**Build Effort:** 1.5 days

**Key Files:**
- ticket-service/src/services/ticket-state-machine.ts ✅
- ticket-service/src/workers/reservation-expiry.worker.ts ✅
- ticket-service/src/workers/reservation-cleanup.worker.ts ✅
- No ticket-expiry.worker.ts

---

### 13. TICKET_LOCK_UNLOCK_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Exists:**
- `is_transferable` column on tickets (default true)
- Transfer check validates is_transferable

**Transfer Check:**
```typescript
if (ticket.is_transferable === false) {
  throw new ValidationError('This ticket is non-transferable');
}
```

**What's Missing:**
- Admin lock endpoint (POST /admin/tickets/:ticketId/lock)
- Admin unlock endpoint (DELETE /admin/tickets/:ticketId/lock)
- locked_at, locked_by, lock_reason columns
- Bulk lock/unlock
- Lock notifications
- Lock reasons enum (fraud_investigation, chargeback_pending, dispute, admin_request, event_policy, legal_hold)

**Current Behavior:**
- Can set is_transferable=false at creation time only
- No way to lock an already-issued ticket

**Impact:**
- Cannot freeze suspicious tickets for fraud
- Cannot lock during disputes
- Cannot prevent transfer during chargeback
- Cannot place legal holds

**Build Effort:** 2-3 days

**Key Files:**
- ticket-service/src/migrations/001_baseline_ticket.ts (column exists)
- ticket-service/src/services/transferService.ts (checks flag)
- No admin lock routes

---

### 14. TICKET_REISSUANCE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
- DUPLICATE_TICKET revocation reason in state machine (for revoking original)

**What's Missing:**
- Reissue endpoint (POST /admin/tickets/:ticketId/reissue)
- Reissuance history table
- Revoke original + create new flow
- New QR code generation
- Lost ticket claim flow
- Stolen ticket reporting
- ID verification before reissue
- Customer self-service request

**Expected Flow:**
1. Customer reports lost/stolen
2. Admin verifies identity
3. Original ticket REVOKED (duplicate_ticket reason)
4. New ticket created with same event/seat/tier
5. New QR code generated
6. New ticket linked to same order
7. Customer notified

**Build Effort:** 3-4 days

**Key Files:**
- ticket-service/src/services/ticket-state-machine.ts (has DUPLICATE_TICKET reason)
- No reissuance service or routes

---

### 15. TICKET_SCANNING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- QR generation with HMAC-SHA256
- QR rotation (30 seconds)
- Nonce-based replay attack prevention
- Timing-safe HMAC comparison
- Duplicate scan detection (configurable window)
- Re-entry policies (cooldown, max re-entries)
- Access zone enforcement (GA, VIP, BACKSTAGE hierarchy)
- Tenant isolation
- Venue isolation
- Device authorization
- Offline scanning support
- Rate limiting
- Comprehensive logging
- Prometheus metrics
- Graceful shutdown

**QR Format:** `ticketId:timestamp:nonce:hmac`

**Validation Pipeline (17 steps):**
1. Parse QR data
2. Validate HMAC (timing-safe)
3. Check nonce (Redis)
4. Check expiration (30s window)
5. Validate device
6. Check venue isolation
7. Check tenant isolation
8. Get ticket from DB
9. Check ticket tenant
10. Check ticket venue
11. Check event timing
12. Check validity period
13. Check ticket status
14. Check access zone
15. Check duplicate scan
16. Check re-entry policy
17. Allow/Deny

**What's NOT Checked:**
- Blockchain NFT ownership (not implemented)
- Impact: Low since NFTs aren't really minted anyway

**Key Files:**
- scanning-service/src/services/QRValidator.ts
- scanning-service/src/services/QRGenerator.ts
- scanning-service/src/routes/scan.ts

---

### 16. TICKET_TRANSFER_GIFT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ CRITICAL - NO BLOCKCHAIN |
| Priority | **P0** |

**Two Transfer Systems Exist:**

**System 1: ticket-service Transfer**
- Endpoint: POST /api/v1/transfer
- Comprehensive validation (cooldown, daily limits, event restrictions, blackout periods, identity verification, max transfers)
- ❌ NO blockchain transfer

**System 2: transfer-service**
- Endpoints: POST /transfers/gift, POST /transfers/:id/accept
- Gift flow with acceptance code
- 48-hour expiration
- Get-or-create recipient user
- ❌ NO blockchain transfer
- BlockchainTransferService EXISTS but NEVER CALLED

**Validation Checks (ticket-service):**
- Self-transfer prevention ✅
- Transfer cooldown (30 min) ✅
- Daily limit (10/day) ✅
- Ticket status is 'active' ✅
- Event allows transfers ✅
- Transfer deadline ✅
- Blackout periods ✅
- Max transfers not exceeded ✅
- Identity verification ✅

**BlockchainTransferService (EXISTS, UNUSED):**
```typescript
// transfer-service/src/services/blockchain-transfer.service.ts
class BlockchainTransferService {
  executeBlockchainTransfer()  // Retry logic, exponential backoff
  verifyOwnership()
  recordMetrics()
}
// NEVER INSTANTIATED OR CALLED
```

**Impact:**
```
Database says: Fan B owns ticket
Blockchain says: Fan A owns NFT
= Ownership mismatch
```

**Downstream Issues (even if fixed):**
- Tickets have fake nft_mint_address (mock_nft_xxx)
- No real wallet addresses
- No event_pda or ticket_pda

**Key Files:**
- ticket-service/src/services/transferService.ts ⚠️ No blockchain
- transfer-service/src/services/transfer.service.ts ⚠️ No blockchain
- transfer-service/src/services/blockchain-transfer.service.ts ✅ Unused
- transfer-service/src/services/nft.service.ts ✅ Unused

---

### 17. TICKET_UPGRADES_DOWNGRADES_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works:**
- Modification types enum (ADD_ITEM, REMOVE_ITEM, UPGRADE_ITEM, DOWNGRADE_ITEM, CHANGE_QUANTITY)
- Modification statuses (PENDING, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED)
- order_modifications table (complete schema)
- Request/approve/reject workflow
- Validation schemas

**Modification Flow:**
1. User requests upgrade → PENDING
2. Admin approves → triggers processModification()
3. Process updates order_items.ticket_type_id
4. Status → COMPLETED

**What's Broken - Price Calculation:**
```typescript
// order-service/src/services/order-modification.service.ts
async calculateModificationImpact() {
  const newPrice = 0; // TODO: Fetch from ticket service  ← HARDCODED!
  priceDifferenceCents = newPrice - originalPrice;
}
```

**What's Missing:**
- Ticket-service client for price lookup
- Payment processing for upgrades (requiresPayment calculated but not acted on)
- Refund processing for downgrades (requiresRefund calculated but not acted on)
- Actual ticket update in ticket-service
- Seat reassignment for tier changes
- NFT metadata update

**Current Behavior:**
- User requests upgrade
- Admin approves
- order_items.ticket_type_id updated
- Actual ticket UNCHANGED
- No payment collected
- No refund issued

**Build Effort:** 8-11 days (4 phases)

**Key Files:**
- order-service/src/services/order-modification.service.ts
- order-service/src/routes/order.routes.ts
- order-service/src/types/modification.types.ts

---

### 18. TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- QR validation with HMAC
- Replay attack prevention (nonce)
- Duplicate scan detection
- Re-entry policies
- Zone enforcement (hierarchical)
- Offline scanning support
- Device management
- Policy templates
- Ticket state machine
- Check-in status tracking
- Metrics & monitoring

**Validation Pipeline (15 steps):**
1. Parse QR (ticketId:timestamp:nonce:hmac)
2. Validate HMAC (timing-safe)
3. Check time window (30s)
4. Check nonce (Redis)
5. Validate device
6. Check venue isolation
7. Check tenant isolation
8. Get ticket from DB
9. Check ticket status
10. Check event timing
11. Check validity period
12. Check duplicate scan window
13. Check re-entry policy
14. Check access zone
15. Allow/Deny with reason

**Zone Hierarchy:**
- VIP → Can access: VIP, GA
- GA → Can access: GA only
- BACKSTAGE → Can access: BACKSTAGE, VIP, GA

**Missing:**
- Multi-entrance support (zones exist, but no explicit "entrance" concept)
- Blockchain verification (not implemented)

**Key Files:**
- scanning-service/src/services/QRValidator.ts
- scanning-service/src/services/QRGenerator.ts
- scanning-service/src/routes/scan.ts
- scanning-service/src/routes/policies.ts
- ticket-service/src/services/ticket-state-machine.ts

---

### 19. VIEW_MY_TICKETS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works:**
- GET /api/v1/tickets/ - current user's tickets
- GET /api/v1/tickets/users/:userId - with ownership check
- Tenant isolation (RLS)
- Ownership validation (user can only view own, unless admin)

**Three Endpoints Exist (Fragmented):**

| Endpoint | Auth | Filters | Status |
|----------|------|---------|--------|
| GET /tickets/ | ✅ | ❌ | Working |
| GET /tickets/users/:userId | ✅ | ❌ | Working |
| GET /orders/tickets | ✅ | eventId, status | NOT ROUTED |

**What's Broken:**
- /orders/tickets not routed through API gateway
- Inconsistent response formats
- orders endpoint bypasses service layer (direct SQL)
- No filtering on main endpoint
- No pagination

**Response Format Inconsistency:**
```typescript
// ticketController:
{ success: true, data: tickets }

// ordersController:
{ tickets: formattedTickets }  // Different format!
```

**Missing Fields in Main Endpoint:**
- priceCents, priceFormatted
- mintAddress
- eventDate

**Key Files:**
- ticket-service/src/routes/ticketRoutes.ts
- ticket-service/src/routes/orders.routes.ts (not routed)
- ticket-service/src/controllers/ticketController.ts
- ticket-service/src/controllers/orders.controller.ts
- api-gateway/src/routes/index.ts (missing /orders)

---

### 20. VIEW_SINGLE_TICKET_QR_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ SECURITY ISSUE |
| Priority | **P0** |

**What Works (Protected Routes):**
- GET /tickets/:ticketId - ownership validated
- GET /tickets/:ticketId/qr - ownership validated
- POST /tickets/validate-qr - requires venue_staff+ role

**QR Security:**
- AES-256-CBC encryption
- Time-based rotation (configurable interval)
- Random nonce per generation
- Redis caching with TTL
- Timing-safe comparison

**QR Payload:**
```json
{
  "ticketId": "uuid",
  "eventId": "uuid",
  "timestamp": 1704067200,
  "nonce": "a1b2c3d4e5f6g7h8"
}
```
Encrypted format: `TKT:{iv}:{encrypted_hex}`

**SECURITY VULNERABILITY - Unprotected Routes:**
```typescript
// qrRoutes.ts - NO AUTH MIDDLEWARE
fastify.get('/:ticketId/generate', ...);  // ❌ NO AUTH
fastify.post('/validate', ...);            // ❌ NO AUTH
fastify.post('/refresh', ...);             // ❌ NO AUTH
```

**Impact:** If ticket-service directly accessible:
- Anyone can generate QR for any ticket ID
- Anyone can validate QR without staff auth
- Anyone can refresh QR for any ticket

**Note:** API gateway only routes /tickets/*, not /qr/* - limits exposure but still vulnerable on internal network

**Fix Required:**
```typescript
// Add auth to qrRoutes.ts
fastify.get('/:ticketId/generate', {
  preHandler: [authMiddleware]
}, ...);
```

**OR delete qrRoutes.ts entirely** (ticketRoutes.ts has protected versions)

**Key Files:**
- ticket-service/src/routes/ticketRoutes.ts ✅ Protected
- ticket-service/src/routes/qrRoutes.ts ❌ UNPROTECTED
- ticket-service/src/services/qrService.ts ✅ Works

---

### 21. WILL_CALL_BOX_OFFICE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
- box_office staff role
- box_office permissions (tickets:sell, tickets:view)

**What's Missing:**
- delivery_method field on orders (digital, will_call, mail)
- will_call_name, will_call_id fields
- Box office lookup endpoint (GET /box-office/lookup)
- Ticket release endpoint (POST /box-office/release/:ticketId)
- Print ticket endpoint (POST /box-office/print/:ticketId)
- Will-call list endpoint (GET /box-office/event/:eventId/will-call-list)
- ID verification flow
- Customer pickup confirmation

**Expected Flow:**
1. At purchase: User selects "Will Call" delivery
2. At venue: Customer provides confirmation + ID
3. Box office looks up order
4. Verifies ID matches will_call_name
5. Releases tickets (marks as picked_up)
6. Prints physical or sends to mobile

**Impact:**
- No venue pickup option
- No secure ticket release process
- No same-day purchase pickup
- No third-party pickup (gifts)
- No bulk corporate pickup

**Build Effort:** 5-6 days

**Key Files:**
- venue-service/src/models/staff.model.ts (role exists)
- No box-office service or routes

---

## STATISTICS

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Complete | 7 | 33% |
| ⚠️ Partial | 9 | 43% |
| ❌ Not Implemented/Dead Code | 5 | 24% |

---

## CROSS-CUTTING CONCERNS

### Purchase Flow Dependencies
```
Primary Purchase:
  ticket-service ←→ order-service  ❌ BROKEN (missing endpoints)
                ↓
              Fake NFT minting
                ↓
              Venue never credited

Secondary Purchase:
  marketplace-service  ❌ STUB (returns success, does nothing)
```

### Transfer Flow Dependencies
```
ticket-service transfer ──┐
                          ├──→ Database updated ✅
transfer-service gift ────┘    Blockchain NOT updated ❌
```

### Blockchain Integration
```
All ticket operations skip blockchain:
- Primary purchase: fake mint
- Secondary purchase: stub
- Transfer: database only
- Scanning: no ownership check
```

---

## RECOMMENDED FIX ORDER

1. **P0: Fix primary purchase**
   - Add 5 missing internal endpoints to ticket-service
   - Effort: 2-3 days

2. **P0: Wire secondary purchase**
   - Replace stub with BuyController
   - Effort: 0.5 days

3. **P0: Fix QR route security**
   - Add auth to qrRoutes.ts OR delete it
   - Effort: 0.5 days

4. **P0: Wire blockchain transfer**
   - Call BlockchainTransferService from transfer flows
   - Effort: 1 day (after fixing upstream minting)

5. **P1: Add ticket expiry worker**
   - Expire tickets after event ends
   - Effort: 1.5 days

6. **P1: Wire wallet passes**
   - Call sendTicketConfirmation from purchase
   - Implement real pass signing
   - Effort: 4-5 days

7. **P2: Fix upgrade price calculation**
   - Create ticket-service client
   - Wire payment/refund processing
   - Effort: 4-5 days

8. **P2: Consolidate view my tickets**
   - Standardize response format
   - Route /orders through gateway
   - Add filtering/pagination
   - Effort: 2 days

9. **P3: Implement comp tickets**
   - Effort: 5-6 days

10. **P3: Implement will-call**
    - Effort: 5-6 days
