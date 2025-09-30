#!/bin/bash

echo "==================================="
echo "COMPLETE SYSTEM ANALYSIS"
echo "==================================="

# 1. Database Schema Analysis
echo -e "\n=== DATABASE TABLES AND RELATIONSHIPS ==="
docker exec tickettoken-postgres psql -U postgres -d tickettoken_db -c "
SELECT 
    t.table_name,
    COUNT(c.column_name) as columns,
    string_agg(
        CASE 
            WHEN c.column_name LIKE '%_id' THEN c.column_name 
            ELSE NULL 
        END, ', '
    ) as foreign_keys
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;" 

# 2. Service Dependencies
echo -e "\n=== SERVICE DEPENDENCIES ==="
for service in auth venue event ticket payment notification scanning order; do
    echo -e "\n--- $service-service ---"
    echo "Environment expectations:"
    docker exec tickettoken-$service env | grep -E "SERVICE_URL|DB_|REDIS_|RABBITMQ_" | head -10
done

# 3. API Endpoints per Service
echo -e "\n=== AVAILABLE API ENDPOINTS ==="
for service in auth venue event ticket payment notification scanning order; do
    echo -e "\n--- $service-service routes ---"
    docker exec tickettoken-$service find . -name "*route*.js" -o -name "*route*.ts" 2>/dev/null | while read file; do
        docker exec tickettoken-$service grep -E "router\.(get|post|put|delete|patch)" "$file" 2>/dev/null | sed 's/.*router\./  /' | head -10
    done
done

# 4. Check what queues/topics exist
echo -e "\n=== RABBITMQ QUEUES ==="
docker exec tickettoken-rabbitmq rabbitmqctl list_queues name messages consumers 2>/dev/null

# 5. Redis keys pattern
echo -e "\n=== REDIS KEY PATTERNS ==="
docker exec tickettoken-redis redis-cli --scan --pattern "*" | head -20

# 6. Check for seed data
echo -e "\n=== DATABASE SAMPLE DATA ==="
docker exec tickettoken-postgres psql -U postgres -d tickettoken_db -c "
SELECT 
    'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'venues', COUNT(*) FROM venues
UNION ALL  
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'tickets', COUNT(*) FROM tickets
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;"

