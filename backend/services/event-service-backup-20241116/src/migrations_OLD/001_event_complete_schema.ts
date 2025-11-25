import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // =============================================
  // CREATE EVENTS TABLE
  // =============================================
  const hasEvents = await knex.schema.hasTable('events');
  if (!hasEvents) {
    await knex.schema.createTable('events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('venue_layout_id').references('id').inTable('venue_layouts');
      table.string('name', 300).notNullable();
      table.string('slug', 300).notNullable();
      table.text('description');
      table.string('short_description', 500);
      table.string('event_type', 50).notNullable().defaultTo('single');
      table.uuid('primary_category_id');
      table.specificType('secondary_category_ids', 'UUID[]');
      table.specificType('tags', 'TEXT[]');
      table.string('status', 20).notNullable().defaultTo('DRAFT');
      table.string('visibility', 20).defaultTo('PUBLIC');
      table.boolean('is_featured').defaultTo(false);
      table.integer('priority_score').defaultTo(0);
      table.text('banner_image_url');
      table.text('thumbnail_image_url');
      table.jsonb('image_gallery').defaultTo('[]');
      table.text('video_url');
      table.text('virtual_event_url');
      table.integer('age_restriction').defaultTo(0);
      table.string('dress_code', 100);
      table.specificType('special_requirements', 'TEXT[]');
      table.jsonb('accessibility_info').defaultTo('{}');
      table.string('collection_address', 44);
      table.string('mint_authority', 44);
      table.decimal('royalty_percentage', 5, 2);
      table.boolean('is_virtual').defaultTo(false);
      table.boolean('is_hybrid').defaultTo(false);
      table.string('streaming_platform', 50);
      table.jsonb('streaming_config').defaultTo('{}');
      table.text('cancellation_policy');
      table.text('refund_policy');
      table.integer('cancellation_deadline_hours').defaultTo(24);
      table.string('meta_title', 70);
      table.string('meta_description', 160);
      table.specificType('meta_keywords', 'TEXT[]');
      table.integer('view_count').defaultTo(0);
      table.integer('interest_count').defaultTo(0);
      table.integer('share_count').defaultTo(0);
      table.string('external_id', 100);
      table.jsonb('metadata').defaultTo('{}');
      table.uuid('created_by').references('id').inTable('users');
      table.uuid('updated_by').references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('deleted_at', { useTz: true });

      table.index('tenant_id');
      table.index('venue_id');
      table.index('slug');
      table.index('status');
      table.index('primary_category_id');
      table.index('created_at');
      table.index('deleted_at');
      table.index(['is_featured', 'priority_score']);
      table.index(['tenant_id', 'status']); // Composite index for common queries
    });
  }

  // =============================================
  // CREATE EVENT_CATEGORIES TABLE
  // =============================================
  const hasEventCategories = await knex.schema.hasTable('event_categories');
  if (!hasEventCategories) {
    await knex.schema.createTable('event_categories', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('parent_id').references('id').inTable('event_categories').onDelete('CASCADE');
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

      table.index('parent_id');
      table.index('slug');
      table.index('is_active');
    });

    await knex.schema.alterTable('events', (table) => {
      table.foreign('primary_category_id').references('id').inTable('event_categories').onDelete('SET NULL');
    });
  }

  // =============================================
  // CREATE EVENT_SCHEDULES TABLE
  // =============================================
  const hasEventSchedules = await knex.schema.hasTable('event_schedules');
  if (!hasEventSchedules) {
    await knex.schema.createTable('event_schedules', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
      table.timestamp('starts_at', { useTz: true }).notNullable();
      table.timestamp('ends_at', { useTz: true }).notNullable();
      table.timestamp('doors_open_at', { useTz: true });
      table.boolean('is_recurring').defaultTo(false);
      table.text('recurrence_rule');
      table.date('recurrence_end_date');
      table.integer('occurrence_number');
      table.string('timezone', 50).notNullable();
      table.integer('utc_offset');
      table.string('status', 20).defaultTo('SCHEDULED');
      table.text('status_reason');
      table.integer('capacity_override');
      table.timestamp('check_in_opens_at', { useTz: true });
      table.timestamp('check_in_closes_at', { useTz: true });
      table.text('notes');
      table.jsonb('metadata').defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('tenant_id');
      table.index('event_id');
      table.index('starts_at');
      table.index('status');
      table.index(['tenant_id', 'starts_at']); // Common query pattern
    });
  }

  // =============================================
  // CREATE EVENT_CAPACITY TABLE
  // =============================================
  const hasEventCapacity = await knex.schema.hasTable('event_capacity');
  if (!hasEventCapacity) {
    await knex.schema.createTable('event_capacity', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
      table.uuid('schedule_id').references('id').inTable('event_schedules').onDelete('CASCADE');
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
      table.jsonb('row_config');
      table.jsonb('seat_map');
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_visible').defaultTo(true);
      table.integer('minimum_purchase').defaultTo(1);
      table.integer('maximum_purchase');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.unique(['event_id', 'section_name', 'schedule_id']);
      table.index('tenant_id');
      table.index('event_id');
      table.index('schedule_id');
      table.index('available_capacity');
      table.index('reserved_expires_at'); // For cleanup job
    });
  }

  // =============================================
  // CREATE EVENT_PRICING TABLE
  // =============================================
  const hasEventPricing = await knex.schema.hasTable('event_pricing');
  if (!hasEventPricing) {
    await knex.schema.createTable('event_pricing', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
      table.uuid('schedule_id').references('id').inTable('event_schedules').onDelete('CASCADE');
      table.uuid('capacity_id').references('id').inTable('event_capacity').onDelete('CASCADE');
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
      table.jsonb('price_adjustment_rules').defaultTo('{}');
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

      table.index('tenant_id');
      table.index('event_id');
      table.index('schedule_id');
      table.index('capacity_id');
      table.index(['is_active', 'sales_start_at', 'sales_end_at']);
    });
  }

  // =============================================
  // CREATE EVENT_METADATA TABLE
  // =============================================
  const hasEventMetadata = await knex.schema.hasTable('event_metadata');
  if (!hasEventMetadata) {
    await knex.schema.createTable('event_metadata', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001');
      table.uuid('event_id').notNullable().unique().references('id').inTable('events').onDelete('CASCADE');
      table.jsonb('performers').defaultTo('[]');
      table.string('headliner', 200);
      table.specificType('supporting_acts', 'TEXT[]');
      table.string('production_company', 200);
      table.jsonb('technical_requirements').defaultTo('{}');
      table.integer('stage_setup_time_hours');
      table.jsonb('sponsors').defaultTo('[]');
      table.string('primary_sponsor', 200);
      table.string('performance_rights_org', 100);
      table.specificType('licensing_requirements', 'TEXT[]');
      table.jsonb('insurance_requirements').defaultTo('{}');
      table.text('press_release');
      table.jsonb('marketing_copy').defaultTo('{}');
      table.jsonb('social_media_copy').defaultTo('{}');
      table.jsonb('sound_requirements').defaultTo('{}');
      table.jsonb('lighting_requirements').defaultTo('{}');
      table.jsonb('video_requirements').defaultTo('{}');
      table.jsonb('catering_requirements').defaultTo('{}');
      table.jsonb('rider_requirements').defaultTo('{}');
      table.decimal('production_budget', 12, 2);
      table.decimal('marketing_budget', 12, 2);
      table.decimal('projected_revenue', 12, 2);
      table.integer('break_even_capacity');
      table.jsonb('previous_events').defaultTo('[]');
      table.jsonb('custom_fields').defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('tenant_id');
      table.index('event_id');
    });
  }

  // =============================================
  // CREATE TRIGGERS
  // =============================================
  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_events_timestamp ON events`);
  await knex.raw(`CREATE TRIGGER trigger_update_events_timestamp BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_event_categories_timestamp ON event_categories`);
  await knex.raw(`CREATE TRIGGER trigger_update_event_categories_timestamp BEFORE UPDATE ON event_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_event_schedules_timestamp ON event_schedules`);
  await knex.raw(`CREATE TRIGGER trigger_update_event_schedules_timestamp BEFORE UPDATE ON event_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_event_capacity_timestamp ON event_capacity`);
  await knex.raw(`CREATE TRIGGER trigger_update_event_capacity_timestamp BEFORE UPDATE ON event_capacity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_event_pricing_timestamp ON event_pricing`);
  await knex.raw(`CREATE TRIGGER trigger_update_event_pricing_timestamp BEFORE UPDATE ON event_pricing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_event_metadata_timestamp ON event_metadata`);
  await knex.raw(`CREATE TRIGGER trigger_update_event_metadata_timestamp BEFORE UPDATE ON event_metadata FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_event_slug()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.slug := (SELECT slug FROM venues WHERE id = NEW.venue_id) || '-' || NEW.slug;
        WHILE EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug AND id != NEW.id) LOOP
          NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_generate_event_slug ON events`);
  await knex.raw(`CREATE TRIGGER trigger_generate_event_slug BEFORE INSERT OR UPDATE OF name ON events FOR EACH ROW EXECUTE FUNCTION generate_event_slug()`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_available_capacity()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.available_capacity := NEW.total_capacity - NEW.sold_count - NEW.pending_count - NEW.reserved_capacity;
      IF NEW.available_capacity < 0 THEN NEW.available_capacity := 0; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_available_capacity ON event_capacity`);
  await knex.raw(`CREATE TRIGGER trigger_update_available_capacity BEFORE INSERT OR UPDATE OF sold_count, pending_count, reserved_capacity, total_capacity ON event_capacity FOR EACH ROW EXECUTE FUNCTION update_available_capacity()`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_event_metadata()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO event_metadata (event_id, tenant_id) VALUES (NEW.id, NEW.tenant_id) ON CONFLICT (event_id) DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_create_event_metadata ON events`);
  await knex.raw(`CREATE TRIGGER trigger_create_event_metadata AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION create_event_metadata()`);

  // =============================================
  // INSERT SAMPLE CATEGORIES
  // =============================================
  await knex('event_categories').insert([
    { id: knex.raw('uuid_generate_v1()'), name: 'Music', slug: 'music', description: 'Concerts, festivals, and musical performances', icon: 'music', color: '#FF6B6B', display_order: 1 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Sports', slug: 'sports', description: 'Sporting events and competitions', icon: 'sports', color: '#4ECDC4', display_order: 2 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Theater', slug: 'theater', description: 'Plays, musicals, and theatrical performances', icon: 'theater', color: '#45B7D1', display_order: 3 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Comedy', slug: 'comedy', description: 'Stand-up comedy and humor shows', icon: 'comedy', color: '#F7DC6F', display_order: 4 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Arts', slug: 'arts', description: 'Art exhibitions, galleries, and cultural events', icon: 'arts', color: '#BB8FCE', display_order: 5 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Conference', slug: 'conference', description: 'Business conferences and professional events', icon: 'conference', color: '#85C1E2', display_order: 6 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Workshop', slug: 'workshop', description: 'Educational workshops and training sessions', icon: 'workshop', color: '#73C6B6', display_order: 7 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Festival', slug: 'festival', description: 'Multi-day festivals and celebrations', icon: 'festival', color: '#F8B739', display_order: 8 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Family', slug: 'family', description: 'Family-friendly events and activities', icon: 'family', color: '#82E0AA', display_order: 9 },
    { id: knex.raw('uuid_generate_v1()'), name: 'Nightlife', slug: 'nightlife', description: 'Clubs, parties, and late-night events', icon: 'nightlife', color: '#D68910', display_order: 10 }
  ]).onConflict('slug').ignore();

  console.log('✅ Event service migration completed with tenant isolation');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_metadata');
  await knex.schema.dropTableIfExists('event_pricing');
  await knex.schema.dropTableIfExists('event_capacity');
  await knex.schema.dropTableIfExists('event_schedules');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('event_categories');
}
