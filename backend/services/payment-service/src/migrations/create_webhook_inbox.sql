-- Webhook inbox table for reliable webhook processing
CREATE TABLE IF NOT EXISTS webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL, -- stripe, square, etc
  event_id VARCHAR(255) UNIQUE NOT NULL, -- provider's event ID for deduplication
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  signature VARCHAR(500),
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INT DEFAULT 0,
  error_message TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_webhook_inbox_status ON webhook_inbox(status);
CREATE INDEX idx_webhook_inbox_provider_event ON webhook_inbox(provider, event_id);
CREATE INDEX idx_webhook_inbox_received_at ON webhook_inbox(received_at);
CREATE INDEX idx_webhook_inbox_tenant ON webhook_inbox(tenant_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_webhook_inbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER webhook_inbox_updated_at
  BEFORE UPDATE ON webhook_inbox
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_inbox_updated_at();
