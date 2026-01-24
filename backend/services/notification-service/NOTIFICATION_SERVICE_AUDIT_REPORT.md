# NOTIFICATION-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** 2026-01-23
**Updated:** 2026-01-23 (Follow-up audit with additional 50+ files)
**Service:** notification-service
**Location:** `backend/services/notification-service/`
**Port:** 3007

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| POST | `/api/notifications/send` | NotificationController | Send single notification |
| POST | `/api/notifications/send-batch` | NotificationController | Send batch notifications |
| GET | `/api/notifications/status/:id` | NotificationController | Get notification status |
| POST | `/api/consent/grant` | ConsentController | Grant consent for communications |
| POST | `/api/consent/revoke` | ConsentController | Revoke consent |
| GET | `/api/consent/:customerId` | ConsentController | Check consent status |
| GET | `/api/preferences/:userId` | PreferencesRoutes | Get user notification preferences |
| PUT | `/api/preferences/:userId` | PreferencesRoutes | Update user preferences |
| POST | `/api/preferences/unsubscribe` | PreferencesRoutes | Unsubscribe via token |
| GET | `/api/gdpr/export/:userId` | GDPRRoutes | Export user data (GDPR) |
| POST | `/api/gdpr/delete/:userId` | GDPRRoutes | Delete user data (GDPR) |
| POST | `/api/marketing/campaigns` | CampaignRoutes | Create marketing campaign |
| POST | `/api/marketing/campaigns/:id/send` | CampaignRoutes | Send campaign |
| GET | `/api/marketing/campaigns/:id/stats` | CampaignRoutes | Get campaign statistics |
| POST | `/api/marketing/segments` | CampaignRoutes | Create audience segment |
| POST | `/api/marketing/triggers` | CampaignRoutes | Create automation trigger |
| POST | `/api/marketing/ab-tests` | CampaignRoutes | Create A/B test |
| GET | `/api/analytics/*` | AnalyticsRoutes | Analytics endpoints |
| GET | `/api/templates` | TemplateRoutes | List templates |
| POST | `/api/templates` | TemplateRoutes | Create template |
| PUT | `/api/templates/:id` | TemplateRoutes | Update template |
| GET | `/metrics` | MetricsRoutes | Prometheus metrics |

### Internal/Webhook Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/startup` | Kubernetes startup probe |
| GET | `/health/detailed` | Detailed health with dependencies |
| POST | `/webhooks/sendgrid` | SendGrid delivery webhooks |
| POST | `/webhooks/twilio` | Twilio SMS status webhooks |
| POST | `/webhooks/:provider` | Generic provider webhooks |

### Business Operations

- **Email Notifications**: SendGrid, AWS SES providers with template rendering
- **SMS Notifications**: Twilio, AWS SNS providers with time-window restrictions
- **Push Notifications**: Push provider support (mock in dev)
- **Webhook Delivery**: Configurable external webhook delivery
- **Marketing Campaigns**: Campaign creation, scheduling, audience segmentation
- **User Preferences**: Granular channel/category preferences, quiet hours
- **GDPR Compliance**: Data export, deletion, anonymization
- **A/B Testing**: Multi-variant testing with winner determination
- **Abandoned Cart Recovery**: Cart tracking and recovery email automation
- **Engagement Tracking**: Open/click tracking with pixel and link wrapping
- **Rate Limiting**: Per-user and global rate limiting
- **Spam Prevention**: Content spam scoring before send

---

## 2. DATABASE SCHEMA

### PostgreSQL Tables (32 tables)

**Core Tables:**
| Table | Purpose | PII Fields |
|-------|---------|------------|
| `notification_history` | Main notification log | `recipient_email`, `recipient_phone`, `recipient_name` |
| `notification_tracking` | Delivery/engagement tracking | `recipient_email`, `recipient_phone` (with encryption support) |
| `scheduled_notifications` | Future delivery queue | `recipient` |
| `consent_records` | Consent management | `ip_address`, `user_agent` |
| `suppression_list` | Email/SMS blocklist | `identifier`, `identifier_hash` |
| `notification_preferences` | User preferences | `unsubscribe_token` |
| `notification_preference_history` | Preference change audit | None |

