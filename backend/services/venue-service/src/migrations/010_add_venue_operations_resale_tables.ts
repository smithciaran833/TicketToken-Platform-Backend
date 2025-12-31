import { Knex } from 'knex';

/**
 * Migration: Add venue_operations table for VO5-VO7 and resale business rules tables
 * Security Fix: 
 * - VO5-VO7: Venue operations with recovery points, resume capability, tenant scoping
 * - Resale: Jurisdiction detection, transfer history, price validation, seller verification
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Create venue_operations table for VO5-VO7
  await knex.schema.createTable('venue_operations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('operation_type', 100).notNullable();
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('current_step').defaultTo(0);
    table.integer('total_steps').notNullable();
    table.jsonb('steps').notNullable();
    table.jsonb('checkpoint_data').nullable();
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.text('error_message').nullable();
    table.uuid('created_by').nullable();
    table.string('correlation_id', 100).nullable();
    
    // Indexes
    table.index(['venue_id', 'tenant_id']);
    table.index(['tenant_id', 'status']);
    table.index(['operation_type', 'status']);
    table.index('correlation_id');
  });

  // Add status constraint
  await knex.raw(`
    ALTER TABLE venue_operations 
    ADD CONSTRAINT venue_operations_status_check 
    CHECK (status IN ('pending', 'in_progress', 'checkpoint', 'completed', 'failed', 'rolled_back'))
  `);

  // 2. Create transfer_history table for resale tracking
  await knex.schema.createTable('transfer_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.uuid('from_user_id').nullable(); // Null for original purchase
    table.uuid('to_user_id').notNullable();
    table.string('transfer_type', 20).notNullable(); // 'purchase', 'transfer', 'resale'
    table.decimal('price', 12, 2).nullable();
    table.decimal('original_face_value', 12, 2).nullable();
    table.string('currency', 3).defaultTo('USD');
    table.integer('transfer_number').defaultTo(1); // 1st, 2nd, 3rd transfer
    table.string('jurisdiction', 10).nullable(); // US state or country code
    table.boolean('seller_verified').defaultTo(false);
    table.string('verification_method', 50).nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('transferred_at', { useTz: true }).defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['ticket_id', 'transferred_at']);
    table.index(['venue_id', 'tenant_id']);
    table.index(['event_id', 'tenant_id']);
    table.index(['from_user_id']);
    table.index(['to_user_id']);
    table.index('jurisdiction');
  });

  // Add transfer type constraint
  await knex.raw(`
    ALTER TABLE transfer_history 
    ADD CONSTRAINT transfer_history_type_check 
    CHECK (transfer_type IN ('purchase', 'transfer', 'resale', 'gift', 'refund'))
  `);

  // 3. Add resale policy fields to venue_settings
  await knex.schema.alterTable('venue_settings', (table) => {
    // Resale price controls
    table.decimal('max_resale_price_multiplier', 5, 2).nullable(); // e.g., 1.5 = 150% of face value
    table.decimal('max_resale_price_fixed', 12, 2).nullable(); // Fixed max price
    table.boolean('use_face_value_cap').defaultTo(false);
    
    // Transfer limits
    table.integer('max_transfers_per_ticket').nullable(); // Max times a ticket can be resold
    table.boolean('require_seller_verification').defaultTo(false);
    
    // Jurisdiction-specific rules
    table.string('default_jurisdiction', 10).nullable();
    table.jsonb('jurisdiction_rules').nullable(); // Per-jurisdiction overrides
    
    // Timing rules
    table.integer('resale_cutoff_hours').nullable(); // Hours before event when resale stops
    table.integer('listing_cutoff_hours').nullable(); // Hours before event when new listings stop
    
    // Anti-scalping measures
    table.boolean('anti_scalping_enabled').defaultTo(false);
    table.integer('purchase_cooldown_minutes').nullable(); // Time between purchases
    table.integer('max_tickets_per_buyer').nullable(); // Per event
    
    // Artist/organizer approval
    table.boolean('require_artist_approval').defaultTo(false);
    table.jsonb('approved_resale_platforms').nullable();
  });

  // 4. Create resale_policies table for per-event overrides
  await knex.schema.createTable('resale_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('event_id').nullable(); // Null = venue default policy
    table.uuid('tenant_id').notNullable();
    
    // Policy details
    table.boolean('resale_allowed').defaultTo(true);
    table.decimal('max_price_multiplier', 5, 2).nullable();
    table.decimal('max_price_fixed', 12, 2).nullable();
    table.integer('max_transfers').nullable();
    table.boolean('seller_verification_required').defaultTo(false);
    table.integer('resale_cutoff_hours').nullable();
    table.integer('listing_cutoff_hours').nullable();
    
    // Jurisdiction
    table.string('jurisdiction', 10).nullable();
    table.jsonb('jurisdiction_overrides').nullable();
    
    // Anti-scalping
    table.boolean('anti_scalping_enabled').defaultTo(false);
    table.jsonb('anti_scalping_rules').nullable();
    
    // Artist approval
    table.boolean('artist_approval_required').defaultTo(false);
    table.string('artist_approval_status', 20).nullable();
    table.uuid('approved_by').nullable();
    table.timestamp('approved_at', { useTz: true }).nullable();
    
    // Audit
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by').nullable();
    
    // Indexes
    table.index(['venue_id', 'event_id']);
    table.index(['tenant_id', 'venue_id']);
    table.index('jurisdiction');
    table.unique(['venue_id', 'event_id', 'jurisdiction']); // One policy per venue/event/jurisdiction combo
  });

  // 5. Create seller_verifications table
  await knex.schema.createTable('seller_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('venue_id').nullable().references('id').inTable('venues').onDelete('SET NULL');
    table.uuid('tenant_id').notNullable();
    
    // Verification details
    table.string('verification_type', 50).notNullable(); // 'identity', 'address', 'bank', 'tax_id'
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('provider', 50).nullable(); // e.g., 'stripe_identity', 'manual'
    table.string('provider_verification_id', 255).nullable();
    table.jsonb('verification_data').nullable(); // Encrypted/hashed PII
    
    // Results
    table.boolean('verified').defaultTo(false);
    table.text('rejection_reason').nullable();
    table.timestamp('verified_at', { useTz: true }).nullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    
    // Audit
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('reviewed_by').nullable();
    
    // Indexes
    table.index(['user_id', 'verification_type']);
    table.index(['tenant_id', 'status']);
    table.index('provider_verification_id');
  });

  // Add verification status constraint
  await knex.raw(`
    ALTER TABLE seller_verifications 
    ADD CONSTRAINT seller_verifications_status_check 
    CHECK (status IN ('pending', 'in_review', 'verified', 'rejected', 'expired'))
  `);

  // Enable RLS on new tables
  await knex.raw('ALTER TABLE venue_operations ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE transfer_history ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE resale_policies ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE seller_verifications ENABLE ROW LEVEL SECURITY');

  // Create RLS policies for tenant isolation
  await knex.raw(`
    CREATE POLICY venue_operations_tenant_isolation ON venue_operations
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  `);

  await knex.raw(`
    CREATE POLICY transfer_history_tenant_isolation ON transfer_history
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  `);

  await knex.raw(`
    CREATE POLICY resale_policies_tenant_isolation ON resale_policies
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  `);

  await knex.raw(`
    CREATE POLICY seller_verifications_tenant_isolation ON seller_verifications
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  `);

  console.log('✅ Created venue_operations, transfer_history, resale_policies, and seller_verifications tables');
  console.log('✅ Added resale policy fields to venue_settings');
  console.log('✅ Enabled RLS with tenant isolation on all new tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS seller_verifications_tenant_isolation ON seller_verifications');
  await knex.raw('DROP POLICY IF EXISTS resale_policies_tenant_isolation ON resale_policies');
  await knex.raw('DROP POLICY IF EXISTS transfer_history_tenant_isolation ON transfer_history');
  await knex.raw('DROP POLICY IF EXISTS venue_operations_tenant_isolation ON venue_operations');

  // Drop tables
  await knex.schema.dropTableIfExists('seller_verifications');
  await knex.schema.dropTableIfExists('resale_policies');
  await knex.schema.dropTableIfExists('transfer_history');
  await knex.schema.dropTableIfExists('venue_operations');

  // Remove resale columns from venue_settings
  await knex.schema.alterTable('venue_settings', (table) => {
    table.dropColumn('approved_resale_platforms');
    table.dropColumn('require_artist_approval');
    table.dropColumn('max_tickets_per_buyer');
    table.dropColumn('purchase_cooldown_minutes');
    table.dropColumn('anti_scalping_enabled');
    table.dropColumn('listing_cutoff_hours');
    table.dropColumn('resale_cutoff_hours');
    table.dropColumn('jurisdiction_rules');
    table.dropColumn('default_jurisdiction');
    table.dropColumn('require_seller_verification');
    table.dropColumn('max_transfers_per_ticket');
    table.dropColumn('use_face_value_cap');
    table.dropColumn('max_resale_price_fixed');
    table.dropColumn('max_resale_price_multiplier');
  });
}
