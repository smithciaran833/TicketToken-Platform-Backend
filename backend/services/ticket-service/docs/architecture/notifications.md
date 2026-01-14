# State Change Notifications

## Overview

The ticket service emits notifications when ticket state changes. These are published to RabbitMQ for other services to consume.

## Events Emitted

| Event | Trigger | Payload |
|-------|---------|---------|
| `ticket.created` | New ticket created | ticketId, eventId, tenantId |
| `ticket.reserved` | Ticket reserved | ticketId, userId, expiresAt |
| `ticket.purchased` | Purchase completed | ticketId, orderId, userId |
| `ticket.transferred` | Ownership transferred | ticketId, fromUserId, toUserId |
| `ticket.checked_in` | Ticket scanned | ticketId, eventId, scannedAt |
| `ticket.refunded` | Refund processed | ticketId, orderId, reason |
| `ticket.revoked` | Ticket revoked | ticketId, reason, revokedBy |
| `ticket.expired` | Reservation expired | ticketId, expiredAt |

## Event Format
```json
{
  "event": "ticket.purchased",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "tenantId": "tenant-123",
  "correlationId": "trace-abc-123",
  "payload": {
    "ticketId": "ticket-456",
    "orderId": "order-789",
    "userId": "user-012",
    "eventId": "event-345",
    "price": 5000,
    "currency": "USD"
  }
}
```

## Queue Configuration

| Setting | Value |
|---------|-------|
| Exchange | `ticket.events` |
| Type | `topic` |
| Durable | `true` |
| Routing Key | `ticket.{state}` |

## Subscribing
```typescript
// Example: notification-service subscribing
channel.bindQueue(
  'notification-queue',
  'ticket.events',
  'ticket.purchased'
);
```

## Retry Policy

Failed notifications are retried with exponential backoff:
- Max retries: 3
- Base delay: 1s
- Max delay: 30s
- Dead letter queue after max retries
