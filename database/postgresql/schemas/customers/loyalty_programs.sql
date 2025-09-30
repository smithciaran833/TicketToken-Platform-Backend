-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Loyalty Programs Schema for TicketToken
-- Week 3, Day 11
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This schema defines a comprehensive loyalty program system including
-- programs, customer accounts, and transaction tracking with automatic
-- balance management and tier progression.
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Create ENUM type for transaction types
DO $$ BEGIN
    CREATE TYPE loyalty_transaction_type_enum AS ENUM ('earned', 'redeemed', 'expired', 'adjusted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create loyalty_programs table (master program definitions)
CREATE TABLE IF NOT EXISTS loyalty_programs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Program details
    name VARCHAR(100) NOT NULL UNIQUE, -- Program name (e.g., "TicketToken Rewards")
    description TEXT, -- Detailed program description
    terms_and_conditions TEXT, -- Legal terms
    
    -- Program status
    is_active BOOLEAN DEFAULT true, -- Whether program accepts new members
    is_default BOOLEAN DEFAULT false, -- Default program for new customers
    
    -- Point settings
    points_per_dollar DECIMAL(10, 4) DEFAULT 1.0000, -- Points earned per dollar spent
    signup_bonus INTEGER DEFAULT 0, -- Bonus points for joining
    referral_bonus INTEGER DEFAULT 0, -- Points for referring new customers
    
    -- Point expiration
    points_expire BOOLEAN DEFAULT false, -- Whether points expire
    points_validity_months INTEGER DEFAULT 12, -- How long points are valid
    
    -- Tier configuration (JSON array of tier objects)
    tiers JSONB DEFAULT '[
        {"name": "Bronze", "min_points": 0, "multiplier": 1.0, "perks": []},
        {"name": "Silver", "min_points": 1000, "multiplier": 1.25, "perks": ["priority_support"]},
        {"name": "Gold", "min_points": 5000, "multiplier": 1.5, "perks": ["priority_support", "early_access"]},
        {"name": "Platinum", "min_points": 10000, "multiplier": 2.0, "perks": ["priority_support", "early_access", "vip_events"]}
    ]'::jsonb,
    
    -- Redemption settings
    min_redemption_points INTEGER DEFAULT 100, -- Minimum points required to redeem
    redemption_rate DECIMAL(10, 4) DEFAULT 0.01, -- Dollar value per point when redeeming
    
    -- Program metadata
    icon_url VARCHAR(500), -- URL to program icon/logo
    color_scheme JSONB DEFAULT '{"primary": "#8B5CF6", "secondary": "#F59E0B"}', -- Brand colors
    
    -- Marketing settings
    marketing_name VARCHAR(100), -- Public-facing program name
    marketing_tagline VARCHAR(200), -- Short promotional tagline
    
    -- Audit fields
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_points_per_dollar_positive 
        CHECK (points_per_dollar > 0),
    
    CONSTRAINT chk_signup_bonus_non_negative 
        CHECK (signup_bonus >= 0),
    
    CONSTRAINT chk_referral_bonus_non_negative 
        CHECK (referral_bonus >= 0),
    
    CONSTRAINT chk_points_validity_positive 
        CHECK (points_validity_months IS NULL OR points_validity_months > 0),
    
    CONSTRAINT chk_min_redemption_positive 
        CHECK (min_redemption_points > 0),
    
    CONSTRAINT chk_redemption_rate_positive 
        CHECK (redemption_rate > 0),
    
    CONSTRAINT chk_single_default 
        EXCLUDE (is_default WITH =) WHERE (is_default = true)
);

