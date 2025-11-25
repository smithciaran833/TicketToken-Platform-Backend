-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Gas Fee Tracking Table Schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This table tracks all transaction fees on the Solana blockchain,
-- providing detailed analytics for cost optimization and reimbursement

-- Drop table if exists (for development - remove in production)
DROP TABLE IF EXISTS gas_fee_tracking CASCADE;

-- Create gas_fee_tracking table
CREATE TABLE gas_fee_tracking (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Transaction reference
   transaction_id UUID NOT NULL, -- Reference to the blockchain transaction
   CONSTRAINT fk_transaction
       FOREIGN KEY (transaction_id) 
       REFERENCES blockchain_transactions(id)
       ON DELETE CASCADE,
   
   -- Fee components (in lamports)
   base_fee_lamports BIGINT NOT NULL DEFAULT 5000, -- Base fee (usually 5000 lamports)
   priority_fee_lamports BIGINT DEFAULT 0, -- Additional priority fee
   total_fee_lamports BIGINT NOT NULL, -- Total fee paid (base + priority)
   
   -- Compute units
   compute_units_requested INTEGER, -- CUs requested in transaction
   compute_units_consumed INTEGER, -- Actual CUs consumed
   compute_unit_price BIGINT, -- Price per compute unit in micro-lamports
   
   -- Fee calculation
   estimated_fee BIGINT, -- Fee estimated before transaction
   actual_fee BIGINT NOT NULL, -- Actual fee charged
   fee_difference BIGINT GENERATED ALWAYS AS (actual_fee - estimated_fee) STORED, -- Difference
   
   -- Market data at time of transaction
   network_congestion_level VARCHAR(20) DEFAULT 'NORMAL', -- Network state
   slot_average_fee BIGINT, -- Average fee in the slot
   percentile_rank INTEGER, -- Fee percentile (0-100)
   CONSTRAINT valid_congestion CHECK (network_congestion_level IN (
       'LOW',      -- Low network activity
       'NORMAL',   -- Normal activity
       'HIGH',     -- High activity
       'CRITICAL'  -- Network congested
   )),
   
   -- Payer information
   fee_payer_wallet VARCHAR(44), -- Wallet that paid the fee
   subsidized BOOLEAN DEFAULT FALSE, -- Whether fee was subsidized
   subsidy_amount BIGINT DEFAULT 0, -- Amount subsidized
   
   -- Transaction size metrics
   transaction_size_bytes INTEGER, -- Transaction size in bytes
   accounts_count INTEGER, -- Number of accounts involved
   instructions_count INTEGER, -- Number of instructions
   
   -- Priority level
   priority VARCHAR(20) DEFAULT 'MEDIUM', -- Transaction priority
   CONSTRAINT valid_priority CHECK (priority IN (
       'LOW',    -- Low priority (slower)
       'MEDIUM', -- Standard priority
       'HIGH',   -- High priority
       'TURBO'   -- Maximum priority
   )),
   custom_priority_rate BIGINT, -- Custom priority fee rate if used
   
   -- Optimization data
   optimized BOOLEAN DEFAULT FALSE, -- Whether fee was optimized
   optimization_savings BIGINT DEFAULT 0, -- Lamports saved through optimization
   optimization_method VARCHAR(50), -- Method used for optimization
   
   -- Failure tracking
   failed_attempts INTEGER DEFAULT 0, -- Number of failed attempts
   total_failed_fees BIGINT DEFAULT 0, -- Total fees lost to failures
   
   -- Performance metrics
   confirmation_time_ms INTEGER, -- Time to confirmation in milliseconds
   blocks_to_confirm INTEGER, -- Number of blocks to confirmation
   
   -- Fee trend data (for analytics)
   hourly_average BIGINT, -- Average fee in the hour
   daily_average BIGINT, -- Average fee in the day
   weekly_average BIGINT, -- Average fee in the week
   
   -- Reimbursement tracking
   reimbursable BOOLEAN DEFAULT FALSE, -- Whether fee is eligible for reimbursement
   reimbursed BOOLEAN DEFAULT FALSE, -- Whether fee has been reimbursed
   reimbursement_tx VARCHAR(88), -- Transaction signature of reimbursement
   
   -- Analytics metrics
   cost_per_ticket NUMERIC(20, 8), -- Fee cost per ticket in SOL
   roi_percentage NUMERIC(6, 2), -- ROI percentage for the transaction
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes for Performance
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Index on transaction_id for foreign key lookups
CREATE INDEX idx_gas_fee_tracking_transaction_id 
   ON gas_fee_tracking(transaction_id);

-- Index on fee_payer_wallet for wallet analysis
CREATE INDEX idx_gas_fee_tracking_fee_payer 
   ON gas_fee_tracking(fee_payer_wallet);

-- Index on created_at for time-based queries
CREATE INDEX idx_gas_fee_tracking_created_at 
   ON gas_fee_tracking(created_at);

-- Index on priority for priority analysis
CREATE INDEX idx_gas_fee_tracking_priority 
   ON gas_fee_tracking(priority);

-- Index on total_fee for fee analysis
CREATE INDEX idx_gas_fee_tracking_total_fee 
   ON gas_fee_tracking(total_fee_lamports);

-- Index on network_congestion_level for market analysis
CREATE INDEX idx_gas_fee_tracking_congestion 
   ON gas_fee_tracking(network_congestion_level);

-- Partial index for subsidized transactions
CREATE INDEX idx_gas_fee_tracking_subsidized 
   ON gas_fee_tracking(subsidized, subsidy_amount) 
   WHERE subsidized = TRUE;

-- Partial index for reimbursable fees
CREATE INDEX idx_gas_fee_tracking_reimbursable 
   ON gas_fee_tracking(reimbursable, reimbursed) 
   WHERE reimbursable = TRUE;

-- Composite index for fee analytics
CREATE INDEX idx_gas_fee_tracking_analytics 
   ON gas_fee_tracking(created_at, total_fee_lamports, priority);

-- Index on confirmation_time_ms for performance analysis
CREATE INDEX idx_gas_fee_tracking_confirmation_time 
   ON gas_fee_tracking(confirmation_time_ms);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update Trigger
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_gas_fee_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_gas_fee_tracking_timestamp
   BEFORE UPDATE ON gas_fee_tracking
   FOR EACH ROW
   EXECUTE FUNCTION update_gas_fee_tracking_updated_at();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table Comments
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


COMMENT ON TABLE gas_fee_tracking IS 'Tracks all transaction fees on Solana with detailed analytics for optimization';

COMMENT ON COLUMN gas_fee_tracking.id IS 'Unique identifier for the fee record';
COMMENT ON COLUMN gas_fee_tracking.transaction_id IS 'Reference to the blockchain transaction';
COMMENT ON COLUMN gas_fee_tracking.base_fee_lamports IS 'Base transaction fee in lamports (usually 5000)';
COMMENT ON COLUMN gas_fee_tracking.priority_fee_lamports IS 'Additional priority fee paid';
COMMENT ON COLUMN gas_fee_tracking.total_fee_lamports IS 'Total fee paid (base + priority)';
COMMENT ON COLUMN gas_fee_tracking.compute_units_requested IS 'Compute units requested for the transaction';
COMMENT ON COLUMN gas_fee_tracking.compute_units_consumed IS 'Actual compute units consumed';
COMMENT ON COLUMN gas_fee_tracking.compute_unit_price IS 'Price per compute unit in micro-lamports';
COMMENT ON COLUMN gas_fee_tracking.estimated_fee IS 'Fee estimated before submission';
COMMENT ON COLUMN gas_fee_tracking.actual_fee IS 'Actual fee charged by the network';
COMMENT ON COLUMN gas_fee_tracking.fee_difference IS 'Difference between actual and estimated (computed)';
COMMENT ON COLUMN gas_fee_tracking.network_congestion_level IS 'Network congestion state at transaction time';
COMMENT ON COLUMN gas_fee_tracking.slot_average_fee IS 'Average fee in the slot when transaction was processed';
COMMENT ON COLUMN gas_fee_tracking.percentile_rank IS 'Fee percentile ranking (0-100)';
COMMENT ON COLUMN gas_fee_tracking.fee_payer_wallet IS 'Wallet address that paid the transaction fee';
COMMENT ON COLUMN gas_fee_tracking.subsidized IS 'Whether the fee was subsidized by the platform';
COMMENT ON COLUMN gas_fee_tracking.subsidy_amount IS 'Amount of fee subsidized in lamports';
COMMENT ON COLUMN gas_fee_tracking.transaction_size_bytes IS 'Size of the transaction in bytes';
COMMENT ON COLUMN gas_fee_tracking.accounts_count IS 'Number of accounts involved in transaction';
COMMENT ON COLUMN gas_fee_tracking.instructions_count IS 'Number of instructions in transaction';
COMMENT ON COLUMN gas_fee_tracking.priority IS 'Priority level of the transaction';
COMMENT ON COLUMN gas_fee_tracking.custom_priority_rate IS 'Custom priority fee rate if non-standard';
COMMENT ON COLUMN gas_fee_tracking.optimized IS 'Whether fee optimization was applied';
COMMENT ON COLUMN gas_fee_tracking.optimization_savings IS 'Lamports saved through optimization';
COMMENT ON COLUMN gas_fee_tracking.optimization_method IS 'Method used for fee optimization';
COMMENT ON COLUMN gas_fee_tracking.failed_attempts IS 'Number of failed submission attempts';
COMMENT ON COLUMN gas_fee_tracking.total_failed_fees IS 'Total fees lost to failed attempts';
COMMENT ON COLUMN gas_fee_tracking.confirmation_time_ms IS 'Time to confirmation in milliseconds';
COMMENT ON COLUMN gas_fee_tracking.blocks_to_confirm IS 'Number of blocks until confirmation';
COMMENT ON COLUMN gas_fee_tracking.hourly_average IS 'Average network fee in the hour';
COMMENT ON COLUMN gas_fee_tracking.daily_average IS 'Average network fee in the day';
COMMENT ON COLUMN gas_fee_tracking.weekly_average IS 'Average network fee in the week';
COMMENT ON COLUMN gas_fee_tracking.reimbursable IS 'Whether fee is eligible for reimbursement';
COMMENT ON COLUMN gas_fee_tracking.reimbursed IS 'Whether fee has been reimbursed';
COMMENT ON COLUMN gas_fee_tracking.reimbursement_tx IS 'Transaction signature of reimbursement';
COMMENT ON COLUMN gas_fee_tracking.cost_per_ticket IS 'Transaction fee cost per ticket in SOL';
COMMENT ON COLUMN gas_fee_tracking.roi_percentage IS 'Return on investment percentage';
COMMENT ON COLUMN gas_fee_tracking.created_at IS 'Timestamp when this record was created';
COMMENT ON COLUMN gas_fee_tracking.updated_at IS 'Timestamp when this record was last updated';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Usage Examples
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Example: Insert a gas fee record for a transaction
INSERT INTO gas_fee_tracking (
   transaction_id,
   base_fee_lamports,
   priority_fee_lamports,
   total_fee_lamports,
   compute_units_requested,
   compute_units_consumed,
   compute_unit_price,
   estimated_fee,
   actual_fee,
   network_congestion_level,
   fee_payer_wallet,
   transaction_size_bytes,
   accounts_count,
   instructions_count,
   priority,
   confirmation_time_ms,
   blocks_to_confirm
) VALUES (
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
   5000,
   10000,
   15000,
   200000,
   185000,
   50,
   14000,
   15000,
   'HIGH',
   'BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa',
   1024,
   8,
   3,
   'HIGH',
   450,
   2
);

-- Example: Calculate average fees by priority level
SELECT 
   priority,
   COUNT(*) as transaction_count,
   AVG(total_fee_lamports) as avg_fee_lamports,
   AVG(total_fee_lamports) / 1000000000.0 as avg_fee_sol,
   AVG(confirmation_time_ms) as avg_confirmation_ms,
   AVG(blocks_to_confirm) as avg_blocks
FROM gas_fee_tracking
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY priority
ORDER BY 
   CASE priority 
       WHEN 'TURBO' THEN 1 
       WHEN 'HIGH' THEN 2 
       WHEN 'MEDIUM' THEN 3 
       WHEN 'LOW' THEN 4 
   END;

-- Example: Find transactions eligible for reimbursement
SELECT 
   gft.id,
   gft.transaction_id,
   bt.transaction_signature,
   gft.total_fee_lamports,
   gft.fee_payer_wallet,
   gft.created_at
FROM gas_fee_tracking gft
JOIN blockchain_transactions bt ON gft.transaction_id = bt.id
WHERE gft.reimbursable = TRUE
   AND gft.reimbursed = FALSE
   AND gft.total_fee_lamports > 50000 -- High fees only
ORDER BY gft.created_at ASC;

-- Example: Analyze fee optimization effectiveness
SELECT 
   optimization_method,
   COUNT(*) as transactions,
   SUM(optimization_savings) as total_savings_lamports,
   SUM(optimization_savings) / 1000000000.0 as total_savings_sol,
   AVG(optimization_savings) as avg_savings_lamports
FROM gas_fee_tracking
WHERE optimized = TRUE
   AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY optimization_method
ORDER BY total_savings_lamports DESC;

-- Example: Network congestion analysis
SELECT 
   DATE_TRUNC('hour', created_at) as hour,
   network_congestion_level,
   COUNT(*) as transactions,
   AVG(total_fee_lamports) as avg_fee,
   MAX(total_fee_lamports) as max_fee,
   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fee_lamports) as median_fee
FROM gas_fee_tracking
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY hour, network_congestion_level
ORDER BY hour DESC, network_congestion_level;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_gas_fee_tracking_tenant_id ON gas_fee_tracking(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gas_fee_tracking_tenant_created ON gas_fee_tracking(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
