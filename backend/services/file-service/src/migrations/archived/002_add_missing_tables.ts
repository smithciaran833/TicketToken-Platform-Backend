import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. AV_SCANS TABLE
  // Referenced in src/services/antivirus.service.ts:147-155
  await knex.schema.createTable('av_scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('file_hash', 64).notNullable();
    table.boolean('clean').notNullable();
    table.jsonb('threats').defaultTo('[]');
    table.timestamp('scanned_at').notNullable();
    table.string('scan_engine', 50).notNullable(); // ClamAV, MockScanner, etc.
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('file_hash');
    table.index('scanned_at');
    table.index('clean');
    
    // Ensure one scan result per file hash (latest scan wins)
    table.unique('file_hash');
  });

  // 2. QUARANTINED_FILES TABLE
  // Referenced in src/services/antivirus.service.ts:180-187
  await knex.schema.createTable('quarantined_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('original_path').notNullable();
    table.text('quarantine_path').notNullable();
    table.string('file_hash', 64).notNullable();
    table.jsonb('threats').notNullable();
    table.timestamp('quarantined_at').defaultTo(knex.fn.now());
    table.timestamp('restored_at'); // If file was restored after false positive
    table.timestamp('deleted_at'); // Soft delete for permanent removal

    // Indexes
    table.index('file_hash');
    table.index('quarantined_at');
    table.index('deleted_at');
  });

  // 3. FILE_UPLOADS TABLE
  // Referenced in src/controllers/upload.controller.ts:55, 76, 102
  await knex.schema.createTable('file_uploads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.text('file_key').notNullable();
    table.string('file_name', 255).notNullable();
    table.string('content_type', 100).notNullable();
    table.bigInteger('size_bytes');
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processing, completed, failed
    table.text('processing_error');
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');

    // Indexes
    table.index('user_id');
    table.index('status');
    table.index('expires_at');
    table.index('file_key');
    table.index('created_at');
  });

  // 4. FILE_SHARES TABLE
  // Referenced in src/middleware/file-ownership.middleware.ts
  await knex.schema.createTable('file_shares', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').notNullable();
    table.uuid('shared_with_user_id').notNullable();
    table.uuid('shared_by_user_id');
    table.string('permission_level', 50).defaultTo('view'); // view, download, edit
    table.timestamp('expires_at'); // NULL means no expiration
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('file_id');
    table.index('shared_with_user_id');
    table.index('expires_at');
    table.index(['file_id', 'shared_with_user_id']);
    table.index('tenant_id');
  });

  // 5. IMAGE_METADATA TABLE
  // Referenced in src/processors/image/image.processor.ts
  await knex.schema.createTable('image_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').notNullable().unique();
    table.integer('width').notNullable();
    table.integer('height').notNullable();
    table.decimal('aspect_ratio', 10, 4);
    table.string('format', 50);
    table.text('thumbnail_small_url');
    table.text('thumbnail_medium_url');
    table.text('thumbnail_large_url');
    table.string('space', 50); // color space
    table.integer('channels');
    table.string('depth', 50);
    table.integer('density');
    table.boolean('has_alpha');
    table.integer('orientation');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('file_id');
    table.index('tenant_id');
  });

  // 6. VIDEO_METADATA TABLE
  // Referenced in src/controllers/video.controller.ts
  await knex.schema.createTable('video_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').notNullable().unique();
    table.decimal('duration', 10, 2); // duration in seconds
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

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('file_id');
    table.index('tenant_id');
  });

  // Add RLS policies
  await knex.raw('ALTER TABLE file_shares ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE image_metadata ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY');

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON file_shares
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON image_metadata
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON video_metadata
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  // Add foreign key constraints
  await knex.schema.alterTable('file_shares', (table) => {
    table.foreign('file_id').references('id').inTable('files').onDelete('CASCADE');
  });

  await knex.schema.alterTable('image_metadata', (table) => {
    table.foreign('file_id').references('id').inTable('files').onDelete('CASCADE');
  });

  await knex.schema.alterTable('video_metadata', (table) => {
    table.foreign('file_id').references('id').inTable('files').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON video_metadata');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON image_metadata');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON file_shares');

  // Disable RLS
  await knex.raw('ALTER TABLE video_metadata DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE image_metadata DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE file_shares DISABLE ROW LEVEL SECURITY');

  // Drop tables (reverse order of creation)
  await knex.schema.dropTableIfExists('video_metadata');
  await knex.schema.dropTableIfExists('image_metadata');
  await knex.schema.dropTableIfExists('file_shares');
  await knex.schema.dropTableIfExists('file_uploads');
  await knex.schema.dropTableIfExists('quarantined_files');
  await knex.schema.dropTableIfExists('av_scans');
}
