# Ticket Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| State Management | 4 | CRITICAL |
| Multi-tenancy | 1 | CRITICAL |
| Core Features | 4 | HIGH |
| Operational | 2 | MEDIUM |
| Frontend Features | 3 | MEDIUM |

---

## CRITICAL Issues

### GAP-TICKET-001: No State Transition Validation
- **Severity:** CRITICAL
- **Audit:** 30-ticket-lifecycle-management.md
- **Current:** Tickets can go from any state to any state. No VALID_TRANSITIONS map.
- **Risk:** USED ticket set back to AVAILABLE. CANCELLED ticket set to SOLD. Enables fraud.
- **Fix:** Implement state machine:
```typescript
const VALID_TRANSITIONS = {
  'available': ['reserved', 'sold'],
  'reserved': ['sold', 'available', 'expired'],
  'sold': ['active', 'refunded'],
  'active': ['checked_in', 'transferred', 'revoked'],
  'checked_in': ['used'],
  'used': [],      // Terminal
  'expired': [],   // Terminal
  'cancelled': [], // Terminal
  'revoked': [],   // Terminal
};
```

### GAP-TICKET-002: No Duplicate Scan Detection
- **Severity:** CRITICAL
- **Audit:** 30-ticket-lifecycle-management.md
- **Current:** QR scan doesn't check if already scanned
- **Risk:** Same ticket scanned twice. Share QR with friend, both get in.
- **Fix:** 
  - Record every scan with timestamp in ticket_validations
  - Before accepting, check if ticket already scanned for this event
  - Return error "Already scanned at [time]"

### GAP-TICKET-003: Database Updates Before Blockchain Confirmation
- **Severity:** CRITICAL
- **Audit:** 31-blockchain-database-consistency.md
- **Current:** DB updated immediately, blockchain queued async
- **Risk:** Blockchain fails, DB says ticket exists, NFT never minted. Ownership disputes.
- **Fix Options:**
  1. Wait for blockchain confirmation before DB commit (slower, safer)
  2. Add `pending_transactions` table, status = 'pending' until confirmed
  3. Reconciliation job to detect and fix discrepancies

### GAP-TICKET-004: Missing Ticket States
- **Severity:** CRITICAL
- **Audit:** 30-ticket-lifecycle-management.md
- **Current States:** AVAILABLE, RESERVED, SOLD, USED, CANCELLED, EXPIRED, TRANSFERRED
- **Missing States:**
  - MINTED - NFT created on blockchain
  - ACTIVE - Purchased and ready to use
  - CHECKED_IN - Scanned at door, event ongoing
  - REVOKED - Forcibly invalidated by admin
- **Risk:** Can't track NFT minting status, can't distinguish scan from event-over, can't revoke fraud

### GAP-TICKET-005: Tenant Header Bypass
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** Accepts `x-tenant-id` header AND tenant from body, not just JWT
- **Risk:** Attacker sets any tenant ID in header, accesses other tenants' tickets
- **Fix:** Only extract tenant from verified JWT. Reject tenant from headers/body.

---

## HIGH Issues

### GAP-TICKET-006: No Revocation System
- **Severity:** HIGH
- **Audit:** 30-ticket-lifecycle-management.md
- **Current:** No way to revoke tickets
- **Missing:**
  - `revokeTicket(ticketId, reason, adminId)` function
  - Revocation reasons enum (FRAUD, CHARGEBACK, EVENT_CANCELLED, ADMIN_ACTION)
  - Notification to ticket holder
  - Admin authorization check (RBAC)
  - Bulk revocation for event cancellation
  - DB + blockchain update
- **Impact:** Can't handle chargebacks, can't invalidate stolen tickets, can't bulk-cancel

### GAP-TICKET-007: No Time Window Validation on Scan
- **Severity:** HIGH
- **Audit:** 30-ticket-lifecycle-management.md
- **Current:** QR validation doesn't check event timing
- **Risk:** Scan ticket for yesterday's event, scan hours before doors open
- **Fix:** 
  - Get event start/end time
  - Allow scan within window (e.g., 2 hours before to event end)
  - Reject with "Event not started" or "Event ended"

### GAP-TICKET-008: No Reconciliation Job
- **Severity:** HIGH
- **Audit:** 31-blockchain-database-consistency.md
- **Current:** No background job comparing DB vs blockchain
- **Risk:** DB and blockchain out of sync, nobody knows, no detection, no tools
- **Fix:**
  - Scheduled job (every hour) comparing ownership
  - Log discrepancies to reconciliation_log table
  - Alert on mismatches
  - Manual reconciliation tools for ops

### GAP-TICKET-009: S2S Authentication Issues
- **Severity:** HIGH
- **Audit:** 05-s2s-auth.md
- **Issues:**
  - Default HMAC secret hardcoded in source code
  - Uses HTTP not HTTPS for internal calls
  - Any service can call any endpoint (no allowlist)
  - RabbitMQ using admin:admin default credentials
  - No credential rotation mechanism
- **Fix:**
  - Remove default secret, fail on startup if missing
  - Use HTTPS for internal calls
  - Implement per-endpoint service allowlist
  - Unique RabbitMQ credentials per service

---

## MEDIUM Issues

### GAP-TICKET-010: No Metrics Endpoint
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** No `/metrics` endpoint, no Prometheus integration
- **Missing:**
  - HTTP request counter
  - Request duration histogram
  - Error rate by status code
  - Default Node.js metrics
