import { Knex } from 'knex';

/**
 * PHASE 8: LEGAL COMPLIANCE (ToS, Age Verification, Geo-Restrictions)
 * 
 * Consolidates migration 036:
 * - Terms of Service version management
 * - User TOS acceptances tracking
 * - Age verification requirements
 * - Geographic access restrictions
 * - Access violation logging
 * - Consent records (additional consents beyond GDPR)
 * 
 * Tables created: 6
 * 
 * Compliance Requirements:
 * - Terms of Service versioning
 * - Age-gated content compliance
 * - Geographic restrictions (OFAC, sanctions)
 * - Audit trail for all legal acceptances
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: TERMS OF SERVICE TABLES
  // ============================================================================
  
  // Terms of Service Versions
  await knex.schema.createTable('tos_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('version_number', 50).notNullable();
    table.string('title', 255).notNullable();
    table.text('content_url').notNullable();
    table.string('content_hash', 64).notNullable();
    table.timestamp('effective_date').notNullable();
    table.timestamp('expiry_date');
    table.boolean('requires_acceptance').defaultTo(true);
    table.integer('minimum_age').defaultTo(18);
    table.jsonb('geographic_restrictions');
    table.text('change_summary');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.unique(['tenant_id', 'version_number']);
    
    // Indexes
    table.index('tenant_id');
    table.index(['is_active', 'effective_date']);
  });

  // User TOS Acceptances
  await knex.schema.createTable('tos_acceptances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('tos_version_id').notNullable()
      .references('id').inTable('tos_versions');
    table.timestamp('accepted_at').defaultTo(knex.fn.now());
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.string('acceptance_method', 50);
    table.boolean('age_verified').defaultTo(false);
    table.integer('age_declared');
    table.string('location_country', 2);
    table.string('location_region', 100);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('tenant_id');
    table.index('user_id');
    table.index('tos_version_id');
    table.index('accepted_at');
  });

  // ============================================================================
  // SECTION 2: AGE VERIFICATION TABLES
  // ============================================================================
  
  // Age Verification Records
  await knex.schema.createTable('age_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('verification_method', 50).notNullable();
    table.date('declared_birth_date');
    table.integer('verified_age');
    table.string('verification_status', 50).defaultTo('PENDING');
    table.string('verification_provider', 100);
    table.string('verification_reference', 255);
    table.timestamp('verified_at');
    table.timestamp('expires_at');
    table.jsonb('metadata');
    table.timestamps(true, true);
    
    // Indexes
    table.index('tenant_id');
    table.index('user_id');
    table.index('verification_status');
  });

  // ============================================================================
  // SECTION 3: GEOGRAPHIC RESTRICTIONS TABLES
  // ============================================================================
  
  // Geographic Access Restrictions
  await knex.schema.createTable('geographic_restrictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('restriction_type', 50).notNullable();
    table.string('country_code', 2);
    table.string('region_code', 100);
    table.timestamp('effective_from').defaultTo(knex.fn.now());
    table.timestamp('effective_to');
    table.text('reason');
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.index('tenant_id');
    table.index(['active', 'effective_from']);
    table.index(['country_code', 'region_code']);
  });

  // Access Violation Logs
  await knex.schema.createTable('access_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id');
    table.string('violation_type', 50).notNullable();
    table.uuid('tos_version_id').references('id').inTable('tos_versions');
    table.string('attempted_action', 255);
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.string('location_country', 2);
    table.string('location_region', 100);
    table.boolean('blocked').defaultTo(true);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('tenant_id');
    table.index('user_id');
    table.index('violation_type');
    table.index('created_at');
  });

  // ============================================================================
  // SECTION 4: CONSENT RECORDS (Additional Consents)
  // ============================================================================
  
  // Consent Records (for additional consents beyond TOS)
  await knex.schema.createTable('consent_records_legal', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('consent_type', 50).notNullable();
    table.boolean('consent_given').notNullable();
    table.timestamp('consent_timestamp').defaultTo(knex.fn.now());
    table.timestamp('expiry_timestamp');
    table.timestamp('withdrawal_timestamp');
    table.specificType('ip_address', 'inet');
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamps(true, true);
    
    // Indexes
    table.index('tenant_id');
    table.index('user_id');
    table.index('consent_type');
  });

  // ============================================================================
  // SECTION 5: RLS POLICIES
  // ============================================================================
  
  await knex.raw(`
    ALTER TABLE tos_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tos_acceptances ENABLE ROW LEVEL SECURITY;
    ALTER TABLE age_verifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE geographic_restrictions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE access_violations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE consent_records_legal ENABLE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_tos_versions ON tos_versions
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_tos_acceptances ON tos_acceptances
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_age_verifications ON age_verifications
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_geographic_restrictions ON geographic_restrictions
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_access_violations ON access_violations
      USING (tenant_id::text = current_setting('app.current_tenant', true));
    
    CREATE POLICY tenant_isolation_consent_records_legal ON consent_records_legal
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  `);

  // ============================================================================
  // SECTION 6: UPDATED_AT TRIGGERS
  // ============================================================================
  
  await knex.raw(`
    CREATE TRIGGER update_tos_versions_updated_at
    BEFORE UPDATE ON tos_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_age_verifications_updated_at
    BEFORE UPDATE ON age_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_geographic_restrictions_updated_at
    BEFORE UPDATE ON geographic_restrictions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_consent_records_legal_updated_at
    BEFORE UPDATE ON consent_records_legal
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // SECTION 7: TABLE COMMENTS
  // ============================================================================
  
  await knex.raw(`
    COMMENT ON TABLE tos_versions IS 'Terms of Service version management with content hash verification';
    COMMENT ON TABLE tos_acceptances IS 'User acceptances of Terms of Service with full audit trail';
    COMMENT ON TABLE age_verifications IS 'Age verification records for age-restricted content compliance';
    COMMENT ON TABLE geographic_restrictions IS 'Geographic access restrictions (OFAC, sanctions, regional laws)';
    COMMENT ON TABLE access_violations IS 'Log of access violations (TOS, age, geo-restrictions)';
    COMMENT ON TABLE consent_records_legal IS 'Additional legal consents (cookies, marketing, data sharing)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_tos_versions_updated_at ON tos_versions');
  await knex.raw('DROP TRIGGER IF EXISTS update_age_verifications_updated_at ON age_verifications');
  await knex.raw('DROP TRIGGER IF EXISTS update_geographic_restrictions_updated_at ON geographic_restrictions');
  await knex.raw('DROP TRIGGER IF EXISTS update_consent_records_legal_updated_at ON consent_records_legal');

  // Drop RLS policies
  await knex.raw(`
    DROP POLICY IF EXISTS tenant_isolation_consent_records_legal ON consent_records_legal;
    DROP POLICY IF EXISTS tenant_isolation_access_violations ON access_violations;
    DROP POLICY IF EXISTS tenant_isolation_geographic_restrictions ON geographic_restrictions;
    DROP POLICY IF EXISTS tenant_isolation_age_verifications ON age_verifications;
    DROP POLICY IF EXISTS tenant_isolation_tos_acceptances ON tos_acceptances;
    DROP POLICY IF EXISTS tenant_isolation_tos_versions ON tos_versions;
  `);

  // Drop tables (reverse order)
  await knex.schema.dropTableIfExists('consent_records_legal');
  await knex.schema.dropTableIfExists('access_violations');
  await knex.schema.dropTableIfExists('geographic_restrictions');
  await knex.schema.dropTableIfExists('age_verifications');
  await knex.schema.dropTableIfExists('tos_acceptances');
  await knex.schema.dropTableIfExists('tos_versions');
}
