-- Ticket Status View (CORRECTED - All column names match actual schema)

DROP VIEW IF EXISTS ticket_inventory_summary CASCADE;
DROP VIEW IF EXISTS ticket_status_details CASCADE;

-- Create ticket status details view
CREATE OR REPLACE VIEW ticket_status_details AS
SELECT 
    -- Ticket identification
    t.id AS ticket_id,
    t.ticket_number,
    t.qr_code,
    
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
    t.price AS purchase_price,
    
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
    t.is_validated,
    
    -- Ownership
    t.user_id AS owner_id,
    t.original_purchaser_id,
    
    -- Important timestamps
    t.purchased_at,
    t.created_at,
    t.updated_at,
    
    -- Status indicators
    CASE 
        WHEN t.status = 'active' THEN true
        ELSE false
    END AS is_available,
    
    CASE 
        WHEN t.status = 'used' THEN true
        ELSE false
    END AS is_redeemed,
    
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM marketplace_listings ml 
            WHERE ml.ticket_id = t.id 
            AND ml.status = 'active'
        ) THEN true
        ELSE false
    END AS is_listed,
    
    CASE 
        WHEN t.status = 'transferred' THEN true
        ELSE false
    END AS is_transferred,
    
    -- Transfer information
    t.is_transferable,
    t.transfer_count,
    
    -- Pending transfers from ticket_transfers table
    (SELECT COUNT(*) 
     FROM ticket_transfers tr 
     WHERE tr.ticket_id = t.id 
     AND tr.status = 'pending') AS pending_transfers,
    
    -- NFT/Blockchain status
    t.is_nft,
    CASE 
        WHEN t.is_nft THEN 'NFT_ENABLED'
        ELSE 'STANDARD'
    END AS blockchain_status,
    
    -- QR Code information
    t.qr_code AS qr_code_data,
    CASE 
        WHEN t.qr_code IS NOT NULL THEN true
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
AND v.deleted_at IS NULL
AND t.deleted_at IS NULL;

-- Recreate inventory summary view
CREATE OR REPLACE VIEW ticket_inventory_summary AS
SELECT 
    e.id AS event_id,
    e.name AS event_name,
    e.status AS event_status,
    v.name AS venue_name,
    tt.id AS ticket_type_id,
    tt.name AS ticket_type_name,
    tt.category AS ticket_category,
    
    -- Status breakdown
    COUNT(*) AS total_tickets,
    COUNT(*) FILTER (WHERE t.status = 'active') AS active_tickets,
    COUNT(*) FILTER (WHERE t.status = 'used') AS redeemed_tickets,
    COUNT(*) FILTER (WHERE t.status = 'transferred') AS transferred_tickets,
    COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled_tickets,
    
    -- Availability percentage
    ROUND(
        (COUNT(*) FILTER (WHERE t.status = 'active'))::numeric / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) AS availability_percentage,
    
    -- Section breakdown (if applicable)
    t.section,
    
    -- Price range
    MIN(t.face_value) FILTER (WHERE t.status = 'active') AS min_price,
    MAX(t.face_value) FILTER (WHERE t.status = 'active') AS max_price,
    AVG(t.face_value) FILTER (WHERE t.status = 'active') AS avg_price,
    
    -- NFT statistics
    COUNT(*) FILTER (WHERE t.is_nft = true) AS nft_enabled_tickets,
    
    -- QR code coverage
    COUNT(*) FILTER (WHERE t.qr_code IS NOT NULL) AS tickets_with_qr,
    
    -- Transfer activity
    SUM(t.transfer_count) AS total_transfers

FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN venues v ON e.venue_id = v.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
WHERE e.deleted_at IS NULL
AND t.deleted_at IS NULL
GROUP BY e.id, e.name, e.status, v.name, tt.id, tt.name, tt.category, t.section
ORDER BY e.name, tt.name, t.section;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_event_status 
ON tickets(event_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_type_status 
ON tickets(ticket_type_id, status) WHERE deleted_at IS NULL;

-- Grant permissions
GRANT SELECT ON ticket_status_details TO PUBLIC;
GRANT SELECT ON ticket_inventory_summary TO PUBLIC;
