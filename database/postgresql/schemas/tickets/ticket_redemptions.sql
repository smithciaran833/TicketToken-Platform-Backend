-- TicketToken Ticket Redemptions Schema
-- This table tracks all ticket entry validations and redemptions at venue gates
-- Entry Validation Process: QR scan -> NFT verification -> Fraud check -> Entry granted/denied
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS ticket_redemptions CASCADE;

-- Create the ticket_redemptions table
CREATE TABLE ticket_redemptions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys to related tables
    ticket_id UUID NOT NULL,  -- The ticket being redeemed
    venue_id UUID NOT NULL,  -- Venue where redemption occurs
    event_id UUID NOT NULL,  -- Event for which ticket is being redeemed
    staff_user_id UUID,  -- Staff member who processed the redemption (NULL for automated)
    
    -- Redemption type and details
    redemption_type VARCHAR(20) NOT NULL CHECK (redemption_type IN ('entry', 'early_entry', 'vip_access', 'exit')),
    
    -- Location data within the venue
    entry_gate VARCHAR(50),  -- Which gate/entrance was used (e.g., 'Gate A', 'VIP Entrance')
    section VARCHAR(50),  -- Section of the venue if applicable
    row_identifier VARCHAR(20),  -- Row identifier if assigned seating
    seat_number VARCHAR(20),  -- Specific seat number if assigned
    
    -- Verification status fields
    qr_code_scanned BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether QR code was successfully scanned
    qr_code_data TEXT,  -- Raw QR code data for verification
    nft_verified BOOLEAN DEFAULT FALSE,  -- Whether NFT ownership was verified (if applicable)
    nft_verification_error TEXT,  -- Error message if NFT verification failed
    fraud_check_passed BOOLEAN DEFAULT TRUE,  -- Whether fraud detection checks passed
    fraud_check_details JSONB,  -- Details of fraud checks performed
    
    -- Entry status
    entry_granted BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether entry was allowed
    denial_reason VARCHAR(100),  -- Reason if entry was denied
    
    -- Device and app information
    scanner_device_id VARCHAR(100),  -- ID of the scanning device
    scanner_device_type VARCHAR(50),  -- Type of scanner (e.g., 'handheld', 'turnstile', 'mobile')
    mobile_app_version VARCHAR(20),  -- Version of mobile app if used
    scanner_location_gps POINT,  -- GPS coordinates of scanner if available
    
    -- Timestamps for the validation process
    scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- When QR was scanned
    verified_at TIMESTAMP WITH TIME ZONE,  -- When all verifications completed
    entry_granted_at TIMESTAMP WITH TIME ZONE,  -- When entry was actually granted
    exit_at TIMESTAMP WITH TIME ZONE,  -- When patron exited (for exit type)
    
    -- Security and fraud tracking
    duplicate_attempts INTEGER DEFAULT 0,  -- Number of duplicate scan attempts
    previous_redemption_id UUID,  -- Reference to previous redemption if duplicate
    suspicious_activity BOOLEAN DEFAULT FALSE,  -- Flag for suspicious patterns
    suspicious_activity_details JSONB,  -- Details of suspicious activity
    ip_address INET,  -- IP address if scanned via mobile app
    user_agent TEXT,  -- User agent if scanned via mobile app
    
    -- Additional metadata
    weather_conditions JSONB,  -- Weather at time of entry (temperature, conditions)
    wait_time_seconds INTEGER,  -- Estimated wait time at entry
    metadata JSONB,  -- Additional redemption data
    
    -- Foreign key constraints
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
    CONSTRAINT fk_staff_user FOREIGN KEY (staff_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_previous_redemption FOREIGN KEY (previous_redemption_id) REFERENCES ticket_redemptions(id) ON DELETE SET NULL,
    
    -- Ensure exit timestamp is after entry for exit type
    CONSTRAINT chk_exit_after_entry CHECK (
        (redemption_type != 'exit') OR 
        (redemption_type = 'exit' AND exit_at >= entry_granted_at)
    ),
    
    -- Ensure denial reason is set when entry is not granted
    CONSTRAINT chk_denial_reason CHECK (
        (entry_granted = TRUE AND denial_reason IS NULL) OR
        (entry_granted = FALSE AND denial_reason IS NOT NULL)
    ),
    
    -- Ensure verification timestamp is set when entry is granted
    CONSTRAINT chk_verification_timing CHECK (
        (entry_granted = FALSE) OR
        (entry_granted = TRUE AND verified_at IS NOT NULL)
    ),
    
    -- Ensure timestamps are in correct order
    CONSTRAINT chk_timestamp_order CHECK (
        (verified_at IS NULL OR verified_at >= scanned_at) AND
        (entry_granted_at IS NULL OR entry_granted_at >= verified_at)
    )
);

-- Create indexes for performance optimization

