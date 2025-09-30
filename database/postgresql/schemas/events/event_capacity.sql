-- TicketToken Platform - Event Capacity Management Schema
-- Week 1, Day 4: Event Capacity Management
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive capacity management for events including real-time tracking,
--              allocations, holds, overselling policies, and reporting functions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- EVENT CAPACITY MASTER TABLE
-- ==========================================
CREATE TABLE event_capacity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    total_capacity INTEGER NOT NULL CHECK (total_capacity > 0),
    available_capacity INTEGER NOT NULL CHECK (available_capacity >= 0),
    sold_capacity INTEGER DEFAULT 0 CHECK (sold_capacity >= 0),
    reserved_capacity INTEGER DEFAULT 0 CHECK (reserved_capacity >= 0),
    hold_capacity INTEGER DEFAULT 0 CHECK (hold_capacity >= 0),
    oversell_limit INTEGER DEFAULT 0 CHECK (oversell_limit >= 0),
    oversell_enabled BOOLEAN DEFAULT false,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_capacity_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT chk_capacity_logic CHECK (sold_capacity + available_capacity + hold_capacity <= total_capacity + oversell_limit)
);

-- ==========================================
-- CAPACITY BY TICKET TYPE
-- ==========================================
CREATE TABLE event_capacity_by_type (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    ticket_type_id UUID NOT NULL,
    allocated_capacity INTEGER NOT NULL CHECK (allocated_capacity >= 0),
    sold_capacity INTEGER DEFAULT 0 CHECK (sold_capacity >= 0),
    available_capacity INTEGER NOT NULL CHECK (available_capacity >= 0),
    hold_capacity INTEGER DEFAULT 0 CHECK (hold_capacity >= 0),
    min_capacity INTEGER DEFAULT 0,
    max_capacity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_type_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT fk_capacity_type_ticket FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT chk_type_capacity_logic CHECK (sold_capacity + available_capacity + hold_capacity <= allocated_capacity),
    CONSTRAINT uq_capacity_type_unique UNIQUE (event_capacity_id, ticket_type_id)
);

-- ==========================================
-- CAPACITY BY PRICING TIER
-- ==========================================
CREATE TABLE event_capacity_by_tier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    pricing_tier VARCHAR(50) NOT NULL,
    tier_priority INTEGER NOT NULL,
    allocated_capacity INTEGER NOT NULL CHECK (allocated_capacity >= 0),
    sold_capacity INTEGER DEFAULT 0 CHECK (sold_capacity >= 0),
    available_capacity INTEGER NOT NULL CHECK (available_capacity >= 0),
    min_price DECIMAL(10,2),
    max_price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_tier_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT uq_capacity_tier_unique UNIQUE (event_capacity_id, pricing_tier)
);

-- ==========================================
-- RESERVED CAPACITY ALLOCATIONS
-- ==========================================
CREATE TABLE event_capacity_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    reservation_type VARCHAR(20) NOT NULL CHECK (reservation_type IN ('STAFF', 'PRESS', 'COMP', 'VIP', 'SPONSOR', 'ACCESSIBILITY')),
    allocated_quantity INTEGER NOT NULL CHECK (allocated_quantity > 0),
    used_quantity INTEGER DEFAULT 0 CHECK (used_quantity >= 0),
    available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
    priority_level INTEGER DEFAULT 1,
    description TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_reservation_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT fk_capacity_reservation_user FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_reservation_quantities CHECK (used_quantity + available_quantity <= allocated_quantity)
);

-- ==========================================
-- CAPACITY HOLDS AND ALLOCATIONS
-- ==========================================
CREATE TABLE event_capacity_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    hold_type VARCHAR(20) NOT NULL CHECK (hold_type IN ('PRESALE', 'GROUP', 'CORPORATE', 'MANUAL', 'SYSTEM')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    ticket_type_id UUID,
    hold_reference VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID,
    released_by UUID,
    released_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_hold_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT fk_capacity_hold_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id),
    CONSTRAINT fk_capacity_hold_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_capacity_hold_releaser FOREIGN KEY (released_by) REFERENCES users(id)
);

