-- Ticket Status View
-- Fixed version without non-existent columns

-- Drop existing views
DROP VIEW IF EXISTS ticket_inventory_summary CASCADE;
DROP VIEW IF EXISTS ticket_status_details CASCADE;

-- Create ticket status details view
CREATE OR REPLACE VIEW ticket_status_details AS
SELECT 
    -- Ticket identification
    t.id AS ticket_id,
    t.ticket_number,
    t.ticket_code,
    t.barcode,
    
    -- Event and venue info
    t.event_id,
    e.name AS event_name,
    e.slug AS event_slug,
    e.status AS event_status,
    v.name AS venue_name,
    v.id AS venue_id,
    
    -- Ticket type and pricing
    t.ticket_type_id,
    tt.name AS ticket_type_name,
    tt.category AS ticket_category,
    t.face_value,
    t.purchase_price,
    
    -- Section/seat information
    t.section,
    t.row,
    t.seat,
    COALESCE(t.section, 'General') || 
        CASE 
            WHEN t.row IS NOT NULL THEN '-' || t.row 
            ELSE '' 
        END ||
        CASE 
            WHEN t.seat IS NOT NULL THEN '-' || t.seat 
            ELSE '' 
        END AS seat_location,
    
    -- Current status
    t.status AS current_status,
    t.is_valid,
    
    -- Ownership
    t.owner_id,
    t.original_purchaser_id,
    
    -- Important timestamps
    t.purchased_at,
    t.created_at,
    t.updated_at,
    
    -- Status indicators
    CASE 
        WHEN t.status = 'ACTIVE' THEN true
        ELSE false
    END AS is_available,
    
    CASE 
        WHEN t.status = 'REDEEMED' THEN true
        ELSE false
    END AS is_redeemed,
    
    CASE 
        WHEN t.status = 'LISTED' THEN true
        ELSE false
    END AS is_listed,
    
    CASE 
        WHEN t.status = 'TRANSFERRED' THEN true
        ELSE false
    END AS is_transferred,
    
    -- Transfer information
    t.is_transferable,
    t.transfer_count,
    
    -- Pending transfers from ticket_transfers table
    (SELECT COUNT(*) 
     FROM ticket_transfers tr 
     WHERE tr.ticket_id = t.id 
     AND tr.status = 'PENDING') AS pending_transfers,
    
    -- NFT/Blockchain status
    t.is_nft,
    t.mint_address,
    t.mint_transaction_id,
    CASE 
        WHEN t.is_nft AND t.mint_transaction_id IS NOT NULL THEN 'MINTED'
        WHEN t.is_nft AND t.mint_transaction_id IS NULL THEN 'PENDING'
        ELSE 'NOT_NFT'
    END AS blockchain_status,
    
    -- QR Code information
    t.qr_code_data,
    t.qr_code_url,
    t.qr_code_generated_at,
    CASE 
        WHEN t.qr_code_data IS NOT NULL THEN true
        ELSE false
    END AS has_qr_code,
    
    -- Event timing
    (SELECT MIN(es.starts_at) 
     FROM event_schedules es 
     WHERE es.event_id = t.event_id) AS event_start_time,
     
    CASE 
        WHEN (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = t.event_id) > NOW() THEN
            EXTRACT(EPOCH FROM (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = t.event_id) - NOW()) / 3600
        ELSE NULL
    END AS hours_until_event,
    
    -- Metadata
    CURRENT_TIMESTAMP AS view_generated_at

FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN venues v ON e.venue_id = v.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
WHERE e.deleted_at IS NULL
AND v.deleted_at IS NULL;

-- Recreate inventory summary view (already working)
CREATE OR REPLACE VIEW ticket_inventory_summary AS
SELECT 
    e.id AS event_id,
    e.name AS event_name,
    e.status AS event_status,
    v.name AS venue_name,
    tt.id AS ticket_type_id,
    tt.name AS ticket_type_name,
    
    -- Status breakdown
    COUNT(*) AS total_tickets,
    COUNT(*) FILTER (WHERE t.status = 'ACTIVE') AS active_tickets,
    COUNT(*) FILTER (WHERE t.status = 'REDEEMED') AS redeemed_tickets,
    COUNT(*) FILTER (WHERE t.status = 'TRANSFERRED') AS transferred_tickets,
    COUNT(*) FILTER (WHERE t.status = 'LISTED') AS listed_tickets,
    COUNT(*) FILTER (WHERE t.status = 'CANCELLED') AS cancelled_tickets,
    
    -- Availability percentage
    ROUND(
        (COUNT(*) FILTER (WHERE t.status = 'ACTIVE'))::numeric / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) AS availability_percentage,
    
    -- Section breakdown (if applicable)
    t.section,
    
    -- Price range
    MIN(t.face_value) FILTER (WHERE t.status = 'ACTIVE') AS min_price,
    MAX(t.face_value) FILTER (WHERE t.status = 'ACTIVE') AS max_price,
    AVG(t.face_value) FILTER (WHERE t.status = 'ACTIVE') AS avg_price,
    
    -- NFT statistics
    COUNT(*) FILTER (WHERE t.is_nft = true) AS nft_enabled_tickets,
    COUNT(*) FILTER (WHERE t.is_nft = true AND t.mint_transaction_id IS NOT NULL) AS minted_nfts,
    
    -- QR code coverage
    COUNT(*) FILTER (WHERE t.qr_code_data IS NOT NULL) AS tickets_with_qr,
    
    -- Transfer activity
    SUM(t.transfer_count) AS total_transfers

FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN venues v ON e.venue_id = v.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
WHERE e.deleted_at IS NULL
GROUP BY e.id, e.name, e.status, v.name, tt.id, tt.name, t.section
ORDER BY e.name, tt.name, t.section;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_event_status 
ON tickets(event_id, status);

CREATE INDEX IF NOT EXISTS idx_tickets_type_status 
ON tickets(ticket_type_id, status);

-- Grant permissions
GRANT SELECT ON ticket_status_details TO PUBLIC;
GRANT SELECT ON ticket_inventory_summary TO PUBLIC;
