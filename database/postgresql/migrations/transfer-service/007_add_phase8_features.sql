-- Migration: 007_add_phase8_features.sql
-- Description: Add tables for webhooks, event streaming, and advanced features
-- Phase 8: Advanced Features

-- Webhook subscriptions table
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook deliveries log table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    http_status INTEGER,
    error_message TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full-text search index columns (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ticket_transfers' 
        AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE ticket_transfers 
        ADD COLUMN search_vector tsvector;
    END IF;
END $$;

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_search
ON ticket_transfers USING gin(search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_transfer_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.transfer_code, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.to_email, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update search vector
DROP TRIGGER IF EXISTS trigger_update_transfer_search_vector ON ticket_transfers;
CREATE TRIGGER trigger_update_transfer_search_vector
    BEFORE INSERT OR UPDATE ON ticket_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_transfer_search_vector();

-- Create indexes for webhook tables
CREATE INDEX idx_webhook_subscriptions_tenant ON webhook_subscriptions(tenant_id);
CREATE INDEX idx_webhook_subscriptions_active ON webhook_subscriptions(is_active) WHERE is_active = true;

CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id);
CREATE INDEX idx_webhook_deliveries_attempted ON webhook_deliveries(attempted_at);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);

-- Add updated_at trigger for webhook_subscriptions
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE webhook_subscriptions IS 'Webhook endpoint subscriptions for real-time notifications';
COMMENT ON TABLE webhook_deliveries IS 'Log of webhook delivery attempts';
COMMENT ON COLUMN ticket_transfers.search_vector IS 'Full-text search vector for transfer data';

-- Create view for webhook statistics
CREATE OR REPLACE VIEW webhook_delivery_stats AS
SELECT
    ws.id as subscription_id,
    ws.url,
    COUNT(wd.id) as total_deliveries,
    COUNT(wd.id) FILTER (WHERE wd.status = 'SUCCESS') as successful_deliveries,
    COUNT(wd.id) FILTER (WHERE wd.status = 'FAILED') as failed_deliveries,
    ROUND(
        (COUNT(wd.id) FILTER (WHERE wd.status = 'SUCCESS')::numeric / 
         NULLIF(COUNT(wd.id), 0)) * 100, 
        2
    ) as success_rate,
    MAX(wd.attempted_at) as last_delivery_at
FROM webhook_subscriptions ws
LEFT JOIN webhook_deliveries wd ON ws.id = wd.subscription_id
GROUP BY ws.id, ws.url;

COMMENT ON VIEW webhook_delivery_stats IS 'Statistics for webhook delivery success rates';

-- Create materialized view for search performance
CREATE MATERIALIZED VIEW IF NOT EXISTS transfer_search_cache AS
SELECT 
    tt.id,
    tt.tenant_id,
    tt.transfer_code,
    tt.status,
    tt.transfer_type,
    tt.from_user_id,
    tt.to_user_id,
    tt.to_email,
    tt.created_at,
    t.ticket_number,
    t.event_id,
    tt.search_vector
FROM ticket_transfers tt
LEFT JOIN tickets t ON tt.ticket_id = t.id;

-- Create indexes on materialized view
CREATE INDEX idx_transfer_search_cache_tenant ON transfer_search_cache(tenant_id);
CREATE INDEX idx_transfer_search_cache_status ON transfer_search_cache(status);
CREATE INDEX idx_transfer_search_cache_created ON transfer_search_cache(created_at);
CREATE INDEX idx_transfer_search_cache_search ON transfer_search_cache USING gin(search_vector);

COMMENT ON MATERIALIZED VIEW transfer_search_cache 
IS 'Cached transfer data for faster search queries - refresh periodically';

-- Function to refresh search cache
CREATE OR REPLACE FUNCTION refresh_transfer_search_cache()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY transfer_search_cache;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_transfer_search_cache()
IS 'Refreshes the transfer search cache materialized view';
