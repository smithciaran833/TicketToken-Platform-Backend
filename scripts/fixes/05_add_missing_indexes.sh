#!/bin/bash
# Add missing foreign key indexes

set -euo pipefail

echo "Adding missing indexes..."

# Create the indexes directory structure
mkdir -p database/postgresql/indexes

# Create performance indexes file
cat > database/postgresql/indexes/performance_indexes.sql << 'SQL'
-- Performance optimization indexes for TicketToken platform

-- Core tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));

-- Session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Event performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_venue_date ON events(venue_id, event_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_status_date ON events(status, event_date);

-- Ticket performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);

-- Transaction performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Marketplace performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_event_id ON listings(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_status ON listings(status);
SQL

# Create foreign key indexes file
cat > database/postgresql/indexes/foreign_key_indexes.sql << 'SQL'
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
SQL

# Create search indexes file
cat > database/postgresql/indexes/search_indexes.sql << 'SQL'
-- Full-text search and pattern matching indexes

-- Event search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_name_search ON events USING gin(to_tsvector('english', name));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_description_search ON events USING gin(to_tsvector('english', description));

-- Venue search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_name_search ON venues USING gin(to_tsvector('english', name));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_city_search ON venues(city);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_state_search ON venues(state);

-- Customer search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_profiles_name_search 
ON customer_profiles USING gin(to_tsvector('english', first_name || ' ' || last_name));
SQL

echo "Index files created successfully!"
