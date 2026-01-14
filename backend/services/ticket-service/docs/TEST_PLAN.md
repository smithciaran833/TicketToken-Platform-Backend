# Ticket Service - Complete Test Plan

## src/index.ts
### Unit Tests
- initTracing() is called before other imports
- setupGlobalErrorHandlers() is called
- onRequestStart() increments inFlightRequests and total
- onRequestEnd() decrements inFlightRequests and increments completed
- onRequestEnd() increments errors when hasError=true
- getInFlightRequests() returns current count
- getRequestStats() returns all counters including inFlight

### Integration Tests
- waitForConnectionDrain() returns true when no in-flight requests
- waitForConnectionDrain() waits for requests to complete
- waitForConnectionDrain() returns false on timeout
- waitForConnectionDrain() logs progress every second
- startServer() initializes DatabaseService
- startServer() initializes RedisService
- startServer() starts ReservationCleanupWorker
- startServer() builds and starts Fastify app
- startServer() registers admin metrics endpoint
- gracefulShutdown() sets isShuttingDown flag
- gracefulShutdown() ignores duplicate shutdown signals
- gracefulShutdown() waits for connection drain
- gracefulShutdown() closes Fastify server
- gracefulShutdown() stops cleanup worker
- gracefulShutdown() closes DatabaseService
- gracefulShutdown() closes RedisService
- gracefulShutdown() closes QueueService if available
- gracefulShutdown() shuts down tracing
- gracefulShutdown() exits with code 0 on success
- gracefulShutdown() exits with code 1 on error
- SIGTERM handler calls gracefulShutdown
- SIGINT handler calls gracefulShutdown

## src/app.ts
### Unit Tests
- createRateLimitRedisClient() returns undefined when useRedis=false
- createRateLimitRedisClient() logs warning when not using Redis
- createRateLimitRedisClient() creates Redis client with correct options
- createRateLimitRedisClient() adds password to options when configured
- createRateLimitRedisClient() adds TLS to options when configured
- createRateLimitRedisClient() throws in production when Redis connection fails
- createRateLimitRedisClient() returns undefined in non-production when connection fails

### Integration Tests
- buildApp() initializes DatabaseService first
- buildApp() creates Fastify instance with correct options
- buildApp() sets trustProxy from config
- buildApp() generates request IDs
- buildApp() registers errorHandler
- buildApp() registers notFoundHandler
- buildApp() registers metrics middleware when enabled
- buildApp() registers idempotency onSend hook
- buildApp() registers idempotency onError hook
- buildApp() registers CORS with production origins from env
- buildApp() registers CORS with all origins in development
- buildApp() registers Helmet with CSP in production
- buildApp() registers Helmet with HSTS in production
- buildApp() disables CSP in development
- buildApp() registers rate limiting when enabled
- buildApp() uses Redis storage for rate limiting when available
- buildApp() rate limit keyGenerator includes tenantId and userId
- buildApp() rate limit allowList skips health endpoints
- buildApp() registers healthRoutes without prefix
- buildApp() registers internalRoutes
- buildApp() registers webhookRoutes with /api/v1/webhooks prefix
- buildApp() registers ticketRoutes with /api/v1/tickets prefix
- buildApp() registers purchaseRoutes with /api/v1/purchase prefix
- buildApp() registers orderRoutes with /api/v1/orders prefix
- buildApp() registers transferRoutes with /api/v1/transfer prefix
- buildApp() registers qrRoutes with /api/v1/qr prefix
- buildApp() registers validationRoutes with /api/v1/validation prefix
- buildApp() registers mintRoutes with /mint prefix
- buildApp() registers SIGTERM and SIGINT handlers
- buildApp() shutdown handler closes server, tracing, and database

## src/types/index.ts
### Unit Tests
- TicketStatus enum contains all valid statuses
- TicketType interface has required fields
- Ticket interface has required fields
- CreateTicketTypeDTO has validation-ready structure
- PurchaseTicketDTO has required fields
- Type exports are accessible from index

## src/models/Ticket.ts
### Unit Tests
- TicketModel.tableName returns 'tickets'
- TicketModel.idColumn returns 'id'
- jsonSchema defines required fields
- jsonSchema enforces status enum values
- relationMappings defines ticketType belongsTo relationship
- relationMappings defines event belongsTo relationship
- relationMappings defines user belongsTo relationship
- $beforeInsert sets created_at and updated_at
- $beforeUpdate sets updated_at

## src/models/Order.ts
### Unit Tests
- OrderModel.tableName returns 'orders'
- jsonSchema defines required fields
- jsonSchema enforces status enum
- relationMappings defines items hasMany relationship
- relationMappings defines user belongsTo relationship
- $beforeInsert generates order_number if not set
- $beforeInsert sets timestamps
- $beforeUpdate sets updated_at

## src/models/Transfer.ts
### Unit Tests
- TransferModel.tableName returns 'ticket_transfers'
- jsonSchema defines required fields
- jsonSchema enforces status enum
- relationMappings defines ticket belongsTo relationship
- relationMappings defines fromUser belongsTo relationship
- relationMappings defines toUser belongsTo relationship
- $beforeInsert sets transferred_at timestamp
- Default status is 'pending'

## src/models/Reservation.ts
### Unit Tests
- ReservationModel.tableName returns 'reservations'
- jsonSchema defines required fields
- jsonSchema enforces status enum
- relationMappings defines event belongsTo relationship
- relationMappings defines user belongsTo relationship
- $beforeInsert sets expires_at default
- calculateExpiry() returns correct timestamp

## src/models/QRCode.ts
### Unit Tests
- QRCodeModel.tableName returns 'qr_codes'
- jsonSchema defines required fields
- $beforeInsert sets created_at
- isExpired() returns true when past expires_at
- isExpired() returns false when before expires_at

## src/config/index.ts
### Unit Tests
- config.env defaults to 'development'
- config.port defaults to 3004
- config.database.url reads from DATABASE_URL
- config.redis.url reads from REDIS_URL
- config.solana.rpcUrl reads from SOLANA_RPC_URL
- config.solana.cluster defaults to 'devnet'
- config.jwt.secret reads from JWT_SECRET
- config.rateLimit.enabled defaults based on environment
- config.services contains auth, event, payment URLs
- config exports frozen object

## src/config/database.ts
### Unit Tests
- dbConfig.client is 'pg'
- dbConfig.connection uses DATABASE_URL
- dbConfig.pool.min defaults to 2
- dbConfig.pool.max defaults to 10
- dbConfig.pool.acquireTimeoutMillis is set
- dbConfig.searchPath includes tenant schema
- SSL config enabled in production

### Integration Tests
- Database connection can be established
- Pool respects max connections
- Connection timeout works correctly

## src/config/env-validation.ts
### Unit Tests
- validateEnv() throws for missing DATABASE_URL
- validateEnv() throws for missing REDIS_URL
- validateEnv() throws for missing JWT_SECRET in production
- validateEnv() warns for missing optional vars in development
- validateEnv() validates URL formats
- validateEnv() validates numeric ranges
- validateEnv() returns validated config object

## src/config/redis.ts
### Unit Tests
- redisConfig.url reads from REDIS_URL
- redisConfig.password reads from REDIS_PASSWORD
- redisConfig.tls enabled when REDIS_TLS=true
- redisConfig.keyPrefix includes service name
- initRedis() creates Redis client
- initRedis() handles connection errors
- getRedisClient() returns initialized client
- getRedisClient() throws if not initialized

## src/config/secrets.ts
### Unit Tests
- getSecret() reads from environment
- getSecret() returns undefined for missing secret
- getSecret() caches retrieved secrets
- getRequiredSecret() throws for missing secret
- getRequiredSecret() returns secret value
- Secrets are not logged

## src/config/service-auth.ts
### Unit Tests
- SERVICE_CREDENTIALS contains per-service secrets
- generateServiceToken() creates JWT with correct claims
- generateServiceToken() sets audience to target service
- generateServiceToken() sets expiry (default 60s)
- generateServiceToken() includes bodyHash when provided
- verifyServiceToken() validates JWT signature
- verifyServiceToken() validates audience
- verifyServiceToken() validates expiry
- verifyServiceToken() returns decoded payload
- computeBodyHash() returns SHA256 hash
- CircuitBreaker.allowRequest() returns true when CLOSED
- CircuitBreaker.allowRequest() returns false when OPEN
- CircuitBreaker.allowRequest() returns true in HALF_OPEN for test request
- CircuitBreaker.recordSuccess() decrements failure count
- CircuitBreaker.recordSuccess() transitions HALF_OPEN to CLOSED
- CircuitBreaker.recordFailure() increments failure count
- CircuitBreaker.recordFailure() transitions to OPEN after threshold
- CircuitBreaker.getState() returns current state
- CircuitBreaker.getAllStates() returns all breaker states
- CircuitBreaker.reset() resets to CLOSED state

## src/bootstrap/container.ts
### Unit Tests
- container.register() registers service
- container.resolve() returns registered service
- container.resolve() throws for unregistered service
- Singleton services return same instance
- Transient services return new instance each time
- Dependencies are injected correctly

## src/clients/MintingServiceClient.ts
### Unit Tests
- Constructor sets baseUrl from config
- Constructor sets timeout default
- Constructor initializes axios instance

### Integration Tests
- mintTicket() sends POST to /mint endpoint
- mintTicket() includes ticketId, metadata in body
- mintTicket() returns mint address and signature
- mintTicket() throws on 4xx errors
- mintTicket() retries on 5xx errors
- getMintStatus() sends GET to /mint/:id/status
- getMintStatus() returns status and details
- Health check endpoint works

## src/clients/OrderServiceClient.ts
### Unit Tests
- Constructor sets baseUrl from config
- OrderServiceError has correct properties
- OrderServiceUnavailableError sets code correctly
- OrderValidationError sets code and details
- OrderConflictError sets code correctly
- OrderNotFoundError sets code correctly

