-- TicketToken Platform - Event Pricing Management Schema
-- Week 1, Day 4: Dynamic Pricing Rules and Management
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive pricing management including dynamic pricing, surge pricing,
--              promotional codes, group discounts, and historical price tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- EVENT PRICING MASTER TABLE
-- ==========================================
CREATE TABLE event_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    pricing_strategy VARCHAR(20) NOT NULL CHECK (pricing_strategy IN ('FIXED', 'DYNAMIC', 'AUCTION', 'DEMAND_BASED', 'TIME_BASED', 'HYBRID')),
    base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
    currency_code VARCHAR(3) DEFAULT 'USD',
    min_price DECIMAL(10,2) CHECK (min_price >= 0),
    max_price DECIMAL(10,2) CHECK (max_price >= min_price),
    is_active BOOLEAN DEFAULT true,
    pricing_start_date TIMESTAMP WITH TIME ZONE,
    pricing_end_date TIMESTAMP WITH TIME ZONE,
    dynamic_pricing_enabled BOOLEAN DEFAULT false,
    surge_pricing_enabled BOOLEAN DEFAULT false,
    group_discounts_enabled BOOLEAN DEFAULT false,
    promotional_codes_enabled BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_pricing_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_pricing_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_pricing_dates CHECK (pricing_end_date IS NULL OR pricing_end_date > pricing_start_date)
);

-- ==========================================
-- PRICING TIERS
-- ==========================================
CREATE TABLE event_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    tier_name VARCHAR(50) NOT NULL,
    tier_priority INTEGER NOT NULL DEFAULT 1,
    tier_description TEXT,
    base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
    min_price DECIMAL(10,2) CHECK (min_price >= 0),
    max_price DECIMAL(10,2) CHECK (max_price >= min_price),
    capacity_allocation INTEGER CHECK (capacity_allocation > 0),
    tickets_sold INTEGER DEFAULT 0 CHECK (tickets_sold >= 0),
    early_bird_price DECIMAL(10,2),
    early_bird_cutoff TIMESTAMP WITH TIME ZONE,
    late_price DECIMAL(10,2),
    late_price_start TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_pricing_tier_main FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT uq_pricing_tier_name UNIQUE (event_pricing_id, tier_name),
    CONSTRAINT chk_tier_early_bird CHECK (early_bird_cutoff IS NULL OR early_bird_price IS NOT NULL),
    CONSTRAINT chk_tier_late_price CHECK (late_price_start IS NULL OR late_price IS NOT NULL)
);

-- ==========================================
-- DYNAMIC PRICING RULES
-- ==========================================
CREATE TABLE event_pricing_dynamic_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('DEMAND_BASED', 'TIME_BASED', 'CAPACITY_BASED', 'VELOCITY_BASED', 'EXTERNAL_FACTOR')),
    trigger_condition JSONB NOT NULL, -- Flexible JSON conditions
    price_adjustment_type VARCHAR(20) NOT NULL CHECK (price_adjustment_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'MULTIPLIER', 'SET_PRICE')),
    adjustment_value DECIMAL(10,4) NOT NULL,
    min_adjustment DECIMAL(10,2),
    max_adjustment DECIMAL(10,2),
    priority_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    applies_to_tiers UUID[], -- Array of tier IDs
    cooldown_period INTERVAL DEFAULT '15 minutes',
    last_applied TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_dynamic_rule_pricing FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_dynamic_rule_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==========================================
-- TIME-BASED PRICING CHANGES
-- ==========================================
CREATE TABLE event_pricing_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    tier_id UUID,
    schedule_name VARCHAR(100) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_until TIMESTAMP WITH TIME ZONE,
    price_change_type VARCHAR(20) NOT NULL CHECK (price_change_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'SET_PRICE')),
    change_value DECIMAL(10,4) NOT NULL,
    new_price DECIMAL(10,2),
    reason VARCHAR(200),
    auto_apply BOOLEAN DEFAULT true,
    is_applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_pricing_schedule_main FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_pricing_schedule_tier FOREIGN KEY (tier_id) REFERENCES event_pricing_tiers(id) ON DELETE CASCADE,
    CONSTRAINT fk_pricing_schedule_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_schedule_dates CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- ==========================================
