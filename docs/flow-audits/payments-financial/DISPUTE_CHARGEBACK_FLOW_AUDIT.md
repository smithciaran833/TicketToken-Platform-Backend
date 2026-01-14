# DISPUTE/CHARGEBACK FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Dispute/Chargeback Handling |

---

## Executive Summary

**FINDINGS:**

1. **In-app disputes work** - Users can create disputes, add evidence, admin can resolve
2. **Stripe chargebacks NOT handled** - No webhook listener for `charge.dispute.*` events
3. **Resolution doesn't trigger refunds** - Just updates status, no money movement
4. **Chargeback reserve system exists** - But never integrated with Stripe webhooks
5. **NFTs not frozen during disputes** - Can still be transferred

---

## Two Types of Disputes

### Type 1: In-App Disputes (Marketplace)

User disputes a resale transaction within the platform.

**Flow:**
```
Buyer unhappy with purchase
        ↓
POST /disputes (create dispute)
        ↓
Seller becomes respondent
        ↓
Both parties add evidence
        ↓
Admin reviews
        ↓
PUT /disputes/:id/resolve
        ↓
Status updated to 'resolved'
        ↓
??? (no refund triggered)
```

### Type 2: Stripe Chargebacks

Customer disputes charge with their bank/card issuer.

**Flow:**
```
Customer calls bank
        ↓
Bank initiates chargeback
        ↓
Stripe sends charge.dispute.created webhook
        ↓
??? (no handler exists)
        ↓
Money taken from Stripe balance
        ↓
Platform unaware
```

---

## In-App Dispute Flow

### Endpoints

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /disputes` | Create dispute | ✅ Works |
| `GET /disputes/my-disputes` | User's disputes | ✅ Works |
| `GET /disputes/:disputeId` | Get dispute | ✅ Works |
| `POST /disputes/:disputeId/evidence` | Add evidence | ✅ Works |
| `GET /admin/disputes` | Admin view disputes | ✅ Works |
| `PUT /admin/disputes/:disputeId/resolve` | Resolve dispute | ⚠️ Partial |

### Creating a Dispute

**File:** `backend/services/marketplace-service/src/services/dispute.service.ts`
```typescript
async createDispute(transferId, listingId, initiatorId, reason, description, evidence) {
  const transfer = await db('marketplace_transfers').where('id', transferId).first();
  
  // Determine respondent (other party)
  const respondentId = initiatorId === transfer.buyer_id
    ? transfer.seller_id
    : transfer.buyer_id;

  const dispute = {
    id: uuidv4(),
    transfer_id: transferId,
    listing_id: listingId,
    initiator_id: initiatorId,
    respondent_id: respondentId,
    reason,
    status: 'open',
  };

  await db('marketplace_disputes').insert(dispute);
  return dispute;
}
```

**Status:** ✅ Works

### Resolving a Dispute

**File:** `backend/services/marketplace-service/src/controllers/admin.controller.ts`
```typescript
async resolveDispute(request, reply) {
  const { disputeId } = request.params;
  const { resolution, reason } = request.body;

  await db('marketplace_disputes')
    .where('id', disputeId)
    .update({
      status: 'resolved',
      resolution,
      resolved_by: request.user?.id,
      resolved_at: new Date(),
    });

  reply.send({ success: true, message: 'Dispute resolved' });
}
```

**What's Missing:**
- ❌ No refund triggered based on resolution
- ❌ No notification to parties
- ❌ No escrow release/refund
- ❌ No NFT transfer reversal

---

## Stripe Chargeback Handling

### Webhook Events NOT Handled

| Event | Purpose | Handled? |
|-------|---------|----------|
| `charge.dispute.created` | New chargeback | ❌ NO |
| `charge.dispute.updated` | Chargeback status change | ❌ NO |
| `charge.dispute.closed` | Chargeback resolved | ❌ NO |
| `charge.dispute.funds_withdrawn` | Money taken | ❌ NO |
| `charge.dispute.funds_reinstated` | Money returned (won) | ❌ NO |

**File:** `backend/services/payment-service/src/webhooks/stripe-handler.ts`
```typescript
// Current event handling - NO DISPUTE EVENTS
const eventMap: Record<string, string> = {
  'payment_intent.succeeded': 'complete',
  'payment_intent.payment_failed': 'fail',
  'payment_intent.processing': 'process',
  'payment_intent.canceled': 'cancel',
  'charge.refunded': 'refund'
  // NO charge.dispute.* handlers
};
```

---

## Chargeback Reserve System

**File:** `backend/services/payment-service/src/services/chargeback-reserve.service.ts`

A sophisticated reserve system EXISTS but is never triggered:

### Features

| Feature | Status |
|---------|--------|
| Calculate reserve based on risk | ✅ Implemented |
| Risk assessment (low/medium/high) | ✅ Implemented |
| Create reserve for transaction | ✅ Implemented |
| Auto-release after hold period | ✅ Implemented |
| Use reserve for chargeback | ✅ Implemented |
| Reserve statistics | ✅ Implemented |

### Risk Calculation
```typescript
assessRiskLevel(userChargebacks, venueChargebackRate, paymentMethod) {
  if (userChargebacks >= 3 || venueChargebackRate >= 0.02) {
    return 'high';  // 5% reserve
  }
  if (userChargebacks >= 1 || venueChargebackRate >= 0.01) {
    return 'medium';  // 1% reserve
  }
  return 'low';  // 1% reserve
}
```

### The Problem
```typescript
// This method exists but is NEVER CALLED:
async handleChargeback(transactionId, chargebackAmountCents) {
  // Uses reserve to cover chargeback
  // Updates reserve status to 'used_for_chargeback'
}
```

No Stripe webhook calls `handleChargeback()`.

---

## What Should Happen

### On Stripe Chargeback
```typescript
// In stripe-handler.ts - MISSING
case 'charge.dispute.created':
  const dispute = event.data.object;
  
  // 1. Record chargeback
  await db('payment_chargebacks').insert({
    stripe_dispute_id: dispute.id,
    charge_id: dispute.charge,
    amount_cents: dispute.amount,
    reason: dispute.reason,
    status: 'pending',
  });

  // 2. Use reserve
  await chargebackReserveService.handleChargeback(
    transactionId,
    dispute.amount
  );

  // 3. Freeze related ticket/NFT
  await ticketService.freezeTicket(ticketId);

  // 4. Notify venue
  await notificationService.notifyVenue(venueId, 'chargeback_received');

  // 5. Submit evidence automatically
  await stripeService.submitDisputeEvidence(dispute.id, evidence);
  break;
