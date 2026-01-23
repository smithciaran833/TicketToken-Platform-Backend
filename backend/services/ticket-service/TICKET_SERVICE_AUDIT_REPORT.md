# TICKET-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** 2026-01-23
**Service:** ticket-service
**Location:** `backend/services/ticket-service/`
**Auditor:** Claude Opus 4.5 (Automated)
**Updated:** 2026-01-23 (Follow-up analysis of models/, schemas/, utils/, clients/)

> **Note:** This report was updated to include analysis of 19 additional files covering models, schemas, utilities, and client layers. See Section 9B for detailed findings.

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| POST | /tickets/types | ticketController.createTicketType | Create new ticket type (admin/venue_manager) |
| GET | /tickets/events/:eventId/types | ticketController.getTicketTypes | List ticket types for event (public) |
| POST | /tickets/purchase | ticketController.createReservation | Create ticket reservation |
| POST | /tickets/reservations/:reservationId/confirm | ticketController.confirmPurchase | Confirm purchase |
| DELETE | /tickets/reservations/:reservationId | ticketController.releaseReservation | Release reservation |
| GET | /tickets/:ticketId/qr | ticketController.generateQR | Generate QR code for ticket |
| POST | /tickets/validate-qr | ticketController.validateQR | Validate QR code (venue staff) |
| GET | /tickets/users/:userId | ticketController.getUserTickets | Get user's tickets |
| GET | /tickets/types/:id | ticketController.getTicketType | Get specific ticket type |
| PUT | /tickets/types/:id | ticketController.updateTicketType | Update ticket type (admin) |
| GET | /tickets/:ticketId | ticketController.getTicketById | Get ticket by ID |
| GET | /tickets/ | ticketController.getCurrentUserTickets | Get current user's tickets |
| POST | /purchase/ | purchaseController.createOrder | Create purchase order |
| POST | /purchase/confirm | (Not implemented) | Confirm purchase with payment |
| DELETE | /purchase/:reservationId | (Not implemented) | Cancel reservation |
| POST | /transfers/ | transferController.transferTicket | Transfer ticket |
| GET | /transfers/:ticketId/history | transferController.getTransferHistory | Get transfer history |
| POST | /transfers/validate | transferController.validateTransfer | Validate transfer request |
| GET | /qr/:ticketId/generate | qrController.generateQR | Generate QR code |
| POST | /qr/validate | qrController.validateQR | Validate QR code |
| POST | /qr/refresh | qrController.refreshQR | Refresh rotating QR |
| POST | /validation/qr | validationController.validateQR | QR validation endpoint |
| GET | /orders/ | ordersController.getOrders | Get user orders |
| GET | /orders/tickets | ordersController.getTickets | Get user tickets |
| GET | /orders/:orderId | ordersController.getOrder | Get specific order |
| POST | /mint/process-mint | mintController.processMint | Process NFT minting |
| POST | /webhooks/payment-success | webhookController | Handle payment success |
| POST | /webhooks/payment-failed | webhookController | Handle payment failure |
| GET | /health | healthRoutes | Health check |
| GET | /health/live | healthRoutes | Liveness probe |
| GET | /health/ready | healthRoutes | Readiness probe |
| GET | /health/detailed | healthRoutes | Detailed health check |
| GET | /metrics | healthRoutes | Prometheus metrics |

### Internal Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /internal/tickets/:ticketId/status | Get ticket status for refund checks |
| POST | /internal/tickets/cancel-batch | Batch cancel tickets |
| POST | /internal/tickets/calculate-price | Calculate ticket prices |
| GET | /internal/tickets/:ticketId/full | Get full ticket with event data |
| GET | /internal/tickets/by-event/:eventId | Get all tickets for event (scanning cache) |
| GET | /internal/tickets/by-token/:tokenId | Get ticket by blockchain token ID |
| POST | /internal/tickets/:ticketId/transfer | Transfer ticket (S2S) |
| GET | /internal/orders/:orderId/tickets/count | Get ticket count for order |
| POST | /internal/tickets/:ticketId/record-scan | Record scan event |
| POST | /internal/tickets/:ticketId/update-nft | Update NFT fields |
| POST | /internal/tickets/batch-by-token | Batch lookup by token IDs |
| GET | /internal/tickets/:ticketId/for-validation | Get ticket for QR validation |
| GET | /internal/tickets/:ticketId/for-refund | Get ticket for refund eligibility |

