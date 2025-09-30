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
