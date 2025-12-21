# Order Service - Service Overview

## Purpose
The Order Service manages the complete order lifecycle for ticket purchases, including order creation, reservations, payments, modifications, refunds, and compliance. It handles complex workflows like order splitting, bulk operations, promotional codes, and integrates with payment and ticket services.

---

## 📁 Folder Structure Analysis

### routes/
HTTP endpoint definitions for all order-related operations.

#### **order.routes.ts**
- `POST /` - Create new order (with idempotency)
- `GET /:orderId` - Get order by ID
- `GET /` - List user's orders (with query filters)
- `POST /:orderId/reserve` - Reserve order (with idempotency)
- `POST /:orderId/cancel` - Cancel order (with idempotency)
- `POST /:orderId/refund` - Full refund order (with idempotency)
- `POST /:orderId/refund/partial` - Partial refund order (with idempotency)
- `GET /:orderId/refunds` - Get refund history for order
- `GET /:orderId/refunds/:refundId` - Get specific refund details
- `GET /:orderId/events` - Get order event history
- `POST /:orderId/modifications` - Request order modification (with idempotency)
- `POST /:orderId/upgrade` - Upgrade order item (with idempotency)
- `GET /:orderId/modifications` - Get order modifications
- `GET /:orderId/modifications/:modificationId` - Get specific modification

#### **refund-policy.routes.ts**
- `POST /policies` - Create refund policy
- `GET /policies` - Get all policies
- `GET /policies/:policyId` - Get specific policy
- `PATCH /policies/:policyId` - Update policy
- `DELETE /policies/:policyId` - Deactivate policy
- `POST /rules` - Create policy rule
- `GET /policies/:policyId/rules` - Get rules for policy
- `GET /rules/:ruleId` - Get specific rule
- `PATCH /rules/:ruleId` - Update rule
- `DELETE /rules/:ruleId/deactivate` - Deactivate rule
- `DELETE /rules/:ruleId` - Delete rule
- `POST /reasons` - Create refund reason
- `GET /reasons` - Get all reasons
- `GET /reasons/:reasonId` - Get specific reason
- `PATCH /reasons/:reasonId` - Update reason
- `DELETE /reasons/:reasonId` - Deactivate reason
- `POST /check-eligibility` - Check refund eligibility

#### **tax.routes.ts**
- `POST /jurisdictions` - Create tax jurisdiction
- `GET /jurisdictions` - Get all jurisdictions
- `PATCH /jurisdictions/:jurisdictionId` - Update jurisdiction
- `POST /rates` - Create tax rate
- `GET /rates` - Get all tax rates
- `POST /categories` - Create tax category
- `GET /categories` - Get all categories
- `POST /exemptions` - Create tax exemption
- `GET /exemptions/customer/:customerId` - Get customer exemptions
- `POST /exemptions/:exemptionId/verify` - Verify exemption
- `POST /calculate` - Calculate tax for order
- `GET /orders/:orderId` - Get tax for order
- `POST /provider/configure` - Configure tax provider
- `GET /provider/config` - Get provider config
- `POST /reports` - Generate tax report
- `GET /reports` - Get tax reports
- `POST /reports/:reportId/file` - File tax report

#### **health.routes.ts**
- `GET /health/live` - Liveness probe (service alive check)
- `GET /health/ready` - Readiness probe (dependencies check)
- `GET /health` - Detailed health check with latency metrics

#### **metrics.routes.ts**
- `GET /metrics` - Prometheus metrics endpoint
- `GET /cache/stats` - Cache statistics (JSON)
- `POST /cache/stats/reset` - Reset cache metrics

---

### services/
Business logic layer containing all order-related operations.

#### **order.service.ts**
Main order service handling core order operations
- `createOrder()` - Create new order with items
- `reserveOrder()` - Reserve order and create payment intent
- `confirmOrder()` - Confirm order after payment
- `cancelOrder()` - Cancel order with optional refund
- `expireReservation()` - Expire reserved order
- `refundOrder()` - Process full order refund
- `getOrder()` - Get order with items
- `getUserOrders()` - Get user's orders with pagination
- `getExpiredReservations()` - Find expired reservations for cleanup
- `getExpiringReservations()` - Find soon-to-expire reservations
- `getOrderEvents()` - Get order event history
- `findOrdersByEvent()` - Find orders for specific event
- `getTenantsWithReservedOrders()` - Get tenants with active reservations

