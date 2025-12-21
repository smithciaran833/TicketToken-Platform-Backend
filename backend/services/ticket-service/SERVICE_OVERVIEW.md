# Ticket Service - Service Overview

**Service:** ticket-service  
**Location:** `backend/services/ticket-service/src/`  
**Purpose:** Core ticket management including reservations, purchases, transfers, QR code generation/validation, and NFT minting integration  
**Generated:** 2025-12-21

---

## Table of Contents
1. [Routes](#routes)
2. [Services](#services)
3. [Controllers](#controllers)
4. [Middleware](#middleware)
5. [Config](#config)
6. [Migrations](#migrations)
7. [Models](#models)
8. [Workers](#workers)
9. [Sagas](#sagas)
10. [Clients](#clients)
11. [Utils](#utils)
12. [Bootstrap](#bootstrap)
13. [Types](#types)

---

## Routes

### 1. `health.routes.ts`
Health check and monitoring endpoints.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| GET | `/health` | Basic health check | None |
| GET | `/health/live` | Liveness probe (K8s) | None |
| GET | `/health/ready` | Readiness probe (DB, Redis, Queue) | None |
| GET | `/health/detailed` | Detailed health with metrics | authMiddleware |
| GET | `/health/circuit-breakers` | Circuit breaker status | authMiddleware, requireRole(['admin', 'ops']) |
| POST | `/health/circuit-breakers/reset` | Reset circuit breakers | authMiddleware, requireRole(['admin']) |

### 2. `internalRoutes.ts`
Internal service-to-service communication (secured with HMAC signature).

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| GET | `/internal/tickets/:ticketId/status` | Get ticket status for refund validation | verifyInternalService |
| POST | `/internal/tickets/cancel-batch` | Batch cancel tickets (for refunds) | verifyInternalService |
| POST | `/internal/tickets/calculate-price` | Calculate total price for tickets | verifyInternalService |

**Security:** HMAC-SHA256 signature verification with timestamp validation (5-minute window).

### 3. `mintRoutes.ts`
NFT minting endpoints (secured, internal use).

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/process-mint` | Process mint job from queue | verifyMintAuthorization |

**Security:** Bearer token authorization with order status validation.

### 4. `orders.routes.ts`
Order management endpoints for users.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| GET | `/orders` | Get user's orders | rateLimiters.read, authMiddleware |
| GET | `/orders/tickets` | Get user's tickets | rateLimiters.read, authMiddleware |
| GET | `/orders/:orderId` | Get specific order | rateLimiters.read, authMiddleware |

### 5. `purchaseRoutes.ts`
Ticket purchase flow.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/purchase` | Create new order/purchase | authMiddleware, tenantMiddleware |

### 6. `qrRoutes.ts`
QR code generation and validation.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| GET | `/:ticketId/generate` | Generate QR code for ticket | None |
| POST | `/validate` | Validate QR code (venue staff) | None |
| POST | `/refresh` | Refresh QR code | None |

### 7. `ticketRoutes.ts`
Main ticket management endpoints.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/types` | Create ticket type | rateLimiters.write, authMiddleware, requireRole(['admin', 'venue_manager']), validate(createTicketType) |
| GET | `/events/:eventId/types` | Get ticket types for event (public) | rateLimiters.read, tenantMiddleware |
| POST | `/purchase` | Purchase tickets (create reservation) | rateLimiters.purchase, authMiddleware, validate(purchaseTickets) |
| POST | `/reservations/:reservationId/confirm` | Confirm purchase | rateLimiters.purchase, authMiddleware |
| DELETE | `/reservations/:reservationId` | Release reservation | rateLimiters.write, authMiddleware |
| GET | `/:ticketId/qr` | Generate QR code | rateLimiters.read, authMiddleware |
| POST | `/validate-qr` | Validate QR (venue staff) | rateLimiters.qrScan, authMiddleware, requireRole(['admin', 'venue_manager', 'venue_staff']) |
| GET | `/users/:userId` | Get user tickets | rateLimiters.read, authMiddleware |
| GET | `/types/:id` | Get ticket type by ID (public) | rateLimiters.read, tenantMiddleware |
| PUT | `/types/:id` | Update ticket type | rateLimiters.write, authMiddleware, requireRole(['admin', 'venue_manager']) |
| GET | `/:ticketId` | Get ticket by ID | rateLimiters.read, authMiddleware |
| GET | `/` | Get current user's tickets | rateLimiters.read, authMiddleware |

### 8. `transferRoutes.ts`
Ticket transfer endpoints.

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/` | Transfer a ticket | rateLimiters.write, authMiddleware, validate(transferTicket) |
| GET | `/:ticketId/history` | Get transfer history | rateLimiters.read, authMiddleware |
| POST | `/validate` | Validate transfer before executing | rateLimiters.read, authMiddleware |

### 9. `validationRoutes.ts`
Public QR validation endpoint (for scanner devices).

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/qr` | Validate QR code (public) | validate(validateQR) |

### 10. `webhookRoutes.ts`
Webhook endpoints for payment service integration (secured with HMAC + replay protection).

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/payment-success` | Process payment success | verifyInternalWebhook (HMAC + nonce) |
| POST | `/payment-failed` | Process payment failure | verifyInternalWebhook (HMAC + nonce) |

**Security:** 
- HMAC-SHA256 signature verification
- Nonce-based replay attack prevention (stored in `webhook_nonces` table)
- 5-minute timestamp window
- Deterministic JSON stringification

---

## Services

### 1. `ticketService.ts` - **TicketService**
Core ticket management service.

**Methods:**
- `createTicketType()` - Create new ticket type for event
- `getTicketTypes()` - Get ticket types for event (with tenant filtering)
- `checkAvailability()` - Check if tickets are available
- `createReservation()` - Create ticket reservation (with distributed locking)
- `confirmPurchase()` - Confirm purchase and create tickets
- `getTicket()` - Get ticket by ID (with caching)
- `getUserTickets()` - Get user's tickets (with tenant filtering)
- `updateTicketStatus()` - Update ticket status
- `expireReservations()` - Expire old reservations (calls stored procedure)
- `releaseReservation()` - Release reservation manually
- `generateQR()` - Generate encrypted QR code
- `validateQR()` - Validate and decrypt QR code
- `getTicketType()` - Get ticket type by ID
- `updateTicketType()` - Update ticket type
- `encryptData()` - AES-256-CBC encryption for QR codes
- `decryptData()` - Decrypt QR code data

**Dependencies:** DatabaseService, RedisService, QueueService, distributed locks via @tickettoken/shared

### 2. `transferService.ts` - **TransferService**
Handles ticket transfers between users.

**Methods:**
- `transferTicket()` - Transfer ticket to another user
- `getTransferHistory()` - Get transfer history for ticket
- `validateTransferRequest()` - Validate transfer request before execution

### 3. `qrService.ts` - **QRService**
QR code generation and validation with rotation.

**Methods:**
- `generateRotatingQR()` - Generate time-based rotating QR code
- `validateQR()` - Validate QR code with ticket data
- `getTicketData()` - Fetch ticket data for QR validation
- `encrypt()` - Encrypt QR payload
- `decrypt()` - Decrypt QR payload

### 4. `discountService.ts` - **DiscountService**
Discount code management.

**Methods:**
- `applyDiscounts()` - Apply discount codes to purchase
- `getValidDiscounts()` - Get valid discount codes
- `recordDiscountUsage()` - Track discount usage
- `validateDiscountCode()` - Validate discount code

### 5. `taxService.ts` - **TaxService**
Tax calculation service.

**Methods:**
- `calculateOrderTax()` - Calculate tax for order based on location and items

### 6. `databaseService.ts` - **DatabaseService**
PostgreSQL connection pool management.

**Methods:**
- `initialize()` - Initialize database connection pool
- `getPool()` - Get connection pool
- `query()` - Execute query
- `transaction()` - Execute transaction
- `close()` - Close all connections
- `isHealthy()` - Check database health

### 7. `redisService.ts` - **RedisService**
Redis connection and caching operations.

**Methods:**
- `initialize()` - Initialize Redis connection
- `getClient()` - Get Redis client
- `get()` - Get value by key
- `set()` - Set value with optional TTL
- `del()` - Delete key
- `exists()` - Check if key exists
- `incr()` - Increment counter
- `expire()` - Set key expiration
- `mget()` - Get multiple keys
- `mset()` - Set multiple key-value pairs
- `close()` - Close connection
- `isHealthy()` - Check Redis health

### 8. `queueService.ts` - **QueueService**
RabbitMQ message queue integration.

**Methods:**
- `initialize()` - Initialize RabbitMQ connection
- `connect()` - Connect to RabbitMQ
- `setupQueues()` - Setup queues and exchanges
- `handleConnectionError()` - Handle connection errors
- `publish()` - Publish message to queue
- `consume()` - Consume messages from queue
- `close()` - Close connection
- `isConnected()` - Check connection status

**Extends:** EventEmitter

### 9. `queueListener.ts` - **QueueListener**
Listens to payment events from payment service.

**Methods:**
- `start()` - Start listening to payment queues
- `processPaymentSuccess()` - Handle payment success event
- `processPaymentFailure()` - Handle payment failure event

### 10. `paymentEventHandler.ts` - **PaymentEventHandler**
Handles payment events (success/failure).

**Methods:**
- `handlePaymentSucceeded()` - Process successful payment
- `handlePaymentFailed()` - Process failed payment

### 11. `refundHandler.ts` - **RefundHandler**
Refund processing logic.

**Methods:**
- `initiateRefund()` - Initiate refund for order

### 12. `solanaService.ts` - **SolanaService**
Solana blockchain integration for NFT minting.

**Methods:**
- `initialize()` - Initialize Solana connection
- `getConnection()` - Get Solana connection
- `getWallet()` - Get wallet keypair
- `mintNFT()` - Mint NFT on Solana
- `transferNFT()` - Transfer NFT between addresses

### 13. `interServiceClient.ts` - **InterServiceClient**
HTTP client for inter-service communication.

**Methods:**
- `initializeClients()` - Initialize Axios clients for services
- `getServiceUrl()` - Get service URL from env
- `request()` - Make HTTP request with retry logic
- `shouldRetry()` - Determine if request should retry
- `retryRequest()` - Retry failed request
- `get()` - GET request
- `post()` - POST request
- `put()` - PUT request
- `delete()` - DELETE request
- `startHealthChecks()` - Start periodic health checks
- `performHealthChecks()` - Check health of all services
- `checkHealth()` - Get health status
- `getHealthStatus()` - Get health for specific service

### 14. `cache-integration.ts`
Cache integration utilities for consistent caching patterns.

---

## Controllers

### 1. `ticketController.ts` - **TicketController**
Main ticket management controller.

**Methods:**
- `createTicketType()` - Create ticket type
- `getTicketTypes()` - Get ticket types for event
- `createReservation()` - Create ticket reservation
- `confirmPurchase()` - Confirm purchase
- `getUserTickets()` - Get user's tickets
- `releaseReservation()` - Release reservation
- `getTicketById()` - Get specific ticket
- `generateQR()` - Generate QR code
- `validateQR()` - Validate QR code
- `getTicketType()` - Get ticket type by ID
- `updateTicketType()` - Update ticket type
- `getCurrentUserTickets()` - Get current user's tickets

### 2. `purchaseController.ts` - **PurchaseController**
Purchase flow controller.

**Methods:**
- `createOrder()` - Create order (routes to saga or legacy)
- `createOrderViaSaga()` - Create order using saga pattern
- `createOrderLegacy()` - Legacy order creation

### 3. `qrController.ts` - **QRController**
QR code operations controller.

**Methods:**
- `generateQR()` - Generate QR code for ticket
- `validateQR()` - Validate QR code
- `refreshQR()` - Refresh QR code (regenerate)

### 4. `transferController.ts` - **TransferController**
Ticket transfer controller.

**Methods:**
- `transferTicket()` - Transfer ticket to another user
- `getTransferHistory()` - Get transfer history
- `validateTransfer()` - Validate transfer request

### 5. `orders.controller.ts` - **OrdersController**
Order viewing controller.

**Methods:**
- `getOrderById()` - Get order by ID
- `getUserOrders()` - Get user's orders
- `getUserTickets()` - Get user's tickets

---

## Middleware

### 1. `auth.ts`
Authentication middleware.

**Functions:**
- `authenticate()` - Verify JWT token and extract user info
- `authMiddleware` - Fastify preHandler for authentication
- `requireRole()` - Role-based access control

### 2. `errorHandler.ts`
Global error handling middleware.

**Functions:**
- `errorHandler()` - Catch and format errors

### 3. `rate-limit.ts`
Rate limiting middleware using Redis.

**Functions:**
- `createRateLimiter()` - Create rate limiter with config
- `combinedRateLimiter()` - Combine multiple rate limiters

**Rate Limiters:**
- `read` - Read operations (100/min)
- `write` - Write operations (50/min)
- `purchase` - Ticket purchases (10/min - strict)
- `qrScan` - QR code scans (200/min)

### 4. `tenant.ts`
Multi-tenancy middleware.

**Functions:**
- `tenantMiddleware()` - Extract and validate tenant context

---

## Config

### 1. `index.ts`
Main configuration export.

**Functions:**
- `requireEnv()` - Require environment variable
- Exports consolidated config object

### 2. `database.ts`
Database configuration (Knex.js setup).

### 3. `redis.ts`
Redis connection management.

**Functions:**
- `initRedis()` - Initialize Redis connections (client, pub, sub)
- `getRedis()` - Get main Redis client
- `getPub()` - Get publisher client
- `getSub()` - Get subscriber client
- `closeRedisConnection()` - Close all connections

### 4. `secrets.ts`
Secrets management (AWS Secrets Manager integration).

**Functions:**
- `loadSecrets()` - Load secrets from AWS

### 5. `env-validation.ts`
Environment variable validation.

**Functions:**
- `validateEnv()` - Validate required environment variables
- `generateSecret()` - Generate random secret
- `printEnvDocs()` - Print environment documentation

---

## Migrations

### 1. `001_baseline_ticket.ts`
**Comprehensive baseline migration** combining original migrations 001, 002, and 003.

**Created Tables (19):**
1. `ticket_types` - Ticket type definitions (price, quantity, sale period)
2. `reservations` - Temporary reservations (with expiry)
3. `tickets` - Individual tickets (with QR, status, NFT tracking)
4. `ticket_transfers` - Transfer records (pending, accepted, completed)
5. `ticket_validations` - Validation/scan events
6. `refunds` - Refund records
7. `waitlist` - Waitlist for sold-out tickets
8. `ticket_price_history` - Price change tracking
9. `ticket_holds` - Admin holds on inventory
10. `ticket_bundles` - Ticket bundle definitions
11. `ticket_bundle_items` - Bundle composition
12. `ticket_audit_log` - Audit trail
13. `ticket_notifications` - Notification queue
14. `discounts` - Discount code definitions
15. `order_discounts` - Applied discounts (with tenant_id)
16. `outbox` - Transactional outbox pattern for events
17. `reservation_history` - Reservation status changes
18. `webhook_nonces` - Replay attack prevention for webhooks

**Foreign Keys:**
- All tables reference `tenants(id)` with ON DELETE RESTRICT
- References to `events`, `users`, `ticket_types`, etc.

**Indexes:**
- Performance indexes on all major query patterns
- Tenant isolation indexes (`tenant_id` + other columns)
- Status and timestamp indexes for common queries
- Partial index on `outbox` for unprocessed events

**Stored Procedures (4):**
1. `update_ticket_availability_on_reservation()` - Update availability on reservation
2. `release_ticket_availability()` - Release availability on expiry/cancel
3. `update_user_ticket_stats()` - Update user purchase count
4. `update_user_events_attended()` - Update user events_attended aggregate

**Triggers (4):**
1. `trg_update_availability_on_reservation` - On reservations INSERT
2. `trg_release_availability` - On reservations UPDATE
3. `trg_update_user_stats` - On tickets INSERT
4. `trigger_update_user_events_attended` - On tickets UPDATE
5. `audit_tickets_changes` - Audit log for tickets (if audit function exists)

**Row-Level Security (RLS):**
- Enabled on `tickets` table
- Policies:
  - `tickets_view_own` - Users view their own tickets
  - `tickets_update_own` - Users update their own tickets
  - `tickets_venue_owner_view` - Venue owners view their venue's tickets
  - `tickets_admin_all` - Admin full access
  - `tickets_tenant_isolation` - Enforce tenant isolation

**Key Columns Added:**
- `tickets.reservation_id` - Link to reservation
- `tickets.is_validated` - Validation flag
- `order_discounts.tenant_id` - Tenant isolation
- `order_discounts.discount_type` - Discount type tracking

---

## Models

Database models for querying (Knex-based).

### 1. `Reservation.ts` - **ReservationModel**
**Methods:**
- `create()` - Create reservation
- `findById()` - Find by ID
- `findActive()` - Find active reservations for user
- `update()` - Update reservation
- `expireOldReservations()` - Expire old reservations

### 2. `Order.ts` - **OrderModel**
**Methods:**
- `create()` - Create order
- `findById()` - Find by ID
- `findByUserId()` - Find by user
- `findByOrderNumber()` - Find by order number
- `findByEventId()` - Find by event
- `update()` - Update order
- `delete()` - Soft delete order
- `generateOrderNumber()` - Generate unique order number
- `mapRowToOrder()` - Map DB row to order object

### 3. `Ticket.ts` - **TicketModel**
**Methods:**
- `create()` - Create ticket
- `findById()` - Find by ID
- `findByEventId()` - Find by event
- `findByUserId()` - Find by user
- `findByTicketNumber()` - Find by ticket number
- `update()` - Update ticket
- `delete()` - Soft delete ticket
- `hardDelete()` - Permanently delete ticket
- `generateTicketNumber()` - Generate unique ticket number
- `generateQRCode()` - Generate QR code
- `mapRowToTicket()` - Map DB row to ticket object

### 4. `Transfer.ts` - **TransferModel**
**Methods:**
- `create()` - Create transfer
- `findById()` - Find by ID
- `findByTicketId()` - Find by ticket
- `findByTransferCode()` - Find by transfer code
- `findByAcceptanceCode()` - Find by acceptance code
- `findByFromUserId()` - Find sent transfers
- `findByToUserId()` - Find received transfers
- `findByToEmail()` - Find by recipient email
- `findPendingByTicketId()` - Find pending transfers
- `accept()` - Accept transfer
- `complete()` - Complete transfer
- `cancel()` - Cancel transfer
- `reject()` - Reject transfer
- `expire()` - Expire transfer
- `expireOldPending()` - Expire old pending transfers
- `delete()` - Delete transfer
- `generateAcceptanceCode()` - Generate acceptance code
- `generateTransferCode()` - Generate transfer code
- `mapRowToTransfer()` - Map DB row to transfer object

### 5. `QRCode.ts` - **QRCodeModel**
**Methods:**
- `findByCode()` - Find ticket by QR code
- `findByTicketId()` - Find QR for ticket
- `regenerate()` - Regenerate QR code
- `markAsScanned()` - Mark as validated
- `isValid()` - Check if QR is valid
- `getValidationStatus()` - Get validation status
- `generateQRCode()` - Generate new QR code
- `mapRow()` - Map DB row

---

## Workers

Background workers for scheduled tasks.

### 1. `mintWorker.ts` - **MintWorker**
Processes NFT minting jobs from queue.

**Methods:**
- `processMintJob()` - Process mint job
- `mintNFT()` - Mint NFT via Solana
- `handleMintFailure()` - Handle mint failure

**Triggered by:** Messages from `TICKET_MINT` queue

### 2. `reservation-expiry.worker.ts` - **ReservationExpiryWorker**
Expires old reservations (time-based cleanup).

**Methods:**
- `start()` - Start worker (default: 60 seconds interval)
- `stop()` - Stop worker
- `processExpiredReservations()` - Find and expire old reservations

**Schedule:** Configurable interval (default 60s)

### 3. `reservation-cleanup.worker.ts` - **ReservationCleanupWorker**
Advanced reservation cleanup with inventory reconciliation.

**Methods:**
- `start()` - Start worker
- `stop()` - Stop worker
- `runCleanup()` - Run cleanup cycle
- `releaseExpiredReservations()` - Release expired reservations
- `fixOrphanReservations()` - Fix orphaned reservations
- `releaseOrphanReservation()` - Release specific orphan
- `cleanupRedisReservations()` - Clean Redis cache
- `reconcileInventory()` - Reconcile ticket inventory
- `notifyCleanups()` - Send notifications
- `getMetrics()` - Get cleanup metrics

**Features:**
- Releases expired reservations
- Fixes orphaned reservations (no order)
- Cleans Redis cache
- Reconciles inventory discrepancies
- Tracks metrics

---

## Sagas

Distributed transaction coordination.

### 1. `PurchaseSaga.ts` - **PurchaseSaga**
Orchestrates the complete purchase flow with compensation.

**Methods:**
- `execute()` - Execute purchase saga
- `reserveInventory()` - Step 1: Reserve tickets
- `createOrder()` - Step 2: Create order
- `createTickets()` - Step 3: Create tickets
- `compensate()` - Rollback on failure
- `compensateTickets()` - Rollback tickets
- `compensateOrder()` - Rollback order
- `compensateInventory()` - Rollback inventory

**Flow:**
1. Reserve inventory (distributed lock)
2. Create order
3. Create tickets
4. Commit or compensate on failure

---

## Clients

External service clients with circuit breakers.

### 1. `OrderServiceClient.ts` - **OrderServiceClient**
Communicates with order-service.

**Methods:**
- `createOrder()` - Create order in order-service
- `getOrder()` - Get order details
- `cancelOrder()` - Cancel order
- `getCircuitBreakerStatus()` - Get circuit breaker status
- `resetCircuitBreaker()` - Reset circuit breaker

**Error Classes:**
- `OrderServiceError` - Base error
- `OrderServiceUnavailableError` - Service unavailable
- `OrderValidationError` - Validation error
- `OrderConflictError` - Conflict error
- `OrderNotFoundError` - Not found error

### 2. `MintingServiceClient.ts` - **MintingServiceClient**
Communicates with minting-service.

**Methods:**
- `mintTicket()` - Mint single ticket
- `getMintStatus()` - Get mint status
- `batchMintTickets()` - Batch mint tickets
- `healthCheck()` - Check service health
- `retryRequest()` - Retry failed request
- `canMakeRequest()` - Check circuit breaker
- `onSuccess()` - Record success
- `onFailure()` - Record failure
- `handleError()` - Handle error
- `getCircuitBreakerStatus()` - Get status

**Features:**
- Circuit breaker pattern
- Exponential backoff retry
- Health checking

---

## Utils

### 1. `async-handler.ts`
Global error handlers for uncaught exceptions.

**Functions:**
- `setupGlobalErrorHandlers()` - Setup global handlers

### 2. `CircuitBreaker.ts` - **CircuitBreaker**
Circuit breaker implementation for fault tolerance.

**Methods:**
- `constructor()` - Initialize with options
- `call()` - Execute function with circuit breaker
- `executeWithTimeout()` - Execute with timeout
- `onSuccess()` - Record success
- `onFailure()` - Record failure
- `getStatus()` - Get circuit breaker status
- `reset()` - Reset circuit breaker

**States:** CLOSED, OPEN, HALF_OPEN

### 3. `logger.ts`
Logging utilities using Winston.

**Functions:**
- `logError()` - Log error with context
- `logRequest()` - Log HTTP request

**Export:** `logger` (Winston instance)

### 4. `errors.ts`
Custom error classes.

**Classes:**
- `AppError` - Base application error (with statusCode, isOperational)
- `ValidationError` - Validation error (400)
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Conflict error (409)
- `UnauthorizedError` - Unauthorized (401)
- `ForbiddenError` - Forbidden (403)
- `TooManyRequestsError` - Rate limit exceeded (429)

### 5. `validation.ts`
Request validation schemas using Joi.

**Schemas:**
- `ticketSchemas.purchaseTickets` - Ticket purchase validation
- `ticketSchemas.createTicketType` - Ticket type creation
- `ticketSchemas.transferTicket` - Ticket transfer
- `ticketSchemas.validateQR` - QR validation

**Functions:**
- `validate()` - Middleware factory for schema validation

---

## Bootstrap

### `container.ts`
Dependency injection container setup (likely using InversifyJS or similar).

**Purpose:** Registers services, controllers, repositories for DI.

---

## Types

### `index.ts`
TypeScript type definitions for the service.

**Likely includes:**
- `Ticket` - Ticket interface
- `TicketType` - Ticket type interface
- `Reservation` - Reservation interface
- `Transfer` - Transfer interface
- `Order` - Order interface
- `PurchaseRequest` - Purchase request type
- `TicketStatus` - Ticket status enum
- And other domain types

---

## Database Tables Owned

From the migration, this service owns **19 tables**:

1. **ticket_types** - Ticket definitions (price, quantity, availability)
2. **reservations** - Temporary reservations (with expiry logic)
3. **tickets** - Individual tickets (QR, status, NFT, transfers)
4. **ticket_transfers** - Transfer records and history
5. **ticket_validations** - Validation/scan events
6. **refunds** - Refund records (references orders)
7. **waitlist** - Waitlist for sold-out events
8. **ticket_price_history** - Audit trail for price changes
9. **ticket_holds** - Admin inventory holds
10. **ticket_bundles** - Bundle definitions
11. **ticket_bundle_items** - Bundle composition
12. **ticket_audit_log** - Complete audit trail
13. **ticket_notifications** - Notification queue
14. **discounts** - Discount code definitions
15. **order_discounts** - Applied discount records
16. **outbox** - Transactional outbox for events
17. **reservation_history** - Reservation lifecycle tracking
18. **webhook_nonces** - Webhook replay protection

**References (not owned):**
- `tenants` (auth-service)
- `users` (auth-service)
- `events` (event-service or marketplace-service)
- `orders` (order-service)
- `venues` (event-service)

---

## External Services Configured

From config and clients:

1. **PostgreSQL** - Primary database (Knex.js)
2. **Redis** - Caching, distributed locks, rate limiting
3. **RabbitMQ** - Message queue (TICKET_MINT queue)
4. **Solana** - NFT minting blockchain
5. **Order Service** - Order management (HTTP)
6. **Minting Service** - NFT minting orchestration (HTTP)
7. **Payment Service** - Payment webhooks (incoming)
8. **AWS Secrets Manager** - Secret management (optional)

---

## Key Features

### Security
- **HMAC Signature Verification** - Internal service auth with timestamp validation
- **Replay Attack Prevention** - Nonce-based protection for webhooks
- **Row-Level Security** - PostgreSQL RLS on tickets table
- **Multi-tenancy** - Tenant isolation at database level
- **JWT Authentication** - User authentication
- **Role-Based Access Control** - Admin, venue_manager, venue_staff roles
- **QR Code Encryption** - AES-256-CBC encryption

### Scalability
- **Distributed Locking** - Redis-based locks for inventory (@tickettoken/shared)
- **Rate Limiting** - Per-endpoint rate limits (Redis-backed)
- **Circuit Breakers** - Fault tolerance for external services
- **Connection Pooling** - PostgreSQL connection pool
- **Caching** - Redis caching for tickets, reservations
- **Message Queue** - Async NFT minting

### Reliability
- **Saga Pattern** - Distributed transaction with compensation
- **Transactional Outbox** - Guaranteed event delivery
- **Health Checks** - Liveness, readiness, detailed health
- **Retry Logic** - Exponential backoff for service calls
- **Graceful Degradation** - Continue on Redis/Queue failures
- **Background Workers** - Reservation expiry, cleanup, reconciliation

### Data Integrity
- **Foreign Key Constraints** - Referential integrity
- **Database Triggers** - Auto-update aggregates (availability, user stats)
- **Stored Procedures** - Complex operations in DB
- **Audit Logging** - Complete audit trail
- **Inventory Reconciliation** - Periodic inventory checks

---

## Architecture Patterns

1. **Microservices** - Service-oriented architecture
2. **Event-Driven** - Queue-based async communication
3. **CQRS (partial)** - Separate read/write paths with caching
4. **Saga Pattern** - Distributed transactions with compensation
5. **Transactional Outbox** - Guaranteed event publishing
6. **Circuit Breaker** - Fault tolerance
7. **Repository Pattern** - Data access abstraction (Models)
8. **Middleware Pipeline** - Request processing chain
9. **Dependency Injection** - Loose coupling (bootstrap/container)

---

## Environment Variables (Key Ones)

From env-validation and configs:

```bash
# Database
DATABASE_URL
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD

# Redis
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD

# RabbitMQ
RABBITMQ_URL
RABBITMQ_HOST
RABBITMQ_PORT

# Solana
SOLANA_RPC_URL
SOLANA_PRIVATE_KEY
SOLANA_NETWORK

# Service URLs
ORDER_SERVICE_URL
MINTING_SERVICE_URL
PAYMENT_SERVICE_URL

# Security
JWT_SECRET
INTERNAL_SERVICE_SECRET
MINT_SERVICE_SECRET
INTERNAL_WEBHOOK_SECRET
QR_ENCRYPTION_KEY

# AWS (optional)
AWS_REGION
AWS_SECRET_NAME

# App
NODE_ENV
PORT
```

---

## Testing

From the `tests/` directory:

- **Unit Tests** - Controllers, services, middleware, models, utils
- **Integration Tests** - Full flow testing with DB
- **Load Tests** - Performance testing
- **Fixtures** - Test data and helpers

---

## API Summary

**Public Endpoints:**
- GET `/events/:eventId/types` - View ticket types
- POST `/validation/qr` - Validate QR code (scanners)

**Authenticated Endpoints:**
- POST `/purchase` - Purchase tickets
- GET `/orders` - View orders
- GET `/orders/tickets` - View tickets
- GET `/:ticketId` - View specific ticket
- POST `/transfer` - Transfer ticket
- POST `/validate-qr` - Validate QR (venue staff)

**Admin Endpoints:**
- POST `/types` - Create ticket type
- PUT `/types/:id` - Update ticket type
- GET `/health/circuit-breakers` - Monitor circuit breakers
- POST `/health/circuit-breakers/reset` - Reset circuit breakers

**Internal Endpoints:**
- POST `/process-mint` - Process mint job
- GET `/internal/tickets/:ticketId/status` - Get ticket status
- POST `/internal/tickets/cancel-batch` - Batch cancel
- POST `/internal/tickets/calculate-price` - Calculate price
- POST `/payment-success` - Payment webhook
- POST `/payment-failed` - Payment webhook

---

## Notes

- **Service Maturity:** Production-ready with comprehensive error handling, security, and monitoring
- **Database Migrations:** Single baseline migration (combines 3 original migrations)
- **Multi-tenancy:** Enforced at DB level with RLS and tenant_id foreign keys
- **NFT Integration:** Async minting via queue workers
- **Distributed Locking:** Uses shared library for inventory management
- **Webhook Security:** HMAC + nonce-based replay protection
- **Caching Strategy:** Redis with automatic fallback to DB
- **Rate Limiting:** Per-endpoint configuration via Redis
- **Audit Trail:** Comprehensive via triggers and audit log table
- **Compensation Logic:** Saga pattern handles rollbacks

---

*This overview was generated by analyzing the ticket-service codebase structure, routes, services, controllers, migrations, and related files.*
