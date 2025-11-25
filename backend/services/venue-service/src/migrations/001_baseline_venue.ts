import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Helper function for updated_at
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // 1. VENUES TABLE (Enhanced with white-label support)
  await knex.schema.createTable('venues', (table) => {
    // Core Identity
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 200).notNullable();
    table.string('slug', 200).notNullable().unique();
    table.text('description');

    // Contact
    table.string('email', 255).notNullable();
    table.string('phone', 20);
    table.string('website', 500);

    // Address (flat for querying)
    table.string('address_line1', 255).notNullable();
    table.string('address_line2', 255);
    table.string('city', 100).notNullable();
    table.string('state_province', 100).notNullable();
    table.string('postal_code', 20);
    table.string('country_code', 2).notNullable().defaultTo('US');
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.string('timezone', 50);

    // Venue Classification
    table.string('venue_type', 50).notNullable();

    // Capacity
    table.integer('max_capacity').notNullable();
    table.integer('standing_capacity');
    table.integer('seated_capacity');
    table.integer('vip_capacity');

    // Media
    table.string('logo_url', 1000);
    table.string('cover_image_url', 1000);
    table.specificType('image_gallery', 'TEXT[]');
    table.string('virtual_tour_url', 1000);

    // Business Info
    table.string('business_name', 200);
    table.string('business_registration', 100);
    table.string('tax_id', 50);
    table.string('business_type', 50);

    // Blockchain
    table.string('wallet_address', 44);
    table.string('collection_address', 44);
    table.decimal('royalty_percentage', 5, 2).defaultTo(2.50);

    // Status
    table.string('status', 20).defaultTo('ACTIVE');
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('verified_at', { useTz: true });
    table.string('verification_level', 20);

    // Features & Amenities
    table.specificType('features', 'TEXT[]');
    table.jsonb('amenities');
    table.specificType('accessibility_features', 'TEXT[]');

    // Policies
    table.integer('age_restriction').defaultTo(0);
    table.text('dress_code');
    table.specificType('prohibited_items', 'TEXT[]');
    table.text('cancellation_policy');
    table.text('refund_policy');

    // Social
    table.jsonb('social_media');
    table.decimal('average_rating', 3, 2).defaultTo(0.00);
    table.integer('total_reviews').defaultTo(0);
    table.integer('total_events').defaultTo(0);
    table.integer('total_tickets_sold').defaultTo(0);

    // WHITE-LABEL SUPPORT (NEW)
    table.string('pricing_tier', 50).defaultTo('standard'); // standard, white_label, enterprise
    table.boolean('hide_platform_branding').defaultTo(false);
    table.string('custom_domain', 255).nullable().unique();

    // Metadata
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('tags', 'TEXT[]');

    // Audit
    table.uuid('created_by');
    table.uuid('updated_by');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Multi-tenancy
    table.uuid('tenant_id');
  });

  // Venues indexes
  await knex.raw('CREATE INDEX idx_venues_slug ON venues(slug)');
  await knex.raw('CREATE INDEX idx_venues_email ON venues(email)');
  await knex.raw('CREATE INDEX idx_venues_city ON venues(city)');
  await knex.raw('CREATE INDEX idx_venues_state_province ON venues(state_province)');
  await knex.raw('CREATE INDEX idx_venues_country_code ON venues(country_code)');
  await knex.raw('CREATE INDEX idx_venues_venue_type ON venues(venue_type)');
  await knex.raw('CREATE INDEX idx_venues_status ON venues(status)');
  await knex.raw('CREATE INDEX idx_venues_created_by ON venues(created_by)');
  await knex.raw('CREATE INDEX idx_venues_tenant_id ON venues(tenant_id)');
  await knex.raw('CREATE INDEX idx_venues_deleted_at ON venues(deleted_at)');
  await knex.raw('CREATE INDEX idx_venues_location ON venues(latitude, longitude)');
  await knex.raw('CREATE INDEX idx_venues_pricing_tier ON venues(pricing_tier)');
  await knex.raw('CREATE INDEX idx_venues_custom_domain ON venues(custom_domain) WHERE custom_domain IS NOT NULL');

  // GIN indexes for JSONB
  await knex.raw('CREATE INDEX idx_venues_metadata_gin ON venues USING gin(metadata)');
  await knex.raw('CREATE INDEX idx_venues_amenities_gin ON venues USING gin(amenities)');
  await knex.raw('CREATE INDEX idx_venues_social_media_gin ON venues USING gin(social_media)');

  // Full-text search index for venues
  await knex.raw(`
    CREATE INDEX idx_venues_search ON venues USING gin(
      to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(city, '') || ' ' ||
        COALESCE(state_province, '')
      )
    )
  `);

  // 2. VENUE_STAFF TABLE
  await knex.schema.createTable('venue_staff', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('role', 50).notNullable();
    table.specificType('permissions', 'TEXT[]');
    table.string('department', 100);
    table.string('job_title', 100);
    table.string('employment_type', 50);
    table.date('start_date');
    table.date('end_date');
    table.boolean('is_active').defaultTo(true);
    table.specificType('access_areas', 'TEXT[]');
    table.jsonb('shift_schedule');
    table.string('pin_code', 10);
    table.string('contact_email', 255);
    table.string('contact_phone', 20);
    table.jsonb('emergency_contact');
    table.decimal('hourly_rate', 10, 2);
    table.decimal('commission_percentage', 5, 2);
    table.uuid('added_by');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Venue staff indexes
  await knex.raw('CREATE INDEX idx_venue_staff_venue_id ON venue_staff(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_staff_user_id ON venue_staff(user_id)');
  await knex.raw('CREATE INDEX idx_venue_staff_role ON venue_staff(role)');
  await knex.raw('CREATE INDEX idx_venue_staff_is_active ON venue_staff(is_active)');
  await knex.raw('CREATE UNIQUE INDEX idx_venue_staff_unique ON venue_staff(venue_id, user_id)');

  // 3. VENUE_SETTINGS TABLE
  await knex.schema.createTable('venue_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().unique().references('id').inTable('venues').onDelete('CASCADE');

    // Ticketing
    table.integer('max_tickets_per_order').defaultTo(10);
    table.boolean('ticket_resale_allowed').defaultTo(true);
    table.boolean('allow_print_at_home').defaultTo(true);
    table.boolean('allow_mobile_tickets').defaultTo(true);
    table.boolean('require_id_verification').defaultTo(false);
    table.boolean('ticket_transfer_allowed').defaultTo(true);

    // Fees
    table.decimal('service_fee_percentage', 5, 2).defaultTo(10.00);
    table.decimal('facility_fee_amount', 10, 2).defaultTo(5.00);
    table.decimal('processing_fee_percentage', 5, 2).defaultTo(2.90);

    // Payment
    table.specificType('payment_methods', 'TEXT[]').defaultTo('{card}');
    table.specificType('accepted_currencies', 'TEXT[]').defaultTo('{USD}');
    table.string('payout_frequency', 20).defaultTo('weekly');
    table.decimal('minimum_payout_amount', 10, 2).defaultTo(100.00);

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Venue settings indexes
  await knex.raw('CREATE INDEX idx_venue_settings_venue_id ON venue_settings(venue_id)');

  // 4. VENUE_INTEGRATIONS TABLE
  await knex.schema.createTable('venue_integrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('integration_type', 50).notNullable();
    table.string('integration_name', 200);
    table.jsonb('config_data').defaultTo('{}');
    table.text('api_key_encrypted');
    table.text('api_secret_encrypted');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Venue integrations indexes
  await knex.raw('CREATE INDEX idx_venue_integrations_venue_id ON venue_integrations(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_integrations_type ON venue_integrations(integration_type)');
  await knex.raw('CREATE UNIQUE INDEX idx_venue_integrations_unique ON venue_integrations(venue_id, integration_type)');

  // 5. VENUE_LAYOUTS TABLE
  await knex.schema.createTable('venue_layouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.string('type', 50).notNullable();
    table.jsonb('sections');
    table.integer('capacity').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  // Venue layouts indexes
  await knex.raw('CREATE INDEX idx_venue_layouts_venue_id ON venue_layouts(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_layouts_deleted_at ON venue_layouts(deleted_at)');

  // ==========================================
  // WHITE-LABEL TABLES (NEW)
  // ==========================================

  // 6. VENUE_BRANDING TABLE
  await knex.schema.createTable('venue_branding', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().unique().references('id').inTable('venues').onDelete('CASCADE');

    // Colors
    table.string('primary_color', 7).defaultTo('#667eea'); // Hex color
    table.string('secondary_color', 7).defaultTo('#764ba2');
    table.string('accent_color', 7).defaultTo('#f093fb');
    table.string('text_color', 7).defaultTo('#333333');
    table.string('background_color', 7).defaultTo('#ffffff');

    // Typography
    table.string('font_family', 100).defaultTo('Inter');
    table.string('heading_font', 100).nullable();

    // Logos & Images
    table.string('logo_url', 1000);
    table.string('logo_dark_url', 1000); // For dark mode
    table.string('favicon_url', 1000);
    table.string('email_header_image', 1000);
    table.string('ticket_background_image', 1000);

    // Custom CSS
    table.text('custom_css').nullable();

    // Email Branding
    table.string('email_from_name', 200);
    table.string('email_reply_to', 255);
    table.text('email_footer_text');

    // Ticket Branding
    table.string('ticket_header_text', 200);
    table.string('ticket_footer_text', 200);

    // Social Media (for Open Graph)
    table.string('og_image_url', 1000);
    table.text('og_description');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_branding_venue_id ON venue_branding(venue_id)');

  // 7. CUSTOM_DOMAINS TABLE
  await knex.schema.createTable('custom_domains', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('domain', 255).notNullable().unique();
    table.string('verification_token', 255).notNullable();
    table.string('verification_method', 50).defaultTo('dns_txt'); // dns_txt, dns_cname, file_upload
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('verified_at', { useTz: true });

    // SSL Certificate
    table.string('ssl_status', 50).defaultTo('pending'); // pending, active, failed, expired
    table.string('ssl_provider', 50).defaultTo('letsencrypt');
    table.timestamp('ssl_issued_at', { useTz: true });
    table.timestamp('ssl_expires_at', { useTz: true });
    table.text('ssl_error_message');

    // DNS Records
    table.jsonb('required_dns_records'); // What records venue needs to add
    table.jsonb('current_dns_records'); // What we detect

    // Status
    table.string('status', 50).defaultTo('pending'); // pending, active, failed, suspended
    table.text('error_message');
    table.timestamp('last_checked_at', { useTz: true });

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_custom_domains_venue_id ON custom_domains(venue_id)');
  await knex.raw('CREATE INDEX idx_custom_domains_domain ON custom_domains(domain)');
  await knex.raw('CREATE INDEX idx_custom_domains_status ON custom_domains(status)');
  await knex.raw('CREATE INDEX idx_custom_domains_verified ON custom_domains(is_verified)');

  // 8. WHITE_LABEL_PRICING TABLE
  await knex.schema.createTable('white_label_pricing', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('tier_name', 50).notNullable().unique(); // standard, white_label, enterprise
    table.text('description');

    // Pricing
    table.decimal('monthly_fee', 10, 2).defaultTo(0); // Fixed monthly fee
    table.decimal('service_fee_percentage', 5, 2).notNullable(); // Per transaction %
    table.decimal('per_ticket_fee', 10, 2).notNullable(); // Per ticket flat fee

    // Features
    table.boolean('custom_domain_allowed').defaultTo(false);
    table.boolean('hide_platform_branding').defaultTo(false);
    table.boolean('custom_css_allowed').defaultTo(false);
    table.boolean('white_label_emails').defaultTo(false);
    table.boolean('white_label_tickets').defaultTo(false);
    table.boolean('priority_support').defaultTo(false);
    table.boolean('api_access').defaultTo(false);
    table.integer('max_events_per_month').nullable(); // null = unlimited

    // Limits
    table.integer('max_custom_domains').defaultTo(0);
    table.integer('max_staff_accounts').nullable();

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_white_label_pricing_tier ON white_label_pricing(tier_name)');

  // Insert default pricing tiers
  await knex('white_label_pricing').insert([
    {
      tier_name: 'standard',
      description: 'Standard ticketing platform with TicketToken branding',
      monthly_fee: 0,
      service_fee_percentage: 10.00,
      per_ticket_fee: 2.00,
      custom_domain_allowed: false,
      hide_platform_branding: false,
      custom_css_allowed: false,
      white_label_emails: false,
      white_label_tickets: false,
      priority_support: false,
      api_access: false,
      max_custom_domains: 0,
      max_staff_accounts: 5
    },
    {
      tier_name: 'white_label',
      description: 'White-label solution with your branding',
      monthly_fee: 499.00,
      service_fee_percentage: 5.00,
      per_ticket_fee: 1.00,
      custom_domain_allowed: true,
      hide_platform_branding: true,
      custom_css_allowed: true,
      white_label_emails: true,
      white_label_tickets: true,
      priority_support: true,
      api_access: true,
      max_custom_domains: 1,
      max_staff_accounts: 20
    },
    {
      tier_name: 'enterprise',
      description: 'Enterprise solution with dedicated support',
      monthly_fee: 1999.00,
      service_fee_percentage: 3.00,
      per_ticket_fee: 0.50,
      custom_domain_allowed: true,
      hide_platform_branding: true,
      custom_css_allowed: true,
      white_label_emails: true,
      white_label_tickets: true,
      priority_support: true,
      api_access: true,
      max_custom_domains: 5,
      max_staff_accounts: null // unlimited
    }
  ]);

  // 9. VENUE_TIER_HISTORY TABLE (Track upgrades/downgrades)
  await knex.schema.createTable('venue_tier_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('from_tier', 50);
    table.string('to_tier', 50).notNullable();
    table.text('reason');
    table.uuid('changed_by');
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_tier_history_venue_id ON venue_tier_history(venue_id, changed_at DESC)');

  // ==========================================
  // TRIGGERS
  // ==========================================

  await knex.raw(`
    CREATE TRIGGER trigger_update_venues_timestamp
    BEFORE UPDATE ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_venue_staff_timestamp
    BEFORE UPDATE ON venue_staff
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_venue_settings_timestamp
    BEFORE UPDATE ON venue_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_venue_integrations_timestamp
    BEFORE UPDATE ON venue_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_venue_layouts_timestamp
    BEFORE UPDATE ON venue_layouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_venue_branding_timestamp
    BEFORE UPDATE ON venue_branding
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_custom_domains_timestamp
    BEFORE UPDATE ON custom_domains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_white_label_pricing_timestamp
    BEFORE UPDATE ON white_label_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Venue Service baseline migration complete - 9 tables + 8 triggers + white-label support');
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_white_label_pricing_timestamp ON white_label_pricing');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_custom_domains_timestamp ON custom_domains');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_branding_timestamp ON venue_branding');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_layouts_timestamp ON venue_layouts');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_integrations_timestamp ON venue_integrations');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_settings_timestamp ON venue_settings');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_staff_timestamp ON venue_staff');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venues_timestamp ON venues');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('venue_tier_history');
  await knex.schema.dropTableIfExists('white_label_pricing');
  await knex.schema.dropTableIfExists('custom_domains');
  await knex.schema.dropTableIfExists('venue_branding');
  await knex.schema.dropTableIfExists('venue_layouts');
  await knex.schema.dropTableIfExists('venue_integrations');
  await knex.schema.dropTableIfExists('venue_settings');
  await knex.schema.dropTableIfExists('venue_staff');
  await knex.schema.dropTableIfExists('venues');
}