-- Create loyalty_accounts table (customer enrollment in programs)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    customer_profile_id UUID NOT NULL, -- Link to customer
    loyalty_program_id UUID NOT NULL, -- Link to program
    
    -- Account identification
    account_number VARCHAR(20) UNIQUE, -- Human-readable account number
    
    -- Point balances
    current_points INTEGER DEFAULT 0, -- Available points balance
    lifetime_points INTEGER DEFAULT 0, -- Total points ever earned
    redeemed_points INTEGER DEFAULT 0, -- Total points ever redeemed
    expired_points INTEGER DEFAULT 0, -- Total points that have expired
    
    -- Tier information
    current_tier VARCHAR(50) DEFAULT 'Bronze', -- Current tier name
    tier_achieved_at TIMESTAMP WITH TIME ZONE, -- When current tier was reached
    tier_expires_at TIMESTAMP WITH TIME ZONE, -- When tier status expires (if applicable)
    next_tier_points INTEGER, -- Points needed for next tier
    
    -- Account status
    is_active BOOLEAN DEFAULT true, -- Whether account is active
    suspended_at TIMESTAMP WITH TIME ZONE, -- When account was suspended
    suspension_reason TEXT, -- Why account was suspended
    suspension_lifted_at TIMESTAMP WITH TIME ZONE, -- When suspension was lifted
    
    -- Enrollment information
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When customer joined
    enrolled_via VARCHAR(50), -- Channel used to enroll (web, mobile, in-person)
    referrer_account_id UUID, -- Who referred this customer
    
    -- Activity tracking
    last_earned_at TIMESTAMP WITH TIME ZONE, -- Last time points were earned
    last_redeemed_at TIMESTAMP WITH TIME ZONE, -- Last time points were redeemed
    total_transactions INTEGER DEFAULT 0, -- Total number of transactions
    
    -- Preferences
    opt_in_promotions BOOLEAN DEFAULT true, -- Receives promotional offers
    preferred_redemption_method VARCHAR(50), -- How customer prefers to redeem
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_loyalty_customer_profile 
        FOREIGN KEY (customer_profile_id) 
        REFERENCES customer_profiles(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_loyalty_program 
        FOREIGN KEY (loyalty_program_id) 
        REFERENCES loyalty_programs(id) 
        ON DELETE RESTRICT,
    
    CONSTRAINT fk_referrer_account 
        FOREIGN KEY (referrer_account_id) 
        REFERENCES loyalty_accounts(id) 
        ON DELETE SET NULL,
    
    CONSTRAINT uq_customer_program 
        UNIQUE (customer_profile_id, loyalty_program_id),
    
    CONSTRAINT chk_points_non_negative 
        CHECK (
            current_points >= 0 AND 
            lifetime_points >= 0 AND 
            redeemed_points >= 0 AND 
            expired_points >= 0
        ),
    
    CONSTRAINT chk_lifetime_points_consistency 
        CHECK (lifetime_points >= (redeemed_points + expired_points)),
    
    CONSTRAINT chk_suspension_consistency 
        CHECK (
            (suspended_at IS NULL AND suspension_reason IS NULL) OR
            (suspended_at IS NOT NULL AND suspension_reason IS NOT NULL)
        ),
    
    CONSTRAINT chk_suspension_dates 
        CHECK (
            suspension_lifted_at IS NULL OR 
            (suspended_at IS NOT NULL AND suspension_lifted_at > suspended_at)
        )
);