-- DEMAND-BASED PRICE ADJUSTMENTS
-- ==========================================
CREATE TABLE event_pricing_demand_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    factor_name VARCHAR(100) NOT NULL,
    factor_type VARCHAR(30) NOT NULL CHECK (factor_type IN ('SALES_VELOCITY', 'CAPACITY_UTILIZATION', 'TIME_TO_EVENT', 'EXTERNAL_DEMAND', 'COMPETITOR_PRICING')),
    threshold_value DECIMAL(10,4) NOT NULL,
    comparison_operator VARCHAR(10) NOT NULL CHECK (comparison_operator IN ('>', '>=', '<', '<=', '=', '!=')),
    price_multiplier DECIMAL(6,4) DEFAULT 1.0000,
    max_price_increase DECIMAL(10,2),
    max_price_decrease DECIMAL(10,2),
    evaluation_frequency INTERVAL DEFAULT '5 minutes',
    is_active BOOLEAN DEFAULT true,
    last_evaluated TIMESTAMP WITH TIME ZONE,
    last_triggered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_demand_factor_pricing FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE
);

-- ==========================================
-- GROUP DISCOUNTS
-- ==========================================
CREATE TABLE event_pricing_group_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    discount_name VARCHAR(100) NOT NULL,
    min_quantity INTEGER NOT NULL CHECK (min_quantity > 1),
    max_quantity INTEGER CHECK (max_quantity >= min_quantity),
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'TIERED')),
    discount_value DECIMAL(10,4) NOT NULL,
    max_discount_amount DECIMAL(10,2),
    applies_to_tiers UUID[],
    requires_approval BOOLEAN DEFAULT false,
    approval_threshold DECIMAL(10,2),
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    usage_limit INTEGER,
    times_used INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_group_discount_pricing FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_group_discount_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_group_discount_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT chk_group_usage_limit CHECK (usage_limit IS NULL OR times_used <= usage_limit)
);

-- ==========================================
-- PROMOTIONAL CODES
-- ==========================================
CREATE TABLE event_pricing_promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    promo_code VARCHAR(50) NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y')),
    discount_value DECIMAL(10,4) NOT NULL,
    max_discount_amount DECIMAL(10,2),
    min_purchase_amount DECIMAL(10,2),
    applies_to_tiers UUID[],
    usage_limit INTEGER,
    usage_limit_per_customer INTEGER,
    times_used INTEGER DEFAULT 0,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    is_stackable BOOLEAN DEFAULT false,
    requires_minimum_quantity INTEGER DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_promo_code_pricing FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_promo_code_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_promo_code_unique UNIQUE (event_pricing_id, promo_code),
    CONSTRAINT chk_promo_code_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT chk_promo_usage_limit CHECK (usage_limit IS NULL OR times_used <= usage_limit)
);

-- ==========================================
-- SURGE PRICING THRESHOLDS
-- ==========================================
CREATE TABLE event_pricing_surge_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    threshold_name VARCHAR(100) NOT NULL,
    capacity_threshold_percentage DECIMAL(5,2) CHECK (capacity_threshold_percentage >= 0 AND capacity_threshold_percentage <= 100),
    time_threshold_hours INTEGER CHECK (time_threshold_hours >= 0),
    velocity_threshold_per_hour DECIMAL(8,2) CHECK (velocity_threshold_per_hour >= 0),
    surge_multiplier DECIMAL(6,4) NOT NULL CHECK (surge_multiplier >= 1.0000),
    max_surge_price DECIMAL(10,2),
    surge_duration INTERVAL DEFAULT '1 hour',
    cooldown_period INTERVAL DEFAULT '30 minutes',
    applies_to_tiers UUID[],
    is_active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_surge_threshold_pricing FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_surge_threshold_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==========================================
-- PRICING HISTORY AND CHANGE TRACKING
-- ==========================================
CREATE TABLE event_pricing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_pricing_id UUID NOT NULL,
    tier_id UUID,
    change_type VARCHAR(30) NOT NULL CHECK (change_type IN ('PRICE_UPDATE', 'DYNAMIC_ADJUSTMENT', 'SURGE_APPLIED', 'SURGE_REMOVED', 'SCHEDULE_APPLIED', 'MANUAL_OVERRIDE')),
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2) NOT NULL,
    price_change DECIMAL(10,2),
    percentage_change DECIMAL(8,4),
    reason VARCHAR(500),
    triggered_by VARCHAR(100), -- Rule name, schedule name, user action, etc.
    applied_by UUID,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB, -- Additional context data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_pricing_history_main FOREIGN KEY (event_pricing_id) REFERENCES event_pricing(id) ON DELETE CASCADE,
    CONSTRAINT fk_pricing_history_tier FOREIGN KEY (tier_id) REFERENCES event_pricing_tiers(id) ON DELETE CASCADE,
    CONSTRAINT fk_pricing_history_user FOREIGN KEY (applied_by) REFERENCES users(id)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to calculate current price for a tier
