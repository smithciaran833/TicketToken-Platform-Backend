-- TicketToken Sync Logs Schema
-- Week 3, Day 14: Data synchronization tracking and monitoring
-- Purpose: Track all data synchronization operations between systems

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS integrations;

-- Set search path
SET search_path TO integrations, public;

-- Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Sync identification
   sync_id VARCHAR(255) UNIQUE NOT NULL,               -- Unique sync operation identifier
   sync_type VARCHAR(20) NOT NULL,                     -- full, incremental, real_time
   
   -- Integration details
   integration_name VARCHAR(100) NOT NULL,              -- Name of integration (Stripe, Eventbrite, etc.)
   integration_id UUID,                                 -- Reference to integration configuration
   direction VARCHAR(20) NOT NULL,                     -- inbound, outbound, bidirectional
   
   -- Execution information
   started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
   completed_at TIMESTAMP WITH TIME ZONE,               -- When sync finished
   duration_seconds INTEGER,                            -- Total execution time
   
   -- Status tracking
   status VARCHAR(20) NOT NULL DEFAULT 'running',      -- running, completed, failed, partial, cancelled
   
   -- Sync scope
   entity_type VARCHAR(100),                            -- Type of entity being synced (events, tickets, users)
   entity_count INTEGER DEFAULT 0,                      -- Total entities to sync
   date_range_start TIMESTAMP WITH TIME ZONE,          -- Start of date range for sync
   date_range_end TIMESTAMP WITH TIME ZONE,            -- End of date range for sync
   
   -- Results
   records_processed INTEGER DEFAULT 0,                 -- Total records processed
   records_created INTEGER DEFAULT 0,                   -- New records created
   records_updated INTEGER DEFAULT 0,                   -- Existing records updated
   records_deleted INTEGER DEFAULT 0,                   -- Records deleted
   records_skipped INTEGER DEFAULT 0,                   -- Records skipped
   
   -- Error tracking
   errors_count INTEGER DEFAULT 0,                      -- Total number of errors
   error_details JSONB DEFAULT '[]',                    -- Array of error details
   first_error_at TIMESTAMP WITH TIME ZONE,             -- When first error occurred
   
   -- Performance metrics
   records_per_second DECIMAL(10,2),                    -- Processing speed
   peak_memory_mb INTEGER,                              -- Peak memory usage
   api_calls_made INTEGER DEFAULT 0,                    -- External API calls
   
   -- Retry information
   retry_attempt INTEGER DEFAULT 0,                     -- Current retry attempt number
   retry_of_sync_id UUID,                               -- Original sync this is retrying
   max_retries INTEGER DEFAULT 3,                       -- Maximum retry attempts
   
   -- Checkpoints for resumable syncs
   last_checkpoint JSONB,                               -- Last successful checkpoint
   checkpoint_data JSONB DEFAULT '{}',                  -- Checkpoint state data
   resume_token VARCHAR(500),                           -- Token to resume sync
   
   -- Data validation
   validation_errors INTEGER DEFAULT 0,                 -- Data validation errors
   validation_warnings INTEGER DEFAULT 0,               -- Data validation warnings
   validation_report JSONB DEFAULT '{}',                -- Detailed validation report
   
   -- Cost tracking
   api_credits_used INTEGER DEFAULT 0,                  -- API credits consumed
   estimated_cost DECIMAL(10,4) DEFAULT 0,              -- Estimated monetary cost
   
   -- Notifications
   notification_sent BOOLEAN DEFAULT false,             -- Whether notifications were sent
   notification_recipients TEXT[] DEFAULT '{}',         -- Who was notified
   
   -- Metadata
   tags TEXT[] DEFAULT '{}',                            -- Tags for categorization
   context JSONB DEFAULT '{}',                          -- Additional context data
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT chk_sync_type CHECK (sync_type IN ('full', 'incremental', 'real_time')),
   CONSTRAINT chk_direction CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
   CONSTRAINT chk_status CHECK (status IN ('running', 'completed', 'failed', 'partial', 'cancelled')),
   CONSTRAINT chk_retry_attempt CHECK (retry_attempt >= 0),
   CONSTRAINT chk_max_retries CHECK (max_retries >= 0 AND max_retries <= 10),
   CONSTRAINT chk_records CHECK (
       records_processed >= 0 AND
       records_created >= 0 AND
       records_updated >= 0 AND
       records_deleted >= 0 AND
       records_skipped >= 0 AND
       records_created + records_updated + records_deleted + records_skipped <= records_processed
   ),
   CONSTRAINT chk_errors_count CHECK (errors_count >= 0),
   CONSTRAINT chk_validation CHECK (validation_errors >= 0 AND validation_warnings >= 0),
   CONSTRAINT chk_api_credits CHECK (api_credits_used >= 0),
   CONSTRAINT chk_estimated_cost CHECK (estimated_cost >= 0),
   CONSTRAINT chk_date_range CHECK (
       (date_range_start IS NULL AND date_range_end IS NULL) OR
       (date_range_start IS NOT NULL AND date_range_end IS NOT NULL AND date_range_end >= date_range_start)
   )
);