**Campaign Tables:**
| Table | Purpose |
|-------|---------|
| `notification_campaigns` | Campaign definitions |
| `audience_segments` | Audience segmentation |
| `email_automation_triggers` | Automation rules |
| `ab_tests` | A/B test definitions |
| `ab_test_variants` | A/B test variants |
| `ab_test_metrics` | A/B test metrics |
| `abandoned_carts` | Cart abandonment tracking |

**Analytics Tables:**
| Table | Purpose |
|-------|---------|
| `notification_analytics` | Hourly aggregated stats |
| `notification_analytics_daily` | Daily aggregated stats |
| `notification_delivery_stats` | Delivery statistics |
| `notification_engagement` | User engagement events |
| `notification_clicks` | Click tracking |
| `engagement_events` | Open/click/conversion events |
| `campaign_stats` | Campaign performance |
| `bounces` | Bounce tracking |

**Template Tables:**
| Table | Purpose |
|-------|---------|
| `notification_templates` | Template definitions |
| `template_versions` | Template version history |
| `template_usage` | Template usage tracking |
| `translations` | i18n translations |

**GDPR/Admin Tables:**
| Table | Purpose |
|-------|---------|
| `pending_deletions` | Scheduled GDPR deletions |
| `venue_notification_settings` | Per-venue settings |
| `venue_health_scores` | Venue health monitoring |
| `notification_costs` | Cost tracking |
| `automation_executions` | Automation run history |

### MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `marketing_content` | Rich marketing content with A/B variants |

### PII Handling

- **Email addresses**: Stored with optional encryption (`recipient_email_encrypted`) and hash (`recipient_email_hash`)
- **Phone numbers**: Stored with optional encryption (`recipient_phone_encrypted`) and hash (`recipient_phone_hash`)
- **Encryption**: AES-256-GCM via `encryption.util.ts`
- **Hash**: SHA-256 for lookup operations
- **GDPR Anonymization**: `anonymized_at` field for tracking

### Indexes (100+ indexes)

Notable indexes:
- `idx_notification_tracking_email_hash` - Fast suppression lookup
- `idx_notification_tracking_provider_id` - Webhook correlation
- `idx_scheduled_notifications_processing` - Queue processing
- `idx_analytics_date_channel` - Reporting queries

### Schema Issues

1. **ISSUE-DB1**: Foreign keys reference external tables (`users`, `venues`, `orders`, `events`) that may not exist in notification-service database
2. **ISSUE-DB2**: Large number of cross-service foreign keys (21) creates coupling
3. **ISSUE-DB3**: `notification_tracking` has duplicate PII fields (encrypted and plain)

---

## 3. SECURITY ANALYSIS

### A. S2S Authentication

| File | Line | Service | Endpoint | Auth Method | Client | Notes |
|------|------|---------|----------|-------------|--------|-------|
| `base-event-handler.ts` | 47-48 | auth-service | `getUser` | HMAC-SHA256 | `authServiceClient` | Uses shared client singleton |
| `base-event-handler.ts` | 78 | event-service | `getEventInternal` | HMAC-SHA256 | `eventServiceClient` | Uses shared client singleton |
| `notification.service.ts` | 63 | venue-service | `/api/v1/branding/:id` | **NO AUTH** | `axios` | Missing S2S auth |
| `clients/index.ts` | - | - | - | HMAC-SHA256 | Re-exports from shared | Standardized |

**CRITICAL ISSUE - SEC-1**: `notification.service.ts:63` makes unauthenticated HTTP call to venue-service:
```typescript
const response = await axios.get(
  `${venueServiceUrl}/api/v1/branding/${venueId}`,
  { timeout: 2000 }
);
```

### B. Service Boundary Check

| External Resource | Access Method | Status |
|-------------------|---------------|--------|
| `users` table | Direct DB query | **VIOLATION** - `base-event-handler.ts:39`, `campaign.service.ts:206` |
| `venues` table | Direct DB query | **VIOLATION** - `notification.service.ts:78` |
| `orders` table | Foreign key only | OK (FK exists for analytics) |
| `events` table | Foreign key only | OK (FK exists for analytics) |
| `tickets` table | Referenced in FK | OK (FK constraint) |

**CRITICAL ISSUE - SEC-2**: Direct database access to `users` and `venues` tables violates service boundaries.

### C. PII Protection

