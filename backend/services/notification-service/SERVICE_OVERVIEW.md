# Notification Service - Service Overview

## Service Purpose
The Notification Service is a comprehensive, multi-channel notification system that handles email, SMS, push notifications, and webhooks across the TicketToken platform. It provides transactional and marketing communications with advanced features including campaign management, A/B testing, automation triggers, analytics, and full GDPR compliance.

---

## 📁 Directory Structure

```
src/
├── routes/          # API endpoint definitions (10 route files)
├── controllers/     # Request handlers (4 controllers)
├── services/        # Business logic (33 services)
├── middleware/      # Request middleware (6 middleware)
├── config/          # Service configuration (7 config files)
├── migrations/      # Database schema (1 comprehensive migration)
├── validators/      # Input validation (empty - validation in middleware)
├── events/          # Event handlers (3 handlers)
├── jobs/            # Background jobs (2 job files)
├── models/          # Data models (2 PostgreSQL + 1 MongoDB)
├── providers/       # External service integrations (7 providers)
├── templates/       # Notification templates (email & SMS)
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

---

## 🛣️ Routes

### 1. **notification.routes.ts**
Core notification sending endpoints.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/send` | Send single notification | ✅ |
| POST | `/send-batch` | Send batch notifications | ✅ |
| GET | `/status/:id` | Get notification status | ✅ |

**Middleware:** authMiddleware, validateSendRequest, channelRateLimitMiddleware, batchRateLimitMiddleware

---

### 2. **analytics.routes.ts**
Business metrics and analytics endpoints.

| Method | Path | Description | Auth Required | Admin Only |
|--------|------|-------------|---------------|------------|
| GET | `/analytics/metrics/dashboard` | Get dashboard metrics | ✅ | ✅ |
| GET | `/analytics/metrics` | Get overall metrics | ✅ | ✅ |
| GET | `/analytics/channels` | Get channel breakdown | ✅ | ✅ |
| GET | `/analytics/hourly/:date` | Get hourly breakdown | ✅ | ✅ |
| GET | `/analytics/top-types` | Get top notification types | ✅ | ✅ |
| GET | `/track/open/:trackingId` | Track email open (pixel) | ❌ | ❌ |
| GET | `/track/click` | Track link click & redirect | ❌ | ❌ |

**Admin Middleware:** requireAdmin helper function

---

### 3. **campaign.routes.ts**
Campaign management, segmentation, automation, and A/B testing.

| Method | Path | Description | Auth Required | Admin Only |
|--------|------|-------------|---------------|------------|
| POST | `/` | Create campaign | ✅ | ✅ |
| POST | `/:id/send` | Send campaign | ✅ | ✅ |
| GET | `/:id/stats` | Get campaign statistics | ✅ | ✅ |
| POST | `/segments` | Create audience segment | ✅ | ✅ |
| POST | `/segments/:id/refresh` | Refresh segment member count | ✅ | ✅ |
| POST | `/triggers` | Create automation trigger | ✅ | ✅ |
| POST | `/abandoned-carts` | Track abandoned cart | ✅ | ✅ |
| POST | `/ab-tests` | Create A/B test | ✅ | ✅ |
| POST | `/ab-tests/:id/start` | Start A/B test | ✅ | ✅ |
| POST | `/ab-tests/:id/determine-winner` | Determine A/B test winner | ✅ | ✅ |

---

### 4. **consent.routes.ts**
GDPR/CCPA consent management.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/grant` | Grant consent | ✅ |
| POST | `/revoke` | Revoke consent | ✅ |
| GET | `/:customerId` | Check consent status | ✅ |

---

### 5. **gdpr.routes.ts**
GDPR compliance and data management.

| Method | Path | Description | Auth Required | Admin Only |
|--------|------|-------------|---------------|------------|
| GET | `/gdpr/export/:userId` | Export user data | ✅ | User or Admin |
| GET | `/gdpr/portability/:userId` | Get data portability report | ✅ | User or Admin |
| GET | `/gdpr/processing-activities/:userId` | Get processing activities | ✅ | ❌ |
| GET | `/gdpr/validate-deletion/:userId` | Validate deletion request | ✅ | User or Admin |
| DELETE | `/gdpr/user/:userId` | Delete user data | ✅ | User or Admin |
| GET | `/gdpr/data-size/:userId` | Get user data size | ✅ | User or Admin |
| GET | `/gdpr/admin/retention-stats` | Get retention statistics | ✅ | ✅ |
| POST | `/gdpr/admin/cleanup` | Run data retention cleanup | ✅ | ✅ |

---

### 6. **health.routes.ts**
Service health monitoring and diagnostics.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/health` | Basic health check | ❌ |
| GET | `/health/ready` | Readiness check | ❌ |
| GET | `/health/live` | Liveness check | ❌ |
| GET | `/health/detailed` | Comprehensive health check | ❌ |
| GET | `/health/db` | Database health check | ❌ |
| GET | `/health/redis` | Redis health check | ❌ |
| GET | `/health/providers` | Providers health check | ❌ |
| GET | `/health/circuit-breakers` | Circuit breaker status | ❌ |
| GET | `/health/system` | System metrics | ❌ |

