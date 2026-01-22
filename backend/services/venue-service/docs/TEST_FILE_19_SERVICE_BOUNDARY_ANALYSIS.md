# TEST FILE 19: Service Boundary Analysis
## notification-delivery.integration.test.ts

**Created:** 2026-01-20  
**Purpose:** Analyze which tests from TEST_MATRIX.md belong to which service  
**Finding:** 100% of tests in TEST FILE 19 spec belong to notification-service, NOT venue-service

---

## PLATFORM ARCHITECTURE

### Available Backend Services (21 total)
```
1. analytics-service      12. notification-service ⭐
2. api-gateway           13. order-service
3. auth-service          14. payment-service
4. blockchain-indexer    15. queue-service
5. blockchain-service    16. scanning-service
6. compliance-service    17. search-service
7. event-service         18. ticket-service
8. file-service          19. transfer-service
9. integration-service   20. venue-service ⭐
10. marketplace-service  21. minting-service
11. monitoring-service
```

**⭐ = Services relevant to this analysis**

---

## ARCHITECTURAL PRINCIPLES

### Single Responsibility Principle
Each microservice owns a specific domain:

**notification-service** owns:
- ✅ Email delivery (SendGrid, AWS SES, Mailgun)
- ✅ SMS delivery (Twilio, AWS SNS)
- ✅ Push notifications (FCM, APNS)
- ✅ Template management
- ✅ Email/SMS queues
- ✅ Delivery tracking
- ✅ Retry logic
- ✅ Campaign management
- ✅ A/B testing
- ✅ GDPR compliance (unsubscribe, preferences)
- ✅ Analytics & tracking

**venue-service** owns:
- ✅ Venue CRUD operations
- ✅ Venue staff management
- ✅ Venue settings
- ✅ In-app notifications (local storage for venue dashboard)
- ✅ Event publishing to RabbitMQ (for notification-service to consume)
- ❌ NO email delivery
- ❌ NO SMS delivery  
- ❌ NO template rendering
- ❌ NO provider integration (SendGrid/Twilio)

---

## TEST FILE 19 BREAKDOWN

### Original TEST_MATRIX.md Specification

```
## TEST FILE 19: notification-delivery.integration.test.ts

**Source Docs:** services-support-analysis.md (email_queue table)
**Priority:** MEDIUM
**Estimated Tests:** 30
```

### Section 1: Email Queue Operations (10 tests)

| Test Description | Belongs To | Reason |
|-----------------|------------|--------|
| INSERT into email_queue | ❌ notification-service | notification-service owns email_queue table |
| Email templates | ❌ notification-service | Template management is notification concern |
| Queue processing | ❌ notification-service | Queue worker in notification-service |
| Update status: processing → sent/failed | ❌ notification-service | Delivery tracking in notification-service |
| Delivery via email service (SendGrid, SES, Mailgun) | ❌ notification-service | Provider integration in notification-service |
| Retry logic: Max 3 retries | ❌ notification-service | Retry mechanism in notification-service |
| Retry delay: Exponential backoff | ❌ notification-service | Backoff strategy in notification-service |
| Failed email: Status = 'failed', error_message | ❌ notification-service | Error handling in notification-service |
| Batch sending: Process 100 emails per batch | ❌ notification-service | Batch processing in notification-service |
| Tenant isolation: Email queue scoped by tenant | ❌ notification-service | notification-service handles tenant scoping |

**Score: 0/10 tests belong to venue-service**

### Section 2: Email Templates & Content (8 tests)

| Test Description | Belongs To | Reason |
|-----------------|------------|--------|
| Compliance critical notification template | ❌ notification-service | Template storage in notification-service |
| Staff invitation template | ❌ notification-service | Template storage in notification-service |
| Venue verification template | ❌ notification-service | Template storage in notification-service |
| Payment notification template | ❌ notification-service | Template storage in notification-service |
| Review notification template | ❌ notification-service | Template storage in notification-service |
| Template variables: {venueName}, {userName}, {url} | ❌ notification-service | Template rendering in notification-service |
| HTML email generation | ❌ notification-service | Email rendering in notification-service |
| Plain text fallback | ❌ notification-service | Email rendering in notification-service |

**Score: 0/8 tests belong to venue-service**

### Section 3: SMS Queue (5 tests)

| Test Description | Belongs To | Reason |
|-----------------|------------|--------|
| INSERT into sms_queue | ❌ notification-service | notification-service owns sms_queue table |
| SMS provider integration (Twilio) | ❌ notification-service | Provider integration in notification-service |
| Delivery status tracking | ❌ notification-service | Tracking in notification-service |
| Retry logic | ❌ notification-service | Retry mechanism in notification-service |
| Tenant isolation | ❌ notification-service | notification-service handles tenant scoping |

**Score: 0/5 tests belong to venue-service**

### Section 4: Notification Preferences (7 tests)