**Encryption Implementation** (`encryption.util.ts`):
- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 with 100,000 iterations
- IV: 16 bytes random per encryption
- Auth tag: 16 bytes GCM tag

**PII in Logs** (`request-logger.ts`):
- Sensitive fields redacted: `password`, `token`, `authorization`, `email`, `phone`, `address`, `creditCard`, etc.
- Headers redacted: `authorization`, `x-api-key`, `cookie`
- Recursive depth-limited redaction

**GDPR Compliance Features:**
- Data export (`gdpr.service.ts:19`)
- Data deletion/anonymization (`gdpr.service.ts:78`)
- Consent tracking with IP/UA (`consent_records` table)
- Deletion scheduling with grace period
- Audit trail logging

**Issues:**
- **ISSUE-PII1**: `engagement-tracking.service.ts:151` uses `JWT_SECRET` fallback `'secret'`
- **ISSUE-PII2**: Campaign service queries `users` table directly exposing emails

### D. Webhook Security

**SendGrid Webhook** (`webhook.controller.ts:87-129`):
- Signature verification: HMAC-SHA256
- Timestamp validation: 5-minute window
- Timing-safe comparison: Yes

**Twilio Webhook** (`webhook.controller.ts:132-174`):
- Signature verification: HMAC-SHA1 (Twilio standard)
- URL reconstruction for signature
- Timing-safe comparison: Yes

**Generic Webhook** (`webhook.controller.ts:215-251`):
- HMAC-SHA256 signature verification
- Timestamp validation: 5-minute window
- Per-provider secret configuration

**Issues:**
- **ISSUE-WH1**: SendGrid key can be empty (`SENDGRID_WEBHOOK_VERIFICATION_KEY || ''`)
- **ISSUE-WH2**: Twilio token can be empty (`TWILIO_AUTH_TOKEN || ''`)

### E. Email/SMS Provider Security

**SendGrid** (`email.provider.ts`):
- API key from env: Required in production, dev default allowed
- Rate limiting: Configurable per-user and global

**Twilio** (`sms.provider.ts`):
- Account SID + Auth Token from env
- Required in production, dev defaults allowed
- Messaging Service SID optional

**AWS SES** (`aws-ses.provider.ts`):
- Access key + Secret key from env
- Region configurable

**AWS SNS** (`aws-sns.provider.ts`):
- Access key + Secret key from env
- Sender ID: "TicketToken"

**Issues:**
- **ISSUE-PROV1**: Dev defaults allow empty credentials to pass
- **ISSUE-PROV2**: `@ts-nocheck` in AWS provider files bypasses type safety

---

## 4. NOTIFICATION PROVIDERS

### Email Providers

| Provider | Auth Method | Rate Limiting | Retry | Failover | Timeout |
|----------|-------------|---------------|-------|----------|---------|
| SendGrid | API Key | Per-user (20/hr), Global (1000/min) | 3 attempts | → AWS SES | 30s (configurable) |
| AWS SES | IAM credentials | Via AWS quotas | Provider-side | N/A | N/A |
| Mock | None | None | None | Dev only | N/A |

### SMS Providers

| Provider | Auth Method | Rate Limiting | Retry | Failover | Timeout |
|----------|-------------|---------------|-------|----------|---------|
| Twilio | Account SID + Auth Token | Per-user (5/hr), Global (100/min) | 3 attempts | → AWS SNS | 30s (configurable) |
| AWS SNS | IAM credentials | Via AWS quotas | Provider-side | N/A | N/A |
| Mock | None | None | None | Dev only | N/A |

### Provider Health & Failover (`provider-manager.service.ts`)

**Health Tracking:**
- Monitors 4 providers: SendGrid, AWS SES, Twilio, AWS SNS
- MAX_FAILURES threshold: 3 consecutive failures marks provider unhealthy
- Health check interval: 60 seconds
- Success resets failure count

**Automatic Failover:**
- Email: SendGrid → AWS SES
- SMS: Twilio → AWS SNS
- Logs failover events for monitoring

### Push Provider

| Provider | Auth Method | Rate Limiting | Retry | Failover |
|----------|-------------|---------------|-------|----------|
| Mock | None | Per-user (50/hr) | None | Dev only |

### Webhook Provider

