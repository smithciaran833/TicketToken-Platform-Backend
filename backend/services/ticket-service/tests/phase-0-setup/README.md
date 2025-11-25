# Phase 0: Database Schema Setup

**Priority:** 🔴 CRITICAL PRE-REQUISITE  
**Status:** ✅ COMPLETED

---

## What This Phase Does

Sets up the complete database schema before any tests can run.

**This must be done FIRST** before running any test phases.

---

## What Was Added

### New Tables (15 created by ticket-service):
- ticket_types
- tickets
- orders
- order_items
- reservations
- reservation_history
- ticket_transfers
- ticket_validations
- qr_codes
- discounts
- order_discounts
- webhook_nonces
- idempotency_keys
- outbox
- user_blacklists

### Columns Added to Existing Tables:

**users table** (auth-service):
- `can_receive_transfers` BOOLEAN DEFAULT true
- `identity_verified` BOOLEAN DEFAULT false

**events table** (event-service):
- `start_date` TIMESTAMP WITH TIME ZONE
- `end_date` TIMESTAMP WITH TIME ZONE
- `allow_transfers` BOOLEAN DEFAULT true
- `max_transfers_per_ticket` INTEGER DEFAULT 5
- `transfer_blackout_start` TIMESTAMP WITH TIME ZONE
- `transfer_blackout_end` TIMESTAMP WITH TIME ZONE
- `require_identity_verification` BOOLEAN DEFAULT false

**venues table** (venue-service):
- `transfer_deadline_hours` INTEGER DEFAULT 24

---

## Running the Migration
```bash
# Clean slate (if needed)
psql -h localhost -p 5432 -U postgres -d tickettoken_db < cleanup.sql

# Run migration
npx knex migrate:latest --knexfile knexfile.ts
```

---

## Verification
```bash
# Verify columns exist
psql -h localhost -p 5432 -U postgres -d tickettoken_db << 'SQL'
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('can_receive_transfers', 'identity_verified');

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'events' 
AND column_name IN ('allow_transfers', 'start_date');

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'venues' 
AND column_name = 'transfer_deadline_hours';
SQL
```

Should show all columns exist.

---

## What Passing Means

When Phase 0 is complete:
- ✅ All ticket-service tables exist
- ✅ Transfer columns added to users/events/venues
- ✅ Stored procedures created
- ✅ Ready to run Phase 1 tests

**This phase must pass before ANY other testing begins.**
