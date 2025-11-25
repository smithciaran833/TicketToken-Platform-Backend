-- TicketToken Platform - Ticket Types Management Schema
-- Week 1, Day 5: Ticket Categories and Type Management
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive ticket type management including pricing, benefits,
--              policies, and sales configuration with advanced features

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TICKET TYPES MASTER TABLE
-- ==========================================
CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    type_slug VARCHAR(100) NOT NULL,
    description TEXT,
    short_description VARCHAR(300),
    
    -- Ticket tier and classification
    ticket_tier VARCHAR(20) NOT NULL CHECK (ticket_tier IN ('GENERAL', 'VIP', 'PREMIUM', 'BACKSTAGE', 'EARLY_BIRD', 'STUDENT', 'SENIOR', 'GROUP', 'SEASON', 'CORPORATE')),
    tier_priority INTEGER DEFAULT 1, -- Lower number = higher priority
    access_level INTEGER DEFAULT 1 CHECK (access_level >= 1 AND access_level <= 10),
    
    -- Pricing structure
    base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
    currency_code VARCHAR(3) DEFAULT 'USD',
    service_fee DECIMAL(10,2) DEFAULT 0,
    processing_fee DECIMAL(10,2) DEFAULT 0,
    facility_fee DECIMAL(10,2) DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (base_price + service_fee + processing_fee + facility_fee + (base_price * tax_rate)) STORED,
    
    -- Fee structure configuration
    fee_structure JSONB, -- Complex fee calculations
    pricing_tiers JSONB, -- Quantity-based pricing
    group_pricing JSONB, -- Group discounts
    
    -- Capacity and limits
    total_quantity INTEGER CHECK (total_quantity > 0),
    available_quantity INTEGER DEFAULT 0 CHECK (available_quantity >= 0),
    sold_quantity INTEGER DEFAULT 0 CHECK (sold_quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    min_purchase_quantity INTEGER DEFAULT 1 CHECK (min_purchase_quantity > 0),
    max_purchase_quantity INTEGER DEFAULT 10 CHECK (max_purchase_quantity >= min_purchase_quantity),
    max_per_customer INTEGER, -- Lifetime limit per customer
    
    -- Sale dates and availability
    sale_start_date TIMESTAMP WITH TIME ZONE,
    sale_end_date TIMESTAMP WITH TIME ZONE,
    early_access_start TIMESTAMP WITH TIME ZONE,
    presale_code VARCHAR(50),
    requires_membership BOOLEAN DEFAULT false,
    member_types TEXT[], -- Array of membership types allowed
    
    -- Status and flags
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SOLD_OUT', 'DISCONTINUED', 'COMING_SOON', 'PAUSED')),
    is_featured BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    is_transferable BOOLEAN DEFAULT true,
    is_refundable BOOLEAN DEFAULT true,
    is_digital_delivery BOOLEAN DEFAULT true,
    requires_id_verification BOOLEAN DEFAULT false,
    
    -- Display and sorting
    display_order INTEGER DEFAULT 0,
    color_code VARCHAR(7), -- Hex color
    icon_name VARCHAR(50),
    image_url VARCHAR(500),
    
    -- Metadata
    metadata JSONB,
    tags TEXT[],
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_ticket_type_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_type_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_ticket_type_slug UNIQUE (event_id, type_slug),
    CONSTRAINT chk_ticket_quantity_logic CHECK (sold_quantity + available_quantity + reserved_quantity <= total_quantity),
    CONSTRAINT chk_sale_dates CHECK (sale_end_date IS NULL OR sale_end_date > sale_start_date),
    CONSTRAINT chk_early_access CHECK (early_access_start IS NULL OR sale_start_date IS NULL OR early_access_start <= sale_start_date)
);

-- ==========================================
-- TICKET TYPE BENEFITS AND INCLUSIONS
-- ==========================================
CREATE TABLE ticket_type_benefits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    benefit_category VARCHAR(30) NOT NULL CHECK (benefit_category IN ('ACCESS', 'AMENITY', 'SERVICE', 'MERCHANDISE', 'FOOD_BEVERAGE', 'PARKING', 'EXPERIENCE', 'DISCOUNT')),
    benefit_name VARCHAR(200) NOT NULL,
    benefit_description TEXT,
    benefit_value VARCHAR(100), -- e.g., "Free parking", "$50 credit", "2 drinks"
    is_included BOOLEAN DEFAULT true,
    is_highlighted BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    icon_name VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_benefit_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
);