-- Create loyalty_transactions table (point transaction history)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key
    loyalty_account_id UUID NOT NULL, -- Link to loyalty account
    
    -- Transaction details
    points INTEGER NOT NULL, -- Points amount (positive for earned, negative for redeemed)
    transaction_type loyalty_transaction_type_enum NOT NULL, -- Type of transaction
    
    -- Reference information
    reference_type VARCHAR(50), -- What this transaction relates to (order, adjustment, etc.)
    reference_id UUID, -- ID of related entity
    order_id UUID, -- Specific order reference if applicable
    
    -- Description and metadata
    description TEXT NOT NULL, -- Human-readable description
    metadata JSONB DEFAULT '{}', -- Additional transaction data
    
    -- Balance tracking
    balance_before INTEGER NOT NULL, -- Point balance before transaction
    balance_after INTEGER NOT NULL, -- Point balance after transaction
    
    -- Expiration tracking
    expires_at TIMESTAMP WITH TIME ZONE, -- When these points expire (if applicable)
    expired_points INTEGER DEFAULT 0, -- How many points from this transaction have expired
    
    -- Processing information
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When transaction was processed
    processed_by UUID, -- User who processed (for manual adjustments)
    
    -- Reversal information
    is_reversed BOOLEAN DEFAULT false, -- Whether transaction has been reversed
    reversed_at TIMESTAMP WITH TIME ZONE, -- When reversal occurred
    reversal_reason TEXT, -- Why transaction was reversed
    reversal_transaction_id UUID, -- Link to reversal transaction
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_transaction_account 
        FOREIGN KEY (loyalty_account_id) 
        REFERENCES loyalty_accounts(id) 
        ON DELETE RESTRICT,
    
    CONSTRAINT fk_transaction_processor 
        FOREIGN KEY (processed_by) 
        REFERENCES users(id) 
        ON DELETE SET NULL,
    
    CONSTRAINT fk_reversal_transaction 
        FOREIGN KEY (reversal_transaction_id) 
        REFERENCES loyalty_transactions(id) 
        ON DELETE SET NULL,
    
    CONSTRAINT chk_points_by_type 
        CHECK (
            (transaction_type IN ('earned', 'adjusted') AND points != 0) OR
            (transaction_type = 'redeemed' AND points < 0) OR
            (transaction_type = 'expired' AND points <= 0)
        ),
    
    CONSTRAINT chk_balance_consistency 
        CHECK (balance_after = balance_before + points),
    
    CONSTRAINT chk_expiry_future 
        CHECK (expires_at IS NULL OR expires_at > processed_at),
    
    CONSTRAINT chk_reversal_consistency 
        CHECK (
            (is_reversed = false AND reversed_at IS NULL AND reversal_reason IS NULL) OR
            (is_reversed = true AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL)
        ),
    
    CONSTRAINT chk_expired_points_range 
        CHECK (expired_points >= 0 AND expired_points <= ABS(points))
);

-- Create indexes for performance
-- Indexes for loyalty_programs
CREATE INDEX idx_loyalty_programs_active 
    ON loyalty_programs(is_active) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_programs_default 
    ON loyalty_programs(is_default) 
    WHERE is_default = true;

-- Indexes for loyalty_accounts
CREATE INDEX idx_loyalty_accounts_customer 
    ON loyalty_accounts(customer_profile_id) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_accounts_program 
    ON loyalty_accounts(loyalty_program_id) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_accounts_number 
    ON loyalty_accounts(account_number) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_accounts_tier 
    ON loyalty_accounts(current_tier) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_accounts_referrer 
    ON loyalty_accounts(referrer_account_id) 
    WHERE referrer_account_id IS NOT NULL;

CREATE INDEX idx_loyalty_accounts_points 
    ON loyalty_accounts(current_points DESC) 
    WHERE is_active = true;

CREATE INDEX idx_loyalty_accounts_suspended 
    ON loyalty_accounts(suspended_at) 
    WHERE suspended_at IS NOT NULL AND suspension_lifted_at IS NULL;

-- Indexes for loyalty_transactions
CREATE INDEX idx_loyalty_transactions_account 
    ON loyalty_transactions(loyalty_account_id);

CREATE INDEX idx_loyalty_transactions_type 
    ON loyalty_transactions(transaction_type);

CREATE INDEX idx_loyalty_transactions_processed 
    ON loyalty_transactions(processed_at DESC);

CREATE INDEX idx_loyalty_transactions_reference 
    ON loyalty_transactions(reference_type, reference_id) 
    WHERE reference_id IS NOT NULL;

CREATE INDEX idx_loyalty_transactions_order 
    ON loyalty_transactions(order_id) 
    WHERE order_id IS NOT NULL;

CREATE INDEX idx_loyalty_transactions_expires 
    ON loyalty_transactions(expires_at) 
    WHERE expires_at IS NOT NULL AND expired_points < points;

CREATE INDEX idx_loyalty_transactions_reversed 
    ON loyalty_transactions(is_reversed) 
    WHERE is_reversed = true;

-- GIN indexes for JSONB fields
CREATE INDEX idx_loyalty_programs_tiers 
    ON loyalty_programs USING GIN (tiers);

CREATE INDEX idx_loyalty_transactions_metadata 
    ON loyalty_transactions USING GIN (metadata);

