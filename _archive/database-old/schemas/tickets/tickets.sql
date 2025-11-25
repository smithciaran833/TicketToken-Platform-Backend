-- TicketToken Platform - Individual Tickets Management Schema
-- Week 1, Day 5: Individual Tickets and Ownership Management
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive individual ticket management including NFT integration,
--              transfer history, validation, and ownership tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TICKETS MASTER TABLE
-- ==========================================
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    ticket_type_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    purchaser_user_id UUID NOT NULL, -- Original purchaser (may differ from current owner)
    
    -- Unique identifiers
    ticket_number VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(100) NOT NULL UNIQUE,
    qr_code VARCHAR(500), -- QR code data/URL
    ticket_hash VARCHAR(64) UNIQUE, -- SHA-256 hash for verification
    
    -- Seat and location assignment
    venue_section VARCHAR(50),
    seat_row VARCHAR(10),
    seat_number VARCHAR(10),
    seat_coordinates JSONB, -- For GA events or complex layouts
    access_level VARCHAR(20),
    special_access TEXT[], -- Array of special access permissions
    
    -- Purchase information
    purchase_price DECIMAL(10,2) NOT NULL CHECK (purchase_price >= 0),
    fees_paid DECIMAL(10,2) DEFAULT 0,
    taxes_paid DECIMAL(10,2) DEFAULT 0,
    total_paid DECIMAL(10,2) NOT NULL CHECK (total_paid >= 0),
    currency_code VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(20),
    transaction_id VARCHAR(100),
    purchase_channel VARCHAR(30) DEFAULT 'WEB' CHECK (purchase_channel IN ('WEB', 'MOBILE', 'POS', 'PHONE', 'THIRD_PARTY', 'RESALE')),
    
    -- Ticket status and lifecycle
    status VARCHAR(20) DEFAULT 'SOLD' CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'USED', 'REFUNDED', 'CANCELLED', 'TRANSFERRED', 'EXPIRED', 'VOID')),
    substatus VARCHAR(30), -- Additional status details like 'PENDING_TRANSFER', 'AWAITING_REFUND'
    is_active BOOLEAN DEFAULT true,
    is_transferable BOOLEAN DEFAULT true,
    is_refundable BOOLEAN DEFAULT true,
    is_digital BOOLEAN DEFAULT true,
    requires_id_check BOOLEAN DEFAULT false,
    
    -- NFT and blockchain integration
    nft_token_id VARCHAR(100),
    blockchain_network VARCHAR(20), -- 'ETHEREUM', 'POLYGON', 'SOLANA', etc.
    smart_contract_address VARCHAR(100),
    nft_metadata_uri VARCHAR(500),
    blockchain_transaction_hash VARCHAR(100),
    nft_minted_at TIMESTAMP WITH TIME ZONE,
    nft_owner_wallet_address VARCHAR(100),
    
    -- Timing and validation
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    first_scanned_at TIMESTAMP WITH TIME ZONE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    scan_count INTEGER DEFAULT 0,
    entry_allowed_from TIMESTAMP WITH TIME ZONE,
    entry_cutoff TIMESTAMP WITH TIME ZONE,
    
    -- Transfer and ownership
    transfer_count INTEGER DEFAULT 0,
    original_purchase_id UUID, -- Links to original purchase record
    transfer_restrictions JSONB,
    ownership_verified_at TIMESTAMP WITH TIME ZONE,
    verification_method VARCHAR(20),
    
    -- Additional metadata
    notes TEXT,
    metadata JSONB,
    source_system VARCHAR(50) DEFAULT 'TICKETTOKEN',
    external_reference VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT fk_ticket_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_purchaser FOREIGN KEY (purchaser_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_ticket_updater FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT chk_ticket_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT chk_entry_dates CHECK (entry_cutoff IS NULL OR entry_cutoff > entry_allowed_from),
    CONSTRAINT chk_scan_count CHECK (scan_count >= 0),
    CONSTRAINT chk_transfer_count CHECK (transfer_count >= 0)
);