### Business Operations

1. **Ticket Type Management** - Create, update, list ticket types for events
2. **Reservation System** - Reserve tickets with expiry, confirm/release reservations
3. **Purchase Flow** - Saga-based purchase with order-service integration
4. **QR Code Management** - Generate and validate rotating QR codes
5. **Ticket Transfer** - Transfer tickets between users with restrictions
6. **NFT Minting** - Mint tickets as NFTs on Solana blockchain
7. **Check-in/Validation** - Validate tickets at venues
8. **Refund Processing** - Cancel tickets and trigger refunds

---

## 2. DATABASE SCHEMA

### Tables (29 total)

| # | Table | Description | RLS |
|---|-------|-------------|-----|
| 1 | ticket_types | Ticket type definitions (name, price, quantity) | Yes |
| 2 | reservations | Ticket reservations with expiry | Yes |
| 3 | tickets | Main ticket records | Yes |
| 4 | ticket_transfers | Transfer history and pending transfers | Yes |
| 5 | ticket_validations | Validation/scan records | Yes |
| 6 | waitlist | Waitlist for sold-out tickets | Yes |
| 7 | ticket_price_history | Price change audit trail | Yes |
| 8 | ticket_holds | Admin holds on tickets | Yes |
| 9 | ticket_bundles | Bundle definitions | Yes |
| 10 | ticket_bundle_items | Bundle-ticket type associations | Yes |
| 11 | ticket_audit_log | Audit trail for ticket operations | Yes |
| 12 | ticket_notifications | Notification records | Yes |
| 13 | discounts | Discount code definitions | Yes |
| 14 | order_discounts | Applied discounts per order | Yes |
| 15 | outbox | Transactional outbox for events | Yes |
| 16 | reservation_history | Reservation status changes | Yes |
| 17 | webhook_nonces | Replay attack prevention | No (global) |
| 18 | ticket_scans | QR scan records | Yes |
| 19 | pending_transactions | Blockchain pending transactions | Yes |
| 20 | blockchain_sync_log | Blockchain reconciliation log | Yes |
| 21 | tenant_access_violations | RLS violation log | No (global) |
| 22 | ticket_idempotency_keys | Idempotency for ticket ops | Yes |
| 23 | spending_limits | User spending limits | Yes |
| 24 | account_lockout_events | Account lockout audit | No (global) |
| 25 | multisig_approval_requests | Multi-sig approval requests | Yes |
| 26 | multisig_approvals | Individual approvals | Yes |
| 27 | multisig_rejections | Individual rejections | Yes |
| 28 | spending_transactions | Spending tracking | Yes |
| 29 | ticket_state_history | Ticket status change history | Yes |

### Key Schema Features

**tickets table key columns:**
- `id`, `tenant_id`, `event_id`, `ticket_type_id`, `user_id`
- `status`: 12 valid statuses (available, reserved, sold, minted, active, transferred, checked_in, used, revoked, refunded, expired, cancelled)
- `is_transferable`, `transfer_count`, `is_nft`
- `token_mint`, `validated_at`, `checked_in_at`

**Indexes:** Comprehensive coverage on foreign keys, status, tenant combinations

**CHECK Constraints:**
- `tickets.status` limited to 12 valid values
- `tickets.price >= 0`, `face_value >= 0`, `transfer_count >= 0`
- `ticket_transfers` ensures `from_user_id <> to_user_id`
- `ticket_types` ensures `available_quantity <= quantity`

**RLS Policies:**
- 25 tables have RLS enabled
- Policy uses `app.current_tenant_id` session variable
- System bypass via `app.is_system_user = 'true'`

### Schema Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| **Cross-service FKs** | Medium | Foreign keys reference `events`, `venues`, `users` tables owned by other services |
| **Orders table FK** | Medium | References `orders` table which belongs to order-service |

---

## 3. SECURITY ANALYSIS

### A. Inbound Authentication (Internal Endpoints)

**Middleware:** `src/middleware/internal-auth.middleware.ts`

**Implementation:**
```typescript
// Uses @tickettoken/shared HMAC validation
const hmacValidator = createHmacValidator({
  secret: INTERNAL_HMAC_SECRET,
  serviceName: 'ticket-service',
  replayWindowMs: 60000, // 60 seconds
});
```