---

### 7. **marketing.routes.ts**
Marketing campaign management with A/B testing and tracking.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/campaigns` | Create campaign | ✅ (marketing_admin) |
| GET | `/campaigns` | Get campaigns | ✅ (marketing_admin) |
| GET | `/campaigns/:campaignId` | Get single campaign | ✅ (marketing_admin) |
| PUT | `/campaigns/:campaignId` | Update campaign | ✅ (marketing_admin) |
| DELETE | `/campaigns/:campaignId` | Delete campaign | ✅ (marketing_admin) |
| POST | `/campaigns/:campaignId/publish` | Publish campaign | ✅ (marketing_admin) |
| POST | `/campaigns/:campaignId/pause` | Pause campaign | ✅ (marketing_admin) |
| POST | `/campaigns/:campaignId/abtest` | Create A/B test | ✅ (marketing_admin) |
| GET | `/campaigns/:campaignId/abtest/results` | Get A/B test results | ✅ (marketing_admin) |
| POST | `/campaigns/:campaignId/abtest/winner` | Declare winner | ✅ (marketing_admin) |
| POST | `/campaigns/:campaignId/track/impression` | Track impression | ❌ (internal/public) |
| POST | `/campaigns/:campaignId/track/click` | Track click | ❌ (internal/public) |
| POST | `/campaigns/:campaignId/track/conversion` | Track conversion | ❌ (internal/public) |
| GET | `/campaigns/:campaignId/metrics` | Get performance metrics | ✅ (marketing_admin) |

---

### 8. **metrics.routes.ts**
Prometheus metrics endpoint.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/metrics` | Prometheus metrics | ❌ |

---

### 9. **preferences.routes.ts**
User notification preferences management.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/preferences/:userId` | Get user preferences | ✅ (User or Admin) |
| PUT | `/preferences/:userId` | Update user preferences | ✅ (User or Admin) |
| POST | `/unsubscribe/:token` | Unsubscribe via token | ❌ |
| POST | `/can-send` | Check if can send notification | ✅ (User or Admin) |

---

### 10. **template.routes.ts**
Template management for notifications.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/templates` | Create template | ❌ |
| GET | `/templates` | List templates | ❌ |
| GET | `/templates/:id` | Get template by ID | ❌ |
| PUT | `/templates/:id` | Update template | ❌ |
| DELETE | `/templates/:id` | Delete template | ❌ |
| POST | `/templates/:id/preview` | Preview template | ❌ |
| GET | `/templates/:id/versions` | Get template versions | ❌ |
| GET | `/templates/:id/stats` | Get template stats | ❌ |

---

## 🎮 Controllers

### 1. **NotificationController** (`notification.controller.ts`)
Handles core notification sending operations.

**Methods:**
- `send()` - Send single notification
- `sendBatch()` - Send batch notifications
- `getStatus()` - Get notification status by ID

---

### 2. **ConsentController** (`consent.controller.ts`)
Manages user consent for communications.

**Methods:**
- `grant()` - Record consent for a channel/type
- `revoke()` - Revoke consent
- `check()` - Check if user has given consent

---

### 3. **MarketingController** (`marketing.controller.ts`)
Manages marketing campaigns and A/B testing.

**Methods:**
- `createCampaign()` - Create new campaign
- `getCampaigns()` - List campaigns with filters
- `getCampaign()` - Get single campaign
- `updateCampaign()` - Update campaign
- `deleteCampaign()` - Delete campaign
- `publishCampaign()` - Publish campaign
- `pauseCampaign()` - Pause campaign
- `createABTest()` - Create A/B test
- `getABTestResults()` - Get A/B test results
- `declareWinner()` - Declare A/B test winner
- `trackImpression()` - Track campaign impression
- `trackClick()` - Track campaign click
- `trackConversion()` - Track campaign conversion
- `getPerformanceMetrics()` - Get campaign metrics

