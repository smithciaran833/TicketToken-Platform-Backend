-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Wallet Addresses Table Schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This table manages user wallet addresses for blockchain interactions,
-- supporting multiple wallets per user with verification and security features

-- Drop table if exists (for development - remove in production)
DROP TABLE IF EXISTS wallet_addresses CASCADE;

-- Create wallet_addresses table
CREATE TABLE wallet_addresses (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- User reference
   user_id UUID NOT NULL, -- Reference to the user who owns this wallet
   CONSTRAINT fk_user
       FOREIGN KEY (user_id) 
       REFERENCES users(id)
       ON DELETE CASCADE,
   
   -- Wallet details
   wallet_address VARCHAR(44) NOT NULL, -- Blockchain wallet address (Solana base58)
   blockchain VARCHAR(20) DEFAULT 'solana', -- Blockchain network
   
   -- Wallet type
   type VARCHAR(20) NOT NULL, -- Type of wallet used
   CONSTRAINT valid_wallet_type CHECK (type IN (
       'phantom',    -- Phantom wallet
       'solflare',   -- Solflare wallet
       'ledger',     -- Ledger hardware wallet
       'backpack',   -- Backpack wallet
       'metamask',   -- MetaMask (for EVM compatibility)
       'other'       -- Other wallet types
   )),
   
   -- Wallet status
   is_primary BOOLEAN DEFAULT FALSE, -- Whether this is the primary wallet
   is_verified BOOLEAN DEFAULT FALSE, -- Whether wallet ownership is verified
   
   -- Verification data
   verification_signature TEXT, -- Signature proving wallet ownership
   verification_message TEXT, -- Message that was signed
   verification_timestamp TIMESTAMP WITH TIME ZONE, -- When wallet was verified
   
   -- Wallet metadata
   label VARCHAR(100), -- User-defined label for the wallet
   wallet_name VARCHAR(100), -- Detected wallet name/provider
   
   -- Usage tracking
   last_used_at TIMESTAMP WITH TIME ZONE, -- Last transaction from this wallet
   transaction_count INTEGER DEFAULT 0, -- Total transactions from this wallet
   total_volume NUMERIC(20, 8), -- Total transaction volume in SOL
   
   -- Risk assessment
   risk_score INTEGER DEFAULT 0, -- Risk score (0-100, higher = riskier)
   suspicious_activity BOOLEAN DEFAULT FALSE, -- Flag for suspicious behavior
   
   -- ENS/SNS domain names
   domain_name VARCHAR(100), -- Associated domain name (e.g., user.sol)
   domain_verified BOOLEAN DEFAULT FALSE, -- Whether domain ownership is verified
   
   -- Device information
   linked_device_id UUID, -- Reference to device table
   device_fingerprint VARCHAR(64), -- Device fingerprint hash
   
   -- Session data
   last_session_id UUID, -- Last session using this wallet
   last_ip_address INET, -- Last IP address used
   
   -- Restrictions
   is_blocked BOOLEAN DEFAULT FALSE, -- Whether wallet is blocked
   blocked_reason TEXT, -- Reason for blocking
   blocked_at TIMESTAMP WITH TIME ZONE, -- When wallet was blocked
   
   -- Notification settings
   transaction_notifications BOOLEAN DEFAULT TRUE, -- Send notifications for transactions
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Unique Constraints
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Ensure only one primary wallet per user per blockchain
CREATE UNIQUE INDEX idx_wallet_addresses_one_primary 
   ON wallet_addresses(user_id, blockchain) 
   WHERE is_primary = TRUE;

-- Ensure wallet addresses are unique per blockchain
ALTER TABLE wallet_addresses 
   ADD CONSTRAINT unique_wallet_blockchain 
   UNIQUE(wallet_address, blockchain);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes for Performance
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Index on user_id for user wallet lookups
CREATE INDEX idx_wallet_addresses_user_id 
   ON wallet_addresses(user_id);

-- Index on wallet_address for address lookups
CREATE INDEX idx_wallet_addresses_address 
   ON wallet_addresses(wallet_address);

-- Index on blockchain for filtering by chain
CREATE INDEX idx_wallet_addresses_blockchain 
   ON wallet_addresses(blockchain);

-- Index on is_primary for finding primary wallets
CREATE INDEX idx_wallet_addresses_primary 
   ON wallet_addresses(user_id, is_primary) 
   WHERE is_primary = TRUE;

-- Index on is_verified for security checks
CREATE INDEX idx_wallet_addresses_verified 
   ON wallet_addresses(is_verified) 
   WHERE is_verified = TRUE;

-- Index on risk_score for risk monitoring
CREATE INDEX idx_wallet_addresses_risk 
   ON wallet_addresses(risk_score) 
   WHERE risk_score > 50;

-- Index on is_blocked for security filtering
CREATE INDEX idx_wallet_addresses_blocked 
   ON wallet_addresses(is_blocked) 
   WHERE is_blocked = TRUE;

-- Index on last_used_at for activity tracking
CREATE INDEX idx_wallet_addresses_last_used 
   ON wallet_addresses(last_used_at);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to ensure only one primary wallet per user per blockchain
CREATE OR REPLACE FUNCTION ensure_one_primary_wallet()
RETURNS TRIGGER AS $$
BEGIN
   -- If setting a wallet as primary
   IF NEW.is_primary = TRUE THEN
       -- Remove primary flag from other wallets for same user/blockchain
       UPDATE wallet_addresses
       SET is_primary = FALSE
       WHERE user_id = NEW.user_id 
           AND blockchain = NEW.blockchain
           AND id != NEW.id
           AND is_primary = TRUE;
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce one primary wallet rule
CREATE TRIGGER trigger_ensure_one_primary_wallet
   BEFORE INSERT OR UPDATE OF is_primary ON wallet_addresses
   FOR EACH ROW
   WHEN (NEW.is_primary = TRUE)
   EXECUTE FUNCTION ensure_one_primary_wallet();

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_wallet_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_wallet_addresses_timestamp
   BEFORE UPDATE ON wallet_addresses
   FOR EACH ROW
   EXECUTE FUNCTION update_wallet_addresses_updated_at();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table Comments
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


COMMENT ON TABLE wallet_addresses IS 'Manages user wallet addresses for blockchain interactions with verification and security features';

COMMENT ON COLUMN wallet_addresses.id IS 'Unique identifier for the wallet record';
COMMENT ON COLUMN wallet_addresses.user_id IS 'Reference to the user who owns this wallet';
COMMENT ON COLUMN wallet_addresses.wallet_address IS 'Blockchain wallet address (base58 for Solana)';
COMMENT ON COLUMN wallet_addresses.blockchain IS 'Blockchain network (default: solana)';
COMMENT ON COLUMN wallet_addresses.type IS 'Type of wallet provider used';
COMMENT ON COLUMN wallet_addresses.is_primary IS 'Whether this is the users primary wallet for this blockchain';
COMMENT ON COLUMN wallet_addresses.is_verified IS 'Whether wallet ownership has been cryptographically verified';
COMMENT ON COLUMN wallet_addresses.verification_signature IS 'Cryptographic signature proving wallet ownership';
COMMENT ON COLUMN wallet_addresses.verification_message IS 'Message that was signed for verification';
COMMENT ON COLUMN wallet_addresses.verification_timestamp IS 'When the wallet was verified';
COMMENT ON COLUMN wallet_addresses.label IS 'User-defined label for easy identification';
COMMENT ON COLUMN wallet_addresses.wallet_name IS 'Detected wallet provider name';
COMMENT ON COLUMN wallet_addresses.last_used_at IS 'Last time this wallet was used for a transaction';
COMMENT ON COLUMN wallet_addresses.transaction_count IS 'Total number of transactions from this wallet';
COMMENT ON COLUMN wallet_addresses.total_volume IS 'Total transaction volume in native currency';
COMMENT ON COLUMN wallet_addresses.risk_score IS 'Calculated risk score (0-100)';
COMMENT ON COLUMN wallet_addresses.suspicious_activity IS 'Flag indicating suspicious behavior detected';
COMMENT ON COLUMN wallet_addresses.domain_name IS 'Associated blockchain domain name (e.g., .sol)';
COMMENT ON COLUMN wallet_addresses.domain_verified IS 'Whether domain ownership is verified';
COMMENT ON COLUMN wallet_addresses.linked_device_id IS 'Reference to the device this wallet is linked to';
COMMENT ON COLUMN wallet_addresses.device_fingerprint IS 'Hashed device fingerprint for security';
COMMENT ON COLUMN wallet_addresses.last_session_id IS 'Last session that used this wallet';
COMMENT ON COLUMN wallet_addresses.last_ip_address IS 'Last IP address that accessed this wallet';
COMMENT ON COLUMN wallet_addresses.is_blocked IS 'Whether this wallet is blocked from use';
COMMENT ON COLUMN wallet_addresses.blocked_reason IS 'Reason for blocking the wallet';
COMMENT ON COLUMN wallet_addresses.blocked_at IS 'When the wallet was blocked';
COMMENT ON COLUMN wallet_addresses.transaction_notifications IS 'Whether to send notifications for wallet transactions';
COMMENT ON COLUMN wallet_addresses.created_at IS 'Timestamp when this record was created';
COMMENT ON COLUMN wallet_addresses.updated_at IS 'Timestamp when this record was last updated';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Usage Examples
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Example: Add a new verified primary wallet for a user
INSERT INTO wallet_addresses (
   user_id,
   wallet_address,
   blockchain,
   type,
   is_primary,
   is_verified,
   verification_signature,
   verification_message,
   verification_timestamp,
   label,
   wallet_name
) VALUES (
   '123e4567-e89b-12d3-a456-426614174000',
   'BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa',
   'solana',
   'phantom',
   TRUE,
   TRUE,
   'SIG_BASE64_ENCODED_SIGNATURE_HERE',
   'Please sign this message to verify wallet ownership for TicketToken',
   CURRENT_TIMESTAMP,
   'Main Wallet',
   'Phantom'
);

-- Example: Find all verified wallets for a user
SELECT 
   wa.wallet_address,
   wa.type,
   wa.label,
   wa.is_primary,
   wa.last_used_at,
   wa.transaction_count
FROM wallet_addresses wa
WHERE wa.user_id = '123e4567-e89b-12d3-a456-426614174000'
   AND wa.is_verified = TRUE
   AND wa.is_blocked = FALSE
ORDER BY wa.is_primary DESC, wa.last_used_at DESC;

-- Example: Update wallet usage statistics
UPDATE wallet_addresses
SET 
   last_used_at = CURRENT_TIMESTAMP,
   transaction_count = transaction_count + 1,
   total_volume = COALESCE(total_volume, 0) + 1.5
WHERE wallet_address = 'BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa'
   AND blockchain = 'solana';

-- Example: Block a suspicious wallet
UPDATE wallet_addresses
SET 
   is_blocked = TRUE,
   blocked_reason = 'Suspicious activity detected: rapid transaction pattern',
   blocked_at = CURRENT_TIMESTAMP,
   suspicious_activity = TRUE,
   risk_score = 85
WHERE wallet_address = 'SUSp1c10usWA11eTADDReSS123456789012345678901';

-- Example: Get primary wallets for all users with activity
SELECT 
   u.email,
   wa.wallet_address,
   wa.blockchain,
   wa.transaction_count,
   wa.total_volume,
   wa.last_used_at
FROM wallet_addresses wa
JOIN users u ON wa.user_id = u.id
WHERE wa.is_primary = TRUE
   AND wa.transaction_count > 0
ORDER BY wa.last_used_at DESC;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_tenant_id ON wallet_addresses(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_tenant_created ON wallet_addresses(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