-- Primary indexes for real-time scanning
CREATE INDEX idx_ticket_redemptions_ticket_id ON ticket_redemptions(ticket_id);
CREATE INDEX idx_ticket_redemptions_event_id ON ticket_redemptions(event_id);
CREATE INDEX idx_ticket_redemptions_venue_id ON ticket_redemptions(venue_id);

-- Composite index for checking existing redemptions (duplicate prevention)
CREATE UNIQUE INDEX idx_ticket_redemptions_unique_entry ON ticket_redemptions(ticket_id, event_id, redemption_type) 
    WHERE redemption_type = 'entry' AND entry_granted = TRUE;

-- Index for real-time entry status checks
CREATE INDEX idx_ticket_redemptions_ticket_status ON ticket_redemptions(ticket_id, entry_granted, scanned_at DESC);

-- Index for staff member redemption history
CREATE INDEX idx_ticket_redemptions_staff ON ticket_redemptions(staff_user_id) WHERE staff_user_id IS NOT NULL;

-- Index for gate/entrance analytics
CREATE INDEX idx_ticket_redemptions_gate ON ticket_redemptions(venue_id, entry_gate, scanned_at);

-- Index for suspicious activity monitoring
CREATE INDEX idx_ticket_redemptions_suspicious ON ticket_redemptions(suspicious_activity, scanned_at DESC) 
    WHERE suspicious_activity = TRUE;

-- Index for duplicate attempt tracking
CREATE INDEX idx_ticket_redemptions_duplicates ON ticket_redemptions(duplicate_attempts) 
    WHERE duplicate_attempts > 0;

-- Composite index for venue entry flow analytics
CREATE INDEX idx_ticket_redemptions_venue_flow ON ticket_redemptions(venue_id, entry_gate, scanned_at, entry_granted);

-- Index for exit tracking
CREATE INDEX idx_ticket_redemptions_exits ON ticket_redemptions(ticket_id, redemption_type, exit_at) 
    WHERE redemption_type = 'exit';

-- Index for fraud analysis
CREATE INDEX idx_ticket_redemptions_fraud ON ticket_redemptions(fraud_check_passed, scanned_at DESC) 
    WHERE fraud_check_passed = FALSE;

-- Index for device tracking
CREATE INDEX idx_ticket_redemptions_device ON ticket_redemptions(scanner_device_id, scanned_at DESC);

-- Partial index for denied entries
CREATE INDEX idx_ticket_redemptions_denied ON ticket_redemptions(denial_reason, scanned_at DESC) 
    WHERE entry_granted = FALSE;

-- Index for real-time entry counts
CREATE INDEX idx_ticket_redemptions_realtime ON ticket_redemptions(event_id, entry_granted, scanned_at) 
    WHERE entry_granted = TRUE;

-- Index for section/seat analytics
CREATE INDEX idx_ticket_redemptions_seating ON ticket_redemptions(event_id, section, row_identifier, seat_number) 
    WHERE section IS NOT NULL;

-- Create function to handle redemption validation
CREATE OR REPLACE FUNCTION validate_redemption()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if ticket has already been redeemed for this event
    IF NEW.redemption_type = 'entry' AND NEW.entry_granted = TRUE THEN
        IF EXISTS (
            SELECT 1 FROM ticket_redemptions 
            WHERE ticket_id = NEW.ticket_id 
            AND event_id = NEW.event_id 
            AND redemption_type = 'entry' 
            AND entry_granted = TRUE 
            AND id != NEW.id
        ) THEN
            NEW.entry_granted = FALSE;
            NEW.denial_reason = 'Ticket already redeemed';
            NEW.duplicate_attempts = COALESCE(
                (SELECT MAX(duplicate_attempts) + 1 
                 FROM ticket_redemptions 
                 WHERE ticket_id = NEW.ticket_id AND event_id = NEW.event_id),
                1
            );
            NEW.suspicious_activity = TRUE;
            NEW.suspicious_activity_details = jsonb_build_object(
                'reason', 'Duplicate redemption attempt',
                'timestamp', CURRENT_TIMESTAMP
            );
        END IF;
    END IF;
    
    -- Set verified_at timestamp
    IF NEW.entry_granted = TRUE AND NEW.verified_at IS NULL THEN
        NEW.verified_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Set entry_granted_at timestamp
    IF NEW.entry_granted = TRUE AND NEW.entry_granted_at IS NULL THEN
        NEW.entry_granted_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_redemption_before_insert
    BEFORE INSERT ON ticket_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION validate_redemption();

-- Add table comments
COMMENT ON TABLE ticket_redemptions IS 'Tracks all ticket entry validations and redemptions at venue gates. Validation process: QR scan -> NFT verification -> Fraud check -> Entry granted/denied';