#### **order-cache.service.ts**
Redis caching layer for order data
- `getOrder()` / `setOrder()` - Cache order data
- `getUserOrders()` / `setUserOrders()` - Cache user's orders list
- `getUserOrderCount()` / `setUserOrderCount()` - Cache order counts
- `incrementUserOrderCount()` - Increment user order counter
- `getRateLimitCount()` / `incrementRateLimitCount()` - Rate limiting
- `getAvailability()` / `setAvailability()` - Cache event availability
- `getTicketTypeAvailability()` / `setTicketTypeAvailability()` - Cache ticket type availability
- `deleteOrder()` / `deleteUserOrders()` - Invalidate cache
- `deleteByPattern()` - Pattern-based cache invalidation
- `flushAll()` - Clear all cache
- `getStats()` / `resetMetrics()` - Cache performance metrics

#### **order-modification.service.ts**
Handle order modifications and upgrades
- `calculateModificationImpact()` - Calculate cost/refund for modification
- `requestModification()` - Submit modification request
- `upgradeItem()` - Upgrade ticket to higher tier
- `approveModification()` - Approve modification request
- `rejectModification()` - Reject modification request
- `processModification()` - Execute approved modification
- `getOrderModifications()` - Get all modifications for order
- `getModification()` - Get specific modification details

#### **partial-refund.service.ts**
Handle partial refunds for individual items
- `calculatePartialRefundAmount()` - Calculate refund for items
- `validatePartialRefundItems()` - Validate refund request
- `processPartialRefund()` - Execute partial refund
- `updateOrderTotals()` - Update order totals after partial refund
- `getRefundHistory()` - Get refund history for order

#### **refund-policy.service.ts**
Manage refund policies and rules
- `createPolicy()` - Create refund policy
- `getPolicyById()` - Get policy by ID
- `getPolicies()` - List all policies
- `getPolicyForOrder()` - Get applicable policy for order
- `updatePolicy()` - Update policy
- `deactivatePolicy()` - Deactivate policy
- `createRule()` - Create policy rule
- `getRulesForPolicy()` - Get rules for policy
- `getRuleById()` - Get specific rule
- `updateRule()` - Update rule
- `deactivateRule()` - Deactivate rule
- `deleteRule()` - Delete rule

#### **refund-reason.service.ts**
Manage refund reasons catalog
- `createReason()` - Create refund reason
- `getReasonById()` - Get reason by ID
- `getReasonByCode()` - Get reason by code
- `getReasons()` - List all reasons
- `updateReason()` - Update reason
- `deactivateReason()` - Deactivate reason
- `deleteReason()` - Delete reason

#### **refund-eligibility.service.ts**
Check refund eligibility and calculate amounts
- `checkEligibility()` - Check if order eligible for refund
- Applies time-based, percentage, tiered, and flat fee rules
- Calculates pro-rated refunds based on time remaining

#### **promo-code.service.ts**
Manage promotional codes and discounts
- `validatePromoCode()` - Validate promo code for order
- `applyPromoCode()` - Apply promo code to order
- `createPromoCode()` - Create new promo code
- `calculateDiscount()` - Calculate discount amount

#### **discount-calculator.service.ts**
Calculate various discount types
- `calculatePercentageDiscount()` - Percentage-based discount
- `calculateFixedAmountDiscount()` - Fixed amount discount
- `calculateBOGODiscount()` - Buy-One-Get-One discount
- `calculateTieredDiscount()` - Tiered pricing discount
- `calculateEarlyBirdDiscount()` - Early bird discount
- `applyDiscountToOrder()` - Apply discount to order

#### **discount-combination.service.ts**
Handle multiple discount combinations
- `validateCombination()` - Validate discount combination rules
- `calculateCombinedDiscount()` - Calculate combined discount
- `checkMaxDiscount()` - Ensure max discount not exceeded