CREATE OR REPLACE FUNCTION calculate_current_price(p_tier_id UUID, p_quantity INTEGER DEFAULT 1)
RETURNS TABLE(
    base_price DECIMAL(10,2),
    adjusted_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    discounts_applied JSONB
) AS $$
DECLARE
    v_tier RECORD;
    v_pricing RECORD;
    v_current_price DECIMAL(10,2);
    v_adjustments JSONB := '[]'::JSONB;
    v_group_discount DECIMAL(10,2) := 0;
    v_surge_multiplier DECIMAL(6,4) := 1.0000;
BEGIN
    -- Get tier and pricing info
    SELECT pt.*, ep.* INTO v_tier, v_pricing
    FROM event_pricing_tiers pt
    JOIN event_pricing ep ON pt.event_pricing_id = ep.id
    WHERE pt.id = p_tier_id AND pt.is_active = true AND ep.is_active = true;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    v_current_price := v_tier.base_price;
    
    -- Apply time-based pricing (early bird, late pricing)
    IF v_tier.early_bird_cutoff IS NOT NULL AND CURRENT_TIMESTAMP <= v_tier.early_bird_cutoff THEN
        v_current_price := v_tier.early_bird_price;
        v_adjustments := v_adjustments || jsonb_build_object('type', 'early_bird', 'amount', v_tier.early_bird_price - v_tier.base_price);
    ELSIF v_tier.late_price_start IS NOT NULL AND CURRENT_TIMESTAMP >= v_tier.late_price_start THEN
        v_current_price := v_tier.late_price;
        v_adjustments := v_adjustments || jsonb_build_object('type', 'late_pricing', 'amount', v_tier.late_price - v_tier.base_price);
    END IF;
    
    -- Apply surge pricing if active
    IF v_pricing.surge_pricing_enabled THEN
        SELECT COALESCE(MAX(surge_multiplier), 1.0000) INTO v_surge_multiplier
        FROM event_pricing_surge_thresholds
        WHERE event_pricing_id = v_pricing.id
          AND is_active = true
          AND (last_triggered IS NULL OR last_triggered + surge_duration > CURRENT_TIMESTAMP);
        
        IF v_surge_multiplier > 1.0000 THEN
            v_current_price := v_current_price * v_surge_multiplier;
            v_adjustments := v_adjustments || jsonb_build_object('type', 'surge_pricing', 'multiplier', v_surge_multiplier);
        END IF;
    END IF;
    
    -- Apply group discounts if applicable
    IF v_pricing.group_discounts_enabled AND p_quantity > 1 THEN
        SELECT COALESCE(MAX(
            CASE 
                WHEN discount_type = 'PERCENTAGE' THEN v_current_price * p_quantity * (discount_value / 100)
                WHEN discount_type = 'FIXED_AMOUNT' THEN discount_value
                ELSE 0
            END
        ), 0) INTO v_group_discount
        FROM event_pricing_group_discounts
        WHERE event_pricing_id = v_pricing.id
          AND is_active = true
          AND p_quantity >= min_quantity
          AND (max_quantity IS NULL OR p_quantity <= max_quantity)
          AND (valid_from IS NULL OR CURRENT_TIMESTAMP >= valid_from)
          AND (valid_until IS NULL OR CURRENT_TIMESTAMP <= valid_until);
        
        IF v_group_discount > 0 THEN
            v_adjustments := v_adjustments || jsonb_build_object('type', 'group_discount', 'amount', -v_group_discount);
        END IF;
    END IF;
    
    -- Ensure price doesn't go below minimum
    IF v_pricing.min_price IS NOT NULL THEN
        v_current_price := GREATEST(v_current_price, v_pricing.min_price);
    END IF;
    
    -- Ensure price doesn't exceed maximum
    IF v_pricing.max_price IS NOT NULL THEN
        v_current_price := LEAST(v_current_price, v_pricing.max_price);
    END IF;
    
    RETURN QUERY SELECT 
        v_tier.base_price,
        v_current_price,
        (v_current_price * p_quantity) - v_group_discount,
        v_adjustments;
END;
$$ LANGUAGE plpgsql;

