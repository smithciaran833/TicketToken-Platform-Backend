-- ============================================
-- ADD TICKET TYPES FOR EVENTS
-- ============================================

BEGIN TRANSACTION;

-- Get event IDs into variables for easier reference
WITH event_ids AS (
    SELECT 
        e.id,
        e.name as event_name,
        e.capacity
    FROM events e
)

-- Taylor Swift at MSG
INSERT INTO ticket_types (event_id, name, description, price, quantity, available_quantity, max_per_purchase)
SELECT 
    id,
    tier_name,
    tier_desc,
    tier_price,
    tier_qty,
    tier_qty,
    tier_max
FROM events,
LATERAL (VALUES
    ('Floor Seats', 'Premium floor seating with best views', 450.00, 2000, 4),
    ('Lower Bowl', 'Excellent views from lower sections', 250.00, 8000, 6),
    ('Upper Bowl', 'Great atmosphere in upper sections', 125.00, 8000, 8),
    ('VIP Package', 'Floor seats with meet & greet and merchandise', 850.00, 500, 2),
    ('Obstructed View', 'Limited view seats at discounted price', 75.00, 1500, 10)
) AS tiers(tier_name, tier_desc, tier_price, tier_qty, tier_max)
WHERE events.name = 'Taylor Swift - Eras Tour Night 1';

-- NY Knicks vs Celtics at MSG
INSERT INTO ticket_types (event_id, name, description, price, quantity, available_quantity, max_per_purchase)
SELECT 
    id,
    tier_name,
    tier_desc,
    tier_price,
    tier_qty,
    tier_qty,
    tier_max
FROM events,
LATERAL (VALUES
    ('Courtside', 'Courtside seats - see the action up close', 850.00, 100, 2),
    ('Lower Bowl', 'Great views of the court', 175.00, 7000, 8),
    ('Upper Bowl', 'Affordable seats with good views', 75.00, 10000, 10),
    ('Club Seats', 'Premium seats with lounge access', 350.00, 2000, 4),
    ('Standing Room', 'Standing room only tickets', 35.00, 712, 10)
) AS tiers(tier_name, tier_desc, tier_price, tier_qty, tier_max)
WHERE events.name = 'NY Knicks vs Boston Celtics';

-- Dave Matthews Band at Red Rocks
INSERT INTO ticket_types (event_id, name, description, price, quantity, available_quantity, max_per_purchase)
SELECT 
    id,
    tier_name,
    tier_desc,
    tier_price,
    tier_qty,
    tier_qty,
    tier_max
FROM events,
LATERAL (VALUES
    ('General Admission', 'Open seating - first come first served', 125.00, 7000, 8),
    ('Reserved Seating', 'Assigned seats in prime viewing areas', 165.00, 2000, 6),
    ('VIP Experience', 'Reserved seats with backstage tour', 350.00, 525, 4)
) AS tiers(tier_name, tier_desc, tier_price, tier_qty, tier_max)
WHERE events.name = 'Dave Matthews Band Summer Tour';

-- Jazz Night at The Fillmore
INSERT INTO ticket_types (event_id, name, description, price, quantity, available_quantity, max_per_purchase)
SELECT 
    id,
    tier_name,
    tier_desc,
    tier_price,
    tier_qty,
    tier_qty,
    tier_max
FROM events,
LATERAL (VALUES
    ('General Admission', 'Standing room on main floor', 45.00, 2000, 10),
    ('Balcony Seating', 'Reserved balcony seats', 65.00, 500, 6),
    ('VIP Table', 'Table for 4 with bottle service', 500.00, 50, 1)
) AS tiers(tier_name, tier_desc, tier_price, tier_qty, tier_max)
WHERE events.name = 'Local Jazz Night';

COMMIT;

-- Verify ticket types created
SELECT 
    e.name as event,
    COUNT(tt.id) as ticket_types,
    SUM(tt.quantity) as total_capacity,
    MIN(tt.price) as min_price,
    MAX(tt.price) as max_price
FROM events e
LEFT JOIN ticket_types tt ON e.id = tt.event_id
GROUP BY e.name
ORDER BY e.name;
