-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- NFT Metadata Table Schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This table caches NFT metadata for ticket tokens, supporting both regular
-- and compressed NFTs on Solana using Metaplex standards

-- Drop table if exists (for development - remove in production)
DROP TABLE IF EXISTS nft_metadata CASCADE;

-- Create nft_metadata table
CREATE TABLE nft_metadata (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Ticket reference
   ticket_id UUID UNIQUE, -- Reference to the ticket this NFT represents
   CONSTRAINT fk_ticket
       FOREIGN KEY (ticket_id) 
       REFERENCES tickets(id)
       ON DELETE CASCADE,
   
   -- NFT identification
   mint_address VARCHAR(44) UNIQUE NOT NULL, -- Solana mint address of the NFT
   
   -- Metadata location
   metadata_uri VARCHAR(500), -- URI to metadata JSON (Arweave/IPFS)
   
   -- Core metadata fields
   name VARCHAR(200), -- NFT name
   symbol VARCHAR(10), -- NFT symbol
   description TEXT, -- NFT description
   
   -- Media URLs
   image_url VARCHAR(500), -- Primary image URL
   animation_url VARCHAR(500), -- Animation/video URL if applicable
   external_url VARCHAR(500), -- External website URL
   
   -- Compressed NFT data (Metaplex Bubblegum)
   is_compressed BOOLEAN DEFAULT TRUE, -- Whether this is a compressed NFT
   tree_address VARCHAR(44), -- Merkle tree address for compressed NFTs
   leaf_index BIGINT, -- Leaf position in the merkle tree
   data_hash VARCHAR(64), -- Hash of the NFT data
   
   -- Collection information
   collection_address VARCHAR(44), -- Collection mint address
   collection_name VARCHAR(200), -- Collection name
   collection_verified BOOLEAN DEFAULT FALSE, -- Whether NFT is verified in collection
   
   -- Attributes array
   attributes JSONB DEFAULT '[]', -- Array of trait_type/value pairs
   
   -- Creator data
   creators JSONB DEFAULT '[]', -- Array of creators with address and share
   
   -- Royalty settings
   seller_fee_basis_points INTEGER DEFAULT 250, -- Royalty percentage (250 = 2.5%)
   royalty_recipients JSONB DEFAULT '[]', -- Array of royalty recipients
   
   -- Metadata standard
   standard VARCHAR(30) NOT NULL DEFAULT 'metaplex', -- Metadata standard used
   CONSTRAINT valid_standard CHECK (standard IN (
       'metaplex',           -- Standard Metaplex Token Metadata
       'metaplex-bubblegum'  -- Compressed NFT standard
   )),
   version VARCHAR(10), -- Version of the metadata standard
   
   -- Verification flags
   is_mutable BOOLEAN DEFAULT FALSE, -- Whether metadata can be updated
   primary_sale_happened BOOLEAN DEFAULT FALSE, -- Whether first sale occurred
   
   -- Token information
   edition_nonce INTEGER, -- Edition nonce for print editions
   token_standard VARCHAR(20), -- Token standard (NonFungible, Fungible, etc.)
   uses JSONB, -- Token uses configuration (if applicable)
   
   -- Sync tracking
   last_synced_at TIMESTAMP WITH TIME ZONE, -- Last successful sync time
   sync_status VARCHAR(20) DEFAULT 'PENDING', -- Current sync status
   CONSTRAINT valid_sync_status CHECK (sync_status IN (
       'PENDING',  -- Awaiting initial sync
       'SYNCED',   -- Successfully synced
       'FAILED',   -- Sync failed
       'OUTDATED'  -- Needs refresh
   )),
   
   -- Cache control
   cache_expires_at TIMESTAMP WITH TIME ZONE, -- When cache should be refreshed
   force_refresh BOOLEAN DEFAULT FALSE, -- Force refresh on next sync
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes for Performance
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Index on mint_address for lookups
CREATE UNIQUE INDEX idx_nft_metadata_mint_address 
   ON nft_metadata(mint_address);

-- Index on ticket_id for foreign key lookups
CREATE INDEX idx_nft_metadata_ticket_id 
   ON nft_metadata(ticket_id);

-- Index on tree_address for compressed NFT queries
CREATE INDEX idx_nft_metadata_tree_address 
   ON nft_metadata(tree_address) 
   WHERE tree_address IS NOT NULL;

-- Index on sync_status for sync queue
CREATE INDEX idx_nft_metadata_sync_status 
   ON nft_metadata(sync_status);

-- Index on collection_address for collection queries
CREATE INDEX idx_nft_metadata_collection 
   ON nft_metadata(collection_address) 
   WHERE collection_address IS NOT NULL;

-- Composite index for compressed NFT lookups
CREATE INDEX idx_nft_metadata_compressed 
   ON nft_metadata(tree_address, leaf_index) 
   WHERE is_compressed = TRUE;

-- Index on cache_expires_at for cache management
CREATE INDEX idx_nft_metadata_cache_expires 
   ON nft_metadata(cache_expires_at) 
   WHERE cache_expires_at IS NOT NULL;

-- GIN index on attributes for JSON queries
CREATE INDEX idx_nft_metadata_attributes_gin 
   ON nft_metadata USING GIN (attributes);

-- GIN index on creators for creator queries
CREATE INDEX idx_nft_metadata_creators_gin 
   ON nft_metadata USING GIN (creators);

-- Partial index for items needing sync
CREATE INDEX idx_nft_metadata_needs_sync 
   ON nft_metadata(last_synced_at, sync_status) 
   WHERE sync_status IN ('PENDING', 'FAILED', 'OUTDATED') OR force_refresh = TRUE;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update Trigger
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_nft_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_nft_metadata_timestamp
   BEFORE UPDATE ON nft_metadata
   FOR EACH ROW
   EXECUTE FUNCTION update_nft_metadata_updated_at();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table Comments
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


COMMENT ON TABLE nft_metadata IS 'Caches NFT metadata for ticket tokens, supporting both regular and compressed NFTs';

COMMENT ON COLUMN nft_metadata.id IS 'Unique identifier for the metadata record';
COMMENT ON COLUMN nft_metadata.ticket_id IS 'Reference to the ticket this NFT represents';
COMMENT ON COLUMN nft_metadata.mint_address IS 'Solana mint address of the NFT (base58 encoded)';
COMMENT ON COLUMN nft_metadata.metadata_uri IS 'URI pointing to the metadata JSON file (usually Arweave or IPFS)';
COMMENT ON COLUMN nft_metadata.name IS 'Name of the NFT from metadata';
COMMENT ON COLUMN nft_metadata.symbol IS 'Symbol of the NFT from metadata';
COMMENT ON COLUMN nft_metadata.description IS 'Description of the NFT from metadata';
COMMENT ON COLUMN nft_metadata.image_url IS 'URL to the primary image for the NFT';
COMMENT ON COLUMN nft_metadata.animation_url IS 'URL to animation or video content if applicable';
COMMENT ON COLUMN nft_metadata.external_url IS 'External URL for more information about the NFT';
COMMENT ON COLUMN nft_metadata.is_compressed IS 'Whether this is a compressed NFT (Metaplex Bubblegum)';
COMMENT ON COLUMN nft_metadata.tree_address IS 'Merkle tree address for compressed NFTs';
COMMENT ON COLUMN nft_metadata.leaf_index IS 'Position of this NFT in the merkle tree';
COMMENT ON COLUMN nft_metadata.data_hash IS 'Hash of the compressed NFT data';
COMMENT ON COLUMN nft_metadata.collection_address IS 'Mint address of the collection this NFT belongs to';
COMMENT ON COLUMN nft_metadata.collection_name IS 'Name of the collection';
COMMENT ON COLUMN nft_metadata.collection_verified IS 'Whether this NFT is verified as part of the collection';
COMMENT ON COLUMN nft_metadata.attributes IS 'Array of attributes with trait_type and value';
COMMENT ON COLUMN nft_metadata.creators IS 'Array of creators with their addresses and share percentages';
COMMENT ON COLUMN nft_metadata.seller_fee_basis_points IS 'Royalty percentage in basis points (100 = 1%)';
COMMENT ON COLUMN nft_metadata.royalty_recipients IS 'Array of addresses that receive royalties';
COMMENT ON COLUMN nft_metadata.standard IS 'Metadata standard used (metaplex or metaplex-bubblegum)';
COMMENT ON COLUMN nft_metadata.version IS 'Version of the metadata standard';
COMMENT ON COLUMN nft_metadata.is_mutable IS 'Whether the metadata can be changed after minting';
COMMENT ON COLUMN nft_metadata.primary_sale_happened IS 'Whether the first sale has occurred';
COMMENT ON COLUMN nft_metadata.edition_nonce IS 'Nonce for print editions if applicable';
COMMENT ON COLUMN nft_metadata.token_standard IS 'Token standard type from Metaplex';
COMMENT ON COLUMN nft_metadata.uses IS 'Token uses configuration for limited use NFTs';
COMMENT ON COLUMN nft_metadata.last_synced_at IS 'Last time metadata was successfully synced from chain';
COMMENT ON COLUMN nft_metadata.sync_status IS 'Current synchronization status';
COMMENT ON COLUMN nft_metadata.cache_expires_at IS 'When the cached data should be refreshed';
COMMENT ON COLUMN nft_metadata.force_refresh IS 'Flag to force metadata refresh on next sync';
COMMENT ON COLUMN nft_metadata.created_at IS 'Timestamp when this record was created';
COMMENT ON COLUMN nft_metadata.updated_at IS 'Timestamp when this record was last updated';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Usage Examples
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Example: Insert metadata for a compressed NFT ticket
INSERT INTO nft_metadata (
   ticket_id,
   mint_address,
   metadata_uri,
   name,
   symbol,
   description,
   image_url,
   is_compressed,
   tree_address,
   leaf_index,
   data_hash,
   collection_address,
   collection_name,
   attributes,
   creators,
   seller_fee_basis_points,
   standard
) VALUES (
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
   '7EYnhQoR9YM3N7UoaKRoA4xKbKqtWGbgSM9bASRxcUEH',
   'https://arweave.net/1234567890abcdef',
   'Madison Square Garden - Section A Row 10 Seat 5',
   'TICKET',
   'VIP ticket for concert on June 15, 2024',
   'https://arweave.net/image-1234567890',
   TRUE,
   'BGUMAp9Gq7iTEuizy4pqaxVSKxLfVTqJzFu9Jrk8Lccb',
   12345,
   'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567',
   'CoLLecT10nMiNTaDDReSS1234567890123456789012',
   'Summer Concert Series 2024',
   '[
       {"trait_type": "Section", "value": "A"},
       {"trait_type": "Row", "value": "10"},
       {"trait_type": "Seat", "value": "5"},
       {"trait_type": "Type", "value": "VIP"},
       {"trait_type": "Event Date", "value": "2024-06-15"}
   ]'::jsonb,
   '[
       {"address": "VeNUeCreat0rWA11eTADDReSS123456789012345678", "share": 100}
   ]'::jsonb,
   250,
   'metaplex-bubblegum'
);

