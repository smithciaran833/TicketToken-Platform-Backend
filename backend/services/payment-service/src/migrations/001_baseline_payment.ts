import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // HELPER FUNCTION: Create updated_at trigger
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

  // ============================================================================
  // CORE PAYMENT TABLES
  // ============================================================================

  // 1. PAYMENT_TRANSACTIONS (Main transactions table)
  await knex.schema.createTable('payment_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('status', 50).notNullable().index();
    table.decimal('platform_fee', 10, 2).notNullable();
    table.decimal('venue_payout', 10, 2).notNullable();
    table.decimal('gas_fee_paid', 10, 4).nullable();
    table.decimal('tax_amount', 10, 2).nullable();
    table.decimal('total_amount', 10, 2).nullable();
    table.string('stripe_payment_intent_id', 255).unique().nullable();
    table.string('paypal_order_id', 255).nullable();
    table.string('device_fingerprint', 255).nullable().index();
    table.string('payment_method_fingerprint', 255).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.uuid('tenant_id').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE payment_transactions ADD CONSTRAINT chk_payment_transactions_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'));
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX uq_payment_transactions_idempotency
    ON payment_transactions (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  await knex.raw(`
    CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 2. VENUE_BALANCES
  await knex.schema.createTable('venue_balances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().index();
    table.decimal('amount', 12, 2).defaultTo(0);
    table.string('balance_type', 50).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.timestamp('last_payout_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'balance_type']);
  });

  await knex.raw(`
    CREATE TRIGGER update_venue_balances_updated_at
    BEFORE UPDATE ON venue_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 3. PAYMENT_REFUNDS
  await knex.schema.createTable('payment_refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().references('id').inTable('payment_transactions').index();
    table.decimal('amount', 10, 2).notNullable();
    table.text('reason').nullable();
    table.string('status', 50).defaultTo('pending').index();
    table.string('stripe_refund_id', 255).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.uuid('tenant_id').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

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

  // 4. PAYMENT_INTENTS
  await knex.schema.createTable('payment_intents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().index();
    table.string('stripe_intent_id', 255).unique().nullable();
    table.string('external_id', 255).unique().nullable().index();
    table.string('client_secret', 500).nullable();
    table.string('processor', 50).nullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('status', 50).defaultTo('pending').index();
    table.decimal('platform_fee', 10, 2).nullable();
    table.uuid('venue_id').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.uuid('tenant_id').nullable();
    table.bigInteger('last_sequence_number').defaultTo(0);
    table.timestamp('last_event_timestamp').nullable();
    table.integer('version').defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // ============================================================================
  // MARKETPLACE TABLES
  // ============================================================================

  // 5. PAYMENT_ESCROWS
  await knex.schema.createTable('payment_escrows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('listing_id').notNullable();
    table.uuid('buyer_id').notNullable().index();
    table.uuid('seller_id').notNullable().index();
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('seller_payout', 10, 2).notNullable();
    table.decimal('venue_royalty', 10, 2).notNullable();
    table.decimal('platform_fee', 10, 2).notNullable();
    table.string('stripe_payment_intent_id', 255).nullable();
    table.string('status', 50).notNullable().index();
    table.jsonb('release_conditions').defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('released_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // ============================================================================
  // ROYALTY SYSTEM TABLES
  // ============================================================================

  // 6. VENUE_ROYALTY_SETTINGS
  await knex.schema.createTable('venue_royalty_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().unique().index();
    table.decimal('default_royalty_percentage', 5, 2).notNullable().defaultTo(10.00);
    table.integer('minimum_payout_amount_cents').notNullable().defaultTo(1000);
    table.string('payout_schedule', 20).notNullable().defaultTo('weekly');
    table.string('stripe_account_id', 255).nullable();
    table.string('payment_method', 50).defaultTo('stripe');
    table.boolean('auto_payout_enabled').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // 7. EVENT_ROYALTY_SETTINGS
  await knex.schema.createTable('event_royalty_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().unique().index();
    table.decimal('venue_royalty_percentage', 5, 2).nullable();
    table.decimal('artist_royalty_percentage', 5, 2).defaultTo(0);
    table.string('artist_wallet_address', 255).nullable();
    table.string('artist_stripe_account_id', 255).nullable();
    table.boolean('override_venue_default').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // 8. ROYALTY_DISTRIBUTIONS (Enhanced from original)
  await knex.schema.createTable('royalty_distributions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.string('transaction_type', 50).notNullable();
    table.string('recipient_type', 50).notNullable();
    table.uuid('recipient_id').notNullable().index();
    table.string('recipient_wallet_address', 255).nullable();
    table.decimal('amount_cents', 10, 2).notNullable();
    table.decimal('percentage', 5, 2).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending').index();
    table.string('blockchain_tx_hash', 255).nullable();
    table.string('stripe_transfer_id', 255).nullable();
    table.timestamp('paid_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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
    CREATE TRIGGER update_royalty_distributions_updated_at
    BEFORE UPDATE ON royalty_distributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 9. ROYALTY_PAYOUTS
  await knex.schema.createTable('royalty_payouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recipient_id').notNullable().index();
    table.string('recipient_type', 50).notNullable();
    table.decimal('amount_cents', 12, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.integer('distribution_count').notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending').index();
    table.string('stripe_payout_id', 255).nullable();
    table.string('failure_reason', 500).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('scheduled_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // 10. ROYALTY_RECONCILIATION_RUNS
  await knex.schema.createTable('royalty_reconciliation_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('reconciliation_date').notNullable().index();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.integer('transactions_checked').defaultTo(0);
    table.integer('discrepancies_found').defaultTo(0);
    table.integer('discrepancies_resolved').defaultTo(0);
    table.decimal('total_royalties_calculated', 12, 2).defaultTo(0);
    table.decimal('total_royalties_paid', 12, 2).defaultTo(0);
    table.decimal('variance_amount', 12, 2).defaultTo(0);
    table.string('status', 50).notNullable().defaultTo('running').index();
    table.integer('duration_ms').nullable();
    table.text('error_message').nullable();
    table.jsonb('summary').defaultTo('{}');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE royalty_reconciliation_runs ADD CONSTRAINT chk_royalty_reconciliation_status
    CHECK (status IN ('running', 'completed', 'failed'));
  `);

  // 11. ROYALTY_DISCREPANCIES
  await knex.schema.createTable('royalty_discrepancies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('reconciliation_run_id').notNullable().references('id').inTable('royalty_reconciliation_runs').index();
    table.uuid('transaction_id').notNullable().index();
    table.uuid('distribution_id').nullable().references('id').inTable('royalty_distributions');
    table.string('discrepancy_type', 100).notNullable();
    table.decimal('expected_amount', 10, 2).nullable();
    table.decimal('actual_amount', 10, 2).nullable();
    table.decimal('variance', 10, 2).nullable();
    table.string('status', 50).notNullable().defaultTo('identified').index();
    table.text('resolution_notes').nullable();
    table.uuid('resolved_by').nullable();
    table.timestamp('resolved_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE royalty_discrepancies ADD CONSTRAINT chk_royalty_discrepancies_status
    CHECK (status IN ('identified', 'investigating', 'resolved', 'disputed', 'closed'));
  `);

  await knex.raw(`
    ALTER TABLE royalty_discrepancies ADD CONSTRAINT chk_royalty_discrepancies_type
    CHECK (discrepancy_type IN ('missing_distribution', 'incorrect_amount', 'duplicate_payment', 'missing_blockchain_tx', 'failed_payout', 'calculation_error'));
  `);

  // ============================================================================
  // GROUP PAYMENT TABLES
  // ============================================================================

  // 12. GROUP_PAYMENTS
  await knex.schema.createTable('group_payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organizer_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.decimal('total_amount', 10, 2).notNullable();
    table.jsonb('ticket_selections').notNullable();
    table.string('status', 50).notNullable().index();
    table.timestamp('expires_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.string('cancellation_reason', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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
    table.uuid('group_payment_id').notNullable().references('id').inTable('group_payments');
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
  });

  await knex.raw(`
    CREATE TRIGGER update_group_payment_members_updated_at
    BEFORE UPDATE ON group_payment_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // TAX & COMPLIANCE TABLES
  // ============================================================================

  // 14. TAX_COLLECTIONS
  await knex.schema.createTable('tax_collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().references('id').inTable('payment_transactions');
    table.decimal('state_tax', 10, 2).notNullable();
    table.decimal('local_tax', 10, 2).notNullable();
    table.decimal('special_tax', 10, 2).defaultTo(0);
    table.decimal('total_tax', 10, 2).notNullable();
    table.string('jurisdiction', 255).nullable();
    table.jsonb('breakdown').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 15. TAX_FORMS_1099DA
  await knex.schema.createTable('tax_forms_1099da', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.integer('tax_year').notNullable();
    table.jsonb('form_data').notNullable();
    table.decimal('total_proceeds', 12, 2).notNullable();
    table.integer('transaction_count').notNullable();
    table.string('status', 50).defaultTo('generated');
    table.timestamp('generated_at').defaultTo(knex.fn.now());
    table.timestamp('sent_at').nullable();

    table.unique(['user_id', 'tax_year']);
  });

  // ============================================================================
  // FRAUD DETECTION TABLES
  // ============================================================================

  // 16. FRAUD_CHECKS
  await knex.schema.createTable('fraud_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('payment_id').nullable().index();
    table.string('device_fingerprint', 255).nullable().index();
    table.specificType('ip_address', 'INET').nullable();
    table.decimal('score', 3, 2).nullable();
    table.decimal('risk_score', 5, 2).nullable();
    table.jsonb('signals').nullable();
    table.jsonb('reasons').nullable();
    table.string('decision', 50).notNullable();
    table.string('check_type', 100).nullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now()).index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE fraud_checks ADD CONSTRAINT chk_fraud_checks_decision
    CHECK (decision IN ('approve', 'review', 'challenge', 'decline'));
  `);

  // 17. DEVICE_ACTIVITY
  await knex.schema.createTable('device_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('device_fingerprint', 255).notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.string('activity_type', 100).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // 18. BOT_DETECTIONS
  await knex.schema.createTable('bot_detections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable();
    table.string('session_id', 255).nullable();
    table.boolean('is_bot').notNullable();
    table.decimal('confidence', 3, 2).notNullable();
    table.specificType('indicators', 'TEXT[]').nullable();
    table.text('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 19. KNOWN_SCALPERS
  await knex.schema.createTable('known_scalpers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable();
    table.string('device_fingerprint', 255).nullable();
    table.text('reason').nullable();
    table.decimal('confidence_score', 3, 2).nullable();
    table.string('added_by', 255).nullable();
    table.boolean('active').defaultTo(true);
    table.timestamp('added_at').defaultTo(knex.fn.now());
  });

  // ============================================================================
  // ADVANCED FRAUD DETECTION ENHANCEMENTS
  // ============================================================================

  // 20. IP_REPUTATION
  await knex.schema.createTable('ip_reputation', (table) => {
    table.specificType('ip_address', 'INET').primary();
    table.integer('risk_score').notNullable().defaultTo(0); // 0-100
    table.string('reputation_status', 20).notNullable().defaultTo('clean'); // clean, suspicious, blocked
    table.integer('fraud_count').defaultTo(0);
    table.integer('total_transactions').defaultTo(0);
    table.boolean('is_proxy').defaultTo(false);
    table.boolean('is_vpn').defaultTo(false);
    table.boolean('is_tor').defaultTo(false);
    table.boolean('is_datacenter').defaultTo(false);
    table.string('country_code', 2).nullable();
    table.string('asn', 50).nullable(); // Autonomous System Number
    table.jsonb('geo_data').nullable();
    table.timestamp('last_seen').defaultTo(knex.fn.now());
    table.timestamp('first_seen').defaultTo(knex.fn.now());
    table.timestamp('blocked_at').nullable();
    table.string('blocked_reason', 500).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_ip_reputation_status ON ip_reputation(reputation_status);
  `);

  await knex.raw(`
    CREATE INDEX idx_ip_reputation_risk ON ip_reputation(risk_score) WHERE risk_score > 50;
  `);

  await knex.raw(`
    CREATE TRIGGER update_ip_reputation_updated_at
    BEFORE UPDATE ON ip_reputation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 21. BEHAVIORAL_ANALYTICS
  await knex.schema.createTable('behavioral_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('session_id').notNullable().index();
    table.string('event_type', 100).notNullable(); // page_view, click, hover, scroll, form_interaction
    table.string('page_url', 500).nullable();
    table.jsonb('event_data').nullable();
    table.integer('time_on_page_ms').nullable();
    table.integer('mouse_movements').nullable();
    table.integer('keystrokes').nullable();
    table.boolean('copy_paste_detected').defaultTo(false);
    table.boolean('form_autofill_detected').defaultTo(false);
    table.timestamp('timestamp').defaultTo(knex.fn.now()).index();
  });

  await knex.raw(`
    CREATE INDEX idx_behavioral_analytics_user_session ON behavioral_analytics(user_id, session_id);
  `);

  // 22. VELOCITY_LIMITS
  await knex.schema.createTable('velocity_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('entity_type', 50).notNullable(); // user, ip, card, device
    table.string('entity_id', 255).notNullable();
    table.string('action_type', 50).notNullable(); // purchase, login, api_call
    table.integer('limit_count').notNullable();
    table.integer('window_minutes').notNullable();
    table.integer('current_count').defaultTo(0);
    table.timestamp('window_start').defaultTo(knex.fn.now());
    table.timestamp('window_end').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['entity_type', 'entity_id', 'action_type']);
  });

  await knex.raw(`
    CREATE INDEX idx_velocity_limits_window ON velocity_limits(window_end) WHERE current_count >= limit_count;
  `);

  await knex.raw(`
    CREATE TRIGGER update_velocity_limits_updated_at
    BEFORE UPDATE ON velocity_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 23. FRAUD_RULES
  await knex.schema.createTable('fraud_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('rule_name', 255).notNullable().unique();
    table.text('description').nullable();
    table.string('rule_type', 50).notNullable(); // velocity, pattern, threshold, ml_score
    table.jsonb('conditions').notNullable();
    table.string('action', 50).notNullable(); // block, flag, review, score_adjust
    table.integer('priority').defaultTo(100); // Lower = higher priority
    table.boolean('is_active').defaultTo(true);
    table.integer('trigger_count').defaultTo(0);
    table.integer('block_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_rules_active ON fraud_rules(is_active, priority);
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_rules_updated_at
    BEFORE UPDATE ON fraud_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 24. FRAUD_REVIEW_QUEUE
  await knex.schema.createTable('fraud_review_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('payment_id').nullable().index();
    table.uuid('fraud_check_id').nullable().references('id').inTable('fraud_checks');
    table.string('reason', 500).notNullable();
    table.string('priority', 20).notNullable().defaultTo('medium'); // low, medium, high, critical
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, in_review, approved, declined, escalated
    table.uuid('assigned_to').nullable();
    table.text('reviewer_notes').nullable();
    table.jsonb('review_metadata').nullable();
    table.timestamp('reviewed_at').nullable();
    table.string('decision', 50).nullable(); // approve, decline, escalate, request_more_info
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_review_queue_status ON fraud_review_queue(status, priority);
  `);

  await knex.raw(`
    CREATE INDEX idx_fraud_review_queue_assigned ON fraud_review_queue(assigned_to) WHERE assigned_to IS NOT NULL;
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_review_queue_updated_at
    BEFORE UPDATE ON fraud_review_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 25. CARD_FINGERPRINTS
  await knex.schema.createTable('card_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('card_fingerprint', 255).notNullable().unique().index();
    table.string('bin', 6).nullable(); // Bank Identification Number (first 6 digits)
    table.string('last4', 4).nullable();
    table.string('card_brand', 50).nullable();
    table.string('issuing_bank', 255).nullable();
    table.string('card_type', 50).nullable(); // credit, debit, prepaid
    table.integer('successful_purchases').defaultTo(0);
    table.integer('failed_purchases').defaultTo(0);
    table.integer('chargeback_count').defaultTo(0);
    table.integer('fraud_count').defaultTo(0);
    table.decimal('total_amount_spent', 12, 2).defaultTo(0);
    table.string('risk_level', 20).defaultTo('unknown'); // low, medium, high, blocked
    table.timestamp('first_used').defaultTo(knex.fn.now());
    table.timestamp('last_used').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_card_fingerprints_risk ON card_fingerprints(risk_level) WHERE risk_level IN ('high', 'blocked');
  `);

  await knex.raw(`
    CREATE TRIGGER update_card_fingerprints_updated_at
    BEFORE UPDATE ON card_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 26. ML_FRAUD_MODELS
  await knex.schema.createTable('ml_fraud_models', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('model_name', 255).notNullable().unique();
    table.string('model_version', 50).notNullable();
    table.string('model_type', 50).notNullable(); // random_forest, neural_network, gradient_boosting
    table.text('description').nullable();
    table.jsonb('features').notNullable(); // List of features used
    table.jsonb('hyperparameters').nullable();
    table.decimal('accuracy', 5, 4).nullable();
    table.decimal('precision', 5, 4).nullable();
    table.decimal('recall', 5, 4).nullable();
    table.decimal('f1_score', 5, 4).nullable();
    table.integer('training_samples').nullable();
    table.string('status', 50).notNullable().defaultTo('training'); // training, active, deprecated, failed
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

  // 27. ML_FRAUD_PREDICTIONS
  await knex.schema.createTable('ml_fraud_predictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('model_id').notNullable().references('id').inTable('ml_fraud_models').index();
    table.uuid('transaction_id').nullable().index();
    table.uuid('user_id').notNullable().index();
    table.decimal('fraud_probability', 5, 4).notNullable(); // 0.0000 to 1.0000
    table.string('predicted_class', 20).notNullable(); // fraud, legitimate
    table.jsonb('feature_values').notNullable();
    table.jsonb('feature_importance').nullable();
    table.integer('prediction_time_ms').nullable();
    table.boolean('actual_fraud').nullable(); // For model training/evaluation
    table.timestamp('feedback_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  await knex.raw(`
    CREATE INDEX idx_ml_fraud_predictions_high_risk ON ml_fraud_predictions(fraud_probability) WHERE fraud_probability > 0.7;
  `);

  // 28. ACCOUNT_TAKEOVER_SIGNALS
  await knex.schema.createTable('account_takeover_signals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('session_id').notNullable();
    table.string('signal_type', 100).notNullable(); // new_device, new_location, password_change, etc.
    table.integer('risk_score').notNullable(); // 0-100
    table.jsonb('signal_data').nullable();
    table.boolean('is_anomaly').defaultTo(false);
    table.timestamp('timestamp').defaultTo(knex.fn.now()).index();
  });

  await knex.raw(`
    CREATE INDEX idx_account_takeover_signals_user ON account_takeover_signals(user_id, timestamp DESC);
  `);

  await knex.raw(`
    CREATE INDEX idx_account_takeover_signals_anomaly ON account_takeover_signals(is_anomaly) WHERE is_anomaly = true;
  `);

  // 29. SCALPER_REPORTS
  await knex.schema.createTable('scalper_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('reporter_id').notNullable().index();
    table.uuid('suspected_scalper_id').notNullable().index();
    table.jsonb('evidence').nullable();
    table.text('description').nullable();
    table.string('status', 50).notNullable().defaultTo('pending_review'); // pending_review, investigating, confirmed, dismissed
    table.uuid('reviewed_by').nullable();
    table.text('review_notes').nullable();
    table.timestamp('reviewed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_scalper_reports_status ON scalper_reports(status);
  `);

  await knex.raw(`
    CREATE INDEX idx_scalper_reports_suspected ON scalper_reports(suspected_scalper_id, status);
  `);

  // ============================================================================
  // HIGH-DEMAND / WAITING ROOM TABLES
  // ============================================================================

  // 30. WAITING_ROOM_ACTIVITY
  await knex.schema.createTable('waiting_room_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('action', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // 31. EVENT_PURCHASE_LIMITS
  await knex.schema.createTable('event_purchase_limits', (table) => {
    table.uuid('event_id').primary();
    table.integer('purchase_limit_per_user').defaultTo(4);
    table.integer('purchase_limit_per_payment_method').defaultTo(4);
    table.integer('purchase_limit_per_address').defaultTo(8);
    table.integer('max_tickets_per_order').defaultTo(4);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER update_event_purchase_limits_updated_at
    BEFORE UPDATE ON event_purchase_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // BLOCKCHAIN / NFT TABLES
  // ============================================================================

  // 32. NFT_MINT_QUEUE
  await knex.schema.createTable('nft_mint_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').nullable().references('id').inTable('payment_transactions').index();
    table.specificType('ticket_ids', 'UUID[]').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('blockchain', 50).notNullable();
    table.string('status', 50).defaultTo('queued').index();
    table.string('priority', 20).defaultTo('standard');
    table.string('transaction_hash', 255).nullable();
    table.decimal('gas_fee_paid', 10, 6).nullable();
    table.string('mint_batch_id', 255).nullable();
    table.integer('attempts').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER update_nft_mint_queue_updated_at
    BEFORE UPDATE ON nft_mint_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // EVENT SOURCING / OUTBOX PATTERN TABLES
  // ============================================================================

  // Create outbox table first
  await knex.schema.createTable('outbox', (table) => {
    table.increments('id').primary();
    table.uuid('aggregate_id').notNullable().index();
    table.string('aggregate_type', 100).notNullable();
    table.string('event_type', 100).notNullable().index();
    table.jsonb('payload').notNullable();
    table.integer('retry_count').defaultTo(0);
    table.boolean('processed').defaultTo(false).index();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('processed_at').nullable();
  });

  await knex.raw(`
    CREATE INDEX idx_outbox_unprocessed ON outbox(processed, created_at) WHERE processed = false;
  `);

  // Create outbox dead letter queue table
  await knex.schema.createTable('outbox_dlq', (table) => {
    table.increments('id').primary();
    table.integer('original_id').nullable();
    table.uuid('aggregate_id').notNullable();
    table.string('aggregate_type', 100).notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.integer('attempts').defaultTo(0);
    table.text('last_error').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('moved_to_dlq_at').defaultTo(knex.fn.now());
  });

  // 33. PAYMENT_EVENT_SEQUENCE
  await knex.schema.createTable('payment_event_sequence', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').notNullable();
    table.uuid('order_id').nullable();
    table.string('event_type', 100).notNullable();
    table.bigInteger('sequence_number').notNullable();
    table.timestamp('event_timestamp').notNullable().index();
    table.string('stripe_event_id', 255).unique().nullable();
    table.string('idempotency_key', 255).nullable();
    table.jsonb('payload').notNullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['payment_id', 'sequence_number']);
    table.unique(['payment_id', 'event_type', 'idempotency_key']);
  });

  await knex.raw(`
    CREATE INDEX idx_payment_event_sequence_payment ON payment_event_sequence(payment_id, sequence_number);
  `);
  await knex.raw(`
    CREATE INDEX idx_payment_event_sequence_unprocessed ON payment_event_sequence(processed_at) WHERE processed_at IS NULL;
  `);

  // 34. PAYMENT_STATE_TRANSITIONS
  await knex.schema.createTable('payment_state_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').notNullable().references('id').inTable('payment_intents').index();
    table.uuid('order_id').nullable().index();
    table.string('from_state', 50).nullable();
    table.string('to_state', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // 35. PAYMENT_STATE_MACHINE
  await knex.schema.createTable('payment_state_machine', (table) => {
    table.string('from_state', 50).notNullable();
    table.string('to_state', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.boolean('is_valid').defaultTo(true);

    table.primary(['from_state', 'to_state', 'event_type']);
  });

  // Insert valid state transitions
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

  // ============================================================================
  // WEBHOOK TABLES
  // ============================================================================

  // 36. WEBHOOK_INBOX
  await knex.schema.createTable('webhook_inbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider', 50).notNullable();
    table.string('event_id', 255).unique().notNullable();
    table.string('webhook_id', 255).unique().nullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.string('signature', 500).nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now()).index();
    table.timestamp('processed_at').nullable();
    table.string('status', 20).defaultTo('pending').index();
    table.integer('attempts').defaultTo(0);
    table.integer('retry_count').defaultTo(0);
    table.text('error_message').nullable();
    table.text('error').nullable();
    table.text('last_error').nullable();
    table.uuid('tenant_id').nullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_webhook_inbox_provider_event ON webhook_inbox(provider, event_id);
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_webhook_inbox_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS webhook_inbox_updated_at ON webhook_inbox;
    CREATE TRIGGER webhook_inbox_updated_at
      BEFORE UPDATE ON webhook_inbox
      FOR EACH ROW
      EXECUTE FUNCTION update_webhook_inbox_updated_at();
  `);

  // 37. WEBHOOK_EVENTS
  await knex.schema.createTable('webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_id', 255).unique().notNullable();
    table.string('processor', 50).notNullable().index();
    table.string('event_type', 100).notNullable().index();
    table.jsonb('payload').notNullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());
  });

  // ============================================================================
  // IDEMPOTENCY TABLE
  // ============================================================================

  // 38. PAYMENT_IDEMPOTENCY
  await knex.schema.createTable('payment_idempotency', (table) => {
    table.string('idempotency_key', 255).primary();
    table.string('operation', 100).notNullable();
    table.string('request_hash', 64).notNullable();
    table.jsonb('response').nullable();
    table.integer('status_code').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable().index();
  });

  // ============================================================================
  // RECONCILIATION & SETTLEMENT TABLES
  // ============================================================================

  // 39. RECONCILIATION_REPORTS
  await knex.schema.createTable('reconciliation_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('report_date').notNullable().index();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.jsonb('summary').notNullable();
    table.jsonb('discrepancies').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 40. SETTLEMENT_BATCHES
  await knex.schema.createTable('settlement_batches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').nullable().index();
    table.string('batch_number', 50).unique().nullable();
    table.decimal('total_amount', 10, 2).nullable();
    table.integer('payment_count').nullable();
    table.string('status', 50).defaultTo('pending').index();
    table.timestamp('processed_at').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 41. PAYMENT_RETRIES
  await knex.schema.createTable('payment_retries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').nullable().index();
    table.integer('attempt_number').nullable();
    table.string('status', 50).nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================================
  // STORED PROCEDURES / FUNCTIONS
  // ============================================================================

  // Function to validate state transitions
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_payment_state_transition(
      current_state VARCHAR(50),
      new_state VARCHAR(50),
      event_type VARCHAR(100)
    ) RETURNS BOOLEAN AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM payment_state_machine
        WHERE from_state = current_state
          AND to_state = new_state
          AND event_type = event_type
          AND is_valid = true
      );
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function to get next sequence number
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
}

export async function down(knex: Knex): Promise<void> {
  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS get_next_sequence_number(UUID);');
  await knex.raw('DROP FUNCTION IF EXISTS validate_payment_state_transition(VARCHAR, VARCHAR, VARCHAR);');
  await knex.raw('DROP FUNCTION IF EXISTS update_webhook_inbox_updated_at();');

  // Drop tables in reverse order (respecting foreign keys)
  await knex.schema.dropTableIfExists('payment_retries');
  await knex.schema.dropTableIfExists('settlement_batches');
  await knex.schema.dropTableIfExists('reconciliation_reports');
  await knex.schema.dropTableIfExists('payment_idempotency');
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('webhook_inbox');
  await knex.schema.dropTableIfExists('payment_state_machine');
  await knex.schema.dropTableIfExists('payment_state_transitions');
  await knex.schema.dropTableIfExists('payment_event_sequence');
  await knex.schema.dropTableIfExists('nft_mint_queue');
  await knex.schema.dropTableIfExists('event_purchase_limits');
  await knex.schema.dropTableIfExists('waiting_room_activity');
  await knex.schema.dropTableIfExists('scalper_reports');
  await knex.schema.dropTableIfExists('account_takeover_signals');
  await knex.schema.dropTableIfExists('ml_fraud_predictions');
  await knex.schema.dropTableIfExists('ml_fraud_models');
  await knex.schema.dropTableIfExists('card_fingerprints');
  await knex.schema.dropTableIfExists('fraud_review_queue');
  await knex.schema.dropTableIfExists('fraud_rules');
  await knex.schema.dropTableIfExists('velocity_limits');
  await knex.schema.dropTableIfExists('behavioral_analytics');
  await knex.schema.dropTableIfExists('ip_reputation');
  await knex.schema.dropTableIfExists('known_scalpers');
  await knex.schema.dropTableIfExists('bot_detections');
  await knex.schema.dropTableIfExists('device_activity');
  await knex.schema.dropTableIfExists('fraud_checks');
  await knex.schema.dropTableIfExists('tax_forms_1099da');
  await knex.schema.dropTableIfExists('tax_collections');
  await knex.schema.dropTableIfExists('group_payment_members');
  await knex.schema.dropTableIfExists('group_payments');
  await knex.schema.dropTableIfExists('royalty_discrepancies');
  await knex.schema.dropTableIfExists('royalty_reconciliation_runs');
  await knex.schema.dropTableIfExists('royalty_payouts');
  await knex.schema.dropTableIfExists('royalty_distributions');
  await knex.schema.dropTableIfExists('event_royalty_settings');
  await knex.schema.dropTableIfExists('venue_royalty_settings');
  await knex.schema.dropTableIfExists('payment_escrows');
  await knex.schema.dropTableIfExists('payment_intents');
  await knex.schema.dropTableIfExists('payment_refunds');
  await knex.schema.dropTableIfExists('venue_balances');
  await knex.schema.dropTableIfExists('payment_transactions');
}