### Integration Tests
- createOrder() sends POST with correct payload
- createOrder() includes idempotencyKey in headers
- createOrder() returns orderId, orderNumber, status
- createOrder() throws OrderValidationError on 400
- createOrder() throws OrderConflictError on 409
- createOrder() throws OrderServiceUnavailableError on 503
- getOrder() sends GET to /orders/:id
- getOrder() throws OrderNotFoundError on 404
- cancelOrder() sends POST to /orders/:id/cancel
- cancelOrder() includes reason in body
- updateOrderStatus() sends PATCH with status
- Health check returns service status

## src/clients/index.ts
### Unit Tests
- Exports OrderServiceClient
- Exports orderServiceClient singleton
- Exports OrderServiceError
- Exports OrderServiceUnavailableError
- Exports OrderValidationError
- Exports OrderConflictError
- Exports OrderNotFoundError

## src/middleware/auth.ts
### Unit Tests
- authMiddleware extracts token from Authorization header
- authMiddleware handles Bearer prefix
- authMiddleware throws 401 for missing token
- authMiddleware throws 401 for invalid token
- authMiddleware throws 401 for expired token
- authMiddleware sets request.user with decoded payload
- authMiddleware sets request.userId
- optionalAuthMiddleware does not throw for missing token
- optionalAuthMiddleware sets user if token present
- requireRole() throws 403 if user lacks role
- requireRole() allows if user has role
- requireRole() allows admin for any role
- validateApiKey() checks X-Api-Key header
- validateApiKey() throws 401 for invalid key

## src/middleware/errorHandler.ts
### Unit Tests
- errorHandler returns 400 for ValidationError
- errorHandler returns 404 for NotFoundError
- errorHandler returns 409 for ConflictError
- errorHandler returns 401 for UnauthorizedError
- errorHandler returns 403 for ForbiddenError
- errorHandler returns 429 for TooManyRequestsError
- errorHandler returns 500 for unknown errors
- errorHandler formats response as RFC 7807 Problem Details
- errorHandler includes requestId in response
- errorHandler logs error with context
- errorHandler does not leak stack trace in production
- notFoundHandler returns 404 with correct format

## src/middleware/idempotency.middleware.ts
### Unit Tests
- IDEMPOTENCY_CONFIG has correct operation TTLs
- generateIdempotencyKey() creates hash from key, tenant, operation
- getIdempotencyLock() returns lock key format
- parseOperationType() extracts operation from URL
- parseOperationType() returns 'default' for unknown

### Integration Tests
- createIdempotencyMiddleware() returns 400 if key missing for required operation
- createIdempotencyMiddleware() returns cached response for duplicate key
- createIdempotencyMiddleware() sets X-Idempotency-Key header
- createIdempotencyMiddleware() sets X-Idempotency-Status header (HIT/MISS)
- createIdempotencyMiddleware() acquires lock for new request
- createIdempotencyMiddleware() returns 409 if lock already held
- createIdempotencyMiddleware() stores response after completion
- idempotencyResponseHook saves successful responses
- idempotencyResponseHook skips non-idempotent requests
- idempotencyErrorHook releases lock on error
- idempotencyErrorHook clears pending state
- Lock expires after operation TTL

## src/middleware/rate-limit.ts
### Unit Tests
- rateLimiters.read has correct max and windowMs
- rateLimiters.write has correct max and windowMs
- rateLimiters.purchase has stricter limits
- rateLimiters.transfer has stricter limits
- rateLimiters.qrScan has high limits for scanning
- keyGenerator uses tenantId and userId
- keyGenerator falls back to IP
- skipSuccessfulRequests is false
- onLimitReached logs rate limit event

### Integration Tests
- Rate limiter returns 429 when limit exceeded
- Rate limiter includes Retry-After header
- Rate limiter includes X-RateLimit-* headers
- Different endpoints use different limiters
- Rate limits reset after window

## src/middleware/tenant.ts
### Unit Tests
- tenantMiddleware extracts tenant from X-Tenant-Id header
- tenantMiddleware extracts tenant from subdomain
- tenantMiddleware extracts tenant from JWT claim
- tenantMiddleware throws 400 for missing tenant
- tenantMiddleware validates tenant UUID format
- tenantMiddleware sets request.tenantId
- tenantMiddleware sets request.tenantContext
- validateTenantAccess() verifies user belongs to tenant
- validateTenantAccess() throws 403 for wrong tenant
- validateTenantAccess() allows system/admin bypass

## src/middleware/upload.middleware.ts
### Unit Tests
- uploadMiddleware accepts valid file types
- uploadMiddleware rejects invalid file types
- uploadMiddleware enforces max file size
- uploadMiddleware returns 413 for oversized files
- uploadMiddleware sets request.file with metadata
- uploadMiddleware sanitizes filename
- uploadMiddleware generates unique storage path

## src/controllers/ticketController.ts
### Unit Tests
- createTicketType returns 201 with created type
- createTicketType invalidates cache
- getTicketTypes returns cache HIT with X-Cache header
- getTicketTypes returns cache MISS and fetches from DB
- createReservation returns 401 when not authenticated
- createReservation transforms snake_case to camelCase
- confirmPurchase returns 401 when not authenticated
- confirmPurchase confirms reservation
- getUserTickets returns 403 for other users
- getUserTickets allows admin access
- getUserTickets returns own tickets
- releaseReservation returns 401 when not authenticated
- releaseReservation invalidates cache
- getTicketById returns 404 when not found
- getTicketById returns 403 for non-owner
- getTicketById allows admin and owner
- generateQR returns 403 for non-owner
- generateQR returns QR with 30s expiry
- validateQR validates and returns result
- getTicketType returns 404 when not found
- updateTicketType updates and invalidates cache
- getCurrentUserTickets returns 401 when not authenticated

## src/controllers/purchaseController.ts
### Unit Tests
- createOrder returns 400 for missing idempotency-key
- createOrder returns 400 for missing eventId
- createOrder returns 400 for missing items
- createOrder returns 400 for missing tenantId
- createOrder routes to saga when useOrderService feature flag true
- createOrder routes to legacy when feature flag false

### Integration Tests (Saga Path)
- Returns cached response for duplicate idempotency key
- Executes PurchaseSaga for new request
- Caches response after success
- Returns 409 for INSUFFICIENT_INVENTORY
- Returns 503 for OrderServiceUnavailableError
- Returns 400 for OrderValidationError
- Returns 500 for generic failures

### Integration Tests (Legacy Path)
- Returns cached response for duplicate key
- Validates tenant_id matches ticket type (cross-tenant prevention)
- Returns 404 for wrong tenant
- Calculates totals correctly (price * quantity)
- Applies discounts before fees
- Calculates platform fee (7.5%)
- Calculates processing fee (2.9%)
- Creates order record
- Updates inventory atomically
- Returns 409 for insufficient inventory
- Creates order_items records
- Creates order_discounts records
- Caches response
- Rolls back on error

## src/controllers/transferController.ts
### Unit Tests
- transferTicket calls transferService.transferTicket
- transferTicket logs successful transfer to audit with IP/user-agent
- transferTicket logs failed transfer to audit
- getTransferHistory returns transfer history
- validateTransfer returns validation result

## src/controllers/qrController.ts
### Unit Tests
- generateQR verifies ownership with tenant isolation
- generateQR throws ForbiddenError for non-owner
- generateQR allows admin access
- generateQR returns qrCode, qrImage, 30s expiresIn
- validateQR validates with event context
- validateQR passes validator info
- refreshQR verifies ownership
- refreshQR throws ForbiddenError for non-owner
- refreshQR generates new QR

## src/controllers/orders.controller.ts
### Unit Tests
- getOrderById returns 400 for missing orderId
- getOrderById returns 401 when not authenticated
- getOrderById returns 404 when not found or wrong user
- getOrderById sets RLS context
- getOrderById returns order with items and formatted prices
- getOrderById returns 500 with requestId on error
- getUserOrders returns 401 when not authenticated
- getUserOrders sets RLS context
- getUserOrders filters by status
- getUserOrders applies limit/offset pagination
- getUserOrders returns orders with event info
- getUserTickets returns 401 when not authenticated
- getUserTickets sets RLS context
- getUserTickets filters by eventId and status
- getUserTickets returns tickets with event/type info
- getUserTickets converts price to cents

## src/routes/ticketRoutes.ts
### E2E Tests
- POST /types requires auth
- POST /types requires admin or venue_manager role
- POST /types validates schema
- POST /types uses write rate limiter
- GET /events/:eventId/types requires tenant context
- GET /events/:eventId/types uses read rate limiter
- POST /purchase requires auth
- POST /purchase validates schema
- POST /purchase uses purchase rate limiter
- POST /reservations/:reservationId/confirm requires auth
- POST /reservations/:reservationId/confirm uses purchase rate limiter
- DELETE /reservations/:reservationId requires auth
- DELETE /reservations/:reservationId uses write rate limiter
- GET /:ticketId/qr requires auth
- GET /:ticketId/qr uses read rate limiter
- POST /validate-qr requires auth and role check
- POST /validate-qr uses qrScan rate limiter
- GET /users/:userId requires auth
- GET /users/:userId uses read rate limiter
- GET /types/:id requires tenant context
- GET /types/:id uses read rate limiter
- PUT /types/:id requires auth and admin/venue_manager role
- PUT /types/:id uses write rate limiter
- GET /:ticketId requires auth
- GET /:ticketId uses read rate limiter
- GET / requires auth
- GET / uses read rate limiter

## src/routes/purchaseRoutes.ts
### Unit Tests
- createValidationHandler parses strict schema
- createValidationHandler throws ValidationError for Zod failures
- createValidationHandler sets validatedBody on request

### E2E Tests
- POST / requires auth
- POST / requires tenant middleware
- POST / requires idempotency.purchase middleware
- POST / uses purchase rate limiter
- POST / validates body schema
- POST / rejects unknown properties
- POST / uses validatedBody
- POST /confirm requires auth
- POST /confirm requires tenant
- POST /confirm requires idempotency.reservation
- POST /confirm returns 501 stub
- DELETE /:reservationId requires auth
- DELETE /:reservationId requires tenant
- DELETE /:reservationId returns 501 stub