#### **order-split.service.ts**
Handle order splitting for split payments
- `splitOrder()` - Split order into multiple child orders
- `getOrderSplit()` - Get split order details

#### **bulk-operation.service.ts**
Handle bulk operations on multiple orders
- `createBulkOperation()` - Create bulk operation job
- `processBulkOperation()` - Execute bulk operation
- `getBulkOperation()` - Get operation status
- `listBulkOperations()` - List bulk operations

#### **admin-override.service.ts**
Admin override and approval workflows
- `createOverride()` - Create admin override request
- `approveOverride()` - Approve override
- `rejectOverride()` - Reject override
- `getOverride()` - Get override details
- `getOrderOverrides()` - Get overrides for order
- `getPendingApprovals()` - Get pending approvals
- `getAdminOverrides()` - List admin overrides
- `getApprovalWorkflow()` - Get approval workflow config
- `updateApprovalWorkflow()` - Update workflow
- `getAuditLog()` - Get audit log

#### **order-search.service.ts**
Advanced order search functionality
- `searchOrders()` - Search orders with filters
- `saveSearch()` - Save search query
- `getSavedSearches()` - Get saved searches
- `deleteSavedSearch()` - Delete saved search
- `recordSearchHistory()` - Record search history
- `getSearchHistory()` - Get search history

#### **order-report.service.ts**
Order reporting and analytics
- `generateDailySummary()` - Daily order summary
- `generateWeeklySummary()` - Weekly summary
- `generateMonthlySummary()` - Monthly summary
- `getRevenueByEvent()` - Revenue by event
- `getTopEventsByRevenue()` - Top events by revenue
- `getOrderStatsByStatus()` - Order stats by status
- `getAverageOrderValue()` - Average order value
- `getConversionRate()` - Order conversion rate

#### **order-analytics.service.ts**
Real-time order analytics
- `calculateMetrics()` - Calculate order metrics for period

#### **order-notes.service.ts**
Order notes and comments
- `createNote()` - Add note to order
- `updateNote()` - Update note
- `deleteNote()` - Delete note
- `getNote()` - Get specific note
- `getOrderNotes()` - Get all notes for order
- `getFlaggedNotes()` - Get flagged notes
- `searchNotes()` - Search notes
- `createTemplate()` - Create note template
- `getTemplates()` - Get note templates
- `incrementTemplateUsage()` - Track template usage

#### **redis.service.ts**
Redis client wrapper
- `initialize()` - Initialize Redis connection
- `get()` / `set()` / `del()` - Basic Redis operations
- `close()` - Close connection
- `getClient()` - Get Redis client

#### **payment.client.ts**
Payment service integration client
- `createPaymentIntent()` - Create payment intent
- `confirmPayment()` - Confirm payment
- `cancelPaymentIntent()` - Cancel payment intent
- `initiateRefund()` - Initiate refund

#### **ticket.client.ts**
Ticket service integration client
- `checkAvailability()` - Check ticket availability
- `reserveTickets()` - Reserve tickets
- `confirmAllocation()` - Confirm ticket allocation
- `releaseTickets()` - Release reserved tickets
- `getPrices()` - Get ticket prices

#### **event.client.ts**
Event service integration client
- `getEvent()` - Get event details

---

### controllers/
Request/response handlers for routes.

#### **order.controller.ts**
- `createOrder()` - Handle create order request
- `getOrder()` - Handle get order request
- `listOrders()` - Handle list orders request
- `reserveOrder()` - Handle reserve order request
- `cancelOrder()` - Handle cancel order request
- `refundOrder()` - Handle full refund request
- `partialRefundOrder()` - Handle partial refund request
- `getRefundHistory()` - Handle get refund history
- `getRefund()` - Handle get specific refund
- `getOrderEvents()` - Handle get order events
- `requestModification()` - Handle modification request
- `upgradeOrderItem()` - Handle upgrade request
- `getOrderModifications()` - Handle get modifications
- `getModification()` - Handle get specific modification

