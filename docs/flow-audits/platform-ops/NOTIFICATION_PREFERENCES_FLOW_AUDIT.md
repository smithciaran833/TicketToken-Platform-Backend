# NOTIFICATION PREFERENCES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Notification Preferences Management |

---

## Executive Summary

**WELL IMPLEMENTED but ROUTING MISMATCH - Service works, gateway misconfigured**

| Component | Status |
|-----------|--------|
| Get preferences | ✅ Complete |
| Update preferences | ✅ Complete |
| Unsubscribe via token | ✅ Complete (public) |
| Can-send check | ✅ Complete |
| Authentication | ✅ Complete |
| Ownership validation | ✅ Complete |
| Admin bypass | ✅ Complete |
| Preference history | ✅ Complete |
| Quiet hours | ✅ Complete |
| Daily limits | ✅ Complete |
| Channel preferences | ✅ Complete |
| Category preferences | ✅ Complete |
| Caching | ✅ Complete (5 min TTL) |
| API Gateway routing | ⚠️ PATH MISMATCH |

**Bottom Line:** The notification preferences system is comprehensive with channel/category controls, quiet hours, daily limits, and preference history. However, there's a routing mismatch between the API gateway and notification service paths that needs to be fixed.

---

## Architecture Overview

### Notification Preferences Flow
```
┌─────────────────────────────────────────────────────────────┐
│            NOTIFICATION PREFERENCES FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   GET PREFERENCES: GET /preferences/:userId                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Authenticate user (JWT)                         │   │
│   │  2. Check ownership (user.id === userId OR admin)   │   │
│   │  3. Check cache (5 min TTL)                         │   │
│   │  4. Query database if not cached                    │   │
│   │  5. Create defaults if first access                 │   │
│   │  6. Return preferences object                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   UPDATE PREFERENCES: PUT /preferences/:userId               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Authenticate user (JWT)                         │   │
│   │  2. Check ownership (user.id === userId OR admin)   │   │
│   │  3. Get current preferences                         │   │
│   │  4. Update database                                 │   │
│   │  5. Record change history                           │   │
│   │  6. Clear cache                                     │   │
│   │  7. Return updated preferences                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   UNSUBSCRIBE: POST /unsubscribe/:token (PUBLIC)            │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Look up user by unsubscribe token               │   │
│   │  2. Disable all channels                            │   │
│   │  3. Set unsubscribed_at timestamp                   │   │
│   │  4. Clear cache                                     │   │
│   │  5. Return success/failure                          │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Critical Issue: Routing Mismatch ⚠️

### API Gateway Configuration
**File:** `backend/services/api-gateway/src/routes/notification.routes.ts`
```typescript
serviceUrl: `${serviceUrls.notification}/api/v1/notification`,
```
Gateway expects: `http://notification-service:3008/api/v1/notification/*`

### Notification Service Configuration
**File:** `backend/services/notification-service/src/app.ts`
```typescript
await app.register(preferencesRoutes, { prefix: '/api' });
await app.register(notificationRoutes, { prefix: '/api/notifications' });
```
Service registers at: `/api/preferences/*` and `/api/notifications/*`

### The Mismatch

| Gateway Path | Expected Service Path | Actual Service Path |
|--------------|----------------------|---------------------|
| `/api/v1/notifications/preferences/:userId` | `/api/v1/notification/preferences/:userId` | `/api/preferences/:userId` |
| `/api/v1/notifications/send` | `/api/v1/notification/send` | `/api/notifications/send` |

**Result:** Requests through the gateway will return 404 because paths don't match.

### Recommended Fix

Option 1: Update notification service to use `/api/v1/notification` prefix:
```typescript
await app.register(preferencesRoutes, { prefix: '/api/v1/notification' });
await app.register(notificationRoutes, { prefix: '/api/v1/notification' });
```

Option 2: Update gateway to match service paths (less ideal - breaks API versioning).

---

## What Works ✅

### 1. Route Definitions with Auth

**File:** `backend/services/notification-service/src/routes/preferences.routes.ts`
```typescript
// Get user preferences
fastify.get('/preferences/:userId', {
  preHandler: [authMiddleware]
}, async (request, reply) => {
  // ...
});

// Update user preferences  
fastify.put('/preferences/:userId', {
  preHandler: [authMiddleware]
}, async (request, reply) => {
  // ...
});

// Unsubscribe via token (PUBLIC - no auth)
fastify.post('/unsubscribe/:token', async (request, reply) => {
  // ...
});

// Check if can send notification
fastify.post('/can-send', {
  preHandler: [authMiddleware]
}, async (request, reply) => {
  // ...
});
```

