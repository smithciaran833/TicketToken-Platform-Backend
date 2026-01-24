import { Knex } from 'knex';

/**
 * Blockchain Service - Custodial Wallet Infrastructure
 *
 * Phase 1: Custodial Wallet Foundation
 *
 * Tables added:
 *   - custodial_wallets: User custodial wallet mappings
 *   - wallet_private_keys: KMS-encrypted private key storage
 *   - nft_transfers: NFT transfer tracking between wallets
 *
 * Security:
 *   - Private keys encrypted using AWS KMS envelope encryption
 *   - RLS enforced on all tenant-scoped tables
 *   - Audit columns for key operations
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // ENUM TYPES
  // ==========================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE wallet_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION', 'LOCKED', 'ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE wallet_type AS ENUM ('CUSTODIAL', 'EXTERNAL', 'TREASURY', 'ESCROW');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE nft_transfer_status AS ENUM ('PENDING', 'PROCESSING', 'CONFIRMED', 'FINALIZED', 'FAILED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE nft_transfer_type AS ENUM ('MINT_TO_USER', 'USER_TO_USER', 'USER_TO_MARKETPLACE', 'MARKETPLACE_TO_USER', 'BURN');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // ==========================================================================
  // 1. CUSTODIAL_WALLETS - User custodial wallet mappings
  // ==========================================================================

  await knex.schema.createTable('custodial_wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();

    // Wallet details
    table.string('wallet_address', 44).notNullable(); // Solana address (base58)
    table.specificType('wallet_type', 'wallet_type').notNullable().defaultTo('CUSTODIAL');
    table.string('blockchain_type', 50).notNullable().defaultTo('SOLANA');
    table.string('network', 50).notNullable().defaultTo('devnet'); // devnet, mainnet-beta

    // Status
    table.specificType('status', 'wallet_status').notNullable().defaultTo('ACTIVE');
    table.string('status_reason', 500);
    table.timestamp('status_changed_at', { useTz: true });

    // Balance tracking
    table.decimal('sol_balance', 20, 9).defaultTo(0);
    table.timestamp('last_balance_sync', { useTz: true });

    // KMS reference
    table.string('kms_key_arn', 512).notNullable();
    table.string('kms_key_id', 255).notNullable();
    table.integer('key_version').notNullable().defaultTo(1);

    // Metadata
    table.jsonb('metadata').defaultTo('{}');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
    table.uuid('deleted_by');

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN custodial_wallets.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service reference'`);

  // Indexes
  await knex.raw(`CREATE UNIQUE INDEX idx_custodial_wallets_user_tenant_active ON custodial_wallets (user_id, tenant_id) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE UNIQUE INDEX idx_custodial_wallets_address ON custodial_wallets (wallet_address) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE INDEX idx_custodial_wallets_user_id ON custodial_wallets (user_id)`);
  await knex.raw(`CREATE INDEX idx_custodial_wallets_tenant_id ON custodial_wallets (tenant_id)`);
  await knex.raw(`CREATE INDEX idx_custodial_wallets_status ON custodial_wallets (status)`);
  await knex.raw(`CREATE INDEX idx_custodial_wallets_blockchain ON custodial_wallets (blockchain_type, network)`);
  await knex.raw(`CREATE INDEX idx_custodial_wallets_deleted ON custodial_wallets (deleted_at) WHERE deleted_at IS NOT NULL`);

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE custodial_wallets
    ADD CONSTRAINT chk_custodial_wallets_address_length
    CHECK (length(wallet_address) BETWEEN 32 AND 44)
  `);
  await knex.raw(`
    ALTER TABLE custodial_wallets
    ADD CONSTRAINT chk_custodial_wallets_balance_non_negative
    CHECK (sol_balance >= 0)
  `);

  // ==========================================================================
  // 2. WALLET_PRIVATE_KEYS - KMS-encrypted private key storage
  // ==========================================================================

  await knex.schema.createTable('wallet_private_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('wallet_id').notNullable().references('id').inTable('custodial_wallets').onDelete('CASCADE');
    table.uuid('tenant_id').notNullable();

    // KMS encryption details
    table.string('kms_key_arn', 512).notNullable();
    table.string('kms_key_id', 255).notNullable();

    // Encrypted key data (base64 encoded)
    table.text('encrypted_private_key').notNullable();
    table.text('encrypted_data_key').notNullable();
    table.string('iv', 32).notNullable(); // 12 bytes base64 = 16 chars, allow extra
    table.integer('key_version').notNullable().defaultTo(1);

    // Key metadata (NOT encrypted - safe metadata only)
    table.jsonb('key_metadata').defaultTo('{}'); // algorithm, created_at, etc.

    // Audit
    table.timestamp('last_accessed_at', { useTz: true });
    table.integer('access_count').defaultTo(0);
    table.string('last_accessed_by', 255);
    table.string('last_accessed_reason', 500);

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  // Indexes
  await knex.raw(`CREATE UNIQUE INDEX idx_wallet_private_keys_wallet_active ON wallet_private_keys (wallet_id) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE INDEX idx_wallet_private_keys_tenant ON wallet_private_keys (tenant_id)`);
  await knex.raw(`CREATE INDEX idx_wallet_private_keys_kms_key ON wallet_private_keys (kms_key_id)`);
  await knex.raw(`CREATE INDEX idx_wallet_private_keys_version ON wallet_private_keys (wallet_id, key_version)`);

  // ==========================================================================
  // 3. NFT_TRANSFERS - NFT transfer tracking
  // ==========================================================================

  await knex.schema.createTable('nft_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();

    // Ticket/NFT reference
    table.uuid('ticket_id').notNullable();
    table.string('nft_address', 44); // May be null before mint completes

    // Transfer parties
    table.uuid('from_wallet_id').references('id').inTable('custodial_wallets').onDelete('SET NULL');
    table.uuid('to_wallet_id').references('id').inTable('custodial_wallets').onDelete('SET NULL');
    table.string('from_wallet_address', 44);
    table.string('to_wallet_address', 44).notNullable();

    // Transfer details
    table.specificType('transfer_type', 'nft_transfer_type').notNullable();
    table.specificType('status', 'nft_transfer_status').notNullable().defaultTo('PENDING');

    // Blockchain transaction
    table.string('transaction_signature', 128);
    table.bigInteger('slot_number');
    table.timestamp('confirmed_at', { useTz: true });
    table.timestamp('finalized_at', { useTz: true });

    // Error handling
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('last_retry_at', { useTz: true });

    // Metadata
    table.jsonb('metadata').defaultTo('{}');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Internal FK
    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  // External FK comment
  await knex.raw(`COMMENT ON COLUMN nft_transfers.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service reference'`);

  // Indexes
  await knex.raw(`CREATE INDEX idx_nft_transfers_tenant ON nft_transfers (tenant_id)`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_ticket ON nft_transfers (ticket_id)`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_nft_address ON nft_transfers (nft_address) WHERE nft_address IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_from_wallet ON nft_transfers (from_wallet_id) WHERE from_wallet_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_to_wallet ON nft_transfers (to_wallet_id) WHERE to_wallet_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_status ON nft_transfers (status)`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_type_status ON nft_transfers (transfer_type, status)`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_tx_sig ON nft_transfers (transaction_signature) WHERE transaction_signature IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_pending ON nft_transfers (created_at) WHERE status = 'PENDING'`);
  await knex.raw(`CREATE INDEX idx_nft_transfers_failed ON nft_transfers (status, retry_count) WHERE status = 'FAILED' AND retry_count < 3`);

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE nft_transfers
    ADD CONSTRAINT chk_nft_transfers_signature_length
    CHECK (transaction_signature IS NULL OR length(transaction_signature) BETWEEN 64 AND 128)
  `);
  await knex.raw(`
    ALTER TABLE nft_transfers
    ADD CONSTRAINT chk_nft_transfers_retry_count
    CHECK (retry_count >= 0 AND retry_count <= 10)
  `);
  await knex.raw(`
    ALTER TABLE nft_transfers
    ADD CONSTRAINT chk_nft_transfers_slot_non_negative
    CHECK (slot_number IS NULL OR slot_number >= 0)
  `);

  // ==========================================================================
  // 4. TREASURY_MONITORING_LOGS - Treasury balance monitoring
  // ==========================================================================

  await knex.schema.createTable('treasury_monitoring_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('treasury_wallet_id').references('id').inTable('treasury_wallets').onDelete('CASCADE');

    // Balance snapshot
    table.decimal('balance_sol', 20, 9).notNullable();
    table.decimal('previous_balance_sol', 20, 9);
    table.decimal('alert_threshold_sol', 20, 9);

    // Alert status
    table.boolean('is_below_threshold').notNullable().defaultTo(false);
    table.boolean('alert_sent').defaultTo(false);
    table.timestamp('alert_sent_at', { useTz: true });
    table.string('alert_type', 50); // 'low_balance', 'critical', 'recovered'

    // Timestamps
    table.timestamp('checked_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_treasury_monitoring_wallet ON treasury_monitoring_logs (treasury_wallet_id)`);
  await knex.raw(`CREATE INDEX idx_treasury_monitoring_alert ON treasury_monitoring_logs (is_below_threshold, alert_sent)`);
  await knex.raw(`CREATE INDEX idx_treasury_monitoring_time ON treasury_monitoring_logs (checked_at DESC)`);

  // ==========================================================================
  // ROW LEVEL SECURITY
  // ==========================================================================

  const tenantTables = [
    'custodial_wallets',
    'wallet_private_keys',
    'nft_transfers'
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

  // ==========================================================================
  // UPDATED_AT TRIGGER
  // ==========================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const tableName of ['custodial_wallets', 'wallet_private_keys', 'nft_transfers']) {
    await knex.raw(`
      CREATE TRIGGER trigger_${tableName}_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  // ==========================================================================
  // AUDIT TRIGGER FOR PRIVATE KEY ACCESS
  // ==========================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_private_key_access()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Log access to private keys
      IF TG_OP = 'UPDATE' AND NEW.last_accessed_at IS DISTINCT FROM OLD.last_accessed_at THEN
        INSERT INTO blockchain_tenant_audit (table_name, operation, record_id, tenant_id)
        VALUES ('wallet_private_keys', 'KEY_ACCESS', NEW.id, NEW.tenant_id);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_audit_private_key_access
    AFTER UPDATE ON wallet_private_keys
    FOR EACH ROW
    EXECUTE FUNCTION audit_private_key_access()
  `);

  // ==========================================================================
  // COMPLETION
  // ==========================================================================

  console.log('✅ Custodial wallet infrastructure migration complete');
  console.log('📊 Tables created: custodial_wallets, wallet_private_keys, nft_transfers, treasury_monitoring_logs');
  console.log('🔒 RLS enabled on 3 tenant tables');
  console.log('🔑 Private key access audit trigger installed');
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw(`DROP TRIGGER IF EXISTS trigger_audit_private_key_access ON wallet_private_keys`);
  await knex.raw(`DROP FUNCTION IF EXISTS audit_private_key_access()`);

  for (const tableName of ['custodial_wallets', 'wallet_private_keys', 'nft_transfers']) {
    await knex.raw(`DROP TRIGGER IF EXISTS trigger_${tableName}_updated_at ON ${tableName}`);
  }

  // Drop RLS policies
  const tenantTables = ['nft_transfers', 'wallet_private_keys', 'custodial_wallets'];
  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('treasury_monitoring_logs');
  await knex.schema.dropTableIfExists('nft_transfers');
  await knex.schema.dropTableIfExists('wallet_private_keys');
  await knex.schema.dropTableIfExists('custodial_wallets');

  // Drop enum types
  await knex.raw('DROP TYPE IF EXISTS nft_transfer_type');
  await knex.raw('DROP TYPE IF EXISTS nft_transfer_status');
  await knex.raw('DROP TYPE IF EXISTS wallet_type');
  await knex.raw('DROP TYPE IF EXISTS wallet_status');

  console.log('✅ Custodial wallet infrastructure migration rolled back');
}