-- ==========================================
-- TICKET TRANSFER HISTORY
-- ==========================================
CREATE TABLE ticket_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    original_ticket_id UUID NOT NULL, -- The ticket being transferred
    new_ticket_id UUID, -- New ticket created for recipient (if applicable)
    
    -- Transfer parties
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    initiated_by_user_id UUID NOT NULL,
    
    -- Transfer details
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('GIFT', 'SALE', 'RESALE', 'REFUND_REPLACEMENT', 'UPGRADE', 'ADMIN')),
    transfer_method VARCHAR(20) DEFAULT 'PLATFORM' CHECK (transfer_method IN ('PLATFORM', 'EMAIL', 'QR_CODE', 'BLOCKCHAIN', 'PHYSICAL')),
    transfer_price DECIMAL(10,2), -- Price paid in transfer (for resales)
    transfer_fee DECIMAL(10,2) DEFAULT 0,
    platform_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Transfer status and validation
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Blockchain transaction (if NFT)
    blockchain_transaction_hash VARCHAR(100),
    blockchain_confirmation_count INTEGER DEFAULT 0,
    gas_fee DECIMAL(18,8),
    
    -- Transfer restrictions and validation
    transfer_code VARCHAR(20), -- Unique code for email/manual transfers
    expires_at TIMESTAMP WITH TIME ZONE,
    acceptance_deadline TIMESTAMP WITH TIME ZONE,
    transfer_message TEXT,
    terms_accepted BOOLEAN DEFAULT false,
    
    -- Audit trail
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    
    -- Constraints
    CONSTRAINT fk_transfer_original_ticket FOREIGN KEY (original_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_new_ticket FOREIGN KEY (new_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_initiator FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_approver FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT chk_transfer_different_users CHECK (from_user_id != to_user_id),
    CONSTRAINT chk_transfer_price CHECK (transfer_price IS NULL OR transfer_price >= 0)
);

-- ==========================================
-- TICKET VALIDATION AND ENTRY LOGS
-- ==========================================
CREATE TABLE ticket_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    
    -- Validation details
    validation_type VARCHAR(20) NOT NULL CHECK (validation_type IN ('ENTRY_SCAN', 'VALIDATION_CHECK', 'FRAUD_CHECK', 'ID_VERIFICATION', 'MANUAL_CHECK')),
    validation_method VARCHAR(20) NOT NULL CHECK (validation_method IN ('QR_SCAN', 'BARCODE_SCAN', 'NFC', 'RFID', 'MANUAL', 'MOBILE_APP', 'KIOSK')),
    validation_result VARCHAR(20) NOT NULL CHECK (validation_result IN ('VALID', 'INVALID', 'EXPIRED', 'USED', 'DUPLICATE', 'FRAUD', 'ERROR')),
    
    -- Location and device information
    validation_location VARCHAR(100), -- Gate, entrance, checkpoint name
    venue_zone VARCHAR(50),
    device_id VARCHAR(100),
    device_type VARCHAR(30),
    gps_coordinates POINT,
    ip_address INET,
    user_agent TEXT,
    
    -- Validation context
    validated_by_user_id UUID, -- Staff member who performed validation
    validation_notes TEXT,
    error_message TEXT,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Fraud detection
    fraud_flags TEXT[],
    risk_score DECIMAL(5,2) DEFAULT 0,
    duplicate_scan_detected BOOLEAN DEFAULT false,
    time_since_last_scan INTERVAL,
    
    -- Additional data
    validation_data JSONB, -- Flexible data for specific validation types
    photo_url VARCHAR(500), -- Photo taken during validation
    signature_data TEXT, -- Digital signature if captured
    
    -- Timing
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER, -- How long validation took
    
    -- Constraints
    CONSTRAINT fk_validation_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_validation_user FOREIGN KEY (validated_by_user_id) REFERENCES users(id)
);

-- ==========================================
-- TICKET OWNERSHIP CHAIN
-- ==========================================
CREATE TABLE ticket_ownership_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    ownership_type VARCHAR(20) NOT NULL CHECK (ownership_type IN ('PURCHASE', 'TRANSFER', 'GIFT', 'INHERITANCE', 'ADMIN_ASSIGN', 'REFUND_REISSUE')),
    
    -- Ownership period
    owned_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    owned_until TIMESTAMP WITH TIME ZONE,
    is_current_owner BOOLEAN DEFAULT false,
    
    -- Reference to transaction that caused ownership change
    source_transaction_id UUID, -- Could reference purchase, transfer, etc.
    source_transaction_type VARCHAR(20),
    price_paid DECIMAL(10,2),
    
    -- Verification and proof
    ownership_proof_hash VARCHAR(64),
    blockchain_transaction_hash VARCHAR(100),
    legal_document_url VARCHAR(500),
    
    -- Additional context
    ownership_notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_ownership_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ownership_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- ==========================================