#### **refund-policy.controller.ts**
- `createPolicy()` - Handle create policy
- `getPolicy()` - Handle get policy
- `getPolicies()` - Handle list policies
- `updatePolicy()` - Handle update policy
- `deactivatePolicy()` - Handle deactivate policy
- `createRule()` - Handle create rule
- `getRulesForPolicy()` - Handle get rules
- `getRule()` - Handle get specific rule
- `updateRule()` - Handle update rule
- `deactivateRule()` - Handle deactivate rule
- `deleteRule()` - Handle delete rule
- `createReason()` - Handle create reason
- `getReason()` - Handle get reason
- `getReasons()` - Handle list reasons
- `updateReason()` - Handle update reason
- `deactivateReason()` - Handle deactivate reason
- `checkEligibility()` - Handle eligibility check

#### **tax.controller.ts**
- `createJurisdiction()` - Handle create jurisdiction
- `getJurisdictions()` - Handle list jurisdictions
- `updateJurisdiction()` - Handle update jurisdiction
- `createTaxRate()` - Handle create tax rate
- `getTaxRates()` - Handle list tax rates
- `createCategory()` - Handle create category
- `getCategories()` - Handle list categories
- `createExemption()` - Handle create exemption
- `getCustomerExemptions()` - Handle get customer exemptions
- `verifyExemption()` - Handle verify exemption
- `calculateTax()` - Handle calculate tax
- `getTaxForOrder()` - Handle get tax for order
- `configureProvider()` - Handle configure provider
- `getProviderConfig()` - Handle get provider config
- `generateReport()` - Handle generate report
- `getReports()` - Handle list reports
- `fileReport()` - Handle file report

---