**Algorithm:** HMAC-SHA256
**Uses @tickettoken/shared:** Yes
**Replay Attack Prevention:** Yes (60-second nonce window)
**Allowed Services:** api-gateway, payment-service, order-service, minting-service, transfer-service, blockchain-service, blockchain-indexer, scanning-service, venue-service, event-service

**⚠️ ISSUE: Feature Flag Bypass**
```typescript
// src/middleware/internal-auth.middleware.ts:65-68
if (!USE_NEW_HMAC) {
  log.debug('HMAC validation disabled (USE_NEW_HMAC=false)');
  return; // BYPASS - No authentication!
}
```

### B. Outbound Service Calls

| File | Line | Service | Endpoint | Auth Method | Client | Notes |
|------|------|---------|----------|-------------|--------|-------|
| src/sagas/PurchaseSaga.ts | 227 | order-service | createOrder | HMAC-SHA256 | @tickettoken/shared | ✅ Correct |
| src/sagas/PurchaseSaga.ts | 361 | order-service | cancelOrder | HMAC-SHA256 | @tickettoken/shared | ✅ Correct |

**Assessment:** Outbound HTTP calls use the standardized shared client with HMAC authentication.

### C. Service Boundary Check - **CRITICAL ISSUES**

**Direct database access to other services' tables:**

| File | Line | Table | Analysis |
|------|------|-------|----------|
| src/workers/mintWorker.ts | 30 | orders | ⚠️ VIOLATION: Queries orders table directly |
| src/controllers/orders.controller.ts | 38, 128 | orders | ⚠️ VIOLATION: Queries orders table directly |
| src/models/Order.ts | 98, 104, 110, 116, 145 | orders | ⚠️ VIOLATION: Full CRUD on orders table |
| src/services/refundHandler.ts | 21 | orders | ⚠️ VIOLATION: Reads order payment info |
| src/services/paymentEventHandler.ts | 29 | orders | ⚠️ VIOLATION: Queries orders table |
| src/services/transferService.ts | 70 | events | ⚠️ VIOLATION: Queries events table |
| src/services/transferService.ts | 112, 123, 293 | users | ⚠️ VIOLATION: Queries users table |
| src/routes/internalRoutes.ts | 240, 948, 1049 | events, venues | ⚠️ VIOLATION: JOIN queries across services |

**Summary:** 15+ locations where ticket-service directly queries tables owned by other services.

### D. Other Security Findings

**SQL Injection:** ✅ No issues found - uses parameterized queries
**Input Validation:** ✅ Zod schemas with `.strict()` for request validation
**Rate Limiting:** ✅ Multiple tiers (read, write, purchase, qrScan)
**Idempotency:** ✅ Middleware for purchase and reservation operations

**Additional Security Features (Follow-up Audit):**
| Feature | Location | Implementation |
|---------|----------|----------------|
| Mass Assignment Prevention | All models | Field whitelist (UPDATABLE_FIELDS) |
| ReDoS Protection | utils/validation.ts | `safeRegexTest()` with timeout + pattern detection |
| XSS Prevention | utils/xss.ts | Context-aware encoding (HTML, JS, URL, CSS) |
| Prototype Pollution Detection | utils/validation.ts | `checkPrototypePollution()` function |
| Attack Pattern Detection | utils/validation.ts | SQL injection, path traversal, command injection |
| PII Sanitization | utils/logger.ts | Automatic masking in logs |
| Security Event Logging | utils/validation.ts | SIEM-compatible audit events |
| Unicode Normalization | schemas/index.ts | NFC normalization on string inputs |
| Response Masking | schemas/response.schema.ts | Email/phone masking for data leakage prevention |

**Issues Found:**
| Finding | Location | Severity |
|---------|----------|----------|
| Feature flag HMAC bypass | internal-auth.middleware.ts:65-68 | HIGH |
| ~140 `any` type usages | 40+ files | Medium |
| Unimplemented endpoints | purchaseRoutes.ts:162-166, 195-198 | Medium |

---

## 4. PURCHASE FLOW

### Implementation: `src/sagas/PurchaseSaga.ts`

**Workflow Steps:**

```
Step 1: Reserve Inventory (local DB)
    ↓
Step 2: Create Order (order-service API via shared client)
    ↓
Step 3: Create Tickets (local DB)
    ↓
COMMIT
```

