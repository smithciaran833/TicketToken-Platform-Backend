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
    table.uuid('order_id').nullable().index();
    table.string('type', 50).notNullable().index();
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
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('idempotency_key').nullable();
    table.uuid('tenant_id').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
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

  // 8. ROYALTY_DISTRIBUTIONS
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

  // 14. REMINDER_HISTORY (Group payment reminders)
  await knex.schema.createTable('reminder_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('group_id').notNullable().references('id').inTable('group_payments').index();
    table.uuid('member_id').notNullable().references('id').inTable('group_payment_members').index();
    table.integer('reminder_number').notNullable();
    table.timestamp('sent_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================================
  // TAX & COMPLIANCE TABLES
  // ============================================================================

  // 15. TAX_COLLECTIONS
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

  // 16. TAX_FORMS_1099DA
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

  // 17. USER_TAX_INFO
  await knex.schema.createTable('user_tax_info', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().unique().index();
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
  // FRAUD DETECTION TABLES
  // ============================================================================

  // 18. FRAUD_CHECKS
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

  // 19. DEVICE_ACTIVITY
  await knex.schema.createTable('device_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('device_fingerprint', 255).notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.string('activity_type', 100).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // 20. BOT_DETECTIONS
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

  // 21. KNOWN_SCALPERS
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

  // 22. IP_REPUTATION
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

  // 23. BEHAVIORAL_ANALYTICS
  await knex.schema.createTable('behavioral_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('session_id').notNullable().index();
    table.string('event_type', 100).notNullable();
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

  // 24. VELOCITY_LIMITS
  await knex.schema.createTable('velocity_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
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

  // 25. VELOCITY_RECORDS (Fraud velocity tracking)
  await knex.schema.createTable('velocity_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.string('ip_address', 45).nullable();
    table.string('payment_method_token', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_velocity_records_user_time ON velocity_records(user_id, created_at);
  `);

  // 26. FRAUD_RULES
  await knex.schema.createTable('fraud_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('rule_name', 255).notNullable().unique();
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
  });

  await knex.raw(`
    CREATE INDEX idx_fraud_rules_active ON fraud_rules(is_active, priority);
  `);

  await knex.raw(`
    CREATE TRIGGER update_fraud_rules_updated_at
    BEFORE UPDATE ON fraud_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 27. FRAUD_REVIEW_QUEUE
  await knex.schema.createTable('fraud_review_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('payment_id').nullable().index();
    table.uuid('fraud_check_id').nullable().references('id').inTable('fraud_checks');
    table.string('reason', 500).notNullable();
    table.string('priority', 20).notNullable().defaultTo('medium');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.uuid('assigned_to').nullable();
    table.text('reviewer_notes').nullable();
    table.jsonb('review_metadata').nullable();
    table.timestamp('reviewed_at').nullable();
    table.string('decision', 50).nullable();
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

  // 28. CARD_FINGERPRINTS
  await knex.schema.createTable('card_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('card_fingerprint', 255).notNullable().unique().index();
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

  await knex.raw(`
    CREATE TRIGGER update_card_fingerprints_updated_at
    BEFORE UPDATE ON card_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 29. ML_FRAUD_MODELS
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

  // 30. ML_FRAUD_PREDICTIONS
  await knex.schema.createTable('ml_fraud_predictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('model_id').notNullable().references('id').inTable('ml_fraud_models').index();
    table.uuid('transaction_id').nullable().index();
    table.uuid('user_id').notNullable().index();
    table.decimal('fraud_probability', 5, 4).notNullable();
    table.string('predicted_class', 20).notNullable();
    table.jsonb('feature_values').notNullable();
    table.jsonb('feature_importance').nullable();
    table.integer('prediction_time_ms').nullable();
    table.boolean('actual_fraud').nullable();
    table.timestamp('feedback_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  await knex.raw(`
    CREATE INDEX idx_ml_fraud_predictions_high_risk ON ml_fraud_predictions(fraud_probability) WHERE fraud_probability > 0.7;
  `);

  // 31. ACCOUNT_TAKEOVER_SIGNALS
  await knex.schema.createTable('account_takeover_signals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('session_id').notNullable();
    table.string('signal_type', 100).notNullable();
    table.integer('risk_score').notNullable();
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

  // 32. SCALPER_REPORTS
  await knex.schema.createTable('scalper_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('reporter_id').notNullable().index();
    table.uuid('suspected_scalper_id').notNullable().index();
    table.jsonb('evidence').nullable();
    table.text('description').nullable();
    table.string('status', 50).notNullable().defaultTo('pending_review');
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
  // AML (ANTI-MONEY LAUNDERING) TABLES
  // ============================================================================

  // 33. AML_CHECKS
  await knex.schema.createTable('aml_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.decimal('amount', 10, 2).notNullable();
    table.string('transaction_type', 50).notNullable();
    table.boolean('passed').notNullable().defaultTo(true);
    table.jsonb('flags').defaultTo('[]');
    table.decimal('risk_score', 3, 2).notNullable().defaultTo(0);
    table.boolean('requires_review').defaultTo(false).index();
    table.timestamp('checked_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_aml_checks_user_date ON aml_checks(user_id, checked_at DESC);
  `);

  await knex.raw(`
    CREATE INDEX idx_aml_checks_review ON aml_checks(requires_review) WHERE requires_review = true;
  `);

  // 34. SANCTIONS_LIST_MATCHES
  await knex.schema.createTable('sanctions_list_matches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.string('list_name', 100).notNullable();
    table.string('matched_name', 255).notNullable();
    table.decimal('confidence_score', 3, 2).nullable();
    table.boolean('active').defaultTo(true).index();
    table.text('reviewer_notes').nullable();
    table.uuid('reviewed_by').nullable();
    table.timestamp('reviewed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_sanctions_list_user_active ON sanctions_list_matches(user_id, active);
  `);

  await knex.raw(`
    CREATE TRIGGER update_sanctions_list_matches_updated_at
    BEFORE UPDATE ON sanctions_list_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 35. PEP_DATABASE
  await knex.schema.createTable('pep_database', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
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
  });

  await knex.raw(`
    ALTER TABLE pep_database ADD CONSTRAINT chk_pep_risk_level
    CHECK (risk_level IN ('low', 'medium', 'high'));
  `);

  await knex.raw(`
    CREATE INDEX idx_pep_database_user ON pep_database(user_id);
  `);

  await knex.raw(`
    CREATE INDEX idx_pep_database_risk ON pep_database(risk_level) WHERE risk_level IN ('medium', 'high');
  `);

  await knex.raw(`
    CREATE TRIGGER update_pep_database_updated_at
    BEFORE UPDATE ON pep_database
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 36. SUSPICIOUS_ACTIVITY_REPORTS
  await knex.schema.createTable('suspicious_activity_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('sar_id', 100).notNullable().unique();
    table.uuid('user_id').notNullable().index();
    table.specificType('transaction_ids', 'UUID[]').notNullable();
    table.text('activity_description').notNullable();
    table.timestamp('filing_deadline').notNullable().index();
    table.string('status', 50).notNullable().defaultTo('pending').index();
    table.timestamp('filed_at').nullable();
    table.string('fincen_confirmation', 255).nullable();
    table.uuid('filed_by').nullable();
    table.text('internal_notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE suspicious_activity_reports ADD CONSTRAINT chk_sar_status
    CHECK (status IN ('pending', 'filed', 'rejected', 'under_review'));
  `);

  await knex.raw(`
    CREATE INDEX idx_sar_user ON suspicious_activity_reports(user_id);
  `);

  await knex.raw(`
    CREATE INDEX idx_sar_status ON suspicious_activity_reports(status, filing_deadline);
  `);

  await knex.raw(`
    CREATE TRIGGER update_suspicious_activity_reports_updated_at
    BEFORE UPDATE ON suspicious_activity_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // HIGH-DEMAND / WAITING ROOM TABLES
  // ============================================================================

  // 37. WAITING_ROOM_ACTIVITY
  await knex.schema.createTable('waiting_room_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('action', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });

  // 38. EVENT_PURCHASE_LIMITS
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
  // MARKETPLACE / ESCROW TABLES
  // ============================================================================

  // 39. PAYMENT_ESCROWS (Marketplace escrow for resales)
  await knex.schema.createTable('payment_escrows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('listing_id').notNullable().index();
    table.uuid('buyer_id').notNullable().index();
    table.uuid('seller_id').notNullable().index();
    table.integer('amount').notNullable();
    table.integer('seller_payout').nullable();
    table.integer('venue_royalty').nullable();
    table.integer('platform_fee').nullable();
    table.string('stripe_payment_intent_id', 255).nullable();
    table.string('status', 50).notNullable();
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

  // 40. ESCROW_RELEASE_CONDITIONS
  await knex.schema.createTable('escrow_release_conditions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('escrow_id').notNullable().references('id').inTable('payment_escrows').index();
    table.string('condition_type', 100).notNullable();
    table.boolean('required').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 41. VENUE_PRICE_RULES (Marketplace price enforcement)
  await knex.schema.createTable('venue_price_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().unique().index();
    table.decimal('max_resale_multiplier', 5, 2).defaultTo(3.0);
    table.decimal('min_price_multiplier', 5, 2).defaultTo(1.0);
    table.boolean('allow_below_face').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER update_venue_price_rules_updated_at
    BEFORE UPDATE ON venue_price_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // 42. RESALE_LISTINGS (Marketplace resale listings)
  await knex.schema.createTable('resale_listings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().index();
    table.uuid('ticket_id').notNullable().index();
    table.uuid('seller_id').notNullable().index();
    table.integer('price').notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER update_resale_listings_updated_at
    BEFORE UPDATE ON resale_listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // CHARGEBACK / RESERVES TABLES
  // ============================================================================

  // 43. PAYMENT_RESERVES (Chargeback reserves)
  await knex.schema.createTable('payment_reserves', (table) => {
    table.uuid('reserve_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().index();
    table.integer('reserve_amount_cents').notNullable();
    table.integer('used_amount_cents').defaultTo(0);
    table.string('status', 50).notNullable();
    table.uuid('tenant_id').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('released_at').nullable();
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

  // ============================================================================
  // INVENTORY / NOTIFICATIONS TABLES
  // ============================================================================

  // 44. INVENTORY_RESERVATIONS (Ticket holds during checkout)
  await knex.schema.createTable('inventory_reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().index();
    table.string('status', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
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

  // 45. PAYMENT_NOTIFICATIONS (Transaction status notifications)
  await knex.schema.createTable('payment_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.uuid('transaction_id').nullable().index();
    table.string('notification_type', 100).notNullable();
    table.text('message').notNullable();
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ============================================================================
  // BLOCKCHAIN / NFT TABLES
  // ============================================================================

  // 46. NFT_MINT_QUEUE
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

  // 47. OUTBOX_DLQ
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

  // 48. PAYMENT_EVENT_SEQUENCE
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

  // 49. PAYMENT_STATE_TRANSITIONS
  await knex.schema.createTable('payment_state_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').notNullable().references('id').inTable('payment_intents').index();
    table.uuid('order_id').nullable().index();
    table.string('from_state', 50).nullable();
    table.string('to_state', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
  });

  // 50. PAYMENT_STATE_MACHINE
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

  // ============================================================================
  // WEBHOOK TABLES
  // ============================================================================

  // 51. WEBHOOK_INBOX
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

  // 52. WEBHOOK_EVENTS
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

  // 53. PAYMENT_IDEMPOTENCY
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

  // 54. RECONCILIATION_REPORTS
  const hasReconciliationReports = await knex.schema.hasTable('reconciliation_reports');
  if (!hasReconciliationReports) {
    await knex.schema.createTable('reconciliation_reports', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.date('report_date').notNullable().index();
      table.timestamp('period_start').notNullable();
      table.timestamp('period_end').notNullable();
      table.jsonb('summary').notNullable();
      table.jsonb('discrepancies').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // 55. SETTLEMENT_BATCHES
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

  // 56. PAYMENT_RETRIES
  await knex.schema.createTable('payment_retries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_id').nullable().index();
    table.integer('attempt_number').nullable();
    table.string('status', 50).nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 57. PAYMENT_CHARGEBACKS
  await knex.schema.createTable('payment_chargebacks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
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

  // 58. PAYMENT_ATTEMPTS
  await knex.schema.createTable('payment_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('payment_intent_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.integer('attempt_number').notNullable();
    table.string('status', 50).notNullable();
    table.string('failure_code', 100).nullable();
    table.text('failure_message').nullable();
    table.string('payment_method_type', 50).nullable();
    table.timestamp('attempted_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 59. PURCHASE_LIMIT_VIOLATIONS
  await knex.schema.createTable('purchase_limit_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('event_id').notNullable().index();
    table.string('violation_type', 50).notNullable();
    table.integer('attempted_quantity').notNullable();
    table.integer('limit_value').notNullable();
    table.string('ip_address', 45).nullable();
    table.string('device_fingerprint', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 60. OUTBOUND_WEBHOOKS
  await knex.schema.createTable('outbound_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
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
  });

  await knex.raw(`
    CREATE TRIGGER update_outbound_webhooks_updated_at
    BEFORE UPDATE ON outbound_webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ============================================================================
  // STORED PROCEDURES / FUNCTIONS
  // ============================================================================

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

  // ============================================================================
  // USER AGGREGATE TRIGGERS
  // ============================================================================

  // Function to update user total_spent and lifetime_value on payment completion
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_user_total_spent()
    RETURNS TRIGGER AS $$
    BEGIN
      -- When payment completes successfully, add to user's total_spent
      IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'completed' AND NEW.deleted_at IS NULL THEN
        -- Check if users table exists before attempting update
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          UPDATE users
          SET 
            total_spent = total_spent + NEW.amount,
            lifetime_value = lifetime_value + NEW.amount,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.user_id;
        END IF;
        
      -- When payment is refunded, subtract from user's total_spent
      ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'refunded' THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
          UPDATE users
          SET 
            total_spent = GREATEST(total_spent - NEW.amount, 0),
            lifetime_value = GREATEST(lifetime_value - NEW.amount, 0),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.user_id;
        END IF;
        
      -- When payment is soft-deleted, subtract from total
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

  // Create trigger on payment_transactions table
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_user_total_spent ON payment_transactions;
    CREATE TRIGGER trigger_update_user_total_spent
    AFTER INSERT OR UPDATE ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_total_spent();
  `);

  console.log('✅ User aggregate trigger (total_spent/lifetime_value) created on payment_transactions');

  // ============================================================================
  // FOREIGN KEY CONSTRAINTS
  // ============================================================================
  console.log('');
  console.log('🔗 Adding foreign key constraints...');

  await knex.schema.alterTable('payment_transactions', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('event_id').references('id').inTable('events').onDelete('RESTRICT');
  });
  console.log('✅ payment_transactions → venues, users, events');

  await knex.schema.alterTable('venue_balances', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
  });
  console.log('✅ venue_balances → venues');

  await knex.schema.alterTable('payment_intents', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
  });
  console.log('✅ payment_intents → orders, venues');

  await knex.schema.alterTable('venue_royalty_settings', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ venue_royalty_settings → venues');

  await knex.schema.alterTable('event_royalty_settings', (table) => {
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });
  console.log('✅ event_royalty_settings → events');

  await knex.schema.alterTable('royalty_distributions', (table) => {
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
    table.foreign('event_id').references('id').inTable('events').onDelete('RESTRICT');
    table.foreign('recipient_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ royalty_distributions → payment_transactions, events, users');

  await knex.schema.alterTable('royalty_payouts', (table) => {
    table.foreign('recipient_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ royalty_payouts → users');

  await knex.schema.alterTable('group_payments', (table) => {
    table.foreign('organizer_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('event_id').references('id').inTable('events').onDelete('RESTRICT');
  });
  console.log('✅ group_payments → users, events');

  await knex.schema.alterTable('group_payment_members', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ group_payment_members → users');

  await knex.schema.alterTable('tax_forms_1099da', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ tax_forms_1099da → users');

  await knex.schema.alterTable('user_tax_info', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('w9_verified_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ user_tax_info → users');

  await knex.schema.alterTable('fraud_checks', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('payment_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
  });
  console.log('✅ fraud_checks → users, payment_transactions');

  await knex.schema.alterTable('device_activity', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ device_activity → users');

  await knex.schema.alterTable('bot_detections', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ bot_detections → users');

  await knex.schema.alterTable('known_scalpers', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ known_scalpers → users');

  await knex.schema.alterTable('fraud_review_queue', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('payment_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
    table.foreign('assigned_to').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ fraud_review_queue → users, payment_transactions');

  await knex.schema.alterTable('account_takeover_signals', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ account_takeover_signals → users');

  await knex.schema.alterTable('scalper_reports', (table) => {
    table.foreign('reporter_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('suspected_scalper_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ scalper_reports → users');

  await knex.schema.alterTable('aml_checks', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ aml_checks → users');

  await knex.schema.alterTable('sanctions_list_matches', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ sanctions_list_matches → users');

  await knex.schema.alterTable('pep_database', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('verified_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ pep_database → users');

  await knex.schema.alterTable('suspicious_activity_reports', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('filed_by').references('id').inTable('users').onDelete('SET NULL');
  });
  console.log('✅ suspicious_activity_reports → users');

  await knex.schema.alterTable('waiting_room_activity', (table) => {
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  console.log('✅ waiting_room_activity → events, users');

  await knex.schema.alterTable('nft_mint_queue', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
    table.foreign('event_id').references('id').inTable('events').onDelete('RESTRICT');
  });
  console.log('✅ nft_mint_queue → venues, events');

  await knex.schema.alterTable('payment_state_transitions', (table) => {
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
  });
  console.log('✅ payment_state_transitions → orders');

  await knex.schema.alterTable('payment_reserves', (table) => {
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('CASCADE');
  });
  console.log('✅ payment_reserves → payment_transactions');

  await knex.schema.alterTable('payment_escrows', (table) => {
    table.foreign('buyer_id').references('id').inTable('users').onDelete('RESTRICT');
    table.foreign('seller_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ payment_escrows → users');

  await knex.schema.alterTable('resale_listings', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('RESTRICT');
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
    table.foreign('seller_id').references('id').inTable('users').onDelete('RESTRICT');
  });
  console.log('✅ resale_listings → venues, tickets, users');

  await knex.schema.alterTable('venue_price_rules', (table) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ venue_price_rules → venues');

  await knex.schema.alterTable('payment_notifications', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('transaction_id').references('id').inTable('payment_transactions').onDelete('SET NULL');
  });
  console.log('✅ payment_notifications → users, payment_transactions');

  console.log('');
  console.log('✅ All FK constraints added');

  // Audit trigger for payment_transactions table (compliance & fraud tracking)
  const functionExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'audit_trigger_function'
    );
  `);

  if (!functionExists.rows[0].exists) {
    console.warn('⚠️  audit_trigger_function not found - run auth-service migrations first');
  } else {
    await knex.raw(`
      DROP TRIGGER IF EXISTS audit_payment_transactions_changes ON payment_transactions;
      CREATE TRIGGER audit_payment_transactions_changes
        AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
        FOR EACH ROW 
        EXECUTE FUNCTION audit_trigger_function();
    `);
    console.log('✅ Audit trigger attached to payment_transactions table');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS audit_payment_transactions_changes ON payment_transactions');
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_user_total_spent ON payment_transactions');

  await knex.raw('DROP FUNCTION IF EXISTS update_user_total_spent()');
  await knex.raw('DROP FUNCTION IF EXISTS get_next_sequence_number(UUID);');
  await knex.raw('DROP FUNCTION IF EXISTS validate_payment_state_transition(VARCHAR, VARCHAR, VARCHAR);');
  await knex.raw('DROP FUNCTION IF EXISTS update_webhook_inbox_updated_at();');

  await knex.schema.dropTableIfExists('payment_retries');
  await knex.schema.dropTableIfExists('settlement_batches');
  await knex.schema.dropTableIfExists('reconciliation_reports');
  await knex.schema.dropTableIfExists('payment_idempotency');
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('webhook_inbox');
  await knex.schema.dropTableIfExists('payment_state_machine');
  await knex.schema.dropTableIfExists('payment_state_transitions');
  await knex.schema.dropTableIfExists('payment_event_sequence');
  await knex.schema.dropTableIfExists('outbox_dlq');
  await knex.schema.dropTableIfExists('payment_notifications');
  await knex.schema.dropTableIfExists('inventory_reservations');
  await knex.schema.dropTableIfExists('payment_reserves');
  await knex.schema.dropTableIfExists('resale_listings');
  await knex.schema.dropTableIfExists('venue_price_rules');
  await knex.schema.dropTableIfExists('escrow_release_conditions');
  await knex.schema.dropTableIfExists('payment_escrows');
  await knex.schema.dropTableIfExists('nft_mint_queue');
  await knex.schema.dropTableIfExists('event_purchase_limits');
  await knex.schema.dropTableIfExists('waiting_room_activity');
  await knex.schema.dropTableIfExists('suspicious_activity_reports');
  await knex.schema.dropTableIfExists('pep_database');
  await knex.schema.dropTableIfExists('sanctions_list_matches');
  await knex.schema.dropTableIfExists('aml_checks');
  await knex.schema.dropTableIfExists('scalper_reports');
  await knex.schema.dropTableIfExists('account_takeover_signals');
  await knex.schema.dropTableIfExists('ml_fraud_predictions');
  await knex.schema.dropTableIfExists('ml_fraud_models');
  await knex.schema.dropTableIfExists('card_fingerprints');
  await knex.schema.dropTableIfExists('fraud_review_queue');
  await knex.schema.dropTableIfExists('fraud_rules');
  await knex.schema.dropTableIfExists('velocity_records');
  await knex.schema.dropTableIfExists('velocity_limits');
  await knex.schema.dropTableIfExists('behavioral_analytics');
  await knex.schema.dropTableIfExists('ip_reputation');
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
  await knex.schema.dropTableIfExists('royalty_discrepancies');
  await knex.schema.dropTableIfExists('royalty_reconciliation_runs');
  await knex.schema.dropTableIfExists('royalty_payouts');
  await knex.schema.dropTableIfExists('royalty_distributions');
  await knex.schema.dropTableIfExists('event_royalty_settings');
  await knex.schema.dropTableIfExists('venue_royalty_settings');
  await knex.schema.dropTableIfExists('payment_intents');
  await knex.schema.dropTableIfExists('payment_refunds');
  await knex.schema.dropTableIfExists('venue_balances');
  await knex.schema.dropTableIfExists('payment_transactions');

  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column();');
}
