# PROMO CODES/DISCOUNTS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Updated | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Promo Codes & Discounts |

---

## Executive Summary

**CRITICAL: DEAD CODE - Service Exists But Is Never Called**

Two complete promo code implementations exist:
1. **order-service:** Full `PromoCodeService` with validation, redemption tracking, per-user limits
2. **ticket-service:** Simple `discountService` with percentage/fixed discounts

**The Problem:**
- No routes expose promo code validation or application
- Order creation hardcodes `discountCents: 0`
- The promo code functionality is completely inaccessible

| Component | Code Quality | Integration |
|-----------|--------------|-------------|
| PromoCodeService | ✅ Complete | ❌ DEAD CODE |
| Database tables | ✅ Complete with RLS | ❌ Never populated |
| Redemption tracking | ✅ Complete | ❌ Never called |

---

## Integration Verification

### How We Verified
```bash
# Check if PromoCodeService is ever called
grep -r "promoCode\|promo_code\|PromoCode\|applyDiscount" backend/services/order-service/src --include="*.ts" | grep -v "promo-code.service\|promo-code.types"
# Result: Only migration files - no actual usage

# Check order creation for discount handling
grep -r "discountCents" backend/services/order-service/src/services/order.service.ts
# Result: discountCents: 0  (hardcoded)

# Check for promo code routes
ls backend/services/order-service/src/routes/
# Result: No promo-code routes exist
```

### Conclusion

The `PromoCodeService` exists with full functionality but:
1. No routes expose it
2. Order creation ignores promo codes
3. There's no way for users to apply promo codes

---

## What Exists (The Code)

### PromoCodeService

**File:** `order-service/src/services/promo-code.service.ts`
```typescript
export class PromoCodeService {
  async validatePromoCode(tenantId: string, request: ValidatePromoCodeRequest): Promise<ApplyPromoCodeResult> {
    const codeUpper = request.code.toUpperCase();
    const result = await db.query(
      `SELECT * FROM promo_codes WHERE tenant_id = $1 AND UPPER(code) = $2 AND is_active = TRUE`,
      [tenantId, codeUpper]
    );

    if (result.rows.length === 0) {
      return { valid: false, discountAmount: 0, errorMessage: 'Invalid promo code' };
    }

    const promoCode = result.rows[0];

    // Check validity window
    if (now < promoCode.validFrom || now > promoCode.validUntil) {
      return { valid: false, discountAmount: 0, errorMessage: 'Promo code expired' };
    }

    // Check global usage limit
    if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
      return { valid: false, discountAmount: 0, errorMessage: 'Usage limit reached' };
    }

    // Check minimum purchase
    if (request.orderTotal < promoCode.minPurchaseCents) {
      return { valid: false, discountAmount: 0, errorMessage: `Minimum purchase of $${promoCode.minPurchaseCents / 100} required` };
    }

    // Check per-user limit
    const userRedemptions = await db.query(
      'SELECT COUNT(*) FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2',
      [promoCode.id, request.userId]
    );
    if (parseInt(userRedemptions.rows[0].count) >= promoCode.perUserLimit) {
      return { valid: false, discountAmount: 0, errorMessage: 'Already used this code' };
    }

    // Check event restrictions
    if (promoCode.applicableEventIds && request.eventIds) {
      const hasMatchingEvent = request.eventIds.some(id => promoCode.applicableEventIds.includes(id));
      if (!hasMatchingEvent) {
        return { valid: false, discountAmount: 0, errorMessage: 'Not applicable to these events' };
      }
    }

    const discountAmount = this.calculateDiscount(promoCode, request.orderTotal);
    return { valid: true, promoCode, discountAmount };
  }

  async applyPromoCode(tenantId, orderId, userId, promoCodeId, discountAmount): Promise<void> {
    await db.query(
      `INSERT INTO promo_code_redemptions (promo_code_id, order_id, user_id, tenant_id, discount_applied_cents) 
       VALUES ($1, $2, $3, $4, $5)`,
      [promoCodeId, orderId, userId, tenantId, discountAmount]
    );
    await db.query('UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = $1', [promoCodeId]);
  }

  async createPromoCode(tenantId, createdBy, request): Promise<PromoCode> {
    // Full CRUD for promo codes
  }
}
```

**Features:**
- ✅ Code validation
- ✅ Validity window checking
- ✅ Global usage limits
- ✅ Per-user limits
- ✅ Minimum purchase requirements
- ✅ Event-specific restrictions
- ✅ Category restrictions
- ✅ Percentage and fixed discounts
- ✅ Redemption tracking

**Called by:** ❌ Nothing

---

### Database Schema

