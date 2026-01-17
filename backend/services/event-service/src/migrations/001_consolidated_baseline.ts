import { Knex } from 'knex';

/**
 * CONSOLIDATED BASELINE MIGRATION - event-service
 *
 * Created: 2026-01-13
 * Consolidates: 001, 002, 003, 004, 005, 006
 *
 * Tables (6):
 *   Global: event_categories
 *   Tenant: events, event_schedules, event_capacity, event_pricing, event_metadata
 *
 * RLS Enabled: 5 tables (all tenant tables)
 * Global Tables: 1 (event_categories)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // DATABASE SETTINGS
  // ==========================================================================
  await knex.raw("SET lock_timeout = '5s'");

  // ==========================================================================
  // EXTENSIONS
  // ==========================================================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ==========================================================================
  // FUNCTIONS
  // ==========================================================================

  // Function: Auto-update updated_at timestamp
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: Auto-increment version (for optimistic locking)
  // NOTE: Does NOT update updated_at - that's handled by update_updated_at_column()
  await knex.raw(`
    CREATE OR REPLACE FUNCTION increment_version()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.version = OLD.version + 1;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================================================
  // TABLE 1: event_categories (GLOBAL - no tenant_id, no RLS)
  // ==========================================================================
  await knex.schema.createTable('event_categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_id').references('id').inTable('event_categories').onDelete('SET NULL');
    table.string('name', 100).notNullable();
    table.string('slug', 100).notNullable().unique();
    table.text('description');
    table.string('icon', 50);
    table.string('color', 7);
    table.integer('display_order').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_featured').defaultTo(false);
    table.string('meta_title', 70);
    table.string('meta_description', 160);
    table.integer('event_count').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_event_categories_parent_id ON event_categories(parent_id)');
  await knex.raw('CREATE INDEX idx_event_categories_slug ON event_categories(slug)');
  await knex.raw('CREATE INDEX idx_event_categories_is_active ON event_categories(is_active)');

  // Seed default categories
  await knex.raw(`
    INSERT INTO event_categories (name, slug, icon, color, display_order) VALUES
    ('Music', 'music', 'music', '#FF6B6B', 1),
    ('Sports', 'sports', 'sports', '#4ECDC4', 2),
    ('Theater', 'theater', 'theater', '#95E1D3', 3),
    ('Comedy', 'comedy', 'comedy', '#F38181', 4),
    ('Arts', 'arts', 'arts', '#AA96DA', 5),
    ('Conference', 'conference', 'conference', '#FCBAD3', 6),
    ('Workshop', 'workshop', 'workshop', '#A8D8EA', 7),
    ('Festival', 'festival', 'festival', '#FFD93D', 8),
    ('Family', 'family', 'family', '#6BCB77', 9),
    ('Nightlife', 'nightlife', 'nightlife', '#C780FA', 10)
  `);

  // ==========================================================================
  // TABLE 2: events
  // ==========================================================================
  await knex.schema.createTable('events', (table) => {
    // Core Identity
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('venue_layout_id');
    table.string('name', 300).notNullable();
    table.string('slug', 300).notNullable();
    table.text('description');
    table.string('short_description', 500);

    // Event Type & Classification
    table.string('event_type', 50).notNullable().defaultTo('single');
    table.uuid('primary_category_id').references('id').inTable('event_categories');
    table.specificType('secondary_category_ids', 'UUID[]');
    table.specificType('tags', 'TEXT[]');

    // Status & Visibility
    table.string('status', 50).defaultTo('DRAFT');
    table.string('visibility', 50).defaultTo('PUBLIC');
    table.boolean('is_featured').defaultTo(false);
    table.integer('priority_score').defaultTo(0);

    // Status tracking (from 006)
    table.string('status_reason', 500);
    table.string('status_changed_by', 100);
    table.timestamp('status_changed_at', { useTz: true });

    // Media
    table.text('banner_image_url');
    table.text('thumbnail_image_url');
    table.jsonb('image_gallery');
    table.text('video_url');
    table.text('virtual_event_url');

    // Event Details
    table.integer('age_restriction').defaultTo(0);
    table.string('dress_code', 100);
    table.specificType('special_requirements', 'TEXT[]');
    table.jsonb('accessibility_info');

    // Blockchain Integration
    table.string('collection_address', 44);
    table.string('mint_authority', 44);
    table.decimal('royalty_percentage', 5, 2);

    // Virtual/Hybrid Settings
    table.boolean('is_virtual').defaultTo(false);
    table.boolean('is_hybrid').defaultTo(false);
    table.string('streaming_platform', 50);
    table.jsonb('streaming_config');

    // Policies
    table.text('cancellation_policy');
    table.text('refund_policy');
    table.integer('cancellation_deadline_hours').defaultTo(24);

    // Transfer Settings
    table.timestamp('start_date', { useTz: true });
    table.boolean('allow_transfers').defaultTo(true);
    table.integer('max_transfers_per_ticket');
    table.timestamp('transfer_blackout_start', { useTz: true });
    table.timestamp('transfer_blackout_end', { useTz: true });
    table.boolean('require_identity_verification').defaultTo(false);

    // SEO
    table.string('meta_title', 70);
    table.string('meta_description', 160);
    table.specificType('meta_keywords', 'TEXT[]');

    // Analytics
    table.integer('view_count').defaultTo(0);
    table.integer('interest_count').defaultTo(0);
    table.integer('share_count').defaultTo(0);

    // Metadata
    table.string('external_id', 100);
    table.jsonb('metadata').defaultTo('{}');

    // Audit
    table.uuid('created_by');
    table.uuid('updated_by');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Optimistic locking (from 003)
    table.integer('version').notNullable().defaultTo(1);
  });

  // Events indexes
  await knex.raw('CREATE INDEX idx_events_tenant_id ON events(tenant_id)');
  await knex.raw('CREATE INDEX idx_events_venue_id ON events(venue_id)');
  await knex.raw('CREATE INDEX idx_events_venue_status ON events(venue_id, status)');
  await knex.raw('CREATE INDEX idx_events_slug ON events(slug)');
  await knex.raw('CREATE INDEX idx_events_status ON events(status)');
  await knex.raw('CREATE INDEX idx_events_primary_category_id ON events(primary_category_id)');
  await knex.raw('CREATE INDEX idx_events_created_at ON events(created_at)');
  await knex.raw('CREATE INDEX idx_events_deleted_at ON events(deleted_at)');
  await knex.raw('CREATE INDEX idx_events_is_featured_priority ON events(is_featured, priority_score)');
  await knex.raw('CREATE INDEX idx_events_tenant_status ON events(tenant_id, status)');
  await knex.raw('CREATE UNIQUE INDEX idx_events_venue_slug ON events(venue_id, slug) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX idx_events_metadata_gin ON events USING gin(metadata)');
  await knex.raw('CREATE INDEX idx_events_accessibility_gin ON events USING gin(accessibility_info)');
  await knex.raw('CREATE INDEX idx_events_tenant_venue ON events(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_events_tenant_created ON events(tenant_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_events_tenant_category ON events(tenant_id, primary_category_id)');
  await knex.raw('CREATE INDEX idx_events_id_version ON events(id, version)');
  await knex.raw('CREATE INDEX idx_events_status_changed_at ON events(status_changed_at DESC) WHERE status_changed_at IS NOT NULL');

  // Full-text search index
  await knex.raw(`
    CREATE INDEX idx_events_search ON events USING gin(
      to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(short_description, '')
      )
    )
  `);

  // Events CHECK constraints
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_status_check
    CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'))
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_visibility_check
    CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'UNLISTED'))
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN ('single', 'recurring', 'series'))
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_royalty_percentage_check
    CHECK (royalty_percentage IS NULL OR (royalty_percentage >= 0 AND royalty_percentage <= 100))
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_age_restriction_check
    CHECK (age_restriction >= 0)
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_priority_score_check
    CHECK (priority_score >= 0)
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_view_count_check
    CHECK (view_count >= 0)
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_interest_count_check
    CHECK (interest_count >= 0)
  `);
  await knex.raw(`
    ALTER TABLE events ADD CONSTRAINT events_share_count_check
    CHECK (share_count >= 0)
  `);

  // ==========================================================================
  // TABLE 3: event_schedules
  // ==========================================================================
  await knex.schema.createTable('event_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.timestamp('starts_at', { useTz: true }).notNullable();
    table.timestamp('ends_at', { useTz: true }).notNullable();
    table.timestamp('doors_open_at', { useTz: true });
    table.boolean('is_recurring').defaultTo(false);
    table.text('recurrence_rule');
    table.date('recurrence_end_date');
    table.integer('occurrence_number');
    table.string('timezone', 50).defaultTo('UTC');
    table.integer('utc_offset');
    table.string('status', 50).defaultTo('SCHEDULED');
    table.text('status_reason');
    table.integer('capacity_override');
    table.timestamp('check_in_opens_at', { useTz: true });
    table.timestamp('check_in_closes_at', { useTz: true });
    table.text('notes');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Optimistic locking (from 003)
    table.integer('version').notNullable().defaultTo(1);
  });

  await knex.raw('CREATE INDEX idx_event_schedules_tenant_id ON event_schedules(tenant_id)');
  await knex.raw('CREATE INDEX idx_event_schedules_event_id ON event_schedules(event_id)');
  await knex.raw('CREATE INDEX idx_event_schedules_starts_at ON event_schedules(starts_at)');
  await knex.raw('CREATE INDEX idx_event_schedules_status ON event_schedules(status)');
  await knex.raw('CREATE INDEX idx_event_schedules_tenant_starts ON event_schedules(tenant_id, starts_at)');
  await knex.raw('CREATE INDEX idx_event_schedules_tenant_event ON event_schedules(tenant_id, event_id)');

  await knex.raw(`
    ALTER TABLE event_schedules ADD CONSTRAINT event_schedules_status_check
    CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED'))
  `);

  // ==========================================================================
  // TABLE 4: event_capacity
  // ==========================================================================
  await knex.schema.createTable('event_capacity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.uuid('schedule_id').references('id').inTable('event_schedules').onDelete('SET NULL');
    table.string('section_name', 100).notNullable();
    table.string('section_code', 20);
    table.string('tier', 50);
    table.integer('total_capacity').notNullable();
    table.integer('available_capacity').notNullable();
    table.integer('reserved_capacity').defaultTo(0);
    table.integer('buffer_capacity').defaultTo(0);
    table.integer('sold_count').defaultTo(0);
    table.integer('pending_count').defaultTo(0);
    table.timestamp('reserved_at', { useTz: true });
    table.timestamp('reserved_expires_at', { useTz: true });
    table.jsonb('locked_price_data');
    table.jsonb('row_config');
    table.jsonb('seat_map');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_visible').defaultTo(true);
    table.integer('minimum_purchase').defaultTo(1);
    table.integer('maximum_purchase');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Optimistic locking (from 003)
    table.integer('version').notNullable().defaultTo(1);
  });

  await knex.raw('CREATE INDEX idx_event_capacity_tenant_id ON event_capacity(tenant_id)');
  await knex.raw('CREATE INDEX idx_event_capacity_event_id ON event_capacity(event_id)');
  await knex.raw('CREATE INDEX idx_event_capacity_schedule_id ON event_capacity(schedule_id)');
  await knex.raw('CREATE INDEX idx_event_capacity_available ON event_capacity(available_capacity)');
  await knex.raw('CREATE INDEX idx_event_capacity_reserved_expires ON event_capacity(reserved_expires_at)');
  await knex.raw("CREATE UNIQUE INDEX idx_event_capacity_unique ON event_capacity(event_id, section_name, COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid))");
  await knex.raw('CREATE INDEX idx_event_capacity_deleted_at ON event_capacity(deleted_at)');
  await knex.raw('CREATE INDEX idx_event_capacity_tenant_event ON event_capacity(tenant_id, event_id)');

  // event_capacity CHECK constraints
  await knex.raw(`
    ALTER TABLE event_capacity ADD CONSTRAINT event_capacity_total_check
    CHECK (total_capacity > 0)
  `);
  await knex.raw(`
    ALTER TABLE event_capacity ADD CONSTRAINT event_capacity_available_check
    CHECK (available_capacity >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_capacity ADD CONSTRAINT event_capacity_reserved_check
    CHECK (reserved_capacity >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_capacity ADD CONSTRAINT event_capacity_sold_check
    CHECK (sold_count >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_capacity ADD CONSTRAINT event_capacity_min_purchase_check
    CHECK (minimum_purchase >= 1)
  `);

  // ==========================================================================
  // TABLE 5: event_pricing
  // ==========================================================================
  await knex.schema.createTable('event_pricing', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.uuid('schedule_id').references('id').inTable('event_schedules').onDelete('SET NULL');
    table.uuid('capacity_id').references('id').inTable('event_capacity').onDelete('SET NULL');
    table.string('name', 100).notNullable();
    table.text('description');
    table.string('tier', 50);
    table.decimal('base_price', 10, 2).notNullable();
    table.decimal('service_fee', 10, 2).defaultTo(0);
    table.decimal('facility_fee', 10, 2).defaultTo(0);
    table.decimal('tax_rate', 5, 4).defaultTo(0);
    table.boolean('is_dynamic').defaultTo(false);
    table.decimal('min_price', 10, 2);
    table.decimal('max_price', 10, 2);
    table.jsonb('price_adjustment_rules');
    table.decimal('current_price', 10, 2);
    table.decimal('early_bird_price', 10, 2);
    table.timestamp('early_bird_ends_at', { useTz: true });
    table.decimal('last_minute_price', 10, 2);
    table.timestamp('last_minute_starts_at', { useTz: true });
    table.integer('group_size_min');
    table.decimal('group_discount_percentage', 5, 2);
    table.string('currency', 3).defaultTo('USD');
    table.timestamp('sales_start_at', { useTz: true });
    table.timestamp('sales_end_at', { useTz: true });
    table.integer('max_per_order');
    table.integer('max_per_customer');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_visible').defaultTo(true);
    table.integer('display_order').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Optimistic locking (from 003)
    table.integer('version').notNullable().defaultTo(1);
  });

  await knex.raw('CREATE INDEX idx_event_pricing_tenant_id ON event_pricing(tenant_id)');
  await knex.raw('CREATE INDEX idx_event_pricing_event_id ON event_pricing(event_id)');
  await knex.raw('CREATE INDEX idx_event_pricing_schedule_id ON event_pricing(schedule_id)');
  await knex.raw('CREATE INDEX idx_event_pricing_capacity_id ON event_pricing(capacity_id)');
  await knex.raw('CREATE INDEX idx_event_pricing_active_sales ON event_pricing(is_active, sales_start_at, sales_end_at)');
  await knex.raw('CREATE INDEX idx_event_pricing_deleted_at ON event_pricing(deleted_at)');
  await knex.raw('CREATE INDEX idx_event_pricing_tenant_event ON event_pricing(tenant_id, event_id)');

  // event_pricing CHECK constraints
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_base_price_check
    CHECK (base_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_service_fee_check
    CHECK (service_fee >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_facility_fee_check
    CHECK (facility_fee >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_tax_rate_check
    CHECK (tax_rate >= 0 AND tax_rate <= 1)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_min_price_check
    CHECK (min_price IS NULL OR min_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_max_price_check
    CHECK (max_price IS NULL OR max_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_current_price_check
    CHECK (current_price IS NULL OR current_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_early_bird_price_check
    CHECK (early_bird_price IS NULL OR early_bird_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_last_minute_price_check
    CHECK (last_minute_price IS NULL OR last_minute_price >= 0)
  `);
  await knex.raw(`
    ALTER TABLE event_pricing ADD CONSTRAINT event_pricing_group_discount_check
    CHECK (group_discount_percentage IS NULL OR (group_discount_percentage >= 0 AND group_discount_percentage <= 100))
  `);

  // ==========================================================================
  // TABLE 6: event_metadata
  // ==========================================================================
  await knex.schema.createTable('event_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable().unique().references('id').inTable('events').onDelete('CASCADE');

    // Performers
    table.jsonb('performers');
    table.string('headliner', 200);
    table.specificType('supporting_acts', 'TEXT[]');

    // Production
    table.string('production_company', 200);
    table.jsonb('technical_requirements');
    table.integer('stage_setup_time_hours');

    // Sponsors
    table.jsonb('sponsors');
    table.string('primary_sponsor', 200);

    // Licensing
    table.string('performance_rights_org', 100);
    table.specificType('licensing_requirements', 'TEXT[]');
    table.jsonb('insurance_requirements');

    // Marketing
    table.text('press_release');
    table.jsonb('marketing_copy');
    table.jsonb('social_media_copy');

    // Technical Requirements
    table.jsonb('sound_requirements');
    table.jsonb('lighting_requirements');
    table.jsonb('video_requirements');
    table.jsonb('catering_requirements');
    table.jsonb('rider_requirements');

    // Financial
    table.decimal('production_budget', 12, 2);
    table.decimal('marketing_budget', 12, 2);
    table.decimal('projected_revenue', 12, 2);
    table.integer('break_even_capacity');

    // History & Custom
    table.jsonb('previous_events');
    table.jsonb('custom_fields');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // NOTE: No version column - intentionally excluded (static data, low concurrency risk)
  });

  await knex.raw('CREATE INDEX idx_event_metadata_event_id ON event_metadata(event_id)');
  await knex.raw('CREATE INDEX idx_event_metadata_deleted_at ON event_metadata(deleted_at)');
  await knex.raw('CREATE INDEX idx_event_metadata_tenant_id ON event_metadata(tenant_id)');

  // ==========================================================================
  // FOREIGN KEY CONSTRAINTS - INTERNAL
  // ==========================================================================
  console.log('Adding internal foreign key constraints...');

  // events → tenants (FK)
  await knex.raw(`
    ALTER TABLE events
    ADD CONSTRAINT fk_events_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  `);

  // event_schedules → tenants (FK)
  await knex.raw(`
    ALTER TABLE event_schedules
    ADD CONSTRAINT fk_event_schedules_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  `);

  // event_capacity → tenants (FK)
  await knex.raw(`
    ALTER TABLE event_capacity
    ADD CONSTRAINT fk_event_capacity_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  `);

  // event_pricing → tenants (FK)
  await knex.raw(`
    ALTER TABLE event_pricing
    ADD CONSTRAINT fk_event_pricing_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  `);

  // event_metadata → tenants (FK)
  await knex.raw(`
    ALTER TABLE event_metadata
    ADD CONSTRAINT fk_event_metadata_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  `);

  console.log('✅ Internal FK constraints added');

  // ==========================================================================
  // FOREIGN KEY CONSTRAINTS - CROSS-SERVICE
  // ==========================================================================
  console.log('Adding cross-service foreign key constraints...');

  await knex.schema.alterTable('events', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
    table.foreign('venue_layout_id').references('id').inTable('venue_layouts').onDelete('SET NULL');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });

  console.log('✅ Cross-service FK constraints added');

  // ==========================================================================
  // TRIGGERS - updated_at
  // ==========================================================================
  console.log('Creating triggers...');

  const tablesWithUpdatedAt = [
    'event_categories',
    'events',
    'event_schedules',
    'event_capacity',
    'event_pricing',
    'event_metadata'
  ];

  for (const tableName of tablesWithUpdatedAt) {
    await knex.raw(`
      CREATE TRIGGER trigger_update_${tableName}_timestamp
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  // ==========================================================================
  // TRIGGERS - version (optimistic locking)
  // ==========================================================================
  const tablesWithVersion = [
    'events',
    'event_schedules',
    'event_capacity',
    'event_pricing'
  ];

  for (const tableName of tablesWithVersion) {
    await knex.raw(`
      CREATE TRIGGER ${tableName}_version_trigger
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION increment_version();
    `);
  }

  // ==========================================================================
  // TRIGGERS - audit (conditional)
  // ==========================================================================
  const auditFunctionExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function'
    );
  `);

  if (auditFunctionExists.rows[0].exists) {
    await knex.raw(`
      CREATE TRIGGER audit_events_changes
      AFTER INSERT OR UPDATE OR DELETE ON events
      FOR EACH ROW
      EXECUTE FUNCTION audit_trigger_function();
    `);
    console.log('✅ Audit trigger attached to events table');
  } else {
    console.warn('⚠️  audit_trigger_function not found - run auth-service migrations first');
  }

  console.log('✅ Triggers created');

  // ==========================================================================
  // ROW LEVEL SECURITY
  // ==========================================================================
  console.log('Enabling Row Level Security...');

  // Helper function for RLS
  const setupTableRLS = async (tableName: string) => {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation_select ON ${tableName}
        FOR SELECT
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation_insert ON ${tableName}
        FOR INSERT
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation_update ON ${tableName}
        FOR UPDATE
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation_delete ON ${tableName}
        FOR DELETE
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  };

  // Apply RLS to all tenant tables
  const rlsTables = [
    'events',
    'event_schedules',
    'event_capacity',
    'event_pricing',
    'event_metadata'
  ];

  for (const tableName of rlsTables) {
    await setupTableRLS(tableName);
  }

  console.log('✅ Row Level Security enabled on all tenant tables');
  console.log('');
  console.log('✅ Event Service consolidated baseline migration complete');
  console.log('   - 6 tables created');
  console.log('   - 5 tables with RLS');
  console.log('   - 1 global table (event_categories)');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Rolling back event-service consolidated baseline...');

  // Tables to drop (in reverse dependency order)
  const allTables = [
    'event_metadata',
    'event_pricing',
    'event_capacity',
    'event_schedules',
    'events',
    'event_categories'
  ];

  // Drop RLS policies first
  for (const tableName of allTables) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (tableExists) {
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_select ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_insert ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_update ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_delete ON ${tableName}`);
    }
  }

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS audit_events_changes ON events');

  const tablesWithVersion = ['events', 'event_schedules', 'event_capacity', 'event_pricing'];
  for (const tableName of tablesWithVersion) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${tableName}_version_trigger ON ${tableName}`);
  }

  const tablesWithUpdatedAt = ['event_categories', 'events', 'event_schedules', 'event_capacity', 'event_pricing', 'event_metadata'];
  for (const tableName of tablesWithUpdatedAt) {
    await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_${tableName}_timestamp ON ${tableName}`);
  }

  // Drop tables in reverse order
  for (const tableName of allTables) {
    await knex.schema.dropTableIfExists(tableName);
  }

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS increment_version()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('✅ Rollback complete');
}