| Feature | Implementation |
|---------|----------------|
| Delivery | HTTP POST with configurable timeout |
| Signature | HMAC-SHA256 |
| Retry | Configurable attempts |
| Deduplication | Idempotency support |

---

## 5. TEMPLATE SYSTEM

### Storage

| Method | Location | Caching |
|--------|----------|---------|
| Database | `notification_templates` table | Redis with TTL |
| Filesystem | `src/templates/email/*.hbs` | In-memory Map |

### Template Engine

- **Primary**: Handlebars.js
- **Custom Engine**: `template-engine.ts` with `{{variable}}` syntax

**Variable Interpolation:**
```typescript
// XSS Prevention
static escapeHtml(text: string): string {
  const htmlEscapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);
}
```

**XSS Prevention**: Enabled by default (`escapeHtml: true`)

### Localization (`i18n.service.ts`)

**Supported Languages:** 7 (en, es, fr, de, pt, zh, ja)

| Feature | Implementation |
|---------|----------------|
| Storage | `translations` table (tenant/language/key) |
| Caching | In-memory Map |
| Variable Interpolation | `{{variable}}` syntax |
| Date Formatting | `Intl.DateTimeFormat` per locale |
| Currency Formatting | `Intl.NumberFormat` per locale |
| Language Detection | Character set analysis |

**Security:** Uses parameterized queries - **NO SQL INJECTION RISK**

### Template Versioning

- `template_versions` table tracks all changes
- Version number increments on update
- Change summary field for audit

### Template File Count

| Channel | Template Files | Format |
|---------|---------------|--------|
| Email | 10 | Handlebars (.hbs) |
| SMS | 0 | None |

**Email Templates:**
- `order-confirmation.hbs` - Order confirmation with venue branding
- `ticket-purchased.hbs` - Ticket purchase confirmation
- `event-reminder.hbs` - Event reminder notification
- `payment-success.hbs` - Payment success notification
- `payment-failed.hbs` - Payment failure notification
- `refund-processed.hbs` - Refund confirmation
- `account-verification.hbs` - Account verification email
- `abandoned-cart.hbs` - Cart abandonment recovery
- `post-event-followup.hbs` - Post-event follow-up
- `newsletter.hbs` - Newsletter template

---

## 6. GDPR COMPLIANCE

### User Data Export (Article 15)

```typescript
async exportUserData(userId: string, requestedBy: string): Promise<{
  user_id: string;
  export_date: string;
  notifications: any[];
  notification_history: any[];
  consent_records: any[];
  preferences: any[];
  audit_trail: any[];
  data_size: any;
}>
```

- Decrypts encrypted PII for export
- Includes audit trail
- Logs export request

### Right to Erasure (Article 17)

**Hard Delete:**
```typescript
await dataRetentionService.deleteUserData(userId, requestedBy);
```

**Anonymization (Recommended):**
```typescript
await db('notification_history')
  .where('recipient_id', userId)
  .update({
    recipient_email: null,
    recipient_email_encrypted: null,
    recipient_email_hash: null,
    recipient_phone: null,
    recipient_phone_encrypted: null,
    recipient_phone_hash: null,
    recipient_name: 'ANONYMIZED',
    anonymized_at: new Date(),
  });
```

### Consent Tracking

- Channel-specific consent (email, SMS, push)
- Type-specific consent (transactional, marketing, system)
- IP address and user agent recorded
- Timestamp for granted/revoked

### Data Retention Policies

| Data Type | Retention | Action |
|-----------|-----------|--------|
| Notifications | 90 days | Delete |
| Notification History | 90 days | Delete |
| Webhook Events | 90 days | Delete |
| Audit Logs | 365 days | Delete (non-critical only) |

**Automated Cleanup**: Daily cron job at 2 AM

---

## 7. MARKETING CAMPAIGNS

### Campaign Creation

```typescript
async createCampaign(campaign: {
  venueId: string;
  name: string;
  templateId: string;
  segmentId?: string;
  audienceFilter?: any;
  scheduledFor?: Date;
  type?: 'transactional' | 'marketing' | 'system';
  channel?: 'email' | 'sms' | 'push' | 'webhook';
})
```

### User Segmentation

- Dynamic segments with filter criteria
- Criteria support: `hasTickets`, `hasPurchasedInLast30Days`, `totalSpentGreaterThan`, `emailEnabled`
- Member count auto-calculated
- Refresh on demand

