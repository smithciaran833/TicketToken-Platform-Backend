import { Knex } from 'knex';

/**
 * Minting Service - Consolidated Baseline Migration
 *
 * CONSOLIDATION INFO:
 * - Source files: 6 migrations archived in ./archived/
 * - Total tables: 6 (5 tenant-scoped, 1 global audit)
 * - Generated: 2025-01-13 (Updated)
 *
 * TABLES:
 *   Tenant-scoped (5): collections, nft_mints, nfts, ticket_mints, minting_reconciliation_reports
 *   Global (1): nft_mints_audit
 *
 * FIXES APPLIED:
 * - Removed zero UUID default on tenant_id (security hole)
 * - Standardized RLS pattern with app.current_tenant_id + app.is_system_user
 * - Added FORCE ROW LEVEL SECURITY to all tenant tables
 * - Added WITH CHECK clause to all RLS policies
 * - External FKs converted to comments (cross-service)
 * - Added missing columns to nft_mints (mint_address, asset_id, metadata_uri, merkle_tree, owner_address, updated_at)
 * - Renamed transaction_hash → transaction_signature
 * - Renamed error → error_message
 * - Added nft_mints_audit table + trigger
 * - Added 8 CHECK constraints on nft_mints
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

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
    CREATE OR REPLACE FUNCTION nft_mints_audit_trigger()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, new_data)
        VALUES ('INSERT', NEW.id, NEW.tenant_id, to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, old_data, new_data)
        VALUES ('UPDATE', NEW.id, NEW.tenant_id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO nft_mints_audit (operation, mint_id, tenant_id, old_data)
        VALUES ('DELETE', OLD.id, OLD.tenant_id, to_jsonb(OLD));
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ============================================================================
  // TABLE 1: collections
  // ============================================================================

  await knex.schema.createTable('collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.string('symbol', 50).notNullable();
    table.string('contract_address', 255).notNullable().unique();
    table.string('blockchain', 50).notNullable();
    table.integer('max_supply').nullable();
    table.integer('current_supply').defaultTo(0);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('contract_address', 'idx_collections_contract_address');
    table.index('blockchain', 'idx_collections_blockchain');
    table.index('tenant_id', 'idx_collections_tenant_id');
    table.index(['tenant_id', 'contract_address'], 'idx_collections_tenant_contract');
  });

  await knex.raw(`
    CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TABLE 2: nft_mints (UPDATED - added missing columns)
  // ============================================================================

  await knex.schema.createTable('nft_mints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('nft_id').nullable();
    table.string('transaction_signature', 255).nullable();
    table.string('mint_address', 255).nullable();
    table.string('asset_id', 255).nullable();
    table.text('metadata_uri').nullable();
    table.string('merkle_tree', 255).nullable();
    table.string('owner_address', 255).nullable();
    table.string('blockchain', 50).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('retry_count').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();

    table.unique(['ticket_id', 'tenant_id'], 'uq_nft_mints_ticket_tenant');

    table.index('ticket_id', 'idx_nft_mints_ticket_id');
    table.index('nft_id', 'idx_nft_mints_nft_id');
    table.index('status', 'idx_nft_mints_status');
    table.index('transaction_signature', 'idx_nft_mints_transaction_signature');
    table.index('created_at', 'idx_nft_mints_created_at');
    table.index('tenant_id', 'idx_nft_mints_tenant_id');
    table.index(['tenant_id', 'ticket_id'], 'idx_nft_mints_tenant_ticket');
  });

  // External FK comment: ticket_id → ticket-service.tickets(id)
  await knex.raw(`COMMENT ON COLUMN nft_mints.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // Partial index for asset_id lookups
  await knex.raw(`
    CREATE INDEX idx_nft_mints_asset_id
    ON nft_mints (asset_id)
    WHERE asset_id IS NOT NULL
  `);

  // CHECK constraints on nft_mints
  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_status
    CHECK (status IN ('pending', 'minting', 'completed', 'failed', 'cancelled'))
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_retry_count
    CHECK (retry_count >= 0 AND retry_count <= 10)
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_blockchain
    CHECK (blockchain IN ('solana', 'solana-devnet', 'solana-testnet'))
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_mint_address_length
    CHECK (mint_address IS NULL OR (LENGTH(mint_address) >= 32 AND LENGTH(mint_address) <= 64))
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_signature_length
    CHECK (transaction_signature IS NULL OR (LENGTH(transaction_signature) >= 64 AND LENGTH(transaction_signature) <= 128))
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_metadata_uri_format
    CHECK (metadata_uri IS NULL OR metadata_uri ~ '^(https?://|ipfs://|ar://)')
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_completed_at
    CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status != 'completed'))
  `);

  await knex.raw(`
    ALTER TABLE nft_mints ADD CONSTRAINT ck_nft_mints_timestamps
    CHECK (created_at <= updated_at)
  `);

  // Triggers for nft_mints
  await knex.raw(`
    CREATE TRIGGER update_nft_mints_updated_at
    BEFORE UPDATE ON nft_mints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TABLE 3: nfts
  // ============================================================================

  await knex.schema.createTable('nfts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('token_id', 255).notNullable();
    table.string('contract_address', 255).notNullable();
    table.string('owner_address', 255).notNullable();
    table.text('metadata_uri').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.string('blockchain', 50).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['token_id', 'contract_address'], 'uq_nfts_token_contract');

    table.index(['token_id', 'contract_address'], 'idx_nfts_token_contract');
    table.index('owner_address', 'idx_nfts_owner_address');
    table.index('blockchain', 'idx_nfts_blockchain');
    table.index('tenant_id', 'idx_nfts_tenant_id');
    table.index(['tenant_id', 'owner_address'], 'idx_nfts_tenant_owner');
  });

  await knex.raw(`
    CREATE TRIGGER update_nfts_updated_at
    BEFORE UPDATE ON nfts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TABLE 4: ticket_mints
  // ============================================================================

  await knex.schema.createTable('ticket_mints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('transaction_signature', 255).nullable();
    table.integer('mint_duration').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('ticket_id', 'idx_ticket_mints_ticket_id');
    table.index('venue_id', 'idx_ticket_mints_venue_id');
    table.index('status', 'idx_ticket_mints_status');
    table.index('tenant_id', 'idx_ticket_mints_tenant_id');
    table.index(['tenant_id', 'ticket_id'], 'idx_ticket_mints_tenant_ticket');
    table.index(['venue_id', 'status'], 'idx_ticket_mints_venue_status');
  });

  // External FK comments
  await knex.raw(`COMMENT ON COLUMN ticket_mints.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);
  await knex.raw(`COMMENT ON COLUMN ticket_mints.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service reference'`);

  await knex.raw(`
    ALTER TABLE ticket_mints ADD CONSTRAINT ck_ticket_mints_status
    CHECK (status IN ('pending', 'minting', 'minted', 'failed'))
  `);

  await knex.raw(`
    CREATE TRIGGER update_ticket_mints_updated_at
    BEFORE UPDATE ON ticket_mints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TABLE 5: minting_reconciliation_reports
  // ============================================================================

  await knex.schema.createTable('minting_reconciliation_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.timestamp('report_date', { useTz: true }).notNullable();
    table.integer('total_checked').defaultTo(0);
    table.integer('confirmed').defaultTo(0);
    table.integer('not_found').defaultTo(0);
    table.integer('pending').defaultTo(0);
    table.integer('errors').defaultTo(0);
    table.integer('discrepancy_count').defaultTo(0);
    table.decimal('discrepancy_rate', 5, 2).defaultTo(0);
    table.jsonb('report_data').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('venue_id', 'idx_minting_reconciliation_reports_venue_id');
    table.index('report_date', 'idx_minting_reconciliation_reports_report_date');
    table.index('tenant_id', 'idx_minting_reconciliation_reports_tenant_id');
    table.index(['tenant_id', 'venue_id'], 'idx_minting_reconciliation_reports_tenant_venue');
    table.index(['venue_id', 'report_date'], 'idx_minting_reconciliation_reports_venue_date');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN minting_reconciliation_reports.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service reference'`);

  // ============================================================================
  // TABLE 6: nft_mints_audit (GLOBAL - No RLS)
  // ============================================================================

  await knex.schema.createTable('nft_mints_audit', (table) => {
    table.increments('id').primary();
    table.string('operation', 10).notNullable();
    table.uuid('mint_id');
    table.string('tenant_id', 255);
    table.jsonb('old_data');
    table.jsonb('new_data');
    table.text('changed_by').defaultTo(knex.raw('current_user'));
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.text('session_tenant').defaultTo(knex.raw("current_setting('app.current_tenant_id', true)"));
  });

  await knex.raw(`CREATE INDEX idx_nft_mints_audit_mint_id ON nft_mints_audit(mint_id)`);
  await knex.raw(`CREATE INDEX idx_nft_mints_audit_tenant_id ON nft_mints_audit(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_nft_mints_audit_changed_at ON nft_mints_audit(changed_at)`);
  await knex.raw(`COMMENT ON TABLE nft_mints_audit IS 'Audit log for nft_mints operations - no RLS, global table'`);

  // Audit trigger on nft_mints
  await knex.raw(`
    CREATE TRIGGER nft_mints_audit
    AFTER INSERT OR UPDATE OR DELETE ON nft_mints
    FOR EACH ROW EXECUTE FUNCTION nft_mints_audit_trigger();
  `);

  // ============================================================================
  // ROW LEVEL SECURITY (5 Tenant Tables)
  // ============================================================================

  const tenantTables = [
    'collections',
    'nft_mints',
    'nfts',
    'ticket_mints',
    'minting_reconciliation_reports',
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
        );
    `);
  }

  console.log('✅ RLS policies created for all tenant tables');
  console.log('✅ Minting service consolidated migration complete!');
  console.log('📊 Tables created: 6 (5 tenant-scoped, 1 global audit)');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back minting service migration...');

  // Drop RLS policies first
  const tenantTables = [
    'minting_reconciliation_reports',
    'ticket_mints',
    'nfts',
    'nft_mints',
    'collections',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS nft_mints_audit ON nft_mints');
  await knex.raw('DROP TRIGGER IF EXISTS update_nft_mints_updated_at ON nft_mints');
  await knex.raw('DROP TRIGGER IF EXISTS update_ticket_mints_updated_at ON ticket_mints');
  await knex.raw('DROP TRIGGER IF EXISTS update_nfts_updated_at ON nfts');
  await knex.raw('DROP TRIGGER IF EXISTS update_collections_updated_at ON collections');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('nft_mints_audit');
  await knex.schema.dropTableIfExists('minting_reconciliation_reports');
  await knex.schema.dropTableIfExists('ticket_mints');
  await knex.schema.dropTableIfExists('nfts');
  await knex.schema.dropTableIfExists('nft_mints');
  await knex.schema.dropTableIfExists('collections');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS nft_mints_audit_trigger()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('✅ Minting service migration rolled back');
}
