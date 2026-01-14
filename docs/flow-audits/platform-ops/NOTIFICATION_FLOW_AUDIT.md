# NOTIFICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Notification System (Email/SMS/Push) |

---

## Executive Summary

**GOOD NEWS:** This is a **comprehensive and well-designed notification system** with:
- Multiple channels (Email, SMS, Push)
- Template support (Handlebars)
- Venue white-label branding
- Consent management
- Metrics tracking

**ISSUES:**
1. **Events not always published** - Many flows don't publish to RabbitMQ
2. **Event handler routing mismatch** - Published events don't match listener routing keys
3. **Some handlers incomplete** - Missing user/event data fetching

---

## Architecture
```
Service publishes event to RabbitMQ
        ↓
notification-service consumes message
        ↓
EventHandler routes by routing key
        ↓
NotificationService.send() called
        ↓
Provider sends (SendGrid/Twilio/Push)
        ↓
Metrics tracked, history stored
```

---

## Supported Event Types

### EventHandler (Main)

| Routing Key | Handler | Template |
|-------------|---------|----------|
| `payment.completed` | handlePaymentCompleted | purchase_confirmation |
| `ticket.transferred` | handleTicketTransferred | ticket_transfer_sender/recipient |
| `event.reminder` | handleEventReminder | event_reminder |
| `event.cancelled` | handleEventCancelled | event_cancelled |
| `user.registered` | handleUserRegistered | welcome_email |
| `user.password_reset` | handlePasswordReset | password_reset |

### PaymentEventHandler (Separate)

| Queue Job | Handler | Purpose |
|-----------|---------|---------|
| `payment.succeeded` | handlePaymentSuccess | Confirmation email/SMS |
| `payment.failed` | handlePaymentFailed | Retry prompt |
| `refund.processed` | handleRefundProcessed | Refund confirmation |
| `dispute.created` | handleDisputeCreated | Alert CS team |

---

## Channels

### Email (SendGrid)

**File:** `backend/services/notification-service/src/providers/email/sendgrid.provider.ts`
```typescript
const [response] = await sgMail.send({
  to: options.to,
  from: { email: options.from, name: options.fromName },
  subject: options.subject,
  html: options.html,
  trackingSettings: {
    clickTracking: { enable: true },
    openTracking: { enable: true },
  },
});
```

**Features:**
- ✅ SendGrid integration
- ✅ Click/open tracking
- ✅ Bulk sending (up to 1000/request)
- ✅ Mock mode when disabled

### SMS (Twilio)

**Status:** Provider exists, similar structure

### Push Notifications

**Status:** Provider exists, basic implementation

---

## Template System

**Location:** `backend/services/notification-service/src/templates/email/`

**Engine:** Handlebars
```typescript
private loadTemplates() {
  const files = fs.readdirSync(templateDir);
  files.forEach(file => {
    if (file.endsWith('.hbs')) {
      const templateContent = fs.readFileSync(path.join(templateDir, file), 'utf-8');
      const compiled = handlebars.compile(templateContent);
      this.templates.set(templateName, compiled);
    }
  });
}
```

**Templates Expected:**
- `purchase_confirmation.hbs`
- `ticket_transfer_sender.hbs`
- `ticket_transfer_recipient.hbs`
- `event_reminder.hbs`
- `event_cancelled.hbs`
- `welcome_email.hbs`
- `password_reset.hbs`

---

## White-Label Branding

**File:** `backend/services/notification-service/src/services/notification.service.ts`
```typescript
if (request.venueId) {
  branding = await this.getVenueBranding(request.venueId);
  isWhiteLabel = await this.isWhiteLabel(request.venueId);

  if (branding && isWhiteLabel) {
    if (branding.email_reply_to) {
      fromEmail = branding.email_reply_to;
    }
    if (branding.email_from_name) {
      fromName = branding.email_from_name;
    }
  }
}
```

**Status:** ✅ Works - Venues can customize sender name/email

---

## Consent Management
```typescript
private async checkConsent(recipientId, channel, type): Promise<boolean> {
  const consent = await db('consent_records')
    .where({
      customer_id: recipientId,
      channel,
      type,
      status: 'granted'
    })
    .first();

  return !!consent;
}
```

**Behavior:**
- Marketing emails require consent
- Transactional emails bypass consent check (implied consent)

---

## What Works ✅

| Component | Status |
|-----------|--------|
| RabbitMQ consumer | ✅ Works |
| Event routing | ✅ Works |
| Email provider (SendGrid) | ✅ Works |
| SMS provider (Twilio) | ✅ Works |
| Template rendering | ✅ Works |
| White-label branding | ✅ Works |
| Consent checking | ✅ Works |
| Notification history | ✅ Works |
| Metrics tracking | ✅ Works |

