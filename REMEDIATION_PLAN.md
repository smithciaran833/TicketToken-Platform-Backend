# TicketToken Platform - Complete Remediation Plan

This document provides a comprehensive, step-by-step remediation plan for all identified issues in the TicketToken Platform codebase. Follow each section in sequence.

---

## Table of Contents

1. [Phase 1: Shared Infrastructure Setup](#phase-1-shared-infrastructure-setup)
2. [Phase 2: Row Level Security (RLS) Implementation](#phase-2-row-level-security-rls-implementation)
3. [Phase 3: Internal API Creation](#phase-3-internal-api-creation)
4. [Phase 4: Service Client Implementation](#phase-4-service-client-implementation)
5. [Phase 5: Database Bypass Refactoring](#phase-5-database-bypass-refactoring)
6. [Phase 6: Missing Migrations](#phase-6-missing-migrations)
7. [Phase 7: Duplicate Logic Consolidation](#phase-7-duplicate-logic-consolidation)
8. [Verification Checklist](#verification-checklist)

---

## Phase 1: Shared Infrastructure Setup

Before fixing individual services, create shared infrastructure that all services will use.

### 1.1 Create Shared Database Package

**Location:** `packages/shared-db/`

**Tasks:**
- [ ] Create a new shared package at `packages/shared-db/`
- [ ] Move `update_updated_at_column()` function to shared migration
- [ ] Move `audit_trigger_function()` to shared migration
- [ ] Create shared RLS helper functions
- [ ] Define standard tenant context setting name: `app.current_tenant_id`
- [ ] Create migration runner that ensures shared migrations run first

**Files to create:**
```
packages/shared-db/
├── package.json
├── tsconfig.json
├── src/
│   ├── migrations/
│   │   ├── 000_shared_extensions.ts      # uuid-ossp, etc.
│   │   ├── 001_shared_functions.ts       # update_updated_at_column, audit_trigger_function
│   │   └── 002_shared_rls_helpers.ts     # RLS helper functions
│   ├── utils/
│   │   ├── rls-context.ts                # Functions to set tenant context
│   │   └── migration-helpers.ts          # Helper functions for migrations
│   └── index.ts
└── README.md
```

### 1.2 Create Shared HTTP Client Package

**Location:** `packages/http-client/`

**Tasks:**
- [ ] Create standardized HTTP client with circuit breaker
- [ ] Implement retry logic with exponential backoff
- [ ] Add request/response logging
- [ ] Add distributed tracing support
- [ ] Create base service client class that all clients extend

**Files to create:**
```
packages/http-client/
├── package.json
├── tsconfig.json
├── src/
│   ├── client.ts                         # Base HTTP client with circuit breaker
│   ├── circuit-breaker.ts                # Circuit breaker implementation
│   ├── retry.ts                          # Retry logic
│   ├── interceptors/
│   │   ├── auth.interceptor.ts           # Service-to-service auth
│   │   ├── tracing.interceptor.ts        # Distributed tracing
│   │   └── logging.interceptor.ts        # Request/response logging
│   └── index.ts
└── README.md
```

### 1.3 Standardize Service-to-Service Authentication

**Tasks:**
- [ ] Define internal API authentication scheme (JWT or API key)
- [ ] Create `internal-auth.middleware.ts` template for all services
- [ ] Document the authentication flow

---

## Phase 2: Row Level Security (RLS) Implementation

### 2.1 Payment-Service RLS

**Migration file to create:** `backend/services/payment-service/src/migrations/007_add_rls_policies.ts`

**Tables requiring RLS policies (60+ tables):**

**Core Payment Tables:**
- [ ] `payment_transactions` - Add RLS based on `tenant_id`
- [ ] `venue_balances` - Add RLS based on `venue_id → tenant_id` relationship
- [ ] `payment_refunds` - Add RLS based on `tenant_id`
- [ ] `payment_intents` - Add RLS based on `tenant_id`

**Royalty System Tables:**
- [ ] `venue_royalty_settings` - Add RLS
- [ ] `event_royalty_settings` - Add RLS
- [ ] `royalty_distributions` - Add RLS
- [ ] `royalty_payouts` - Add RLS
- [ ] `royalty_reconciliation_runs` - Add RLS
- [ ] `royalty_discrepancies` - Add RLS

**Group Payment Tables:**
- [ ] `group_payments` - Add RLS
- [ ] `group_payment_members` - Add RLS
- [ ] `reminder_history` - Add RLS

**Tax & Compliance Tables:**
- [ ] `tax_collections` - Add RLS
- [ ] `tax_forms_1099da` - Add RLS
- [ ] `user_tax_info` - Add RLS

**Fraud Detection Tables:**
- [ ] `fraud_checks` - Add RLS
- [ ] `device_activity` - Add RLS
- [ ] `bot_detections` - Add RLS
- [ ] `known_scalpers` - Add RLS
- [ ] `ip_reputation` - Add RLS (may be shared across tenants, consider carefully)
- [ ] `behavioral_analytics` - Add RLS
- [ ] `velocity_limits` - Add RLS
- [ ] `velocity_records` - Add RLS
- [ ] `fraud_rules` - Add RLS
- [ ] `fraud_review_queue` - Add RLS
- [ ] `card_fingerprints` - Add RLS
- [ ] `ml_fraud_models` - Add RLS
- [ ] `ml_fraud_predictions` - Add RLS
- [ ] `account_takeover_signals` - Add RLS
- [ ] `scalper_reports` - Add RLS

**AML Tables:**
- [ ] `aml_checks` - Add RLS
- [ ] `sanctions_list_matches` - Add RLS
- [ ] `pep_database` - Add RLS
- [ ] `suspicious_activity_reports` - Add RLS

**High-Demand Tables:**
- [ ] `waiting_room_activity` - Add RLS
- [ ] `event_purchase_limits` - Add RLS

**Marketplace/Escrow Tables:**
- [ ] `payment_escrows` - Add RLS
- [ ] `escrow_release_conditions` - Add RLS
- [ ] `venue_price_rules` - Add RLS
- [ ] `resale_listings` - Add RLS

**Chargeback/Reserve Tables:**
- [ ] `payment_reserves` - Add RLS

**Inventory/Notification Tables:**
- [ ] `inventory_reservations` - Add RLS
- [ ] `payment_notifications` - Add RLS

**NFT/Blockchain Tables:**
- [ ] `nft_mint_queue` - Add RLS

**Event Sourcing Tables:**
- [ ] `outbox_dlq` - Add RLS
- [ ] `payment_event_sequence` - Add RLS
- [ ] `payment_state_transitions` - Add RLS

**Webhook Tables:**
- [ ] `webhook_inbox` - Add RLS
- [ ] `webhook_events` - Add RLS

**Other Tables:**
- [ ] `payment_idempotency` - Add RLS
- [ ] `reconciliation_reports` - Add RLS
- [ ] `settlement_batches` - Add RLS
- [ ] `payment_retries` - Add RLS
- [ ] `payment_chargebacks` - Add RLS
- [ ] `payment_attempts` - Add RLS
- [ ] `purchase_limit_violations` - Add RLS
- [ ] `outbound_webhooks` - Add RLS

**RLS Policy Template:**
```sql
-- Enable RLS
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY <table_name>_tenant_isolation ON <table_name>
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

### 2.2 Notification-Service RLS

**Migration file to create:** `backend/services/notification-service/src/migrations/002_add_rls_policies.ts`

**Tables requiring RLS policies (32 tables):**

- [ ] `scheduled_notifications` - Add RLS based on `tenant_id`
- [ ] `notification_history` - Add RLS based on `venue_id → tenant_id`
- [ ] `consent_records` - Add RLS
- [ ] `suppression_list` - Add RLS
- [ ] `notification_preferences` - Add RLS (join to users for tenant)
- [ ] `notification_preference_history` - Add RLS
- [ ] `notification_delivery_stats` - Add RLS
- [ ] `notification_tracking` - Add RLS based on `tenant_id`
- [ ] `notification_analytics` - Add RLS
- [ ] `notification_engagement` - Add RLS
- [ ] `notification_clicks` - Add RLS
- [ ] `notification_templates` - Add RLS
- [ ] `notification_campaigns` - Add RLS
- [ ] `audience_segments` - Add RLS
- [ ] `email_automation_triggers` - Add RLS
- [ ] `ab_tests` - Add RLS
- [ ] `ab_test_variants` - Add RLS
- [ ] `ab_test_metrics` - Add RLS based on `tenant_id`
- [ ] `automation_executions` - Add RLS based on `tenant_id`
- [ ] `bounces` - Add RLS based on `tenant_id`
- [ ] `campaign_stats` - Add RLS based on `tenant_id`
- [ ] `engagement_events` - Add RLS based on `tenant_id`
- [ ] `notification_analytics_daily` - Add RLS based on `tenant_id`
- [ ] `pending_deletions` - Add RLS based on `tenant_id`
- [ ] `template_usage` - Add RLS based on `tenant_id`
- [ ] `template_versions` - Add RLS based on `tenant_id`
- [ ] `translations` - Add RLS based on `tenant_id`
- [ ] `venue_health_scores` - Add RLS based on `tenant_id`
- [ ] `abandoned_carts` - Add RLS
- [ ] `venue_notification_settings` - Add RLS
- [ ] `notification_costs` - Add RLS

### 2.3 Ticket-Service RLS

**Migration file:** Check existing and add missing policies

**Tables requiring RLS (~20 tables per audit):**
- [ ] `ticket_types` - Verify/add RLS
- [ ] `reservations` - Verify/add RLS
- [ ] `ticket_validations` - Verify/add RLS
- [ ] `refunds` - Verify/add RLS
- [ ] `waitlist` - Verify/add RLS
- [ ] `ticket_price_history` - Verify/add RLS
- [ ] `ticket_holds` - Verify/add RLS
- [ ] `ticket_bundles` - Verify/add RLS
- [ ] `ticket_bundle_items` - Verify/add RLS
- [ ] `ticket_audit_log` - Verify/add RLS
- [ ] `ticket_notifications` - Verify/add RLS
- [ ] `discounts` - Verify/add RLS
- [ ] `order_discounts` - Verify/add RLS
- [ ] `outbox` - Verify/add RLS
- [ ] `reservation_history` - Verify/add RLS
- [ ] `webhook_nonces` - Verify/add RLS
- [ ] `tenant_access_violations` - Verify/add RLS
- [ ] `account_lockout_events` - Verify/add RLS
- [ ] `multisig_approvals` - Verify/add RLS
- [ ] `multisig_rejections` - Verify/add RLS

### 2.4 Venue-Service RLS

**Tables requiring RLS (~17 tables per audit):**
- [ ] `venue_staff` - Verify/add RLS
- [ ] `venue_layouts` - Verify/add RLS
- [ ] `venue_branding` - Verify/add RLS
- [ ] `custom_domains` - Verify/add RLS
- [ ] `white_label_pricing` - Verify/add RLS
- [ ] `venue_tier_history` - Verify/add RLS
- [ ] `api_keys` - Verify/add RLS
- [ ] `user_venue_roles` - Verify/add RLS
- [ ] `external_verifications` - Verify/add RLS
- [ ] `manual_review_queue` - Verify/add RLS
- [ ] `notifications` - Verify/add RLS
- [ ] `email_queue` - Verify/add RLS
- [ ] `venue_compliance_reviews` - Verify/add RLS
- [ ] `venue_compliance` - Verify/add RLS
- [ ] `venue_compliance_reports` - Verify/add RLS
- [ ] `venue_documents` - Verify/add RLS
- [ ] `webhook_events` - Verify/add RLS

### 2.5 Other Services

**Compliance-Service:** Check `001_baseline.ts` - add RLS to all 15 tables
**File-Service:** Check baseline - add RLS to all 4 tables
**Blockchain-Service:** Check existing RLS, ensure consistency
**Transfer-Service:** Check existing RLS, ensure consistency
**Minting-Service:** Check existing RLS, ensure consistency

### 2.6 Standardize RLS Setting Name

**Tasks:**
- [ ] Audit all migrations for RLS setting names used
- [ ] Standardize on `app.current_tenant_id` everywhere
- [ ] Update any code that sets context to use consistent name
- [ ] Create migration to add/update RLS policies with consistent name

**Settings found in codebase:**
| Setting Name | Services Using |
|-------------|----------------|
| `app.current_tenant` | queue, scanning, monitoring, search, analytics, integration |
| `app.current_tenant_id` | blockchain, minting, marketplace, auth |
| `app.tenant_id` | ticket-service, file-service |

---

## Phase 3: Internal API Creation

### 3.1 Ticket-Service Internal APIs

**File to create/modify:** `backend/services/ticket-service/src/routes/internal.routes.ts`

**Endpoints to create:**

#### `GET /internal/tickets/by-token/:tokenId`
- [ ] Create endpoint
- [ ] Query `tickets` table by `token_id`
- [ ] Return: `{ ticketId, eventId, userId, status, mintAddress, ... }`
- [ ] Used by: blockchain-indexer for token lookups

#### `GET /internal/orders/:orderId/tickets`
- [ ] Create endpoint
- [ ] Query `tickets` table by `order_id`
- [ ] Return: `{ tickets: [...], count }`
- [ ] Used by: payment-service for refund calculations

#### `POST /internal/tickets/:ticketId/transfer`
- [ ] Create endpoint
- [ ] Accept: `{ newOwnerId, transferId, fromUserId }`
- [ ] Execute ownership transfer atomically
- [ ] Update `tickets.user_id`
- [ ] Create audit trail
- [ ] Return: `{ success, ticket }`
- [ ] Used by: transfer-service

#### `GET /internal/users/:userId/events-attended`
- [ ] Create endpoint
- [ ] Count distinct `event_id` from tickets where `status = 'used'`
- [ ] Return: `{ count, events: [...] }`
- [ ] Used by: auth-service for user profile

#### `POST /internal/tickets/update-mint-status`
- [ ] Create endpoint
- [ ] Accept: `{ ticketId, mintAddress, transactionSignature, status }`
- [ ] Update ticket NFT fields
- [ ] Return: `{ success }`
- [ ] Used by: blockchain-service, minting-service

#### `GET /internal/tickets/:ticketId/full`
- [ ] Create endpoint
- [ ] Return full ticket details including event info
- [ ] Return: `{ ticket, event, ticketType }`
- [ ] Used by: blockchain-service for minting metadata

### 3.2 Auth-Service Internal APIs

**File to create/modify:** `backend/services/auth-service/src/routes/internal.routes.ts`

**Endpoints to create:**

#### `GET /internal/users/:userId`
- [ ] Create endpoint
- [ ] Return basic user info (non-sensitive)
- [ ] Return: `{ id, email, firstName, lastName, status, ... }`
- [ ] Used by: payment-service

#### `GET /internal/users/by-email/:email`
- [ ] Create endpoint
- [ ] Lookup user by email
- [ ] Return: `{ user }` or 404
- [ ] Used by: transfer-service

#### `POST /internal/users/find-or-create`
- [ ] Create endpoint
- [ ] Accept: `{ email, firstName?, lastName? }`
- [ ] Find existing user or create new pending user
- [ ] Return: `{ user, created: boolean }`
- [ ] Used by: transfer-service (replaces direct INSERT)

#### `GET /internal/users/admins`
- [ ] Create endpoint
- [ ] Accept query: `?tenantId=...`
- [ ] Return admin users for tenant
- [ ] Return: `{ admins: [...] }`
- [ ] Used by: compliance-service

#### `POST /internal/users/:userId/update-aggregates`
- [ ] Create endpoint
- [ ] Accept: `{ totalSpent?, eventsAttended?, lifetimeValue? }`
- [ ] Update user aggregate fields
- [ ] Return: `{ success }`
- [ ] Used by: payment-service (replaces direct trigger)

### 3.3 Order-Service Internal APIs

**File to create/modify:** `backend/services/order-service/src/routes/internal.routes.ts`

**Endpoints to create:**

#### `GET /internal/orders/:orderId`
- [ ] Create endpoint
- [ ] Return full order details
- [ ] Return: `{ order, items, user, event }`
- [ ] Used by: payment-service

#### `GET /internal/orders/:orderId/items`
- [ ] Create endpoint
- [ ] Return order items only
- [ ] Return: `{ items: [...] }`
- [ ] Used by: blockchain-service for minting

#### `POST /internal/orders/:orderId/update-status`
- [ ] Create endpoint
- [ ] Accept: `{ status, reason? }`
- [ ] Update order status with validation
- [ ] Return: `{ success, order }`
- [ ] Used by: payment-service reconciliation

### 3.4 Event-Service Internal APIs

**File to modify:** `backend/services/event-service/src/routes/internal.routes.ts`

**Changes needed:**

#### Extend `GET /api/v1/events/:eventId`
- [ ] Add `event_pda` to response (for blockchain)
- [ ] Add `venue.wallet_address` to response (for minting)
- [ ] Optionally create dedicated internal endpoint

#### `GET /internal/events/:eventId/full`
- [ ] Create endpoint
- [ ] Return event with venue details
- [ ] Include `event_pda`, `venue.wallet_address`
- [ ] Return: `{ event, venue, ticketTypes }`
- [ ] Used by: minting-service, blockchain-service

### 3.5 Venue-Service Internal APIs

**File to create/modify:** `backend/services/venue-service/src/routes/internal.routes.ts`

**Endpoints to create:**

#### `GET /internal/venues/:venueId`
- [ ] Create/modify endpoint
- [ ] Include `wallet_address` in response
- [ ] Return: `{ venue, walletAddress, royaltySettings }`
- [ ] Used by: blockchain-service

#### `GET /internal/venues/:venueId/royalty-wallet`
- [ ] Create endpoint
- [ ] Return venue's royalty wallet address
- [ ] Check `venue_marketplace_settings` then `venues`
- [ ] Return: `{ walletAddress, source }`
- [ ] Used by: blockchain-service mint-worker

---

## Phase 4: Service Client Implementation

### 4.1 Create Base Client

**File:** `packages/http-client/src/base-service-client.ts`

**Features:**
- [ ] Circuit breaker pattern
- [ ] Retry with exponential backoff
- [ ] Request timeout configuration
- [ ] Service-to-service authentication
- [ ] Distributed tracing propagation
- [ ] Error standardization

### 4.2 Ticket-Service Client

**File to create:** Each consuming service needs `src/clients/ticket-service.client.ts`

**Services needing this client:**
- [ ] payment-service
- [ ] blockchain-service
- [ ] blockchain-indexer
- [ ] transfer-service
- [ ] minting-service
- [ ] scanning-service
- [ ] auth-service

**Methods to implement:**
```typescript
class TicketServiceClient {
  getTicketByTokenId(tokenId: string): Promise<Ticket>
  getTicketsByOrderId(orderId: string): Promise<Ticket[]>
  transferTicket(ticketId: string, data: TransferData): Promise<TransferResult>
  getUserEventsAttended(userId: string): Promise<EventsAttendedResult>
  updateMintStatus(ticketId: string, data: MintStatusData): Promise<void>
  getTicketFull(ticketId: string): Promise<FullTicketData>
}
```

### 4.3 Auth-Service Client

**Services needing this client:**
- [ ] payment-service
- [ ] transfer-service
- [ ] compliance-service

**Methods to implement:**
```typescript
class AuthServiceClient {
  getUserById(userId: string): Promise<User>
  getUserByEmail(email: string): Promise<User | null>
  findOrCreateUser(data: CreateUserData): Promise<{ user: User, created: boolean }>
  getAdminUsers(tenantId: string): Promise<User[]>
  updateUserAggregates(userId: string, data: AggregateData): Promise<void>
}
```

### 4.4 Order-Service Client

**Services needing this client:**
- [ ] payment-service
- [ ] blockchain-service

**Methods to implement:**
```typescript
class OrderServiceClient {
  getOrderById(orderId: string): Promise<Order>
  getOrderItems(orderId: string): Promise<OrderItem[]>
  updateOrderStatus(orderId: string, status: string): Promise<void>
}
```

### 4.5 Event-Service Client

**Services needing this client:**
- [ ] minting-service
- [ ] scanning-service
- [ ] payment-service

**Methods to implement:**
```typescript
class EventServiceClient {
  getEventFull(eventId: string): Promise<EventWithVenue>
  getEventPda(eventId: string): Promise<string>
}
```

### 4.6 Venue-Service Client

**Services needing this client:**
- [ ] blockchain-service
- [ ] compliance-service
- [ ] payment-service

**Methods to implement:**
```typescript
class VenueServiceClient {
  getVenueById(venueId: string): Promise<Venue>
  getVenueWalletAddress(venueId: string): Promise<string | null>
}
```

---

## Phase 5: Database Bypass Refactoring

### 5.1 Payment-Service Refactoring

#### `controllers/refundController.ts`

**Current violations:**
- Line 201-207: `getRefundableInfo` joins `payment_intents` with `orders`
- Line 261-272: `calculateTicketRefundAmount` joins `tickets`, `orders`
- Line 545-560: `createTicketRefund` joins `tickets`, `orders`

**Refactoring tasks:**
- [ ] Replace order lookup with `OrderServiceClient.getOrderById()`
- [ ] Replace ticket lookup with `TicketServiceClient.getTicketsByOrderId()`
- [ ] Replace ticket status update with `TicketServiceClient.updateTicketStatus()`

#### `services/refund-policy.service.ts`

**Current violations:**
- Line 55-68: Triple JOIN on `tickets`, `events`, `venues`
- Line 176-178: Direct `UPDATE venues`

**Refactoring tasks:**
- [ ] Replace ticket lookup with `TicketServiceClient.getTicketFull()`
- [ ] Replace venue update with `VenueServiceClient.updateRefundPolicy()`
- [ ] Get event info via `EventServiceClient.getEventFull()`

#### `services/reconciliation/reconciliation-service.ts`

**Current violations:**
- Line 56-62: `SELECT FROM orders LEFT JOIN tickets`
- Line 165-171: `SELECT FROM orders LEFT JOIN payment_intents`
- Line 176-179: `UPDATE orders`
- Line 234-237: `SELECT FROM tickets`

**Refactoring tasks:**
- [ ] Replace order queries with `OrderServiceClient.getOrderById()`
- [ ] Replace order updates with `OrderServiceClient.updateOrderStatus()`
- [ ] Replace ticket queries with `TicketServiceClient.getTicketsByOrderId()`
- [ ] Keep `payment_intents` queries (owned by payment-service)

### 5.2 Blockchain-Service Refactoring

#### `queues/mintQueue.ts`

**Current violations:**
- Line 329-341: `UPDATE tickets SET status`
- Line 367-379: `UPDATE tickets SET is_minted, token_id, ...`

**Refactoring tasks:**
- [ ] Replace ticket status update with `TicketServiceClient.updateMintStatus()`
- [ ] Keep `blockchain_transactions` queries (owned by blockchain-service)

#### `workers/mint-worker.ts`

**Current violations:**
- Line 143-149: `SELECT wallet_address FROM venues`
- Line 171-180: 5-table JOIN across 4 services
- Line 247-254: `UPDATE tickets`

**Refactoring tasks:**
- [ ] Replace venue wallet lookup with `VenueServiceClient.getVenueWalletAddress()`
- [ ] Replace ticket/event/venue query with:
  - `TicketServiceClient.getTicketFull()` (returns ticket + event + venue info)
  - OR multiple client calls
- [ ] Replace ticket update with `TicketServiceClient.updateMintStatus()`

### 5.3 Transfer-Service Refactoring

#### `services/transfer.service.ts`

**Current violations:**
- Line 156-163: `SELECT FROM tickets FOR UPDATE`
- Line 165-175: `SELECT FROM ticket_types`
- Line 177-192: `SELECT FROM users` + `INSERT INTO users`
- Line 116-117: `UPDATE tickets SET user_id`

**Refactoring tasks:**
- [ ] Replace ticket lookup with `TicketServiceClient.getTicketForTransfer()`
- [ ] Replace ticket type lookup with `TicketServiceClient.getTicketType()`
- [ ] Replace user lookup/create with `AuthServiceClient.findOrCreateUser()`
- [ ] Replace ticket ownership update with `TicketServiceClient.transferTicket()`
- [ ] Ensure atomicity through saga pattern or 2PC if needed

### 5.4 Monitoring-Service Refactoring

#### `collectors/business/revenue.collector.ts`

**Current violations:**
- Line 35-39: `SELECT FROM venues`
- Line 56-61: `SELECT FROM events`
- Line 74-79: `SELECT FROM tickets`

**Refactoring tasks:**
- [ ] Replace venue metrics with `VenueServiceClient.getVenueMetrics()`
- [ ] Replace event metrics with `EventServiceClient.getEventMetrics()`
- [ ] Replace ticket metrics with `TicketServiceClient.getTicketMetrics()`
- [ ] Consider creating dedicated metrics endpoints on each service
- [ ] Alternative: Allow read-replica access for analytics (documented exception)

### 5.5 Auth-Service Refactoring

#### `migrations/001_auth_baseline.ts` - `backfill_user_aggregates()`

**Current violations:**
- Line 69-80: Queries `payment_transactions` and `tickets` tables

**Refactoring tasks:**
- [ ] Replace function with scheduled job that calls service APIs
- [ ] Create `PaymentServiceClient.getUserTotalSpent()`
- [ ] Create `TicketServiceClient.getUserEventsAttended()`
- [ ] Run job during off-peak hours

---

## Phase 6: Missing Migrations

### 6.1 Order-Service Missing Tables

**File to create/verify:** `backend/services/order-service/src/migrations/00X_add_missing_tables.ts`

Tables to verify/create:
- [ ] `payments` - verify if this is `order_payments` or should be created
- [ ] `refunds` - verify if this is `order_refunds` or should be created
- [ ] `transfers` - verify if separate from `ticket_transfers`
- [ ] `escrow_accounts` - verify if exists or needs creation
- [ ] `disputes` - verify if this is `order_disputes` or separate
- [ ] `payouts` - verify location and create if needed
- [ ] `inventory` - verify if separate from tickets table

### 6.2 Payment-Service Missing Tables

**Verify existing migration 006:**
- [ ] `payments` vs `payment_transactions` - clarify naming
- [ ] `refunds` vs `payment_refunds` - clarify naming
- [ ] `transfers` vs `stripe_transfers` - clarify naming
- [ ] `escrow_accounts` vs `payment_escrows` - clarify naming

### 6.3 Marketplace-Service Missing Tables

**Verify/reconcile table names:**
- [ ] `listings` vs `marketplace_listings`
- [ ] `transfers` vs `marketplace_transfers`
- [ ] `fees` vs `platform_fees`
- [ ] `venue_settings` vs `venue_marketplace_settings`

### 6.4 Venue-Service Missing Tables

**Conditional tables to verify:**
- [ ] `venue_compliance` - verify creation logic
- [ ] `venue_documents` - verify creation logic

### 6.5 Transfer-Service Missing Tables

**Tables to verify/create:**
- [ ] `blockchain_transfers` - verify if needed
- [ ] `transfer_audit_log` - verify if needed

### 6.6 Blockchain-Service Missing Tables

**Tables to verify:**
- [ ] `wallets` - referenced in CHECK constraints
- [ ] `nft_mints` - verify if created by minting-service

### 6.7 Event-Service Missing Tables

**Tables to verify:**
- [ ] `event_pricing_tiers` - verify if exists or is orphan code

---

## Phase 7: Duplicate Logic Consolidation

### 7.1 Consolidate `update_updated_at_column()`

**Tasks:**
- [ ] Create shared migration in `packages/shared-db`
- [ ] Update all services to depend on shared package
- [ ] Remove duplicate function creation from:
  - `backend/services/auth-service/src/migrations/001_auth_baseline.ts`
  - `backend/services/payment-service/src/migrations/001_baseline_payment.ts`
  - `backend/services/notification-service/src/migrations/001_baseline_notification_schema.ts`
  - `backend/services/venue-service/src/migrations/001_baseline.ts`
  - `backend/services/event-service/src/migrations/001_baseline.ts`
  - `backend/services/order-service/src/migrations/001_baseline.ts`
  - `backend/services/transfer-service/src/migrations/001_baseline_transfer.ts`
  - `backend/services/monitoring-service/src/migrations/001_baseline.ts`

### 7.2 Consolidate `audit_trigger_function()`

**Tasks:**
- [ ] Move to shared migration
- [ ] Ensure auth-service migration runs first (dependency)
- [ ] Remove creation from auth-service baseline (move to shared)
- [ ] Update other services to use shared function

### 7.3 Consolidate Ticket Transfer Logic

**Decision needed:** Choose one service as source of truth

**Option A: Keep in ticket-service**
- [ ] Migrate transfer-service's `ticket_transactions` data to ticket-service
- [ ] Update transfer-service to call ticket-service APIs
- [ ] Keep batch transfer logic in transfer-service but execute via ticket-service

**Option B: Keep in transfer-service**
- [ ] Migrate ticket-service's `ticket_transfers` table to transfer-service
- [ ] Update ticket-service to not handle transfers
- [ ] Transfer-service owns all transfer logic

**Recommended: Option A** - ticket-service owns tickets and their transfers

---

## Verification Checklist

### RLS Verification
```bash
# For each service, run:
grep -r "ENABLE ROW LEVEL SECURITY" backend/services/*/src/migrations --include="*.ts" | wc -l
grep -r "FORCE ROW LEVEL SECURITY" backend/services/*/src/migrations --include="*.ts" | wc -l

# Verify consistent setting name:
grep -r "app.current_tenant" backend/services/*/src/migrations --include="*.ts"
```

### Cross-Service Query Verification
```bash
# Should return 0 results after refactoring:
grep -r "FROM tickets" backend/services/*/src --include="*.ts" | grep -v ticket-service
grep -r "FROM events" backend/services/*/src --include="*.ts" | grep -v event-service
grep -r "FROM venues" backend/services/*/src --include="*.ts" | grep -v venue-service
grep -r "FROM orders" backend/services/*/src --include="*.ts" | grep -v order-service
grep -r "FROM users" backend/services/*/src --include="*.ts" | grep -v auth-service
```

### Client Implementation Verification
```bash
# Each consuming service should have clients directory:
ls -la backend/services/payment-service/src/clients/
ls -la backend/services/blockchain-service/src/clients/
ls -la backend/services/transfer-service/src/clients/
# etc.
```

### Internal API Verification
```bash
# Check internal routes exist:
ls -la backend/services/*/src/routes/internal*.ts
```

---

## Estimated Timeline

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Shared Infrastructure | 3-4 days |
| Phase 2 | RLS Implementation | 5-7 days |
| Phase 3 | Internal API Creation | 3-5 days |
| Phase 4 | Service Client Implementation | 3-5 days |
| Phase 5 | Database Bypass Refactoring | 5-7 days |
| Phase 6 | Missing Migrations | 2-3 days |
| Phase 7 | Duplicate Logic Consolidation | 2-3 days |
| **Total** | | **~25-34 days** |

---

## Notes

1. **Testing**: Each phase should include unit tests for new code and integration tests for service communication
2. **Database Migrations**: Run in staging environment first, verify RLS doesn't break existing functionality
3. **Rollback Plan**: Keep old code paths available behind feature flags during transition
4. **Monitoring**: Add metrics to track service client health after migration
5. **Documentation**: Update API docs as internal endpoints are created
