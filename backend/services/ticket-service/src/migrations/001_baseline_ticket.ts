import { Knex } from 'knex';

/**
 * COMBINED BASELINE MIGRATION - Ticket Service
 * 
 * This migration combines:
 * - Original 001: All 15 table creations + stored procedures + triggers
 * - Original 002: All foreign key constraints
 * - Original 003: All performance indexes
 * - FIX: Added missing reservation_id and is_validated columns to tickets table
 * 
 * Migration Date: 2024-11-22
 * Combined from: 001_baseline_ticket.ts, 002_add_foreign_keys.ts, 003_add_performance_indexes.ts
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Starting comprehensive ticket service baseline migration...');

  // ==========================================
  // STEP 1: ENABLE UUID EXTENSION
  // ==========================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

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
    table.decimal('price', 10, 2).notNullable();
    table.integer('quantity').notNullable();
    table.integer('available').notNullable();
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
  });

  // 2.2: RESERVATIONS TABLE
  await knex.schema.createTable('reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.enum('status', ['pending', 'confirmed', 'expired', 'cancelled']).defaultTo('pending');
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index('status');
    table.index('expires_at');
  });

  // 2.3: TICKETS TABLE (WITH MISSING COLUMNS ADDED)
  await knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.uuid('user_id').index();
    table.uuid('reservation_id').index(); // ADDED - was missing
    table.string('ticket_number', 50).notNullable().unique();
    table.string('qr_code', 255).notNullable();
    table.enum('status', ['active', 'used', 'cancelled', 'transferred']).defaultTo('active');
    table.boolean('is_validated').defaultTo(false); // ADDED - was missing  
    table.timestamp('validated_at');
    table.uuid('validated_by');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index('status');
    table.index('ticket_number');
    table.index('is_validated');
  });

  // 2.4: TICKET_TRANSFERS TABLE
  await knex.schema.createTable('ticket_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable().index();
    table.uuid('from_user_id').index();
    table.uuid('to_user_id').index();
    table.enum('status', ['pending', 'accepted', 'rejected', 'cancelled']).defaultTo('pending');
    table.timestamp('transferred_at');
    table.timestamps(true, true);
    
    // Indexes
    table.index('status');
  });

  // 2.5: TICKET_VALIDATIONS TABLE
  await knex.schema.createTable('ticket_validations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable().index();
    table.uuid('validator_id').index();
    table.timestamp('validated_at').notNullable().defaultTo(knex.fn.now());
    table.string('validation_method', 50);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // 2.6: ORDERS TABLE
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('user_id').index();
    table.string('order_number', 50).notNullable().unique();
    table.decimal('total_amount', 10, 2).notNullable();
    table.enum('status', ['pending', 'completed', 'failed', 'refunded']).defaultTo('pending');
    table.enum('payment_status', ['pending', 'paid', 'failed', 'refunded']).defaultTo('pending');
    table.string('payment_method', 50);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index('status');
    table.index('payment_status');
  });

  // 2.7: ORDER_ITEMS TABLE
  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('order_id').notNullable().index();
    table.uuid('ticket_type_id').notNullable().index();
    table.integer('quantity').notNullable();
    table.decimal('unit_price', 10, 2).notNullable();
    table.decimal('total_price', 10, 2).notNullable();
    table.timestamps(true, true);
  });

  // 2.8: REFUNDS TABLE
  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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
  await knex.schema.alterTable('ticket_types', (table) => {
    table.foreign('event_id')
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    if (knex.client.config.client !== 'sqlite3') {
      table.foreign('tenant_id')
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    }
  });

  // 4.2: RESERVATIONS foreign keys
  await knex.schema.alterTable('reservations', (table) => {
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

    if (knex.client.config.client !== 'sqlite3') {
      table.foreign('tenant_id')
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    }
  });

  // 4.3: TICKETS foreign keys
  await knex.schema.alterTable('tickets', (table) => {
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

    if (knex.client.config.client !== 'sqlite3') {
      table.foreign('tenant_id')
        .references('id')
        .inTable('tenants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    }
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

  // 4.6: ORDERS foreign keys
  if (await knex.schema.hasTable('orders')) {
    await knex.schema.alterTable('orders', (table) => {
      table.foreign('user_id')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      if (knex.client.config.client !== 'sqlite3') {
        table.foreign('tenant_id')
          .references('id')
          .inTable('tenants')
          .onDelete('CASCADE')
          .onUpdate('CASCADE');
      }
    });
  }

  // ==========================================
  // STEP 5: ADD PERFORMANCE INDEXES
  // ==========================================
  
  // 5.1: TICKET_TYPES indexes
  await knex.schema.alterTable('ticket_types', (table) => {
    table.index(['sale_start', 'sale_end'], 'idx_ticket_types_sale_period');
    table.index(['tenant_id', 'is_active'], 'idx_ticket_types_tenant_active');
    table.index('available', 'idx_ticket_types_available');
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

  // 5.5: ORDERS indexes
  await knex.schema.alterTable('orders', (table) => {
    table.index(['tenant_id', 'status'], 'idx_orders_tenant_status');
    table.index(['tenant_id', 'payment_status'], 'idx_orders_tenant_payment_status');
    table.index('created_at', 'idx_orders_created_at');
  });

  // 5.6: ORDER_ITEMS indexes
  await knex.schema.alterTable('order_items', (table) => {
    table.index('ticket_type_id', 'idx_order_items_ticket_type');
  });

  // 5.7: TICKET_AUDIT_LOG indexes
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
        SET available = available - NEW.quantity
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
        SET available = available + OLD.quantity
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

  // Update event revenue on order completion
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_event_revenue()
    RETURNS TRIGGER AS $$
    DECLARE
      event_id_var UUID;
    BEGIN
      IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
        SELECT DISTINCT tt.event_id INTO event_id_var
        FROM order_items oi
        JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE oi.order_id = NEW.id
        LIMIT 1;
        
        IF event_id_var IS NOT NULL THEN
          UPDATE events
          SET revenue = revenue + NEW.total_amount
          WHERE id = event_id_var;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

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
    CREATE TRIGGER trg_update_event_revenue
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_event_revenue();
  `);

  console.log('Comprehensive ticket service baseline migration completed successfully!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Rolling back comprehensive ticket service baseline migration...');

  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_event_revenue ON orders');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_user_stats ON tickets');
  await knex.raw('DROP TRIGGER IF EXISTS trg_release_availability ON reservations');
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_availability_on_reservation ON reservations');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_event_revenue()');
  await knex.raw('DROP FUNCTION IF EXISTS update_user_ticket_stats()');
  await knex.raw('DROP FUNCTION IF EXISTS release_ticket_availability()');
  await knex.raw('DROP FUNCTION IF EXISTS update_ticket_availability_on_reservation()');

  // Drop tables in reverse order of creation (respecting foreign keys)
  await knex.schema.dropTableIfExists('ticket_notifications');
  await knex.schema.dropTableIfExists('ticket_audit_log');
  await knex.schema.dropTableIfExists('ticket_bundle_items');
  await knex.schema.dropTableIfExists('ticket_bundles');
  await knex.schema.dropTableIfExists('ticket_holds');
  await knex.schema.dropTableIfExists('ticket_price_history');
  await knex.schema.dropTableIfExists('waitlist');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
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
