# CONSENT MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Consent Management |

---

## Executive Summary

**WORKING - GDPR-compliant consent management**

| Component | Status |
|-----------|--------|
| Grant consent | ✅ Working |
| Revoke consent | ✅ Working |
| Check consent | ✅ Working |
| Consent audit trail | ✅ Working |
| IP/User-Agent tracking | ✅ Working |
| Channel-specific consent | ✅ Working |
| Type-specific consent | ✅ Working |
| Venue-specific consent | ✅ Working |

**Bottom Line:** Full GDPR-compliant consent management with granular control per channel, notification type, and venue. Records IP address and user agent for audit trail.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/consent/grant` | POST | Grant consent | ✅ Working |
| `/consent/revoke` | POST | Revoke consent | ✅ Working |
| `/consent/:customerId` | GET | Check consent | ✅ Working |

---

## Implementation Details

### Grant Consent
```typescript
async grant(request, reply) {
  const { customerId, channel, type, source, venueId } = request.body;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  await complianceService.recordConsent(
    customerId,
    channel,      // 'email', 'sms', 'push', 'webhook'
    type,         // 'transactional', 'marketing', 'system'
    source,       // 'signup', 'settings', 'checkout'
    venueId,
    ipAddress,
    userAgent
  );

  reply.status(201).send({
    success: true,
    message: 'Consent recorded successfully'
  });
}
```

### Revoke Consent
```typescript
async revoke(request, reply) {
  const { customerId, channel, type, venueId } = request.body;

  await complianceService.revokeConsent(
    customerId,
    channel,
    type,         // Optional - revoke all if not specified
    venueId
  );

  reply.status(200).send({
    success: true,
    message: 'Consent revoked successfully'
  });
}
```

### Check Consent
```typescript
async check(request, reply) {
  const { customerId } = request.params;
  const { channel, type, venueId } = request.query;

  const hasConsent = await consentModel.hasConsent(
    customerId,
    channel,
    type,
    venueId
  );

  reply.status(200).send({
    success: true,
    data: {
      hasConsent,
      customerId,
      channel,
      type,
      venueId
    }
  });
}
```

---

## Consent Granularity

### By Channel

| Channel | Description |
|---------|-------------|
| `email` | Email notifications |
| `sms` | SMS/text messages |
| `push` | Push notifications |
| `webhook` | Webhook integrations |

### By Type

| Type | Description |
|------|-------------|
| `transactional` | Order confirmations, receipts |
| `marketing` | Promotions, newsletters |
| `system` | Security alerts, account updates |

### By Venue

Consent can be venue-specific or platform-wide (null venueId).

---

## Consent Record
```typescript
interface ConsentRecord {
  id: string;
  customerId: string;
  channel: NotificationChannel;
  type: NotificationType;
  venueId?: string;
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  source: string;           // 'signup', 'settings', 'checkout', 'banner'
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## GDPR Compliance

1. **Explicit consent** - User must actively opt-in
2. **Granular consent** - Per channel, type, venue
3. **Easy revocation** - One-click unsubscribe
4. **Audit trail** - IP, user agent, timestamp
5. **Right to be forgotten** - Integrates with GDPR deletion

---

## Files Involved

| File | Purpose |
|------|---------|
| `notification-service/src/routes/consent.routes.ts` | Routes |
| `notification-service/src/controllers/consent.controller.ts` | Controller |
| `notification-service/src/services/compliance.service.ts` | Consent logic |
| `notification-service/src/models/consent.model.ts` | Data model |

---

## Related Documents

- `GDPR_DATA_PRIVACY_FLOW_AUDIT.md` - GDPR compliance
- `NOTIFICATION_PREFERENCES_FLOW_AUDIT.md` - User preferences
- `MARKETING_CAMPAIGNS_FLOW_AUDIT.md` - Campaign consent checks
