# BUYER PROTECTION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Buyer Protection |

---

## Executive Summary

**PARTIAL - Dispute system exists, limited automatic protection**

| Component | Status |
|-----------|--------|
| marketplace_disputes table | ✅ Exists |
| dispute_evidence table | ✅ Exists |
| Create dispute | ✅ Working |
| Add evidence | ✅ Working |
| Get my disputes | ✅ Working |
| Admin resolve dispute | ✅ Working |
| Dispute types defined | ✅ Defined |
| Automatic refund on resolution | ❌ Not implemented |
| Escrow hold during dispute | ⚠️ Partially (escrow exists separately) |
| Time-based auto-resolution | ❌ Not implemented |
| Buyer guarantee policy | ❌ Not defined |

**Bottom Line:** A dispute system exists where buyers can file disputes, submit evidence, and admins can resolve. However, there's no automatic refund when disputes are resolved in buyer's favor, no explicit escrow hold during disputes, and no defined buyer guarantee policy.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/disputes` | POST | Create dispute | ✅ Working |
| `/disputes/my-disputes` | GET | Get user's disputes | ✅ Working |
| `/disputes/:disputeId` | GET | Get dispute details | ✅ Working |
| `/disputes/:disputeId/evidence` | POST | Add evidence | ✅ Working |
| `/admin/disputes` | GET | List all disputes | ✅ Working |
| `/admin/disputes/:disputeId/resolve` | PUT | Resolve dispute | ✅ Working |

---

## Dispute Types

**File:** `backend/services/marketplace-service/src/config/constants.ts`
```typescript
export const DISPUTE_TYPES = {
  ENTRY_DENIED: 'entry_denied',      // Ticket didn't work at venue
  TECHNICAL_ISSUE: 'technical_issue', // Transfer failed
  EVENT_CANCELLED: 'event_cancelled', // Event was cancelled
  TICKET_INVALID: 'ticket_invalid',   // Ticket was fake/revoked
  OTHER: 'other',
};
```

---

## Dispute Flow

### Create Dispute

**File:** `backend/services/marketplace-service/src/services/dispute.service.ts`
```typescript
async createDispute(transferId, listingId, initiatorId, reason, description, evidence) {
  // Get transfer to find respondent
  const transfer = await db('marketplace_transfers')
    .where('id', transferId)
    .first();

  // Determine respondent (other party)
  const respondentId = initiatorId === transfer.buyer_id
    ? transfer.seller_id
    : transfer.buyer_id;

  // Create dispute
  const dispute = {
    id: uuidv4(),
    transfer_id: transferId,
    listing_id: listingId,
    initiator_id: initiatorId,
    respondent_id: respondentId,
    reason,
    description,
    status: 'open'
  };

  await db('marketplace_disputes').insert(dispute);
}
```

### Dispute Statuses
```typescript
type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'cancelled';
```

### Add Evidence
```typescript
async addEvidence(disputeId, userId, type, content, metadata) {
  // Evidence types: 'text', 'image', 'document', 'blockchain_tx'
  await db('dispute_evidence').insert({
    dispute_id: disputeId,
    submitted_by: userId,
    evidence_type: type,
    content,
    metadata
  });
}
```

---

## What's Missing

### 1. Automatic Refund on Resolution

When admin resolves in buyer's favor, no automatic refund:
```typescript
// NOT IMPLEMENTED
if (resolution === 'buyer_wins') {
  await escrowService.refundToBuyer(dispute.transfer_id);
  await ticketService.revokeFromBuyer(dispute.ticket_id);
  await ticketService.returnToSeller(dispute.ticket_id);
}
```

### 2. Escrow Hold During Dispute

Escrow exists but not explicitly linked to disputes:
```typescript
// NOT IMPLEMENTED
async onDisputeCreated(disputeId, transferId) {
  const escrow = await escrowService.getByTransfer(transferId);
  await escrowService.disputeEscrow(escrow.id, disputeId);
  // Funds frozen until resolution
}
```

### 3. Buyer Guarantee Policy

No defined policy for:
- How long buyer has to file dispute
- Automatic resolution timeframes
- What evidence is required
- What outcomes are possible

### 4. Notifications

- No notification to seller when dispute filed
- No notification to buyer on resolution
- No reminders for evidence submission

---

## Recommendations

### P2 - Complete Buyer Protection

| Task | Effort |
|------|--------|
| Link disputes to escrow | 0.5 day |
| Automatic refund on resolution | 0.5 day |
| Define guarantee policy | 0.25 day |
| Add dispute notifications | 0.5 day |
| Add time-based escalation | 0.5 day |
| **Total** | **2.25 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `marketplace-service/src/routes/disputes.routes.ts` | Routes |
| `marketplace-service/src/controllers/dispute.controller.ts` | Controller |
| `marketplace-service/src/services/dispute.service.ts` | Business logic |
| `marketplace-service/src/models/dispute.model.ts` | Data model |
| `marketplace-service/src/routes/admin.routes.ts` | Admin resolution |
| `marketplace-service/src/config/constants.ts` | Dispute types |

---

## Related Documents

- `ESCROW_HOLD_RELEASE_FLOW_AUDIT.md` - Escrow system
- `DISPUTE_CHARGEBACK_FLOW_AUDIT.md` - Payment disputes
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow
