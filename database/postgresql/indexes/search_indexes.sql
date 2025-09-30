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