-- ==========================================
-- TRANSFER POLICIES
-- ==========================================
CREATE TABLE ticket_type_transfer_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    transfer_allowed BOOLEAN DEFAULT true,
    transfer_fee DECIMAL(10,2) DEFAULT 0,
    transfer_fee_type VARCHAR(20) DEFAULT 'FIXED' CHECK (transfer_fee_type IN ('FIXED', 'PERCENTAGE')),
    max_transfers_per_ticket INTEGER DEFAULT 1,
    transfer_deadline_hours INTEGER, -- Hours before event
    requires_approval BOOLEAN DEFAULT false,
    approval_required_from VARCHAR(20) CHECK (approval_required_from IN ('VENUE', 'ORGANIZER', 'SYSTEM', 'ANY_ADMIN')),
    blackout_periods JSONB, -- Time periods when transfers not allowed
    allowed_transfer_methods TEXT[] DEFAULT ARRAY['PLATFORM', 'EMAIL'], -- PLATFORM, EMAIL, QR_CODE, etc.
    restrictions TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_transfer_policy_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_policy_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_transfer_policy_ticket_type UNIQUE (ticket_type_id)
);

-- ==========================================
-- REFUND POLICIES
-- ==========================================
CREATE TABLE ticket_type_refund_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    refund_allowed BOOLEAN DEFAULT true,
    refund_deadline_hours INTEGER, -- Hours before event, NULL = anytime
    refund_fee DECIMAL(10,2) DEFAULT 0,
    refund_fee_type VARCHAR(20) DEFAULT 'FIXED' CHECK (refund_fee_type IN ('FIXED', 'PERCENTAGE')),
    refund_percentage DECIMAL(5,2) DEFAULT 100 CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
    processing_time_days INTEGER DEFAULT 7,
    
    -- Tiered refund structure
    refund_tiers JSONB, -- Different refund percentages based on timing
    
    -- Special conditions
    weather_cancellation_full_refund BOOLEAN DEFAULT true,
    artist_cancellation_full_refund BOOLEAN DEFAULT true,
    venue_cancellation_full_refund BOOLEAN DEFAULT true,
    covid_policy_refund BOOLEAN DEFAULT false,
    
    -- Requirements
    requires_reason BOOLEAN DEFAULT false,
    allowed_reasons TEXT[],
    requires_documentation BOOLEAN DEFAULT false,
    documentation_types TEXT[],
    
    refund_method VARCHAR(20) DEFAULT 'ORIGINAL' CHECK (refund_method IN ('ORIGINAL', 'CREDIT', 'BOTH')),
    restrictions TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_refund_policy_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_policy_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_refund_policy_ticket_type UNIQUE (ticket_type_id)
);

-- ==========================================
-- TICKET TYPE AVAILABILITY SCHEDULES
-- ==========================================
CREATE TABLE ticket_type_availability_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    schedule_name VARCHAR(100) NOT NULL,
    release_date TIMESTAMP WITH TIME ZONE NOT NULL,
    quantity_to_release INTEGER NOT NULL CHECK (quantity_to_release > 0),
    price_at_release DECIMAL(10,2),
    is_processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_availability_schedule_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_availability_schedule_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==========================================
-- TICKET TYPE RESTRICTIONS
-- ==========================================
CREATE TABLE ticket_type_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    restriction_type VARCHAR(30) NOT NULL CHECK (restriction_type IN ('AGE', 'LOCATION', 'MEMBERSHIP', 'PURCHASE_HISTORY', 'DEVICE', 'TIME', 'QUANTITY', 'PAYMENT_METHOD')),
    restriction_name VARCHAR(100) NOT NULL,
    restriction_rule JSONB NOT NULL, -- Flexible rule definition
    error_message TEXT,
    is_active BOOLEAN DEFAULT true,
    severity VARCHAR(20) DEFAULT 'ERROR' CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_restriction_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_restriction_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==========================================