### repositories/
❌ **Not Used** - This service uses the **models/** pattern instead of repositories.

---

### models/
Database models for direct data access (repository pattern).

#### **order.model.ts**
- `create()` - Create order record
- `findById()` - Find order by ID
- `findByUserId()` - Find orders by user
- `findByIdempotencyKey()` - Find by idempotency key
- `findByPaymentIntentId()` - Find by payment intent
- `findExpiredReservations()` - Find expired reservations
- `findExpiringReservations()` - Find expiring reservations
- `findByEvent()` - Find orders by event
- `getTenantsWithReservedOrders()` - Get tenants with reservations
- `update()` - Update order
- `delete()` - Delete order

#### **order-item.model.ts**
- `create()` - Create order item
- `createBulk()` - Create multiple items
- `findByOrderId()` - Find items by order
- `findById()` - Find item by ID

#### **order-event.model.ts**
- `create()` - Create order event
- `findByOrderId()` - Find events by order

#### **order-refund.model.ts**
- `create()` - Create refund record
- `findByOrderId()` - Find refunds by order
- `updateStatus()` - Update refund status

---

### middleware/
Request processing middleware.

#### **idempotency.middleware.ts**
- `idempotencyMiddleware()` - Idempotency key handling for POST requests
- `idempotencyCacheHook()` - Cache idempotent responses

#### **validation.middleware.ts**
- `validate()` - Joi schema validation middleware
- `validateData()` - Standalone validation function

#### **tenant.middleware.ts**
- `tenantMiddleware()` - Extract and validate tenant context

#### **error-handler.middleware.ts**
- `errorHandler()` - Global error handling middleware

#### **requestId.ts**
- `requestIdMiddleware()` - Add request ID to all requests

---

### config/
Configuration and initialization files.

#### **database.ts**
PostgreSQL connection pool management
- `initializeDatabase()` - Initialize database pool
- `getDatabase()` - Get database pool instance
- `closeDatabase()` - Close database connections

#### **redis.ts**
Redis connection management
- `initRedis()` - Initialize Redis connections
- `getRedis()` / `getPub()` / `getSub()` - Get Redis clients
- `closeRedisConnections()` - Close connections
- `get()` / `set()` / `del()` - Helper functions

#### **rabbitmq.ts**
RabbitMQ event bus configuration
- `connectRabbitMQ()` - Connect to RabbitMQ
- `getChannel()` - Get RabbitMQ channel
- `publishEvent()` - Publish event to exchange
- `closeRabbitMQ()` - Close connection

#### **cache.config.ts**
Cache key generation helpers
- `getOrderCacheKey()` - Order cache key
- `getUserOrdersCacheKey()` - User orders cache key
- `getUserOrderCountCacheKey()` - Order count cache key
- `getEventOrderCountCacheKey()` - Event order count key
- `getRateLimitCacheKey()` - Rate limit key
- `getAvailabilityCacheKey()` - Availability cache key
- `getTicketTypeCacheKey()` - Ticket type cache key
- `getAnalyticsCacheKey()` - Analytics cache key

#### **fees.ts**
Fee calculation configuration
- `calculateOrderFees()` - Calculate platform and processing fees
- `validateFeeConfig()` - Validate fee configuration

#### **order.config.ts**
Order-specific configuration
- `validateOrderConfig()` - Validate order configuration

#### **env.validator.ts**
Environment validation
- `validateEnvironment()` - Validate required env vars
- `getEnvConfig()` - Get typed env config

#### **secrets.ts**
Secret management
- `loadSecrets()` - Load secrets from secret manager

#### **alerts.config.ts**
Alert configuration
- `evaluateMetric()` - Evaluate metric thresholds

#### **security.config.ts**
Security configuration (referenced but file exists)

---

### migrations/
Database schema migrations.

#### **001_baseline_orders.ts**
Creates all order-related tables and database objects:

**Tables Created:**
- `orders` - Main orders table
- `order_items` - Order line items
- `order_events` - Order event history
- `order_addresses` - Billing/shipping addresses
- `order_refunds` - Refund records
- `refund_policies` - Refund policy definitions
- `refund_policy_rules` - Refund policy rules
- `refund_reasons` - Refund reason catalog
- `refund_compliance_log` - Compliance audit log
- `order_modifications` - Order modification requests
- `order_splits` - Split order records
- `bulk_operations` - Bulk operation jobs
- `promo_codes` - Promotional code definitions
- `promo_code_redemptions` - Promo code usage
- `order_notes` - Order notes and comments

**Custom Types:**
- `refund_type` - FULL, PARTIAL, ITEM
- `modification_type` - ADD_ITEM, REMOVE_ITEM, UPGRADE_ITEM, etc.
- `modification_status` - PENDING, APPROVED, PROCESSING, etc.
- `bulk_operation_status` - PENDING, PROCESSING, COMPLETED, etc.
- `bulk_operation_type` - BULK_CANCEL, BULK_REFUND, etc.
- `discount_type` - PERCENTAGE, FIXED_AMOUNT, BOGO, etc.
- `order_note_type` - CUSTOMER_INQUIRY, ISSUE_REPORTED, etc.

**Functions:**
- `update_updated_at_column()` - Auto-update timestamps
- `log_order_status_change()` - Log status changes
- `update_event_revenue()` - Update event revenue
- `calculate_order_total()` - Calculate order totals
- `generate_order_number()` - Generate unique order numbers
- `validate_order_status_transition()` - Validate state transitions
- `orders_search_vector_trigger()` - Full-text search indexing

**Triggers:**
- Order status change logging
- Event revenue updates
- Search vector updates
- Timestamp updates

**Row-Level Security:**
- Tenant isolation policies on all tables

**Indexes:**
- Performance indexes on all tables
- Partial indexes for specific statuses
- GIN indexes for full-text search and JSON fields
- Composite indexes for common queries

---

### validators/
Request validation schemas using Joi.

#### **order.schemas.ts**
- `createOrderSchema` - Validate order creation (items, currency, metadata)
- `reserveOrderSchema` - Validate reserve request
- `cancelOrderSchema` - Validate cancel request (reason required)
- `refundOrderSchema` - Validate refund request (amount, reason)
- `getOrdersQuerySchema` - Validate query parameters (limit, offset, status)
- `uuidParamSchema` - Validate UUID path parameters

#### **refund.schemas.ts**
- `partialRefundSchema` - Validate partial refund (items, quantities, amounts)
- `refundIdSchema` - Validate refund ID parameter

#### **modification.schemas.ts**
- `modificationRequestSchema` - Validate modification request
- `upgradeRequestSchema` - Validate upgrade request
- `approveModificationSchema` - Validate approval
- `rejectModificationSchema` - Validate rejection

#### **tax.schemas.ts**
- `createJurisdictionSchema` - Validate jurisdiction creation
- `updateJurisdictionSchema` - Validate jurisdiction update
- `createTaxRateSchema` - Validate tax rate creation
- `createCategorySchema` - Validate category creation
- `createExemptionSchema` - Validate exemption creation
- `calculateTaxSchema` - Validate tax calculation request
- `configureProviderSchema` - Validate provider config
- `generateReportSchema` - Validate report generation
- `fileReportSchema` - Validate report filing

#### **refund-policy.schemas.ts**
Referenced in types but file exists

#### **order.validator.ts**
TypeScript assertion validators
- `validateCreateOrderRequest()` - Type assertion for create
- `validateReserveOrderRequest()` - Type assertion for reserve
- `validateCancelOrderRequest()` - Type assertion for cancel
- `validateRefundOrderRequest()` - Type assertion for refund

---

### jobs/
Background job processors for scheduled tasks.

#### **expiration.job.ts**
- Extends `JobExecutor` base class
- Automatically expire reserved orders that exceed reservation window
- Runs periodically to cleanup stale reservations

#### **reminder.job.ts**
- Sends expiration reminders for orders nearing expiration
- Publishes reminder events to event bus
- Configurable reminder window

#### **event-reminder.job.ts**
- Extends `JobExecutor` base class
- Sends reminders before event start time
- Notifies customers of upcoming events

#### **reconciliation.job.ts**
- Reconciles order state with payment service
- Finds stale reserved orders
- Verifies payment status for unconfirmed orders
- Handles state mismatches

#### **order-archiving.job.ts**
- Archives old completed/cancelled orders
- Moves data to archive tables
- Maintains audit log
- Processes by tenant in batches

#### **job-executor.ts**
Abstract base class for all jobs
- `executeCore()` - Abstract method to implement
- Handles monitoring, error handling, retries
- Provides job status and lifecycle management
- `start()` / `stop()` - Lifecycle methods
- `waitForCompletion()` - Graceful shutdown support

#### **job-manager.ts**
Central job orchestration
- `register()` - Register job
- `startAll()` / `stopAll()` - Start/stop all jobs
- `getAllStatus()` - Get status of all jobs
- `gracefulShutdown()` - Graceful shutdown with timeout
- `getJob()` - Get specific job
- Handles shutdown signals

---

### events/
Event publishing and subscription.

#### **event-publisher.ts**
- `publishOrderCreated()` - Order created event
- `publishOrderReserved()` - Order reserved event
- `publishOrderConfirmed()` - Order confirmed event
- `publishOrderCancelled()` - Order cancelled event
- `publishOrderExpired()` - Order expired event
- `publishOrderRefunded()` - Order refunded event
- `publishOrderFailed()` - Order failed event
- Stores events in database before publishing

#### **event-subscriber.ts**
- `subscribeToPaymentEvents()` - Subscribe to payment events
- `handlePaymentSucceeded()` - Handle successful payment
- `handlePaymentFailed()` - Handle failed payment

#### **event-validator.ts**
- `validateEventPayload()` - Validate event payload
- `validateEventPayloadOrThrow()` - Validate with exception
- `EventValidationError` - Custom error class

#### **event-versions.ts**
- `isSupportedVersion()` - Check if version supported
- `getLatestVersion()` - Get latest event version
- `migrateEventPayload()` - Migrate between versions

#### **event-schemas.ts**
Event schema definitions (referenced)

#### **event-types.ts**
Event type constants (referenced)

---

### utils/
Utility functions and helper classes.

#### **order-state-machine.ts**
Order state transition management
- `canTransition()` - Check if transition allowed
- `validateTransition()` - Validate and throw if invalid
- `getAllowedTransitions()` - Get allowed next states
- `isTerminalState()` - Check if state is terminal
- `getTransitionDescription()` - Get state description
- `validateTransitionPath()` - Validate state path

#### **circuit-breaker.ts**
Circuit breaker pattern for external calls
- `execute()` - Execute operation with circuit breaker
- `getState()` - Get circuit state (CLOSED/OPEN/HALF_OPEN)
- `isOpen()` - Check if circuit open
- `reset()` - Reset circuit breaker
- `createCircuitBreaker()` - Factory function

#### **saga-coordinator.ts**
Saga pattern for distributed transactions
- `executeSaga()` - Execute saga steps
- `compensate()` - Rollback on failure
- `reset()` - Reset saga state

#### **transaction.ts**
Database transaction helper
- `withTransaction()` - Execute function in transaction

#### **distributed-lock.ts**
Redis-based distributed locking
- `withLock()` - Execute with lock
- `tryLock()` - Attempt to acquire lock
- `releaseLock()` - Release lock
- `isLocked()` - Check if locked

#### **retry.ts**
Retry logic with exponential backoff
- `retry()` - Retry operation with configurable attempts

#### **money.ts**
Money/currency utilities
- `dollarsToCents()` - Convert dollars to cents
- `centsToDollars()` - Convert cents to dollars
- `formatCents()` - Format as currency string
- `calculatePercentage()` - Calculate percentage
- `addFixedFee()` - Add fixed fee

#### **idempotency-key-generator.ts**
Idempotency key generation
- `generateIdempotencyKey()` - Generate from data
- `generateRandomIdempotencyKey()` - Generate random
- `generateTimestampedIdempotencyKey()` - Generate with timestamp

#### **validators.ts**
Common validation functions
- `validateOrderItems()` - Validate order items
- `validateUserId()` - Validate user ID
- `validateEventId()` - Validate event ID
- `validateOrderId()` - Validate order ID
- `ValidationError` - Custom error class

#### **pdf-generator.ts**
PDF generation utilities
- `generateTicket()` - Generate single ticket PDF
- `generateMultipleTickets()` - Generate multiple tickets
- `generateQRCode()` - Generate QR code

#### **logger.ts**
Logging utilities
- `createRequestLogger()` - Create request-scoped logger
- `createContextLogger()` - Create context logger

#### **metrics.ts**
Prometheus metrics (referenced)

#### **command-validator.ts**
Command execution security
- `isCommandExecutionEnabled()` - Check if enabled
- `isCommandAllowed()` - Check if command allowed
- `containsDangerousPatterns()` - Security check
- `sanitizeArguments()` - Sanitize command args
- `validateCommand()` - Validate command
- `buildSafeCommand()` - Build safe command
- `executeValidatedCommand()` - Execute with validation

---

### types/
TypeScript type definitions.

#### **order.types.ts**
Core order types (Order, OrderItem, OrderStatus, etc.)

#### **refund.types.ts**
Refund types (OrderRefund, RefundStatus, RefundType, etc.)

#### **refund-policy.types.ts**
Refund policy types (RefundPolicy, RefundPolicyRule, etc.)

#### **modification.types.ts**
Modification types (OrderModification, ModificationType, etc.)

#### **split.types.ts**
Order split types

#### **bulk.types.ts**
Bulk operation types

#### **discount.types.ts**
Discount types (PromoCode, DiscountType, etc.)

#### **promo-code.types.ts**
Promo code types

#### **combination.types.ts**
Discount combination types

#### **tax.types.ts**
Tax types (TaxJurisdiction, TaxRate, etc.)

#### **admin.types.ts**
Admin override types

#### **audit.types.ts**
Audit log types

#### **report.types.ts**
Report types

#### **payment-method.types.ts**
Payment method types

#### **fastify.ts**
Fastify type extensions

---

### errors/
Custom error classes.

#### **domain-errors.ts**
Domain-specific errors (OrderNotFoundError, InvalidStateTransitionError, etc.)

---

### plugins/
Fastify plugins.

#### **jwt-auth.plugin.ts**
JWT authentication plugin

---

### processors/
Message/event processors (folder exists but no files listed)

---

### bootstrap/
Application initialization.

#### **container.ts**
Dependency injection container setup

---

### Other Files

#### **app.ts**
Fastify application setup and configuration

#### **index.ts**
Application entry point and server startup

---

## 🗄️ Database Tables Owned

This service owns the following PostgreSQL tables:

1. **orders** - Main orders table with all order data
2. **order_items** - Order line items (tickets purchased)
3. **order_events** - Event history for orders
4. **order_addresses** - Billing and shipping addresses
5. **order_refunds** - Refund transactions
6. **refund_policies** - Refund policy definitions
7. **refund_policy_rules** - Rules for refund policies
8. **refund_reasons** - Catalog of refund reasons
9. **refund_compliance_log** - Compliance audit trail
10. **order_modifications** - Order modification requests
11. **order_splits** - Split order records
12. **bulk_operations** - Bulk operation jobs
13. **promo_codes** - Promotional code definitions
14. **promo_code_redemptions** - Promo code usage tracking
15. **order_notes** - Order notes and comments

**Note:** `discounts` and `order_discounts` tables are owned by **ticket-service**

---

## 🔐 External Services Configured

### **PostgreSQL** (config/database.ts)
- Order and refund data persistence
- Transaction support
- Connection pooling with pg

### **Redis** (config/redis.ts)
- Order caching
- Rate limiting
- Distributed locking
- Session storage

### **RabbitMQ** (config/rabbitmq.ts)
- Event publishing to other services
- Order lifecycle events
- Payment event subscriptions

### **Payment Service** (services/payment.client.ts)
- Create payment intents
- Confirm payments
- Cancel payment intents
- Initiate refunds

### **Ticket Service** (services/ticket.client.ts)
- Check availability
- Reserve tickets
- Confirm allocations
- Release tickets
- Get pricing

### **Event Service** (services/event.client.ts)
- Get event details
- Event validation

### **Tax Providers** (tax.controller.ts)
- Manual calculation
- Avalara integration
- TaxJar integration
- Vertex integration

---

## 📊 Key Features

### **Idempotency**
- All write operations support idempotency keys
- Prevents duplicate orders from retries
- 30-minute TTL for idempotency records

### **State Machine**
- Strict order state transitions
- Validation prevents invalid state changes
- States: PENDING → RESERVED → CONFIRMED → COMPLETED
- Terminal states: CANCELLED, EXPIRED, REFUNDED

### **Saga Pattern**
- Distributed transaction coordination
- Automatic compensation on failure
- Used for complex multi-service operations

### **Circuit Breaker**
- Protects against cascading failures
- Automatic recovery
- Used for all external service calls

### **Caching Strategy**
- Multi-level caching with Redis
- Cache-aside pattern
- TTL-based invalidation
- Performance metrics tracking

### **Event Sourcing**
- All order changes logged to order_events
- Complete audit trail
- Event replay capability
- Version migration support

### **Refund Compliance**
- FTC 16 CFR 424 compliance
- State law compliance (NY, CA)
- EU Consumer Rights Directive
- CCPA compliance
- Audit logging

### **Background Jobs**
- Order expiration handling
- Reminder notifications
- State reconciliation
- Order archiving

### **Multi-tenancy**
- Row-level security policies
- Tenant isolation
- Separate data per tenant

### **Rate Limiting**
- Per-endpoint rate limits
- Redis-backed counters
- Configurable windows

---

## 🎯 Summary

The Order Service is a comprehensive order management system that handles the complete order lifecycle with:
- 15 database tables with full schema ownership
- 20+ service classes for business logic
- 3 controllers with 50+ endpoints
- Circuit breakers, retries, and saga patterns for reliability
- Event sourcing and audit trails
- Multi-tenant isolation with RLS
- Background jobs for automation
- Integration with payment, ticket, and event services
- Compliance tracking and reporting
- Advanced features: order modifications, split payments, bulk operations, promo codes, tax calculation

This service is the core transactional system of the platform, orchestrating all order-related operations with high reliability, compliance, and auditability.
