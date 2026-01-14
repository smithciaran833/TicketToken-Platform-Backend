import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. FILES TABLE
  await knex.schema.createTable('files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
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
    table.uuid('uploaded_by');
    table.string('entity_type', 100);
    table.uuid('entity_id');
    table.boolean('is_public').defaultTo(false);
    table.string('access_level', 50).defaultTo('private');
    table.string('status', 50).defaultTo('uploading');
    table.text('processing_error');
    table.jsonb('metadata').defaultTo('{}');
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at');

    // Indexes
    table.index('uploaded_by');
    table.index(['entity_type', 'entity_id']);
    table.index('status');
    table.index('hash_sha256');
    table.index('created_at');
  });

  // 2. FILE_ACCESS_LOGS TABLE
  await knex.schema.createTable('file_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').notNullable();
    table.uuid('accessed_by');
    table.string('access_type', 50).notNullable(); // view, download, share, stream
    table.string('ip_address', 45);
    table.text('user_agent');
    table.integer('response_code');
    table.bigInteger('bytes_sent');
    table.timestamp('accessed_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('file_id').references('id').inTable('files').onDelete('CASCADE');

    // Indexes
    table.index('file_id');
    table.index('accessed_by');
    table.index('accessed_at');
  });

  // 3. FILE_VERSIONS TABLE
  await knex.schema.createTable('file_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('file_id').notNullable();
    table.integer('version_number').notNullable();
    table.text('storage_path').notNullable();
    table.bigInteger('size_bytes').notNullable();
    table.string('hash_sha256', 64);
    table.text('change_description');
    table.uuid('created_by');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('file_id').references('id').inTable('files').onDelete('CASCADE');

    // Indexes
    table.index('file_id');
    table.index(['file_id', 'version_number']);
    table.unique(['file_id', 'version_number']);
  });

  // 4. UPLOAD_SESSIONS TABLE
  await knex.schema.createTable('upload_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('session_token').notNullable().unique();
    table.uuid('uploaded_by');
    table.string('filename', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.bigInteger('total_size').notNullable();
    table.integer('total_chunks').notNullable();
    table.integer('uploaded_chunks').defaultTo(0);
    table.bigInteger('uploaded_bytes').defaultTo(0);
    table.string('status', 50).defaultTo('active'); // active, completed, cancelled
    table.timestamp('expires_at').notNullable();
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('session_token');
    table.index('uploaded_by');
    table.index('status');
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('upload_sessions');
  await knex.schema.dropTableIfExists('file_versions');
  await knex.schema.dropTableIfExists('file_access_logs');
  await knex.schema.dropTableIfExists('files');
}
