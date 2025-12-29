# Notification Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Multi-Tenancy | 2 | CRITICAL |
| Idempotency | 2 | CRITICAL |
| Security | 3 | HIGH |
| Configuration | 2 | HIGH |
| Operational | 2 | MEDIUM |
| Frontend Features | 3 | HIGH |

---

## CRITICAL Issues

### GAP-NOTIF-001: No Row Level Security
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** RLS not enabled on any tables
- **Risk:** Cross-tenant notification data leakage
- **Fix:** Enable RLS, add policies using current_setting

### GAP-NOTIF-002: Tenant Context Not Set in Queries
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:**
  - SET LOCAL not called
  - No query wrapper
  - Body tenant not rejected
  - Missing tenant doesn't return 401
- **Risk:** Queries return wrong tenant's data

### GAP-NOTIF-003: No Webhook Deduplication
- **Severity:** CRITICAL
- **Audit:** 07-idempotency.md
- **Current:**
  - No webhook_events table with unique constraint
  - No event ID duplicate check
  - No concurrent handling prevention
- **Risk:** Same webhook processed multiple times, duplicate notifications sent

### GAP-NOTIF-004: No Idempotency Keys Table
- **Severity:** CRITICAL
- **Audit:** 07-idempotency.md
- **Current:**
  - No Idempotency-Key header support
  - No idempotency_keys table
  - No recovery points for partial failures
- **Risk:** Retry sends duplicate notifications

---

## HIGH Issues

### GAP-NOTIF-005: In-Memory Rate Limiter
- **Severity:** HIGH
- **Audit:** 01-security.md, 08-rate-limiting.md
- **Current:** Rate limiter uses in-memory storage, not Redis
- **Risk:** 
  - Rate limits don't work across instances
  - Restart clears all limits
- **Fix:** Use Redis-backed rate limiter

### GAP-NOTIF-006: No JWT Algorithm Specified
- **Severity:** HIGH
- **Audit:** 01-security.md
- **Current:** JWT verification doesn't specify algorithm
- **Risk:** Algorithm confusion attacks

### GAP-NOTIF-007: Empty Provider Credentials Default
- **Severity:** HIGH
- **Audit:** 19-configuration.md
- **Current:**
  - SendGrid API key defaults to empty
  - Twilio credentials default to empty
  - Service starts, fails at runtime
- **Fix:** Fail fast if credentials missing

### GAP-NOTIF-008: No Database/Redis TLS
- **Severity:** HIGH
- **Audit:** 01-security.md
- **Current:** DB and Redis connections not using TLS
- **Risk:** Credentials and data exposed on network

### GAP-NOTIF-009: RabbitMQ No TLS/Message Signing
- **Severity:** HIGH
- **Audit:** 05-s2s-auth.md
- **Current:**
  - No TLS on RabbitMQ connection
  - No message signing
  - Shared credentials across services
- **Risk:** Message interception, spoofing

---

## MEDIUM Issues

### GAP-NOTIF-010: No Prometheus Metrics
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** /metrics endpoint exists but incomplete
- **Missing:**
  - Request duration histograms
  - Channel-specific delivery rates
  - Provider health metrics

### GAP-NOTIF-011: No Process Signal Handlers
- **Severity:** MEDIUM
- **Audit:** 03-error-handling.md
- **Current:**
  - No unhandledRejection handler
  - No uncaughtException handler
  - No SIGTERM handler
- **Risk:** Unclean shutdowns, lost notifications

---

## Frontend-Related Gaps

### GAP-NOTIF-012: No User Notification Inbox Endpoint
- **Severity:** HIGH
- **User Story:** "I want to see all my notifications in the app"
- **Current:**
  - `notification_history` table exists with `read_at` column
  - NO endpoint for users to fetch their notifications
  - GET /status/:id only gets single notification by ID
- **Needed:**
  - GET /notifications/me - list user's notifications
  - Query params: ?unread=true, ?type=payment, ?limit=20, ?offset=0
  - Returns: notification list with read/unread status
- **Impact:** Can't build notification bell/inbox in app

### GAP-NOTIF-013: No Mark as Read Endpoint
- **Severity:** HIGH
- **User Story:** "I want to mark a notification as read"
- **Current:**
  - `read_at` column exists in notification_history
  - NO endpoint to update it
- **Needed:**
  - PUT /notifications/:id/read - mark single as read
  - PUT /notifications/read-all - mark all as read
  - Returns updated unread count
- **Impact:** Can't clear notification badge

### GAP-NOTIF-014: Push Provider is Stub
- **Severity:** HIGH
- **User Story:** "I want to receive push notifications on my phone"
- **Current:**
```typescript
export class PushProvider { 
  async send(_i: SendPushInput){ 
    return { id:'stub-push', status:'queued' as const, channel:'push' as const }; 
  } 
}
```
- **Needed:**
  - Firebase Cloud Messaging (FCM) integration for Android
  - Apple Push Notification Service (APNS) for iOS
  - User device token storage
  - Push subscription management
- **Impact:** No mobile push notifications

