import { Knex } from 'knex';

/**
 * File Service - Consolidated Baseline Migration
 *
 * Generated: January 13, 2026
 * Consolidates: 001-003 + 20260104 migrations
 *
 * Tables: 13 (12 tenant-scoped, 1 global)
 *
 * Standards Applied:
 * - gen_random_uuid() for all UUIDs
 * - tenant_id NOT NULL on all tenant tables
 * - RLS with app.current_tenant_id + app.is_system_user
 * - External FKs converted to comments
 * - Internal FKs preserved
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // FUNCTIONS
  // ============================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================================
  // GLOBAL TABLES (1) - No tenant_id, No RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // av_scans - Virus scan cache by file hash
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('av_scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('file_hash', 64).notNullable().unique();
    table.boolean('clean').notNullable();
    table.jsonb('threats').defaultTo('[]');
    table.timestamp('scanned_at').notNullable();
    table.string('scan_engine', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_av_scans_file_hash ON av_scans(file_hash)');
  await knex.raw('CREATE INDEX idx_av_scans_scanned_at ON av_scans(scanned_at)');
  await knex.raw('CREATE INDEX idx_av_scans_clean ON av_scans(clean)');

  // ============================================================================
  // TENANT-SCOPED TABLES (12) - With tenant_id and RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // files - Main files table
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('filename', 255).notNullable();
    table.string('original_filename', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.string('extension', 20);
    table.string('storage_provider', 50).notNullable().defaultTo('local');
    table.string('bucket_name', 255);
    table.text('storage_path').notNullable();
    table.text('cdn_url');
    table.bigInteger('size_bytes').notNullable();
    table.string('hash_sha256', 64);
    table.uuid('uploaded_by').comment('FK: users.id');
    table.string('entity_type', 100);
    table.uuid('entity_id');
    table.boolean('is_public').defaultTo(false);
    table.string('access_level', 50).defaultTo('private');
    table.string('status', 50).notNullable().defaultTo('uploading');
    table.text('processing_error');
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');
  });

  await knex.raw('CREATE INDEX idx_files_tenant ON files(tenant_id)');
  await knex.raw('CREATE INDEX idx_files_uploaded_by ON files(uploaded_by)');
  await knex.raw('CREATE INDEX idx_files_entity ON files(entity_type, entity_id)');
  await knex.raw('CREATE INDEX idx_files_status ON files(status)');
  await knex.raw('CREATE INDEX idx_files_hash ON files(hash_sha256)');
  await knex.raw('CREATE INDEX idx_files_created ON files(created_at)');
  await knex.raw('CREATE INDEX idx_files_tenant_created ON files(tenant_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_files_tenant_status ON files(tenant_id, status) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX idx_files_venue ON files(venue_id)');

  // Partial unique index for deduplication
  await knex.raw(`
    CREATE UNIQUE INDEX idx_files_hash_tenant_unique
    ON files (hash_sha256, tenant_id)
    WHERE deleted_at IS NULL AND hash_sha256 IS NOT NULL
  `);

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE files ADD CONSTRAINT check_files_status
    CHECK (status IN ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted'))
  `);
  await knex.raw(`
    ALTER TABLE files ADD CONSTRAINT check_files_size_positive
    CHECK (size_bytes >= 0)
  `);

  // Trigger for updated_at
  await knex.raw(`
    CREATE TRIGGER trigger_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  // ---------------------------------------------------------------------------
  // file_access_logs - Access audit trail
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('file_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('file_id').notNullable();
    table.uuid('accessed_by').comment('FK: users.id');
    table.string('access_type', 50).notNullable();
    table.string('ip_address', 45);
    table.text('user_agent');
    table.integer('response_code');
    table.bigInteger('bytes_sent');
    table.timestamp('accessed_at').defaultTo(knex.fn.now());

    table.foreign('file_id').references('files.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_file_access_logs_tenant ON file_access_logs(tenant_id)');
  await knex.raw('CREATE INDEX idx_file_access_logs_file ON file_access_logs(file_id)');
  await knex.raw('CREATE INDEX idx_file_access_logs_accessed_by ON file_access_logs(accessed_by)');
  await knex.raw('CREATE INDEX idx_file_access_logs_accessed_at ON file_access_logs(accessed_at)');

  // ---------------------------------------------------------------------------
  // file_versions - Version history
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('file_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('file_id').notNullable();
    table.integer('version_number').notNullable();
    table.text('storage_path').notNullable();
    table.bigInteger('size_bytes').notNullable();
    table.string('hash_sha256', 64);
    table.text('change_description');
    table.uuid('created_by').comment('FK: users.id');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('file_id').references('files.id').onDelete('CASCADE');
    table.unique(['file_id', 'version_number']);
  });

  await knex.raw('CREATE INDEX idx_file_versions_tenant ON file_versions(tenant_id)');
  await knex.raw('CREATE INDEX idx_file_versions_file ON file_versions(file_id)');

  // ---------------------------------------------------------------------------
  // upload_sessions - Chunked upload tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('upload_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('session_token').notNullable().unique();
    table.uuid('uploaded_by').comment('FK: users.id');
    table.string('filename', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.bigInteger('total_size').notNullable();
    table.integer('total_chunks').notNullable();
    table.integer('uploaded_chunks').defaultTo(0);
    table.bigInteger('uploaded_bytes').defaultTo(0);
    table.string('status', 50).defaultTo('active');
    table.timestamp('expires_at').notNullable();
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_upload_sessions_tenant ON upload_sessions(tenant_id)');
  await knex.raw('CREATE INDEX idx_upload_sessions_token ON upload_sessions(session_token)');
  await knex.raw('CREATE INDEX idx_upload_sessions_uploaded_by ON upload_sessions(uploaded_by)');
  await knex.raw('CREATE INDEX idx_upload_sessions_status ON upload_sessions(status)');
  await knex.raw('CREATE INDEX idx_upload_sessions_expires ON upload_sessions(expires_at)');

  // ---------------------------------------------------------------------------
  // quarantined_files - Infected files
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('quarantined_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.text('original_path').notNullable();
    table.text('quarantine_path').notNullable();
    table.string('file_hash', 64).notNullable();
    table.jsonb('threats').notNullable();
    table.timestamp('quarantined_at').defaultTo(knex.fn.now());
    table.timestamp('restored_at');
    table.timestamp('deleted_at');
  });

  await knex.raw('CREATE INDEX idx_quarantined_files_tenant ON quarantined_files(tenant_id)');
  await knex.raw('CREATE INDEX idx_quarantined_files_hash ON quarantined_files(file_hash)');
  await knex.raw('CREATE INDEX idx_quarantined_files_quarantined ON quarantined_files(quarantined_at)');

  // ---------------------------------------------------------------------------
  // file_uploads - Upload tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('file_uploads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.text('file_key').notNullable();
    table.string('file_name', 255).notNullable();
    table.string('content_type', 100).notNullable();
    table.bigInteger('size_bytes');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.text('processing_error');
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');
  });

  await knex.raw('CREATE INDEX idx_file_uploads_tenant ON file_uploads(tenant_id)');
  await knex.raw('CREATE INDEX idx_file_uploads_user ON file_uploads(user_id)');
  await knex.raw('CREATE INDEX idx_file_uploads_status ON file_uploads(status)');
  await knex.raw('CREATE INDEX idx_file_uploads_expires ON file_uploads(expires_at)');
  await knex.raw('CREATE INDEX idx_file_uploads_file_key ON file_uploads(file_key)');
  await knex.raw('CREATE INDEX idx_file_uploads_created ON file_uploads(created_at)');

  // ---------------------------------------------------------------------------
  // file_shares - Sharing permissions
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('file_shares', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('file_id').notNullable();
    table.uuid('shared_with_user_id').notNullable().comment('FK: users.id');
    table.uuid('shared_by_user_id').comment('FK: users.id');
    table.string('permission_level', 50).defaultTo('view');
    table.timestamp('expires_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('file_id').references('files.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_file_shares_tenant ON file_shares(tenant_id)');
  await knex.raw('CREATE INDEX idx_file_shares_file ON file_shares(file_id)');
  await knex.raw('CREATE INDEX idx_file_shares_shared_with ON file_shares(shared_with_user_id)');
  await knex.raw('CREATE INDEX idx_file_shares_expires ON file_shares(expires_at)');
  await knex.raw('CREATE INDEX idx_file_shares_file_user ON file_shares(file_id, shared_with_user_id)');

  // ---------------------------------------------------------------------------
  // image_metadata - Image processing data
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('image_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('file_id').notNullable().unique();
    table.integer('width').notNullable();
    table.integer('height').notNullable();
    table.decimal('aspect_ratio', 10, 4);
    table.string('format', 50);
    table.text('thumbnail_small_url');
    table.text('thumbnail_medium_url');
    table.text('thumbnail_large_url');
    table.string('color_space', 50);
    table.integer('channels');
    table.string('depth', 50);
    table.integer('density');
    table.boolean('has_alpha');
    table.integer('orientation');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('file_id').references('files.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_image_metadata_tenant ON image_metadata(tenant_id)');
  await knex.raw('CREATE INDEX idx_image_metadata_file ON image_metadata(file_id)');

  // ---------------------------------------------------------------------------
  // video_metadata - Video processing data
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('video_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('file_id').notNullable().unique();
    table.decimal('duration', 10, 2);
    table.integer('width');
    table.integer('height');
    table.decimal('aspect_ratio', 10, 4);
    table.string('format', 50);
    table.string('codec', 50);
    table.bigInteger('bitrate');
    table.decimal('fps', 10, 2);
    table.text('thumbnail_url');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('file_id').references('files.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_video_metadata_tenant ON video_metadata(tenant_id)');
  await knex.raw('CREATE INDEX idx_video_metadata_file ON video_metadata(file_id)');

  // ---------------------------------------------------------------------------
  // storage_quotas - Quota limits
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('storage_quotas', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').comment('FK: users.id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.bigInteger('max_storage_bytes').notNullable();
    table.integer('max_files');
    table.bigInteger('max_file_size_bytes');
    table.jsonb('limits_by_type').defaultTo('{}');
    table.integer('soft_limit_percentage').defaultTo(80);
    table.boolean('send_warnings').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'user_id', 'venue_id']);
  });

  await knex.raw('CREATE INDEX idx_storage_quotas_tenant ON storage_quotas(tenant_id)');
  await knex.raw('CREATE INDEX idx_storage_quotas_user ON storage_quotas(user_id)');
  await knex.raw('CREATE INDEX idx_storage_quotas_venue ON storage_quotas(venue_id)');

  await knex.raw(`
    ALTER TABLE storage_quotas ADD CONSTRAINT chk_positive_limits
    CHECK (max_storage_bytes > 0)
  `);

  // ---------------------------------------------------------------------------
  // storage_usage - Usage tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('storage_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').comment('FK: users.id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.bigInteger('total_storage_bytes').notNullable().defaultTo(0);
    table.integer('total_files').notNullable().defaultTo(0);
    table.jsonb('usage_by_type').defaultTo('{}');
    table.bigInteger('peak_storage_bytes').defaultTo(0);
    table.timestamp('peak_storage_at');
    table.timestamp('last_calculated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'user_id', 'venue_id']);
  });

  await knex.raw('CREATE INDEX idx_storage_usage_tenant ON storage_usage(tenant_id)');
  await knex.raw('CREATE INDEX idx_storage_usage_user ON storage_usage(user_id)');
  await knex.raw('CREATE INDEX idx_storage_usage_venue ON storage_usage(venue_id)');

  // ---------------------------------------------------------------------------
  // quota_alerts - Quota warnings
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('quota_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('quota_id').notNullable();
    table.uuid('user_id').comment('FK: users.id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('alert_type').notNullable();
    table.integer('usage_percentage').notNullable();
    table.bigInteger('current_usage_bytes').notNullable();
    table.bigInteger('quota_limit_bytes').notNullable();
    table.boolean('notification_sent').defaultTo(false);
    table.timestamp('notification_sent_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('quota_id').references('storage_quotas.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_quota_alerts_tenant ON quota_alerts(tenant_id)');
  await knex.raw('CREATE INDEX idx_quota_alerts_quota_created ON quota_alerts(quota_id, created_at)');
  await knex.raw('CREATE INDEX idx_quota_alerts_type_sent ON quota_alerts(alert_type, notification_sent)');

  // ============================================================================
  // ROW LEVEL SECURITY - 12 Tenant Tables
  // ============================================================================

  const tenantTables = [
    'files',
    'file_access_logs',
    'file_versions',
    'upload_sessions',
    'quarantined_files',
    'file_uploads',
    'file_shares',
    'image_metadata',
    'video_metadata',
    'storage_quotas',
    'storage_usage',
    'quota_alerts',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  }

  console.log('✅ File Service consolidated migration complete');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'files',
    'file_access_logs',
    'file_versions',
    'upload_sessions',
    'quarantined_files',
    'file_uploads',
    'file_shares',
    'image_metadata',
    'video_metadata',
    'storage_quotas',
    'storage_usage',
    'quota_alerts',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop trigger
  await knex.raw('DROP TRIGGER IF EXISTS trigger_files_updated_at ON files');

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('quota_alerts');
  await knex.schema.dropTableIfExists('storage_usage');
  await knex.schema.dropTableIfExists('storage_quotas');
  await knex.schema.dropTableIfExists('video_metadata');
  await knex.schema.dropTableIfExists('image_metadata');
  await knex.schema.dropTableIfExists('file_shares');
  await knex.schema.dropTableIfExists('file_uploads');
  await knex.schema.dropTableIfExists('quarantined_files');
  await knex.schema.dropTableIfExists('upload_sessions');
  await knex.schema.dropTableIfExists('file_versions');
  await knex.schema.dropTableIfExists('file_access_logs');
  await knex.schema.dropTableIfExists('files');

  // Drop global table
  await knex.schema.dropTableIfExists('av_scans');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('✅ File Service rollback complete');
}
