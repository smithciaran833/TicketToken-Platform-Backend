-- ============================================
-- DATABASE STATUS SUMMARY
-- ============================================

\echo '==========================================';
\echo 'TICKETTOKEN DATABASE STATUS';
\echo '==========================================';
\echo '';

\echo '📊 CORE TABLES SUMMARY:';
\echo '-----------------------';
SELECT 
    'Users' as table_name, COUNT(*) as count, 
    COUNT(CASE WHEN role = 'venue_owner' THEN 1 END) as venue_owners,
    COUNT(CASE WHEN role = 'user' THEN 1 END) as customers,
    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins
FROM users
UNION ALL
SELECT 'Venues', COUNT(*), 
    COUNT(CASE WHEN onboarding_status = 'verified' THEN 1 END),
    NULL, NULL
FROM venues
UNION ALL
SELECT 'Events', COUNT(*), 
    COUNT(CASE WHEN status = 'published' THEN 1 END),
    COUNT(CASE WHEN status = 'draft' THEN 1 END),
    NULL
FROM events
UNION ALL
SELECT 'Ticket Types', COUNT(*), 
    SUM(quantity), SUM(sold_count), SUM(available_quantity)
FROM ticket_types
UNION ALL
SELECT 'Tickets Sold', COUNT(*), 
    COUNT(CASE WHEN status = 'valid' THEN 1 END),
    COUNT(CASE WHEN status = 'used' THEN 1 END),
    NULL
FROM tickets;

\echo '';
\echo '💰 REVENUE SUMMARY:';
\echo '-------------------';
SELECT 
    'Total Revenue' as metric,
    '$' || COALESCE(SUM(price), 0)::money::text as value
FROM tickets
UNION ALL
SELECT 
    'Average Ticket Price',
    '$' || COALESCE(AVG(price), 0)::money::text
FROM tickets
UNION ALL
SELECT 
    'Tickets Available',
    SUM(available_quantity)::text
FROM ticket_types;

\echo '';
\echo '🎭 EVENTS BY VENUE:';
\echo '-------------------';
SELECT 
    v.name as venue,
    COUNT(DISTINCT e.id) as events,
    COUNT(DISTINCT tt.id) as ticket_types,
    SUM(tt.quantity) as total_capacity,
    SUM(tt.sold_count) as tickets_sold,
    '$' || COALESCE(SUM(t.price), 0)::money::text as revenue
FROM venues v
LEFT JOIN events e ON v.id = e.venue_id
LEFT JOIN ticket_types tt ON e.id = tt.event_id
LEFT JOIN tickets t ON tt.id = t.ticket_type_id
GROUP BY v.name
ORDER BY v.name;

\echo '';
\echo '🎫 TOP SELLING EVENTS:';
\echo '----------------------';
SELECT 
    e.name as event,
    v.name as venue,
    COUNT(t.id) as tickets_sold,
    '$' || SUM(t.price)::money::text as revenue
FROM events e
JOIN venues v ON e.venue_id = v.id
LEFT JOIN tickets t ON e.id = t.event_id
GROUP BY e.name, v.name
HAVING COUNT(t.id) > 0
ORDER BY COUNT(t.id) DESC;

\echo '';
\echo '✅ DATABASE FUNCTIONS:';
\echo '----------------------';
SELECT 
    routine_name as function_name,
    routine_type as type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name NOT LIKE 'pg_%'
ORDER BY routine_name;

\echo '';
\echo '📈 SYSTEM TABLES COUNT:';
\echo '-----------------------';
SELECT COUNT(*) || ' total tables' as tables_in_database
FROM information_schema.tables 
WHERE table_schema = 'public';

