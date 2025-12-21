# Integration Service - Service Overview

## Service Purpose
Third-party integrations service for connecting venues with external payment processors, marketing platforms, and accounting systems (Square, Stripe, Mailchimp, QuickBooks). Handles OAuth flows, credential management, data synchronization, field mapping, webhook processing, and integration health monitoring.

---

## 📁 routes/

### admin.routes.ts
- **GET** `/all-venues` - Get all venue integrations with optional filters
- **GET** `/health-summary` - Get health summary across all integrations
- **GET** `/costs` - Get cost analysis for integrations
- **POST** `/force-sync` - Force sync for a specific integration
- **POST** `/clear-queue` - Clear sync queue with filters
- **POST** `/process-dead-letter` - Process dead letter queue
- **POST** `/recover-stale` - Recover stale operations
- **GET** `/queue-metrics` - Get queue metrics by priority/status

**Auth:** All routes require authentication + admin role

### connection.routes.ts
- **GET** `/` - List all integrations for a venue
- **GET** `/:provider` - Get specific integration details
- **POST** `/connect/:provider` - Connect to an integration (OAuth or API key)
- **POST** `/:provider/disconnect` - Disconnect integration
- **POST** `/:provider/reconnect` - Attempt to reconnect integration
- **POST** `/:provider/api-key` - Validate API key for a provider

**Auth:** All routes require authentication, connect/disconnect require admin or venue_admin

### health.routes.ts
- **GET** `/:provider` - Get integration health status
- **GET** `/:provider/metrics` - Get metrics for a specific period
- **POST** `/:provider/test` - Test connection to provider

**Auth:** Public routes (no authentication required)

### mapping.routes.ts
- **GET** `/:provider/fields` - Get available fields for provider
- **GET** `/:provider/mappings` - Get current field mappings
- **PUT** `/:provider/mappings` - Update field mappings
- **POST** `/:provider/mappings/test` - Test mappings with sample data
- **POST** `/:provider/mappings/apply-template` - Apply a mapping template
- **POST** `/:provider/mappings/reset` - Reset mappings to default
- **POST** `/:provider/mappings/heal` - Heal broken mappings

**Auth:** All routes require authentication + admin or venue_admin role

### monitoring.routes.ts
- **GET** `/monitoring/metrics` - Get comprehensive service metrics
- **GET** `/monitoring/performance` - Get detailed performance metrics
- **GET** `/monitoring/dlq` - Get dead letter queue status
- **GET** `/monitoring/circuit-breakers` - Get circuit breaker status
- **GET** `/monitoring/health/deep` - Deep health check with dependencies
- **GET** `/monitoring/health/live` - Kubernetes liveness probe
- **GET** `/monitoring/health/ready` - Kubernetes readiness probe
- **GET** `/monitoring/idempotency` - Get idempotency service stats
- **POST** `/monitoring/circuit-breakers/:name/reset` - Reset a circuit breaker

**Auth:** No authentication required (internal monitoring endpoints)

### oauth.routes.ts
- **GET** `/callback/:provider` - OAuth callback handler
- **POST** `/refresh/:provider` - Refresh OAuth access token

**Auth:** Callback is public, refresh requires authentication

### sync.routes.ts
- **POST** `/:provider/sync` - Queue a new sync job
- **POST** `/:provider/sync/stop` - Stop a running sync
- **GET** `/:provider/sync/status` - Get sync status
- **GET** `/:provider/sync/history` - Get sync history with pagination
- **POST** `/:provider/sync/retry` - Retry failed sync jobs

**Auth:** All routes require authentication, POST routes require admin or venue_admin

### webhook.routes.ts
- **POST** `/square` - Handle Square webhooks
- **POST** `/stripe` - Handle Stripe webhooks
- **POST** `/mailchimp` - Handle Mailchimp webhooks
- **POST** `/quickbooks` - Handle QuickBooks webhooks
- **GET** `/:provider/events` - Get webhook events
- **POST** `/retry` - Retry failed webhook

**Auth:** Webhook endpoints use signature verification, events/retry require JWT auth

---

## 🎮 controllers/

### admin.controller.ts
**Methods:**
- `getAllVenueIntegrations()` - Query integrations with filters (status, healthStatus)
- `getHealthSummary()` - Get monitoring service health summary
- `getCostAnalysis()` - Get cost analysis with date range filtering
- `forceSync()` - Force immediate sync for venue/integration
- `clearQueue()` - Clear sync queue items with filters
- `processDeadLetter()` - Initiate dead letter queue processing
- `recoverStale()` - Recover stale operations
- `getQueueMetrics()` - Get queue metrics grouped by priority/status

