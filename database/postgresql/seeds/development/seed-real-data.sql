-- ============================================
-- SEED DATA - FIXED DELETE ORDER
-- ============================================

BEGIN TRANSACTION;

-- Clear in correct order (most dependent first)
DELETE FROM marketplace_listings;
DELETE FROM tickets;
DELETE FROM ticket_reservations;
DELETE FROM ticket_types;
DELETE FROM events;
DELETE FROM venue_staff;
DELETE FROM venues;
DELETE FROM users WHERE email NOT IN ('admin@tickettoken.com');

-- ============================================
-- 1. USERS
-- ============================================
INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified, phone) VALUES
('msg@venue.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'James', 'Dolan', 'venue_owner', true, '+12124656741'),
('redrocks@venue.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Brian', 'Kitts', 'venue_owner', true, '+13036972787'),
('customer1@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'John', 'Smith', 'user', true, '+15551234567'),
('customer2@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Jane', 'Doe', 'user', true, '+15551234568'),
('customer3@gmail.com', '$2b$10$K7L1OJ0TfgF5VZB5VZB5VZB5', 'Bob', 'Wilson', 'user', true, '+15551234569');

-- ============================================
-- 2. VENUES
-- ============================================
INSERT INTO venues (name, type, capacity, address, settings, slug, onboarding_status) VALUES
('Madison Square Garden', 'arena', 20789,
 '{"street": "4 Pennsylvania Plaza", "city": "New York", "state": "NY", "zip": "10001", "country": "USA"}'::jsonb,
 '{"contact_email": "info@msg.com", "phone": "+12124656741"}'::jsonb,
 'madison-square-garden', 'verified'),

('Red Rocks Amphitheatre', 'amphitheatre', 9525,
 '{"street": "18300 W Alameda Pkwy", "city": "Morrison", "state": "CO", "zip": "80465", "country": "USA"}'::jsonb,
 '{"contact_email": "info@redrocks.com", "phone": "+17206972787"}'::jsonb,
 'red-rocks', 'verified'),

('The Fillmore', 'club', 2700,
 '{"street": "1805 Geary Blvd", "city": "San Francisco", "state": "CA", "zip": "94115", "country": "USA"}'::jsonb,
 '{"contact_email": "info@fillmore.com", "phone": "+14153466000"}'::jsonb,
 'the-fillmore', 'verified');

COMMIT;

-- Verify
SELECT 'Users loaded: ' || COUNT(*) FROM users;
SELECT 'Venues loaded: ' || COUNT(*) FROM venues;
