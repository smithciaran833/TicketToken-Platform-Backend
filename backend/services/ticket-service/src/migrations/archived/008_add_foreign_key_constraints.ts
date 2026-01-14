/**
 * Migration: Add Foreign Key Constraints
 * 
 * Adds missing foreign key constraints to ensure referential integrity
 * across ticket service tables.
 * 
 * Batch 24 Fix: DB integrity - proper FK relationships
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // HELPER: Check if constraint exists
  // ==========================================================================
  const constraintExists = async (tableName: string, constraintName: string): Promise<boolean> => {
    const result = await knex.raw(`
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = ? AND constraint_name = ?
    `, [tableName, constraintName]);
    return result.rows.length > 0;
  };

  // ==========================================================================
  // TICKETS TABLE - Foreign Keys
  // ==========================================================================
  
  // tickets.event_id → events.id (cross-service reference - soft FK via check)
  // Note: Cannot add actual FK to external service table, using check constraint pattern
  if (!(await constraintExists('tickets', 'fk_tickets_tenant_id'))) {
    await knex.raw(`
      ALTER TABLE tickets 
      ADD CONSTRAINT fk_tickets_tenant_id 
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) 
      ON DELETE CASCADE
    `).catch(() => {
      // tenants table may not exist in this service
      console.log('Note: tenants FK skipped - table may be in different service');
    });
  }

  // tickets.owner_id - soft reference to users service
  // We add a check constraint for UUID format instead of FK
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tickets_owner_id_format'
      ) THEN
        ALTER TABLE tickets ADD CONSTRAINT chk_tickets_owner_id_format
        CHECK (owner_id IS NULL OR owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
      END IF;
    END $$;
  `);

  // tickets.event_id - soft reference to events service
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tickets_event_id_format'
      ) THEN
        ALTER TABLE tickets ADD CONSTRAINT chk_tickets_event_id_format
        CHECK (event_id IS NULL OR event_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
      END IF;
    END $$;
  `);

  // tickets.ticket_type_id - self-reference or reference to ticket_types
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'tickets' AND constraint_name = 'fk_tickets_ticket_type_id'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_types'
      ) THEN
        ALTER TABLE tickets 
        ADD CONSTRAINT fk_tickets_ticket_type_id 
        FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) 
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // ==========================================================================
  // ORDERS TABLE - Foreign Keys
  // ==========================================================================
  
  // Check if orders table exists
  const ordersExists = await knex.schema.hasTable('orders');
  if (ordersExists) {
    // orders.ticket_id → tickets.id
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'orders' AND constraint_name = 'fk_orders_ticket_id'
        ) THEN
          ALTER TABLE orders 
          ADD CONSTRAINT fk_orders_ticket_id 
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // orders.user_id - soft reference
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_user_id_format'
        ) THEN
          ALTER TABLE orders ADD CONSTRAINT chk_orders_user_id_format
          CHECK (user_id IS NULL OR user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        END IF;
      END $$;
    `);
  }

  // ==========================================================================
  // TRANSFERS TABLE - Foreign Keys
  // ==========================================================================
  
  // Check if transfers table exists
  const transfersExists = await knex.schema.hasTable('transfers');
  if (transfersExists) {
    // transfers.ticket_id → tickets.id
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'transfers' AND constraint_name = 'fk_transfers_ticket_id'
        ) THEN
          ALTER TABLE transfers 
          ADD CONSTRAINT fk_transfers_ticket_id 
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // transfers.from_user_id / to_user_id - soft references
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_transfers_from_user_id_format'
        ) THEN
          ALTER TABLE transfers ADD CONSTRAINT chk_transfers_from_user_id_format
          CHECK (from_user_id IS NULL OR from_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_transfers_to_user_id_format'
        ) THEN
          ALTER TABLE transfers ADD CONSTRAINT chk_transfers_to_user_id_format
          CHECK (to_user_id IS NULL OR to_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        END IF;
      END $$;
    `);
  }

  // ==========================================================================
  // TICKET_SCANS TABLE - Foreign Keys
  // ==========================================================================
  
  const scansExists = await knex.schema.hasTable('ticket_scans');
  if (scansExists) {
    // ticket_scans.ticket_id → tickets.id
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'ticket_scans' AND constraint_name = 'fk_ticket_scans_ticket_id'
        ) THEN
          ALTER TABLE ticket_scans 
          ADD CONSTRAINT fk_ticket_scans_ticket_id 
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  // ==========================================================================
  // PENDING_TRANSACTIONS TABLE - Foreign Keys
  // ==========================================================================
  
  const pendingTxExists = await knex.schema.hasTable('pending_transactions');
  if (pendingTxExists) {
    // pending_transactions.ticket_id → tickets.id
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'pending_transactions' AND constraint_name = 'fk_pending_transactions_ticket_id'
        ) THEN
          ALTER TABLE pending_transactions 
          ADD CONSTRAINT fk_pending_transactions_ticket_id 
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  // ==========================================================================
  // TICKET_TRANSFERS TABLE - Foreign Keys (if different from transfers)
  // ==========================================================================
  
  const ticketTransfersExists = await knex.schema.hasTable('ticket_transfers');
  if (ticketTransfersExists) {
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'ticket_transfers' AND constraint_name = 'fk_ticket_transfers_ticket_id'
        ) THEN
          ALTER TABLE ticket_transfers 
          ADD CONSTRAINT fk_ticket_transfers_ticket_id 
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  // ==========================================================================
  // Create indexes to support FK lookups
  // ==========================================================================
  
  // These indexes improve FK lookup performance
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_owner_id ON tickets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);
  `);

  if (ordersExists) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_orders_ticket_id ON orders(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    `);
  }

  if (transfersExists) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_transfers_ticket_id ON transfers(ticket_id);
    `);
  }

  console.log('Migration 008: Foreign key constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  // ==========================================================================
  // Remove Foreign Key Constraints
  // ==========================================================================
  
  // Tickets table
  await knex.raw(`
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS fk_tickets_tenant_id;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS fk_tickets_ticket_type_id;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_owner_id_format;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_event_id_format;
  `);

  // Orders table
  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_ticket_id;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_user_id_format;
  `).catch(() => {});

  // Transfers table
  await knex.raw(`
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS fk_transfers_ticket_id;
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS chk_transfers_from_user_id_format;
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS chk_transfers_to_user_id_format;
  `).catch(() => {});

  // Ticket scans table
  await knex.raw(`
    ALTER TABLE ticket_scans DROP CONSTRAINT IF EXISTS fk_ticket_scans_ticket_id;
  `).catch(() => {});

  // Pending transactions table
  await knex.raw(`
    ALTER TABLE pending_transactions DROP CONSTRAINT IF EXISTS fk_pending_transactions_ticket_id;
  `).catch(() => {});

  // Ticket transfers table
  await knex.raw(`
    ALTER TABLE ticket_transfers DROP CONSTRAINT IF EXISTS fk_ticket_transfers_ticket_id;
  `).catch(() => {});

  // Remove indexes
  await knex.raw(`
    DROP INDEX IF EXISTS idx_tickets_event_id;
    DROP INDEX IF EXISTS idx_tickets_owner_id;
    DROP INDEX IF EXISTS idx_tickets_ticket_type_id;
    DROP INDEX IF EXISTS idx_orders_ticket_id;
    DROP INDEX IF EXISTS idx_orders_user_id;
    DROP INDEX IF EXISTS idx_transfers_ticket_id;
  `);

  console.log('Migration 008: Foreign key constraints removed');
}