### connection.controller.ts
**Methods:**
- `listIntegrations()` - List all integrations for a venue
- `getIntegration()` - Get specific integration status
- `connectIntegration()` - Connect integration (returns OAuth URL or connects directly)
- `disconnectIntegration()` - Disconnect and remove credentials
- `reconnectIntegration()` - Attempt token refresh
- `validateApiKey()` - Test API key validity

### health.controller.ts
**Methods:**
- `getIntegrationHealth()` - Get health status from integration_health table
- `getMetrics()` - Get sync metrics for specified period (24h, 7d, 30d)
- `testConnection()` - Initialize provider and test connection

### mapping.controller.ts
**Methods:**
- `getAvailableFields()` - Get available fields for provider
- `getCurrentMappings()` - Get current field mappings from integration_configs
- `updateMappings()` - Update custom field mappings
- `testMappings()` - Apply mappings to sample data for testing
- `applyTemplate()` - Apply mapping template to integration
- `resetMappings()` - Reset to default template
- `healMappings()` - Automatically fix broken mappings

### oauth.controller.ts
**Methods:**
- `handleCallback()` - Handle OAuth callback, exchange code for token
- `refreshToken()` - Refresh OAuth access token

### sync.controller.ts
**Methods:**
- `triggerSync()` - Queue a sync job with options
- `stopSync()` - Pause pending syncs
- `getSyncStatus()` - Get integration status and queue status
- `getSyncHistory()` - Get paginated sync history
- `retryFailed()` - Re-queue failed sync items

### webhook.controller.ts
**Methods:**
- `handleMailchimpWebhook()` - Process Mailchimp webhook with IP verification
- `handleSquareWebhook()` - Process Square webhook with signature verification
- `handleStripeWebhook()` - Process Stripe webhook with signature verification
- `handleQuickBooksWebhook()` - Process QuickBooks webhook with signature verification
- `getWebhookEvents()` - Get webhook event history
- `retryWebhook()` - Retry failed webhook processing

---

## 🔧 services/

### integration.service.ts
**Purpose:** Core integration management service
**Key Methods:**
- `connectIntegration()` - Connect to provider, test, store credentials, schedule sync
- `disconnectIntegration()` - Disconnect and clear credentials
- `getIntegrationStatus()` - Get status with health data
- `syncNow()` - Perform immediate sync (products, customers, transactions, or full)
- `syncProducts()` - Sync products/events to provider
- `syncCustomers()` - Sync customers to provider
- `syncTransactions()` - Sync recent transactions
- `fullSync()` - Execute complete sync across all data types

### oauth.service.ts
**Purpose:** OAuth authentication flow management
**Key Methods:**
- `initiateOAuth()` - Generate OAuth URL with state token
- `handleCallback()` - Exchange code for tokens, store securely
- `refreshToken()` - Refresh expired access tokens
- `exchangeCodeForToken()` - Provider-specific token exchange
- `exchangeSquareCode()`, `exchangeMailchimpCode()`, `exchangeQuickBooksCode()`

### token-vault.service.ts
**Purpose:** Secure credential storage with encryption
**Key Methods:**
- `storeToken()` - Store OAuth tokens with encryption
- `getToken()` - Retrieve and decrypt OAuth tokens
- `storeApiKey()` - Store API keys with encryption
- `getApiKey()` - Retrieve and decrypt API keys
- `refreshTokenIfNeeded()` - Auto-refresh if expiring soon

### credential-encryption.service.ts
**Purpose:** KMS-based encryption for credentials
**Key Methods:**
- `storeOAuthTokens()` - Encrypt and store OAuth tokens
- `retrieveOAuthTokens()` - Decrypt and retrieve tokens
- `storeApiKeys()` - Encrypt and store API keys
- `retrieveApiKeys()` - Decrypt and retrieve API keys
- `rotateOAuthTokens()` - Rotate token encryption
- `rotateApiKeys()` - Rotate API key encryption
- `validateAndRotateIfNeeded()` - Auto-rotate if needed

### sync-engine.service.ts
**Purpose:** Sync job processing engine
**Key Methods:**
- `queueSync()` - Add sync job to queue
- `processSync()` - Execute sync job
- `executeSync()` - Route to provider-specific sync
- `executeStripeSync()`, `executeSquareSync()`, `executeMailchimpSync()`, `executeQuickBooksSync()`
- `getPendingSyncJobs()` - Get pending jobs
- `retryFailedSync()` - Retry failed job
- `cancelSync()` - Cancel job
- `getSyncHistory()` - Get sync history

