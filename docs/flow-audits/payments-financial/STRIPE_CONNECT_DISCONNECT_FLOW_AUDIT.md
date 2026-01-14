# STRIPE CONNECT DISCONNECT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Stripe Connect Disconnect |

---

## Executive Summary

**NOT IMPLEMENTED - No disconnect functionality**

| Component | Status |
|-----------|--------|
| stripe_connect_status column | ✅ Exists (includes 'disabled') |
| Stripe Connect onboarding | ✅ Working (see SELLER_ONBOARDING) |
| Disconnect endpoint | ❌ Not implemented |
| Deauthorize webhook handler | ❌ Not implemented |
| Clear Connect fields on disconnect | ❌ Not implemented |
| Pending payout handling | ❌ Not implemented |

**Bottom Line:** Sellers can onboard to Stripe Connect, but there is no way to disconnect. The schema has a `disabled` status but no endpoint or logic to use it. If a seller wants to disconnect Stripe or Stripe sends a deauthorization webhook, it's not handled.

---

## What Exists

### 1. Database Schema

**File:** `backend/services/auth-service/src/migrations/001_auth_baseline.ts`
```sql
stripe_connect_account_id VARCHAR(255),
stripe_connect_status VARCHAR(50) DEFAULT 'not_started',
  -- CHECK: 'not_started', 'pending', 'enabled', 'disabled', 'rejected', 'restricted'
stripe_connect_charges_enabled BOOLEAN DEFAULT false,
stripe_connect_payouts_enabled BOOLEAN DEFAULT false,
stripe_connect_details_submitted BOOLEAN DEFAULT false,
stripe_connect_onboarded_at TIMESTAMP,
stripe_connect_capabilities JSONB DEFAULT '{}',
stripe_connect_country VARCHAR(2)
```

Note: `disabled` status exists but is never set.

### 2. Onboarding Works

See `SELLER_ONBOARDING_FLOW_AUDIT.md` - sellers can connect their Stripe account.

---

## What's Missing

### 1. Disconnect Endpoint

Expected but not implemented:
```
POST /api/v1/auth/stripe/disconnect
DELETE /api/v1/sellers/stripe-connect
```

### 2. Deauthorization Webhook

When a seller disconnects from Stripe's dashboard, Stripe sends a `account.application.deauthorized` webhook. Not handled.

### 3. Disconnect Logic
```typescript
// NOT IMPLEMENTED
async disconnectStripeConnect(userId: string) {
  // 1. Check for pending payouts
  // 2. Warn user about pending funds
  // 3. Update status to 'disabled'
  // 4. Clear sensitive fields
  // 5. Notify user
  // 6. Audit log
  
  await db('users')
    .where({ id: userId })
    .update({
      stripe_connect_status: 'disabled',
      stripe_connect_charges_enabled: false,
      stripe_connect_payouts_enabled: false,
      // Keep account_id for records
    });
}
```

### 4. Pending Payout Handling

Before disconnect, need to:
- Check venue_balances for pending/available funds
- Either force payout or warn seller
- Block disconnect if funds pending

---

## Impact

| Area | Impact |
|------|--------|
| Seller experience | Cannot disconnect Stripe |
| Compliance | May violate user data control rights |
| Account management | No way to handle deauthorizations |
| Edge cases | Zombie Connect accounts |

---

## Recommendations

### P3 - Implement Disconnect

| Task | Effort |
|------|--------|
| Create disconnect endpoint | 0.5 day |
| Handle pending payouts check | 0.5 day |
| Handle deauthorization webhook | 0.5 day |
| User notification | 0.25 day |
| **Total** | **1.75 days** |

---

## Related Documents

- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Connect onboarding
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Payout handling
