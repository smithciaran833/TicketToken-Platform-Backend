# ESCROW HOLD RELEASE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Escrow Hold / Release |

---

## Executive Summary

**WORKING - Comprehensive implementation**

| Component | Status |
|-----------|--------|
| escrow_accounts table | ✅ Exists |
| escrow_events table | ✅ Exists |
| Create escrow | ✅ Working |
| Get escrow | ✅ Working |
| Release escrow (full) | ✅ Working |
| Release escrow (partial) | ✅ Working |
| Cancel escrow | ✅ Working |
| Dispute escrow | ✅ Working |
| Auto-release after hold period | ✅ Working |
| Admin force-release | ✅ Working |
| Tenant isolation (RLS) | ✅ Enabled |

**Bottom Line:** Escrow functionality is fully implemented with proper hold/release mechanics, partial releases, auto-release after configurable hold periods, dispute handling, and admin overrides. Row-level security ensures tenant isolation.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/escrow` | POST | Create escrow | ✅ Working |
| `/escrow/:escrowId` | GET | Get escrow | ✅ Working |
| `/escrow/:escrowId/release` | POST | Release (full/partial) | ✅ Working |
| `/escrow/:escrowId/cancel` | POST | Cancel escrow | ✅ Working |
| `/escrow/order/:orderId` | GET | List order's escrows | ✅ Working |
| `/admin/escrow/:escrowId/force-release` | POST | Admin override | ✅ Working |
| `/admin/escrow/process-ready` | POST | Trigger auto-release | ✅ Working |

---

## Escrow Lifecycle
```
┌─────────────────────────────────────────────────────────────┐
│                    ESCROW LIFECYCLE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CREATE                                                      │
│    POST /escrow                                              │
│    └── Status: 'held'                                        │
│                                                              │
│  DURING HOLD PERIOD                                          │
│    ├── Can be released early (full/partial)                  │
│    ├── Can be cancelled                                      │
│    └── Can be marked as disputed                             │
│                                                              │
│  AUTO-RELEASE                                                │
│    └── processReadyEscrows() runs periodically              │
│        └── Releases escrows where hold_until <= NOW()        │
│                                                              │
│  TERMINAL STATES                                             │
│    ├── 'released' (full release)                            │
│    ├── 'cancelled'                                          │
│    └── 'disputed' (frozen)                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Create Escrow

**Endpoint:** `POST /api/v1/escrow`
```json
{
  "orderId": "uuid",
  "paymentIntentId": "pi_xxx",
  "amount": 10000,
  "holdDays": 7,
  "releaseConditions": ["event_completed", "no_dispute"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "orderId": "uuid",
  "amount": 10000,
  "heldAmount": 10000,
  "releasedAmount": 0,
  "status": "held",
  "holdUntil": "2025-01-08T00:00:00Z"
}
```

---

## Release Escrow

**Full Release:**
```json
POST /escrow/:escrowId/release
{
  "reason": "Event completed successfully"
}
```

**Partial Release:**
```json
POST /escrow/:escrowId/release
{
  "amount": 5000,
  "reason": "Partial release for venue portion"
}
```

---

## Status Values

| Status | Description |
|--------|-------------|
| `pending` | Initial state |
| `held` | Funds are held |
| `partially_released` | Some funds released |
| `released` | All funds released |
| `cancelled` | Escrow cancelled before release |
| `disputed` | Under dispute, frozen |

---

## Auto-Release Job

**File:** `backend/services/payment-service/src/services/escrow.service.ts`
```typescript
async processReadyEscrows(): Promise<number> {
  const result = await client.query(`
    SELECT * FROM escrow_accounts
    WHERE status = 'held'
      AND hold_until <= NOW()
    ORDER BY hold_until ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  `);

  for (const row of result.rows) {
    await this.releaseEscrow({
      escrowId: row.id,
      tenantId: row.tenant_id,
      reason: 'Automatic release after hold period',
    });
  }
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `payment-service/src/services/escrow.service.ts` | Core logic |
| `payment-service/src/routes/escrow.routes.ts` | API endpoints |
| `payment-service/src/routes/admin.routes.ts` | Admin overrides |
| `payment-service/src/validators/payment.validator.ts` | Validation |

---

## Related Documents

- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Marketplace escrow use case
- `CUSTODIAL_WALLET_FLOW_AUDIT.md` - Related concept
- `DISPUTE_CHARGEBACK_FLOW_AUDIT.md` - Dispute handling
