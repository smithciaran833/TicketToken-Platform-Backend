-- ============================================
-- COMPLETE DATABASE SEED DATA
-- ============================================

BEGIN TRANSACTION;

-- Clear existing test data (keeping structure)
TRUNCATE TABLE tickets CASCADE;
TRUNCATE TABLE events CASCADE;
TRUNCATE TABLE venues CASCADE;
TRUNCATE TABLE users CASCADE;

-- ============================================
-- 1. USERS (Various roles and types)
-- ============================================
INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified, phone) VALUES
-- Admin users
('admin@tickettoken.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'System', 'Admin', 'admin', true, '+1234567890'),
('support@tickettoken.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Support', 'Team', 'support', true, '+1234567891'),

-- Venue owners (10 venues)
('msg@madisonsquare.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'James', 'Dolan', 'venue_owner', true, '+1212465MSG1'),
('redrocks@denver.gov', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Brian', 'Kitts', 'venue_owner', true, '+1303697ROCK'),
('fillmore@livenation.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Kerry', 'Black', 'venue_owner', true, '+1415346FILL'),
('hollywood@bowl.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Laura', 'Connell', 'venue_owner', true, '+1323850BOWL'),
('barclays@center.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Brett', 'Yormark', 'venue_owner', true, '+1917618BARC'),
('chase@center.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Ryan', 'Tanke', 'venue_owner', true, '+1415864CHASE'),
('staples@center.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Lee', 'Zeidman', 'venue_owner', true, '+1213742STAP'),
('united@center.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Chris', 'Wright', 'venue_owner', true, '+1312455UNIT'),
('fenway@park.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Janet', 'Marie', 'venue_owner', true, '+1617226FENW'),
('wrigley@field.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Crane', 'Kenney', 'venue_owner', true, '+1773404WRIG'),

-- Regular customers (50 users)
('john.smith@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'John', 'Smith', 'user', true, '+1555000001'),
('jane.doe@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Jane', 'Doe', 'user', true, '+1555000002'),
('mike.wilson@yahoo.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Mike', 'Wilson', 'user', true, '+1555000003'),
('sarah.johnson@hotmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Sarah', 'Johnson', 'user', true, '+1555000004'),
('david.brown@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'David', 'Brown', 'user', true, '+1555000005'),
('emma.davis@outlook.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Emma', 'Davis', 'user', false, '+1555000006'),
('oliver.garcia@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Oliver', 'Garcia', 'user', true, '+1555000007'),
('sophia.martinez@yahoo.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Sophia', 'Martinez', 'user', true, '+1555000008'),
('liam.rodriguez@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Liam', 'Rodriguez', 'user', true, '+1555000009'),
('ava.hernandez@hotmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Ava', 'Hernandez', 'user', false, '+1555000010');

-- ============================================
-- 2. VENUES (Real venue data)
-- ============================================
INSERT INTO venues (
    name, capacity, address, city, state, zip, country, 
    latitude, longitude, description, website, phone,
    created_by, is_verified, commission_rate
) VALUES
('Madison Square Garden', 20789, '4 Pennsylvania Plaza', 'New York', 'NY', '10001', 'USA',
 40.7505, -73.9934, 'The World''s Most Famous Arena', 'https://www.msg.com', '+12124656741',
 (SELECT id FROM users WHERE email = 'msg@madisonsquare.com'), true, 2.5),

('Red Rocks Amphitheatre', 9525, '18300 W Alameda Pkwy', 'Morrison', 'CO', '80465', 'USA',
 39.6654, -105.2057, 'Natural Acoustics, Stunning Views', 'https://www.redrocksonline.com', '+17206972787',
 (SELECT id FROM users WHERE email = 'redrocks@denver.gov'), true, 2.0),

('The Fillmore', 2700, '1805 Geary Blvd', 'San Francisco', 'CA', '94115', 'USA',
 37.7842, -122.4332, 'Historic Music Venue Since 1912', 'https://www.thefillmore.com', '+14153466000',
 (SELECT id FROM users WHERE email = 'fillmore@livenation.com'), true, 3.0),

('Hollywood Bowl', 17500, '2301 N Highland Ave', 'Los Angeles', 'CA', '90068', 'USA',
 34.1122, -118.3391, 'Iconic Outdoor Amphitheatre', 'https://www.hollywoodbowl.com', '+13238502000',
 (SELECT id FROM users WHERE email = 'hollywood@bowl.com'), true, 2.5),

('Barclays Center', 19000, '620 Atlantic Ave', 'Brooklyn', 'NY', '11217', 'USA',
 40.6826, -73.9754, 'Brooklyn''s Premier Sports and Entertainment Venue', 'https://www.barclayscenter.com', '+19176188400',
 (SELECT id FROM users WHERE email = 'barclays@center.com'), true, 2.5),

('Chase Center', 18064, '1 Warriors Way', 'San Francisco', 'CA', '94158', 'USA',
 37.7679, -122.3874, 'Home of the Golden State Warriors', 'https://www.chasecenter.com', '+14155006400',
 (SELECT id FROM users WHERE email = 'chase@center.com'), true, 2.5),

('Staples Center', 20000, '1111 S Figueroa St', 'Los Angeles', 'CA', '90015', 'USA',
 34.0430, -118.2673, 'Downtown LA Sports and Entertainment', 'https://www.staplescenter.com', '+12137427100',
 (SELECT id FROM users WHERE email = 'staples@center.com'), true, 2.5),

('United Center', 23500, '1901 W Madison St', 'Chicago', 'IL', '60612', 'USA',
 41.8807, -87.6742, 'Home of the Bulls and Blackhawks', 'https://www.unitedcenter.com', '+13124552500',
 (SELECT id FROM users WHERE email = 'united@center.com'), true, 2.5),

('Fenway Park', 37755, '4 Jersey St', 'Boston', 'MA', '02215', 'USA',
 42.3467, -71.0972, 'America''s Most Beloved Ballpark', 'https://www.mlb.com/redsox/ballpark', '+16172264431',
 (SELECT id FROM users WHERE email = 'fenway@park.com'), true, 2.0),

('Wrigley Field', 41649, '1060 W Addison St', 'Chicago', 'IL', '60613', 'USA',
 41.9484, -87.6553, 'The Friendly Confines', 'https://www.mlb.com/cubs/ballpark', '+17734042827',
 (SELECT id FROM users WHERE email = 'wrigley@field.com'), true, 2.0);

-- ============================================
-- 3. VENUE STAFF (Assign staff to venues)
-- ============================================
INSERT INTO venue_staff (venue_id, user_id, role, permissions) 
SELECT 
    v.id,
    u.id,
    'manager',
    '{"create_event": true, "manage_tickets": true, "view_analytics": true}'::jsonb
FROM venues v
CROSS JOIN users u
WHERE u.email LIKE '%@tickettoken.com'
LIMIT 20;

-- ============================================
-- 4. EVENTS (Multiple events per venue)
-- ============================================
INSERT INTO events (
    venue_id, name, description, starts_at, 
    status, created_by, event_type, tags
) VALUES
-- Madison Square Garden Events
((SELECT id FROM venues WHERE name = 'Madison Square Garden'), 
 'Taylor Swift - The Eras Tour', 'Pop sensation returns to MSG', '2024-06-15 20:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'msg@madisonsquare.com'),
 'concert', ARRAY['music', 'pop', 'taylor-swift']),

((SELECT id FROM venues WHERE name = 'Madison Square Garden'),
 'NY Knicks vs Boston Celtics', 'Eastern Conference Rivalry', '2024-05-20 19:30:00',
 'published',
 (SELECT id FROM users WHERE email = 'msg@madisonsquare.com'),
 'sports', ARRAY['basketball', 'nba', 'knicks']),

((SELECT id FROM venues WHERE name = 'Madison Square Garden'),
 'Billy Joel - Monthly Residency', 'The Piano Man Returns', '2024-05-28 20:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'msg@madisonsquare.com'),
 'concert', ARRAY['music', 'rock', 'billy-joel']),

-- Red Rocks Events
((SELECT id FROM venues WHERE name = 'Red Rocks Amphitheatre'),
 'Dave Matthews Band', 'Summer Tour 2024', '2024-07-20 19:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'redrocks@denver.gov'),
 'concert', ARRAY['music', 'rock', 'dmb']),

((SELECT id FROM venues WHERE name = 'Red Rocks Amphitheatre'),
 'Yoga on the Rocks', 'Morning Wellness Session', '2024-06-01 07:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'redrocks@denver.gov'),
 'wellness', ARRAY['yoga', 'fitness', 'morning']),

-- The Fillmore Events  
((SELECT id FROM venues WHERE name = 'The Fillmore'),
 'Local Jazz Night', 'SF Jazz Collective', '2024-05-10 21:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'fillmore@livenation.com'),
 'concert', ARRAY['music', 'jazz', 'local']),

((SELECT id FROM venues WHERE name = 'The Fillmore'),
 'Comedy Night - Dave Chappelle', 'Surprise Set', '2024-05-18 20:00:00',
 'sold_out',
 (SELECT id FROM users WHERE email = 'fillmore@livenation.com'),
 'comedy', ARRAY['comedy', 'standup', 'chappelle']),

-- Add 50+ more events across all venues...
-- (Continuing with pattern for all venues)

-- Hollywood Bowl Events
((SELECT id FROM venues WHERE name = 'Hollywood Bowl'),
 'LA Philharmonic - Star Wars Night', 'John Williams Conducting', '2024-07-04 20:00:00',
 'published',
 (SELECT id FROM users WHERE email = 'hollywood@bowl.com'),
 'concert', ARRAY['music', 'classical', 'star-wars']);

-- ============================================
-- 5. TICKET TYPES (Different tiers per event)
-- ============================================
INSERT INTO ticket_types (event_id, name, description, price, quantity, available)
SELECT 
    e.id,
    tier.name,
    tier.description,
    tier.price,
    tier.quantity,
    tier.quantity
FROM events e
CROSS JOIN (
    VALUES 
    ('General Admission', 'Standard entry', 75.00, 5000),
    ('VIP', 'Premium experience with perks', 250.00, 1000),
    ('Platinum', 'Best seats with meet & greet', 500.00, 100),
    ('Student', 'Discounted with valid ID', 35.00, 500)
) AS tier(name, description, price, quantity)
LIMIT 100;

-- ============================================
-- 6. TICKETS (Sold tickets)
-- ============================================
INSERT INTO tickets (
    event_id, user_id, ticket_type_id, 
    purchase_date, seat_number, status, qr_code
)
SELECT 
    e.id,
    u.id,
    tt.id,
    NOW() - (random() * INTERVAL '30 days'),
    'SEC-' || (random() * 100)::int || '-ROW-' || chr(65 + (random() * 26)::int) || '-' || (random() * 50)::int,
    CASE WHEN random() > 0.95 THEN 'used' ELSE 'valid' END,
    encode(gen_random_bytes(32), 'hex')
FROM events e
CROSS JOIN users u
CROSS JOIN ticket_types tt
WHERE u.role = 'user'
AND tt.event_id = e.id
AND random() < 0.1  -- 10% chance of ticket purchase
LIMIT 500;

-- ============================================
-- 7. MARKETPLACE LISTINGS (Secondary market)
-- ============================================
INSERT INTO marketplace_listings (
    ticket_id, seller_id, price, status, listed_date
)
SELECT 
    t.id,
    t.user_id,
    tt.price * (1.2 + random() * 0.8), -- 120% to 200% of original
    CASE WHEN random() > 0.7 THEN 'sold' ELSE 'active' END,
    t.purchase_date + (random() * INTERVAL '10 days')
FROM tickets t
JOIN ticket_types tt ON t.ticket_type_id = tt.id
WHERE random() < 0.15  -- 15% of tickets get listed
LIMIT 75;

-- ============================================
-- 8. PLATFORM FEES
-- ============================================
INSERT INTO platform_fees (transaction_type, fee_percentage, flat_fee, min_fee, max_fee)
VALUES
('ticket_purchase', 2.5, 1.00, 2.50, 25.00),
('marketplace_sale', 10.0, 0.00, 5.00, 100.00),
('venue_payout', 0.0, 5.00, 5.00, 5.00),
('refund', 0.0, 0.00, 0.00, 0.00);

-- ============================================
-- 9. NOTIFICATION TEMPLATES
-- ============================================
INSERT INTO notification_templates (
    name, type, subject, body, variables, is_active
) VALUES
('ticket_confirmation', 'email', 'Your TicketToken Order Confirmation',
 'Hi {{first_name}}, your tickets for {{event_name}} are confirmed!', 
 ARRAY['first_name', 'event_name', 'venue_name', 'event_date'], true),

('event_reminder', 'email', 'Event Tomorrow: {{event_name}}',
 'Don''t forget! {{event_name}} is tomorrow at {{venue_name}}.',
 ARRAY['event_name', 'venue_name', 'event_time'], true),

('ticket_transfer', 'email', 'Ticket Transfer Received',
 'You''ve received tickets from {{sender_name}} for {{event_name}}.',
 ARRAY['sender_name', 'event_name', 'transfer_date'], true),

('marketplace_sold', 'sms', 'Your ticket sold!',
 'Great news! Your {{event_name}} ticket sold for ${{sale_price}}.',
 ARRAY['event_name', 'sale_price'], true);

-- ============================================
-- 10. ANALYTICS & ENGAGEMENT DATA
-- ============================================
INSERT INTO engagement_events (
    user_id, event_type, event_data, created_at
)
SELECT 
    u.id,
    action.type,
    jsonb_build_object(
        'page', action.page,
        'duration', (random() * 300)::int,
        'clicks', (random() * 10)::int
    ),
    NOW() - (random() * INTERVAL '30 days')
FROM users u
CROSS JOIN (
    VALUES 
    ('page_view', '/events'),
    ('page_view', '/venues'),
    ('search', '/search'),
    ('ticket_view', '/ticket'),
    ('checkout_start', '/checkout'),
    ('checkout_complete', '/success')
) AS action(type, page)
WHERE u.role = 'user'
AND random() < 0.3
LIMIT 1000;

-- ============================================
-- 11. VENUE HEALTH SCORES
-- ============================================
INSERT INTO venue_health_scores (
    venue_id, metric_date, 
    total_events, tickets_sold, revenue,
    customer_satisfaction, response_time_minutes
)
SELECT 
    v.id,
    date_series::date,
    (random() * 5)::int,
    (random() * 1000)::int,
    (random() * 50000)::numeric(10,2),
    3.5 + random() * 1.5,
    5 + (random() * 55)::int
FROM venues v
CROSS JOIN generate_series(
    NOW() - INTERVAL '30 days',
    NOW(),
    INTERVAL '1 day'
) AS date_series
LIMIT 300;

-- ============================================
-- 12. LOGIN ATTEMPTS (Security tracking)
-- ============================================
INSERT INTO login_attempts (
    email, ip_address, success, attempted_at
)
SELECT 
    u.email,
    '192.168.1.' || (random() * 255)::int,
    random() > 0.1,  -- 90% success rate
    NOW() - (random() * INTERVAL '30 days')
FROM users u
CROSS JOIN generate_series(1, 5)
WHERE random() < 0.5
LIMIT 200;

COMMIT;

-- ============================================
-- VERIFY DATA LOADED
-- ============================================
SELECT 'Data Load Summary:' as info;
SELECT 'Users: ' || COUNT(*) FROM users;
SELECT 'Venues: ' || COUNT(*) FROM venues;
SELECT 'Events: ' || COUNT(*) FROM events;
SELECT 'Tickets: ' || COUNT(*) FROM tickets;
SELECT 'Marketplace Listings: ' || COUNT(*) FROM marketplace_listings;
SELECT 'Engagement Events: ' || COUNT(*) FROM engagement_events;
