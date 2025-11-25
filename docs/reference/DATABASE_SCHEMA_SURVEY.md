# Database Schema Survey - TicketToken Platform

**Date:** November 19, 2025  
**Total Tables:** 157  
**Total Services:** 19 (excluding api-gateway & order-service)  
**Missing Migrations:** order-service (needs creation)

---

## Migrations Architecture

**Location:** TypeScript migrations in each service's `src/migrations/` directory  
**Migration Tool:** Knex.js  
**Format:** TypeScript files with `up()` and `down()` functions

**Example Path:** `backend/services/auth-service/src/migrations/001_auth_baseline.ts`

**Centralized SQL Migrations:** Only 4 services use `database/postgresql/migrations/`:
- notification-service
- monitoring-service  
- scanning-service
- transfer-service

---

## Standard Naming Conventions (Extracted from Auth Service)

### Column Naming
✅ **snake_case** for all columns:
- `email`, `first_name`, `last_name`
- `created_at`, `updated_at`, `deleted_at`
- `is_active`, `email_verified`
- `two_factor_enabled`, `mfa_enabled`

### Primary Keys
✅ **UUID** type for all IDs:
```typescript
table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
// OR for user IDs specifically:
table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'))
```

### Timestamps
✅ **With Timezone:**
```typescript
table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
table.timestamp('deleted_at', { useTz: true }) // Soft delete
```

### Foreign Keys
✅ **Standard pattern:**
```typescript
table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
```

### Boolean Fields
✅ **Prefix with `is_` for state, but not always:**
- `is_active`, `is_deleted` (state)
- `email_verified`, `phone_verified` (past participle)
- `two_factor_enabled`, `mfa_enabled` (capability)

### JSONB Fields
✅ **Used for flexible data:**
```typescript
table.jsonb('metadata').defaultTo('{}')
table.jsonb('preferences').defaultTo('{}')
table.jsonb('permissions').defaultTo('[]')
```

### Status/Enum Fields
✅ **TEXT with CHECK constraints:**
```typescript
table.text('status').defaultTo('PENDING')
// With constraint:
await knex.raw("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'))");
```

---

## Common Patterns

