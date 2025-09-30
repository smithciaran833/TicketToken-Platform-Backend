-- Insert test users
INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES
('admin@tickettoken.com', '$2b$10$YourHashHere', 'Admin', 'User', 'admin'),
('venue1@test.com', '$2b$10$YourHashHere', 'John', 'Venue', 'venue_owner'),
('venue2@test.com', '$2b$10$YourHashHere', 'Jane', 'Arena', 'venue_owner'),
('customer1@test.com', '$2b$10$YourHashHere', 'Bob', 'Customer', 'user'),
('customer2@test.com', '$2b$10$YourHashHere', 'Alice', 'Buyer', 'user');

-- Insert test venues
INSERT INTO venues (name, capacity, address, city, state, zip, country) VALUES
('Madison Square Garden', 20000, '4 Pennsylvania Plaza', 'New York', 'NY', '10001', 'USA'),
('Red Rocks Amphitheatre', 9525, '18300 W Alameda Pkwy', 'Morrison', 'CO', '80465', 'USA'),
('The Fillmore', 2700, '1805 Geary Blvd', 'San Francisco', 'CA', '94115', 'USA');

-- Insert test events
INSERT INTO events (venue_id, name, date, total_tickets, available_tickets, price) VALUES
((SELECT id FROM venues WHERE name = 'Madison Square Garden'), 'Taylor Swift - Eras Tour', '2024-06-15 20:00:00', 20000, 20000, 250.00),
((SELECT id FROM venues WHERE name = 'Red Rocks'), 'Dave Matthews Band', '2024-07-20 19:30:00', 9525, 9525, 125.00),
((SELECT id FROM venues WHERE name = 'The Fillmore'), 'Local Jazz Night', '2024-05-10 21:00:00', 2700, 2700, 45.00);

-- Add more test data for other tables...
