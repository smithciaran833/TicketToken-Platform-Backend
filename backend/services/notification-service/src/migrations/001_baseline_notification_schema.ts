import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // =====================================================
  // CORE NOTIFICATION TABLES
  // =====================================================

  // Main notification history table
  await knex.schema.createTable('notification_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable();
    table.uuid('recipient_id').notNullable();
    table.enum('channel', ['email', 'sms', 'push', 'webhook']).notNullable();
    table.enum('type', ['transactional', 'marketing', 'system']).notNullable();
    table.enum('priority', ['critical', 'high', 'normal', 'low']).notNullable().defaultTo('normal');

    // Template and content
    table.string('template_name', 255);
    table.string('subject', 500);
    table.text('content');

    // Recipient info
    table.string('recipient_email', 255);
    table.string('recipient_phone', 50);
    table.string('recipient_name', 255);

    // Status tracking
    table.enum('status', ['pending', 'queued', 'sending', 'sent', 'failed', 'bounced', 'delivered']).notNullable().defaultTo('pending');

    // Delivery tracking
    table.string('delivery_status', 50).defaultTo('pending');
    table.integer('delivery_attempts').defaultTo(0);
    table.timestamp('last_attempt_at');
    table.timestamp('delivered_at');
    table.text('failed_reason');
    table.string('provider_message_id', 255);
    table.jsonb('provider_response');
    table.timestamp('retry_after');
    table.boolean('should_retry').defaultTo(true);

    // Timing
    table.timestamp('scheduled_for');
    table.timestamp('sent_at');
    table.timestamp('expires_at');

    // Metadata
    table.jsonb('metadata');
    table.integer('cost');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Indexes for notification_history
  await knex.raw('CREATE INDEX idx_notification_venue ON notification_history(venue_id)');
  await knex.raw('CREATE INDEX idx_notification_recipient ON notification_history(recipient_id)');
  await knex.raw('CREATE INDEX idx_notification_status ON notification_history(status)');
  await knex.raw('CREATE INDEX idx_notification_channel ON notification_history(channel)');
  await knex.raw('CREATE INDEX idx_notification_created ON notification_history(created_at DESC)');
  await knex.raw('CREATE INDEX idx_notification_scheduled ON notification_history(scheduled_for) WHERE scheduled_for IS NOT NULL');
  await knex.raw('CREATE INDEX idx_notification_delivery_status ON notification_history(delivery_status) WHERE delivery_status IN (\'pending\', \'retrying\')');
  await knex.raw('CREATE INDEX idx_notification_retry_after ON notification_history(retry_after) WHERE retry_after IS NOT NULL AND should_retry = true');
  await knex.raw('CREATE INDEX idx_notification_user_delivery ON notification_history(recipient_id, delivery_status, created_at DESC)');

  // =====================================================
  // CONSENT MANAGEMENT TABLES
  // =====================================================

  await knex.schema.createTable('consent_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('customer_id').notNullable();
    table.uuid('venue_id');
    table.enum('channel', ['email', 'sms', 'push', 'webhook']).notNullable();
    table.enum('type', ['transactional', 'marketing', 'system']).notNullable();
    table.enum('status', ['granted', 'revoked', 'pending']).notNullable().defaultTo('granted');

    table.timestamp('granted_at');
    table.timestamp('revoked_at');
    table.timestamp('expires_at');

    table.string('source', 100).notNullable();
    table.specificType('ip_address', 'INET');
    table.text('user_agent');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_consent_customer ON consent_records(customer_id)');
  await knex.raw('CREATE INDEX idx_consent_customer_channel ON consent_records(customer_id, channel)');
  await knex.raw('CREATE INDEX idx_consent_status ON consent_records(status)');
  await knex.raw('CREATE INDEX idx_consent_venue ON consent_records(venue_id) WHERE venue_id IS NOT NULL');

  // =====================================================
  // SUPPRESSION LIST TABLE
  // =====================================================

  await knex.schema.createTable('suppression_list', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('identifier', 255).notNullable();
    table.string('identifier_hash', 64).notNullable();
    table.enum('channel', ['email', 'sms', 'push', 'webhook']).notNullable();
    table.string('reason', 255).notNullable();

    table.timestamp('suppressed_at').defaultTo(knex.fn.now());
    table.uuid('suppressed_by');
    table.timestamp('expires_at');

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['identifier_hash', 'channel']);
  });

  await knex.raw('CREATE INDEX idx_suppression_hash ON suppression_list(identifier_hash, channel)');
  await knex.raw('CREATE INDEX idx_suppression_expires ON suppression_list(expires_at) WHERE expires_at IS NOT NULL');

  // =====================================================
  // USER PREFERENCES TABLES
  // =====================================================

  await knex.schema.createTable('notification_preferences', (table) => {
    table.uuid('user_id').primary();

    // Channel toggles
    table.boolean('email_enabled').defaultTo(true);
    table.boolean('sms_enabled').defaultTo(false);
    table.boolean('push_enabled').defaultTo(true);

    // Category preferences
    table.boolean('email_payment').defaultTo(true);
    table.boolean('email_marketing').defaultTo(false);
    table.boolean('email_event_updates').defaultTo(true);
    table.boolean('email_account').defaultTo(true);

    table.boolean('sms_critical_only').defaultTo(true);
    table.boolean('sms_payment').defaultTo(true);
    table.boolean('sms_event_reminders').defaultTo(true);

    table.boolean('push_payment').defaultTo(true);
    table.boolean('push_event_updates').defaultTo(true);
    table.boolean('push_marketing').defaultTo(false);

    // Quiet hours
    table.boolean('quiet_hours_enabled').defaultTo(false);
    table.time('quiet_hours_start');
    table.time('quiet_hours_end');
    table.string('timezone', 50).defaultTo('UTC');

    // Frequency limits
    table.integer('max_emails_per_day').defaultTo(50);
    table.integer('max_sms_per_day').defaultTo(10);

    // Unsubscribe
    table.string('unsubscribe_token', 255).unique().defaultTo(knex.raw('gen_random_uuid()::text'));
    table.timestamp('unsubscribed_at');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_preferences_unsubscribe_token ON notification_preferences(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL');
  await knex.raw('CREATE INDEX idx_preferences_unsubscribed ON notification_preferences(unsubscribed_at) WHERE unsubscribed_at IS NOT NULL');

  // Preference change history
  await knex.schema.createTable('notification_preference_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable();
    table.uuid('changed_by');
    table.jsonb('changes').notNullable();
    table.string('reason', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('user_id').references('notification_preferences.user_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_preference_history_user ON notification_preference_history(user_id, created_at DESC)');

  // =====================================================
  // DELIVERY STATS TABLE
  // =====================================================

  await knex.schema.createTable('notification_delivery_stats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.date('date').notNullable();
    table.string('channel', 20).notNullable();
    table.string('provider', 50);

    table.integer('total_sent').defaultTo(0);
    table.integer('total_delivered').defaultTo(0);
    table.integer('total_failed').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_retried').defaultTo(0);
    table.integer('avg_delivery_time_ms');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['date', 'channel', 'provider']);
  });

  // =====================================================
  // ANALYTICS TABLES
  // =====================================================

  await knex.schema.createTable('notification_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.date('date').notNullable();
    table.integer('hour').notNullable().checkBetween([0, 23]);
    table.string('channel', 20).notNullable();
    table.string('type', 50);
    table.string('provider', 50);

    // Metrics
    table.integer('total_sent').defaultTo(0);
    table.integer('total_delivered').defaultTo(0);
    table.integer('total_failed').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_opened').defaultTo(0);
    table.integer('total_clicked').defaultTo(0);

    // Performance metrics
    table.integer('avg_delivery_time_ms');
    table.integer('min_delivery_time_ms');
    table.integer('max_delivery_time_ms');

    // Cost tracking (in cents)
    table.integer('total_cost').defaultTo(0);

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['date', 'hour', 'channel', 'type', 'provider']);
  });

  await knex.raw('CREATE INDEX idx_analytics_date_channel ON notification_analytics(date DESC, channel)');
  await knex.raw('CREATE INDEX idx_analytics_type ON notification_analytics(type, date DESC)');

  // User engagement tracking
  await knex.schema.createTable('notification_engagement', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('notification_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('channel', 20).notNullable();
    table.string('action', 50).notNullable();
    table.timestamp('action_timestamp').notNullable();
    table.jsonb('metadata');

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['notification_id', 'user_id', 'action']);
  });

  await knex.raw('CREATE INDEX idx_engagement_user ON notification_engagement(user_id, action_timestamp DESC)');
  await knex.raw('CREATE INDEX idx_engagement_notification ON notification_engagement(notification_id)');

  // Click tracking
  await knex.schema.createTable('notification_clicks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('notification_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('link_id', 100);
    table.text('original_url');
    table.timestamp('clicked_at').defaultTo(knex.fn.now());
    table.specificType('ip_address', 'INET');
    table.text('user_agent');
  });

  await knex.raw('CREATE INDEX idx_clicks_notification ON notification_clicks(notification_id)');
  await knex.raw('CREATE INDEX idx_clicks_user ON notification_clicks(user_id)');
  await knex.raw('CREATE INDEX idx_clicks_date ON notification_clicks(clicked_at)');

  // =====================================================
  // TEMPLATE MANAGEMENT TABLES
  // =====================================================

  await knex.schema.createTable('notification_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id');
    table.string('name', 255).notNullable();
    table.enum('channel', ['email', 'sms', 'push', 'webhook']).notNullable();
    table.enum('type', ['transactional', 'marketing', 'system']).notNullable();

    table.string('subject', 500);
    table.text('content').notNullable();
    table.text('html_content');
    table.specificType('variables', 'TEXT[]');

    table.boolean('is_active').defaultTo(true);
    table.integer('version').defaultTo(1);

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'name', 'version']);
  });

  await knex.raw('CREATE INDEX idx_templates_venue ON notification_templates(venue_id) WHERE venue_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_templates_channel ON notification_templates(channel)');
  await knex.raw('CREATE INDEX idx_templates_active ON notification_templates(is_active) WHERE is_active = true');

  // =====================================================
  // ENHANCED CAMPAIGN MANAGEMENT TABLES
  // =====================================================

  await knex.schema.createTable('notification_campaigns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable();
    table.string('name', 255).notNullable();
    table.enum('type', ['transactional', 'marketing', 'system']).notNullable();
    table.enum('channel', ['email', 'sms', 'push', 'webhook']).notNullable();
    table.uuid('template_id');
    table.uuid('segment_id'); // Link to audience segment

    table.jsonb('audience_filter');
    table.timestamp('scheduled_for');
    table.enum('status', ['draft', 'scheduled', 'sending', 'completed', 'cancelled', 'paused']).notNullable().defaultTo('draft');

    // A/B Testing
    table.boolean('is_ab_test').defaultTo(false);
    table.uuid('ab_test_id');
    table.string('ab_variant', 10); // 'A', 'B', 'C', etc.

    // Statistics
    table.integer('stats_total').defaultTo(0);
    table.integer('stats_sent').defaultTo(0);
    table.integer('stats_delivered').defaultTo(0);
    table.integer('stats_failed').defaultTo(0);
    table.integer('stats_opened').defaultTo(0);
    table.integer('stats_clicked').defaultTo(0);
    table.integer('stats_converted').defaultTo(0);
    table.integer('stats_unsubscribed').defaultTo(0);

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('template_id').references('notification_templates.id').onDelete('SET NULL');
  });

  await knex.raw('CREATE INDEX idx_campaigns_venue ON notification_campaigns(venue_id)');
  await knex.raw('CREATE INDEX idx_campaigns_status ON notification_campaigns(status)');
  await knex.raw('CREATE INDEX idx_campaigns_scheduled ON notification_campaigns(scheduled_for) WHERE scheduled_for IS NOT NULL');
  await knex.raw('CREATE INDEX idx_campaigns_ab_test ON notification_campaigns(ab_test_id) WHERE ab_test_id IS NOT NULL');

  // =====================================================
  // AUDIENCE SEGMENTATION
  // =====================================================

  await knex.schema.createTable('audience_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().index();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.jsonb('filter_criteria').notNullable();
    table.integer('member_count').defaultTo(0);
    table.timestamp('last_calculated_at').nullable();
    table.boolean('is_dynamic').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_audience_segments_venue ON audience_segments(venue_id)');

  // =====================================================
  // EMAIL AUTOMATION TRIGGERS
  // =====================================================

  await knex.schema.createTable('email_automation_triggers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().index();
    table.string('name', 255).notNullable();
    table.string('trigger_type', 50).notNullable(); // abandoned_cart, post_purchase, event_reminder, birthday, etc.
    table.uuid('template_id').notNullable();
    table.jsonb('trigger_conditions').notNullable();
    table.integer('delay_minutes').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.integer('sent_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('template_id').references('notification_templates.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_automation_triggers_venue ON email_automation_triggers(venue_id)');
  await knex.raw('CREATE INDEX idx_automation_triggers_type ON email_automation_triggers(trigger_type, is_active)');

  // =====================================================
  // A/B TESTING
  // =====================================================

  await knex.schema.createTable('ab_tests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().index();
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('test_type', 50).notNullable(); // subject_line, content, send_time, from_name
    table.integer('variant_count').notNullable().defaultTo(2);
    table.integer('sample_size_per_variant');
    table.string('winning_metric', 50).notNullable(); // open_rate, click_rate, conversion_rate
    table.uuid('winner_variant_id');
    table.enum('status', ['draft', 'running', 'completed', 'cancelled']).defaultTo('draft');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_ab_tests_venue ON ab_tests(venue_id)');
  await knex.raw('CREATE INDEX idx_ab_tests_status ON ab_tests(status)');

  await knex.schema.createTable('ab_test_variants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ab_test_id').notNullable();
    table.string('variant_name', 50).notNullable(); // 'A', 'B', 'Control'
    table.uuid('template_id');
    table.jsonb('variant_data'); // Stores what's different (subject line, content, etc.)
    table.integer('sent_count').defaultTo(0);
    table.integer('opened_count').defaultTo(0);
    table.integer('clicked_count').defaultTo(0);
    table.integer('converted_count').defaultTo(0);
    table.decimal('open_rate', 5, 2);
    table.decimal('click_rate', 5, 2);
    table.decimal('conversion_rate', 5, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('ab_test_id').references('ab_tests.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_ab_test_variants_test ON ab_test_variants(ab_test_id)');

  // =====================================================
  // ABANDONED CART TRACKING
  // =====================================================

  await knex.schema.createTable('abandoned_carts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().index();
    table.uuid('venue_id').notNullable();
    table.uuid('event_id').notNullable();
    table.jsonb('cart_items').notNullable();
    table.integer('total_amount_cents');
    table.timestamp('abandoned_at').defaultTo(knex.fn.now());
    table.boolean('recovery_email_sent').defaultTo(false);
    table.timestamp('recovery_email_sent_at');
    table.boolean('converted').defaultTo(false);
    table.timestamp('converted_at');
    table.uuid('order_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_abandoned_carts_user ON abandoned_carts(user_id, abandoned_at DESC)');
  await knex.raw('CREATE INDEX idx_abandoned_carts_unsent ON abandoned_carts(abandoned_at) WHERE recovery_email_sent = false AND converted = false');

  // =====================================================
  // VENUE SETTINGS TABLE
  // =====================================================

  await knex.schema.createTable('venue_notification_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('venue_id').notNullable().unique();

    // Rate limits
    table.integer('daily_email_limit');
    table.integer('daily_sms_limit');
    table.integer('monthly_email_limit');
    table.integer('monthly_sms_limit');

    table.specificType('blocked_channels', 'VARCHAR(20)[]');
    table.string('default_timezone', 50).defaultTo('UTC');

    // Quiet hours (24-hour format)
    table.integer('quiet_hours_start').checkBetween([0, 23]);
    table.integer('quiet_hours_end').checkBetween([0, 23]);

    // Contact info
    table.string('reply_to_email', 255);
    table.string('sms_callback_number', 50);

    // Webhooks
    table.text('webhook_url');
    table.string('webhook_secret', 255);

    // Branding
    table.jsonb('custom_branding');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_settings_venue ON venue_notification_settings(venue_id)');

  // =====================================================
  // NOTIFICATION COSTS TABLE
  // =====================================================

  await knex.schema.createTable('notification_costs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('notification_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('channel', 20).notNullable();
    table.string('provider', 50).notNullable();

    table.integer('cost').notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('billing_period', 20);
    table.boolean('is_platform_cost').defaultTo(false);

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('notification_id').references('notification_history.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_costs_notification ON notification_costs(notification_id)');
  await knex.raw('CREATE INDEX idx_costs_venue ON notification_costs(venue_id)');
  await knex.raw('CREATE INDEX idx_costs_period ON notification_costs(billing_period)');

  // =====================================================
  // FUNCTIONS
  // =====================================================

  // Analytics aggregation function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION aggregate_notification_analytics()
    RETURNS void AS $$
    BEGIN
        INSERT INTO notification_analytics (
            date, hour, channel, type, provider,
            total_sent, total_delivered, total_failed, total_bounced
        )
        SELECT
            DATE(created_at) as date,
            EXTRACT(HOUR FROM created_at)::INTEGER as hour,
            channel,
            type,
            metadata->>'provider' as provider,
            COUNT(*) FILTER (WHERE delivery_status = 'sent') as total_sent,
            COUNT(*) FILTER (WHERE delivery_status = 'delivered') as total_delivered,
            COUNT(*) FILTER (WHERE delivery_status = 'failed') as total_failed,
            COUNT(*) FILTER (WHERE delivery_status = 'bounced') as total_bounced
        FROM notification_history
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at), channel, type, metadata->>'provider'
        ON CONFLICT (date, hour, channel, type, provider)
        DO UPDATE SET
            total_sent = EXCLUDED.total_sent,
            total_delivered = EXCLUDED.total_delivered,
            total_failed = EXCLUDED.total_failed,
            total_bounced = EXCLUDED.total_bounced,
            updated_at = CURRENT_TIMESTAMP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // =====================================================
  // TRIGGERS FOR UPDATED_AT
  // =====================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw('CREATE TRIGGER update_notification_history_updated_at BEFORE UPDATE ON notification_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_notification_campaigns_updated_at BEFORE UPDATE ON notification_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_venue_notification_settings_updated_at BEFORE UPDATE ON venue_notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_audience_segments_updated_at BEFORE UPDATE ON audience_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_email_automation_triggers_updated_at BEFORE UPDATE ON email_automation_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  await knex.raw('CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON ab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS update_ab_tests_updated_at ON ab_tests');
  await knex.raw('DROP TRIGGER IF EXISTS update_email_automation_triggers_updated_at ON email_automation_triggers');
  await knex.raw('DROP TRIGGER IF EXISTS update_audience_segments_updated_at ON audience_segments');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_history_updated_at ON notification_history');
  await knex.raw('DROP TRIGGER IF EXISTS update_consent_records_updated_at ON consent_records');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_campaigns_updated_at ON notification_campaigns');
  await knex.raw('DROP TRIGGER IF EXISTS update_venue_notification_settings_updated_at ON venue_notification_settings');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  await knex.raw('DROP FUNCTION IF EXISTS aggregate_notification_analytics()');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('abandoned_carts');
  await knex.schema.dropTableIfExists('ab_test_variants');
  await knex.schema.dropTableIfExists('ab_tests');
  await knex.schema.dropTableIfExists('email_automation_triggers');
  await knex.schema.dropTableIfExists('audience_segments');
  await knex.schema.dropTableIfExists('notification_costs');
  await knex.schema.dropTableIfExists('venue_notification_settings');
  await knex.schema.dropTableIfExists('notification_campaigns');
  await knex.schema.dropTableIfExists('notification_templates');
  await knex.schema.dropTableIfExists('notification_clicks');
  await knex.schema.dropTableIfExists('notification_engagement');
  await knex.schema.dropTableIfExists('notification_analytics');
  await knex.schema.dropTableIfExists('notification_delivery_stats');
  await knex.schema.dropTableIfExists('notification_preference_history');
  await knex.schema.dropTableIfExists('notification_preferences');
  await knex.schema.dropTableIfExists('suppression_list');
  await knex.schema.dropTableIfExists('consent_records');
  await knex.schema.dropTableIfExists('notification_history');
}
