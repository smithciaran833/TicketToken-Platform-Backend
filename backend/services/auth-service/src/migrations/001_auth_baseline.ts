import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ==========================================
  // CREATE FUNCTIONS FIRST (before tables/triggers that use them)
  // ==========================================

  // Function: Auto-update updated_at timestamp
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Function: Generate unique referral code
  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_user_referral_code()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.referral_code IS NULL THEN
        NEW.referral_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT) FROM 1 FOR 8));
      END IF;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Function: Increment referral count
  await knex.raw(`
    CREATE OR REPLACE FUNCTION increment_referral_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.referred_by IS NOT NULL THEN
        UPDATE users
        SET referral_count = referral_count + 1
        WHERE id = NEW.referred_by;
      END IF;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // 1. TENANTS TABLE (must be first - referenced by users)
  await knex.schema.createTable('tenants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.string('status', 255).defaultTo('active');
    table.jsonb('settings').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Insert default tenant
  await knex.raw(`
    INSERT INTO tenants (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default');
  `);

  // 2. USERS TABLE (66 columns - matches actual DB)
  await knex.schema.createTable('users', (table) => {
    // Core Identity
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();

    // Email Verification
    table.boolean('email_verified').defaultTo(false);
    table.string('email_verification_token', 64);
    table.timestamp('email_verification_expires', { useTz: true });
    table.timestamp('email_verified_at', { useTz: true });

    // Profile - Basic
    table.string('username', 30).unique();
    table.string('display_name', 100);
    table.text('bio');
    table.text('avatar_url');
    table.text('cover_image_url');
    table.string('first_name', 50);
    table.string('last_name', 50);
    table.date('date_of_birth');

    // Contact
    table.string('phone', 20);
    table.boolean('phone_verified').defaultTo(false);

    // Location
    table.string('country_code', 2);
    table.string('city', 100);
    table.string('state_province', 100);
    table.string('postal_code', 20);

    // Preferences
    table.string('timezone', 50).defaultTo('UTC');
    table.string('preferred_language', 10).defaultTo('en');

    // Status & Role
    table.text('status').defaultTo('PENDING');
    table.string('role', 20).defaultTo('user');
    table.jsonb('permissions').defaultTo('[]');

    // MFA / 2FA
    table.boolean('two_factor_enabled').defaultTo(false);
    table.string('two_factor_secret', 32);
    table.specificType('backup_codes', 'TEXT[]');
    table.boolean('mfa_enabled').defaultTo(false);
    table.text('mfa_secret');

    // Password Management
    table.timestamp('last_password_change', { useTz: true }).defaultTo(knex.fn.now());
    table.string('password_reset_token', 64);
    table.timestamp('password_reset_expires', { useTz: true });
    table.timestamp('password_changed_at', { useTz: true });

    // Login Tracking
    table.timestamp('last_login_at', { useTz: true });
    table.specificType('last_login_ip', 'INET');
    table.string('last_login_device', 255);
    table.integer('login_count').defaultTo(0);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until', { useTz: true });

    // Settings
    table.jsonb('preferences').defaultTo('{}');
    table.jsonb('notification_preferences').defaultTo('{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}');
    table.jsonb('profile_data').defaultTo('{}');

    // Legal & Compliance
    table.timestamp('terms_accepted_at', { useTz: true });
    table.string('terms_version', 20);
    table.timestamp('privacy_accepted_at', { useTz: true });
    table.string('privacy_version', 20);
    table.boolean('marketing_consent').defaultTo(false);
    table.timestamp('marketing_consent_date', { useTz: true });

    // Referrals
    table.string('referral_code', 20).unique();
    table.uuid('referred_by').references('id').inTable('users');
    table.integer('referral_count').defaultTo(0);

    // OAuth / External Auth
    table.string('provider', 50);
    table.string('provider_user_id', 255);

    // Web3 / Wallet
    table.string('wallet_address', 255);
    table.string('network', 50);
    table.boolean('verified').defaultTo(false);

    // Metadata
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('tags', 'TEXT[]');
    table.string('verification_token', 255);

    // Activity
    table.boolean('is_active').defaultTo(true);

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Multi-tenancy (at end to match actual DB)
    table.uuid('tenant_id');
  });

  // Create all the indexes, constraints
  await knex.raw('CREATE INDEX idx_users_email ON users(email)');
  await knex.raw('CREATE INDEX idx_users_username ON users(username)');
  await knex.raw('CREATE INDEX idx_users_phone ON users(phone)');
  await knex.raw('CREATE INDEX idx_users_role ON users(role)');
  await knex.raw('CREATE INDEX idx_users_status ON users(status)');
  await knex.raw('CREATE INDEX idx_users_deleted_at ON users(deleted_at)');
  await knex.raw('CREATE INDEX idx_users_country_code ON users(country_code)');
  await knex.raw('CREATE INDEX idx_users_display_name ON users(display_name)');
  await knex.raw('CREATE INDEX idx_users_email_verification_token ON users(email_verification_token)');
  await knex.raw('CREATE INDEX idx_users_password_reset_token ON users(password_reset_token)');
  await knex.raw('CREATE INDEX idx_users_referral_code ON users(referral_code)');
  await knex.raw('CREATE INDEX idx_users_referred_by ON users(referred_by)');
  await knex.raw('CREATE INDEX idx_users_role_status ON users(role, status)');
  await knex.raw('CREATE INDEX idx_users_status_created_at ON users(status, created_at)');
  await knex.raw('CREATE INDEX idx_users_timezone ON users(timezone)');

  // GIN indexes for JSONB
  await knex.raw('CREATE INDEX idx_users_metadata_gin ON users USING gin(metadata)');
  await knex.raw('CREATE INDEX idx_users_permissions_gin ON users USING gin(permissions)');
  await knex.raw('CREATE INDEX idx_users_preferences_gin ON users USING gin(preferences)');

  // Full-text search index
  await knex.raw(`
    CREATE INDEX idx_users_search ON users USING gin(
      to_tsvector('english',
        COALESCE(username, '') || ' ' ||
        COALESCE(display_name, '') || ' ' ||
        COALESCE(first_name, '') || ' ' ||
        COALESCE(last_name, '') || ' ' ||
        COALESCE(email, '')
      )
    )
  `);

  // Check constraints
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_email_lowercase CHECK (email = LOWER(email))");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$')");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_referral_not_self CHECK (referred_by IS NULL OR referred_by <> id)");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_age_minimum CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years')");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'))");

  // 3. USER_SESSIONS TABLE
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('ended_at', { useTz: true });
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('revoked_at', { useTz: true });
    table.jsonb('metadata').defaultTo('{}');
  });

  await knex.raw('CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id)');
  await knex.raw('CREATE INDEX idx_user_sessions_ended_at ON user_sessions(ended_at)');

  // 4. USER_VENUE_ROLES TABLE
  await knex.schema.createTable('user_venue_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('venue_id').notNullable();
    table.string('role', 50).notNullable();
    table.uuid('granted_by').references('id').inTable('users');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('granted_at', { useTz: true });
    table.timestamp('revoked_at', { useTz: true });
    table.uuid('revoked_by').references('id').inTable('users');
  });

  await knex.raw('CREATE INDEX idx_user_venue_roles_user_id ON user_venue_roles(user_id)');
  await knex.raw('CREATE INDEX idx_user_venue_roles_venue_id ON user_venue_roles(venue_id)');

  // 5. AUDIT_LOGS TABLE
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('service', 100).notNullable();
    table.string('action', 200).notNullable();
    table.string('action_type', 50).notNullable();
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('user_role', 100);
    table.string('resource_type', 100).notNullable();
    table.uuid('resource_id');
    table.jsonb('previous_value');
    table.jsonb('new_value');
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.boolean('success').notNullable().defaultTo(true);
    table.text('error_message');
  });

  await knex.raw('CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_service ON audit_logs(service, created_at DESC)');

  // 6. INVALIDATED_TOKENS TABLE
  await knex.schema.createTable('invalidated_tokens', (table) => {
    table.text('token').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('invalidated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();
  });

  await knex.raw('CREATE INDEX idx_invalidated_tokens_user_id ON invalidated_tokens(user_id)');
  await knex.raw('CREATE INDEX idx_invalidated_tokens_expires_at ON invalidated_tokens(expires_at)');

  // 7. TOKEN_REFRESH_LOG TABLE
  await knex.schema.createTable('token_refresh_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('refreshed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');
  });

  await knex.raw('CREATE INDEX idx_token_refresh_log_user_id ON token_refresh_log(user_id)');
  await knex.raw('CREATE INDEX idx_token_refresh_log_refreshed_at ON token_refresh_log(refreshed_at)');
  await knex.raw('CREATE INDEX idx_token_refresh_log_user_refreshed ON token_refresh_log(user_id, refreshed_at DESC)');

  // 8. OAUTH_CONNECTIONS TABLE
  await knex.schema.createTable('oauth_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('provider', 50).notNullable();
    table.string('provider_user_id', 255).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_oauth_connections_user_id ON oauth_connections(user_id)');

  // 9. WALLET_CONNECTIONS TABLE
  await knex.schema.createTable('wallet_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('wallet_address', 255).notNullable();
    table.string('network', 50).notNullable();
    table.boolean('verified').defaultTo(false);
    table.timestamp('last_login_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_wallet_connections_user_id ON wallet_connections(user_id)');

  // 10. BIOMETRIC_CREDENTIALS TABLE
  await knex.schema.createTable('biometric_credentials', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_id', 255).notNullable();
    table.text('public_key').notNullable();
    table.string('credential_type', 50).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_biometric_credentials_user_id ON biometric_credentials(user_id)');

  // 11. TRUSTED_DEVICES TABLE
  await knex.schema.createTable('trusted_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_fingerprint', 255).notNullable();
    table.integer('trust_score').defaultTo(0);
    table.timestamp('last_seen', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_trusted_devices_user_id ON trusted_devices(user_id)');

  // ==========================================
  // TRIGGERS (functions now exist!)
  // ==========================================

  // Trigger: Auto-generate referral code on user insert
  await knex.raw(`
    CREATE TRIGGER trigger_generate_referral_code
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION generate_user_referral_code();
  `);

  // Trigger: Increment referral count when user verifies email
  await knex.raw(`
    CREATE TRIGGER trigger_increment_referral_count
    AFTER UPDATE OF email_verified ON users
    FOR EACH ROW
    WHEN (NEW.email_verified = true AND OLD.email_verified = false)
    EXECUTE FUNCTION increment_referral_count();
  `);

  // Trigger: Auto-update updated_at on users table
  await knex.raw(`
    CREATE TRIGGER trigger_update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Auth Service baseline migration complete - 11 tables + 3 triggers + 3 functions created');
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_users_timestamp ON users');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_increment_referral_count ON users');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_generate_referral_code ON users');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('trusted_devices');
  await knex.schema.dropTableIfExists('biometric_credentials');
  await knex.schema.dropTableIfExists('wallet_connections');
  await knex.schema.dropTableIfExists('oauth_connections');
  await knex.schema.dropTableIfExists('token_refresh_log');
  await knex.schema.dropTableIfExists('invalidated_tokens');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('user_venue_roles');
  await knex.schema.dropTableIfExists('user_sessions');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('tenants');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  await knex.raw('DROP FUNCTION IF EXISTS generate_user_referral_code()');
  await knex.raw('DROP FUNCTION IF EXISTS increment_referral_count()');
}
