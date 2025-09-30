-- Add missing columns to webhook_inbox table to match what the payment service expects
ALTER TABLE webhook_inbox 
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Update existing rows if needed
UPDATE webhook_inbox SET provider = 'stripe' WHERE provider IS NULL AND source IS NOT NULL;

-- Create index on event_id for the ON CONFLICT clause
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_event_id ON webhook_inbox(event_id);

-- Drop the old 'source' column if it exists and we're not using it
-- ALTER TABLE webhook_inbox DROP COLUMN IF EXISTS source;