### Auto-Update Triggers
Every service creates `update_updated_at_column()` function:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';
```

### Standard Indexes
- Primary columns (email, username, phone)
- Foreign keys (user_id, venue_id, tenant_id)
- Timestamps (created_at for queries, deleted_at for soft deletes)
- Status fields (for filtering)

### GIN Indexes for JSONB
```typescript
await knex.raw('CREATE INDEX idx_users_metadata_gin ON users USING gin(metadata)');
```

### Full-Text Search
```typescript
CREATE INDEX idx_users_search ON users USING gin(
  to_tsvector('english', COALESCE(username, '') || ' ' || COALESCE(display_name, ''))
)
```

---

## Services Inventory

### Core Authentication
**auth-service** (10 tables)
- `tenants` - Multi-tenancy foundati on
- `users` - 66 columns! Comprehensive user model
- `user_sessions` - Session tracking
- `user_venue_roles` - Role-based access per venue
- `audit_logs` - Security audit trail
- `invalidated_tokens` - JWT blocklist
- `oauth_connections` - Social login
- `wallet_connections` - Web3 authentication
- `biometric_credentials` - Face/fingerprint auth
- `trusted_devices` - Device fingerprinting

**Functions:** 3 custom functions
**Triggers:** 3 triggers (referral code generation, count increment, updated_at)

### Payment & Finance
**payment-service** (27 tables) - 🔴 **LARGEST SERVICE**
- Payment transactions
- Refunds
- Escrows
- Tax collections
- Fraud detection
- Waiting room activity
- Groups payments
- Royalty distributions
- Idempotency handling
- Webhook management
- Settlement batches

### Compliance & Legal
**compliance-service** (15 tables)
- Venue verifications
- Tax records  
- OFAC checks
- Risk assessments
- Bank verifications
- Form 1099 records
- Anti-bot activities
- User blacklists

### Notifications
**notification-service** (13 tables)
- Notification history
- Templates
- Campaigns
- Delivery stats
- Analytics & engagement
- Consent records
- Suppression list
- Preferences

### Core Business Logic
**venue-service** (5 tables)
- Venues
- Venue staff
- Venue settings
- Venue integrations
- Venue layouts

**event-service** (7 tables)
- Events
- Event categories
- Event schedules
- Event capacity
- Event pricing
- Event metadata

**ticket-service** (9 tables)
- Tickets
- Ticket types
- Ticket validations
- Ticket transfers
- QR codes
- Reservations
- Ticket transactions

### Integration & Sync
**integration-service** (10 tables)
- Integrations (Stripe, Square, etc.)
- Connections
- Field mappings
- Webhooks
- Sync queue/logs
- Health tracking
- Cost tracking

### Marketplace & Trading
**marketplace-service** (6 tables)
- Marketplace listings
- Marketplace disputes
- Marketplace blacklist
- Price history
- Transfers
- Activity tracking

### Blockchain & NFTs
**blockchain-service** (6 tables)
- Wallet addresses
- User wallet connections
- Treasury wallets
- Blockchain events
- Blockchain transactions
- Mint jobs

**blockchain-indexer** (6 tables)
- Indexer state
- Indexed transactions
- Marketplace activity
- Reconciliation runs
- Ownership discrepancies
- Reconciliation log

**minting-service** (3 tables)
- Collections
- Mints
- NFTs

**transfer-service** (1 table)
- Ticket transactions (shared with ticket-service?)

### Supporting Services
**analytics-service** (6 tables)
- Analytics metrics
- Aggregations
- Alerts
- Dashboards
- Widgets
- Exports

**file-service** (4 tables)
- Files
- File access logs
- File versions
- Upload sessions

**queue-service** (4 tables)
- Queues
- Jobs
- Schedules
- Rate limits

**scanning-service** (6 tables)
- Scanner devices
- Scans
- Scan policies
- Offline validation cache

**search-service** (3 tables)
- Index versions
- Index queue
- Read consistency tokens

**monitoring-service** (7 tables)
- Alerts
- Alert rules
- Dashboards
- Metrics
- NFT mints/transfers
- Fraud events

---

## Critical Gap Identified

### ❌ order-service (0 tables)

**Status:** Migrations do NOT exist  
**Impact:** Cannot create orders, order_items, or order_discounts  
**Service Code:** EXISTS (in docker-compose.yml and backend)  
**Database Tables:** MISSING

**Expected Tables:**
1. `orders` - Main order record
2. `order_items` - Line items per order
3. `order_discounts` - Discounts applied to orders

**Required Fields (to be determined by examining payment-service and ticket-service):**
- Order totals (subtotal, tax, total)
- Order status (pending, completed, cancelled)
- User/tenant references
- Timestamps

---

## Next Steps

### Phase 1: Detailed Extraction (Priority Services)
1. ✅ **auth-service** - COMPLETE (10 tables documented)
2. **payment-service** - 27 tables (CRITICAL - revenue)
3. **venue-service** - 5 tables (core domain)
4. **event-service** - 7 tables (core domain)
5. **ticket-service** - 9 tables (core domain)
6. **order-service** - CREATE migrations (0 → 3 tables)

### Phase 2: Complete Reference
After Phase 1, create detailed schema for all remaining services.

### Phase 3: Naming Standards Document
Consolidate patterns into a coding standards guide for consistency.

---

## Migration File Locations

```
backend/services/
├── analytics-service/src/migrations/001_analytics_baseline.ts
├── auth-service/src/migrations/001_auth_baseline.ts ← REVIEWED
├── blockchain-service/src/migrations/001_baseline_blockchain_service.ts
├── blockchain-indexer/src/migrations/001_baseline_blockchain_indexer.ts
├── compliance-service/src/migrations/
│   ├── 001_baseline_compliance.ts
│   ├── 002_add_missing_tables.ts
│   ├── 003_add_tenant_isolation.ts
│   ├── 004_add_foreign_keys.ts
│   └── 005_add_phase5_6_tables.ts
├── event-service/src/migrations/001_baseline_event.ts
├── file-service/src/migrations/
│   ├── 001_baseline_files.ts
│   ├── 002_add_missing_tables.ts
│   └── 003_add_storage_quotas.ts
├── integration-service/src/migrations/
│   └── 001_baseline_integration.ts (recently fixed)
├── marketplace-service/src/migrations/001_baseline_marketplace.ts
├── minting-service/src/migrations/001_baseline_minting.ts
├── monitoring-service/src/migrations/001_baseline_monitoring_schema.ts
├── notification-service/src/migrations/001_baseline_notification_schema.ts
├── order-service/src/migrations/ ← MISSING!
├── payment-service/src/migrations/001_baseline_payment.ts
├── queue-service/src/migrations/001_baseline_queue.ts
├── scanning-service/src/migrations/001_baseline_scanning.ts
├── search-service/src/migrations/001_search_consistency_tables.ts
├── ticket-service/src/migrations/001_baseline_ticket.ts
├── transfer-service/src/migrations/001_baseline_transfer.ts
└── venue-service/src/migrations/001_baseline_venue.ts
```

---

## Key Discoveries

1. ✅ **Naming is consistent** across auth-service (snake_case)
2. ✅ **Migration format is uniform** (TypeScript + Knex)
3. ✅ **PgBouncer exists** and is properly configured
4. ✅ **Order-service code exists** - only migrations missing
5. ✅ **Multi-tenancy** implemented via tenant_id (though added at end of users table)
6. ✅ **Soft deletes** using deleted_at pattern
7. ✅ **Audit logging** built into auth-service
8. ✅ **Web3 support** in auth (wallet_address, network)
9. ✅ **Security features** robust (MFA, biometric, device fingerprinting, lockout)
10. ✅ **Referral system** built-in with automated count tracking

---

**Status:** Survey Complete  
**Next:** Extract payment-service schema (27 tables) or create order-service migrations first?
