/**
 * Migration: Add Check Constraints
 * 
 * Adds data integrity check constraints to ensure valid data values
 * across ticket service tables.
 * 
 * Batch 24 Fix: DB integrity - domain validation at database level
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // HELPER: Check if constraint exists
  // ==========================================================================
  const constraintExists = async (constraintName: string): Promise<boolean> => {
    const result = await knex.raw(`
      SELECT 1 FROM pg_constraint WHERE conname = ?
    `, [constraintName]);
    return result.rows.length > 0;
  };

  // ==========================================================================
  // TICKETS TABLE - Check Constraints
  // ==========================================================================
  
  // Valid ticket statuses
  const validStatuses = [
    'available',
    'reserved',
    'sold',
    'transferred',
    'checked_in',
    'refunded',
    'expired',
    'cancelled',
    'pending',
    'active',
    'valid',
    'used',
    'revoked'
  ];

  if (!(await constraintExists('chk_tickets_status'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status
      CHECK (status IN (${validStatuses.map(s => `'${s}'`).join(', ')}));
    `);
  }

  // Price must be non-negative
  if (!(await constraintExists('chk_tickets_price_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_price_positive
      CHECK (price IS NULL OR price >= 0);
    `);
  }

  // Face value must be non-negative
  if (!(await constraintExists('chk_tickets_face_value_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_face_value_positive
      CHECK (face_value IS NULL OR face_value >= 0);
    `);
  }

  // Resale price must be non-negative
  if (!(await constraintExists('chk_tickets_resale_price_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_resale_price_positive
      CHECK (resale_price IS NULL OR resale_price >= 0);
    `);
  }

  // Max resale price must be non-negative and >= price
  if (!(await constraintExists('chk_tickets_max_resale_price'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_max_resale_price
      CHECK (max_resale_price IS NULL OR (max_resale_price >= 0 AND (price IS NULL OR max_resale_price >= price)));
    `);
  }

  // Scan count must be non-negative
  if (!(await constraintExists('chk_tickets_scan_count_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_scan_count_positive
      CHECK (scan_count IS NULL OR scan_count >= 0);
    `);
  }

  // Transfer count must be non-negative
  if (!(await constraintExists('chk_tickets_transfer_count_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_transfer_count_positive
      CHECK (transfer_count IS NULL OR transfer_count >= 0);
    `);
  }

  // Max transfers must be non-negative
  if (!(await constraintExists('chk_tickets_max_transfers_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_max_transfers_positive
      CHECK (max_transfers IS NULL OR max_transfers >= 0);
    `);
  }

  // Seat number and row must be positive if present
  if (!(await constraintExists('chk_tickets_seat_number_positive'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_seat_number_positive
      CHECK (seat_number IS NULL OR seat_number > 0);
    `);
  }

  // Valid at must be before expires at
  if (!(await constraintExists('chk_tickets_valid_dates'))) {
    await knex.raw(`
      ALTER TABLE tickets ADD CONSTRAINT chk_tickets_valid_dates
      CHECK (valid_from IS NULL OR expires_at IS NULL OR valid_from <= expires_at);
    `);
  }

  // ==========================================================================
  // ORDERS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const ordersExists = await knex.schema.hasTable('orders');
  if (ordersExists) {
    // Valid order statuses
    const validOrderStatuses = [
      'pending',
      'processing',
      'completed',
      'cancelled',
      'refunded',
      'failed',
      'expired'
    ];

    if (!(await constraintExists('chk_orders_status'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_status
        CHECK (status IN (${validOrderStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }

    // Quantity must be positive
    if (!(await constraintExists('chk_orders_quantity_positive'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_quantity_positive
        CHECK (quantity IS NULL OR quantity > 0);
      `);
    }

    // Total amount must be non-negative
    if (!(await constraintExists('chk_orders_total_positive'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_total_positive
        CHECK (total_amount IS NULL OR total_amount >= 0);
      `);
    }

    // Subtotal must be non-negative
    if (!(await constraintExists('chk_orders_subtotal_positive'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_subtotal_positive
        CHECK (subtotal IS NULL OR subtotal >= 0);
      `);
    }

    // Fees must be non-negative
    if (!(await constraintExists('chk_orders_fees_positive'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_fees_positive
        CHECK (fees IS NULL OR fees >= 0);
      `);
    }

    // Tax must be non-negative
    if (!(await constraintExists('chk_orders_tax_positive'))) {
      await knex.raw(`
        ALTER TABLE orders ADD CONSTRAINT chk_orders_tax_positive
        CHECK (tax IS NULL OR tax >= 0);
      `);
    }
  }

  // ==========================================================================
  // TRANSFERS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const transfersExists = await knex.schema.hasTable('transfers');
  if (transfersExists) {
    // Valid transfer statuses
    const validTransferStatuses = [
      'pending',
      'processing',
      'completed',
      'cancelled',
      'failed',
      'rejected',
      'expired'
    ];

    if (!(await constraintExists('chk_transfers_status'))) {
      await knex.raw(`
        ALTER TABLE transfers ADD CONSTRAINT chk_transfers_status
        CHECK (status IS NULL OR status IN (${validTransferStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }

    // From and to user IDs must be different
    if (!(await constraintExists('chk_transfers_different_users'))) {
      await knex.raw(`
        ALTER TABLE transfers ADD CONSTRAINT chk_transfers_different_users
        CHECK (from_user_id IS NULL OR to_user_id IS NULL OR from_user_id <> to_user_id);
      `);
    }

    // Price must be non-negative
    if (!(await constraintExists('chk_transfers_price_positive'))) {
      await knex.raw(`
        ALTER TABLE transfers ADD CONSTRAINT chk_transfers_price_positive
        CHECK (price IS NULL OR price >= 0);
      `);
    }
  }

  // ==========================================================================
  // TICKET_SCANS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const scansExists = await knex.schema.hasTable('ticket_scans');
  if (scansExists) {
    // Valid scan statuses/results
    const validScanStatuses = [
      'valid',
      'invalid',
      'already_scanned',
      'expired',
      'cancelled',
      'pending',
      'error'
    ];

    if (!(await constraintExists('chk_ticket_scans_status'))) {
      await knex.raw(`
        ALTER TABLE ticket_scans ADD CONSTRAINT chk_ticket_scans_status
        CHECK (status IS NULL OR status IN (${validScanStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }
  }

  // ==========================================================================
  // PENDING_TRANSACTIONS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const pendingTxExists = await knex.schema.hasTable('pending_transactions');
  if (pendingTxExists) {
    // Valid transaction statuses
    const validTxStatuses = [
      'pending',
      'confirming',
      'confirmed',
      'failed',
      'expired',
      'cancelled'
    ];

    if (!(await constraintExists('chk_pending_tx_status'))) {
      await knex.raw(`
        ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_status
        CHECK (status IN (${validTxStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }

    // Valid transaction types
    const validTxTypes = [
      'mint',
      'transfer',
      'burn',
      'update_metadata',
      'revoke',
      'delegate'
    ];

    if (!(await constraintExists('chk_pending_tx_type'))) {
      await knex.raw(`
        ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_type
        CHECK (tx_type IS NULL OR tx_type IN (${validTxTypes.map(t => `'${t}'`).join(', ')}));
      `);
    }

    // Block height must be positive
    if (!(await constraintExists('chk_pending_tx_block_height_positive'))) {
      await knex.raw(`
        ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_block_height_positive
        CHECK (last_valid_block_height IS NULL OR last_valid_block_height > 0);
      `);
    }

    // Retry count must be non-negative
    if (!(await constraintExists('chk_pending_tx_retry_count_positive'))) {
      await knex.raw(`
        ALTER TABLE pending_transactions ADD CONSTRAINT chk_pending_tx_retry_count_positive
        CHECK (retry_count IS NULL OR retry_count >= 0);
      `);
    }
  }

  // ==========================================================================
  // RESERVATIONS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const reservationsExists = await knex.schema.hasTable('reservations');
  if (reservationsExists) {
    // Valid reservation statuses
    const validReservationStatuses = [
      'pending',
      'active',
      'completed',
      'expired',
      'cancelled'
    ];

    if (!(await constraintExists('chk_reservations_status'))) {
      await knex.raw(`
        ALTER TABLE reservations ADD CONSTRAINT chk_reservations_status
        CHECK (status IS NULL OR status IN (${validReservationStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }

    // Quantity must be positive
    if (!(await constraintExists('chk_reservations_quantity_positive'))) {
      await knex.raw(`
        ALTER TABLE reservations ADD CONSTRAINT chk_reservations_quantity_positive
        CHECK (quantity IS NULL OR quantity > 0);
      `);
    }

    // Expiry must be in the future (at creation time - enforced at app level)
    // Duration in minutes must be positive
    if (!(await constraintExists('chk_reservations_duration_positive'))) {
      await knex.raw(`
        ALTER TABLE reservations ADD CONSTRAINT chk_reservations_duration_positive
        CHECK (duration_minutes IS NULL OR duration_minutes > 0);
      `);
    }
  }

  // ==========================================================================
  // IDEMPOTENCY_KEYS TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const idempotencyExists = await knex.schema.hasTable('idempotency_keys');
  if (idempotencyExists) {
    // Status constraint
    const validIdempotencyStatuses = ['processing', 'completed', 'failed'];

    if (!(await constraintExists('chk_idempotency_status'))) {
      await knex.raw(`
        ALTER TABLE idempotency_keys ADD CONSTRAINT chk_idempotency_status
        CHECK (status IS NULL OR status IN (${validIdempotencyStatuses.map(s => `'${s}'`).join(', ')}));
      `);
    }

    // Idempotency key length constraint
    if (!(await constraintExists('chk_idempotency_key_length'))) {
      await knex.raw(`
        ALTER TABLE idempotency_keys ADD CONSTRAINT chk_idempotency_key_length
        CHECK (length(idempotency_key) >= 1 AND length(idempotency_key) <= 255);
      `);
    }
  }

  // ==========================================================================
  // TICKET_TYPES TABLE - Check Constraints (if exists)
  // ==========================================================================
  
  const ticketTypesExists = await knex.schema.hasTable('ticket_types');
  if (ticketTypesExists) {
    // Price must be non-negative
    if (!(await constraintExists('chk_ticket_types_price_positive'))) {
      await knex.raw(`
        ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_price_positive
        CHECK (price IS NULL OR price >= 0);
      `);
    }

    // Quantity must be positive
    if (!(await constraintExists('chk_ticket_types_quantity_positive'))) {
      await knex.raw(`
        ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_quantity_positive
        CHECK (quantity IS NULL OR quantity > 0);
      `);
    }

    // Available must be non-negative
    if (!(await constraintExists('chk_ticket_types_available_positive'))) {
      await knex.raw(`
        ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_available_positive
        CHECK (available IS NULL OR available >= 0);
      `);
    }

    // Available cannot exceed quantity
    if (!(await constraintExists('chk_ticket_types_available_lte_quantity'))) {
      await knex.raw(`
        ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_available_lte_quantity
        CHECK (available IS NULL OR quantity IS NULL OR available <= quantity);
      `);
    }

    // Max per order must be positive
    if (!(await constraintExists('chk_ticket_types_max_per_order_positive'))) {
      await knex.raw(`
        ALTER TABLE ticket_types ADD CONSTRAINT chk_ticket_types_max_per_order_positive
        CHECK (max_per_order IS NULL OR max_per_order > 0);
      `);
    }
  }

  console.log('Migration 010: Check constraints added successfully');
}

export async function down(knex: Knex): Promise<void> {
  // ==========================================================================
  // Remove Check Constraints
  // ==========================================================================
  
  // Tickets table
  await knex.raw(`
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_status;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_price_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_face_value_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_resale_price_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_max_resale_price;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_scan_count_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_transfer_count_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_max_transfers_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_seat_number_positive;
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_valid_dates;
  `);

  // Orders table
  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_status;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_quantity_positive;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_total_positive;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_subtotal_positive;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_fees_positive;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_tax_positive;
  `).catch(() => {});

  // Transfers table
  await knex.raw(`
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS chk_transfers_status;
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS chk_transfers_different_users;
    ALTER TABLE transfers DROP CONSTRAINT IF EXISTS chk_transfers_price_positive;
  `).catch(() => {});

  // Ticket scans table
  await knex.raw(`
    ALTER TABLE ticket_scans DROP CONSTRAINT IF EXISTS chk_ticket_scans_status;
  `).catch(() => {});

  // Pending transactions table
  await knex.raw(`
    ALTER TABLE pending_transactions DROP CONSTRAINT IF EXISTS chk_pending_tx_status;
    ALTER TABLE pending_transactions DROP CONSTRAINT IF EXISTS chk_pending_tx_type;
    ALTER TABLE pending_transactions DROP CONSTRAINT IF EXISTS chk_pending_tx_block_height_positive;
    ALTER TABLE pending_transactions DROP CONSTRAINT IF EXISTS chk_pending_tx_retry_count_positive;
  `).catch(() => {});

  // Reservations table
  await knex.raw(`
    ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status;
    ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_quantity_positive;
    ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_duration_positive;
  `).catch(() => {});

  // Idempotency keys table
  await knex.raw(`
    ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS chk_idempotency_status;
    ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS chk_idempotency_key_length;
  `).catch(() => {});

  // Ticket types table
  await knex.raw(`
    ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_price_positive;
    ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_quantity_positive;
    ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_available_positive;
    ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_available_lte_quantity;
    ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_max_per_order_positive;
  `).catch(() => {});

  console.log('Migration 010: Check constraints removed');
}