## src/routes/transferRoutes.ts
### E2E Tests
- POST / requires auth
- POST / requires tenant middleware
- POST / validates schema
- POST / uses transfer rate limiter (5 req/min)
- GET /:ticketId/history requires auth
- GET /:ticketId/history requires tenant
- GET /:ticketId/history uses read rate limiter
- POST /validate requires auth
- POST /validate requires tenant
- POST /validate uses read rate limiter

## src/routes/qrRoutes.ts
### E2E Tests
- GET /:ticketId/generate calls qrController.generateQR
- POST /validate calls qrController.validateQR
- POST /refresh calls qrController.refreshQR
- Note: No middleware present - security review needed

## src/routes/orders.routes.ts
### E2E Tests
- GET / requires auth
- GET / uses read rate limiter
- GET /tickets requires auth
- GET /tickets uses read rate limiter
- GET /:orderId requires auth
- GET /:orderId uses read rate limiter
- Route order: / and /tickets registered before /:orderId

## src/routes/health.routes.ts
### Unit Tests
- getCachedHealth returns null for expired cache
- getCachedHealth returns cached result when valid
- setCachedHealth stores result with TTL
- checkDatabaseHealth returns healthy/degraded/unhealthy
- checkDatabaseHealth times out after DEPENDENCY_TIMEOUT_MS
- checkRedisHealth returns healthy/degraded/unhealthy
- checkQueueHealth returns healthy/degraded/unhealthy
- checkBlockchainHealth returns healthy/degraded/unhealthy
- calculateOverallStatus returns unhealthy if DB unhealthy
- calculateOverallStatus returns degraded if any degraded/unhealthy
- calculateOverallStatus returns healthy if all healthy
- registerCircuitBreaker adds breaker to registry
- getCircuitBreakersStatus returns all breaker states
- startEventLoopMonitoring starts interval
- startEventLoopMonitoring calculates lag correctly
- stopEventLoopMonitoring clears interval
- getEventLoopMetrics returns lag metrics

### E2E Tests
- GET /health returns basic status without auth
- GET /health/live returns alive status
- GET /health/ready checks DB/Redis/Queue with timeouts
- GET /health/ready returns 503 if DB unhealthy
- GET /health/detailed requires auth
- GET /health/circuit-breakers requires auth and admin/ops role
- POST /health/circuit-breakers/reset requires admin role
- POST /health/circuit-breakers/reset reinitializes DB
- GET /metrics returns Prometheus format
- GET /health/startup returns 503 until DB ready
- GET /health/dependencies returns all dependency health
- GET /health/dependencies uses cache
- GET /health/dependencies sets X-Cache header
- GET /health/dependencies sets X-Response-Time header
- GET /health/dependencies sets X-SLA-Compliance header
- GET /health/full requires auth and admin/ops role
- GET /health/full includes diagnostics/errorSummary/memory/SLA
- POST /health/cache/clear requires admin role
- POST /health/cache/clear clears health cache

## src/routes/internalRoutes.ts
### Unit Tests
- verifyInternalService rejects missing headers
- verifyInternalService rejects expired timestamp (>5min)
- verifyInternalService accepts temp-signature in dev
- verifyInternalService validates HMAC signature

### E2E Tests
- GET /internal/tickets/:ticketId/status requires internal auth
- GET /internal/tickets/:ticketId/status returns 400 if ticketId missing
- GET /internal/tickets/:ticketId/status returns 404 if not found
- GET /internal/tickets/:ticketId/status returns status with canRefund logic
- POST /internal/tickets/cancel-batch requires internal auth
- POST /internal/tickets/cancel-batch returns 400 if ticketIds invalid
- POST /internal/tickets/cancel-batch cancels tickets and clears cache
- POST /internal/tickets/cancel-batch returns partial success
- POST /internal/tickets/calculate-price requires internal auth
- POST /internal/tickets/calculate-price returns 404 for missing tickets
- POST /internal/tickets/calculate-price returns total and breakdown

## src/routes/mintRoutes.ts
### Unit Tests
- verifyMintAuthorization rejects missing authorization
- verifyMintAuthorization rejects invalid authorization
- verifyMintAuthorization returns 400 for invalid job structure
- verifyMintAuthorization returns 404 if order not found
- verifyMintAuthorization returns 400 if order status not PAID/AWAITING_MINT
- verifyMintAuthorization sets tenantId from order

### E2E Tests
- POST /process-mint requires mint authorization
- POST /process-mint processes via MintWorker
- POST /process-mint returns 500 on failure

## src/routes/validationRoutes.ts
### E2E Tests
- POST /qr validates schema
- POST /qr calls qrController.validateQR

## src/routes/webhookRoutes.ts
### Unit Tests
- deterministicStringify produces consistent output
- deterministicStringify handles null values
- deterministicStringify handles arrays
- deterministicStringify handles nested objects
- verifyInternalWebhook rejects missing signature
- verifyInternalWebhook rejects missing timestamp
- verifyInternalWebhook rejects missing nonce
- verifyInternalWebhook rejects expired timestamp (>5min)
- verifyInternalWebhook rejects replayed nonce
- verifyInternalWebhook stores nonce in DB
- verifyInternalWebhook validates HMAC signature
- verifyInternalWebhook sets webhookMetadata on request

### E2E Tests
- POST /payment-success requires webhook verification
- POST /payment-success returns 400 if missing orderId
- POST /payment-success returns 400 if missing paymentId
- POST /payment-success calls QueueListener.processPaymentSuccess
- POST /payment-failed requires webhook verification
- POST /payment-failed returns 400 if missing orderId
- POST /payment-failed calls QueueListener.processPaymentFailure
- Replay protection rejects same nonce on second request

## src/services/ticketService.ts
### Unit Tests
- normalizeStatus converts uppercase to lowercase
- isTerminalStatus returns true for checked_in/used/refunded/expired/cancelled
- isTerminalStatus returns false for active/reserved/sold
- validateStateTransition passes for valid transitions
- validateStateTransition throws ValidationError for invalid transitions
- validateStateTransition throws ValidationError for unknown status
- validateStateTransition throws ValidationError for terminal states
- encryptData throws if QR_ENCRYPTION_KEY not set
- encryptData returns iv:encrypted format
- decryptData correctly decrypts encrypted data
- generateQRCode returns TKT:{ticketId}:{timestamp} format

### Integration Tests
- createTicketType inserts with UUID
- createTicketType converts priceCents to dollars
- createTicketType sets available_quantity equal to quantity
- getTicketTypes returns types for event/tenant ordered by price ASC
- checkAvailability returns true when available
- checkAvailability returns false when not available
- checkAvailability throws NotFoundError for missing type
- createReservation acquires inventory lock
- createReservation validates tenant isolation
- createReservation throws NotFoundError for missing type
- createReservation throws ConflictError when not enough inventory
- createReservation decrements available_quantity
- createReservation creates reservation with expiry
- createReservation caches in Redis gracefully
- createReservation throws ConflictError on LockTimeoutError
- createReservation throws ConflictError on LockContentionError
- createReservation throws ConflictError on LockSystemError
- confirmPurchase acquires reservation lock
- confirmPurchase throws NotFoundError for missing reservation
- confirmPurchase throws ConflictError for expired/cancelled reservation
- confirmPurchase creates tickets
- confirmPurchase updates ticket_types sold_quantity++ and reserved_quantity--
- confirmPurchase updates reservation to confirmed
- confirmPurchase queues NFT minting
- confirmPurchase clears cache
- getTicket returns cached ticket from Redis
- getTicket queries DB and caches on miss
- getTicket throws NotFoundError for missing ticket
- getTicket enforces tenant isolation
- getUserTickets validates tenant ID format
- getUserTickets throws ValidationError for invalid tenant
- getUserTickets uses withTenantContext for RLS
- getUserTickets filters by eventId when provided
- updateTicketStatus validates state transition
- updateTicketStatus throws NotFoundError for missing ticket
- updateTicketStatus skips validation when skipValidation=true with warning
- updateTicketStatus updates status and clears cache
- expireReservations calls release_expired_reservations() DB function
- releaseReservation acquires lock
- releaseReservation throws NotFoundError for missing reservation
- releaseReservation verifies user ownership
- releaseReservation updates status to cancelled
- releaseReservation restores available_quantity
- releaseReservation clears cache
- generateQR creates encrypted QR payload
- generateQR generates QR image
- validateQR handles encrypted format
- validateQR handles base64 format
- validateQR returns valid=true for active non-used ticket
- validateQR returns valid=false for invalid ticket
- getTicketType returns type or null with tenant isolation
- updateTicketType updates specified fields
- updateTicketType converts priceCents to dollars
- updateTicketType throws NotFoundError for missing type

## src/services/transferService.ts
### Unit Tests
- TRANSFER_COOLDOWN_MINUTES equals 30
- MAX_DAILY_TRANSFERS equals 10

### Integration Tests
- transferTicket calls validateTransferRequest first
- transferTicket throws ValidationError when validation fails
- transferTicket locks ticket FOR UPDATE
- transferTicket throws NotFoundError for missing ticket
- transferTicket throws ForbiddenError for non-owner
- transferTicket throws ValidationError for non-active ticket
- transferTicket throws ValidationError for non-transferable ticket
- transferTicket checks event.allow_transfers setting
- transferTicket checks transfer_deadline_hours
- transferTicket checks transfer_blackout period
- transferTicket checks max_transfers_per_ticket
- transferTicket throws NotFoundError for missing recipient
- transferTicket checks recipient identity_verification requirement
- transferTicket updates ticket user_id
- transferTicket updates ticket status to 'transferred'
- transferTicket increments transfer_count
- transferTicket creates ticket_transfers record
- transferTicket clears cache
- transferTicket publishes ticket.transferred event
- transferTicket sends notifications
- getTransferHistory returns transfers ordered by transferred_at DESC
- validateTransferRequest returns invalid for same user (self-transfer)
- validateTransferRequest checks 30 minute cooldown
- validateTransferRequest checks 10 daily transfer limit
- validateTransferRequest returns invalid for missing recipient
- validateTransferRequest checks recipient account_status='ACTIVE'
- validateTransferRequest checks recipient can_receive_transfers
- validateTransferRequest checks recipient email_verified
- validateTransferRequest returns invalid for missing ticket
- validateTransferRequest checks ticket is_transferable
- validateTransferRequest checks ticket status='active'