-- ==========================================
-- OVERSELLING POLICIES
-- ==========================================
CREATE TABLE event_capacity_oversell_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    policy_name VARCHAR(100) NOT NULL,
    oversell_percentage DECIMAL(5,2) CHECK (oversell_percentage >= 0 AND oversell_percentage <= 100),
    oversell_absolute INTEGER CHECK (oversell_absolute >= 0),
    applies_to_ticket_types UUID[],
    min_advance_days INTEGER DEFAULT 0,
    auto_upgrade_enabled BOOLEAN DEFAULT false,
    waitlist_enabled BOOLEAN DEFAULT true,
    notification_thresholds INTEGER[] DEFAULT ARRAY[95, 100, 105],
    created_by UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_oversell_policy_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT fk_oversell_policy_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_oversell_policy_values CHECK (oversell_percentage IS NOT NULL OR oversell_absolute IS NOT NULL)
);

-- ==========================================
-- REAL-TIME CAPACITY TRACKING
-- ==========================================
CREATE TABLE event_capacity_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    snapshot_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_capacity INTEGER NOT NULL,
    sold_capacity INTEGER NOT NULL,
    available_capacity INTEGER NOT NULL,
    hold_capacity INTEGER NOT NULL,
    reserved_capacity INTEGER NOT NULL,
    utilization_percentage DECIMAL(5,2) NOT NULL,
    sales_velocity_per_hour DECIMAL(8,2),
    projected_sellout_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_snapshot_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE
);

-- ==========================================
-- CAPACITY WARNINGS AND THRESHOLDS
-- ==========================================
CREATE TABLE event_capacity_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('LOW_CAPACITY', 'OVERSOLD', 'RAPID_SALES', 'HOLD_EXPIRING', 'THRESHOLD_REACHED')),
    threshold_percentage DECIMAL(5,2),
    threshold_absolute INTEGER,
    current_value DECIMAL(10,2) NOT NULL,
    alert_level VARCHAR(20) DEFAULT 'INFO' CHECK (alert_level IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    auto_resolve BOOLEAN DEFAULT true,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_alert_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT fk_capacity_alert_ack_user FOREIGN KEY (acknowledged_by) REFERENCES users(id)
);

-- ==========================================
-- HISTORICAL CAPACITY UTILIZATION
-- ==========================================
CREATE TABLE event_capacity_utilization_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_capacity_id UUID NOT NULL,
    date_recorded DATE NOT NULL,
    hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
    tickets_sold_count INTEGER DEFAULT 0,
    tickets_sold_revenue DECIMAL(12,2) DEFAULT 0,
    capacity_utilization DECIMAL(5,2) NOT NULL,
    sales_channel VARCHAR(50),
    ticket_type_breakdown JSONB,
    pricing_tier_breakdown JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_capacity_utilization_main FOREIGN KEY (event_capacity_id) REFERENCES event_capacity(id) ON DELETE CASCADE,
    CONSTRAINT uq_capacity_utilization_time UNIQUE (event_capacity_id, date_recorded, hour_of_day, sales_channel)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to update available capacity