**Compensation (Rollback) Logic:**
- Step 3 fails → Delete created tickets + Cancel order in order-service + Release inventory
- Step 2 fails → Release inventory
- Uses `Promise.allSettled` for parallel compensation execution

**Service Calls:**
- `orderServiceClient.createOrder()` - Creates order with HMAC auth
- `orderServiceClient.cancelOrder()` - Cancels order during compensation

**Error Handling:**
- Database transaction wraps all local operations
- ServiceClientError handling for order-service failures
- Comprehensive logging at each step

**Assessment:** Well-implemented saga pattern with proper compensation.

---

## 5. TICKET STATE MACHINE

### Implementation: `src/services/ticket-state-machine.ts`

### All Ticket Statuses (12)

| Status | Category | Terminal? |
|--------|----------|-----------|
| AVAILABLE | Pre-purchase | No |
| RESERVED | Pre-purchase | No |
| SOLD | Purchase | No |
| MINTED | Purchase | No |
| ACTIVE | Ownership | No |
| TRANSFERRED | Ownership | No |
| CHECKED_IN | Usage | Yes |
| USED | Usage | Yes |
| REVOKED | Invalid | Yes |
| REFUNDED | Invalid | Yes |
| EXPIRED | Invalid | Yes |
| CANCELLED | Invalid | Yes |

### Valid Transitions

```
AVAILABLE → RESERVED, SOLD, CANCELLED
RESERVED → AVAILABLE, SOLD, EXPIRED, CANCELLED
SOLD → MINTED, REFUNDED, CANCELLED
MINTED → ACTIVE, REFUNDED, REVOKED
ACTIVE → TRANSFERRED, CHECKED_IN, REFUNDED, REVOKED
TRANSFERRED → ACTIVE, TRANSFERRED, CHECKED_IN, REFUNDED, REVOKED
CHECKED_IN → (terminal)
USED → (terminal)
REVOKED → (terminal)
REFUNDED → (terminal)
EXPIRED → (terminal)
CANCELLED → (terminal)
```

### RBAC Permissions

| Target Status | Required Roles | Requires Reason |
|---------------|----------------|-----------------|
| REVOKED | venue_admin, event_admin, super_admin, system | Yes |
| REFUNDED | venue_admin, event_admin, super_admin, system | Yes |
| CANCELLED | venue_admin, event_admin, super_admin, system | Yes |

### Validation Logic

1. **Transition Validation** - Throws ValidationError for invalid transitions
2. **Terminal Status Check** - Cannot transition from terminal states
3. **RBAC Check** - Validates user role for sensitive transitions
4. **Reason Requirement** - Requires reason for revoke/refund/cancel
5. **Check-in Time Window** - 4 hours before to 2 hours after event

### Side Effects

| Status | Side Effect |
|--------|-------------|
| TRANSFERRED | Record in DB + Queue blockchain transfer + Notify both users |
| CHECKED_IN | Update timestamps + Record in ticket_scans |
| REVOKED | Notify holder |
| REFUNDED | Queue payment refund + Notify holder |

---

## 6. TRANSFER FUNCTIONALITY

### Implementation: `src/services/transferService.ts`

### Transfer Operations in ticket-service

1. **transferTicket()** - Full transfer implementation
2. **getTransferHistory()** - Query transfer records
3. **validateTransferRequest()** - Comprehensive validation

### ticket-service Has Its Own transfers Table

- Table: `ticket_transfers`
- Columns: id, tenant_id, ticket_id, from_user_id, to_user_id, status, tx_signature, etc.

### Transfer Validation Rules

| Rule | Implementation |
|------|----------------|
| Same user check | Cannot transfer to yourself |
| Cooldown period | 30 minutes between transfers |
| Daily rate limit | Max 10 transfers per user per day |
| Recipient status | Must be ACTIVE account |
| Recipient email | Must be verified |
| Ticket status | Must be 'active' status |
| Transferable flag | `is_transferable` must be true |
| Event restrictions | Check `allow_transfers`, deadline, blackout periods |
| Max transfers | Per-ticket transfer limit |
| Identity verification | Optional per-event requirement |

### ⚠️ DUPLICATION CONCERN

A separate `transfer-service` exists in the platform at `backend/services/transfer-service/`.