| Test Description | Belongs To | Reason |
|-----------------|------------|--------|
| User notification preferences (email_enabled, sms_enabled) | ❌ notification-service | Preference storage in notification-service |
| Venue notification settings | ⚠️ SHARED | venue-service stores, notification-service reads |
| Opt-out handling | ❌ notification-service | Unsubscribe logic in notification-service |
| Notification frequency limits (max 10 emails/day) | ❌ notification-service | Rate limiting in notification-service |
| Unsubscribe link in emails | ❌ notification-service | Email generation in notification-service |
| Do-not-disturb hours | ❌ notification-service | Preference enforcement in notification-service |
| Preference updates via API | ❌ notification-service | notification-service API for preferences |

**Score: 0/7 tests belong to venue-service (1 shared)**

---

## WHAT BELONGS TO VENUE-SERVICE?

### Correct venue-service Notification Tests

**1. Local In-App Notification Storage (5 tests)**
- ✅ Verify `notifications` table exists
- ✅ Store in-app notification with tenant isolation
- ✅ Query notifications with tenant filter
- ✅ Support notification type enums
- ✅ Mark notifications as read

**2. Event Publishing Integration (5 tests)**
- ✅ Verify eventPublisher module available
- ✅ Publish event when venue created
- ✅ Include tenant_id in all published events
- ✅ Handle event publishing failure gracefully
- ✅ Verify event payload structure

**3. Service Boundary Verification (5 tests)**
- ✅ Confirm NO email delivery logic in venue-service
- ✅ Confirm NO SMS delivery logic in venue-service
- ✅ Confirm NO email template rendering in venue-service
- ✅ Confirm NO SendGrid/Twilio provider integration
- ✅ Document that notification-service exists and owns delivery

**Total: 15 tests for venue-service** (vs 30 in original spec)

---

## EVENT-DRIVEN ARCHITECTURE

### How venue-service Triggers Notifications

```
┌─────────────────┐                  ┌──────────────┐                  ┌────────────────────┐
│  venue-service  │                  │   RabbitMQ   │                  │ notification-      │
│                 │                  │              │                  │ service            │
└─────────────────┘                  └──────────────┘                  └────────────────────┘
        │                                    │                                    │
        │ 1. Business Event Occurs           │                                    │
        │    (venue created, staff added)    │                                    │
        │                                    │                                    │
        │ 2. publishEvent()                  │                                    │
        ├───────────────────────────────────>│                                    │
        │    {                               │                                    │
        │      eventType: 'venue.created',   │                                    │
        │      tenantId: '...',  ⭐          │                                    │
        │      payload: {...}                │                                    │
        │    }                               │                                    │
        │                                    │                                    │
        │                                    │ 3. Consume Event                   │
        │                                    ├───────────────────────────────────>│
        │                                    │                                    │
        │                                    │                                    │ 4. Decide Who to Notify
        │                                    │                                    │    (based on event type)
        │                                    │                                    │
        │                                    │                                    │ 5. Render Templates
        │                                    │                                    │
        │                                    │                                    │ 6. Send via Providers
        │                                    │                                    │    (SendGrid, Twilio)
        │                                    │                                    │
        │                                    │                                    │ 7. Track Delivery
        │                                    │                                    │
```

### Critical: tenant_id in Events

**BEFORE (BUG):**
```typescript
publishEvent('venue.created', {
  aggregateId: venue.id,
  payload: venue
  // ❌ NO tenant_id!
});
```

**AFTER (FIXED):**
```typescript
publishEvent('venue.created', {
  aggregateId: venue.id,
  aggregateType: 'venue',
  payload: venue,
  metadata: {
    userId: req.user.id,
    tenantId: req.user.tenant_id,  // ⭐ CRITICAL
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
    source: 'venue-service'
  }
});
```

---

## COMPARISON TABLE

| Capability | venue-service | notification-service |
|-----------|--------------|---------------------|
| **Email Delivery** | ❌ NO | ✅ YES (SendGrid, SES, Mailgun) |
| **SMS Delivery** | ❌ NO | ✅ YES (Twilio, SNS) |
| **Push Notifications** | ❌ NO | ✅ YES (FCM, APNS) |
| **Email Templates** | ❌ NO | ✅ YES (Handlebars, Mustache) |
| **SMS Templates** | ❌ NO | ✅ YES |
| **Template Rendering** | ❌ NO | ✅ YES |
| **Email Queue** | ❌ NO | ✅ YES (email_queue table) |
| **SMS Queue** | ❌ NO | ✅ YES (sms_queue table) |
| **Retry Logic** | ❌ NO | ✅ YES (exponential backoff) |
| **Delivery Tracking** | ❌ NO | ✅ YES (webhooks from providers) |
| **Bounce Handling** | ❌ NO | ✅ YES |
| **Campaign Management** | ❌ NO | ✅ YES |
| **A/B Testing** | ❌ NO | ✅ YES |
| **Analytics** | ❌ NO | ✅ YES (open rate, click rate) |
| **Unsubscribe** | ❌ NO | ✅ YES (GDPR compliance) |
| **Preference Center** | ❌ NO | ✅ YES |
| **In-App Notifications** | ✅ YES | ❌ NO (venue-specific dashboard) |
| **Event Publishing** | ✅ YES | ❌ NO (venue is event source) |
| **RabbitMQ Publishing** | ✅ YES | ❌ NO (venue is publisher) |
| **Event Consumption** | ❌ NO | ✅ YES (consumer) |

