-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Smart Contract Events Table Schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This table logs all events emitted by smart contracts on the Solana blockchain
-- Events are decoded from transaction logs and stored for querying and analytics

-- Drop table if exists (for development - remove in production)
DROP TABLE IF EXISTS smart_contract_events CASCADE;

-- Create smart_contract_events table
CREATE TABLE smart_contract_events (
    -- Primary key
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    
    -- Program identification
    program_id VARCHAR(44) NOT NULL, -- Solana program address that emitted the event
    
    -- Event details
    event_type VARCHAR(100) NOT NULL, -- Type of event emitted
    event_data JSONB NOT NULL, -- Complete event data in JSON format
    
    -- Transaction reference
    transaction_signature VARCHAR(88), -- Reference to the blockchain transaction
    CONSTRAINT fk_transaction
        FOREIGN KEY (transaction_signature) 
        REFERENCES blockchain_transactions(transaction_signature)
        ON DELETE CASCADE,
    
    -- Instruction details
    instruction_index INTEGER, -- Index of instruction within transaction
    inner_instruction_index INTEGER, -- Index if this is an inner instruction
    
    -- Blockchain data
    slot_number BIGINT NOT NULL, -- Solana slot when event was emitted
    block_time TIMESTAMP WITH TIME ZONE, -- Block timestamp
    
    -- Decoded event fields for efficient querying
    ticket_id UUID, -- Ticket ID if event relates to a ticket
    venue_id UUID, -- Venue ID if event relates to a venue
    event_id UUID, -- Event ID if event relates to an event (not the log event)
    wallet_address VARCHAR(44), -- Primary wallet address involved
    
    -- Financial data
    amount NUMERIC(20, 8), -- Amount involved in the event (with 8 decimal places)
    token_mint VARCHAR(44), -- Token mint address if applicable
    
    -- Event categorization
    category VARCHAR(20) NOT NULL, -- Category of the event
    CONSTRAINT valid_category CHECK (category IN (
        'TICKET',      -- Ticket-related events
        'MARKETPLACE', -- Marketplace events
        'ROYALTY',     -- Royalty payments
        'GOVERNANCE',  -- Governance actions
        'VENUE'        -- Venue management
    )),
    
    -- Event versioning
    event_version INTEGER DEFAULT 1, -- Version of the event schema
    schema_version INTEGER DEFAULT 1, -- Version of the data schema
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE, -- Whether event has been processed
    processed_at TIMESTAMP WITH TIME ZONE, -- When event was processed
    
    -- Error tracking
    processing_error TEXT, -- Error message if processing failed
    retry_count INTEGER DEFAULT 0, -- Number of processing retries
    
    -- Derived data
    derived_metrics JSONB DEFAULT '{}', -- Calculated metrics from the event
    indexed_fields JSONB DEFAULT '{}', -- Additional indexed data for searching
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes for Performance
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Index on program_id for filtering by smart contract
CREATE INDEX idx_smart_contract_events_program_id 
    ON smart_contract_events(program_id);

-- Index on event_type for filtering by event
CREATE INDEX idx_smart_contract_events_event_type 
    ON smart_contract_events(event_type);

-- Index on transaction_signature for joining with transactions
CREATE INDEX idx_smart_contract_events_transaction 
    ON smart_contract_events(transaction_signature);

-- Index on category for filtering by event category
CREATE INDEX idx_smart_contract_events_category 
    ON smart_contract_events(category);

-- Index on ticket_id for ticket-related queries
CREATE INDEX idx_smart_contract_events_ticket_id 
    ON smart_contract_events(ticket_id) 
    WHERE ticket_id IS NOT NULL;

-- Index on venue_id for venue-related queries
CREATE INDEX idx_smart_contract_events_venue_id 
    ON smart_contract_events(venue_id) 
    WHERE venue_id IS NOT NULL;

-- Index on event_id for event-related queries
CREATE INDEX idx_smart_contract_events_event_id 
    ON smart_contract_events(event_id) 
    WHERE event_id IS NOT NULL;

-- Index on wallet_address for wallet history
CREATE INDEX idx_smart_contract_events_wallet 
    ON smart_contract_events(wallet_address) 
    WHERE wallet_address IS NOT NULL;

-- Partial index for unprocessed events (processing queue)
CREATE INDEX idx_smart_contract_events_unprocessed 
    ON smart_contract_events(created_at, retry_count) 
    WHERE processed = FALSE;

-- Index on block_time for time-based queries
CREATE INDEX idx_smart_contract_events_block_time 
    ON smart_contract_events(block_time);

-- Composite index for event type and processing status
CREATE INDEX idx_smart_contract_events_type_processed 
    ON smart_contract_events(event_type, processed);

-- GIN index on event_data for JSONB queries
CREATE INDEX idx_smart_contract_events_data_gin 
    ON smart_contract_events USING GIN (event_data);

-- GIN index on indexed_fields for search functionality
CREATE INDEX idx_smart_contract_events_indexed_gin 
    ON smart_contract_events USING GIN (indexed_fields);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Event Type Constraints
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Check constraint for specific event types
ALTER TABLE smart_contract_events 
ADD CONSTRAINT valid_event_type CHECK (
    event_type IN (
        -- Ticket Events
        'TicketMinted',      -- New ticket NFT created
        'TicketTransferred', -- Ticket ownership changed
        'TicketRedeemed',    -- Ticket used for event entry
        'TicketBurned',      -- Ticket destroyed
        'TicketUpdated',     -- Ticket metadata updated
        
        -- Marketplace Events
        'MarketplaceListed',   -- Ticket listed for sale
        'MarketplaceDelisted', -- Listing cancelled
        'MarketplaceSold',     -- Ticket sold
        'MarketplacePriceUpdated', -- Listing price changed
        
        -- Royalty Events
        'RoyaltyPaid',    -- Royalty payment made
        'RoyaltyUpdated', -- Royalty percentage changed
        
        -- Venue Events
        'VenueRegistered', -- New venue added
        'VenueUpdated',    -- Venue details changed
        'VenueVerified',   -- Venue verification status changed
        
        -- Event Events (for events at venues)
        'EventCreated',    -- New event created
        'EventUpdated',    -- Event details changed
        'EventCancelled',  -- Event cancelled
        'EventCompleted'   -- Event finished
    )
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table Comments
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


COMMENT ON TABLE smart_contract_events IS 'Logs all events emitted by smart contracts for the TicketToken platform';

COMMENT ON COLUMN smart_contract_events.id IS 'Unique identifier for the event log entry';
COMMENT ON COLUMN smart_contract_events.program_id IS 'Solana program address that emitted this event';
COMMENT ON COLUMN smart_contract_events.event_type IS 'Specific type of event that was emitted';
COMMENT ON COLUMN smart_contract_events.event_data IS 'Complete event data in JSON format';
COMMENT ON COLUMN smart_contract_events.transaction_signature IS 'Reference to the blockchain transaction containing this event';
COMMENT ON COLUMN smart_contract_events.instruction_index IS 'Position of instruction within the transaction';
COMMENT ON COLUMN smart_contract_events.inner_instruction_index IS 'Position if this is a CPI (cross-program invocation)';
COMMENT ON COLUMN smart_contract_events.slot_number IS 'Solana slot number when event was emitted';
COMMENT ON COLUMN smart_contract_events.block_time IS 'Timestamp of the block containing this event';
COMMENT ON COLUMN smart_contract_events.ticket_id IS 'Ticket ID for ticket-related events';
COMMENT ON COLUMN smart_contract_events.venue_id IS 'Venue ID for venue-related events';
COMMENT ON COLUMN smart_contract_events.event_id IS 'Event ID for event-related events (not the log event itself)';
COMMENT ON COLUMN smart_contract_events.wallet_address IS 'Primary wallet address involved in the event';
COMMENT ON COLUMN smart_contract_events.amount IS 'Monetary amount involved in the event (8 decimal places)';
COMMENT ON COLUMN smart_contract_events.token_mint IS 'Token mint address for token-related events';
COMMENT ON COLUMN smart_contract_events.category IS 'High-level category of the event';
COMMENT ON COLUMN smart_contract_events.event_version IS 'Version of the event format';
COMMENT ON COLUMN smart_contract_events.schema_version IS 'Version of the data schema';
COMMENT ON COLUMN smart_contract_events.processed IS 'Whether this event has been processed by backend systems';
COMMENT ON COLUMN smart_contract_events.processed_at IS 'Timestamp when event was processed';
COMMENT ON COLUMN smart_contract_events.processing_error IS 'Error message if processing failed';
COMMENT ON COLUMN smart_contract_events.retry_count IS 'Number of times processing has been retried';
COMMENT ON COLUMN smart_contract_events.derived_metrics IS 'Calculated metrics from processing the event';
COMMENT ON COLUMN smart_contract_events.indexed_fields IS 'Additional searchable data extracted from event';
COMMENT ON COLUMN smart_contract_events.created_at IS 'Timestamp when this record was created';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Usage Examples
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Example: Insert a TicketMinted event
INSERT INTO smart_contract_events (
    program_id,
    event_type,
    event_data,
    transaction_signature,
    instruction_index,
    slot_number,
    block_time,
    ticket_id,
    venue_id,
    wallet_address,
    category
) VALUES (
    'TiCKeTkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TicketMinted',
    '{
        "ticketId": "123e4567-e89b-12d3-a456-426614174000",
        "mintAddress": "7EYnhQoR9YM3N7UoaKRoA4xKbKqtWGbgSM9bASRxcUEH",
        "owner": "BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa",
        "metadata": {
            "name": "Concert Ticket #001",
            "eventDate": "2024-06-15T20:00:00Z"
        }
    }'::jsonb,
    '5wHu1qwD7q5ifKYP7qbYiPxDqGqSp7JH3Mvgh3XgYmhMcN6SfG4TfGjdpNTrKPAUeQqcYgqvBhkXDuYnvUYkJqVx',
    0,
    234567890,
    '2024-03-20 10:30:00+00',
    '123e4567-e89b-12d3-a456-426614174000',
    '987e6543-e21b-12d3-a456-426614174000',
    'BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa',
    'TICKET'
);

-- Example: Query all unprocessed events
SELECT 
    id,
    event_type,
    category,
    created_at,
    retry_count
FROM smart_contract_events
WHERE processed = FALSE
    AND retry_count < 3
ORDER BY created_at ASC
LIMIT 100;

-- Example: Find all marketplace sales for a venue
SELECT 
    e.event_type,
    e.ticket_id,
    e.wallet_address as buyer,
    e.amount,
    e.block_time,
    e.event_data->>'price' as sale_price
FROM smart_contract_events e
WHERE e.venue_id = '987e6543-e21b-12d3-a456-426614174000'
    AND e.event_type = 'MarketplaceSold'
ORDER BY e.block_time DESC;

-- Example: Calculate total royalties for a venue
SELECT 
    venue_id,
    COUNT(*) as royalty_count,
    SUM(amount) as total_royalties,
    MIN(block_time) as first_royalty,
    MAX(block_time) as last_royalty
FROM smart_contract_events
WHERE event_type = 'RoyaltyPaid'
    AND venue_id IS NOT NULL
GROUP BY venue_id;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_smart_contract_events_tenant_id ON smart_contract_events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smart_contract_events_tenant_created ON smart_contract_events(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
