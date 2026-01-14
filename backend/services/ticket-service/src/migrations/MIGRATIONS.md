# Ticket Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 11
> **Tables Created:** 35+
> **Functions Created:** 20+

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_ticket.ts | Core ticket tables, FKs, stored procedures, RLS |
| 2 | 002_add_ticket_scans.ts | Duplicate scan detection |
| 3 | 003_add_blockchain_tracking.ts | Blockchain transaction tracking |
| 4 | 004_add_rls_role_verification.ts | RLS helper functions, role verification |
| 5 | 005_add_idempotency_keys.ts | Idempotency with tenant scoping |
| 6 | 006_add_ticket_state_machine.ts | State machine support (minted/revoked) |
| 7 | 007_add_security_tables.ts | Spending limits, lockouts, multi-sig |
| 8 | 008_add_foreign_key_constraints.ts | Additional FK constraints |
| 9 | 009_add_unique_constraints.ts | Unique indexes (QR, barcode, NFT mint) |
| 10 | 010_add_check_constraints.ts | Data validation constraints |
| 11 | 011_add_ticket_state_history.ts | State transition audit trail |

---

## Tables by Migration

### 001_baseline_ticket.ts (18 tables)
- ticket_types
- reservations
- tickets (main table, ~30 columns)
- ticket_transfers
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

### 002_add_ticket_scans.ts (1 table)
- ticket_scans

### 003_add_blockchain_tracking.ts (2 tables)
- pending_transactions
- blockchain_sync_log

### 004_add_rls_role_verification.ts (1 table)
- tenant_access_violations

### 005_add_idempotency_keys.ts (1 table)
- idempotency_keys

### 006_add_ticket_state_machine.ts (1 table)
- ticket_transfers (additional columns + triggers)

### 007_add_security_tables.ts (6 tables)
- spending_limits
- account_lockout_events
- multisig_approval_requests
- multisig_approvals
- multisig_rejections
- spending_transactions

### 011_add_ticket_state_history.ts (1 table)
- ticket_state_history

---

## Key Tables

### tickets
Main ticket table with extensive columns:
- Core: id, tenant_id, event_id, ticket_type_id, user_id
- Identification: ticket_number (unique), qr_code, payment_id
- Pricing: price_cents, price, face_value
- Seating: section, row, seat
- Status: status (enum), is_validated, is_transferable
- NFT: is_nft, token_mint
- State tracking: status_reason, status_changed_by, status_changed_at
- Timestamps: purchased_at, validated_at, created_at, updated_at, deleted_at

**Status Values (migration 006)**:
available, reserved, sold, minted, active, transferred, checked_in, used, revoked, refunded, expired, cancelled

### ticket_transfers
Transfer tracking with blockchain integration:
- from_user_id, to_user_id, to_email
- transfer_code, acceptance_code
- status: pending, accepted, rejected, cancelled, completed, expired
- Blockchain: tx_signature, blockchain_confirmed, blockchain_confirmed_at

### pending_transactions
Blockchain transaction tracking:
- tx_signature, tx_type (mint/transfer/burn/metadata_update/verify)
- status: pending, confirming, confirmed, failed, expired, replaced
- blockhash, last_valid_block_height (for expiration)
- Retry: retry_count, max_retries, last_retry_at

### idempotency_keys
Tenant-scoped idempotency:
- Unique constraint: (tenant_id, idempotency_key, operation)
- Locking: locked_at, locked_by, lock_expires_at
- Response caching: response_status, response_body

### ticket_state_history
Audit trail for status changes:
- Automatic trigger on tickets.status update
- Captures: previous_status, new_status, changed_by, reason, source
- Session variable integration: app.current_user_id, app.actor_type

---

## Stored Functions

### Reservation Management
- `update_ticket_availability_on_reservation()` - Decrement availability on reservation
- `release_ticket_availability()` - Release on expiry/cancel

### User Stats
- `update_user_ticket_stats()` - Increment purchase count
- `update_user_events_attended()` - Track event attendance

### Scan Detection
- `check_duplicate_scan(ticket_id, time_window_seconds)` - Returns is_duplicate, last_scan_at, scan_count
- `record_scan_attempt(...)` - Log scan with context

### Blockchain
- `create_pending_transaction(...)` - Create pending tx record
- `confirm_transaction(tx_signature, slot, block_time)` - Mark confirmed
- `fail_transaction(tx_signature, error_code, message)` - Mark failed
- `has_pending_transaction(ticket_id)` - Check for pending tx
- `get_pending_transaction_status(tx_signature)` - Get tx status