**SECURITY ISSUE - SEG-1**: Segmentation queries `users` table directly, violating service boundaries.

### A/B Testing

- Subject line, content, send time, from name variants
- Sample size per variant
- Winning metrics: open_rate, click_rate, conversion_rate
- Automatic winner determination

### Unsubscribe Handling

- Unique unsubscribe token per user
- One-click unsubscribe link generation
- Updates all channel preferences to disabled

---

## 8. RATE LIMITING & SPAM PREVENTION

### Rate Limiting Configuration

| Type | Limit | Window |
|------|-------|--------|
| `email:user` | 20 | 1 hour |
| `sms:user` | 5 | 1 hour |
| `push:user` | 50 | 1 hour |
| `email:global` | 1000 | 1 minute |
| `sms:global` | 100 | 1 minute |
| `api:send` | 100 | 1 minute |
| `api:preferences` | 50 | 1 minute |

### Implementation

- Redis sorted set for sliding window
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response with `Retry-After` header

### Spam Detection

**Scoring System:**
- High-risk words: +3 points (viagra, pills, get rich, etc.)
- Medium-risk words: +2 points (free, urgent, act now, etc.)
- Low-risk words: +1 point each (>3 trigger penalty)
- Excessive caps (>30%): +3 points
- Excessive exclamation (>5): +2 points
- Too many links (>10): +3 points
- URL shorteners: +2 points
- Image-heavy with little text: +2 points
- All-caps subject: +2 points

**Threshold**: Score > 5 fails spam check

### Suppression Lists

- `suppression_list` table with hashed identifiers
- Per-channel suppression
- Expiration support
- Reasons tracked (bounce, complaint, manual)

---

## 9. EVENT HANDLERS

### RabbitMQ Events Consumed

| Routing Key | Handler | Description |
|-------------|---------|-------------|
| `payment.completed` | `handlePaymentCompleted` | Purchase confirmation |
| `payment.succeeded` | `PaymentEventHandler` | Payment success notification |
| `payment.failed` | `PaymentEventHandler` | Payment failure notification |
| `refund.processed` | `PaymentEventHandler` | Refund notification |
| `dispute.created` | `PaymentEventHandler` | Dispute alert to CS team |
| `ticket.transferred` | `handleTicketTransferred` | Transfer notifications to both parties |
| `event.reminder` | `handleEventReminder` | Event reminder to ticket holders |
| `event.cancelled` | `handleEventCancelled` | Cancellation to all affected |
| `user.registered` | `handleUserRegistered` | Welcome email |
| `user.password_reset` | `handlePasswordReset` | Password reset email |

### Processing Pattern

```typescript
async handleEvent(msg: ConsumeMessage): Promise<void> {
  try {
    const routingKey = msg.fields.routingKey;
    const event = JSON.parse(msg.content.toString());
    // Process based on routing key
  } catch (error) {
    throw error; // Causes message to be requeued
  }
}
```

### Error Handling

- Errors thrown cause message requeue
- Logging with event context
- Payment events have fallback user data

### Idempotency

- `idempotency.ts` middleware available
- `webhook-dedup.ts` for webhook idempotency
- `event-idempotency.ts` for RabbitMQ event deduplication

### Event Idempotency (`event-idempotency.ts`)

**AUDIT FIX EVT-1:** Prevents duplicate notifications from replayed RabbitMQ events.

| Feature | Implementation |
|---------|----------------|
| Storage | Redis (primary) + Memory (fallback) |
| TTL | 24 hours |
| Key Format | `{eventType}:{correlationId}:{userId}` |
| Functions | `checkAndMarkEvent()`, `withEventIdempotency()` |

### Webhook Deduplication (`webhook-dedup.ts`)

**AUDIT FIX IDP-1, IDP-2:** Tracks webhook events by provider ID.

| Feature | Implementation |
|---------|----------------|
| Storage | Redis → Memory → Database (3-tier fallback) |
| TTL | 7 days |
| Providers | SendGrid (`sg_event_id`/`sg_message_id`), Twilio (`MessageSid:status`) |

---

## 9.5 FAULT TOLERANCE UTILITIES

### Circuit Breaker (`circuit-breaker.ts`)

