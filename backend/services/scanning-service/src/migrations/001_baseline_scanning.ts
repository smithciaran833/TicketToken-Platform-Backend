import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🎫 Starting Scanning Service baseline migration...');

  // ====================================
  // 1. SCANNER_DEVICES TABLE
  // ====================================
  await knex.schema.createTable('scanner_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('device_id', 255).notNullable().unique();
    table.string('device_name', 255).notNullable();
    table.string('device_type', 50).defaultTo('mobile'); // mobile, kiosk, handheld, etc.
    table.uuid('venue_id');
    table.uuid('registered_by');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('app_version', 50);
    table.boolean('can_scan_offline').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_sync_at', { useTz: true });
    table.timestamp('revoked_at', { useTz: true });
    table.uuid('revoked_by');
    table.text('revoked_reason');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('device_id');
    table.index('venue_id');
    table.index('is_active');
    table.index('can_scan_offline');
    table.index(['venue_id', 'is_active']);
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ scanner_devices table created');

  // ====================================
  // 2. DEVICES TABLE (simpler device registry)
  // ====================================
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('device_id', 255).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('zone', 100); // VIP, General, Backstage, etc.
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('device_id');
    table.index('zone');
    table.index('is_active');
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ devices table created');

  // ====================================
  // 3. SCANS TABLE
  // ====================================
  await knex.schema.createTable('scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('device_id'); // Can link to either scanner_devices or devices
    table.string('result', 50).notNullable(); // ALLOW, DENY
    table.string('reason', 100); // DUPLICATE, WRONG_ZONE, REENTRY_DENIED, SUCCESS, etc.
    table.timestamp('scanned_at', { useTz: true }).defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id');
    table.index('device_id');
    table.index('result');
    table.index('scanned_at');
    table.index(['ticket_id', 'result', 'scanned_at']); // For duplicate detection
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ scans table created');

  // ====================================
  // 4. SCAN_POLICY_TEMPLATES TABLE
  // ====================================
  await knex.schema.createTable('scan_policy_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('policy_set').notNullable(); // Contains multiple policy configurations
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('is_default');
    table.index('name');
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ scan_policy_templates table created');

  // ====================================
  // 5. SCAN_POLICIES TABLE
  // ====================================
  await knex.schema.createTable('scan_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('event_id').notNullable();
    table.uuid('venue_id');
    table.string('policy_type', 100).notNullable(); 
    // DUPLICATE_WINDOW, REENTRY, ZONE_ENFORCEMENT, etc.
    table.string('name', 255).notNullable();
    table.jsonb('config').notNullable(); // Policy-specific configuration
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Unique constraint for event + policy type
    table.unique(['event_id', 'policy_type']);

    // Indexes
    table.index('event_id');
    table.index('venue_id');
    table.index('policy_type');
    table.index('is_active');
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ scan_policies table created');

  // ====================================
  // 6. OFFLINE_VALIDATION_CACHE TABLE
  // ====================================
  await knex.schema.createTable('offline_validation_cache', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('validation_hash', 255).notNullable(); // Hash for offline validation
    table.timestamp('valid_from', { useTz: true }).notNullable();
    table.timestamp('valid_until', { useTz: true }).notNullable();
    table.jsonb('ticket_data').notNullable(); // Cached ticket info for offline use
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Unique constraint for ticket + valid_from
    table.unique(['ticket_id', 'valid_from']);

    // Indexes
    table.index('ticket_id');
    table.index('event_id');
    table.index('valid_until');
    table.index(['event_id', 'valid_until']); // For cleanup queries
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ offline_validation_cache table created');

  // ====================================
  // 7. SCAN_ANOMALIES TABLE
  // ====================================
  await knex.schema.createTable('scan_anomalies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.string('device_id', 255).notNullable(); // Links to devices.device_id
    table.specificType('anomaly_types', 'TEXT[]').notNullable(); // PostgreSQL array
    table.integer('risk_score').notNullable(); // 0-100
    table.jsonb('details').notNullable(); // Full anomaly details
    table.timestamp('detected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id');
    table.index('device_id');
    table.index('detected_at');
    table.index('risk_score');
    table.index(['device_id', 'detected_at']); // For JOIN queries with time range
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ scan_anomalies table created');

  // ====================================
  // ROW LEVEL SECURITY (RLS)
  // ====================================
  console.log('Enabling Row Level Security...');

  await knex.raw('ALTER TABLE scanner_devices ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE devices ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scans ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scan_policy_templates ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scan_policies ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE offline_validation_cache ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scan_anomalies ENABLE ROW LEVEL SECURITY');

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON scanner_devices
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON devices
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON scans
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON scan_policy_templates
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON scan_policies
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON offline_validation_cache
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON scan_anomalies
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  console.log('✅ RLS enabled on all tables');

  // ====================================
  // FOREIGN KEY CONSTRAINTS
  // ====================================
  console.log('');
  console.log('🔗 Adding foreign key constraints...');

  // scanner_devices FKs
  await knex.schema.alterTable('scanner_devices', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('SET NULL');
    table.foreign('registered_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('revoked_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ scanner_devices → venues, users (registered_by, revoked_by)');

  // scans FKs
  await knex.schema.alterTable('scans', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('RESTRICT');
  });
  console.log('✅ scans → tickets');

  // scan_policies FKs
  await knex.schema.alterTable('scan_policies', (table) => {
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.foreign('venue_id').references('id').inTable('venues').onDelete('SET NULL');
  });
  console.log('✅ scan_policies → events, venues');

  // offline_validation_cache FKs
  await knex.schema.alterTable('offline_validation_cache', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });
  console.log('✅ offline_validation_cache → tickets, events');

  // scan_anomalies FKs
  await knex.schema.alterTable('scan_anomalies', (table) => {
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('RESTRICT');
  });
  console.log('✅ scan_anomalies → tickets');

  console.log('✅ All FK constraints added (9 total)');

  console.log('');
  console.log('🎉 Scanning Service baseline migration complete!');
  console.log('📊 Tables created: 7 tables (tenants + 6 scanning tables)');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ tenants (tenant isolation)');
  console.log('  ✅ scanner_devices (device registry with offline capability)');
  console.log('  ✅ devices (simple device tracking)');
  console.log('  ✅ scans (scan event records)');
  console.log('  ✅ scan_policy_templates (reusable policy templates)');
  console.log('  ✅ scan_policies (event-specific scan rules)');
  console.log('  ✅ offline_validation_cache (offline validation data)');
  console.log('');
  console.log('🔒 Tenant Isolation:');
  console.log('  ✅ tenant_id columns added to all tables');
  console.log('  ✅ Foreign key constraints added');
  console.log('  ✅ Row Level Security enabled');
  console.log('  ✅ RLS policies created');
  console.log('');
  console.log('⚠️  IMPORTANT: Deploy tenant context middleware with this migration!');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON scan_anomalies');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON offline_validation_cache');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON scan_policies');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON scan_policy_templates');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON scans');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON devices');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON scanner_devices');

  // Disable RLS
  await knex.raw('ALTER TABLE scan_anomalies DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE offline_validation_cache DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scan_policies DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scan_policy_templates DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scans DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE devices DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE scanner_devices DISABLE ROW LEVEL SECURITY');

  // Drop tables
  await knex.schema.dropTableIfExists('scan_anomalies');
  await knex.schema.dropTableIfExists('offline_validation_cache');
  await knex.schema.dropTableIfExists('scan_policies');
  await knex.schema.dropTableIfExists('scan_policy_templates');
  await knex.schema.dropTableIfExists('scans');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('scanner_devices');

  console.log('✅ Scanning Service migration rolled back');
}
