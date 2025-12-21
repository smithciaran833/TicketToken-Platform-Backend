import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. GDPR_DELETION_REQUESTS - Track GDPR right to be forgotten requests
  await knex.schema.createTable('gdpr_deletion_requests', (table) => {
    table.increments('id').primary();
    table.string('customer_id', 255).notNullable();
    table.string('email', 255);
    table.string('status', 50).defaultTo('processing'); // processing, completed, failed
    table.text('reason');
    table.string('requested_by', 255);
    table.jsonb('deletion_log'); // Track what was deleted
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('status');
    table.index('requested_at');
  });

  // 1b. PRIVACY_EXPORT_REQUESTS - Track GDPR data export requests
  await knex.schema.createTable('privacy_export_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.text('reason');
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.string('download_url', 500);
    table.timestamp('expires_at');
    table.text('error_message');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('user_id');
    table.index('tenant_id');
    table.index('status');
    table.index('requested_at');
    table.index(['status', 'requested_at']); // For queue processing
  });

  // Enable RLS on privacy_export_requests
  await knex.raw('ALTER TABLE privacy_export_requests ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON privacy_export_requests
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  // 2. PCI_ACCESS_LOGS - PCI compliance audit trail for card data access
  await knex.schema.createTable('pci_access_logs', (table) => {
    table.increments('id').primary();
    table.string('user_id', 255).notNullable();
    table.string('action', 100).notNullable(); // view, export, update, delete
    table.string('resource_type', 50); // payment_method, transaction, etc.
    table.string('resource_id', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.boolean('authorized').defaultTo(true);
    table.text('denial_reason');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('user_id');
    table.index('action');
    table.index('created_at');
    table.index(['resource_type', 'resource_id']);
  });

  // 3. STATE_COMPLIANCE_RULES - State-level ticket resale regulations
  await knex.schema.createTable('state_compliance_rules', (table) => {
    table.increments('id').primary();
    table.string('state_code', 2).notNullable().unique();
    table.string('state_name', 100).notNullable();
    table.boolean('resale_allowed').defaultTo(true);
    table.decimal('max_markup_percentage', 5, 2); // e.g., 20.00 for 20%
    table.decimal('max_markup_amount', 10, 2); // Fixed dollar amount cap
    table.boolean('license_required').defaultTo(false);
    table.text('license_type');
    table.text('restrictions'); // Additional restrictions
    table.jsonb('metadata');
    table.boolean('active').defaultTo(true);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('state_code');
    table.index('active');
  });

  // 4. CUSTOMER_PROFILES - Customer data for data retention
  await knex.schema.createTable('customer_profiles', (table) => {
    table.increments('id').primary();
    table.string('customer_id', 255).notNullable().unique();
    table.string('email', 255);
    table.string('name', 255);
    table.string('phone', 50);
    table.text('address');
    table.string('city', 100);
    table.string('state', 2);
    table.string('zip', 20);
    table.string('country', 2).defaultTo('US');
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.boolean('gdpr_deleted').defaultTo(false);
    table.timestamp('last_activity_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('email');
    table.index('gdpr_deleted');
    table.index('last_activity_at');
  });

  // 5. CUSTOMER_PREFERENCES - User consent and preferences
  await knex.schema.createTable('customer_preferences', (table) => {
    table.increments('id').primary();
    table.string('customer_id', 255).notNullable();
    table.boolean('marketing_emails').defaultTo(false);
    table.boolean('transactional_emails').defaultTo(true);
    table.boolean('sms_notifications').defaultTo(false);
    table.boolean('push_notifications').defaultTo(false);
    table.boolean('data_sharing_consent').defaultTo(false);
    table.boolean('analytics_tracking').defaultTo(true);
    table.string('language', 10).defaultTo('en');
    table.string('timezone', 50).defaultTo('America/New_York');
    table.jsonb('custom_preferences');
    table.timestamp('consent_date');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.unique('customer_id');
  });

  // 6. CUSTOMER_ANALYTICS - Analytics data tracking for retention policies
  await knex.schema.createTable('customer_analytics', (table) => {
    table.increments('id').primary();
    table.string('customer_id', 255).notNullable();
    table.string('event_type', 100).notNullable(); // page_view, purchase, login, etc.
    table.string('event_name', 255);
    table.jsonb('event_data');
    table.string('session_id', 255);
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('referrer', 500);
    table.string('page_url', 500);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('event_type');
    table.index('created_at');
    table.index('session_id');
  });

  // Insert default state compliance rules for states mentioned in audit
  await knex('state_compliance_rules').insert([
    {
      state_code: 'TN',
      state_name: 'Tennessee',
      resale_allowed: true,
      max_markup_percentage: 20.00,
      max_markup_amount: null,
      license_required: false,
      restrictions: 'Maximum 20% markup on ticket resale as per state law',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'TX',
      state_name: 'Texas',
      resale_allowed: true,
      max_markup_percentage: null,
      max_markup_amount: null,
      license_required: true,
      license_type: 'Texas Occupations Code Chapter 2104',
      restrictions: 'Requires secondary ticket seller license',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'NY',
      state_name: 'New York',
      resale_allowed: true,
      max_markup_percentage: null,
      max_markup_amount: null,
      license_required: false,
      restrictions: 'Must disclose total price including fees upfront',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    },
    {
      state_code: 'CA',
      state_name: 'California',
      resale_allowed: true,
      max_markup_percentage: null,
      max_markup_amount: null,
      license_required: false,
      restrictions: 'Must register with Secretary of State if reselling >$2000/year',
      active: true,
      metadata: JSON.stringify({ last_verified: new Date().toISOString() })
    }
  ]).onConflict('state_code').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customer_analytics');
  await knex.schema.dropTableIfExists('customer_preferences');
  await knex.schema.dropTableIfExists('customer_profiles');
  await knex.schema.dropTableIfExists('state_compliance_rules');
  await knex.schema.dropTableIfExists('pci_access_logs');
  await knex.schema.dropTableIfExists('privacy_export_requests');
  await knex.schema.dropTableIfExists('gdpr_deletion_requests');
}
