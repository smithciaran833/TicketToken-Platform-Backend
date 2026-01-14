# Complete Audit Summary

This document consolidates all audit findings across the TicketToken Platform, providing a comprehensive overview of issues and remediation work required.

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Problem 1: Database Ownership Violations](#problem-1-database-ownership-violations)
3. [Problem 2: Missing Migrations (Orphan Tables)](#problem-2-missing-migrations-orphan-tables)
4. [Problem 3: Service Communication Issues](#problem-3-service-communication-issues)
5. [Problem 4: Missing Internal APIs](#problem-4-missing-internal-apis)
6. [Problem 5: RLS Security Gaps](#problem-5-rls-security-gaps)
7. [Problem 6: Duplicate Logic](#problem-6-duplicate-logic)
8. [Remediation Work Required](#remediation-work-required)
9. [Validation Checklist](#validation-checklist)

---

## Executive Summary

### What Was Investigated
- **Migration Audit** - What tables exist, who creates them
- **Code Audit** - Who reads/writes which tables
- **Orphan Tables** - Code references tables that don't exist
- **Service Communication** - How services talk (or don't)
- **Bypass Analysis** - What data services need vs what APIs exist

### Overall Assessment
The codebase **works but is fragile**:
- ✅ It runs
- ✅ It handles basic use cases
- ✅ The structure exists (21 services, proper patterns in some places)
- ⚠️ **But has landmines**: race conditions, security gaps, tight coupling

**Not garbage** - event-service has a good client, order-service has good RabbitMQ integration.
**Needs cleanup** before production scale - multi-tenant security gaps and service coupling would cause problems.

### Effort Estimate

| Phase | Work | Time Estimate |
|-------|------|---------------|
| Phase 1 | Create 11 missing APIs | 3-5 days |
| Phase 2 | Create 8 service clients | 3-5 days |
| Phase 3 | Refactor 22 bypasses | 5-7 days |
| Phase 4 | Add 21 missing migrations | 2-3 days |
| Phase 5 | Fix 116 RLS tables | 5-7 days |
| Phase 6 | Consolidate duplicates | 2-3 days |
| **Total** | | **~4-5 weeks** |

---

## Problem 1: Database Ownership Violations

**Total Count: 42 violations**

Services directly query tables they don't own, bypassing service APIs and business logic.

### Summary Table

| Table | Owner | # Violators | Violating Services |
|-------|-------|-------------|-------------------|
| `tickets` | ticket-service | 10 | payment, blockchain, blockchain-indexer, transfer, auth, compliance, monitoring, analytics, minting, scanning |
| `events` | event-service | 6 | payment, monitoring, analytics, minting, scanning, compliance |
| `venues` | venue-service | 4 | blockchain, compliance, monitoring, analytics |
| `orders` | order-service | 3 | payment, blockchain, analytics |
| `users` | auth-service | 4 | payment, transfer, compliance, analytics |

### Detailed Violations

#### tickets table (owner: ticket-service)

**Services querying directly:**

1. **payment-service** (3 locations)
   - `controllers/refundController.ts` - JOIN on order_id, status checks
   - `services/refund-policy.service.ts` - JOIN with events
   - `services/reconciliation/reconciliation-service.ts` - COUNT queries

2. **blockchain-service** (2 locations)
   - `queues/mintQueue.js` - SELECT token_id, mint status
   - `workers/mint-worker.ts` - JOIN with order_items

3. **blockchain-indexer** (3 locations)
   - `reconciliation/reconciliationEnhanced.ts` - Minted ticket queries
   - `processors/marketplaceTracker.ts` - Token ID lookups
   - `processors/transactionProcessor.ts` - Token ID queries

4. **transfer-service** (2 locations)
   - `services/transfer.service.ts` - SELECT FOR UPDATE, ownership changes

5. **auth-service** (1 location)
   - `migrations/001_auth_baseline.ts` - Events attended count

6. **minting-service** (1 location)
   - `services/MintingOrchestrator.ts` - Token mint queries

7. **monitoring-service** (2 locations)
   - `collectors/business/revenue.collector.ts` - Sales counts
   - `analytics/sales-tracker.ts` - Transaction queries

8. **analytics-service** (views)
   - Multiple materialized views read from tickets

9. **scanning-service** (migrations)
   - FK references in migrations

10. **compliance-service** (likely)
    - Risk assessment queries

**Why this matters:**
- Business logic in ticket-service is bypassed
- Race conditions when multiple services update tickets
- Can't add ticket validation rules in one place
- Schema changes break multiple services

#### events table (owner: event-service)

**Services querying directly:**

1. **payment-service** - Refund policy, 1099 forms
2. **monitoring-service** - Event counts for dashboards
3. **analytics-service** - Materialized views
4. **minting-service** - event_pda for blockchain
5. **scanning-service** - FK in migrations
6. **compliance-service** - Event context for risk

#### venues table (owner: venue-service)

**Services querying directly:**

1. **blockchain-service** - wallet_address for minting
2. **compliance-service** - Venue info for risk, bank verification
3. **monitoring-service** - Venue metrics
4. **analytics-service** - Venue analytics views

#### orders table (owner: order-service)

**Services querying directly:**

1. **payment-service** - Order status, user_id joins
2. **blockchain-service** - Order items for minting
3. **analytics-service** - Order aggregations

#### users table (owner: auth-service)

**Services querying directly:**

1. **payment-service** - billing_address, tax info
2. **transfer-service** - User lookup by email, user creation
3. **compliance-service** - Admin user queries
4. **analytics-service** - Customer 360 views

---

## Problem 2: Missing Migrations (Orphan Tables)

**Total Count: 21 orphan tables**

Code references tables that have no corresponding migration to create them.

### By Service

| Service | # Missing | Tables |
|---------|-----------|--------|
| order-service | 7 | See details below |
| payment-service | 4 | See details below |
| marketplace-service | 4 | See details below |
| venue-service | 2 | See details below |
| transfer-service | 2 | See details below |
| blockchain-service | 1 | See details below |
| event-service | 1 | See details below |

### Detailed List

#### order-service (7 tables)
```
Tables referenced in code but not in migrations:
- [ ] payments
- [ ] refunds  
- [ ] transfers (different from ticket_transfers)
- [ ] escrow_accounts
- [ ] disputes (different from order_disputes)
- [ ] payouts
- [ ] inventory (if separate from tickets)
```

#### payment-service (4 tables)
```
Tables referenced in migration 006 but may not exist:
- [ ] payments (different from payment_transactions?)
- [ ] refunds (different from payment_refunds?)
- [ ] transfers (different from stripe_transfers?)
- [ ] escrow_accounts (different from payment_escrows?)
```

#### marketplace-service (4 tables)
```
Tables referenced in migrations/ but baseline uses different names:
- [ ] listings (vs marketplace_listings)
- [ ] transfers (vs marketplace_transfers)
- [ ] fees (vs platform_fees)
- [ ] venue_settings (vs venue_marketplace_settings)
```

#### venue-service (2 tables)
```
- [ ] venue_compliance (conditional creation)
- [ ] venue_documents (conditional creation)
```

#### transfer-service (2 tables)
```
Tables in migrations/ not in baseline:
- [ ] blockchain_transfers
- [ ] transfer_audit_log
```

#### blockchain-service (1 table)
```
- [ ] wallets (referenced in CHECK constraints)
- [ ] nft_mints (referenced but created by minting-service)
```

#### event-service (1 table)
```
- [ ] event_pricing_tiers (possible orphan)
```

### Why This Matters
- Features may be broken silently
- Tables may have been created manually (no reproducibility)
- Could be dead code that should be removed
- Deployment to new environment will fail

---

## Problem 3: Service Communication Issues

### Summary

| Status | Count | Services |
|--------|-------|----------|
| ✅ Proper HTTP clients | 2 | event-service, order-service |
| ⚠️ Inline axios (messy) | 7 | payment, blockchain, notification, marketplace, queue, file, monitoring |
| ❌ No clients at all | 11 | Everything else |

### Detailed Breakdown

#### ✅ Services with Proper HTTP Clients

**event-service**
- Has `/src/clients/` directory with proper service clients
- Implements circuit breaker patterns
- Proper error handling

**order-service**
- Has RabbitMQ integration
- Proper async messaging
- Good separation of concerns

#### ⚠️ Services with Inline Axios (Messy)

**payment-service**
- Uses axios directly in service files
- No retry logic
- No circuit breaker

**blockchain-service**
- Uses axios for RPC calls
- Some retry logic but inconsistent

**notification-service**
- Uses axios for external services (Twilio, SendGrid)
- No internal service communication

**marketplace-service**
- Uses axios in some places
- No consistent client pattern

**queue-service**
- Uses axios for health checks
- Minimal service communication

**file-service**
- Uses axios for CDN operations
- No internal service clients

**monitoring-service**
- Uses axios for health probes
- Direct database access instead of service calls

#### ❌ Services with No Clients

```
- auth-service
- venue-service  
- ticket-service
- transfer-service
- minting-service
- scanning-service
- compliance-service
- integration-service
- search-service
- blockchain-indexer
- analytics-service
```

### Why This Matters
- Services can't properly communicate
- Take shortcuts through database instead
- No consistent error handling
- No retry/circuit breaker patterns
- No service discovery

---

## Problem 4: Missing Internal APIs

Services need data from each other, but the APIs don't exist.

### Required APIs by Service

#### ticket-service (4 new endpoints needed)

| Endpoint | Purpose | Consumer |
|----------|---------|----------|
| `GET /internal/tickets/by-token/:tokenId` | Lookup ticket by blockchain token | blockchain-indexer |
| `GET /internal/orders/:orderId/tickets` | List tickets in order | payment-service |
| `POST /internal/tickets/:ticketId/transfer` | Execute ticket transfer | transfer-service |
| `GET /internal/users/:userId/events-attended` | Count events attended | auth-service |

**Existing endpoints:**
- `GET /internal/tickets/:ticketId/status` ✅
- `POST /internal/tickets/cancel-batch` ✅
- `POST /internal/tickets/calculate-price` ✅

#### auth-service (3 new endpoints needed)

| Endpoint | Purpose | Consumer |
|----------|---------|----------|
| `GET /internal/users/:userId` | Basic user info | payment-service |
| `GET /internal/users/by-email/:email` | User lookup by email | transfer-service |
| `GET /internal/users/admins` | Admin users by tenant | compliance-service |

#### order-service (2 new endpoints needed)

| Endpoint | Purpose | Consumer |
|----------|---------|----------|
| `GET /internal/orders/:orderId` | Full order details | payment-service |
| `GET /internal/orders/:orderId/items` | Order items | blockchain-service |

#### event-service (1 extension needed)

| Change | Purpose | Consumer |
|--------|---------|----------|
| Add `event_pda` to `/api/v1/events/:eventId` | Blockchain PDA | minting-service |

#### venue-service (1 extension needed)

| Change | Purpose | Consumer |
|--------|---------|----------|
| Add `wallet_address` to `/api/v1/venues/:venueId` | Blockchain wallet | blockchain-service |

### Why This Matters
- Even if we wanted to fix bypasses, nowhere to call
- Services forced to go to database
- Can't add proper authorization
- Can't add rate limiting

---

## Problem 5: RLS Security Gaps

### Summary

| Issue | Count |
|-------|-------|
| Tables missing RLS entirely | 116 |
| Different RLS setting names used | 3 |
| Services with NO RLS in baseline | 3 |

### Tables Missing RLS by Service

#### payment-service (~40+ tables without RLS)
```
- royalty_reconciliation_runs
- royalty_discrepancies
- reminder_history
- tax_forms_1099da
- user_tax_info
- device_activity
- bot_detections
- known_scalpers
- ip_reputation
- behavioral_analytics
- velocity_limits
- velocity_records
- fraud_rules
- card_fingerprints
- ml_fraud_models
- ml_fraud_predictions
- account_takeover_signals
- scalper_reports
- sanctions_list_matches
- pep_database
- suspicious_activity_reports
- waiting_room_activity
- event_purchase_limits
- escrow_release_conditions
- inventory_reservations
- nft_mint_queue
- outbox_dlq
- payment_event_sequence
- payment_state_transitions
- payment_state_machine
- webhook_events
- payment_idempotency
- reconciliation_reports
- settlement_batches
- payment_retries
- payment_chargebacks
- payment_attempts
- purchase_limit_violations
- payout_events
- payment_audit_log
```

#### ticket-service (~20 tables without RLS)
```
- ticket_types
- reservations
- ticket_validations
- refunds
- waitlist
- ticket_price_history
- ticket_holds
- ticket_bundles
- ticket_bundle_items
- ticket_audit_log
- ticket_notifications
- discounts
- order_discounts
- outbox
- reservation_history
- webhook_nonces
- tenant_access_violations
- account_lockout_events
- multisig_approvals
- multisig_rejections
```

#### notification-service (~29 tables without RLS)
```
- scheduled_notifications
- notification_history
- consent_records
- suppression_list
- notification_preference_history
- notification_delivery_stats
- notification_tracking
- notification_analytics
- notification_engagement
- notification_clicks
- notification_campaigns
- audience_segments
- email_automation_triggers
- ab_tests
- ab_test_variants
- ab_test_metrics
- automation_executions
- bounces
- campaign_stats
- engagement_events
- notification_analytics_daily
- pending_deletions
- template_usage
- template_versions
- translations
- venue_health_scores
- abandoned_carts
- venue_notification_settings
- notification_costs
```

#### venue-service (~17 tables without RLS)
```
- venue_staff
- venue_layouts
- venue_branding
- custom_domains
- white_label_pricing
- venue_tier_history
- api_keys
- user_venue_roles
- external_verifications
- manual_review_queue
- notifications
- email_queue
- venue_compliance_reviews
- venue_compliance
- venue_compliance_reports
- venue_documents
- webhook_events
```

### Inconsistent RLS Setting Names

| Setting Name | Used By |
|--------------|---------|
| `app.current_tenant` | queue, scanning, monitoring, search, analytics, integration (baseline) |
| `app.current_tenant_id` | blockchain, minting, marketplace (enhanced migrations) |
| `app.tenant_id` | ticket-service (some tables), file-service |

### Services with NO RLS in Baseline Migrations

1. **notification-service** - 32 tables, 0 RLS policies in baseline
2. **compliance-service** - 15 tables, 0 RLS policies in baseline
3. **file-service** - 4 tables, 0 RLS policies in baseline

### Why This Matters
- **Multi-tenant data leakage** - Customer A could see Customer B's data
- **No data isolation guarantee** at database level
- **Compliance risk** - GDPR, SOC2, etc.
- **Query without tenant context** returns all data

---

## Problem 6: Duplicate Logic

### Duplicate Functions

#### `update_updated_at_column()` - Created by 8 services
```
- auth-service ✅
- venue-service ✅
- event-service ✅
- payment-service ✅
- order-service ✅
- transfer-service ✅
- notification-service ✅
- monitoring-service ✅
```

**Issue:** Each service creates the same function. If you need to change the behavior, you need to change it in 8 places.

#### `audit_trigger_function()` - Created by auth-service, expected by others
```
Creator: auth-service
Consumers: venue-service, event-service (expect it to exist)
```

### Duplicate Business Logic

#### Ticket Transfer Implementation
Both services implement ticket transfers:

**ticket-service**
- Has `ticket_transfers` table
- Has transfer history tracking
- Has blockchain integration

**transfer-service**
- Has `ticket_transactions` table
- Has batch transfer support
- Has promotional codes
- Has webhook subscriptions

**Decision needed:** Pick one as the source of truth.

### Why This Matters
- Bug fix in one place doesn't fix all
- Inconsistent behavior across services
- Harder to maintain
- Potential for conflicting logic

---

## Remediation Work Required

### Phase 1: Create Missing APIs (11 endpoints)

| Service | Endpoints | Priority |
|---------|-----------|----------|
| ticket-service | 4 endpoints | HIGH |
| auth-service | 3 endpoints | HIGH |
| order-service | 2 endpoints | MEDIUM |
| event-service | 1 extension | MEDIUM |
| venue-service | 1 extension | MEDIUM |

**Estimated time:** 3-5 days

### Phase 2: Create Service Clients (8 clients)

| Service | Needs Clients For |
|---------|-------------------|
| payment-service | ticket, event, order, auth |
| blockchain-service | ticket, venue, order |
| blockchain-indexer | ticket |
| transfer-service | ticket, auth |
| compliance-service | venue, auth |
| auth-service | ticket |
| minting-service | event |
| scanning-service | ticket, event |

**Estimated time:** 3-5 days

### Phase 3: Refactor Bypasses (~22 locations)

Replace direct SQL with client calls:

| Service | Locations to Fix |
|---------|------------------|
| payment-service | 5 locations |
| blockchain-service | 3 locations |
| blockchain-indexer | 3 locations |
| transfer-service | 3 locations |
| monitoring-service | 3 locations |
| analytics-service | 3 locations (consider read replica instead) |
| auth-service | 1 location |
| minting-service | 1 location |

**Estimated time:** 5-7 days

### Phase 4: Add Missing Migrations (21 tables)

| Service | Tables |
|---------|--------|
| order-service | 7 |
| payment-service | 4 |
| marketplace-service | 4 |
| venue-service | 2 |
| transfer-service | 2 |
| blockchain-service | 1 |
| event-service | 1 |

**Estimated time:** 2-3 days

### Phase 5: Fix RLS (116 tables)

| Service | Tables Needing RLS |
|---------|-------------------|
| payment-service | ~40 |
| notification-service | ~29 |
| ticket-service | ~20 |
| venue-service | ~17 |
| compliance-service | ~10 |

Also need to:
- Standardize on one RLS setting name
- Add FORCE RLS where appropriate
- Create proper per-operation policies

**Estimated time:** 5-7 days

### Phase 6: Consolidate Duplicates

1. **update_updated_at_column()** - Move to shared migration
2. **Ticket transfer logic** - Pick ticket-service or transfer-service
3. **Audit trigger** - Centralize creation

**Estimated time:** 2-3 days

---

## Validation Checklist

Use this checklist to validate the findings yourself:

### Database Ownership Violations

```bash
# Check tickets table access
grep -r "FROM tickets" backend/services/*/src --include="*.ts" --include="*.js" | grep -v ticket-service
grep -r "JOIN tickets" backend/services/*/src --include="*.ts" --include="*.js" | grep -v ticket-service

# Check events table access
grep -r "FROM events" backend/services/*/src --include="*.ts" --include="*.js" | grep -v event-service
grep -r "JOIN events" backend/services/*/src --include="*.ts" --include="*.js" | grep -v event-service

# Check venues table access  
grep -r "FROM venues" backend/services/*/src --include="*.ts" --include="*.js" | grep -v venue-service
grep -r "JOIN venues" backend/services/*/src --include="*.ts" --include="*.js" | grep -v venue-service

# Check orders table access
grep -r "FROM orders" backend/services/*/src --include="*.ts" --include="*.js" | grep -v order-service
grep -r "JOIN orders" backend/services/*/src --include="*.ts" --include="*.js" | grep -v order-service

# Check users table access
grep -r "FROM users" backend/services/*/src --include="*.ts" --include="*.js" | grep -v auth-service
grep -r "JOIN users" backend/services/*/src --include="*.ts" --include="*.js" | grep -v auth-service
```

### Service Clients

```bash
# Check for client directories
ls -la backend/services/*/src/clients/ 2>/dev/null

# Check for axios imports
grep -r "import axios" backend/services/*/src --include="*.ts" -l

# Check for proper HTTP client patterns
grep -r "class.*Client" backend/services/*/src --include="*.ts" -l
```

### RLS Status

```bash
# Check RLS enabled in migrations
grep -r "ENABLE ROW LEVEL SECURITY" backend/services/*/src/migrations --include="*.ts"

# Check FORCE RLS
grep -r "FORCE ROW LEVEL SECURITY" backend/services/*/src/migrations --include="*.ts"

# Check RLS setting names
grep -r "app.current_tenant" backend/services/*/src/migrations --include="*.ts"
grep -r "app.tenant_id" backend/services/*/src/migrations --include="*.ts"
```

### Duplicate Functions

```bash
# Count update_updated_at_column occurrences
grep -r "CREATE.*FUNCTION.*update_updated_at_column" backend/services/*/src/migrations --include="*.ts" -l | wc -l

# Check audit_trigger_function
grep -r "audit_trigger_function" backend/services/*/src/migrations --include="*.ts" -l
```

### Orphan Tables

```bash
# For each service, compare table names in migrations vs code
# Example for payment-service:
grep -r "CREATE TABLE" backend/services/payment-service/src/migrations --include="*.ts" | grep -oP 'CREATE TABLE.*?\w+' | sort -u
grep -r "FROM \w+|JOIN \w+" backend/services/payment-service/src --include="*.ts" | grep -oP '\b(FROM|JOIN)\s+\w+' | sort -u
```

---

## Related Documents

- [CLINE_MIGRATION_AUDIT.md](./CLINE_MIGRATION_AUDIT.md) - Detailed migration analysis per service
- [SERVICE_BYPASS_ANALYSIS.md](./SERVICE_BYPASS_ANALYSIS.md) - SQL queries and bypass details
- [CODEBASE_AUDIT.md](./CODEBASE_AUDIT.md) - General codebase audit

---

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-12 | Audit Team | Initial consolidated summary |
