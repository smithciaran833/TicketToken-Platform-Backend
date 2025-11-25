-- Ticket reservations table for WP-2
CREATE TABLE IF NOT EXISTS ticket_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  event_tier_id UUID REFERENCES event_tiers(id),
  quantity INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, EXPIRED, RELEASED
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_reservations_status ON ticket_reservations(status);
CREATE INDEX idx_reservations_expires ON ticket_reservations(expires_at);
CREATE INDEX idx_reservations_order ON ticket_reservations(order_id);
CREATE INDEX idx_reservations_user ON ticket_reservations(user_id);