### GAP-NOTIF-015: No Device Token Registration
- **Severity:** MEDIUM
- **User Story:** "Register my device to receive push notifications"
- **Current:** No endpoint to register device tokens
- **Needed:**
  - POST /devices/register - register push token
  - DELETE /devices/:token - unregister
  - User can have multiple devices
- **Impact:** Can't send push to specific devices

---

## All Routes Inventory

### notification.routes.ts (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /send | Send notification (internal) |
| POST | /send-batch | Send batch (internal) |
| GET | /status/:id | Get notification status |

### preferences.routes.ts (4 routes) ✅ Good
| Method | Path | Purpose |
|--------|------|---------|
| GET | /preferences/:userId | Get preferences |
| PUT | /preferences/:userId | Update preferences |
| POST | /unsubscribe/:token | Unsubscribe via token |
| POST | /can-send | Check if can send |

### consent.routes.ts (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /grant | Grant consent |
| POST | /revoke | Revoke consent |
| GET | /:customerId | Get consent status |

### template.routes.ts (8 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /templates | Create template |
| GET | /templates | List templates |
| GET | /templates/:id | Get template |
| PUT | /templates/:id | Update template |
| DELETE | /templates/:id | Delete template |
| POST | /templates/:id/preview | Preview template |
| GET | /templates/:id/versions | Get versions |
| GET | /templates/:id/stats | Get stats |

### campaign.routes.ts (10 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | / | Create campaign |
| POST | /:id/send | Send campaign |
| GET | /:id/stats | Get stats |
| POST | /segments | Create segment |
| POST | /segments/:id/refresh | Refresh segment |
| POST | /triggers | Create trigger |
| POST | /abandoned-carts | Abandoned cart |
| POST | /ab-tests | Create A/B test |
| POST | /ab-tests/:id/start | Start test |
| POST | /ab-tests/:id/determine-winner | Determine winner |

### marketing.routes.ts (15 routes)
Full marketing campaign management ✅

### analytics.routes.ts (7 routes)
Analytics and tracking ✅

### gdpr.routes.ts (8 routes)
GDPR compliance ✅

### health.routes.ts (9 routes)
Health checks ✅

---

## Database Tables (31 tables) ✅ Comprehensive

| Table | Purpose |
|-------|---------|
| scheduled_notifications | Future sends |
| notification_history | Sent notifications |
| consent_records | GDPR consent |
| suppression_list | Do not contact |
| notification_preferences | User prefs |
| notification_preference_history | Pref changes |
| notification_delivery_stats | Delivery metrics |
| notification_tracking | Open/click tracking |
| notification_analytics | Analytics |
| notification_engagement | Engagement |
| notification_clicks | Click tracking |
| notification_templates | Email/SMS templates |
| notification_campaigns | Campaigns |
| audience_segments | User segments |
| email_automation_triggers | Automation |
| ab_tests | A/B tests |
| ab_test_variants | Test variants |
| ab_test_metrics | Test results |
| automation_executions | Automation runs |
| bounces | Bounce tracking |
| campaign_stats | Campaign metrics |
| engagement_events | Events |
| notification_analytics_daily | Daily rollups |
| pending_deletions | GDPR deletions |
| template_usage | Template stats |
| template_versions | Version history |
| translations | i18n |
| venue_health_scores | Venue scores |
| abandoned_carts | Cart recovery |
| venue_notification_settings | Per-venue settings |
| notification_costs | Cost tracking |

---

## What Works Well

1. **Preferences system** - Full implementation with categories
2. **Unsubscribe flow** - Token-based unsubscribe works
3. **GDPR compliance** - Export, delete, portability endpoints
4. **Email/SMS providers** - SendGrid, Twilio with failover
5. **Circuit breaker** - Provider failover implemented
6. **Templates** - Full template management with versions
7. **Campaigns** - Marketing campaigns with A/B testing
8. **Analytics** - Tracking opens, clicks, conversions

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| auth-service | User verification |
| event-service | Event details for notifications |
| order-service | Order details for confirmations |
| payment-service | Payment details for receipts |
| venue-service | Venue branding for white-label |

| Other services need from this | What |
|------------------------------|------|
| All services | Send notifications via queue |

---

## Priority Order for Fixes

### Immediate (Security)
1. GAP-NOTIF-001: Enable RLS
2. GAP-NOTIF-002: Fix tenant context
3. GAP-NOTIF-005: Use Redis rate limiter
4. GAP-NOTIF-006: Specify JWT algorithm

### This Week (Data Integrity)
5. GAP-NOTIF-003: Add webhook deduplication
6. GAP-NOTIF-004: Add idempotency keys
7. GAP-NOTIF-007: Fail fast on missing credentials
8. GAP-NOTIF-008: Enable DB/Redis TLS

### This Month (Frontend Features)
9. GAP-NOTIF-012: User notification inbox endpoint
10. GAP-NOTIF-013: Mark as read endpoint
11. GAP-NOTIF-014: Implement real push provider
12. GAP-NOTIF-015: Device token registration

