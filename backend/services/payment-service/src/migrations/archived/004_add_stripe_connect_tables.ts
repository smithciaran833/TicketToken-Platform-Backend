/**
 * Migration: Add Stripe Connect Transfer Tables
 * 
 * CRITICAL FIX:
 * Creates tables needed for Stripe Connect transfers to distribute
 * payments to venues and artists.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('📦 Creating Stripe Connect tables...');

  // ==========================================================================
  // 1. STRIPE_TRANSFERS - Records of completed transfers
  // ==========================================================================
  await knex.schema.createTable('stripe_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().index();
    table.string('stripe_transfer_id', 255).unique().notNullable();
    table.string('destination_account', 255).notNullable().index();
    table.integer('amount').notNullable();
    table.string('currency', 3).defaultTo('usd');
    table.string('status', 50).notNullable().defaultTo('completed').index();
    table.string('recipient_type', 50).notNullable(); // venue, artist, platform
    table.uuid('recipient_id').notNullable().index();
    table.string('transfer_group', 255).nullable().index();
    table.string('source_transaction', 255).nullable(); // charge ID
    table.integer('reversed_amount').nullable();
    table.string('reversal_id', 255).nullable();
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('tenant_id').notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE stripe_transfers ADD CONSTRAINT chk_stripe_transfers_status
    CHECK (status IN ('pending', 'completed', 'reversed', 'partially_reversed', 'failed'));
  `);

  await knex.raw(`
    ALTER TABLE stripe_transfers ADD CONSTRAINT chk_stripe_transfers_recipient_type
    CHECK (recipient_type IN ('venue', 'artist', 'platform'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_stripe_transfers_updated_at
    BEFORE UPDATE ON stripe_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('   ✅ stripe_transfers table created');

  // ==========================================================================
  // 2. PENDING_TRANSFERS - Queue for failed/retrying transfers
  // ==========================================================================
  await knex.schema.createTable('pending_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().index();
    table.string('payment_intent_id', 255).notNullable();
    table.string('charge_id', 255).notNullable();
    table.string('destination_account', 255).notNullable();
    table.integer('amount').notNullable();
    table.string('currency', 3).defaultTo('usd');
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending').index();
    table.string('stripe_transfer_id', 255).nullable();
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('next_retry_at').nullable().index();
    table.timestamp('completed_at').nullable();
    table.uuid('tenant_id').notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE pending_transfers ADD CONSTRAINT chk_pending_transfers_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  `);

  await knex.raw(`
    CREATE INDEX idx_pending_transfers_retry ON pending_transfers(status, next_retry_at)
    WHERE status = 'pending';
  `);

  await knex.raw(`
    CREATE TRIGGER update_pending_transfers_updated_at
    BEFORE UPDATE ON pending_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('   ✅ pending_transfers table created');

  // ==========================================================================
  // 3. PAYOUT_SCHEDULES - Scheduled payouts to connected accounts
  // ==========================================================================
  await knex.schema.createTable('payout_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('stripe_account_id', 255).notNullable().index();
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable().index();
    table.string('schedule_type', 50).notNullable().defaultTo('manual'); // manual, daily, weekly
    table.integer('minimum_amount').defaultTo(1000); // In cents
    table.date('next_payout_date').nullable();
    table.boolean('enabled').defaultTo(true);
    table.uuid('tenant_id').notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER update_payout_schedules_updated_at
    BEFORE UPDATE ON payout_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('   ✅ payout_schedules table created');

  // ==========================================================================
  // 4. CONNECTED_ACCOUNTS - Stripe Connect account tracking
  // ==========================================================================
  await knex.schema.createTable('connected_accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('stripe_account_id', 255).unique().notNullable();
    table.string('account_type', 50).notNullable(); // venue, artist
    table.uuid('owner_id').notNullable().index();
    table.string('business_type', 50).nullable();
    table.boolean('charges_enabled').defaultTo(false);
    table.boolean('payouts_enabled').defaultTo(false);
    table.boolean('details_submitted').defaultTo(false);
    table.string('onboarding_status', 50).defaultTo('pending').index();
    table.string('country', 2).defaultTo('US');
    table.string('default_currency', 3).defaultTo('usd');
    table.jsonb('requirements').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('tenant_id').notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE connected_accounts ADD CONSTRAINT chk_connected_accounts_status
    CHECK (onboarding_status IN ('pending', 'in_progress', 'complete', 'restricted', 'disabled'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_connected_accounts_updated_at
    BEFORE UPDATE ON connected_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('   ✅ connected_accounts table created');

  // ==========================================================================
  // 5. Enable RLS on new tables
  // ==========================================================================
  console.log('   Enabling RLS on new tables...');
  
  const tables = ['stripe_transfers', 'pending_transfers', 'payout_schedules', 'connected_accounts'];
  
  for (const tableName of tables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    
    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation_policy ON ${tableName}
        USING (
          tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          )
          OR current_setting('app.bypass_rls', true) = 'true'
          OR current_user = 'postgres'
        )
        WITH CHECK (
          tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          )
          OR current_setting('app.bypass_rls', true) = 'true'
          OR current_user = 'postgres'
        );
    `);
  }

  console.log('   ✅ RLS policies created');

  // ==========================================================================
  // 6. Add foreign key constraints
  // ==========================================================================
  console.log('   Adding foreign key constraints...');

  try {
    await knex.schema.alterTable('stripe_transfers', (table) => {
      table.foreign('order_id').references('id').inTable('orders').onDelete('RESTRICT');
      table.foreign('recipient_id').references('id').inTable('users').onDelete('RESTRICT');
    });
    console.log('   ✅ stripe_transfers → orders, users');
  } catch (err: any) {
    console.log(`   ⚠️  stripe_transfers FK: ${err.message}`);
  }

  try {
    await knex.schema.alterTable('pending_transfers', (table) => {
      table.foreign('order_id').references('id').inTable('orders').onDelete('RESTRICT');
      table.foreign('recipient_id').references('id').inTable('users').onDelete('RESTRICT');
    });
    console.log('   ✅ pending_transfers → orders, users');
  } catch (err: any) {
    console.log(`   ⚠️  pending_transfers FK: ${err.message}`);
  }

  try {
    await knex.schema.alterTable('connected_accounts', (table) => {
      table.foreign('owner_id').references('id').inTable('users').onDelete('RESTRICT');
    });
    console.log('   ✅ connected_accounts → users');
  } catch (err: any) {
    console.log(`   ⚠️  connected_accounts FK: ${err.message}`);
  }

  console.log('✅ Stripe Connect tables migration completed!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('📦 Dropping Stripe Connect tables...');

  // Drop policies first
  const tables = ['stripe_transfers', 'pending_transfers', 'payout_schedules', 'connected_accounts'];
  
  for (const tableName of tables) {
    try {
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_policy ON ${tableName}`);
    } catch (err) {
      // Ignore if policy doesn't exist
    }
  }

  // Drop tables
  await knex.schema.dropTableIfExists('payout_schedules');
  await knex.schema.dropTableIfExists('pending_transfers');
  await knex.schema.dropTableIfExists('stripe_transfers');
  await knex.schema.dropTableIfExists('connected_accounts');

  console.log('✅ Stripe Connect tables dropped!');
}
