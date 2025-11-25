import { Knex } from 'knex';

/**
 * PHASE 7: PRIVACY & DATA RIGHTS (GDPR Compliance)
 * 
 * Consolidates migrations 028-030:
 * - Data access requests (028) - GDPR Article 15: Right to access
 * - Data deletion requests (029) - GDPR Article 17: Right to erasure
 * - Consent management (030) - GDPR Article 6: Lawfulness of processing
 * 
 * Tables created: 7
 * ENUM types: 7
 * 
 * Compliance Requirements:
 * - GDPR Articles 6, 15, 17
 * - 30-day data export window
 * - Audit trail for all privacy actions
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: ENUM TYPES (7 total)
  // ============================================================================
  
  // From migration 028: Data Access Requests
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE data_access_request_status AS ENUM (
        'PENDING',
        'IN_PROGRESS',
        'COMPLETED',
        'FAILED',
        'EXPIRED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE data_export_format AS ENUM (
        'JSON',
        'CSV',
        'PDF'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 029: Data Deletion Requests
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE data_deletion_status AS ENUM (
        'PENDING',
        'IN_PROGRESS',
        'COMPLETED',
        'REJECTED',
        'FAILED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE data_deletion_strategy AS ENUM (
        'HARD_DELETE',
        'SOFT_DELETE',
        'ANONYMIZE'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE deletion_action AS ENUM (
        'DELETED',
        'ANONYMIZED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // From migration 030: Consent Management
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE consent_purpose AS ENUM (
        'MARKETING',
        'ANALYTICS',
        'THIRD_PARTY_SHARING',
        'PROFILING',
        'PERSONALIZATION',
        'RESEARCH'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE consent_status AS ENUM (
        'GRANTED',
        'DENIED',
        'WITHDRAWN',
        'EXPIRED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // ============================================================================
  // SECTION 2: DATA ACCESS TABLES (Migration 028)
  // ============================================================================
  
  // Main data access requests table
  await knex.schema.createTable('data_access_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    
    // Request details
    table.string('email', 255).notNullable();
    table.specificType('status', 'data_access_request_status').notNullable().defaultTo('PENDING');
    table.specificType('format', 'data_export_format').notNullable().defaultTo('JSON');
    
    // Processing info
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('expires_at').nullable(); // 30 days from completion
    
    // Export file info
    table.string('file_path', 500).nullable();
    table.string('file_size_bytes', 50).nullable();
    table.string('download_token', 100).nullable().unique();
    table.integer('download_count').defaultTo(0);
    
    // Error tracking
    table.text('error_message').nullable();
    table.jsonb('error_details').nullable();
    
    // Metadata
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.jsonb('metadata').nullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index(['tenant_id', 'status']);
    table.index(['status', 'requested_at']);
    table.index('expires_at');
  });

  // Table to track what data was included in export
  await knex.schema.createTable('data_export_contents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('request_id').notNullable()
      .references('id').inTable('data_access_requests')
      .onDelete('CASCADE');
    
    // What data was exported
    table.string('data_category', 100).notNullable();
    table.integer('record_count').notNullable().defaultTo(0);
    table.string('table_name', 100).notNullable();
    table.jsonb('fields_included').nullable();
    
    // Size tracking
    table.string('size_bytes', 50).nullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index('request_id');
    table.index(['request_id', 'data_category']);
  });

  // Audit log for data access
  await knex.schema.createTable('data_access_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    
    // What was accessed
    table.string('action', 50).notNullable();
    table.uuid('request_id').nullable()
      .references('id').inTable('data_access_requests')
      .onDelete('SET NULL');
    
    // Access details
    table.string('resource_type', 100).nullable();
    table.uuid('resource_id').nullable();
    table.jsonb('accessed_fields').nullable();
    
    // Who and when
    table.uuid('accessed_by_user_id').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamp('accessed_at').notNullable().defaultTo(knex.fn.now());
    
    // Metadata
    table.jsonb('metadata').nullable();
    
    // Indexes
    table.index(['tenant_id', 'user_id']);
    table.index(['tenant_id', 'accessed_at']);
    table.index(['user_id', 'accessed_at']);
    table.index('request_id');
  });

  // ============================================================================
  // SECTION 3: DATA DELETION TABLES (Migration 029)
  // ============================================================================
  
  // Data deletion requests table
  await knex.schema.createTable('data_deletion_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('email').notNullable();
    table.specificType('status', 'data_deletion_status').notNullable().defaultTo('PENDING');
    table.specificType('strategy', 'data_deletion_strategy').notNullable().defaultTo('ANONYMIZE');
    table.text('reason');
    table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.text('rejected_reason');
    table.specificType('tables_affected', 'text[]');
    table.integer('records_deleted').defaultTo(0);
    table.integer('records_anonymized').defaultTo(0);
    table.specificType('retention_exceptions', 'text[]');
    table.string('ip_address');
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['user_id', 'tenant_id']);
    table.index('status');
    table.index('requested_at');
  });

  // Deletion audit log table
  await knex.schema.createTable('deletion_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('request_id').notNullable()
      .references('id').inTable('data_deletion_requests')
      .onDelete('CASCADE');
    table.string('table_name').notNullable();
    table.string('record_id').notNullable();
    table.specificType('action', 'deletion_action').notNullable();
    table.jsonb('original_data');
    table.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());
    table.string('performed_by_user_id');

    // Indexes
    table.index('request_id');
    table.index(['table_name', 'record_id']);
    table.index('performed_at');
  });

  // ============================================================================
  // SECTION 4: CONSENT MANAGEMENT TABLES (Migration 030)
  // ============================================================================
  
  // Consent records table
  await knex.schema.createTable('consent_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.specificType('purpose', 'consent_purpose').notNullable();
    table.specificType('status', 'consent_status').notNullable();
    table.timestamp('granted_at');
    table.timestamp('denied_at');
    table.timestamp('withdrawn_at');
    table.timestamp('expires_at');
    table.integer('version').notNullable().defaultTo(1);
    table.string('ip_address');
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['user_id', 'tenant_id']);
    table.index(['user_id', 'purpose']);
    table.index('status');
    table.unique(['user_id', 'tenant_id', 'purpose', 'version']);
  });

  // Consent audit log table
  await knex.schema.createTable('consent_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consent_id').notNullable()
      .references('id').inTable('consent_records')
      .onDelete('CASCADE');
    table.specificType('action', 'consent_status').notNullable();
    table.specificType('previous_status', 'consent_status');
    table.specificType('new_status', 'consent_status').notNullable();
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
    table.string('ip_address');
    table.text('user_agent');
    table.jsonb('metadata');

    // Indexes
    table.index('consent_id');
    table.index('changed_at');
  });

  // ============================================================================
  // SECTION 5: RLS POLICIES
  // ============================================================================
  
  await knex.raw(`
    ALTER TABLE data_access_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE data_export_contents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE data_access_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE deletion_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_data_access_requests ON data_access_requests
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_data_export_contents ON data_export_contents
      USING (
        request_id IN (
          SELECT id FROM data_access_requests 
          WHERE tenant_id::text = current_setting('app.current_tenant', true)
        )
      );
    
    CREATE POLICY tenant_isolation_data_access_audit_log ON data_access_audit_log
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_data_deletion_requests ON data_deletion_requests
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_deletion_audit_log ON deletion_audit_log
      USING (
        request_id IN (
          SELECT id FROM data_deletion_requests 
          WHERE tenant_id::text = current_setting('app.current_tenant', true)
        )
      );
    
    CREATE POLICY tenant_isolation_consent_records ON consent_records
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_consent_audit_log ON consent_audit_log
      USING (
        consent_id IN (
          SELECT id FROM consent_records 
          WHERE tenant_id::text = current_setting('app.current_tenant', true)
        )
      );
  `);

  // ============================================================================
  // SECTION 6: TABLE COMMENTS
  // ============================================================================
  
  await knex.raw(`
    COMMENT ON TABLE data_access_requests IS 'GDPR Article 15 - Right to access personal data requests';
    COMMENT ON TABLE data_export_contents IS 'Tracks what data categories were included in each export';
    COMMENT ON TABLE data_access_audit_log IS 'Immutable audit log of all data access events for compliance';
    COMMENT ON TABLE data_deletion_requests IS 'GDPR Article 17 - Right to erasure (right to be forgotten)';
    COMMENT ON TABLE deletion_audit_log IS 'Immutable audit trail of all deletion/anonymization operations';
    COMMENT ON TABLE consent_records IS 'GDPR Article 6 - Consent tracking for lawful processing';
    COMMENT ON TABLE consent_audit_log IS 'Audit trail of all consent changes';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw(`
    DROP POLICY IF EXISTS tenant_isolation_consent_audit_log ON consent_audit_log;
    DROP POLICY IF EXISTS tenant_isolation_consent_records ON consent_records;
    DROP POLICY IF EXISTS tenant_isolation_deletion_audit_log ON deletion_audit_log;
    DROP POLICY IF EXISTS tenant_isolation_data_deletion_requests ON data_deletion_requests;
    DROP POLICY IF EXISTS tenant_isolation_data_access_audit_log ON data_access_audit_log;
    DROP POLICY IF EXISTS tenant_isolation_data_export_contents ON data_export_contents;
    DROP POLICY IF EXISTS tenant_isolation_data_access_requests ON data_access_requests;
  `);

  // Drop tables (reverse order)
  await knex.schema.dropTableIfExists('consent_audit_log');
  await knex.schema.dropTableIfExists('consent_records');
  await knex.schema.dropTableIfExists('deletion_audit_log');
  await knex.schema.dropTableIfExists('data_deletion_requests');
  await knex.schema.dropTableIfExists('data_access_audit_log');
  await knex.schema.dropTableIfExists('data_export_contents');
  await knex.schema.dropTableIfExists('data_access_requests');

  // Drop ENUMs
  await knex.raw('DROP TYPE IF EXISTS consent_status');
  await knex.raw('DROP TYPE IF EXISTS consent_purpose');
  await knex.raw('DROP TYPE IF EXISTS deletion_action');
  await knex.raw('DROP TYPE IF EXISTS data_deletion_strategy');
  await knex.raw('DROP TYPE IF EXISTS data_deletion_status');
  await knex.raw('DROP TYPE IF EXISTS data_export_format');
  await knex.raw('DROP TYPE IF EXISTS data_access_request_status');
}