---

### 4. **WebhookController** (`webhook.controller.ts`)
Processes webhooks from external notification providers.

**Methods:**
- `handleSendGridWebhook()` - Process SendGrid delivery webhooks
- `handleTwilioWebhook()` - Process Twilio SMS status webhooks
- `handleGenericWebhook()` - Process generic provider webhooks
- `verifySendGridSignature()` - Verify SendGrid HMAC signature
- `verifyTwilioSignature()` - Verify Twilio signature
- `verifyGenericSignature()` - Verify generic HMAC signature
- `updateNotificationStatus()` - Update notification delivery status
- `mapSendGridStatus()` - Map SendGrid status to internal status
- `mapTwilioStatus()` - Map Twilio status to internal status

---

## 🔧 Services (33 Services)

### Core Services

1. **notification.service.ts** - Main notification orchestration service
   - Send notifications across all channels (email, SMS, push)
   - Template rendering with Handlebars
   - Venue branding and white-label support
   - Consent checking
   - Notification storage and status tracking

2. **notification-orchestrator.ts** - Background job orchestration
   - Initialize background jobs
   - Generate daily analytics
   - Send ticket confirmations

3. **notification-metrics.service.ts** (AnalyticsService) - Analytics tracking
   - Track sent, delivery, engagement, click events
   - Get metrics by date range and channel
   - Generate tracking pixels and tracked links
   - User engagement scoring

### Queue & Delivery

4. **queue.service.ts** - Bull queue management for async processing
   - Initialize queues (email, SMS, push)
   - Add jobs with priority
   - Get queue statistics
   - Metrics tracking

5. **queue-manager.service.ts** - Advanced queue management
   - Priority-based queuing (critical, high, normal, low)
   - Queue metrics, pause, resume, drain operations

6. **delivery-tracker.ts** - Delivery status tracking
   - Track delivery status
   - Retry logic with exponential backoff
   - Update delivery statistics

7. **retry.service.ts** - Retry logic for failed notifications
   - Determine if notification should be retried
   - Exponential backoff strategy
   - Record retry metrics

### Provider Management

8. **provider-manager.service.ts** - Provider health monitoring
   - Track provider health and failover
   - Get healthy providers
   - Record success/failure metrics

### Rate Limiting & Compliance

9. **rate-limiter.ts** - Rate limiting service
   - Per-user, per-channel rate limits
   - Sliding window algorithm
   - Middleware integration

10. **compliance.service.ts** - GDPR/CCPA compliance
    - Check compliance before sending
    - SMS time window restrictions
    - Record and revoke consent
    - Suppression list management

11. **gdpr.service.ts** - GDPR data operations
    - Export user data
    - Delete/anonymize user data
    - Data portability
    - Processing activities
    - Validate deletion requests
    - Schedule deletions

12. **data-retention.service.ts** - Data retention policies
    - Cleanup old notifications, logs, webhooks, audit logs
    - Anonymize/delete user data
    - Get retention statistics
    - Get user data size

13. **audit-log.service.ts** - Audit logging
    - Log PII access, data exports, deletions
    - Log consent changes, preference updates
    - Log admin actions
    - Query audit logs

### Campaign Management

14. **campaign.service.ts** - Campaign orchestration
    - Create and send campaigns
    - Audience segmentation
    - Automation triggers
    - Abandoned cart tracking
    - A/B testing

15. **segmentation.service.ts** - Audience segmentation
    - Create segments with filter criteria
    - Check if user matches segment
    - Dynamic rule evaluation

16. **automation.service.ts** - Email automation triggers
    - Time-based, event-based, behavior-based triggers
    - Execute automated actions
    - Abandoned cart & re-engagement checks

17. **ab-test.service.ts** - A/B testing
    - Create A/B tests
    - Select variants for users
    - Track conversions
    - Determine winner

18. **marketing.service.ts** - Marketing campaign CRUD
    - Create, update, delete campaigns
    - Publish/pause campaigns
    - A/B testing integration
    - Performance metrics tracking

### Templates

19. **template.service.ts** - Template management
    - CRUD operations for templates
    - Render templates with data
    - Version history
    - Usage statistics
    - Preview templates

20. **template-registry.ts** - Template registration
    - Register built-in templates
    - Get templates by channel
    - Validate template data
    - Render registered templates

