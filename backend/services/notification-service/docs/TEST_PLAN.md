---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~800 | High |
| Integration Tests | ~500 | High |
| E2E Tests | ~15 | Medium |
| **Total** | **~1315** | |

---

## Critical Issues to Address

Before testing, these critical issues should be resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| 9 missing utils files (date.util, email.util, hash.util, jwt.util, phone.util, sanitize.util, template.util, url.util, validation.util) | 🟠 Medium | May need to create or locate these utilities |
| SQL injection vulnerability in `delivery-metrics.service.ts` (period/metric params) | 🔴 Critical | Security fix validated by tests |
| Multiple database connection patterns (Knex vs raw pg) | 🟠 Medium | Mock setup complexity |
| Encryption key rotation not fully implemented | 🟡 Low | Key rotation tests may be incomplete |
| Some providers use mock mode in production code | 🟡 Low | Need clear test/prod separation |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Main Bootstrap

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should start service successfully` | Full bootstrap sequence completes |
| 🔗 Integration | `should connect to PostgreSQL` | Database connection established |
| 🔗 Integration | `should connect to Redis` | Redis connection established |
| 🔗 Integration | `should connect to RabbitMQ` | RabbitMQ connection established |
| 🔗 Integration | `should connect to MongoDB` | MongoDB connection established |
| 🔗 Integration | `should initialize queues (Bull)` | Queue system starts |
| 🔗 Integration | `should load templates on startup` | Handlebars templates loaded |
| 🔗 Integration | `should handle graceful shutdown on SIGTERM` | Clean shutdown |
| 🔗 Integration | `should handle graceful shutdown on SIGINT` | Clean shutdown |
| 🔗 Integration | `should exit with code 1 on startup failure` | Error handling |

---

### 2. Configuration Files

#### `src/config/database.ts` - Database Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should build connection config from env variables` | Config building |
| 🧪 Unit | `should use default values when env vars missing` | Defaults |
| 🧪 Unit | `should set correct pool size from POSTGRES_POOL_SIZE` | Pool config |
| 🧪 Unit | `should enable SSL when POSTGRES_SSL=true` | SSL config |
| 🧪 Unit | `should disable SSL when POSTGRES_SSL=false` | SSL config |
| 🧪 Unit | `should set connection timeout from POSTGRES_CONNECTION_TIMEOUT` | Timeout |
| 🧪 Unit | `should throw error when required vars missing (host/database/user)` | Validation |
| 🧪 Unit | `should format connection string correctly` | Connection string |
| 🔗 Integration | `should connect successfully with valid config` | Connection test |
| 🔗 Integration | `should throw error with invalid credentials` | Error handling |
| 🔗 Integration | `should handle connection timeout` | Timeout handling |
| 🔗 Integration | `should reconnect after connection loss` | Reconnection |
| 🔗 Integration | `should respect pool size limits` | Pool behavior |

#### `src/config/redis.ts` - Redis Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should build config from env variables` | Config building |
| 🧪 Unit | `should use default host/port when not provided` | Defaults |
| 🧪 Unit | `should include password when REDIS_PASSWORD set` | Password config |
| 🧪 Unit | `should omit password when REDIS_PASSWORD not set` | Password config |
| 🧪 Unit | `should set correct retry strategy` | Retry strategy |
| 🧪 Unit | `should set key prefix from SERVICE_NAME` | Key prefix |
| 🔗 Integration | `should connect successfully with valid config` | Connection test |
| 🔗 Integration | `should throw error with invalid host` | Error handling |
| 🔗 Integration | `should retry connection on failure (exponential backoff)` | Retry behavior |
| 🔗 Integration | `should respect max retry attempts` | Retry limits |
| 🔗 Integration | `should handle connection timeout` | Timeout handling |
| 🔗 Integration | `should disconnect cleanly` | Disconnection |

#### `src/config/rabbitmq.ts` - RabbitMQ Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should build AMQP URL from env variables` | URL building |
| 🧪 Unit | `should use default values when env not set` | Defaults |
| 🧪 Unit | `should include credentials when provided` | Credentials |
| 🧪 Unit | `should omit credentials when not provided` | Credentials |
| 🧪 Unit | `should use correct vhost` | Vhost config |
| 🔗 Integration | `should connect successfully with valid config` | Connection test |
| 🔗 Integration | `should throw error with invalid credentials` | Error handling |
| 🔗 Integration | `should create channel successfully` | Channel creation |
| 🔗 Integration | `should handle connection loss and reconnect` | Reconnection |
| 🔗 Integration | `should respect heartbeat interval` | Heartbeat |
| 🔗 Integration | `should create exchange on connect` | Exchange setup |
| 🔗 Integration | `should create queue on connect` | Queue setup |
| 🔗 Integration | `should bind queue to exchange` | Binding |

#### `src/config/mongodb.ts` - MongoDB Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should build connection string from env` | Connection string |
| 🧪 Unit | `should use default values when env not set` | Defaults |
| 🧪 Unit | `should include replica set when MONGODB_REPLICA_SET provided` | Replica set |
| 🧪 Unit | `should omit replica set when not provided` | Replica set |
| 🔗 Integration | `should connect successfully with valid config` | Connection test |
| 🔗 Integration | `should throw error with invalid credentials` | Error handling |
| 🔗 Integration | `should handle connection timeout` | Timeout handling |
| 🔗 Integration | `should reconnect after connection loss` | Reconnection |
| 🔗 Integration | `should create indexes on connect` | Index creation |
| 🔗 Integration | `should validate TTL index creation (90 days)` | TTL index |

#### `src/config/env.ts` - Environment Parser

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `parseBoolean should return true for "true"` | Boolean parsing |
| 🧪 Unit | `parseBoolean should return true for "1"` | Boolean parsing |
| 🧪 Unit | `parseBoolean should return false for "false"` | Boolean parsing |
| 🧪 Unit | `parseBoolean should return false for "0"` | Boolean parsing |
| 🧪 Unit | `parseBoolean should return default for invalid value` | Default handling |
| 🧪 Unit | `parseBoolean should be case insensitive` | Case handling |
| 🧪 Unit | `parseNumber should parse valid integer` | Number parsing |
| 🧪 Unit | `parseNumber should parse valid float` | Number parsing |
| 🧪 Unit | `parseNumber should return default for NaN` | Default handling |
| 🧪 Unit | `parseNumber should return default for empty string` | Default handling |
| 🧪 Unit | `parseNumber should handle negative numbers` | Negative numbers |
| 🧪 Unit | `parseArray should parse comma-separated values` | Array parsing |
| 🧪 Unit | `parseArray should trim whitespace` | Whitespace handling |
| 🧪 Unit | `parseArray should return empty array for empty string` | Empty handling |
| 🧪 Unit | `parseArray should handle single value` | Single value |
| 🧪 Unit | `requireEnv should return value when env var set` | Required env |
| 🧪 Unit | `requireEnv should throw error when env var missing` | Error handling |
| 🧪 Unit | `requireEnv should include variable name in error message` | Error message |
| 🧪 Unit | `env object should parse NODE_ENV correctly` | Env parsing |
| 🧪 Unit | `env object should parse all database config vars` | Database config |
| 🧪 Unit | `env object should parse all Redis config vars` | Redis config |
| 🧪 Unit | `env object should parse all RabbitMQ config vars` | RabbitMQ config |
| 🧪 Unit | `env object should parse all provider config vars (SendGrid, Twilio, AWS)` | Provider config |
| 🧪 Unit | `env object should parse rate limit config` | Rate limit config |
| 🧪 Unit | `env object should parse retry config` | Retry config |
| 🧪 Unit | `env object should parse encryption config` | Encryption config |
| 🧪 Unit | `env object should set correct defaults` | Defaults |

#### `src/config/logger.ts` - Logger Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create Winston logger with correct level` | Logger creation |
| 🧪 Unit | `should use info level by default` | Default level |
| 🧪 Unit | `should respect LOG_LEVEL env var` | Env override |
| 🧪 Unit | `should use JSON format in production` | Format selection |
| 🧪 Unit | `should use pretty format in development` | Format selection |
| 🧪 Unit | `should include timestamp in logs` | Timestamp |
| 🧪 Unit | `should include service name in metadata` | Service metadata |
| 🧪 Unit | `should include environment in metadata` | Environment metadata |
| 🧪 Unit | `should handle exceptions` | Exception handling |
| 🧪 Unit | `should handle unhandled promise rejections` | Rejection handling |
| 🔗 Integration | `should log to console transport` | Transport test |
| 🔗 Integration | `should filter logs by level` | Level filtering |
| 🔗 Integration | `should format error stack traces` | Stack traces |
| 🔗 Integration | `should include metadata in log output` | Metadata output |
| 🔗 Integration | `should not exit on error (exitOnError: false)` | Error behavior |

#### `src/config/validate.ts` - Configuration Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isValidUrl should accept valid HTTP URL` | URL validation |
| 🧪 Unit | `isValidUrl should accept valid HTTPS URL` | URL validation |
| 🧪 Unit | `isValidUrl should reject invalid URL format` | URL validation |
| 🧪 Unit | `isValidUrl should reject non-HTTP/HTTPS protocols` | URL validation |
| 🧪 Unit | `isValidUrl should reject empty string` | URL validation |
| 🧪 Unit | `isValidUrl should reject null/undefined` | URL validation |
| 🧪 Unit | `isValidEmail should accept valid email` | Email validation |
| 🧪 Unit | `isValidEmail should reject invalid email (no @)` | Email validation |
| 🧪 Unit | `isValidEmail should reject invalid email (no domain)` | Email validation |
| 🧪 Unit | `isValidEmail should reject empty string` | Email validation |
| 🧪 Unit | `isValidPort should accept port 1-65535` | Port validation |
| 🧪 Unit | `isValidPort should reject port < 1` | Port validation |
| 🧪 Unit | `isValidPort should reject port > 65535` | Port validation |
| 🧪 Unit | `isValidPort should reject non-numeric value` | Port validation |
| 🧪 Unit | `isProductionReady should return true when all required configs set` | Production check |
| 🧪 Unit | `isProductionReady should return false when ENCRYPTION_MASTER_KEY missing` | Production check |
| 🧪 Unit | `isProductionReady should return false when JWT_SECRET missing` | Production check |
| 🧪 Unit | `isProductionReady should return false when provider API keys missing` | Production check |
| 🧪 Unit | `isProductionReady should warn about missing optional configs` | Warnings |
| 🧪 Unit | `validateDatabaseConfig should pass with complete config` | Database validation |
| 🧪 Unit | `validateDatabaseConfig should fail when POSTGRES_HOST missing` | Database validation |
| 🧪 Unit | `validateDatabaseConfig should fail when POSTGRES_DATABASE missing` | Database validation |
| 🧪 Unit | `validateDatabaseConfig should validate pool size range` | Database validation |
| 🧪 Unit | `validateRedisConfig should pass with complete config` | Redis validation |
| 🧪 Unit | `validateRedisConfig should validate port range` | Redis validation |
| 🧪 Unit | `validateRedisConfig should warn when password missing` | Redis validation |
| 🧪 Unit | `validateRabbitMQConfig should pass with complete config` | RabbitMQ validation |
| 🧪 Unit | `validateRabbitMQConfig should validate port range` | RabbitMQ validation |
| 🧪 Unit | `validateRabbitMQConfig should validate vhost format` | RabbitMQ validation |
| 🧪 Unit | `validateProviderConfig should pass when SendGrid API key set` | Provider validation |
| 🧪 Unit | `validateProviderConfig should pass when Twilio credentials set` | Provider validation |
| 🧪 Unit | `validateProviderConfig should warn when all providers disabled` | Provider validation |

#### `src/config/rate-limits.ts` - Rate Limit Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `shouldBypassRateLimit should return true for /health endpoint` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should return true for /metrics endpoint` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should return true for trusted IPs (127.0.0.1, ::1)` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should return true when X-Bypass-Rate-Limit header present and valid` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should return false for normal requests` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should return false for invalid bypass token` | Bypass logic |
| 🧪 Unit | `shouldBypassRateLimit should validate HMAC signature for bypass token` | Signature validation |
| 🧪 Unit | `getRateLimitConfig should return correct limits for /api/notifications/send` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return correct limits for /api/notifications/send-batch` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return stricter limits for SMS endpoints` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return default config for unknown routes` | Fallback |

#### `src/config/providers.ts` - Provider Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should select correct email provider based on NOTIFICATION_MODE` | Provider selection |
| 🧪 Unit | `should select correct SMS provider based on NOTIFICATION_MODE` | Provider selection |
| 🧪 Unit | `should use mock providers when NOTIFICATION_MODE=test` | Mock mode |
| 🧪 Unit | `should use production providers when NOTIFICATION_MODE=production` | Production mode |
| 🧪 Unit | `should validate SendGrid API key format (SG.)` | Key validation |
| 🧪 Unit | `should validate Twilio credentials format (AC/SK)` | Key validation |
| 🧪 Unit | `should validate AWS credentials format (AKIA)` | Key validation |
| 🧪 Unit | `should throw error when production mode but API keys missing` | Error handling |

---

### 3. Controllers

#### `src/controllers/notification.controller.ts` - Notification API

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `send should validate request body` | Input validation |
| 🧪 Unit | `send should call notificationService.send()` | Service call |
| 🧪 Unit | `send should return 200 with notification ID` | Response format |
| 🧪 Unit | `send should return 400 for invalid request` | Error handling |
| 🧪 Unit | `send should return 429 when rate limited` | Rate limiting |
| 🧪 Unit | `send should handle service errors` | Error handling |
| 🧪 Unit | `sendBatch should validate batch request` | Input validation |
| 🧪 Unit | `sendBatch should process all notifications` | Batch processing |
| 🧪 Unit | `sendBatch should aggregate results (success/failure counts)` | Result aggregation |
| 🧪 Unit | `sendBatch should return batch summary` | Response format |
| 🧪 Unit | `sendBatch should handle partial failures` | Error handling |
| 🧪 Unit | `sendBatch should limit batch size (max 1000)` | Size validation |
| 🧪 Unit | `getStatus should return notification status` | Status retrieval |
| 🧪 Unit | `getStatus should return 404 for non-existent notification` | Error handling |
| 🧪 Unit | `getStatus should include delivery details` | Response completeness |
| 🔗 Integration | `should send email notification end-to-end` | Full workflow |
| 🔗 Integration | `should send SMS notification end-to-end` | Full workflow |
| 🔗 Integration | `should send batch notifications` | Batch workflow |
| 🔗 Integration | `should check notification status from database` | Database query |
| 🔗 Integration | `should track metrics on send` | Metrics tracking |
| 🔗 Integration | `should log audit trail` | Audit logging |
| 🔗 Integration | `should enforce consent for marketing` | Compliance check |
| 🔗 Integration | `should bypass consent for transactional` | Compliance check |
| 🔗 Integration | `should respect suppression list` | Compliance check |
| 🔗 Integration | `should handle provider failures gracefully` | Error handling |

#### `src/controllers/webhook.controller.ts` - Webhook Handlers (AUDIT FIX WH-1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `mapSendGridStatus should map "delivered" to "delivered"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "bounce" to "bounced"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "dropped" to "failed"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "deferred" to "pending"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "processed" to "sent"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "open" to "sent"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map "click" to "sent"` | Status mapping |
| 🧪 Unit | `mapSendGridStatus should map unknown status to "failed"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "delivered" to "delivered"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "sent" to "sent"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "failed" to "failed"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "undelivered" to "bounced"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "queued" to "queued"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map unknown status to "failed"` | Status mapping |
| 🧪 Unit | `handleSendGridWebhook should process delivered event` | Event processing |
| 🧪 Unit | `handleSendGridWebhook should process bounce event` | Event processing |
| 🧪 Unit | `handleSendGridWebhook should process open event` | Event processing |
| 🧪 Unit | `handleSendGridWebhook should process click event` | Event processing |
| 🧪 Unit | `handleSendGridWebhook should update notification status in database` | Database update |
| 🧪 Unit | `handleSendGridWebhook should track metrics` | Metrics tracking |
| 🧪 Unit | `handleSendGridWebhook should handle missing notification ID` | Error handling |
| 🧪 Unit | `handleSendGridWebhook should handle batch events` | Batch processing |
| 🧪 Unit | `handleTwilioWebhook should process MessageStatus event` | Event processing |
| 🧪 Unit | `handleTwilioWebhook should update SMS delivery status` | Status update |
| 🧪 Unit | `handleTwilioWebhook should track metrics` | Metrics tracking |
| 🧪 Unit | `handleTwilioWebhook should handle missing MessageSid` | Error handling |
| 🧪 Unit | `handleGenericWebhook should store webhook payload` | Payload storage |
| 🧪 Unit | `handleGenericWebhook should return 200 OK` | Response |
| 🔗 Integration | `should verify SendGrid signature (valid)` | Signature verification |
| 🔗 Integration | `should reject SendGrid webhook with invalid signature` | Security check |
| 🔗 Integration | `should verify Twilio signature (valid)` | Signature verification |
| 🔗 Integration | `should reject Twilio webhook with invalid signature` | Security check |
| 🔗 Integration | `should update notification_history on delivery` | Database update |
| 🔗 Integration | `should increment Prometheus metrics` | Metrics update |
| 🔗 Integration | `should log webhook received in audit log` | Audit logging |
| 🔗 Integration | `should handle concurrent webhooks for same notification` | Concurrency |

