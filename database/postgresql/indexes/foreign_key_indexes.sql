-- Foreign key indexes for referential integrity performance

-- Missing indexes found in testing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_fee_tracking_transaction_signature 
ON gas_fee_tracking(transaction_signature);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_smart_contract_events_transaction_id 
ON smart_contract_events(transaction_id);

-- Venue relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_staff_venue_id ON venue_staff(venue_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_staff_user_id ON venue_staff(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_settings_venue_id ON venue_settings(venue_id);

-- Event relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_schedules_event_id ON event_schedules(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_pricing_event_id ON event_pricing(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_capacity_event_id ON event_capacity(event_id);

-- Ticket relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_redemptions_ticket_id ON ticket_redemptions(ticket_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_metadata_ticket_id ON ticket_metadata(ticket_id);

-- Payment relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlements_venue_id ON settlements(venue_id);
