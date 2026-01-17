import { Knex } from 'knex';

/**
 * Payment Service - Consolidated Baseline Migration
 * 
 * CONSOLIDATION INFO:
 * - Source files: 7 migrations (001-007) archived in ./archived/
 * - Total tables: 72 (4 global, 68 tenant-scoped)
 * - Generated: 2025-01-13
 * 
 * FIXES APPLIED:
 * - Merged venue_balances schema from 001 + 005
 * - Added tenant_id to all tenant-scoped tables
 * - Standardized RLS pattern with app.current_tenant_id + app.is_system_user
 * - Removed zero UUID fallback (strict NULLIF pattern)
 * - Fixed wrong table names in CHECK constraints
 * - Added missing updated_at triggers
 * - Deduped indexes
 * - Removed non-existent outbox table reference
 * - External FKs kept as comments only
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
    CREATE OR REPLACE FUNCTION validate_payment_state_transition(
      current_state VARCHAR(50),
      new_state VARCHAR(50),
      p_event_type VARCHAR(100)
    ) RETURNS BOOLEAN AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM payment_state_machine
        WHERE from_state = current_state
          AND to_state = new_state
          AND event_type = p_event_type
          AND is_valid = true
      );
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_next_sequence_number(p_payment_id UUID)
    RETURNS BIGINT AS $$
    DECLARE
      next_seq BIGINT;
    BEGIN
      UPDATE payment_intents
      SET last_sequence_number = last_sequence_number + 1
      WHERE id = p_payment_id
      RETURNING last_sequence_number INTO next_seq;

      IF next_seq IS NULL THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
      END IF;

      RETURN next_seq;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_user_total_spent()
    RETURNS TRIGGER AS $$
    BEGIN
      IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'completed' AND NEW.deleted_at IS NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          UPDATE users
          SET
            total_spent = total_spent + NEW.amount,
            lifetime_value = lifetime_value + NEW.amount,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.user_id;
        END IF;
      ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'refunded' THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          UPDATE users
          SET
            total_spent = GREATEST(total_spent - NEW.amount, 0),
            lifetime_value = GREATEST(lifetime_value - NEW.amount, 0),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.user_id;
        END IF;
      ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.status = 'completed' THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          UPDATE users
          SET
            total_spent = GREATEST(total_spent - NEW.amount, 0),
            lifetime_value = GREATEST(lifetime_value - NEW.amount, 0),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.user_id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================================
  // ENUM TYPES
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE escrow_status AS ENUM ('pending', 'held', 'partially_released', 'released', 'cancelled', 'disputed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ============================================================================
  // GLOBAL TABLES (no tenant_id, no RLS)
  // ============================================================================

  // 1. PAYMENT_STATE_MACHINE (global - state transition rules)
  await knex.schema.createTable('payment_state_machine', (table) => {
    table.string('from_state', 50).notNullable();
    table.string('to_state', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.boolean('is_valid').defaultTo(true);
    table.primary(['from_state', 'to_state', 'event_type']);
  });

  await knex('payment_state_machine').insert([
    { from_state: 'PENDING', to_state: 'PROCESSING', event_type: 'payment.processing' },
    { from_state: 'PENDING', to_state: 'PAID', event_type: 'payment.succeeded' },
    { from_state: 'PENDING', to_state: 'PAYMENT_FAILED', event_type: 'payment.failed' },
    { from_state: 'PENDING', to_state: 'CANCELLED', event_type: 'payment.cancelled' },
    { from_state: 'PROCESSING', to_state: 'PAID', event_type: 'payment.succeeded' },
    { from_state: 'PROCESSING', to_state: 'PAYMENT_FAILED', event_type: 'payment.failed' },
    { from_state: 'PROCESSING', to_state: 'CANCELLED', event_type: 'payment.cancelled' },
    { from_state: 'PAID', to_state: 'REFUNDING', event_type: 'refund.initiated' },
    { from_state: 'PAID', to_state: 'PARTIALLY_REFUNDED', event_type: 'refund.partial' },
    { from_state: 'PAID', to_state: 'REFUNDED', event_type: 'refund.completed' },
    { from_state: 'REFUNDING', to_state: 'PARTIALLY_REFUNDED', event_type: 'refund.partial' },
    { from_state: 'REFUNDING', to_state: 'REFUNDED', event_type: 'refund.completed' },
    { from_state: 'REFUNDING', to_state: 'PAID', event_type: 'refund.failed' },
  ]);

  // 2. ML_FRAUD_MODELS (global - platform-wide ML models)
  await knex.schema.createTable('ml_fraud_models', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('model_name', 255).notNullable().unique();
    table.string('model_version', 50).notNullable();
    table.string('model_type', 50).notNullable();
    table.text('description').nullable();
    table.jsonb('features').notNullable();
    table.jsonb('hyperparameters').nullable();
    table.decimal('accuracy', 5, 4).nullable();
    table.decimal('precision', 5, 4).nullable();
    table.decimal('recall', 5, 4).nullable();
    table.decimal('f1_score', 5, 4).nullable();
    table.integer('training_samples').nullable();
    table.string('status', 50).notNullable().defaultTo('training');
    table.timestamp('trained_at').nullable();
    table.timestamp('deployed_at').nullable();
    table.timestamp('deprecated_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_ml_fraud_models_active ON ml_fraud_models(status) WHERE status = 'active';
  `);

  await knex.raw(`
    CREATE TRIGGER update_ml_fraud_models_updated_at
    BEFORE UPDATE ON ml_fraud_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 3. IP_REPUTATION (global - cross-tenant IP tracking)
  await knex.schema.createTable('ip_reputation', (table) => {
    table.specificType('ip_address', 'INET').primary();
    table.integer('risk_score').notNullable().defaultTo(0);
    table.string('reputation_status', 20).notNullable().defaultTo('clean');
    table.integer('fraud_count').defaultTo(0);
    table.integer('total_transactions').defaultTo(0);
    table.boolean('is_proxy').defaultTo(false);
    table.boolean('is_vpn').defaultTo(false);
    table.boolean('is_tor').defaultTo(false);
    table.boolean('is_datacenter').defaultTo(false);
    table.string('country_code', 2).nullable();
    table.string('asn', 50).nullable();
    table.jsonb('geo_data').nullable();
    table.timestamp('last_seen').defaultTo(knex.fn.now());
    table.timestamp('first_seen').defaultTo(knex.fn.now());
    table.timestamp('blocked_at').nullable();
    table.string('blocked_reason', 500).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_ip_reputation_status ON ip_reputation(reputation_status);`);
  await knex.raw(`CREATE INDEX idx_ip_reputation_risk ON ip_reputation(risk_score) WHERE risk_score > 50;`);

  await knex.raw(`
    CREATE TRIGGER update_ip_reputation_updated_at
    BEFORE UPDATE ON ip_reputation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 4. CARD_FINGERPRINTS (global - cross-tenant card fraud detection)
  await knex.schema.createTable('card_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('card_fingerprint', 255).notNullable().unique();
    table.string('bin', 6).nullable();
    table.string('last4', 4).nullable();
    table.string('card_brand', 50).nullable();
    table.string('issuing_bank', 255).nullable();
    table.string('card_type', 50).nullable();
    table.integer('successful_purchases').defaultTo(0);
    table.integer('failed_purchases').defaultTo(0);
    table.integer('chargeback_count').defaultTo(0);
    table.integer('fraud_count').defaultTo(0);
    table.decimal('total_amount_spent', 12, 2).defaultTo(0);
    table.string('risk_level', 20).defaultTo('unknown');
    table.timestamp('first_used').defaultTo(knex.fn.now());
    table.timestamp('last_used').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_card_fingerprints_risk ON card_fingerprints(risk_level) WHERE risk_level IN ('high', 'blocked');
  `);
  await knex.raw(`CREATE INDEX idx_card_fingerprints_fingerprint ON card_fingerprints(card_fingerprint);`);

  await knex.raw(`
    CREATE TRIGGER update_card_fingerprints_updated_at
    BEFORE UPDATE ON card_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - CORE PAYMENT
  // ============================================================================

  // 1. PAYMENT_TRANSACTIONS
  await knex.schema.createTable('payment_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('order_id').nullable();
    table.string('type', 50).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('status', 50).notNullable();
    table.decimal('platform_fee', 10, 2).notNullable();
    table.decimal('venue_payout', 10, 2).notNullable();
    table.decimal('gas_fee_paid', 10, 4).nullable();
    table.decimal('tax_amount', 10, 2).nullable();
    table.decimal('total_amount', 10, 2).nullable();
    table.string('stripe_payment_intent_id', 255).unique().nullable();
    table.string('stripe_charge_id', 50).nullable();
    table.string('paypal_order_id', 255).nullable();
    table.string('device_fingerprint', 255).nullable();
    table.string('payment_method_fingerprint', 255).nullable();
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index('tenant_id');
    table.index('venue_id');
    table.index('user_id');
    table.index('event_id');
    table.index('order_id');
    table.index('type');
    table.index('status');
    table.index('device_fingerprint');
    table.index('stripe_charge_id');
  });

  await knex.raw(`
    ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'));
  `);

  await knex.raw(`
    ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_type
    CHECK (type IN ('ticket_purchase', 'refund', 'referral_bonus', 'points_redemption', 'transfer', 'fee', 'payout'));
  `);

  await knex.raw(`
    ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_amount_positive
    CHECK (amount > 0);
  `);

  await knex.raw(`
    ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_fee_non_negative
    CHECK (platform_fee >= 0);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX uq_payment_transactions_idempotency
    ON payment_transactions (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX idx_payment_transactions_status_created
    ON payment_transactions (status, created_at);
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await knex.raw(`
    CREATE TRIGGER trigger_update_user_total_spent
    AFTER INSERT OR UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_user_total_spent();
  `);

  // 2. PAYMENT_REFUNDS
  await knex.schema.createTable('payment_refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.text('reason').nullable();
    table.string('status', 50).defaultTo('pending');
    table.string('stripe_refund_id', 255).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('transaction_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE payment_refunds ADD CONSTRAINT chk_payment_refunds_amount_positive
    CHECK (amount > 0);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX uq_payment_refunds_idempotency
    ON payment_refunds (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_refunds_updated_at
    BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 3. PAYMENT_INTENTS
  await knex.schema.createTable('payment_intents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('stripe_intent_id', 255).unique().nullable();
    table.string('external_id', 255).unique().nullable();
    table.string('client_secret', 500).nullable();
    table.string('processor', 50).nullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('status', 50).defaultTo('pending');
    table.decimal('platform_fee', 10, 2).nullable();
    table.uuid('venue_id').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.bigInteger('last_sequence_number').defaultTo(0);
    table.timestamp('last_event_timestamp').nullable();
    table.integer('version').defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('status');
    table.index('external_id');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX uq_payment_intents_idempotency
    ON payment_intents (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_intents_updated_at
    BEFORE UPDATE ON payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 4. VENUE_BALANCES (MERGED from 001 + 005)
  await knex.schema.createTable('venue_balances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.decimal('amount', 12, 2).defaultTo(0);
    table.string('balance_type', 50).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.bigInteger('available_balance').defaultTo(0);
    table.bigInteger('pending_balance').defaultTo(0);
    table.bigInteger('held_for_disputes').defaultTo(0);
    table.bigInteger('lost_to_disputes').defaultTo(0);
    table.bigInteger('reversed_amount').defaultTo(0);
    table.timestamp('last_payout_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'tenant_id', 'balance_type', 'currency']);
    table.index('tenant_id');
    table.index('venue_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_venue_balances_updated_at
    BEFORE UPDATE ON venue_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - ROYALTY SYSTEM
  // ============================================================================

  // 5. VENUE_ROYALTY_SETTINGS
  await knex.schema.createTable('venue_royalty_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.decimal('default_royalty_percentage', 5, 2).notNullable().defaultTo(10.00);
    table.integer('minimum_payout_amount_cents').notNullable().defaultTo(1000);
    table.string('payout_schedule', 20).notNullable().defaultTo('weekly');
    table.string('stripe_account_id', 255).nullable();
    table.string('payment_method', 50).defaultTo('stripe');
    table.boolean('auto_payout_enabled').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'venue_id']);
    table.index('tenant_id');
    table.index('venue_id');
  });

  await knex.raw(`
    ALTER TABLE venue_royalty_settings ADD CONSTRAINT chk_venue_royalty_percentage
    CHECK (default_royalty_percentage >= 0 AND default_royalty_percentage <= 100);
  `);

  await knex.raw(`
    CREATE TRIGGER update_venue_royalty_settings_updated_at
    BEFORE UPDATE ON venue_royalty_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 6. EVENT_ROYALTY_SETTINGS
  await knex.schema.createTable('event_royalty_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable();
    table.decimal('venue_royalty_percentage', 5, 2).nullable();
    table.decimal('artist_royalty_percentage', 5, 2).defaultTo(0);
    table.string('artist_wallet_address', 255).nullable();
    table.string('artist_stripe_account_id', 255).nullable();
    table.boolean('override_venue_default').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'event_id']);
    table.index('tenant_id');
    table.index('event_id');
  });

  await knex.raw(`
    ALTER TABLE event_royalty_settings ADD CONSTRAINT chk_event_royalty_percentages
    CHECK (
      (venue_royalty_percentage IS NULL OR (venue_royalty_percentage >= 0 AND venue_royalty_percentage <= 100))
      AND (artist_royalty_percentage >= 0 AND artist_royalty_percentage <= 100)
    );
  `);

  await knex.raw(`
    CREATE TRIGGER update_event_royalty_settings_updated_at
    BEFORE UPDATE ON event_royalty_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 7. ROYALTY_DISTRIBUTIONS
  await knex.schema.createTable('royalty_distributions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('transaction_type', 50).notNullable();
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('recipient_wallet_address', 255).nullable();
    table.decimal('amount_cents', 10, 2).notNullable();
    table.decimal('percentage', 5, 2).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('blockchain_tx_hash', 255).nullable();
    table.string('stripe_transfer_id', 255).nullable();
    table.timestamp('paid_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('transaction_id');
    table.index('event_id');
    table.index('recipient_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE royalty_distributions ADD CONSTRAINT chk_royalty_distributions_recipient_type
    CHECK (recipient_type IN ('venue', 'artist', 'platform'));
  `);

  await knex.raw(`
    ALTER TABLE royalty_distributions ADD CONSTRAINT chk_royalty_distributions_status
    CHECK (status IN ('pending', 'scheduled', 'processing', 'paid', 'failed', 'disputed'));
  `);

  await knex.raw(`
    CREATE INDEX idx_royalty_distributions_recipient_status
    ON royalty_distributions (recipient_id, status);
  `);

  await knex.raw(`
    CREATE TRIGGER update_royalty_distributions_updated_at
    BEFORE UPDATE ON royalty_distributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 8. ROYALTY_PAYOUTS
  await knex.schema.createTable('royalty_payouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('recipient_type', 50).notNullable();
    table.decimal('amount_cents', 12, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.integer('distribution_count').notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('stripe_payout_id', 255).nullable();
    table.string('failure_reason', 500).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('scheduled_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('recipient_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE royalty_payouts ADD CONSTRAINT chk_royalty_payouts_status
    CHECK (status IN ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_royalty_payouts_updated_at
    BEFORE UPDATE ON royalty_payouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 9. ROYALTY_RECONCILIATION_RUNS
  await knex.schema.createTable('royalty_reconciliation_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.date('reconciliation_date').notNullable();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.integer('transactions_checked').defaultTo(0);
    table.integer('discrepancies_found').defaultTo(0);
    table.integer('discrepancies_resolved').defaultTo(0);
    table.decimal('total_royalties_calculated', 12, 2).defaultTo(0);
    table.decimal('total_royalties_paid', 12, 2).defaultTo(0);
    table.decimal('variance_amount', 12, 2).defaultTo(0);
    table.string('status', 50).notNullable().defaultTo('running');
    table.integer('duration_ms').nullable();
    table.text('error_message').nullable();
    table.jsonb('summary').defaultTo('{}');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('reconciliation_date');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE royalty_reconciliation_runs ADD CONSTRAINT chk_royalty_reconciliation_status
    CHECK (status IN ('running', 'completed', 'failed'));
  `);

  // 10. ROYALTY_DISCREPANCIES
  await knex.schema.createTable('royalty_discrepancies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('reconciliation_run_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.uuid('distribution_id').nullable();
    table.string('discrepancy_type', 100).notNullable();
    table.decimal('expected_amount', 10, 2).nullable();
    table.decimal('actual_amount', 10, 2).nullable();
    table.decimal('variance', 10, 2).nullable();
    table.string('status', 50).notNullable().defaultTo('identified');
    table.text('resolution_notes').nullable();
    table.uuid('resolved_by').nullable();
    table.timestamp('resolved_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('reconciliation_run_id');
    table.index('transaction_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE royalty_discrepancies ADD CONSTRAINT chk_royalty_discrepancies_status
    CHECK (status IN ('identified', 'investigating', 'resolved', 'disputed', 'closed'));
  `);

  await knex.raw(`
    ALTER TABLE royalty_discrepancies ADD CONSTRAINT chk_royalty_discrepancies_type
    CHECK (discrepancy_type IN ('missing_distribution', 'incorrect_amount', 'duplicate_payment', 'missing_blockchain_tx', 'failed_payout', 'calculation_error'));
  `);

  // 11. ROYALTY_REVERSALS
  await knex.schema.createTable('royalty_reversals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('refund_id').notNullable();
    table.uuid('payment_id').notNullable();
    table.string('recipient_id', 255).notNullable();
    table.string('recipient_type', 50).notNullable();
    table.integer('original_royalty').notNullable();
    table.integer('reversed_amount').notNullable();
    table.integer('remaining_royalty').notNullable();
    table.decimal('refund_ratio', 5, 4).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('refund_id');
    table.index('payment_id');
  });

  await knex.raw(`
    ALTER TABLE royalty_reversals ADD CONSTRAINT ck_royalty_reversals_original_positive
    CHECK (original_royalty >= 0);
  `);

  await knex.raw(`
    ALTER TABLE royalty_reversals ADD CONSTRAINT ck_royalty_reversals_reversed_positive
    CHECK (reversed_amount >= 0);
  `);

  await knex.raw(`
    ALTER TABLE royalty_reversals ADD CONSTRAINT ck_royalty_reversals_remaining_positive
    CHECK (remaining_royalty >= 0);
  `);

  await knex.raw(`
    ALTER TABLE royalty_reversals ADD CONSTRAINT ck_royalty_reversals_ratio_valid
    CHECK (refund_ratio >= 0 AND refund_ratio <= 1);
  `);

  await knex.raw(`
    CREATE INDEX idx_royalty_reversals_recipient
    ON royalty_reversals (recipient_id, recipient_type);
  `);

  // ============================================================================
  // TENANT TABLES - GROUP PAYMENTS
  // ============================================================================

  // 12. GROUP_PAYMENTS
  await knex.schema.createTable('group_payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('organizer_id').notNullable();
    table.uuid('event_id').notNullable();
    table.decimal('total_amount', 10, 2).notNullable();
    table.jsonb('ticket_selections').notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.string('cancellation_reason', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('organizer_id');
    table.index('event_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE group_payments ADD CONSTRAINT chk_group_payments_status
    CHECK (status IN ('collecting', 'completed', 'partially_paid', 'expired', 'cancelled'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_group_payments_updated_at
    BEFORE UPDATE ON group_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 13. GROUP_PAYMENT_MEMBERS
  await knex.schema.createTable('group_payment_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('group_payment_id').notNullable();
    table.uuid('user_id').nullable();
    table.string('email', 255).notNullable();
    table.string('name', 255).notNullable();
    table.decimal('amount_due', 10, 2).notNullable();
    table.integer('ticket_count').notNullable();
    table.boolean('paid').defaultTo(false);
    table.timestamp('paid_at').nullable();
    table.string('payment_id', 255).nullable();
    table.integer('reminders_sent').defaultTo(0);
    table.string('status', 50).defaultTo('pending');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('group_payment_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_group_payment_members_updated_at
    BEFORE UPDATE ON group_payment_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 14. REMINDER_HISTORY
  await knex.schema.createTable('reminder_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('group_id').notNullable();
    table.uuid('member_id').notNullable();
    table.integer('reminder_number').notNullable();
    table.timestamp('sent_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('group_id');
    table.index('member_id');
  });

  // ============================================================================
  // TENANT TABLES - TAX & COMPLIANCE
  // ============================================================================

  // 15. TAX_COLLECTIONS
  await knex.schema.createTable('tax_collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.decimal('state_tax', 10, 2).notNullable();
    table.decimal('local_tax', 10, 2).notNullable();
    table.decimal('special_tax', 10, 2).defaultTo(0);
    table.decimal('total_tax', 10, 2).notNullable();
    table.string('jurisdiction', 255).nullable();
    table.jsonb('breakdown').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('transaction_id');
  });

  // 16. TAX_FORMS_1099DA
  await knex.schema.createTable('tax_forms_1099da', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.integer('tax_year').notNullable();
    table.jsonb('form_data').notNullable();
    table.decimal('total_proceeds', 12, 2).notNullable();
    table.integer('transaction_count').notNullable();
    table.string('status', 50).defaultTo('generated');
    table.timestamp('generated_at').defaultTo(knex.fn.now());
    table.timestamp('sent_at').nullable();

    table.unique(['tenant_id', 'user_id', 'tax_year']);
    table.index('tenant_id');
    table.index('user_id');
  });

  // 17. USER_TAX_INFO
  await knex.schema.createTable('user_tax_info', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('tin_encrypted', 500).nullable();
    table.string('tin_type', 10).nullable();
    table.string('tin_last_four', 4).nullable();
    table.string('legal_first_name', 255).nullable();
    table.string('legal_last_name', 255).nullable();
    table.string('business_name', 255).nullable();
    table.string('address_line1', 255).nullable();
    table.string('address_line2', 255).nullable();
    table.string('city', 100).nullable();
    table.string('state', 2).nullable();
    table.string('zip', 10).nullable();
    table.string('country', 2).defaultTo('US');
    table.string('w9_status', 50).defaultTo('not_submitted');
    table.timestamp('w9_submitted_at').nullable();
    table.timestamp('w9_verified_at').nullable();
    table.uuid('w9_verified_by').nullable();
    table.text('w9_rejection_reason').nullable();
    table.boolean('certified_us_person').defaultTo(false);
    table.boolean('certified_correct_tin').defaultTo(false);
    table.boolean('exempt_from_backup_withholding').defaultTo(false);
    table.string('exemption_code', 10).nullable();
    table.string('signature_ip', 45).nullable();
    table.text('signature_user_agent').nullable();
    table.timestamp('signature_timestamp').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'user_id']);
    table.index('tenant_id');
    table.index('user_id');
  });

  await knex.raw(`
    ALTER TABLE user_tax_info ADD CONSTRAINT chk_user_tax_info_tin_type
    CHECK (tin_type IS NULL OR tin_type IN ('SSN', 'EIN', 'ITIN'));
  `);

  await knex.raw(`
    ALTER TABLE user_tax_info ADD CONSTRAINT chk_user_tax_info_w9_status
    CHECK (w9_status IN ('not_submitted', 'pending_review', 'verified', 'rejected'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_user_tax_info_updated_at
    BEFORE UPDATE ON user_tax_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - FRAUD DETECTION
  // ============================================================================

  // 18. FRAUD_CHECKS
  await knex.schema.createTable('fraud_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('payment_id').nullable();
    table.string('device_fingerprint', 255).nullable();
    table.specificType('ip_address', 'INET').nullable();
    table.decimal('score', 3, 2).nullable();
    table.decimal('risk_score', 5, 2).nullable();
    table.jsonb('signals').nullable();
    table.jsonb('reasons').nullable();
    table.string('decision', 50).notNullable();
    table.string('check_type', 100).nullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('payment_id');
    table.index('device_fingerprint');
    table.index('timestamp');
  });

  await knex.raw(`
    ALTER TABLE fraud_checks ADD CONSTRAINT chk_fraud_checks_decision
    CHECK (decision IN ('approve', 'review', 'challenge', 'decline'));
  `);

  await knex.raw(`
    CREATE INDEX idx_fraud_checks_user_timestamp
    ON fraud_checks (user_id, timestamp);
  `);

  // 19. DEVICE_ACTIVITY
  await knex.schema.createTable('device_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('device_fingerprint', 255).notNullable();
    table.uuid('user_id').notNullable();
    table.string('activity_type', 100).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('device_fingerprint');
    table.index('user_id');
  });

  // 20. BOT_DETECTIONS
  await knex.schema.createTable('bot_detections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').nullable();
    table.string('session_id', 255).nullable();
    table.boolean('is_bot').notNullable();
    table.decimal('confidence', 3, 2).notNullable();
    table.specificType('indicators', 'TEXT[]').nullable();
    table.text('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
  });

  // 21. KNOWN_SCALPERS
  await knex.schema.createTable('known_scalpers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').nullable();
    table.string('device_fingerprint', 255).nullable();
    table.text('reason').nullable();
    table.decimal('confidence_score', 3, 2).nullable();
    table.string('added_by', 255).nullable();
    table.boolean('active').defaultTo(true);
    table.timestamp('added_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('device_fingerprint');
  });

  // 22. BEHAVIORAL_ANALYTICS
  await knex.schema.createTable('behavioral_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('session_id').notNullable();
    table.string('event_type', 100).notNullable();
    table.string('page_url', 500).nullable();
    table.jsonb('event_data').nullable();
    table.integer('time_on_page_ms').nullable();
    table.integer('mouse_movements').nullable();
    table.integer('keystrokes').nullable();
    table.boolean('copy_paste_detected').defaultTo(false);
    table.boolean('form_autofill_detected').defaultTo(false);
    table.timestamp('timestamp').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('session_id');
    table.index('timestamp');
  });

  await knex.raw(`
    CREATE INDEX idx_behavioral_analytics_user_session
    ON behavioral_analytics (user_id, session_id);
  `);

  // 23. VELOCITY_LIMITS
  await knex.schema.createTable('velocity_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id', 255).notNullable();
    table.string('action_type', 50).notNullable();
    table.integer('limit_count').notNullable();
    table.integer('window_minutes').notNullable();
    table.integer('current_count').defaultTo(0);
    table.timestamp('window_start').defaultTo(knex.fn.now());
    table.timestamp('window_end').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'entity_type', 'entity_id', 'action_type']);
    table.index('tenant_id');
  });

  await knex.raw(`
    CREATE INDEX idx_velocity_limits_window
    ON velocity_limits (window_end) WHERE current_count >= limit_count;
  `);

  await knex.raw(`
    CREATE TRIGGER update_velocity_limits_updated_at
    BEFORE UPDATE ON velocity_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 24. VELOCITY_RECORDS
  await knex.schema.createTable('velocity_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('ip_address', 45).nullable();
    table.string('payment_method_token', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('event_id');
  });

  await knex.raw(`
    CREATE INDEX idx_velocity_records_user_time
    ON velocity_records (user_id, created_at);
  `);

  // 25. FRAUD_RULES
  await knex.schema.createTable('fraud_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('rule_name', 255).notNullable();
    table.text('description').nullable();
    table.string('rule_type', 50).notNullable();
    table.jsonb('conditions').notNullable();
    table.string('action', 50).notNullable();
    table.integer('priority').defaultTo(100);
    table.boolean('is_active').defaultTo(true);
    table.integer('trigger_count').defaultTo(0);
    table.integer('block_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'rule_name']);
    table.index('tenant_id');
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_rules_active
    ON fraud_rules (is_active, priority);
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_rules_updated_at
    BEFORE UPDATE ON fraud_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 26. FRAUD_REVIEW_QUEUE
  await knex.schema.createTable('fraud_review_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('payment_id').nullable();
    table.uuid('fraud_check_id').nullable();
    table.string('reason', 500).notNullable();
    table.string('priority', 20).notNullable().defaultTo('medium');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.uuid('assigned_to').nullable();
    table.text('reviewer_notes').nullable();
    table.jsonb('review_metadata').nullable();
    table.timestamp('reviewed_at').nullable();
    table.string('decision', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('payment_id');
    table.index('created_at');
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_review_queue_status
    ON fraud_review_queue (status, priority);
  `);

  await knex.raw(`
    CREATE INDEX idx_fraud_review_queue_assigned
    ON fraud_review_queue (assigned_to) WHERE assigned_to IS NOT NULL;
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_review_queue_updated_at
    BEFORE UPDATE ON fraud_review_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 27. ML_FRAUD_PREDICTIONS
  await knex.schema.createTable('ml_fraud_predictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('model_id').notNullable();
    table.uuid('transaction_id').nullable();
    table.uuid('user_id').notNullable();
    table.decimal('fraud_probability', 5, 4).notNullable();
    table.string('predicted_class', 20).notNullable();
    table.jsonb('feature_values').notNullable();
    table.jsonb('feature_importance').nullable();
    table.integer('prediction_time_ms').nullable();
    table.boolean('actual_fraud').nullable();
    table.timestamp('feedback_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('model_id');
    table.index('transaction_id');
    table.index('user_id');
    table.index('created_at');
  });

  await knex.raw(`
    CREATE INDEX idx_ml_fraud_predictions_high_risk
    ON ml_fraud_predictions (fraud_probability) WHERE fraud_probability > 0.7;
  `);

  // 28. ACCOUNT_TAKEOVER_SIGNALS
  await knex.schema.createTable('account_takeover_signals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('session_id').notNullable();
    table.string('signal_type', 100).notNullable();
    table.integer('risk_score').notNullable();
    table.jsonb('signal_data').nullable();
    table.boolean('is_anomaly').defaultTo(false);
    table.timestamp('timestamp').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('timestamp');
  });

  await knex.raw(`
    CREATE INDEX idx_account_takeover_signals_user
    ON account_takeover_signals (user_id, timestamp DESC);
  `);

  await knex.raw(`
    CREATE INDEX idx_account_takeover_signals_anomaly
    ON account_takeover_signals (is_anomaly) WHERE is_anomaly = true;
  `);

  // 29. SCALPER_REPORTS
  await knex.schema.createTable('scalper_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('reporter_id').notNullable();
    table.uuid('suspected_scalper_id').notNullable();
    table.jsonb('evidence').nullable();
    table.text('description').nullable();
    table.string('status', 50).notNullable().defaultTo('pending_review');
    table.uuid('reviewed_by').nullable();
    table.text('review_notes').nullable();
    table.timestamp('reviewed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('reporter_id');
    table.index('suspected_scalper_id');
    table.index('status');
  });

  await knex.raw(`
    CREATE INDEX idx_scalper_reports_suspected
    ON scalper_reports (suspected_scalper_id, status);
  `);

  // ============================================================================
  // TENANT TABLES - AML / COMPLIANCE
  // ============================================================================

  // 30. AML_CHECKS
  await knex.schema.createTable('aml_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('transaction_type', 50).notNullable();
    table.boolean('passed').notNullable().defaultTo(true);
    table.jsonb('flags').defaultTo('[]');
    table.decimal('risk_score', 3, 2).notNullable().defaultTo(0);
    table.boolean('requires_review').defaultTo(false);
    table.timestamp('checked_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('requires_review');
  });

  await knex.raw(`
    CREATE INDEX idx_aml_checks_user_date
    ON aml_checks (user_id, checked_at DESC);
  `);

  await knex.raw(`
    CREATE INDEX idx_aml_checks_review
    ON aml_checks (requires_review) WHERE requires_review = true;
  `);

  // 31. SANCTIONS_LIST_MATCHES
  await knex.schema.createTable('sanctions_list_matches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('list_name', 100).notNullable();
    table.string('matched_name', 255).notNullable();
    table.decimal('confidence_score', 3, 2).nullable();
    table.boolean('active').defaultTo(true);
    table.text('reviewer_notes').nullable();
    table.uuid('reviewed_by').nullable();
    table.timestamp('reviewed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('active');
  });

  await knex.raw(`
    CREATE INDEX idx_sanctions_list_user_active
    ON sanctions_list_matches (user_id, active);
  `);

  await knex.raw(`
    CREATE TRIGGER update_sanctions_list_matches_updated_at
    BEFORE UPDATE ON sanctions_list_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 32. PEP_DATABASE
  await knex.schema.createTable('pep_database', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.specificType('linked_user_ids', 'UUID[]').nullable();
    table.string('position', 255).notNullable();
    table.string('country', 2).notNullable();
    table.date('since_date').nullable();
    table.date('until_date').nullable();
    table.string('risk_level', 20).notNullable().defaultTo('medium');
    table.string('data_source', 100).nullable();
    table.boolean('verified').defaultTo(false);
    table.uuid('verified_by').nullable();
    table.timestamp('verified_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
  });

  await knex.raw(`
    ALTER TABLE pep_database ADD CONSTRAINT chk_pep_risk_level
    CHECK (risk_level IN ('low', 'medium', 'high'));
  `);

  await knex.raw(`
    CREATE INDEX idx_pep_database_risk
    ON pep_database (risk_level) WHERE risk_level IN ('medium', 'high');
  `);

  await knex.raw(`
    CREATE TRIGGER update_pep_database_updated_at
    BEFORE UPDATE ON pep_database
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 33. SUSPICIOUS_ACTIVITY_REPORTS
  await knex.schema.createTable('suspicious_activity_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('sar_id', 100).notNullable();
    table.uuid('user_id').notNullable();
    table.specificType('transaction_ids', 'UUID[]').notNullable();
    table.text('activity_description').notNullable();
    table.timestamp('filing_deadline').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.timestamp('filed_at').nullable();
    table.string('fincen_confirmation', 255).nullable();
    table.uuid('filed_by').nullable();
    table.text('internal_notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'sar_id']);
    table.index('tenant_id');
    table.index('user_id');
    table.index('status');
    table.index('filing_deadline');
  });

  await knex.raw(`
    ALTER TABLE suspicious_activity_reports ADD CONSTRAINT chk_sar_status
    CHECK (status IN ('pending', 'filed', 'rejected', 'under_review'));
  `);

  await knex.raw(`
    CREATE INDEX idx_sar_status
    ON suspicious_activity_reports (status, filing_deadline);
  `);

  await knex.raw(`
    CREATE TRIGGER update_suspicious_activity_reports_updated_at
    BEFORE UPDATE ON suspicious_activity_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - HIGH-DEMAND / WAITING ROOM
  // ============================================================================

  // 34. WAITING_ROOM_ACTIVITY
  await knex.schema.createTable('waiting_room_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('action', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('event_id');
    table.index('user_id');
  });

  // 35. EVENT_PURCHASE_LIMITS
  await knex.schema.createTable('event_purchase_limits', (table) => {
    table.uuid('event_id').primary();
    table.uuid('tenant_id').notNullable();
    table.integer('purchase_limit_per_user').defaultTo(4);
    table.integer('purchase_limit_per_payment_method').defaultTo(4);
    table.integer('purchase_limit_per_address').defaultTo(8);
    table.integer('max_tickets_per_order').defaultTo(4);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_event_purchase_limits_updated_at
    BEFORE UPDATE ON event_purchase_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 36. PURCHASE_LIMIT_VIOLATIONS
  await knex.schema.createTable('purchase_limit_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('violation_type', 50).notNullable();
    table.integer('attempted_quantity').notNullable();
    table.integer('limit_value').notNullable();
    table.string('ip_address', 45).nullable();
    table.string('device_fingerprint', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('event_id');
  });

  // ============================================================================
  // TENANT TABLES - MARKETPLACE / ESCROW
  // ============================================================================

  // 37. PAYMENT_ESCROWS (P2P marketplace resales)
  await knex.schema.createTable('payment_escrows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.integer('amount').notNullable();
    table.integer('seller_payout').nullable();
    table.integer('venue_royalty').nullable();
    table.integer('platform_fee').nullable();
    table.string('stripe_payment_intent_id', 255).nullable();
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('released_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('listing_id');
    table.index('buyer_id');
    table.index('seller_id');
    table.index('status');
  });

  await knex.raw(`
    ALTER TABLE payment_escrows ADD CONSTRAINT chk_payment_escrows_status
    CHECK (status IN ('created', 'funded', 'released', 'refunded', 'disputed'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_escrows_updated_at
    BEFORE UPDATE ON payment_escrows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 38. ESCROW_RELEASE_CONDITIONS
  await knex.schema.createTable('escrow_release_conditions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('escrow_id').notNullable();
    table.string('condition_type', 100).notNullable();
    table.boolean('required').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('escrow_id');
  });

  // 39. ESCROW_ACCOUNTS (General order escrow with time-based release)
  await knex.schema.createTable('escrow_accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('payment_intent_id', 50).notNullable();
    table.integer('amount').notNullable();
    table.integer('held_amount').notNullable();
    table.integer('released_amount').notNullable().defaultTo(0);
    table.specificType('status', 'escrow_status').notNullable().defaultTo('pending');
    table.timestamp('hold_until').notNullable();
    table.jsonb('release_conditions').defaultTo('[]');
    table.string('dispute_id', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('payment_intent_id');
  });

  await knex.raw(`
    ALTER TABLE escrow_accounts ADD CONSTRAINT ck_escrow_accounts_amount_positive
    CHECK (amount >= 0);
  `);

  await knex.raw(`
    ALTER TABLE escrow_accounts ADD CONSTRAINT ck_escrow_accounts_held_amount_positive
    CHECK (held_amount >= 0);
  `);

  await knex.raw(`
    ALTER TABLE escrow_accounts ADD CONSTRAINT ck_escrow_accounts_released_amount_positive
    CHECK (released_amount >= 0);
  `);

  await knex.raw(`
    CREATE INDEX idx_escrow_accounts_status_hold
    ON escrow_accounts (status, hold_until);
  `);

  await knex.raw(`
    CREATE INDEX idx_escrow_accounts_ready_release
    ON escrow_accounts (hold_until) WHERE status = 'held' ;
  `);

  await knex.raw(`
    CREATE TRIGGER update_escrow_accounts_updated_at
    BEFORE UPDATE ON escrow_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 40. ESCROW_EVENTS
  await knex.schema.createTable('escrow_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('escrow_id').notNullable();
    table.string('event_type', 30).notNullable();
    table.integer('amount').nullable();
    table.text('reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('escrow_id');
  });

  // 41. VENUE_PRICE_RULES
  await knex.schema.createTable('venue_price_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.decimal('max_resale_multiplier', 5, 2).defaultTo(3.0);
    table.decimal('min_price_multiplier', 5, 2).defaultTo(1.0);
    table.boolean('allow_below_face').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'venue_id']);
    table.index('tenant_id');
    table.index('venue_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_venue_price_rules_updated_at
    BEFORE UPDATE ON venue_price_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 42. RESALE_LISTINGS
  await knex.schema.createTable('resale_listings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.integer('price').notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('venue_id');
    table.index('ticket_id');
    table.index('seller_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_resale_listings_updated_at
    BEFORE UPDATE ON resale_listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - CHARGEBACK / RESERVES
  // ============================================================================

  // 43. PAYMENT_RESERVES
  await knex.schema.createTable('payment_reserves', (table) => {
    table.uuid('reserve_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.integer('reserve_amount_cents').notNullable();
    table.integer('used_amount_cents').defaultTo(0);
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('released_at').nullable();

    table.index('tenant_id');
    table.index('transaction_id');
  });

  await knex.raw(`
    ALTER TABLE payment_reserves ADD CONSTRAINT chk_payment_reserves_status
    CHECK (status IN ('held', 'released', 'used_for_chargeback'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_reserves_updated_at
    BEFORE UPDATE ON payment_reserves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 44. PAYMENT_CHARGEBACKS
  await knex.schema.createTable('payment_chargebacks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('stripe_dispute_id', 255).unique().nullable();
    table.integer('amount_cents').notNullable();
    table.string('reason', 100).nullable();
    table.string('status', 50).notNullable().defaultTo('open');
    table.text('evidence_submitted').nullable();
    table.timestamp('disputed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at').nullable();
    table.string('outcome', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('transaction_id');
    table.index('user_id');
  });

  await knex.raw(`
    ALTER TABLE payment_chargebacks ADD CONSTRAINT chk_payment_chargebacks_status
    CHECK (status IN ('open', 'under_review', 'won', 'lost'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_chargebacks_updated_at
    BEFORE UPDATE ON payment_chargebacks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - INVENTORY / NOTIFICATIONS
  // ============================================================================

  // 45. INVENTORY_RESERVATIONS
  await knex.schema.createTable('inventory_reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transaction_id').notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('transaction_id');
  });

  await knex.raw(`
    ALTER TABLE inventory_reservations ADD CONSTRAINT chk_inventory_reservations_status
    CHECK (status IN ('held', 'released', 'expired'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_inventory_reservations_updated_at
    BEFORE UPDATE ON inventory_reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 46. PAYMENT_NOTIFICATIONS
  await knex.schema.createTable('payment_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('transaction_id').nullable();
    table.string('notification_type', 100).notNullable();
    table.text('message').notNullable();
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('user_id');
    table.index('transaction_id');
  });

  // ============================================================================
  // TENANT TABLES - BLOCKCHAIN / NFT
  // ============================================================================

  // 47. NFT_MINT_QUEUE
  await knex.schema.createTable('nft_mint_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_id').nullable();
    table.specificType('ticket_ids', 'UUID[]').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('blockchain', 50).notNullable();
    table.string('status', 50).defaultTo('queued');
    table.string('priority', 20).defaultTo('standard');
    table.string('transaction_hash', 255).nullable();
    table.decimal('gas_fee_paid', 10, 6).nullable();
    table.string('mint_batch_id', 255).nullable();
    table.integer('attempts').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('payment_id');
    table.index('status');
  });

  await knex.raw(`
    CREATE TRIGGER update_nft_mint_queue_updated_at
    BEFORE UPDATE ON nft_mint_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - EVENT SOURCING / OUTBOX
  // ============================================================================

  // 48. OUTBOX_DLQ
  await knex.schema.createTable('outbox_dlq', (table) => {
    table.increments('id').primary();
    table.uuid('tenant_id').notNullable();
    table.integer('original_id').nullable();
    table.uuid('aggregate_id').notNullable();
    table.string('aggregate_type', 100).notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.integer('attempts').defaultTo(0);
    table.text('last_error').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('moved_to_dlq_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
  });

  // 49. PAYMENT_EVENT_SEQUENCE
  await knex.schema.createTable('payment_event_sequence', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_id').notNullable();
    table.uuid('order_id').nullable();
    table.string('event_type', 100).notNullable();
    table.bigInteger('sequence_number').notNullable();
    table.timestamp('event_timestamp').notNullable();
    table.string('stripe_event_id', 255).unique().nullable();
    table.string('idempotency_key', 255).nullable();
    table.jsonb('payload').notNullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['payment_id', 'sequence_number']);
    table.unique(['payment_id', 'event_type', 'idempotency_key']);
    table.index('tenant_id');
    table.index('event_timestamp');
  });

  await knex.raw(`
    CREATE INDEX idx_payment_event_sequence_payment
    ON payment_event_sequence (payment_id, sequence_number);
  `);

  await knex.raw(`
    CREATE INDEX idx_payment_event_sequence_unprocessed
    ON payment_event_sequence (processed_at) WHERE processed_at IS NULL;
  `);

  // 50. PAYMENT_STATE_TRANSITIONS
  await knex.schema.createTable('payment_state_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_id').notNullable();
    table.uuid('order_id').nullable();
    table.string('from_state', 50).nullable();
    table.string('to_state', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('payment_id');
    table.index('order_id');
    table.index('created_at');
  });

  // ============================================================================
  // TENANT TABLES - WEBHOOKS
  // ============================================================================

  // 51. WEBHOOK_INBOX
  await knex.schema.createTable('webhook_inbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('provider', 50).notNullable();
    table.string('event_id', 255).unique().notNullable();
    table.string('webhook_id', 255).unique().nullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.string('signature', 500).nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();
    table.string('status', 20).defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('retry_count').defaultTo(0);
    table.text('error_message').nullable();
    table.text('error').nullable();
    table.text('last_error').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('status');
    table.index('received_at');
  });

  await knex.raw(`
    CREATE INDEX idx_webhook_inbox_provider_event
    ON webhook_inbox (provider, event_id);
  `);

  await knex.raw(`
    CREATE INDEX idx_webhook_inbox_status_created
    ON webhook_inbox (status, created_at);
  `);

  await knex.raw(`
    CREATE TRIGGER update_webhook_inbox_updated_at
    BEFORE UPDATE ON webhook_inbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 52. WEBHOOK_EVENTS
  // 53. OUTBOUND_WEBHOOKS
  await knex.schema.createTable('outbound_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('event_type', 100).notNullable();
    table.string('target_url', 500).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('status_code').nullable();
    table.text('response_body').nullable();
    table.text('error_message').nullable();
    table.timestamp('sent_at').nullable();
    table.timestamp('next_retry_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('status');
  });

  await knex.raw(`
    CREATE TRIGGER update_outbound_webhooks_updated_at
    BEFORE UPDATE ON outbound_webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - IDEMPOTENCY / RECONCILIATION
  // ============================================================================

  // 54. PAYMENT_IDEMPOTENCY
  await knex.schema.createTable('payment_idempotency', (table) => {
    table.string('idempotency_key', 255).primary();
    table.uuid('tenant_id').notNullable();
    table.string('operation', 100).notNullable();
    table.string('request_hash', 64).notNullable();
    table.jsonb('response').nullable();
    table.integer('status_code').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();

    table.index('tenant_id');
    table.index('expires_at');
  });

  // 55. RECONCILIATION_REPORTS
  await knex.schema.createTable('reconciliation_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.date('report_date').notNullable();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.jsonb('summary').notNullable();
    table.jsonb('discrepancies').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('report_date');
  });

  // 56. SETTLEMENT_BATCHES
  await knex.schema.createTable('settlement_batches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').nullable();
    table.string('batch_number', 50).nullable();
    table.decimal('total_amount', 10, 2).nullable();
    table.integer('payment_count').nullable();
    table.string('status', 50).defaultTo('pending');
    table.timestamp('processed_at').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'batch_number']);
    table.index('tenant_id');
    table.index('venue_id');
    table.index('status');
  });

  // 57. PAYMENT_RETRIES
  await knex.schema.createTable('payment_retries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_id').nullable();
    table.integer('attempt_number').nullable();
    table.string('status', 50).nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('payment_id');
  });

  // ============================================================================
  // TENANT TABLES - STRIPE CONNECT
  // ============================================================================

  // 58. STRIPE_TRANSFERS
  await knex.schema.createTable('stripe_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('stripe_transfer_id', 255).unique().notNullable();
    table.string('destination_account', 255).notNullable();
    table.integer('amount').notNullable();
    table.string('currency', 3).defaultTo('usd');
    table.string('status', 50).notNullable().defaultTo('completed');
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('transfer_group', 255).nullable();
    table.string('source_transaction', 255).nullable();
    table.integer('reversed_amount').nullable();
    table.string('reversal_id', 255).nullable();
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('venue_id').nullable();
    table.string('dispute_id', 50).nullable();
    table.timestamp('reversed_at').nullable();
    table.string('reversal_reason', 200).nullable();
    table.timestamp('failed_at').nullable();
    table.string('failure_reason', 500).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('destination_account');
    table.index('status');
    table.index('recipient_id');
    table.index('transfer_group');
  });

  await knex.raw(`
    ALTER TABLE stripe_transfers ADD CONSTRAINT chk_stripe_transfers_status
    CHECK (status IN ('pending', 'completed', 'reversed', 'partially_reversed', 'failed'));
  `);

  await knex.raw(`
    ALTER TABLE stripe_transfers ADD CONSTRAINT chk_stripe_transfers_recipient_type
    CHECK (recipient_type IN ('venue', 'artist', 'platform'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_stripe_transfers_updated_at
    BEFORE UPDATE ON stripe_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 59. PENDING_TRANSFERS
  await knex.schema.createTable('pending_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.string('payment_intent_id', 255).notNullable();
    table.string('charge_id', 255).notNullable();
    table.string('destination_account', 255).notNullable();
    table.integer('amount').notNullable();
    table.string('currency', 3).defaultTo('usd');
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('stripe_transfer_id', 255).nullable();
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('next_retry_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('order_id');
    table.index('status');
    table.index('next_retry_at');
  });

  await knex.raw(`
    ALTER TABLE pending_transfers ADD CONSTRAINT chk_pending_transfers_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  `);

  await knex.raw(`
    CREATE INDEX idx_pending_transfers_retry
    ON pending_transfers (status, next_retry_at) WHERE status = 'pending';
  `);

  await knex.raw(`
    CREATE TRIGGER update_pending_transfers_updated_at
    BEFORE UPDATE ON pending_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 60. PAYOUT_SCHEDULES
  await knex.schema.createTable('payout_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('stripe_account_id', 255).notNullable();
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable();
    table.string('schedule_type', 50).notNullable().defaultTo('manual');
    table.integer('minimum_amount').defaultTo(1000);
    table.date('next_payout_date').nullable();
    table.boolean('enabled').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('stripe_account_id');
    table.index('recipient_id');
  });

  await knex.raw(`
    CREATE TRIGGER update_payout_schedules_updated_at
    BEFORE UPDATE ON payout_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 61. CONNECTED_ACCOUNTS
  await knex.schema.createTable('connected_accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('stripe_account_id', 255).unique().notNullable();
    table.string('account_type', 50).notNullable();
    table.uuid('owner_id').notNullable();
    table.string('business_type', 50).nullable();
    table.boolean('charges_enabled').defaultTo(false);
    table.boolean('payouts_enabled').defaultTo(false);
    table.boolean('details_submitted').defaultTo(false);
    table.string('onboarding_status', 50).defaultTo('pending');
    table.string('country', 2).defaultTo('US');
    table.string('default_currency', 3).defaultTo('usd');
    table.jsonb('requirements').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('owner_id');
    table.index('onboarding_status');
  });

  await knex.raw(`
    ALTER TABLE connected_accounts ADD CONSTRAINT chk_connected_accounts_status
    CHECK (onboarding_status IN ('pending', 'in_progress', 'complete', 'restricted', 'disabled'));
  `);

  await knex.raw(`
    CREATE TRIGGER update_connected_accounts_updated_at
    BEFORE UPDATE ON connected_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TENANT TABLES - DISPUTES / JOBS
  // ============================================================================

  // 62. PAYMENT_DISPUTES
  await knex.schema.createTable('payment_disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_id').notNullable();
    table.string('stripe_dispute_id', 50).notNullable().unique();
    table.string('stripe_charge_id', 50).notNullable();
    table.integer('amount').notNullable();
    table.string('reason', 50).nullable();
    table.string('status', 50).notNullable().defaultTo('needs_response');
    table.timestamp('evidence_due_by').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('closed_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('payment_id');
    table.index('stripe_dispute_id');
    table.index('status');
    table.index('created_at');
  });

  await knex.raw(`
    CREATE INDEX idx_payment_disputes_tenant_status
    ON payment_disputes (tenant_id, status);
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_disputes_updated_at
    BEFORE UPDATE ON payment_disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 63. PAYOUT_EVENTS
  await knex.schema.createTable('payout_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('stripe_account_id', 50).notNullable();
    table.string('payout_id', 50).notNullable();
    table.string('event_type', 30).notNullable();
    table.integer('amount').notNullable();
    table.string('failure_code', 50).nullable();
    table.string('failure_message', 500).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('stripe_account_id');
    table.index('payout_id');
    table.index('event_type');
    table.index('created_at');
  });

  await knex.raw(`
    CREATE INDEX idx_payout_events_account_type_created
    ON payout_events (stripe_account_id, event_type, created_at);
  `);

  // 64. BACKGROUND_JOBS
  await knex.schema.createTable('background_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 30).notNullable().defaultTo('pending');
    table.integer('attempts').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.timestamp('process_after').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('failed_at').nullable();
    table.text('last_error').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('type');
    table.index('status');
    table.index('created_at');
  });

  await knex.raw(`
    CREATE INDEX idx_background_jobs_pending
    ON background_jobs (status, process_after, attempts);
  `);

  await knex.raw(`
    CREATE TRIGGER update_background_jobs_updated_at
    BEFORE UPDATE ON background_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 65. PAYMENT_AUDIT_LOG
  await knex.schema.createTable('payment_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('event_type', 100).notNullable();
    table.string('stripe_event_id', 50).nullable();
    table.string('transfer_id', 50).nullable();
    table.string('payout_id', 50).nullable();
    table.string('dispute_id', 50).nullable();
    table.integer('amount').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('event_type');
    table.index('stripe_event_id');
    table.index('created_at');
  });

  // ============================================================================
  // TENANT TABLES - SNAPSHOTS
  // ============================================================================

  // 66. BALANCE_TRANSACTION_SNAPSHOTS
  await knex.schema.createTable('balance_transaction_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.date('snapshot_date').notNullable();
    table.jsonb('charges_data').notNullable();
    table.jsonb('transfers_data').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'snapshot_date']);
    table.index('tenant_id');
  });

  await knex.raw(`
    CREATE INDEX idx_balance_snapshots_date
    ON balance_transaction_snapshots (tenant_id, snapshot_date DESC);
  `);

  // ============================================================================
  // TENANT TABLES - PAYMENT ATTEMPTS
  // ============================================================================

  // 67. PAYMENT_ATTEMPTS
  await knex.schema.createTable('payment_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('payment_intent_id').notNullable();
    table.uuid('user_id').notNullable();
    table.integer('attempt_number').notNullable();
    table.string('status', 50).notNullable();
    table.string('failure_code', 100).nullable();
    table.text('failure_message').nullable();
    table.string('payment_method_type', 50).nullable();
    table.timestamp('attempted_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('tenant_id');
    table.index('payment_intent_id');
    table.index('user_id');
  });

  // ============================================================================
  // INTERNAL FOREIGN KEY CONSTRAINTS
  // ============================================================================

  console.log('🔗 Adding internal foreign key constraints...');

  // payment_refunds → payment_transactions
  await knex.schema.alterTable('payment_refunds', (table) => {
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('RESTRICT');
  });

  // royalty_discrepancies → royalty_reconciliation_runs, royalty_distributions
  await knex.schema.alterTable('royalty_discrepancies', (table) => {
    table.foreign('reconciliation_run_id').references('id').inTable('royalty_reconciliation_runs').onDelete('CASCADE');
    table.foreign('distribution_id').references('id').inTable('royalty_distributions').onDelete('SET NULL');
  });

  // group_payment_members → group_payments
  await knex.schema.alterTable('group_payment_members', (table) => {
    table.foreign('group_payment_id').references('id').inTable('group_payments').onDelete('CASCADE');
  });

  // reminder_history → group_payments, group_payment_members
  await knex.schema.alterTable('reminder_history', (table) => {
    table.foreign('group_id').references('id').inTable('group_payments').onDelete('CASCADE');
    table.foreign('member_id').references('id').inTable('group_payment_members').onDelete('CASCADE');
  });

  // tax_collections → payment_transactions
  await knex.schema.alterTable('tax_collections', (table) => {
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
  });

  // fraud_checks → payment_transactions
  await knex.schema.alterTable('fraud_checks', (table) => {
    table.foreign('payment_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
  });

  // fraud_review_queue → fraud_checks
  await knex.schema.alterTable('fraud_review_queue', (table) => {
    table.foreign('fraud_check_id').references('id').inTable('fraud_checks').onDelete('SET NULL');
  });

  // ml_fraud_predictions → ml_fraud_models
  await knex.schema.alterTable('ml_fraud_predictions', (table) => {
    table.foreign('model_id').references('id').inTable('ml_fraud_models').onDelete('RESTRICT');
  });

  // escrow_release_conditions → payment_escrows
  await knex.schema.alterTable('escrow_release_conditions', (table) => {
    table.foreign('escrow_id').references('id').inTable('payment_escrows').onDelete('CASCADE');
  });

  // escrow_events → escrow_accounts
  await knex.schema.alterTable('escrow_events', (table) => {
    table.foreign('escrow_id').references('id').inTable('escrow_accounts').onDelete('CASCADE');
  });

  // payment_reserves → payment_transactions
  await knex.schema.alterTable('payment_reserves', (table) => {
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
  });

  // nft_mint_queue → payment_transactions
  await knex.schema.alterTable('nft_mint_queue', (table) => {
    table.foreign('payment_id').references('id').inTable('payment_transactions').onDelete('SET NULL');
  });

  // payment_state_transitions → payment_intents
  await knex.schema.alterTable('payment_state_transitions', (table) => {
    table.foreign('payment_id').references('id').inTable('payment_intents').onDelete('CASCADE');
  });

  // payment_disputes → payment_transactions
  await knex.schema.alterTable('payment_disputes', (table) => {
    table.foreign('payment_id').references('id').inTable('payment_transactions').onDelete('RESTRICT');
  });

  console.log('✅ Internal FK constraints added');

  // ============================================================================
  // EXTERNAL FOREIGN KEY CONSTRAINTS (as comments - cross-service)
  // ============================================================================

  /*
  EXTERNAL FK REFERENCES - These reference tables in other services:
  
  -- payment_transactions
  -- table.foreign('venue_id').references('id').inTable('venues')
  -- table.foreign('user_id').references('id').inTable('users')
  -- table.foreign('event_id').references('id').inTable('events')
  
  -- payment_intents
  -- table.foreign('order_id').references('id').inTable('orders')
  -- table.foreign('venue_id').references('id').inTable('venues')
  
  -- venue_balances, venue_royalty_settings, venue_price_rules
  -- table.foreign('venue_id').references('id').inTable('venues')
  
  -- event_royalty_settings, waiting_room_activity, event_purchase_limits
  -- table.foreign('event_id').references('id').inTable('events')
  
  -- royalty_distributions, royalty_payouts, group_payments, etc.
  -- table.foreign('user_id').references('id').inTable('users')
  
  -- resale_listings
  -- table.foreign('ticket_id').references('id').inTable('tickets')
  
  -- stripe_transfers, pending_transfers
  -- table.foreign('order_id').references('id').inTable('orders')
  */

  // ============================================================================
  // ROW LEVEL SECURITY - TENANT TABLES
  // ============================================================================

  console.log('🔒 Enabling Row Level Security...');

  const tenantTables = [
    'payment_transactions',
    'payment_refunds',
    'payment_intents',
    'venue_balances',
    'venue_royalty_settings',
    'event_royalty_settings',
    'royalty_distributions',
    'royalty_payouts',
    'royalty_reconciliation_runs',
    'royalty_discrepancies',
    'royalty_reversals',
    'group_payments',
    'group_payment_members',
    'reminder_history',
    'tax_collections',
    'tax_forms_1099da',
    'user_tax_info',
    'fraud_checks',
    'device_activity',
    'bot_detections',
    'known_scalpers',
    'behavioral_analytics',
    'velocity_limits',
    'velocity_records',
    'fraud_rules',
    'fraud_review_queue',
    'ml_fraud_predictions',
    'account_takeover_signals',
    'scalper_reports',
    'aml_checks',
    'sanctions_list_matches',
    'pep_database',
    'suspicious_activity_reports',
    'waiting_room_activity',
    'event_purchase_limits',
    'purchase_limit_violations',
    'payment_escrows',
    'escrow_release_conditions',
    'escrow_accounts',
    'escrow_events',
    'venue_price_rules',
    'resale_listings',
    'payment_reserves',
    'payment_chargebacks',
    'inventory_reservations',
    'payment_notifications',
    'nft_mint_queue',
    'outbox_dlq',
    'payment_event_sequence',
    'payment_state_transitions',
    'webhook_inbox',
    'outbound_webhooks',
    'payment_idempotency',
    'reconciliation_reports',
    'settlement_batches',
    'payment_retries',
    'stripe_transfers',
    'pending_transfers',
    'payout_schedules',
    'connected_accounts',
    'payment_disputes',
    'payout_events',
    'background_jobs',
    'payment_audit_log',
    'balance_transaction_snapshots',
    'payment_attempts',
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
  console.log('✅ Payment service consolidated migration complete!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back payment service migration...');

  // Drop RLS policies
  const tenantTables = [
    'payment_attempts',
    'balance_transaction_snapshots',
    'payment_audit_log',
    'background_jobs',
    'payout_events',
    'payment_disputes',
    'connected_accounts',
    'payout_schedules',
    'pending_transfers',
    'stripe_transfers',
    'payment_retries',
    'settlement_batches',
    'reconciliation_reports',
    'payment_idempotency',
    'outbound_webhooks',
    'webhook_inbox',
    'payment_state_transitions',
    'payment_event_sequence',
    'outbox_dlq',
    'nft_mint_queue',
    'payment_notifications',
    'inventory_reservations',
    'payment_chargebacks',
    'payment_reserves',
    'resale_listings',
    'venue_price_rules',
    'escrow_events',
    'escrow_accounts',
    'escrow_release_conditions',
    'payment_escrows',
    'purchase_limit_violations',
    'event_purchase_limits',
    'waiting_room_activity',
    'suspicious_activity_reports',
    'pep_database',
    'sanctions_list_matches',
    'aml_checks',
    'scalper_reports',
    'account_takeover_signals',
    'ml_fraud_predictions',
    'fraud_review_queue',
    'fraud_rules',
    'velocity_records',
    'velocity_limits',
    'behavioral_analytics',
    'known_scalpers',
    'bot_detections',
    'device_activity',
    'fraud_checks',
    'user_tax_info',
    'tax_forms_1099da',
    'tax_collections',
    'reminder_history',
    'group_payment_members',
    'group_payments',
    'royalty_reversals',
    'royalty_discrepancies',
    'royalty_reconciliation_runs',
    'royalty_payouts',
    'royalty_distributions',
    'event_royalty_settings',
    'venue_royalty_settings',
    'venue_balances',
    'payment_intents',
    'payment_refunds',
    'payment_transactions',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order (dependencies first)
  await knex.schema.dropTableIfExists('payment_attempts');
  await knex.schema.dropTableIfExists('balance_transaction_snapshots');
  await knex.schema.dropTableIfExists('payment_audit_log');
  await knex.schema.dropTableIfExists('background_jobs');
  await knex.schema.dropTableIfExists('payout_events');
  await knex.schema.dropTableIfExists('payment_disputes');
  await knex.schema.dropTableIfExists('connected_accounts');
  await knex.schema.dropTableIfExists('payout_schedules');
  await knex.schema.dropTableIfExists('pending_transfers');
  await knex.schema.dropTableIfExists('stripe_transfers');
  await knex.schema.dropTableIfExists('payment_retries');
  await knex.schema.dropTableIfExists('settlement_batches');
  await knex.schema.dropTableIfExists('reconciliation_reports');
  await knex.schema.dropTableIfExists('payment_idempotency');
  await knex.schema.dropTableIfExists('outbound_webhooks');
  await knex.schema.dropTableIfExists('webhook_inbox');
  await knex.schema.dropTableIfExists('payment_state_transitions');
  await knex.schema.dropTableIfExists('payment_event_sequence');
  await knex.schema.dropTableIfExists('outbox_dlq');
  await knex.schema.dropTableIfExists('nft_mint_queue');
  await knex.schema.dropTableIfExists('payment_notifications');
  await knex.schema.dropTableIfExists('inventory_reservations');
  await knex.schema.dropTableIfExists('payment_chargebacks');
  await knex.schema.dropTableIfExists('payment_reserves');
  await knex.schema.dropTableIfExists('resale_listings');
  await knex.schema.dropTableIfExists('venue_price_rules');
  await knex.schema.dropTableIfExists('escrow_events');
  await knex.schema.dropTableIfExists('escrow_accounts');
  await knex.schema.dropTableIfExists('escrow_release_conditions');
  await knex.schema.dropTableIfExists('payment_escrows');
  await knex.schema.dropTableIfExists('purchase_limit_violations');
  await knex.schema.dropTableIfExists('event_purchase_limits');
  await knex.schema.dropTableIfExists('waiting_room_activity');
  await knex.schema.dropTableIfExists('suspicious_activity_reports');
  await knex.schema.dropTableIfExists('pep_database');
  await knex.schema.dropTableIfExists('sanctions_list_matches');
  await knex.schema.dropTableIfExists('aml_checks');
  await knex.schema.dropTableIfExists('scalper_reports');
  await knex.schema.dropTableIfExists('account_takeover_signals');
  await knex.schema.dropTableIfExists('ml_fraud_predictions');
  await knex.schema.dropTableIfExists('fraud_review_queue');
  await knex.schema.dropTableIfExists('fraud_rules');
  await knex.schema.dropTableIfExists('velocity_records');
  await knex.schema.dropTableIfExists('velocity_limits');
  await knex.schema.dropTableIfExists('behavioral_analytics');
  await knex.schema.dropTableIfExists('known_scalpers');
  await knex.schema.dropTableIfExists('bot_detections');
  await knex.schema.dropTableIfExists('device_activity');
  await knex.schema.dropTableIfExists('fraud_checks');
  await knex.schema.dropTableIfExists('user_tax_info');
  await knex.schema.dropTableIfExists('tax_forms_1099da');
  await knex.schema.dropTableIfExists('tax_collections');
  await knex.schema.dropTableIfExists('reminder_history');
  await knex.schema.dropTableIfExists('group_payment_members');
  await knex.schema.dropTableIfExists('group_payments');
  await knex.schema.dropTableIfExists('royalty_reversals');
  await knex.schema.dropTableIfExists('royalty_discrepancies');
  await knex.schema.dropTableIfExists('royalty_reconciliation_runs');
  await knex.schema.dropTableIfExists('royalty_payouts');
  await knex.schema.dropTableIfExists('royalty_distributions');
  await knex.schema.dropTableIfExists('event_royalty_settings');
  await knex.schema.dropTableIfExists('venue_royalty_settings');
  await knex.schema.dropTableIfExists('venue_balances');
  await knex.schema.dropTableIfExists('payment_intents');
  await knex.schema.dropTableIfExists('payment_refunds');
  await knex.schema.dropTableIfExists('payment_transactions');

  // Drop global tables
  await knex.schema.dropTableIfExists('card_fingerprints');
  await knex.schema.dropTableIfExists('ip_reputation');
  await knex.schema.dropTableIfExists('ml_fraud_models');
  await knex.schema.dropTableIfExists('payment_state_machine');

  // Drop enum types
  await knex.raw('DROP TYPE IF EXISTS escrow_status');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_user_total_spent()');
  await knex.raw('DROP FUNCTION IF EXISTS get_next_sequence_number(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS validate_payment_state_transition(VARCHAR, VARCHAR, VARCHAR)');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('✅ Payment service migration rolled back');
}
