# Order Service - Comprehensive Test Plan

**Generated:** 2026-01-05
**Service:** order-service
**Total Files:** 151
**Total Planned Tests:** 1,826 (722 Unit, 1,092 Integration, 12 E2E)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Test Infrastructure Requirements](#test-infrastructure-requirements)
3. [Phase 1: Types, Errors, Models](#phase-1-types-errors-models)
4. [Phase 2: Config & Bootstrap](#phase-2-config--bootstrap)
5. [Phase 3: Utils](#phase-3-utils)
6. [Phase 4: Services](#phase-4-services)
7. [Phase 5: Events](#phase-5-events)
8. [Phase 6: Jobs](#phase-6-jobs)
9. [Phase 7: Validators & Middleware](#phase-7-validators--middleware)
8. [Phase 8: Routes](#phase-8-routes)
9. [Phase 9: Controllers & App Bootstrap](#phase-9-controllers--app-bootstrap)
10. [Test Priority Matrix](#test-priority-matrix)
11. [Coverage Targets](#coverage-targets)

---

## Executive Summary

This document outlines the complete test coverage plan for the order-service microservice. Tests are organized by priority:

| Priority | Test Count | Description |
|----------|------------|-------------|
| CRITICAL | ~150 | Security, money movement, data integrity |
| HIGH | ~400 | Core business logic, state management |
| MEDIUM | ~600 | Caching, tenant isolation, monitoring |
| LOW | ~675 | Edge cases, formatting, analytics |

### Test Distribution

| Type | Count | Percentage |
|------|-------|------------|
| Unit Tests | 722 | 39.5% |
| Integration Tests | 1,092 | 59.8% |
| E2E Tests | 12 | 0.7% |
| **Total** | **1,826** | 100% |

---

## Test Infrastructure Requirements

### Dependencies
```json
{
  "devDependencies": {
    "jest": "^29.x",
    "@types/jest": "^29.x",
    "ts-jest": "^29.x",
    "supertest": "^6.x",
    "@types/supertest": "^2.x",
    "testcontainers": "^10.x",
    "redis-mock": "^0.56.x",
    "pg-mem": "^2.x",
    "nock": "^13.x",
    "jest-extended": "^4.x"
  }
}
```

### Test Database
- PostgreSQL 15+ with test schema
- Redis 7+ for cache/lock testing
- RabbitMQ for event testing (or amqplib-mock)

### Environment Variables for Testing
```env
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/order_service_test
REDIS_HOST=localhost
REDIS_PORT=6380
RABBITMQ_URL=amqp://localhost:5673
JWT_SECRET=test-secret-minimum-32-characters-long
INTERNAL_SERVICE_SECRET=test-internal-secret
```

---

## Phase 1: Types, Errors, Models

**Files:** 23
**Unit Tests:** 65
**Integration Tests:** 65

### src/types/ (17 files)

#### src/types/order.types.ts
```
UNIT TESTS (8):
├── OrderStatus enum has all values (PENDING, RESERVED, CONFIRMED, COMPLETED, CANCELLED, EXPIRED, REFUNDED)
├── CreateOrderRequest interface type checking
├── ReserveOrderRequest interface type checking
├── ConfirmOrderRequest interface type checking
├── CancelOrderRequest interface type checking
├── RefundOrderRequest interface type checking
├── Order interface has all required properties
└── OrderItem interface has all required properties
```

#### src/types/refund.types.ts
```
UNIT TESTS (5):
├── RefundStatus enum values (PENDING, PROCESSING, COMPLETED, FAILED)
├── RefundType enum values (FULL, PARTIAL)
├── PartialRefundRequest interface type checking
├── RefundResult interface type checking
└── RefundHistoryItem interface type checking
```

#### src/types/modification.types.ts
```
UNIT TESTS (4):
├── ModificationType enum values (ADD_ITEM, REMOVE_ITEM, UPGRADE_ITEM, DOWNGRADE_ITEM, CHANGE_QUANTITY)
├── ModificationStatus enum values (PENDING, APPROVED, REJECTED, COMPLETED)
├── ModificationRequest interface type checking
└── UpgradeRequest interface type checking
```

#### src/types/event.types.ts
```
UNIT TESTS (3):
├── EventStatus enum values
├── Event interface type checking
└── EventTicketType interface type checking
```

#### src/types/auth.types.ts
```
UNIT TESTS (5):
├── UserRole enum values (user, admin, superadmin)
├── ROLE_PERMISSIONS mapping correctness
├── User interface has required properties
├── JWTPayload interface type checking
└── Permission type checking
```

#### src/types/discount.types.ts
```
UNIT TESTS (6):
├── DiscountType enum values (PERCENTAGE, FIXED_AMOUNT, BOGO, TIERED, EARLY_BIRD)
├── DiscountResult interface type checking
├── AppliedRule interface type checking
├── PromoCode interface type checking
├── TierConfig interface type checking
└── EarlyBirdConfig interface type checking
```

#### src/types/analytics.types.ts
```
UNIT TESTS (4):
├── OrderAnalytics interface type checking
├── ConversionMetrics interface type checking
├── RevenueMetrics interface type checking
└── TopEvent interface type checking
```

#### src/types/index.ts
```
UNIT TESTS (1):
└── All types are exported correctly
```

### src/errors/domain-errors.ts
```
UNIT TESTS (40):
├── DomainError base class
│   ├── Sets message property
│   ├── Sets code property
│   ├── Sets statusCode property
│   ├── Sets name to 'DomainError'
│   ├── Captures stack trace
│   └── Extends Error
│
├── OrderNotFoundError
│   ├── Sets message with orderId
│   ├── Sets code to 'ORDER_NOT_FOUND'
│   ├── Sets statusCode to 404
│   └── Includes orderId in message
│
├── OrderAlreadyExistsError
│   ├── Sets message with idempotencyKey
│   ├── Sets code to 'ORDER_ALREADY_EXISTS'
│   └── Sets statusCode to 409
│
├── InvalidOrderStateError
│   ├── Sets message with currentState and action
│   ├── Sets code to 'INVALID_ORDER_STATE'
│   └── Sets statusCode to 400
│
├── InsufficientTicketsError
│   ├── Sets message with requested and available
│   ├── Sets code to 'INSUFFICIENT_TICKETS'
│   └── Sets statusCode to 400
│
├── PaymentFailedError
│   ├── Sets message with reason
│   ├── Sets code to 'PAYMENT_FAILED'
│   └── Sets statusCode to 402
│
├── RefundNotAllowedError
│   ├── Sets message with reason
│   ├── Sets code to 'REFUND_NOT_ALLOWED'
│   └── Sets statusCode to 400
│
├── OrderExpiredError
│   ├── Sets message with orderId
│   ├── Sets code to 'ORDER_EXPIRED'
│   └── Sets statusCode to 410
│
├── UnauthorizedError
│   ├── Sets default message 'Unauthorized'
│   ├── Sets code to 'UNAUTHORIZED'
│   └── Sets statusCode to 401
│
├── ForbiddenError
│   ├── Sets default message 'Forbidden'
│   ├── Sets code to 'FORBIDDEN'
│   └── Sets statusCode to 403
│
├── ValidationError (domain)
│   ├── Sets message with field and issue
│   ├── Sets code to 'VALIDATION_ERROR'
│   └── Sets statusCode to 400
│
├── ExternalServiceError
│   ├── Sets message with service and error
│   ├── Sets code to 'EXTERNAL_SERVICE_ERROR'
│   └── Sets statusCode to 502
│
└── ConcurrencyError
    ├── Sets message with resource
    ├── Sets code to 'CONCURRENCY_ERROR'
    └── Sets statusCode to 409
```

### src/models/order.model.ts
```
INTEGRATION TESTS (35):
├── create()
│   ├── Inserts order with all required fields
│   ├── Generates UUID for id
│   ├── Generates order_number
│   ├── Sets tenant_id from parameter
│   ├── Sets default status to PENDING
│   ├── Sets created_at and updated_at
│   ├── Returns mapped Order object
│   └── Handles idempotency_key
│
├── findById()
│   ├── Returns order by id and tenant_id
│   ├── Returns null if not found
│   └── Enforces tenant isolation
│
├── findByUserId()
│   ├── Returns orders for user within tenant
│   ├── Orders by created_at DESC
│   ├── Respects limit parameter
│   ├── Respects offset parameter
│   └── Returns empty array if none found
│
├── findByIdempotencyKey()
│   ├── Returns order matching idempotency_key and tenant_id
│   └── Returns null if not found
│
├── findByPaymentIntentId()
│   ├── Returns order matching payment_intent_id and tenant_id
│   └── Returns null if not found
│
├── findExpiredReservations()
│   ├── Returns orders with status RESERVED
│   ├── Filters where expires_at < NOW()
│   ├── Respects limit parameter
│   └── Enforces tenant isolation
│
├── findExpiringReservations()
│   ├── Returns orders expiring within N minutes
│   ├── Filters status RESERVED
│   ├── Filters expires_at BETWEEN NOW() and NOW() + interval
│   └── Enforces tenant isolation
│
├── findByEvent()
│   ├── Returns orders for event_id within tenant
│   ├── Optionally filters by status array
│   └── Orders by created_at DESC
│
├── getTenantsWithReservedOrders()
│   ├── Returns distinct tenant_ids
│   ├── Filters status RESERVED
│   └── Respects limit parameter
│
├── update()
│   ├── Updates only provided fields
│   ├── Sets updated_at
│   ├── Returns updated order
│   ├── Enforces tenant isolation
│   └── Returns null if not found
│
└── delete()
    ├── Deletes order by id and tenant_id
    ├── Returns true on success
    └── Returns false if not found
```

### src/models/order-item.model.ts
```
INTEGRATION TESTS (12):
├── create()
│   ├── Inserts order item with all fields
│   ├── Generates UUID for id
│   ├── Calculates total_price_cents
│   ├── Sets created_at and updated_at
│   └── Returns mapped OrderItem
│
├── createBulk()
│   ├── Inserts multiple items in single query
│   ├── Uses UNNEST for bulk insert
│   ├── Returns all created items
│   └── Rolls back on any failure
│
├── findByOrderId()
│   ├── Returns all items for order
│   ├── Orders by created_at ASC
│   └── Returns empty array if none
│
└── findById()
    ├── Returns item by id
    └── Returns null if not found
```

### src/models/order-event.model.ts
```
INTEGRATION TESTS (8):
├── create()
│   ├── Inserts event with order_id, event_type
│   ├── Stores metadata as JSONB
│   ├── Sets created_at
│   └── Returns mapped OrderEvent
│
└── findByOrderId()
    ├── Returns all events for order
    ├── Orders by created_at ASC (chronological)
    └── Returns empty array if none
```

### src/models/order-refund.model.ts
```
INTEGRATION TESTS (10):
├── create()
│   ├── Inserts refund with all fields
│   ├── Generates UUID for id
│   ├── Sets default status to PENDING
│   ├── Sets created_at and updated_at
│   └── Returns mapped OrderRefund
│
├── findByOrderId()
│   ├── Returns all refunds for order
│   ├── Orders by created_at DESC (newest first)
│   └── Returns empty array if none
│
└── updateStatus()
    ├── Updates refund_status
    ├── Updates stripe_refund_id if provided
    ├── Updates completed_at for COMPLETED status
    ├── Sets updated_at
    └── Returns updated refund
```

---

## Phase 2: Config & Bootstrap

**Files:** 12
**Unit Tests:** 43
**Integration Tests:** 32

### src/config/alerts.config.ts
```
UNIT TESTS (5):
├── evaluateMetric()
│   ├── Returns true when value exceeds threshold (higherIsBetter: false)
│   ├── Returns true when value below threshold (higherIsBetter: true)
│   ├── Returns false when within threshold
│   └── Handles edge cases (equal to threshold)
└── Alert configurations exist for all metric types
```

### src/config/cache.config.ts
```
UNIT TESTS (9):
├── Cache key generators
│   ├── orderKey() returns 'order:{orderId}'
│   ├── userOrdersKey() returns 'user:{userId}:orders'
│   ├── eventOrdersKey() returns 'event:{eventId}:orders'
│   ├── orderCountKey() returns 'order:count:{userId}'
│   ├── rateLimitKey() returns 'ratelimit:{type}:{userId}'
│   ├── availabilityKey() returns 'availability:{eventId}'
│   └── ticketTypeKey() returns 'tickettype:{ticketTypeId}'
│
└── TTL values
    ├── ORDER_TTL is defined
    └── AVAILABILITY_TTL is 30 seconds
```

### src/config/fees.ts
```
UNIT TESTS (11):
├── calculateOrderFees()
│   ├── Calculates platformFeeCents correctly
│   ├── Calculates processingFeeCents correctly
│   ├── Calculates taxCents correctly
│   ├── Calculates totalFeeCents correctly
│   ├── Handles zero subtotal
│   ├── Rounds to nearest cent
│   └── Applies percentage correctly
│
└── validateFeeConfig()
    ├── Returns true for valid config
    ├── Returns false for negative rates
    ├── Returns false for rates > 100%
    └── Returns false for missing required fields
```

### src/config/env.validator.ts
```
UNIT TESTS (8):
├── validateEnvironment()
│   ├── Throws if DATABASE_URL missing
│   ├── Throws if REDIS_HOST missing
│   ├── Throws if PORT is not numeric
│   ├── Throws if NODE_ENV invalid
│   ├── Validates URL format for service URLs
│   ├── Validates JWT_SECRET minimum length (32 chars)
│   └── Returns true when all valid
│
└── getEnvConfig()
    └── Returns parsed configuration object
```

### src/config/order.config.ts
```
UNIT TESTS (6):
├── validateOrderConfig()
│   ├── Validates platformFeePercent within limits
│   ├── Validates processingFeePercent within limits
│   ├── Validates maxOrderValueCents
│   ├── Validates maxItemsPerOrder
│   ├── Validates reservationDurationMinutes
│   └── Returns validated config object
```

### src/config/security.config.ts
```
UNIT TESTS (4):
├── Password requirements defined
├── Session timeout values defined
├── CORS configuration defined
└── Development overrides applied when NODE_ENV=development
```

### src/config/database.ts
```
INTEGRATION TESTS (10):
├── initializeDatabase()
│   ├── Creates connection pool
│   ├── Retries on connection failure
│   ├── Uses exponential backoff
│   ├── Enables TLS in production
│   ├── Reuses existing pool if already initialized
│   └── Logs connection success
│
├── getDatabase()
│   ├── Returns initialized pool
│   └── Throws if not initialized
│
└── closeDatabase()
    ├── Closes pool connections
    └── Logs closure
```

### src/config/rabbitmq.ts
```
INTEGRATION TESTS (11):
├── connectRabbitMQ()
│   ├── Creates connection to RabbitMQ
│   ├── Creates channel
│   ├── Asserts exchange (order_events)
│   ├── Asserts queue (order_service_queue)
│   ├── Asserts dead letter queue
│   ├── Binds routing keys
│   ├── Handles reconnection on close
│   └── Schedules reconnect with backoff
│
├── scheduleReconnect()
│   ├── Uses exponential backoff
│   ├── Adds jitter to delay
│   └── Caps at max delay
│
├── publishEvent()
│   ├── Publishes to exchange with routing key
│   └── Serializes payload as JSON
│
├── getChannel()
│   └── Returns current channel
│
├── isConnected()
│   └── Returns connection status
│
└── closeRabbitMQ()
    └── Closes connection and channel
```

### src/config/redis.ts
```
INTEGRATION TESTS (4):
├── initRedis()
│   ├── Creates Redis client
│   └── Tests connection with ping
│
├── getRedis()
│   └── Returns initialized client
│
├── get/set/del helpers work correctly
│
└── closeRedisConnections()
    └── Closes all connections
```

### src/config/secrets.ts
```
INTEGRATION TESTS (3):
├── loadSecrets()
│   ├── Loads secrets from environment
│   ├── Throws if required secrets missing
│   └── Returns secrets object
```

### src/config/container.ts
```
INTEGRATION TESTS (4):
├── Pool validation on initialization
├── Services exist and are callable
└── validateContainer() returns true when all dependencies present
```

---

## Phase 3: Utils

**Files:** 15
**Unit Tests:** 196
**Integration Tests:** 41

### src/utils/circuit-breaker.ts
```
UNIT TESTS (30):
├── State Transitions
│   ├── Starts in CLOSED state
│   ├── Transitions CLOSED → OPEN after failureThreshold failures
│   ├── Transitions OPEN → HALF_OPEN after resetTimeout
│   ├── Transitions HALF_OPEN → CLOSED after successThreshold successes
│   ├── Transitions HALF_OPEN → OPEN on failure
│   └── Stays CLOSED on success
│
├── execute()
│   ├── Executes function when CLOSED
│   ├── Returns fallback when OPEN (if provided)
│   ├── Throws CircuitOpenError when OPEN (no fallback)
│   ├── Executes function when HALF_OPEN
│   ├── Applies timeout to execution
│   ├── Records success on successful execution
│   ├── Records failure on error
│   └── Records failure on timeout
│
├── Metrics tracking
│   ├── Tracks total requests
│   ├── Tracks successful requests
│   ├── Tracks failed requests
│   ├── Tracks timeouts
│   └── Tracks state changes
│
├── createCircuitBreaker() factory
│   ├── Creates circuit breaker with config
│   └── Adds to global registry
│
└── getCircuitBreakers()
    └── Returns all registered circuit breakers
```

### src/utils/command-validator.ts
```
UNIT TESTS (35):
├── isCommandExecutionEnabled()
│   └── Returns based on environment configuration
│
├── isCommandAllowed()
│   ├── Returns true for whitelisted commands
│   └── Returns false for non-whitelisted commands
│
├── containsDangerousPatterns()
│   ├── Detects shell operators (|, &, ;, >, <)
│   ├── Detects variable expansion ($, backticks)
│   ├── Detects privilege escalation (sudo, su)
│   ├── Detects network tools (curl, wget, nc)
│   ├── Detects file system manipulation (rm -rf, chmod, chown)
│   ├── Returns false for safe commands
│   └── Handles edge cases (escaped characters)
│
├── sanitizeArguments()
│   ├── Removes dangerous characters
│   ├── Escapes special characters
│   ├── Preserves safe arguments
│   └── Handles empty arguments
│
├── validateCommand()
│   ├── Returns { valid: true } for safe commands
│   ├── Returns { valid: false, reason } for dangerous commands
│   └── Checks all validation rules
│
├── buildSafeCommand()
│   ├── Builds command string from parts
│   ├── Quotes arguments properly
│   └── Escapes special characters
│
└── executeValidatedCommand()
    ├── Validates before execution
    ├── Throws on validation failure
    └── Returns command output on success
```

### src/utils/distributed-lock.ts
```
INTEGRATION TESTS (20):
├── withLock()
│   ├── Acquires lock before executing
│   ├── Releases lock after execution
│   ├── Releases lock on error
│   ├── Retries acquisition on failure
│   ├── Uses owner ID for lock ownership
│   ├── Respects TTL
│   └── Throws if cannot acquire lock
│
├── extendLock()
│   ├── Extends TTL atomically (Lua script)
│   ├── Returns true on success
│   ├── Returns false if lock not owned
│   └── Returns false if lock doesn't exist
│
├── tryLock()
│   ├── Returns true if lock acquired
│   └── Returns false if lock held
│
├── releaseLock()
│   ├── Releases lock if owned
│   ├── Returns true on success
│   └── Returns false if not owner
│
├── isLocked()
│   └── Returns current lock status
│
├── getLockOwner()
│   ├── Returns owner ID
│   └── Returns null if not locked
│
└── getLockTTL()
    └── Returns remaining TTL in ms
```

### src/utils/http-client.util.ts
```
UNIT TESTS (10):
├── createAuthSignature()
│   ├── Creates HMAC-SHA256 signature
│   ├── Uses correct message format
│   └── Returns hex string
│
├── generateNonce()
│   └── Returns unique string each call
│
├── calculateRetryDelay()
│   ├── Uses exponential backoff
│   ├── Adds jitter
│   └── Caps at maxDelay
│
└── getServiceUrl()
    ├── Returns URL from environment
    └── Enforces HTTPS in production

INTEGRATION TESTS (15):
├── createSecureServiceClient()
│   ├── Creates Axios instance with base URL
│   ├── Adds S2S auth headers on request
│   ├── Adds correlation ID from context
│   ├── Adds X-Service-Name header
│   ├── Adds X-Request-Timestamp header
│   ├── Adds X-Request-Nonce header
│   └── Adds X-Internal-Auth header (HMAC)
│
└── executeWithRetry()
    ├── Retries on 5xx errors
    ├── Does not retry on 4xx errors
    ├── Respects maxAttempts
    ├── Uses exponential backoff
    └── Returns response on success
```

### src/utils/idempotency-key-generator.ts
```
UNIT TESTS (5):
├── generateIdempotencyKey()
│   ├── Generates deterministic UUID v5 from inputs
│   └── Same inputs produce same output
│
├── generateRandomIdempotencyKey()
│   └── Generates UUID v4 (random each time)
│
└── generateTimestampedIdempotencyKey()
    ├── Includes timestamp component
    └── Includes type prefix
```

### src/utils/logger.ts
```
UNIT TESTS (15):
├── Redaction
│   ├── Redacts 'password' field
│   ├── Redacts 'token' field
│   ├── Redacts 'apiKey' field
│   ├── Redacts 'cardNumber' field
│   ├── Redacts 'cvv' field
│   ├── Redacts 'authorization' header
│   ├── Handles nested objects
│   └── Handles arrays
│
├── createRequestLogger()
│   ├── Includes traceId
│   ├── Includes tenantId
│   └── Includes userId
│
├── createContextLogger()
│   └── Adds context to all log entries
│
└── sanitizeForLogging()
    ├── Removes sensitive fields
    └── Truncates large values
```

### src/utils/metrics.ts
```
UNIT TESTS (25):
├── All metrics registered correctly
│   ├── order_service_orders_created_total (Counter)
│   ├── order_service_orders_reserved_total (Counter)
│   ├── order_service_orders_confirmed_total (Counter)
│   ├── order_service_orders_cancelled_total (Counter)
│   ├── order_service_orders_expired_total (Counter)
│   ├── order_service_orders_refunded_total (Counter)
│   ├── order_service_order_value_cents (Histogram)
│   ├── order_service_items_per_order (Histogram)
│   ├── order_service_state_transition_total (Counter)
│   ├── order_service_state_transition_errors_total (Counter)
│   ├── order_service_cache_hits_total (Counter)
│   ├── order_service_cache_misses_total (Counter)
│   ├── order_service_cache_operations_total (Counter)
│   ├── order_service_external_request_duration_seconds (Histogram)
│   ├── order_service_circuit_breaker_state (Gauge)
│   └── ... (all 25 metrics)
│
└── Metrics have correct labels
    ├── tenant_id label present where appropriate
    ├── status label for order metrics
    └── service label for external requests
```

### src/utils/money.ts
```
UNIT TESTS (12):
├── dollarsToCents()
│   ├── Converts dollars to cents correctly
│   ├── Handles decimals (rounds)
│   └── Handles zero
│
├── centsToDollars()
│   ├── Converts cents to dollars
│   ├── Returns number with 2 decimal places
│   └── Handles zero
│
├── formatCents()
│   ├── Formats as currency string
│   ├── Uses correct currency symbol
│   └── Handles negative amounts
│
├── calculatePercentage()
│   ├── Calculates percentage of amount
│   ├── Rounds to nearest cent
│   └── Handles edge cases
│
└── addFixedFee()
    ├── Adds fixed fee to amount
    └── Returns sum in cents
```

### src/utils/order-state-machine.ts
```
UNIT TESTS (25):
├── canTransition()
│   ├── PENDING → RESERVED (true)
│   ├── PENDING → CANCELLED (true)
│   ├── PENDING → EXPIRED (true)
│   ├── RESERVED → CONFIRMED (true)
│   ├── RESERVED → CANCELLED (true)
│   ├── RESERVED → EXPIRED (true)
│   ├── CONFIRMED → COMPLETED (true)
│   ├── CONFIRMED → CANCELLED (true)
│   ├── CONFIRMED → REFUNDED (true)
│   ├── Invalid transitions return false
│   ├── CANCELLED → any (false)
│   ├── EXPIRED → any (false)
│   ├── REFUNDED → any (false)
│   └── COMPLETED → any (false)
│
├── validateTransition()
│   ├── Throws InvalidOrderStateError for invalid transition
│   └── Returns true for valid transition
│
├── getAllowedTransitions()
│   └── Returns array of valid next states
│
├── isTerminalState()
│   ├── Returns true for CANCELLED
│   ├── Returns true for EXPIRED
│   ├── Returns true for REFUNDED
│   ├── Returns true for COMPLETED
│   └── Returns false for others
│
├── getTransitionDescription()
│   └── Returns human-readable description
│
└── validateTransitionPath()
    ├── Validates sequence of transitions
    └── Throws on invalid path
```

### src/utils/pdf-generator.ts
```
UNIT TESTS (6):
├── generateTicket()
│   ├── Creates PDF with ticket info
│   └── Returns Buffer
│
├── generateMultipleTickets()
│   ├── Creates multi-page PDF
│   └── Returns Buffer
│
├── generateQRCode()
│   └── Generates QR code image
│
└── generatePlaceholderPDF()
    └── Creates placeholder PDF
```

### src/utils/retry.ts
```
UNIT TESTS (8):
├── retry()
│   ├── Executes function once on success
│   ├── Retries on failure
│   ├── Uses exponential backoff
│   ├── Caps delay at maxDelayMs
│   ├── Stops after maxAttempts
│   ├── Throws last error after all retries
│   ├── Respects shouldRetry predicate
│   └── Logs retry attempts
```

### src/utils/saga-coordinator.ts
```
UNIT TESTS (10):
├── executeSaga()
│   ├── Executes all steps in order
│   ├── Returns result of last step
│   └── Stores step results
│
├── compensate()
│   ├── Executes compensation in reverse order
│   ├── Continues on compensation failure
│   └── Logs compensation errors
│
└── reset()
    └── Clears all state
```

### src/utils/transaction.ts
```
INTEGRATION TESTS (6):
├── withTransaction()
│   ├── Begins transaction
│   ├── Commits on success
│   ├── Rolls back on error
│   ├── Releases client to pool
│   └── Passes client to callback
```

### src/utils/validators.ts
```
UNIT TESTS (15):
├── validateOrderItems()
│   ├── Throws if items array empty
│   ├── Throws if items exceed max count
│   ├── Throws if item quantity < 1
│   ├── Throws if item quantity > max
│   ├── Throws if item price < 0
│   └── Returns true for valid items
│
├── validateUserId()
│   ├── Throws if not valid UUID
│   └── Returns true for valid UUID
│
├── validateEventId()
│   ├── Throws if not valid UUID
│   └── Returns true for valid UUID
│
└── validateOrderId()
    ├── Throws if not valid UUID
    └── Returns true for valid UUID
```

---

## Phase 4: Services

**Files:** 27
**Unit Tests:** 59
**Integration Tests:** 415
**E2E Tests:** 7

### src/services/order.service.ts [CRITICAL]
```
INTEGRATION TESTS (60):
├── createOrder()
│   ├── Validates event exists (calls event-service)
│   ├── Checks ticket availability (calls ticket-service)
│   ├── CRITICAL: Validates prices match server-side prices
│   ├── Calculates fees using orderConfig
│   ├── Creates order in database
│   ├── Creates order items
│   ├── Creates ORDER_CREATED event
│   ├── Publishes to RabbitMQ
│   ├── Increments metrics
│   ├── Handles idempotency (returns existing order)
│   ├── Rejects if event not found
│   ├── Rejects if insufficient tickets
│   └── Rejects if price manipulation detected
│
├── reserveOrder()
│   ├── Validates order in PENDING status
│   ├── Reserves tickets (calls ticket-service)
│   ├── Creates payment intent (calls payment-service)
│   ├── Updates order to RESERVED
│   ├── Sets expiresAt
│   ├── Creates ORDER_RESERVED event
│   ├── Publishes to RabbitMQ
│   ├── Increments activeReservations metric
│   └── Returns order with clientSecret
│
├── confirmOrder()
│   ├── Acquires distributed lock
│   ├── Validates order in RESERVED status
│   ├── Confirms payment (calls payment-service)
│   ├── Confirms ticket allocation (calls ticket-service)
│   ├── Updates order to CONFIRMED
│   ├── Sets confirmedAt, clears expiresAt
│   ├── Creates ORDER_CONFIRMED event
│   ├── Publishes to RabbitMQ
│   ├── Decrements activeReservations metric
│   └── Releases lock
│
├── cancelOrder()
│   ├── Acquires distributed lock
│   ├── Validates order can be cancelled
│   ├── Releases tickets (calls ticket-service)
│   ├── Initiates refund if CONFIRMED (calls payment-service)
│   ├── Cancels payment intent if RESERVED
│   ├── Updates order to CANCELLED
│   ├── Creates refund record if applicable
│   ├── Creates ORDER_CANCELLED event
│   ├── Publishes to RabbitMQ
│   ├── Increments ordersCancelled metric
│   └── Releases lock
│
├── expireReservation()
│   ├── Validates order in RESERVED status
│   ├── Releases tickets (doesn't fail if ticket-service error)
│   ├── Cancels payment intent (doesn't fail if payment-service error)
│   ├── Updates order to EXPIRED
│   ├── Creates ORDER_EXPIRED event
│   ├── Publishes to RabbitMQ
│   └── Decrements activeReservations metric
│
├── refundOrder()
│   ├── Acquires distributed lock
│   ├── Validates order in CONFIRMED status
│   ├── Validates paymentIntentId exists
│   ├── Initiates refund (calls payment-service)
│   ├── Creates refund record
│   ├── Updates order to REFUNDED
│   ├── Creates ORDER_REFUNDED event
│   ├── Publishes to RabbitMQ
│   ├── Increments ordersRefunded metric
│   └── Releases lock
│
├── getOrder()
│   ├── Returns order with items
│   └── Enforces tenant isolation
│
├── getUserOrders()
│   ├── Returns paginated orders
│   └── Enforces tenant isolation
│
├── getExpiredReservations()
│   └── Returns orders past expiration
│
├── getExpiringReservations()
│   └── Returns orders expiring within N minutes
│
├── getOrderEvents()
│   └── Returns order event history
│
├── findOrdersByEvent()
│   └── Returns orders for event
│
└── getTenantsWithReservedOrders()
    └── Returns distinct tenant IDs

E2E TESTS (7):
├── Happy path: create → reserve → confirm
├── Reservation expiration flow
├── Cancellation from PENDING
├── Cancellation from RESERVED
├── Cancellation from CONFIRMED (with refund)
├── Full refund flow
└── Circuit breaker activation
```

### src/services/refund-eligibility.service.ts [CRITICAL]
```
INTEGRATION TESTS (35):
├── checkEligibility()
│   ├── Returns ineligible if order not found
│   ├── Returns ineligible if user doesn't own order
│   ├── Returns ineligible if status not refundable
│   ├── Validates currency matches
│   ├── CRITICAL: Blocks if active dispute
│   ├── CRITICAL: Blocks if tickets transferred
│   ├── Checks event status (cancelled/postponed/rescheduled)
│   ├── Auto-approves if event cancelled
│   ├── Bypasses policy if event postponed/rescheduled
│   ├── Checks payout status (requires manual review if paid out)
│   ├── Validates payment is refundable
│   ├── Applies refund policy
│   ├── Calculates max refund amount
│   └── Tracks policy version for audit
│
├── validateCurrency()
│   ├── Returns ineligible for unsupported currency
│   └── Returns ineligible for currency mismatch
│
├── checkEventStatus()
│   ├── Returns autoApprove: true for cancelled event
│   └── Returns bypassPolicy: true for postponed/rescheduled
│
├── checkPayoutStatus()
│   └── Returns payoutCompleted if seller paid out
│
├── checkTicketTransfers()
│   ├── Returns allValid: false with transferredTickets if transferred
│   └── CRITICAL: Fails closed if verification fails
│
├── checkPaymentRefundable()
│   ├── Returns refundable status from payment service
│   └── CRITICAL: Fails closed if can't verify
│
├── applyRefundPolicy()
│   ├── Returns 100% if no policy
│   ├── Applies time-based rules
│   ├── Applies days-before-event rules
│   └── Returns policy version for audit
│
├── calculateMaxRefund()
│   └── Returns min(eligible, remaining)
│
└── validatePartialRefund()
    ├── Checks general eligibility
    └── Calculates partial amount
```

### src/services/dispute.service.ts [CRITICAL]
```
INTEGRATION TESTS (15):
├── handleDisputeCreated()
│   ├── Links dispute to order via paymentIntentId
│   ├── CRITICAL: Locks refunds (sets refund_locked=true)
│   ├── Creates order_disputes record
│   ├── Records DISPUTE_CREATED event
│   └── Publishes alert.critical and order.dispute.created
│
├── handleDisputeUpdated()
│   ├── Updates dispute_status
│   ├── Updates order_disputes record
│   └── Records DISPUTE_UPDATED event
│
├── handleDisputeClosed()
│   ├── Updates with outcome
│   ├── CRITICAL: Unlocks refunds if won/withdrawn
│   ├── CRITICAL: Keeps locked if lost
│   ├── Records DISPUTE_CLOSED event
│   ├── Calls handleLostDispute if lost
│   └── Publishes order.dispute.closed
│
├── hasActiveDispute()
│   └── Returns true if has_dispute=true AND refund_locked=true
│
└── getDisputeInfo()
    └── Returns dispute details
```

### src/services/fraud.service.ts [HIGH]
```
UNIT TESTS (5):
├── getRiskLevel()
│   ├── Returns 'low' for score < 30
│   ├── Returns 'medium' for score 30-49
│   ├── Returns 'high' for score 50-79
│   └── Returns 'critical' for score >= 80
│
└── checkOrderValue()
    └── Adds score for high-value orders

INTEGRATION TESTS (15):
├── assessOrder()
│   ├── Checks velocity limits
│   ├── Checks chargeback history
│   ├── Checks order value
│   ├── Checks dispute patterns
│   ├── Normalizes score to 0-100
│   ├── Sets requiresReview if score >= 50
│   ├── Sets blockRefund if score >= 80
│   ├── Sets blockOrder if score >= 90
│   ├── Records assessment in database
│   └── Alerts fraud team if high risk
│
├── checkVelocity()
│   ├── Returns HIGH_VELOCITY_HOURLY if > 5 orders/hour
│   └── Returns HIGH_VELOCITY_DAILY if > 20 orders/day
│
├── checkChargebackHistory()
│   ├── Returns CRITICAL score if >= 2 chargebacks
│   └── Returns MEDIUM score if 1 chargeback
│
├── checkDisputePatterns()
│   └── Returns HIGH score if >= 3 disputes in 6 months
│
├── shouldBlockRefund()
│   └── Returns blocked if assessment.block_refund
│
└── markAsReviewed()
    ├── Updates reviewed_at, reviewed_by, decision
    └── Clears blocks if approved
```

### src/services/ticket.client.ts [HIGH]
```
UNIT TESTS (3):
├── Circuit breaker fallbacks
│   ├── checkAvailability returns empty on circuit open
│   └── getPrices returns empty on circuit open

INTEGRATION TESTS (15):
├── checkAvailability()
│   └── Returns availability map
│
├── reserveTickets()
│   └── Returns reservation confirmation
│
├── confirmAllocation()
│   └── Returns confirmation
│
├── releaseTickets()
│   └── Returns release confirmation
│
├── getPrices()
│   └── Returns price map
│
├── getTicket()
│   ├── Returns ticket info
│   └── CRITICAL: Throws on failure (no fallback)
│
├── checkTicketNotTransferred()
│   ├── Returns true if owner matches
│   ├── Returns false if differs or hasBeenTransferred
│   └── CRITICAL: Throws on failure (fail closed)
│
├── getTicketsForOrder()
│   ├── Returns tickets array
│   └── CRITICAL: Throws on failure
│
└── checkOrderTicketsNotTransferred()
    ├── Returns { allValid, transferredTickets }
    └── CRITICAL: Throws on failure (fail closed)
```

### src/services/payment.client.ts [HIGH]
```
INTEGRATION TESTS (10):
├── createPaymentIntent()
│   └── Returns { paymentIntentId, clientSecret }
│
├── confirmPayment()
│   └── Returns confirmation
│
├── cancelPaymentIntent()
│   └── Returns cancellation confirmation
│
├── initiateRefund()
│   ├── Sends reverse_transfer flag
│   └── Returns refundId
│
└── getPaymentStatus()
    ├── Returns { status, refundable, hasDispute }
    └── Returns fail-closed default on failure
```

### src/services/event.client.ts [HIGH]
```
INTEGRATION TESTS (5):
├── getEvent()
│   ├── Returns event data
│   └── Returns null on failure (fallback)
│
└── getEventStatus()
    ├── Returns { cancelled, postponed, rescheduled }
    └── Returns safe default on failure
```

### src/services/discount-calculator.service.ts [MEDIUM]
```
UNIT TESTS (25):
├── calculatePercentageDiscount()
│   ├── Calculates correct percentage
│   └── Floors result to cents
│
├── calculateFixedAmountDiscount()
│   └── Returns min of fixed amount and total
│
├── calculateBOGODiscount()
│   ├── Calculates complete sets
│   ├── Applies to cheapest items first
│   └── Returns appliedRules
│
├── calculateTieredDiscount()
│   ├── Finds correct tier by quantity
│   ├── Applies tier percentage
│   └── Returns empty if no matching tier
│
├── calculateEarlyBirdDiscount()
│   ├── Returns 0 if after cutoff
│   ├── Applies PERCENTAGE type
│   └── Applies FIXED_AMOUNT type
│
└── applyDiscountToOrder()
    ├── Handles PERCENTAGE type
    ├── Handles FIXED_AMOUNT type
    ├── Handles BOGO type
    ├── Handles TIERED type
    └── Handles EARLY_BIRD type
```

### src/services/discount-combination.service.ts
```
INTEGRATION TESTS (8):
├── validateCombination()
│   ├── Rejects mutually exclusive discounts
│   └── Allows stackable discounts
│
├── calculateCombinedDiscount()
│   ├── Applies fixed discounts first
│   └── Applies percentage discounts second
│
└── checkMaxDiscount()
    └── Caps at maximum allowed discount
```

### src/services/promo-code.service.ts
```
INTEGRATION TESTS (12):
├── validatePromoCode()
│   ├── Returns invalid if expired
│   ├── Returns invalid if usage limit reached
│   ├── Returns invalid if below min purchase
│   ├── Returns invalid if per-user limit reached
│   ├── Returns invalid if not applicable to event
│   └── Returns valid with discount info
│
├── applyPromoCode()
│   ├── Creates redemption record
│   └── Increments usage count
│
├── createPromoCode()
│   └── Creates promo code with all fields
│
└── calculateDiscount()
    └── Returns discount amount
```

### src/services/partial-refund.service.ts
```
UNIT TESTS (8):
├── calculatePartialRefundAmount()
│   └── Calculates proportional fees

INTEGRATION TESTS (12):
├── validatePartialRefundItems()
│   ├── Validates quantity doesn't exceed original
│   ├── Validates minimum refund amount
│   └── Returns validation result
│
├── processPartialRefund()
│   ├── Processes refund through payment service
│   └── Creates refund records
│
├── updateOrderTotals()
│   └── Updates order with new totals
│
└── getRefundHistory()
    └── Returns refund history for order
```

### src/services/order-modification.service.ts
```
INTEGRATION TESTS (20):
├── calculateModificationImpact()
│   ├── Calculates price difference
│   └── Calculates 2% modification fee
│
├── requestModification()
│   └── Creates modification request
│
├── upgradeItem()
│   └── Creates upgrade modification
│
├── approveModification()
│   └── Approves and processes modification
│
├── rejectModification()
│   └── Rejects modification with reason
│
├── processModification()
│   ├── Handles UPGRADE
│   ├── Handles DOWNGRADE
│   ├── Handles CHANGE_QUANTITY
│   ├── Handles ADD
│   └── Handles REMOVE
│
└── getOrderModifications()
    └── Returns modifications for order
```

### src/services/admin-override.service.ts
```
INTEGRATION TESTS (18):
├── createOverride()
│   ├── Validates admin permissions
│   └── Creates pending override if approval required
│
├── approveOverride()
│   └── Approves override request
│
├── rejectOverride()
│   └── Rejects with reason
│
├── getOverride()
│   └── Returns override by ID
│
├── getOrderOverrides()
│   └── Returns overrides for order
│
├── getPendingApprovals()
│   └── Returns pending approvals
│
├── getAdminOverrides()
│   └── Returns overrides by admin
│
├── getApprovalWorkflow()
│   └── Returns workflow configuration
│
├── updateApprovalWorkflow()
│   └── Updates workflow
│
└── getAuditLog()
    └── Returns audit log for overrides
```

### src/services/bulk-operation.service.ts
```
INTEGRATION TESTS (8):
├── createBulkOperation()
│   └── Creates async bulk operation
│
├── processBulkOperation()
│   ├── Tracks success count
│   └── Tracks failure count
│
├── getBulkOperation()
│   └── Returns operation status
│
└── listBulkOperations()
    └── Returns operations list
```

### src/services/order-cache.service.ts
```
INTEGRATION TESTS (25):
├── getOrder() / setOrder() / deleteOrder()
│   └── CRUD with metrics tracking
│
├── getUserOrders()
│   └── Returns cached user orders
│
├── getUserOrderCount() / incrementUserOrderCount()
│   └── Atomic counter operations
│
├── getRateLimitCount() / incrementRateLimitCount()
│   ├── Hourly TTL
│   └── Daily TTL
│
├── getAvailability() / setAvailability()
│   └── 30 second TTL
│
├── getTicketTypeAvailability()
│   └── Returns cached availability
│
├── getStats()
│   ├── Returns hit rate
│   └── Returns miss rate
│
├── resetMetrics()
│   └── Resets all counters
│
├── deleteByPattern()
│   └── Deletes matching keys
│
└── flushAll()
    └── Clears entire cache
```

### src/services/order-analytics.service.ts
```
INTEGRATION TESTS (12):
├── calculateMetrics()
│   └── Aggregates all metrics
│
├── getTotals()
│   ├── Returns order count
│   └── Returns revenue total
│
├── getOrdersByStatus()
│   └── Returns status breakdown
│
├── getTopEvents()
│   └── Returns top 10 by revenue
│
└── calculateConversionRate()
    └── Returns conversion percentage
```

### src/services/order-notes.service.ts
```
INTEGRATION TESTS (18):
├── createNote()
│   └── Creates note with all fields
│
├── updateNote()
│   └── Updates note content/flags
│
├── deleteNote()
│   └── Deletes note
│
├── getNote()
│   └── Returns note by ID
│
├── getOrderNotes()
│   └── Returns notes for order
│
├── getFlaggedNotes()
│   └── Returns flagged notes
│
├── searchNotes()
│   └── Full-text and filter search
│
├── createTemplate()
│   └── Creates note template
│
├── getTemplates()
│   └── Returns templates
│
└── incrementTemplateUsage()
    └── Tracks template usage
```

### src/services/order-report.service.ts
```
INTEGRATION TESTS (20):
├── generateDailySummary()
├── generateWeeklySummary()
├── generateMonthlySummary()
├── getRevenueByEvent()
├── getTopEventsByRevenue()
├── getOrderStatsByStatus()
├── getAverageOrderValue()
└── getConversionRate()
```

### src/services/order-search.service.ts
```
INTEGRATION TESTS (15):
├── searchOrders()
│   ├── Full-text search
│   ├── Filter by status
│   ├── Filter by date range
│   ├── Filter by amount range
│   └── Pagination
│
├── saveSearch()
├── getSavedSearches()
├── deleteSavedSearch()
├── recordSearchHistory()
└── getSearchHistory()
```

### src/services/order-split.service.ts
```
INTEGRATION TESTS (6):
├── splitOrder()
│   ├── Creates split group
│   └── Allocates payments
│
└── getOrderSplit()
    └── Returns split details
```

### src/services/refund-notification.service.ts
```
UNIT TESTS (6):
├── calculateTimeline()
    ├── Returns 5-10 days for card
    ├── Returns 3-5 days for bank_transfer
    └── Returns 0-1 days for wallet

INTEGRATION TESTS (18):
├── notifyRefund()
│   └── Sends all notifications
│
├── notifyBuyer()
│   └── Publishes buyer notification
│
├── notifySeller()
│   └── Publishes seller notification
│
├── notifyCreator()
│   └── Publishes creator notification
│
├── notifyVenue()
│   └── Publishes venue notification
│
├── getSellerInfo()
│   └── Returns seller details
│
├── getEventInfo()
│   └── Returns event details
│
└── getPaymentMethod()
    └── Returns payment method
```

### src/services/refund-policy.service.ts
```
INTEGRATION TESTS (22):
├── createPolicy()
├── getPolicyById()
├── getPolicies()
├── getPolicyForOrder() (cascading lookup)
├── updatePolicy()
├── deactivatePolicy()
├── createRule()
├── getRulesForPolicy()
├── getRuleById()
├── updateRule()
├── deactivateRule()
└── deleteRule()
```

### src/services/refund-reason.service.ts
```
INTEGRATION TESTS (14):
├── createReason()
├── getReasonById()
├── getReasonByCode()
├── getReasons()
├── updateReason()
├── deactivateReason()
└── deleteReason()
```

### src/services/royalty.service.ts
```
INTEGRATION TESTS (12):
├── getRoyaltiesForOrder()
├── processReversals()
├── notifyRecipient()
├── hasRoyalties()
└── getTotalRoyalties()
```

### src/services/redis.service.ts
```
INTEGRATION TESTS (10):
├── initialize()
├── get()
├── set()
├── del()
├── close()
└── getClient()
```

---

## Phase 5: Events

**Files:** 7
**Unit Tests:** 76
**Integration Tests:** 39

### src/events/event-types.ts
```
UNIT TESTS (7):
├── OrderEvents enum values
│   ├── ORDER_CREATED = 'order.created'
│   ├── ORDER_RESERVED = 'order.reserved'
│   ├── ORDER_CONFIRMED = 'order.confirmed'
│   ├── ORDER_CANCELLED = 'order.cancelled'
│   ├── ORDER_EXPIRED = 'order.expired'
│   ├── ORDER_REFUNDED = 'order.refunded'
│   └── ORDER_FAILED = 'order.failed'
```

### src/events/event-schemas.ts
```
UNIT TESTS (35):
├── baseEventSchema
│   ├── orderId required UUID
│   ├── userId required UUID
│   ├── eventId required UUID
│   ├── orderNumber required (1-50 chars)
│   ├── status required (valid enum)
│   ├── totalCents required (0 to 100M)
│   ├── currency required (3 chars uppercase)
│   ├── items required array (1-50)
│   ├── timestamp required Date
│   └── metadata optional object
│
├── OrderCreatedSchema (base only)
├── OrderReservedSchema (+ expiresAt)
├── OrderConfirmedSchema (+ paymentIntentId)
├── OrderCancelledSchema (+ reason, optional refundAmountCents)
├── OrderExpiredSchema (+ reason)
├── OrderRefundedSchema (+ refundAmountCents, reason)
├── OrderFailedSchema (+ error)
└── EventSchemaMap completeness
```

### src/events/event-validator.ts
```
UNIT TESTS (12):
├── EventValidationError class
│   ├── Sets name
│   ├── Sets eventType
│   ├── Sets validationErrors
│   └── Builds message
│
├── validateEventPayload()
│   ├── Returns { valid: true, value } for valid
│   ├── Returns { valid: false, error } for invalid
│   ├── Strips unknown fields
│   ├── Converts types
│   ├── Returns all errors
│   └── Handles missing schema
│
└── validateEventPayloadOrThrow()
    ├── Returns value for valid
    └── Throws EventValidationError for invalid
```

### src/events/event-versions.ts
```
UNIT TESTS (12):
├── CURRENT_EVENT_VERSION = '1.0.0'
│
├── EventVersionHistory completeness
│
├── isSupportedVersion()
│   ├── Returns true for supported
│   ├── Returns false for unsupported
│   └── Returns false for unknown event
│
├── getLatestVersion()
│   ├── Returns last version from history
│   └── Returns CURRENT for unknown
│
└── migrateEventPayload()
    ├── Returns original if no migration
    └── Applies migration function
```

### src/events/event-publisher.ts
```
UNIT TESTS (8):
├── storeAndPublish() (private)
│   ├── Validates payload
│   ├── Gets latest version
│   ├── Generates idempotency key
│   ├── Builds eventData
│   ├── Retries publish (3 attempts)
│   └── Re-throws after all retries fail

INTEGRATION TESTS (14):
├── publishOrderCreated()
├── publishOrderReserved()
├── publishOrderConfirmed()
├── publishOrderCancelled()
├── publishOrderExpired()
├── publishOrderRefunded()
└── publishOrderFailed()
    (each tests success logging, error handling, re-throw)
```

### src/events/event-subscriber.ts
```
UNIT TESTS (2):
├── IDEMPOTENCY_PREFIX = 'event:processed:'
└── IDEMPOTENCY_TTL_SECONDS = 86400

INTEGRATION TESTS (25):
├── isEventProcessed() (private)
│   ├── Returns true if exists
│   ├── Returns false if not exists
│   └── Returns false (fail open) on error
│
├── markEventProcessed() (private)
│   ├── Sets key with TTL
│   └── Doesn't throw on error
│
├── subscribeToPaymentEvents()
│   ├── Consumes from queue
│   ├── Parses message
│   ├── Generates eventId
│   ├── Skips duplicates
│   ├── Routes by event type
│   ├── Acks on success
│   ├── Acks on duplicate
│   └── Nacks on error (no requeue)
│
├── handlePaymentSucceeded()
├── handlePaymentFailed()
├── handleDisputeCreated()
├── handleDisputeUpdated()
└── handleDisputeClosed()
```

---

## Phase 6: Jobs

**Files:** 8
**Unit Tests:** 37
**Integration Tests:** 138

### src/jobs/job-executor.ts
```
UNIT TESTS (20):
├── JobStatus enum values
├── INSTANCE_ID generation
├── JobConfig defaults
└── getInstanceId()

INTEGRATION TESTS (45):
├── Constructor
├── start()
├── stop()
├── startHeartbeat() / stopHeartbeat()
├── sendHeartbeat()
├── checkForStalledJobs()
├── startLockExtension() / stopLockExtension()
├── persistState()
├── executeWithMonitoring()
├── executeJob()
├── getStatus()
└── waitForCompletion()
```

### src/jobs/job-manager.ts
```
UNIT TESTS (3):
├── Initializes with empty jobs
└── isShuttingDown starts false

INTEGRATION TESTS (15):
├── register()
├── startAll()
├── stopAll()
├── getAllStatus()
├── gracefulShutdown()
├── registerShutdownHandlers()
├── getJob()
└── getJobCount()
```

### src/jobs/expiration.job.ts
```
UNIT TESTS (7):
├── Constructor configuration

INTEGRATION TESTS (10):
├── executeCore()
    ├── Gets tenants
    ├── Gets expired orders per tenant
    ├── Calls expireReservation
    ├── Tracks counts
    └── Throws if all failed
```

### src/jobs/reminder.job.ts
```
UNIT TESTS (2):
├── Constructor
└── sentReminders Set

INTEGRATION TESTS (15):
├── start()
├── stop()
├── sendExpirationReminders()
├── processRemindersForTenant()
└── publishReminderEvent()
```

### src/jobs/event-reminder.job.ts
```
INTEGRATION TESTS (10):
├── Constructor
├── executeCore()
└── sendEventReminder()
```

### src/jobs/reconciliation.job.ts
```
INTEGRATION TESTS (18):
├── Constructor
├── start()
├── stop()
├── reconcileOrderState()
├── findStaleReservedOrders()
├── findUnconfirmedPaymentOrders()
├── reconcileOrder()
└── verifyPaymentStatus()
```

### src/jobs/order-archiving.job.ts
```
UNIT TESTS (5):
├── ArchiveStats interface
├── emptyStats()
└── mergeStats()

INTEGRATION TESTS (25):
├── Constructor
├── start()
├── stop()
├── execute()
├── archiveTenantOrders()
├── archiveBatch()
├── getTenants()
├── logAuditRecord()
└── getStatus()
```

---

## Phase 7: Validators & Middleware

**Files:** 16
**Unit Tests:** 200
**Integration Tests:** 78

### src/validators/order.validator.ts
```
UNIT TESTS (25):
├── createOrderSchema
├── reserveOrderSchema
├── cancelOrderSchema
├── refundOrderSchema
├── getOrdersQuerySchema
└── uuidParamSchema
```

### src/validators/order-request.validator.ts
```
UNIT TESTS (15):
├── validateCreateOrderRequest()
├── validateReserveOrderRequest()
├── validateCancelOrderRequest()
└── validateRefundOrderRequest()
```

### src/validators/modification.validator.ts
```
UNIT TESTS (12):
├── modificationRequestSchema
├── upgradeRequestSchema
├── approveModificationSchema
└── rejectModificationSchema
```

### src/validators/refund.validator.ts
```
UNIT TESTS (8):
├── partialRefundSchema
└── refundIdSchema
```

### src/validators/refund-policy.validator.ts
```
UNIT TESTS (45):
├── policyParamSchema
├── ruleParamSchema
├── policyRuleParamSchema
├── reasonParamSchema
├── createPolicySchema
├── updatePolicySchema
├── createRuleSchema
├── updateRuleSchema
├── createReasonSchema
├── updateReasonSchema
├── checkEligibilitySchema
├── listPoliciesQuerySchema
└── listReasonsQuerySchema
```

### src/validators/tax.validator.ts
```
UNIT TESTS (40):
├── uuidParamSchema
├── createJurisdictionSchema
├── updateJurisdictionSchema
├── createTaxRateSchema
├── createCategorySchema
├── createExemptionSchema
├── calculateTaxSchema
├── configureProviderSchema
├── generateReportSchema
├── fileReportSchema
└── listQuerySchema
```

### src/middleware/error-handler.middleware.ts
```
UNIT TESTS (15):
├── errorHandler()
    ├── Extracts error code
    ├── Logs appropriately
    ├── Handles ValidationError
    ├── Handles Fastify validation
    └── Default error handling
```

### src/middleware/idempotency.middleware.ts
```
UNIT TESTS (2):
└── Constants

INTEGRATION TESTS (30):
├── idempotencyMiddleware()
├── checkDatabaseForIdempotencyKey()
└── idempotencyCacheHook()
```

### src/middleware/internal-auth.middleware.ts
```
UNIT TESTS (3):
├── ALLOWED_SERVICES
└── Token cleanup

INTEGRATION TESTS (20):
├── internalAuthMiddleware()
└── optionalInternalAuth()
```

### src/middleware/sensitive-operations.middleware.ts
```
UNIT TESTS (4):
└── Configuration constants

INTEGRATION TESTS (18):
├── requireRecentAuth()
├── requireExplicitConfirmation()
└── requireSensitiveOperationAuth()
```

### src/middleware/tenant.middleware.ts
```
INTEGRATION TESTS (10):
├── tenantMiddleware()
    ├── Validates tenant
    ├── Sets context
    └── Sets RLS
```

### src/middleware/trace.middleware.ts
```
UNIT TESTS (12):
├── extractTraceContext()
├── traceMiddleware()
└── getTracePropagationHeaders()
```

### src/middleware/validation.middleware.ts
```
UNIT TESTS (18):
├── validate() factory
└── validateData()
```

### src/middleware/request-id.middleware.ts
```
UNIT TESTS (1):
└── No-op wrapper
```

---

## Phase 8: Routes

**Files:** 6
**Unit Tests:** 8
**Integration Tests:** 146

### src/routes/health.routes.ts
```
UNIT TESTS (8):
├── Constants
├── markStartupComplete()
├── markStartupFailed()
└── withTimeout()

INTEGRATION TESTS (15):
├── GET /health/startup
├── GET /health/live
├── GET /health/ready
├── GET /health
└── GET /health/simple
```

### src/routes/metrics.routes.ts
```
INTEGRATION TESTS (6):
├── GET /metrics
├── GET /cache/stats
└── POST /cache/stats/reset
```

### src/routes/order.routes.ts
```
INTEGRATION TESTS (45):
├── POST /
├── GET /:orderId
├── GET /
├── POST /:orderId/reserve
├── POST /:orderId/cancel
├── POST /:orderId/refund
├── POST /:orderId/refund/partial
├── GET /:orderId/refunds
├── GET /:orderId/refunds/:refundId
├── GET /:orderId/events
├── POST /:orderId/modifications
├── POST /:orderId/upgrade
├── GET /:orderId/modifications
└── GET /:orderId/modifications/:modificationId
```

### src/routes/refund-policy.routes.ts
```
INTEGRATION TESTS (40):
├── POST /policies
├── GET /policies
├── GET /policies/:policyId
├── PATCH /policies/:policyId
├── DELETE /policies/:policyId
├── POST /rules
├── GET /policies/:policyId/rules
├── GET /rules/:ruleId
├── PATCH /rules/:ruleId
├── DELETE /rules/:ruleId/deactivate
├── DELETE /rules/:ruleId
├── POST /reasons
├── GET /reasons
├── GET /reasons/:reasonId
├── PATCH /reasons/:reasonId
├── DELETE /reasons/:reasonId
└── POST /check-eligibility
```

### src/routes/tax.routes.ts
```
INTEGRATION TESTS (40):
├── POST /jurisdictions
├── GET /jurisdictions
├── PATCH /jurisdictions/:jurisdictionId
├── POST /rates
├── GET /rates
├── POST /categories
├── GET /categories
├── POST /exemptions
├── GET /exemptions/customer/:customerId
├── POST /exemptions/:exemptionId/verify
├── POST /calculate
├── GET /orders/:orderId
├── POST /provider/configure
├── GET /provider/config
├── POST /reports
├── GET /reports
└── POST /reports/:reportId/file
```

---

## Phase 9: Controllers & App Bootstrap

**Files:** 5
**Unit Tests:** 38
**Integration Tests:** 138
**E2E Tests:** 5

### src/controllers/order.controller.ts
```
UNIT TESTS (2):
└── Constructor

INTEGRATION TESTS (55):
├── createOrder()
├── getOrder()
├── listOrders()
├── reserveOrder()
├── cancelOrder()
├── refundOrder()
├── getOrderEvents()
├── partialRefundOrder()
├── getRefundHistory()
├── getRefund()
├── requestModification()
├── upgradeOrderItem()
├── getOrderModifications()
└── getModification()
```

### src/controllers/refund-policy.controller.ts
```
UNIT TESTS (4):
├── Constructor
└── sendError() helper

INTEGRATION TESTS (35):
├── createPolicy()
├── getPolicy()
├── getPolicies()
├── updatePolicy()
├── deactivatePolicy()
├── createRule()
├── getRulesForPolicy()
├── getRule()
├── updateRule()
├── deactivateRule()
├── deleteRule()
├── createReason()
├── getReason()
├── getReasons()
├── updateReason()
├── deactivateReason()
└── checkEligibility()
```

### src/controllers/tax.controller.ts
```
UNIT TESTS (17):
└── All methods return 501 Not Implemented
```

### src/app.ts
```
UNIT TESTS (10):
├── Constants
├── isInternalServiceRequest()
└── errorHandler()

INTEGRATION TESTS (30):
├── createApp()
    ├── Database initialization
    ├── Redis initialization
    ├── RabbitMQ initialization
    ├── Plugin registration
    ├── Middleware registration
    ├── Route registration
    └── GET /info endpoint
```

### src/index.ts
```
UNIT TESTS (5):
└── Configuration constants

INTEGRATION TESTS (18):
├── startService()
├── Environment validation
├── Job initialization
└── Graceful shutdown

E2E TESTS (5):
├── Service starts successfully
├── Health endpoints respond
├── Order endpoints respond (with auth)
├── SIGTERM triggers graceful shutdown
└── All connections closed properly
```

---

## Test Priority Matrix

### CRITICAL (~150 tests)
Must pass before any deployment. Security, money movement, data integrity.

| Area | Tests | Description |
|------|-------|-------------|
| Price validation | 5 | Prevent price manipulation attacks |
| Ticket transfer checks | 8 | Block refunds for transferred tickets |
| Dispute handling | 15 | Lock/unlock refunds on chargebacks |
| Fail-closed behaviors | 10 | External service failures |
| Idempotency | 30 | All mutation operations |
| S2S Authentication | 20 | HMAC signature validation |
| Audit logging | 15 | Money movement tracking |
| Order state machine | 25 | Valid transitions only |
| Tenant isolation | 22 | RLS enforcement |

### HIGH (~400 tests)
Core business functionality.

| Area | Tests | Description |
|------|-------|-------------|
| Order CRUD | 60 | Create, reserve, confirm, cancel, refund |
| Refund eligibility | 35 | Policy evaluation |
| Circuit breakers | 30 | External service resilience |
| Distributed locking | 20 | Concurrent operation safety |
| Rate limiting | 15 | Redis-backed limits |
| Health checks | 15 | K8s probes with timeouts |
| Backpressure | 10 | Under-pressure handling |
| JWT authentication | 20 | Token validation |
| Event publishing | 14 | RabbitMQ integration |
| Event subscribing | 25 | Payment/dispute handling |

### MEDIUM (~600 tests)
Supporting functionality.

| Area | Tests | Description |
|------|-------|-------------|
| Cache operations | 25 | Redis caching with metrics |
| Re-authentication | 18 | Sensitive operation protection |
| Request tracing | 12 | Distributed tracing |
| Job heartbeat | 20 | Stall detection |
| Job lock extension | 15 | Long-running job support |
| Validators | 145 | Input validation schemas |
| Discount calculation | 25 | Various discount types |
| Modification handling | 20 | Order modifications |

### LOW (~675 tests)
Edge cases, formatting, analytics.

| Area | Tests | Description |
|------|-------|-------------|
| Type definitions | 35 | TypeScript interfaces |
| Error classes | 40 | Domain errors |
| Formatting utilities | 12 | Money formatting |
| PDF generation | 6 | Ticket PDFs |
| Analytics | 12 | Order analytics |
| Notes | 18 | Order notes |
| Reports | 20 | Report generation |
| Search | 15 | Order search |

---

## Coverage Targets

### Minimum Requirements
| Metric | Target | Critical Paths |
|--------|--------|----------------|
| Line Coverage | 80% | 95% |
| Branch Coverage | 75% | 90% |
| Function Coverage | 85% | 100% |
| Statement Coverage | 80% | 95% |

### Per-Phase Targets

| Phase | Target | Rationale |
|-------|--------|-----------|
| Phase 1 (Types/Models) | 85% | Foundation |
| Phase 2 (Config) | 80% | Bootstrap |
| Phase 3 (Utils) | 90% | Shared utilities |
| Phase 4 (Services) | 95% | Business logic |
| Phase 5 (Events) | 90% | Async messaging |
| Phase 6 (Jobs) | 85% | Background processing |
| Phase 7 (Validators/Middleware) | 90% | Security boundary |
| Phase 8 (Routes) | 85% | API contracts |
| Phase 9 (Controllers/App) | 80% | Integration |

---

## Implementation Order

### Week 1: Foundation
1. Test infrastructure setup
2. Phase 1: Types, Errors, Models
3. Phase 2: Config & Bootstrap

### Week 2: Core Logic
4. Phase 3: Utils
5. Phase 4: Services (CRITICAL paths first)

### Week 3: Events & Jobs
6. Phase 5: Events
7. Phase 6: Jobs

### Week 4: API Layer
8. Phase 7: Validators & Middleware
9. Phase 8: Routes
10. Phase 9: Controllers & App

### Week 5: Integration & E2E
11. E2E test suite
12. Coverage gap analysis
13. Performance testing setup

---

## Appendix: File Index

### All 151 Files by Directory
```
src/
├── types/ (17 files)
│   ├── order.types.ts
│   ├── refund.types.ts
│   ├── modification.types.ts
│   ├── event.types.ts
│   ├── auth.types.ts
│   ├── discount.types.ts
│   ├── analytics.types.ts
│   └── index.ts (+ 9 more type files)
│
├── errors/ (1 file)
│   └── domain-errors.ts
│
├── models/ (4 files)
│   ├── order.model.ts
│   ├── order-item.model.ts
│   ├── order-event.model.ts
│   └── order-refund.model.ts
│
├── config/ (12 files)
│   ├── alerts.config.ts
│   ├── cache.config.ts
│   ├── database.ts
│   ├── env.validator.ts
│   ├── fees.ts
│   ├── index.ts
│   ├── order.config.ts
│   ├── rabbitmq.ts
│   ├── redis.ts
│   ├── secrets.ts
│   ├── security.config.ts
│   └── container.ts
│
├── utils/ (15 files)
│   ├── circuit-breaker.ts
│   ├── command-validator.ts
│   ├── distributed-lock.ts
│   ├── http-client.util.ts
│   ├── idempotency-key-generator.ts
│   ├── logger.ts
│   ├── metrics.ts
│   ├── money.ts
│   ├── order-state-machine.ts
│   ├── pdf-generator.ts
│   ├── retry.ts
│   ├── saga-coordinator.ts
│   ├── transaction.ts
│   ├── validators.ts
│   └── index.ts
│
├── services/ (27 files)
│   ├── order.service.ts [CRITICAL]
│   ├── refund-eligibility.service.ts [CRITICAL]
│   ├── dispute.service.ts [CRITICAL]
│   ├── fraud.service.ts [HIGH]
│   ├── ticket.client.ts [HIGH]
│   ├── payment.client.ts [HIGH]
│   ├── event.client.ts [HIGH]
│   ├── discount-calculator.service.ts
│   ├── discount-combination.service.ts
│   ├── promo-code.service.ts
│   ├── partial-refund.service.ts
│   ├── order-modification.service.ts
│   ├── admin-override.service.ts
│   ├── bulk-operation.service.ts
│   ├── order-cache.service.ts
│   ├── order-analytics.service.ts
│   ├── order-notes.service.ts
│   ├── order-report.service.ts
│   ├── order-search.service.ts
│   ├── order-split.service.ts
│   ├── refund-notification.service.ts
│   ├── refund-policy.service.ts
│   ├── refund-reason.service.ts
│   ├── royalty.service.ts
│   ├── redis.service.ts
│   └── index.ts
│
├── events/ (7 files)
│   ├── event-types.ts
│   ├── event-schemas.ts
│   ├── event-validator.ts
│   ├── event-versions.ts
│   ├── event-publisher.ts
│   ├── event-subscriber.ts
│   └── index.ts
│
├── jobs/ (8 files)
│   ├── job-executor.ts
│   ├── job-manager.ts
│   ├── expiration.job.ts
│   ├── reminder.job.ts
│   ├── event-reminder.job.ts
│   ├── reconciliation.job.ts
│   ├── order-archiving.job.ts
│   └── index.ts
│
├── validators/ (6 files)
│   ├── order.validator.ts
│   ├── order-request.validator.ts
│   ├── modification.validator.ts
│   ├── refund.validator.ts
│   ├── refund-policy.validator.ts
│   ├── tax.validator.ts
│   └── index.ts
│
├── middleware/ (10 files)
│   ├── error-handler.middleware.ts
│   ├── idempotency.middleware.ts
│   ├── internal-auth.middleware.ts
│   ├── request-id.middleware.ts
│   ├── sensitive-operations.middleware.ts
│   ├── tenant.middleware.ts
│   ├── trace.middleware.ts
│   ├── validation.middleware.ts
│   └── index.ts
│
├── routes/ (6 files)
│   ├── health.routes.ts
│   ├── metrics.routes.ts
│   ├── order.routes.ts
│   ├── refund-policy.routes.ts
│   ├── tax.routes.ts
│   └── index.ts
│
├── controllers/ (4 files)
│   ├── order.controller.ts
│   ├── refund-policy.controller.ts
│   ├── tax.controller.ts
│   └── index.ts
│
├── plugins/ (1 file)
│   └── jwt-auth.plugin.ts
│
├── app.ts
└── index.ts
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | AI Assistant | Initial comprehensive test plan |

