# SELLER ONBOARDING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Seller Onboarding (Fan → Seller) |

---

## Executive Summary

**GOOD NEWS:** This flow is **mostly complete and working**. Stripe Connect integration is properly implemented.

**Minor issue:** Duplicate `handleAccountUpdated` code exists in two services (payment-service and marketplace-service), but only payment-service actually uses it.

---

## The Flow
```
Fan wants to sell tickets
        ↓
POST /api/marketplace/seller/onboard
        ↓
Create Stripe Connect Express account
        ↓
Return onboarding URL to frontend
        ↓
Fan completes Stripe onboarding form
        ↓
Stripe sends account.updated webhook
        ↓
payment-service updates users table
        ↓
Fan can now list tickets for fiat sale
```

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Start onboarding endpoint | ✅ Works |
| Create Stripe Connect account | ✅ Works |
| Generate onboarding URL | ✅ Works |
| Get account status | ✅ Works |
| Refresh onboarding link | ✅ Works |
| Check can accept fiat | ✅ Works |
| Webhook updates user status | ✅ Works |
| Database schema | ✅ Complete |

---

## Endpoints

### POST /api/marketplace/seller/onboard

**File:** `backend/services/marketplace-service/src/controllers/seller-onboarding.controller.ts`

**What it does:**
1. Check if user already has Connect account
2. If not, create Stripe Connect Express account
3. Save account ID to users table
4. Generate onboarding link
5. Return URL to frontend
```typescript
const account = await this.stripe.accounts.create({
  type: 'express',
  country: 'US',
  email: email,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  business_type: 'individual',
  metadata: {
    user_id: userId,  // Important for webhook handling
  },
});
```

---

### GET /api/marketplace/seller/status

Returns current Stripe Connect status:
- `accountId`
- `status` (not_started, pending, enabled, disabled)
- `chargesEnabled`
- `payoutsEnabled`
- `detailsSubmitted`
- `requirements` (what's still needed)

---

### POST /api/marketplace/seller/refresh-link

Generate new onboarding link if user needs to complete additional verification.

---

### GET /api/marketplace/seller/can-accept-fiat

Quick check if seller can accept payments:
```typescript
return user?.stripe_connect_charges_enabled && user?.stripe_connect_payouts_enabled;
```

---

## Webhook Handling

### Stripe → payment-service

**File:** `backend/services/payment-service/src/webhooks/stripe-handler.ts`
```typescript
if (event.type === 'account.updated') {
  await this.handleAccountUpdated(event);
  return;
}
```

**Updates users table with:**
- `stripe_connect_status`
- `stripe_connect_charges_enabled`
- `stripe_connect_payouts_enabled`
- `stripe_connect_details_submitted`
- `stripe_connect_capabilities`
- `stripe_connect_country`
- `stripe_connect_onboarded_at`

---

## Database Schema

**Table:** `users` (in auth-service)

| Column | Type | Purpose |
|--------|------|---------|
| stripe_connect_account_id | VARCHAR(255) | Stripe account ID |
| stripe_connect_status | VARCHAR(50) | not_started, pending, enabled, disabled |
| stripe_connect_charges_enabled | BOOLEAN | Can accept charges |
| stripe_connect_payouts_enabled | BOOLEAN | Can receive payouts |
| stripe_connect_details_submitted | BOOLEAN | Completed onboarding form |
| stripe_connect_onboarded_at | TIMESTAMP | When fully onboarded |
| stripe_connect_capabilities | JSONB | Stripe capabilities |
| stripe_connect_country | VARCHAR(2) | Country code |

---

## Minor Issues

### Issue 1: Duplicate handleAccountUpdated

**Two implementations exist:**
1. `payment-service/src/webhooks/stripe-handler.ts` ← **Actually used**
2. `marketplace-service/src/services/seller-onboarding.service.ts` ← **Never called**

The marketplace-service version is dead code. Not a bug, just cleanup needed.

### Issue 2: No Seller Wallet Requirement

For fiat sales, no wallet is needed. But if seller wants to receive crypto or list NFTs, they need a wallet.

Current flow doesn't enforce wallet creation for sellers.

---

## Integration with Resale Flow

When seller lists a ticket:
```typescript
// In stripePaymentService.getSellerStripeAccountId():
const user = await db('users')
  .where('id', sellerId)
  .select('stripe_connect_account_id', 'stripe_connect_charges_enabled', 'stripe_connect_payouts_enabled')
  .first();

if (!user.stripe_connect_account_id) {
  throw new Error('Seller has not connected their Stripe account');
}

if (!user.stripe_connect_charges_enabled || !user.stripe_connect_payouts_enabled) {
  throw new Error('Seller Stripe account is not fully enabled');
}
```

This properly blocks unverified sellers from receiving payments.

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `marketplace-service/src/routes/seller-onboarding.routes.ts` | Route definitions | ✅ Complete |
| `marketplace-service/src/controllers/seller-onboarding.controller.ts` | Request handling | ✅ Complete |
| `marketplace-service/src/services/seller-onboarding.service.ts` | Business logic | ✅ Complete |
| `payment-service/src/webhooks/stripe-handler.ts` | Webhook handling | ✅ Complete |
| `auth-service/src/migrations/001_auth_baseline.ts` | DB schema | ✅ Complete |

---

## What Could Be Improved

| Improvement | Priority |
|-------------|----------|
| Remove duplicate handleAccountUpdated from marketplace-service | P3 |
| Add wallet requirement for crypto sales | P3 |
| Add seller verification/KYC for high-volume sellers | P3 |

---

## Summary

**This is one of the most complete flows in the system.**

| Aspect | Status |
|--------|--------|
| Stripe Connect account creation | ✅ Works |
| Onboarding link generation | ✅ Works |
| Status checking | ✅ Works |
| Webhook updates | ✅ Works |
| Database schema | ✅ Complete |
| Integration with resale | ✅ Works |
| Blockchain integration needed? | ❌ No (fiat only) |

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Similar flow for venues
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Uses seller Connect account