-- Add comments
COMMENT ON TABLE sync_logs IS 'Detailed logs of all data synchronization operations';

COMMENT ON COLUMN sync_logs.id IS 'Unique identifier for sync log entry';
COMMENT ON COLUMN sync_logs.sync_id IS 'Business identifier for sync operation';
COMMENT ON COLUMN sync_logs.sync_type IS 'Type of sync: full, incremental, or real_time';

COMMENT ON COLUMN sync_logs.integration_name IS 'Name of the integration being synced';
COMMENT ON COLUMN sync_logs.integration_id IS 'Reference to integration configuration';
COMMENT ON COLUMN sync_logs.direction IS 'Data flow direction: inbound, outbound, or bidirectional';

COMMENT ON COLUMN sync_logs.started_at IS 'When the sync operation started';
COMMENT ON COLUMN sync_logs.completed_at IS 'When the sync operation completed';
COMMENT ON COLUMN sync_logs.duration_seconds IS 'Total time taken in seconds';

COMMENT ON COLUMN sync_logs.status IS 'Current status of sync operation';

COMMENT ON COLUMN sync_logs.entity_type IS 'Type of entities being synchronized';
COMMENT ON COLUMN sync_logs.entity_count IS 'Total number of entities to sync';
COMMENT ON COLUMN sync_logs.date_range_start IS 'Start date for incremental sync';
COMMENT ON COLUMN sync_logs.date_range_end IS 'End date for incremental sync';

COMMENT ON COLUMN sync_logs.records_processed IS 'Total records processed';
COMMENT ON COLUMN sync_logs.records_created IS 'New records created';
COMMENT ON COLUMN sync_logs.records_updated IS 'Existing records updated';
COMMENT ON COLUMN sync_logs.records_deleted IS 'Records deleted';
COMMENT ON COLUMN sync_logs.records_skipped IS 'Records skipped due to rules or errors';

COMMENT ON COLUMN sync_logs.errors_count IS 'Total number of errors encountered';
COMMENT ON COLUMN sync_logs.error_details IS 'Array of detailed error information';
COMMENT ON COLUMN sync_logs.first_error_at IS 'Timestamp of first error';

COMMENT ON COLUMN sync_logs.records_per_second IS 'Processing throughput';
COMMENT ON COLUMN sync_logs.peak_memory_mb IS 'Maximum memory used in MB';
COMMENT ON COLUMN sync_logs.api_calls_made IS 'Number of external API calls';

COMMENT ON COLUMN sync_logs.retry_attempt IS 'Which retry attempt this is';
COMMENT ON COLUMN sync_logs.retry_of_sync_id IS 'Original sync being retried';
COMMENT ON COLUMN sync_logs.max_retries IS 'Maximum retries allowed';

COMMENT ON COLUMN sync_logs.last_checkpoint IS 'Last successful checkpoint state';
COMMENT ON COLUMN sync_logs.checkpoint_data IS 'Data needed to resume sync';
COMMENT ON COLUMN sync_logs.resume_token IS 'Token for resuming interrupted sync';

COMMENT ON COLUMN sync_logs.validation_errors IS 'Count of data validation errors';
COMMENT ON COLUMN sync_logs.validation_warnings IS 'Count of data validation warnings';
COMMENT ON COLUMN sync_logs.validation_report IS 'Detailed validation findings';

COMMENT ON COLUMN sync_logs.api_credits_used IS 'API credits consumed by sync';
COMMENT ON COLUMN sync_logs.estimated_cost IS 'Estimated cost in dollars';

