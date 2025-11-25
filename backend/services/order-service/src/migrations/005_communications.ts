import { Knex } from 'knex';

/**
 * PHASE 5: COMMUNICATIONS
 * 
 * Consolidates migrations 018-020:
 * - Email templates (multi-language notification templates)
 * - Notification logs (audit trail of all sent notifications)
 * - Scheduled notifications (future notification delivery)
 * - Notification preferences (user communication preferences)
 * 
 * Tables created: 4
 * - email_templates
 * - notification_logs
 * - scheduled_notifications
 * - notification_preferences
 * 
 * ENUM types: 4
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // SECTION 1: EMAIL TEMPLATES & NOTIFICATION LOGS (from migration 018)
  // ============================================================================
  
  // Create notification_type ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_type AS ENUM (
        'ORDER_CONFIRMATION',
        'ORDER_RESERVED',
        'ORDER_CONFIRMED',
        'ORDER_CANCELLED',
        'ORDER_REFUNDED',
        'ORDER_EXPIRED',
        'EVENT_REMINDER',
        'RESERVATION_EXPIRY_WARNING',
        'PAYMENT_FAILURE',
        'RE_ENGAGEMENT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create notification_channel ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_channel AS ENUM (
        'EMAIL',
        'SMS',
        'PUSH',
        'WEBHOOK'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create notification_status ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_status AS ENUM (
        'PENDING',
        'SENT',
        'DELIVERED',
        'OPENED',
        'FAILED',
        'BOUNCED',
        'CANCELLED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create email_templates table
  await knex.schema.createTable('email_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('template_name', 100).notNullable();
    table.specificType('template_type', 'notification_type').notNullable();
    table.text('subject_template').notNullable();
    table.text('body_html').notNullable();
    table.text('body_text').notNullable();
    table.string('language_code', 10).notNullable().defaultTo('en');
    table.jsonb('variables').notNullable().defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.integer('version').defaultTo(1);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // UNIQUE constraint
    table.unique(['tenant_id', 'template_type', 'language_code']);

    // Indexes
    table.index('tenant_id', 'idx_email_templates_tenant');
    table.index(['template_type', 'language_code'], 'idx_email_templates_type');
  });

  // Create notification_logs table
  await knex.schema.createTable('notification_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id');
    table.uuid('user_id').notNullable();
    table.specificType('notification_type', 'notification_type').notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('status', 'notification_status').notNullable().defaultTo('PENDING');
    table.string('recipient', 255).notNullable();
    table.text('subject');
    table.text('body');
    table.timestamp('sent_at');
    table.timestamp('delivered_at');
    table.timestamp('opened_at');
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('tenant_id', 'idx_notification_logs_tenant');
    table.index('order_id', 'idx_notification_logs_order');
    table.index('user_id', 'idx_notification_logs_user');
    table.index(['channel', 'status'], 'idx_notification_logs_channel_status');
  });

  // Add partial index for pending notifications (requires raw SQL)
  await knex.raw(`
    CREATE INDEX idx_notification_logs_status 
    ON notification_logs(status, created_at) 
    WHERE status = 'PENDING'
  `);

  // ============================================================================
  // SECTION 2: SCHEDULED NOTIFICATIONS (from migration 019)
  // ============================================================================
  // Uses ENUMs from section 1: notification_type, notification_channel, notification_status

  // Create scheduled_notifications table
  await knex.schema.createTable('scheduled_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('user_id').notNullable();
    table.specificType('notification_type', 'notification_type').notNullable();
    table.specificType('channel', 'notification_channel').notNullable();
    table.specificType('status', 'notification_status').notNullable().defaultTo('PENDING');
    table.timestamp('scheduled_for').notNullable();
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.timestamp('last_attempted_at');
    table.timestamp('sent_at');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('tenant_id', 'idx_scheduled_notifications_tenant');
    table.index('order_id', 'idx_scheduled_notifications_order');
    table.index('user_id', 'idx_scheduled_notifications_user');
    table.index('status', 'idx_scheduled_notifications_status');
  });

  // Add partial index for pending scheduled notifications (requires raw SQL)
  await knex.raw(`
    CREATE INDEX idx_scheduled_notifications_pending 
    ON scheduled_notifications(scheduled_for, status) 
    WHERE status = 'PENDING'
  `);

  // ============================================================================
  // SECTION 3: NOTIFICATION PREFERENCES (from migration 020)
  // ============================================================================
  
  // Create notification_frequency ENUM
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_frequency AS ENUM (
        'IMMEDIATE',
        'DAILY_DIGEST',
        'WEEKLY_DIGEST'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create notification_preferences table
  await knex.schema.createTable('notification_preferences', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    
    // Channel preferences
    table.boolean('email_enabled').defaultTo(true);
    table.boolean('sms_enabled').defaultTo(false);
    table.boolean('push_enabled').defaultTo(true);
    
    // Notification type preferences
    table.boolean('order_confirmation').defaultTo(true);
    table.boolean('status_updates').defaultTo(true);
    table.boolean('reminders').defaultTo(true);
    table.boolean('marketing').defaultTo(false);
    
    // Frequency and timing
    table.specificType('frequency', 'notification_frequency').defaultTo('IMMEDIATE');
    table.time('quiet_hours_start');
    table.time('quiet_hours_end');
    table.string('timezone', 50).defaultTo('UTC');
    table.string('language_preference', 10).defaultTo('en');
    
    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // UNIQUE constraint
    table.unique(['user_id', 'tenant_id']);

    // Indexes
    table.index('user_id', 'idx_notification_preferences_user');
    table.index('tenant_id', 'idx_notification_preferences_tenant');
  });

  // Add partial index for non-immediate frequency (requires raw SQL)
  await knex.raw(`
    CREATE INDEX idx_notification_preferences_frequency 
    ON notification_preferences(frequency) 
    WHERE frequency != 'IMMEDIATE'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order: 020, 019, 018
  
  // ============================================================================
  // Section 3: Drop notification preferences (from 020)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_notification_preferences_frequency');
  await knex.schema.dropTableIfExists('notification_preferences');
  await knex.raw('DROP TYPE IF EXISTS notification_frequency');

  // ============================================================================
  // Section 2: Drop scheduled notifications (from 019)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_scheduled_notifications_pending');
  await knex.schema.dropTableIfExists('scheduled_notifications');

  // ============================================================================
  // Section 1: Drop email templates and notification logs (from 018)
  // ============================================================================
  
  await knex.raw('DROP INDEX IF EXISTS idx_notification_logs_status');
  await knex.schema.dropTableIfExists('notification_logs');
  await knex.schema.dropTableIfExists('email_templates');
  
  // Drop ENUMs (used by multiple tables, so drop last)
  await knex.raw('DROP TYPE IF EXISTS notification_status');
  await knex.raw('DROP TYPE IF EXISTS notification_channel');
  await knex.raw('DROP TYPE IF EXISTS notification_type');
}