-- TICKET TYPE ANALYTICS
-- ==========================================
CREATE TABLE ticket_type_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_type_id UUID NOT NULL,
    analytics_date DATE NOT NULL,
    views INTEGER DEFAULT 0,
    add_to_cart INTEGER DEFAULT 0,
    purchases INTEGER DEFAULT 0,
    revenue DECIMAL(12,2) DEFAULT 0,
    refunds INTEGER DEFAULT 0,
    transfers INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0,
    average_quantity_per_purchase DECIMAL(8,4) DEFAULT 0,
    bounce_rate DECIMAL(5,4) DEFAULT 0,
    time_to_purchase_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_ticket_analytics_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT uq_ticket_analytics_date UNIQUE (ticket_type_id, analytics_date)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to check ticket type availability
CREATE OR REPLACE FUNCTION check_ticket_availability(
    p_ticket_type_id UUID,
    p_quantity INTEGER DEFAULT 1,
    p_customer_id UUID DEFAULT NULL
)
RETURNS TABLE(
    is_available BOOLEAN,
    available_quantity INTEGER,
    error_message TEXT,
    restrictions_failed TEXT[]
) AS $$
DECLARE
    v_ticket_type RECORD;
    v_customer_purchased INTEGER := 0;
    v_restrictions_failed TEXT[] := ARRAY[]::TEXT[];
    v_restriction RECORD;
    v_current_time TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
