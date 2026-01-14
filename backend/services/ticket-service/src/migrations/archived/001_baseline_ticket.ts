import { Knex } from 'knex';

/**
 * COMBINED BASELINE MIGRATION - Ticket Service
 *
 * This migration combines:
 * - Original 001: All 15 table creations + stored procedures + triggers
 * - Original 002: All foreign key constraints
 * - Original 003: All performance indexes
 * - FIX: Added missing reservation_id and is_validated columns to tickets table
 * - FIX: Removed orders-related trigger (moved to order-service)
 * - FIX: Added tenant_id and discount_type to order_discounts table
 *
 * Migration Date: 2024-11-22
 * Updated: 2024-12-12 - Added tenant_id, discount_type to order_discounts
 * Combined from: 001_baseline_ticket.ts, 002_add_foreign_keys.ts, 003_add_performance_indexes.ts
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Starting comprehensive ticket service baseline migration...');

  // ==========================================
  // STEP 1: ENABLE UUID EXTENSION
  // ==========================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // NOTE: Tenants table is created by auth-service
  // This service only references it via FK constraints

  // ==========================================
  // STEP 2: CREATE ALL TABLES
  // ==========================================

  // 2.1: TICKET_TYPES TABLE
  await knex.schema.createTable('ticket_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

    // Indexes
    table.index(['tenant_id', 'event_id']);
    table.index('is_active');
    table.index('available_quantity');
  });

  // 2.2: RESERVATIONS TABLE
  await knex.schema.createTable('reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index(['tenant_id', 'event_id']);
    table.index('status');
    table.index('expires_at');
  });

  // 2.3: TICKETS TABLE (WITH MISSING COLUMNS ADDED)
  await knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').index();
    table.uuid('original_purchaser_id').index().comment('First purchaser, tracked for analytics');
    table.uuid('reservation_id').index();
    table.string('ticket_number', 50).notNullable().unique();
    table.string('qr_code', 255).notNullable();
    table.decimal('price_cents', 10, 2);
    table.decimal('price', 10, 2).comment('Purchase price in dollars (for user dashboard)');
    table.decimal('face_value', 10, 2).comment('Original face value from ticket type');
    table.string('section', 20);
    table.string('row', 10);
    table.string('seat', 10);
    table.enum('status', ['active', 'used', 'cancelled', 'transferred']).defaultTo('active');
    table.boolean('is_validated').defaultTo(false);
    table.boolean('is_transferable').defaultTo(true);
    table.integer('transfer_count').defaultTo(0);
    table.boolean('is_nft').defaultTo(false).comment('Whether ticket is minted as NFT');
    table.string('payment_id', 255);
    table.timestamp('purchased_at');
    table.timestamp('purchase_date');
    table.timestamp('validated_at');
    table.uuid('validated_by');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at');

    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index(['event_id', 'status']);
    table.index('status');
    table.index('ticket_number');
    table.index('is_validated');
    table.index('purchased_at');
    table.index('is_nft');
  });

  // 2.4: TICKET_TRANSFERS TABLE
  await knex.schema.createTable('ticket_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

    // Constraints
    table.check('?? >= 0', ['price_cents']);
    table.check('?? > ??', ['expires_at', 'created_at']);

    // Indexes
    table.index('status');
    table.index('to_email');
    table.index('acceptance_code');
    table.index(['status', 'expires_at']);
    table.index(['from_user_id', 'status']);
    table.index(['to_user_id', 'status']);
  });

  // 2.5: TICKET_VALIDATIONS TABLE
  await knex.schema.createTable('ticket_validations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_id').notNullable().index();
    table.uuid('validator_id').index();
    table.timestamp('validated_at').notNullable().defaultTo(knex.fn.now());
    table.string('validation_method', 50);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // 2.6: REFUNDS TABLE
  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('order_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.decimal('amount', 10, 2).notNullable();
    table.enum('status', ['pending', 'approved', 'rejected', 'completed']).defaultTo('pending');
    table.text('reason');
    table.timestamp('processed_at');
    table.timestamps(true, true);

    // Indexes
    table.index('status');
  });

  // 2.9: WAITLIST TABLE
  await knex.schema.createTable('waitlist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.enum('status', ['active', 'notified', 'expired', 'converted']).defaultTo('active');
    table.timestamp('notified_at');
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'ticket_type_id']);
    table.index('status');
  });

  // 2.10: TICKET_PRICE_HISTORY TABLE
  await knex.schema.createTable('ticket_price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.decimal('old_price', 10, 2).notNullable();
    table.decimal('new_price', 10, 2).notNullable();
    table.uuid('changed_by').index();
    table.text('reason');
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
  });

  // 2.11: TICKET_HOLDS TABLE
  await knex.schema.createTable('ticket_holds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.string('hold_reason', 255);
    table.uuid('held_by').index();
    table.timestamp('expires_at');
    table.enum('status', ['active', 'released', 'expired']).defaultTo('active');
    table.timestamps(true, true);

    // Indexes
    table.index('status');
  });

  // 2.12: TICKET_BUNDLES TABLE
  await knex.schema.createTable('ticket_bundles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('name', 100).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.decimal('discount_percentage', 5, 2);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // 2.13: TICKET_BUNDLE_ITEMS TABLE
  await knex.schema.createTable('ticket_bundle_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('bundle_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.timestamps(true, true);
  });

  // 2.14: TICKET_AUDIT_LOG TABLE
  await knex.schema.createTable('ticket_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.string('action', 50).notNullable();
    table.uuid('performed_by').index();
    table.jsonb('old_values');
    table.jsonb('new_values');
    table.string('ip_address', 45);
    table.string('user_agent', 255);
    table.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['tenant_id', 'performed_at']);
    table.index('action');
  });

  // 2.15: TICKET_NOTIFICATIONS TABLE
  await knex.schema.createTable('ticket_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.uuid('ticket_id').index();
    table.enum('type', ['purchase', 'transfer', 'validation', 'cancellation', 'reminder']).notNullable();
    table.enum('status', ['pending', 'sent', 'failed']).defaultTo('pending');
    table.text('message');
    table.timestamp('sent_at');
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index('status');
  });

  // 2.16: DISCOUNTS TABLE
  await knex.schema.createTable('discounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('code', 50).notNullable();
    table.string('discount_type', 20).notNullable(); // 'percentage', 'fixed'
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

  // 2.17: ORDER_DISCOUNTS TABLE (Updated with tenant_id and discount_type)
  await knex.schema.createTable('order_discounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('order_id').notNullable().index();
    table.uuid('discount_id').notNullable().index();
    table.string('discount_code', 50).notNullable();
    table.string('discount_type', 20).notNullable(); // 'percentage', 'fixed'
    table.integer('amount_cents').notNullable();
    table.timestamp('applied_at').notNullable().defaultTo(knex.fn.now());

    // Index for tenant isolation
    table.index(['tenant_id', 'order_id']);
  });

  await knex.schema.createTable('outbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

  // 2.19: RESERVATION_HISTORY TABLE
  await knex.schema.createTable('reservation_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

  // 2.20: WEBHOOK_NONCES TABLE
  await knex.schema.createTable('webhook_nonces', (table) => {
    table.string('nonce', 255).primary();
    table.string('endpoint', 255).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();

    table.index('expires_at');
  });

  // ==========================================
  // STEP 3: ALTER EXISTING TABLES
  // ==========================================

  // Add ticket-related columns to users table (if exists)
  if (await knex.schema.hasTable('users')) {
    await knex.schema.alterTable('users', (table) => {
      if (!knex.schema.hasColumn('users', 'ticket_purchase_count')) {
        table.integer('ticket_purchase_count').defaultTo(0);
      }
      if (!knex.schema.hasColumn('users', 'total_spent')) {
        table.decimal('total_spent', 10, 2).defaultTo(0);
      }
    });
  }

  // Add ticket-related columns to events table (if exists)
  if (await knex.schema.hasTable('events')) {
    await knex.schema.alterTable('events', (table) => {
      if (!knex.schema.hasColumn('events', 'tickets_sold')) {
        table.integer('tickets_sold').defaultTo(0);
      }
      if (!knex.schema.hasColumn('events', 'revenue')) {
        table.decimal('revenue', 12, 2).defaultTo(0);
      }
    });
  }

  // Add ticket-related columns to venues table (if exists)
  if (await knex.schema.hasTable('venues')) {
    await knex.schema.alterTable('venues', (table) => {
      if (!knex.schema.hasColumn('venues', 'seating_capacity')) {
        table.integer('seating_capacity');
      }
    });
  }

  // ==========================================
  // STEP 4: ADD FOREIGN KEY CONSTRAINTS
  // ==========================================

  // 4.1: TICKET_TYPES foreign keys
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE ticket_types
        ADD CONSTRAINT fk_ticket_types_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.schema.alterTable('ticket_types', (table) => {
    table.foreign('event_id')
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });

  // 4.2: RESERVATIONS foreign keys
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE reservations
        ADD CONSTRAINT fk_reservations_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.schema.alterTable('reservations', (table) => {
    table.foreign('event_id')
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.foreign('ticket_type_id')
      .references('id')
      .inTable('ticket_types')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });

  // 4.3: TICKETS foreign keys
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE tickets
        ADD CONSTRAINT fk_tickets_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.schema.alterTable('tickets', (table) => {
    table.foreign('event_id')
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.foreign('ticket_type_id')
      .references('id')
      .inTable('ticket_types')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
  });

  // 4.4: TICKET_TRANSFERS foreign keys
  if (await knex.schema.hasTable('ticket_transfers')) {
    await knex.schema.alterTable('ticket_transfers', (table) => {
      table.foreign('ticket_id')
        .references('id')
        .inTable('tickets')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.foreign('from_user_id')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.foreign('to_user_id')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');
    });
  }

  // 4.5: TICKET_VALIDATIONS foreign keys
  if (await knex.schema.hasTable('ticket_validations')) {
    await knex.schema.alterTable('ticket_validations', (table) => {
      table.foreign('ticket_id')
        .references('id')
        .inTable('tickets')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.foreign('validator_id')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');
    });
  }

  // 4.6: TICKET_BUNDLES, WAITLIST, TICKET_HOLDS, TICKET_AUDIT_LOG, TICKET_NOTIFICATIONS FK constraints
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE ticket_bundles
        ADD CONSTRAINT fk_ticket_bundles_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE waitlist
        ADD CONSTRAINT fk_waitlist_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE ticket_holds
        ADD CONSTRAINT fk_ticket_holds_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE ticket_audit_log
        ADD CONSTRAINT fk_ticket_audit_log_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE ticket_notifications
        ADD CONSTRAINT fk_ticket_notifications_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 4.7: ORDER_DISCOUNTS foreign key to discounts
  await knex.schema.alterTable('order_discounts', (table) => {
    table.foreign('discount_id')
      .references('id')
      .inTable('discounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
  });

  // ==========================================
  // STEP 5: ADD PERFORMANCE INDEXES
  // ==========================================

  // 5.1: TICKET_TYPES indexes
  await knex.schema.alterTable('ticket_types', (table) => {
    table.index(['sale_start', 'sale_end'], 'idx_ticket_types_sale_period');
    table.index(['tenant_id', 'is_active'], 'idx_ticket_types_tenant_active');
    table.index('available_quantity', 'idx_ticket_types_available_quantity');
  });

  // 5.2: RESERVATIONS indexes
  await knex.schema.alterTable('reservations', (table) => {
    table.index(['status', 'expires_at'], 'idx_reservations_status_expires');
    table.index(['tenant_id', 'status'], 'idx_reservations_tenant_status');
    table.index('created_at', 'idx_reservations_created_at');
  });

  // 5.3: TICKETS indexes
  await knex.schema.alterTable('tickets', (table) => {
    table.index(['tenant_id', 'status'], 'idx_tickets_tenant_status');
    table.index(['user_id', 'status'], 'idx_tickets_user_status');
    table.index(['ticket_type_id', 'status'], 'idx_tickets_type_status');
    table.index('validated_at', 'idx_tickets_validated_at');
    table.index('created_at', 'idx_tickets_created_at');
  });

  // 5.4: TICKET_TRANSFERS indexes
  await knex.schema.alterTable('ticket_transfers', (table) => {
    table.index(['from_user_id', 'status'], 'idx_transfers_from_user_status');
    table.index(['to_user_id', 'status'], 'idx_transfers_to_user_status');
    table.index('created_at', 'idx_transfers_created_at');
  });

  // 5.5: TICKET_AUDIT_LOG indexes
  await knex.schema.alterTable('ticket_audit_log', (table) => {
    table.index(['ticket_id', 'performed_at'], 'idx_audit_ticket_performed');
    table.index(['tenant_id', 'action'], 'idx_audit_tenant_action');
  });

  // 5.8: WAITLIST indexes
  await knex.schema.alterTable('waitlist', (table) => {
    table.index(['tenant_id', 'ticket_type_id', 'status'], 'idx_waitlist_tenant_type_status');
    table.index('created_at', 'idx_waitlist_created_at');
  });

  // ==========================================
  // STEP 6: CREATE STORED PROCEDURES
  // ==========================================

  // Update ticket availability when reservation is created
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

  // Release ticket availability when reservation expires/cancelled
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

  // Update user stats on ticket purchase
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

  // Update events_attended when ticket is redeemed
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_user_events_attended()
    RETURNS TRIGGER AS $$
    DECLARE
      v_event_id UUID;
    BEGIN
      -- When ticket status changes to used
      IF (TG_OP = 'UPDATE' AND 
          NEW.status IN ('used') AND 
          OLD.status NOT IN ('used') AND
          NEW.deleted_at IS NULL) THEN
        
        -- Get event_id from tickets table
        v_event_id := NEW.event_id;
        
        -- Check if users table exists and if user has already attended this event
        -- Only increment if this is their first ticket for this event
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
        
      -- When ticket is un-redeemed (status changes back)
      ELSIF (TG_OP = 'UPDATE' AND 
             OLD.status IN ('used') AND 
             NEW.status NOT IN ('used')) THEN
        
        v_event_id := NEW.event_id;
        
        -- Only decrement if this was the user's only ticket for this event
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

  // NOTE: update_event_revenue function and trigger moved to order-service
  // since it operates on the orders table which is owned by order-service

  // ==========================================
  // STEP 7: CREATE TRIGGERS
  // ==========================================

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

  await knex.raw(`
    CREATE TRIGGER trg_update_user_stats
    AFTER INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_ticket_stats();
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_user_events_attended ON tickets;
    CREATE TRIGGER trigger_update_user_events_attended
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_events_attended();
  `);

  console.log('✅ User aggregate trigger (events_attended) created on tickets');

  // NOTE: trg_update_event_revenue trigger moved to order-service

  // Audit trigger for tickets table (compliance & fraud tracking)
  const functionExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function'
    );
  `);

  if (!functionExists.rows[0].exists) {
    console.warn('⚠️  audit_trigger_function not found - run auth-service migrations first');
  } else {
    await knex.raw(`
      DROP TRIGGER IF EXISTS audit_tickets_changes ON tickets;
      CREATE TRIGGER audit_tickets_changes
        AFTER INSERT OR UPDATE OR DELETE ON tickets
        FOR EACH ROW 
        EXECUTE FUNCTION audit_trigger_function();
    `);
    console.log('✅ Audit trigger attached to tickets table');
  }

  // ==========================================
  // STEP 8: ADD MISSING FOREIGN KEY CONSTRAINTS
  // ==========================================
  console.log('');
  console.log('🔗 Adding missing foreign key constraints...');

  // tickets table missing FKs
  await knex.schema.alterTable('tickets', (table) => {
    table.foreign('original_purchaser_id').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('reservation_id').references('id').inTable('reservations').onDelete('SET NULL');
    table.foreign('validated_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ tickets → users (original_purchaser, validated_by), reservations');

  // refunds table FKs - order_id FK will be added when orders table exists
  await knex.schema.alterTable('refunds', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
  });
  console.log('✅ refunds → tickets');

  // waitlist table FKs
  await knex.schema.alterTable('waitlist', (table) => {
    table.foreign('ticket_type_id').references('id').inTable('ticket_types').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ waitlist → ticket_types, users');

  // ticket_price_history table FKs
  await knex.schema.alterTable('ticket_price_history', (table) => {
    table.foreign('ticket_type_id').references('id').inTable('ticket_types').onDelete('CASCADE');
    table.foreign('changed_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ ticket_price_history → ticket_types, users');

  // ticket_holds table FKs
  await knex.schema.alterTable('ticket_holds', (table) => {
    table.foreign('ticket_type_id').references('id').inTable('ticket_types').onDelete('CASCADE');
    table.foreign('held_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ ticket_holds → ticket_types, users');

  // ticket_bundle_items table FKs
  await knex.schema.alterTable('ticket_bundle_items', (table) => {
    table.foreign('bundle_id').references('id').inTable('ticket_bundles').onDelete('CASCADE');
    table.foreign('ticket_type_id').references('id').inTable('ticket_types').onDelete('RESTRICT');
  });
  console.log('✅ ticket_bundle_items → ticket_bundles, ticket_types');

  // ticket_audit_log table FKs
  await knex.schema.alterTable('ticket_audit_log', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
    table.foreign('performed_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ ticket_audit_log → tickets, users');

  // ticket_notifications table FKs
  await knex.schema.alterTable('ticket_notifications', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
  });
  console.log('✅ ticket_notifications → users, tickets');

  console.log('✅ All FK constraints added');

  // ==========================================
  // ENABLE ROW LEVEL SECURITY
  // ==========================================
  console.log('');
  console.log('🔒 Enabling Row Level Security on tickets table...');

  await knex.raw('ALTER TABLE tickets ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE tickets FORCE ROW LEVEL SECURITY');

  // Tickets: Users can view their own tickets
  await knex.raw(`
    CREATE POLICY tickets_view_own ON tickets
      FOR SELECT
      USING (user_id = current_setting('app.current_user_id', TRUE)::UUID)
  `);

  // Tickets: Users can update their own tickets
  await knex.raw(`
    CREATE POLICY tickets_update_own ON tickets
      FOR UPDATE
      USING (user_id = current_setting('app.current_user_id', TRUE)::UUID)
  `);

  // Tickets: Venue owners can view tickets for their venues
  await knex.raw(`
    CREATE POLICY tickets_venue_owner_view ON tickets
      FOR SELECT
      USING (
        venue_id IN (
          SELECT id FROM venues 
          WHERE created_by = current_setting('app.current_user_id', TRUE)::UUID
        )
      )
  `);

  // Tickets: Admin access
  await knex.raw(`
    CREATE POLICY tickets_admin_all ON tickets
      FOR ALL
      USING (
        current_setting('app.current_user_role', TRUE) IN ('admin', 'superadmin')
      )
  `);

  // Tickets: Tenant isolation
  await knex.raw(`
    CREATE POLICY tickets_tenant_isolation ON tickets
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  `);

  console.log('✅ RLS policies created for tickets table');

  // ==========================================
  // ENABLE RLS ON ALL OTHER TABLES
  // ==========================================
  console.log('');
  console.log('🔒 Enabling Row Level Security on all ticket-service tables...');

  // Enable RLS on all tenant-scoped tables
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
    'ticket_audit_log',
    'ticket_notifications',
    'discounts',
    'order_discounts',
    'outbox',
    'reservation_history'
  ];

  for (const tableName of rlsTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    `);
    console.log(`✅ RLS enabled on ${tableName}`);
  }

  console.log('✅ RLS policies created for all ticket-service tables');

  console.log('Comprehensive ticket service baseline migration completed successfully with RLS!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Rolling back comprehensive ticket service baseline migration...');

  // Drop RLS policies for all tenant-scoped tables
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
    'ticket_audit_log',
    'ticket_notifications',
    'discounts',
    'order_discounts',
    'outbox',
    'reservation_history'
  ];

  for (const tableName of rlsTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop RLS policies for tickets table
  await knex.raw('DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_admin_all ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_venue_owner_view ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_update_own ON tickets');
  await knex.raw('DROP POLICY IF EXISTS tickets_view_own ON tickets');
  await knex.raw('ALTER TABLE tickets DISABLE ROW LEVEL SECURITY');

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS audit_tickets_changes ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_user_events_attended ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_user_stats ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trg_release_availability ON reservations');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_availability_on_reservation ON reservations');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_user_events_attended()');
  await knex.raw('DROP FUNCTION IF EXISTS update_user_ticket_stats()');
  await knex.raw('DROP FUNCTION IF EXISTS release_ticket_availability()');
  await knex.raw('DROP FUNCTION IF EXISTS update_ticket_availability_on_reservation()');

  // Drop tables in reverse order of creation (respecting foreign keys)
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

  // Revert changes to existing tables (if they exist)
  if (await knex.schema.hasTable('users')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('ticket_purchase_count');
      table.dropColumn('total_spent');
    });
  }

  if (await knex.schema.hasTable('events')) {
    await knex.schema.alterTable('events', (table) => {
      table.dropColumn('tickets_sold');
      table.dropColumn('revenue');
    });
  }

  if (await knex.schema.hasTable('venues')) {
    await knex.schema.alterTable('venues', (table) => {
      table.dropColumn('seating_capacity');
    });
  }

  console.log('Comprehensive ticket service baseline migration rollback completed!');
}