-- TICKET RESALE LISTINGS
-- ==========================================
CREATE TABLE ticket_resale_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    seller_user_id UUID NOT NULL,
    
    -- Listing details
    listing_price DECIMAL(10,2) NOT NULL CHECK (listing_price > 0),
    min_price DECIMAL(10,2) CHECK (min_price <= listing_price),
    currency_code VARCHAR(3) DEFAULT 'USD',
    price_type VARCHAR(20) DEFAULT 'FIXED' CHECK (price_type IN ('FIXED', 'AUCTION', 'MAKE_OFFER', 'DECLINING')),
    
    -- Auction details (if applicable)
    auction_start_price DECIMAL(10,2),
    auction_reserve_price DECIMAL(10,2),
    auction_end_time TIMESTAMP WITH TIME ZONE,
    current_highest_bid DECIMAL(10,2),
    bid_count INTEGER DEFAULT 0,
    
    -- Listing status and visibility
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'SOLD', 'CANCELLED', 'EXPIRED', 'REMOVED')),
    visibility VARCHAR(20) DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'INVITE_ONLY', 'PLATFORM_ONLY')),
    is_verified BOOLEAN DEFAULT false,
    verification_notes TEXT,
    
    -- Platform and fees
    platform_fee_percentage DECIMAL(5,2) DEFAULT 10,
    seller_fee DECIMAL(10,2) DEFAULT 0,
    buyer_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Listing metadata
    title VARCHAR(200),
    description TEXT,
    listing_images TEXT[],
    tags TEXT[],
    external_listing_urls TEXT[],
    
    -- Geographic restrictions
    allowed_countries TEXT[],
    restricted_regions TEXT[],
    local_pickup_available BOOLEAN DEFAULT false,
    shipping_options JSONB,
    
    -- Timing
    listed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    sold_at TIMESTAMP WITH TIME ZONE,
    removed_at TIMESTAMP WITH TIME ZONE,
    
    -- Performance tracking
    view_count INTEGER DEFAULT 0,
    inquiry_count INTEGER DEFAULT 0,
    offer_count INTEGER DEFAULT 0,
    
    -- Additional data
    metadata JSONB,
    created_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_resale_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_resale_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_resale_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_resale_auction CHECK (
        (price_type != 'AUCTION') OR 
        (auction_start_price IS NOT NULL AND auction_end_time IS NOT NULL)
    )
);

-- ==========================================
-- TICKET BATCH OPERATIONS
-- ==========================================
CREATE TABLE ticket_batch_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN ('BULK_CREATE', 'BULK_TRANSFER', 'BULK_CANCEL', 'BULK_REFUND', 'BULK_UPDATE', 'BULK_VALIDATE')),
    event_id UUID,
    ticket_type_id UUID,
    
    -- Operation parameters
    operation_parameters JSONB NOT NULL,
    ticket_ids UUID[], -- Array of ticket IDs affected
    target_user_id UUID, -- For bulk transfers
    
    -- Operation status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    total_tickets INTEGER NOT NULL,
    processed_tickets INTEGER DEFAULT 0,
    successful_tickets INTEGER DEFAULT 0,
    failed_tickets INTEGER DEFAULT 0,
    
    -- Progress tracking
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    estimated_completion TIMESTAMP WITH TIME ZONE,
    error_messages TEXT[],
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    initiated_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_batch_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_batch_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_batch_target_user FOREIGN KEY (target_user_id) REFERENCES users(id),
    CONSTRAINT fk_batch_initiator FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_batch_counts CHECK (processed_tickets = successful_tickets + failed_tickets)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to generate unique ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number(p_event_id UUID, p_ticket_type_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_event_code VARCHAR(10);
    v_type_code VARCHAR(5);
    v_sequence INTEGER;
    v_ticket_number VARCHAR(50);
BEGIN
    -- Get event code (first 3 chars of event name + last 4 of UUID)
    SELECT UPPER(LEFT(REGEXP_REPLACE(event_name, '[^A-Za-z0-9]', '', 'g'), 3)) || 
           RIGHT(REPLACE(id::TEXT, '-', ''), 4) INTO v_event_code
    FROM events WHERE id = p_event_id;
    
    -- Get ticket type code (first 2 chars of type name + priority)
    SELECT UPPER(LEFT(REGEXP_REPLACE(type_name, '[^A-Za-z0-9]', '', 'g'), 2)) || 
           LPAD(tier_priority::TEXT, 1, '0') INTO v_type_code
    FROM ticket_types WHERE id = p_ticket_type_id;
    
    -- Get next sequence number for this event/type combination
    SELECT COALESCE(MAX(CAST(RIGHT(ticket_number, 6) AS INTEGER)), 0) + 1 INTO v_sequence
    FROM tickets 
    WHERE event_id = p_event_id AND ticket_type_id = p_ticket_type_id
    AND ticket_number ~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]+$';
    
    v_ticket_number := v_event_code || '-' || v_type_code || '-' || LPAD(v_sequence::TEXT, 6, '0');
    
    RETURN v_ticket_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate barcode