```

### On Dispute Resolution (In-App)
```typescript
// In admin.controller.ts - MISSING
async resolveDispute(request, reply) {
  // ... update status ...

  // Based on resolution:
  if (resolution === 'buyer_wins') {
    // Refund buyer
    await paymentService.refundTransfer(transferId);
    // Return NFT to seller (or burn)
    await ticketService.returnTicket(ticketId, sellerId);
  } else if (resolution === 'seller_wins') {
    // Release held funds to seller
    await paymentService.releaseEscrow(transferId);
    // Confirm NFT transfer
  }

  // Notify both parties
  await notificationService.notifyDisputeResolution(disputeId, resolution);
}
```

---

## Database Tables

### marketplace_disputes

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Dispute ID |
| transfer_id | UUID | Related transfer |
| listing_id | UUID | Related listing |
| initiator_id | UUID | Who filed dispute |
| respondent_id | UUID | Other party |
| reason | VARCHAR | Dispute reason |
| description | TEXT | Details |
| status | VARCHAR | open, investigating, resolved, cancelled |
| resolution | TEXT | Resolution details |
| resolved_by | UUID | Admin who resolved |
| resolved_at | TIMESTAMP | When resolved |

### dispute_evidence

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Evidence ID |
| dispute_id | UUID | Related dispute |
| submitted_by | UUID | Who submitted |
| evidence_type | VARCHAR | text, image, document, blockchain_tx |
| content | TEXT | Evidence content |
| metadata | JSONB | Additional data |

### payment_reserves (Chargeback Reserve)

| Column | Type | Purpose |
|--------|------|---------|
| reserve_id | UUID | Reserve ID |
| transaction_id | UUID | Related transaction |
| reserve_amount_cents | INT | Amount held |
| reserve_rate | DECIMAL | % of transaction |
| risk_level | VARCHAR | low, medium, high |
| status | VARCHAR | held, released, used_for_chargeback |
| hold_until | TIMESTAMP | When eligible for release |

---

## Files That Need Changes

### Critical (Stripe Chargebacks Not Handled)

| File | Change | Priority |
|------|--------|----------|
| `payment-service/src/webhooks/stripe-handler.ts` | Add `charge.dispute.*` handlers | P0 |
| `payment-service/src/webhooks/stripe-handler.ts` | Call chargebackReserveService | P0 |

### High (Resolution Doesn't Refund)

| File | Change | Priority |
|------|--------|----------|
| `marketplace-service/src/controllers/admin.controller.ts` | Trigger refund on resolution | P1 |
| `marketplace-service/src/services/dispute.service.ts` | Add resolution actions | P1 |

### Medium (Missing Features)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service` | Add freeze/unfreeze during dispute | P2 |
| `notification-service` | Add dispute notifications | P2 |
| `marketplace-service` | Auto-submit Stripe dispute evidence | P2 |

---

## Summary

| Aspect | Status |
|--------|--------|
| Create in-app dispute | ✅ Works |
| Add evidence | ✅ Works |
| View disputes (user) | ✅ Works |
| View disputes (admin) | ✅ Works |
| Resolve dispute (admin) | ⚠️ No refund triggered |
| Stripe chargeback webhook | ❌ Not implemented |
| Chargeback reserve system | ⚠️ Exists but not connected |
| Freeze ticket during dispute | ❌ Not implemented |
| Auto-submit Stripe evidence | ❌ Not implemented |
| Notify parties | ❌ Not implemented |

---

## Related Documents

- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Refund processing
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Transfer that may be disputed
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Venue balance adjustments

