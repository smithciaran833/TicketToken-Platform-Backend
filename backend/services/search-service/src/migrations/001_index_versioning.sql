-- Track index versions for consistency
CREATE TABLE IF NOT EXISTS index_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    indexed_at TIMESTAMP WITH TIME ZONE,
    index_status VARCHAR(50) DEFAULT 'PENDING',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_index_versions_status ON index_versions(index_status, created_at);
CREATE INDEX idx_index_versions_entity ON index_versions(entity_type, entity_id);

-- Track pending index operations
CREATE TABLE IF NOT EXISTS index_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    operation VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE
    payload JSONB NOT NULL,
    priority INTEGER DEFAULT 5,
    version BIGINT,
    idempotency_key VARCHAR(255) UNIQUE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_index_queue_unprocessed ON index_queue(processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_index_queue_priority ON index_queue(priority DESC, created_at ASC) WHERE processed_at IS NULL;

-- Client read tracking for consistency
CREATE TABLE IF NOT EXISTS read_consistency_tokens (
    token VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    required_versions JSONB NOT NULL, -- { "events": { "id1": 2, "id2": 3 }, "venues": { "id3": 1 } }
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_read_consistency_expires ON read_consistency_tokens(expires_at);
