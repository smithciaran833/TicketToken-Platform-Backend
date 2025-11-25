-- Settlement reports table
CREATE TABLE IF NOT EXISTS settlement_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  settlement_date DATE NOT NULL,
  gross_revenue DECIMAL(10,2) NOT NULL,
  platform_fees DECIMAL(10,2) NOT NULL,
  taxes DECIMAL(10,2) NOT NULL,
  net_payout DECIMAL(10,2) NOT NULL,
  order_count INTEGER NOT NULL,
  ticket_count INTEGER NOT NULL,
  report_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(venue_id, settlement_date)
);

-- Venue balances table
CREATE TABLE IF NOT EXISTS venue_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance_type VARCHAR(20) NOT NULL, -- 'pending', 'available', 'paid_out'
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(venue_id, balance_type)
);

-- Webhook events table
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_settlement_reports_venue_date ON settlement_reports(venue_id, settlement_date);
CREATE INDEX idx_venue_balances_venue ON venue_balances(venue_id);
CREATE INDEX idx_webhook_events_provider_type ON webhook_events(provider, event_type);