**Analysis:**
- ticket-service has complete transfer logic with `ticket_transfers` table
- Internal endpoint `/internal/tickets/:ticketId/transfer` exists
- TransferService class handles all transfer business logic
- No evidence of calls to external transfer-service

**Recommendation:** Clarify ownership - either:
1. Move all transfer logic to transfer-service (ticket-service provides internal APIs)
2. Remove transfer-service and keep logic in ticket-service

---

## 7. BLOCKCHAIN INTEGRATION

### Implementation: `src/services/solanaService.ts`

### Components

| Component | Purpose |
|-----------|---------|
| CircuitBreaker | Prevents cascade failures (5 failures → OPEN) |
| RPCFailoverManager | Multiple RPC endpoints with health tracking |
| BlockchainEventListener | WebSocket for transaction confirmations |
| TransactionConfirmationService | Wait for confirmations with blockhash expiry |
| ReconciliationService | Compare on-chain vs database state |

### Transaction Types

- `mint` - Mint NFT for ticket
- `transfer` - Transfer NFT ownership
- `burn` - Burn NFT
- `metadata_update` - Update NFT metadata
- `verify` - Verify ownership

### Sync Status Monitoring

Exposes comprehensive metrics:
- `syncLag` - Time since last sync
- `lastBlockProcessed` - Last processed slot
- `slotsBehind` - Current lag in slots
- `syncErrors` - Error count
- `avgConfirmationTimeMs` - Average confirmation time

### Reconciliation

- Runs every 5 minutes
- Checks pending transactions older than 2 minutes
- Marks expired blockhashes
- Updates confirmed/failed status

### Assessment

Well-architected with resilience patterns (circuit breaker, failover, retry).

---

## 8. BACKGROUND WORKERS

### Worker: MintWorker (`src/workers/mintWorker.ts`)

**Purpose:** Process NFT minting jobs for purchased tickets

**Operations:**
1. Fetch order details (⚠️ directly queries orders table)
2. Generate ticket numbers and QR codes
3. Mint NFT (currently mocked)
4. Insert tickets into database
5. Update order status to COMPLETED
6. Write to outbox for event publishing

**Error Handling:** Transaction rollback + order status update to MINT_FAILED

### Worker: ReservationExpiryWorker (`src/workers/reservation-expiry.worker.ts`)

**Purpose:** Release expired reservations

**Schedule:** Every 60 seconds
**Operations:**
1. Call `release_expired_reservations()` stored procedure
2. Query recently expired reservations
3. Write `reservation.expired` events to outbox

### Worker: BlockchainReconciliationWorker (`src/workers/blockchain-reconciliation.worker.ts`)

**Purpose:** Reconcile blockchain state with database

**Schedule:** Every 5 minutes (configurable)
**Operations:**
1. Reconcile pending transactions older than 2 minutes
2. Check ownership discrepancies for recently transferred tickets
3. Mark transactions with expired blockhashes
4. Auto-fix discrepancies if enabled

**Metrics:**
- Prometheus metrics for monitoring
- Discrepancy log (last 1000 entries)

### Worker: Reservation Cleanup (`src/workers/reservation-cleanup.worker.ts`)

**Purpose:** Clean up stale/orphaned reservations (assumed based on file name)

### Worker: Idempotency Cleanup (`src/workers/idempotency-cleanup.worker.ts`)

**Purpose:** Clean up expired idempotency keys (assumed based on file name)

---

## 9. CODE QUALITY

### TODO/FIXME Comments

| File | Line | Comment |
|------|------|---------|
| src/routes/purchaseRoutes.ts | 121 | `TODO: Add confirmPurchase method to purchaseController` |
| src/routes/purchaseRoutes.ts | 170 | `TODO: Add cancelReservation method to purchaseController` |

### `any` Type Usage

**Total:** ~140 occurrences across 40+ files

**Highest Occurrences:**
- src/services/queueService.ts: 16
- src/services/queueListener.ts: 13
- src/services/redisService.ts: 9
- src/bootstrap/container.ts: 8
- src/services/ticketService.ts: 7