-- Function to apply dynamic pricing rule
CREATE OR REPLACE FUNCTION apply_dynamic_pricing_rule(p_rule_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_rule RECORD;
    v_condition_met BOOLEAN := false;
    v_new_price DECIMAL(10,2);
    v_tier_id UUID;
BEGIN
    SELECT * INTO v_rule
    FROM event_pricing_dynamic_rules
    WHERE id = p_rule_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check cooldown period
    IF v_rule.last_applied IS NOT NULL AND 
       v_rule.last_applied + v_rule.cooldown_period > CURRENT_TIMESTAMP THEN
        RETURN false;
    END IF;
    
    -- Evaluate trigger condition (simplified - would need more complex logic)
    -- This is a placeholder for condition evaluation
    v_condition_met := true; -- Would implement actual condition checking
    
    IF v_condition_met THEN
        -- Apply pricing adjustment to applicable tiers
        FOR v_tier_id IN SELECT unnest(v_rule.applies_to_tiers) LOOP
            -- Calculate new price based on adjustment type
            SELECT 
                CASE v_rule.price_adjustment_type
                    WHEN 'PERCENTAGE' THEN base_price * (1 + v_rule.adjustment_value / 100)
                    WHEN 'FIXED_AMOUNT' THEN base_price + v_rule.adjustment_value
                    WHEN 'MULTIPLIER' THEN base_price * v_rule.adjustment_value
                    WHEN 'SET_PRICE' THEN v_rule.adjustment_value
                    ELSE base_price
                END INTO v_new_price
            FROM event_pricing_tiers
            WHERE id = v_tier_id;
            
            -- Apply min/max constraints
            IF v_rule.min_adjustment IS NOT NULL THEN
                v_new_price := GREATEST(v_new_price, v_rule.min_adjustment);
            END IF;
            
            IF v_rule.max_adjustment IS NOT NULL THEN
                v_new_price := LEAST(v_new_price, v_rule.max_adjustment);
            END IF;
            
            -- Update tier price and log change
            UPDATE event_pricing_tiers 
            SET base_price = v_new_price, updated_at = CURRENT_TIMESTAMP
            WHERE id = v_tier_id;
            
            -- Log pricing history
            INSERT INTO event_pricing_history (
                event_pricing_id, tier_id, change_type, old_price, new_price,
                reason, triggered_by
            ) VALUES (
                v_rule.event_pricing_id, v_tier_id, 'DYNAMIC_ADJUSTMENT',
                (SELECT base_price FROM event_pricing_tiers WHERE id = v_tier_id),
                v_new_price, 'Dynamic pricing rule applied', v_rule.rule_name
            );
        END LOOP;
        
        -- Update rule last applied timestamp
        UPDATE event_pricing_dynamic_rules
        SET last_applied = CURRENT_TIMESTAMP
        WHERE id = p_rule_id;
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to validate promo code
CREATE OR REPLACE FUNCTION validate_promo_code(p_event_pricing_id UUID, p_promo_code VARCHAR)
RETURNS TABLE(
    is_valid BOOLEAN,
    discount_amount DECIMAL(10,2),
    error_message TEXT
) AS $$
DECLARE
    v_promo RECORD;
    v_usage_count INTEGER;
BEGIN
    SELECT * INTO v_promo
    FROM event_pricing_promo_codes
    WHERE event_pricing_id = p_event_pricing_id
      AND promo_code = p_promo_code
      AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::DECIMAL(10,2), 'Invalid promo code';
        RETURN;
    END IF;
    
    -- Check date validity
    IF v_promo.valid_from IS NOT NULL AND CURRENT_TIMESTAMP < v_promo.valid_from THEN
        RETURN QUERY SELECT false, 0::DECIMAL(10,2), 'Promo code not yet valid';
        RETURN;
    END IF;
    
    IF v_promo.valid_until IS NOT NULL AND CURRENT_TIMESTAMP > v_promo.valid_until THEN
        RETURN QUERY SELECT false, 0::DECIMAL(10,2), 'Promo code has expired';
        RETURN;
    END IF;
    
    -- Check usage limits
    IF v_promo.usage_limit IS NOT NULL AND v_promo.times_used >= v_promo.usage_limit THEN
        RETURN QUERY SELECT false, 0::DECIMAL(10,2), 'Promo code usage limit exceeded';
        RETURN;
    END IF;
    
    RETURN QUERY SELECT true, v_promo.discount_value, 'Valid promo code';
END;
$$ LANGUAGE plpgsql;

-- Function to check surge pricing triggers
CREATE OR REPLACE FUNCTION check_surge_pricing_triggers(p_event_pricing_id UUID)
RETURNS VOID AS $$
DECLARE
    v_threshold RECORD;
    v_capacity_util DECIMAL(5,2);
    v_sales_velocity DECIMAL(8,2);
    v_hours_to_event INTEGER;
    v_should_trigger BOOLEAN;
BEGIN
    -- Get current metrics (would need actual implementation)
    v_capacity_util := 75.0; -- Placeholder
    v_sales_velocity := 50.0; -- Placeholder
    v_hours_to_event := 48; -- Placeholder
    
    FOR v_threshold IN 
        SELECT * FROM event_pricing_surge_thresholds
        WHERE event_pricing_id = p_event_pricing_id AND is_active = true
    LOOP
        v_should_trigger := false;
        
        -- Check capacity threshold
        IF v_threshold.capacity_threshold_percentage IS NOT NULL AND 
           v_capacity_util >= v_threshold.capacity_threshold_percentage THEN
            v_should_trigger := true;
        END IF;
        
        -- Check time threshold
        IF v_threshold.time_threshold_hours IS NOT NULL AND 
           v_hours_to_event <= v_threshold.time_threshold_hours THEN
            v_should_trigger := true;
        END IF;
        
        -- Check velocity threshold
        IF v_threshold.velocity_threshold_per_hour IS NOT NULL AND 
           v_sales_velocity >= v_threshold.velocity_threshold_per_hour THEN
            v_should_trigger := true;
        END IF;
        
        -- Apply surge pricing if conditions met
        IF v_should_trigger AND 
           (v_threshold.last_triggered IS NULL OR 
            v_threshold.last_triggered + v_threshold.cooldown_period <= CURRENT_TIMESTAMP) THEN
            
            UPDATE event_pricing_surge_thresholds
            SET last_triggered = CURRENT_TIMESTAMP,
                trigger_count = trigger_count + 1
            WHERE id = v_threshold.id;
            
            -- Log surge pricing activation
            INSERT INTO event_pricing_history (
                event_pricing_id, change_type, new_price, reason, triggered_by
            ) VALUES (
                p_event_pricing_id, 'SURGE_APPLIED', 0, 
                'Surge pricing activated: ' || v_threshold.threshold_name,
                v_threshold.threshold_name
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_event_pricing_event_id ON event_pricing(event_id);
CREATE INDEX idx_event_pricing_strategy ON event_pricing(pricing_strategy);
CREATE INDEX idx_event_pricing_active ON event_pricing(is_active);

CREATE INDEX idx_pricing_tiers_pricing_id ON event_pricing_tiers(event_pricing_id);
CREATE INDEX idx_pricing_tiers_priority ON event_pricing_tiers(tier_priority);
CREATE INDEX idx_pricing_tiers_active ON event_pricing_tiers(is_active);

CREATE INDEX idx_dynamic_rules_pricing_id ON event_pricing_dynamic_rules(event_pricing_id);
CREATE INDEX idx_dynamic_rules_type ON event_pricing_dynamic_rules(rule_type);
CREATE INDEX idx_dynamic_rules_active ON event_pricing_dynamic_rules(is_active);

CREATE INDEX idx_pricing_schedules_pricing_id ON event_pricing_schedules(event_pricing_id);
CREATE INDEX idx_pricing_schedules_effective ON event_pricing_schedules(effective_from);

CREATE INDEX idx_demand_factors_pricing_id ON event_pricing_demand_factors(event_pricing_id);
CREATE INDEX idx_demand_factors_type ON event_pricing_demand_factors(factor_type);

CREATE INDEX idx_group_discounts_pricing_id ON event_pricing_group_discounts(event_pricing_id);
CREATE INDEX idx_group_discounts_active ON event_pricing_group_discounts(is_active);

CREATE INDEX idx_promo_codes_pricing_id ON event_pricing_promo_codes(event_pricing_id);
CREATE INDEX idx_promo_codes_code ON event_pricing_promo_codes(promo_code);
CREATE INDEX idx_promo_codes_active ON event_pricing_promo_codes(is_active);

CREATE INDEX idx_surge_thresholds_pricing_id ON event_pricing_surge_thresholds(event_pricing_id);
CREATE INDEX idx_surge_thresholds_active ON event_pricing_surge_thresholds(is_active);

CREATE INDEX idx_pricing_history_pricing_id ON event_pricing_history(event_pricing_id);
CREATE INDEX idx_pricing_history_tier_id ON event_pricing_history(tier_id);
CREATE INDEX idx_pricing_history_type ON event_pricing_history(change_type);
CREATE INDEX idx_pricing_history_timestamp ON event_pricing_history(created_at);

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_pricing_updated
    BEFORE UPDATE ON event_pricing
    FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

CREATE TRIGGER trg_pricing_tiers_updated
    BEFORE UPDATE ON event_pricing_tiers
    FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

CREATE TRIGGER trg_dynamic_rules_updated
    BEFORE UPDATE ON event_pricing_dynamic_rules
    FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

-- Trigger to log pricing changes
CREATE OR REPLACE FUNCTION log_pricing_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.base_price != NEW.base_price THEN
        INSERT INTO event_pricing_history (
            event_pricing_id, tier_id, change_type, old_price, new_price,
            price_change, percentage_change, reason
        ) VALUES (
            NEW.event_pricing_id, NEW.id, 'PRICE_UPDATE',
            OLD.base_price, NEW.base_price,
            NEW.base_price - OLD.base_price,
            ((NEW.base_price - OLD.base_price) / OLD.base_price) * 100,
            'Price updated'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pricing_tier_change_log
    AFTER UPDATE ON event_pricing_tiers
    FOR EACH ROW EXECUTE FUNCTION log_pricing_changes();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for current pricing overview
CREATE VIEW v_event_pricing_overview AS
SELECT 
    ep.id,
    ep.event_id,
    e.event_name,
    ep.pricing_strategy,
    ep.base_price,
    ep.currency_code,
    ep.dynamic_pricing_enabled,
    ep.surge_pricing_enabled,
    COUNT(ept.id) as tier_count,
    MIN(ept.base_price) as min_tier_price,
    MAX(ept.base_price) as max_tier_price,
    AVG(ept.base_price) as avg_tier_price
FROM event_pricing ep
JOIN events e ON ep.event_id = e.id
LEFT JOIN event_pricing_tiers ept ON ep.id = ept.event_pricing_id AND ept.is_active = true
WHERE ep.is_active = true
GROUP BY ep.id, e.event_name;

-- View for active promotions
CREATE VIEW v_active_promotions AS
SELECT 
    ep.event_id,
    e.event_name,
    'GROUP_DISCOUNT' as promotion_type,
    epgd.discount_name as promotion_name,
    epgd.discount_value,
    epgd.min_quantity,
    epgd.valid_until
FROM event_pricing ep
JOIN events e ON ep.event_id = e.id
JOIN event_pricing_group_discounts epgd ON ep.id = epgd.event_pricing_id
WHERE epgd.is_active = true
  AND (epgd.valid_from IS NULL OR CURRENT_TIMESTAMP >= epgd.valid_from)
  AND (epgd.valid_until IS NULL OR CURRENT_TIMESTAMP <= epgd.valid_until)

UNION ALL

SELECT 
    ep.event_id,
    e.event_name,
    'PROMO_CODE' as promotion_type,
    eppc.promo_code as promotion_name,
    eppc.discount_value,
    eppc.requires_minimum_quantity,
    eppc.valid_until
FROM event_pricing ep
JOIN events e ON ep.event_id = e.id
JOIN event_pricing_promo_codes eppc ON ep.id = eppc.event_pricing_id
WHERE eppc.is_active = true
  AND (eppc.valid_from IS NULL OR CURRENT_TIMESTAMP >= eppc.valid_from)
  AND (eppc.valid_until IS NULL OR CURRENT_TIMESTAMP <= eppc.valid_until);

-- Comments for documentation
COMMENT ON TABLE event_pricing IS 'Master table for event pricing strategies and configuration';
COMMENT ON TABLE event_pricing_tiers IS 'Pricing tiers with different price points and allocations';
COMMENT ON TABLE event_pricing_dynamic_rules IS 'Dynamic pricing rules and triggers';
COMMENT ON TABLE event_pricing_schedules IS 'Scheduled price changes based on time';
COMMENT ON TABLE event_pricing_demand_factors IS 'Demand-based pricing adjustment factors';
COMMENT ON TABLE event_pricing_group_discounts IS 'Group discounts and bulk pricing';
COMMENT ON TABLE event_pricing_promo_codes IS 'Promotional codes and discount coupons';
COMMENT ON TABLE event_pricing_surge_thresholds IS 'Surge pricing triggers and thresholds';
COMMENT ON TABLE event_pricing_history IS 'Complete history of all pricing changes';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_event_pricing_tenant_id ON event_pricing(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_pricing_tenant_created ON event_pricing(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