### Preferences & User Management

21. **preference.service.ts** - Customer preferences
    - Get/update preferences
    - Unsubscribe handling
    - Export customer data

22. **preference-manager.ts** - Advanced preference management
    - Check if can send notification
    - Quiet hours enforcement
    - Frequency limits
    - Generate unsubscribe links
    - Preference history tracking

### Metrics & Analytics

23. **metrics.service.ts** - Prometheus metrics
    - Track notifications sent, delivered, failed
    - Track webhook events
    - Track API requests
    - Queue depth, connections, provider status
    - Histograms for latency

24. **metrics-aggregator.service.ts** - Business metrics aggregation
    - Dashboard metrics (realtime, hourly, daily)
    - Channel metrics (email, SMS)
    - Delivery, bounce, unsubscribe rates
    - Cost per notification

25. **delivery-metrics.service.ts** - Notification analytics
    - Delivery metrics by date range
    - Engagement metrics (opens, clicks)
    - Cost metrics
    - Venue health scores
    - Time series metrics
    - Compliance reports

26. **engagement-tracking.service.ts** - Engagement tracking
    - Track opens, clicks, conversions
    - Generate tracking pixels and wrapped links
    - Verify tracking tokens
    - Calculate engagement scores

27. **dashboard.service.ts** - Dashboard data
    - Overview metrics
    - Campaign metrics
    - Channel performance
    - Real-time metrics
    - Top templates
    - Engagement funnel
    - Export analytics (JSON/CSV)

### Scheduling

28. **scheduler.service.ts** - Scheduled notifications
    - Schedule notifications for future delivery
    - Process due notifications
    - Handle recurring notifications
    - Cancel scheduled notifications

### Rich Media & Internationalization

29. **rich-media.service.ts** - Rich media email content
    - Process images
    - Generate responsive HTML
    - Generate AMP emails

30. **i18n.service.ts** - Internationalization
    - Load translations
    - Translate templates
    - Language detection
    - Date/currency formatting

31. **wallet-pass.service.ts** - Digital wallet passes
    - Generate Apple Wallet passes
    - Generate Google Wallet passes
    - Generate QR codes

### Spam & Quality

32. **spam-score.service.ts** - Spam score checking
    - Check content for spam indicators
    - Analyze subject lines, links, images
    - Flag potential issues

### Cache

33. **cache-integration.ts** - Redis caching
    - Cache notification preferences
    - Cache user data
    - TTL management

---

## 🛡️ Middleware (6 Middleware)

### 1. **auth.middleware.ts**
JWT authentication middleware.

**Functions:**
- `authMiddleware()` - Require valid JWT token
- `optionalAuthMiddleware()` - Optional authentication

**User Object:**
```typescript
{
  id: string;
  email: string;
  venueId?: string;
  role?: string;
}
```

---

### 2. **error.middleware.ts**
Global error handling.

**Classes:**
- `AppError` - Custom error class with status codes

---

### 3. **rate-limit.middleware.ts**
Channel-specific rate limiting.

**Functions:**
- `emailRateLimitMiddleware()` - Rate limit email endpoints
- `smsRateLimitMiddleware()` - Rate limit SMS endpoints
- `batchRateLimitMiddleware()` - Rate limit batch operations
- `channelRateLimitMiddleware()` - Dynamic channel-based rate limiting

**RateLimiter Class:**
- In-memory sliding window rate limiter
- Configurable limits per window

---

### 4. **tracing.middleware.ts**
Distributed tracing support.

**Functions:**
- `tracingMiddleware()` - Add trace context to requests
- `createSpan()` - Create child spans
- `withSpan()` - Execute function with span tracking

**Span Class:**
- Track operation timing
- Record errors and events
- Set attributes

---

### 5. **validation.middleware.ts**
Input validation for requests.

**Functions:**
- `validateSendRequest()` - Validate single notification request
- `validateBatchSendRequest()` - Validate batch notification request
- `validateEmail()` - Email format validation
- `validatePhone()` - Phone number validation
- `sanitizeString()` - XSS prevention

---

### 6. **webhook-auth.middleware.ts**
Webhook signature verification.

**Functions:**
- `verifyTwilioSignature()` - Verify Twilio webhook HMAC
- `verifySendGridSignature()` - Verify SendGrid webhook HMAC

---

## ⚙️ Config (7 Config Files)

### 1. **env.ts**
Environment variable management.