## src/services/qrService.ts
### Unit Tests
- encrypt returns iv:encrypted hex format
- decrypt correctly decrypts encrypted data
- decrypt throws for invalid format

### Integration Tests
- generateRotatingQR fetches ticket
- generateRotatingQR creates time-based QR with timestamp/nonce
- generateRotatingQR encrypts payload
- generateRotatingQR generates QR image with options
- generateRotatingQR stores validation data in Redis gracefully
- generateRotatingQR returns qrCode starting with "TKT:"
- validateQR throws ValidationError for invalid format (not TKT:)
- validateQR decrypts and parses payload
- validateQR returns invalid for expired QR (timestamp diff > 2 minutes)
- validateQR returns invalid for wrong event
- validateQR returns invalid for already used ticket
- validateQR returns invalid for wrong status
- validateQR locks ticket FOR UPDATE
- validateQR throws ValidationError if ticket used during validation
- validateQR updates ticket status to USED with validation details
- validateQR creates ticket_validations log entry
- validateQR clears cache
- validateQR returns valid with validatedAt
- getTicketData throws NotFoundError for missing ticket

## src/services/discountService.ts
### Unit Tests
- applyDiscounts returns unchanged when no codes
- applyDiscounts returns unchanged when empty array

### Integration Tests
- getValidDiscounts filters by tenant
- getValidDiscounts filters by valid_from <= NOW
- getValidDiscounts filters by valid_until >= NOW
- getValidDiscounts filters by times_used < max_uses
- getValidDiscounts filters by is_active=true
- getValidDiscounts returns empty array on error
- applyDiscounts calculates percentage discount correctly
- applyDiscounts calculates fixed discount correctly
- applyDiscounts converts to cents
- applyDiscounts caps discount at current amount
- applyDiscounts applies only one discount
- applyDiscounts records usage
- applyDiscounts returns correct finalAmountCents and totalDiscountCents
- recordDiscountUsage increments times_used
- validateDiscountCode returns invalid for non-existent code
- validateDiscountCode returns invalid for inactive code
- validateDiscountCode returns invalid for not-yet-active code
- validateDiscountCode returns invalid for expired code
- validateDiscountCode returns invalid for usage-limit-reached
- validateDiscountCode returns valid with type and value

## src/services/databaseService.ts
### Unit Tests
- validateQueryParams returns safe=true for null/undefined/empty/non-string
- validateQueryParams detects SQL injection patterns (--comment, OR 1=1, UNION SELECT, DROP TABLE)
- validateQueryParams returns warnings array
- isParameterizedQuery returns true for parameterized queries
- isParameterizedQuery returns false for unparameterized string literals
- extractOperation identifies SELECT/INSERT/UPDATE/DELETE/TRANSACTION/COMMIT/ROLLBACK/OTHER
- extractTable extracts table name from FROM/INTO/UPDATE
- extractTable returns undefined when table not found
- trackSlowQuery adds to recentSlowQueries
- trackSlowQuery maintains MAX_SLOW_QUERIES limit
- getRecentSlowQueries returns copy of array
- clearSlowQueryHistory empties array

### Integration Tests
- initialize resolves DNS for hostname
- initialize creates pool with correct config
- initialize retries with exponential backoff on failure
- initialize sets statement_timeout
- initialize sets lock_timeout
- initialize starts index monitoring interval
- initialize starts pool metrics interval
- getPool throws if not initialized
- getPool returns pool when initialized
- query throws if not initialized
- query logs warning for unparameterized queries
- query throws in production for SQL injection attempt
- query logs warning in development for SQL injection
- query records success metrics
- query records error metrics
- query logs slow queries above threshold
- query logs critical slow queries
- transaction runs BEGIN, callback, COMMIT
- transaction runs ROLLBACK on error
- transaction records metrics
- close stops all intervals
- close ends pool
- isHealthy returns false if not initialized
- isHealthy returns true when SELECT 1 succeeds
- isHealthy returns false on query failure
- getIndexStats returns unused indexes
- getIndexStats returns high sequential scan tables
- getPoolStats returns total, idle, waiting counts
- Index monitoring logs warnings for unused indexes
- Index monitoring logs warnings for high sequential scans

## src/services/redisService.ts
### Unit Tests
- buildTenantKey returns service:tenant:namespace:key format
- buildTenantKey throws if tenantId empty
- buildGlobalKey returns service:global:namespace:key format
- parseKey extracts all components
- parseKey returns null for invalid key
- NAMESPACES constant has expected values

### Integration Tests
- initialize calls initRedis
- initialize sets client
- getClient throws if not initialized
- getClient returns client when initialized
- get returns value via cacheManager
- get returns null and logs on error
- set stores with TTL
- set throws on failure
- del deletes via cacheManager
- exists returns true when key exists
- exists returns false when key missing
- incr increments value
- expire sets TTL
- mget gets multiple keys
- mset sets multiple keys
- isHealthy returns true when PING returns PONG
- isHealthy returns false on error
- getTenant builds tenant key and gets
- setTenant builds tenant key and sets
- delTenant builds tenant key and deletes
- existsTenant builds tenant key and checks
- incrTenant builds tenant key and increments
- mgetTenant builds tenant keys and gets
- msetTenant builds tenant keys and sets
- deleteAllTenantKeys throws if no tenantId
- deleteAllTenantKeys scans and deletes all matching keys
- getGlobal builds global key and gets
- setGlobal builds global key and sets
- delGlobal builds global key and deletes

## src/services/queueService.ts
### Unit Tests
- DLQ_CONFIG.maxRetries equals 3
- DLQ_CONFIG.retryDelayMs equals 1000
- DLQ_CONFIG.dlqSuffix equals '.dlq'
- DLQ_CONFIG.dlqMessageTtl equals 24 hours in ms
- isConnected returns false when not connected
- isConnected returns true when connected

### Integration Tests
- initialize calls connect
- connect establishes RabbitMQ connection
- connect creates publish channel
- connect creates consume channel
- connect sets up queues with DLQ bindings
- connect emits 'connected' event
- connect handles connection error with reconnect
- connect handles connection close with reconnect
- connect uses exponential backoff for reconnect
- setupQueues creates DLQ for each queue
- setupQueues configures dead-letter-exchange
- publish gracefully skips when not initialized with warning
- publish sends persistent message
- publish throws when channel buffer full
- consume sets prefetch to 1
- consume acks message on success
- consume tracks retries on failure
- consume requeues with delay when retrying
- consume nacks without requeue after max retries (sends to DLQ)
- consumeDLQ processes DLQ messages
- consumeDLQ always acks to prevent infinite loop
- close clears reconnect timer
- close closes channels
- close closes connection
- publishTenantScoped creates tenant-specific queue
- publishTenantScoped adds tenant metadata
- consumeTenantScoped validates tenant matches
- consumeTenantScoped throws on tenant mismatch
- processTenantJob wraps operation in tenant context
- scheduleRecurringTenantJob runs immediately then on interval
- scheduleRecurringTenantJob continues with other tenants on error

## src/services/queueListener.ts
### Unit Tests
- start logs ready message
- processPaymentSuccess calls PaymentEventHandler.handlePaymentSucceeded
- processPaymentFailure calls PaymentEventHandler.handlePaymentFailed

## src/services/cache-integration.ts
### Unit Tests
- createCache called with service-specific config
- Key prefix includes service name
- Exports cache service
- Exports cacheMiddleware
- Exports cacheStrategies
- Exports cacheInvalidator

## src/services/solanaService.ts

### CircuitBreaker (internal class)
#### Unit Tests
- execute() runs function when CLOSED
- execute() increments failureCount on error
- execute() transitions to OPEN after failureThreshold failures
- execute() rejects requests when OPEN (throws or runs fallback)
- execute() transitions to HALF_OPEN after recoveryTimeout
- execute() transitions to CLOSED after halfOpenSuccessThreshold successes in HALF_OPEN
- getState() returns copy of state

### RPCFailoverManager (internal class)
#### Unit Tests
- Constructor uses provided endpoints or falls back to config
- getCurrentEndpoint() returns current endpoint
- markUnhealthy() sets endpoint health to false and triggers failover
- markHealthy() sets endpoint health to true
- failover() cycles to next healthy endpoint
- failover() resets all endpoints when all unhealthy
- getHealthStatus() returns all endpoint statuses

### BlockchainEventListener (internal class)
#### Unit Tests
- connect() creates connection with wsEndpoint
- connect() sets isConnected true on success
- connect() retries with exponential backoff on failure
- subscribeToSignature() returns null if no connection
- subscribeToSignature() subscribes to signature confirmation
- disconnect() removes listener and sets isConnected false
- getStatus() returns connected and reconnectAttempts

### TransactionConfirmationService (internal class)
#### Integration Tests
- waitForConfirmation() returns BLOCKHASH_EXPIRED when block height exceeded
- waitForConfirmation() returns error details when transaction fails
- waitForConfirmation() returns success when confirmed/finalized
- waitForConfirmation() returns CONFIRMATION_TIMEOUT after maxRetries
- checkExpiredTransactions() marks expired pending transactions as failed

### ReconciliationService (internal class)
#### Integration Tests
- reconcilePendingTransactions() confirms finalized transactions
- reconcilePendingTransactions() fails errored transactions
- reconcilePendingTransactions() continues on individual errors
- compareOwnership() returns matches result

### SolanaServiceClass
#### Unit Tests
- Constructor initializes RPCFailoverManager with endpoints