-- Create function to update account balance after transaction
CREATE OR REPLACE FUNCTION update_loyalty_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the loyalty account balance
    UPDATE loyalty_accounts
    SET 
        current_points = NEW.balance_after,
        lifetime_points = CASE 
            WHEN NEW.transaction_type = 'earned' AND NEW.points > 0 
            THEN lifetime_points + NEW.points 
            ELSE lifetime_points 
        END,
        redeemed_points = CASE 
            WHEN NEW.transaction_type = 'redeemed' AND NEW.points < 0 
            THEN redeemed_points + ABS(NEW.points) 
            ELSE redeemed_points 
        END,
        expired_points = CASE 
            WHEN NEW.transaction_type = 'expired' AND NEW.points < 0 
            THEN expired_points + ABS(NEW.points) 
            ELSE expired_points 
        END,
        last_earned_at = CASE 
            WHEN NEW.transaction_type = 'earned' AND NEW.points > 0 
            THEN NEW.processed_at 
            ELSE last_earned_at 
        END,
        last_redeemed_at = CASE 
            WHEN NEW.transaction_type = 'redeemed' 
            THEN NEW.processed_at 
            ELSE last_redeemed_at 
        END,
        total_transactions = total_transactions + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.loyalty_account_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate account number
CREATE OR REPLACE FUNCTION generate_loyalty_account_number()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix VARCHAR(3) := 'TKT';
    v_random VARCHAR(8);
    v_account_number VARCHAR(20);
    v_exists BOOLEAN := true;
BEGIN
    -- Generate unique account number if not provided
    IF NEW.account_number IS NULL THEN
        WHILE v_exists LOOP
            -- Generate random 8-digit number
            v_random := LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
            v_account_number := v_prefix || v_random;
            
            -- Check if it exists
            SELECT EXISTS(SELECT 1 FROM loyalty_accounts WHERE account_number = v_account_number) INTO v_exists;
        END LOOP;
        
        NEW.account_number := v_account_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_loyalty_programs_updated_at 
    BEFORE UPDATE ON loyalty_programs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_accounts_updated_at 
    BEFORE UPDATE ON loyalty_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER generate_account_number_trigger
    BEFORE INSERT ON loyalty_accounts
    FOR EACH ROW
    EXECUTE FUNCTION generate_loyalty_account_number();

CREATE TRIGGER update_account_balance_trigger
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_account_balance();

-- Add comments to tables
COMMENT ON TABLE loyalty_programs IS 'Master configuration for loyalty programs with point and tier settings';
COMMENT ON TABLE loyalty_accounts IS 'Individual customer enrollment in loyalty programs with point balances';
COMMENT ON TABLE loyalty_transactions IS 'Complete transaction history for loyalty points with balance tracking';

-- Comments for loyalty_programs
COMMENT ON COLUMN loyalty_programs.id IS 'Unique identifier for the loyalty program';
COMMENT ON COLUMN loyalty_programs.name IS 'Unique program name';
COMMENT ON COLUMN loyalty_programs.description IS 'Detailed program description for customers';
COMMENT ON COLUMN loyalty_programs.terms_and_conditions IS 'Legal terms and conditions';
COMMENT ON COLUMN loyalty_programs.is_active IS 'Whether program accepts new members';
COMMENT ON COLUMN loyalty_programs.is_default IS 'Default program for auto-enrollment';
COMMENT ON COLUMN loyalty_programs.points_per_dollar IS 'Base earning rate';
COMMENT ON COLUMN loyalty_programs.signup_bonus IS 'Points awarded for joining';
COMMENT ON COLUMN loyalty_programs.referral_bonus IS 'Points for successful referrals';
COMMENT ON COLUMN loyalty_programs.points_expire IS 'Whether points have expiration';
COMMENT ON COLUMN loyalty_programs.points_validity_months IS 'How long points remain valid';
COMMENT ON COLUMN loyalty_programs.tiers IS 'JSON array of tier configurations';
COMMENT ON COLUMN loyalty_programs.min_redemption_points IS 'Minimum points to redeem';
COMMENT ON COLUMN loyalty_programs.redemption_rate IS 'Dollar value per point';

