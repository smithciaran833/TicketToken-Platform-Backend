/**
 * Migration: Add CHECK constraints for amount fields
 * 
 * LOW FIX: Add CHECK (amount > 0) constraint to prevent invalid amounts
 * in the database. This provides defense-in-depth beyond application validation.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add CHECK constraints to payments table
  await knex.raw(`
    ALTER TABLE payments
    ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
    ADD CONSTRAINT payments_fee_non_negative CHECK (platform_fee >= 0);
  `).catch((err) => {
    // Constraint may already exist
    if (!err.message.includes('already exists')) throw err;
  });

  // Add CHECK constraints to refunds table
  await knex.raw(`
    ALTER TABLE refunds
    ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
  `).catch((err) => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Add CHECK constraints to transfers table
  await knex.raw(`
    ALTER TABLE transfers
    ADD CONSTRAINT transfers_amount_positive CHECK (amount > 0);
  `).catch((err) => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Add CHECK constraints to escrow table
  await knex.raw(`
    ALTER TABLE escrow_accounts
    ADD CONSTRAINT escrow_balance_non_negative CHECK (balance >= 0);
  `).catch((err) => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Add CHECK constraints to disputes table
  await knex.raw(`
    ALTER TABLE disputes
    ADD CONSTRAINT disputes_amount_positive CHECK (amount > 0);
  `).catch((err) => {
    if (!err.message.includes('already exists')) throw err;
  });

  // Add CHECK constraints to payouts table
  await knex.raw(`
    ALTER TABLE payouts
    ADD CONSTRAINT payouts_amount_positive CHECK (amount > 0);
  `).catch((err) => {
    if (!err.message.includes('already exists')) throw err;
  });

  console.log('✅ Migration 006: Added amount CHECK constraints');
}

export async function down(knex: Knex): Promise<void> {
  // Remove CHECK constraints
  await knex.raw(`
    ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS payments_amount_positive,
    DROP CONSTRAINT IF EXISTS payments_fee_non_negative;
  `);

  await knex.raw(`
    ALTER TABLE refunds
    DROP CONSTRAINT IF EXISTS refunds_amount_positive;
  `);

  await knex.raw(`
    ALTER TABLE transfers
    DROP CONSTRAINT IF EXISTS transfers_amount_positive;
  `);

  await knex.raw(`
    ALTER TABLE escrow_accounts
    DROP CONSTRAINT IF EXISTS escrow_balance_non_negative;
  `);

  await knex.raw(`
    ALTER TABLE disputes
    DROP CONSTRAINT IF EXISTS disputes_amount_positive;
  `);

  await knex.raw(`
    ALTER TABLE payouts
    DROP CONSTRAINT IF EXISTS payouts_amount_positive;
  `);

  console.log('✅ Migration 006 rolled back: Removed amount CHECK constraints');
}