**Additional `any` usages found in models/utils (Follow-up Audit):**
| File | Line(s) | Usage |
|------|---------|-------|
| src/models/QRCode.ts | 122 | `mapRow(row: any)` parameter |
| src/models/Reservation.ts | 83, 88 | `validValues: any[]`, `(data as any)[key]` |
| src/models/Ticket.ts | 30, 132, 137, 165 | `metadata?: any`, `validValues: any[]`, cast, mapRow |
| src/models/Transfer.ts | 203 | `mapRow(row: any)` parameter |
| src/models/Order.ts | 26, 123, 128, 150 | `metadata?: any`, `validValues: any[]`, cast, mapRow |
| src/utils/errors.ts | 2, 14, 24, etc. | `details?: Record<string, any>` in all error classes |
| src/utils/async-handler.ts | 13-14 | `reason: any, promise: Promise<any>` |
| src/utils/validation.ts | 278 | `(request as any)?.tenantId` |
| src/utils/tenant-db.ts | 269 | `additionalWhere: Record<string, any>` |
| src/utils/metrics.ts | 570, 576 | `metricsStartTime` type inference |

### Error Handling

**Positive:**
- Custom error classes (ValidationError, NotFoundError, ForbiddenError)
- Consistent error response format
- Transaction rollback on failures

**Issues:**
- Some catch blocks swallow errors with only logging
- Missing error handling in some async operations

### Dependencies

**Key Dependencies:**
- @tickettoken/shared - Shared utilities, HMAC auth, service clients
- @solana/web3.js - Blockchain integration
- fastify - HTTP framework
- knex - Database migrations/queries
- amqplib - RabbitMQ integration
- zod - Schema validation
- winston - Logging
- prom-client - Prometheus metrics

---

## 9B. ADDITIONAL ANALYSIS (Follow-up Audit)

### Models Layer (`src/models/`)

**Files Analyzed:** QRCode.ts, Reservation.ts, Ticket.ts, Transfer.ts, Order.ts

**Positive Patterns:**

1. **Field Whitelisting (Mass Assignment Prevention)**
   ```typescript
   // All models implement UPDATABLE_FIELDS whitelist
   private readonly UPDATABLE_FIELDS = ['user_id', 'status', 'price_cents', ...];

   // Update method validates against whitelist
   Object.keys(data).forEach(key => {
     if (this.UPDATABLE_FIELDS.includes(key)) {
       validFields.push(key);
     }
   });
   ```

2. **Parameterized Queries** - All SQL uses parameterized queries (no SQL injection risk)

3. **Soft Delete Support** - Ticket model uses `deleted_at` for soft deletes

4. **Consistent Mapping** - Each model has `mapRowTo*()` for DB→Object transformation

**Issues:**

| Model | Issue | Severity |
|-------|-------|----------|
| Order.ts | Complete CRUD on `orders` table (service boundary violation) | Critical |
| All models | `mapRow(row: any)` parameter lacks type safety | Medium |
| Ticket.ts | `metadata?: any` allows arbitrary data | Low |

### Schemas Layer (`src/schemas/`)

**Files:** index.ts (402 lines), response.schema.ts (344 lines)

**Security Features Implemented:**

1. **Prototype Pollution Prevention**
   ```typescript
   // Uses .strict() on all schemas
   export const ticketTypeSchema = z.object({...}).strict();
   ```

2. **Unicode Normalization**
   ```typescript
   // safeString() applies NFC normalization
   function safeString(minLen: number, maxLen: number) {
     return z.string().transform(s => s.normalize('NFC')).min(minLen).max(maxLen);
   }
   ```

3. **Input Length Limits** - All string fields have explicit max lengths

4. **ISO 8601 Date Validation** - Dates validated against ISO format

5. **Response Sanitization**
   ```typescript
   // response.schema.ts - prevents data leakage
   export function sanitizeResponse(data: unknown): unknown;
   export function maskEmail(email: string): string; // j***@example.com
   export function maskPhone(phone: string): string; // ***-***-1234
   ```

### Utilities Layer (`src/utils/`)

**Files Analyzed:** 11 utility files

#### errors.ts (72 lines)
- Custom error hierarchy: `AppError` → `ValidationError`, `NotFoundError`, `ConflictError`, etc.
- All errors have `statusCode` and `code` properties
- **Issue:** Uses `Record<string, any>` for details

#### CircuitBreaker.ts (138 lines)
- Basic circuit breaker implementation
- Uses `unknown` type properly (no `any`)

#### resilience.ts (921 lines) - **Comprehensive Resilience Patterns**