**Pattern:** Standard circuit breaker with three states.

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation, count failures |
| OPEN | Reject requests, wait for timeout |
| HALF_OPEN | Allow test requests, reset on success |

**Configuration:**
- Failure threshold: 5 (opens circuit)
- Success threshold: 2 (closes from half-open)
- Timeout: 60 seconds (before recovery attempt)
- Monitoring period: 2 minutes

**Metrics:**
- `circuit_breaker_open_total{circuit_name}`
- `circuit_breaker_success_total{circuit_name, state}`
- `circuit_breaker_failure_total{circuit_name, state}`
- `circuit_breaker_state{circuit_name}` (gauge: 0=CLOSED, 1=HALF_OPEN, 2=OPEN)

### Graceful Degradation (`graceful-degradation.ts`)

**Degradation Modes:**

| Mode | Condition | HTTP Status | Behavior |
|------|-----------|-------------|----------|
| NORMAL | All services healthy | 200 | Normal operation |
| PARTIAL | One provider down | 200 | Use alternative channel |
| DEGRADED | Redis or both providers down | 202 | Queue non-critical, process critical only |
| CRITICAL | Database down | 503 | Queue everything except high priority |

**Fallback Strategy:**
- Email unavailable → Try SMS
- SMS unavailable → Try Email
- Both unavailable → Queue for later

**Metrics:**
- `degradation_mode{mode}` (gauge)
- `degradation_mode_changes_total{from, to}`
- `fallback_channel_used_total{from, to}`
- `notifications_queued_due_to_degradation_total{channel}`

### Distributed Lock (`distributed-lock.ts`)

**AUDIT FIX CONC-M1, CONC-M2:** Redis-based distributed locking.

| Feature | Implementation |
|---------|----------------|
| Algorithm | SET NX PX (atomic) |
| TTL | 30 seconds (configurable) |
| Retry | 3 attempts, 100ms delay |
| Release | Lua script (atomic check-and-delete) |
| Extend | Lua script (atomic owner check) |

```typescript
await withLock('resource-name', async () => {
  // Protected operation
}, { ttlMs: 30000 });
```

---

## 10. BACKGROUND JOBS

### Bull Queue Configuration (`queue.service.ts`)

| Queue | Purpose | Attempts | Backoff |
|-------|---------|----------|---------|
| `notifications` | Standard notifications | 3 | Exponential (1s base) |
| `batch-notifications` | Batch sends | 3 | Exponential |
| `webhook-processing` | Webhook delivery | 3 | Exponential |
| `retry-notifications` | Failed notification retry | 3 | 60s delay |
| `dead-letter` | Failed after all retries | - | - |

### Priority Queue System (`queue-manager.service.ts`)

| Priority | Queue Name | Concurrency | Max Delay |
|----------|------------|-------------|-----------|
| CRITICAL | `critical-notifications` | 10 | 30s |
| HIGH | `high-notifications` | 5 | 5 min |
| NORMAL | `normal-notifications` | 3 | 30 min |
| BULK | `bulk-notifications` | 1 | 4 hours |

### Scheduler Service (`scheduler.service.ts`)

- Cron-based scheduling for recurring notifications
- One-time scheduled sends
- Integration with priority queue system

### Data Retention Job

| Job | Schedule | Description |
|-----|----------|-------------|
| `DataRetentionJob` | Daily 2 AM | Cleanup old data per retention policies |

```typescript
cron.schedule('0 2 * * *', async () => {
  const results = await dataRetentionService.runCleanup();
});
```

### Notification Orchestrator (`notification-orchestrator.ts`)

**Background Jobs:**
| Interval | Job | Description |
|----------|-----|-------------|
| 1 hour | Abandoned Carts | Check for carts >1 hour old |
| 24 hours | Re-engagement | Check for inactive users |
| 24 hours | Daily Analytics | Generate per-venue analytics |

**Security Note:** No S2S auth issues found - uses internal services only.

### Campaign Jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| Abandoned Cart Processing | Hourly | Find carts >1 hour old, send recovery |
| Segment Refresh | On-demand | Recalculate segment member counts |
| Daily Analytics | Daily | Aggregate metrics per venue |

---

## 11. METRICS & ANALYTICS

### Prometheus Metrics

