/**
 * Migration: Add RLS Policies and Webhook Events Table
 * 
 * AUDIT FIXES:
 * - MT-1: No RLS policies for tenant isolation → Add RLS policies
 * - IDP-2: No webhook_events tracking table → Create webhook_events table
 * 
 * This migration enables row-level security for multi-tenant isolation
 * and creates the webhook events table for deduplication.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // AUDIT FIX IDP-2: Create webhook_events table for deduplication
  // ==========================================================================
  
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(50) NOT NULL,
      event_id VARCHAR(255) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, event_id)
    );
    
    -- Index for quick lookups
    CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event_id 
      ON webhook_events(provider, event_id);
    
    -- Index for cleanup queries
    CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at 
      ON webhook_events(created_at);
    
    COMMENT ON TABLE webhook_events IS 'AUDIT FIX IDP-2: Tracks processed webhook events for deduplication';
  `);

  // ==========================================================================
  // AUDIT FIX MT-1: Add tenant_id column to tables if missing
  // ==========================================================================
  
  // Check if notifications table exists and add tenant_id if missing
  const hasNotifications = await knex.schema.hasTable('notifications');
  if (hasNotifications) {
    const hasNotificationTenantId = await knex.schema.hasColumn('notifications', 'tenant_id');
    if (!hasNotificationTenantId) {
      await knex.raw(`
        ALTER TABLE notifications 
          ADD COLUMN IF NOT EXISTS tenant_id UUID;
        
        -- Backfill existing rows with a default tenant (update this in production)
        UPDATE notifications SET tenant_id = '00000000-0000-0000-0000-000000000000' 
          WHERE tenant_id IS NULL;
        
        -- Make it NOT NULL after backfill
        ALTER TABLE notifications 
          ALTER COLUMN tenant_id SET NOT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id 
          ON notifications(tenant_id);
      `);
    }
  }

  // Check if notification_preferences table exists and add tenant_id if missing
  const hasPreferences = await knex.schema.hasTable('notification_preferences');
  if (hasPreferences) {
    const hasPreferencesTenantId = await knex.schema.hasColumn('notification_preferences', 'tenant_id');
    if (!hasPreferencesTenantId) {
      await knex.raw(`
        ALTER TABLE notification_preferences 
          ADD COLUMN IF NOT EXISTS tenant_id UUID;
        
        UPDATE notification_preferences SET tenant_id = '00000000-0000-0000-0000-000000000000' 
          WHERE tenant_id IS NULL;
        
        ALTER TABLE notification_preferences 
          ALTER COLUMN tenant_id SET NOT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_id 
          ON notification_preferences(tenant_id);
      `);
    }
  }

  // ==========================================================================
  // AUDIT FIX MT-1: Enable RLS and create policies
  // ==========================================================================
  
  await knex.raw(`
    -- Enable RLS on notifications table
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
        DROP POLICY IF EXISTS notifications_tenant_insert ON notifications;
        
        -- Create RLS policy for tenant isolation
        CREATE POLICY notifications_tenant_isolation ON notifications
          FOR ALL
          USING (tenant_id::text = current_setting('app.current_tenant', true))
          WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));
          
        RAISE NOTICE 'RLS enabled on notifications table';
      END IF;
    END $$;
    
    -- Enable RLS on notification_preferences table
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
        ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS notification_preferences_tenant_isolation ON notification_preferences;
        
        CREATE POLICY notification_preferences_tenant_isolation ON notification_preferences
          FOR ALL
          USING (tenant_id::text = current_setting('app.current_tenant', true))
          WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));
          
        RAISE NOTICE 'RLS enabled on notification_preferences table';
      END IF;
    END $$;
    
    -- Enable RLS on notification_templates table if exists
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_templates') THEN
        -- Add tenant_id if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'notification_templates' AND column_name = 'tenant_id'
        ) THEN
          ALTER TABLE notification_templates ADD COLUMN tenant_id UUID;
          UPDATE notification_templates SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
          ALTER TABLE notification_templates ALTER COLUMN tenant_id SET NOT NULL;
        END IF;
        
        ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS notification_templates_tenant_isolation ON notification_templates;
        
        CREATE POLICY notification_templates_tenant_isolation ON notification_templates
          FOR ALL
          USING (tenant_id::text = current_setting('app.current_tenant', true))
          WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));
          
        RAISE NOTICE 'RLS enabled on notification_templates table';
      END IF;
    END $$;
  `);

  // ==========================================================================
  // Create app role for application connections (bypasses RLS)
  // ==========================================================================
  
  await knex.raw(`
    -- Create application role if it doesn't exist
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notification_service_app') THEN
        CREATE ROLE notification_service_app;
        RAISE NOTICE 'Created notification_service_app role';
      END IF;
    END $$;
    
    -- Grant necessary permissions to app role
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO notification_service_app;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO notification_service_app;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_templates') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO notification_service_app;
      END IF;
      GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO notification_service_app;
    END $$;
  `);

  console.log('AUDIT FIX MT-1, IDP-2: Migration completed successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Disable RLS on tables
  await knex.raw(`
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
        ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
      END IF;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
        DROP POLICY IF EXISTS notification_preferences_tenant_isolation ON notification_preferences;
        ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
      END IF;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_templates') THEN
        DROP POLICY IF EXISTS notification_templates_tenant_isolation ON notification_templates;
        ALTER TABLE notification_templates DISABLE ROW LEVEL SECURITY;
      END IF;
    END $$;
  `);
  
  // Drop webhook_events table
  await knex.schema.dropTableIfExists('webhook_events');
  
  console.log('Migration rollback completed');
}