-- Add column comments
COMMENT ON COLUMN ticket_redemptions.id IS 'Unique identifier for the redemption attempt (UUID)';
COMMENT ON COLUMN ticket_redemptions.ticket_id IS 'Foreign key to tickets table - the ticket being redeemed';
COMMENT ON COLUMN ticket_redemptions.venue_id IS 'Foreign key to venues table - venue where redemption occurs';
COMMENT ON COLUMN ticket_redemptions.event_id IS 'Foreign key to events table - event for which ticket is being redeemed';
COMMENT ON COLUMN ticket_redemptions.staff_user_id IS 'Foreign key to users table - staff member who processed (NULL for automated)';
COMMENT ON COLUMN ticket_redemptions.redemption_type IS 'Type of redemption: entry (main entrance), early_entry (VIP early access), vip_access (VIP areas), exit (departure)';
COMMENT ON COLUMN ticket_redemptions.entry_gate IS 'Which gate/entrance was used (e.g., Gate A, VIP Entrance, North Entry)';
COMMENT ON COLUMN ticket_redemptions.section IS 'Section of the venue for assigned seating events';
COMMENT ON COLUMN ticket_redemptions.row_identifier IS 'Row identifier for assigned seating';
COMMENT ON COLUMN ticket_redemptions.seat_number IS 'Specific seat number for assigned seating';
COMMENT ON COLUMN ticket_redemptions.qr_code_scanned IS 'Whether QR code was successfully scanned and decoded';
COMMENT ON COLUMN ticket_redemptions.qr_code_data IS 'Raw QR code data for audit and verification';
COMMENT ON COLUMN ticket_redemptions.nft_verified IS 'Whether NFT ownership was verified on blockchain (if applicable)';
COMMENT ON COLUMN ticket_redemptions.nft_verification_error IS 'Error details if NFT verification failed';
COMMENT ON COLUMN ticket_redemptions.fraud_check_passed IS 'Whether all fraud detection checks passed';
COMMENT ON COLUMN ticket_redemptions.fraud_check_details IS 'Detailed results of fraud checks performed';
COMMENT ON COLUMN ticket_redemptions.entry_granted IS 'Whether entry was ultimately allowed';
COMMENT ON COLUMN ticket_redemptions.denial_reason IS 'Reason for denial if entry was not granted';
COMMENT ON COLUMN ticket_redemptions.scanner_device_id IS 'Unique identifier of the scanning device';
COMMENT ON COLUMN ticket_redemptions.scanner_device_type IS 'Type of scanner: handheld, turnstile, mobile, kiosk';
COMMENT ON COLUMN ticket_redemptions.mobile_app_version IS 'Version of mobile app if used for scanning';
COMMENT ON COLUMN ticket_redemptions.scanner_location_gps IS 'GPS coordinates of scanner for mobile devices';
COMMENT ON COLUMN ticket_redemptions.scanned_at IS 'Timestamp when QR code was initially scanned';
COMMENT ON COLUMN ticket_redemptions.verified_at IS 'Timestamp when all verifications completed';
COMMENT ON COLUMN ticket_redemptions.entry_granted_at IS 'Timestamp when entry was actually granted';
COMMENT ON COLUMN ticket_redemptions.exit_at IS 'Timestamp when patron exited (for exit type redemptions)';
COMMENT ON COLUMN ticket_redemptions.duplicate_attempts IS 'Count of duplicate redemption attempts for this ticket';
COMMENT ON COLUMN ticket_redemptions.previous_redemption_id IS 'Reference to previous redemption if this is a duplicate';
COMMENT ON COLUMN ticket_redemptions.suspicious_activity IS 'Flag indicating suspicious redemption patterns';
COMMENT ON COLUMN ticket_redemptions.suspicious_activity_details IS 'Details about what triggered suspicion';
COMMENT ON COLUMN ticket_redemptions.ip_address IS 'IP address if scanned via mobile app';
COMMENT ON COLUMN ticket_redemptions.user_agent IS 'User agent string if scanned via mobile app';
COMMENT ON COLUMN ticket_redemptions.weather_conditions IS 'Weather data at time of entry for analytics';
COMMENT ON COLUMN ticket_redemptions.wait_time_seconds IS 'Estimated wait time at entry point';
COMMENT ON COLUMN ticket_redemptions.metadata IS 'Additional redemption data as JSONB';

-- Sample data for testing (commented out)
/*
-- Successful entry redemption
INSERT INTO ticket_redemptions (
    ticket_id, venue_id, event_id, redemption_type,
    entry_gate, qr_code_scanned, nft_verified, 
    fraud_check_passed, entry_granted, scanner_device_id
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'entry',
    'Gate A',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    'SCANNER-001'
);

-- Denied duplicate entry attempt
INSERT INTO ticket_redemptions (
    ticket_id, venue_id, event_id, redemption_type,
    entry_gate, qr_code_scanned, entry_granted,
    denial_reason, duplicate_attempts, suspicious_activity
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'entry',
    'Gate B',
    TRUE,
    FALSE,
    'Ticket already redeemed',
    1,
    TRUE
);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_redemptions_tenant_id ON ticket_redemptions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_redemptions_tenant_created ON ticket_redemptions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
