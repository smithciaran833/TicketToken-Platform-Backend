/**
 * Migration: Add Disputes, Payout Events, and Background Jobs Tables
 * 
 * HIGH FIX: Creates missing database tables for:
 * - payment_disputes - Track chargebacks and disputes
 * - payout_events - Track payout success/failure
 * - background_jobs - Tenant-aware job queue
 * - payment_audit_log - Audit trail for payment events
 * - venue_balances - Track available/held/disputed amounts
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // PAYMENT DISPUTES
  // ==========================================================================
  
  await knex.schema.createTable('payment_disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').notNullable().references('id').inTable('payment_transactions');
    table.string('stripe_dispute_id', 50).notNullable().unique();
    table.string('stripe_charge_id', 50).notNullable();
    table.integer('amount').notNullable();
    table.string('reason', 50);
    table.string('status', 50).notNullable().defaultTo('needs_response');
    table.timestamp('evidence_due_by');
    table.uuid('tenant_id').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('closed_at');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('stripe_dispute_id');
    table.index('payment_id');
    table.index('tenant_id');
    table.index(['tenant_id', 'status']);
    table.index('created_at');
  });

  // RLS for payment_disputes
  await knex.raw(`
    ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payment_disputes FORCE ROW LEVEL SECURITY;
    
    CREATE POLICY payment_disputes_tenant_isolation ON payment_disputes
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    
    CREATE POLICY payment_disputes_service_bypass ON payment_disputes
      USING (current_setting('app.bypass_rls', true)::boolean = true);
  `);

  // ==========================================================================
  // PAYOUT EVENTS
  // ==========================================================================
  
  await knex.schema.createTable('payout_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('stripe_account_id', 50).notNullable();
    table.string('payout_id', 50).notNullable();
    table.string('event_type', 30).notNullable(); // 'paid', 'failed', 'pending'
    table.integer('amount').notNullable();
    table.string('failure_code', 50);
    table.string('failure_message', 500);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('stripe_account_id');
    table.index('payout_id');
    table.index('event_type');
    table.index('created_at');
    table.index(['stripe_account_id', 'event_type', 'created_at']);
  });

  // ==========================================================================
  // BACKGROUND JOBS
  // ==========================================================================
  
  await knex.schema.createTable('background_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 30).notNullable().defaultTo('pending');
    table.integer('attempts').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.uuid('tenant_id').notNullable();
    table.timestamp('process_after');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('failed_at');
    table.text('last_error');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('type');
    table.index('status');
    table.index('tenant_id');
    table.index(['status', 'process_after', 'attempts']);
    table.index('created_at');
  });

  // RLS for background_jobs
  await knex.raw(`
    ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY;
    
    CREATE POLICY background_jobs_tenant_isolation ON background_jobs
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    
    CREATE POLICY background_jobs_service_bypass ON background_jobs
      USING (current_setting('app.bypass_rls', true)::boolean = true);
  `);

  // ==========================================================================
  // PAYMENT AUDIT LOG
  // ==========================================================================
  
  await knex.schema.createTable('payment_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_type', 100).notNullable();
    table.string('stripe_event_id', 50);
    table.string('transfer_id', 50);
    table.string('payout_id', 50);
    table.string('dispute_id', 50);
    table.integer('amount');
    table.jsonb('metadata');
    table.uuid('tenant_id');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('event_type');
    table.index('stripe_event_id');
    table.index('tenant_id');
    table.index('created_at');
  });

  // ==========================================================================
  // VENUE BALANCES
  // ==========================================================================
  
  await knex.schema.createTable('venue_balances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.bigInteger('available_balance').notNullable().defaultTo(0);
    table.bigInteger('pending_balance').notNullable().defaultTo(0);
    table.bigInteger('held_for_disputes').notNullable().defaultTo(0);
    table.bigInteger('lost_to_disputes').notNullable().defaultTo(0);
    table.bigInteger('reversed_amount').notNullable().defaultTo(0);
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Unique constraint
    table.unique(['venue_id', 'tenant_id', 'currency']);
    
    // Indexes
    table.index('venue_id');
    table.index('tenant_id');
  });

  // RLS for venue_balances
  await knex.raw(`
    ALTER TABLE venue_balances ENABLE ROW LEVEL SECURITY;
    ALTER TABLE venue_balances FORCE ROW LEVEL SECURITY;
    
    CREATE POLICY venue_balances_tenant_isolation ON venue_balances
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    
    CREATE POLICY venue_balances_service_bypass ON venue_balances
      USING (current_setting('app.bypass_rls', true)::boolean = true);
  `);

  // ==========================================================================
  // ADD COLUMNS TO EXISTING TABLES
  // ==========================================================================
  
  // Add stripe_charge_id to payment_transactions if not exists
  const hasChargeId = await knex.schema.hasColumn('payment_transactions', 'stripe_charge_id');
  if (!hasChargeId) {
    await knex.schema.alterTable('payment_transactions', (table) => {
      table.string('stripe_charge_id', 50);
      table.index('stripe_charge_id');
    });
  }

  // Add venue_id and dispute_id to stripe_transfers if not exists
  const hasVenueId = await knex.schema.hasColumn('stripe_transfers', 'venue_id');
  if (!hasVenueId) {
    await knex.schema.alterTable('stripe_transfers', (table) => {
      table.uuid('venue_id');
      table.string('dispute_id', 50);
      table.timestamp('reversed_at');
      table.string('reversal_reason', 200);
      table.timestamp('failed_at');
      table.string('failure_reason', 500);
    });
  }

  // ==========================================================================
  // OUTBOX ADDITIONS
  // ==========================================================================
  
  // Add retry columns to outbox if not exists
  const hasRetryAfter = await knex.schema.hasColumn('outbox', 'retry_after');
  if (!hasRetryAfter) {
    await knex.schema.alterTable('outbox', (table) => {
      table.integer('attempts').notNullable().defaultTo(0);
      table.timestamp('retry_after');
      table.text('error');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop policies first
  await knex.raw('DROP POLICY IF EXISTS payment_disputes_tenant_isolation ON payment_disputes');
  await knex.raw('DROP POLICY IF EXISTS payment_disputes_service_bypass ON payment_disputes');
  await knex.raw('DROP POLICY IF EXISTS background_jobs_tenant_isolation ON background_jobs');
  await knex.raw('DROP POLICY IF EXISTS background_jobs_service_bypass ON background_jobs');
  await knex.raw('DROP POLICY IF EXISTS venue_balances_tenant_isolation ON venue_balances');
  await knex.raw('DROP POLICY IF EXISTS venue_balances_service_bypass ON venue_balances');
  
  // Drop tables
  await knex.schema.dropTableIfExists('payment_audit_log');
  await knex.schema.dropTableIfExists('background_jobs');
  await knex.schema.dropTableIfExists('payout_events');
  await knex.schema.dropTableIfExists('venue_balances');
  await knex.schema.dropTableIfExists('payment_disputes');
  
  // Revert column additions (optional - leave for safety)
}