#### `src/controllers/marketing.controller.ts` - Marketing Operations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createCampaign should validate request body` | Input validation |
| 🧪 Unit | `updateCampaign should call service method` | Service call |
| 🧪 Unit | `deleteCampaign should soft delete campaign` | Deletion logic |
| 🧪 Unit | `getCampaign should return campaign details` | Data retrieval |
| 🧪 Unit | `getCampaigns should return paginated list` | Pagination |
| 🧪 Unit | `publishCampaign should change status to active` | Status update |
| 🧪 Unit | `pauseCampaign should change status to paused` | Status update |
| 🧪 Unit | `createABTest should create test with variants` | A/B test creation |
| 🧪 Unit | `getABTestResults should return variant metrics` | Metrics retrieval |
| 🧪 Unit | `declareWinner should set winner variant` | Winner declaration |
| 🧪 Unit | `trackImpression should increment impression count` | Metric tracking |
| 🧪 Unit | `trackClick should increment click count` | Metric tracking |
| 🧪 Unit | `trackConversion should increment conversion and revenue` | Metric tracking |
| 🧪 Unit | `getPerformanceMetrics should return campaign stats` | Stats retrieval |
| 🧪 Unit | `should handle MongoDB errors gracefully` | Error handling |
| 🔗 Integration | `should create campaign in MongoDB` | Database operation |
| 🔗 Integration | `should publish campaign and send notifications` | Full workflow |
| 🔗 Integration | `should track A/B test metrics` | Metrics tracking |
| 🔗 Integration | `should declare winner based on performance` | Winner logic |
| 🔗 Integration | `should retrieve campaign performance metrics` | Stats query |
| 🔗 Integration | `should update campaign with TTL index (90 days)` | TTL behavior |
| 🔗 Integration | `should list campaigns with filtering` | Query filtering |
| 🔗 Integration | `should handle concurrent metric updates` | Concurrency |
| 🔗 Integration | `should validate campaign budget constraints` | Budget validation |
| 🔗 Integration | `should archive old campaigns` | Archival logic |

#### `src/controllers/consent.controller.ts` - Consent Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `grantConsent should validate consent request` | Input validation |
| 🧪 Unit | `grantConsent should call consentModel.create()` | Model call |
| 🧪 Unit | `grantConsent should return 201 with consent record` | Response format |
| 🧪 Unit | `grantConsent should log audit trail` | Audit logging |
| 🧪 Unit | `revokeConsent should call consentModel.revoke()` | Model call |
| 🧪 Unit | `revokeConsent should return 200 on success` | Response format |
| 🧪 Unit | `revokeConsent should log audit trail` | Audit logging |
| 🧪 Unit | `checkConsent should return consent status` | Status retrieval |
| 🧪 Unit | `checkConsent should check venue-specific consent` | Venue scoping |
| 🔗 Integration | `should grant consent and store in database` | Database operation |
| 🔗 Integration | `should revoke consent and update database` | Database operation |
| 🔗 Integration | `should check consent from database` | Database query |
| 🔗 Integration | `should log PII access in audit log` | Audit logging |
| 🔗 Integration | `should respect consent expiration dates` | Expiration logic |
| 🔗 Integration | `should handle venue-scoped consent correctly` | Venue scoping |

---

### 4. Errors

#### `src/errors/index.ts` - Error Classes (100% Unit Testable - GOLDMINE)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `AppError should create error with message` | Error creation |
| 🧪 Unit | `AppError should set statusCode` | Status code |
| 🧪 Unit | `AppError should set isOperational to true` | Operational flag |
| 🧪 Unit | `AppError should set code property` | Error code |
| 🧪 Unit | `AppError should capture stack trace` | Stack trace |
| 🧪 Unit | `AppError should merge additional details` | Details merging |
| 🧪 Unit | `toProblemDetails should return RFC 7807 format` | RFC 7807 compliance |
| 🧪 Unit | `toProblemDetails should include type (URI)` | Type field |
| 🧪 Unit | `toProblemDetails should include title` | Title field |
| 🧪 Unit | `toProblemDetails should include status` | Status field |
| 🧪 Unit | `toProblemDetails should include detail` | Detail field |
| 🧪 Unit | `toProblemDetails should include instance (optional)` | Instance field |
| 🧪 Unit | `toProblemDetails should include custom extensions (code)` | Extensions |
| 🧪 Unit | `toProblemDetails should generate correct type URI from error name` | URI generation |
| 🧪 Unit | `ValidationError should set statusCode to 400` | Status code |
| 🧪 Unit | `ValidationError should set code to "VALIDATION_ERROR"` | Error code |
| 🧪 Unit | `ValidationError should include validation details` | Details |
| 🧪 Unit | `ValidationError toProblemDetails should include validation errors` | RFC 7807 + details |
| 🧪 Unit | `NotFoundError should set statusCode to 404` | Status code |
| 🧪 Unit | `NotFoundError should set code to "NOT_FOUND"` | Error code |
| 🧪 Unit | `NotFoundError should include resource type in message` | Message format |
| 🧪 Unit | `UnauthorizedError should set statusCode to 401` | Status code |
| 🧪 Unit | `UnauthorizedError should set code to "UNAUTHORIZED"` | Error code |
| 🧪 Unit | `ForbiddenError should set statusCode to 403` | Status code |
| 🧪 Unit | `ForbiddenError should set code to "FORBIDDEN"` | Error code |
| 🧪 Unit | `ConflictError should set statusCode to 409` | Status code |
| 🧪 Unit | `ConflictError should set code to "CONFLICT"` | Error code |
| 🧪 Unit | `RateLimitError should set statusCode to 429` | Status code |
| 🧪 Unit | `RateLimitError should set code to "RATE_LIMIT_EXCEEDED"` | Error code |
| 🧪 Unit | `RateLimitError should include retryAfter in details` | Retry info |
| 🧪 Unit | `RateLimitError should include limit information` | Limit info |
| 🧪 Unit | `ServiceUnavailableError should set statusCode to 503` | Status code |
| 🧪 Unit | `ServiceUnavailableError should set code to "SERVICE_UNAVAILABLE"` | Error code |
| 🧪 Unit | `NotificationSendError should set statusCode to 500` | Status code |
| 🧪 Unit | `NotificationSendError should set code to "NOTIFICATION_SEND_FAILED"` | Error code |
| 🧪 Unit | `NotificationSendError should include provider info` | Provider details |
| 🧪 Unit | `NotificationSendError should include channel info` | Channel details |
| 🧪 Unit | `ProviderError should set statusCode to 502` | Status code |
| 🧪 Unit | `ProviderError should set code to "PROVIDER_ERROR"` | Error code |
| 🧪 Unit | `ProviderError should include provider name` | Provider name |
| 🧪 Unit | `ProviderError should include original error` | Original error |
| 🧪 Unit | `TemplateError should set statusCode to 500` | Status code |
| 🧪 Unit | `TemplateError should set code to "TEMPLATE_ERROR"` | Error code |
| 🧪 Unit | `TemplateError should include template name` | Template name |
| 🧪 Unit | `SuppressionError should set statusCode to 400` | Status code |
| 🧪 Unit | `SuppressionError should set code to "RECIPIENT_SUPPRESSED"` | Error code |
| 🧪 Unit | `SuppressionError should include channel info` | Channel details |
| 🧪 Unit | `SuppressionError should include reason` | Reason |
| 🧪 Unit | `TenantError should set statusCode to 403` | Status code |
| 🧪 Unit | `TenantError should set code to "TENANT_ERROR"` | Error code |
| 🧪 Unit | `TenantError should include tenant ID` | Tenant ID |
| 🧪 Unit | `IdempotencyError should set statusCode to 409` | Status code |
| 🧪 Unit | `IdempotencyError should set code to "IDEMPOTENCY_CONFLICT"` | Error code |
| 🧪 Unit | `IdempotencyError should include idempotency key` | Idempotency key |
| 🧪 Unit | `isOperationalError should return true for AppError instances` | Type check |
| 🧪 Unit | `isOperationalError should return true when error.isOperational = true` | Property check |
| 🧪 Unit | `isOperationalError should return false for generic Error` | Type check |
| 🧪 Unit | `isOperationalError should return false when error.isOperational = false` | Property check |
| 🧪 Unit | `sendError should send RFC 7807 JSON response` | Response format |
| 🧪 Unit | `sendError should set correct Content-Type header` | Header setting |
| 🧪 Unit | `sendError should set correct status code` | Status code |
| 🧪 Unit | `sendError should include all problem details fields` | Complete response |
| 🧪 Unit | `createErrorHandler should log error` | Logging |
| 🧪 Unit | `createErrorHandler should call sendError()` | Error sending |
| 🧪 Unit | `createErrorHandler should handle operational errors` | Error handling |
| 🧪 Unit | `createErrorHandler should handle non-operational errors` | Error handling |
| 🧪 Unit | `createErrorHandler should include stack trace in development` | Stack trace |
| 🧪 Unit | `createErrorHandler should hide stack trace in production` | Stack trace |
| 🧪 Unit | `createErrorHandler should include request ID in error` | Request ID |
| 🧪 Unit | `asyncHandler should wrap async route handler` | Wrapper function |
| 🧪 Unit | `asyncHandler should catch rejected promises` | Promise handling |
| 🧪 Unit | `asyncHandler should pass errors to next()` | Error passing |
| 🧪 Unit | `asyncHandler should allow successful responses` | Success path |
| 🔗 Integration | `should handle ValidationError from controller` | Error flow |
| 🔗 Integration | `should handle NotFoundError from service` | Error flow |
| 🔗 Integration | `should handle RateLimitError from middleware` | Error flow |
| 🔗 Integration | `should format all errors as RFC 7807` | Format consistency |
| 🔗 Integration | `should log errors with correct severity` | Logging behavior |

---

### 5. Events

#### `src/events/payment-event-handler.ts` - Payment Event Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `stripHtml should remove all HTML tags` | HTML stripping |
| 🧪 Unit | `stripHtml should handle nested tags` | HTML stripping |
| 🧪 Unit | `stripHtml should preserve text content` | Text preservation |
| 🧪 Unit | `stripHtml should handle empty string` | Edge case |
| 🧪 Unit | `stripHtml should handle string without HTML` | Edge case |
| 🧪 Unit | `stripHtml should remove script tags` | Security |
| 🧪 Unit | `stripHtml should remove style tags` | HTML stripping |
| 🧪 Unit | `isValidPhone should accept valid E.164 format (+1234567890)` | Phone validation |
| 🧪 Unit | `isValidPhone should accept phone without +` | Phone validation |
| 🧪 Unit | `isValidPhone should reject phone with letters` | Phone validation |
| 🧪 Unit | `isValidPhone should reject phone too short (<10 digits)` | Phone validation |
| 🧪 Unit | `isValidPhone should reject phone too long (>15 digits)` | Phone validation |
| 🧪 Unit | `isValidPhone should reject empty string` | Edge case |
| 🧪 Unit | `createPaymentSuccessHtml should generate complete HTML email` | Template generation |
| 🧪 Unit | `createPaymentSuccessHtml should include order ID` | Content inclusion |
| 🧪 Unit | `createPaymentSuccessHtml should include formatted amount` | Formatting |
| 🧪 Unit | `createPaymentSuccessHtml should include currency uppercase` | Formatting |
| 🧪 Unit | `createPaymentSuccessHtml should include event name` | Content inclusion |
| 🧪 Unit | `createPaymentSuccessHtml should include customer name` | Content inclusion |
| 🧪 Unit | `createPaymentSuccessHtml should include ticket count` | Content inclusion |
| 🧪 Unit | `createPaymentSuccessHtml should include payment method (last 4 digits)` | Content inclusion |
| 🧪 Unit | `createPaymentSuccessHtml should truncate order ID to 8 chars for display` | Truncation |
| 🧪 Unit | `createPaymentSuccessHtml should escape HTML in user inputs` | Security |
| 🧪 Unit | `createPaymentFailedHtml should generate HTML with failure message` | Template generation |
| 🧪 Unit | `createPaymentFailedHtml should include reason` | Content inclusion |
| 🧪 Unit | `createPaymentFailedHtml should include retry URL` | Content inclusion |
| 🧪 Unit | `createPaymentFailedHtml should include amount` | Content inclusion |
| 🧪 Unit | `createRefundHtml should generate HTML with refund details` | Template generation |
| 🧪 Unit | `createRefundHtml should include refund amount` | Content inclusion |
| 🧪 Unit | `createRefundHtml should include original order ID` | Content inclusion |
| 🧪 Unit | `createRefundHtml should include refund ID` | Content inclusion |
| 🧪 Unit | `formatAmount should format cents to dollars (1500 -> $15.00)` | Formatting |
| 🧪 Unit | `formatAmount should handle zero amount` | Edge case |
| 🧪 Unit | `formatAmount should format large amounts with commas` | Formatting |
| 🧪 Unit | `uppercaseCurrency should convert usd to USD` | Case conversion |
| 🧪 Unit | `uppercaseCurrency should convert eur to EUR` | Case conversion |
| 🧪 Unit | `uppercaseCurrency should handle already uppercase` | Idempotency |
| 🔗 Integration | `handlePaymentSuccess should send email notification` | Event handling |
| 🔗 Integration | `handlePaymentSuccess should send SMS notification if phone provided` | Event handling |
| 🔗 Integration | `handlePaymentSuccess should log to audit log` | Audit logging |
| 🔗 Integration | `handlePaymentSuccess should track metrics` | Metrics tracking |
| 🔗 Integration | `handlePaymentSuccess should handle invalid email gracefully` | Error handling |
| 🔗 Integration | `handlePaymentSuccess should handle invalid phone gracefully` | Error handling |
| 🔗 Integration | `handlePaymentFailed should send failure notification` | Event handling |
| 🔗 Integration | `handlePaymentFailed should include retry link` | Content inclusion |
| 🔗 Integration | `handlePaymentFailed should log audit trail` | Audit logging |
| 🔗 Integration | `handleRefundProcessed should send refund confirmation` | Event handling |
| 🔗 Integration | `handleRefundProcessed should include refund details` | Content inclusion |
| 🔗 Integration | `handlePaymentMethodUpdated should send confirmation notification` | Event handling |

#### `src/events/notification-event-handler.ts` - Notification Queue Consumer

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should process RabbitMQ messages from notification queue` | Queue processing |
| 🔗 Integration | `should deserialize JSON payload` | Deserialization |
| 🔗 Integration | `should call notificationService.send()` | Service call |
| 🔗 Integration | `should acknowledge message on success` | Message ack |
| 🔗 Integration | `should nack message on failure (requeue)` | Message nack |
| 🔗 Integration | `should handle malformed JSON` | Error handling |
| 🔗 Integration | `should respect max retry attempts` | Retry logic |
| 🔗 Integration | `should move to dead letter queue after max retries` | DLQ logic |

#### `src/events/webhook-event-handler.ts` - Webhook Queue Consumer

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should process webhook events from queue` | Queue processing |
| 🔗 Integration | `should verify signature before processing` | Security |
| 🔗 Integration | `should update delivery status` | Status update |
| 🔗 Integration | `should track engagement (opens/clicks)` | Engagement tracking |
| 🔗 Integration | `should acknowledge processed webhooks` | Message ack |
| 🔗 Integration | `should handle duplicate webhooks (idempotency)` | Idempotency |

---

### 6. Jobs

#### `src/jobs/campaign.jobs.ts` - Campaign Scheduled Jobs

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateLockKey should format lock key correctly` | Key generation |
| 🧪 Unit | `generateLockKey should include job name` | Key content |
| 🧪 Unit | `generateLockKey should be unique per job` | Uniqueness |
| 🧪 Unit | `createJobHistory should return valid JSON object` | JSON format |
| 🧪 Unit | `createJobHistory should include start time` | Content inclusion |
| 🧪 Unit | `createJobHistory should include end time` | Content inclusion |
| 🧪 Unit | `createJobHistory should include duration` | Content inclusion |
| 🧪 Unit | `createJobHistory should include result data` | Content inclusion |
| 🧪 Unit | `calculateFailureThreshold should return 5% threshold for large batches (>1000)` | Threshold calc |
| 🧪 Unit | `calculateFailureThreshold should return 10% threshold for medium batches` | Threshold calc |
| 🧪 Unit | `calculateFailureThreshold should return fixed count for small batches` | Threshold calc |
| 🧪 Unit | `getJobStatus should retrieve status from database` | Status retrieval |
| 🧪 Unit | `getJobStatus should return null for non-existent job` | Edge case |
| 🔗 Integration | `should acquire distributed lock (Redis)` | Locking |
| 🔗 Integration | `should process scheduled campaigns` | Job execution |
| 🔗 Integration | `should send batch notifications` | Batch sending |
| 🔗 Integration | `should update campaign stats` | Stats update |
| 🔗 Integration | `should release lock on completion` | Lock release |
| 🔗 Integration | `should skip job if lock held by another instance` | Lock contention |

#### `src/jobs/data-retention.jobs.ts` - Data Retention Jobs

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `parseRetentionPeriod should parse days from RETENTION_DAYS env` | Parsing |
| 🧪 Unit | `parseRetentionPeriod should return default (90) when not set` | Default value |
| 🧪 Unit | `parseRetentionPeriod should handle invalid value` | Error handling |
| 🧪 Unit | `calculateCutoffDate should calculate date N days ago` | Date calculation |
| 🧪 Unit | `calculateCutoffDate should handle timezone correctly` | Timezone handling |
| 🧪 Unit | `batchDelete should delete in batches of 1000` | Batch deletion |
| 🧪 Unit | `batchDelete should count deleted records` | Record counting |
| 🧪 Unit | `batchDelete should handle empty result set` | Edge case |
| 🧪 Unit | `aggregateResults should sum deletion counts` | Aggregation |
| 🧪 Unit | `aggregateResults should format summary object` | Formatting |
| 🔗 Integration | `should delete old notification_history records (>90 days)` | Deletion logic |
| 🔗 Integration | `should delete old webhook_events (processed + >90 days)` | Deletion logic |
| 🔗 Integration | `should delete old audit_logs (non-critical + >365 days)` | Deletion logic |
| 🔗 Integration | `should preserve critical audit logs (forever)` | Preservation logic |
| 🔗 Integration | `should delete old engagement_events` | Deletion logic |
| 🔗 Integration | `should log deletion summary` | Logging |
| 🔗 Integration | `should acquire distributed lock` | Locking |
| 🔗 Integration | `should track metrics (records_deleted_total)` | Metrics tracking |
| 🔗 Integration | `should handle database errors gracefully` | Error handling |
| 🔗 Integration | `should commit in batches (transaction safety)` | Transaction handling |

#### `src/jobs/queue-processor.jobs.ts` - Queue Processing Jobs

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should process Bull queues (critical, high, normal, bulk)` | Queue processing |
| 🔗 Integration | `should respect concurrency limits per queue` | Concurrency |
| 🔗 Integration | `should retry failed jobs with exponential backoff` | Retry logic |
| 🔗 Integration | `should move to dead letter queue after max retries` | DLQ logic |
| 🔗 Integration | `should track job metrics (completed, failed, stalled)` | Metrics tracking |
| 🔗 Integration | `should handle job timeouts` | Timeout handling |
| 🔗 Integration | `should pause/resumes queues dynamically` | Queue control |
| 🔗 Integration | `should drain queue on shutdown (graceful)` | Graceful shutdown |

