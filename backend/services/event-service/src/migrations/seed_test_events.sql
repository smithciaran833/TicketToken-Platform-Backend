-- Insert test venues
INSERT INTO venues (id, name, city, state, capacity) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Madison Square Garden', 'New York', 'NY', 20000),
('550e8400-e29b-41d4-a716-446655440002', 'Hollywood Bowl', 'Los Angeles', 'CA', 17500),
('550e8400-e29b-41d4-a716-446655440003', 'Red Rocks Amphitheatre', 'Denver', 'CO', 9525)
ON CONFLICT (id) DO NOTHING;

-- Insert test events
INSERT INTO events (title, description, category, venue_id, start_date, end_date, status) VALUES
('Summer Music Festival', 'Three days of amazing music', 'music', '550e8400-e29b-41d4-a716-446655440001', '2025-07-01 18:00:00', '2025-07-03 23:00:00', 'published'),
('Tech Conference 2025', 'Latest in technology and innovation', 'conference', '550e8400-e29b-41d4-a716-446655440002', '2025-09-15 09:00:00', '2025-09-17 17:00:00', 'published'),
('Comedy Night', 'Stand-up comedy show', 'comedy', '550e8400-e29b-41d4-a716-446655440003', '2025-08-20 20:00:00', '2025-08-20 22:30:00', 'published'),
('Basketball Championship', 'Final game of the season', 'sports', '550e8400-e29b-41d4-a716-446655440001', '2025-06-10 19:30:00', '2025-06-10 22:00:00', 'published'),
('Jazz Evening', 'Smooth jazz under the stars', 'music', '550e8400-e29b-41d4-a716-446655440003', '2025-08-25 19:00:00', '2025-08-25 23:00:00', 'draft');

-- Add ticket types
INSERT INTO ticket_types (event_id, name, price, total_quantity, available_quantity)
SELECT id, 'General Admission', 75.00, 1000, 950 FROM events WHERE title = 'Summer Music Festival'
UNION ALL
SELECT id, 'VIP', 250.00, 100, 85 FROM events WHERE title = 'Summer Music Festival';
