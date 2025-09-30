-- TicketToken NFT Metadata Schema
-- This table stores all NFT metadata and blockchain references for tokenized tickets
-- NFT Workflow: Ticket created -> Metadata generated -> NFT minted -> Metadata stored on IPFS -> Blockchain references saved
-- Supports both standard NFTs and compressed NFTs (cNFTs) on Solana
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS ticket_metadata CASCADE;

-- Create the ticket_metadata table
CREATE TABLE ticket_metadata (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to tickets table
    ticket_id UUID NOT NULL UNIQUE,  -- One-to-one relationship with tickets
    
    -- NFT blockchain data
    nft_mint_address VARCHAR(44),  -- Solana NFT mint address (base58 encoded)
    metadata_uri VARCHAR(255),  -- URI to full metadata (usually IPFS)
    collection_address VARCHAR(44),  -- Collection mint address for grouped NFTs
    collection_verified BOOLEAN DEFAULT FALSE,  -- Whether NFT is verified in collection
    update_authority VARCHAR(44),  -- Address that can update metadata
    
    -- Compressed NFT (cNFT) specific fields
    is_compressed BOOLEAN DEFAULT FALSE,  -- Whether this is a compressed NFT
    merkle_tree_address VARCHAR(44),  -- Merkle tree address for cNFTs
    leaf_index BIGINT,  -- Position in the merkle tree
    proof_data JSONB,  -- Merkle proof for verification
    data_hash VARCHAR(64),  -- Hash of the compressed data
    creator_hash VARCHAR(64),  -- Hash of the creators array
    
    -- Visual metadata (following Metaplex standard)
    name VARCHAR(255) NOT NULL,  -- NFT name (e.g., "Event Name - Seat A1")
    symbol VARCHAR(10),  -- NFT symbol (e.g., "TKTTK")
    description TEXT,  -- Detailed description of the ticket
    image_url VARCHAR(500),  -- Primary image URL (ticket design)
    animation_url VARCHAR(500),  -- Animation/video URL if applicable
    external_url VARCHAR(500),  -- External URL (e.g., event website)
    background_color VARCHAR(6),  -- Hex color without # (e.g., "FF0000")
    
    -- Ticket-specific attributes (stored as JSONB for flexibility)
    attributes JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of trait objects
    /* Example attributes structure:
    [
        {"trait_type": "Event Name", "value": "Summer Music Festival"},
        {"trait_type": "Event Date", "value": "2025-07-20"},
        {"trait_type": "Venue", "value": "Madison Square Garden"},
        {"trait_type": "Section", "value": "VIP"},
        {"trait_type": "Row", "value": "A"},
        {"trait_type": "Seat", "value": "1"},
        {"trait_type": "Access Level", "value": "All Access"},
        {"trait_type": "Perks", "value": ["Meet & Greet", "Free Drinks", "VIP Parking"]},
        {"trait_type": "Transferable", "value": "true"},
        {"trait_type": "Max Transfers", "value": "3", "max_value": "3"}
    ]
    */
    
    -- Additional metadata fields
    properties JSONB DEFAULT '{}'::jsonb,  -- Additional properties (Metaplex standard)
    /* Example properties:
    {
        "files": [
            {"uri": "https://ipfs.io/ipfs/...", "type": "image/png"},
            {"uri": "https://arweave.net/...", "type": "image/png"}
        ],
        "category": "ticket",
        "creators": [
            {"address": "...", "share": 100}
        ]
    }
    */
    
    -- IPFS storage information
    ipfs_hash VARCHAR(64),  -- IPFS content hash (CID)
    ipfs_gateway_url VARCHAR(500),  -- Full gateway URL for easy access
    backup_storage_url VARCHAR(500),  -- Backup storage (e.g., Arweave, AWS S3)
    storage_provider VARCHAR(50) CHECK (storage_provider IN ('ipfs', 'arweave', 's3', 'cloudflare', 'other')),
    
    -- Blockchain status tracking
    blockchain_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (blockchain_status IN (
        'pending',      -- Metadata created, awaiting mint
        'minting',      -- NFT mint in progress
        'minted',       -- Successfully minted on chain
        'transferred',  -- NFT has been transferred
        'burned',       -- NFT has been burned
        'error',        -- Error during minting/update
        'updating'      -- Metadata update in progress
    )),
    blockchain_error TEXT,  -- Error details if status is 'error'
    transaction_signature VARCHAR(88),  -- Last transaction signature
    
    -- Royalty information (in basis points, 100 = 1%)
    seller_fee_basis_points INTEGER DEFAULT 250,  -- Total royalty (2.5% default)
    creators JSONB DEFAULT '[]'::jsonb,  -- Array of creators with shares
    /* Example creators structure:
    [
        {"address": "venue_wallet_address", "share": 60},
        {"address": "platform_wallet_address", "share": 40}
    ]
    */
    
    -- Marketplace compatibility
    listed_marketplaces JSONB DEFAULT '[]'::jsonb,  -- Array of marketplace addresses
    marketplace_metadata JSONB DEFAULT '{}'::jsonb,  -- Marketplace-specific metadata
    
    -- Verification and security
    metadata_hash VARCHAR(64),  -- SHA256 hash of the metadata JSON
    signature VARCHAR(128),  -- Cryptographic signature of metadata
    verified_by VARCHAR(44),  -- Address that verified the metadata
    
    -- Caching and performance
    metadata_cache JSONB,  -- Full metadata cache for quick access
    cache_expires_at TIMESTAMP WITH TIME ZONE,  -- When to refresh cache
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    minted_at TIMESTAMP WITH TIME ZONE,  -- When NFT was minted
    last_verified_at TIMESTAMP WITH TIME ZONE,  -- Last blockchain verification
    metadata_frozen_at TIMESTAMP WITH TIME ZONE,  -- When metadata was frozen (immutable)
    
    -- Foreign key constraints
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    
    -- Ensure compressed NFT fields are set together
    CONSTRAINT chk_compressed_nft_fields CHECK (
        (is_compressed = FALSE) OR 
        (is_compressed = TRUE AND merkle_tree_address IS NOT NULL AND leaf_index IS NOT NULL)
    ),
    
    -- Ensure minted NFTs have addresses
    CONSTRAINT chk_minted_address CHECK (
        (blockchain_status != 'minted' AND blockchain_status != 'transferred') OR 
        (nft_mint_address IS NOT NULL)
    ),
    
    -- Ensure error status has error message
    CONSTRAINT chk_error_message CHECK (
        (blockchain_status != 'error') OR 
        (blockchain_status = 'error' AND blockchain_error IS NOT NULL)
    ),
    
    -- Validate royalty basis points (0-10000, where 10000 = 100%)
    CONSTRAINT chk_royalty_range CHECK (
        seller_fee_basis_points >= 0 AND seller_fee_basis_points <= 10000
    )
);