| Pattern | Implementation |
|---------|----------------|
| Circuit Breaker | With Prometheus metrics, configurable thresholds |
| Feature Flags | Per-circuit-breaker disable via env vars |
| Retry with Jitter | `retryWithBackoff()` with exponential backoff |
| Degraded Service Mode | `DegradedServiceManager` class |
| Bulkhead | Concurrency limiting pattern |
| Cache with Fallback | Stale data serving on failure |

#### logger.ts (593 lines) - **Enterprise Logging**

| Feature | Implementation |
|---------|----------------|
| PII Sanitization | `PIISanitizer` class masks sensitive data |
| Trace Context | OpenTelemetry trace/span ID injection |
| Request Correlation | X-Request-Id propagation |
| Level Configuration | Environment-based log levels |

#### metrics.ts (860 lines) - **Prometheus Metrics**

| Metric Category | Examples |
|-----------------|----------|
| HTTP Metrics | `http_requests_total`, `http_request_duration_seconds` |
| Business Metrics | `tickets_sold_total`, `transfers_completed_total` |
| SLI Metrics | Apdex score, error budget tracking, throughput |
| Cache Metrics | `cache_hits_total`, `cache_misses_total` |

#### tenant-db.ts (468 lines) - **Multi-tenancy Support**

| Function | Purpose |
|----------|---------|
| `setTenantContext()` | Sets `SET LOCAL app.current_tenant_id` |
| `withTenantContext()` | Transaction-scoped tenant operations |
| `selectTicketsForUpdate()` | `SKIP LOCKED` for concurrent access |
| `verifyRLS()` | RLS policy verification |

#### xss.ts (514 lines) - **XSS Prevention**

| Function | Purpose |
|----------|---------|
| `encodeHtml()` | HTML entity encoding |
| `encodeAttribute()` | Attribute context encoding |
| `encodeJavaScript()` | JS context encoding |
| `encodeUrl()` | URL encoding |
| `encodeCss()` | CSS context encoding |
| `sanitizeHtml()` | HTML sanitization with allowed tags |
| `validateAndSanitize()` | Combined validation and sanitization |

#### tracing.ts (654 lines) - **OpenTelemetry Distributed Tracing**

| Feature | Implementation |
|---------|----------------|
| Auto-instrumentation | Fastify, HTTP, PostgreSQL, Redis, RabbitMQ, Winston |
| Configurable Sampling | Per-route rules, per-operation rules, priority rules |
| Context Propagation | W3C Trace Context, X-Correlation-Id |
| Custom Spans | `withSpan()`, `withDatabaseSpan()`, `withBlockchainSpan()` |
| Error Recording | Automatic error span recording |

#### validation.ts (631 lines) - **Security-Focused Validation**

| Feature | Implementation |
|---------|----------------|
| ReDoS Protection | `safeRegexTest()` with timeout monitoring |
| Vulnerable Pattern Detection | Blocks nested quantifiers |
| Security Event Logging | SIEM-compatible sanitization event logging |
| Attack Detection | XSS, SQL injection, path traversal, command injection patterns |
| Prototype Pollution Check | `checkPrototypePollution()` function |
| Size-aware Validation | `createSizeAwareValidator()` for payload limits |

#### migration-helpers.ts (524 lines) - **Safe Migrations**

| Feature | Purpose |
|---------|---------|
| `createIndex()` | CONCURRENTLY support for zero-downtime |
| `ifTableExists()` / `ifColumnExists()` | Idempotent operations |
| `createPolicyIfNotExists()` | Safe RLS policy creation |
| `addEnumValueIfNotExists()` | Safe enum extension |
| Migration tracking | Checksum-based migration verification |

#### async-handler.ts (18 lines)
- Global error handlers for `uncaughtException` and `unhandledRejection`
- **Issue:** Uses `any` for rejection reason

### Clients Layer (`src/clients/index.ts`)

**Implementation:** Re-exports from @tickettoken/shared for backwards compatibility

```typescript
export { OrderServiceClient, orderServiceClient,
         MintingServiceClient, mintingServiceClient,
         ServiceClientError, createRequestContext } from '@tickettoken/shared';

// Legacy aliases for backwards compatibility
export { ServiceClientError as OrderServiceError } from '@tickettoken/shared';
```

**Assessment:** Clean delegation to shared library. Legacy error aliases maintained for compatibility.

---

## 10. COMPARISON WITH PREVIOUS AUDITS

