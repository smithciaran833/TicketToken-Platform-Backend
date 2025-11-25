import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🎫 Starting Scanning Service baseline migration...');

  // 1. SCANNER_DEVICES TABLE
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

    // Indexes
    table.index('device_id');
    table.index('venue_id');
    table.index('is_active');
    table.index('can_scan_offline');
    table.index(['venue_id', 'is_active']);
  });

  console.log('✅ scanner_devices table created');

  // 2. DEVICES TABLE (simpler device registry)
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('device_id', 255).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('zone', 100); // VIP, General, Backstage, etc.
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('device_id');
    table.index('zone');
    table.index('is_active');
  });

  console.log('✅ devices table created');

  // 3. SCANS TABLE
  await knex.schema.createTable('scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('device_id'); // Can link to either scanner_devices or devices
    table.string('result', 50).notNullable(); // ALLOW, DENY
    table.string('reason', 100); // DUPLICATE, WRONG_ZONE, REENTRY_DENIED, SUCCESS, etc.
    table.timestamp('scanned_at', { useTz: true }).defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');

    // Indexes
    table.index('ticket_id');
    table.index('device_id');
    table.index('result');
    table.index('scanned_at');
    table.index(['ticket_id', 'result', 'scanned_at']); // For duplicate detection
  });

  console.log('✅ scans table created');

  // 4. SCAN_POLICY_TEMPLATES TABLE
  await knex.schema.createTable('scan_policy_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('policy_set').notNullable(); // Contains multiple policy configurations
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('is_default');
    table.index('name');
  });

  console.log('✅ scan_policy_templates table created');

  // 5. SCAN_POLICIES TABLE
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

    // Unique constraint for event + policy type
    table.unique(['event_id', 'policy_type']);

    // Indexes
    table.index('event_id');
    table.index('venue_id');
    table.index('policy_type');
    table.index('is_active');
  });

  console.log('✅ scan_policies table created');

  // 6. OFFLINE_VALIDATION_CACHE TABLE
  await knex.schema.createTable('offline_validation_cache', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('validation_hash', 255).notNullable(); // Hash for offline validation
    table.timestamp('valid_from', { useTz: true }).notNullable();
    table.timestamp('valid_until', { useTz: true }).notNullable();
    table.jsonb('ticket_data').notNullable(); // Cached ticket info for offline use
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Unique constraint for ticket + valid_from
    table.unique(['ticket_id', 'valid_from']);

    // Indexes
    table.index('ticket_id');
    table.index('event_id');
    table.index('valid_until');
    table.index(['event_id', 'valid_until']); // For cleanup queries
  });

  console.log('✅ offline_validation_cache table created');

  console.log('');
  console.log('🎉 Scanning Service baseline migration complete!');
  console.log('📊 Tables created: 6 tables');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ scanner_devices (device registry with offline capability)');
  console.log('  ✅ devices (simple device tracking)');
  console.log('  ✅ scans (scan event records)');
  console.log('  ✅ scan_policy_templates (reusable policy templates)');
  console.log('  ✅ scan_policies (event-specific scan rules)');
  console.log('  ✅ offline_validation_cache (offline validation data)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('offline_validation_cache');
  await knex.schema.dropTableIfExists('scan_policies');
  await knex.schema.dropTableIfExists('scan_policy_templates');
  await knex.schema.dropTableIfExists('scans');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('scanner_devices');

  console.log('✅ Scanning Service migration rolled back');
}