-- Comments for loyalty_accounts
COMMENT ON COLUMN loyalty_accounts.id IS 'Unique identifier for the loyalty account';
COMMENT ON COLUMN loyalty_accounts.customer_profile_id IS 'Link to customer profile';
COMMENT ON COLUMN loyalty_accounts.loyalty_program_id IS 'Link to loyalty program';
COMMENT ON COLUMN loyalty_accounts.account_number IS 'Human-readable account identifier';
COMMENT ON COLUMN loyalty_accounts.current_points IS 'Available point balance';
COMMENT ON COLUMN loyalty_accounts.lifetime_points IS 'Total points ever earned';
COMMENT ON COLUMN loyalty_accounts.redeemed_points IS 'Total points ever redeemed';
COMMENT ON COLUMN loyalty_accounts.expired_points IS 'Total points that expired';
COMMENT ON COLUMN loyalty_accounts.current_tier IS 'Current tier status';
COMMENT ON COLUMN loyalty_accounts.tier_achieved_at IS 'When tier was reached';
COMMENT ON COLUMN loyalty_accounts.tier_expires_at IS 'When tier status expires';
COMMENT ON COLUMN loyalty_accounts.next_tier_points IS 'Points needed for next tier';
COMMENT ON COLUMN loyalty_accounts.is_active IS 'Whether account is active';
COMMENT ON COLUMN loyalty_accounts.suspended_at IS 'When account was suspended';
COMMENT ON COLUMN loyalty_accounts.suspension_reason IS 'Reason for suspension';
COMMENT ON COLUMN loyalty_accounts.enrolled_at IS 'When customer joined program';
COMMENT ON COLUMN loyalty_accounts.enrolled_via IS 'Enrollment channel';
COMMENT ON COLUMN loyalty_accounts.referrer_account_id IS 'Who referred this customer';

-- Comments for loyalty_transactions
COMMENT ON COLUMN loyalty_transactions.id IS 'Unique transaction identifier';
COMMENT ON COLUMN loyalty_transactions.loyalty_account_id IS 'Link to loyalty account';
COMMENT ON COLUMN loyalty_transactions.points IS 'Points amount (positive=earned, negative=redeemed)';
COMMENT ON COLUMN loyalty_transactions.transaction_type IS 'Type of transaction';
COMMENT ON COLUMN loyalty_transactions.reference_type IS 'What this relates to';
COMMENT ON COLUMN loyalty_transactions.reference_id IS 'ID of related entity';
COMMENT ON COLUMN loyalty_transactions.order_id IS 'Specific order reference';
COMMENT ON COLUMN loyalty_transactions.description IS 'Human-readable description';
COMMENT ON COLUMN loyalty_transactions.metadata IS 'Additional transaction data';
COMMENT ON COLUMN loyalty_transactions.balance_before IS 'Balance before transaction';
COMMENT ON COLUMN loyalty_transactions.balance_after IS 'Balance after transaction';
COMMENT ON COLUMN loyalty_transactions.expires_at IS 'When points expire';
COMMENT ON COLUMN loyalty_transactions.expired_points IS 'Points that have expired';
COMMENT ON COLUMN loyalty_transactions.processed_at IS 'When transaction processed';
COMMENT ON COLUMN loyalty_transactions.processed_by IS 'User who processed';
COMMENT ON COLUMN loyalty_transactions.is_reversed IS 'Whether reversed';
COMMENT ON COLUMN loyalty_transactions.reversed_at IS 'When reversed';
COMMENT ON COLUMN loyalty_transactions.reversal_reason IS 'Why reversed';

-- Insert default loyalty program
INSERT INTO loyalty_programs (
    name,
    description,
    is_active,
    is_default,
    points_per_dollar,
    signup_bonus,
    referral_bonus,
    points_expire,
    points_validity_months,
    min_redemption_points,
    redemption_rate,
    marketing_name,
    marketing_tagline
) VALUES (
    'TicketToken Rewards',
    'Earn points on every ticket purchase and redeem for discounts on future events',
    true,
    true,
    1.0,
    500,
    250,
    true,
    24,
    1000,
    0.01,
    'TT Rewards',
    'Your ticket to exclusive rewards'
) ON CONFLICT (name) DO NOTHING;

-- Grant appropriate permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON loyalty_programs TO tickettoken_app;
-- GRANT SELECT, INSERT, UPDATE ON loyalty_accounts TO tickettoken_app;
-- GRANT SELECT, INSERT ON loyalty_transactions TO tickettoken_app;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_tenant_id ON loyalty_programs(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_tenant_created ON loyalty_programs(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

