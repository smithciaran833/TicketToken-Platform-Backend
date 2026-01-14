# ABANDONED CART FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Abandoned Cart Recovery |

---

## Executive Summary

**WORKING - Full abandoned cart tracking and recovery**

| Component | Status |
|-----------|--------|
| Track abandoned cart | ✅ Working |
| Process abandoned carts | ✅ Working |
| Recovery email trigger | ✅ Working |
| Conversion tracking | ✅ Working |

**Bottom Line:** Complete abandoned cart recovery system integrated with the marketing campaign service. Tracks abandoned carts, triggers recovery emails after 1 hour, and integrates with automation triggers.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/campaigns/abandoned-carts` | POST | Track abandoned cart | ✅ Working |

---

## Implementation Details

### Track Abandoned Cart
```typescript
async trackAbandonedCart(cartData: {
  userId: string;
  venueId: string;
  eventId: string;
  cartItems: any[];
  totalAmountCents: number;
}) {
  const cartId = uuidv4();

  await db('abandoned_carts').insert({
    id: cartId,
    user_id: cartData.userId,
    venue_id: cartData.venueId,
    event_id: cartData.eventId,
    cart_items: JSON.stringify(cartData.cartItems),
    total_amount_cents: cartData.totalAmountCents,
    abandoned_at: new Date(),
    created_at: new Date(),
  });

  return cartId;
}
```

### Process Abandoned Carts (Background Job)
```typescript
async processAbandonedCarts() {
  // Find carts abandoned > 1 hour ago that haven't been emailed
  const abandonedCarts = await db('abandoned_carts')
    .where('recovery_email_sent', false)
    .where('converted', false)
    .where('abandoned_at', '<', new Date(Date.now() - 60 * 60 * 1000))
    .limit(100);

  for (const cart of abandonedCarts) {
    // Trigger automation
    await this.processAutomationTrigger('abandoned_cart', {
      userId: cart.user_id,
      venueId: cart.venue_id,
      eventId: cart.event_id,
      cartItems: JSON.parse(cart.cart_items),
      totalAmount: cart.total_amount_cents / 100,
    });

    // Mark as sent
    await db('abandoned_carts')
      .where('id', cart.id)
      .update({
        recovery_email_sent: true,
        recovery_email_sent_at: new Date(),
      });
  }
}
```

---

## Cart Lifecycle
```
1. User adds items to cart
   → Cart created in session

2. User leaves without completing purchase
   → POST /campaigns/abandoned-carts
   → Cart tracked with items, user, amount

3. 1 hour passes
   → Background job runs processAbandonedCarts()
   → Recovery email sent

4. User returns and completes purchase
   → Mark cart as 'converted'

5. User doesn't return
   → Additional follow-up emails (automation triggers)
```

---

## Database Schema
```sql
CREATE TABLE abandoned_carts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  event_id UUID,
  cart_items JSONB NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  abandoned_at TIMESTAMP DEFAULT NOW(),
  recovery_email_sent BOOLEAN DEFAULT FALSE,
  recovery_email_sent_at TIMESTAMP,
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Recovery Email Content

Triggered via automation system with template variables:
```handlebars
Hi {{customerName}},

You left some tickets in your cart!

Event: {{eventName}}
Date: {{formatDate eventDate}}

Items:
{{#each cartItems}}
- {{this.quantity}}x {{this.tierName}} - {{formatCurrency this.price}}
{{/each}}

Total: {{formatCurrency totalAmount}}

[Complete Your Purchase] → {{checkoutUrl}}

Tickets are selling fast - don't miss out!
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `notification-service/src/routes/campaign.routes.ts` | Routes |
| `notification-service/src/services/campaign.service.ts` | Implementation |

---

## Related Documents

- `MARKETING_CAMPAIGNS_FLOW_AUDIT.md` - Campaign system
- `CART_CHECKOUT_FLOW_AUDIT.md` - Cart flow
- `NOTIFICATION_TEMPLATES_FLOW_AUDIT.md` - Email templates