**Functions:**
- `getEnvVar()` - Get string env var with default
- `getEnvVarAsNumber()` - Get numeric env var
- `getEnvVarAsBoolean()` - Get boolean env var

**Key Variables:**
- NODE_ENV, PORT, SERVICE_NAME
- DATABASE_URL, REDIS_URL, MONGODB_URI
- JWT_SECRET
- TWILIO_*, SENDGRID_* credentials
- AWS credentials

---

### 2. **database.ts**
PostgreSQL connection with Knex.

**Features:**
- Connection pool management
- Health monitoring
- Pool metrics tracking
- Auto-reconnect

**Functions:**
- `connectDatabase()`
- `closeDatabaseConnections()`
- `getPoolStats()`
- `isDatabaseConnected()`

**DatabaseHealthMonitor Class:**
- Periodic health checks
- Health status tracking

---

### 3. **redis.ts**
Redis connection with ioredis.

**Features:**
- Connection management
- Health monitoring
- Metrics tracking
- Event handlers

**Functions:**
- `connectRedis()`
- `closeRedisConnections()`
- `isRedisConnected()`
- `getRedisStats()`
- `createRedisClient()` - Create additional clients

**RedisHealthMonitor Class:**
- Periodic health checks
- Health status tracking

---

### 4. **mongodb.ts**
MongoDB connection with Mongoose.

**Features:**
- Connection management
- Health checks
- Used for marketing content storage

**Functions:**
- `initializeMongoDB()`
- `getMongoDB()`
- `closeMongoDB()`
- `checkMongoDBHealth()`

---

### 5. **rabbitmq.ts**
RabbitMQ event queue integration.

**RabbitMQService Class:**
- `connect()` - Connect to RabbitMQ
- `consume()` - Consume messages from queue
- `publish()` - Publish events to exchange
- `close()` - Close connection
- `getConnectionStatus()` - Check connection status

---

### 6. **rate-limits.ts**
Rate limit configurations.

**Functions:**
- `shouldBypassRateLimit()` - Check if request should bypass rate limits

---

### 7. **secrets.ts**
Secrets management (AWS Secrets Manager integration).

**Functions:**
- `loadSecrets()` - Load secrets from AWS Secrets Manager

---

### 8. **logger.ts**
Winston logging configuration.

**Features:**
- JSON formatted logs
- Multiple transports (console, file)
- Error logging
- Request logging

---

## 📊 Migrations

### **001_baseline_notification_schema.ts**
Comprehensive database schema for the notification service.

**Tables Created (36 tables):**

#### Core Tables
1. **scheduled_notifications** - Future delivery scheduling
2. **notification_history** - All sent notifications
3. **notification_tracking** - Detailed tracking with PII support
4. **notification_analytics** - Hourly analytics aggregation
5. **notification_analytics_daily** - Daily analytics aggregation

#### Consent & Preferences
6. **consent_records** - GDPR consent tracking
7. **suppression_list** - Email/phone suppression (bounces, unsubscribes)
8. **notification_preferences** - User notification preferences
9. **notification_preference_history** - Preference change audit trail

#### Templates
10. **notification_templates** - Template definitions
11. **template_usage** - Template usage tracking
12. **template_versions** - Template version history

#### Campaigns & Marketing
13. **notification_campaigns** - Campaign management
14. **campaign_stats** - Campaign statistics
15. **audience_segments** - User segmentation
16. **email_automation_triggers** - Automation rules
17. **abandoned_carts** - Cart abandonment tracking

#### A/B Testing
18. **ab_tests** - A/B test definitions
19. **ab_test_variants** - Test variants
20. **ab_test_metrics** - Test metrics tracking

#### Analytics & Engagement
21. **notification_engagement** - User engagement events
22. **engagement_events** - Engagement event log
23. **notification_clicks** - Click tracking
24. **bounces** - Bounce tracking
25. **notification_delivery_stats** - Delivery statistics

#### Settings & Configuration
26. **venue_notification_settings** - Venue-specific settings
27. **venue_health_scores** - Venue health metrics
28. **notification_costs** - Cost tracking per notification

#### GDPR & Compliance
29. **pending_deletions** - Scheduled user data deletions

#### Automation & Jobs
30. **automation_executions** - Automation execution log

#### Internationalization
31. **translations** - Multi-language translations

**Foreign Keys:**
- 21 cross-service foreign keys (to tenants, users, venues, events, orders)
- 4 internal foreign keys

