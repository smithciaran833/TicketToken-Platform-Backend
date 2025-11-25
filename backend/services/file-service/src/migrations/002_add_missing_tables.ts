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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('file_uploads');
  await knex.schema.dropTableIfExists('quarantined_files');
  await knex.schema.dropTableIfExists('av_scans');
}
