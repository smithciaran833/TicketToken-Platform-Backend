import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. OAUTH_TOKENS - Dedicated OAuth token storage with KMS encryption
  await knex.schema.createTable('oauth_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('provider', 100).notNullable();
    
    // KMS-encrypted token fields
    table.text('access_token_encrypted').notNullable();
    table.text('refresh_token_encrypted');
    table.text('id_token_encrypted');
    
    // Token metadata
    table.timestamp('access_token_expires_at', { useTz: true });
    table.timestamp('refresh_token_expires_at', { useTz: true });
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.string('token_type', 50).defaultTo('Bearer');
    
    // OAuth state management
    table.string('oauth_state', 500);
    table.timestamp('oauth_state_expires_at', { useTz: true });
    
    // Security and audit
    table.string('kms_key_id', 500).notNullable();
    table.string('encryption_context', 500);
    table.integer('token_version').defaultTo(1);
    table.timestamp('last_rotated_at', { useTz: true });
    table.timestamp('last_validated_at', { useTz: true });
    table.string('validation_status', 50).defaultTo('valid');
    
    // Additional metadata
    table.jsonb('provider_metadata').defaultTo('{}');
    table.jsonb('rate_limit_info').defaultTo('{}');
    
    table.timestamps(true, true);
  });

  await knex.raw('CREATE INDEX oauth_tokens_venue_id_idx ON oauth_tokens(venue_id)');
  await knex.raw('CREATE INDEX oauth_tokens_integration_type_idx ON oauth_tokens(integration_type)');
  await knex.raw('CREATE INDEX oauth_tokens_provider_idx ON oauth_tokens(provider)');
  await knex.raw('CREATE INDEX oauth_tokens_access_token_expires_at_idx ON oauth_tokens(access_token_expires_at)');
  await knex.raw('CREATE INDEX oauth_tokens_validation_status_idx ON oauth_tokens(validation_status)');
  await knex.raw('CREATE INDEX oauth_tokens_oauth_state_idx ON oauth_tokens(oauth_state) WHERE oauth_state IS NOT NULL');
  await knex.raw('CREATE UNIQUE INDEX oauth_tokens_venue_integration_unique ON oauth_tokens(venue_id, integration_type)');

  // 2. VENUE_API_KEYS - API key storage for non-OAuth integrations
  await knex.schema.createTable('venue_api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('provider', 100).notNullable();
    table.string('key_name', 255).notNullable();
    
    // KMS-encrypted API key fields
    table.text('api_key_encrypted').notNullable();
    table.text('api_secret_encrypted');
    table.text('webhook_secret_encrypted');
    
    // Key metadata
    table.string('key_type', 50).notNullable(); // 'public', 'secret', 'webhook', etc.
    table.string('environment', 50).defaultTo('production'); // 'production', 'sandbox', 'test'
    table.string('status', 50).notNullable().defaultTo('active');
    
    // Security and audit
    table.string('kms_key_id', 500).notNullable();
    table.string('encryption_context', 500);
    table.integer('key_version').defaultTo(1);
    table.timestamp('last_rotated_at', { useTz: true });
    table.timestamp('last_used_at', { useTz: true });
    table.timestamp('last_validated_at', { useTz: true });
    table.string('validation_status', 50).defaultTo('valid');
    
    // Key restrictions and permissions
    table.specificType('allowed_ip_ranges', 'text[]').defaultTo('{}');
    table.specificType('allowed_endpoints', 'text[]').defaultTo('{}');
    table.timestamp('expires_at', { useTz: true });
    
    // Usage tracking
    table.integer('usage_count_24h').defaultTo(0);
    table.integer('usage_count_30d').defaultTo(0);
    table.integer('error_count_24h').defaultTo(0);
    table.timestamp('usage_count_reset_at', { useTz: true });
    
    // Additional metadata
    table.jsonb('provider_metadata').defaultTo('{}');
    table.jsonb('rate_limit_info').defaultTo('{}');
    table.text('notes');
    
    table.timestamps(true, true);
  });

  await knex.raw('CREATE INDEX venue_api_keys_venue_id_idx ON venue_api_keys(venue_id)');
  await knex.raw('CREATE INDEX venue_api_keys_integration_type_idx ON venue_api_keys(integration_type)');
  await knex.raw('CREATE INDEX venue_api_keys_provider_idx ON venue_api_keys(provider)');
  await knex.raw('CREATE INDEX venue_api_keys_status_idx ON venue_api_keys(status)');
  await knex.raw('CREATE INDEX venue_api_keys_environment_idx ON venue_api_keys(environment)');
  await knex.raw('CREATE INDEX venue_api_keys_validation_status_idx ON venue_api_keys(validation_status)');
  await knex.raw('CREATE INDEX venue_api_keys_expires_at_idx ON venue_api_keys(expires_at) WHERE expires_at IS NOT NULL');
  await knex.raw('CREATE INDEX venue_api_keys_last_used_at_idx ON venue_api_keys(last_used_at)');
  await knex.raw('CREATE UNIQUE INDEX venue_api_keys_venue_integration_key_name_unique ON venue_api_keys(venue_id, integration_type, key_name)');

  // Add foreign key relationships if venues table exists (optional - may be in different schema)
  // These will fail gracefully if the tables don't exist
  await knex.raw(`
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'venues') THEN
        ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_venue_id_fkey 
          FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
        ALTER TABLE venue_api_keys ADD CONSTRAINT venue_api_keys_venue_id_fkey 
          FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  console.log('✅ Integration Service migration 002 complete - oauth_tokens and venue_api_keys tables created');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('venue_api_keys');
  await knex.schema.dropTableIfExists('oauth_tokens');
}