**Indexes:**
- 100+ indexes for query optimization
- Composite indexes for common query patterns
- Partial indexes for filtering

**Triggers:**
- `updated_at` auto-update triggers on 10 tables

**Functions:**
- `aggregate_notification_analytics()` - Analytics aggregation
- `update_updated_at_column()` - Auto-update timestamp

---

## ✅ Validators

**Status:** Empty folder - validation is handled in middleware (validation.middleware.ts)

---

## 📡 Events (3 Event Handlers)

### 1. **base-event-handler.ts**
Base class for event handlers.

**BaseEventHandler Class:**
- Abstract base for event handling
- Get user/event details
- Record notifications
- Start/stop event listening

---

### 2. **event-handler.ts**
Main event handler for platform events.

**EventHandler Class:**
Handles events:
- `handlePaymentCompleted()` - Payment success notifications
- `handleTicketTransferred()` - Transfer notifications
- `handleEventReminder()` - Event reminder notifications
- `handleEventCancelled()` - Cancellation notifications
- `handleUserRegistered()` - Welcome emails
- `handlePasswordReset()` - Password reset emails

---

### 3. **payment-event-handler.ts**
Payment-specific event handler.

**PaymentEventHandler Class:**
Handles payment events:
- `handlePaymentSuccess()` - Payment confirmation
- `handlePaymentFailed()` - Payment failure notice
- `handleRefundProcessed()` - Refund confirmation
- `handleDisputeCreated()` - Dispute notifications

---

## ⏰ Jobs (2 Job Files)

### 1. **campaign.jobs.ts**
Campaign background jobs.

**Functions:**
- `processAbandonedCartsJob()` - Send abandoned cart emails
- `refreshSegmentsJob()` - Refresh audience segment counts
- `sendScheduledCampaignsJob()` - Process scheduled campaigns
- `startCampaignJobs()` - Initialize all campaign jobs

---

### 2. **data-retention.job.ts**
Data retention cleanup job.

**DataRetentionJob Class:**
- `start()` - Start cron job (daily at 2 AM)
- `stop()` - Stop cron job
- `runNow()` - Run cleanup immediately

---

## 📦 Models

### PostgreSQL Models

#### 1. **consent.model.ts**
Consent record management.

**ConsentModel Class:**
- `create()` - Create consent record
- `findByCustomer()` - Get customer consent records
- `hasConsent()` - Check if consent exists
- `revoke()` - Revoke consent
- `getAuditTrail()` - Get consent history

**Table:** `consent_records`

---

#### 2. **suppression.model.ts**
Suppression list management (bounces, unsubscribes).

**SuppressionModel Class:**
- `add()` - Add to suppression list
- `isSuppressed()` - Check if identifier is suppressed
- `remove()` - Remove from suppression list
- `findAll()` - Get all suppressed identifiers

**Table:** `suppression_list`

---

### MongoDB Models

#### 3. **marketing-content.model.ts** (MongoDB)
Marketing campaign content storage.

**MarketingContent Schema:**
- Campaign metadata
- Content variants
- A/B test data
- Performance metrics

**Database:** MongoDB (via Mongoose)

---

## 🔌 Providers (7+ Providers)

### 1. **base.provider.ts**
Abstract base provider class.

**BaseProvider Class:**
- Abstract methods: `verify()`, `getStatus()`
- Configuration management

---

### 2. **email.provider.ts**
Email sending via SendGrid.

**EmailProvider Class:**
- `send()` - Send single email
- `sendBulk()` - Send bulk emails (batched)
- `validateEmail()` - Email validation

**Provider:** SendGrid

---

### 3. **aws-ses.provider.ts**
Email sending via AWS SES.

**AWSSESProvider Class:**
- `send()` - Send email via SES
- `getQuota()` - Get sending quota
- `verifyEmailIdentity()` - Verify email domain

**Provider:** AWS SES

---

### 4. **sms.provider.ts**
SMS sending via Twilio.

**SmsProvider Class:**
- `send()` - Send single SMS
- `sendBulk()` - Send bulk SMS
- `validatePhoneNumber()` - Phone validation
- `getDeliveryStatus()` - Check SMS delivery status

**Provider:** Twilio

---

### 5. **aws-sns.provider.ts**
SMS sending via AWS SNS.

**AWSSNSProvider Class:**
- `send()` - Send SMS via SNS
- `setSMSAttributes()` - Configure SNS settings
- `formatPhoneNumber()` - E.164 formatting

**Provider:** AWS SNS

---