---

### 7. Middleware (CRITICAL - Multiple Audit Fixes)

#### `src/middleware/request-logger.ts` - Request Logger (AUDIT FIX PII-1, PII-2)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `redactSensitiveData should redact email in string` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact phone in string` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact credit card in string` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact password field` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact token field` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact apiKey field` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact nested objects` | PII redaction |
| 🧪 Unit | `redactSensitiveData should redact arrays of objects` | PII redaction |
| 🧪 Unit | `redactSensitiveData should handle max depth (10 levels)` | Depth limit |
| 🧪 Unit | `redactSensitiveData should handle circular references` | Circular handling |
| 🧪 Unit | `redactSensitiveData should preserve non-sensitive data` | Preservation |
| 🧪 Unit | `redactSensitiveData should handle null/undefined` | Edge case |
| 🧪 Unit | `redactSensitiveData should redact sensitive keys (case-insensitive)` | Case handling |
| 🧪 Unit | `redactHeaders should redact Authorization header` | Header redaction |
| 🧪 Unit | `redactHeaders should redact X-API-Key header` | Header redaction |
| 🧪 Unit | `redactHeaders should redact Cookie header` | Header redaction |
| 🧪 Unit | `redactHeaders should preserve Content-Type` | Header preservation |
| 🧪 Unit | `redactHeaders should preserve User-Agent` | Header preservation |
| 🧪 Unit | `getClientIp should extract IP from X-Forwarded-For` | IP extraction |
| 🧪 Unit | `getClientIp should extract IP from X-Real-IP` | IP extraction |
| 🧪 Unit | `getClientIp should fall back to req.ip` | IP extraction |
| 🧪 Unit | `getClientIp should handle IPv4` | IP format |
| 🧪 Unit | `getClientIp should handle IPv6` | IP format |
| 🧪 Unit | `getClientIp should handle multiple IPs in X-Forwarded-For (takes first)` | Multiple IPs |
| 🧪 Unit | `calculateDuration should calculate duration in ms` | Duration calc |
| 🧪 Unit | `calculateDuration should handle sub-millisecond durations` | Precision |
| 🧪 Unit | `classifyPerformance should return "fast" for <100ms` | Classification |
| 🧪 Unit | `classifyPerformance should return "normal" for 100-500ms` | Classification |
| 🧪 Unit | `classifyPerformance should return "slow" for 500-2000ms` | Classification |
| 🧪 Unit | `classifyPerformance should return "very_slow" for >2000ms` | Classification |
| 🧪 Unit | `selectLogLevel should return "error" for 5xx status` | Level selection |
| 🧪 Unit | `selectLogLevel should return "warn" for 4xx status` | Level selection |
| 🧪 Unit | `selectLogLevel should return "warn" for slow requests (>2s)` | Level selection |
| 🧪 Unit | `selectLogLevel should return "info" for successful requests` | Level selection |
| 🔗 Integration | `should log incoming requests` | Logging |
| 🔗 Integration | `should log response status and duration` | Logging |
| 🔗 Integration | `should redact PII from request body` | PII protection |
| 🔗 Integration | `should redact PII from query params` | PII protection |
| 🔗 Integration | `should include request ID in logs` | Context inclusion |
| 🔗 Integration | `should include tenant ID in logs` | Context inclusion |
| 🔗 Integration | `should log errors with stack traces` | Error logging |
| 🔗 Integration | `should respect log level filtering` | Level filtering |

#### `src/middleware/validation.middleware.ts` - Input Validation (AUDIT FIX INP-1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateEmail should accept valid email` | Email validation |
| 🧪 Unit | `validateEmail should reject invalid format (no @)` | Email validation |
| 🧪 Unit | `validateEmail should reject invalid format (no domain)` | Email validation |
| 🧪 Unit | `validateEmail should reject invalid format (no TLD)` | Email validation |
| 🧪 Unit | `validateEmail should reject invalid format (special chars)` | Email validation |
| 🧪 Unit | `validateEmail should accept RFC 5322 compliant emails` | Email validation |
| 🧪 Unit | `validateEmail should reject emails >255 chars` | Length validation |
| 🧪 Unit | `validateEmail should handle international domains` | I18n support |
| 🧪 Unit | `validatePhone should accept valid E.164 format` | Phone validation |
| 🧪 Unit | `validatePhone should accept phone with + prefix` | Phone validation |
| 🧪 Unit | `validatePhone should accept phone without + prefix` | Phone validation |
| 🧪 Unit | `validatePhone should reject phone <10 digits` | Phone validation |
| 🧪 Unit | `validatePhone should reject phone >15 digits` | Phone validation |
| 🧪 Unit | `validatePhone should reject phone with letters` | Phone validation |
| 🧪 Unit | `validatePhone should reject phone with invalid chars` | Phone validation |
| 🧪 Unit | `sanitizeString should remove <script> tags` | XSS protection |
| 🧪 Unit | `sanitizeString should remove <iframe> tags` | XSS protection |
| 🧪 Unit | `sanitizeString should remove onclick attributes` | XSS protection |
| 🧪 Unit | `sanitizeString should remove onerror attributes` | XSS protection |
| 🧪 Unit | `sanitizeString should remove javascript: URLs` | XSS protection |
| 🧪 Unit | `sanitizeString should preserve safe HTML tags` | Content preservation |
| 🧪 Unit | `sanitizeString should trim whitespace` | Trimming |
| 🧪 Unit | `sanitizeString should enforce max length` | Length limit |
| 🧪 Unit | `sanitizeString should handle empty string` | Edge case |
| 🧪 Unit | `validateSendRequest should validate complete email request` | Request validation |
| 🧪 Unit | `validateSendRequest should validate complete SMS request` | Request validation |
| 🧪 Unit | `validateSendRequest should reject missing required fields` | Required fields |
| 🧪 Unit | `validateSendRequest should reject invalid email format` | Format validation |
| 🧪 Unit | `validateSendRequest should reject invalid phone format` | Format validation |
| 🧪 Unit | `validateSendRequest should sanitize user inputs` | Sanitization |
| 🧪 Unit | `validateSendRequest should validate template exists` | Template validation |
| 🧪 Unit | `validateSendRequest should validate priority value` | Enum validation |
| 🧪 Unit | `validateSendRequest should validate channel value` | Enum validation |
| 🧪 Unit | `validateBatchSendRequest should validate batch of notifications` | Batch validation |
| 🧪 Unit | `validateBatchSendRequest should reject batch >1000 items` | Size limit |
| 🧪 Unit | `validateBatchSendRequest should reject empty batch` | Empty validation |
| 🧪 Unit | `validateBatchSendRequest should validate each notification in batch` | Item validation |
| 🧪 Unit | `validateBatchSendRequest should collect all validation errors` | Error collection |
| 🔗 Integration | `should reject invalid requests with 400` | Error response |
| 🔗 Integration | `should include validation errors in response` | Error details |
| 🔗 Integration | `should allow valid requests to pass through` | Success path |
| 🔗 Integration | `should sanitize inputs before processing` | Sanitization |
| 🔗 Integration | `should validate against JSON schema` | Schema validation |
| 🔗 Integration | `should track validation failures in metrics` | Metrics tracking |

#### `src/middleware/rate-limit-redis.ts` - Rate Limiting (AUDIT FIXES RL-1, RL-2, RL-H1, RL-H2)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getRouteKey should normalize route path (/api/v1/send -> api.v1.send)` | Path normalization |
| 🧪 Unit | `getRouteKey should remove leading/trailing slashes` | Path cleaning |
| 🧪 Unit | `getRouteKey should remove query parameters` | Query removal |
| 🧪 Unit | `getRouteKey should convert slashes to dots` | Path conversion |
| 🧪 Unit | `getRouteKey should handle root path` | Edge case |
| 🧪 Unit | `getRateLimitConfig should return config for /api/notifications/send` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return config for /api/notifications/send-batch` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return stricter config for SMS routes` | Config lookup |
| 🧪 Unit | `getRateLimitConfig should return default config for unknown routes` | Fallback |
| 🧪 Unit | `getRateLimitConfig should respect environment variable overrides` | Env override |
| 🧪 Unit | `getClientIp should extract IP from X-Forwarded-For` | IP extraction |
| 🧪 Unit | `getClientIp should extract IP from X-Real-IP` | IP extraction |
| 🧪 Unit | `getClientIp should validate IP format (IPv4)` | IP validation |
| 🧪 Unit | `getClientIp should validate IP format (IPv6)` | IP validation |
| 🧪 Unit | `getClientIp should return "unknown" for invalid IP` | Error handling |
| 🧪 Unit | `validateIp should validate IPv4 format` | IP validation |
| 🧪 Unit | `validateIp should validate IPv6 format` | IP validation |
| 🧪 Unit | `validateIp should reject invalid format` | IP validation |
| 🧪 Unit | `calculateResetTime should calculate reset time based on window` | Time calculation |
| 🧪 Unit | `calculateResetTime should return ISO string` | Format |
| 🔗 Integration | `checkRateLimit should allow first request` | Rate limiting |
| 🔗 Integration | `checkRateLimit should increment counter on request` | Counter update |
| 🔗 Integration | `checkRateLimit should allow requests within limit` | Rate limiting |
| 🔗 Integration | `checkRateLimit should block requests exceeding limit` | Rate limiting |
| 🔗 Integration | `checkRateLimit should reset counter after window expires` | Window reset |
| 🔗 Integration | `checkRateLimit should handle Redis connection failure (fail open)` | Fault tolerance |
| 🔗 Integration | `checkRateLimit should use sliding window algorithm` | Algorithm |
| 🔗 Integration | `rateLimitMiddleware should apply rate limit per IP` | IP-based limiting |
| 🔗 Integration | `rateLimitMiddleware should apply rate limit per route` | Route-based limiting |
| 🔗 Integration | `rateLimitMiddleware should set X-RateLimit-* headers` | Header setting |
| 🔗 Integration | `rateLimitMiddleware should return 429 when limit exceeded` | Error response |
| 🔗 Integration | `rateLimitMiddleware should include Retry-After header` | Retry header |
| 🔗 Integration | `rateLimitMiddleware should bypass rate limit for trusted IPs` | Bypass logic |
| 🔗 Integration | `rateLimitMiddleware should bypass rate limit for health checks` | Bypass logic |
| 🔗 Integration | `smsRateLimitMiddleware should apply stricter limits for SMS` | SMS limits |

#### `src/middleware/idempotency.ts` - Idempotency Middleware (AUDIT FIX IDP-H1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateRouteKey should normalize route path` | Path normalization |
| 🧪 Unit | `generateRouteKey should remove leading/trailing slashes` | Path cleaning |
| 🧪 Unit | `generateRouteKey should convert slashes to dots` | Path conversion |
| 🧪 Unit | `normalizeRouteKey should replace UUIDs with placeholder` | UUID replacement |
| 🧪 Unit | `normalizeRouteKey should replace numeric IDs with placeholder` | ID replacement |
| 🧪 Unit | `normalizeRouteKey should handle multiple IDs in path` | Multiple IDs |
| 🧪 Unit | `normalizeRouteKey should preserve non-ID segments` | Path preservation |
| 🧪 Unit | `constructFullKey should combine prefix, route, and idempotency key` | Key construction |
| 🧪 Unit | `constructFullKey should format key correctly` | Format |
| 🧪 Unit | `generateIdempotencyKey should generate SHA-256 hash of request body` | Hash generation |
| 🧪 Unit | `generateIdempotencyKey should return hex string` | Format |
| 🧪 Unit | `generateIdempotencyKey should produce same key for same body` | Determinism |
| 🧪 Unit | `generateIdempotencyKey should produce different key for different body` | Uniqueness |
| 🧪 Unit | `determineStatus should return "completed" for 2xx status` | Status mapping |
| 🧪 Unit | `determineStatus should return "failed" for 4xx/5xx status` | Status mapping |
| 🧪 Unit | `determineStatus should return "processing" for pending` | Status mapping |
| 🧪 Unit | `cleanupOldRecords should delete records older than 24 hours` | Cleanup logic |
| 🔗 Integration | `getIdempotencyRecord should retrieve record from Redis` | Redis get |
| 🔗 Integration | `getIdempotencyRecord should return null for non-existent key` | Not found |
| 🔗 Integration | `getIdempotencyRecord should parse JSON correctly` | JSON parsing |
| 🔗 Integration | `setIdempotencyRecord should store record in Redis` | Redis set |
| 🔗 Integration | `setIdempotencyRecord should set expiry (24 hours)` | Expiry |
| 🔗 Integration | `setIdempotencyRecord should serialize to JSON` | JSON serialization |
| 🔗 Integration | `idempotencyMiddleware should allow first request (no duplicate)` | First request |
| 🔗 Integration | `idempotencyMiddleware should return cached response for duplicate request` | Duplicate handling |
| 🔗 Integration | `idempotencyMiddleware should return 409 if previous request processing` | Conflict |
| 🔗 Integration | `idempotencyMiddleware should allow retry if previous request failed` | Retry logic |
| 🔗 Integration | `idempotencyMiddleware should skip idempotency for non-POST/PUT requests` | Method filter |
| 🔗 Integration | `idempotencyMiddleware should skip idempotency for non-idempotent routes` | Route filter |
| 🔗 Integration | `idempotencyMiddleware should generate idempotency key from body hash` | Key generation |
| 🔗 Integration | `idempotencyMiddleware should include X-Idempotency-Key header in response` | Header |
| 🔗 Integration | `idempotencyMiddleware should handle Redis connection failure (fail open)` | Fault tolerance |
| 🔗 Integration | `idempotencyMiddleware should clean up old records` | Cleanup |

#### `src/middleware/tenant-context.ts` - Multi-Tenancy (AUDIT FIXES MT-1, MT-2, MT-H3)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `extractTenantId should extract tenant from JWT token` | JWT extraction |
| 🧪 Unit | `extractTenantId should extract tenant from X-Tenant-ID header` | Header extraction |
| 🧪 Unit | `extractTenantId should extract tenant from query param (?tenantId=...)` | Query extraction |
| 🧪 Unit | `extractTenantId should return null if no tenant found` | Not found |
| 🧪 Unit | `extractTenantId should NOT use default tenant ID (security fix)` | Security fix |
| 🧪 Unit | `extractTenantId should validate JWT structure` | JWT validation |
| 🧪 Unit | `extractTenantId should handle malformed JWT` | Error handling |
| 🧪 Unit | `validateTenantIdFormat should accept valid UUID v4` | UUID validation |
| 🧪 Unit | `validateTenantIdFormat should reject invalid UUID format` | UUID validation |
| 🧪 Unit | `validateTenantIdFormat should reject empty string` | Validation |
| 🧪 Unit | `validateTenantIdFormat should reject non-string values` | Type validation |
| 🧪 Unit | `getTenantCacheKey should format cache key correctly` | Key formatting |
| 🧪 Unit | `getTenantCacheKey should include tenant ID` | Content |
| 🧪 Unit | `isExemptRoute should exempt /health` | Route exemption |
| 🧪 Unit | `isExemptRoute should exempt /metrics` | Route exemption |
| 🧪 Unit | `isExemptRoute should exempt /webhook/*` | Route exemption |
| 🧪 Unit | `isExemptRoute should not exempt /api/notifications/*` | Route enforcement |
| 🔗 Integration | `setTenantContext should store tenant in AsyncLocalStorage` | Context storage |
| 🔗 Integration | `setTenantContext should make tenant available in getCurrentTenantId()` | Context retrieval |
| 🔗 Integration | `setTenantContext should isolate tenant per request` | Isolation |
| 🔗 Integration | `setPostgresRlsContext should set app.current_tenant in Postgres session` | RLS setup |
| 🔗 Integration | `setPostgresRlsContext should use raw query to set variable` | SQL execution |
| 🔗 Integration | `setPostgresRlsContext should validate tenant ID before setting` | Validation |
| 🔗 Integration | `requireTenantContext should allow request with valid tenant` | Authorization |
| 🔗 Integration | `requireTenantContext should reject request without tenant (403)` | Authorization |
| 🔗 Integration | `requireTenantContext should exempt health checks` | Exemption |
| 🔗 Integration | `requireTenantContext should exempt metrics endpoint` | Exemption |
| 🔗 Integration | `requireTenantContext should exempt webhooks` | Exemption |
| 🔗 Integration | `AsyncLocalStorage should maintain tenant isolation across async calls` | Isolation |
| 🔗 Integration | `AsyncLocalStorage should clear tenant context after request` | Cleanup |
| 🔗 Integration | `AsyncLocalStorage should handle concurrent requests with different tenants` | Concurrency |

