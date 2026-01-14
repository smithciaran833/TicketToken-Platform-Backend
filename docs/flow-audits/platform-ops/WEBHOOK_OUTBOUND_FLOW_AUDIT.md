# WEBHOOK OUTBOUND FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Updated | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Outbound Webhooks |

---

## Executive Summary

**CRITICAL: DEAD CODE - Nothing Calls These Services**

Four separate webhook implementations exist across the platform. All are well-designed with security best practices. **None of them are ever called by any other code.**

| Implementation | Location | Code Quality | Integration |
|----------------|----------|--------------|-------------|
| OutboundWebhookService | payment-service | ✅ Good | ❌ DEAD CODE |
| WebhookProvider | notification-service | ✅ Good | ❌ DEAD CODE |
| WebhookService | transfer-service | ✅ Good | ❌ DEAD CODE |
| WebhookService | venue-service | ✅ Good | ❌ DEAD CODE |

---

## Integration Verification

### How We Verified
```bash
# Check if OutboundWebhookService is ever called
grep -r "OutboundWebhookService\|sendWebhook" backend/services --include="*.ts" | grep -v "outbound-webhook.ts"
# Result: Empty - no callers

# Check if WebhookProvider is ever called
grep -r "WebhookProvider\|webhookProvider" backend/services/notification-service/src --include="*.ts" | grep -v "webhook.provider.ts"
# Result: Empty - no callers

# Check if venue WebhookService is ever called
grep -r "WebhookService\|webhookService" backend/services/venue-service/src --include="*.ts" | grep -v "webhook.service.ts"
# Result: Empty - no callers

# Check if transfer WebhookService is ever called
grep -r "sendWebhook\|WebhookService" backend/services/transfer-service/src --include="*.ts" | grep -v "webhook.service.ts"
# Result: Empty - no callers
```

### Conclusion

All four implementations are orphaned code. They were built but never integrated into any flow.

---

## What Exists (The Code)

### 1. Payment Service - OutboundWebhookService

**File:** `payment-service/services/webhooks/outbound-webhook.ts`
```typescript
export class OutboundWebhookService {
  async send(webhook: OutboundWebhook): Promise<void> {
    const signature = this.generateSignature(webhook.payload, webhook.secret);
    
    await axios.post(webhook.url, webhook.payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': webhook.event
      },
      timeout: 5000
    });
    
    await this.logWebhook(webhook, status, error);
  }

  private generateSignature(payload: any, secret: string): string {
    return crypto.createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
```

**Features:**
- ✅ HMAC-SHA256 signature
- ✅ Delivery logging
- ✅ Timeout handling

**Called by:** ❌ Nothing

---

### 2. Notification Service - WebhookProvider

**File:** `notification-service/providers/webhook.provider.ts`
```typescript
class WebhookProvider {
  async send(options: WebhookOptions): Promise<NotificationResponse> {
    if (!env.ENABLE_WEBHOOK_DELIVERY) {
      return { status: 'sent', channel: 'webhook' };
    }

    const signature = options.secret
      ? this.generateSignature(options.data, options.secret)
      : undefined;

    const response = await axios.post(options.url, options.data, {
      headers: {
        'X-TicketToken-Signature': signature,
        'X-TicketToken-Timestamp': Date.now().toString(),
      },
      timeout: 10000,
    });

    return { status: 'delivered', channel: 'webhook' };
  }

  async validateWebhook(body: string, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.generateSignature(JSON.parse(body), secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

**Features:**
- ✅ Feature flag control
- ✅ HMAC signature
- ✅ Timing-safe verification
- ✅ Timestamp for replay prevention

**Called by:** ❌ Nothing

---

### 3. Transfer Service - WebhookService

**File:** `transfer-service/services/webhook.service.ts`
```typescript
class WebhookService {
  async sendWebhook(tenantId: string, eventType: WebhookEventType, data: any) {
    const subscriptions = await this.getActiveSubscriptions(tenantId, eventType);
    
    await Promise.allSettled(
      subscriptions.map(sub => this.deliverWebhook(sub, payload))
    );
  }