**Counters:**
- `notification_sent_total{channel, type, status, provider}`
- `notification_delivery_total{channel, status, provider}`
- `notification_errors_total{error_type, provider, channel}`
- `webhook_received_total{provider, event_type}`
- `api_requests_total{endpoint, method, status_code}`

**Gauges:**
- `notification_queue_depth{queue_type}`
- `active_connections`
- `provider_status{provider_name, provider_type}`

**Histograms:**
- `notification_send_duration_seconds{channel, provider, type}`
- `template_render_duration_seconds{template_name, channel}`
- `api_request_duration_seconds{endpoint, method, status_code}`
- `provider_response_time_seconds{provider_name, provider_type, operation}`

**Summaries:**
- `notification_batch_size{channel}`

### Open/Click Tracking

**Tracking Pixel:**
```typescript
generateTrackingPixel(notificationId: string): string {
  const token = this.generateTrackingToken(notificationId, 'open');
  return `<img src="${process.env.API_URL}/track/open/${token}" ... />`;
}
```

**Link Wrapping:**
```typescript
wrapLinksForTracking(html: string, notificationId: string): string {
  return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, ...);
}
```

### Delivery Success Rates

Tracked in:
- `notification_delivery_stats` - Daily aggregates
- `notification_analytics` - Hourly aggregates
- `notification_analytics_daily` - Per-venue daily stats

---

## 12. CODE QUALITY

### TODO/FIXME Comments

**None found** - Clean codebase

### `any` Type Usage

**196 occurrences across 62 files**

High-usage files:
- `campaign.service.ts`: 10 occurrences
- `automation.service.ts`: 14 occurrences
- `template.routes.ts`: 8 occurrences
- `response-filter.ts`: 7 occurrences
- `gdpr.service.ts`: 7 occurrences

### Error Handling

- Custom error classes in `errors/index.ts`
- Error middleware with structured responses
- Logger captures error context
- Graceful degradation utils available

### Dependencies

**Production (30+):**
- `fastify`, `@fastify/*` - HTTP framework
- `@sendgrid/mail` - Email provider
- `twilio` - SMS provider
- `aws-sdk` - AWS services
- `handlebars` - Template engine
- `bull` - Job queue
- `ioredis` - Redis client
- `knex`, `pg` - PostgreSQL
- `mongoose` - MongoDB
- `prom-client` - Metrics
- `winston` - Logging

**Dev Dependencies:**
- `jest`, `ts-jest` - Testing
- `typescript` - Language
- `eslint` - Linting

### Test Coverage

37 test files covering:
- Unit tests for utils, config, middleware, services
- Integration tests for HMAC authentication
- Shared client usage tests

---

## 13. COMPARISON TO PREVIOUS AUDITS

### Alignment with Platform Standards

| Standard | Status | Notes |
|----------|--------|-------|
| HMAC-SHA256 S2S Auth | **Partial** | Shared clients use HMAC, but axios call to venue-service missing |
| PII Encryption | **Implemented** | AES-256-GCM with proper key derivation |
| Request Logging | **Implemented** | With PII redaction |
| Health Endpoints | **Implemented** | All Kubernetes probes present |
| Metrics | **Implemented** | Prometheus format |
| Rate Limiting | **Implemented** | Redis-based sliding window |

### Unique Strengths

1. Comprehensive GDPR compliance features
2. **Multi-provider failover** with health monitoring (SendGrid→AWS SES, Twilio→AWS SNS)
3. **Circuit breaker pattern** for fault tolerance
4. **Graceful degradation** with 4 operational modes
5. **Event idempotency** prevents duplicate notifications
6. **Webhook deduplication** with 3-tier fallback (Redis→Memory→DB)
7. Sophisticated spam scoring
8. A/B testing infrastructure
9. Engagement tracking with HMAC-signed tokens
10. **Distributed locking** for concurrency control
11. **Priority-based queue system** (CRITICAL/HIGH/NORMAL/BULK)
12. **i18n support** for 7 languages with no SQL injection

---

## FINAL SUMMARY

### CRITICAL ISSUES

| ID | Issue | File | Line | Impact |
|----|-------|------|------|--------|
| SEC-1 | Unauthenticated HTTP call to venue-service | `notification.service.ts` | 63 | Authentication bypass |
| SEC-2 | Direct DB access to `users` table | `base-event-handler.ts`, `campaign.service.ts` | Multiple | Service boundary violation |
| SEG-1 | Segmentation queries `users` table directly | `campaign.service.ts` | 206 | Service boundary violation |

