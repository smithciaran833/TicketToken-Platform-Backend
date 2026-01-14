/**
 * Migration: Add Unique Constraints
 * 
 * Adds missing unique constraints to prevent duplicate data
 * and ensure data integrity across ticket service tables.
 * 
 * Batch 24 Fix: DB integrity - unique constraints for preventing duplicates
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // HELPER: Check if index exists
  // ==========================================================================
  const indexExists = async (indexName: string): Promise<boolean> => {
    const result = await knex.raw(`
      SELECT 1 FROM pg_indexes WHERE indexname = ?
    `, [indexName]);
    return result.rows.length > 0;
  };

  // ==========================================================================
  // TICKET_SCANS TABLE - Unique Constraints
  // Prevent duplicate scans for the same ticket at the same event
  // ==========================================================================
  
  const scansExists = await knex.schema.hasTable('ticket_scans');
  if (scansExists) {
    // Unique constraint on (ticket_id, event_id) to prevent duplicate entry scans
    if (!(await indexExists('uq_ticket_scans_ticket_event'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_ticket_scans_ticket_event 
        ON ticket_scans(ticket_id, event_id)
        WHERE event_id IS NOT NULL;
      `).catch(async () => {
        // CONCURRENTLY may not work in transaction, try without
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_scans_ticket_event 
          ON ticket_scans(ticket_id, event_id)
          WHERE event_id IS NOT NULL;
        `);
      });
    }

    // Additional unique constraint: only one successful scan per ticket
    // Allows multiple scan attempts but only one 'valid' scan
    if (!(await indexExists('uq_ticket_scans_valid_scan'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_ticket_scans_valid_scan 
        ON ticket_scans(ticket_id)
        WHERE status = 'valid' OR status IS NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_scans_valid_scan 
          ON ticket_scans(ticket_id)
          WHERE status = 'valid' OR status IS NULL;
        `);
      });
    }
  }

  // ==========================================================================
  // IDEMPOTENCY_KEYS TABLE - Unique Constraints
  // Ensure idempotency keys are unique per tenant and operation
  // ==========================================================================
  
  const idempotencyExists = await knex.schema.hasTable('idempotency_keys');
  if (idempotencyExists) {
    // Unique constraint on (tenant_id, idempotency_key, operation)
    if (!(await indexExists('uq_idempotency_tenant_key_operation'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_idempotency_tenant_key_operation 
        ON idempotency_keys(tenant_id, idempotency_key, operation);
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_tenant_key_operation 
          ON idempotency_keys(tenant_id, idempotency_key, operation);
        `);
      });
    }

    // Alternative: unique on just (tenant_id, idempotency_key) if operation is not used
    if (!(await indexExists('uq_idempotency_tenant_key'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_idempotency_tenant_key 
        ON idempotency_keys(tenant_id, idempotency_key)
        WHERE operation IS NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_tenant_key 
          ON idempotency_keys(tenant_id, idempotency_key)
          WHERE operation IS NULL;
        `);
      });
    }
  }

  // ==========================================================================
  // TICKETS TABLE - Unique Constraints
  // ==========================================================================
  
  // Unique NFT mint address - one ticket per NFT
  if (!(await indexExists('uq_tickets_nft_mint'))) {
    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tickets_nft_mint 
      ON tickets(nft_mint)
      WHERE nft_mint IS NOT NULL;
    `).catch(async () => {
      await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_nft_mint 
        ON tickets(nft_mint)
        WHERE nft_mint IS NOT NULL;
      `);
    });
  }

  // Unique QR code - one ticket per QR code
  if (!(await indexExists('uq_tickets_qr_code'))) {
    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tickets_qr_code 
      ON tickets(qr_code)
      WHERE qr_code IS NOT NULL;
    `).catch(async () => {
      await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_qr_code 
        ON tickets(qr_code)
        WHERE qr_code IS NOT NULL;
      `);
    });
  }

  // Unique barcode - one ticket per barcode
  if (!(await indexExists('uq_tickets_barcode'))) {
    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tickets_barcode 
      ON tickets(barcode)
      WHERE barcode IS NOT NULL;
    `).catch(async () => {
      await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_barcode 
        ON tickets(barcode)
        WHERE barcode IS NOT NULL;
      `);
    });
  }

  // Unique seat assignment per event (for seated events)
  if (!(await indexExists('uq_tickets_event_seat'))) {
    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tickets_event_seat 
      ON tickets(event_id, section, row_number, seat_number)
      WHERE section IS NOT NULL AND row_number IS NOT NULL AND seat_number IS NOT NULL
        AND status NOT IN ('cancelled', 'refunded', 'expired');
    `).catch(async () => {
      await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_event_seat 
        ON tickets(event_id, section, row_number, seat_number)
        WHERE section IS NOT NULL AND row_number IS NOT NULL AND seat_number IS NOT NULL
          AND status NOT IN ('cancelled', 'refunded', 'expired');
      `);
    });
  }

  // ==========================================================================
  // PENDING_TRANSACTIONS TABLE - Unique Constraints
  // ==========================================================================
  
  const pendingTxExists = await knex.schema.hasTable('pending_transactions');
  if (pendingTxExists) {
    // Unique transaction signature
    if (!(await indexExists('uq_pending_tx_signature'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_pending_tx_signature 
        ON pending_transactions(tx_signature);
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_tx_signature 
          ON pending_transactions(tx_signature);
        `);
      });
    }
  }

  // ==========================================================================
  // TRANSFERS TABLE - Unique Constraints
  // ==========================================================================
  
  const transfersExists = await knex.schema.hasTable('transfers');
  if (transfersExists) {
    // Unique transfer ID (if not primary key)
    if (!(await indexExists('uq_transfers_transfer_id'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_transfers_transfer_id 
        ON transfers(transfer_id)
        WHERE transfer_id IS NOT NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_transfer_id 
          ON transfers(transfer_id)
          WHERE transfer_id IS NOT NULL;
        `);
      });
    }
  }

  // ==========================================================================
  // TICKET_TYPES TABLE - Unique Constraints (if exists)
  // ==========================================================================
  
  const ticketTypesExists = await knex.schema.hasTable('ticket_types');
  if (ticketTypesExists) {
    // Unique ticket type name per event
    if (!(await indexExists('uq_ticket_types_event_name'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_ticket_types_event_name 
        ON ticket_types(event_id, name);
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_types_event_name 
          ON ticket_types(event_id, name);
        `);
      });
    }
  }

  // ==========================================================================
  // ORDERS TABLE - Unique Constraints (if exists)
  // ==========================================================================
  
  const ordersExists = await knex.schema.hasTable('orders');
  if (ordersExists) {
    // Unique order number
    if (!(await indexExists('uq_orders_order_number'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_orders_order_number 
        ON orders(order_number)
        WHERE order_number IS NOT NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_number 
          ON orders(order_number)
          WHERE order_number IS NOT NULL;
        `);
      });
    }

    // Unique payment intent ID (for Stripe)
    if (!(await indexExists('uq_orders_payment_intent'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_orders_payment_intent 
        ON orders(payment_intent_id)
        WHERE payment_intent_id IS NOT NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_payment_intent 
          ON orders(payment_intent_id)
          WHERE payment_intent_id IS NOT NULL;
        `);
      });
    }
  }

  // ==========================================================================
  // RESERVATIONS TABLE - Unique Constraints (if exists)
  // ==========================================================================
  
  const reservationsExists = await knex.schema.hasTable('reservations');
  if (reservationsExists) {
    // Unique reservation code
    if (!(await indexExists('uq_reservations_code'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_reservations_code 
        ON reservations(reservation_code)
        WHERE reservation_code IS NOT NULL;
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_code 
          ON reservations(reservation_code)
          WHERE reservation_code IS NOT NULL;
        `);
      });
    }

    // Prevent double reservations for same ticket
    if (!(await indexExists('uq_reservations_ticket_active'))) {
      await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_reservations_ticket_active 
        ON reservations(ticket_id)
        WHERE status = 'active' OR status = 'pending';
      `).catch(async () => {
        await knex.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_ticket_active 
          ON reservations(ticket_id)
          WHERE status = 'active' OR status = 'pending';
        `);
      });
    }
  }

  console.log('Migration 009: Unique constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  // ==========================================================================
  // Remove Unique Indexes
  // ==========================================================================
  
  // Ticket scans
  await knex.raw(`DROP INDEX IF EXISTS uq_ticket_scans_ticket_event`);
  await knex.raw(`DROP INDEX IF EXISTS uq_ticket_scans_valid_scan`);

  // Idempotency keys
  await knex.raw(`DROP INDEX IF EXISTS uq_idempotency_tenant_key_operation`);
  await knex.raw(`DROP INDEX IF EXISTS uq_idempotency_tenant_key`);

  // Tickets
  await knex.raw(`DROP INDEX IF EXISTS uq_tickets_nft_mint`);
  await knex.raw(`DROP INDEX IF EXISTS uq_tickets_qr_code`);
  await knex.raw(`DROP INDEX IF EXISTS uq_tickets_barcode`);
  await knex.raw(`DROP INDEX IF EXISTS uq_tickets_event_seat`);

  // Pending transactions
  await knex.raw(`DROP INDEX IF EXISTS uq_pending_tx_signature`);

  // Transfers
  await knex.raw(`DROP INDEX IF EXISTS uq_transfers_transfer_id`);

  // Ticket types
  await knex.raw(`DROP INDEX IF EXISTS uq_ticket_types_event_name`);

  // Orders
  await knex.raw(`DROP INDEX IF EXISTS uq_orders_order_number`);
  await knex.raw(`DROP INDEX IF EXISTS uq_orders_payment_intent`);

  // Reservations
  await knex.raw(`DROP INDEX IF EXISTS uq_reservations_code`);
  await knex.raw(`DROP INDEX IF EXISTS uq_reservations_ticket_active`);

  console.log('Migration 009: Unique constraints removed');
}