| Metric | Auth-Service | Venue-Service | Event-Service | Ticket-Service |
|--------|--------------|---------------|---------------|----------------|
| **S2S Auth Method** | HMAC-SHA256 | HMAC-SHA256 | HMAC-SHA256 | HMAC-SHA256 |
| **Uses @tickettoken/shared** | Yes | Yes | Yes | Yes |
| **Replay Protection** | Yes (60s) | Yes (60s) | Yes (60s) | Yes (60s) |
| **Service Boundaries** | ✅ Clean | ✅ Clean | ⚠️ Some issues | ❌ Major issues |
| **Cross-service Queries** | 0 | 0 | ~3 | 15+ |
| **Critical Issues** | 0 | 0 | 1 | 3 |
| **High Priority Issues** | 1 | 1 | 2 | 3 |
| **Feature Flag Bypass** | No | No | Unknown | ⚠️ Yes |

---

## FINAL SUMMARY

### CRITICAL ISSUES (3)

1. **Service Boundary Violations (15+ locations)**
   - ticket-service directly queries `orders`, `events`, `venues`, `users` tables
   - Violates microservice data ownership principles
   - Risk: Schema changes in other services can break ticket-service
   - Files: mintWorker.ts, orders.controller.ts, Order.ts, refundHandler.ts, paymentEventHandler.ts, transferService.ts, internalRoutes.ts

2. **HMAC Feature Flag Bypass**
   - Location: `src/middleware/internal-auth.middleware.ts:65-68`
   - When `USE_NEW_HMAC=false`, no authentication occurs
   - Risk: Misconfiguration allows unauthenticated internal requests

3. **Transfer Service Duplication**
   - Both ticket-service and transfer-service implement transfer logic
   - ticket-service has complete implementation with database table
   - Risk: Data inconsistency, maintenance burden

### HIGH PRIORITY (3)

1. **Unimplemented Endpoints**
   - POST /purchase/confirm returns 501
   - DELETE /purchase/:reservationId returns 501
   - Routes registered but controllers not implemented

2. **~140 `any` Type Usages**
   - Reduces type safety and IDE assistance
   - Risk: Runtime type errors
   - Models and utils contribute additional ~27 occurrences

3. **Cross-Service Foreign Keys**
   - Migration creates FKs to events, venues, users tables
   - Tight coupling at database level

### MEDIUM PRIORITY (2)

1. **2 TODO Comments**
   - Incomplete features in purchaseRoutes.ts

2. **MintWorker NFT Mocking**
   - NFT minting is currently mocked (simulated)
   - Production readiness unclear

### CODE QUALITY

**Positive:**
- Well-structured saga pattern with proper compensation
- Comprehensive state machine with RBAC and validation
- HMAC authentication using shared library
- RLS on 25 tables with proper policies
- **Enterprise-grade observability:** OpenTelemetry tracing (654 lines), Prometheus metrics (860 lines)
- **Comprehensive resilience:** Circuit breakers, bulkhead, retry with jitter (921 lines)
- **Security utilities:** XSS prevention, ReDoS protection, attack detection, PII sanitization
- **Safe migrations:** CONCURRENTLY support, idempotent operations
- **Multi-tenancy support:** Transaction-scoped tenant context, RLS verification
- **Input validation:** Zod schemas with prototype pollution prevention, Unicode normalization

**Negative:**
- Extensive service boundary violations (15+ locations)
- High `any` usage reduces type safety (~140 occurrences)
- Order model duplicates order-service functionality

---

**Files Analyzed:** 50+
**Critical Issues:** 3
**High Priority:** 3
**Medium Priority:** 2

**Assessment:** Ticket-service has solid internal architecture (saga pattern, state machine, blockchain integration) and **excellent utility infrastructure** (observability, resilience, security) but suffers from significant service boundary violations that undermine microservice principles. The direct database queries to other services' tables (orders, events, venues, users) should be replaced with internal API calls using the shared HTTP clients. The HMAC bypass feature flag should be removed or protected.

**Notable Strengths (Follow-up Audit):**
- Utilities layer demonstrates enterprise-grade quality (3,500+ lines of infrastructure code)
- Security-first approach with comprehensive attack detection and prevention
- Observability tooling rivals commercial APM solutions
- Migration helpers prevent common production deployment issues

---

*Report generated by Claude Opus 4.5*
*Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>*
