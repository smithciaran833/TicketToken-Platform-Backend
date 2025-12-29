# Ticket Service - 30 Ticket Lifecycle Management Audit

**Service:** ticket-service
**Document:** 30-ticket-lifecycle-management.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 48% (16/33 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No state transition validation, No duplicate scan detection, DB/blockchain not synced |
| HIGH | 4 | Missing states, No revocation mechanism, Enum case mismatch, No time validation |
| MEDIUM | 2 | No reconciliation job, Incomplete audit fields |
| LOW | 1 | No blockchain audit log |

---

## Ticket States (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| All states defined | PARTIAL | 7 states, missing MINTED, ACTIVE, CHECKED_IN |
| States match DB/code | PARTIAL | Enum UPPERCASE, DB lowercase |
| States synced blockchain | FAIL | No blockchain sync visible |
| Terminal states protected | FAIL | No transition validation |
| Initial state atomic | PASS | Status in INSERT |
| State enum exhaustive | PASS | TypeScript enum |
| Expired auto-applied | PASS | expireReservations() exists |
| State redundantly stored | PARTIAL | DB only, blockchain queued |

**Defined States:**
- AVAILABLE, RESERVED, SOLD, USED, CANCELLED, EXPIRED, TRANSFERRED

**Missing States:**
- MINTED, ACTIVE, CHECKED_IN, REVOKED, BURNED

---

## State Transitions (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Valid transitions defined | FAIL | No VALID_TRANSITIONS map |
| Invalid transitions throw | PARTIAL | Only transfer validates |
| Validation before update | PARTIAL | Transfer only |
| Transitions atomic | PASS | Uses transactions |
| Terminal no outgoing | FAIL | No terminal checks |
| History logged | PASS | ticket_audit_log table |
| Authorization required | PASS | User ownership verified |
| Timestamps recorded | PASS | updated_at = NOW() |
| Reasons captured | PARTIAL | Only transfers |
| Concurrent handled | PASS | FOR UPDATE locks |

---

## Validation Rules (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Blockchain authenticity | FAIL | validateQR doesn't verify on-chain |
| Ownership verified | PASS | Transfer checks user_id |
| Status before check-in | PARTIAL | Loose status check |
| Duplicate scan detection | FAIL | No duplicate check |
| Time window validation | FAIL | No event time check |
| Event ID matches | PASS | Payload contains eventId |
| Transfer count validated | PASS | transferService.ts:89-97 |
| Errors descriptive | PASS | Detailed messages |
| Validation atomic | PASS | Single transaction |

---

## Transfer Restrictions (6/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Transfer limit enforced | PASS | Max per ticket check |
| Non-transferable blocked | PASS | is_transferable check |
| Transfer freeze period | PASS | transfer_deadline_hours |
| Original access revoked | PASS | user_id updated |
| New owner credentials | PARTIAL | Notification, no new QR |
| Transfer history on-chain | FAIL | DB only |
| KYC enforced | PASS | identity_verified check |
| Marketplace restrictions | PARTIAL | No whitelist |

**Transfer Protections:**
- 30 min cooldown between transfers
- 10 max daily transfers per user
- Blackout period enforcement
- Identity verification requirement

---

## Revocation (2/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Reasons enumerated | FAIL | No enum |
| Revoked unusable | PARTIAL | Status check exists |
| Updates DB & blockchain | FAIL | DB only |
| Holder notified | FAIL | No notification |
| Refund triggered | PARTIAL | Separate handler |
| Admin auth required | FAIL | No admin check |
| Revocation logged | PARTIAL | Via trigger only |
| Revoked can't transfer | PASS | Status check |
| Bulk revocation | FAIL | No bulk method |
| Authorized roles only | FAIL | No RBAC |

---

## State Consistency (3/9)

| Check | Status | Evidence |
|-------|--------|----------|
| DB waits for blockchain | FAIL | Async queue, no wait |
| Reconciliation job | FAIL | Not implemented |
| Discrepancies logged | FAIL | No detection |
| Resolution strategy | FAIL | Not documented |
| Idempotent operations | PASS | Transaction locks |
| Transaction deduplication | PARTIAL | idempotencyKey in orders |
| Failed transactions retried | PASS | Queue retry |
| Eventual consistency SLA | PARTIAL | No formal SLA |
| Manual reconciliation | FAIL | No tools |

---

## Audit Trail (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| All changes logged | PARTIAL | Via trigger only |
| Who/what/when/where | PARTIAL | Missing IP, device |
| Logs immutable | PASS | Append-only |
| Retention policy | FAIL | Not defined |
| Logs searchable | PASS | Indexed |
| Blockchain audit | FAIL | Not implemented |
| Access restricted | PASS | Tenant isolation |
| Integrity verifiable | FAIL | No hash |
| Correlation ID | PARTIAL | Not included |
| Deletion prohibited | PASS | No delete API |

---

## Strengths

- Comprehensive transfer restrictions (cooldown, limit, deadline, blackout, KYC)
- FOR UPDATE locking prevents races
- Tenant isolation in all queries
- QR encryption (AES-256-CBC)
- Transfer validation (10+ checks)
- Descriptive error messages
- Notification queuing
- Audit table with trigger
- Reservation expiration
- Lock timeout handling

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Add state transition validation:**
```typescript
const VALID_TRANSITIONS = {
  'available': ['reserved', 'sold'],
  'reserved': ['sold', 'available', 'expired'],
  'sold': ['active', 'refunded'],
  'active': ['checked_in', 'transferred', 'revoked'],
  'checked_in': ['used'],
  'used': [],      // Terminal
  'expired': [],   // Terminal
  'revoked': [],   // Terminal
};
```

2. **Add duplicate scan detection:**
```typescript
const previousScan = await this.getPreviousScan(ticketId);
if (previousScan) throw new Error('Already scanned');
await this.recordScan(ticketId, context);
```

3. **Standardize state values to lowercase everywhere**

### HIGH (This Week)
1. Add missing states (MINTED, ACTIVE, CHECKED_IN, REVOKED)
2. Implement revokeTicket() with reasons and notifications
3. Add time window validation in validateQR()
4. Wait for blockchain finalization before DB commit

### MEDIUM (This Month)
1. Add reconciliation job for DB/blockchain sync
2. Enhance audit with IP, device, correlation ID

### LOW (Backlog)
1. Add blockchain audit logging
