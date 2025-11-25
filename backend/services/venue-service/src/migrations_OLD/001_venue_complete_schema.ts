import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // =============================================
  // CREATE VENUES TABLE
  // =============================================
  const hasVenues = await knex.schema.hasTable('venues');
  if (!hasVenues) {
    await knex.schema.createTable('venues', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.string('name', 200).notNullable();
      table.string('slug', 200).notNullable().unique();
      table.text('description');
      table.string('venue_type', 50).notNullable().defaultTo('general');
      table.string('email', 255).notNullable();
      table.string('phone', 20);
      table.text('website');
      table.string('address_line1', 255).notNullable();
      table.string('address_line2', 255);
      table.string('city', 100).notNullable();
      table.string('state_province', 100).notNullable();
      table.string('postal_code', 20);
      table.string('country_code', 2).notNullable();
      table.decimal('latitude', 10, 8);
      table.decimal('longitude', 11, 8);
      table.string('timezone', 50).notNullable().defaultTo('UTC');
      table.integer('max_capacity').notNullable();
      table.integer('standing_capacity');
      table.integer('seated_capacity');
      table.integer('vip_capacity');
      table.text('logo_url');
      table.text('cover_image_url');
      table.jsonb('image_gallery').defaultTo('[]');
      table.text('virtual_tour_url');
      table.string('business_name', 200);
      table.string('business_registration', 100);
      table.string('tax_id', 50);
      table.string('business_type', 50);
      table.string('wallet_address', 44);
      table.string('collection_address', 44);
      table.decimal('royalty_percentage', 5, 2).defaultTo(2.50);
      table.string('status', 20).defaultTo('PENDING');
      table.boolean('is_verified').defaultTo(false);
      table.timestamp('verified_at', { useTz: true });
      table.string('verification_level', 20);
      table.specificType('features', 'TEXT[]');
      table.jsonb('amenities').defaultTo('{}');
      table.specificType('accessibility_features', 'TEXT[]');
      table.integer('age_restriction').defaultTo(0);
      table.text('dress_code');
      table.specificType('prohibited_items', 'TEXT[]');
      table.text('cancellation_policy');
      table.text('refund_policy');
      table.jsonb('social_media').defaultTo('{}');
      table.decimal('average_rating', 3, 2).defaultTo(0.00);
      table.integer('total_reviews').defaultTo(0);
      table.integer('total_events').defaultTo(0);
      table.integer('total_tickets_sold').defaultTo(0);
      table.jsonb('metadata').defaultTo('{}');
      table.specificType('tags', 'TEXT[]');
      table.uuid('created_by').references('id').inTable('users');
      table.uuid('updated_by').references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('deleted_at', { useTz: true });

      table.index('slug');
      table.index('status');
      table.index(['city', 'country_code']);
      table.index('created_by');
      table.index('deleted_at');
    });
  }

  // =============================================
  // CREATE VENUE_STAFF TABLE
  // =============================================
  const hasVenueStaff = await knex.schema.hasTable('venue_staff');
  if (!hasVenueStaff) {
    await knex.schema.createTable('venue_staff', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('role', 50).notNullable();
      table.jsonb('permissions').defaultTo('[]');
      table.string('department', 100);
      table.string('job_title', 100);
      table.string('employment_type', 20);
      table.date('start_date').notNullable().defaultTo(knex.fn.now());
      table.date('end_date');
      table.boolean('is_active').defaultTo(true);
      table.specificType('access_areas', 'TEXT[]');
      table.jsonb('shift_schedule');
      table.string('pin_code', 6);
      table.string('contact_email', 255);
      table.string('contact_phone', 20);
      table.jsonb('emergency_contact');
      table.decimal('hourly_rate', 10, 2);
      table.decimal('commission_percentage', 5, 2);
      table.uuid('added_by').references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.unique(['venue_id', 'user_id']);
      table.index('venue_id');
      table.index('user_id');
      table.index('role');
    });
  }

  // =============================================
  // CREATE VENUE_SETTINGS TABLE
  // =============================================
  const hasVenueSettings = await knex.schema.hasTable('venue_settings');
  if (!hasVenueSettings) {
    await knex.schema.createTable('venue_settings', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().unique().references('id').inTable('venues').onDelete('CASCADE');
      table.boolean('allow_print_at_home').defaultTo(true);
      table.boolean('allow_mobile_tickets').defaultTo(true);
      table.boolean('require_id_verification').defaultTo(false);
      table.boolean('ticket_transfer_allowed').defaultTo(true);
      table.boolean('ticket_resale_allowed').defaultTo(true);
      table.integer('max_tickets_per_order').defaultTo(10);
      table.decimal('service_fee_percentage', 5, 2).defaultTo(2.50);
      table.decimal('facility_fee_amount', 10, 2).defaultTo(0.00);
      table.decimal('processing_fee_percentage', 5, 2).defaultTo(2.95);
      table.jsonb('payment_methods').defaultTo('["credit_card", "crypto"]');
      table.specificType('accepted_currencies', 'TEXT[]').defaultTo(knex.raw("ARRAY['USD', 'SOL']::TEXT[]"));
      table.string('payout_frequency', 20).defaultTo('weekly');
      table.decimal('minimum_payout_amount', 10, 2).defaultTo(100.00);
      table.jsonb('email_notifications').defaultTo('{"new_order":true,"cancellation":true,"review":true,"payout":true}');
      table.text('webhook_url');
      table.string('webhook_secret', 255);
      table.string('google_analytics_id', 50);
      table.string('facebook_pixel_id', 50);
      table.text('custom_tracking_code');
      table.boolean('require_2fa').defaultTo(false);
      table.specificType('ip_whitelist', 'INET[]');
      table.integer('api_rate_limit').defaultTo(1000);
      table.string('primary_color', 7);
      table.string('secondary_color', 7);
      table.text('custom_css');
      table.text('custom_js');
      table.string('check_in_method', 20).defaultTo('qr_code');
      table.integer('early_entry_minutes').defaultTo(30);
      table.integer('late_entry_minutes').defaultTo(60);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('venue_id');
    });
  }

  // =============================================
  // CREATE VENUE_INTEGRATIONS TABLE
  // =============================================
  const hasVenueIntegrations = await knex.schema.hasTable('venue_integrations');
  if (!hasVenueIntegrations) {
    await knex.schema.createTable('venue_integrations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.string('integration_type', 50).notNullable();
      table.string('integration_name', 100).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.text('api_key_encrypted');
      table.text('api_secret_encrypted');
      table.text('webhook_endpoint');
      table.jsonb('config_data').defaultTo('{}');
      table.boolean('sync_enabled').defaultTo(false);
      table.string('sync_frequency', 20);
      table.timestamp('last_sync_at', { useTz: true });
      table.string('last_sync_status', 20);
      table.text('last_sync_error');
      table.jsonb('field_mappings').defaultTo('{}');
      table.integer('rate_limit');
      table.integer('rate_limit_window');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.unique(['venue_id', 'integration_type']);
      table.index('venue_id');
      table.index('integration_type');
    });
  }

  // =============================================
  // CREATE VENUE_LAYOUTS TABLE
  // =============================================
  const hasVenueLayouts = await knex.schema.hasTable('venue_layouts');
  if (!hasVenueLayouts) {
    await knex.schema.createTable('venue_layouts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.string('name', 200).notNullable();
      table.text('description');
      table.string('layout_type', 50).notNullable();
      table.boolean('is_default').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.integer('total_capacity').notNullable();
      table.integer('seated_capacity');
      table.integer('standing_capacity');
      table.integer('accessible_capacity');
      table.text('svg_data');
      table.jsonb('seat_map');
      table.jsonb('sections').notNullable().defaultTo('[]');
      table.jsonb('price_tiers').defaultTo('[]');
      table.string('stage_location', 20);
      table.jsonb('stage_dimensions');
      table.jsonb('entry_points').defaultTo('[]');
      table.jsonb('exit_points').defaultTo('[]');
      table.jsonb('emergency_exits').defaultTo('[]');
      table.jsonb('restroom_locations').defaultTo('[]');
      table.jsonb('concession_locations').defaultTo('[]');
      table.jsonb('merchandise_locations').defaultTo('[]');
      table.jsonb('metadata').defaultTo('{}');
      table.uuid('created_by').references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('venue_id');
    });
  }

  // =============================================
  // CREATE VENUE_COMPLIANCE TABLE
  // =============================================
  const hasVenueCompliance = await knex.schema.hasTable('venue_compliance');
  if (!hasVenueCompliance) {
    await knex.schema.createTable('venue_compliance', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.string('license_type', 100).notNullable();
      table.string('license_number', 100);
      table.string('issuing_authority', 200);
      table.date('issue_date');
      table.date('expiry_date');
      table.boolean('is_verified').defaultTo(false);
      table.text('document_url');
      table.string('document_hash', 64);
      table.string('status', 20).defaultTo('PENDING');
      table.string('compliance_level', 20);
      table.string('insurance_provider', 200);
      table.string('insurance_policy_number', 100);
      table.decimal('insurance_coverage_amount', 12, 2);
      table.date('insurance_expiry');
      table.date('fire_safety_cert_date');
      table.date('health_inspection_date');
      table.date('security_assessment_date');
      table.integer('approved_capacity');
      table.boolean('emergency_plan_approved').defaultTo(false);
      table.text('compliance_notes');
      table.jsonb('outstanding_issues').defaultTo('[]');
      table.uuid('verified_by').references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('venue_id');
      table.index('expiry_date');
      table.index('status');
    });
  }

  // =============================================
  // CREATE VENUE_DOCUMENTS TABLE
  // =============================================
  const hasVenueDocuments = await knex.schema.hasTable('venue_documents');
  if (!hasVenueDocuments) {
    await knex.schema.createTable('venue_documents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.string('type', 100).notNullable();
      table.string('document_type', 100);
      table.string('status', 50).defaultTo('pending');
      table.timestamp('submitted_at', { useTz: true });
      table.jsonb('metadata').defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index('venue_id');
    });
  }

  // =============================================
  // CREATE TRIGGERS
  // =============================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venues_timestamp ON venues`);
  await knex.raw(`CREATE TRIGGER trigger_update_venues_timestamp BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venue_settings_timestamp ON venue_settings`);
  await knex.raw(`CREATE TRIGGER trigger_update_venue_settings_timestamp BEFORE UPDATE ON venue_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venue_staff_timestamp ON venue_staff`);
  await knex.raw(`CREATE TRIGGER trigger_update_venue_staff_timestamp BEFORE UPDATE ON venue_staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venue_layouts_timestamp ON venue_layouts`);
  await knex.raw(`CREATE TRIGGER trigger_update_venue_layouts_timestamp BEFORE UPDATE ON venue_layouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venue_integrations_timestamp ON venue_integrations`);
  await knex.raw(`CREATE TRIGGER trigger_update_venue_integrations_timestamp BEFORE UPDATE ON venue_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_update_venue_compliance_timestamp ON venue_compliance`);
  await knex.raw(`CREATE TRIGGER trigger_update_venue_compliance_timestamp BEFORE UPDATE ON venue_compliance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_venue_slug()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        WHILE EXISTS (SELECT 1 FROM venues WHERE slug = NEW.slug AND id != NEW.id) LOOP
          NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_generate_venue_slug ON venues`);
  await knex.raw(`CREATE TRIGGER trigger_generate_venue_slug BEFORE INSERT OR UPDATE OF name ON venues FOR EACH ROW EXECUTE FUNCTION generate_venue_slug()`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_default_venue_settings()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO venue_settings (venue_id) VALUES (NEW.id) ON CONFLICT (venue_id) DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`DROP TRIGGER IF EXISTS trigger_create_venue_settings ON venues`);
  await knex.raw(`CREATE TRIGGER trigger_create_venue_settings AFTER INSERT ON venues FOR EACH ROW EXECUTE FUNCTION create_default_venue_settings()`);

  console.log('✅ Venue service migration completed');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('venue_documents');
  await knex.schema.dropTableIfExists('venue_compliance');
  await knex.schema.dropTableIfExists('venue_layouts');
  await knex.schema.dropTableIfExists('venue_integrations');
  await knex.schema.dropTableIfExists('venue_settings');
  await knex.schema.dropTableIfExists('venue_staff');
  await knex.schema.dropTableIfExists('venues');
}