---

## RECOMMENDATIONS

### 1. Move Tests to notification-service

All 30 tests from the original TEST_MATRIX.md spec should be implemented in:
```
backend/services/notification-service/tests/integration/email-delivery.integration.test.ts
backend/services/notification-service/tests/integration/sms-delivery.integration.test.ts
backend/services/notification-service/tests/integration/template-rendering.integration.test.ts
backend/services/notification-service/tests/integration/preference-management.integration.test.ts
```

### 2. Correct venue-service Tests

The 15 tests in `notification-integration.integration.test.ts` are CORRECT:
```
backend/services/venue-service/tests/integration/notification-integration.integration.test.ts
```

Tests:
- ✅ In-app notification storage (local to venue-service)
- ✅ Event publishing (venue-service responsibility)
- ✅ Service boundary verification (architectural compliance)

### 3. Fix TEST_MATRIX.md

Update TEST FILE 19 specification:
```markdown
## TEST FILE 19: notification-integration.integration.test.ts

**Source Docs:** NOTIFICATION_ARCHITECTURE_ANALYSIS.md
**Priority:** MEDIUM
**Estimated Tests:** 15

### Local Notification Storage (5 tests)
- Notification table schema verification
- In-app notification creation
- Tenant isolation in queries
- Notification type validation
- Read/unread status management

### Event Publishing Integration (5 tests)
- EventPublisher availability
- Event publishing on business actions
- tenant_id inclusion in events
- Graceful failure handling
- Event payload structure validation

### Service Boundary Verification (5 tests)
- NO email service in venue-service
- NO SMS service in venue-service
- NO template engine in venue-service
- NO provider integration in venue-service
- Architecture documentation
```

### 4. Create NEW Test Files for notification-service

```
TEST FILE: email-delivery.integration.test.ts (notification-service)
- Email queue operations (10 tests)
- Provider integration (SendGrid, SES) (10 tests)
- Retry logic (5 tests)
- Delivery tracking (5 tests)

TEST FILE: template-rendering.integration.test.ts (notification-service)
- Template storage (5 tests)
- Variable substitution (8 tests)
- HTML/plain text rendering (5 tests)
- Template versioning (5 tests)

TEST FILE: notification-preferences.integration.test.ts (notification-service)
- Preference management (7 tests)
- Opt-out handling (5 tests)
- Frequency limits (5 tests)
- Unsubscribe links (5 tests)

TEST FILE: sms-delivery.integration.test.ts (notification-service)
- SMS queue operations (5 tests)
- Twilio integration (5 tests)
- Delivery status (5 tests)
- International numbers (5 tests)
```

---

## BUGS IDENTIFIED

### 1. TEST_MATRIX.md Mislabeling
- ❌ TEST FILE 19 spec tests notification-service concerns
- ❌ Labeled as venue-service test
- ❌ Would create architectural violations if implemented as specified

### 2. Missing tenant_id in Events (FIXED)
- ❌ Original eventPublisher missing tenant_id in metadata
- ✅ Now included in all events
- ✅ Critical for multi-tenant notification routing

### 3. Service Boundary Confusion
- ⚠️ TEST_MATRIX.md implies venue-service handles email delivery
- ⚠️ Would violate microservice principles
- ⚠️ Would duplicate notification-service functionality

---

## CONCLUSION

**Original TEST FILE 19 Spec: INCORRECT for venue-service**
- 30 tests specified
- 0 tests belong to venue-service
- 30 tests belong to notification-service
- 100% service boundary violation

**Corrected Implementation: CORRECT**
- 15 tests implemented
- 15 tests belong to venue-service
- 0 tests violate service boundaries
- 100% architectural compliance

**Impact:**
- ✅ Prevents duplicate email/SMS delivery logic
- ✅ Maintains Single Responsibility Principle
- ✅ Ensures proper service boundaries
- ✅ Enables independent scaling of notification-service
- ✅ Documents event-driven architecture

**Next Steps:**
1. Update TEST_MATRIX.md with corrected spec
2. Create notification-service test files
3. Document event schema contracts
4. Verify all events include tenant_id
5. Implement event consumption in notification-service

---

**Document Status:** COMPLETE  
**Last Updated:** 2026-01-20  
**Author:** System Architecture Review
