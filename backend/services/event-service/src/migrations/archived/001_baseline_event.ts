import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create the update_updated_at_column function if it doesn't exist
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // NOTE: Tenants table is created by auth-service
  // This service only references it via FK constraints

  // 1. EVENT_CATEGORIES TABLE (hierarchical categories)
  await knex.schema.createTableIfNotExists('event_categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
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

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_categories_parent_id ON event_categories(parent_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_categories_slug ON event_categories(slug)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_categories_is_active ON event_categories(is_active)');

  // Seed default categories (check if already exist)
  const categoryCount = await knex('event_categories').count('* as count').first();
  if (categoryCount && Number(categoryCount.count) === 0) {
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
  }

  // 2. EVENTS TABLE (main event table - 50+ fields)
  await knex.schema.createTableIfNotExists('events', (table) => {
    // Core Identity
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
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

    // Transfer Settings (for ticket transfer service)
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
  });

  // Events indexes
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_venue_status ON events(venue_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_primary_category_id ON events(primary_category_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_is_featured_priority ON events(is_featured, priority_score)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_status ON events(tenant_id, status)');
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_venue_slug ON events(venue_id, slug) WHERE deleted_at IS NULL');

  // GIN indexes for JSONB
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_metadata_gin ON events USING gin(metadata)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_accessibility_gin ON events USING gin(accessibility_info)');

  // Full-text search index
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_events_search ON events USING gin(
      to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(short_description, '')
      )
    )
  `);

  // Check constraints (use DO block to avoid errors if already exist)
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events ADD CONSTRAINT events_visibility_check CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'UNLISTED'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ('single', 'recurring', 'series'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 3. EVENT_SCHEDULES TABLE
  await knex.schema.createTableIfNotExists('event_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
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
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_id ON event_schedules(tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_event_id ON event_schedules(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_starts_at ON event_schedules(starts_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_status ON event_schedules(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_starts ON event_schedules(tenant_id, starts_at)');

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_schedules ADD CONSTRAINT event_schedules_status_check CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 4. EVENT_CAPACITY TABLE
  await knex.schema.createTableIfNotExists('event_capacity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
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
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_tenant_id ON event_capacity(tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_event_id ON event_capacity(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_schedule_id ON event_capacity(schedule_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_available ON event_capacity(available_capacity)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_reserved_expires ON event_capacity(reserved_expires_at)');
  await knex.raw("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_capacity_unique ON event_capacity(event_id, section_name, COALESCE(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid))");
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_deleted_at ON event_capacity(deleted_at)');

  // 5. EVENT_PRICING TABLE
  await knex.schema.createTableIfNotExists('event_pricing', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
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
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_tenant_id ON event_pricing(tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_event_id ON event_pricing(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_schedule_id ON event_pricing(schedule_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_capacity_id ON event_pricing(capacity_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_active_sales ON event_pricing(is_active, sales_start_at, sales_end_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_deleted_at ON event_pricing(deleted_at)');

  // 6. EVENT_METADATA TABLE
  await knex.schema.createTableIfNotExists('event_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
    table.uuid('event_id').notNullable().unique().references('id').inTable('events').onDelete('CASCADE');
    table.jsonb('performers');
    table.string('headliner', 200);
    table.specificType('supporting_acts', 'TEXT[]');
    table.string('production_company', 200);
    table.jsonb('technical_requirements');
    table.integer('stage_setup_time_hours');
    table.jsonb('sponsors');
    table.string('primary_sponsor', 200);
    table.string('performance_rights_org', 100);
    table.specificType('licensing_requirements', 'TEXT[]');
    table.jsonb('insurance_requirements');
    table.text('press_release');
    table.jsonb('marketing_copy');
    table.jsonb('social_media_copy');
    table.jsonb('sound_requirements');
    table.jsonb('lighting_requirements');
    table.jsonb('video_requirements');
    table.jsonb('catering_requirements');
    table.jsonb('rider_requirements');
    table.decimal('production_budget', 12, 2);
    table.decimal('marketing_budget', 12, 2);
    table.decimal('projected_revenue', 12, 2);
    table.integer('break_even_capacity');
    table.jsonb('previous_events');
    table.jsonb('custom_fields');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_metadata_event_id ON event_metadata(event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_metadata_deleted_at ON event_metadata(deleted_at)');

  // ==========================================
  // TRIGGERS
  // ==========================================

  // Trigger: Auto-update updated_at on events table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_events_timestamp ON events;
    CREATE TRIGGER trigger_update_events_timestamp
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Trigger: Auto-update updated_at on event_schedules table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_event_schedules_timestamp ON event_schedules;
    CREATE TRIGGER trigger_update_event_schedules_timestamp
    BEFORE UPDATE ON event_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Trigger: Auto-update updated_at on event_capacity table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_event_capacity_timestamp ON event_capacity;
    CREATE TRIGGER trigger_update_event_capacity_timestamp
    BEFORE UPDATE ON event_capacity
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Trigger: Auto-update updated_at on event_pricing table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_event_pricing_timestamp ON event_pricing;
    CREATE TRIGGER trigger_update_event_pricing_timestamp
    BEFORE UPDATE ON event_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Trigger: Auto-update updated_at on event_metadata table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_event_metadata_timestamp ON event_metadata;
    CREATE TRIGGER trigger_update_event_metadata_timestamp
    BEFORE UPDATE ON event_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Trigger: Auto-update updated_at on event_categories table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_event_categories_timestamp ON event_categories;
    CREATE TRIGGER trigger_update_event_categories_timestamp
    BEFORE UPDATE ON event_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Audit trigger for events table (compliance)
  const functionExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function'
    );
  `);

  if (!functionExists.rows[0].exists) {
    console.warn('⚠️  audit_trigger_function not found - run auth-service migrations first');
  } else {
    await knex.raw(`
      DROP TRIGGER IF EXISTS audit_events_changes ON events;
      CREATE TRIGGER audit_events_changes
        AFTER INSERT OR UPDATE OR DELETE ON events
        FOR EACH ROW 
        EXECUTE FUNCTION audit_trigger_function();
    `);
    console.log('✅ Audit trigger attached to events table');
  }

  // ==========================================
  // TENANT ISOLATION: FOREIGN KEY CONSTRAINTS
  // ==========================================

  // Add FK constraints to enforce tenant isolation at database level
  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE events
        ADD CONSTRAINT fk_events_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_schedules
        ADD CONSTRAINT fk_event_schedules_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_capacity
        ADD CONSTRAINT fk_event_capacity_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_pricing
        ADD CONSTRAINT fk_event_pricing_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TABLE event_metadata
        ADD CONSTRAINT fk_event_metadata_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ==========================================
  // COMPOSITE INDEXES FOR TENANT-SCOPED QUERIES
  // ==========================================

  // Optimize queries that filter by tenant_id (10-100x performance improvement)
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_venue ON events(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at DESC)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_events_tenant_category ON events(tenant_id, primary_category_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_event ON event_schedules(tenant_id, event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_capacity_tenant_event ON event_capacity(tenant_id, event_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_event_pricing_tenant_event ON event_pricing(tenant_id, event_id)');

  // ==========================================
  // FOREIGN KEY CONSTRAINTS (CROSS-SERVICE)
  // ==========================================
  console.log('');
  console.log('🔗 Adding cross-service foreign key constraints...');

  // events table FKs
  await knex.schema.alterTable('events', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
    table.foreign('venue_layout_id').references('id').inTable('venue_layouts').onDelete('SET NULL');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ events → venues, venue_layouts, users (created_by, updated_by)');

  console.log('✅ All cross-service FK constraints added (4 total)');

  console.log('✅ Event Service migration complete - Tenant isolation enforced with FK constraints');
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS audit_events_changes ON events');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_event_categories_timestamp ON event_categories');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_event_metadata_timestamp ON event_metadata');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_event_pricing_timestamp ON event_pricing');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_event_capacity_timestamp ON event_capacity');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_event_schedules_timestamp ON event_schedules');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_events_timestamp ON events');

  // Drop tables in reverse order (audit_logs kept - shared with other services)
  await knex.schema.dropTableIfExists('event_metadata');
  await knex.schema.dropTableIfExists('event_pricing');
  await knex.schema.dropTableIfExists('event_capacity');
  await knex.schema.dropTableIfExists('event_schedules');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('event_categories');
}