---

## Issues

### Issue 1: Events Not Published

Many flows don't publish events to trigger notifications:

| Flow | Should Publish | Actually Publishes? |
|------|---------------|---------------------|
| Primary purchase | `payment.completed` | ⚠️ order-service publishes ORDER_CONFIRMED |
| Ticket transfer | `ticket.transferred` | ✅ Yes (ticket-service) |
| Event cancelled | `event.cancelled` | ❌ No (see Flow 10) |
| User registration | `user.registered` | ❓ Unclear |
| Password reset | `user.password_reset` | ❓ Unclear |
| Refund | `refund.processed` | ⚠️ Separate queue job |

### Issue 2: Routing Key Mismatch

**ticket-service publishes:**
```typescript
await queueService.publish('notifications', {
  type: 'ticket.transfer.sender',  // ← Different format
  userId: fromUserId,
});
```

**EventHandler expects:**
```typescript
case 'ticket.transferred':  // ← Expects this routing key
  await this.handleTicketTransferred(event);
```

These don't match! The notification won't be routed correctly.

### Issue 3: Missing Data in Handlers
```typescript
// In handlePaymentCompleted:
recipient: {
  id: data.customerId,
  email: data.tickets[0].eventName, // ← WRONG! This is event name, not email
},
```

The handler assumes data structure that may not match what's published.

---

## Who Actually Publishes?

### ticket-service ✅
```typescript
// Transfer notifications
await queueService.publish('notifications', {
  type: 'ticket.transfer.sender',
  userId: fromUserId,
  ticketId,
  toUserId
});
```

### order-service ⚠️
```typescript
// Publishes order events, but routing may not match
await publishEvent(OrderEvents.ORDER_CONFIRMED, eventData);
```

### event-service ❌
```typescript
// Event cancellation service has commented out publishing:
// In production: await messageQueue.publish('notifications', notificationEvent);
```

### payment-service ⚠️

Uses separate PaymentEventHandler with different queue system.

---

## Database Tables

### notification_history

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Notification ID |
| venue_id | UUID | Which venue |
| recipient_id | UUID | Who received |
| channel | VARCHAR | email, sms, push |
| type | VARCHAR | transactional, marketing |
| template_name | VARCHAR | Which template |
| status | VARCHAR | pending, sent, failed |
| sent_at | TIMESTAMP | When sent |
| metadata | JSONB | Template data |

### consent_records

| Column | Type | Purpose |
|--------|------|---------|
| customer_id | UUID | Who consented |
| channel | VARCHAR | email, sms, push |
| type | VARCHAR | marketing, transactional |
| status | VARCHAR | granted, revoked |

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `events/event-handler.ts` | Main event router | ✅ Complete |
| `events/payment-event-handler.ts` | Payment-specific handler | ✅ Complete |
| `services/notification.service.ts` | Core sending logic | ✅ Complete |
| `providers/email/sendgrid.provider.ts` | SendGrid integration | ✅ Complete |
| `providers/sms/sms.provider.ts` | Twilio integration | ✅ Exists |
| `providers/push/push.provider.ts` | Push notifications | ⚠️ Basic |

---

## What Needs Fixing

### Critical (No Notifications Sent)

| File | Change | Priority |
|------|--------|----------|
| `event-service/event-cancellation.service.ts` | Uncomment notification publishing | P0 |
| `ticket-service/transferService.ts` | Fix routing key format | P1 |
| All services | Ensure consistent event format | P1 |

### Medium (Data Issues)

| File | Change | Priority |
|------|--------|----------|
| `notification-service/events/event-handler.ts` | Fix email extraction bug | P2 |
| Various | Ensure all required data is included in events | P2 |

---

## Summary

| Aspect | Status |
|--------|--------|
| Notification service | ✅ Complete |
| Email provider | ✅ Works |
| SMS provider | ✅ Works |
| Template system | ✅ Works |
| White-label branding | ✅ Works |
| Consent management | ✅ Works |
| Events published (ticket transfer) | ✅ Works |
| Events published (event cancelled) | ❌ Commented out |
| Events published (purchase) | ⚠️ Different format |
| Routing key consistency | ❌ Mismatched |

---

## Related Documents

- `EVENT_CANCELLATION_FLOW_AUDIT.md` - Event cancellation doesn't notify
- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Refund notifications
- `TICKET_TRANSFER_GIFT_FLOW_AUDIT.md` - Transfer notifications