### 2. Ownership Validation
```typescript
// Authorization check: users can only access their own preferences unless they're admin
if (request.user!.id !== userId && request.user!.role !== 'admin') {
  logger.warn('Unauthorized preference access attempt', {
    requestedUserId: userId,
    authenticatedUserId: request.user!.id
  });
  return reply.status(403).send({
    error: 'Forbidden',
    message: 'You can only access your own preferences'
  });
}
```

### 3. Comprehensive Preference Model

**File:** `backend/services/notification-service/src/services/preference-manager.ts`
```typescript
export interface UserPreferences {
  userId: string;
  
  // Channel toggles
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;

  // Email category preferences
  emailPayment: boolean;
  emailMarketing: boolean;
  emailEventUpdates: boolean;
  emailAccount: boolean;

  // SMS category preferences
  smsCriticalOnly: boolean;
  smsPayment: boolean;
  smsEventReminders: boolean;

  // Push category preferences
  pushPayment: boolean;
  pushEventUpdates: boolean;
  pushMarketing: boolean;

  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;

  // Daily limits
  maxEmailsPerDay: number;
  maxSmsPerDay: number;

  // Unsubscribe
  unsubscribeToken?: string;
  unsubscribedAt?: Date;
}
```

### 4. Can-Send Logic with Multiple Checks
```typescript
async canSendNotification(
  userId: string,
  channel: 'email' | 'sms' | 'push',
  type: string
): Promise<boolean> {
  const prefs = await this.getPreferences(userId);

  // Check if completely unsubscribed
  if (prefs.unsubscribedAt) {
    return false;
  }

  // Check channel enabled
  if (channel === 'email' && !prefs.emailEnabled) return false;
  if (channel === 'sms' && !prefs.smsEnabled) return false;
  if (channel === 'push' && !prefs.pushEnabled) return false;

  // Check category preferences
  if (channel === 'email') {
    if (type === 'payment' && !prefs.emailPayment) return false;
    if (type === 'marketing' && !prefs.emailMarketing) return false;
    if (type === 'event_update' && !prefs.emailEventUpdates) return false;
    if (type === 'account' && !prefs.emailAccount) return false;
  }

  // ... SMS and push checks ...

  // Check quiet hours
  if (prefs.quietHoursEnabled && this.isQuietHours(prefs)) {
    if (!this.isCritical(type)) {
      return false;
    }
  }

  // Check daily limits
  const todayCount = await this.getTodayCount(userId, channel);
  if (channel === 'email' && todayCount >= prefs.maxEmailsPerDay) return false;
  if (channel === 'sms' && todayCount >= prefs.maxSmsPerDay) return false;

  return true;
}
```

### 5. Quiet Hours with Overnight Support
```typescript
private isQuietHours(prefs: UserPreferences): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const startHour = parseInt(prefs.quietHoursStart.split(':')[0]);
  const endHour = parseInt(prefs.quietHoursEnd.split(':')[0]);

  if (startHour <= endHour) {
    // Same day quiet hours (e.g., 9am-5pm)
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Overnight quiet hours (e.g., 10pm-7am)
    return currentHour >= startHour || currentHour < endHour;
  }
}
```

### 6. Critical Notification Bypass
```typescript
private isCritical(type: string): boolean {
  return ['payment_failed', 'account_security', 'urgent'].includes(type);
}
```

Critical notifications bypass:
- Quiet hours
- SMS "critical only" mode

### 7. Preference History Tracking
```typescript
private async recordHistory(
  userId: string,
  before: UserPreferences,
  after: Partial<UserPreferences>,
  changedBy?: string,
  reason?: string
): Promise<void> {
  const changes: any = {};

  for (const [key, value] of Object.entries(after)) {
    if ((before as any)[key] !== value) {
      changes[key] = {
        from: (before as any)[key],
        to: value
      };
    }
  }

  if (Object.keys(changes).length > 0) {
    await db('notification_preference_history').insert({
      user_id: userId,
      changed_by: changedBy,
      changes: JSON.stringify(changes),
      reason,
      created_at: new Date()
    });
  }
}
```

### 8. Caching with TTL
```typescript
private cache: Map<string, UserPreferences> = new Map();
private readonly CACHE_TTL = 300000; // 5 minutes

async getPreferences(userId: string): Promise<UserPreferences> {
  // Check cache first
  if (this.cache.has(userId)) {
    return this.cache.get(userId)!;
  }

  // Get from database
  let prefs = await db('notification_preferences')
    .where('user_id', userId)
    .first();

  // Create default preferences if not exists
  if (!prefs) {
    prefs = await this.createDefaultPreferences(userId);
  }

  const preferences = this.mapToPreferences(prefs);

  // Cache it with TTL
  this.cache.set(userId, preferences);
  setTimeout(() => this.cache.delete(userId), this.CACHE_TTL);

  return preferences;
}
```

