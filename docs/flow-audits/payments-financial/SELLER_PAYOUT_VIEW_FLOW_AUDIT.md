# SELLER PAYOUT VIEW FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Seller Payout View (History) |

---

## Executive Summary

**PARTIAL - Route exists, returns empty (TODO)**

| Component | Status |
|-----------|--------|
| payout_events table | ✅ Exists |
| payout_schedules table | ✅ Exists |
| GET /venues/:venueId/payouts route | ✅ Exists |
| getPayoutHistory controller method | ⚠️ Returns empty array (TODO) |
| VenueBalanceService.getPayoutHistory | ❌ Not implemented |
| Payout event tracking | ⚠️ Schema only |

**Bottom Line:** The route `GET /venues/:venueId/payouts` exists and the `payout_events` table is defined, but the controller method has a TODO comment and returns an empty array. Sellers cannot view their payout history.

---

## What Exists

### 1. Database Tables

**payout_events:**
```sql
CREATE TABLE payout_events (
  id UUID PRIMARY KEY,
  stripe_account_id VARCHAR(50),
  payout_id VARCHAR(50),
  event_type VARCHAR(30),  -- 'paid', 'failed', 'pending'
  amount INTEGER,
  failure_code VARCHAR(50),
  failure_message VARCHAR(500),
  created_at TIMESTAMP
);
```

**payout_schedules:**
```sql
CREATE TABLE payout_schedules (
  id UUID PRIMARY KEY,
  connected_account_id UUID REFERENCES connected_accounts(id),
  schedule_type VARCHAR(20),  -- 'daily', 'weekly', 'monthly'
  next_payout_date TIMESTAMP,
  -- ... more fields
);
```

### 2. Route Definition

**File:** `backend/services/payment-service/src/routes/venue.routes.ts`
```typescript
fastify.get(
  '/:venueId/payouts',
  { preHandler: [authenticate] },
  async (request, reply) => {
    return controller.getPayoutHistory(request, reply);
  }
);
```

### 3. Controller (TODO)

**File:** `backend/services/payment-service/src/controllers/venue.controller.ts`
```typescript
async getPayoutHistory(request: FastifyRequest, reply: FastifyReply) {
  const { venueId } = request.params as any;
  const { limit = 50, offset = 0 } = request.query as any;
  
  // Verify venue access
  if (!user.venues?.includes(venueId) && !user.isAdmin) {
    return reply.status(403).send({ error: 'Access denied' });
  }

  // TODO: Implement getPayoutHistory method
  const history: any[] = []; /* await this.venueBalanceService.getPayoutHistory(
    venueId,
    parseInt(limit as string),
    parseInt(offset as string)
  ); */

  return reply.send(history);
}
```

---

## What's Missing

### 1. Service Method Implementation
```typescript
// NOT IMPLEMENTED in VenueBalanceService
async getPayoutHistory(venueId: string, limit: number, offset: number) {
  // Query payout_events by venue's stripe_account_id
  // Join with connected_accounts to filter by venue
  // Return payout list with details
}
```

### 2. Payout Event Recording

When payouts occur via `processPayout()`, events should be recorded in `payout_events` table. Need to verify this is happening.

---

## Expected Response
```json
{
  "payouts": [
    {
      "id": "po_xxx",
      "amount": 150000,
      "status": "paid",
      "arrivalDate": "2025-01-02T00:00:00Z",
      "createdAt": "2025-01-01T12:00:00Z"
    },
    {
      "id": "po_yyy",
      "amount": 75000,
      "status": "pending",
      "estimatedArrival": "2025-01-03T00:00:00Z",
      "createdAt": "2025-01-01T18:00:00Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

---

## Recommendations

### P2 - Implement Payout History

| Task | Effort |
|------|--------|
| Implement getPayoutHistory in service | 0.5 day |
| Ensure payout events are recorded | 0.5 day |
| Add pagination support | 0.25 day |
| Add date filtering | 0.25 day |
| **Total** | **1.5 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `payment-service/src/routes/venue.routes.ts` | ✅ Route exists |
| `payment-service/src/controllers/venue.controller.ts` | ⚠️ TODO |
| `payment-service/src/services/core/venue-balance.service.ts` | ❌ Method missing |
| `payment-service/src/migrations/005_add_disputes_payouts_jobs.ts` | ✅ Table exists |

---

## Related Documents

- `VENUE_PAYOUT_FLOW_AUDIT.md` - Payout processing (broken)
- `PAYOUT_SCHEDULING_FLOW_AUDIT.md` - Scheduled payouts