### mapping.service.ts
**Purpose:** Field mapping and template management
**Key Methods:**
- `applyTemplate()` - Apply mapping template to integration
- `createCustomMapping()` - Create custom field mappings
- `getAvailableFields()` - Get available fields for provider
- `createTemplate()` - Create new mapping template
- `healMapping()` - Auto-heal broken mappings
- `validateMappings()` - Validate mapping configuration

### field-mapping.service.ts
**Purpose:** Field transformation and mapping execution
**Key Methods:**
- `registerConfiguration()` - Register mapping config
- `getConfiguration()` - Get mapping config
- `transform()` - Transform data using mappings
- `validate()` - Validate transformed data

### monitoring.service.ts
**Purpose:** Health monitoring and metrics
**Key Methods:**
- `startHealthChecks()` - Start periodic health checks
- `checkAllIntegrations()` - Check all integration health
- `checkIntegrationHealth()` - Check single integration
- `calculate24HourMetrics()` - Calculate metrics
- `getHealthSummary()` - Get overall health summary

### recovery.service.ts
**Purpose:** Error recovery and retry logic
**Key Methods:**
- `handleFailedSync()` - Handle failed sync with retry logic
- `processDeadLetterQueue()` - Process DLQ items
- `recoverStaleOperations()` - Recover stale operations
- `checkIntegrationHealth()` - Verify integration health
- `attemptTokenRefresh()` - Try refreshing expired tokens
- `notifyAuthFailure()` - Send auth failure notifications

### health-check.service.ts
**Purpose:** Provider health monitoring
**Key Methods:**
- `startMonitoring()` - Start health monitoring
- `checkAllProviders()` - Check all provider health
- `checkProvider()` - Check single provider
- `getProviderStatus()` - Get provider status
- `getOverallHealth()` - Get overall health
- `isProviderAvailable()` - Check if provider is available

### dead-letter-queue.service.ts
**Purpose:** Failed job management
**Key Methods:**
- `addJob()` - Add job to DLQ
- `getJob()`, `getAllJobs()`, `getJobsByStatus()`, `getJobsByProvider()`
- `markForReview()` - Flag job for manual review
- `requeueJob()` - Move job back to main queue
- `discardJob()` - Permanently discard job
- `getStats()` - Get DLQ statistics
- `getFailurePatterns()` - Analyze failure patterns

### idempotency.service.ts
**Purpose:** Prevent duplicate operations
**Key Methods:**
- `checkIdempotency()` - Check if operation already processed
- `storeIdempotency()` - Store idempotency record
- `completeIdempotency()` - Mark operation complete
- `withIdempotency()` - Wrap operation with idempotency check
- `generateKey()` - Generate idempotency key
- `getStats()` - Get idempotency stats

### performance-metrics.service.ts
**Purpose:** Performance tracking and analysis
**Key Methods:**
- `startTimer()` - Start performance timer
- `stopTimer()` - Stop timer and record metric
- `recordMetric()` - Record metric manually
- `trackApiCall()` - Track API call performance
- `getAverageDuration()` - Calculate average duration
- `getP95Duration()` - Calculate 95th percentile
- `getSuccessRate()` - Calculate success rate
- `getSlowOperations()` - Get slow operations

### rate-limiter.service.ts
**Purpose:** API rate limiting
**Key Methods:**
- `registerConfig()` - Register rate limit config
- `checkLimit()` - Check if limit reached
- `waitIfNeeded()` - Wait if rate limit reached
- `executeWithRateLimit()` - Execute with rate limiting
- `getUsageStats()` - Get usage statistics
- `reset()` - Reset rate limits

### cache-integration.ts
**Purpose:** Redis caching for integration data
**Key Methods:**
- `get()` - Get cached value with optional fetcher
- `set()` - Set cached value with TTL
- `delete()` - Delete cached value(s)
- `flush()` - Clear all cache

---

## 🗄️ repositories/

**Note:** This service does not use a dedicated repositories folder. Database queries are performed directly in controllers and services using Knex query builder.

**Database Access Pattern:**
- Direct Knex queries in controllers (admin, health, mapping, sync)
- Database access through `db` instance from `config/database`
- Tables queried: integration_configs, integration_health, sync_logs, sync_queue, oauth_tokens, venue_api_keys, integration_costs, integration_webhooks, field_mapping_templates

---

## 🛡️ middleware/

