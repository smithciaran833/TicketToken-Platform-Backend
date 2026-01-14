/**
 * Migration: Add Ticket State History
 * 
 * Creates a ticket_state_history table to track all status changes
 * with automatic logging via database trigger.
 * 
 * Batch 24 Fix: State machine audit trail for compliance and debugging
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // CREATE TICKET_STATE_HISTORY TABLE
  // ==========================================================================
  
  const tableExists = await knex.schema.hasTable('ticket_state_history');
  if (!tableExists) {
    await knex.schema.createTable('ticket_state_history', (table) => {
      // Primary key
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      
      // Foreign key to tickets
      table.uuid('ticket_id').notNullable();
      
      // Tenant isolation
      table.uuid('tenant_id').notNullable();
      
      // State change details
      table.string('previous_status', 50);
      table.string('new_status', 50).notNullable();
      
      // Actor information
      table.uuid('changed_by'); // User or service ID that made the change
      table.string('changed_by_type', 50).defaultTo('user'); // 'user', 'system', 'admin', 'service'
      
      // Context
      table.string('reason', 500); // Why the change was made
      table.string('source', 100); // API endpoint, job name, service name
      
      // Additional metadata
      table.jsonb('metadata').defaultTo('{}'); // Any additional context
      
      // Timestamps
      table.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      
      // Indexes
      table.index(['ticket_id']);
      table.index(['tenant_id']);
      table.index(['changed_at']);
      table.index(['ticket_id', 'changed_at']);
      table.index(['tenant_id', 'changed_at']);
      table.index(['new_status']);
      table.index(['changed_by']);
    });

    console.log('Created ticket_state_history table');
  }

  // ==========================================================================
  // ADD FOREIGN KEY CONSTRAINT
  // ==========================================================================
  
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'ticket_state_history' AND constraint_name = 'fk_ticket_state_history_ticket_id'
      ) THEN
        ALTER TABLE ticket_state_history 
        ADD CONSTRAINT fk_ticket_state_history_ticket_id 
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // ==========================================================================
  // CREATE TRIGGER FUNCTION FOR AUTO-LOGGING
  // ==========================================================================
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_ticket_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Only log if status actually changed
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO ticket_state_history (
          ticket_id,
          tenant_id,
          previous_status,
          new_status,
          changed_by,
          changed_by_type,
          reason,
          source,
          metadata,
          changed_at
        ) VALUES (
          NEW.id,
          NEW.tenant_id,
          OLD.status,
          NEW.status,
          -- Try to get the actor from session variable, fallback to null
          NULLIF(current_setting('app.current_user_id', true), '')::uuid,
          COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system'),
          NULLIF(current_setting('app.status_change_reason', true), ''),
          NULLIF(current_setting('app.status_change_source', true), ''),
          JSONB_BUILD_OBJECT(
            'old_owner_id', OLD.owner_id,
            'new_owner_id', NEW.owner_id,
            'old_price', OLD.price,
            'new_price', NEW.price,
            'nft_mint', NEW.nft_mint,
            'event_id', NEW.event_id
          ),
          NOW()
        );
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('Created log_ticket_status_change function');

  // ==========================================================================
  // CREATE TRIGGER
  // ==========================================================================
  
  await knex.raw(`
    DROP TRIGGER IF EXISTS tr_ticket_status_change ON tickets;
    
    CREATE TRIGGER tr_ticket_status_change
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION log_ticket_status_change();
  `);

  console.log('Created tr_ticket_status_change trigger');

  // ==========================================================================
  // ENABLE ROW LEVEL SECURITY
  // ==========================================================================
  
  await knex.raw(`
    ALTER TABLE ticket_state_history ENABLE ROW LEVEL SECURITY;
  `);

  // ==========================================================================
  // CREATE RLS POLICIES FOR TENANT ISOLATION
  // ==========================================================================
  
  // Policy: Users can only see state history for their tenant's tickets
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ticket_state_history' AND policyname = 'ticket_state_history_tenant_isolation'
      ) THEN
        CREATE POLICY ticket_state_history_tenant_isolation ON ticket_state_history
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      END IF;
    END $$;
  `);

  // Policy: SELECT for tenant's data
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ticket_state_history' AND policyname = 'ticket_state_history_select_policy'
      ) THEN
        CREATE POLICY ticket_state_history_select_policy ON ticket_state_history
        FOR SELECT
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      END IF;
    END $$;
  `);

  // Policy: INSERT for tenant's data (system/trigger can insert)
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ticket_state_history' AND policyname = 'ticket_state_history_insert_policy'
      ) THEN
        CREATE POLICY ticket_state_history_insert_policy ON ticket_state_history
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      END IF;
    END $$;
  `);

  console.log('Created RLS policies for ticket_state_history');

  // ==========================================================================
  // CREATE COMPOSITE INDEXES FOR COMMON QUERIES
  // ==========================================================================
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ticket_state_history_tenant_ticket 
    ON ticket_state_history(tenant_id, ticket_id, changed_at DESC);
    
    CREATE INDEX IF NOT EXISTS idx_ticket_state_history_status_transition
    ON ticket_state_history(previous_status, new_status);
    
    CREATE INDEX IF NOT EXISTS idx_ticket_state_history_by_actor
    ON ticket_state_history(changed_by, changed_at DESC)
    WHERE changed_by IS NOT NULL;
  `);

  // ==========================================================================
  // CREATE HELPER FUNCTION TO GET TICKET HISTORY
  // ==========================================================================
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_ticket_state_history(
      p_ticket_id UUID,
      p_limit INT DEFAULT 100
    )
    RETURNS TABLE (
      id UUID,
      previous_status VARCHAR,
      new_status VARCHAR,
      changed_by UUID,
      changed_by_type VARCHAR,
      reason VARCHAR,
      source VARCHAR,
      metadata JSONB,
      changed_at TIMESTAMPTZ
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        h.id,
        h.previous_status,
        h.new_status,
        h.changed_by,
        h.changed_by_type,
        h.reason,
        h.source,
        h.metadata,
        h.changed_at
      FROM ticket_state_history h
      WHERE h.ticket_id = p_ticket_id
      ORDER BY h.changed_at DESC
      LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ==========================================================================
  // CREATE HELPER FUNCTION TO LOG STATUS CHANGE MANUALLY
  // ==========================================================================
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION log_ticket_status_change_manual(
      p_ticket_id UUID,
      p_tenant_id UUID,
      p_previous_status VARCHAR,
      p_new_status VARCHAR,
      p_changed_by UUID DEFAULT NULL,
      p_changed_by_type VARCHAR DEFAULT 'system',
      p_reason VARCHAR DEFAULT NULL,
      p_source VARCHAR DEFAULT NULL,
      p_metadata JSONB DEFAULT '{}'::JSONB
    )
    RETURNS UUID AS $$
    DECLARE
      v_history_id UUID;
    BEGIN
      INSERT INTO ticket_state_history (
        ticket_id,
        tenant_id,
        previous_status,
        new_status,
        changed_by,
        changed_by_type,
        reason,
        source,
        metadata
      ) VALUES (
        p_ticket_id,
        p_tenant_id,
        p_previous_status,
        p_new_status,
        p_changed_by,
        p_changed_by_type,
        p_reason,
        p_source,
        p_metadata
      ) RETURNING id INTO v_history_id;
      
      RETURN v_history_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('Created helper functions for ticket state history');

  // ==========================================================================
  // CREATE VIEW FOR RECENT TRANSITIONS
  // ==========================================================================
  
  await knex.raw(`
    CREATE OR REPLACE VIEW v_recent_ticket_transitions AS
    SELECT 
      h.id,
      h.ticket_id,
      h.tenant_id,
      h.previous_status,
      h.new_status,
      h.changed_by,
      h.changed_by_type,
      h.reason,
      h.source,
      h.changed_at,
      t.event_id,
      t.owner_id,
      t.nft_mint
    FROM ticket_state_history h
    JOIN tickets t ON h.ticket_id = t.id
    WHERE h.changed_at > NOW() - INTERVAL '24 hours'
    ORDER BY h.changed_at DESC;
  `);

  console.log('Created v_recent_ticket_transitions view');

  // ==========================================================================
  // ADD COMMENT DOCUMENTATION
  // ==========================================================================
  
  await knex.raw(`
    COMMENT ON TABLE ticket_state_history IS 'Audit trail for all ticket status changes';
    COMMENT ON COLUMN ticket_state_history.previous_status IS 'Status before the change (NULL for initial creation)';
    COMMENT ON COLUMN ticket_state_history.new_status IS 'Status after the change';
    COMMENT ON COLUMN ticket_state_history.changed_by IS 'User or service ID that initiated the change';
    COMMENT ON COLUMN ticket_state_history.changed_by_type IS 'Type of actor: user, system, admin, service';
    COMMENT ON COLUMN ticket_state_history.reason IS 'Human-readable reason for the status change';
    COMMENT ON COLUMN ticket_state_history.source IS 'Origin of the change: API endpoint, job, service';
    COMMENT ON COLUMN ticket_state_history.metadata IS 'Additional context as JSON';
    COMMENT ON FUNCTION log_ticket_status_change() IS 'Trigger function to auto-log status changes';
    COMMENT ON FUNCTION get_ticket_state_history(UUID, INT) IS 'Get status change history for a ticket';
    COMMENT ON FUNCTION log_ticket_status_change_manual(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB) IS 'Manually log a status change (for imports, migrations)';
  `);

  console.log('Migration 011: Ticket state history table and trigger created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // ==========================================================================
  // DROP VIEW
  // ==========================================================================
  
  await knex.raw(`DROP VIEW IF EXISTS v_recent_ticket_transitions`);

  // ==========================================================================
  // DROP HELPER FUNCTIONS
  // ==========================================================================
  
  await knex.raw(`
    DROP FUNCTION IF EXISTS get_ticket_state_history(UUID, INT);
    DROP FUNCTION IF EXISTS log_ticket_status_change_manual(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB);
  `);

  // ==========================================================================
  // DROP TRIGGER
  // ==========================================================================
  
  await knex.raw(`DROP TRIGGER IF EXISTS tr_ticket_status_change ON tickets`);

  // ==========================================================================
  // DROP TRIGGER FUNCTION
  // ==========================================================================
  
  await knex.raw(`DROP FUNCTION IF EXISTS log_ticket_status_change()`);

  // ==========================================================================
  // DROP RLS POLICIES
  // ==========================================================================
  
  await knex.raw(`
    DROP POLICY IF EXISTS ticket_state_history_tenant_isolation ON ticket_state_history;
    DROP POLICY IF EXISTS ticket_state_history_select_policy ON ticket_state_history;
    DROP POLICY IF EXISTS ticket_state_history_insert_policy ON ticket_state_history;
  `);

  // ==========================================================================
  // DROP TABLE
  // ==========================================================================
  
  await knex.schema.dropTableIfExists('ticket_state_history');

  console.log('Migration 011: Ticket state history table and related objects removed');
}
