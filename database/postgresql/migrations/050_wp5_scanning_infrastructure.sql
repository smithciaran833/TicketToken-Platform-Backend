-- =============================================
-- WP-5: QR/Door Scanning Infrastructure
-- =============================================
-- Adds HMAC-based rotating QR codes, device management,
-- and offline validation support
-- Created: 2025-08-15

-- Add HMAC and rotation fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_hmac_secret VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_rotation_counter INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_last_rotated_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_validation_window INTEGER DEFAULT 300; -- 5 minutes in seconds

-- Create scanner device management table
CREATE TABLE IF NOT EXISTS scanner_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50) CHECK (device_type IN ('handheld', 'turnstile', 'mobile', 'kiosk')),
    venue_id UUID REFERENCES venues(id),
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMP,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    registered_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id),
    revoked_reason TEXT,
    -- Device capabilities
    can_scan_offline BOOLEAN DEFAULT false,
    offline_cache_size_mb INTEGER DEFAULT 50,
    last_sync_at TIMESTAMP,
    -- Network info
    ip_address INET,
    user_agent TEXT,
    app_version VARCHAR(20),
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create offline validation cache table
CREATE TABLE IF NOT EXISTS offline_validation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    validation_hash VARCHAR(128) NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    ticket_data JSONB NOT NULL, -- Cached ticket info for offline display
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, valid_from)
);

-- Create QR scan attempts table for rate limiting and security
CREATE TABLE IF NOT EXISTS qr_scan_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100),
    ticket_id UUID,
    scan_data TEXT,
    success BOOLEAN DEFAULT false,
    failure_reason VARCHAR(100),
    ip_address INET,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scanner_devices_active ON scanner_devices(device_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scanner_devices_venue ON scanner_devices(venue_id, is_active);
CREATE INDEX IF NOT EXISTS idx_offline_cache_event ON offline_validation_cache(event_id, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_offline_cache_ticket ON offline_validation_cache(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scan_attempts_device ON qr_scan_attempts(device_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_attempts_ticket ON qr_scan_attempts(ticket_id, attempted_at DESC);

-- Function to generate HMAC secret for a ticket
CREATE OR REPLACE FUNCTION generate_ticket_hmac_secret()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qr_hmac_secret IS NULL THEN
        NEW.qr_hmac_secret := encode(gen_random_bytes(32), 'hex');
        NEW.qr_last_rotated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate HMAC secret when ticket is sold
CREATE TRIGGER trg_generate_hmac_on_ticket_sale
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    WHEN (OLD.status != 'SOLD' AND NEW.status = 'SOLD')
    EXECUTE FUNCTION generate_ticket_hmac_secret();

-- Function to validate scan attempt
CREATE OR REPLACE FUNCTION validate_qr_scan(
    p_ticket_id UUID,
    p_device_id VARCHAR,
    p_scan_hash VARCHAR
) RETURNS TABLE (
    is_valid BOOLEAN,
    error_code VARCHAR,
    error_message TEXT
) AS $$
DECLARE
    v_ticket RECORD;
    v_device RECORD;
    v_recent_scan TIMESTAMP;
BEGIN
    -- Check device authorization
    SELECT * INTO v_device 
    FROM scanner_devices 
    WHERE device_id = p_device_id AND is_active = true;
    
    IF v_device IS NULL THEN
        RETURN QUERY SELECT false, 'INVALID_DEVICE', 'Scanner device not authorized';
        RETURN;
    END IF;
    
    -- Get ticket info
    SELECT * INTO v_ticket 
    FROM tickets 
    WHERE id = p_ticket_id;
    
    IF v_ticket IS NULL THEN
        RETURN QUERY SELECT false, 'INVALID_TICKET', 'Ticket not found';
        RETURN;
    END IF;
    
    -- Check ticket status
    IF v_ticket.status = 'USED' THEN
        -- Check for recent scan (allow re-entry within 15 minutes)
        SELECT scanned_at INTO v_recent_scan
        FROM ticket_redemptions
        WHERE ticket_id = p_ticket_id
        ORDER BY scanned_at DESC
        LIMIT 1;
        
        IF v_recent_scan IS NOT NULL AND 
           (CURRENT_TIMESTAMP - v_recent_scan) > INTERVAL '15 minutes' THEN
            RETURN QUERY SELECT false, 'ALREADY_USED', 'Ticket has already been used';
            RETURN;
        END IF;
    END IF;
    
    IF v_ticket.status NOT IN ('SOLD', 'TRANSFERRED') THEN
        RETURN QUERY SELECT false, 'INVALID_STATUS', 'Ticket status: ' || v_ticket.status;
        RETURN;
    END IF;
    
    -- Update device last seen
    UPDATE scanner_devices 
    SET last_seen_at = CURRENT_TIMESTAMP 
    WHERE device_id = p_device_id;
    
    RETURN QUERY SELECT true, NULL::VARCHAR, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE scanner_devices IS 'Manages authorized scanning devices for venues';
COMMENT ON TABLE offline_validation_cache IS 'Pre-computed validation hashes for offline scanning capability';
COMMENT ON TABLE qr_scan_attempts IS 'Logs all QR scan attempts for security and rate limiting';
COMMENT ON FUNCTION validate_qr_scan IS 'Validates QR scan attempt with device authorization and ticket status checks';

-- Grant permissions (adjust based on your roles)
-- GRANT SELECT, INSERT ON qr_scan_attempts TO scanning_service;
-- GRANT SELECT, UPDATE ON scanner_devices TO scanning_service;
-- GRANT SELECT, UPDATE ON tickets TO scanning_service;
-- GRANT SELECT, INSERT ON ticket_redemptions TO scanning_service;