### HIGH PRIORITY

| ID | Issue | File | Line | Impact |
|----|-------|------|------|--------|
| WH-1 | Webhook secrets can be empty | `webhook.controller.ts` | - | Webhook bypass in production |
| PII-1 | JWT_SECRET fallback to 'secret' | `engagement-tracking.service.ts` | - | Token forgery |
| PII-2 | JWT_SECRET fallback to 'secret' | `wallet-pass.service.ts` | 193 | QR code signature forgery |
| DB-1 | Foreign keys to external tables | Migration | - | Schema coupling |
| PROV-1 | `@ts-nocheck` in AWS providers | `aws-ses.provider.ts`, `aws-sns.provider.ts` | - | Type safety bypass |

### MEDIUM PRIORITY

| ID | Issue | Impact |
|----|-------|--------|
| TYPE-1 | 196 `any` type usages | Reduced type safety |
| DB-2 | Duplicate PII fields (plain + encrypted) | Storage overhead |

**RESOLVED:**
- ~~PROV-2: No provider failover~~ → Implemented in `provider-manager.service.ts`

### GDPR COMPLIANCE

| Requirement | Status |
|-------------|--------|
| Right to Access | **Compliant** - Full data export |
| Right to Erasure | **Compliant** - Hard delete + anonymization |
| Consent Tracking | **Compliant** - Per-channel/type with audit |
| Data Portability | **Compliant** - Structured export format |
| Retention Policies | **Compliant** - Automated cleanup |
| Encryption at Rest | **Compliant** - AES-256-GCM for PII |

### PROVIDER SECURITY

| Provider | Authentication | Rate Limiting | Signature Verification | Timeout | Failover |
|----------|----------------|---------------|------------------------|---------|----------|
| SendGrid | API Key (required in prod) | Yes | Yes (HMAC-SHA256) | 30s | → AWS SES |
| Twilio | SID + Token (required in prod) | Yes | Yes (HMAC-SHA1) | 30s | → AWS SNS |
| AWS SES | IAM credentials | Via AWS | N/A | N/A | Primary backup |
| AWS SNS | IAM credentials | Via AWS | N/A | N/A | Primary backup |

---

**Files Analyzed:** 100+ TypeScript files, 10 templates
**Critical Issues:** 3
**High Priority:** 5
**Medium Priority:** 2
**GDPR Compliant:** Yes
**Provider Security:** Good (with noted issues)
**Fault Tolerance:** Excellent (circuit breaker, graceful degradation, distributed locking)

**Overall Assessment:** The notification-service has comprehensive GDPR compliance, well-implemented provider integrations, and **excellent fault tolerance patterns**. The service includes circuit breakers, graceful degradation with 4 operational modes, distributed locking, and multi-tier idempotency. Critical issues center on service boundary violations (direct database access to external tables) and one unauthenticated service call. Two additional high-priority `JWT_SECRET` fallback issues were identified in `wallet-pass.service.ts`. The webhook verification and encryption implementations are solid. Provider failover is now properly implemented. Type safety could be improved by reducing `any` usage.

---

## APPENDIX: FAULT TOLERANCE SUMMARY

| Component | Pattern | Status |
|-----------|---------|--------|
| Provider Health | Health monitoring + auto-failover | ✅ Implemented |
| Circuit Breaker | 3-state (CLOSED/OPEN/HALF_OPEN) | ✅ Implemented |
| Graceful Degradation | 4-mode (NORMAL/PARTIAL/DEGRADED/CRITICAL) | ✅ Implemented |
| Distributed Locking | Redis-based with Lua scripts | ✅ Implemented |
| Event Idempotency | Redis + memory fallback | ✅ Implemented |
| Webhook Deduplication | Redis + memory + DB fallback | ✅ Implemented |
| Request Timeout | Configurable per-provider (30s default) | ✅ Implemented |
| Retry Logic | Exponential backoff | ✅ Implemented |
| Dead Letter Queue | Bull queue for failed jobs | ✅ Implemented |
| Priority Queues | 4-tier priority system | ✅ Implemented |