#### `src/middleware/webhook-auth.middleware.ts` - Webhook Authentication (AUDIT FIX S2S-2)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructUrlForVerification should construct URL from base + path` | URL construction |
| 🧪 Unit | `constructUrlForVerification should include protocol (https://)` | Protocol |
| 🧪 Unit | `constructUrlForVerification should include hostname` | Hostname |
| 🧪 Unit | `constructUrlForVerification should include path` | Path |
| 🧪 Unit | `sortQueryParameters should sort params alphabetically` | Sorting |
| 🧪 Unit | `sortQueryParameters should handle empty object` | Edge case |
| 🧪 Unit | `sortQueryParameters should handle single param` | Single param |
| 🧪 Unit | `sortQueryParameters should handle multiple params` | Multiple params |
| 🧪 Unit | `calculateHmacSignature should compute HMAC-SHA256` | HMAC |
| 🧪 Unit | `calculateHmacSignature should return base64-encoded signature` | Encoding |
| 🧪 Unit | `calculateHmacSignature should use webhook secret as key` | Key usage |
| 🧪 Unit | `calculateHmacSignature should produce same signature for same input` | Determinism |
| 🧪 Unit | `calculateHmacSignature should produce different signature for different input` | Uniqueness |
| 🧪 Unit | `timingSafeCompare should return true for matching strings` | Comparison |
| 🧪 Unit | `timingSafeCompare should return false for non-matching strings` | Comparison |
| 🧪 Unit | `timingSafeCompare should handle different lengths` | Edge case |
| 🧪 Unit | `timingSafeCompare should be timing-safe (constant-time comparison)` | Security |
| 🔗 Integration | `verifyTwilioSignature should accept valid Twilio signature` | Signature verification |
| 🔗 Integration | `verifyTwilioSignature should reject invalid Twilio signature` | Security |
| 🔗 Integration | `verifyTwilioSignature should construct correct validation URL` | URL construction |
| 🔗 Integration | `verifyTwilioSignature should include all POST params in signature` | Param inclusion |
| 🔗 Integration | `verifyTwilioSignature should sort params alphabetically` | Sorting |
| 🔗 Integration | `verifyTwilioSignature should handle URL-encoded values` | Encoding |
| 🔗 Integration | `verifySendGridSignature should accept valid SendGrid signature` | Signature verification |
| 🔗 Integration | `verifySendGridSignature should reject invalid SendGrid signature` | Security |
| 🔗 Integration | `verifySendGridSignature should use public key for verification` | Key usage |
| 🔗 Integration | `verifySendGridSignature should handle missing signature header (rejects)` | Error handling |

#### `src/middleware/request-id.ts` - Request ID (AUDIT FIX ERR-H2)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `requestIdMiddleware should use existing X-Request-ID header` | Header usage |
| 🧪 Unit | `requestIdMiddleware should generate UUID v4 if header missing` | UUID generation |
| 🧪 Unit | `requestIdMiddleware should set X-Request-ID in response` | Response header |
| 🧪 Unit | `requestIdMiddleware should store request ID in res.locals` | Local storage |
| 🧪 Unit | `requestIdMiddleware should validate UUID format` | Format validation |
| 🧪 Unit | `requestIdMiddleware should reject invalid UUID in header` | Validation |
| 🧪 Unit | `requestIdMiddleware should prioritize X-Request-ID over X-Correlation-ID` | Priority |
| 🧪 Unit | `UUID generation should generate valid UUID v4` | UUID validity |
| 🔗 Integration | `should propagate request ID through middleware chain` | Propagation |
| 🔗 Integration | `should include request ID in logs` | Logging |
| 🔗 Integration | `should include request ID in error responses` | Error handling |
| 🔗 Integration | `should generate unique IDs for concurrent requests` | Uniqueness |

#### `src/middleware/auth.middleware.ts` - Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `extractToken should extract token from Bearer header` | Token extraction |
| 🧪 Unit | `extractToken should return null for missing header` | Not found |
| 🧪 Unit | `extractToken should return null for invalid format` | Format validation |
| 🧪 Unit | `verifyJwt should verify valid JWT` | JWT verification |
| 🧪 Unit | `verifyJwt should reject expired JWT` | Expiry check |
| 🧪 Unit | `verifyJwt should reject invalid signature` | Signature check |
| 🧪 Unit | `verifyJwt should reject malformed JWT` | Format check |
| 🧪 Unit | `requireAuth should allow request with valid token` | Authorization |
| 🧪 Unit | `requireAuth should reject request without token (401)` | Authorization |
| 🧪 Unit | `requireAuth should reject request with invalid token (401)` | Authorization |
| 🧪 Unit | `requireAuth should extract user from token and store in req.user` | User extraction |
| 🔗 Integration | `should authenticate valid requests` | Full auth flow |
| 🔗 Integration | `should reject unauthenticated requests` | Rejection |
| 🔗 Integration | `should include user context in downstream handlers` | Context passing |
| 🔗 Integration | `should handle token refresh` | Token refresh |
| 🔗 Integration | `should track auth failures in metrics` | Metrics |
| 🔗 Integration | `should log failed auth attempts` | Logging |

#### `src/middleware/error-handler.middleware.ts` - Error Handler

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should catch synchronous errors` | Sync error handling |
| 🧪 Unit | `should catch async errors` | Async error handling |
| 🧪 Unit | `should format AppError as RFC 7807` | Error formatting |
| 🧪 Unit | `should format generic Error as 500 RFC 7807` | Error formatting |
| 🧪 Unit | `should include stack trace in development` | Stack trace |
| 🧪 Unit | `should hide stack trace in production` | Stack trace |
| 🧪 Unit | `should include request ID in error` | Request ID |
| 🧪 Unit | `should log error with correct severity` | Logging |
| 🧪 Unit | `should track error metrics` | Metrics |
| 🧪 Unit | `should distinguish operational vs programmer errors` | Error classification |

#### `src/middleware/cors.middleware.ts` - CORS

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should set Access-Control-Allow-Origin` | Header setting |
| 🧪 Unit | `should set Access-Control-Allow-Methods` | Header setting |
| 🧪 Unit | `should set Access-Control-Allow-Headers` | Header setting |
| 🧪 Unit | `should set Access-Control-Max-Age` | Header setting |
| 🧪 Unit | `should handle preflight OPTIONS request` | OPTIONS handling |
| 🧪 Unit | `should allow configured origins` | Origin check |
| 🧪 Unit | `should reject non-configured origins` | Origin check |
| 🧪 Unit | `should handle wildcard origin in development` | Wildcard handling |

#### `src/middleware/compression.middleware.ts` - Compression

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should compress responses >1KB` | Compression |
| 🧪 Unit | `should skip compression for small responses` | Size threshold |
| 🧪 Unit | `should use gzip compression` | Algorithm |
| 🧪 Unit | `should set Content-Encoding header` | Header setting |

---

### 8. Migrations

#### `src/migrations/001_initial_schema.sql` - Database Schema

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should run up migration without errors` | Migration execution |
| 🔗 Integration | `should run down migration without errors` | Migration rollback |
| 🔗 Integration | `should be idempotent (can run multiple times)` | Idempotency |
| 🔗 Integration | `should create notification_history table` | Table creation |
| 🔗 Integration | `should create notification_templates table` | Table creation |
| 🔗 Integration | `should create consent_records table` | Table creation |
| 🔗 Integration | `should create suppression_list table` | Table creation |
| 🔗 Integration | `should create notification_preferences table` | Table creation |
| 🔗 Integration | `should create notification_tracking table` | Table creation |
| 🔗 Integration | `should create engagement_events table` | Table creation |
| 🔗 Integration | `should create webhook_events table` | Table creation |
| 🔗 Integration | `should create notification_costs table` | Table creation |
| 🔗 Integration | `should create audit_log table` | Table creation |
| 🔗 Integration | `should create scheduled_notifications table` | Table creation |
| 🔗 Integration | `should create notification_campaigns table` | Table creation |
| 🔗 Integration | `should create audience_segments table` | Table creation |
| 🔗 Integration | `should create email_automation_triggers table` | Table creation |
| 🔗 Integration | `should create ab_tests table` | Table creation |
| 🔗 Integration | `should create ab_test_variants table` | Table creation |
| 🔗 Integration | `should create abandoned_carts table` | Table creation |
| 🔗 Integration | `should create notification_analytics table` | Table creation |
| 🔗 Integration | `should create delivery_stats table` | Table creation |
| 🔗 Integration | `should create campaign_stats table` | Table creation |
| 🔗 Integration | `should create template_versions table` | Table creation |
| 🔗 Integration | `should create template_usage table` | Table creation |
| 🔗 Integration | `should create pending_deletions table` | Table creation |
| 🔗 Integration | `should enforce NOT NULL on required columns` | Constraint |
| 🔗 Integration | `should enforce UNIQUE on unique columns` | Constraint |
| 🔗 Integration | `should set DEFAULT values correctly` | Default values |
| 🔗 Integration | `should enforce CHECK constraints` | Constraint |
| 🔗 Integration | `should create index on notification_history(recipient_id)` | Index |
| 🔗 Integration | `should create index on notification_history(status)` | Index |
| 🔗 Integration | `should create composite index on (tenant_id, recipient_id)` | Index |
| 🔗 Integration | `should create index on created_at for time queries` | Index |
| 🔗 Integration | `should enforce FK on notification_history.template_id` | Foreign key |
| 🔗 Integration | `should enforce FK on consent_records.customer_id` | Foreign key |
| 🔗 Integration | `should cascade delete on related records` | Cascade |
| 🔗 Integration | `should prevent orphan records` | Referential integrity |
| 🔗 Integration | `trigger should update updated_at on UPDATE` | Trigger |
| 🔗 Integration | `trigger should validate tenant_id on INSERT` | Trigger |
| 🔗 Integration | `trigger should maintain aggregate stats` | Trigger |
| 🔗 Integration | `aggregate_notification_analytics() should return correct stats` | Function |
| 🔗 Integration | `should calculate delivery rates correctly` | Function |

---

### 9. Models

#### `src/models/consent.model.ts` - Consent Data Access

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `create should insert consent record` | Database insert |
| 🔗 Integration | `create should set granted_at timestamp` | Timestamp |
| 🔗 Integration | `create should store IP address` | Data storage |
| 🔗 Integration | `create should store user agent` | Data storage |
| 🔗 Integration | `create should validate channel enum` | Validation |
| 🔗 Integration | `create should validate type enum` | Validation |
| 🔗 Integration | `findByCustomer should find all consents for customer` | Query |
| 🔗 Integration | `findByCustomer should filter by channel` | Filtering |
| 🔗 Integration | `findByCustomer should filter by type` | Filtering |
| 🔗 Integration | `findByCustomer should filter by venue` | Filtering |
| 🔗 Integration | `findByCustomer should order by granted_at` | Ordering |
| 🔗 Integration | `hasConsent should return true when consent granted` | Consent check |
| 🔗 Integration | `hasConsent should return false when consent revoked` | Consent check |
| 🔗 Integration | `hasConsent should return false when consent expired` | Expiration |
| 🔗 Integration | `hasConsent should check venue-specific consent` | Venue scoping |
| 🔗 Integration | `revoke should update consent status to revoked` | Status update |
| 🔗 Integration | `revoke should set revoked_at timestamp` | Timestamp |
| 🔗 Integration | `getAuditTrail should return consent history` | Audit trail |
| 🔗 Integration | `getAuditTrail should include granted and revoked events` | Event tracking |

#### `src/models/suppression.model.ts` - Suppression List

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `hashIdentifier should generate SHA-256 hash` | Hash generation |
| 🧪 Unit | `hashIdentifier should be case insensitive` | Case handling |
| 🧪 Unit | `hashIdentifier should trim whitespace` | Whitespace handling |
| 🧪 Unit | `hashIdentifier should produce consistent output` | Determinism |
| 🔗 Integration | `add should insert suppression record` | Database insert |
| 🔗 Integration | `add should hash identifier` | Hash storage |
| 🔗 Integration | `isSuppressed should return true when suppressed` | Suppression check |
| 🔗 Integration | `isSuppressed should return false when not suppressed` | Suppression check |
| 🔗 Integration | `isSuppressed should use hash for lookup` | Hash lookup |
| 🔗 Integration | `isSuppressed should be case insensitive` | Case handling |
| 🔗 Integration | `isSuppressed should trim whitespace` | Whitespace handling |
| 🔗 Integration | `isSuppressed should check expiration` | Expiration check |
| 🔗 Integration | `remove should delete suppression record` | Database delete |
| 🔗 Integration | `list should return all suppressions` | List query |
| 🔗 Integration | `list should filter by channel` | Filtering |

#### `src/models/mongodb/marketing-content.model.ts` - Marketing Content (MongoDB)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create document` | Document creation |
| 🔗 Integration | `should find documents` | Query |
| 🔗 Integration | `should update document` | Update |
| 🔗 Integration | `should delete document` | Deletion |
| 🔗 Integration | `should validate schema` | Schema validation |
| 🔗 Integration | `should create indexes` | Index creation |
| 🔗 Integration | `should apply TTL index (90 days)` | TTL behavior |
| 🔗 Integration | `should track performance metrics` | Metrics tracking |
| 🔗 Integration | `should support A/B test variants` | A/B testing |
| 🔗 Integration | `should track campaign status transitions` | Status tracking |

---

### 10. Providers

#### `src/providers/email/sendgrid-email.provider.ts` - SendGrid Email (AUDIT FIX EXT-H1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `formatRecipients should handle single email` | Formatting |
| 🧪 Unit | `formatRecipients should handle array of emails` | Formatting |
| 🧪 Unit | `formatRecipients should chunk recipients (max 1000)` | Chunking |
| 🧪 Unit | `buildSendGridPayload should construct valid payload` | Payload building |
| 🧪 Unit | `buildSendGridPayload should include all required fields` | Field inclusion |
| 🧪 Unit | `buildSendGridPayload should handle optional fields` | Optional fields |
| 🔗 Integration | `send should call SendGrid API` | API call |
| 🔗 Integration | `send should handle success response` | Success handling |
| 🔗 Integration | `send should handle error response` | Error handling |
| 🔗 Integration | `send should implement timeout (5s) (AUDIT FIX EXT-H1)` | Timeout |
| 🔗 Integration | `send should retry on failure` | Retry logic |
| 🔗 Integration | `send should track metrics` | Metrics tracking |
| 🔗 Integration | `send should log API calls` | Logging |
| 🔗 Integration | `healthCheck should verify API connectivity` | Health check |

#### `src/providers/sms/twilio-sms.provider.ts` - Twilio SMS (AUDIT FIX EXT-H1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `formatPhoneNumber should add + prefix if missing` | Phone formatting |
| 🧪 Unit | `formatPhoneNumber should preserve existing + prefix` | Phone formatting |
| 🧪 Unit | `formatPhoneNumber should handle E.164 format` | Phone formatting |
| 🧪 Unit | `mapTwilioStatus should map "delivered" to "delivered"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "sent" to "sent"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "failed" to "failed"` | Status mapping |
| 🧪 Unit | `mapTwilioStatus should map "undelivered" to "bounced"` | Status mapping |
| 🔗 Integration | `send should call Twilio API` | API call |
| 🔗 Integration | `send should handle success response` | Success handling |
| 🔗 Integration | `send should handle error response` | Error handling |
| 🔗 Integration | `send should implement timeout (5s) (AUDIT FIX EXT-H1)` | Timeout |
| 🔗 Integration | `send should retry on failure` | Retry logic |
| 🔗 Integration | `send should track metrics` | Metrics tracking |
| 🔗 Integration | `healthCheck should verify API connectivity` | Health check |

#### `src/providers/email/mock-email.provider.ts` - Mock Email Provider

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `send should simulate email sending` | Simulation |
| 🧪 Unit | `send should simulate success (default)` | Success simulation |
| 🧪 Unit | `send should simulate failure (configurable)` | Failure simulation |
| 🧪 Unit | `send should simulate bounce (configurable)` | Bounce simulation |
| 🧪 Unit | `send should log to file (test mode)` | File logging |
| 🧪 Unit | `send should generate message ID` | ID generation |
| 🧪 Unit | `send should track metrics` | Metrics tracking |

#### `src/providers/sms/mock-sms.provider.ts` - Mock SMS Provider

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `send should simulate SMS sending` | Simulation |
| 🧪 Unit | `send should simulate success (default)` | Success simulation |
| 🧪 Unit | `send should simulate failure (configurable)` | Failure simulation |
| 🧪 Unit | `send should log to file (test mode)` | File logging |
| 🧪 Unit | `send should generate message ID` | ID generation |