**File:** `order-service/migrations/001_baseline_orders.ts`
```sql
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL,  -- 'percentage', 'fixed'
  discount_value DECIMAL NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  per_user_limit INTEGER DEFAULT 1,
  min_purchase_cents INTEGER DEFAULT 0,
  applicable_event_ids UUID[],
  applicable_categories TEXT[],
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE promo_code_redemptions (
  id UUID PRIMARY KEY,
  promo_code_id UUID REFERENCES promo_codes(id),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  discount_applied_cents INTEGER NOT NULL,
  redeemed_at TIMESTAMP DEFAULT NOW()
);

-- RLS enabled on both tables
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_codes_tenant_isolation ON promo_codes 
  FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY promo_code_redemptions_tenant_isolation ON promo_code_redemptions 
  FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Status:** ✅ Schema exists with proper RLS, ❌ Tables are empty

---

### Order Creation Ignores Promo Codes

**File:** `order-service/src/services/order.service.ts`
```typescript
async createOrder(tenantId: string, request: CreateOrderRequest) {
  // ... validation ...

  const order = {
    // ... other fields ...
    discountCents: 0,  // ← HARDCODED TO ZERO
    // No promo code handling anywhere
  };

  await this.orderModel.create(order);
}
```

**Problem:** Even if someone called the PromoCodeService, the order creation doesn't use the result.

---

### Missing Routes

**Expected routes that don't exist:**
```typescript
// These should exist but don't:
POST   /promo-codes              // Admin: Create promo code
GET    /promo-codes              // Admin: List promo codes
GET    /promo-codes/:id          // Admin: Get promo code
PUT    /promo-codes/:id          // Admin: Update promo code
DELETE /promo-codes/:id          // Admin: Delete promo code

POST   /orders/validate-promo    // User: Validate a promo code
POST   /orders/:id/apply-promo   // User: Apply promo code to order
```

**Actual routes in order-service:**
```
health.routes.ts
index.ts
metrics.routes.ts
order.routes.ts
refund-policy.routes.ts
tax.routes.ts
```

No promo code routes.

---

### ticket-service Discount Service

**File:** `ticket-service/src/services/discountService.ts`

A simpler discount system also exists here:
```typescript
export class DiscountService {
  async applyDiscount(ticketTypeId: string, quantity: number, code?: string) {
    // Basic percentage/fixed discount logic
  }
}
```

**Status:** ✅ Code exists, ❌ Also not integrated into purchase flow

---

## What Would Need to Happen

### 1. Create Promo Code Routes
```typescript
// order-service/src/routes/promo-code.routes.ts
export async function promoCodeRoutes(fastify: FastifyInstance) {
  // Admin routes
  fastify.post('/promo-codes', { preHandler: [adminAuth] }, createPromoCode);
  fastify.get('/promo-codes', { preHandler: [adminAuth] }, listPromoCodes);
  
  // User routes
  fastify.post('/validate-promo', { preHandler: [auth] }, validatePromoCode);
}
```

### 2. Update Order Creation
```typescript
async createOrder(tenantId: string, request: CreateOrderRequest) {
  let discountCents = 0;
  let appliedPromoCodeId = null;

  // If promo code provided, validate and apply
  if (request.promoCode) {
    const result = await this.promoCodeService.validatePromoCode(tenantId, {
      code: request.promoCode,
      orderTotal: subtotalCents,
      userId: request.userId,
      eventIds: request.items.map(i => i.eventId)
    });

    if (result.valid) {
      discountCents = result.discountAmount;
      appliedPromoCodeId = result.promoCode.id;
    } else {
      throw new Error(result.errorMessage);
    }
  }

  const order = {
    // ... other fields ...
    discountCents,
    promoCodeId: appliedPromoCodeId,
  };

  // After order created, record redemption
  if (appliedPromoCodeId) {
    await this.promoCodeService.applyPromoCode(
      tenantId, order.id, request.userId, appliedPromoCodeId, discountCents
    );
  }
}
```

---

## Summary

| Aspect | Code | Integration |
|--------|------|-------------|
| PromoCodeService | ✅ Complete | ❌ Dead code |
| Validation logic | ✅ Complete | ❌ Never called |
| Redemption tracking | ✅ Complete | ❌ Never called |
| Database schema | ✅ Complete with RLS | ❌ Empty tables |
| Admin routes | ❌ Missing | ❌ N/A |
| User validation route | ❌ Missing | ❌ N/A |
| Order integration | ❌ Hardcoded to 0 | ❌ Ignores promos |

**Bottom Line:** A complete promo code system exists in the codebase but is completely inaccessible. Users cannot apply promo codes. Admins cannot create promo codes. The order system ignores discounts entirely.

---

## To Fix

| Priority | Action |
|----------|--------|
| P0 | Create promo code admin routes |
| P0 | Create user promo code validation route |
| P0 | Update order creation to accept and apply promo codes |
| P1 | Add promo code field to order creation request schema |
| P2 | Create admin UI for promo code management |
| P3 | Consolidate with ticket-service discountService |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Order creation flow
- `ADMIN_BACKOFFICE_FLOW_AUDIT.md` - Admin functionality