### auth.middleware.ts
**Exports:**
- `authenticate()` - JWT authentication verification
- `authorize(...roles)` - Role-based authorization
- `verifyWebhookSignature(provider)` - Provider-specific webhook signature verification

### error.middleware.ts
**Exports:**
- `errorHandler()` - Global error handling middleware

### validation.middleware.ts
**Exports:**
- `validateExpress()` - Express validation wrapper
- `validateFastify()` - Fastify validation wrapper
- `validateValue()` - Validate single value against schema
- `validate()` - Generic async validation

### request-id.middleware.ts
**Exports:**
- `requestIdMiddleware()` - Attach unique request ID
- `getRequestId()` - Get request ID from request
- `getRequestMetadata()` - Get request metadata

### tenant-context.ts
**Exports:**
- `setTenantContext()` - Set tenant context for RLS

### rate-limit.middleware.ts
**Note:** Referenced in routes but implementation uses rate-limiter.service.ts

---

## ⚙️ config/

### database.ts
**Purpose:** PostgreSQL database connection via Knex
**Exports:**
- `initializeDatabase()` - Initialize database connection
- `db` - Knex instance for queries

### queue.ts
**Purpose:** Bull queue configuration
**Exports:**
- `initializeQueues()` - Initialize Redis-backed Bull queues
- `queues` - Queue instances (normal, high priority, etc.)

### redis.ts
**Purpose:** Redis client configuration
**Exports:**
- `initializeRedis()` - Initialize Redis connection
- `redis` - Redis client instance

### kms.ts
**Purpose:** AWS KMS encryption service
**Class:** `KMSService`
**Methods:**
- `encrypt()` - Encrypt data with KMS
- `decrypt()` - Decrypt KMS-encrypted data
- `generateDataKey()` - Generate data encryption key
- `encryptAccessToken()`, `decryptAccessToken()`
- `encryptRefreshToken()`, `decryptRefreshToken()`
- `encryptApiKey()`, `decryptApiKey()`
- `encryptApiSecret()`, `decryptApiSecret()`
- `encryptWebhookSecret()`, `decryptWebhookSecret()`
- `isEnabled()` - Check if KMS is enabled
- `getDefaultKeyId()` - Get default KMS key ID

### secrets.ts
**Purpose:** Load secrets from AWS Secrets Manager or environment
**Exports:**
- `loadSecrets()` - Load application secrets

---

## 🗃️ migrations/

### 001_baseline_integration.ts
**Tables Created:**
1. **integrations** - Master catalog of available integrations
2. **connections** - User/venue connections to integrations
3. **field_mappings** - Field mapping rules for transformations
4. **webhooks** - Webhook event queue and log
5. **integration_configs** - Venue-specific integration configurations
6. **integration_health** - Health monitoring metrics
7. **integration_webhooks** - Integration webhook event storage
8. **sync_queue** - Queue for sync operations
9. **sync_logs** - Historical log of sync operations
10. **integration_costs** - API usage and cost tracking

**Features:**
- RLS (Row Level Security) enabled on all tables
- Tenant isolation policies
- Foreign key constraints to venues, users, tenants
- Comprehensive indexing for performance

### 002_add_missing_tables.ts
**Tables Created:**
1. **oauth_tokens** - KMS-encrypted OAuth token storage
   - Fields: access_token, refresh_token, id_token (all encrypted)
   - Token expiry tracking, scopes, OAuth state management
   - Security audit fields, validation status
   
2. **venue_api_keys** - KMS-encrypted API key storage
   - Fields: api_key, api_secret, webhook_secret (all encrypted)
   - Key type, environment (production/sandbox)
   - Usage tracking, IP restrictions, expiry
   - Rate limit information
   
3. **field_mapping_templates** - Reusable field mapping templates
   - Template configurations by venue type and integration
   - Default templates, usage tracking
   - Validation rules

**Features:**
- KMS encryption integration
- Comprehensive security and audit tracking
- RLS enabled with tenant isolation

---

## ✅ validators/

### schemas.ts
**Validation Schemas (Joi):**
- `queueSyncSchema` - Validate sync job creation
- `getSyncHistorySchema` - Validate history query
- `retrySyncSchema`, `cancelSyncSchema` - Sync operations
- `oauthCallbackParamsSchema`, `oauthCallbackQuerySchema` - OAuth callbacks
- `refreshTokenSchema` - Token refresh
- `createConnectionSchema`, `updateConnectionSchema` - Connection management
- `createMappingSchema`, `updateMappingSchema` - Field mappings
- `webhookParamsSchema` - Webhook parameters
- `testConnectionSchema`, `rotateCredentialsSchema` - Admin operations
- `paginationSchema` - Common pagination