#### `src/providers/webhook.provider.ts` - Webhook Provider

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateSignature should compute HMAC-SHA256` | Signature generation |
| 🧪 Unit | `generateSignature should use webhook secret` | Secret usage |
| 🧪 Unit | `generateSignature should be deterministic` | Determinism |
| 🔗 Integration | `send should POST to webhook URL` | HTTP POST |
| 🔗 Integration | `send should include signature header` | Header inclusion |
| 🔗 Integration | `send should handle success response` | Success handling |
| 🔗 Integration | `send should handle error response` | Error handling |
| 🔗 Integration | `send should retry on failure` | Retry logic |

---

### 11. Routes

#### `src/routes/health.routes.ts` - Health Endpoints (AUDIT FIX HC-H1)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /health should return 200` | Basic health |
| 🔗 Integration | `GET /health/startup should return 503 before startup` | Startup probe |
| 🔗 Integration | `GET /health/startup should return 200 after startup (AUDIT FIX HC-H1)` | Startup probe |
| 🔗 Integration | `GET /health/live should return 200 with process info` | Liveness probe |
| 🔗 Integration | `GET /health/ready should return 200 when all dependencies up` | Readiness probe |
| 🔗 Integration | `GET /health/ready should return 503 when database down` | Readiness probe |
| 🔗 Integration | `GET /health/ready should return 503 when Redis down` | Readiness probe |
| 🔗 Integration | `GET /health/ready should return 503 when RabbitMQ down` | Readiness probe |
| 🔗 Integration | `GET /health/detailed should return comprehensive info` | Detailed health |
| 🔗 Integration | `GET /health/db should return database health` | DB health |
| 🔗 Integration | `checkDatabase should verify Postgres connection` | DB check |
| 🔗 Integration | `checkRedis should verify Redis connection` | Redis check |
| 🔗 Integration | `checkRabbitMQ should verify RabbitMQ connection` | RabbitMQ check |

#### `src/routes/gdpr.routes.ts` - GDPR Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `POST /gdpr/export should require authentication` | Auth check |
| 🔗 Integration | `POST /gdpr/export should export user data as JSON` | Data export |
| 🔗 Integration | `POST /gdpr/export should include all user data` | Completeness |
| 🔗 Integration | `POST /gdpr/portability should return portable format` | Portability |
| 🔗 Integration | `POST /gdpr/delete should require confirmation` | Confirmation |
| 🔗 Integration | `POST /gdpr/delete should delete user data` | Deletion |
| 🔗 Integration | `POST /gdpr/delete should log audit trail` | Audit logging |
| 🔗 Integration | `GET /gdpr/processing-activities should return activities` | Activities |
| 🔗 Integration | `POST /gdpr/validate-deletion should check prerequisites` | Validation |
| 🔗 Integration | `GET /gdpr/retention-stats should require admin role` | Admin check |
| 🔗 Integration | `POST /gdpr/cleanup should require admin role` | Admin check |
| 🔗 Integration | `should enforce self-access (user can only access own data)| Access control | 
| 🔗 Integration |should allow admin to access any user data` | Admin access |

#### `src/routes/analytics.routes.ts` - Analytics Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /analytics/dashboard should require admin role` | Admin check |
| 🔗 Integration | `GET /analytics/dashboard should return metrics` | Metrics retrieval |
| 🔗 Integration | `GET /analytics/channel-breakdown should return by channel` | Channel breakdown |
| 🔗 Integration | `GET /analytics/hourly should return hourly stats` | Time series |
| 🔗 Integration | `GET /analytics/hourly should validate date range` | Date validation |
| 🔗 Integration | `GET /track/open/:token should return 1x1 gif` | Pixel tracking |
| 🔗 Integration | `GET /track/click should redirect to original URL` | Click tracking |
| 🔗 Integration | `should calculate date ranges correctly` | Date math |

#### `src/routes/preferences.routes.ts` - Preference Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /preferences should require authentication` | Auth check |
| 🔗 Integration | `GET /preferences should return user preferences` | Preference retrieval |
| 🔗 Integration | `PUT /preferences should update preferences` | Preference update |
| 🔗 Integration | `PUT /preferences should validate input` | Input validation |
| 🔗 Integration | `PUT /preferences should enforce self-access (non-admin)` | Access control |
| 🔗 Integration | `PUT /preferences should allow admin to update any user` | Admin access |
| 🔗 Integration | `GET /unsubscribe/:token should not require auth` | Public access |
| 🔗 Integration | `GET /unsubscribe/:token should unsubscribe user` | Unsubscribe |
| 🔗 Integration | `GET /preferences/can-send should check permission` | Permission check |

#### `src/routes/notification.routes.ts` - Notification Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `POST /send should require authentication` | Auth check |
| 🔗 Integration | `POST /send should validate request body` | Validation |
| 🔗 Integration | `POST /send should enforce rate limit` | Rate limiting |
| 🔗 Integration | `POST /send-batch should enforce batch rate limit` | Rate limiting |
| 🔗 Integration | `GET /status/:id should return notification status` | Status retrieval |

#### `src/routes/template.routes.ts` - Template Endpoints (⚠️ NO AUTH - SECURITY ISSUE)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `POST /templates should create template` | Template creation |
| 🔗 Integration | `GET /templates should list templates` | Template listing |
| 🔗 Integration | `GET /templates/:id should get template` | Template retrieval |
| 🔗 Integration | `PUT /templates/:id should update template` | Template update |
| 🔗 Integration | `DELETE /templates/:id should delete template` | Template deletion |
| 🔗 Integration | `GET /templates/:id/preview should preview template` | Template preview |
| 🔗 Integration | `GET /templates/:id/versions should return version history` | Version history |
| 🔗 Integration | `GET /templates/:id/stats should return usage stats` | Usage stats |
| 🔗 Integration | `⚠️ should require authentication for all endpoints` | Security fix needed |

#### `src/routes/campaign.routes.ts` - Campaign Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `all endpoints should require admin role` | Admin check |
| 🔗 Integration | `POST /campaigns should create campaign` | Campaign creation |
| 🔗 Integration | `GET /campaigns should list campaigns` | Campaign listing |
| 🔗 Integration | `PUT /campaigns/:id should update campaign` | Campaign update |
| 🔗 Integration | `DELETE /campaigns/:id should delete campaign` | Campaign deletion |
| 🔗 Integration | `POST /segments should create segment` | Segment creation |
| 🔗 Integration | `POST /automation-triggers should create trigger` | Trigger creation |
| 🔗 Integration | `POST /abandoned-carts should track cart` | Cart tracking |
| 🔗 Integration | `POST /ab-tests should create A/B test` | A/B test creation |
| 🔗 Integration | `POST /ab-tests/:id/start should start test` | Test start |
| 🔗 Integration | `POST /ab-tests/:id/winner should declare winner` | Winner declaration |

#### `src/routes/consent.routes.ts` - Consent Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `all endpoints should require authentication` | Auth check |
| 🔗 Integration | `POST /consent/grant should grant consent` | Consent grant |
| 🔗 Integration | `POST /consent/revoke should revoke consent` | Consent revoke |
| 🔗 Integration | `GET /consent/check should check consent` | Consent check |

#### `src/routes/metrics.routes.ts` - Metrics Endpoint

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /metrics should not require authentication` | Public access |
| 🔗 Integration | `GET /metrics should return Prometheus format` | Format |
| 🔗 Integration | `GET /metrics should include all custom metrics` | Completeness |

#### `src/routes/marketing.routes.ts` - Marketing Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should delegate to MarketingController` | Controller delegation |
| 🔗 Integration | `should handle all CRUD operations` | CRUD |

---

### 12. Schemas

#### `src/schemas/validation.ts` - JSON Schema Validation (AUDIT FIXES INP-H1, INP-H2, INP-H3)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `UUIDSchema should accept valid UUID v4` | UUID validation |
| 🧪 Unit | `UUIDSchema should reject invalid UUID format` | UUID validation |
| 🧪 Unit | `EmailSchema should accept valid email` | Email validation |
| 🧪 Unit | `EmailSchema should reject invalid email` | Email validation |
| 🧪 Unit | `PhoneSchema should accept valid E.164 format` | Phone validation |
| 🧪 Unit | `PhoneSchema should reject invalid phone` | Phone validation |
| 🧪 Unit | `SendEmailRequestSchema should accept single recipient` | Schema validation |
| 🧪 Unit | `SendEmailRequestSchema should accept array recipients` | Schema validation |
| 🧪 Unit | `SendEmailRequestSchema should reject >100 recipients (AUDIT FIX INP-H1)` | maxItems |
| 🧪 Unit | `SendEmailRequestSchema should require subject` | Required fields |
| 🧪 Unit | `SendEmailRequestSchema should enforce subject maxLength 500` | maxLength |
| 🧪 Unit | `SendEmailRequestSchema should accept optional cc/bcc` | Optional fields |
| 🧪 Unit | `SendEmailRequestSchema should reject >20 cc recipients (AUDIT FIX INP-H1)` | maxItems |
| 🧪 Unit | `SendEmailRequestSchema should reject >10 attachments (AUDIT FIX INP-H1)` | maxItems |
| 🧪 Unit | `SendEmailRequestSchema should reject unknown fields (additionalProperties: false) (AUDIT FIX INP-H2)` | additionalProperties |
| 🧪 Unit | `SendSmsRequestSchema should accept single recipient` | Schema validation |
| 🧪 Unit | `SendSmsRequestSchema should reject >100 recipients` | maxItems |
| 🧪 Unit | `SendSmsRequestSchema should enforce message maxLength 1600` | maxLength |
| 🧪 Unit | `SendPushRequestSchema should accept userIds 1-1000` | Schema validation |
| 🧪 Unit | `SendPushRequestSchema should reject >1000 userIds` | maxItems |
| 🧪 Unit | `SendPushRequestSchema should accept valid priority values` | Enum validation |
| 🧪 Unit | `SendPushRequestSchema should reject invalid priority` | Enum validation |
| 🧪 Unit | `SendPushRequestSchema should enforce TTL range 0-2419200` | Range validation |
| 🧪 Unit | `SendPushRequestSchema should enforce badge range 0-999` | Range validation |
| 🧪 Unit | `BatchNotificationRequestSchema should accept notifications 1-1000` | Schema validation |
| 🧪 Unit | `BatchNotificationRequestSchema should reject >1000 notifications` | maxItems |
| 🧪 Unit | `NotificationPreferencesSchema should validate nested email/sms/push objects` | Nested validation |
| 🧪 Unit | `NotificationPreferencesSchema should validate frequency enum` | Enum validation |
| 🧪 Unit | `NotificationPreferencesSchema should validate categories maxItems 20` | maxItems |
| 🧪 Unit | `NotificationPreferencesSchema should validate quietHours range 0-23` | Range validation |
| 🧪 Unit | `CreateCampaignRequestSchema should validate audience type enum` | Enum validation |
| 🧪 Unit | `CreateCampaignRequestSchema should validate userIds maxItems 100000` | maxItems |
| 🧪 Unit | `NotificationResponseSchema should validate status enum (AUDIT FIX INP-H3)` | Response schema |
| 🧪 Unit | `BatchNotificationResponseSchema should validate structure (AUDIT FIX INP-H3)` | Response schema |
| 🧪 Unit | `ErrorResponseSchema should validate RFC 7807 format (AUDIT FIX INP-H3)` | Response schema |
| 🧪 Unit | `toFastifySchema should convert TypeBox schema to Fastify format` | Schema conversion |
| 🧪 Unit | `toFastifySchema should include response schemas` | Response mapping |

---

### 13. Services (29 FILES - LARGEST SECTION)

#### `src/services/ab-test.service.ts` - A/B Testing

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `hashUserId should generate deterministic hash 0-1 range` | Hash generation |
| 🧪 Unit | `hashUserId should be consistent for same user` | Determinism |
| 🧪 Unit | `hashUserId should produce distributed distribution` | Distribution |
| 🧪 Unit | `selectVariant should allocate based on traffic split` | Variant selection |
| 🧪 Unit | `selectVariant should use cumulative probability` | Probability logic |
| 🧪 Unit | `selectVariant should handle edge cases (empty split)` | Edge cases |
| 🔗 Integration | `createTest should create A/B test in database` | Database operation |
| 🔗 Integration | `trackConversion should record metric` | Metric tracking |
| 🔗 Integration | `getResults should aggregate metrics by variant` | Aggregation |
| 🔗 Integration | `declareWinner should set winner and complete test` | Winner declaration |

#### `src/services/audit-log.service.ts` - Audit Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `log should insert audit log entry` | Database insert |
| 🔗 Integration | `log should not throw on failure (fail gracefully)` | Error handling |
| 🔗 Integration | `logPIIAccess should record PII access with details` | PII logging |
| 🔗 Integration | `logDataExport should record export request` | Export logging |
| 🔗 Integration | `logDataDeletion should record deletion request` | Deletion logging |
| 🔗 Integration | `logConsentChange should record consent grant/revoke` | Consent logging |
| 🔗 Integration | `logPreferenceUpdate should record preference changes` | Preference logging |
| 🔗 Integration | `logNotificationSent should record notification` | Notification logging |
| 🔗 Integration | `logAdminAction should record admin action` | Admin logging |
| 🔗 Integration | `query should filter by userId (actor OR subject)` | Query filtering |
| 🔗 Integration | `query should filter by action type` | Query filtering |
| 🔗 Integration | `query should filter by date range` | Query filtering |
| 🔗 Integration | `getUserAuditTrail should return user's full trail` | Audit trail |
| 🔗 Integration | `getCriticalEvents should filter by severity` | Severity filtering |
| 🔗 Integration | `getPIIAccessLogs should return PII access logs` | PII logs |
| 🔗 Integration | `cleanup should delete old non-critical logs` | Cleanup logic |
| 🔗 Integration | `cleanup should preserve critical events` | Preservation logic |

#### `src/services/automation.service.ts` - Marketing Automation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `initializeAutomations should load enabled triggers` | Initialization |
| 🔗 Integration | `createAutomation should create trigger in database` | Database insert |
| 🔗 Integration | `setupTimeTrigger should schedule cron job` | Cron scheduling |
| 🔗 Integration | `setupEventTrigger should register event listener` | Event registration |
| 🔗 Integration | `setupBehaviorTrigger should configure behavior check` | Behavior setup |
| 🔗 Integration | `executeActions should execute all configured actions` | Action execution |
| 🔗 Integration | `executeSendNotification should send notifications` | Notification sending |
| 🔗 Integration | `checkAbandonedCarts should find abandoned carts (>2 hours)` | Cart check |
| 🔗 Integration | `checkAbandonedCarts should trigger automation` | Trigger execution |
| 🔗 Integration | `checkReEngagement should find inactive customers (>30 days)` | Engagement check |

#### `src/services/cache-integration.ts` - Cache Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export cache service` | Export |
| 🧪 Unit | `should export cache middleware` | Export |
| 🧪 Unit | `should configure Redis with service-specific key prefix` | Config |
| 🧪 Unit | `should configure TTLs for different data types` | TTL config |

#### `src/services/campaign.service.ts` - Campaign Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateSegmentSize should build query from filter criteria` | Query building |
| 🧪 Unit | `calculateSegmentSize should count users matching filters` | Counting |
| 🧪 Unit | `checkTriggerConditions should evaluate conditions` | Condition checking |
| 🔗 Integration | `createCampaign should insert campaign in database` | Database insert |
| 🔗 Integration | `sendCampaign should get audience and send to all` | Campaign sending |
| 🔗 Integration | `sendCampaign should update stats (sent/failed counts)` | Stats update |
| 🔗 Integration | `getCampaignStats should return aggregated stats` | Stats retrieval |
| 🔗 Integration | `createSegment should calculate member count` | Segment creation |
| 🔗 Integration | `refreshSegment should recalculate member count` | Segment refresh |
| 🔗 Integration | `createAutomationTrigger should create trigger` | Trigger creation |
| 🔗 Integration | `processAutomationTrigger should fire matching triggers` | Trigger processing |
| 🔗 Integration | `trackAbandonedCart should insert cart record` | Cart tracking |
| 🔗 Integration | `processAbandonedCarts should email abandoned carts (>1 hour)` | Cart processing |
| 🔗 Integration | `createABTest should create test with variants` | A/B test creation |
| 🔗 Integration | `startABTest should change status to running` | Test start |
| 🔗 Integration | `recordABTestResult should increment variant metrics` | Metric recording |
| 🔗 Integration | `determineABTestWinner should select best variant` | Winner selection |

#### `src/services/compliance.service.ts` - Compliance Checks

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `checkCompliance should check suppression list first` | Priority check |
| 🔗 Integration | `checkCompliance should check consent for marketing` | Consent check |
| 🔗 Integration | `checkCompliance should skip consent for transactional` | Consent bypass |
| 🔗 Integration | `checkCompliance should check SMS time window (8am-9pm)` | Time restriction |
| 🔗 Integration | `checkCompliance should fail closed on error` | Error handling |
| 🔗 Integration | `recordConsent should create consent record` | Consent creation |
| 🔗 Integration | `revokeConsent should revoke consent` | Consent revocation |
| 🔗 Integration | `addToSuppressionList should add to suppression` | Suppression add |
| 🔗 Integration | `removeFromSuppressionList should remove from suppression` | Suppression remove |