COMMENT ON COLUMN sync_logs.notification_sent IS 'Whether completion notifications were sent';
COMMENT ON COLUMN sync_logs.notification_recipients IS 'Array of notification recipients';

COMMENT ON COLUMN sync_logs.tags IS 'Tags for filtering and categorization';
COMMENT ON COLUMN sync_logs.context IS 'Additional context and metadata';

-- Create indexes
CREATE INDEX idx_sync_logs_sync_id ON sync_logs(sync_id);
CREATE INDEX idx_sync_logs_integration_name ON sync_logs(integration_name);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);
CREATE INDEX idx_sync_logs_completed_at ON sync_logs(completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX idx_sync_logs_direction ON sync_logs(direction);

-- Failed syncs partial index
CREATE INDEX idx_sync_logs_failed ON sync_logs(integration_name, started_at DESC) 
   WHERE status = 'failed';

-- Running syncs partial index
CREATE INDEX idx_sync_logs_running ON sync_logs(started_at, integration_name) 
   WHERE status = 'running';

-- Retry tracking
CREATE INDEX idx_sync_logs_retry_of ON sync_logs(retry_of_sync_id) 
   WHERE retry_of_sync_id IS NOT NULL;

-- Error tracking
CREATE INDEX idx_sync_logs_errors ON sync_logs(errors_count, first_error_at) 
   WHERE errors_count > 0;

-- Tags index
CREATE INDEX idx_sync_logs_tags ON sync_logs USING GIN(tags);

-- Context and error details
CREATE INDEX idx_sync_logs_context ON sync_logs USING GIN(context);
CREATE INDEX idx_sync_logs_error_details ON sync_logs USING GIN(error_details);

-- Create function to calculate duration
CREATE OR REPLACE FUNCTION calculate_sync_duration()
RETURNS TRIGGER AS $$
BEGIN
   IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
       NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INTEGER;
       
       -- Calculate records per second if applicable
       IF NEW.duration_seconds > 0 AND NEW.records_processed > 0 THEN
           NEW.records_per_second := ROUND(NEW.records_processed::DECIMAL / NEW.duration_seconds, 2);
       END IF;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_sync_duration_trigger
   BEFORE INSERT OR UPDATE ON sync_logs
   FOR EACH ROW EXECUTE FUNCTION calculate_sync_duration();

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_sync_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_logs_updated_at 
   BEFORE UPDATE ON sync_logs
   FOR EACH ROW EXECUTE FUNCTION update_sync_logs_updated_at();

-- Create function to add error
CREATE OR REPLACE FUNCTION add_sync_error(
   p_sync_id VARCHAR,
   p_error_code VARCHAR,
   p_error_message TEXT,
   p_error_data JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
   UPDATE sync_logs
   SET 
       errors_count = errors_count + 1,
       error_details = error_details || jsonb_build_array(
           jsonb_build_object(
               'timestamp', CURRENT_TIMESTAMP,
               'code', p_error_code,
               'message', p_error_message,
               'data', p_error_data
           )
       ),
       first_error_at = COALESCE(first_error_at, CURRENT_TIMESTAMP)
   WHERE sync_id = p_sync_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for sync statistics
CREATE OR REPLACE VIEW sync_statistics AS
SELECT 
   integration_name,
   sync_type,
   direction,
   COUNT(*) as total_syncs,
   COUNT(*) FILTER (WHERE status = 'completed') as successful_syncs,
   COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
   COUNT(*) FILTER (WHERE status = 'running') as running_syncs,
   AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration_seconds,
   AVG(records_per_second) FILTER (WHERE status = 'completed') as avg_records_per_second,
   SUM(records_processed) as total_records_processed,
   SUM(api_credits_used) as total_api_credits,
   SUM(estimated_cost) as total_estimated_cost,
   MAX(started_at) as last_sync_at
FROM sync_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY integration_name, sync_type, direction;

COMMENT ON VIEW sync_statistics IS 'Aggregated sync statistics for the last 30 days';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON sync_logs TO app_user;
-- GRANT SELECT ON sync_statistics TO app_user;
-- GRANT EXECUTE ON FUNCTION add_sync_error(VARCHAR, VARCHAR, TEXT, JSONB) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant_id ON sync_logs(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant_created ON sync_logs(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

