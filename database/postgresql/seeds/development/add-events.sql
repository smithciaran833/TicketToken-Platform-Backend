-- ============================================
-- ADD EVENTS TO VENUES
-- ============================================

BEGIN TRANSACTION;

-- Add events for Madison Square Garden
INSERT INTO events (venue_id, name, description, event_date, start_date, end_date, status, event_type, capacity, created_by) VALUES
((SELECT id FROM venues WHERE slug = 'madison-square-garden'),
 'Taylor Swift - Eras Tour Night 1',
 'Pop superstar brings her record-breaking tour to MSG',
 '2024-06-15 20:00:00',
 '2024-06-15 19:00:00',
 '2024-06-15 23:00:00',
 'published',
 'concert',
 20000,
 (SELECT id FROM users WHERE email = 'msg@venue.com')),

((SELECT id FROM venues WHERE slug = 'madison-square-garden'),
 'NY Knicks vs Boston Celtics',
 'Eastern Conference Rivalry Game',
 '2024-05-20 19:30:00',
 '2024-05-20 18:30:00',
 '2024-05-20 22:30:00',
 'published',
 'sports',
 19812,
 (SELECT id FROM users WHERE email = 'msg@venue.com'));

-- Add events for Red Rocks
INSERT INTO events (venue_id, name, description, event_date, start_date, end_date, status, event_type, capacity, created_by) VALUES
((SELECT id FROM venues WHERE slug = 'red-rocks'),
 'Dave Matthews Band Summer Tour',
 'Annual summer performance at Red Rocks',
 '2024-07-20 19:00:00',
 '2024-07-20 17:00:00',
 '2024-07-20 23:00:00',
 'published',
 'concert',
 9525,
 (SELECT id FROM users WHERE email = 'redrocks@venue.com'));

-- Add event for The Fillmore
INSERT INTO events (venue_id, name, description, event_date, start_date, end_date, status, event_type, capacity, created_by) VALUES
((SELECT id FROM venues WHERE slug = 'the-fillmore'),
 'Local Jazz Night',
 'SF Jazz Collective performs',
 '2024-05-10 21:00:00',
 '2024-05-10 20:00:00',
 '2024-05-11 00:00:00',
 'published',
 'concert',
 2700,
 (SELECT id FROM users WHERE email = 'msg@venue.com'));

COMMIT;

-- Verify
SELECT 'Events loaded: ' || COUNT(*) FROM events;
SELECT v.name as venue, COUNT(e.id) as event_count 
FROM venues v 
LEFT JOIN events e ON v.id = e.venue_id 
GROUP BY v.name;
