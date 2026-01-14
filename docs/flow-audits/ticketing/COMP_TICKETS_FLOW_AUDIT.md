# COMP TICKETS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Complimentary (Comp) Tickets |

---

## Executive Summary

**NOT IMPLEMENTED - No comp ticket functionality**

| Component | Status |
|-----------|--------|
| Issue comp ticket endpoint | ❌ Not implemented |
| Comp ticket flag on tickets | ❌ Not implemented |
| Bypass payment for comps | ❌ Not implemented |
| Comp ticket reason tracking | ❌ Not implemented |
| Comp ticket limits | ❌ Not implemented |
| Comp ticket reporting | ❌ Not implemented |
| Admin UI for comps | ❌ Not implemented |

**Bottom Line:** There is no way to issue complimentary tickets. All tickets must go through the purchase flow with payment. Venues/promoters cannot grant free tickets to VIPs, press, artists, or staff.

---

## What Exists

### Nothing Relevant

- `createTicketType` - Creates ticket type definitions, not individual tickets
- No `is_comp` or `complimentary` flag in ticket schema
- No admin endpoint to issue tickets without payment
- No comp ticket tracking or reporting

---

## What's Missing

### 1. Comp Ticket Schema

Expected fields on tickets table:
```sql
-- NOT IMPLEMENTED
ALTER TABLE tickets ADD COLUMN is_comp BOOLEAN DEFAULT false;
ALTER TABLE tickets ADD COLUMN comp_reason TEXT;
ALTER TABLE tickets ADD COLUMN comp_issued_by UUID REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN comp_issued_at TIMESTAMP;
```

### 2. Issue Comp Ticket Endpoint

Expected but not implemented:
```
POST /api/v1/admin/tickets/comp
{
  "eventId": "uuid",
  "ticketTypeId": "uuid",
  "recipientEmail": "vip@example.com",
  "recipientName": "VIP Guest",
  "quantity": 2,
  "reason": "press_pass",
  "notes": "Music journalist for Rolling Stone"
}
```

### 3. Comp Reasons Enum
```typescript
// NOT IMPLEMENTED
enum CompReason {
  PRESS_PASS = 'press_pass',
  ARTIST_GUEST = 'artist_guest',
  VIP_GUEST = 'vip_guest',
  STAFF = 'staff',
  PROMOTIONAL = 'promotional',
  SPONSOR = 'sponsor',
  CONTEST_WINNER = 'contest_winner',
  CUSTOMER_SERVICE = 'customer_service',
  OTHER = 'other'
}
```

### 4. Comp Ticket Limits

No limits defined per event for:
- Total comp tickets allowed
- Comp tickets per ticket type
- Comp tickets per issuer

---

## Expected Implementation

### Comp Ticket Flow (Not Built)
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED COMP TICKET FLOW                          │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ADMIN: POST /api/v1/admin/tickets/comp                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Verify admin/venue_manager permission           │   │
│   │  2. Validate event exists and has capacity          │   │
│   │  3. Check comp ticket limits not exceeded           │   │
│   │  4. Create ticket(s) with is_comp = true            │   │
│   │  5. Skip payment processing                         │   │
│   │  6. Create order with $0 total                      │   │
│   │  7. Record comp_reason and comp_issued_by           │   │
│   │  8. Send email to recipient with ticket(s)          │   │
│   │  9. Audit log the comp ticket issuance              │   │
│   │  10. Decrement available inventory                  │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   REPORTING:                                                 │
│   GET /api/v1/admin/events/:eventId/comp-report             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  - Total comp tickets issued                        │   │
│   │  - Breakdown by reason                              │   │
│   │  - Breakdown by issuer                              │   │
│   │  - Revenue impact (face value of comps)             │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Impact

| Area | Impact |
|------|--------|
| Press/Media | Cannot issue press passes |
| Artist relations | Cannot provide artist guest list tickets |
| Promotions | Cannot run giveaways/contests |
| Customer service | Cannot comp tickets for complaints |
| Staff | Cannot provide staff tickets |
| Sponsors | Cannot fulfill sponsor ticket allocations |
| VIP relations | Cannot manage VIP guest lists |

---

## Recommendations

### P2 - Implement Comp Tickets

| Task | Effort |
|------|--------|
| Add comp fields to tickets schema | 0.25 day |
| Create comp reasons enum | 0.25 day |
| Create issue comp endpoint | 1 day |
| Skip payment for comps | 0.5 day |
| Email notification to recipient | 0.5 day |
| Comp ticket limits per event | 0.5 day |
| Comp ticket reporting endpoint | 0.5 day |
| Audit logging | 0.25 day |
| Admin UI (frontend) | 1.5 days |
| **Total** | **5-6 days** |

### Implementation Skeleton
```typescript
// admin.routes.ts
router.post('/tickets/comp', 
  authMiddleware, 
  requireRole(['admin', 'venue_manager', 'event_admin']),
  async (req, res) => {
    const { eventId, ticketTypeId, recipientEmail, recipientName, quantity, reason, notes } = req.body;
    
    // Check comp limits
    const compCount = await db.query(
      `SELECT COUNT(*) FROM tickets WHERE event_id = $1 AND is_comp = true`,
      [eventId]
    );
    
    const event = await db.query(
      `SELECT comp_ticket_limit FROM events WHERE id = $1`,
      [eventId]
    );
    
    if (compCount >= event.comp_ticket_limit) {
      throw new Error('Comp ticket limit reached for this event');
    }
    
    // Create tickets without payment
    const tickets = await ticketService.createCompTickets({
      eventId,
      ticketTypeId,
      quantity,
      recipientEmail,
      recipientName,
      isComp: true,
      compReason: reason,
      compIssuedBy: req.user.id,
      compNotes: notes
    });
    
    // Send email
    await emailService.sendCompTickets(recipientEmail, tickets);
    
    // Audit log
    await auditService.log({
      action: 'comp_ticket_issued',
      userId: req.user.id,
      resourceId: eventId,
      metadata: { quantity, reason, recipientEmail }
    });
    
    return { tickets };
});
```

---

## Files That Would Need Changes

| File | Change |
|------|--------|
| `ticket-service/src/migrations/` | Add comp columns |
| `ticket-service/src/routes/` | Add admin comp endpoint |
| `ticket-service/src/services/ticketService.ts` | Add createCompTickets method |
| `event-service/src/migrations/` | Add comp_ticket_limit to events |
| `notification-service/` | Comp ticket email template |

---

## Related Documents

- `PROMO_CODES_DISCOUNTS_FLOW_AUDIT.md` - Discount system (dead code)
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Normal purchase flow
- `VENUE_FEATURES_FLOW_AUDIT.md` - Staff roles