### RLS Helpers
- `current_tenant_id()` - Get current tenant from session
- `set_tenant_context(uuid)` - Set tenant for transaction
- `clear_tenant_context()` - Clear tenant context
- `verify_tenant_context()` - Verify context is set
- `log_tenant_violation(...)` - Audit cross-tenant attempts

### Idempotency
- `acquire_idempotency_key(...)` - Atomic check-and-lock
- `complete_idempotency_key(...)` - Store response
- `release_idempotency_lock(key_id, set_failed)` - Release lock
- `cleanup_expired_idempotency_keys()` - Cleanup job

### State Machine
- `ticket_status_change_trigger()` - Auto-log status changes
- `can_check_in_ticket(ticket_id, event_start, event_end)` - Validate check-in window
- `get_ticket_transfer_history(ticket_id)` - Get transfer chain
- `log_ticket_status_change()` - Trigger function
- `get_ticket_state_history(ticket_id, limit)` - Get history
- `log_ticket_status_change_manual(...)` - Manual logging

---

## RLS Implementation

### Session Variables Used
- `app.current_user_id` (UUID)
- `app.current_user_role` (admin, superadmin)
- `app.current_tenant_id` (UUID)
- `app.tenant_id` (UUID - migration 007)
- `app.actor_type` (user, system, admin, service)
- `app.status_change_reason`
- `app.status_change_source`

### tickets Table Policies
1. `tickets_view_own` - Users see their tickets
2. `tickets_update_own` - Users update their tickets
3. `tickets_venue_owner_view` - Venue owners see their venue's tickets
4. `tickets_admin_all` - Admin full access
5. `tickets_tenant_isolation` - Tenant boundary

### Pattern for Other Tables
```sql
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

---

## Security Features

### Spending Limits (migration 007)
- daily_limit, weekly_limit, monthly_limit, per_transaction_limit
- Constraint ensures hierarchy: per_tx ≤ daily ≤ weekly ≤ monthly

### Account Lockout (migration 007)
- Tracks failed_attempt_count, locked_until
- Event types: failed_attempt, locked, unlocked

### Multi-Sig Approvals (migration 007)
- multisig_approval_requests with required_approvals
- multisig_approvals and multisig_rejections tables
- Status: pending, approved, rejected, expired, executed

### Optimistic Locking
- version column on key tables (via check constraints)

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth | All tables with tenant_id |
| users | auth | tickets, reservations, transfers, validations |
| events | event | ticket_types, tickets, pending_transactions |
| venues | venue | tickets (via created_by in venues) |
| orders | order | refunds.order_id, order_discounts.order_id |

---

## Indexes

### Composite Indexes
- `idx_tickets_tenant_status` - (tenant_id, status)
- `idx_tickets_user_status` - (user_id, status)
- `idx_ticket_scans_duplicate_detection` - (ticket_id, scanned_at DESC)
- `idx_pending_tx_status` - (status, submitted_at) WHERE status IN ('pending', 'confirming')

### Partial Indexes
- `idx_outbox_unprocessed` - WHERE processed_at IS NULL
- `idx_pending_tx_expired` - WHERE status = 'pending'

### GIN Indexes
- tickets.search_vector (full-text search via tsvector)

---

## CHECK Constraints (migration 010)

### tickets
- chk_tickets_status - Valid status values
- chk_tickets_price_positive - price >= 0
- chk_tickets_face_value_positive
- chk_tickets_resale_price_positive
- chk_tickets_max_resale_price - >= price
- chk_tickets_scan_count_positive
- chk_tickets_transfer_count_positive
- chk_tickets_max_transfers_positive
- chk_tickets_seat_number_positive
- chk_tickets_valid_dates - valid_from <= expires_at

### Other Tables
- Similar constraints on orders, transfers, reservations, pending_transactions, idempotency_keys, ticket_types

---

## ⚠️ Known Issues

### 1. Mixed Migration Styles
- Some use Knex schema builder (001, 004, 005, 007-011)
- Some use raw pg Pool queries (002, 003, 006)
- Inconsistent approach to table creation

### 2. Duplicate ticket_transfers Table
- Created in 001_baseline_ticket.ts
- Modified/referenced in 006_add_ticket_state_machine.ts
- May cause conflicts

### 3. Session Variable Inconsistency
- Most use `app.current_tenant_id`
- Migration 007 uses `app.tenant_id` (different!)

### 4. Missing outbox Table Creation
- outbox table created in 001 but structure differs from other services

### 5. Cross-Service References
- References to tables in other services (users, events, orders, venues)
- Migrations may fail if run in wrong order

---

## Migration Order Dependencies

1. **auth-service** must run first (creates tenants, users)
2. **event-service** should run (creates events)
3. **venue-service** should run (creates venues)
4. **ticket-service** migrations in order 001-011
5. **order-service** after ticket-service (references ticket tables)