**Supported Providers:** stripe, square, mailchimp, quickbooks
**Sync Directions:** inbound, outbound, bidirectional
**Priority Levels:** low, normal, high, critical
**Entity Types:** customer, product, order, invoice, payment, contact

---

## 📦 models/

### Connection.ts
**Purpose:** Connection model (connections table)
- Integration connections with OAuth tokens and metadata

### Integration.ts
**Purpose:** Integration model (integrations table)
- Available integration catalog

### SyncLog.ts
**Purpose:** Sync log model (sync_logs table)
- Historical sync operation logs

### Webhook.ts
**Purpose:** Webhook model (webhooks table)
- Webhook event storage

**Note:** Models are lightweight - service primarily uses Knex for database access

---

## 🔌 providers/

### provider.interface.ts
**Interface:** `IntegrationProvider`
**Required Methods:**
- `initialize(credentials)` - Initialize provider with credentials
- `testConnection()` - Test connection to provider

**Optional Methods:**
- Sync: `syncProducts()`, `syncCustomers()`, `syncTransactions()`, `syncInventory()`
- Fetch: `fetchProducts()`, `fetchCustomers()`, `fetchTransactions()`
- Webhook: `handleWebhook()`, `validateWebhookSignature()`
- OAuth: `getOAuthUrl()`, `exchangeCodeForToken()`, `refreshToken()`

### square/square.provider.ts
**Implements:** IntegrationProvider
**Purpose:** Square payment processor integration
- OAuth support, webhook handling
- Product/customer/transaction sync

### stripe/stripe.provider.ts
**Implements:** IntegrationProvider
**Purpose:** Stripe payment processor integration
- API key authentication
- Payment/customer sync
- Webhook event processing

### mailchimp/mailchimp.provider.ts
**Implements:** IntegrationProvider
**Purpose:** Mailchimp email marketing integration
- OAuth support
- Customer/contact sync
- Webhook handling for list events

### quickbooks/quickbooks.provider.ts
**Implements:** IntegrationProvider
**Purpose:** QuickBooks accounting integration
- OAuth support
- Invoice/customer sync
- Webhook for entity changes

---

## 📋 Other Folders

### events/
**Structure:**
- `publishers/` - Event publishing (likely empty - uses queue)
- `subscribers/` - Event subscription (likely empty - uses queue)

**Note:** Service uses Bull queues for event processing rather than direct pub/sub

### queues/
**Structure:**
- `processors/` - Queue job processors
- `workers/` - Background workers for queue processing

**Purpose:** Bull queue job processing for async operations

### templates/
**Structure:**
- `mappings/` - Field mapping templates (likely JSON files)

**Purpose:** Default mapping configurations for different venue types and integrations

### types/
**File:** `integration.types.ts`
**Purpose:** TypeScript type definitions
- IntegrationType, IntegrationStatus enums
- Provider interfaces, sync job types
- Configuration types

### utils/
**Files:**
- `circuit-breaker.util.ts` - Circuit breaker pattern implementation
- `error-handler.ts` - Error handling utilities
- `graceful-shutdown.ts` - Graceful shutdown handling
- `logger.ts` - Winston logger configuration
- `retry.util.ts` - Retry logic utilities

---

## 🎯 Summary

**Integration Service** is a comprehensive third-party integration platform that:

1. **Manages OAuth flows** for Square, Mailchimp, and QuickBooks
2. **Handles API key authentication** for Stripe and other providers
3. **Securely stores credentials** using AWS KMS encryption
4. **Syncs data bidirectionally** between TicketToken and external platforms
5. **Processes webhooks** from all integrated providers
6. **Maps fields** between different data schemas with templates
7. **Monitors health** and tracks performance metrics
8. **Handles failures** with retry logic, dead letter queues, and recovery
9. **Enforces rate limits** to respect provider API limits
10. **Tracks costs** for API usage and data transfer

**Key Technologies:**
- Fastify (HTTP framework)
- Knex (SQL query builder)
- Bull (Queue management)
- Redis (Caching & queues)
- PostgreSQL (Primary database)
- AWS KMS (Encryption)
- Joi (Validation)

**Database Tables:** 13 tables with full RLS and tenant isolation
**Supported Providers:** 4 (Square, Stripe, Mailchimp, QuickBooks)
**Routes:** 8 route modules with 50+ endpoints
**Services:** 17 service modules
**Controllers:** 7 controllers
