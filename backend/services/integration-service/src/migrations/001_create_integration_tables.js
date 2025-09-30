exports.up = async function(knex) {
  // Integration configurations
  await knex.schema.createTable('integration_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.enum('status', ['disconnected', 'connecting', 'connected', 'error', 'suspended']).defaultTo('disconnected');
    table.timestamp('connected_at').nullable();
    table.timestamp('disconnected_at').nullable();
    table.timestamp('last_sync_at').nullable();
    table.timestamp('next_sync_at').nullable();
    table.jsonb('config').defaultTo('{}');
    table.jsonb('field_mappings').defaultTo('{}');
    table.uuid('template_id').nullable();
    table.timestamp('template_applied_at').nullable();
    table.enum('health_status', ['healthy', 'degraded', 'unhealthy', 'unknown']).defaultTo('unknown');
    table.timestamp('health_checked_at').nullable();
    table.integer('failure_count').defaultTo(0);
    table.text('last_error').nullable();
    table.timestamp('last_error_at').nullable();
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'integration_type']);
    table.index('venue_id');
    table.index('status');
    table.index('health_status');
  });

  // OAuth tokens (encrypted)
  await knex.schema.createTable('oauth_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.text('encrypted_access_token').notNullable();
    table.text('encrypted_refresh_token').nullable();
    table.integer('encryption_key_version').defaultTo(1);
    table.specificType('scopes', 'text[]').nullable();
    table.string('token_type', 50).defaultTo('Bearer');
    table.timestamp('expires_at').nullable();
    table.integer('refresh_count').defaultTo(0);
    table.timestamp('last_refreshed_at').nullable();
    table.integer('refresh_failed_count').defaultTo(0);
    table.uuid('created_by').nullable();
    table.specificType('created_ip', 'inet').nullable();  // Fixed: use specificType for inet
    table.timestamp('last_used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type']);
    table.index('expires_at');
    table.index('venue_id');
  });

  // Venue API keys
  await knex.schema.createTable('venue_api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.text('encrypted_api_key').notNullable();
    table.text('encrypted_api_secret').nullable();
    table.string('key_name').nullable();
    table.string('environment', 20).defaultTo('production');
    table.boolean('is_valid').defaultTo(true);
    table.timestamp('last_validated_at').nullable();
    table.text('validation_error').nullable();
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'integration_type', 'environment']);
  });

  // Sync queue
  await knex.schema.createTable('sync_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.enum('operation_type', ['create', 'update', 'delete', 'sync', 'reconcile']).notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id').nullable();
    table.jsonb('payload').notNullable();
    table.string('idempotency_key').nullable();
    table.enum('priority', ['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).defaultTo('NORMAL');
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'dead_letter']).defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(10);
    table.timestamp('next_retry_at').nullable();
    table.timestamp('queued_at').defaultTo(knex.fn.now());
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('expires_at').defaultTo(knex.raw("CURRENT_TIMESTAMP + INTERVAL '7 days'"));
    table.text('last_error').nullable();
    table.integer('error_count').defaultTo(0);
    table.string('correlation_id').nullable();
    
    table.index(['venue_id', 'status']);
    table.index(['priority', 'status']);
    table.index('next_retry_at');
    table.index('expires_at');
    table.unique('idempotency_key');
  });

  // Field mapping templates
  await knex.schema.createTable('field_mapping_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.string('venue_type', 50).nullable();
    table.string('integration_type', 50).notNullable();
    table.jsonb('mappings').notNullable();
    table.jsonb('validation_rules').nullable();
    table.integer('usage_count').defaultTo(0);
    table.timestamp('last_used_at').nullable();
    table.boolean('is_default').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('venue_type');
    table.index('integration_type');
    table.index('is_default');
  });

  // Webhook events
  await knex.schema.createTable('integration_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').nullable();
    table.string('integration_type', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.string('event_id').nullable();
    table.jsonb('headers').nullable();
    table.jsonb('payload').notNullable();
    table.string('signature', 500).nullable();
    table.enum('status', ['pending', 'processing', 'processed', 'failed', 'ignored']).defaultTo('pending');
    table.timestamp('processed_at').nullable();
    table.text('error').nullable();
    table.integer('retry_count').defaultTo(0);
    table.string('external_id').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());
    
    table.index(['venue_id', 'status']);
    table.index('external_id');
    table.index('received_at');
    table.unique(['integration_type', 'external_id']);
  });

  // Sync logs
  await knex.schema.createTable('sync_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.uuid('sync_id').nullable();
    table.string('operation', 100).notNullable();
    table.string('entity_type', 50).nullable();
    table.integer('entity_count').nullable();
    table.string('status', 50).notNullable();
    table.integer('success_count').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.integer('skip_count').defaultTo(0);
    table.integer('duration_ms').nullable();
    table.integer('api_calls_made').nullable();
    table.jsonb('details').nullable();
    table.jsonb('errors').nullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    
    table.index(['venue_id', 'started_at']);
    table.index('sync_id');
  });

  // Integration health metrics
  await knex.schema.createTable('integration_health', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.decimal('success_rate', 5, 2).nullable();
    table.integer('average_sync_time_ms').nullable();
    table.timestamp('last_success_at').nullable();
    table.timestamp('last_failure_at').nullable();
    table.integer('sync_count_24h').defaultTo(0);
    table.integer('success_count_24h').defaultTo(0);
    table.integer('failure_count_24h').defaultTo(0);
    table.integer('api_calls_24h').defaultTo(0);
    table.integer('api_quota_remaining').nullable();
    table.timestamp('api_quota_resets_at').nullable();
    table.integer('queue_depth').defaultTo(0);
    table.timestamp('oldest_queue_item_at').nullable();
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type']);
    table.index('calculated_at');
  });

  // Integration costs
  await knex.schema.createTable('integration_costs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.integer('api_calls').defaultTo(0);
    table.decimal('data_synced_mb', 10, 2).nullable();
    table.decimal('base_cost', 10, 2).nullable();
    table.decimal('overage_cost', 10, 2).nullable();
    table.decimal('total_cost', 10, 2).nullable();
    table.boolean('included_in_plan').defaultTo(true);
    table.boolean('billed_to_venue').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type', 'period_start']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('integration_costs');
  await knex.schema.dropTableIfExists('integration_health');
  await knex.schema.dropTableIfExists('sync_logs');
  await knex.schema.dropTableIfExists('integration_webhooks');
  await knex.schema.dropTableIfExists('field_mapping_templates');
  await knex.schema.dropTableIfExists('sync_queue');
  await knex.schema.dropTableIfExists('venue_api_keys');
  await knex.schema.dropTableIfExists('oauth_tokens');
  await knex.schema.dropTableIfExists('integration_configs');
};