BEGIN
    -- Get ticket type info
    SELECT * INTO v_ticket_type
    FROM ticket_types
    WHERE id = p_ticket_type_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0, 'Ticket type not found', ARRAY['TICKET_TYPE_NOT_FOUND'];
        RETURN;
    END IF;
    
    -- Check if ticket type is active
    IF v_ticket_type.status != 'ACTIVE' THEN
        RETURN QUERY SELECT false, v_ticket_type.available_quantity, 'Ticket type not available', ARRAY['STATUS_' || v_ticket_type.status];
        RETURN;
    END IF;
    
    -- Check sale dates
    IF v_ticket_type.sale_start_date IS NOT NULL AND v_current_time < v_ticket_type.sale_start_date THEN
        v_restrictions_failed := array_append(v_restrictions_failed, 'SALE_NOT_STARTED');
    END IF;
    
    IF v_ticket_type.sale_end_date IS NOT NULL AND v_current_time > v_ticket_type.sale_end_date THEN
        v_restrictions_failed := array_append(v_restrictions_failed, 'SALE_ENDED');
    END IF;
    
    -- Check quantity limits
    IF p_quantity < v_ticket_type.min_purchase_quantity THEN
        v_restrictions_failed := array_append(v_restrictions_failed, 'BELOW_MIN_QUANTITY');
    END IF;
    
    IF p_quantity > v_ticket_type.max_purchase_quantity THEN
        v_restrictions_failed := array_append(v_restrictions_failed, 'ABOVE_MAX_QUANTITY');
    END IF;
    
    -- Check available quantity
    IF p_quantity > v_ticket_type.available_quantity THEN
        v_restrictions_failed := array_append(v_restrictions_failed, 'INSUFFICIENT_QUANTITY');
    END IF;
    
    -- Check customer limits if customer provided
    IF p_customer_id IS NOT NULL AND v_ticket_type.max_per_customer IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_customer_purchased
        FROM tickets
        WHERE ticket_type_id = p_ticket_type_id 
          AND customer_id = p_customer_id 
          AND status NOT IN ('CANCELLED', 'REFUNDED');
        
        IF v_customer_purchased + p_quantity > v_ticket_type.max_per_customer THEN
            v_restrictions_failed := array_append(v_restrictions_failed, 'CUSTOMER_LIMIT_EXCEEDED');
        END IF;
    END IF;
    
    -- Check additional restrictions
    FOR v_restriction IN 
        SELECT * FROM ticket_type_restrictions 
        WHERE ticket_type_id = p_ticket_type_id AND is_active = true
    LOOP
        -- This would implement actual restriction checking logic
        -- For now, we'll just log that restrictions exist
        -- In a real implementation, you'd parse restriction_rule JSON and evaluate
        IF v_restriction.restriction_type = 'AGE' THEN
            -- Age restriction checking logic would go here
            NULL;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT 
        array_length(v_restrictions_failed, 1) = 0 OR v_restrictions_failed IS NULL,
        v_ticket_type.available_quantity,
        CASE 
            WHEN array_length(v_restrictions_failed, 1) > 0 THEN 'Ticket purchase restrictions failed'
            ELSE NULL
        END,
        COALESCE(v_restrictions_failed, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate ticket price including fees
CREATE OR REPLACE FUNCTION calculate_ticket_price(
    p_ticket_type_id UUID,
    p_quantity INTEGER DEFAULT 1,
    p_promo_code VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    base_price DECIMAL(10,2),
    fees DECIMAL(10,2),
    taxes DECIMAL(10,2),
    discount DECIMAL(10,2),
    total_price DECIMAL(10,2),
    price_breakdown JSONB
) AS $$
DECLARE
    v_ticket_type RECORD;
    v_base_total DECIMAL(10,2);
    v_fees DECIMAL(10,2) := 0;
    v_taxes DECIMAL(10,2) := 0;
    v_discount DECIMAL(10,2) := 0;
    v_breakdown JSONB := '{}'::JSONB;
BEGIN
    -- Get ticket type
    SELECT * INTO v_ticket_type
    FROM ticket_types
    WHERE id = p_ticket_type_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    v_base_total := v_ticket_type.base_price * p_quantity;
    
    -- Calculate fees
    v_fees := (COALESCE(v_ticket_type.service_fee, 0) + 
               COALESCE(v_ticket_type.processing_fee, 0) + 
               COALESCE(v_ticket_type.facility_fee, 0)) * p_quantity;
    
    -- Calculate taxes
    v_taxes := v_base_total * COALESCE(v_ticket_type.tax_rate, 0);
    
    -- Apply group pricing if applicable
    IF v_ticket_type.group_pricing IS NOT NULL AND p_quantity > 1 THEN
        -- Group pricing logic would go here
        -- This is a simplified version
        IF p_quantity >= 10 THEN
            v_discount := v_base_total * 0.1; -- 10% group discount
        END IF;
    END IF;
    
    -- Apply promo code if provided
    IF p_promo_code IS NOT NULL THEN
        -- Promo code logic would integrate with event_pricing_promo_codes table
        -- For now, just a placeholder
        NULL;
    END IF;
    
    -- Build breakdown
    v_breakdown := jsonb_build_object(
        'base_price_per_ticket', v_ticket_type.base_price,
        'quantity', p_quantity,
        'base_total', v_base_total,
        'service_fee', v_ticket_type.service_fee * p_quantity,
        'processing_fee', v_ticket_type.processing_fee * p_quantity,
        'facility_fee', v_ticket_type.facility_fee * p_quantity,
        'tax_rate', v_ticket_type.tax_rate,
        'group_discount', v_discount,
        'promo_discount', 0
    );
    
    RETURN QUERY SELECT 
        v_base_total,
        v_fees,
        v_taxes,
        v_discount,
        v_base_total + v_fees + v_taxes - v_discount,
        v_breakdown;
END;
$$ LANGUAGE plpgsql;

-- Function to update ticket type quantities
CREATE OR REPLACE FUNCTION update_ticket_quantities(
    p_ticket_type_id UUID,
    p_sold_change INTEGER DEFAULT 0,
    p_reserved_change INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    UPDATE ticket_types
    SET 
        sold_quantity = sold_quantity + p_sold_change,
        reserved_quantity = reserved_quantity + p_reserved_change,
        available_quantity = total_quantity - (sold_quantity + p_sold_change) - (reserved_quantity + p_reserved_change),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_ticket_type_id;
    
    -- Update status if sold out
    UPDATE ticket_types
    SET status = CASE 
        WHEN available_quantity <= 0 AND status = 'ACTIVE' THEN 'SOLD_OUT'
        WHEN available_quantity > 0 AND status = 'SOLD_OUT' THEN 'ACTIVE'
        ELSE status
    END
    WHERE id = p_ticket_type_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get ticket type hierarchy
CREATE OR REPLACE FUNCTION get_ticket_type_hierarchy(p_event_id UUID)
RETURNS TABLE(
    ticket_type_id UUID,
    type_name VARCHAR,
    ticket_tier VARCHAR,
    tier_priority INTEGER,
    base_price DECIMAL(10,2),
    available_quantity INTEGER,
    status VARCHAR,
    benefits_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tt.id,
        tt.type_name,
        tt.ticket_tier,
        tt.tier_priority,
        tt.base_price,
        tt.available_quantity,
        tt.status,
        COUNT(ttb.id) as benefits_count
    FROM ticket_types tt
    LEFT JOIN ticket_type_benefits ttb ON tt.id = ttb.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND tt.status != 'DISCONTINUED'
      AND tt.is_hidden = false
    GROUP BY tt.id, tt.type_name, tt.ticket_tier, tt.tier_priority, tt.base_price, tt.available_quantity, tt.status
    ORDER BY tt.tier_priority, tt.base_price;
END;
$$ LANGUAGE plpgsql;

-- Function to validate transfer eligibility
CREATE OR REPLACE FUNCTION validate_transfer_eligibility(
    p_ticket_id UUID,
    p_hours_until_event INTEGER DEFAULT NULL
)
RETURNS TABLE(
    is_eligible BOOLEAN,
    error_message TEXT,
    transfer_fee DECIMAL(10,2)
) AS $$
DECLARE
    v_ticket RECORD;
    v_policy RECORD;
    v_transfer_count INTEGER;
BEGIN
    -- Get ticket and policy info
    SELECT t.*, tt.is_transferable INTO v_ticket
    FROM tickets t
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE t.id = p_ticket_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Ticket not found', 0::DECIMAL(10,2);
        RETURN;
    END IF;
    
    -- Check if transfers are allowed for this ticket type
    IF NOT v_ticket.is_transferable THEN
        RETURN QUERY SELECT false, 'This ticket type is not transferable', 0::DECIMAL(10,2);
        RETURN;
    END IF;
    
    -- Get transfer policy
    SELECT * INTO v_policy
    FROM ticket_type_transfer_policies
    WHERE ticket_type_id = v_ticket.ticket_type_id;
    
    IF NOT FOUND OR NOT v_policy.transfer_allowed THEN
        RETURN QUERY SELECT false, 'Transfers not allowed for this ticket type', 0::DECIMAL(10,2);
        RETURN;
    END IF;
    
    -- Check transfer deadline
    IF v_policy.transfer_deadline_hours IS NOT NULL AND 
       p_hours_until_event IS NOT NULL AND 
       p_hours_until_event < v_policy.transfer_deadline_hours THEN
        RETURN QUERY SELECT false, 'Transfer deadline has passed', 0::DECIMAL(10,2);
        RETURN;
    END IF;
    
    -- Check transfer limits
    SELECT COUNT(*) INTO v_transfer_count
    FROM ticket_transfers
    WHERE original_ticket_id = p_ticket_id;
    
    IF v_transfer_count >= v_policy.max_transfers_per_ticket THEN
        RETURN QUERY SELECT false, 'Maximum transfers exceeded for this ticket', 0::DECIMAL(10,2);
        RETURN;
    END IF;
    
    RETURN QUERY SELECT true, NULL, COALESCE(v_policy.transfer_fee, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to process scheduled releases
CREATE OR REPLACE FUNCTION process_scheduled_releases()
RETURNS INTEGER AS $$
DECLARE
    v_schedule RECORD;
    v_processed_count INTEGER := 0;
BEGIN
    FOR v_schedule IN 
        SELECT * FROM ticket_type_availability_schedules 
        WHERE is_processed = false 
          AND release_date <= CURRENT_TIMESTAMP
    LOOP
        -- Update ticket type quantities
        UPDATE ticket_types
        SET 
            available_quantity = available_quantity + v_schedule.quantity_to_release,
            base_price = COALESCE(v_schedule.price_at_release, base_price),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_schedule.ticket_type_id;
        
        -- Mark schedule as processed
        UPDATE ticket_type_availability_schedules
        SET 
            is_processed = true,
            processed_at = CURRENT_TIMESTAMP,
            processed_quantity = v_schedule.quantity_to_release
        WHERE id = v_schedule.id;
        
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    RETURN v_processed_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_ticket_types_event_id ON ticket_types(event_id);
CREATE INDEX idx_ticket_types_status ON ticket_types(status);
CREATE INDEX idx_ticket_types_tier ON ticket_types(ticket_tier);
CREATE INDEX idx_ticket_types_active ON ticket_types(status, is_hidden) WHERE status = 'ACTIVE' AND is_hidden = false;
CREATE INDEX idx_ticket_types_sale_dates ON ticket_types(sale_start_date, sale_end_date);
CREATE INDEX idx_ticket_types_priority ON ticket_types(tier_priority, display_order);
CREATE INDEX idx_ticket_types_price ON ticket_types(base_price);
CREATE INDEX idx_ticket_types_availability ON ticket_types(available_quantity) WHERE available_quantity > 0;

CREATE INDEX idx_ticket_benefits_type_id ON ticket_type_benefits(ticket_type_id);
CREATE INDEX idx_ticket_benefits_category ON ticket_type_benefits(benefit_category);
CREATE INDEX idx_ticket_benefits_highlighted ON ticket_type_benefits(is_highlighted) WHERE is_highlighted = true;

CREATE INDEX idx_transfer_policies_ticket_type ON ticket_type_transfer_policies(ticket_type_id);
CREATE INDEX idx_refund_policies_ticket_type ON ticket_type_refund_policies(ticket_type_id);

CREATE INDEX idx_availability_schedules_ticket_type ON ticket_type_availability_schedules(ticket_type_id);
CREATE INDEX idx_availability_schedules_release ON ticket_type_availability_schedules(release_date, is_processed);

CREATE INDEX idx_ticket_restrictions_type_id ON ticket_type_restrictions(ticket_type_id);
CREATE INDEX idx_ticket_restrictions_active ON ticket_type_restrictions(is_active) WHERE is_active = true;

CREATE INDEX idx_ticket_analytics_type_id ON ticket_type_analytics(ticket_type_id);
CREATE INDEX idx_ticket_analytics_date ON ticket_type_analytics(analytics_date);

-- JSON indexes for complex queries
CREATE INDEX idx_ticket_types_metadata ON ticket_types USING GIN(metadata);
CREATE INDEX idx_ticket_types_tags ON ticket_types USING GIN(tags);
CREATE INDEX idx_ticket_types_fee_structure ON ticket_types USING GIN(fee_structure);
CREATE INDEX idx_ticket_restrictions_rule ON ticket_type_restrictions USING GIN(restriction_rule);

-- Text search indexes
CREATE INDEX idx_ticket_types_search ON ticket_types USING GIN(to_tsvector('english', type_name || ' ' || COALESCE(description, '') || ' ' || COALESCE(short_description, '')));

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_ticket_type_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_types_updated
    BEFORE UPDATE ON ticket_types
    FOR EACH ROW EXECUTE FUNCTION update_ticket_type_timestamp();

CREATE TRIGGER trg_transfer_policies_updated
    BEFORE UPDATE ON ticket_type_transfer_policies
    FOR EACH ROW EXECUTE FUNCTION update_ticket_type_timestamp();

CREATE TRIGGER trg_refund_policies_updated
    BEFORE UPDATE ON ticket_type_refund_policies
    FOR EACH ROW EXECUTE FUNCTION update_ticket_type_timestamp();

-- Trigger to update slug when name changes
CREATE OR REPLACE FUNCTION update_ticket_type_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type_name != OLD.type_name OR NEW.type_slug IS NULL THEN
        NEW.type_slug := LOWER(REGEXP_REPLACE(REGEXP_REPLACE(NEW.type_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_type_slug_update
    BEFORE UPDATE ON ticket_types
    FOR EACH ROW EXECUTE FUNCTION update_ticket_type_slug();

-- Trigger to automatically set slug on insert
CREATE OR REPLACE FUNCTION set_ticket_type_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type_slug IS NULL THEN
        NEW.type_slug := LOWER(REGEXP_REPLACE(REGEXP_REPLACE(NEW.type_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_type_slug_insert
    BEFORE INSERT ON ticket_types
    FOR EACH ROW EXECUTE FUNCTION set_ticket_type_slug();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for ticket type overview with analytics
CREATE VIEW v_ticket_type_overview AS
SELECT 
    tt.id,
    tt.event_id,
    e.event_name,
    tt.type_name,
    tt.ticket_tier,
    tt.base_price,
    tt.total_quantity,
    tt.available_quantity,
    tt.sold_quantity,
    tt.status,
    ROUND((tt.sold_quantity::DECIMAL / NULLIF(tt.total_quantity, 0)) * 100, 2) as sell_through_percentage,
    COUNT(ttb.id) as benefits_count,
    tt.is_transferable,
    tt.is_refundable,
    tt.created_at
FROM ticket_types tt
JOIN events e ON tt.event_id = e.id
LEFT JOIN ticket_type_benefits ttb ON tt.id = ttb.ticket_type_id
GROUP BY tt.id, e.event_name;

-- View for active ticket types with pricing
CREATE VIEW v_active_ticket_types AS
SELECT 
    tt.id,
    tt.event_id,
    tt.type_name,
    tt.ticket_tier,
    tt.tier_priority,
    tt.base_price,
    tt.total_price,
    tt.available_quantity,
    tt.min_purchase_quantity,
    tt.max_purchase_quantity,
    tt.sale_start_date,
    tt.sale_end_date,
    tt.is_featured,
    STRING_AGG(ttb.benefit_name, ', ' ORDER BY ttb.display_order) as benefits_summary
FROM ticket_types tt
LEFT JOIN ticket_type_benefits ttb ON tt.id = ttb.ticket_type_id AND ttb.is_highlighted = true
WHERE tt.status = 'ACTIVE' 
  AND tt.is_hidden = false
  AND (tt.sale_start_date IS NULL OR tt.sale_start_date <= CURRENT_TIMESTAMP)
  AND (tt.sale_end_date IS NULL OR tt.sale_end_date > CURRENT_TIMESTAMP)
GROUP BY tt.id, tt.type_name, tt.ticket_tier, tt.tier_priority, tt.base_price, tt.total_price, 
         tt.available_quantity, tt.min_purchase_quantity, tt.max_purchase_quantity,
         tt.sale_start_date, tt.sale_end_date, tt.is_featured;

-- View for ticket type performance metrics
CREATE VIEW v_ticket_type_performance AS
SELECT 
    tt.id,
    tt.type_name,
    tt.ticket_tier,
    tt.base_price,
    SUM(tta.views) as total_views,
    SUM(tta.add_to_cart) as total_add_to_cart,
    SUM(tta.purchases) as total_purchases,
    SUM(tta.revenue) as total_revenue,
    CASE 
        WHEN SUM(tta.views) > 0 THEN ROUND((SUM(tta.purchases)::DECIMAL / SUM(tta.views)) * 100, 4)
        ELSE 0
    END as conversion_rate,
    CASE 
        WHEN SUM(tta.add_to_cart) > 0 THEN ROUND((SUM(tta.purchases)::DECIMAL / SUM(tta.add_to_cart)) * 100, 4)
        ELSE 0
    END as cart_conversion_rate,
    AVG(tta.average_quantity_per_purchase) as avg_quantity_per_purchase
FROM ticket_types tt
LEFT JOIN ticket_type_analytics tta ON tt.id = tta.ticket_type_id
GROUP BY tt.id, tt.type_name, tt.ticket_tier, tt.base_price;

-- Comments for documentation
COMMENT ON TABLE ticket_types IS 'Master table for ticket types and categories with pricing and policies';
COMMENT ON TABLE ticket_type_benefits IS 'Benefits and inclusions for different ticket types';
COMMENT ON TABLE ticket_type_transfer_policies IS 'Transfer policies and restrictions for ticket types';
COMMENT ON TABLE ticket_type_refund_policies IS 'Refund policies and conditions for ticket types';
COMMENT ON TABLE ticket_type_availability_schedules IS 'Scheduled releases of additional ticket inventory';
COMMENT ON TABLE ticket_type_restrictions IS 'Purchase restrictions and validation rules for ticket types';
COMMENT ON TABLE ticket_type_analytics IS 'Daily analytics and performance metrics for ticket types';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_types_tenant_id ON ticket_types(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_types_tenant_created ON ticket_types(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

