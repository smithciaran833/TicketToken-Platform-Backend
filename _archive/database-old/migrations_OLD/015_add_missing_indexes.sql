-- Migration: Add missing foreign key indexes


-- Missing indexes found in testing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_fee_tracking_transaction_signature 
ON gas_fee_tracking(transaction_signature);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_smart_contract_events_transaction_id 
ON smart_contract_events(transaction_id);

-- Additional performance indexes
CREATE INDEX idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at);
CREATE INDEX idx_events_venue_date ON events(venue_id, event_date);

INSERT INTO migrations (name, applied_at) 
VALUES ('021_add_missing_indexes', NOW());