#### Integration Tests
- initialize() connects and starts WebSocket listener
- initialize() starts confirmation checker and reconciliation jobs
- getConnection() throws if not initialized
- getWallet() throws if not initialized
- getWallet() loads wallet from private key
- mintNFT() uses circuit breaker
- mintNFT() gets latest blockhash
- mintNFT() records pending transaction
- mintNFT() returns tokenId and transactionHash
- transferNFT() records pending transaction
- getSyncStatus() returns healthy=false when not connected
- getSyncStatus() returns comprehensive sync metrics
- getSyncStatus() calculates slotsBehind correctly
- getSyncMetrics() returns Prometheus format
- getHealthStatus() returns all component statuses
- verifyOwnership() delegates to reconciliation service

## src/services/paymentEventHandler.ts
### Integration Tests
- handlePaymentSucceeded() updates order status to PAID
- handlePaymentSucceeded() sets payment_intent_id on order
- handlePaymentSucceeded() fetches venue_id from event
- handlePaymentSucceeded() queues NFT minting job with venueId
- handlePaymentSucceeded() writes to outbox
- handlePaymentSucceeded() commits transaction
- handlePaymentSucceeded() rolls back on error
- handlePaymentSucceeded() throws for missing order
- handlePaymentFailed() updates order status to PAYMENT_FAILED

## src/services/refundHandler.ts
### Integration Tests
- initiateRefund() updates order status to REFUND_INITIATED
- initiateRefund() fetches total_cents from order
- initiateRefund() throws for missing order
- initiateRefund() writes refund.requested to outbox with amountCents
- initiateRefund() returns success with orderId and status

## src/services/taxService.ts
### Unit Tests
- calculateOrderTax() returns 0 tax for states with no sales tax (AK, DE, MT, NH, OR)
- calculateOrderTax() calculates state tax correctly (pure integer math)
- calculateOrderTax() calculates local tax for applicable states
- calculateOrderTax() uses Math.round for cent precision
- calculateOrderTax() returns totalTaxCents = stateTaxCents + localTaxCents
- calculateOrderTax() returns effectiveRate as sum of state + local
- calculateOrderTax() returns breakdown with name, rate, amountCents
- calculateOrderTax() returns null for local when no local rate

## src/services/security.service.ts

### AccountLockoutService
#### Unit Tests
- initialize() connects to Redis with keyPrefix 'lockout:'
- recordFailedAttempt() returns locked status if already locked
- recordFailedAttempt() increments failed attempts counter
- recordFailedAttempt() sets TTL on first attempt
- recordFailedAttempt() locks account after maxFailedAttempts
- recordFailedAttempt() clears attempts when locked
- recordFailedAttempt() returns remainingAttempts
- recordSuccessfulAttempt() clears failed attempts
- isLocked() returns locked status and expiry
- isLocked() returns unlocked if expiry passed
- unlock() deletes both locked and attempts keys
- maskIdentifier() masks email addresses
- maskIdentifier() masks other identifiers

### SpendingLimitsService
#### Unit Tests
- getLimits() returns user limits from DB
- getLimits() returns defaults when no DB record
- checkTransaction() rejects over perTransactionLimit
- checkTransaction() rejects over dailyLimit
- checkTransaction() rejects over weeklyLimit
- checkTransaction() rejects over monthlyLimit
- checkTransaction() returns allowed with status
- recordTransaction() increments daily/weekly/monthly counters
- recordTransaction() sets appropriate expiry on each counter
- getSpendingStatus() returns current spent and remaining amounts
- getWeekKey() returns year-week format

### MultiSigService
#### Unit Tests
- requiresMultiSig() returns true for explicit operation types
- requiresMultiSig() returns true for high-value transfers (>=HIGH_VALUE_THRESHOLD)
- requiresMultiSig() returns true for large refunds
- requiresMultiSig() returns false for normal operations
- createApprovalRequest() throws if operation doesn't require multi-sig
- createApprovalRequest() creates request with correct structure
- createApprovalRequest() stores in Redis with TTL
- approve() throws for missing/expired request
- approve() throws for non-pending request
- approve() throws if approver role not allowed
- approve() throws if already approved by user
- approve() adds approval to request
- approve() sets status to approved when threshold reached
- reject() sets status to rejected
- executeIfApproved() returns executed=false if not approved
- executeIfApproved() executes function and deletes request when approved
- getRequest() returns null for missing request
- initializeSecurityServices() initializes all three services

## src/services/interServiceClient.ts
### Unit Tests
- generateSignature() returns empty string if no secret configured
- generateSignature() creates HMAC with service, timestamp, URL, bodyHash
- verifySignature() returns false for empty signatures
- verifySignature() returns false for length mismatch
- verifySignature() uses timing-safe comparison
- validateIncomingSignature() rejects expired timestamps (>5 min)
- validateIncomingSignature() allows in dev when no secret configured
- validateIncomingSignature() rejects in production when no secret
- generateNonce() returns 32-char hex string

### Integration Tests
- Client initialization creates axios instances for all services
- Request interceptor adds JWT token (Authorization header)
- Request interceptor adds legacy HMAC signature
- Request interceptor checks circuit breaker before request
- Request interceptor adds X-Service, X-Timestamp, X-Nonce headers
- Response interceptor records circuit breaker success
- Response interceptor records circuit breaker failure for 5xx
- request() returns success response with metadata
- request() returns error response on failure
- request() retries on transient errors when retry=true
- shouldRetry() returns true for network errors and 5xx
- retryRequest() uses exponential backoff
- get(), post(), put(), delete() convenience methods work
- Health checks run on interval
- getCircuitState() returns state for service
- getAllCircuitStates() returns all states
- resetCircuit() resets circuit breaker
- isCircuitAllowed() checks if request allowed

## src/services/batch-operations.ts
### Unit Tests
- chunkArray() splits array into chunks of specified size
- delay() waits for specified milliseconds
- startOperation() adds to activeOperations and increments gauge
- endOperation() removes from activeOperations and records duration
- validateTicket() returns valid=false for cancelled/used/expired
- validateTicket() returns valid=false for already scanned
- validateTicket() returns valid=true for valid ticket
- getActiveOperations() returns list of active operations

### Integration Tests
- bulkUpdateTickets() rejects batch exceeding maxBatchSize
- bulkUpdateTickets() processes in parallel with concurrency limit
- bulkUpdateTickets() updates tickets with status/metadata/ownerId
- bulkUpdateTickets() returns partial success when continueOnError=true
- bulkUpdateTickets() records metrics for success/failure
- bulkTransferTickets() rejects batch exceeding maxBatchSize
- bulkTransferTickets() processes sequentially
- bulkTransferTickets() retries on failure up to retryCount
- bulkTransferTickets() verifies ownership before transfer
- bulkTransferTickets() rejects wrong status for transfer
- bulkTransferTickets() updates ownership in transaction
- bulkTransferTickets() records transfer in ticket_transfers
- bulkTransferTickets() queues NFT transfer for NFT tickets
- cancelEventTickets() fetches all active tickets for event
- cancelEventTickets() updates all to cancelled with reason
- cancelEventTickets() records event_cancellations
- bulkValidateTickets() fetches all tickets in one query
- bulkValidateTickets() validates each ticket
- bulkValidateTickets() records scans for valid tickets
- bulkValidateTickets() updates scan_count

## src/services/ticket-state-machine.ts
### Unit Tests
- normalizeStatus() converts to lowercase TicketStatus
- normalizeStatus() throws ValidationError for unknown status
- isTerminalStatus() returns true for CHECKED_IN, USED, REVOKED, REFUNDED, EXPIRED, CANCELLED
- isTerminalStatus() returns false for AVAILABLE, RESERVED, SOLD, MINTED, ACTIVE, TRANSFERRED
- canCheckIn() returns true only for ACTIVE and TRANSFERRED
- VALID_TRANSITIONS has all statuses defined
- VALID_TRANSITIONS terminal states have empty arrays

### TicketStateMachine.validateTransition() Tests
- Throws ValidationError for unknown source status
- Throws ValidationError for invalid transition
- Throws ValidationError with isTerminal info for terminal states
- Throws ForbiddenError when role not allowed
- Throws ValidationError when reason required but missing
- Validates check-in time window (4 hours before to 2 hours after)
- Throws ValidationError when check-in window not open
- Throws ValidationError when check-in window closed
- Throws ValidationError for revoked tickets on check-in

### TicketStateMachine.transition() Tests
- Calls validateTransition first
- Updates ticket status in database
- Throws NotFoundError for missing ticket
- Executes side effects based on status

### Side Effects Tests
- Transfer: records in ticket_transfers
- Transfer: queues blockchain transfer for NFT tickets
- Transfer: notifies both users
- Check-in: sets checked_in_at and checked_in_by
- Check-in: records in ticket_scans
- Revocation: notifies holder
- Refund: queues payment refund
- Refund: notifies holder

### TicketStateMachine.getTicketForCheckIn() Tests
- Returns null for missing ticket
- Returns ticket with normalized status and event times

## src/workers/mintWorker.ts
### Unit Tests
- mintNFT() returns mock address and signature
- mintNFT() waits 100ms (simulated delay)

### Integration Tests
- processMintJob() fetches order details including tenant_id
- processMintJob() throws for missing order
- processMintJob() throws for missing ticket type
- processMintJob() throws for missing tenant
- processMintJob() creates correct number of tickets (job.quantity)
- processMintJob() generates unique ticketNumber and qrCode
- processMintJob() calls mintNFT for each ticket
- processMintJob() inserts tickets with correct schema (is_nft=true, metadata with NFT info)
- processMintJob() updates order status to COMPLETED
- processMintJob() writes order.completed to outbox
- processMintJob() commits transaction on success
- processMintJob() returns success with tickets array
- processMintJob() rolls back on error
- processMintJob() calls handleMintFailure on error
- handleMintFailure() updates order status to MINT_FAILED
- handleMintFailure() writes order.mint_failed to outbox with refundRequired=true

