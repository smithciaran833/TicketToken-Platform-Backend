-- Partition tickets.tickets by month
-- Handles dependent views properly

BEGIN;

-- 1. Drop dependent views
DROP VIEW IF EXISTS public.v_ticket_overview CASCADE;
DROP VIEW IF EXISTS public.v_active_transfers CASCADE;
DROP VIEW IF EXISTS public.v_validation_history CASCADE;

-- 2. Create backup of table structure (no data)
CREATE TABLE tickets.tickets_backup AS SELECT * FROM tickets.tickets WHERE FALSE;

-- 3. Drop existing table
DROP TABLE IF EXISTS tickets.tickets CASCADE;

-- 4. Create partitioned table
CREATE TABLE tickets.tickets (
    id UUID DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    event_id UUID NOT NULL,
    ticket_type_id UUID NOT NULL,
    owner_user_id UUID,
    purchaser_user_id UUID NOT NULL,
    seat_assignment_id UUID,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    is_active BOOLEAN DEFAULT true,
    barcode VARCHAR(100) UNIQUE,
    qr_code TEXT,
    ticket_hash VARCHAR(64) UNIQUE NOT NULL,
    nft_token_id VARCHAR(100),
    nft_contract_address VARCHAR(100),
    blockchain_network VARCHAR(20),
    smart_contract_address VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at),
    FOREIGN KEY (event_id) REFERENCES events.events(id),
    FOREIGN KEY (ticket_type_id) REFERENCES tickets.ticket_types(id),
    FOREIGN KEY (owner_user_id) REFERENCES core.users(id),
    FOREIGN KEY (purchaser_user_id) REFERENCES core.users(id)
) PARTITION BY RANGE (created_at);

-- 5. Recreate all indexes
CREATE INDEX idx_tickets_event_id ON tickets.tickets(event_id);
CREATE INDEX idx_tickets_owner_user_id ON tickets.tickets(owner_user_id);
CREATE INDEX idx_tickets_status ON tickets.tickets(status);
CREATE INDEX idx_tickets_created_at ON tickets.tickets(created_at);
-- Add all other indexes from the original table
CREATE INDEX idx_tickets_ticket_type_id ON tickets.tickets(ticket_type_id);
CREATE INDEX idx_tickets_purchaser_user_id ON tickets.tickets(purchaser_user_id);
CREATE INDEX idx_tickets_ticket_number ON tickets.tickets(ticket_number);
CREATE INDEX idx_tickets_barcode ON tickets.tickets(barcode);
CREATE INDEX idx_tickets_active ON tickets.tickets(is_active) WHERE is_active = true;
CREATE INDEX idx_tickets_nft_token ON tickets.tickets(nft_token_id) WHERE nft_token_id IS NOT NULL;

-- 6. Create initial partitions
CREATE TABLE tickets.tickets_2025_01 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE tickets.tickets_2025_02 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE tickets.tickets_2025_03 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE tickets.tickets_2025_04 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE tickets.tickets_2025_05 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE tickets.tickets_2025_06 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE tickets.tickets_2025_07 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE tickets.tickets_2025_08 PARTITION OF tickets.tickets
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

-- 7. Drop backup table
DROP TABLE tickets.tickets_backup;

COMMIT;

-- 8. Recreate views (run the view backup file after this)