CREATE OR REPLACE FUNCTION update_available_capacity(p_event_capacity_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE event_capacity 
    SET available_capacity = total_capacity - sold_capacity - reserved_capacity - hold_capacity,
        last_updated = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_event_capacity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check overselling eligibility
CREATE OR REPLACE FUNCTION can_oversell(p_event_capacity_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_sold INTEGER;
    v_total_capacity INTEGER;
    v_oversell_limit INTEGER;
    v_oversell_enabled BOOLEAN;
BEGIN
    SELECT sold_capacity, total_capacity, oversell_limit, oversell_enabled
    INTO v_current_sold, v_total_capacity, v_oversell_limit, v_oversell_enabled
    FROM event_capacity
    WHERE id = p_event_capacity_id;
    
    IF NOT v_oversell_enabled THEN
        RETURN (v_current_sold + p_quantity) <= v_total_capacity;
    END IF;
    
    RETURN (v_current_sold + p_quantity) <= (v_total_capacity + v_oversell_limit);
END;
$$ LANGUAGE plpgsql;

-- Function to get capacity utilization percentage
CREATE OR REPLACE FUNCTION get_capacity_utilization(p_event_capacity_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    v_sold INTEGER;
    v_total INTEGER;
BEGIN
    SELECT sold_capacity, total_capacity
    INTO v_sold, v_total
    FROM event_capacity
    WHERE id = p_event_capacity_id;
    
    IF v_total = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN ROUND((v_sold::DECIMAL / v_total::DECIMAL) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to create capacity snapshot
CREATE OR REPLACE FUNCTION create_capacity_snapshot(p_event_capacity_id UUID)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
    v_capacity_record RECORD;
    v_utilization DECIMAL(5,2);
BEGIN
    SELECT * INTO v_capacity_record
    FROM event_capacity
    WHERE id = p_event_capacity_id;
    
    v_utilization := get_capacity_utilization(p_event_capacity_id);
    
    INSERT INTO event_capacity_snapshots (
        event_capacity_id, total_capacity, sold_capacity, 
        available_capacity, hold_capacity, reserved_capacity,
        utilization_percentage
    ) VALUES (
        p_event_capacity_id, v_capacity_record.total_capacity,
        v_capacity_record.sold_capacity, v_capacity_record.available_capacity,
        v_capacity_record.hold_capacity, v_capacity_record.reserved_capacity,
        v_utilization
    ) RETURNING id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate capacity alerts
CREATE OR REPLACE FUNCTION check_capacity_thresholds(p_event_capacity_id UUID)
RETURNS VOID AS $$
DECLARE
    v_utilization DECIMAL(5,2);
    v_available INTEGER;
    v_event_id UUID;
BEGIN
    SELECT ec.available_capacity, ec.event_id, get_capacity_utilization(ec.id)
    INTO v_available, v_event_id, v_utilization
    FROM event_capacity ec
    WHERE ec.id = p_event_capacity_id;
    
    -- Critical: Less than 5% capacity remaining
    IF v_utilization >= 95 AND v_available > 0 THEN
        INSERT INTO event_capacity_alerts (event_capacity_id, alert_type, current_value, alert_level, message)
        VALUES (p_event_capacity_id, 'LOW_CAPACITY', v_utilization, 'CRITICAL', 
                'Critical: Only ' || v_available || ' tickets remaining (' || v_utilization || '% sold)');
    END IF;
    
    -- Warning: Less than 10% capacity remaining
    IF v_utilization >= 90 AND v_utilization < 95 THEN
        INSERT INTO event_capacity_alerts (event_capacity_id, alert_type, current_value, alert_level, message)
        VALUES (p_event_capacity_id, 'LOW_CAPACITY', v_utilization, 'WARNING',
                'Warning: Only ' || v_available || ' tickets remaining (' || v_utilization || '% sold)');
    END IF;
    
    -- Oversold situation
    IF v_available < 0 THEN
        INSERT INTO event_capacity_alerts (event_capacity_id, alert_type, current_value, alert_level, message)
        VALUES (p_event_capacity_id, 'OVERSOLD', v_utilization, 'CRITICAL',
                'OVERSOLD: Event is oversold by ' || ABS(v_available) || ' tickets');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_event_capacity_event_id ON event_capacity(event_id);
CREATE INDEX idx_event_capacity_available ON event_capacity(available_capacity);
CREATE INDEX idx_event_capacity_utilization ON event_capacity((sold_capacity::DECIMAL / total_capacity::DECIMAL));

CREATE INDEX idx_capacity_by_type_event ON event_capacity_by_type(event_capacity_id);
CREATE INDEX idx_capacity_by_type_ticket ON event_capacity_by_type(ticket_type_id);

CREATE INDEX idx_capacity_by_tier_event ON event_capacity_by_tier(event_capacity_id);
CREATE INDEX idx_capacity_by_tier_priority ON event_capacity_by_tier(tier_priority);

CREATE INDEX idx_capacity_reservations_event ON event_capacity_reservations(event_capacity_id);
CREATE INDEX idx_capacity_reservations_type ON event_capacity_reservations(reservation_type);

CREATE INDEX idx_capacity_holds_event ON event_capacity_holds(event_capacity_id);
CREATE INDEX idx_capacity_holds_status ON event_capacity_holds(status);
CREATE INDEX idx_capacity_holds_expires ON event_capacity_holds(expires_at);

CREATE INDEX idx_capacity_snapshots_event ON event_capacity_snapshots(event_capacity_id);
CREATE INDEX idx_capacity_snapshots_timestamp ON event_capacity_snapshots(snapshot_timestamp);

CREATE INDEX idx_capacity_alerts_event ON event_capacity_alerts(event_capacity_id);
CREATE INDEX idx_capacity_alerts_level ON event_capacity_alerts(alert_level);
CREATE INDEX idx_capacity_alerts_unresolved ON event_capacity_alerts(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX idx_capacity_utilization_event ON event_capacity_utilization_history(event_capacity_id);
CREATE INDEX idx_capacity_utilization_date ON event_capacity_utilization_history(date_recorded);

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_capacity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_capacity_updated
    BEFORE UPDATE ON event_capacity
    FOR EACH ROW EXECUTE FUNCTION update_capacity_timestamp();

CREATE TRIGGER trg_capacity_by_type_updated
    BEFORE UPDATE ON event_capacity_by_type
    FOR EACH ROW EXECUTE FUNCTION update_capacity_timestamp();

CREATE TRIGGER trg_capacity_by_tier_updated
    BEFORE UPDATE ON event_capacity_by_tier
    FOR EACH ROW EXECUTE FUNCTION update_capacity_timestamp();

-- Trigger to check thresholds after capacity updates
CREATE OR REPLACE FUNCTION trigger_capacity_threshold_check()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM check_capacity_thresholds(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_capacity_threshold_check
    AFTER UPDATE OF sold_capacity, available_capacity ON event_capacity
    FOR EACH ROW EXECUTE FUNCTION trigger_capacity_threshold_check();

-- ==========================================
-- SAMPLE DATA / VIEWS
-- ==========================================

-- View for capacity overview
CREATE VIEW v_event_capacity_overview AS
SELECT 
    ec.id,
    ec.event_id,
    e.event_name,
    ec.total_capacity,
    ec.sold_capacity,
    ec.available_capacity,
    ec.reserved_capacity,
    ec.hold_capacity,
    get_capacity_utilization(ec.id) as utilization_percentage,
    ec.oversell_enabled,
    ec.oversell_limit,
    ec.last_updated
FROM event_capacity ec
JOIN events e ON ec.event_id = e.id;

-- View for capacity alerts summary
CREATE VIEW v_capacity_alerts_summary AS
SELECT 
    eca.event_capacity_id,
    e.event_name,
    COUNT(*) as total_alerts,
    COUNT(*) FILTER (WHERE alert_level = 'CRITICAL') as critical_alerts,
    COUNT(*) FILTER (WHERE alert_level = 'WARNING') as warning_alerts,
    COUNT(*) FILTER (WHERE is_acknowledged = false) as unacknowledged_alerts,
    MAX(eca.created_at) as latest_alert
FROM event_capacity_alerts eca
JOIN event_capacity ec ON eca.event_capacity_id = ec.id
JOIN events e ON ec.event_id = e.id
WHERE eca.resolved_at IS NULL
GROUP BY eca.event_capacity_id, e.event_name;

-- Comments for documentation
COMMENT ON TABLE event_capacity IS 'Master table for event capacity management and tracking';
COMMENT ON TABLE event_capacity_by_type IS 'Capacity allocation and tracking by ticket type';
COMMENT ON TABLE event_capacity_by_tier IS 'Capacity allocation and tracking by pricing tier';
COMMENT ON TABLE event_capacity_reservations IS 'Reserved capacity for staff, press, comps, etc.';
COMMENT ON TABLE event_capacity_holds IS 'Temporary capacity holds for presales, groups, etc.';
COMMENT ON TABLE event_capacity_oversell_policies IS 'Overselling policies and rules';
COMMENT ON TABLE event_capacity_snapshots IS 'Real-time capacity tracking snapshots';
COMMENT ON TABLE event_capacity_alerts IS 'Capacity warnings and threshold alerts';
COMMENT ON TABLE event_capacity_utilization_history IS 'Historical capacity utilization data';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_event_capacity_tenant_id ON event_capacity(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_capacity_tenant_created ON event_capacity(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

