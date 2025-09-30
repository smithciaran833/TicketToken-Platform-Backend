-- ============================================
-- ADD SAMPLE TICKET PURCHASES
-- ============================================

BEGIN TRANSACTION;

-- Create a function to generate unique QR codes
CREATE OR REPLACE FUNCTION generate_qr_code() RETURNS VARCHAR AS $$
BEGIN
    RETURN 'QR_' || md5(random()::text || clock_timestamp()::text)::varchar;
END;
$$ LANGUAGE plpgsql;

-- Customer purchases for Taylor Swift
INSERT INTO tickets (event_id, user_id, ticket_type_id, price, seat_number, qr_code, status)
SELECT 
    tt.event_id,
    u.id,
    tt.id,
    tt.price,
    'SEC-' || (floor(random() * 100) + 1) || '-SEAT-' || (floor(random() * 50) + 1),
    generate_qr_code(),
    'valid'
FROM ticket_types tt
CROSS JOIN users u
WHERE u.email IN ('customer1@gmail.com', 'customer2@gmail.com')
AND tt.name = 'Upper Bowl'
AND tt.event_id = (SELECT id FROM events WHERE name = 'Taylor Swift - Eras Tour Night 1')
LIMIT 4;

-- Customer purchases for Knicks game
INSERT INTO tickets (event_id, user_id, ticket_type_id, price, seat_number, qr_code, status)
SELECT 
    tt.event_id,
    u.id,
    tt.id,
    tt.price,
    'SEC-' || (floor(random() * 200) + 100) || '-SEAT-' || (floor(random() * 30) + 1),
    generate_qr_code(),
    'valid'
FROM ticket_types tt
CROSS JOIN users u
WHERE u.email = 'customer3@gmail.com'
AND tt.name = 'Lower Bowl'
AND tt.event_id = (SELECT id FROM events WHERE name = 'NY Knicks vs Boston Celtics')
LIMIT 2;

-- Update ticket type quantities after purchases
UPDATE ticket_types tt
SET 
    available_quantity = available_quantity - purchased.count,
    sold_count = COALESCE(sold_count, 0) + purchased.count
FROM (
    SELECT ticket_type_id, COUNT(*) as count
    FROM tickets
    GROUP BY ticket_type_id
) purchased
WHERE tt.id = purchased.ticket_type_id;

COMMIT;

-- Verify ticket purchases
SELECT 
    u.email as customer,
    e.name as event,
    tt.name as ticket_type,
    COUNT(t.id) as tickets_purchased,
    SUM(t.price) as total_spent
FROM tickets t
JOIN users u ON t.user_id = u.id
JOIN events e ON t.event_id = e.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
GROUP BY u.email, e.name, tt.name
ORDER BY u.email, e.name;

-- Show updated availability
SELECT 
    e.name as event,
    tt.name as ticket_type,
    tt.quantity as total_seats,
    tt.sold_count as sold,
    tt.available_quantity as available
FROM ticket_types tt
JOIN events e ON tt.event_id = e.id
WHERE tt.sold_count > 0
ORDER BY e.name, tt.name;