-- Example: Find all NFTs in a collection
SELECT 
   nm.name,
   nm.mint_address,
   nm.attributes->0->>'Section' as section,
   nm.attributes->1->>'Row' as row,
   nm.attributes->2->>'Seat' as seat
FROM nft_metadata nm
WHERE nm.collection_address = 'CoLLecT10nMiNTaDDReSS1234567890123456789012'
   AND nm.sync_status = 'SYNCED'
ORDER BY 
   nm.attributes->0->>'Section',
   (nm.attributes->1->>'Row')::int,
   (nm.attributes->2->>'Seat')::int;

-- Example: Find NFTs needing metadata refresh
SELECT 
   id,
   mint_address,
   sync_status,
   last_synced_at,
   CASE 
       WHEN force_refresh THEN 'Forced refresh'
       WHEN sync_status = 'FAILED' THEN 'Previous sync failed'
       WHEN cache_expires_at < CURRENT_TIMESTAMP THEN 'Cache expired'
       ELSE 'Pending initial sync'
   END as reason
FROM nft_metadata
WHERE sync_status IN ('PENDING', 'FAILED', 'OUTDATED')
   OR force_refresh = TRUE
   OR (cache_expires_at IS NOT NULL AND cache_expires_at < CURRENT_TIMESTAMP)
ORDER BY 
   CASE sync_status 
       WHEN 'FAILED' THEN 1 
       WHEN 'OUTDATED' THEN 2 
       ELSE 3 
   END,
   last_synced_at ASC NULLS FIRST
LIMIT 100;

-- Example: Update metadata after successful sync
UPDATE nft_metadata
SET 
   name = 'Updated NFT Name',
   description = 'Updated description',
   image_url = 'https://new-image-url.com/image.png',
   attributes = '[{"trait_type": "Updated", "value": "true"}]'::jsonb,
   sync_status = 'SYNCED',
   last_synced_at = CURRENT_TIMESTAMP,
   cache_expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days',
   force_refresh = FALSE
WHERE mint_address = '7EYnhQoR9YM3N7UoaKRoA4xKbKqtWGbgSM9bASRxcUEH';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_nft_metadata_tenant_id ON nft_metadata(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nft_metadata_tenant_created ON nft_metadata(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
