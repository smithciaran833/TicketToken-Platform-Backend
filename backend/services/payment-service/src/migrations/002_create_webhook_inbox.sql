-- Webhook inbox table for reliable webhook processing
CREATE TABLE IF NOT EXISTS webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  signature VARCHAR(500),
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  error_message TEXT,
  tenant_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status ON webhook_inbox(status);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_provider_event ON webhook_inbox(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_received_at ON webhook_inbox(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_tenant ON webhook_inbox(tenant_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_webhook_inbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS webhook_inbox_updated_at ON webhook_inbox;
CREATE TRIGGER webhook_inbox_updated_at
  BEFORE UPDATE ON webhook_inbox
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_inbox_updated_at();