### 9. One-Click Unsubscribe
```typescript
async unsubscribe(token: string): Promise<boolean> {
  const [updated] = await db('notification_preferences')
    .where('unsubscribe_token', token)
    .update({
      email_enabled: false,
      sms_enabled: false,
      push_enabled: false,
      unsubscribed_at: new Date(),
      updated_at: new Date()
    })
    .returning('user_id');

  if (updated) {
    this.cache.delete(updated.user_id);
    logger.info('User unsubscribed', { userId: updated.user_id });
    return true;
  }

  return false;
}

async generateUnsubscribeLink(userId: string): Promise<string> {
  const prefs = await this.getPreferences(userId);
  const baseUrl = process.env.FRONTEND_URL || 'https://app.tickettoken.com';
  return `${baseUrl}/unsubscribe/${prefs.unsubscribeToken}`;
}
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose | Status |
|----------|--------|------|---------|--------|
| `/preferences/:userId` | GET | ✅ | Get user preferences | ✅ Working |
| `/preferences/:userId` | PUT | ✅ | Update preferences | ✅ Working |
| `/unsubscribe/:token` | POST | ❌ Public | One-click unsubscribe | ✅ Working |
| `/can-send` | POST | ✅ | Check if notification allowed | ✅ Working |

---

## Preference Categories

### Channel Level
| Channel | Toggle | Description |
|---------|--------|-------------|
| Email | `emailEnabled` | Master toggle for all email |
| SMS | `smsEnabled` | Master toggle for all SMS |
| Push | `pushEnabled` | Master toggle for all push |

### Category Level - Email
| Category | Toggle | Description |
|----------|--------|-------------|
| Payment | `emailPayment` | Purchase confirmations, refunds |
| Marketing | `emailMarketing` | Promotions, newsletters |
| Event Updates | `emailEventUpdates` | Event changes, reminders |
| Account | `emailAccount` | Password reset, security |

### Category Level - SMS
| Category | Toggle | Description |
|----------|--------|-------------|
| Critical Only | `smsCriticalOnly` | Only urgent notifications |
| Payment | `smsPayment` | Purchase confirmations |
| Event Reminders | `smsEventReminders` | Day-of reminders |

### Category Level - Push
| Category | Toggle | Description |
|----------|--------|-------------|
| Payment | `pushPayment` | Purchase confirmations |
| Event Updates | `pushEventUpdates` | Event changes |
| Marketing | `pushMarketing` | Promotions |

---

## Database Tables

### notification_preferences
```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY,
  
  -- Channel toggles
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  
  -- Email categories
  email_payment BOOLEAN DEFAULT true,
  email_marketing BOOLEAN DEFAULT true,
  email_event_updates BOOLEAN DEFAULT true,
  email_account BOOLEAN DEFAULT true,
  
  -- SMS categories
  sms_critical_only BOOLEAN DEFAULT false,
  sms_payment BOOLEAN DEFAULT true,
  sms_event_reminders BOOLEAN DEFAULT true,
  
  -- Push categories
  push_payment BOOLEAN DEFAULT true,
  push_event_updates BOOLEAN DEFAULT true,
  push_marketing BOOLEAN DEFAULT true,
  
  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Limits
  max_emails_per_day INTEGER DEFAULT 50,
  max_sms_per_day INTEGER DEFAULT 10,
  
  -- Unsubscribe
  unsubscribe_token VARCHAR(64) UNIQUE,
  unsubscribed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### notification_preference_history
```sql
CREATE TABLE notification_preference_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES notification_preferences(user_id),
  changed_by UUID,
  changes JSONB,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `notification-service/src/routes/preferences.routes.ts` | Route definitions |
| `notification-service/src/services/preference-manager.ts` | Business logic |
| `notification-service/src/middleware/auth.middleware.ts` | Authentication |
| `notification-service/src/app.ts` | Route registration |
| `api-gateway/src/routes/notification.routes.ts` | Gateway proxy |

---

## Recommendations

### P0 - Must Fix

| Issue | Fix | Effort |
|-------|-----|--------|
| Routing mismatch | Update notification service to use `/api/v1/notification` prefix | 0.5 day |

### P2 - Enhancements

| Issue | Suggestion | Effort |
|-------|------------|--------|
| Quiet hours timezone | Use proper timezone library (luxon/date-fns-tz) | 0.5 day |
| No input validation | Add Joi/Zod schemas for preference updates | 0.5 day |
| In-memory cache | Consider Redis for multi-instance deployments | 1 day |
| No audit logging | Add audit service integration for preference changes | 0.5 day |

---

## Related Documents

- `EMAIL_NOTIFICATION_FLOW_AUDIT.md` - Email delivery (to be audited)
- `PUSH_NOTIFICATION_FLOW_AUDIT.md` - Push delivery (to be audited)
- `GDPR_COMPLIANCE_FLOW_AUDIT.md` - Data rights