-- Create indexes for performance optimization

-- Primary lookup index
CREATE INDEX idx_ticket_metadata_ticket_id ON ticket_metadata(ticket_id);

-- NFT address lookups
CREATE INDEX idx_ticket_metadata_mint_address ON ticket_metadata(nft_mint_address) WHERE nft_mint_address IS NOT NULL;
CREATE INDEX idx_ticket_metadata_collection ON ticket_metadata(collection_address) WHERE collection_address IS NOT NULL;

-- Compressed NFT lookups
CREATE INDEX idx_ticket_metadata_merkle_tree ON ticket_metadata(merkle_tree_address, leaf_index) 
    WHERE is_compressed = TRUE;

-- Blockchain status monitoring
CREATE INDEX idx_ticket_metadata_status ON ticket_metadata(blockchain_status);
CREATE INDEX idx_ticket_metadata_pending ON ticket_metadata(created_at) 
    WHERE blockchain_status = 'pending';
CREATE INDEX idx_ticket_metadata_errors ON ticket_metadata(blockchain_status, created_at DESC) 
    WHERE blockchain_status = 'error';

-- JSONB indexes for attribute searching
CREATE INDEX idx_ticket_metadata_attributes ON ticket_metadata USING GIN (attributes);
CREATE INDEX idx_ticket_metadata_properties ON ticket_metadata USING GIN (properties);

-- Specific attribute searches (common queries)
CREATE INDEX idx_ticket_metadata_event_name ON ticket_metadata USING GIN ((attributes -> 'Event Name'));
CREATE INDEX idx_ticket_metadata_venue ON ticket_metadata USING GIN ((attributes -> 'Venue'));
CREATE INDEX idx_ticket_metadata_access_level ON ticket_metadata USING GIN ((attributes -> 'Access Level'));

-- IPFS and storage indexes
CREATE INDEX idx_ticket_metadata_ipfs ON ticket_metadata(ipfs_hash) WHERE ipfs_hash IS NOT NULL;
CREATE INDEX idx_ticket_metadata_storage ON ticket_metadata(storage_provider);

-- Marketplace filtering
CREATE INDEX idx_ticket_metadata_marketplaces ON ticket_metadata USING GIN (listed_marketplaces);