## src/workers/blockchain-reconciliation.worker.ts
### Unit Tests
- Constructor uses default config values from environment
- Constructor merges provided config with defaults
- emptyResult() returns zeroed ReconciliationResult
- getMetrics() returns metrics with isRunning status
- getDiscrepancies() returns copy of discrepancy log
- getPrometheusMetrics() returns Prometheus format string

### Integration Tests
- start() skips if disabled
- start() logs warning if already started
- start() runs reconciliation immediately
- start() schedules periodic reconciliation
- stop() clears interval
- stop() waits for running reconciliation to complete
- runReconciliation() skips if already running
- runReconciliation() calls reconcilePendingTransactions
- runReconciliation() calls checkOwnershipDiscrepancies
- runReconciliation() calls markExpiredTransactions
- runReconciliation() updates metrics on success
- runReconciliation() updates runsFailed on error
- runReconciliation() trims discrepancy log to 1000 entries
- reconcilePendingTransactions() queries pending transactions older than threshold
- reconcilePendingTransactions() confirms finalized transactions
- reconcilePendingTransactions() fails transactions with on-chain errors
- reconcilePendingTransactions() marks expired blockhash transactions
- reconcilePendingTransactions() increments retry_count when retrying
- checkOwnershipDiscrepancies() queries recently updated tickets
- checkOwnershipDiscrepancies() calls verifyOwnership for NFT tickets
- checkOwnershipDiscrepancies() logs discrepancies
- checkOwnershipDiscrepancies() auto-fixes when enabled
- markExpiredTransactions() updates status to failed with BLOCKHASH_EXPIRED
- confirmTransaction() updates status to confirmed with slot
- failTransaction() updates status with error code and message
- forceReconciliation() runs reconciliation immediately

## src/workers/idempotency-cleanup.worker.ts
### Unit Tests
- Constructor uses default config values from environment
- Constructor merges provided config with defaults
- getMetrics() returns metrics with isRunning status
- getPrometheusMetrics() returns Prometheus format string
- updateConfig() updates config and logs

### Integration Tests
- start() logs warning if already started
- start() runs cleanup immediately
- start() schedules periodic cleanup
- stop() clears interval
- stop() waits for running cleanup to complete
- runCleanup() skips if already running
- runCleanup() calculates cutoff date from maxKeyAgeMs
- runCleanup() deletes in batches until no more expired keys
- runCleanup() updates metrics on success
- runCleanup() increments idempotencyMetrics.expirationsTotal
- runCleanup() updates runsFailed on error
- deleteExpiredKeysBatch() deletes keys older than cutoff with limit
- forceCleanup() runs cleanup immediately

## src/workers/reservation-cleanup.worker.ts
### Unit Tests
- Constructor creates dedicated pool with max=5
- getMetrics() returns copy of metrics

### Integration Tests
- start() logs if already running
- start() runs cleanup immediately
- start() schedules periodic cleanup
- stop() clears interval
- runCleanup() skips if already running
- runCleanup() calls releaseExpiredReservations
- runCleanup() calls fixOrphanReservations
- runCleanup() calls cleanupRedisReservations
- runCleanup() calls reconcileInventory
- runCleanup() calls notifyCleanups
- releaseExpiredReservations() calls release_expired_reservations procedure
- releaseExpiredReservations() writes to outbox for each expired reservation
- releaseExpiredReservations() clears Redis for each reservation
- releaseExpiredReservations() publishes notification to user
- fixOrphanReservations() calls find_orphan_reservations procedure
- fixOrphanReservations() handles no_order type
- fixOrphanReservations() handles order_failed type
- fixOrphanReservations() handles should_be_expired type
- releaseOrphanReservation() updates reservation status to EXPIRED
- releaseOrphanReservation() releases inventory back to ticket_types
- releaseOrphanReservation() records in reservation_history
- releaseOrphanReservation() clears Redis
- cleanupRedisReservations() removes stale keys not in active reservations
- reconcileInventory() finds negative inventory and fixes to 0
- reconcileInventory() alerts on negative inventory
- reconcileInventory() logs discrepancies to outbox
- notifyCleanups() sends alert if orphansFixed > 10 or errors > 5

## src/workers/reservation-expiry.worker.ts
### Unit Tests
- start() logs if already running
- start() schedules periodic processing
- start() runs immediately on start
- stop() clears interval

### Integration Tests
- processExpiredReservations() skips if already running
- processExpiredReservations() calls release_expired_reservations procedure
- processExpiredReservations() queries recently expired reservations
- processExpiredReservations() writes to outbox for each expired reservation
- processExpiredReservations() handles errors gracefully

## src/sagas/PurchaseSaga.ts
### Unit Tests
- Constructor initializes state with all flags false and empty arrays

### Integration Tests
- execute() runs all 3 steps in order
- execute() commits transaction on success
- execute() returns PurchaseResult with orderId, orderNumber, status, totalCents, tickets
- execute() starts compensation on any step failure
- execute() rolls back transaction on failure

### Step 1 - reserveInventory() Tests
- Updates available_quantity atomically (decrement)
- Updates reserved_quantity atomically (increment)
- Throws INSUFFICIENT_INVENTORY when not enough available
- Error message includes current availability and ticket type name
- Returns items with prices and totalAmountCents
- Validates tenant_id in query

### Step 2 - createOrder() Tests
- Calls orderServiceClient.createOrder with correct payload
- Passes idempotencyKey to order service
- Includes tenantId and discountCodes in metadata
- Propagates OrderServiceError on failure

### Step 3 - createTickets() Tests
- Creates correct number of tickets per item
- Sets status to SOLD
- Sets price_cents from item
- Associates ticket with order_id, user_id, event_id, tenant_id
- Returns array of ticket ids and types