### 6. **webhook.provider.ts**
Generic webhook delivery.

**WebhookProvider Class:**
- `send()` - Send webhook with HMAC signature
- `validateWebhook()` - Verify webhook signature

---

### 7. **provider-factory.ts**
Provider factory and health monitoring.

**ProviderFactory Class:**
Static methods:
- `getEmailProvider()` - Get configured email provider
- `getSMSProvider()` - Get configured SMS provider
- `verifyProviders()` - Verify all providers
- `getProvidersStatus()` - Get provider status
- `getProviderHealth()` - Get provider health scores

**Sub-providers:**
- `email/base-email.provider.ts` - Email base
- `email/email.provider.ts` - SendGrid implementation
- `email/mock-email.provider.ts` - Mock for testing
- `email/sendgrid-email.provider.ts` - SendGrid client
- `sms/base-sms.provider.ts` - SMS base
- `sms/sms.provider.ts` - Twilio implementation
- `sms/mock-sms.provider.ts` - Mock for testing
- `sms/twilio-sms.provider.ts` - Twilio client
- `push/push.provider.ts` - Push notification provider

---

## 📝 Templates

### Email Templates (Handlebars)
Located in `src/templates/email/`:

1. **abandoned-cart.hbs** - Cart abandonment recovery
2. **account-verification.hbs** - Email verification
3. **event-reminder.hbs** - Event reminder
4. **newsletter.hbs** - Newsletter template
5. **order-confirmation.hbs** - Order confirmation
6. **payment-failed.hbs** - Payment failure notice
7. **payment-refunded.html** - Refund confirmation
8. **payment-success.hbs** - Payment success
9. **post-event-followup.hbs** - Post-event survey
10. **refund-processed.hbs** - Refund processed
11. **ticket-minted.html** - NFT ticket minted
12. **ticket-purchased.hbs** - Ticket purchase confirmation

### SMS Templates (Plain Text)
Located in `src/templates/sms/`:

1. **event-reminder.txt** - Event reminder SMS
2. **payment-failed.txt** - Payment failure SMS
3. **payment-success.txt** - Payment success SMS
4. **verification.txt** - Verification code SMS

**Template Engine:** Handlebars

---

## 📚 Types

### 1. **notification.types.ts**
Core notification types.

**Enums:**
- `NotificationChannel`: email, sms, push, webhook
- `NotificationType`: transactional, marketing, system
- `NotificationPriority`: critical, high, normal, low

**Interfaces:**
- `NotificationRequest` - Send request structure
- `NotificationResponse` - Send response structure
- `UserPreferences` - User notification preferences

---

### 2. **campaign.types.ts**
Campaign and automation types.

**Interfaces:**
- `CreateCampaignRequest`
- `CreateSegmentRequest`
- `CreateAutomationTriggerRequest`
- `TrackAbandonedCartRequest`
- `CreateABTestRequest`

---

### 3. **events.types.ts**
Event payload types for RabbitMQ events.

**Interfaces:**
- `PaymentCompletedEvent`
- `TicketTransferredEvent`
- `EventReminderEvent`
- `EventCancelledEvent`
- `UserRegisteredEvent`
- `PasswordResetEvent`

---

## 🛠️ Utils

### 1. **async-handler.ts**
Async error handling wrapper.

---

### 2. **circuit-breaker.ts**
Circuit breaker pattern for external services.

**Features:**
- Open/closed/half-open states
- Failure threshold tracking
- Auto-recovery

---

### 3. **encryption.util.ts**
Data encryption utilities for PII.

**Functions:**
- `encrypt()` - AES-256 encryption
- `decrypt()` - AES-256 decryption
- `hash()` - SHA-256 hashing

---

### 4. **graceful-degradation.ts**
Graceful degradation for service failures.

---

### 5. **logger.ts**
Winston logger instance.

---

### 6. **retry.ts**
Retry logic with exponential backoff.

---

### 7. **template-engine.ts**
Handlebars template engine wrapper.

**Functions:**
- `compile()` - Compile template
- `render()` - Render template with data

---

## 🗄️ Database Tables Summary

The service owns **36 tables** covering:
- ✅ Core notifications (5 tables)
- ✅ Consent & preferences (4 tables)
- ✅ Templates (3 tables)
- ✅ Campaigns & marketing (4 tables)
- ✅ A/B testing (3 tables)
- ✅ Analytics & engagement (6 tables)
- ✅ Settings (2 tables)
- ✅ GDPR & compliance (1 table)
- ✅ Automation (1 table)
- ✅ Internationalization (1 table)
- ✅ Misc (6 tables)

