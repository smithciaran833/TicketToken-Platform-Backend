import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================
  // EXTENSIONS
  // ==========================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ==========================================
  // FUNCTIONS
  // ==========================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

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

  await knex.raw(`
    CREATE OR REPLACE FUNCTION increment_referral_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.referred_by IS NOT NULL THEN
        UPDATE users SET referral_count = referral_count + 1 WHERE id = NEW.referred_by;
      END IF;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_trigger_function()
    RETURNS TRIGGER SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE
      old_data_json JSONB; new_data_json JSONB; changed_fields_array TEXT[];
      field_name TEXT; current_user_id UUID; current_ip TEXT; current_user_agent TEXT;
    BEGIN
      BEGIN current_user_id := current_setting('app.current_user_id', true)::UUID;
      EXCEPTION WHEN OTHERS THEN current_user_id := NULL; END;
      BEGIN current_ip := current_setting('app.ip_address', true);
      EXCEPTION WHEN OTHERS THEN current_ip := NULL; END;
      BEGIN current_user_agent := current_setting('app.user_agent', true);
      EXCEPTION WHEN OTHERS THEN current_user_agent := NULL; END;

      IF (TG_OP = 'DELETE') THEN
        old_data_json := to_jsonb(OLD);
        INSERT INTO audit_logs (service, action, action_type, user_id, table_name, record_id, resource_type, resource_id, old_data, ip_address, user_agent, success)
        VALUES ('database-trigger', 'DELETE', 'DELETE', current_user_id, TG_TABLE_NAME, OLD.id, TG_TABLE_NAME, OLD.id, old_data_json, current_ip, current_user_agent, true);
        RETURN OLD;
      ELSIF (TG_OP = 'UPDATE') THEN
        old_data_json := to_jsonb(OLD); new_data_json := to_jsonb(NEW); changed_fields_array := ARRAY[]::TEXT[];
        FOR field_name IN SELECT jsonb_object_keys(old_data_json) LOOP
          IF field_name != 'updated_at' AND old_data_json->field_name IS DISTINCT FROM new_data_json->field_name THEN
            changed_fields_array := array_append(changed_fields_array, field_name);
          END IF;
        END LOOP;
        IF array_length(changed_fields_array, 1) > 0 THEN
          INSERT INTO audit_logs (service, action, action_type, user_id, table_name, record_id, resource_type, resource_id, changed_fields, old_data, new_data, ip_address, user_agent, success)
          VALUES ('database-trigger', 'UPDATE', 'UPDATE', current_user_id, TG_TABLE_NAME, NEW.id, TG_TABLE_NAME, NEW.id, changed_fields_array, old_data_json, new_data_json, current_ip, current_user_agent, true);
        END IF;
        RETURN NEW;
      ELSIF (TG_OP = 'INSERT') THEN
        new_data_json := to_jsonb(NEW);
        INSERT INTO audit_logs (service, action, action_type, user_id, table_name, record_id, resource_type, resource_id, new_data, ip_address, user_agent, success)
        VALUES ('database-trigger', 'INSERT', 'INSERT', current_user_id, TG_TABLE_NAME, NEW.id, TG_TABLE_NAME, NEW.id, new_data_json, current_ip, current_user_agent, true);
        RETURN NEW;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION backfill_user_aggregates() RETURNS void AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_transactions') THEN
        UPDATE users u SET total_spent = COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.user_id = u.id AND pt.status = 'completed' AND pt.deleted_at IS NULL), 0);
      END IF;
      UPDATE users u SET lifetime_value = total_spent;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
        UPDATE users u SET events_attended = COALESCE((SELECT COUNT(DISTINCT t.event_id) FROM tickets t WHERE t.user_id = u.id AND t.status IN ('used') AND t.deleted_at IS NULL), 0);
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // PII Masking Functions
  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_email(email TEXT) RETURNS TEXT AS $$
    BEGIN
      IF email IS NULL THEN RETURN NULL; END IF;
      RETURN CASE WHEN position('@' IN email) > 3
        THEN left(email, 2) || repeat('*', position('@' IN email) - 3) || substring(email from position('@' IN email))
        ELSE repeat('*', position('@' IN email) - 1) || substring(email from position('@' IN email))
      END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_phone(phone TEXT) RETURNS TEXT AS $$
    BEGIN
      IF phone IS NULL THEN RETURN NULL; END IF;
      RETURN regexp_replace(phone, '(\\d{3})(\\d+)(\\d{4})', '\\1-***-\\3');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_tax_id(tax_id TEXT) RETURNS TEXT AS $$
    BEGIN
      IF tax_id IS NULL THEN RETURN NULL; END IF;
      RETURN '***-**-' || right(tax_id, 4);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_card_number(card TEXT) RETURNS TEXT AS $$
    BEGIN
      IF card IS NULL THEN RETURN NULL; END IF;
      RETURN repeat('*', length(card) - 4) || right(card, 4);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_expired_data() RETURNS void AS $$
    DECLARE deleted_count INTEGER;
    BEGIN
      DELETE FROM user_sessions WHERE ended_at < NOW() - INTERVAL '30 days';
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RAISE NOTICE 'Deleted % expired sessions', deleted_count;

      DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '7 years';
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RAISE NOTICE 'Deleted % old audit logs', deleted_count;

      UPDATE users SET email = 'deleted_' || id || '@removed.com', first_name = 'Deleted', last_name = 'User', phone = NULL, deleted_at = NOW()
      WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days' AND email NOT LIKE 'deleted_%';
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RAISE NOTICE 'Anonymized % users', deleted_count;

      DELETE FROM wallet_connections WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days');
      DELETE FROM oauth_connections WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days');
      DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // TABLE 1: tenants (no tenant_id, no RLS - this IS the tenant table)
  // ==========================================
  await knex.schema.createTable('tenants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.string('status', 255).defaultTo('active');
    table.jsonb('settings').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`INSERT INTO tenants (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default')`);

  // ==========================================
  // TABLE 2: users
  // ==========================================
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v1()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('email', 255).notNullable();
    table.string('password_hash', 255).notNullable();
    table.boolean('email_verified').notNullable().defaultTo(false);
    table.string('email_verification_token', 64);
    table.timestamp('email_verification_expires', { useTz: true });
    table.timestamp('email_verified_at', { useTz: true });
    table.string('username', 30).unique();
    table.string('display_name', 100);
    table.text('bio');
    table.text('avatar_url');
    table.text('cover_image_url');
    table.string('first_name', 50);
    table.string('last_name', 50);
    table.date('date_of_birth');
    table.string('phone', 20);
    table.boolean('phone_verified').defaultTo(false);
    table.string('country_code', 2);
    table.string('city', 100);
    table.string('state_province', 100);
    table.string('postal_code', 20);
    table.string('timezone', 50).notNullable().defaultTo('UTC');
    table.string('preferred_language', 10).notNullable().defaultTo('en');
    table.text('status').notNullable().defaultTo('PENDING');
    table.string('role', 20).notNullable().defaultTo('user');
    table.jsonb('permissions').defaultTo('[]');
    table.boolean('two_factor_enabled').notNullable().defaultTo(false);
    table.string('two_factor_secret', 32);
    table.specificType('backup_codes', 'TEXT[]');
    table.boolean('mfa_enabled').notNullable().defaultTo(false);
    table.text('mfa_secret');
    table.timestamp('last_password_change', { useTz: true }).defaultTo(knex.fn.now());
    table.string('password_reset_token', 64);
    table.timestamp('password_reset_expires', { useTz: true });
    table.timestamp('password_changed_at', { useTz: true });
    table.timestamp('last_login_at', { useTz: true });
    table.timestamp('last_active_at', { useTz: true });
    table.specificType('last_login_ip', 'INET');
    table.string('last_login_device', 255);
    table.integer('login_count').defaultTo(0);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until', { useTz: true });
    table.jsonb('preferences').defaultTo('{}');
    table.jsonb('notification_preferences').defaultTo('{"push": {"security": true, "marketing": false, "transactions": true}, "email": {"security": true, "marketing": true, "transactions": true}}');
    table.jsonb('privacy_settings').defaultTo('{}');
    table.jsonb('profile_data').defaultTo('{}');
    table.timestamp('terms_accepted_at', { useTz: true });
    table.string('terms_version', 20);
    table.timestamp('privacy_accepted_at', { useTz: true });
    table.string('privacy_version', 20);
    table.boolean('marketing_consent').defaultTo(false);
    table.timestamp('marketing_consent_date', { useTz: true });
    table.string('referral_code', 20).unique();
    table.uuid('referred_by').references('id').inTable('users');
    table.integer('referral_count').defaultTo(0);
    table.decimal('lifetime_value', 10, 2).defaultTo(0);
    table.decimal('total_spent', 10, 2).defaultTo(0);
    table.integer('events_attended').defaultTo(0);
    table.integer('ticket_purchase_count').defaultTo(0);
    table.integer('loyalty_points').defaultTo(0);
    table.boolean('can_receive_transfers').defaultTo(true);
    table.boolean('identity_verified').defaultTo(false);
    table.string('provider', 50);
    table.string('provider_user_id', 255);
    table.string('wallet_address', 255);
    table.string('network', 50);
    table.boolean('verified').defaultTo(false);
    table.string('stripe_connect_account_id', 255);
    table.string('stripe_connect_status', 50).defaultTo('not_started');
    table.boolean('stripe_connect_charges_enabled').defaultTo(false);
    table.boolean('stripe_connect_payouts_enabled').defaultTo(false);
    table.boolean('stripe_connect_details_submitted').defaultTo(false);
    table.timestamp('stripe_connect_onboarded_at', { useTz: true });
    table.jsonb('stripe_connect_capabilities').defaultTo('{}');
    table.string('stripe_connect_country', 2);
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('tags', 'TEXT[]');
    table.string('verification_token', 255);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  // Users indexes
  await knex.raw('CREATE UNIQUE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX idx_users_tenant_id ON users(tenant_id)');
  await knex.raw('CREATE INDEX idx_users_username ON users(username)');
  await knex.raw('CREATE INDEX idx_users_phone ON users(phone)');
  await knex.raw('CREATE INDEX idx_users_role ON users(role)');
  await knex.raw('CREATE INDEX idx_users_status ON users(status)');
  await knex.raw('CREATE INDEX idx_users_deleted_at ON users(deleted_at)');
  await knex.raw('CREATE INDEX idx_users_referral_code ON users(referral_code)');
  await knex.raw('CREATE INDEX idx_users_referred_by ON users(referred_by)');
  await knex.raw('CREATE INDEX idx_users_stripe_connect_account_id ON users(stripe_connect_account_id)');
  await knex.raw('CREATE INDEX idx_users_metadata_gin ON users USING gin(metadata)');
  await knex.raw('CREATE INDEX idx_users_permissions_gin ON users USING gin(permissions)');
  await knex.raw(`CREATE INDEX idx_users_search ON users USING gin(to_tsvector('english', COALESCE(username, '') || ' ' || COALESCE(display_name, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '')))`);

  // Users constraints
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_email_lowercase CHECK (email = LOWER(email))");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$')");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_referral_not_self CHECK (referred_by IS NULL OR referred_by <> id)");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT check_age_minimum CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years')");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'))");
  await knex.raw("ALTER TABLE users ADD CONSTRAINT chk_users_stripe_connect_status CHECK (stripe_connect_status IN ('not_started', 'pending', 'enabled', 'disabled', 'rejected', 'restricted'))");

  // ==========================================
  // TABLE 3: user_sessions
  // ==========================================
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('ended_at', { useTz: true });
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('revoked_at', { useTz: true });
    table.jsonb('metadata').defaultTo('{}');
  });

  await knex.raw('CREATE INDEX idx_user_sessions_tenant_id ON user_sessions(tenant_id)');
  await knex.raw('CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id)');
  await knex.raw('CREATE INDEX idx_user_sessions_ended_at ON user_sessions(ended_at)');

  // ==========================================
  // TABLE 4: user_venue_roles
  // ==========================================
  await knex.schema.createTable('user_venue_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
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

  await knex.raw('CREATE INDEX idx_user_venue_roles_tenant_id ON user_venue_roles(tenant_id)');
  await knex.raw('CREATE INDEX idx_user_venue_roles_user_id ON user_venue_roles(user_id)');
  await knex.raw('CREATE INDEX idx_user_venue_roles_venue_id ON user_venue_roles(venue_id)');

  // ==========================================
  // TABLE 5: audit_logs
  // ==========================================
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').references('id').inTable('tenants').onDelete('SET NULL');
    table.string('service', 100).notNullable();
    table.string('action', 200).notNullable();
    table.string('action_type', 50).notNullable();
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('user_role', 100);
    table.string('resource_type', 100).notNullable();
    table.uuid('resource_id');
    table.string('table_name', 100);
    table.uuid('record_id');
    table.specificType('changed_fields', 'TEXT[]');
    table.jsonb('old_data');
    table.jsonb('new_data');
    table.jsonb('previous_value');
    table.jsonb('new_value');
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.boolean('success').notNullable().defaultTo(true);
    table.text('error_message');
  });

  await knex.raw('CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id)');
  await knex.raw('CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name)');
  await knex.raw('CREATE INDEX idx_audit_logs_record_id ON audit_logs(record_id)');
  await knex.raw('CREATE INDEX idx_audit_logs_changed_fields ON audit_logs USING GIN(changed_fields)');

  // ==========================================
  // TABLE 6: invalidated_tokens
  // ==========================================
  await knex.schema.createTable('invalidated_tokens', (table) => {
    table.text('token').primary();
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('invalidated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();
  });

  await knex.raw('CREATE INDEX idx_invalidated_tokens_tenant_id ON invalidated_tokens(tenant_id)');
  await knex.raw('CREATE INDEX idx_invalidated_tokens_user_id ON invalidated_tokens(user_id)');
  await knex.raw('CREATE INDEX idx_invalidated_tokens_expires_at ON invalidated_tokens(expires_at)');

  // ==========================================
  // TABLE 7: token_refresh_log
  // ==========================================
  await knex.schema.createTable('token_refresh_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('refreshed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');
  });

  await knex.raw('CREATE INDEX idx_token_refresh_log_tenant_id ON token_refresh_log(tenant_id)');
  await knex.raw('CREATE INDEX idx_token_refresh_log_user_id ON token_refresh_log(user_id)');
  await knex.raw('CREATE INDEX idx_token_refresh_log_refreshed_at ON token_refresh_log(refreshed_at)');

  // ==========================================
  // TABLE 8: oauth_connections
  // ==========================================
  await knex.schema.createTable('oauth_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('provider', 50).notNullable();
    table.string('provider_user_id', 255).notNullable();
    table.jsonb('profile_data').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_oauth_connections_tenant_id ON oauth_connections(tenant_id)');
  await knex.raw('CREATE INDEX idx_oauth_connections_user_id ON oauth_connections(user_id)');
  await knex.raw('CREATE UNIQUE INDEX idx_oauth_connections_provider_user ON oauth_connections(provider, provider_user_id)');

  // ==========================================
  // TABLE 9: wallet_connections
  // ==========================================
  await knex.schema.createTable('wallet_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('wallet_address', 255).notNullable();
    table.string('network', 50).notNullable();
    table.boolean('verified').defaultTo(false);
    table.timestamp('last_login_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_wallet_connections_tenant_id ON wallet_connections(tenant_id)');
  await knex.raw('CREATE INDEX idx_wallet_connections_user_id ON wallet_connections(user_id)');

  // ==========================================
  // TABLE 10: biometric_credentials
  // ==========================================
  await knex.schema.createTable('biometric_credentials', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_id', 255).notNullable();
    table.text('public_key').notNullable();
    table.string('credential_type', 50).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_biometric_credentials_tenant_id ON biometric_credentials(tenant_id)');
  await knex.raw('CREATE INDEX idx_biometric_credentials_user_id ON biometric_credentials(user_id)');

  // ==========================================
  // TABLE 11: trusted_devices
  // ==========================================
  await knex.schema.createTable('trusted_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_fingerprint', 255).notNullable();
    table.integer('trust_score').defaultTo(0);
    table.timestamp('last_seen', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_trusted_devices_tenant_id ON trusted_devices(tenant_id)');
  await knex.raw('CREATE INDEX idx_trusted_devices_user_id ON trusted_devices(user_id)');

  // ==========================================
  // TABLE 12: user_addresses
  // ==========================================
  await knex.schema.createTable('user_addresses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('address_type', 20).notNullable().defaultTo('billing');
    table.string('address_line1', 255).notNullable();
    table.string('address_line2', 255);
    table.string('city', 100).notNullable();
    table.string('state_province', 100);
    table.string('postal_code', 20).notNullable();
    table.string('country_code', 2).notNullable().defaultTo('US');
    table.string('normalized_address', 500);
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_user_addresses_tenant_id ON user_addresses(tenant_id)');
  await knex.raw('CREATE INDEX idx_user_addresses_user_id ON user_addresses(user_id)');
  await knex.raw("ALTER TABLE user_addresses ADD CONSTRAINT chk_user_addresses_type CHECK (address_type IN ('billing', 'shipping'))");

  // ==========================================
  // TRIGGERS
  // ==========================================
  await knex.raw(`CREATE TRIGGER trigger_generate_referral_code BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION generate_user_referral_code()`);
  await knex.raw(`CREATE TRIGGER trigger_increment_referral_count AFTER UPDATE OF email_verified ON users FOR EACH ROW WHEN (NEW.email_verified = true AND OLD.email_verified = false) EXECUTE FUNCTION increment_referral_count()`);
  await knex.raw(`CREATE TRIGGER trigger_update_users_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
  await knex.raw(`CREATE TRIGGER audit_users_changes AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit_trigger_function()`);

  // ==========================================
  // ROW LEVEL SECURITY
  // ==========================================

  // Table: users
  await knex.raw('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE users FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY users_tenant_isolation ON users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: user_sessions
  await knex.raw('ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY user_sessions_tenant_isolation ON user_sessions FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: user_venue_roles
  await knex.raw('ALTER TABLE user_venue_roles ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_venue_roles FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY user_venue_roles_tenant_isolation ON user_venue_roles FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: audit_logs
  await knex.raw('ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY audit_logs_tenant_isolation ON audit_logs FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: invalidated_tokens
  await knex.raw('ALTER TABLE invalidated_tokens ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE invalidated_tokens FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY invalidated_tokens_tenant_isolation ON invalidated_tokens FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: token_refresh_log
  await knex.raw('ALTER TABLE token_refresh_log ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE token_refresh_log FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY token_refresh_log_tenant_isolation ON token_refresh_log FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: oauth_connections
  await knex.raw('ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE oauth_connections FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY oauth_connections_tenant_isolation ON oauth_connections FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: wallet_connections
  await knex.raw('ALTER TABLE wallet_connections ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE wallet_connections FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY wallet_connections_tenant_isolation ON wallet_connections FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: biometric_credentials
  await knex.raw('ALTER TABLE biometric_credentials ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE biometric_credentials FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY biometric_credentials_tenant_isolation ON biometric_credentials FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: trusted_devices
  await knex.raw('ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE trusted_devices FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY trusted_devices_tenant_isolation ON trusted_devices FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // Table: user_addresses
  await knex.raw('ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_addresses FORCE ROW LEVEL SECURITY');
  await knex.raw(`CREATE POLICY user_addresses_tenant_isolation ON user_addresses FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`);

  // ==========================================
  // MASKED VIEW FOR SUPPORT
  // ==========================================
  await knex.raw(`
    CREATE OR REPLACE VIEW users_masked AS
    SELECT id, tenant_id, mask_email(email) as email, username, first_name, last_name, mask_phone(phone) as phone,
      status, role, created_at, last_login_at, email_verified, phone_verified
    FROM users
  `);

  console.log('Auth Service migration complete');
}

export async function down(knex: Knex): Promise<void> {
  // Drop view
  await knex.raw('DROP VIEW IF EXISTS users_masked CASCADE');

  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS user_addresses_tenant_isolation ON user_addresses');
  await knex.raw('DROP POLICY IF EXISTS trusted_devices_tenant_isolation ON trusted_devices');
  await knex.raw('DROP POLICY IF EXISTS biometric_credentials_tenant_isolation ON biometric_credentials');
  await knex.raw('DROP POLICY IF EXISTS wallet_connections_tenant_isolation ON wallet_connections');
  await knex.raw('DROP POLICY IF EXISTS oauth_connections_tenant_isolation ON oauth_connections');
  await knex.raw('DROP POLICY IF EXISTS token_refresh_log_tenant_isolation ON token_refresh_log');
  await knex.raw('DROP POLICY IF EXISTS invalidated_tokens_tenant_isolation ON invalidated_tokens');
  await knex.raw('DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs');
  await knex.raw('DROP POLICY IF EXISTS user_venue_roles_tenant_isolation ON user_venue_roles');
  await knex.raw('DROP POLICY IF EXISTS user_sessions_tenant_isolation ON user_sessions');
  await knex.raw('DROP POLICY IF EXISTS users_tenant_isolation ON users');

  // Disable RLS
  await knex.raw('ALTER TABLE user_addresses DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE trusted_devices DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE biometric_credentials DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE wallet_connections DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE oauth_connections DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE token_refresh_log DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE invalidated_tokens DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_venue_roles DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE users DISABLE ROW LEVEL SECURITY');

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS audit_users_changes ON users');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_users_timestamp ON users');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_increment_referral_count ON users');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_generate_referral_code ON users');

  // Drop tables (reverse order)
  await knex.schema.dropTableIfExists('user_addresses');
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
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_expired_data()');
  await knex.raw('DROP FUNCTION IF EXISTS mask_card_number(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS mask_tax_id(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS mask_phone(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS mask_email(TEXT)');
  await knex.raw('DROP FUNCTION IF EXISTS backfill_user_aggregates()');
  await knex.raw('DROP FUNCTION IF EXISTS audit_trigger_function()');
  await knex.raw('DROP FUNCTION IF EXISTS increment_referral_count()');
  await knex.raw('DROP FUNCTION IF EXISTS generate_user_referral_code()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
}
