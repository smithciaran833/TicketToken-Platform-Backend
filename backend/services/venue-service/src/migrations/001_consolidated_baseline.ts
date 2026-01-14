import { Knex } from 'knex';

/**
 * CONSOLIDATED BASELINE MIGRATION - venue-service
 * 
 * Created: 2026-01-13
 * Consolidates: 001, 003, 004, 005, 006, 007, 008, 009, 010, 011
 * 
 * Tables (27):
 *   Core: venues, venue_staff, venue_settings, venue_integrations, venue_layouts,
 *         venue_branding, custom_domains, white_label_pricing, venue_tier_history,
 *         venue_audit_log, api_keys, user_venue_roles
 *   Verification: external_verifications, manual_review_queue, venue_compliance,
 *                 venue_compliance_reviews, venue_compliance_reports, venue_documents
 *   Notifications: notifications, email_queue
 *   Webhooks: webhook_events
 *   Operations: venue_operations, transfer_history, resale_policies, seller_verifications,
 *               resale_blocks, fraud_logs
 * 
 * RLS Enabled: 25 tables (all except white_label_pricing, email_queue)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // DATABASE SETTINGS
  // ==========================================================================
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ==========================================================================
  // EXTENSIONS
  // ==========================================================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ==========================================================================
  // FUNCTIONS
  // ==========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // ==========================================================================
  // TABLE 1: venues
  // ==========================================================================
  await knex.schema.createTable('venues', (table) => {
    // Core Identity
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable();
    table.string('slug', 200).notNullable().unique();
    table.text('description');

    // Contact
    table.string('email', 255).notNullable();
    table.string('phone', 20);
    table.string('website', 500);

    // Address
    table.string('address_line1', 255).notNullable();
    table.string('address_line2', 255);
    table.string('city', 100).notNullable();
    table.string('state_province', 100).notNullable();
    table.string('postal_code', 20);
    table.string('country_code', 2).notNullable().defaultTo('US');
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.string('timezone', 50);

    // Classification
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

    // Status (FIXED: lowercase default)
    table.string('status', 20).defaultTo('active');
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
    table.integer('transfer_deadline_hours');

    // Social
    table.jsonb('social_media');
    table.decimal('average_rating', 3, 2).defaultTo(0.00);
    table.integer('total_reviews').defaultTo(0);
    table.integer('total_events').defaultTo(0);
    table.integer('total_tickets_sold').defaultTo(0);

    // White-label
    table.string('pricing_tier', 50).defaultTo('standard');
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

    // Optimistic locking (from 007)
    table.integer('version').defaultTo(1).notNullable();
  });

  // Generated columns
  await knex.raw('ALTER TABLE venues ADD COLUMN capacity INTEGER GENERATED ALWAYS AS (max_capacity) STORED');
  await knex.raw('ALTER TABLE venues ADD COLUMN type VARCHAR(50) GENERATED ALWAYS AS (venue_type) STORED');

  // Indexes
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
  await knex.raw('CREATE INDEX idx_venues_metadata_gin ON venues USING gin(metadata)');
  await knex.raw('CREATE INDEX idx_venues_amenities_gin ON venues USING gin(amenities)');
  await knex.raw('CREATE INDEX idx_venues_social_media_gin ON venues USING gin(social_media)');
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

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE venues
    ADD CONSTRAINT chk_max_capacity_positive
    CHECK (max_capacity IS NULL OR max_capacity > 0)
  `);
  await knex.raw(`
    ALTER TABLE venues
    ADD CONSTRAINT chk_venue_status_valid
    CHECK (status IN ('active', 'inactive', 'pending', 'suspended'))
  `);

  // ==========================================================================
  // TABLE 2: venue_staff
  // ==========================================================================
  await knex.schema.createTable('venue_staff', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
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
    table.uuid('tenant_id');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_staff_venue_id ON venue_staff(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_staff_user_id ON venue_staff(user_id)');
  await knex.raw('CREATE INDEX idx_venue_staff_role ON venue_staff(role)');
  await knex.raw('CREATE INDEX idx_venue_staff_is_active ON venue_staff(is_active)');
  await knex.raw('CREATE INDEX idx_venue_staff_tenant_id ON venue_staff(tenant_id)');
  await knex.raw('CREATE UNIQUE INDEX idx_venue_staff_unique ON venue_staff(venue_id, user_id)');

  // ==========================================================================
  // TABLE 3: venue_settings
  // ==========================================================================
  await knex.schema.createTable('venue_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().unique().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');

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

    // Resale settings (from 010)
    table.decimal('max_resale_price_multiplier', 5, 2);
    table.decimal('max_resale_price_fixed', 12, 2);
    table.boolean('use_face_value_cap').defaultTo(false);
    table.integer('max_transfers_per_ticket');
    table.boolean('require_seller_verification').defaultTo(false);
    table.string('default_jurisdiction', 10);
    table.jsonb('jurisdiction_rules');
    table.integer('resale_cutoff_hours');
    table.integer('listing_cutoff_hours');
    table.boolean('anti_scalping_enabled').defaultTo(false);
    table.integer('purchase_cooldown_minutes');
    table.integer('max_tickets_per_buyer');
    table.boolean('require_artist_approval').defaultTo(false);
    table.jsonb('approved_resale_platforms');

    // Optimistic locking (from 007)
    table.integer('version').defaultTo(1).notNullable();

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_settings_venue_id ON venue_settings(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_settings_tenant_id ON venue_settings(tenant_id)');

  // ==========================================================================
  // TABLE 4: venue_integrations
  // ==========================================================================
  await knex.schema.createTable('venue_integrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('integration_type', 50).notNullable();
    table.string('integration_name', 200);
    table.jsonb('config_data').defaultTo('{}');
    table.text('api_key_encrypted');
    table.text('api_secret_encrypted');
    table.text('encrypted_credentials');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_sync_at', { useTz: true });

    // Optimistic locking (from 007)
    table.integer('version').defaultTo(1).notNullable();

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Generated columns
  await knex.raw('ALTER TABLE venue_integrations ADD COLUMN provider VARCHAR(50) GENERATED ALWAYS AS (integration_type) STORED');
  await knex.raw('ALTER TABLE venue_integrations ADD COLUMN config JSONB GENERATED ALWAYS AS (config_data) STORED');

  await knex.raw('CREATE INDEX idx_venue_integrations_venue_id ON venue_integrations(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_integrations_type ON venue_integrations(integration_type)');
  await knex.raw('CREATE INDEX idx_venue_integrations_tenant_id ON venue_integrations(tenant_id)');
  await knex.raw('CREATE UNIQUE INDEX idx_venue_integrations_unique ON venue_integrations(venue_id, integration_type)');

  // CHECK constraint for provider
  await knex.raw(`
    ALTER TABLE venue_integrations
    ADD CONSTRAINT chk_integration_provider_valid
    CHECK (integration_type IN ('stripe', 'square', 'toast', 'mailchimp', 'twilio'))
  `);

  // ==========================================================================
  // TABLE 5: venue_layouts
  // ==========================================================================
  await knex.schema.createTable('venue_layouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('name', 200).notNullable();
    table.string('type', 50).notNullable();
    table.jsonb('sections');
    table.integer('capacity').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  await knex.raw('CREATE INDEX idx_venue_layouts_venue_id ON venue_layouts(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_layouts_tenant_id ON venue_layouts(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_layouts_deleted_at ON venue_layouts(deleted_at)');

  // ==========================================================================
  // TABLE 6: venue_branding
  // ==========================================================================
  await knex.schema.createTable('venue_branding', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().unique().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');

    // Colors
    table.string('primary_color', 7).defaultTo('#667eea');
    table.string('secondary_color', 7).defaultTo('#764ba2');
    table.string('accent_color', 7).defaultTo('#f093fb');
    table.string('text_color', 7).defaultTo('#333333');
    table.string('background_color', 7).defaultTo('#ffffff');

    // Typography
    table.string('font_family', 100).defaultTo('Inter');
    table.string('heading_font', 100);

    // Logos & Images
    table.string('logo_url', 1000);
    table.string('logo_dark_url', 1000);
    table.string('favicon_url', 1000);
    table.string('email_header_image', 1000);
    table.string('ticket_background_image', 1000);

    // Custom CSS
    table.text('custom_css');

    // Email Branding
    table.string('email_from_name', 200);
    table.string('email_reply_to', 255);
    table.text('email_footer_text');

    // Ticket Branding
    table.string('ticket_header_text', 200);
    table.string('ticket_footer_text', 200);

    // Social Media (Open Graph)
    table.string('og_image_url', 1000);
    table.text('og_description');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_branding_venue_id ON venue_branding(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_branding_tenant_id ON venue_branding(tenant_id)');

  // ==========================================================================
  // TABLE 7: custom_domains
  // ==========================================================================
  await knex.schema.createTable('custom_domains', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('domain', 255).notNullable().unique();
    table.string('verification_token', 255).notNullable();
    table.string('verification_method', 50).defaultTo('dns_txt');
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('verified_at', { useTz: true });

    // SSL
    table.string('ssl_status', 50).defaultTo('pending');
    table.string('ssl_provider', 50).defaultTo('letsencrypt');
    table.timestamp('ssl_issued_at', { useTz: true });
    table.timestamp('ssl_expires_at', { useTz: true });
    table.text('ssl_error_message');

    // DNS
    table.jsonb('required_dns_records');
    table.jsonb('current_dns_records');

    // Status
    table.string('status', 50).defaultTo('pending');
    table.text('error_message');
    table.timestamp('last_checked_at', { useTz: true });

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_custom_domains_venue_id ON custom_domains(venue_id)');
  await knex.raw('CREATE INDEX idx_custom_domains_tenant_id ON custom_domains(tenant_id)');
  await knex.raw('CREATE INDEX idx_custom_domains_domain ON custom_domains(domain)');
  await knex.raw('CREATE INDEX idx_custom_domains_status ON custom_domains(status)');
  await knex.raw('CREATE INDEX idx_custom_domains_verified ON custom_domains(is_verified)');

  // ==========================================================================
  // TABLE 8: white_label_pricing (GLOBAL - no tenant_id)
  // ==========================================================================
  await knex.schema.createTable('white_label_pricing', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('tier_name', 50).notNullable().unique();
    table.text('description');

    // Pricing
    table.decimal('monthly_fee', 10, 2).defaultTo(0);
    table.decimal('service_fee_percentage', 5, 2).notNullable();
    table.decimal('per_ticket_fee', 10, 2).notNullable();

    // Features
    table.boolean('custom_domain_allowed').defaultTo(false);
    table.boolean('hide_platform_branding').defaultTo(false);
    table.boolean('custom_css_allowed').defaultTo(false);
    table.boolean('white_label_emails').defaultTo(false);
    table.boolean('white_label_tickets').defaultTo(false);
    table.boolean('priority_support').defaultTo(false);
    table.boolean('api_access').defaultTo(false);
    table.integer('max_events_per_month');

    // Limits
    table.integer('max_custom_domains').defaultTo(0);
    table.integer('max_staff_accounts');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_white_label_pricing_tier ON white_label_pricing(tier_name)');

  // Seed data
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
      max_staff_accounts: null
    }
  ]);

  // ==========================================================================
  // TABLE 9: venue_tier_history
  // ==========================================================================
  await knex.schema.createTable('venue_tier_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('from_tier', 50);
    table.string('to_tier', 50).notNullable();
    table.text('reason');
    table.uuid('changed_by');
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_tier_history_venue_id ON venue_tier_history(venue_id, changed_at DESC)');
  await knex.raw('CREATE INDEX idx_venue_tier_history_tenant_id ON venue_tier_history(tenant_id)');

  // ==========================================================================
  // TABLE 10: venue_audit_log
  // ==========================================================================
  await knex.schema.createTable('venue_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('action', 100).notNullable();
    table.uuid('user_id');
    table.jsonb('changes').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_audit_log_venue_id ON venue_audit_log(venue_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_venue_audit_log_tenant_id ON venue_audit_log(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_audit_log_user_id ON venue_audit_log(user_id)');
  await knex.raw('CREATE INDEX idx_venue_audit_log_action ON venue_audit_log(action)');

  // ==========================================================================
  // TABLE 11: api_keys
  // ==========================================================================
  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id');
    table.string('key', 255).notNullable().unique();
    table.string('key_hash', 64); // From 005
    table.string('name', 200);
    table.specificType('permissions', 'TEXT[]').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('last_used_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_api_keys_user_id ON api_keys(user_id)');
  await knex.raw('CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id)');
  await knex.raw('CREATE INDEX idx_api_keys_key ON api_keys(key) WHERE is_active = TRUE');
  await knex.raw('CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = TRUE');
  await knex.raw('CREATE INDEX idx_api_keys_is_active ON api_keys(is_active)');

  // ==========================================================================
  // TABLE 12: user_venue_roles (conditional)
  // ==========================================================================
  const userVenueRolesExists = await knex.schema.hasTable('user_venue_roles');
  if (!userVenueRolesExists) {
    await knex.schema.createTable('user_venue_roles', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable();
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('tenant_id');
      table.string('role', 50).notNullable();
      table.specificType('permissions', 'TEXT[]').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX idx_user_venue_roles_user_id ON user_venue_roles(user_id)');
    await knex.raw('CREATE INDEX idx_user_venue_roles_venue_id ON user_venue_roles(venue_id)');
    await knex.raw('CREATE INDEX idx_user_venue_roles_tenant_id ON user_venue_roles(tenant_id)');
    await knex.raw('CREATE UNIQUE INDEX idx_user_venue_roles_unique ON user_venue_roles(user_id, venue_id)');
  }

  // ==========================================================================
  // TABLE 13: external_verifications
  // ==========================================================================
  await knex.schema.createTable('external_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.string('provider').notNullable();
    table.string('verification_type').notNullable();
    table.string('external_id').notNullable();
    table.string('status').notNullable().defaultTo('pending');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_external_verifications_venue_id ON external_verifications(venue_id)');
  await knex.raw('CREATE INDEX idx_external_verifications_tenant_id ON external_verifications(tenant_id)');
  await knex.raw('CREATE INDEX idx_external_verifications_provider_status ON external_verifications(provider, status)');
  await knex.raw('CREATE INDEX idx_external_verifications_external_id ON external_verifications(external_id)');
  await knex.raw('CREATE INDEX idx_external_verifications_created_at ON external_verifications(created_at)');

  // ==========================================================================
  // TABLE 14: manual_review_queue
  // ==========================================================================
  await knex.schema.createTable('manual_review_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.uuid('verification_id').references('id').inTable('external_verifications').onDelete('SET NULL');
    table.string('review_type').notNullable();
    table.string('priority').notNullable().defaultTo('medium');
    table.string('status').notNullable().defaultTo('pending');
    table.uuid('assigned_to');
    table.jsonb('metadata').defaultTo('{}');
    table.text('notes');
    table.timestamp('reviewed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_manual_review_queue_venue_id ON manual_review_queue(venue_id)');
  await knex.raw('CREATE INDEX idx_manual_review_queue_tenant_id ON manual_review_queue(tenant_id)');
  await knex.raw('CREATE INDEX idx_manual_review_queue_status_priority ON manual_review_queue(status, priority)');
  await knex.raw('CREATE INDEX idx_manual_review_queue_assigned_to ON manual_review_queue(assigned_to)');
  await knex.raw('CREATE INDEX idx_manual_review_queue_created_at ON manual_review_queue(created_at)');

  // ==========================================================================
  // TABLE 15: notifications
  // ==========================================================================
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.uuid('user_id');
    table.string('type').notNullable();
    table.string('priority').notNullable().defaultTo('medium');
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.boolean('read').notNullable().defaultTo(false);
    table.timestamp('read_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_notifications_venue_id_read ON notifications(venue_id, read)');
  await knex.raw('CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id)');
  await knex.raw('CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, read)');
  await knex.raw('CREATE INDEX idx_notifications_type ON notifications(type)');
  await knex.raw('CREATE INDEX idx_notifications_created_at ON notifications(created_at)');

  // ==========================================================================
  // TABLE 16: email_queue (GLOBAL - no tenant_id)
  // ==========================================================================
  await knex.schema.createTable('email_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('to_email').notNullable();
    table.string('subject').notNullable();
    table.string('template').notNullable();
    table.jsonb('data').notNullable().defaultTo('{}');
    table.string('priority').notNullable().defaultTo('medium');
    table.string('status').notNullable().defaultTo('pending');
    table.integer('attempts').notNullable().defaultTo(0);
    table.text('error_message');
    table.timestamp('sent_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_email_queue_status_priority ON email_queue(status, priority)');
  await knex.raw('CREATE INDEX idx_email_queue_created_at ON email_queue(created_at)');

  // ==========================================================================
  // TABLE 17: venue_compliance_reviews
  // ==========================================================================
  await knex.schema.createTable('venue_compliance_reviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id');
    table.timestamp('scheduled_date').notNullable();
    table.string('status').notNullable().defaultTo('scheduled');
    table.uuid('reviewer_id');
    table.jsonb('findings').defaultTo('{}');
    table.text('notes');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_compliance_reviews_venue_id ON venue_compliance_reviews(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_compliance_reviews_tenant_id ON venue_compliance_reviews(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_compliance_reviews_status_date ON venue_compliance_reviews(status, scheduled_date)');
  await knex.raw('CREATE INDEX idx_venue_compliance_reviews_reviewer_id ON venue_compliance_reviews(reviewer_id)');

  // ==========================================================================
  // TABLE 18: venue_compliance
  // ==========================================================================
  const hasComplianceTable = await knex.schema.hasTable('venue_compliance');
  if (!hasComplianceTable) {
    await knex.schema.createTable('venue_compliance', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE').unique();
      table.uuid('tenant_id');
      table.jsonb('settings').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX idx_venue_compliance_venue_id ON venue_compliance(venue_id)');
    await knex.raw('CREATE INDEX idx_venue_compliance_tenant_id ON venue_compliance(tenant_id)');
  }

  // ==========================================================================
  // TABLE 19: venue_compliance_reports
  // ==========================================================================
  const hasReportsTable = await knex.schema.hasTable('venue_compliance_reports');
  if (!hasReportsTable) {
    await knex.schema.createTable('venue_compliance_reports', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('tenant_id');
      table.jsonb('report').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX idx_venue_compliance_reports_venue_id_created ON venue_compliance_reports(venue_id, created_at)');
    await knex.raw('CREATE INDEX idx_venue_compliance_reports_tenant_id ON venue_compliance_reports(tenant_id)');
  }

  // ==========================================================================
  // TABLE 20: venue_documents
  // ==========================================================================
  const hasDocumentsTable = await knex.schema.hasTable('venue_documents');
  if (!hasDocumentsTable) {
    await knex.schema.createTable('venue_documents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('tenant_id');
      table.string('document_type').notNullable();
      table.string('file_url').notNullable();
      table.string('file_name');
      table.string('mime_type');
      table.integer('file_size');
      table.string('status').notNullable().defaultTo('pending');
      table.timestamp('submitted_at').defaultTo(knex.fn.now());
      table.timestamp('approved_at');
      table.timestamp('rejected_at');
      table.text('rejection_reason');
      table.uuid('reviewed_by');
      table.jsonb('metadata').defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX idx_venue_documents_venue_id ON venue_documents(venue_id)');
    await knex.raw('CREATE INDEX idx_venue_documents_tenant_id ON venue_documents(tenant_id)');
    await knex.raw('CREATE INDEX idx_venue_documents_document_type ON venue_documents(document_type)');
    await knex.raw('CREATE INDEX idx_venue_documents_status ON venue_documents(status)');
    await knex.raw('CREATE INDEX idx_venue_documents_submitted_at ON venue_documents(submitted_at)');
  }

  // ==========================================================================
  // TABLE 21: webhook_events
  // ==========================================================================
  await knex.schema.createTable('webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_id', 255).unique().notNullable();
    table.string('event_type', 100).notNullable();
    table.timestamp('processed_at').defaultTo(knex.fn.now());
    table.uuid('tenant_id');
    table.string('source', 50).defaultTo('stripe');
    table.jsonb('metadata');

    // From 009
    table.string('status', 20).defaultTo('pending').notNullable();
    table.timestamp('processing_started_at', { useTz: true });
    table.timestamp('processing_completed_at', { useTz: true });
    table.jsonb('payload');
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('last_retry_at', { useTz: true });
    table.string('source_ip', 45);
    table.text('headers_hash');
    table.string('lock_key', 255);
    table.timestamp('lock_expires_at', { useTz: true });
  });

  await knex.raw('CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id)');
  await knex.raw('CREATE INDEX idx_webhook_events_event_type_processed ON webhook_events(event_type, processed_at)');
  await knex.raw('CREATE INDEX idx_webhook_events_tenant_id ON webhook_events(tenant_id)');
  await knex.raw('CREATE INDEX idx_webhook_events_status ON webhook_events(status)');
  await knex.raw('CREATE INDEX idx_webhook_events_status_created ON webhook_events(status, processed_at)');
  await knex.raw('CREATE INDEX idx_webhook_events_retry ON webhook_events(status, retry_count, last_retry_at)');
  await knex.raw('CREATE INDEX idx_webhook_events_lock ON webhook_events(lock_key, lock_expires_at)');

  await knex.raw(`
    ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying'))
  `);

  // ==========================================================================
  // TABLE 22: venue_operations
  // ==========================================================================
  await knex.schema.createTable('venue_operations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('operation_type', 100).notNullable();
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('current_step').defaultTo(0);
    table.integer('total_steps').notNullable();
    table.jsonb('steps').notNullable();
    table.jsonb('checkpoint_data');
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.text('error_message');
    table.uuid('created_by');
    table.string('correlation_id', 100);
  });

  await knex.raw('CREATE INDEX idx_venue_operations_venue_tenant ON venue_operations(venue_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_operations_tenant_status ON venue_operations(tenant_id, status)');
  await knex.raw('CREATE INDEX idx_venue_operations_type_status ON venue_operations(operation_type, status)');
  await knex.raw('CREATE INDEX idx_venue_operations_correlation ON venue_operations(correlation_id)');

  await knex.raw(`
    ALTER TABLE venue_operations
    ADD CONSTRAINT venue_operations_status_check
    CHECK (status IN ('pending', 'in_progress', 'checkpoint', 'completed', 'failed', 'rolled_back'))
  `);

  // ==========================================================================
  // TABLE 23: transfer_history
  // ==========================================================================
  await knex.schema.createTable('transfer_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();
    table.uuid('from_user_id');
    table.uuid('to_user_id').notNullable();
    table.string('transfer_type', 20).notNullable();
    table.decimal('price', 12, 2);
    table.decimal('original_face_value', 12, 2);
    table.string('currency', 3).defaultTo('USD');
    table.integer('transfer_number').defaultTo(1);
    table.string('jurisdiction', 10);
    table.boolean('seller_verified').defaultTo(false);
    table.string('verification_method', 50);
    table.jsonb('metadata');
    table.timestamp('transferred_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_transfer_history_ticket_transferred ON transfer_history(ticket_id, transferred_at)');
  await knex.raw('CREATE INDEX idx_transfer_history_venue_tenant ON transfer_history(venue_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_transfer_history_event_tenant ON transfer_history(event_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_transfer_history_from_user ON transfer_history(from_user_id)');
  await knex.raw('CREATE INDEX idx_transfer_history_to_user ON transfer_history(to_user_id)');
  await knex.raw('CREATE INDEX idx_transfer_history_jurisdiction ON transfer_history(jurisdiction)');

  await knex.raw(`
    ALTER TABLE transfer_history
    ADD CONSTRAINT transfer_history_type_check
    CHECK (transfer_type IN ('purchase', 'transfer', 'resale', 'gift', 'refund'))
  `);

  // ==========================================================================
  // TABLE 24: resale_policies
  // ==========================================================================
  await knex.schema.createTable('resale_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('event_id');
    table.uuid('tenant_id').notNullable();
    table.boolean('resale_allowed').defaultTo(true);
    table.decimal('max_price_multiplier', 5, 2);
    table.decimal('max_price_fixed', 12, 2);
    table.integer('max_transfers');
    table.boolean('seller_verification_required').defaultTo(false);
    table.integer('resale_cutoff_hours');
    table.integer('listing_cutoff_hours');
    table.string('jurisdiction', 10);
    table.jsonb('jurisdiction_overrides');
    table.boolean('anti_scalping_enabled').defaultTo(false);
    table.jsonb('anti_scalping_rules');
    table.boolean('artist_approval_required').defaultTo(false);
    table.string('artist_approval_status', 20);
    table.uuid('approved_by');
    table.timestamp('approved_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');
  });

  await knex.raw('CREATE INDEX idx_resale_policies_venue_event ON resale_policies(venue_id, event_id)');
  await knex.raw('CREATE INDEX idx_resale_policies_tenant_venue ON resale_policies(tenant_id, venue_id)');
  await knex.raw('CREATE INDEX idx_resale_policies_jurisdiction ON resale_policies(jurisdiction)');
  await knex.raw('CREATE UNIQUE INDEX idx_resale_policies_unique ON resale_policies(venue_id, event_id, jurisdiction)');

  // ==========================================================================
  // TABLE 25: seller_verifications
  // ==========================================================================
  await knex.schema.createTable('seller_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('venue_id').references('id').inTable('venues').onDelete('SET NULL');
    table.uuid('tenant_id').notNullable();
    table.string('verification_type', 50).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('provider', 50);
    table.string('provider_verification_id', 255);
    table.jsonb('verification_data');
    table.boolean('verified').defaultTo(false);
    table.text('rejection_reason');
    table.timestamp('verified_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('reviewed_by');
  });

  await knex.raw('CREATE INDEX idx_seller_verifications_user_type ON seller_verifications(user_id, verification_type)');
  await knex.raw('CREATE INDEX idx_seller_verifications_tenant_status ON seller_verifications(tenant_id, status)');
  await knex.raw('CREATE INDEX idx_seller_verifications_provider_id ON seller_verifications(provider_verification_id)');

  await knex.raw(`
    ALTER TABLE seller_verifications
    ADD CONSTRAINT seller_verifications_status_check
    CHECK (status IN ('pending', 'in_review', 'verified', 'rejected', 'expired'))
  `);

  // ==========================================================================
  // TABLE 26: resale_blocks
  // ==========================================================================
  await knex.schema.createTable('resale_blocks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.text('reason').notNullable();
    table.uuid('blocked_by').notNullable();
    table.timestamp('blocked_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.boolean('active').notNullable().defaultTo(true);
  });

  await knex.raw('CREATE INDEX idx_resale_blocks_tenant ON resale_blocks(tenant_id)');
  await knex.raw('CREATE INDEX idx_resale_blocks_user ON resale_blocks(user_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_resale_blocks_active ON resale_blocks(user_id, tenant_id, active) WHERE active = true');
  await knex.raw('CREATE INDEX idx_resale_blocks_expires ON resale_blocks(expires_at) WHERE active = true AND expires_at IS NOT NULL');

  // ==========================================================================
  // TABLE 27: fraud_logs
  // ==========================================================================
  await knex.schema.createTable('fraud_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.integer('risk_score').notNullable();
    table.jsonb('signals').notNullable();
    table.string('action', 30).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_fraud_logs_tenant ON fraud_logs(tenant_id)');
  await knex.raw('CREATE INDEX idx_fraud_logs_transaction ON fraud_logs(transaction_id)');
  await knex.raw('CREATE INDEX idx_fraud_logs_seller ON fraud_logs(seller_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_fraud_logs_buyer ON fraud_logs(buyer_id, tenant_id)');
  await knex.raw('CREATE INDEX idx_fraud_logs_ticket ON fraud_logs(ticket_id)');
  await knex.raw('CREATE INDEX idx_fraud_logs_risk ON fraud_logs(tenant_id, risk_score DESC, created_at DESC)');
  await knex.raw('CREATE INDEX idx_fraud_logs_action ON fraud_logs(tenant_id, action, created_at DESC)');

  await knex.raw(`
    ALTER TABLE fraud_logs
    ADD CONSTRAINT ck_fraud_logs_risk_score_valid
    CHECK (risk_score >= 0 AND risk_score <= 100)
  `);

  // ==========================================================================
  // FOREIGN KEYS TO EXTERNAL TABLES
  // ==========================================================================
  console.log('Adding foreign key constraints to external tables...');

  await knex.schema.alterTable('venues', (table) => {
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('venue_staff', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('added_by').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('venue_tier_history', (table) => {
    table.foreign('changed_by').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('venue_audit_log', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('api_keys', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  if (!userVenueRolesExists) {
    await knex.schema.alterTable('user_venue_roles', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }

  await knex.schema.alterTable('manual_review_queue', (table) => {
    table.foreign('assigned_to').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('notifications', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.alterTable('venue_compliance_reviews', (table) => {
    table.foreign('reviewer_id').references('id').inTable('users').onDelete('SET NULL');
  });

  if (!hasDocumentsTable) {
    await knex.schema.alterTable('venue_documents', (table) => {
      table.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
    });
  }

  await knex.schema.alterTable('webhook_events', (table) => {
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('SET NULL');
  });

  console.log('Foreign key constraints added.');

  // ==========================================================================
  // TRIGGERS
  // ==========================================================================
  console.log('Creating triggers...');

  const tablesWithUpdatedAt = [
    'venues',
    'venue_staff',
    'venue_settings',
    'venue_integrations',
    'venue_layouts',
    'venue_branding',
    'custom_domains',
    'white_label_pricing',
    'api_keys'
  ];

  for (const tableName of tablesWithUpdatedAt) {
    await knex.raw(`
      CREATE TRIGGER trigger_update_${tableName}_timestamp
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  if (!userVenueRolesExists) {
    await knex.raw(`
      CREATE TRIGGER trigger_update_user_venue_roles_timestamp
      BEFORE UPDATE ON user_venue_roles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  // Audit triggers (conditional)
  const auditFunctionExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function'
    );
  `);

  if (auditFunctionExists.rows[0].exists) {
    await knex.raw(`
      CREATE TRIGGER audit_venues_changes
      AFTER INSERT OR UPDATE OR DELETE ON venues
      FOR EACH ROW
      EXECUTE FUNCTION audit_trigger_function();
    `);

    if (!hasComplianceTable) {
      await knex.raw(`
        CREATE TRIGGER audit_venue_compliance_changes
        AFTER INSERT OR UPDATE OR DELETE ON venue_compliance
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_function();
      `);
    }
    console.log('Audit triggers created.');
  } else {
    console.warn('audit_trigger_function not found - run auth-service migrations first');
  }

  console.log('Triggers created.');

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

  // Tables with standard tenant isolation
  const rlsTables = [
    'venues',
    'venue_staff',
    'venue_settings',
    'venue_integrations',
    'venue_layouts',
    'venue_branding',
    'custom_domains',
    'venue_tier_history',
    'venue_audit_log',
    'api_keys',
    'external_verifications',
    'manual_review_queue',
    'notifications',
    'venue_compliance_reviews',
    'webhook_events',
    'venue_operations',
    'transfer_history',
    'resale_policies',
    'seller_verifications',
    'resale_blocks',
    'fraud_logs'
  ];

  for (const tableName of rlsTables) {
    await setupTableRLS(tableName);
  }

  // Conditional tables
  if (!userVenueRolesExists) {
    await setupTableRLS('user_venue_roles');
  }
  if (!hasComplianceTable) {
    await setupTableRLS('venue_compliance');
  }
  if (!hasReportsTable) {
    await setupTableRLS('venue_compliance_reports');
  }
  if (!hasDocumentsTable) {
    await setupTableRLS('venue_documents');
  }

  // Additional venue-specific policies
  await knex.raw(`
    CREATE POLICY venues_view_own ON venues
      FOR SELECT
      USING (created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY venues_update_own ON venues
      FOR UPDATE
      USING (created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY venues_delete_own ON venues
      FOR DELETE
      USING (created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY venues_insert_own ON venues
      FOR INSERT
      WITH CHECK (created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY venues_public_view ON venues
      FOR SELECT
      USING (status = 'active')
  `);

  await knex.raw(`
    CREATE POLICY venues_admin_all ON venues
      FOR ALL
      USING (
        current_setting('app.current_user_role', true) IN ('admin', 'superadmin')
      )
  `);

  console.log('Row Level Security enabled on all tenant tables.');
  console.log('');
  console.log('✅ Venue Service consolidated baseline migration complete');
  console.log('   - 27 tables created');
  console.log('   - 25 tables with RLS');
  console.log('   - 2 global tables (white_label_pricing, email_queue)');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Rolling back venue-service consolidated baseline...');

  // Drop all RLS policies first
  const allTables = [
    'fraud_logs',
    'resale_blocks',
    'seller_verifications',
    'resale_policies',
    'transfer_history',
    'venue_operations',
    'webhook_events',
    'venue_documents',
    'venue_compliance_reports',
    'venue_compliance',
    'venue_compliance_reviews',
    'notifications',
    'manual_review_queue',
    'external_verifications',
    'user_venue_roles',
    'api_keys',
    'venue_audit_log',
    'venue_tier_history',
    'custom_domains',
    'venue_branding',
    'venue_layouts',
    'venue_integrations',
    'venue_settings',
    'venue_staff',
    'venues',
    'white_label_pricing',
    'email_queue'
  ];

  for (const tableName of allTables) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (tableExists) {
      // Drop RLS policies
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_select ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_insert ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_update ON ${tableName}`);
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation_delete ON ${tableName}`);
    }
  }

  // Drop venue-specific policies
  await knex.raw('DROP POLICY IF EXISTS venues_admin_all ON venues');
  await knex.raw('DROP POLICY IF EXISTS venues_public_view ON venues');
  await knex.raw('DROP POLICY IF EXISTS venues_insert_own ON venues');
  await knex.raw('DROP POLICY IF EXISTS venues_delete_own ON venues');
  await knex.raw('DROP POLICY IF EXISTS venues_update_own ON venues');
  await knex.raw('DROP POLICY IF EXISTS venues_view_own ON venues');

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS audit_venue_compliance_changes ON venue_compliance');
  await knex.raw('DROP TRIGGER IF EXISTS audit_venues_changes ON venues');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_user_venue_roles_timestamp ON user_venue_roles');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_api_keys_timestamp ON api_keys');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_white_label_pricing_timestamp ON white_label_pricing');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_custom_domains_timestamp ON custom_domains');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_branding_timestamp ON venue_branding');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_layouts_timestamp ON venue_layouts');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_integrations_timestamp ON venue_integrations');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_settings_timestamp ON venue_settings');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venue_staff_timestamp ON venue_staff');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_venues_timestamp ON venues');

  // Drop tables in reverse order
  for (const tableName of allTables) {
    await knex.schema.dropTableIfExists(tableName);
  }

  // Drop function
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('Rollback complete.');
}
