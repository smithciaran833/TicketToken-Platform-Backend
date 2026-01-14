import { Knex } from 'knex';

/**
 * Notification Service - Consolidated Baseline Migration
 * 
 * Generated: January 13, 2026
 * Consolidates: 001_baseline_notification_schema.ts, 002_add_rls_policies.ts, 
 *               20260103_add_rls_and_webhook_events.ts
 * 
 * Tables: 32 (28 tenant-scoped, 4 global)
 * 
 * Standards Applied:
 * - gen_random_uuid() for all UUIDs
 * - tenant_id on all tenant-scoped tables
 * - RLS with app.current_tenant_id + app.is_system_user
 * - External FKs converted to comments
 * - Internal FKs preserved
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // ENUMS
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'webhook');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_type AS ENUM ('transactional', 'marketing', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_priority AS ENUM ('critical', 'high', 'normal', 'low');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE scheduled_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE delivery_status AS ENUM ('pending', 'queued', 'sending', 'sent', 'failed', 'bounced', 'delivered');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE consent_status AS ENUM ('granted', 'revoked', 'pending');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE tracking_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'bounced');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'cancelled', 'paused');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE ab_test_status AS ENUM ('draft', 'running', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE execution_status AS ENUM ('completed', 'failed', 'in_progress');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE bounce_type AS ENUM ('hard', 'soft', 'complaint', 'transient');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE engagement_event_type AS ENUM ('open', 'click', 'conversion', 'unsubscribe', 'bounce', 'spam_report');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE deletion_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ============================================================================
  // FUNCTIONS
  // ============================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

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
        channel::text,
        type::text,
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

  // ============================================================================
  // GLOBAL TABLES (4) - No tenant_id, No RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // suppression_list - Global email/phone blocklist
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('suppression_list', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('identifier', 255).notNullable();
    table.string('identifier_hash', 64).notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.string('reason', 255).notNullable();
    table.timestamp('suppressed_at').defaultTo(knex.fn.now());
    table.uuid('suppressed_by').comment('FK: users.id');
    table.timestamp('expires_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['identifier_hash', 'channel']);
  });

  await knex.raw('CREATE INDEX idx_suppression_hash ON suppression_list(identifier_hash, channel)');
  await knex.raw('CREATE INDEX idx_suppression_expires ON suppression_list(expires_at) WHERE expires_at IS NOT NULL');

  // ---------------------------------------------------------------------------
  // notification_delivery_stats - Platform aggregate stats
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_delivery_stats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
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

  // ---------------------------------------------------------------------------
  // notification_analytics - Platform hourly stats
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_analytics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('date').notNullable();
    table.integer('hour').notNullable().checkBetween([0, 23]);
    table.string('channel', 20).notNullable();
    table.string('type', 50);
    table.string('provider', 50);
    table.integer('total_sent').defaultTo(0);
    table.integer('total_delivered').defaultTo(0);
    table.integer('total_failed').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_opened').defaultTo(0);
    table.integer('total_clicked').defaultTo(0);
    table.integer('avg_delivery_time_ms');
    table.integer('min_delivery_time_ms');
    table.integer('max_delivery_time_ms');
    table.integer('total_cost').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['date', 'hour', 'channel', 'type', 'provider']);
  });

  await knex.raw('CREATE INDEX idx_analytics_date_channel ON notification_analytics(date DESC, channel)');
  await knex.raw('CREATE INDEX idx_analytics_type ON notification_analytics(type, date DESC)');

  // ---------------------------------------------------------------------------
  // webhook_events - Provider webhook deduplication
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider', 50).notNullable();
    table.string('event_id', 255).notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload');
    table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['provider', 'event_id']);
  });

  await knex.raw('CREATE INDEX idx_webhook_events_provider_event_id ON webhook_events(provider, event_id)');
  await knex.raw('CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at)');

  // ============================================================================
  // TENANT-SCOPED TABLES (28) - All have tenant_id + RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // scheduled_notifications
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('scheduled_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').comment('FK: orders.id');
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.string('notification_type', 100).notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('status', 'scheduled_status').notNullable().defaultTo('PENDING');
    table.timestamp('scheduled_for').notNullable();
    table.timestamp('sent_at');
    table.timestamp('last_attempted_at');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.string('recipient', 255);
    table.string('subject', 500);
    table.text('text_body');
    table.text('html_body');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_scheduled_notifications_tenant ON scheduled_notifications(tenant_id)');
  await knex.raw('CREATE INDEX idx_scheduled_notifications_user ON scheduled_notifications(user_id)');
  await knex.raw('CREATE INDEX idx_scheduled_notifications_order ON scheduled_notifications(order_id) WHERE order_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_scheduled_notifications_status ON scheduled_notifications(status)');
  await knex.raw('CREATE INDEX idx_scheduled_notifications_scheduled ON scheduled_notifications(scheduled_for) WHERE status = \'PENDING\'');
  await knex.raw('CREATE INDEX idx_scheduled_notifications_processing ON scheduled_notifications(status, scheduled_for) WHERE status = \'PENDING\'');

  await knex.raw('CREATE TRIGGER update_scheduled_notifications_updated_at BEFORE UPDATE ON scheduled_notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // notification_history
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.uuid('recipient_id').notNullable().comment('FK: users.id');
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('type', 'notification_type').notNullable();
    table.specificType('priority', 'notification_priority').notNullable().defaultTo('normal');
    table.string('template_name', 255);
    table.string('subject', 500);
    table.text('content');
    table.string('recipient_email', 255);
    table.string('recipient_phone', 50);
    table.string('recipient_name', 255);
    table.specificType('status', 'delivery_status').notNullable().defaultTo('pending');
    table.string('delivery_status', 50).defaultTo('pending');
    table.integer('delivery_attempts').defaultTo(0);
    table.timestamp('last_attempt_at');
    table.timestamp('delivered_at');
    table.timestamp('read_at').comment('When user opened/read the notification');
    table.text('failed_reason');
    table.string('provider_message_id', 255);
    table.jsonb('provider_response');
    table.timestamp('retry_after');
    table.boolean('should_retry').defaultTo(true);
    table.timestamp('scheduled_for');
    table.timestamp('sent_at');
    table.timestamp('expires_at');
    table.jsonb('metadata');
    table.integer('cost');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');
  });

  await knex.raw('CREATE INDEX idx_notification_history_tenant ON notification_history(tenant_id)');
  await knex.raw('CREATE INDEX idx_notification_venue ON notification_history(venue_id)');
  await knex.raw('CREATE INDEX idx_notification_recipient ON notification_history(recipient_id)');
  await knex.raw('CREATE INDEX idx_notification_status ON notification_history(status)');
  await knex.raw('CREATE INDEX idx_notification_channel ON notification_history(channel)');
  await knex.raw('CREATE INDEX idx_notification_created ON notification_history(created_at DESC)');
  await knex.raw('CREATE INDEX idx_notification_scheduled ON notification_history(scheduled_for) WHERE scheduled_for IS NOT NULL');
  await knex.raw('CREATE INDEX idx_notification_delivery_status ON notification_history(delivery_status) WHERE delivery_status IN (\'pending\', \'retrying\')');
  await knex.raw('CREATE INDEX idx_notification_retry_after ON notification_history(retry_after) WHERE retry_after IS NOT NULL AND should_retry = true');
  await knex.raw('CREATE INDEX idx_notification_user_delivery ON notification_history(recipient_id, delivery_status, created_at DESC)');

  await knex.raw('CREATE TRIGGER update_notification_history_updated_at BEFORE UPDATE ON notification_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // consent_records
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('consent_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('customer_id').notNullable().comment('FK: users.id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('type', 'notification_type').notNullable();
    table.specificType('status', 'consent_status').notNullable().defaultTo('granted');
    table.timestamp('granted_at');
    table.timestamp('revoked_at');
    table.timestamp('expires_at');
    table.string('source', 100).notNullable();
    table.specificType('ip_address', 'INET');
    table.text('user_agent');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_consent_tenant ON consent_records(tenant_id)');
  await knex.raw('CREATE INDEX idx_consent_customer ON consent_records(customer_id)');
  await knex.raw('CREATE INDEX idx_consent_customer_channel ON consent_records(customer_id, channel)');
  await knex.raw('CREATE INDEX idx_consent_status ON consent_records(status)');
  await knex.raw('CREATE INDEX idx_consent_venue ON consent_records(venue_id) WHERE venue_id IS NOT NULL');

  await knex.raw('CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // notification_preferences
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_preferences', (table) => {
    table.uuid('user_id').primary().comment('FK: users.id');
    table.uuid('tenant_id').notNullable();
    table.boolean('email_enabled').defaultTo(true);
    table.boolean('sms_enabled').defaultTo(false);
    table.boolean('push_enabled').defaultTo(true);
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
    table.boolean('quiet_hours_enabled').defaultTo(false);
    table.time('quiet_hours_start');
    table.time('quiet_hours_end');
    table.string('timezone', 50).defaultTo('UTC');
    table.integer('max_emails_per_day').defaultTo(50);
    table.integer('max_sms_per_day').defaultTo(10);
    table.string('unsubscribe_token', 255).unique().defaultTo(knex.raw('gen_random_uuid()::text'));
    table.timestamp('unsubscribed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_preferences_tenant ON notification_preferences(tenant_id)');
  await knex.raw('CREATE INDEX idx_preferences_unsubscribe_token ON notification_preferences(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL');
  await knex.raw('CREATE INDEX idx_preferences_unsubscribed ON notification_preferences(unsubscribed_at) WHERE unsubscribed_at IS NOT NULL');

  await knex.raw('CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // notification_preference_history
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_preference_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('changed_by').comment('FK: users.id');
    table.jsonb('changes').notNullable();
    table.string('reason', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('user_id').references('notification_preferences.user_id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_preference_history_tenant ON notification_preference_history(tenant_id)');
  await knex.raw('CREATE INDEX idx_preference_history_user ON notification_preference_history(user_id, created_at DESC)');

  // ---------------------------------------------------------------------------
  // notification_tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_tracking', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id');
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.uuid('recipient_id').notNullable().comment('FK: users.id');
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('status', 'tracking_status').notNullable().defaultTo('pending');
    table.string('provider_message_id', 255);
    table.timestamp('delivered_at');
    table.timestamp('opened_at');
    table.timestamp('clicked_at');
    table.integer('open_count').defaultTo(0);
    table.integer('click_count').defaultTo(0);
    table.jsonb('click_data');
    table.text('failure_reason');
    table.string('recipient_email', 255);
    table.text('recipient_email_encrypted');
    table.string('recipient_email_hash', 64);
    table.string('recipient_phone', 50);
    table.text('recipient_phone_encrypted');
    table.string('recipient_phone_hash', 64);
    table.timestamp('anonymized_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_notification_tracking_tenant ON notification_tracking(tenant_id)');
  await knex.raw('CREATE INDEX idx_notification_tracking_notification ON notification_tracking(notification_id) WHERE notification_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_notification_tracking_venue ON notification_tracking(venue_id)');
  await knex.raw('CREATE INDEX idx_notification_tracking_recipient ON notification_tracking(recipient_id)');
  await knex.raw('CREATE INDEX idx_notification_tracking_status ON notification_tracking(status)');
  await knex.raw('CREATE INDEX idx_notification_tracking_provider_id ON notification_tracking(provider_message_id) WHERE provider_message_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_notification_tracking_email_hash ON notification_tracking(recipient_email_hash) WHERE recipient_email_hash IS NOT NULL');

  // ---------------------------------------------------------------------------
  // notification_engagement
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_engagement', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.string('channel', 20).notNullable();
    table.string('action', 50).notNullable();
    table.timestamp('action_timestamp').notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['notification_id', 'user_id', 'action']);
    table.foreign('notification_id').references('notification_history.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_engagement_tenant ON notification_engagement(tenant_id)');
  await knex.raw('CREATE INDEX idx_engagement_user ON notification_engagement(user_id, action_timestamp DESC)');
  await knex.raw('CREATE INDEX idx_engagement_notification ON notification_engagement(notification_id)');

  // ---------------------------------------------------------------------------
  // notification_clicks
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_clicks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.string('link_id', 100);
    table.text('original_url');
    table.timestamp('clicked_at').defaultTo(knex.fn.now());
    table.specificType('ip_address', 'INET');
    table.text('user_agent');

    table.foreign('notification_id').references('notification_history.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_clicks_tenant ON notification_clicks(tenant_id)');
  await knex.raw('CREATE INDEX idx_clicks_notification ON notification_clicks(notification_id)');
  await knex.raw('CREATE INDEX idx_clicks_user ON notification_clicks(user_id)');
  await knex.raw('CREATE INDEX idx_clicks_date ON notification_clicks(clicked_at)');

  // ---------------------------------------------------------------------------
  // notification_templates
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('name', 255).notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('type', 'notification_type').notNullable();
    table.string('subject', 500);
    table.text('content').notNullable();
    table.text('html_content');
    table.specificType('variables', 'TEXT[]');
    table.boolean('is_active').defaultTo(true);
    table.integer('version').defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'venue_id', 'name', 'version']);
  });

  await knex.raw('CREATE INDEX idx_templates_tenant ON notification_templates(tenant_id)');
  await knex.raw('CREATE INDEX idx_templates_venue ON notification_templates(venue_id) WHERE venue_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_templates_channel ON notification_templates(channel)');
  await knex.raw('CREATE INDEX idx_templates_active ON notification_templates(is_active) WHERE is_active = true');

  await knex.raw('CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // notification_campaigns
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_campaigns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('name', 255).notNullable();
    table.specificType('type', 'notification_type').notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.uuid('template_id');
    table.uuid('segment_id');
    table.jsonb('audience_filter');
    table.timestamp('scheduled_for');
    table.specificType('status', 'campaign_status').notNullable().defaultTo('draft');
    table.boolean('is_ab_test').defaultTo(false);
    table.uuid('ab_test_id');
    table.string('ab_variant', 10);
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

  await knex.raw('CREATE INDEX idx_campaigns_tenant ON notification_campaigns(tenant_id)');
  await knex.raw('CREATE INDEX idx_campaigns_venue ON notification_campaigns(venue_id)');
  await knex.raw('CREATE INDEX idx_campaigns_status ON notification_campaigns(status)');
  await knex.raw('CREATE INDEX idx_campaigns_scheduled ON notification_campaigns(scheduled_for) WHERE scheduled_for IS NOT NULL');
  await knex.raw('CREATE INDEX idx_campaigns_ab_test ON notification_campaigns(ab_test_id) WHERE ab_test_id IS NOT NULL');

  await knex.raw('CREATE TRIGGER update_notification_campaigns_updated_at BEFORE UPDATE ON notification_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // audience_segments
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('audience_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('filter_criteria').notNullable();
    table.integer('member_count').defaultTo(0);
    table.timestamp('last_calculated_at');
    table.boolean('is_dynamic').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_audience_segments_tenant ON audience_segments(tenant_id)');
  await knex.raw('CREATE INDEX idx_audience_segments_venue ON audience_segments(venue_id)');

  await knex.raw('CREATE TRIGGER update_audience_segments_updated_at BEFORE UPDATE ON audience_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // email_automation_triggers
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('email_automation_triggers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('name', 255).notNullable();
    table.string('trigger_type', 50).notNullable();
    table.uuid('template_id').notNullable();
    table.jsonb('trigger_conditions').notNullable();
    table.integer('delay_minutes').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.integer('sent_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('template_id').references('notification_templates.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_automation_triggers_tenant ON email_automation_triggers(tenant_id)');
  await knex.raw('CREATE INDEX idx_automation_triggers_venue ON email_automation_triggers(venue_id)');
  await knex.raw('CREATE INDEX idx_automation_triggers_type ON email_automation_triggers(trigger_type, is_active)');

  await knex.raw('CREATE TRIGGER update_email_automation_triggers_updated_at BEFORE UPDATE ON email_automation_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // ab_tests
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ab_tests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('test_type', 50).notNullable();
    table.integer('variant_count').notNullable().defaultTo(2);
    table.integer('sample_size_per_variant');
    table.string('winning_metric', 50).notNullable();
    table.uuid('winner_variant_id');
    table.specificType('status', 'ab_test_status').defaultTo('draft');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_ab_tests_tenant ON ab_tests(tenant_id)');
  await knex.raw('CREATE INDEX idx_ab_tests_venue ON ab_tests(venue_id)');
  await knex.raw('CREATE INDEX idx_ab_tests_status ON ab_tests(status)');

  await knex.raw('CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON ab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // ab_test_variants
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ab_test_variants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ab_test_id').notNullable();
    table.string('variant_name', 50).notNullable();
    table.uuid('template_id');
    table.jsonb('variant_data');
    table.integer('sent_count').defaultTo(0);
    table.integer('opened_count').defaultTo(0);
    table.integer('clicked_count').defaultTo(0);
    table.integer('converted_count').defaultTo(0);
    table.decimal('open_rate', 5, 2);
    table.decimal('click_rate', 5, 2);
    table.decimal('conversion_rate', 5, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('ab_test_id').references('ab_tests.id').onDelete('CASCADE');
    table.foreign('template_id').references('notification_templates.id').onDelete('SET NULL');
  });

  await knex.raw('CREATE INDEX idx_ab_test_variants_tenant ON ab_test_variants(tenant_id)');
  await knex.raw('CREATE INDEX idx_ab_test_variants_test ON ab_test_variants(ab_test_id)');

  // ---------------------------------------------------------------------------
  // ab_test_metrics
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ab_test_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('test_id').notNullable();
    table.string('variant_id', 100).notNullable();
    table.string('metric_name', 100).notNullable();
    table.decimal('value', 12, 2).notNullable();
    table.timestamp('recorded_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_ab_test_metrics_tenant ON ab_test_metrics(tenant_id)');
  await knex.raw('CREATE INDEX idx_ab_test_metrics_test ON ab_test_metrics(test_id)');
  await knex.raw('CREATE INDEX idx_ab_test_metrics_variant ON ab_test_metrics(test_id, variant_id)');
  await knex.raw('CREATE INDEX idx_ab_test_metrics_recorded ON ab_test_metrics(recorded_at DESC)');

  // ---------------------------------------------------------------------------
  // automation_executions
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('automation_executions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('trigger_id').notNullable();
    table.timestamp('executed_at').notNullable();
    table.specificType('status', 'execution_status').notNullable().defaultTo('completed');
    table.text('error_message');
    table.jsonb('execution_details');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_automation_executions_tenant ON automation_executions(tenant_id)');
  await knex.raw('CREATE INDEX idx_automation_executions_trigger ON automation_executions(trigger_id)');
  await knex.raw('CREATE INDEX idx_automation_executions_executed ON automation_executions(executed_at DESC)');
  await knex.raw('CREATE INDEX idx_automation_executions_status ON automation_executions(status) WHERE status != \'completed\'');

  // ---------------------------------------------------------------------------
  // bounces
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('bounces', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('email', 255).notNullable();
    table.specificType('bounce_type', 'bounce_type').notNullable();
    table.text('bounce_reason');
    table.string('smtp_code', 10);
    table.timestamp('bounced_at').notNullable();
    table.jsonb('raw_data');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_bounces_tenant ON bounces(tenant_id)');
  await knex.raw('CREATE INDEX idx_bounces_notification ON bounces(notification_id) WHERE notification_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_bounces_venue ON bounces(venue_id) WHERE venue_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_bounces_email ON bounces(email)');
  await knex.raw('CREATE INDEX idx_bounces_type ON bounces(bounce_type)');
  await knex.raw('CREATE INDEX idx_bounces_bounced_at ON bounces(bounced_at DESC)');

  // ---------------------------------------------------------------------------
  // campaign_stats
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('campaign_stats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('campaign_id').notNullable().unique();
    table.integer('sent').defaultTo(0);
    table.integer('delivered').defaultTo(0);
    table.integer('opened').defaultTo(0);
    table.integer('clicked').defaultTo(0);
    table.integer('bounced').defaultTo(0);
    table.integer('unsubscribed').defaultTo(0);
    table.integer('revenue');
    table.decimal('open_rate', 5, 2);
    table.decimal('click_rate', 5, 2);
    table.decimal('conversion_rate', 5, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_campaign_stats_tenant ON campaign_stats(tenant_id)');
  await knex.raw('CREATE INDEX idx_campaign_stats_campaign ON campaign_stats(campaign_id)');

  // ---------------------------------------------------------------------------
  // engagement_events
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('engagement_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id').notNullable();
    table.specificType('event_type', 'engagement_event_type').notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_engagement_events_tenant ON engagement_events(tenant_id)');
  await knex.raw('CREATE INDEX idx_engagement_events_notification ON engagement_events(notification_id)');
  await knex.raw('CREATE INDEX idx_engagement_events_type ON engagement_events(event_type)');
  await knex.raw('CREATE INDEX idx_engagement_events_created ON engagement_events(created_at DESC)');

  // ---------------------------------------------------------------------------
  // notification_analytics_daily
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_analytics_daily', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.date('date').notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.integer('sent').defaultTo(0);
    table.integer('delivered').defaultTo(0);
    table.integer('opened').defaultTo(0);
    table.integer('clicked').defaultTo(0);
    table.integer('bounced').defaultTo(0);
    table.integer('failed').defaultTo(0);
    table.integer('cost').defaultTo(0);
    table.decimal('delivery_rate', 5, 2);
    table.decimal('open_rate', 5, 2);
    table.decimal('click_rate', 5, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'venue_id', 'date', 'channel']);
  });

  await knex.raw('CREATE INDEX idx_analytics_daily_tenant ON notification_analytics_daily(tenant_id)');
  await knex.raw('CREATE INDEX idx_analytics_daily_venue ON notification_analytics_daily(venue_id)');
  await knex.raw('CREATE INDEX idx_analytics_daily_date ON notification_analytics_daily(date DESC)');
  await knex.raw('CREATE INDEX idx_analytics_daily_channel ON notification_analytics_daily(channel)');

  // ---------------------------------------------------------------------------
  // pending_deletions
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('pending_deletions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.timestamp('requested_at').notNullable();
    table.timestamp('scheduled_for').notNullable();
    table.specificType('status', 'deletion_status').notNullable().defaultTo('scheduled');
    table.timestamp('completed_at');
    table.timestamp('cancelled_at');
    table.text('cancellation_reason');
    table.text('error_message');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_pending_deletions_tenant ON pending_deletions(tenant_id)');
  await knex.raw('CREATE INDEX idx_pending_deletions_user ON pending_deletions(user_id)');
  await knex.raw('CREATE INDEX idx_pending_deletions_status ON pending_deletions(status)');
  await knex.raw('CREATE INDEX idx_pending_deletions_scheduled ON pending_deletions(scheduled_for) WHERE status = \'scheduled\'');

  // ---------------------------------------------------------------------------
  // template_usage
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('template_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('template_id').notNullable();
    table.uuid('notification_id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.timestamp('used_at').notNullable();
    table.boolean('success').notNullable().defaultTo(true);
    table.specificType('channel', 'notification_channel').notNullable();
    table.text('failure_reason');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_template_usage_tenant ON template_usage(tenant_id)');
  await knex.raw('CREATE INDEX idx_template_usage_template ON template_usage(template_id)');
  await knex.raw('CREATE INDEX idx_template_usage_notification ON template_usage(notification_id) WHERE notification_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_template_usage_venue ON template_usage(venue_id) WHERE venue_id IS NOT NULL');
  await knex.raw('CREATE INDEX idx_template_usage_used_at ON template_usage(used_at DESC)');
  await knex.raw('CREATE INDEX idx_template_usage_success ON template_usage(template_id, success)');

  // ---------------------------------------------------------------------------
  // template_versions
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('template_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('template_id').notNullable();
    table.integer('version').notNullable();
    table.string('name', 255).notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('type', 'notification_type').notNullable();
    table.string('subject', 500);
    table.text('content').notNullable();
    table.text('html_content');
    table.jsonb('variables');
    table.uuid('created_by').comment('FK: users.id');
    table.text('changes_summary');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['template_id', 'version']);
  });

  await knex.raw('CREATE INDEX idx_template_versions_tenant ON template_versions(tenant_id)');
  await knex.raw('CREATE INDEX idx_template_versions_template ON template_versions(template_id)');
  await knex.raw('CREATE INDEX idx_template_versions_version ON template_versions(template_id, version DESC)');
  await knex.raw('CREATE INDEX idx_template_versions_created_by ON template_versions(created_by) WHERE created_by IS NOT NULL');

  // ---------------------------------------------------------------------------
  // translations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('translations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('language', 10).notNullable();
    table.string('key', 255).notNullable();
    table.text('value').notNullable();
    table.string('namespace', 100);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'language', 'key']);
  });

  await knex.raw('CREATE INDEX idx_translations_tenant ON translations(tenant_id)');
  await knex.raw('CREATE INDEX idx_translations_language ON translations(language)');
  await knex.raw('CREATE INDEX idx_translations_key ON translations(key)');
  await knex.raw('CREATE INDEX idx_translations_namespace ON translations(namespace) WHERE namespace IS NOT NULL');

  // ---------------------------------------------------------------------------
  // venue_health_scores
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('venue_health_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().unique().comment('FK: venues.id');
    table.integer('overall_score').notNullable().checkBetween([0, 100]);
    table.decimal('delivery_score', 5, 2).notNullable();
    table.decimal('engagement_score', 5, 2).notNullable();
    table.integer('compliance_score').notNullable().checkBetween([0, 100]);
    table.jsonb('metrics');
    table.timestamp('last_calculated_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_health_tenant ON venue_health_scores(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_health_venue ON venue_health_scores(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_health_overall ON venue_health_scores(overall_score DESC)');
  await knex.raw('CREATE INDEX idx_venue_health_calculated ON venue_health_scores(last_calculated_at DESC)');

  // ---------------------------------------------------------------------------
  // abandoned_carts
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('abandoned_carts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: users.id');
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.uuid('event_id').notNullable().comment('FK: events.id');
    table.jsonb('cart_items').notNullable();
    table.integer('total_amount_cents');
    table.timestamp('abandoned_at').defaultTo(knex.fn.now());
    table.boolean('recovery_email_sent').defaultTo(false);
    table.timestamp('recovery_email_sent_at');
    table.boolean('converted').defaultTo(false);
    table.timestamp('converted_at');
    table.uuid('order_id').comment('FK: orders.id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_abandoned_carts_tenant ON abandoned_carts(tenant_id)');
  await knex.raw('CREATE INDEX idx_abandoned_carts_user ON abandoned_carts(user_id, abandoned_at DESC)');
  await knex.raw('CREATE INDEX idx_abandoned_carts_unsent ON abandoned_carts(abandoned_at) WHERE recovery_email_sent = false AND converted = false');

  // ---------------------------------------------------------------------------
  // venue_notification_settings
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('venue_notification_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().unique().comment('FK: venues.id');
    table.integer('daily_email_limit');
    table.integer('daily_sms_limit');
    table.integer('monthly_email_limit');
    table.integer('monthly_sms_limit');
    table.specificType('blocked_channels', 'VARCHAR(20)[]');
    table.string('default_timezone', 50).defaultTo('UTC');
    table.integer('quiet_hours_start').checkBetween([0, 23]);
    table.integer('quiet_hours_end').checkBetween([0, 23]);
    table.string('reply_to_email', 255);
    table.string('sms_callback_number', 50);
    table.text('webhook_url');
    table.string('webhook_secret', 255);
    table.jsonb('custom_branding');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_venue_settings_tenant ON venue_notification_settings(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_settings_venue ON venue_notification_settings(venue_id)');

  await knex.raw('CREATE TRIGGER update_venue_notification_settings_updated_at BEFORE UPDATE ON venue_notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // ---------------------------------------------------------------------------
  // notification_costs
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('notification_costs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('notification_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('channel', 20).notNullable();
    table.string('provider', 50).notNullable();
    table.integer('cost').notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('billing_period', 20);
    table.boolean('is_platform_cost').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('notification_id').references('notification_history.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_costs_tenant ON notification_costs(tenant_id)');
  await knex.raw('CREATE INDEX idx_costs_notification ON notification_costs(notification_id)');
  await knex.raw('CREATE INDEX idx_costs_venue ON notification_costs(venue_id)');
  await knex.raw('CREATE INDEX idx_costs_period ON notification_costs(billing_period)');

  // ============================================================================
  // ROW LEVEL SECURITY - Tenant-Scoped Tables (28)
  // ============================================================================

  const tenantTables = [
    'scheduled_notifications',
    'notification_history',
    'consent_records',
    'notification_preferences',
    'notification_preference_history',
    'notification_tracking',
    'notification_engagement',
    'notification_clicks',
    'notification_templates',
    'notification_campaigns',
    'audience_segments',
    'email_automation_triggers',
    'ab_tests',
    'ab_test_variants',
    'ab_test_metrics',
    'automation_executions',
    'bounces',
    'campaign_stats',
    'engagement_events',
    'notification_analytics_daily',
    'pending_deletions',
    'template_usage',
    'template_versions',
    'translations',
    'venue_health_scores',
    'abandoned_carts',
    'venue_notification_settings',
    'notification_costs',
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

  // ============================================================================
  // COMMENTS FOR GLOBAL TABLES
  // ============================================================================

  await knex.raw(`COMMENT ON TABLE suppression_list IS 'GLOBAL: Platform-wide email/phone blocklist'`);
  await knex.raw(`COMMENT ON TABLE notification_delivery_stats IS 'GLOBAL: Platform aggregate delivery stats'`);
  await knex.raw(`COMMENT ON TABLE notification_analytics IS 'GLOBAL: Platform hourly analytics'`);
  await knex.raw(`COMMENT ON TABLE webhook_events IS 'GLOBAL: Provider webhook deduplication'`);
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'scheduled_notifications',
    'notification_history',
    'consent_records',
    'notification_preferences',
    'notification_preference_history',
    'notification_tracking',
    'notification_engagement',
    'notification_clicks',
    'notification_templates',
    'notification_campaigns',
    'audience_segments',
    'email_automation_triggers',
    'ab_tests',
    'ab_test_variants',
    'ab_test_metrics',
    'automation_executions',
    'bounces',
    'campaign_stats',
    'engagement_events',
    'notification_analytics_daily',
    'pending_deletions',
    'template_usage',
    'template_versions',
    'translations',
    'venue_health_scores',
    'abandoned_carts',
    'venue_notification_settings',
    'notification_costs',
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_venue_notification_settings_updated_at ON venue_notification_settings');
  await knex.raw('DROP TRIGGER IF EXISTS update_ab_tests_updated_at ON ab_tests');
  await knex.raw('DROP TRIGGER IF EXISTS update_email_automation_triggers_updated_at ON email_automation_triggers');
  await knex.raw('DROP TRIGGER IF EXISTS update_audience_segments_updated_at ON audience_segments');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_campaigns_updated_at ON notification_campaigns');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences');
  await knex.raw('DROP TRIGGER IF EXISTS update_consent_records_updated_at ON consent_records');
  await knex.raw('DROP TRIGGER IF EXISTS update_notification_history_updated_at ON notification_history');
  await knex.raw('DROP TRIGGER IF EXISTS update_scheduled_notifications_updated_at ON scheduled_notifications');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('notification_costs');
  await knex.schema.dropTableIfExists('venue_notification_settings');
  await knex.schema.dropTableIfExists('abandoned_carts');
  await knex.schema.dropTableIfExists('venue_health_scores');
  await knex.schema.dropTableIfExists('translations');
  await knex.schema.dropTableIfExists('template_versions');
  await knex.schema.dropTableIfExists('template_usage');
  await knex.schema.dropTableIfExists('pending_deletions');
  await knex.schema.dropTableIfExists('notification_analytics_daily');
  await knex.schema.dropTableIfExists('engagement_events');
  await knex.schema.dropTableIfExists('campaign_stats');
  await knex.schema.dropTableIfExists('bounces');
  await knex.schema.dropTableIfExists('automation_executions');
  await knex.schema.dropTableIfExists('ab_test_metrics');
  await knex.schema.dropTableIfExists('ab_test_variants');
  await knex.schema.dropTableIfExists('ab_tests');
  await knex.schema.dropTableIfExists('email_automation_triggers');
  await knex.schema.dropTableIfExists('audience_segments');
  await knex.schema.dropTableIfExists('notification_campaigns');
  await knex.schema.dropTableIfExists('notification_templates');
  await knex.schema.dropTableIfExists('notification_clicks');
  await knex.schema.dropTableIfExists('notification_engagement');
  await knex.schema.dropTableIfExists('notification_tracking');
  await knex.schema.dropTableIfExists('notification_preference_history');
  await knex.schema.dropTableIfExists('notification_preferences');
  await knex.schema.dropTableIfExists('consent_records');
  await knex.schema.dropTableIfExists('notification_history');
  await knex.schema.dropTableIfExists('scheduled_notifications');
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('notification_analytics');
  await knex.schema.dropTableIfExists('notification_delivery_stats');
  await knex.schema.dropTableIfExists('suppression_list');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS aggregate_notification_analytics()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // Drop enums
  await knex.raw('DROP TYPE IF EXISTS deletion_status');
  await knex.raw('DROP TYPE IF EXISTS engagement_event_type');
  await knex.raw('DROP TYPE IF EXISTS bounce_type');
  await knex.raw('DROP TYPE IF EXISTS execution_status');
  await knex.raw('DROP TYPE IF EXISTS ab_test_status');
  await knex.raw('DROP TYPE IF EXISTS campaign_status');
  await knex.raw('DROP TYPE IF EXISTS tracking_status');
  await knex.raw('DROP TYPE IF EXISTS consent_status');
  await knex.raw('DROP TYPE IF EXISTS delivery_status');
  await knex.raw('DROP TYPE IF EXISTS scheduled_status');
  await knex.raw('DROP TYPE IF EXISTS notification_priority');
  await knex.raw('DROP TYPE IF EXISTS notification_type');
  await knex.raw('DROP TYPE IF EXISTS notification_channel');
}