-- Cache management
CREATE INDEX idx_ticket_metadata_cache_expires ON ticket_metadata(cache_expires_at) 
    WHERE cache_expires_at IS NOT NULL;

-- Verification tracking
CREATE INDEX idx_ticket_metadata_verification ON ticket_metadata(last_verified_at);

-- Full-text search on name and description
CREATE INDEX idx_ticket_metadata_search ON ticket_metadata USING GIN (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_ticket_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ticket_metadata_updated_at 
    BEFORE UPDATE ON ticket_metadata 
    FOR EACH ROW 
    EXECUTE FUNCTION update_ticket_metadata_updated_at();

-- Create function to validate and format attributes
CREATE OR REPLACE FUNCTION validate_metadata_attributes()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure attributes is an array
    IF jsonb_typeof(NEW.attributes) != 'array' THEN
        RAISE EXCEPTION 'attributes must be a JSON array';
    END IF;
    
    -- Set minted_at timestamp when status changes to minted
    IF NEW.blockchain_status = 'minted' AND OLD.blockchain_status != 'minted' THEN
        NEW.minted_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Generate metadata hash if not provided
    IF NEW.metadata_hash IS NULL THEN
        NEW.metadata_hash = encode(
            sha256(
                (NEW.attributes::text || COALESCE(NEW.image_url, '') || COALESCE(NEW.name, ''))::bytea
            ), 
            'hex'
        );
    END IF;
    
    -- Auto-generate IPFS gateway URL if hash is provided
    IF NEW.ipfs_hash IS NOT NULL AND NEW.ipfs_gateway_url IS NULL THEN
        NEW.ipfs_gateway_url = 'https://ipfs.io/ipfs/' || NEW.ipfs_hash;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_metadata_before_insert
    BEFORE INSERT OR UPDATE ON ticket_metadata
    FOR EACH ROW
    EXECUTE FUNCTION validate_metadata_attributes();

-- Add table comments
COMMENT ON TABLE ticket_metadata IS 'Stores NFT metadata and blockchain references for tokenized tickets. Supports both standard and compressed NFTs on Solana with full Metaplex metadata standard compliance.';

-- Add column comments
COMMENT ON COLUMN ticket_metadata.id IS 'Unique identifier for the metadata record (UUID)';
COMMENT ON COLUMN ticket_metadata.ticket_id IS 'Foreign key to tickets table - one-to-one relationship';
COMMENT ON COLUMN ticket_metadata.nft_mint_address IS 'Solana NFT mint address (base58 encoded, 44 chars)';
COMMENT ON COLUMN ticket_metadata.metadata_uri IS 'URI pointing to full metadata JSON (usually IPFS)';
COMMENT ON COLUMN ticket_metadata.collection_address IS 'Collection mint address for grouping related NFTs';
COMMENT ON COLUMN ticket_metadata.collection_verified IS 'Whether NFT is verified as part of collection';
COMMENT ON COLUMN ticket_metadata.update_authority IS 'Solana address authorized to update metadata';
COMMENT ON COLUMN ticket_metadata.is_compressed IS 'Whether this is a compressed NFT (cNFT)';
COMMENT ON COLUMN ticket_metadata.merkle_tree_address IS 'Merkle tree address for compressed NFTs';
COMMENT ON COLUMN ticket_metadata.leaf_index IS 'Position in merkle tree for compressed NFTs';
COMMENT ON COLUMN ticket_metadata.proof_data IS 'Merkle proof data for cNFT verification';
COMMENT ON COLUMN ticket_metadata.data_hash IS 'Hash of compressed NFT data';
COMMENT ON COLUMN ticket_metadata.creator_hash IS 'Hash of creators array for cNFTs';
COMMENT ON COLUMN ticket_metadata.name IS 'NFT display name (e.g., "Concert Name - Seat A1")';
COMMENT ON COLUMN ticket_metadata.symbol IS 'NFT collection symbol';
COMMENT ON COLUMN ticket_metadata.description IS 'Detailed description of the ticket NFT';
COMMENT ON COLUMN ticket_metadata.image_url IS 'URL to ticket design image';
COMMENT ON COLUMN ticket_metadata.animation_url IS 'URL to animation/video content if applicable';
COMMENT ON COLUMN ticket_metadata.external_url IS 'External URL for more information';
COMMENT ON COLUMN ticket_metadata.background_color IS 'Background color in hex format (without #)';
COMMENT ON COLUMN ticket_metadata.attributes IS 'JSON array of trait objects following Metaplex standard';
COMMENT ON COLUMN ticket_metadata.properties IS 'Additional properties including files and creators';
COMMENT ON COLUMN ticket_metadata.ipfs_hash IS 'IPFS content identifier (CID) for metadata';
COMMENT ON COLUMN ticket_metadata.ipfs_gateway_url IS 'Full IPFS gateway URL for easy access';
COMMENT ON COLUMN ticket_metadata.backup_storage_url IS 'Backup storage URL (Arweave, S3, etc.)';
COMMENT ON COLUMN ticket_metadata.storage_provider IS 'Primary storage provider for metadata';
COMMENT ON COLUMN ticket_metadata.blockchain_status IS 'Current status of NFT on blockchain';
COMMENT ON COLUMN ticket_metadata.blockchain_error IS 'Error details if minting/update failed';
COMMENT ON COLUMN ticket_metadata.transaction_signature IS 'Last blockchain transaction signature';
COMMENT ON COLUMN ticket_metadata.seller_fee_basis_points IS 'Total royalty in basis points (250 = 2.5%)';
COMMENT ON COLUMN ticket_metadata.creators IS 'Array of creators with royalty shares';
COMMENT ON COLUMN ticket_metadata.listed_marketplaces IS 'Array of marketplace addresses where listed';
COMMENT ON COLUMN ticket_metadata.marketplace_metadata IS 'Marketplace-specific metadata overrides';
COMMENT ON COLUMN ticket_metadata.metadata_hash IS 'SHA256 hash of metadata for verification';
COMMENT ON COLUMN ticket_metadata.signature IS 'Cryptographic signature of metadata';
COMMENT ON COLUMN ticket_metadata.verified_by IS 'Address that verified the metadata';
COMMENT ON COLUMN ticket_metadata.metadata_cache IS 'Full metadata JSON cache';
COMMENT ON COLUMN ticket_metadata.cache_expires_at IS 'When to refresh metadata cache';
COMMENT ON COLUMN ticket_metadata.created_at IS 'When metadata record was created';
COMMENT ON COLUMN ticket_metadata.updated_at IS 'When metadata was last updated';
COMMENT ON COLUMN ticket_metadata.minted_at IS 'When NFT was minted on blockchain';
COMMENT ON COLUMN ticket_metadata.last_verified_at IS 'Last blockchain state verification';
COMMENT ON COLUMN ticket_metadata.metadata_frozen_at IS 'When metadata became immutable';

-- Sample data for testing (commented out)
/*
-- Standard NFT ticket metadata
INSERT INTO ticket_metadata (
    ticket_id, name, symbol, description,
    image_url, attributes, blockchain_status,
    nft_mint_address, collection_address
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'Summer Music Festival 2025 - VIP Section A, Seat 1',
    'SMF25',
    'VIP ticket for Summer Music Festival 2025 with exclusive access to VIP areas, complimentary drinks, and meet & greet opportunities.',
    'https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
    '[
        {"trait_type": "Event Name", "value": "Summer Music Festival 2025"},
        {"trait_type": "Event Date", "value": "2025-07-20"},
        {"trait_type": "Venue", "value": "Madison Square Garden"},
        {"trait_type": "Section", "value": "VIP-A"},
        {"trait_type": "Seat", "value": "1"},
        {"trait_type": "Access Level", "value": "VIP All Access"},
        {"trait_type": "Perks", "value": ["Meet & Greet", "Free Drinks", "VIP Parking", "Exclusive Merch"]},
        {"trait_type": "Transferable", "value": "true"},
        {"trait_type": "Max Transfers", "value": "3", "max_value": "3"}
    ]'::jsonb,
    'minted',
    'SMF2025VIPxxx...xxx',  -- 44 character Solana address
    'SMFCOLLECTIONxxx...xxx'  -- Collection address
);

-- Compressed NFT ticket metadata
INSERT INTO ticket_metadata (
    ticket_id, name, symbol, description,
    image_url, attributes, blockchain_status,
    is_compressed, merkle_tree_address, leaf_index
) VALUES (
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'Tech Conference 2025 - General Admission',
    'TECH25',
    'General admission ticket for Tech Conference 2025.',
    'https://arweave.net/xxx...xxx',
    '[
        {"trait_type": "Event Name", "value": "Tech Conference 2025"},
        {"trait_type": "Event Date", "value": "2025-09-15"},
        {"trait_type": "Venue", "value": "Convention Center"},
        {"trait_type": "Access Level", "value": "General Admission"},
        {"trait_type": "Transferable", "value": "false"}
    ]'::jsonb,
    'minted',
    true,
    'MERKLETREExxx...xxx',
    12345
);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_metadata_tenant_id ON ticket_metadata(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_metadata_tenant_created ON ticket_metadata(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