  private async deliverWebhook(subscription, payload) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await axios.post(subscription.url, payload, {
          headers: { 'X-Webhook-Signature': signature },
          timeout: 5000
        });
        await this.logWebhookDelivery(subscription.id, 'SUCCESS');
        return;
      } catch (error) {
        attempt++;
        await sleep(1000 * attempt); // Exponential backoff
      }
    }
    await this.logWebhookDelivery(subscription.id, 'FAILED');
  }
}
```

**Features:**
- ✅ Subscription management
- ✅ Retry with exponential backoff
- ✅ Delivery logging
- ✅ Event type filtering

**Called by:** ❌ Nothing

---

### 4. Venue Service - WebhookService

**File:** `venue-service/services/webhook.service.ts`
```typescript
class WebhookService {
  async processWebhook(options: ProcessWebhookOptions): Promise<Result> {
    // Deduplication check
    const status = await this.isProcessedOrProcessing(eventId);
    if (status.processed || status.processing) {
      return { success: true, duplicate: true };
    }

    // Distributed lock
    const lockAcquired = await this.acquireLock(eventId, lockTtlMs);
    if (!lockAcquired) {
      return { success: true, duplicate: true };
    }

    try {
      await processor(payload);
      await this.markCompleted(eventId);
      return { success: true, duplicate: false };
    } finally {
      await this.releaseLock(eventId);
    }
  }
}
```

**Features:**
- ✅ Distributed locking (Redis)
- ✅ Deduplication
- ✅ Status tracking
- ✅ Cleanup job

**Called by:** ❌ Nothing

---

## Database Tables (Exist but Empty)

### webhook_events
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  tenant_id UUID,
  payload JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMP
);
```

### webhook_subscriptions
```sql
CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  url VARCHAR(500) NOT NULL,
  events TEXT[] NOT NULL,
  secret VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true
);
```

### outbound_webhooks
```sql
CREATE TABLE outbound_webhooks (
  id UUID PRIMARY KEY,
  url VARCHAR(500),
  event VARCHAR(100),
  payload JSONB,
  status INTEGER,
  error TEXT,
  sent_at TIMESTAMP
);
```

---

## What Would Need to Happen

To make outbound webhooks work, services would need to call them:

### Example: Transfer Completion
```typescript
// In transfer.service.ts after completing a transfer:
await webhookService.sendWebhook(tenantId, 'transfer.completed', {
  transferId,
  ticketId,
  fromUserId,
  toUserId,
  completedAt: new Date()
});
```

### Example: Payment Success
```typescript
// In payment webhook handler after successful payment:
await outboundWebhookService.send({
  url: venue.webhookUrl,
  event: 'payment.succeeded',
  payload: { orderId, amount, tickets },
  secret: venue.webhookSecret
});
```

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `payment-service/services/webhooks/outbound-webhook.ts` | Send webhooks | ✅ Code exists, ❌ Never called |
| `notification-service/providers/webhook.provider.ts` | Webhook as channel | ✅ Code exists, ❌ Never called |
| `transfer-service/services/webhook.service.ts` | Subscription webhooks | ✅ Code exists, ❌ Never called |
| `venue-service/services/webhook.service.ts` | Process inbound | ✅ Code exists, ❌ Never called |

---

## Summary

| Aspect | Code | Integration |
|--------|------|-------------|
| HMAC signatures | ✅ Implemented | ❌ Dead code |
| Retry logic | ✅ Implemented | ❌ Dead code |
| Deduplication | ✅ Implemented | ❌ Dead code |
| Distributed locking | ✅ Implemented | ❌ Dead code |
| Delivery logging | ✅ Implemented | ❌ Dead code |
| Subscription management | ✅ Implemented | ❌ Dead code |

**Bottom Line:** Four well-designed webhook systems exist. Zero are connected to any business flow. This is dead code that needs to be wired up or removed.

---

## To Fix

| Priority | Action |
|----------|--------|
| P1 | Decide which webhook implementation to use (consolidate to one) |
| P2 | Add webhook calls to critical flows (transfers, payments, events) |
| P3 | Create admin UI for webhook subscription management |
| P4 | Remove unused implementations |

---

## Related Documents

- `NOTIFICATION_FLOW_AUDIT.md` - Notification system (could use webhooks)
- `TRANSFER_FLOW_AUDIT.md` - Transfer events (should trigger webhooks)
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Purchase events (should trigger webhooks)