**Foreign Key Dependencies:**
- tenants
- users
- venues
- events
- orders

---

## 🔐 External Services Configured

### Email Providers
- **SendGrid** - Primary email provider
- **AWS SES** - Alternative email provider

### SMS Providers
- **Twilio** - Primary SMS provider
- **AWS SNS** - Alternative SMS provider

### Infrastructure
- **PostgreSQL** - Primary data store
- **Redis** - Caching and rate limiting
- **MongoDB** - Marketing content storage
- **RabbitMQ** - Event queue
- **Bull** - Job queue (uses Redis)

### Observability
- **Prometheus** - Metrics collection
- **Winston** - Logging

### Cloud Services
- **AWS Secrets Manager** - Secrets management (optional)

---

## 🚀 Key Features

### ✅ Multi-Channel Delivery
- Email (SendGrid, AWS SES)
- SMS (Twilio, AWS SNS)
- Push Notifications
- Webhooks

### ✅ Campaign Management
- Audience segmentation
- Scheduled campaigns
- A/B testing
- Performance analytics

### ✅ Automation
- Event-based triggers
- Time-based triggers
- Behavior-based triggers
- Abandoned cart recovery

### ✅ Analytics & Tracking
- Open tracking (pixel)
- Click tracking (wrapped links)
- Conversion tracking
- Real-time metrics
- Historical analytics

### ✅ Compliance
- GDPR right to access
- GDPR right to erasure
- GDPR right to portability
- Consent management
- Suppression lists
- Data retention policies
- Audit logging

### ✅ Quality & Reliability
- Rate limiting (per user, per channel)
- Circuit breakers
- Retry logic with exponential backoff
- Provider failover
- Spam score checking
- Queue-based processing
- Health monitoring

### ✅ Personalization
- Template engine (Handlebars)
- Multi-language support (i18n)
- Venue branding & white-label
- User preferences
- Quiet hours
- Frequency limits

### ✅ Advanced Features
- Digital wallet passes (Apple/Google)
- Rich media emails
- AMP emails
- Scheduled delivery
- Batch sending
- Delivery status webhooks

---

## 📈 Metrics & Monitoring

### Prometheus Metrics
- Notifications sent/delivered/failed by channel
- Provider response times
- Queue depth
- API request latency
- Circuit breaker states
- Active connections

### Health Checks
- Database connectivity
- Redis connectivity
- Provider status
- Circuit breaker status
- System resources (CPU, memory)

### Analytics
- Delivery rates
- Open rates
- Click rates
- Bounce rates
- Unsubscribe rates
- Cost per notification
- Engagement scores

---

## 🔒 Security

- JWT authentication
- HMAC webhook verification
- Rate limiting
- Input validation & sanitization
- XSS prevention
- SQL injection prevention (parameterized queries)
- PII encryption
- Secure secret management
- Audit logging

---

## 📝 Notes

- **No Repositories Folder**: Data access is handled directly in services and models
- **Validators Folder Empty**: Validation logic is in `validation.middleware.ts`
- **Template Registry**: Hardcoded templates registered in `template-registry.ts`
- **Provider Factory Pattern**: Centralized provider management with health checks
- **Event-Driven**: Listens to RabbitMQ for cross-service events
- **Queue-Based**: Async processing via Bull queues
- **Multi-Tenant**: Supports tenant_id and venue_id for isolation

---

## 🏗️ Architecture Patterns

- **Factory Pattern**: Provider factory
- **Strategy Pattern**: Multiple providers per channel
- **Observer Pattern**: Event handlers
- **Circuit Breaker**: Fault tolerance
- **Repository Pattern**: Models encapsulate data access
- **Service Layer**: Business logic separation
- **Middleware Pattern**: Request pipeline
- **Queue Pattern**: Async job processing
- **Template Pattern**: Template registry

---

## 🔄 Integration Points

### Consumes Events From:
- Payment Service (payment completed, failed, refunded)
- Ticket Service (ticket transferred)
- Event Service (event reminders, cancellations)
- Auth Service (user registered, password reset)

### Produces Events To:
- Analytics (notification metrics)
- Audit logs (compliance events)

### External Integrations:
- SendGrid API
- Twilio API
- AWS SES
- AWS SNS
- Apple Wallet API
- Google Wallet API

---

**End of Notification Service Overview**
