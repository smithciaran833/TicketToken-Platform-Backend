import { Knex } from 'knex';

/**
 * CONSOLIDATED BASELINE MIGRATION - Ticket Service
 *
 * This migration consolidates 11 migration files into a single baseline:
 * - 001_baseline_ticket.ts (18 tables)
 * - 002_add_ticket_scans.ts (1 table)
 * - 003_add_blockchain_tracking.ts (2 tables)
 * - 004_add_rls_role_verification.ts (1 table + functions)
 * - 005_add_idempotency_keys.ts (1 table + functions)
 * - 006_add_ticket_state_machine.ts (columns absorbed, enum, functions)
 * - 007_add_security_tables.ts (6 tables)
 * - 008_add_foreign_key_constraints.ts (FKs absorbed)
 * - 009_add_unique_constraints.ts (indexes absorbed)
 * - 010_add_check_constraints.ts (CHECKs absorbed)
 * - 011_add_ticket_state_history.ts (1 table + functions)
 *
 * Consolidation Date: January 2025
 *
 * FIXES APPLIED:
 * 1. UUID: uuid_generate_v4() → gen_random_uuid() (18 tables)
 * 2. RLS variable: app.tenant_id → app.current_tenant_id (3 tables)
 * 3. RLS system bypass: Added app.is_system_user check (24 policies)
 * 4. Missing tenant_id: Added to ticket_bundle_items, multisig_approvals, multisig_rejections
 * 5. Missing FK: Added idempotency_keys.tenant_id → tenants
 * 6. Column absorption: Merged 006 columns into tickets and ticket_transfers
 * 7. CHECK fix: Added 'status_changed' to blockchain_sync_log.event_type
 * 8. Duplicate removal: Removed duplicate trigger (ticket_status_change) and function
 *
 * TABLES: 30
 * FUNCTIONS: 25
 * TRIGGERS: 6
 * ENUMS: 1
 * VIEWS: 2
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: EXTENSIONS
  // ============================================================================
  
  // gen_random_uuid() is built-in to PostgreSQL 13+, no extension needed
  // But we'll ensure uuid-ossp exists for compatibility
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ============================================================================
  // SECTION 2: ENUM TYPES
  // ============================================================================

  // revocation_reason enum (from 006)
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE revocation_reason AS ENUM (
        'fraud_detected',
        'chargeback',
        'event_cancelled',
        'duplicate_ticket',
        'terms_violation',
        'admin_request',
        'refund_requested',
        'transfer_dispute'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ============================================================================
  // SECTION 3: TABLES (30 total)
  // ============================================================================

  // --------------------------------------------------------------------------
  // TABLE 1: ticket_types
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.string('name', 100).notNullable();
    table.text('description');
    table.string('category', 50);
    table.decimal('price', 10, 2).notNullable();
    table.integer('quantity').notNullable();
    table.integer('available_quantity').notNullable();
    table.integer('sold_quantity').defaultTo(0);
    table.integer('reserved_quantity').defaultTo(0);
    table.integer('min_purchase').defaultTo(1);
    table.integer('max_purchase').defaultTo(10);
    table.timestamp('sale_start').notNullable();
    table.timestamp('sale_end').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.index(['tenant_id', 'event_id']);
    table.index('is_active');
    table.index('available_quantity');
    table.index(['sale_start', 'sale_end'], 'idx_ticket_types_sale_period');
    table.index(['tenant_id', 'is_active'], 'idx_ticket_types_tenant_active');
  });

  // --------------------------------------------------------------------------
  // TABLE 2: reservations
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.integer('total_quantity').notNullable();
    table.jsonb('tickets').notNullable();
    table.string('type_name', 100);
    table.enum('status', ['pending', 'confirmed', 'expired', 'cancelled']).defaultTo('pending');
    table.timestamp('expires_at').notNullable();
    table.timestamp('released_at');
    table.timestamps(true, true);

    table.index(['tenant_id', 'user_id']);
    table.index(['tenant_id', 'event_id']);
    table.index('status');
    table.index('expires_at');
    table.index(['status', 'expires_at'], 'idx_reservations_status_expires');
    table.index(['tenant_id', 'status'], 'idx_reservations_tenant_status');
  });

  // --------------------------------------------------------------------------
  // TABLE 3: tickets (main table)
  // Source: 001 + absorbed columns from 006
  // --------------------------------------------------------------------------
  await knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').index();
    table.uuid('original_purchaser_id').index();
    table.uuid('reservation_id').index();
    table.string('ticket_number', 50).notNullable().unique();
    table.string('qr_code', 255).notNullable();
    table.decimal('price_cents', 10, 2);
    table.decimal('price', 10, 2);
    table.decimal('face_value', 10, 2);
    table.string('section', 20);
    table.string('row', 10);
    table.string('seat', 10);
    // Status with all values from 006
    table.string('status', 20).defaultTo('active');
    table.boolean('is_validated').defaultTo(false);
    table.boolean('is_transferable').defaultTo(true);
    table.integer('transfer_count').defaultTo(0);
    table.boolean('is_nft').defaultTo(false);
    table.string('payment_id', 255);
    table.timestamp('purchased_at');
    table.timestamp('purchase_date');
    table.timestamp('validated_at');
    table.uuid('validated_by');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    // Absorbed from 006
    table.string('status_reason', 255);
    table.uuid('status_changed_by');
    table.timestamp('status_changed_at');
    table.timestamp('checked_in_at');
    table.uuid('checked_in_by');
    table.string('token_mint', 64);

    table.index(['tenant_id', 'user_id']);
    table.index(['event_id', 'status']);
    table.index('status');
    table.index('is_validated');
    table.index('purchased_at');
    table.index('is_nft');
    table.index(['tenant_id', 'status'], 'idx_tickets_tenant_status');
    table.index(['user_id', 'status'], 'idx_tickets_user_status');
    table.index(['ticket_type_id', 'status'], 'idx_tickets_type_status');
    table.index('validated_at', 'idx_tickets_validated_at');
  });

  // Partial index for token_mint
  await knex.raw(`
    CREATE INDEX idx_tickets_token_mint ON tickets (token_mint) WHERE token_mint IS NOT NULL;
  `);

  // --------------------------------------------------------------------------
  // TABLE 4: ticket_transfers
  // Source: 001 + absorbed columns from 006
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_id').notNullable().index();
    table.uuid('from_user_id').index();
    table.uuid('to_user_id').index();
    table.string('to_email', 255).notNullable();
    table.string('transfer_code', 50).unique();
    table.string('transfer_type', 50);
    table.string('transfer_method', 20).notNullable();
    table.enum('status', ['pending', 'accepted', 'rejected', 'cancelled', 'completed', 'expired']).defaultTo('pending');
    table.string('acceptance_code', 12).notNullable();
    table.text('message');
    table.text('notes');
    table.boolean('is_gift').notNullable().defaultTo(true);
    table.integer('price_cents').defaultTo(0);
    table.string('currency', 3).defaultTo('USD');
    table.timestamp('expires_at').notNullable();
    table.timestamp('accepted_at');
    table.timestamp('cancelled_at');
    table.text('cancellation_reason');
    table.timestamp('transferred_at');
    table.timestamp('blockchain_transferred_at');
    table.timestamps(true, true);
    // Absorbed from 006
    table.string('tx_signature', 128);
    table.boolean('blockchain_confirmed').defaultTo(false);
    table.timestamp('blockchain_confirmed_at');

    table.index('status');
    table.index('to_email');
    table.index('acceptance_code');
    table.index(['status', 'expires_at']);
    table.index(['from_user_id', 'status'], 'idx_transfers_from_user_status');
    table.index(['to_user_id', 'status'], 'idx_transfers_to_user_status');
  });

  // Partial index for pending blockchain confirmations
  await knex.raw(`
    CREATE INDEX idx_ticket_transfers_pending_blockchain ON ticket_transfers (blockchain_confirmed)
    WHERE blockchain_confirmed = FALSE;
  `);

  // --------------------------------------------------------------------------
  // TABLE 5: ticket_validations
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_validations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_id').notNullable().index();
    table.uuid('validator_id').index();
    table.timestamp('validated_at').notNullable().defaultTo(knex.fn.now());
    table.string('validation_method', 50);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // --------------------------------------------------------------------------
  // TABLE 6: refunds
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('order_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.decimal('amount', 10, 2).notNullable();
    table.enum('status', ['pending', 'approved', 'rejected', 'completed']).defaultTo('pending');
    table.text('reason');
    table.timestamp('processed_at');
    table.timestamps(true, true);

    table.index('status');
  });

  // --------------------------------------------------------------------------
  // TABLE 7: waitlist
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('waitlist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.enum('status', ['active', 'notified', 'expired', 'converted']).defaultTo('active');
    table.timestamp('notified_at');
    table.timestamps(true, true);

    table.index(['tenant_id', 'ticket_type_id']);
    table.index('status');
    table.index(['tenant_id', 'ticket_type_id', 'status'], 'idx_waitlist_tenant_type_status');
  });

  // --------------------------------------------------------------------------
  // TABLE 8: ticket_price_history
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.decimal('old_price', 10, 2).notNullable();
    table.decimal('new_price', 10, 2).notNullable();
    table.uuid('changed_by').index();
    table.text('reason');
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
  });

  // --------------------------------------------------------------------------
  // TABLE 9: ticket_holds
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_holds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.string('hold_reason', 255);
    table.uuid('held_by').index();
    table.timestamp('expires_at');
    table.enum('status', ['active', 'released', 'expired']).defaultTo('active');
    table.timestamps(true, true);

    table.index('status');
  });

  // --------------------------------------------------------------------------
  // TABLE 10: ticket_bundles
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_bundles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('name', 100).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.decimal('discount_percentage', 5, 2);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // --------------------------------------------------------------------------
  // TABLE 11: ticket_bundle_items
  // Source: 001 + FIX: Added tenant_id
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_bundle_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index(); // FIX: Added
    table.uuid('bundle_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.timestamps(true, true);
  });

  // --------------------------------------------------------------------------
  // TABLE 12: ticket_audit_log
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.string('action', 50).notNullable();
    table.uuid('performed_by').index();
    table.jsonb('old_values');
    table.jsonb('new_values');
    table.string('ip_address', 45);
    table.string('user_agent', 255);
    table.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());

    table.index(['tenant_id', 'performed_at']);
    table.index('action');
    table.index(['ticket_id', 'performed_at'], 'idx_audit_ticket_performed');
    table.index(['tenant_id', 'action'], 'idx_audit_tenant_action');
  });

  // --------------------------------------------------------------------------
  // TABLE 13: ticket_notifications
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.enum('type', ['purchase', 'transfer', 'validation', 'cancellation', 'reminder']).notNullable();
    table.enum('status', ['pending', 'sent', 'failed']).defaultTo('pending');
    table.text('message');
    table.timestamp('sent_at');
    table.timestamps(true, true);

    table.index(['tenant_id', 'user_id']);
    table.index('status');
  });

  // --------------------------------------------------------------------------
  // TABLE 14: discounts
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('discounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('code', 50).notNullable();
    table.string('discount_type', 20).notNullable();
    table.decimal('discount_value', 10, 2).notNullable();
    table.integer('max_uses').nullable();
    table.integer('times_used').defaultTo(0);
    table.timestamp('valid_from').nullable();
    table.timestamp('valid_until').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.unique(['tenant_id', 'code']);
    table.index('code');
    table.index('is_active');
  });

  // --------------------------------------------------------------------------
  // TABLE 15: order_discounts
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('order_discounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('order_id').notNullable().index();
    table.uuid('discount_id').notNullable().index();
    table.string('discount_code', 50).notNullable();
    table.string('discount_type', 20).notNullable();
    table.integer('amount_cents').notNullable();
    table.timestamp('applied_at').notNullable().defaultTo(knex.fn.now());

    table.index(['tenant_id', 'order_id']);
  });

  // --------------------------------------------------------------------------
  // TABLE 16: outbox
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('outbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('aggregate_id').notNullable().index();
    table.string('aggregate_type', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.uuid('tenant_id').nullable().index();
    table.integer('attempts').defaultTo(0);
    table.timestamp('last_attempt_at').nullable();
    table.text('last_error').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();

    table.index('event_type');
    table.index('created_at');
    table.index(['processed_at', 'created_at']);
  });

  await knex.raw(`
    CREATE INDEX idx_outbox_unprocessed ON outbox(processed_at, created_at) WHERE processed_at IS NULL;
  `);

  // --------------------------------------------------------------------------
  // TABLE 17: reservation_history
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('reservation_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('reservation_id').notNullable().index();
    table.uuid('order_id').nullable().index();
    table.uuid('user_id').nullable().index();
    table.string('status_from', 20).nullable();
    table.string('status_to', 20).notNullable();
    table.string('reason', 100).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // --------------------------------------------------------------------------
  // TABLE 18: webhook_nonces (GLOBAL - no tenant_id)
  // Source: 001
  // --------------------------------------------------------------------------
  await knex.schema.createTable('webhook_nonces', (table) => {
    table.string('nonce', 255).primary();
    table.string('endpoint', 255).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();

    table.index('expires_at');
  });

  // --------------------------------------------------------------------------
  // TABLE 19: ticket_scans
  // Source: 002
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.timestamp('scanned_at').notNullable().defaultTo(knex.fn.now());
    table.uuid('scanned_by');
    table.string('device_id', 255);
    table.string('location', 255);
    table.string('result', 50).notNullable();
    table.text('rejection_reason');
    table.specificType('ip_address', 'INET');
    table.text('user_agent');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // CHECK constraint for result
  await knex.raw(`
    ALTER TABLE ticket_scans ADD CONSTRAINT chk_ticket_scans_result
    CHECK (result IN ('valid', 'invalid', 'duplicate', 'expired', 'already_used'));
  `);

  // Indexes for ticket_scans
  await knex.raw(`
    CREATE INDEX idx_ticket_scans_duplicate_detection ON ticket_scans (ticket_id, scanned_at DESC);
    CREATE INDEX idx_ticket_scans_event ON ticket_scans (event_id, scanned_at DESC);
    CREATE INDEX idx_ticket_scans_device ON ticket_scans (device_id, scanned_at DESC) WHERE device_id IS NOT NULL;
    CREATE INDEX idx_ticket_scans_tenant ON ticket_scans (tenant_id, scanned_at DESC);
  `);

  // --------------------------------------------------------------------------
  // TABLE 20: pending_transactions
  // Source: 003
  // --------------------------------------------------------------------------
  await knex.schema.createTable('pending_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('tx_signature', 128).notNullable().unique();
    table.string('tx_type', 50).notNullable();
    table.uuid('ticket_id');
    table.uuid('event_id');
    table.uuid('from_user_id');
    table.uuid('to_user_id');
    table.string('status', 30).notNullable().defaultTo('pending');
    table.bigInteger('slot');
    table.timestamp('block_time');
    table.integer('confirmation_count').defaultTo(0);
    table.integer('required_confirmations').defaultTo(1);
    table.string('blockhash', 64);
    table.bigInteger('last_valid_block_height');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.timestamp('last_retry_at');
    table.string('error_code', 100);
    table.text('error_message');
    table.jsonb('error_details').defaultTo('{}');
    table.timestamp('submitted_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('confirmed_at');
    table.timestamp('failed_at');
    table.timestamps(true, true);
  });

  // CHECK constraints for pending_transactions
  await knex.raw(`
    ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_type
    CHECK (tx_type IN ('mint', 'transfer', 'burn', 'metadata_update', 'verify'));

    ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_status
    CHECK (status IN ('pending', 'confirming', 'confirmed', 'failed', 'expired', 'replaced'));

    ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_block_height_positive
    CHECK (last_valid_block_height IS NULL OR last_valid_block_height > 0);

    ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_retry_count_positive
    CHECK (retry_count IS NULL OR retry_count >= 0);
  `);

  // Indexes for pending_transactions
  await knex.raw(`
    CREATE INDEX idx_pending_tx_ticket ON pending_transactions (ticket_id) WHERE status = 'pending';
    CREATE INDEX idx_pending_tx_status ON pending_transactions (status, submitted_at) WHERE status IN ('pending', 'confirming');
    CREATE INDEX idx_pending_tx_expired ON pending_transactions (last_valid_block_height) WHERE status = 'pending';
  `);

  // --------------------------------------------------------------------------
  // TABLE 21: blockchain_sync_log
  // Source: 003 + FIX: Added 'status_changed' to event_type CHECK
  // --------------------------------------------------------------------------
  await knex.schema.createTable('blockchain_sync_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('event_type', 50).notNullable();
    table.string('tx_signature', 128);
    table.uuid('ticket_id');
    table.jsonb('db_state');
    table.jsonb('blockchain_state');
    table.string('action_taken', 100);
    table.text('resolution');
    table.string('severity', 20).defaultTo('info');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // CHECK constraints for blockchain_sync_log (FIX: added 'status_changed')
  await knex.raw(`
    ALTER TABLE blockchain_sync_log ADD CONSTRAINT chk_blockchain_sync_log_event_type
    CHECK (event_type IN (
      'transaction_confirmed',
      'transaction_failed',
      'transaction_expired',
      'reconciliation_mismatch',
      'reconciliation_resolved',
      'ownership_verified',
      'ownership_mismatch',
      'balance_check',
      'rpc_error',
      'manual_intervention',
      'status_changed'
    ));

    ALTER TABLE blockchain_sync_log ADD CONSTRAINT chk_blockchain_sync_log_severity
    CHECK (severity IN ('info', 'warning', 'error', 'critical'));
  `);

  // Indexes for blockchain_sync_log
  await knex.raw(`
    CREATE INDEX idx_sync_log_ticket ON blockchain_sync_log (ticket_id, created_at DESC);
    CREATE INDEX idx_sync_log_severity ON blockchain_sync_log (severity, created_at DESC) WHERE severity IN ('error', 'critical');
  `);

  // --------------------------------------------------------------------------
  // TABLE 22: tenant_access_violations (GLOBAL - no RLS)
  // Source: 004
  // --------------------------------------------------------------------------
  await knex.schema.createTable('tenant_access_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.uuid('attempted_tenant_id');
    table.uuid('actual_tenant_id');
    table.text('table_name');
    table.text('operation');
    table.text('user_name').defaultTo(knex.raw('current_user'));
    table.text('client_addr');
    table.jsonb('details');
  });

  await knex.raw(`
    CREATE INDEX idx_tenant_violations_occurred_at ON tenant_access_violations (occurred_at DESC);
  `);

  // --------------------------------------------------------------------------
  // TABLE 23: idempotency_keys
  // Source: 005 + FIX: Added FK to tenants
  // --------------------------------------------------------------------------
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('idempotency_key', 255).notNullable();
    table.string('operation', 100).notNullable();
    table.string('request_hash', 64);
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('response_status');
    table.jsonb('response_body');
    table.uuid('resource_id');
    table.string('resource_type', 100);
    table.timestamp('locked_at');
    table.string('locked_by', 255);
    table.timestamp('lock_expires_at');
    table.timestamps(true, true);
    table.timestamp('expires_at').notNullable().defaultTo(knex.raw("NOW() + INTERVAL '24 hours'"));
    table.specificType('client_ip', 'INET');
    table.text('user_agent');
    table.string('request_id', 255);
  });

  // CHECK constraint for idempotency_keys
  await knex.raw(`
    ALTER TABLE idempotency_keys ADD CONSTRAINT chk_idempotency_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

    ALTER TABLE idempotency_keys ADD CONSTRAINT chk_idempotency_key_length
    CHECK (length(idempotency_key) >= 1 AND length(idempotency_key) <= 255);
  `);

  // Indexes for idempotency_keys
  await knex.raw(`
    CREATE UNIQUE INDEX idx_idempotency_keys_tenant_key_op ON idempotency_keys (tenant_id, idempotency_key, operation);
    CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys (expires_at) WHERE expires_at < NOW();
    CREATE INDEX idx_idempotency_keys_lock_expires ON idempotency_keys (lock_expires_at) WHERE locked_at IS NOT NULL;
  `);

  // --------------------------------------------------------------------------
  // TABLE 24: spending_limits
  // Source: 007 + FIX: RLS variable
  // --------------------------------------------------------------------------
  await knex.schema.createTable('spending_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('daily_limit').notNullable().defaultTo(100000);
    table.integer('weekly_limit').notNullable().defaultTo(500000);
    table.integer('monthly_limit').notNullable().defaultTo(2000000);
    table.integer('per_transaction_limit').notNullable().defaultTo(50000);
    table.timestamps(true, true);
    table.uuid('updated_by');

    table.unique(['user_id', 'tenant_id']);
    table.index(['user_id', 'tenant_id'], 'idx_spending_limits_user_tenant');
  });

  // CHECK constraints for spending_limits
  await knex.raw(`
    ALTER TABLE spending_limits ADD CONSTRAINT chk_daily_limit_positive CHECK (daily_limit > 0);
    ALTER TABLE spending_limits ADD CONSTRAINT chk_weekly_limit_positive CHECK (weekly_limit > 0);
    ALTER TABLE spending_limits ADD CONSTRAINT chk_monthly_limit_positive CHECK (monthly_limit > 0);
    ALTER TABLE spending_limits ADD CONSTRAINT chk_per_tx_limit_positive CHECK (per_transaction_limit > 0);
    ALTER TABLE spending_limits ADD CONSTRAINT chk_limits_hierarchy CHECK (
      per_transaction_limit <= daily_limit AND
      daily_limit <= weekly_limit AND
      weekly_limit <= monthly_limit
    );
  `);

  // --------------------------------------------------------------------------
  // TABLE 25: account_lockout_events (GLOBAL - no RLS)
  // Source: 007
  // --------------------------------------------------------------------------
  await knex.schema.createTable('account_lockout_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('identifier', 255).notNullable();
    table.string('identifier_type', 50).notNullable();
    table.uuid('tenant_id').nullable();
    table.string('event_type', 50).notNullable();
    table.integer('failed_attempt_count').defaultTo(0);
    table.text('reason');
    table.timestamp('locked_until');
    table.string('locked_by', 50);
    table.uuid('unlocked_by');
    table.specificType('ip_address', 'INET');
    table.text('user_agent');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_lockout_events_identifier ON account_lockout_events (identifier, created_at DESC);
    CREATE INDEX idx_lockout_events_tenant ON account_lockout_events (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
  `);

  // --------------------------------------------------------------------------
  // TABLE 26: multisig_approval_requests
  // Source: 007 + FIX: RLS variable
  // --------------------------------------------------------------------------
  await knex.schema.createTable('multisig_approval_requests', (table) => {
    table.string('id', 100).primary();
    table.uuid('tenant_id').notNullable();
    table.string('operation_type', 100).notNullable();
    table.jsonb('operation_data').notNullable();
    table.uuid('requested_by').notNullable();
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.integer('required_approvals').notNullable().defaultTo(2);
    table.string('status', 50).notNullable().defaultTo('pending');
    table.timestamp('expires_at').notNullable();
    table.timestamp('executed_at');
    table.uuid('executed_by');
    table.jsonb('execution_result');
    table.timestamps(true, true);
  });

  // CHECK constraints for multisig_approval_requests
  await knex.raw(`
    ALTER TABLE multisig_approval_requests ADD CONSTRAINT chk_multisig_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed'));

    ALTER TABLE multisig_approval_requests ADD CONSTRAINT chk_required_approvals
    CHECK (required_approvals > 0);
  `);

  // Indexes for multisig_approval_requests
  await knex.raw(`
    CREATE INDEX idx_multisig_requests_status ON multisig_approval_requests (tenant_id, status, expires_at) WHERE status = 'pending';
    CREATE INDEX idx_multisig_requests_requested_by ON multisig_approval_requests (requested_by, status);
  `);

  // --------------------------------------------------------------------------
  // TABLE 27: multisig_approvals
  // Source: 007 + FIX: Added tenant_id
  // --------------------------------------------------------------------------
  await knex.schema.createTable('multisig_approvals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index(); // FIX: Added
    table.string('request_id', 100).notNullable();
    table.uuid('approver_id').notNullable();
    table.string('approver_role', 100).notNullable();
    table.timestamp('approved_at').notNullable().defaultTo(knex.fn.now());
    table.text('signature');
    table.string('signature_algorithm', 50);

    table.unique(['request_id', 'approver_id']);
    table.index('request_id', 'idx_multisig_approvals_request');
  });

  // --------------------------------------------------------------------------
  // TABLE 28: multisig_rejections
  // Source: 007 + FIX: Added tenant_id
  // --------------------------------------------------------------------------
  await knex.schema.createTable('multisig_rejections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index(); // FIX: Added
    table.string('request_id', 100).notNullable();
    table.uuid('rejecter_id').notNullable();
    table.string('rejecter_role', 100).notNullable();
    table.timestamp('rejected_at').notNullable().defaultTo(knex.fn.now());
    table.text('reason').notNullable();

    table.unique(['request_id', 'rejecter_id']);
  });

  // --------------------------------------------------------------------------
  // TABLE 29: spending_transactions
  // Source: 007 + FIX: RLS variable
  // --------------------------------------------------------------------------
  await knex.schema.createTable('spending_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('amount_cents').notNullable();
    table.string('transaction_type', 50).notNullable();
    table.string('transaction_reference', 255);
    table.date('transaction_date').notNullable().defaultTo(knex.raw('CURRENT_DATE'));
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // CHECK constraint for spending_transactions
  await knex.raw(`
    ALTER TABLE spending_transactions ADD CONSTRAINT chk_spending_amount_positive
    CHECK (amount_cents > 0);
  `);

  // Index for spending_transactions
  await knex.raw(`
    CREATE INDEX idx_spending_tx_user_date ON spending_transactions (user_id, tenant_id, transaction_date DESC);
  `);

  // --------------------------------------------------------------------------
  // TABLE 30: ticket_state_history
  // Source: 011
  // --------------------------------------------------------------------------
  await knex.schema.createTable('ticket_state_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.string('previous_status', 50);
    table.string('new_status', 50).notNullable();
    table.uuid('changed_by');
    table.string('changed_by_type', 50).defaultTo('user');
    table.string('reason', 500);
    table.string('source', 100);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('ticket_id');
    table.index('tenant_id');
    table.index('changed_at');
    table.index(['ticket_id', 'changed_at']);
    table.index(['tenant_id', 'changed_at']);
    table.index('new_status');
    table.index('changed_by');
  });

  // Additional indexes for ticket_state_history
  await knex.raw(`
    CREATE INDEX idx_ticket_state_history_tenant_ticket ON ticket_state_history (tenant_id, ticket_id, changed_at DESC);
    CREATE INDEX idx_ticket_state_history_status_transition ON ticket_state_history (previous_status, new_status);
    CREATE INDEX idx_ticket_state_history_by_actor ON ticket_state_history (changed_by, changed_at DESC) WHERE changed_by IS NOT NULL;
  `);

  // ============================================================================
  // SECTION 4: ADDITIONAL CHECK CONSTRAINTS
  // ============================================================================

  // tickets table CHECK constraints
  await knex.raw(`
    ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status
    CHECK (status IN (
      'available', 'reserved', 'sold', 'minted', 'active', 'transferred',
      'checked_in', 'used', 'revoked', 'refunded', 'expired', 'cancelled'
    ));

    ALTER TABLE tickets ADD CONSTRAINT chk_tickets_price_positive
    CHECK (price IS NULL OR price >= 0);

    ALTER TABLE tickets ADD CONSTRAINT chk_tickets_face_value_positive
    CHECK (face_value IS NULL OR face_value >= 0);

    ALTER TABLE tickets ADD CONSTRAINT chk_tickets_transfer_count_positive
    CHECK (transfer_count IS NULL OR transfer_count >= 0);
  `);

  // ticket_transfers table CHECK constraints
  await knex.raw(`
    ALTER TABLE ticket_transfers ADD CONSTRAINT chk_ticket_transfers_price_cents_positive
    CHECK (price_cents IS NULL OR price_cents >= 0);

    ALTER TABLE ticket_transfers ADD CONSTRAINT chk_ticket_transfers_different_users
    CHECK (from_user_id IS NULL OR to_user_id IS NULL OR from_user_id <> to_user_id);
  `);

  // reservations table CHECK constraint
  await knex.raw(`
    ALTER TABLE reservations ADD CONSTRAINT chk_reservations_quantity_positive
    CHECK (quantity > 0);
  `);

  // ticket_types table CHECK constraints
  await knex.raw(`
    ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_price_positive
    CHECK (price >= 0);

    ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_quantity_positive
    CHECK (quantity > 0);

    ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_available_quantity_positive
    CHECK (available_quantity >= 0);

    ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_available_lte_quantity
    CHECK (available_quantity <= quantity);

    ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_max_purchase_positive
    CHECK (max_purchase > 0);
  `);

  // ============================================================================
  // SECTION 5: ADDITIONAL UNIQUE INDEXES
  // ============================================================================

  await knex.raw(`
    -- ticket_scans unique indexes
    CREATE UNIQUE INDEX uq_ticket_scans_ticket_event ON ticket_scans (ticket_id, event_id) WHERE event_id IS NOT NULL;
    CREATE UNIQUE INDEX uq_ticket_scans_valid_scan ON ticket_scans (ticket_id) WHERE result = 'valid';

    -- tickets unique indexes
    CREATE UNIQUE INDEX uq_tickets_token_mint ON tickets (token_mint) WHERE token_mint IS NOT NULL;
    CREATE UNIQUE INDEX uq_tickets_qr_code ON tickets (qr_code) WHERE qr_code IS NOT NULL;
    CREATE UNIQUE INDEX uq_tickets_event_seat ON tickets (event_id, section, row, seat)
      WHERE section IS NOT NULL AND row IS NOT NULL AND seat IS NOT NULL
      AND status NOT IN ('cancelled', 'refunded', 'expired');

    -- ticket_types unique index
    CREATE UNIQUE INDEX uq_ticket_types_event_name ON ticket_types (event_id, name);

    -- ticket_transfers unique index (from 006)
    CREATE UNIQUE INDEX uq_ticket_transfers_unique ON ticket_transfers (ticket_id, from_user_id, to_user_id, transferred_at);
  `);

  // ============================================================================
  // SECTION 6: FOREIGN KEY CONSTRAINTS
  // ============================================================================

  // ticket_types FKs
  await knex.raw(`
    ALTER TABLE ticket_types ADD CONSTRAINT fk_ticket_types_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_types ADD CONSTRAINT fk_ticket_types_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  `);

  // reservations FKs
  await knex.raw(`
    ALTER TABLE reservations ADD CONSTRAINT fk_reservations_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE reservations ADD CONSTRAINT fk_reservations_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

    ALTER TABLE reservations ADD CONSTRAINT fk_reservations_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT;

    ALTER TABLE reservations ADD CONSTRAINT fk_reservations_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  `);

  // tickets FKs
  await knex.raw(`
    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_original_purchaser
    FOREIGN KEY (original_purchaser_id) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_validated_by
    FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_status_changed_by
    FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_checked_in_by
    FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // ticket_transfers FKs
  await knex.raw(`
    ALTER TABLE ticket_transfers ADD CONSTRAINT fk_ticket_transfers_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

    ALTER TABLE ticket_transfers ADD CONSTRAINT fk_ticket_transfers_from_user
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE ticket_transfers ADD CONSTRAINT fk_ticket_transfers_to_user
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // ticket_validations FKs
  await knex.raw(`
    ALTER TABLE ticket_validations ADD CONSTRAINT fk_ticket_validations_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

    ALTER TABLE ticket_validations ADD CONSTRAINT fk_ticket_validations_validator
    FOREIGN KEY (validator_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // refunds FKs
  await knex.raw(`
    ALTER TABLE refunds ADD CONSTRAINT fk_refunds_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
  `);

  // waitlist FKs
  await knex.raw(`
    ALTER TABLE waitlist ADD CONSTRAINT fk_waitlist_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE waitlist ADD CONSTRAINT fk_waitlist_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE;

    ALTER TABLE waitlist ADD CONSTRAINT fk_waitlist_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  `);

  // ticket_price_history FKs
  await knex.raw(`
    ALTER TABLE ticket_price_history ADD CONSTRAINT fk_ticket_price_history_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE;

    ALTER TABLE ticket_price_history ADD CONSTRAINT fk_ticket_price_history_changed_by
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // ticket_holds FKs
  await knex.raw(`
    ALTER TABLE ticket_holds ADD CONSTRAINT fk_ticket_holds_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_holds ADD CONSTRAINT fk_ticket_holds_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE;

    ALTER TABLE ticket_holds ADD CONSTRAINT fk_ticket_holds_held_by
    FOREIGN KEY (held_by) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // ticket_bundles FKs
  await knex.raw(`
    ALTER TABLE ticket_bundles ADD CONSTRAINT fk_ticket_bundles_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  `);

  // ticket_bundle_items FKs
  await knex.raw(`
    ALTER TABLE ticket_bundle_items ADD CONSTRAINT fk_ticket_bundle_items_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_bundle_items ADD CONSTRAINT fk_ticket_bundle_items_bundle
    FOREIGN KEY (bundle_id) REFERENCES ticket_bundles(id) ON DELETE CASCADE;

    ALTER TABLE ticket_bundle_items ADD CONSTRAINT fk_ticket_bundle_items_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT;
  `);

  // ticket_audit_log FKs
  await knex.raw(`
    ALTER TABLE ticket_audit_log ADD CONSTRAINT fk_ticket_audit_log_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_audit_log ADD CONSTRAINT fk_ticket_audit_log_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

    ALTER TABLE ticket_audit_log ADD CONSTRAINT fk_ticket_audit_log_performed_by
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // ticket_notifications FKs
  await knex.raw(`
    ALTER TABLE ticket_notifications ADD CONSTRAINT fk_ticket_notifications_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_notifications ADD CONSTRAINT fk_ticket_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

    ALTER TABLE ticket_notifications ADD CONSTRAINT fk_ticket_notifications_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
  `);

  // order_discounts FKs
  await knex.raw(`
    ALTER TABLE order_discounts ADD CONSTRAINT fk_order_discounts_discount
    FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE RESTRICT;
  `);

  // ticket_scans FKs
  await knex.raw(`
    ALTER TABLE ticket_scans ADD CONSTRAINT fk_ticket_scans_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE ticket_scans ADD CONSTRAINT fk_ticket_scans_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

    ALTER TABLE ticket_scans ADD CONSTRAINT fk_ticket_scans_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

    ALTER TABLE ticket_scans ADD CONSTRAINT fk_ticket_scans_scanned_by
    FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // pending_transactions FKs
  await knex.raw(`
    ALTER TABLE pending_transactions ADD CONSTRAINT fk_pending_transactions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE pending_transactions ADD CONSTRAINT fk_pending_transactions_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

    ALTER TABLE pending_transactions ADD CONSTRAINT fk_pending_transactions_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

    ALTER TABLE pending_transactions ADD CONSTRAINT fk_pending_transactions_from_user
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE pending_transactions ADD CONSTRAINT fk_pending_transactions_to_user
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // blockchain_sync_log FKs
  await knex.raw(`
    ALTER TABLE blockchain_sync_log ADD CONSTRAINT fk_blockchain_sync_log_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE blockchain_sync_log ADD CONSTRAINT fk_blockchain_sync_log_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
  `);

  // idempotency_keys FKs (FIX: Added)
  await knex.raw(`
    ALTER TABLE idempotency_keys ADD CONSTRAINT fk_idempotency_keys_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  `);

  // multisig_approvals FKs
  await knex.raw(`
    ALTER TABLE multisig_approvals ADD CONSTRAINT fk_multisig_approvals_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE multisig_approvals ADD CONSTRAINT fk_multisig_approvals_request
    FOREIGN KEY (request_id) REFERENCES multisig_approval_requests(id) ON DELETE CASCADE;
  `);

  // multisig_rejections FKs
  await knex.raw(`
    ALTER TABLE multisig_rejections ADD CONSTRAINT fk_multisig_rejections_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    ALTER TABLE multisig_rejections ADD CONSTRAINT fk_multisig_rejections_request
    FOREIGN KEY (request_id) REFERENCES multisig_approval_requests(id) ON DELETE CASCADE;
  `);

  // ticket_state_history FKs
  await knex.raw(`
    ALTER TABLE ticket_state_history ADD CONSTRAINT fk_ticket_state_history_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
  `);

  // ============================================================================
  // SECTION 7: ROW LEVEL SECURITY
  // ============================================================================

  // --------------------------------------------------------------------------
  // RLS Policy Pattern (standardized with system bypass)
  // --------------------------------------------------------------------------

  // Tables with tenant_id that need RLS
  const rlsTables = [
    'ticket_types',
    'reservations',
    'ticket_transfers',
    'ticket_validations',
    'refunds',
    'waitlist',
    'ticket_price_history',
    'ticket_holds',
    'ticket_bundles',
    'ticket_bundle_items',
    'ticket_audit_log',
    'ticket_notifications',
    'discounts',
    'order_discounts',
    'outbox',
    'reservation_history',
    'ticket_scans',
    'pending_transactions',
    'blockchain_sync_log',
    'idempotency_keys',
    'spending_limits',
    'multisig_approval_requests',
    'multisig_approvals',
    'multisig_rejections',
    'spending_transactions',
    'ticket_state_history'
  ];

  for (const tableName of rlsTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        );
    `);
  }

  // --------------------------------------------------------------------------
  // tickets table - special RLS with multiple policies
  // --------------------------------------------------------------------------
  await knex.raw('ALTER TABLE tickets ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE tickets FORCE ROW LEVEL SECURITY');

  // Users can view their own tickets
  await knex.raw(`
    CREATE POLICY tickets_view_own ON tickets
      FOR SELECT
      USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  `);

  // Users can update their own tickets
  await knex.raw(`
    CREATE POLICY tickets_update_own ON tickets
      FOR UPDATE
      USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  `);

  // Admin access
  await knex.raw(`
    CREATE POLICY tickets_admin_all ON tickets
      FOR ALL
      USING (current_setting('app.current_user_role', true) IN ('admin', 'superadmin'));
  `);

  // Tenant isolation with system bypass
  await knex.raw(`
    CREATE POLICY tickets_tenant_isolation ON tickets
      FOR ALL
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      );
  `);

  // ============================================================================
  // SECTION 8: FUNCTIONS (25 total)
  // ============================================================================

  // --------------------------------------------------------------------------
  // Functions from 001: Reservation management
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_ticket_availability_on_reservation()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'confirmed' THEN
        UPDATE ticket_types
        SET available_quantity = available_quantity - NEW.quantity
        WHERE id = NEW.ticket_type_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION release_ticket_availability()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status = 'confirmed' AND NEW.status IN ('expired', 'cancelled') THEN
        UPDATE ticket_types
        SET available_quantity = available_quantity + OLD.quantity
        WHERE id = OLD.ticket_type_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // --------------------------------------------------------------------------
  // Functions from 001: User stats
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_user_ticket_stats()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'active' THEN
        UPDATE users
        SET ticket_purchase_count = ticket_purchase_count + 1
        WHERE id = NEW.user_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_user_events_attended()
    RETURNS TRIGGER AS $$
    DECLARE
      v_event_id UUID;
    BEGIN
      IF (TG_OP = 'UPDATE' AND
          NEW.status IN ('used') AND
          OLD.status NOT IN ('used') AND
          NEW.deleted_at IS NULL) THEN

        v_event_id := NEW.event_id;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          IF NOT EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.user_id = NEW.user_id
              AND t.event_id = v_event_id
              AND t.status IN ('used')
              AND t.id != NEW.id
              AND t.deleted_at IS NULL
          ) THEN
            UPDATE users
            SET
              events_attended = events_attended + 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.user_id;
          END IF;
        END IF;

      ELSIF (TG_OP = 'UPDATE' AND
             OLD.status IN ('used') AND
             NEW.status NOT IN ('used')) THEN

        v_event_id := NEW.event_id;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          IF NOT EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.user_id = NEW.user_id
              AND t.event_id = v_event_id
              AND t.status IN ('used')
              AND t.id != NEW.id
              AND t.deleted_at IS NULL
          ) THEN
            UPDATE users
            SET
              events_attended = GREATEST(events_attended - 1, 0),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.user_id;
          END IF;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // --------------------------------------------------------------------------
  // Functions from 002: Scan detection
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_duplicate_scan(
      p_ticket_id UUID,
      p_time_window_seconds INT DEFAULT 30
    ) RETURNS TABLE (
      is_duplicate BOOLEAN,
      last_scan_at TIMESTAMPTZ,
      scan_count INT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        COUNT(*) > 0 AS is_duplicate,
        MAX(scanned_at) AS last_scan_at,
        COUNT(*)::INT AS scan_count
      FROM ticket_scans
      WHERE ticket_id = p_ticket_id
        AND scanned_at > NOW() - (p_time_window_seconds || ' seconds')::INTERVAL
        AND result IN ('valid', 'duplicate');
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION record_scan_attempt(
      p_tenant_id UUID,
      p_ticket_id UUID,
      p_event_id UUID,
      p_scanned_by UUID DEFAULT NULL,
      p_device_id VARCHAR DEFAULT NULL,
      p_location VARCHAR DEFAULT NULL,
      p_result VARCHAR DEFAULT 'valid',
      p_rejection_reason TEXT DEFAULT NULL,
      p_ip_address INET DEFAULT NULL,
      p_user_agent TEXT DEFAULT NULL
    ) RETURNS UUID AS $$
    DECLARE
      scan_id UUID;
    BEGIN
      INSERT INTO ticket_scans (
        tenant_id, ticket_id, event_id, scanned_by,
        device_id, location, result, rejection_reason,
        ip_address, user_agent
      ) VALUES (
        p_tenant_id, p_ticket_id, p_event_id, p_scanned_by,
        p_device_id, p_location, p_result, p_rejection_reason,
        p_ip_address, p_user_agent
      )
      RETURNING id INTO scan_id;

      RETURN scan_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // --------------------------------------------------------------------------
  // Functions from 003: Blockchain tracking
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_pending_transaction(
      p_tenant_id UUID,
      p_tx_signature VARCHAR,
      p_tx_type VARCHAR,
      p_ticket_id UUID DEFAULT NULL,
      p_event_id UUID DEFAULT NULL,
      p_from_user_id UUID DEFAULT NULL,
      p_to_user_id UUID DEFAULT NULL,
      p_blockhash VARCHAR DEFAULT NULL,
      p_last_valid_block_height BIGINT DEFAULT NULL
    ) RETURNS UUID AS $$
    DECLARE
      tx_id UUID;
    BEGIN
      INSERT INTO pending_transactions (
        tenant_id, tx_signature, tx_type, ticket_id, event_id,
        from_user_id, to_user_id, blockhash, last_valid_block_height
      ) VALUES (
        p_tenant_id, p_tx_signature, p_tx_type, p_ticket_id, p_event_id,
        p_from_user_id, p_to_user_id, p_blockhash, p_last_valid_block_height
      )
      RETURNING id INTO tx_id;

      RETURN tx_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION confirm_transaction(
      p_tx_signature VARCHAR,
      p_slot BIGINT,
      p_block_time TIMESTAMPTZ DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    DECLARE
      tx_record RECORD;
    BEGIN
      SELECT * INTO tx_record
      FROM pending_transactions
      WHERE tx_signature = p_tx_signature
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;

      UPDATE pending_transactions
      SET
        status = 'confirmed',
        slot = p_slot,
        block_time = COALESCE(p_block_time, NOW()),
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE tx_signature = p_tx_signature;

      INSERT INTO blockchain_sync_log (
        tenant_id, event_type, tx_signature, ticket_id,
        action_taken, severity
      ) VALUES (
        tx_record.tenant_id, 'transaction_confirmed', p_tx_signature,
        tx_record.ticket_id, 'status_updated', 'info'
      );

      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION fail_transaction(
      p_tx_signature VARCHAR,
      p_error_code VARCHAR,
      p_error_message TEXT DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    DECLARE
      tx_record RECORD;
    BEGIN
      SELECT * INTO tx_record
      FROM pending_transactions
      WHERE tx_signature = p_tx_signature
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;

      UPDATE pending_transactions
      SET
        status = 'failed',
        error_code = p_error_code,
        error_message = p_error_message,
        failed_at = NOW(),
        updated_at = NOW()
      WHERE tx_signature = p_tx_signature;

      INSERT INTO blockchain_sync_log (
        tenant_id, event_type, tx_signature, ticket_id,
        action_taken, severity, metadata
      ) VALUES (
        tx_record.tenant_id, 'transaction_failed', p_tx_signature,
        tx_record.ticket_id, 'marked_failed', 'error',
        jsonb_build_object('error_code', p_error_code, 'error_message', p_error_message)
      );

      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION has_pending_transaction(
      p_ticket_id UUID
    ) RETURNS BOOLEAN AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM pending_transactions
        WHERE ticket_id = p_ticket_id
          AND status IN ('pending', 'confirming')
      );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_pending_transaction_status(
      p_tx_signature VARCHAR
    ) RETURNS TABLE (
      status VARCHAR,
      confirmation_count INT,
      slot BIGINT,
      error_code VARCHAR,
      error_message TEXT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        pt.status,
        pt.confirmation_count,
        pt.slot,
        pt.error_code,
        pt.error_message
      FROM pending_transactions pt
      WHERE pt.tx_signature = p_tx_signature;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // --------------------------------------------------------------------------
  // Functions from 004: RLS helpers
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_tenant_id()
    RETURNS UUID AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid tenant ID format - must be UUID';
      WHEN undefined_object THEN
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID)
    RETURNS VOID AS $$
    BEGIN
      IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant ID cannot be null';
      END IF;
      PERFORM set_config('app.current_tenant_id', tenant_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION clear_tenant_context()
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', '', true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION verify_tenant_context()
    RETURNS BOOLEAN AS $$
    DECLARE
      tid UUID;
    BEGIN
      tid := current_tenant_id();
      RETURN tid IS NOT NULL;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_tenant_violation(
      p_attempted_tenant_id UUID,
      p_actual_tenant_id UUID,
      p_table_name TEXT,
      p_operation TEXT,
      p_details JSONB DEFAULT NULL
    ) RETURNS VOID AS $$
    BEGIN
      INSERT INTO tenant_access_violations (
        attempted_tenant_id,
        actual_tenant_id,
        table_name,
        operation,
        details
      ) VALUES (
        p_attempted_tenant_id,
        p_actual_tenant_id,
        p_table_name,
        p_operation,
        p_details
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // --------------------------------------------------------------------------
  // Functions from 005: Idempotency
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION acquire_idempotency_key(
      p_tenant_id UUID,
      p_idempotency_key VARCHAR(255),
      p_operation VARCHAR(100),
      p_request_hash VARCHAR(64),
      p_lock_holder VARCHAR(255),
      p_lock_duration INTERVAL DEFAULT INTERVAL '5 minutes'
    ) RETURNS TABLE (
      key_id UUID,
      status VARCHAR(50),
      is_new BOOLEAN,
      is_locked BOOLEAN,
      response_status INTEGER,
      response_body JSONB,
      resource_id UUID
    ) AS $$
    DECLARE
      v_key_id UUID;
      v_status VARCHAR(50);
      v_is_new BOOLEAN := false;
      v_is_locked BOOLEAN := false;
      v_response_status INTEGER;
      v_response_body JSONB;
      v_resource_id UUID;
      v_lock_expires TIMESTAMPTZ;
    BEGIN
      INSERT INTO idempotency_keys (
        tenant_id,
        idempotency_key,
        operation,
        request_hash,
        status,
        locked_at,
        locked_by,
        lock_expires_at
      ) VALUES (
        p_tenant_id,
        p_idempotency_key,
        p_operation,
        p_request_hash,
        'processing',
        NOW(),
        p_lock_holder,
        NOW() + p_lock_duration
      )
      ON CONFLICT (tenant_id, idempotency_key, operation) DO NOTHING
      RETURNING id, idempotency_keys.status INTO v_key_id, v_status;

      IF v_key_id IS NOT NULL THEN
        v_is_new := true;
        v_is_locked := true;
        v_status := 'processing';
      ELSE
        SELECT
          ik.id,
          ik.status,
          ik.response_status,
          ik.response_body,
          ik.resource_id,
          ik.lock_expires_at
        INTO
          v_key_id,
          v_status,
          v_response_status,
          v_response_body,
          v_resource_id,
          v_lock_expires
        FROM idempotency_keys ik
        WHERE ik.tenant_id = p_tenant_id
          AND ik.idempotency_key = p_idempotency_key
          AND ik.operation = p_operation
        FOR UPDATE NOWAIT;

        IF v_status = 'processing' AND v_lock_expires < NOW() THEN
          UPDATE idempotency_keys
          SET locked_at = NOW(),
              locked_by = p_lock_holder,
              lock_expires_at = NOW() + p_lock_duration
          WHERE id = v_key_id;
          v_is_locked := true;
        ELSIF v_status = 'processing' THEN
          v_is_locked := false;
        ELSE
          v_is_locked := false;
        END IF;
      END IF;

      RETURN QUERY SELECT
        v_key_id,
        v_status,
        v_is_new,
        v_is_locked,
        v_response_status,
        v_response_body,
        v_resource_id;

    EXCEPTION
      WHEN lock_not_available THEN
        RETURN QUERY SELECT
          NULL::UUID,
          'processing'::VARCHAR(50),
          false,
          false,
          NULL::INTEGER,
          NULL::JSONB,
          NULL::UUID;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION complete_idempotency_key(
      p_key_id UUID,
      p_status VARCHAR(50),
      p_response_status INTEGER,
      p_response_body JSONB,
      p_resource_id UUID DEFAULT NULL,
      p_resource_type VARCHAR(100) DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    BEGIN
      UPDATE idempotency_keys
      SET status = p_status,
          response_status = p_response_status,
          response_body = p_response_body,
          resource_id = p_resource_id,
          resource_type = p_resource_type,
          locked_at = NULL,
          locked_by = NULL,
          lock_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_key_id;

      RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION release_idempotency_lock(
      p_key_id UUID,
      p_set_failed BOOLEAN DEFAULT false
    ) RETURNS BOOLEAN AS $$
    BEGIN
      IF p_set_failed THEN
        UPDATE idempotency_keys
        SET status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = NOW()
        WHERE id = p_key_id;
      ELSE
        UPDATE idempotency_keys
        SET locked_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = NOW()
        WHERE id = p_key_id
          AND status = 'processing';
      END IF;

      RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
    RETURNS INTEGER AS $$
    DECLARE
      deleted_count INTEGER;
    BEGIN
      WITH deleted AS (
        DELETE FROM idempotency_keys
        WHERE expires_at < NOW()
        RETURNING *
      )
      SELECT COUNT(*) INTO deleted_count FROM deleted;

      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // --------------------------------------------------------------------------
  // Functions from 006: State machine helpers
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION can_check_in_ticket(
      p_ticket_id UUID,
      p_event_start TIMESTAMPTZ,
      p_event_end TIMESTAMPTZ
    ) RETURNS BOOLEAN AS $$
    DECLARE
      v_status VARCHAR;
      v_window_start TIMESTAMPTZ;
      v_window_end TIMESTAMPTZ;
    BEGIN
      SELECT status INTO v_status
      FROM tickets WHERE id = p_ticket_id;

      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;

      IF v_status NOT IN ('active', 'transferred') THEN
        RETURN FALSE;
      END IF;

      v_window_start := p_event_start - INTERVAL '4 hours';
      v_window_end := p_event_end + INTERVAL '2 hours';

      RETURN NOW() BETWEEN v_window_start AND v_window_end;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_ticket_transfer_history(
      p_ticket_id UUID
    ) RETURNS TABLE (
      transfer_id UUID,
      from_user_id UUID,
      to_user_id UUID,
      transferred_at TIMESTAMPTZ,
      blockchain_confirmed BOOLEAN,
      tx_signature VARCHAR
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        tt.id,
        tt.from_user_id,
        tt.to_user_id,
        tt.transferred_at,
        tt.blockchain_confirmed,
        tt.tx_signature
      FROM ticket_transfers tt
      WHERE tt.ticket_id = p_ticket_id
      ORDER BY tt.transferred_at ASC;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // --------------------------------------------------------------------------
  // Functions from 011: State history
  // --------------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_ticket_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO ticket_state_history (
          ticket_id,
          tenant_id,
          previous_status,
          new_status,
          changed_by,
          changed_by_type,
          reason,
          source,
          metadata,
          changed_at
        ) VALUES (
          NEW.id,
          NEW.tenant_id,
          OLD.status,
          NEW.status,
          NULLIF(current_setting('app.current_user_id', true), '')::uuid,
          COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system'),
          NULLIF(current_setting('app.status_change_reason', true), ''),
          NULLIF(current_setting('app.status_change_source', true), ''),
          JSONB_BUILD_OBJECT(
            'old_user_id', OLD.user_id,
            'new_user_id', NEW.user_id,
            'old_price', OLD.price,
            'new_price', NEW.price,
            'token_mint', NEW.token_mint,
            'event_id', NEW.event_id
          ),
          NOW()
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_ticket_state_history(
      p_ticket_id UUID,
      p_limit INT DEFAULT 100
    )
    RETURNS TABLE (
      id UUID,
      previous_status VARCHAR,
      new_status VARCHAR,
      changed_by UUID,
      changed_by_type VARCHAR,
      reason VARCHAR,
      source VARCHAR,
      metadata JSONB,
      changed_at TIMESTAMPTZ
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        h.id,
        h.previous_status,
        h.new_status,
        h.changed_by,
        h.changed_by_type,
        h.reason,
        h.source,
        h.metadata,
        h.changed_at
      FROM ticket_state_history h
      WHERE h.ticket_id = p_ticket_id
      ORDER BY h.changed_at DESC
      LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_ticket_status_change_manual(
      p_ticket_id UUID,
      p_tenant_id UUID,
      p_previous_status VARCHAR,
      p_new_status VARCHAR,
      p_changed_by UUID DEFAULT NULL,
      p_changed_by_type VARCHAR DEFAULT 'system',
      p_reason VARCHAR DEFAULT NULL,
      p_source VARCHAR DEFAULT NULL,
      p_metadata JSONB DEFAULT '{}'::JSONB
    )
    RETURNS UUID AS $$
    DECLARE
      v_history_id UUID;
    BEGIN
      INSERT INTO ticket_state_history (
        ticket_id,
        tenant_id,
        previous_status,
        new_status,
        changed_by,
        changed_by_type,
        reason,
        source,
        metadata
      ) VALUES (
        p_ticket_id,
        p_tenant_id,
        p_previous_status,
        p_new_status,
        p_changed_by,
        p_changed_by_type,
        p_reason,
        p_source,
        p_metadata
      ) RETURNING id INTO v_history_id;

      RETURN v_history_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ============================================================================
  // SECTION 9: TRIGGERS (6 total)
  // ============================================================================

  // Reservation triggers
  await knex.raw(`
    CREATE TRIGGER trg_update_availability_on_reservation
    AFTER INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_availability_on_reservation();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_release_availability
    AFTER UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION release_ticket_availability();
  `);

  // Ticket triggers
  await knex.raw(`
    CREATE TRIGGER trg_update_user_stats
    AFTER INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_ticket_stats();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_user_events_attended
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_events_attended();
  `);

  // Status change trigger (from 011 - keeping this one, removed 006's duplicate)
  await knex.raw(`
    CREATE TRIGGER tr_ticket_status_change
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION log_ticket_status_change();
  `);

  // Audit trigger (conditional - only if audit_trigger_function exists)
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function') THEN
        CREATE TRIGGER audit_tickets_changes
          AFTER INSERT OR UPDATE OR DELETE ON tickets
          FOR EACH ROW
          EXECUTE FUNCTION audit_trigger_function();
      END IF;
    END $$;
  `);

  // ============================================================================
  // SECTION 10: VIEWS (2 total)
  // ============================================================================

  // View from 004: RLS role status
  await knex.raw(`
    CREATE OR REPLACE VIEW rls_role_status AS
    SELECT
      r.rolname as role_name,
      r.rolsuper as is_superuser,
      r.rolbypassrls as can_bypass_rls,
      r.rolinherit as inherits_roles,
      r.rolcreaterole as can_create_role,
      r.rolcreatedb as can_create_db,
      r.rolcanlogin as can_login,
      r.rolconnlimit as connection_limit,
      CASE
        WHEN r.rolsuper THEN 'CRITICAL: Role is superuser!'
        WHEN r.rolbypassrls THEN 'WARNING: Role can bypass RLS!'
        ELSE 'OK: Role is properly configured for RLS'
      END as security_status
    FROM pg_roles r
    WHERE r.rolname = current_user;
  `);

  // View from 011: Recent ticket transitions
  await knex.raw(`
    CREATE OR REPLACE VIEW v_recent_ticket_transitions AS
    SELECT
      h.id,
      h.ticket_id,
      h.tenant_id,
      h.previous_status,
      h.new_status,
      h.changed_by,
      h.changed_by_type,
      h.reason,
      h.source,
      h.changed_at,
      t.event_id,
      t.user_id,
      t.token_mint
    FROM ticket_state_history h
    JOIN tickets t ON h.ticket_id = t.id
    WHERE h.changed_at > NOW() - INTERVAL '24 hours'
    ORDER BY h.changed_at DESC;
  `);

  // ============================================================================
  // SECTION 11: COMMENTS
  // ============================================================================

  await knex.raw(`
    COMMENT ON TABLE ticket_scans IS 'Audit log of all ticket scan attempts for security and duplicate detection';
    COMMENT ON TABLE pending_transactions IS 'Tracks blockchain transactions from submission to confirmation for DB-blockchain consistency';
    COMMENT ON TABLE blockchain_sync_log IS 'Audit log of blockchain synchronization events for debugging and alerting';
    COMMENT ON TABLE ticket_state_history IS 'Audit trail for all ticket status changes';
    COMMENT ON TABLE ticket_transfers IS 'Transfer history for tickets, linked to blockchain transactions';

    COMMENT ON COLUMN tickets.status_reason IS 'Reason for current status (required for revoked/refunded)';
    COMMENT ON COLUMN tickets.token_mint IS 'Solana NFT token mint address';
    COMMENT ON COLUMN ticket_state_history.previous_status IS 'Status before the change (NULL for initial creation)';
    COMMENT ON COLUMN ticket_state_history.new_status IS 'Status after the change';
    COMMENT ON COLUMN ticket_state_history.changed_by IS 'User or service ID that initiated the change';
    COMMENT ON COLUMN ticket_state_history.changed_by_type IS 'Type of actor: user, system, admin, service';
    COMMENT ON COLUMN ticket_state_history.reason IS 'Human-readable reason for the status change';
    COMMENT ON COLUMN ticket_state_history.source IS 'Origin of the change: API endpoint, job, service';
    COMMENT ON COLUMN ticket_state_history.metadata IS 'Additional context as JSON';

    COMMENT ON FUNCTION log_ticket_status_change() IS 'Trigger function to auto-log status changes';
    COMMENT ON FUNCTION get_ticket_state_history(UUID, INT) IS 'Get status change history for a ticket';
    COMMENT ON FUNCTION log_ticket_status_change_manual(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB) IS 'Manually log a status change (for imports, migrations)';
  `);

  console.log('✅ Ticket service consolidated migration completed successfully');
  console.log('   - 30 tables created');
  console.log('   - 25 functions created');
  console.log('   - 6 triggers created');
  console.log('   - 1 enum type created');
  console.log('   - 2 views created');
  console.log('   - RLS enabled on 27 tables with standardized policies');
}

export async function down(knex: Knex): Promise<void> {
  // ============================================================================
  // DROP VIEWS
  // ============================================================================
  await knex.raw('DROP VIEW IF EXISTS v_recent_ticket_transitions');
  await knex.raw('DROP VIEW IF EXISTS rls_role_status');

  // ============================================================================
  // DROP TRIGGERS
  // ============================================================================
  await knex.raw('DROP TRIGGER IF EXISTS audit_tickets_changes ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS tr_ticket_status_change ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_user_events_attended ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_user_stats ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trg_release_availability ON reservations');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_availability_on_reservation ON reservations');

  // ============================================================================
  // DROP FUNCTIONS
  // ============================================================================
  await knex.raw('DROP FUNCTION IF EXISTS log_ticket_status_change_manual(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB)');
  await knex.raw('DROP FUNCTION IF EXISTS get_ticket_state_history(UUID, INT)');
  await knex.raw('DROP FUNCTION IF EXISTS log_ticket_status_change()');
  await knex.raw('DROP FUNCTION IF EXISTS get_ticket_transfer_history(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS can_check_in_ticket(UUID, TIMESTAMPTZ, TIMESTAMPTZ)');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys()');
  await knex.raw('DROP FUNCTION IF EXISTS release_idempotency_lock(UUID, BOOLEAN)');
  await knex.raw('DROP FUNCTION IF EXISTS complete_idempotency_key(UUID, VARCHAR, INTEGER, JSONB, UUID, VARCHAR)');
  await knex.raw('DROP FUNCTION IF EXISTS acquire_idempotency_key(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTERVAL)');
  await knex.raw('DROP FUNCTION IF EXISTS log_tenant_violation(UUID, UUID, TEXT, TEXT, JSONB)');
  await knex.raw('DROP FUNCTION IF EXISTS verify_tenant_context()');
  await knex.raw('DROP FUNCTION IF EXISTS clear_tenant_context()');
  await knex.raw('DROP FUNCTION IF EXISTS set_tenant_context(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS current_tenant_id()');
  await knex.raw('DROP FUNCTION IF EXISTS get_pending_transaction_status(VARCHAR)');
  await knex.raw('DROP FUNCTION IF EXISTS has_pending_transaction(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS fail_transaction(VARCHAR, VARCHAR, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS confirm_transaction(VARCHAR, BIGINT, TIMESTAMPTZ)');
  await knex.raw('DROP FUNCTION IF EXISTS create_pending_transaction(UUID, VARCHAR, VARCHAR, UUID, UUID, UUID, UUID, VARCHAR, BIGINT)');
  await knex.raw('DROP FUNCTION IF EXISTS record_scan_attempt(UUID, UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, INET, TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS check_duplicate_scan(UUID, INT)');
  await knex.raw('DROP FUNCTION IF EXISTS update_user_events_attended()');
  await knex.raw('DROP FUNCTION IF EXISTS update_user_ticket_stats()');
  await knex.raw('DROP FUNCTION IF EXISTS release_ticket_availability()');
  await knex.raw('DROP FUNCTION IF EXISTS update_ticket_availability_on_reservation()');

  // ============================================================================
  // DROP RLS POLICIES
  // ============================================================================
  const rlsTables = [
    'ticket_types',
    'reservations',
    'ticket_transfers',
    'ticket_validations',
    'refunds',
    'waitlist',
    'ticket_price_history',
    'ticket_holds',
    'ticket_bundles',
    'ticket_bundle_items',
    'ticket_audit_log',
    'ticket_notifications',
    'discounts',
    'order_discounts',
    'outbox',
    'reservation_history',
    'ticket_scans',
    'pending_transactions',
    'blockchain_sync_log',
    'idempotency_keys',
    'spending_limits',
    'multisig_approval_requests',
    'multisig_approvals',
    'multisig_rejections',
    'spending_transactions',
    'ticket_state_history'
  ];

  for (const tableName of rlsTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // tickets table special policies
  await knex.raw('DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_admin_all ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_update_own ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_view_own ON tickets');
  await knex.raw('ALTER TABLE tickets DISABLE ROW LEVEL SECURITY');

  // ============================================================================
  // DROP TABLES (reverse order respecting FKs)
  // ============================================================================
  await knex.schema.dropTableIfExists('ticket_state_history');
  await knex.schema.dropTableIfExists('spending_transactions');
  await knex.schema.dropTableIfExists('multisig_rejections');
  await knex.schema.dropTableIfExists('multisig_approvals');
  await knex.schema.dropTableIfExists('multisig_approval_requests');
  await knex.schema.dropTableIfExists('account_lockout_events');
  await knex.schema.dropTableIfExists('spending_limits');
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('tenant_access_violations');
  await knex.schema.dropTableIfExists('blockchain_sync_log');
  await knex.schema.dropTableIfExists('pending_transactions');
  await knex.schema.dropTableIfExists('ticket_scans');
  await knex.schema.dropTableIfExists('webhook_nonces');
  await knex.schema.dropTableIfExists('reservation_history');
  await knex.schema.dropTableIfExists('outbox');
  await knex.schema.dropTableIfExists('order_discounts');
  await knex.schema.dropTableIfExists('discounts');
  await knex.schema.dropTableIfExists('ticket_notifications');
  await knex.schema.dropTableIfExists('ticket_audit_log');
  await knex.schema.dropTableIfExists('ticket_bundle_items');
  await knex.schema.dropTableIfExists('ticket_bundles');
  await knex.schema.dropTableIfExists('ticket_holds');
  await knex.schema.dropTableIfExists('ticket_price_history');
  await knex.schema.dropTableIfExists('waitlist');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('ticket_validations');
  await knex.schema.dropTableIfExists('ticket_transfers');
  await knex.schema.dropTableIfExists('tickets');
  await knex.schema.dropTableIfExists('reservations');
  await knex.schema.dropTableIfExists('ticket_types');

  // ============================================================================
  // DROP ENUM TYPES
  // ============================================================================
  await knex.raw('DROP TYPE IF EXISTS revocation_reason');

  console.log('✅ Ticket service consolidated migration rolled back successfully');
}