### Compensation Tests
- compensate() runs all applicable compensations
- compensate() uses Promise.allSettled (doesn't fail fast)
- compensate() logs failed compensations
- compensateTickets() deletes created tickets by ID
- compensateOrder() calls orderServiceClient.cancelOrder
- compensateOrder() passes reason for cancellation
- compensateOrder() doesn't throw (handles error gracefully)
- compensateInventory() restores available_quantity
- compensateInventory() decreases reserved_quantity (uses GREATEST to avoid negative)

### Saga State Management Tests
- Sets inventoryReserved=true after step 1 succeeds
- Sets reservedInventory after step 1 succeeds
- Sets orderCreated=true after step 2 succeeds
- Sets orderId after step 2 succeeds
- Sets ticketsCreated=true after step 3 succeeds
- Sets createdTicketIds after step 3 succeeds
- Compensation only runs for completed steps (checks state flags)

## src/sagas/index.ts
### Unit Tests
- Exports PurchaseSaga class

## src/utils/errors.ts
### Unit Tests
- AppError constructor sets message, statusCode, code, details
- AppError captures stack trace
- AppError.toJSON() returns error, code, statusCode, details
- AppError.toJSON() omits details when not provided
- ValidationError sets statusCode=400, code=VALIDATION_ERROR
- NotFoundError sets statusCode=404, code=NOT_FOUND
- NotFoundError formats message as "{resource} not found"
- ConflictError sets statusCode=409, code=CONFLICT
- UnauthorizedError sets statusCode=401, code=UNAUTHORIZED
- UnauthorizedError uses default message "Unauthorized"
- ForbiddenError sets statusCode=403, code=FORBIDDEN
- ForbiddenError uses default message "Forbidden"
- TooManyRequestsError sets statusCode=429, code=TOO_MANY_REQUESTS
- StateTransitionError extends ValidationError
- StateTransitionError formats message with from, to, allowed transitions
- StateTransitionError includes from, to, allowed in details

## src/utils/validation.ts
### Unit Tests (Regex Protection)
- isVulnerablePattern() detects (.*)+, (.+)+, nested quantifiers
- safeRegexTest() returns false for input exceeding maxInputLength
- safeRegexTest() logs oversized_input event
- safeRegexTest() throws for vulnerable pattern in strict mode
- safeRegexTest() logs warning when execution exceeds timeout
- safeRegexTest() returns false on regex error
- safeRegexMatch() returns null for oversized input
- safeRegexMatch() throws for vulnerable pattern in strict mode
- setRegexConfig() updates configuration
- getRegexConfig() returns current config copy

### Unit Tests (Sanitization)
- logSanitizationEvent() logs at correct severity level
- logSanitizationEvent() includes all request context fields
- sanitizeInput() detects XSS patterns (script, javascript:, onclick=)
- sanitizeInput() detects SQL injection patterns (OR 1=1, UNION SELECT)
- sanitizeInput() detects path traversal patterns (../, %2e%2e%2f)
- sanitizeInput() detects command injection only for command-related fields
- checkPrototypePollution() returns false for non-objects
- checkPrototypePollution() detects __proto__, constructor, prototype keys
- checkPrototypePollution() recursively checks nested objects
- checkPrototypePollution() logs prototype_pollution_attempt event

### Unit Tests (Schemas)
- ticketSchemas.purchaseTickets validates eventId as UUID
- ticketSchemas.purchaseTickets requires tickets array with 1-50 items
- ticketSchemas.purchaseTickets validates ticket quantity 1-10
- ticketSchemas.purchaseTickets rejects unknown properties
- ticketSchemas.createTicketType validates all required fields
- ticketSchemas.createTicketType validates saleEndDate > saleStartDate
- ticketSchemas.transferTicket validates ticketId and toUserId as UUIDs
- ticketSchemas.validateQR requires qrCode and eventId

### Integration Tests (Middleware)
- validate() returns 400 for prototype pollution
- validate() logs validation_failed event on error
- validate() returns 400 with error details on validation failure
- validate() sanitizes string fields recursively
- validate() replaces request.body with validated value
- createSizeAwareValidator() returns 413 for oversized content-length
- createSizeAwareValidator() logs oversized_input event
- createSizeAwareValidator() delegates to validate() for valid size

## src/utils/logger.ts
### Unit Tests
- getLogLevel() returns explicit LOG_LEVEL when valid
- getLogLevel() returns 'info' for production
- getLogLevel() returns 'verbose' for staging
- getLogLevel() returns 'debug' for development
- getLogLevel() returns 'warn' for test
- shouldLogBody() returns false for excluded routes
- shouldLogBody() returns false for non-allowed content types
- truncateBody() returns original if within maxBodySize
- truncateBody() returns truncated object with _truncated flag
- PIISanitizer.sanitize() redacts email addresses
- PIISanitizer.sanitize() redacts phone numbers
- PIISanitizer.sanitize() redacts credit card numbers
- PIISanitizer.sanitize() redacts SSN
- PIISanitizer.sanitize() redacts JWT tokens
- PIISanitizer.sanitize() redacts Stripe keys
- PIISanitizer.sanitize() redacts wallet addresses
- PIISanitizer.sanitize() redacts generic secrets (password=, apikey=)
- PIISanitizer.sanitize() redacts sensitive field names
- PIISanitizer.sanitize() recursively sanitizes nested objects
- PIISanitizer.sanitize() recursively sanitizes arrays
- traceContextFormat adds traceId and spanId to log entries
- requestIdFormat adds correlationId from requestId

### Integration Tests
- logger uses configured log level
- logger.child() creates child logger with component
- createRequestLogger() creates logger with request context
- logError() logs error with sanitized details
- logWarning() logs warning with sanitized meta
- logInfo() logs info with sanitized meta
- logDebug() logs debug with sanitized meta
- logRequest() logs request details
- logResponse() logs at error level for 5xx
- logResponse() logs at warn level for 4xx
- logOperation() logs operation with status
- logServiceCall() logs service call details
- logDatabase() logs database operation
- logSecurity() logs security event with severity
- logAudit() logs audit event

## src/utils/tenant-db.ts
### Unit Tests
- isValidTenantId() returns true for valid UUID v4
- isValidTenantId() returns false for invalid UUID
- isValidTenantId() returns false for null/undefined/non-string

### Integration Tests
- setTenantContext() throws for invalid tenant ID
- setTenantContext() calls set_config with tenant ID
- clearTenantContext() sets empty tenant context
- getCurrentTenantContext() returns null when not set
- getCurrentTenantContext() returns tenant ID when set
- verifyTenantContext() returns false when not valid
- withTenantContext() throws for invalid tenant ID
- withTenantContext() sets context, runs operation, commits
- withTenantContext() rolls back on operation error
- withTenantContextTrx() sets context on provided transaction
- withJobTenantContext() logs job start and completion
- withJobTenantContext() logs job failure with duration
- withTenantBatch() processes items in chunks
- withTenantBatch() sets tenant context for each batch
- tenantQuery() builds WHERE clause with tenant_id
- tenantQuery() adds additional WHERE conditions
- verifyRLSConfiguration() detects superuser role
- verifyRLSConfiguration() detects BYPASSRLS permission
- verifyRLSConfiguration() checks RLS enabled on tickets table
- selectTicketsForUpdate() uses FOR UPDATE SKIP LOCKED by default
- selectTicketsForUpdate() uses FOR UPDATE when skipLocked=false
- selectTicketsForUpdate() sets lock_timeout when waitTimeout provided
- verifyTenantBasedRLS() checks policies use current_setting
- TenantDB exports all functions

## src/utils/tracing.ts
### Unit Tests (Sampling)
- DEFAULT_SAMPLING_CONFIG has correct default values
- setSamplingConfig() updates configuration
- getSamplingConfig() returns copy of config

### Unit Tests (ConfigurableSampler)
- shouldSample() checks priority rules first
- shouldSample() applies route rules for HTTP operations
- shouldSample() checks HTTP method when specified in rule
- shouldSample() applies operation rules by pattern
- shouldSample() falls back to default rate
- matchPattern() converts glob wildcards to regex
- shouldSampleByRate() returns true for rate >= 1
- shouldSampleByRate() returns false for rate <= 0
- shouldSampleByRate() uses trace ID for deterministic sampling

### Unit Tests (createSampler)
- Returns AlwaysOnSampler in test environment
- Wraps ConfigurableSampler in ParentBasedSampler
- ParentBasedSampler respects remote parent decisions

### Unit Tests (Tracing Functions)
- getTraceContext() returns empty strings when no active span
- getTraceContext() returns traceId and spanId from active span
- getTracer() returns tracer with service name and version
- createSpan() creates span with name and options
- recordError() records exception on span
- recordError() sets span status to ERROR
- recordError() sets error attributes
- addSpanAttributes() adds attributes to active span
- addSpanAttributes() does nothing when no active span
- addSpanEvent() adds event to active span
- addSpanEvent() does nothing when no active span
- extractContext() normalizes headers to lowercase
- injectContext() injects trace context into headers
- injectContext() adds x-correlation-id and x-request-id
- getTracedHeaders() returns headers with trace context

### Integration Tests
- initTracing() skips when ENABLE_TRACING=false
- initTracing() creates SDK with resource, exporter, sampler
- initTracing() starts SDK
- shutdownTracing() shuts down SDK gracefully
- withSpan() creates span, runs function, ends span
- withSpan() sets OK status on success
- withSpan() records error and throws on failure
- withSpanSync() works synchronously
- withDatabaseSpan() creates span with db.* attributes
- withServiceCallSpan() creates span with peer.service attribute
- withBlockchainSpan() creates span with blockchain.* attributes
- withQueueSpan() creates span with messaging.* attributes

## src/utils/metrics.ts
### Unit Tests (HTTP Metrics)
- httpRequestsTotal has correct labels
- httpRequestDurationSeconds has correct buckets
- getStatusClass() returns 2xx, 3xx, 4xx, 5xx, unknown
- normalizeRoute() removes query strings
- normalizeRoute() replaces UUIDs with :id
- normalizeRoute() replaces numeric IDs with :id

### Unit Tests (SLI Metrics)
- trackSLIRequest() increments totalRequests
- trackSLIRequest() increments successfulRequests on success
- trackSLIRequest() categorizes satisfied/tolerating/frustrated by Apdex threshold
- trackSLIRequest() observes requestLatencySummary
- calculateSLIMetrics() calculates success rate
- calculateSLIMetrics() calculates Apdex score
- calculateSLIMetrics() calculates error budget remaining
- calculateSLIMetrics() increments SLO violations when error rate exceeds target
- calculateSLIMetrics() calculates throughput RPS
- resetSLIWindow() resets all SLI counters

### Unit Tests (Business Metrics Helpers)
- recordTicketPurchase() increments counter with labels
- recordTicketTransfer() increments counter with labels
- recordTicketScan() increments counter with labels
- recordDatabaseQuery() increments counter and observes histogram
- recordExternalServiceCall() increments counter and observes histogram
- recordNftMinting() increments counter and observes histogram
- recordCacheOperation() increments counter with operation and result
- recordBlockchainTransaction() increments counter and observes confirmation duration
- recordTicketRefund() increments counter with status, reason, tenant_id
- recordTicketRevenue() increments counter with amount
- updateDatabasePoolMetrics() sets gauge for active, idle, waiting
- updateCircuitBreakerState() sets gauge value (0=closed, 1=open, 2=half-open)

### Integration Tests
- registerMetricsMiddleware() adds onRequest hook
- registerMetricsMiddleware() adds onResponse hook
- registerMetricsMiddleware() adds onError hook
- metricsHandler() returns metrics in Prometheus format
- getMetrics() returns metrics string
- getMetricsJson() returns metrics as JSON
- resetMetrics() resets all metrics

## src/utils/resilience.ts
### Unit Tests (Feature Flags)
- isFeatureEnabled() returns false for unknown flag
- isFeatureEnabled() checks environment variable as fallback
- isFeatureEnabled() returns static value when no conditions
- isFeatureEnabled() evaluates percentage condition with hash
- isFeatureEnabled() evaluates tenant condition against allowlist
- isFeatureEnabled() evaluates user condition against allowlist
- isFeatureEnabled() evaluates environment condition
- isFeatureEnabled() evaluates time condition with start/end
- setFeatureFlag() adds/updates flag in store
- getAllFeatureFlags() returns all flags
- removeFeatureFlag() removes flag from store
- getFeatureFlag() returns flag by name
- hashCode() returns consistent hash for string

### Unit Tests (CircuitBreaker)
- Constructor initializes state as CLOSED
- Constructor sets default options
- execute() bypasses circuit when feature flag disabled
- execute() runs function when CLOSED
- execute() transitions OPEN to HALF_OPEN after resetTimeout
- execute() rejects and uses fallback when OPEN
- execute() throws CircuitBreakerOpenError when OPEN without fallback
- execute() adds timeout wrapper
- execute() increments success metrics
- execute() increments failure metrics with reason
- onSuccess() increments successCount in HALF_OPEN
- onSuccess() transitions to CLOSED after halfOpenSuccessThreshold
- onSuccess() resets failureCount when CLOSED
- onFailure() increments failureCount
- onFailure() sets lastFailureTime
- onFailure() transitions to OPEN after failureThreshold
- onFailure() transitions HALF_OPEN to OPEN immediately
- transitionTo() updates state and metrics
- transitionTo() resets counters appropriately
- transitionTo() tracks openedAt for OPEN state
- getState() returns copy of state
- isOpen() returns correct boolean
- reset() transitions to CLOSED
- getMetricsSummary() returns summary object

### Unit Tests (CircuitBreakerOpenError)
- Sets name to 'CircuitBreakerOpenError'
- Message includes circuit breaker name

### Unit Tests (retryWithBackoff)
- Returns result on first success
- Retries up to maxAttempts on failure
- Uses exponential backoff when enabled
- Caps delay at maxDelayMs
- Adds jitter when enabled
- addJitter() adds randomness within factor range
- Respects retryOn condition
- Throws last error after all attempts fail

### Unit Tests (cacheWithFallback)
- Returns cached value on hit
- Calls fallback on cache miss
- Stores result in cache after fallback
- Falls back to local cache on primary cache error
- Stores in local cache as backup

### Unit Tests (DegradedServiceManager)
- registerService() adds service with healthy status
- markHealthy() sets healthy=true, degraded=false
- markDegraded() sets healthy=true, degraded=true
- markUnhealthy() sets healthy=false
- isServiceHealthy() returns correct status
- isServiceDegraded() returns correct status
- enableDegradedFeature() adds to degradedFeatures set
- disableDegradedFeature() removes from degradedFeatures set
- isFeatureDegraded() returns correct status
- getOverallStatus() returns healthy=false if any service unhealthy
- getOverallStatus() returns degraded=true if any service degraded
- getOverallStatus() includes degradedFeatures list

### Unit Tests (withTimeout)
- Returns result if function completes in time
- Throws TimeoutError if function exceeds timeout
- Uses custom error message

### Unit Tests (Bulkhead)
- Executes immediately when under maxConcurrent
- Queues requests when at maxConcurrent
- Throws when queue is full
- Processes queue on completion
- getStatus() returns running and queued counts

## src/utils/CircuitBreaker.ts
### Unit Tests
- Constructor sets default values (failureThreshold=5, successThreshold=2, timeout=5000, resetTimeout=30000)
- Constructor initializes state as CLOSED
- Constructor initializes statistics with zero counts
- call() increments totalCalls
- call() throws error with code=CIRCUIT_OPEN when OPEN and before nextAttempt
- call() transitions OPEN to HALF_OPEN after nextAttempt time
- call() executes function when CLOSED
- call() executes function when HALF_OPEN
- executeWithTimeout() resolves when function completes in time
- executeWithTimeout() rejects with timeout error when function exceeds timeout
- onSuccess() resets failureCount to 0
- onSuccess() increments totalSuccesses
- onSuccess() sets lastSuccess timestamp
- onSuccess() increments successCount in HALF_OPEN
- onSuccess() transitions to CLOSED after successThreshold in HALF_OPEN
- onFailure() resets successCount to 0
- onFailure() increments failureCount
- onFailure() increments totalFailures
- onFailure() sets lastFailure timestamp
- onFailure() transitions to OPEN after failureThreshold
- onFailure() sets nextAttempt to now + resetTimeout
- getStatus() returns name, state, failureCount, statistics
- reset() sets state to CLOSED
- reset() resets failureCount and successCount to 0

## src/utils/async-handler.ts
### Unit Tests
- setupGlobalErrorHandlers() registers uncaughtException handler
- setupGlobalErrorHandlers() registers unhandledRejection handler
- uncaughtException handler logs error and exits with code 1
- unhandledRejection handler logs reason and exits with code 1

## src/utils/migration-helpers.ts
### Unit Tests (Index Operations)
- createIndex() checks if index exists when ifNotExists=true
- createIndex() skips creation if index already exists
- createIndex() builds SQL with UNIQUE when unique=true
- createIndex() builds SQL with CONCURRENTLY when concurrently=true
- createIndex() builds SQL with USING clause when not btree
- createIndex() builds SQL with WHERE clause for partial indexes
- createIndex() sets statement_timeout to 10 minutes
- createIndex() drops invalid index on CONCURRENTLY failure
- dropIndex() builds SQL with CONCURRENTLY
- dropIndex() builds SQL with IF EXISTS

### Integration Tests
- ifTableExists() executes SQL only when table exists
- ifTableExists() skips when table doesn't exist
- ifTableNotExists() executes SQL only when table doesn't exist
- ifColumnExists() executes SQL only when column exists
- ifColumnNotExists() executes SQL only when column doesn't exist
- addColumnIfNotExists() adds column when not present
- dropColumnIfExists() drops column when present
- constraintExists() returns true when constraint exists
- constraintExists() returns false when constraint doesn't exist
- addConstraintIfNotExists() adds constraint when not present
- addConstraintIfNotExists() skips when constraint exists
- dropConstraintIfExists() drops constraint when present
- createPolicyIfNotExists() creates policy when not present
- createPolicyIfNotExists() includes WITH CHECK when provided
- createPolicyIfNotExists() skips when policy exists
- dropPolicyIfExists() drops policy when present
- addEnumValueIfNotExists() adds value when not present
- addEnumValueIfNotExists() includes AFTER clause when provided
- addEnumValueIfNotExists() skips when value exists
- ensureMigrationsTable() creates schema_migrations table
- recordMigration() inserts migration record
- recordMigration() updates applied_at on conflict
- isMigrationApplied() returns true when migration exists
- isMigrationApplied() returns false when migration doesn't exist

## src/utils/xss.ts
### Unit Tests (HTML Encoding)
- encodeHtml() returns empty string for null/undefined
- encodeHtml() encodes & to &amp;
- encodeHtml() encodes < to &lt;
- encodeHtml() encodes > to &gt;
- encodeHtml() encodes " to &quot;
- encodeHtml() encodes ' to &#x27;
- encodeHtml() encodes / to &#x2F;
- encodeHtml() encodes ` to &#x60;
- encodeHtml() encodes = to &#x3D;
- decodeHtml() decodes all HTML entities back
- encodeAttribute() encodes all non-alphanumeric characters
- encodeJavaScript() escapes backslash, quotes, angle brackets
- encodeJavaScript() escapes newlines and line/paragraph separators
- encodeUrl() uses encodeURIComponent
- encodeCss() escapes non-alphanumeric with backslash hex

### Unit Tests (HTML Sanitization)
- sanitizeHtml() returns empty string for null/undefined
- sanitizeHtml() strips script tags and content
- sanitizeHtml() strips style tags and content
- sanitizeHtml() removes event handlers (onclick, onerror)
- sanitizeHtml() blocks javascript: URLs
- sanitizeHtml() blocks data: URLs
- sanitizeHtml() blocks vbscript: URLs
- sanitizeHtml() encodes disallowed tags
- sanitizeHtml() preserves allowed tags
- sanitizeHtml() applies maxLength
- sanitizeHtml() strips all tags when stripAllTags=true
- sanitizeAttributes() removes disallowed attributes
- sanitizeAttributes() preserves allowed attributes
- sanitizeAttributes() sanitizes href/src with sanitizeUrl
- sanitizeUrl() returns empty for javascript: URLs
- sanitizeUrl() returns empty for data: URLs
- sanitizeUrl() returns empty for disallowed schemes
- sanitizeUrl() allows http/https schemes
- sanitizeUrl() allows relative URLs starting with /
- sanitizeUrl() allows fragment identifiers starting with #
- stripHtmlTags() removes all HTML tags
- stripHtmlTags() decodes then re-encodes entities

### Unit Tests (JSON Sanitization)
- sanitizeJson() returns null/undefined as-is
- sanitizeJson() encodes string values
- sanitizeJson() recursively sanitizes arrays
- sanitizeJson() recursively sanitizes nested objects
- sanitizeJson() encodes object keys

### Unit Tests (Validation Helpers)
- containsDangerousContent() detects script tags
- containsDangerousContent() detects javascript: URLs
- containsDangerousContent() detects event handlers
- containsDangerousContent() detects iframe/object/embed tags
- containsDangerousContent() detects CSS expressions
- validateAndSanitize() returns null for oversized input
- validateAndSanitize() returns null for dangerous content when allowHtml=false
- validateAndSanitize() sanitizes HTML when allowHtml=true
- validateAndSanitize() encodes when allowHtml=false

## src/schemas/index.ts
### Unit Tests (Utility Functions)
- normalizedString() applies NFC normalization
- safeString() applies min/max length constraints
- uuidSchema validates UUID format
- uuidSchema provides descriptive error message
- iso8601DateTimeSchema validates ISO 8601 format
- paginationSchema has defaults for page=1, limit=20
- paginationSchema enforces limit max=100
- validateRequest() returns parsed data
- validateRequest() throws ZodError on invalid data
- safeValidateRequest() returns success=true with data
- safeValidateRequest() returns success=false with fieldErrors
- formatZodErrors() returns field and message array

### Unit Tests (Schema Validation)
- ticketItemSchema requires ticketTypeId as UUID
- ticketItemSchema enforces quantity 1-10
- ticketItemSchema.strict() rejects unknown properties
- purchaseRequestSchema requires eventId, tickets
- purchaseRequestSchema enforces tickets array 1-10 items
- purchaseRequestSchema enforces idempotencyKey 16-64 chars
- reservationRequestSchema requires eventId, ticketTypeId, quantity
- confirmPurchaseSchema requires reservationId, paymentId
- createTicketTypeSchema validates all required fields
- createTicketTypeSchema validates saleEndDate > saleStartDate
- createTicketTypeSchema enforces priceCents max 100000000
- updateTicketTypeSchema allows partial updates
- transferTicketSchema validates email format
- validateQRSchema enforces qrData max 2048 chars
- checkInSchema has force default=false
- ticketStatusEnum accepts all valid statuses
- ticketQuerySchema coerces page and limit from strings
- paymentWebhookSchema.passthrough() allows extra Stripe fields
- mintWebhookSchema validates mintAddress and signature lengths

## src/schemas/response.schema.ts
### Unit Tests (Response Schemas)
- apiResponseSchema wraps data schema correctly
- paginatedResponseSchema enforces max 100 items
- ticketResponseSchema.strict() rejects unknown properties
- ticketResponseSchema excludes owner_id, tenant_id, version
- ticketDetailResponseSchema extends ticketResponseSchema
- ticketListItemSchema includes minimal fields
- ticketTypeResponseSchema excludes tenant_id, internal fields
- reservationResponseSchema excludes user_id, tenant_id
- purchaseResponseSchema excludes payment processor details
- transferResponseSchema excludes sender details
- validationResponseSchema includes reason only when invalid
- checkInResponseSchema has correct status enum
- qrCodeResponseSchema excludes encryption keys
- errorResponseSchema follows RFC 7807 structure
- healthCheckResponseSchema excludes internal service URLs

### Unit Tests (Sanitization Functions)
- sanitizeResponse() strips unknown fields
- sanitizeResponse() logs warning on validation failure
- sanitizeResponse() throws on complete schema mismatch
- maskEmail() masks local part keeping first 2 chars
- maskEmail() returns *** for invalid email
- maskPhone() masks all but last 4 digits
- maskPhone() returns *** for short phone