#### `src/services/dashboard.service.ts` - Dashboard Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `getOverview should return aggregated metrics` | Overview metrics |
| 🔗 Integration | `getOverview should calculate delivery rate` | Rate calculation |
| 🔗 Integration | `getOverview should group by channel` | Channel grouping |
| 🔗 Integration | `getCampaignMetrics should return campaign stats` | Campaign metrics |
| 🔗 Integration | `getChannelPerformance should compare channels` | Channel comparison |
| 🔗 Integration | `getRealTimeMetrics should return current state` | Real-time metrics |
| 🔗 Integration | `getTopTemplates should rank by usage` | Template ranking |
| 🔗 Integration | `getEngagementFunnel should return funnel stages` | Funnel metrics |
| 🔗 Integration | `exportAnalytics should export as JSON` | JSON export |
| 🔗 Integration | `exportAnalytics should export as CSV` | CSV export |

#### `src/services/data-retention.service.ts` - Data Retention

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getCutoffDate should calculate date N days ago` | Date calculation |
| 🔗 Integration | `runCleanup should delete old notifications (>90 days)` | Cleanup |
| 🔗 Integration | `runCleanup should delete old notification_history` | Cleanup |
| 🔗 Integration | `runCleanup should delete old webhook_events` | Cleanup |
| 🔗 Integration | `runCleanup should delete old audit_logs (non-critical)` | Cleanup |
| 🔗 Integration | `runCleanup should preserve critical audit logs` | Preservation |
| 🔗 Integration | `anonymizeUserData should clear PII fields` | Anonymization |
| 🔗 Integration | `anonymizeUserData should set anonymized_at timestamp` | Timestamp |
| 🔗 Integration | `deleteUserData should delete all user records` | Hard deletion |
| 🔗 Integration | `deleteUserData should respect FK cascade order` | Deletion order |
| 🔗 Integration | `deleteUserData should preserve audit logs` | Log preservation |
| 🔗 Integration | `getRetentionStats should count old records` | Stats retrieval |
| 🔗 Integration | `getUserDataSize should count user's records` | Size calculation |

#### `src/services/delivery-metrics.service.ts` - Delivery Metrics (SQL INJECTION FIX)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTimeSeriesMetrics should validate period parameter (whitelist) (SQL INJECTION FIX)` | SQL injection prevention |
| 🧪 Unit | `getTimeSeriesMetrics should validate metric parameter (whitelist) (SQL INJECTION FIX)` | SQL injection prevention |
| 🧪 Unit | `getTimeSeriesMetrics should throw error for invalid period` | Validation |
| 🧪 Unit | `getTimeSeriesMetrics should throw error for invalid metric` | Validation |
| 🧪 Unit | `calculateChannelMetrics should calculate delivery rate` | Rate calculation |
| 🧪 Unit | `calculateChannelMetrics should calculate bounce rate` | Rate calculation |
| 🧪 Unit | `calculateChannelMetrics should calculate average cost` | Cost calculation |
| 🔗 Integration | `getDeliveryMetrics should aggregate from database` | Database aggregation |
| 🔗 Integration | `getDeliveryMetrics should cache results (5 min TTL)` | Caching |
| 🔗 Integration | `getEngagementMetrics should calculate open/click rates` | Engagement metrics |
| 🔗 Integration | `getCostMetrics should aggregate costs by channel` | Cost metrics |
| 🔗 Integration | `getCostMetrics should calculate cost per recipient` | Cost calculation |
| 🔗 Integration | `getVenueHealthScore should calculate score 0-100` | Health scoring |
| 🔗 Integration | `getTimeSeriesMetrics should return time series data` | Time series |
| 🔗 Integration | `getTopPerformingTemplates should rank by performance` | Template ranking |
| 🔗 Integration | `generateComplianceReport should include consent/suppression stats` | Compliance reporting |

#### `src/services/delivery-tracker.ts` - Delivery Tracking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `shouldRetry should return false for delivered status` | Retry logic |
| 🧪 Unit | `shouldRetry should return false for bounced status` | Retry logic |
| 🧪 Unit | `shouldRetry should return true for failed status (within max attempts)` | Retry logic |
| 🧪 Unit | `shouldRetry should return false when max attempts exceeded` | Retry logic |
| 🔗 Integration | `trackDelivery should update notification_history` | Database update |
| 🔗 Integration | `trackDelivery should update daily stats` | Stats update |
| 🔗 Integration | `trackDelivery should schedule retry if needed` | Retry scheduling |
| 🔗 Integration | `scheduleRetry should add job to Bull queue` | Queue operation |
| 🔗 Integration | `scheduleRetry should use exponential backoff (5s, 30s, 5m)` | Backoff delays |
| 🔗 Integration | `retryNotification should re-send notification` | Retry execution |
| 🔗 Integration | `getDeliveryStats should aggregate by channel` | Stats aggregation |
| 🔗 Integration | `getPendingRetries should find retryable notifications` | Retry query |

#### `src/services/engagement-tracking.service.ts` - Engagement Tracking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateTrackingToken should create HMAC-signed token` | Token generation |
| 🧪 Unit | `generateTrackingToken should include expiry (30 days)` | Expiry |
| 🧪 Unit | `verifyTrackingToken should validate signature` | Signature verification |
| 🧪 Unit | `verifyTrackingToken should check expiry` | Expiry check |
| 🧪 Unit | `verifyTrackingToken should use timing-safe comparison` | Security |
| 🧪 Unit | `wrapLinksForTracking should replace all links` | Link wrapping |
| 🧪 Unit | `generateTrackingPixel should create 1x1 img tag` | Pixel generation |
| 🧪 Unit | `getEngagementScore should calculate score 0-100` | Score calculation |
| 🔗 Integration | `trackOpen should update notification_tracking` | Database update |
| 🔗 Integration | `trackOpen should increment open_count` | Counter update |
| 🔗 Integration | `trackOpen should record engagement event` | Event recording |
| 🔗 Integration | `trackClick should update notification_tracking` | Database update |
| 🔗 Integration | `trackClick should track URL in click_data` | URL tracking |
| 🔗 Integration | `trackClick should record engagement event` | Event recording |
| 🔗 Integration | `trackConversion should record conversion event` | Conversion tracking |
| 🔗 Integration | `getEngagementScore should query last 30 days activity` | Score query |

#### `src/services/gdpr.service.ts` - GDPR Compliance

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `exportUserData should fetch from 7 tables` | Data export |
| 🔗 Integration | `exportUserData should decrypt PII fields` | PII decryption |
| 🔗 Integration | `exportUserData should log audit trail` | Audit logging |
| 🔗 Integration | `exportUserData should include data size` | Size calculation |
| 🔗 Integration | `deleteUserData should call anonymizeUserData by default` | Anonymization |
| 🔗 Integration | `deleteUserData should hard delete when method=hard_delete` | Hard deletion |
| 🔗 Integration | `deleteUserData should log audit trail` | Audit logging |
| 🔗 Integration | `hasOptedOutCompletely should check all consents` | Opt-out check |
| 🔗 Integration | `getPortabilityData should return machine-readable format` | Portability |
| 🔗 Integration | `getProcessingActivities should return GDPR Article 30 info` | Processing activities |
| 🔗 Integration | `validateDeletionRequest should check pending notifications` | Validation |
| 🔗 Integration | `validateDeletionRequest should check legal hold` | Validation |
| 🔗 Integration | `scheduleDeletion should insert pending_deletions record` | Deletion scheduling |

#### `src/services/i18n.service.ts` - Internationalization

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `translate should replace variables {{varName}}` | Variable replacement |
| 🧪 Unit | `translate should return key when translation missing` | Fallback |
| 🧪 Unit | `translate should use default language (en) when invalid` | Language fallback |
| 🧪 Unit | `detectLanguage should detect Chinese characters` | Language detection |
| 🧪 Unit | `detectLanguage should detect Japanese characters` | Language detection |
| 🧪 Unit | `detectLanguage should detect French characters` | Language detection |
| 🧪 Unit | `detectLanguage should detect Spanish characters` | Language detection |
| 🧪 Unit | `detectLanguage should detect German characters` | Language detection |
| 🧪 Unit | `detectLanguage should detect Portuguese characters` | Language detection |
| 🧪 Unit | `detectLanguage should default to English` | Default detection |
| 🧪 Unit | `formatDate should use locale-specific formatting` | Date formatting |
| 🧪 Unit | `formatCurrency should use Intl.NumberFormat` | Currency formatting |
| 🧪 Unit | `setNestedProperty should handle nested paths` | Property setter |
| 🧪 Unit | `getNestedProperty should retrieve nested values` | Property getter |
| 🔗 Integration | `loadTranslations should load from database` | Translation loading |
| 🔗 Integration | `translateTemplate should call translation API` | Template translation |

#### `src/services/marketing.service.ts` - Marketing Service (MongoDB)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `createCampaign should insert in MongoDB` | Document creation |
| 🔗 Integration | `updateCampaign should update document` | Document update |
| 🔗 Integration | `deleteCampaign should delete document` | Document deletion |
| 🔗 Integration | `publishCampaign should set status to active` | Status update |
| 🔗 Integration | `pauseCampaign should set status to paused` | Status update |
| 🔗 Integration | `createABTest should create variants` | A/B test creation |
| 🔗 Integration | `getABTestResults should return variant metrics` | Metrics retrieval |
| 🔗 Integration | `declareWinner should set winnerVariantId` | Winner declaration |
| 🔗 Integration | `trackImpression should increment impression count` | Metric tracking |
| 🔗 Integration | `trackClick should increment click count` | Metric tracking |
| 🔗 Integration | `trackConversion should increment conversion and revenue` | Metric tracking |
| 🔗 Integration | `getPerformanceMetrics should calculate ROI` | Performance calculation |

#### `src/services/metrics-aggregator.service.ts` - Metrics Aggregation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateChannelMetrics should aggregate by channel` | Aggregation |
| 🧪 Unit | `calculateChannelMetrics should calculate rates` | Rate calculation |
| 🔗 Integration | `getDashboardMetrics should fetch 4 parallel aggregations` | Parallel queries |
| 🔗 Integration | `getRealtimeMetrics should query last minute` | Real-time query |
| 🔗 Integration | `getLastHourMetrics should query last hour` | Hourly query |
| 🔗 Integration | `getLast24HourMetrics should query last 24 hours` | Daily query |
| 🔗 Integration | `getChannelMetrics should aggregate email/sms separately` | Channel separation |
| 🔗 Integration | `getDeliveryRate should calculate delivery rate` | Rate calculation |
| 🔗 Integration | `getBounceRate should calculate bounce rate` | Rate calculation |
| 🔗 Integration | `getAverageSendTime should calculate avg response time` | Time calculation |
| 🔗 Integration | `getUnsubscribeRate should calculate unsubscribe rate` | Rate calculation |
| 🔗 Integration | `getCostPerNotification should calculate avg cost` | Cost calculation |

#### `src/services/metrics.service.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export metrics registry` | Registry export |
| 🧪 Unit | `trackNotificationSent should increment counter` | Counter increment |
| 🧪 Unit | `trackNotificationDelivery should increment counter` | Counter increment |
| 🧪 Unit | `trackNotificationError should increment counter` | Counter increment |
| 🧪 Unit | `setQueueDepth should set gauge` | Gauge setting |
| 🧪 Unit | `setProviderStatus should set gauge (0 or 1)` | Gauge setting |
| 🧪 Unit | `recordNotificationSendDuration should observe histogram` | Histogram observation |
| 🧪 Unit | `recordProviderResponseTime should observe histogram` | Histogram observation |
| 🧪 Unit | `recordBatchSize should observe summary` | Summary observation |
| 🧪 Unit | `incrementCounter should create and increment custom counter` | Generic counter |
| 🧪 Unit | `setGauge should create and set custom gauge` | Generic gauge |
| 🔗 Integration | `getMetrics should return Prometheus format` | Metrics export |

#### `src/services/notification-analytics.service.ts` - Notification Analytics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTimeSeriesMetrics should validate period whitelist (SQL injection fix)` | SQL injection prevention |
| 🧪 Unit | `getTimeSeriesMetrics should validate metric whitelist (SQL injection fix)` | SQL injection prevention |
| 🔗 Integration | `trackSent should update hourly metrics` | Metric tracking |
| 🔗 Integration | `trackDelivery should update status counts` | Status tracking |
| 🔗 Integration | `trackEngagement should record engagement event` | Engagement tracking |
| 🔗 Integration | `trackClick should record click event` | Click tracking |
| 🔗 Integration | `getMetrics should aggregate for date range` | Date range query |
| 🔗 Integration | `getChannelMetrics should group by channel` | Channel grouping |
| 🔗 Integration | `getHourlyBreakdown should return hourly data` | Hourly breakdown |
| 🔗 Integration | `getTopNotificationTypes should rank by usage` | Type ranking |
| 🔗 Integration | `getUserEngagement should calculate user stats` | User stats |
| 🔗 Integration | `generateTrackingPixel should return data URL` | Pixel generation |
| 🔗 Integration | `generateTrackedLink should construct tracking URL` | Link generation |

#### `src/services/notification-orchestrator.ts` - Orchestration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `initialize should load translations` | Translation loading |
| 🔗 Integration | `initialize should initialize automations` | Automation init |
| 🔗 Integration | `initialize should start background jobs` | Job scheduling |
| 🔗 Integration | `generateDailyAnalytics should loop through venues` | Venue loop |
| 🔗 Integration | `generateDailyAnalytics should calculate health scores` | Health calculation |
| 🔗 Integration | `generateDailyAnalytics should store aggregated metrics` | Metric storage |
| 🔗 Integration | `sendTicketConfirmation should generate wallet passes` | Wallet pass generation |
| 🔗 Integration | `sendTicketConfirmation should send multi-channel notification` | Multi-channel send |

#### `src/services/notification.service.ts` - Core Notification Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getSubjectForTemplate should return correct subject` | Subject generation |
| 🧪 Unit | `getProviderName should select provider based on mode` | Provider selection |
| 🔗 Integration | `send should check consent` | Consent check |
| 🔗 Integration | `send should store notification record` | Database insert |
| 🔗 Integration | `send should route to correct channel handler` | Routing |
| 🔗 Integration | `send should track metrics` | Metrics tracking |
| 🔗 Integration | `sendEmail should fetch venue branding` | Branding fetch |
| 🔗 Integration | `sendEmail should render template with Handlebars` | Template rendering |
| 🔗 Integration | `sendEmail should merge branding data` | Data merging |
| 🔗 Integration | `sendEmail should use venue's custom email (white-label)` | White-label support |
| 🔗 Integration | `sendEmail should call emailProvider.send()` | Provider call |
| 🔗 Integration | `sendSMS should call smsProvider.send()` | Provider call |
| 🔗 Integration | `sendPush should call pushProvider.send()` | Provider call |
| 🔗 Integration | `checkConsent should query consent_records` | Consent query |
| 🔗 Integration | `loadTemplates should load all .hbs files` | Template loading |

#### `src/services/preference-manager.ts` - Preference Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isQuietHours should check time window` | Time check |
| 🧪 Unit | `isQuietHours should handle overnight quiet hours` | Overnight handling |
| 🧪 Unit | `isCritical should identify critical message types` | Type identification |
| 🧪 Unit | `getTodayCount should count today's notifications` | Count calculation |
| 🔗 Integration | `getPreferences should return from cache if available` | Cache hit |
| 🔗 Integration | `getPreferences should query database on cache miss` | Cache miss |
| 🔗 Integration | `getPreferences should create defaults if not exists` | Default creation |
| 🔗 Integration | `updatePreferences should update database` | Database update |
| 🔗 Integration | `updatePreferences should record history` | History recording |
| 🔗 Integration | `updatePreferences should clear cache` | Cache invalidation |
| 🔗 Integration | `canSendNotification should check channel enabled` | Channel check |
| 🔗 Integration | `canSendNotification should check category preferences` | Category check |
| 🔗 Integration | `canSendNotification should respect quiet hours` | Quiet hours check |
| 🔗 Integration | `canSendNotification should check daily limits` | Limit check |
| 🔗 Integration | `unsubscribe should disable all channels` | Unsubscribe |
| 🔗 Integration | `unsubscribe should add to suppression list` | Suppression add |
| 🔗 Integration | `generateUnsubscribeLink should create signed URL` | Link generation |

#### `src/services/preference.service.ts` - Preference Service (AUDIT FIX MT-2)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTenantId should extract from context` | Tenant extraction |
| 🧪 Unit | `getTenantId should throw when tenant missing (AUDIT FIX MT-2)` | Validation |
| 🔗 Integration | `getPreferences should filter by tenant_id (AUDIT FIX MT-2)` | Tenant filtering |
| 🔗 Integration | `updatePreferences should filter by tenant_id (AUDIT FIX MT-2)` | Tenant filtering |
| 🔗 Integration | `getUnsubscribeToken should include tenant in token (AUDIT FIX MT-2)` | Tenant inclusion |
| 🔗 Integration | `processUnsubscribe should use tenant from token (AUDIT FIX MT-2)` | Tenant extraction |
| 🔗 Integration | `exportCustomerData should filter all queries by tenant_id (AUDIT FIX MT-2)` | Tenant filtering |
| 🔗 Integration | `isCustomerSuppressed should filter by tenant_id (AUDIT FIX MT-2)` | Tenant filtering |

#### `src/services/provider-manager.service.ts` - Provider Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initializeProviders should create health tracking for all providers` | Initialization |
| 🧪 Unit | `recordSuccess should increment success count and clear failures` | Success recording |
| 🧪 Unit | `recordFailure should increment failure count` | Failure recording |
| 🧪 Unit | `recordFailure should mark unhealthy after 3 failures` | Threshold check |
| 🔗 Integration | `getHealthyEmailProvider should return SendGrid when healthy` | Provider selection |
| 🔗 Integration | `getHealthyEmailProvider should failover to AWS SES when SendGrid unhealthy` | Failover |
| 🔗 Integration | `getHealthySmsProvider should return Twilio when healthy` | Provider selection |
| 🔗 Integration | `getHealthySmsProvider should failover to AWS SNS when Twilio unhealthy` | Failover |
| 🔗 Integration | `checkProviderHealth should update health status` | Health check |
| 🔗 Integration | `getProviderStatus should return all provider statuses` | Status retrieval |