- **Impact:** Can't monitor service health, can't track error rates, can't alert

### GAP-TICKET-011: Input Validation Missing unknown(false)
- **Severity:** MEDIUM
- **Audit:** 02-input-validation.md
- **Current:** Joi schemas don't reject unknown properties
- **Risk:** Mass assignment attacks, prototype pollution, extra fields saved to DB
- **Fix:** Add `.unknown(false)` to all Joi schemas

### GAP-TICKET-012: No OpenTelemetry Tracing
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** No distributed tracing
- **Impact:** Can't trace requests across services, hard to debug production issues

---

## Frontend-Related Gaps

### GAP-TICKET-013: No Ticket Gifting Flow
- **Severity:** MEDIUM
- **User Story:** "I want to gift a ticket to my friend who isn't on the app yet"
- **Current:** Transfer exists but requires recipient to have account
- **Needed:**
  - POST /tickets/:id/gift (recipient email or phone)
  - Creates pending gift record
  - Sends invite to recipient
  - Recipient claims ticket when they sign up
  - Gift expires after X days if unclaimed
- **Impact:** Can't gift tickets to non-users, common use case

### GAP-TICKET-014: No Past Tickets Filter
- **Severity:** MEDIUM
- **User Story:** "I want to see all the events I've attended"
- **Current:** GET /tickets returns all tickets, no filter for past events
- **Needed:**
  - GET /tickets?filter=past or GET /tickets/history
  - Returns tickets where event.end_date < now AND status IN (USED, CHECKED_IN)
  - Useful for memories, proof of attendance, "Tickets I've used"
- **Impact:** Can't build "My Past Events" screen in app

### GAP-TICKET-015: No QR Code Refresh/Rotation
- **Severity:** LOW
- **User Story:** "Make my QR code rotate so screenshots don't work"
- **Current:** Static QR code per ticket
- **Needed:**
  - QR contains time-based component
  - Refreshes every 30-60 seconds
  - Scanner validates against time window
- **Note:** This may already be partially implemented - need to verify

---

## Existing Endpoints (Verified Working)

### Tickets
- GET /tickets ✅
- GET /tickets/:id ✅
- POST /tickets ✅ (internal - creates ticket after purchase)
- PUT /tickets/:id ✅
- GET /tickets/:id/qr ✅

### Reservations
- POST /reservations ✅
- GET /reservations/:id ✅
- DELETE /reservations/:id ✅
- POST /reservations/:id/extend ✅

### Transfers
- POST /tickets/:id/transfer ✅
- GET /tickets/:id/history ✅

### Validation
- POST /tickets/validate ✅ (QR validation)

### Internal
- POST /internal/tickets/create ✅
- GET /internal/tickets/:id/validate ✅

### Health
- GET /health/live ✅
- GET /health/ready ✅

---

## Database Tables (18 tables)

| Table | Status | Notes |
|-------|--------|-------|
| ticket_types | ✅ | Ticket tier definitions |
| reservations | ✅ | Temporary holds |
| tickets | ✅ | Main tickets table |
| ticket_transfers | ✅ | Transfer history |
| ticket_validations | ✅ | Scan records |
| refunds | ✅ | Refund tracking |
| waitlist | ✅ | Waitlist entries |
| ticket_price_history | ✅ | Price changes |
| ticket_holds | ✅ | Admin holds |
| ticket_bundles | ✅ | Bundle definitions |
| ticket_bundle_items | ✅ | Bundle contents |
| ticket_audit_log | ✅ | Audit trail |
| ticket_notifications | ✅ | Notification queue |
| discounts | ✅ | Discount codes |
| order_discounts | ✅ | Applied discounts |
| outbox | ✅ | Event outbox |
| reservation_history | ✅ | Reservation audit |
| webhook_nonces | ✅ | Idempotency |
| pending_transactions | ❌ | MISSING - needed for blockchain sync |
| ticket_gifts | ❌ | MISSING - needed for gifting |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| event-service | Event details, timing, venue |
| auth-service | User verification, ownership |
| blockchain-service | NFT minting, transfers |
| notification-service | Transfer/gift notifications |
| payment-service | Refund coordination |

| Other services need from this | What |
|------------------------------|------|
| scanning-service | Ticket validation |
| transfer-service | Transfer execution |
| marketplace-service | Ticket availability |
| order-service | Ticket creation after purchase |

---

## Priority Order for Fixes

### Immediate (Security - Before Launch)
1. GAP-TICKET-005: Fix tenant header bypass
2. GAP-TICKET-002: Add duplicate scan detection
3. GAP-TICKET-001: Implement state transition validation

### This Week (Data Integrity)
4. GAP-TICKET-003: Add pending_transactions table, wait for blockchain
5. GAP-TICKET-004: Add missing states (MINTED, ACTIVE, CHECKED_IN, REVOKED)
6. GAP-TICKET-006: Implement revocation system
7. GAP-TICKET-009: Fix S2S auth issues

### This Month (Core Features)
8. GAP-TICKET-007: Add time window validation on scan
9. GAP-TICKET-008: Implement reconciliation job
10. GAP-TICKET-010: Add /metrics endpoint
11. GAP-TICKET-011: Add unknown(false) to schemas

### Future (Frontend Features)
12. GAP-TICKET-013: Ticket gifting flow
13. GAP-TICKET-014: Past tickets filter
14. GAP-TICKET-015: QR code rotation (verify current state first)