CREATE OR REPLACE FUNCTION generate_barcode(p_ticket_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_timestamp BIGINT;
    v_hash VARCHAR(32);
    v_barcode VARCHAR(100);
BEGIN
    v_timestamp := EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT;
    v_hash := MD5(p_ticket_id::TEXT || v_timestamp::TEXT);
    v_barcode := 'TT' || UPPER(LEFT(v_hash, 12)) || LPAD((v_timestamp % 999999)::TEXT, 6, '0');
    
    RETURN v_barcode;
END;
$$ LANGUAGE plpgsql;

-- Function to validate ticket for entry
CREATE OR REPLACE FUNCTION validate_ticket_entry(
    p_ticket_id UUID,
    p_validation_location VARCHAR DEFAULT NULL,
    p_validated_by UUID DEFAULT NULL
)
RETURNS TABLE(
    is_valid BOOLEAN,
    validation_result VARCHAR,
    error_message TEXT,
    entry_allowed BOOLEAN
) AS $$
DECLARE
    v_ticket RECORD;
    v_validation_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
    v_last_scan TIMESTAMP WITH TIME ZONE;
    v_fraud_flags TEXT[] := ARRAY[]::TEXT[];
    v_confidence DECIMAL(3,2) := 1.00;
BEGIN
    -- Get ticket details
    SELECT t.*, e.event_date, e.event_start_time INTO v_ticket
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE t.id = p_ticket_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket not found', false;
        RETURN;
    END IF;
    
    -- Check ticket status
    IF v_ticket.status NOT IN ('SOLD', 'TRANSFERRED') THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket status: ' || v_ticket.status, false;
        RETURN;
    END IF;
    
    -- Check if ticket is active
    IF NOT v_ticket.is_active THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket is not active', false;
        RETURN;
    END IF;
    
    -- Check valid date range
    IF v_ticket.valid_from IS NOT NULL AND v_now < v_ticket.valid_from THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket not yet valid', false;
        RETURN;
    END IF;
    
    IF v_ticket.valid_until IS NOT NULL AND v_now > v_ticket.valid_until THEN
        RETURN QUERY SELECT false, 'EXPIRED', 'Ticket has expired', false;
        RETURN;
    END IF;
    
    -- Check entry time windows
    IF v_ticket.entry_allowed_from IS NOT NULL AND v_now < v_ticket.entry_allowed_from THEN
        RETURN QUERY SELECT false, 'INVALID', 'Entry not yet allowed', false;
        RETURN;
    END IF;
    
    IF v_ticket.entry_cutoff IS NOT NULL AND v_now > v_ticket.entry_cutoff THEN
        RETURN QUERY SELECT false, 'EXPIRED', 'Entry cutoff time passed', false;
        RETURN;
    END IF;
    
    -- Check for recent duplicate scans
    SELECT last_scanned_at INTO v_last_scan
    FROM tickets WHERE id = p_ticket_id;
    
    IF v_last_scan IS NOT NULL AND v_now - v_last_scan < INTERVAL '30 seconds' THEN
        v_fraud_flags := array_append(v_fraud_flags, 'RAPID_SCAN');
        v_confidence := v_confidence - 0.3;
    END IF;
    
    -- Check if already used (for single-entry tickets)
    IF v_ticket.scan_count > 0 AND v_ticket.first_scanned_at IS NOT NULL THEN
        -- Allow re-entry within 15 minutes for legitimate cases
        IF v_now - v_ticket.first_scanned_at > INTERVAL '15 minutes' THEN
            RETURN QUERY SELECT false, 'USED', 'Ticket already used', false;
            RETURN;
        ELSE
            v_fraud_flags := array_append(v_fraud_flags, 'RECENT_REENTRY');
            v_confidence := v_confidence - 0.2;
        END IF;
    END IF;
    
    -- Update ticket scan information
    UPDATE tickets
    SET 
        scan_count = scan_count + 1,
        last_scanned_at = v_now,
        first_scanned_at = COALESCE(first_scanned_at, v_now),
        updated_at = v_now
    WHERE id = p_ticket_id;
    
    -- Log validation
    INSERT INTO ticket_validations (
        ticket_id, validation_type, validation_method, validation_result,
        validation_location, validated_by_user_id, fraud_flags,
        confidence_score, duplicate_scan_detected,
        time_since_last_scan
    ) VALUES (
        p_ticket_id, 'ENTRY_SCAN', 'QR_SCAN', 'VALID',
        p_validation_location, p_validated_by, v_fraud_flags,
        v_confidence, array_length(v_fraud_flags, 1) > 0,
        CASE WHEN v_last_scan IS NOT NULL THEN v_now - v_last_scan ELSE NULL END
    ) RETURNING id INTO v_validation_id;
    
    RETURN QUERY SELECT true, 'VALID', NULL, true;
END;
$$ LANGUAGE plpgsql;

-- Function to transfer ticket ownership
CREATE OR REPLACE FUNCTION transfer_ticket(
    p_ticket_id UUID,
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_transfer_type VARCHAR DEFAULT 'GIFT',
    p_transfer_price DECIMAL DEFAULT NULL,
    p_initiated_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_transfer_id UUID;
    v_ticket RECORD;
    v_policy RECORD;
    v_new_ticket_id UUID;
BEGIN
    -- Get ticket and validate ownership
    SELECT * INTO v_ticket
    FROM tickets
    WHERE id = p_ticket_id AND owner_user_id = p_from_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found or user not owner';
    END IF;
    
    -- Check if ticket is transferable
    IF NOT v_ticket.is_transferable THEN
        RAISE EXCEPTION 'Ticket is not transferable';
    END IF;
    
    -- Get transfer policy
    SELECT * INTO v_policy
    FROM ticket_type_transfer_policies
    WHERE ticket_type_id = v_ticket.ticket_type_id;
    
    -- Check transfer limits
    IF v_policy.max_transfers_per_ticket IS NOT NULL AND 
       v_ticket.transfer_count >= v_policy.max_transfers_per_ticket THEN
        RAISE EXCEPTION 'Maximum transfers exceeded for this ticket';
    END IF;
    
    -- Create transfer record
    INSERT INTO ticket_transfers (
        original_ticket_id, from_user_id, to_user_id,
        initiated_by_user_id, transfer_type, transfer_price,
        status, requires_approval
    ) VALUES (
        p_ticket_id, p_from_user_id, p_to_user_id,
        COALESCE(p_initiated_by, p_from_user_id), p_transfer_type, p_transfer_price,
        CASE WHEN COALESCE(v_policy.requires_approval, false) THEN 'PENDING' ELSE 'COMPLETED' END,
        COALESCE(v_policy.requires_approval, false)
    ) RETURNING id INTO v_transfer_id;
    
    -- If no approval required, complete transfer immediately
    IF NOT COALESCE(v_policy.requires_approval, false) THEN
        -- Update ticket ownership
        UPDATE tickets
        SET 
            owner_user_id = p_to_user_id,
            transfer_count = transfer_count + 1,
            updated_at = CURRENT_TIMESTAMP,
            status = 'TRANSFERRED'
        WHERE id = p_ticket_id;
        
        -- Record ownership change
        INSERT INTO ticket_ownership_history (
            ticket_id, owner_user_id, ownership_type,
            source_transaction_id, source_transaction_type, price_paid
        ) VALUES (
            p_ticket_id, p_to_user_id, 'TRANSFER',
            v_transfer_id, 'TRANSFER', p_transfer_price
        );
        
        -- Mark previous ownership as ended
        UPDATE ticket_ownership_history
        SET owned_until = CURRENT_TIMESTAMP, is_current_owner = false
        WHERE ticket_id = p_ticket_id AND is_current_owner = true AND owner_user_id = p_from_user_id;
        
        -- Update new ownership as current
        UPDATE ticket_ownership_history
        SET is_current_owner = true
        WHERE ticket_id = p_ticket_id AND owner_user_id = p_to_user_id 
        AND owned_until IS NULL;
        
        -- Update transfer status
        UPDATE ticket_transfers
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
        WHERE id = v_transfer_id;
    END IF;
    
    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get ticket ownership chain
CREATE OR REPLACE FUNCTION get_ownership_chain(p_ticket_id UUID)
RETURNS TABLE(
    owner_user_id UUID,
    owner_name VARCHAR,
    ownership_type VARCHAR,
    owned_from TIMESTAMP WITH TIME ZONE,
    owned_until TIMESTAMP WITH TIME ZONE,
    price_paid DECIMAL,
    is_current BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        toh.owner_user_id,
        u.first_name || ' ' || u.last_name as owner_name,
        toh.ownership_type,
        toh.owned_from,
        toh.owned_until,
        toh.price_paid,
        toh.is_current_owner
    FROM ticket_ownership_history toh
    JOIN users u ON toh.owner_user_id = u.id
    WHERE toh.ticket_id = p_ticket_id
    ORDER BY toh.owned_from;
END;
$$ LANGUAGE plpgsql;

-- Function to bulk create tickets
CREATE OR REPLACE FUNCTION bulk_create_tickets(
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_ticket_id UUID;
    v_i INTEGER;
    v_ticket_number VARCHAR(50);
    v_barcode VARCHAR(100);
    v_ticket_type RECORD;
BEGIN
    -- Get ticket type details
    SELECT * INTO v_ticket_type FROM ticket_types WHERE id = p_ticket_type_id;
    
    -- Create batch operation record
    INSERT INTO ticket_batch_operations (
        operation_type, event_id, ticket_type_id, operation_parameters,
        total_tickets, initiated_by
    ) VALUES (
        'BULK_CREATE', p_event_id, p_ticket_type_id,
        jsonb_build_object('quantity', p_quantity, 'auto_assign_seats', false),
        p_quantity, p_created_by
    ) RETURNING id INTO v_batch_id;
    
    -- Update batch status
    UPDATE ticket_batch_operations
    SET status = 'PROCESSING', started_at = CURRENT_TIMESTAMP
    WHERE id = v_batch_id;
    
    -- Create tickets in loop
    FOR v_i IN 1..p_quantity LOOP
        BEGIN
            v_ticket_number := generate_ticket_number(p_event_id, p_ticket_type_id);
            v_barcode := generate_barcode(uuid_generate_v1());
            
            INSERT INTO tickets (
                event_id, ticket_type_id, owner_user_id, purchaser_user_id,
                ticket_number, barcode, purchase_price, total_paid,
                status, created_by
            ) VALUES (
                p_event_id, p_ticket_type_id, p_created_by, p_created_by,
                v_ticket_number, v_barcode, v_ticket_type.base_price, v_ticket_type.total_price,
                'AVAILABLE', p_created_by
            ) RETURNING id INTO v_ticket_id;
            
            -- Update batch progress
            UPDATE ticket_batch_operations
            SET 
                processed_tickets = processed_tickets + 1,
                successful_tickets = successful_tickets + 1,
                progress_percentage = ((processed_tickets + 1.0) / total_tickets) * 100,
                ticket_ids = array_append(ticket_ids, v_ticket_id)
            WHERE id = v_batch_id;
            
        EXCEPTION WHEN OTHERS THEN
            -- Update failed count
            UPDATE ticket_batch_operations
            SET 
                processed_tickets = processed_tickets + 1,
                failed_tickets = failed_tickets + 1,
                progress_percentage = ((processed_tickets + 1.0) / total_tickets) * 100,
                error_messages = array_append(error_messages, SQLERRM)
            WHERE id = v_batch_id;
        END;
    END LOOP;
    
    -- Complete batch operation
    UPDATE ticket_batch_operations
    SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
    WHERE id = v_batch_id;
    
    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX idx_tickets_owner_user_id ON tickets(owner_user_id);
CREATE INDEX idx_tickets_purchaser_user_id ON tickets(purchaser_user_id);
CREATE INDEX idx_tickets_ticket_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_barcode ON tickets(barcode);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_active ON tickets(is_active) WHERE is_active = true;
CREATE INDEX idx_tickets_nft_token ON tickets(nft_token_id) WHERE nft_token_id IS NOT NULL;
CREATE INDEX idx_tickets_blockchain ON tickets(blockchain_network, smart_contract_address);
CREATE INDEX idx_tickets_purchased_at ON tickets(purchased_at);
CREATE INDEX idx_tickets_valid_dates ON tickets(valid_from, valid_until);
CREATE INDEX idx_tickets_seat_assignment ON tickets(venue_section, seat_row, seat_number);

CREATE INDEX idx_ticket_transfers_original ON ticket_transfers(original_ticket_id);
CREATE INDEX idx_ticket_transfers_from_user ON ticket_transfers(from_user_id);
CREATE INDEX idx_ticket_transfers_to_user ON ticket_transfers(to_user_id);
CREATE INDEX idx_ticket_transfers_status ON ticket_transfers(status);
CREATE INDEX idx_ticket_transfers_pending ON ticket_transfers(status, expires_at) WHERE status = 'PENDING';

CREATE INDEX idx_ticket_validations_ticket ON ticket_validations(ticket_id);
CREATE INDEX idx_ticket_validations_validated_at ON ticket_validations(validated_at);
CREATE INDEX idx_ticket_validations_result ON ticket_validations(validation_result);
CREATE INDEX idx_ticket_validations_location ON ticket_validations(validation_location);
CREATE INDEX idx_ticket_validations_fraud ON ticket_validations(fraud_flags) WHERE array_length(fraud_flags, 1) > 0;

CREATE INDEX idx_ownership_history_ticket ON ticket_ownership_history(ticket_id);
CREATE INDEX idx_ownership_history_user ON ticket_ownership_history(owner_user_id);
CREATE INDEX idx_ownership_history_current ON ticket_ownership_history(is_current_owner) WHERE is_current_owner = true;
CREATE INDEX idx_ownership_history_dates ON ticket_ownership_history(owned_from, owned_until);

CREATE INDEX idx_resale_listings_ticket ON ticket_resale_listings(ticket_id);
CREATE INDEX idx_resale_listings_seller ON ticket_resale_listings(seller_user_id);
CREATE INDEX idx_resale_listings_status ON ticket_resale_listings(status);
CREATE INDEX idx_resale_listings_active ON ticket_resale_listings(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_resale_listings_price ON ticket_resale_listings(listing_price);

CREATE INDEX idx_batch_operations_event ON ticket_batch_operations(event_id);
CREATE INDEX idx_batch_operations_type ON ticket_batch_operations(operation_type);
CREATE INDEX idx_batch_operations_status ON ticket_batch_operations(status);
CREATE INDEX idx_batch_operations_initiator ON ticket_batch_operations(initiated_by);

-- JSON/JSONB indexes
CREATE INDEX idx_tickets_metadata ON tickets USING GIN(metadata);
CREATE INDEX idx_tickets_seat_coordinates ON tickets USING GIN(seat_coordinates);
CREATE INDEX idx_tickets_special_access ON tickets USING GIN(special_access);
CREATE INDEX idx_validation_data ON ticket_validations USING GIN(validation_data);
CREATE INDEX idx_resale_shipping ON ticket_resale_listings USING GIN(shipping_options);

-- Text search indexes
CREATE INDEX idx_tickets_search ON tickets USING GIN(to_tsvector('english', ticket_number || ' ' || COALESCE(notes, '')));

-- Composite indexes for common queries
CREATE INDEX idx_tickets_event_status_owner ON tickets(event_id, status, owner_user_id);
CREATE INDEX idx_tickets_type_status_available ON tickets(ticket_type_id, status) WHERE status IN ('AVAILABLE', 'SOLD');
CREATE INDEX idx_validations_ticket_date ON ticket_validations(ticket_id, validated_at DESC);

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_ticket_timestamp();

CREATE TRIGGER trg_resale_listings_updated
    BEFORE UPDATE ON ticket_resale_listings
    FOR EACH ROW EXECUTE FUNCTION update_ticket_timestamp();

-- Trigger to generate ticket identifiers on insert
CREATE OR REPLACE FUNCTION generate_ticket_identifiers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := generate_ticket_number(NEW.event_id, NEW.ticket_type_id);
    END IF;
    
    IF NEW.barcode IS NULL THEN
        NEW.barcode := generate_barcode(NEW.id);
    END IF;
    
    IF NEW.ticket_hash IS NULL THEN
        NEW.ticket_hash := ENCODE(SHA256((NEW.id || NEW.ticket_number || NEW.barcode)::BYTEA), 'hex');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_identifiers
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION generate_ticket_identifiers();

-- Trigger to create initial ownership record
CREATE OR REPLACE FUNCTION create_initial_ownership()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO ticket_ownership_history (
        ticket_id, owner_user_id, ownership_type,
        is_current_owner, price_paid
    ) VALUES (
        NEW.id, NEW.owner_user_id, 'PURCHASE',
        true, NEW.total_paid
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_initial_ownership
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION create_initial_ownership();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for ticket overview with event and type details
CREATE VIEW v_ticket_overview AS
SELECT 
    t.id,
    t.ticket_number,
    t.barcode,
    e.event_name,
    tt.type_name as ticket_type,
    tt.ticket_tier,
    t.status,
    t.purchase_price,
    t.total_paid,
    CONCAT(u_owner.first_name, ' ', u_owner.last_name) as current_owner,
    CONCAT(u_purchaser.first_name, ' ', u_purchaser.last_name) as original_purchaser,
    t.venue_section,
    t.seat_row,
    t.seat_number,
    t.is_transferable,
    t.is_refundable,
    t.transfer_count,
    t.scan_count,
    t.purchased_at,
    t.first_scanned_at,
    t.last_scanned_at
FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN users u_owner ON t.owner_user_id = u_owner.id
JOIN users u_purchaser ON t.purchaser_user_id = u_purchaser.id;

-- View for active transfers
CREATE VIEW v_active_transfers AS
SELECT 
    tt.id,
    t.ticket_number,
    e.event_name,
    CONCAT(u_from.first_name, ' ', u_from.last_name) as from_user,
    CONCAT(u_to.first_name, ' ', u_to.last_name) as to_user,
    tt.transfer_type,
    tt.transfer_price,
    tt.status,
    tt.initiated_at,
    tt.expires_at,
    CASE 
        WHEN tt.expires_at < CURRENT_TIMESTAMP THEN true
        ELSE false
    END as is_expired
FROM ticket_transfers tt
JOIN tickets t ON tt.original_ticket_id = t.id
JOIN events e ON t.event_id = e.id
JOIN users u_from ON tt.from_user_id = u_from.id
JOIN users u_to ON tt.to_user_id = u_to.id
WHERE tt.status IN ('PENDING', 'ACCEPTED');

-- View for validation history
CREATE VIEW v_validation_history AS
SELECT 
    tv.id,
    t.ticket_number,
    e.event_name,
    tv.validation_type,
    tv.validation_result,
    tv.validation_location,
    CONCAT(u.first_name, ' ', u.last_name) as validated_by,
    tv.confidence_score,
    tv.fraud_flags,
    tv.validated_at
FROM ticket_validations tv
JOIN tickets t ON tv.ticket_id = t.id
JOIN events e ON t.event_id = e.id
LEFT JOIN users u ON tv.validated_by_user_id = u.id
ORDER BY tv.validated_at DESC;

-- Comments for documentation
COMMENT ON TABLE tickets IS 'Individual tickets with ownership, validation, and NFT integration';
COMMENT ON TABLE ticket_transfers IS 'Complete history of ticket transfers between users';
COMMENT ON TABLE ticket_validations IS 'Entry validation logs and fraud detection records';
COMMENT ON TABLE ticket_ownership_history IS 'Complete ownership chain for each ticket';
COMMENT ON TABLE ticket_resale_listings IS 'Secondary market ticket listings and auctions';
COMMENT ON TABLE ticket_batch_operations IS 'Bulk operations on multiple tickets';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_created ON tickets(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