#### `src/services/queue-manager.service.ts` - Queue Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateDelay should return delay based on priority` | Delay calculation |
| 🔗 Integration | `initializeQueues should create 4 queues (critical, high, normal, bulk)` | Queue creation |
| 🔗 Integration | `addToQueue should add job to correct queue` | Job addition |
| 🔗 Integration | `addToQueue should set priority` | Priority setting |
| 🔗 Integration | `getQueueMetrics should return counts for all queues` | Metrics retrieval |
| 🔗 Integration | `pauseQueue should pause queue` | Queue pause |
| 🔗 Integration | `resumeQueue should resume queue` | Queue resume |
| 🔗 Integration | `drainQueue should empty queue` | Queue drain |
| 🔗 Integration | `setupQueueProcessors should register processors` | Processor setup |

#### `src/services/queue.service.ts` - BullMQ Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `initialize should create all queues` | Queue creation |
| 🔗 Integration | `initialize should attach event listeners` | Event attachment |
| 🔗 Integration | `addNotificationJob should add job to queue` | Job addition |
| 🔗 Integration | `addNotificationJob should set priority and delay` | Job options |
| 🔗 Integration | `addNotificationJob should track metrics` | Metrics tracking |
| 🔗 Integration | `getQueueStats should return counts` | Stats retrieval |
| 🔗 Integration | `startMetricsTracking should update metrics every 10s` | Metrics interval |
| 🔗 Integration | `close should close all queues` | Cleanup |

#### `src/services/rate-limiter.ts` - Rate Limiter Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initializeConfigs should set up rate limit configs` | Config initialization |
| 🔗 Integration | `checkLimit should use sliding window algorithm` | Sliding window |
| 🔗 Integration | `checkLimit should return allowed=true for first request` | First request |
| 🔗 Integration | `checkLimit should increment counter` | Counter update |
| 🔗 Integration | `checkLimit should block when limit exceeded` | Blocking |
| 🔗 Integration | `checkLimit should calculate retry time` | Retry calculation |
| 🔗 Integration | `checkLimit should reset after window expires` | Window reset |
| 🔗 Integration | `checkLimit should fail open on Redis error` | Fault tolerance |
| 🔗 Integration | `checkMultiple should check multiple limits` | Multiple checks |
| 🔗 Integration | `reset should delete rate limit key` | Reset |
| 🔗 Integration | `getStatus should return current status` | Status retrieval |
| 🔗 Integration | `canSendNotification should check user and global limits` | Dual check |
| 🔗 Integration | `recordNotificationSent should update counters` | Counter update |

#### `src/services/retry.service.ts` - Retry Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isRetryableError should return false for permanent errors` | Error classification |
| 🧪 Unit | `isRetryableError should return true for temporary errors` | Error classification |
| 🧪 Unit | `isRetryableError should default to true for unknown errors` | Default behavior |
| 🧪 Unit | `shouldRetry should check max attempts` | Attempt check |
| 🧪 Unit | `shouldRetry should check error type` | Error type check |
| 🧪 Unit | `shouldRetry should calculate exponential backoff delay` | Delay calculation |
| 🧪 Unit | `shouldRetry should cap delay at maxDelay` | Max delay |
| 🔗 Integration | `shouldRetry should update retry count in database` | Database update |
| 🔗 Integration | `shouldRetry should set next_retry_at timestamp` | Timestamp update |
| 🔗 Integration | `recordRetryMetrics should increment success/failure count` | Metrics tracking |

#### `src/services/rich-media.service.ts` - Rich Media

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateEmailHTML should create HTML from images` | HTML generation |
| 🧪 Unit | `generateEmailHTML should create HTML from buttons` | HTML generation |
| 🧪 Unit | `generateEmailHTML should create HTML from cards` | HTML generation |
| 🧪 Unit | `generateEmailHTML should map button style to color` | Style mapping |
| 🧪 Unit | `generateAMPEmail should create AMP-compatible email` | AMP generation |
| 🧪 Unit | `generateAMPEmail should create carousel for multiple images` | Carousel creation |
| 🔗 Integration | `processImages should optimize images` | Image processing |
| 🔗 Integration | `processImages should upload to CDN` | CDN upload |

#### `src/services/scheduler.service.ts` - Scheduled Notifications

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateNextOccurrence should add 1 day for daily` | Date calculation |
| 🧪 Unit | `calculateNextOccurrence should add 7 days for weekly` | Date calculation |
| 🧪 Unit | `calculateNextOccurrence should add 1 month for monthly` | Date calculation |
| 🔗 Integration | `scheduleNotification should insert scheduled_notifications record` | Database insert |
| 🔗 Integration | `getDueNotifications should query notifications due now` | Query |
| 🔗 Integration | `processDueNotifications should add to queue` | Queue addition |
| 🔗 Integration | `processDueNotifications should mark as sent` | Status update |
| 🔗 Integration | `processDueNotifications should schedule next occurrence for recurring` | Recurring logic |
| 🔗 Integration | `cancelScheduled should update status to cancelled` | Cancellation |
| 🔗 Integration | `listScheduled should return paginated list` | Pagination |

#### `src/services/segmentation.service.ts` - Audience Segmentation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `evaluateRules should evaluate eq operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should evaluate ne operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should evaluate gt operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should evaluate lt operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should evaluate in operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should evaluate contains operator` | Rule evaluation |
| 🧪 Unit | `evaluateRules should use AND logic across rules` | Logic |
| 🧪 Unit | `getNestedValue should extract nested properties` | Property extraction |
| 🔗 Integration | `createSegment should insert segment in database` | Database insert |
| 🔗 Integration | `matchesSegment should check if user matches rules` | Matching |
| 🔗 Integration | `getSegmentUsers should return matching user IDs` | User retrieval |
| 🔗 Integration | `listSegments should return all segments` | Listing |

#### `src/services/spam-score.service.ts` - Spam Scoring (100% Unit Testable - GOLDMINE)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkSpamWords should score high-risk words (3 points each)` | Word scoring |
| 🧪 Unit | `checkSpamWords should score medium-risk words (2 points each)` | Word scoring |
| 🧪 Unit | `checkSpamWords should score low-risk words (1 point each, >3 count)` | Word scoring |
| 🧪 Unit | `checkCapitalization should score >30% caps as 3 points` | Cap scoring |
| 🧪 Unit | `checkCapitalization should score >20% caps as 1 point` | Cap scoring |
| 🧪 Unit | `checkPunctuation should score excessive exclamation (>5 as 2 points)` | Punctuation scoring |
| 🧪 Unit | `checkPunctuation should score multiple exclamation (>3 as 1 point)` | Punctuation scoring |
| 🧪 Unit | `checkPunctuation should score excessive questions (>5 as 1 point)` | Punctuation scoring |
| 🧪 Unit | `checkPunctuation should score money symbols ($$$) as 2 points` | Symbol scoring |
| 🧪 Unit | `checkLinks should score >10 links as 3 points` | Link scoring |
| 🧪 Unit | `checkLinks should score >5 links as 1 point` | Link scoring |
| 🧪 Unit | `checkLinks should score URL shorteners as 2 points` | Shortener scoring |
| 🧪 Unit | `checkImageRatio should score image-heavy emails (text<100, images>1) as 2 points` | Image scoring |
| 🧪 Unit | `checkSubjectLine should score all caps subject as 2 points` | Subject scoring |
| 🧪 Unit | `checkSubjectLine should score fake RE:/FWD: as 3 points` | Subject scoring |
| 🧪 Unit | `checkSubjectLine should score short subject (<3 chars) as 1 point` | Subject scoring |
| 🧪 Unit | `checkContent should aggregate all scores` | Total scoring |
| 🧪 Unit | `checkContent should set passed=true when score ≤5` | Pass threshold |
| 🧪 Unit | `checkContent should set passed=false when score >5` | Fail threshold |
| 🧪 Unit | `checkContent should return flags array` | Flag collection |
| 🧪 Unit | `checkContent should return recommendations` | Recommendation generation |

#### `src/services/template-registry.ts` - Template Registry

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registerTemplates should register all email templates` | Registration |
| 🧪 Unit | `registerTemplates should register all SMS templates` | Registration |
| 🧪 Unit | `getTemplate should return template info` | Retrieval |
| 🧪 Unit | `getTemplate should return undefined for unknown template` | Not found |
| 🧪 Unit | `getAllTemplates should return all registered templates` | Listing |
| 🧪 Unit | `getTemplatesByChannel should filter by channel` | Filtering |
| 🧪 Unit | `validateTemplate should check for missing variables` | Validation |
| 🧪 Unit | `validateTemplate should return empty array when valid` | Validation |
| 🔗 Integration | `renderTemplate should render Handlebars template` | Rendering |
| 🔗 Integration | `renderTemplate should replace variables` | Variable substitution |
| 🔗 Integration | `renderTemplate should return subject and body` | Output format |

#### `src/services/template.service.ts` - Template Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registerHelpers should register Handlebars helpers` | Helper registration |
| 🧪 Unit | `formatDate helper should format dates` | Helper function |
| 🧪 Unit | `formatCurrency helper should format currency` | Helper function |
| 🧪 Unit | `eq helper should compare equality` | Helper function |
| 🧪 Unit | `gt helper should compare greater than` | Helper function |
| 🔗 Integration | `getTemplate should check cache first` | Cache hit |
| 🔗 Integration | `getTemplate should query database on cache miss` | Cache miss |
| 🔗 Integration | `getTemplate should prioritize venue-specific templates` | Template override |
| 🔗 Integration | `getTemplate should fall back to default templates` | Fallback |
| 🔗 Integration | `renderTemplate should compile and cache templates` | Compilation |
| 🔗 Integration | `renderTemplate should execute Handlebars helpers` | Helper execution |
| 🔗 Integration | `createTemplate should insert in database` | Database insert |
| 🔗 Integration | `updateTemplate should update and invalidate cache` | Update + cache invalidation |
| 🔗 Integration | `listTemplates should return paginated templates` | Pagination |
| 🔗 Integration | `deleteTemplate should soft delete (set is_active=false)` | Soft deletion |
| 🔗 Integration | `previewTemplate should render with sample data` | Preview |
| 🔗 Integration | `getVersionHistory should return template versions` | Version history |
| 🔗 Integration | `getUsageStats should return usage statistics` | Stats |

#### `src/services/wallet-pass.service.ts` - Wallet Pass Generation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `formatDate should format date with locale` | Date formatting |
| 🧪 Unit | `generatePassQRCode should create QR code data URL` | QR generation |
| 🧪 Unit | `generatePassQRCode should sign data with HMAC` | Signature |
| 🔗 Integration | `generateApplePass should create pass.json structure` | Apple pass |
| 🔗 Integration | `generateApplePass should include all required fields` | Field inclusion |
| 🔗 Integration | `generateGooglePass should create JWT structure` | Google pass |
| 🔗 Integration | `generateGooglePass should return save URL` | URL generation |

---

### 14. Utils

#### `src/utils/encryption.util.ts` - PII Encryption (50+ TESTS - GOLDMINE)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isEnabled should return true when ENCRYPTION_MASTER_KEY set and ≥32 chars` | Config check |
| 🧪 Unit | `isEnabled should return false with no key` | Config check |
| 🧪 Unit | `constructor should throw error if key <32 chars` | Validation |
| 🧪 Unit | `deriveKey should use PBKDF2 with 100k iterations` | Key derivation |
| 🧪 Unit | `deriveKey should use SHA-256` | Hash algorithm |
| 🧪 Unit | `deriveKey should generate 32-byte key` | Key length |
| 🧪 Unit | `deriveKey should cache keys by salt` | Caching |
| 🧪 Unit | `encrypt should generate random salt (64 bytes)` | Salt generation |
| 🧪 Unit | `encrypt should generate random IV (16 bytes)` | IV generation |
| 🧪 Unit | `encrypt should return format: salt.iv.authTag.ciphertext` | Format |
| 🧪 Unit | `encrypt should base64-encode all components` | Encoding |
| 🧪 Unit | `encrypt should return plaintext when disabled` | Disabled mode |
| 🧪 Unit | `encrypt should handle empty string` | Edge case |
| 🧪 Unit | `decrypt should parse 4-part format` | Format parsing |
| 🧪 Unit | `decrypt should validate auth tag` | Auth tag validation |
| 🧪 Unit | `decrypt should return original plaintext` | Round-trip |
| 🧪 Unit | `decrypt should return input when disabled` | Disabled mode |
| 🧪 Unit | `decrypt should throw error for invalid format` | Error handling |
| 🧪 Unit | `decrypt should throw error for tampered ciphertext` | Tampering detection |
| 🧪 Unit | `hash should generate SHA-256 hash` | Hash generation |
| 🧪 Unit | `hash should return hex-encoded hash` | Encoding |
| 🧪 Unit | `hash should be deterministic (same input = same hash)` | Determinism |
| 🧪 Unit | `hash should produce different hashes for different inputs` | Uniqueness |
| 🧪 Unit | `hash should handle empty string` | Edge case |
| 🧪 Unit | `encryptEmail should lowercase email` | Email normalization |
| 🧪 Unit | `encryptEmail should trim whitespace` | Email normalization |
| 🧪 Unit | `encryptEmail should encrypt normalized email` | Encryption |
| 🧪 Unit | `decryptEmail should decrypt email` | Decryption |
| 🧪 Unit | `hashEmail should lowercase email` | Email normalization |
| 🧪 Unit | `hashEmail should trim whitespace` | Email normalization |
| 🧪 Unit | `hashEmail should hash normalized email` | Hashing |
| 🧪 Unit | `hashEmail should be case insensitive (Test@Example.com = test@example.com)` | Case handling |
| 🧪 Unit | `encryptPhone should normalize phone (remove spaces, dashes)` | Phone normalization |
| 🧪 Unit | `encryptPhone should preserve + prefix` | Phone normalization |
| 🧪 Unit | `encryptPhone should encrypt normalized phone` | Encryption |
| 🧪 Unit | `decryptPhone should decrypt phone` | Decryption |
| 🧪 Unit | `hashPhone should normalize phone` | Phone normalization |
| 🧪 Unit | `hashPhone should hash normalized phone` | Hashing |
| 🧪 Unit | `encryptBatch should encrypt array of values` | Batch encryption |
| 🧪 Unit | `encryptBatch should handle empty array` | Edge case |
| 🧪 Unit | `decryptBatch should decrypt array of values` | Batch decryption |
| 🧪 Unit | `decryptBatch should handle empty array` | Edge case |
| 🧪 Unit | `rotateKey should decrypt with old key` | Key rotation |
| 🧪 Unit | `rotateKey should re-encrypt with new key` | Key rotation |
| 🧪 Unit | `rotateKey should restore current key on error` | Error handling |
| 🧪 Unit | `rotateKey should clear cache after rotation` | Cache invalidation |
| 🔗 Integration | `should encrypt and store in database` | Database integration |
| 🔗 Integration | `should retrieve and decrypt from database` | Database integration |
| 🔗 Integration | `should handle concurrent key derivation (cache thread safety)` | Concurrency |
| 🔗 Integration | `should perform large data encryption (performance test)` | Performance |

#### `src/utils/logger.ts` - Secure Logger (AUDIT FIXES LOG-1, LOG-H2, LOG-H3)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `redactString should redact email addresses` | Email redaction |
| 🧪 Unit | `redactString should redact phone numbers (various formats)` | Phone redaction |
| 🧪 Unit | `redactString should redact credit card numbers` | Card redaction |
| 🧪 Unit | `redactString should redact SSN` | SSN redaction |
| 🧪 Unit | `redactString should redact API keys` | API key redaction |
| 🧪 Unit | `redactString should redact Bearer tokens` | Token redaction |
| 🧪 Unit | `redactString should redact SendGrid API keys (SG.)` | SendGrid key redaction |
| 🧪 Unit | `redactString should redact Twilio SID (AC...)` | Twilio SID redaction |
| 🧪 Unit | `redactString should redact AWS access keys (AKIA...)` | AWS key redaction |
| 🧪 Unit | `redactString should redact JWT tokens (eyJ...)` | JWT redaction |
| 🧪 Unit | `redactString should redact UUIDs in sensitive contexts (user_id, customer_id)` | UUID redaction |
| 🧪 Unit | `redactObject should redact password field` | Field redaction |
| 🧪 Unit | `redactObject should redact token field` | Field redaction |
| 🧪 Unit | `redactObject should redact apiKey field (case-insensitive)` | Field redaction |
| 🧪 Unit | `redactObject should redact nested objects` | Nested redaction |
| 🧪 Unit | `redactObject should redact arrays of objects` | Array redaction |
| 🧪 Unit | `redactObject should handle max depth (10 levels)` | Depth limit |
| 🧪 Unit | `redactObject should handle circular references` | Circular handling |
| 🧪 Unit | `redactObject should preserve non-sensitive data` | Preservation |
| 🧪 Unit | `redactObject should handle null/undefined` | Edge case |
| 🧪 Unit | `redactObject should match partial sensitive keys (password, secret, token)` | Partial matching |
| 🧪 Unit | `createRequestLogger should add requestId to context` | Context creation |
| 🧪 Unit | `createRequestLogger should add tenantId to context` | Context creation |
| 🧪 Unit | `createJobLogger should add jobId to context` | Context creation |
| 🧪 Unit | `createJobLogger should add jobType to context` | Context creation |
| 🧪 Unit | `logUserAction should redact user data` | PII redaction |
| 🧪 Unit | `safeStringify should handle circular references` | Circular handling |
| 🔗 Integration | `should log with PII redaction` | Full redaction |
| 🔗 Integration | `should use different log levels` | Level filtering |
| 🔗 Integration | `should include metadata in logs` | Metadata inclusion |
| 🔗 Integration | `should format errors with stack traces` | Error formatting |

