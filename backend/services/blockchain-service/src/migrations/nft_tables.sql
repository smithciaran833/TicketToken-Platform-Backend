-- NFT mints tracking
CREATE TABLE IF NOT EXISTS nft_mints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id VARCHAR(255) UNIQUE NOT NULL,
  mint_address VARCHAR(100) NOT NULL,
  owner_address VARCHAR(100),
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  minted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_nft_ticket_id ON nft_mints(ticket_id);
CREATE INDEX IF NOT EXISTS idx_nft_mint_address ON nft_mints(mint_address);
CREATE INDEX IF NOT EXISTS idx_nft_status ON nft_mints(status);

-- NFT transfers tracking
CREATE TABLE IF NOT EXISTS nft_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(100) NOT NULL,
  from_address VARCHAR(100) NOT NULL,
  to_address VARCHAR(100) NOT NULL,
  amount INT DEFAULT 1,
  signature VARCHAR(200),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_transfer_token ON nft_transfers(token_address);
CREATE INDEX IF NOT EXISTS idx_transfer_signature ON nft_transfers(signature);

-- Solana transaction tracking
CREATE TABLE IF NOT EXISTS solana_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature VARCHAR(200) UNIQUE NOT NULL,
  type VARCHAR(50),
  status VARCHAR(50),
  block_height BIGINT,
  slot BIGINT,
  fee BIGINT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  finalized_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sol_signature ON solana_transactions(signature);
CREATE INDEX IF NOT EXISTS idx_sol_status ON solana_transactions(status);
