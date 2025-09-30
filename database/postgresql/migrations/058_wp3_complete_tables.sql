-- Idempotency keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL DEFAULT 'processing',
  response_body JSONB,
  status_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);
CREATE INDEX idx_idempotency_status ON idempotency_keys(status);

-- Dispute evidence packs
CREATE TABLE IF NOT EXISTS dispute_evidence_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id VARCHAR(255) NOT NULL,
  order_id UUID REFERENCES orders(id),
  evidence_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dispute_evidence_order ON dispute_evidence_packs(order_id);
CREATE INDEX idx_dispute_evidence_dispute ON dispute_evidence_packs(dispute_id);

-- PSP reconciliations
CREATE TABLE IF NOT EXISTS psp_reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  reconciliation_date DATE NOT NULL,
  our_totals JSONB NOT NULL,
  psp_totals JSONB NOT NULL,
  discrepancies JSONB,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, reconciliation_date)
);

CREATE INDEX idx_psp_recon_date ON psp_reconciliations(reconciliation_date);
CREATE INDEX idx_psp_recon_status ON psp_reconciliations(status);

-- Communications log (for dispute evidence)
CREATE TABLE IF NOT EXISTS communications_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE,
  recipient_email VARCHAR(255) NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  subject TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comms_log_email ON communications_log(recipient_email);

-- Ticket scans (for dispute evidence)
CREATE TABLE IF NOT EXISTS ticket_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  device_id UUID,
  scanned_at TIMESTAMP NOT NULL,
  scan_type VARCHAR(50),
  result VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_scans_ticket ON ticket_scans(ticket_id);

-- TOS acceptances
CREATE TABLE IF NOT EXISTS tos_acceptances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tos_email ON tos_acceptances(user_email);