---

### 15. Templates

#### Email Templates (.hbs files)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `abandoned-cart.hbs should compile without errors` | Compilation |
| 🧪 Unit | `abandoned-cart.hbs should render with sample data` | Rendering |
| 🧪 Unit | `account-verification.hbs should compile without errors` | Compilation |
| 🧪 Unit | `account-verification.hbs should render with sample data` | Rendering |
| 🧪 Unit | `event-reminder.hbs should compile without errors` | Compilation |
| 🧪 Unit | `event-reminder.hbs should render with sample data` | Rendering |
| 🧪 Unit | `newsletter.hbs should compile without errors` | Compilation |
| 🧪 Unit | `newsletter.hbs should render with sample data` | Rendering |
| 🧪 Unit | `order-confirmation.hbs should compile without errors` | Compilation |
| 🧪 Unit | `order-confirmation.hbs should render with sample data` | Rendering |
| 🧪 Unit | `payment-failed.hbs should compile without errors` | Compilation |
| 🧪 Unit | `payment-failed.hbs should render with sample data` | Rendering |
| 🧪 Unit | `payment-success.hbs should compile without errors` | Compilation |
| 🧪 Unit | `payment-success.hbs should render with sample data` | Rendering |
| 🧪 Unit | `post-event-followup.hbs should compile without errors` | Compilation |
| 🧪 Unit | `post-event-followup.hbs should render with sample data` | Rendering |
| 🧪 Unit | `refund-processed.hbs should compile without errors` | Compilation |
| 🧪 Unit | `refund-processed.hbs should render with sample data` | Rendering |
| 🧪 Unit | `ticket-purchased.hbs should compile without errors` | Compilation |
| 🧪 Unit | `ticket-purchased.hbs should render with sample data` | Rendering |
| 🧪 Unit | `all templates should handle missing variables gracefully` | Error handling |
| 🧪 Unit | `all templates should escape HTML in user inputs` | Security |

#### SMS Templates (.txt files)

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `event-reminder.txt should be ≤160 chars` | Length validation |
| 🧪 Unit | `payment-failed.txt should be ≤160 chars` | Length validation |
| 🧪 Unit | `payment-success.txt should be ≤160 chars` | Length validation |
| 🧪 Unit | `verification.txt should be ≤160 chars` | Length validation |
| 🧪 Unit | `all SMS templates should render with sample data` | Rendering |

---

## E2E Test Scenarios

### Scenario 1: Full Notification Lifecycle

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | API receives POST /api/notifications/send | Request authenticated |
| 2 | Request validated | Schema validation passes |
| 3 | Rate limit checked | Within limits |
| 4 | Tenant context set | Tenant ID in AsyncLocalStorage |
| 5 | Compliance check (consent + suppression) | Passes |
| 6 | Template rendered | HTML generated |
| 7 | Provider called (SendGrid/Twilio) | Message sent |
| 8 | Database updated | notification_history record created |
| 9 | Metrics tracked | Prometheus counters incremented |
| 10 | Audit log entry | Logged |
| 11 | Webhook received from provider | Delivery confirmed |
| 12 | Status updated | Status = delivered |

### Scenario 2: GDPR Data Export & Deletion

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | User requests data export | Authenticated |
| 2 | Data fetched from 7 tables | All user data retrieved |
| 3 | PII decrypted | Email/phone decrypted |
| 4 | Export generated as JSON | Complete data package |
| 5 | Audit log entry | Export logged |
| 6 | User requests deletion | Authenticated |
| 7 | Prerequisites checked | No pending notifications |
| 8 | Data anonymized | PII fields cleared |
| 9 | Audit log entry | Deletion logged |
| 10 | Confirmation sent | User notified |

### Scenario 3: Campaign with A/B Testing

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Admin creates A/B test with 2 variants | Test created in database |
| 2 | Admin starts test | Status = running |
| 3 | Audience retrieved (segment) | Users matched |
| 4 | Users assigned to variants (50/50 split) | Deterministic assignment |
| 5 | Notifications sent to all users | 2 different templates |
| 6 | Open/click events tracked | Metrics updated per variant |
| 7 | Winner declared (after threshold) | Variant A wins |
| 8 | Test completed | Status = completed |

### Scenario 4: Multi-Tenant Isolation (AUDIT FIX MT-2)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Tenant A user creates notification | Tenant ID extracted from JWT |
| 2 | Tenant context set in AsyncLocalStorage | Context stored |
| 3 | Postgres RLS context set | app.current_tenant = tenant_a |
| 4 | Notification stored | tenant_id = tenant_a |
| 5 | Tenant B user queries notifications | Different tenant context |
| 6 | Query executed | Only tenant_b records returned |
| 7 | Attempt to access tenant_a notification by ID | 404 Not Found (RLS blocks) |

### Scenario 5: Rate Limiting Under Load

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 100 concurrent requests from same IP | All reach rate limit middleware |
| 2 | First 20 requests | Allowed (within limit) |
| 3 | Requests 21-100 | Rejected with 429 |
| 4 | Response headers | X-RateLimit-* headers set |
| 5 | Retry-After header | Time until reset |
| 6 | Wait for window reset | 1 minute passes |
| 7 | New request | Allowed (counter reset) |

### Scenario 6: Idempotency with Duplicate Requests

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Client sends POST /api/notifications/send | Request processed |
| 2 | Idempotency key generated from body hash | SHA-256 hash |
| 3 | Record stored in Redis (24h TTL) | Key: status=processing |
| 4 | Notification sent | Success |
| 5 | Response cached in Redis | Key: status=completed, response cached |
| 6 | Client sends duplicate request (same body) | Same idempotency key |
| 7 | Cached response returned | 200 OK with cached response |
| 8 | No duplicate notification sent | Idempotency enforced |

### Scenario 7: Webhook Signature Verification

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | SendGrid webhook received | POST /webhooks/sendgrid |
| 2 | Signature extracted from header | X-Twilio-Email-Event-Webhook-Signature |
| 3 | Signature verified | HMAC-SHA256 verification |
| 4 | Valid signature | Webhook processed |
| 5 | Delivery status updated | notification_history updated |
| 6 | Invalid signature attempt | 401 Unauthorized |
| 7 | Webhook rejected | No database update |

### Scenario 8: Scheduled Notification with Recurrence

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create scheduled notification (daily, 9am) | Record in scheduled_notifications |
| 2 | Scheduler job runs at 9am | getDueNotifications() |
| 3 | Notification queued | Added to Bull queue |
| 4 | Notification sent | Provider called |
| 5 | Status updated to sent | scheduled_notifications updated |
| 6 | Next occurrence calculated | Tomorrow at 9am |
| 7 | New scheduled record created | Recurring notification continues |

### Scenario 9: Provider Failover

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Send email via SendGrid | Primary provider |
| 2 | SendGrid fails 3 times | Failure count = 3 |
| 3 | Provider marked unhealthy | healthy = false |
| 4 | Next email request | Failover triggered |
| 5 | AWS SES selected | Secondary provider |
| 6 | Email sent via SES | Success |
| 7 | SendGrid recovers | Success count resets failures |
| 8 | SendGrid marked healthy | healthy = true |

### Scenario 10: Data Retention Cleanup

| Step | Action | Description |
|------|--------|-------------|
| 1 | Daily cleanup job runs | Cron scheduled |
| 2 | Calculate cutoff date | 90 days ago |
| 3 | Delete old notifications | Batch delete (1000 per batch) |
| 4 | Delete old webhooks | Processed + old |
| 5 | Delete old audit logs | Non-critical only |
| 6 | Preserve critical logs | Critical events kept forever |
| 7 | Log summary | Deletion counts logged |
| 8 | Release distributed lock | Job complete |

### Scenario 11: Encryption Key Rotation

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Admin triggers key rotation | New master key provided |
| 2 | Fetch all encrypted records | notification_history with encrypted PII |
| 3 | For each record: decrypt with old key | Plaintext retrieved |
| 4 | Re-encrypt with new key | New ciphertext generated |
| 5 | Update record in database | Encrypted data replaced |
| 6 | Cache cleared | Key derivation cache invalidated |
| 7 | Verification | Decrypt with new key succeeds |

### Scenario 12: Spam Score Rejection

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | User submits notification with subject "FREE VIAGRA!!!" | Spam check triggered |
| 2 | Spam score calculated | Score = 8 (>5 threshold) |
| 3 | Flags returned | high_risk_word, excessive_exclamation |
| 4 | Recommendations provided | Reword to avoid spam triggers |
| 5 | Notification rejected | 400 Bad Request |
| 6 | User revises content | Score = 2 |
| 7 | Notification accepted | Sent successfully |

### Scenario 13: PII Redaction in Logs

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | API request with user email in body | email: test@example.com |
| 2 | Request logger middleware activated | redactSensitiveData() called |
| 3 | Email redacted | [EMAIL_REDACTED] |
| 4 | Authorization header redacted | [REDACTED] |
| 5 | API key redacted | [REDACTED] |
| 6 | Log written | No PII in logs |
| 7 | Error occurs with stack trace | PII still redacted in error logs |

### Scenario 14: Template Rendering with Branding

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Notification requested for white-label venue | venueId provided |
| 2 | Venue branding fetched | logo, colors, custom domain |
| 3 | Template retrieved | ticket-purchased.hbs |
| 4 | Branding merged into template data | {{branding.logoUrl}} available |
| 5 | Handlebars template compiled | HTML generated |
| 6 | Custom from email used | venue@customdomain.com |
| 7 | Email sent | Fully branded |

### Scenario 15: Concurrent Tenant Operations

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Request A (Tenant 1) arrives | AsyncLocalStorage: tenant_1 |
| 2 | Request B (Tenant 2) arrives | AsyncLocalStorage: tenant_2 |
| 3 | Both requests query notifications concurrently | RLS enforced for each |
| 4 | Request A sees only tenant_1 data | Isolation maintained |
| 5 | Request B sees only tenant_2 data | Isolation maintained |
| 6 | Responses returned | No cross-tenant leakage |

---

## Test Infrastructure Requirements

### Required Infrastructure

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| PostgreSQL | Main database | Docker container, test schema |
| Redis | Caching, rate limiting, idempotency | Docker container, separate DB number |
| RabbitMQ | Event queue | Docker container, test vhost |
| MongoDB | Marketing content | Docker container, test database |
| SendGrid Mock | Email testing | Sinon stub or Nock |
| Twilio Mock | SMS testing | Sinon stub or Nock |

### Test Environment Variables
```env
# Test mode
NODE_ENV=test
NOTIFICATION_MODE=test

# Test databases
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DATABASE=notification_service_test
POSTGRES_USER=test
POSTGRES_PASSWORD=test

REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_DB=1

RABBITMQ_HOST=localhost
RABBITMQ_PORT=5673
RABBITMQ_VHOST=/test

MONGODB_URI=mongodb://localhost:27018/notification_test

# Test encryption
ENCRYPTION_MASTER_KEY=test-key-32-characters-minimum-length

# Test secrets
JWT_SECRET=test-jwt-secret-key
WEBHOOK_SECRET=test-webhook-secret

# Disable external calls
SENDGRID_API_KEY=test-key
TWILIO_ACCOUNT_SID=test-sid
TWILIO_AUTH_TOKEN=test-token
```

### Docker Compose for Tests
```yaml
version: '3.8'
services:
  postgres-test:
    image: postgres:15
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: notification_service_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
  
  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
  
  rabbitmq-test:
    image: rabbitmq:3-management-alpine
    ports:
      - "5673:5672"
      - "15673:15672"
  
  mongodb-test:
    image: mongo:7
    ports:
      - "27018:27017"
```

### Test Utilities
```typescript
// tests/utils/test-db.ts
export async function setupTestDatabase() {
  // Run migrations
  // Seed test data
}

export async function teardownTestDatabase() {
  // Truncate all tables
}

// tests/utils/test-redis.ts
export async function flushTestRedis() {
  // FLUSHDB on test Redis
}

// tests/utils/mock-providers.ts
export function mockSendGrid() {
  // Return Sinon stub for SendGrid
}

export function mockTwilio() {
  // Return Sinon stub for Twilio
}

// tests/utils/test-auth.ts
export function generateTestJWT(userId: string, tenantId: string) {
  // Generate JWT for tests
}
```

---

## Priority Matrix

### Tier 1: Critical (Must Test First)

| File | Priority | Reason |
|------|----------|--------|
| `errors/index.ts` | 🔴 Critical | 100% unit testable, foundational |
| `utils/encryption.util.ts` | 🔴 Critical | PII protection, 50+ unit tests |
| `utils/logger.ts` | 🔴 Critical | Audit fixes LOG-1, LOG-H2, LOG-H3 |
| `middleware/rate-limit-redis.ts` | 🔴 Critical | Audit fixes RL-1, RL-2, RL-H1, RL-H2 |
| `middleware/idempotency.ts` | 🔴 Critical | Audit fix IDP-H1 |
| `middleware/tenant-context.ts` | 🔴 Critical | Audit fixes MT-1, MT-2, MT-H3 |
| `middleware/webhook-auth.middleware.ts` | 🔴 Critical | Audit fix S2S-2 |
| `schemas/validation.ts` | 🔴 Critical | Audit fixes INP-H1, INP-H2, INP-H3 |
| `services/spam-score.service.ts` | 🔴 Critical | 100% unit testable, security |
| `services/gdpr.service.ts` | 🔴 Critical | Legal compliance |

### Tier 2: High Priority (Core Functionality)

| File | Priority | Reason |
|------|----------|--------|
| `controllers/notification.controller.ts` | 🟠 High | Core API |
| `controllers/webhook.controller.ts` | 🟠 High | Audit fix WH-1 |
| `services/notification.service.ts` | 🟠 High | Core service |
| `services/compliance.service.ts` | 🟠 High | GDPR/consent |
| `services/audit-log.service.ts` | 🟠 High | Audit trail |
| `services/data-retention.service.ts` | 🟠 High | GDPR compliance |
| `providers/sendgrid-email.provider.ts` | 🟠 High | Audit fix EXT-H1 |
| `providers/twilio-sms.provider.ts` | 🟠 High | Audit fix EXT-H1 |
| `routes/health.routes.ts` | 🟠 High | Audit fix HC-H1 |
| `routes/gdpr.routes.ts` | 🟠 High | GDPR endpoints |

### Tier 3: Medium Priority (Supporting Features)

| File | Priority | Reason |
|------|----------|--------|
| `services/campaign.service.ts` | 🟡 Medium | Marketing features |
| `services/engagement-tracking.service.ts` | 🟡 Medium | Analytics |
| `services/delivery-metrics.service.ts` | 🟡 Medium | SQL injection fix |
| `services/preference-manager.ts` | 🟡 Medium | User preferences |
| `middleware/validation.middleware.ts` | 🟡 Medium | Audit fix INP-1 |
| `middleware/request-logger.ts` | 🟡 Medium | Audit fix PII-1, PII-2 |
| `jobs/data-retention.jobs.ts` | 🟡 Medium | Cleanup jobs |
| `models/consent.model.ts` | 🟡 Medium | Consent management |

### Tier 4: Lower Priority (Nice to Have)

| File | Priority | Reason |
|------|----------|--------|
| `services/i18n.service.ts` | 🟢 Low | Internationalization |
| `services/rich-media.service.ts` | 🟢 Low | Rich media features |
| `services/wallet-pass.service.ts` | 🟢 Low | Wallet integration |
| `services/ab-test.service.ts` | 🟢 Low | A/B testing |
| `services/segmentation.service.ts` | 🟢 Low | Segmentation |

---

## Test Execution Plan

### Phase 1: Foundation (Weeks 1-2)
- Set up test infrastructure (Docker, test DB)
- Write test utilities and helpers
- Test Tier 1 files (critical)
- Target: 30% coverage

### Phase 2: Core (Weeks 3-4)
- Test Tier 2 files (high priority)
- Focus on integration tests
- Target: 60% coverage

### Phase 3: Comprehensive (Weeks 5-6)
- Test Tier 3 files (medium priority)
- Write E2E scenarios
- Target: 85% coverage

### Phase 4: Completion (Week 7)
- Test Tier 4 files (low priority)
- Fill coverage gaps
- Refine tests based on findings
- Target: 85-90% coverage

### Continuous Integration
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: # Test DB
      redis: # Test Redis
      rabbitmq: # Test RabbitMQ
      mongodb: # Test MongoDB
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
      - name: Run migrations
      - name: Run unit tests
      - name: Run integration tests
      - name: Run E2E tests
      - name: Upload coverage to Codecov
```

---

**END OF TEST PLAN**

**Total Test Count Estimate: 2000-3000+ tests**
- Unit Tests: ~800
- Integration Tests: ~500
- E2E Tests: ~15 scenarios

**Next Steps:**
1. Review and approve test plan
2. Set up test infrastructure
3. Begin Phase 1 implementation
4. Track coverage metrics weekly