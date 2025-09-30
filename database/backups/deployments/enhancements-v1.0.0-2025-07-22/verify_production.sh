#!/bin/bash
echo "=== Production Deployment Verification ==="
echo ""

# Check new schemas
echo "1. Verifying new schemas in production:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
ORDER BY schema_name;"

# Check migrations
echo -e "\n2. Verifying migrations applied:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT version, name, applied_at 
FROM core.schema_migrations 
WHERE version IN ('001', '002', '003', '004', '005', '006')
ORDER BY version;"

# Quick functionality test
echo -e "\n3. Testing basic functionality:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT 'Analytics Views' as test, COUNT(*) as count FROM pg_views WHERE schemaname = 'analytics_v2'
UNION ALL
SELECT 'Partnership Tables', COUNT(*) FROM information_schema.tables WHERE table_schema = 'partnerships'
UNION ALL  
SELECT 'Monitoring Tables', COUNT(*) FROM information_schema.tables WHERE table_schema = 'monitoring';"

echo -e "\n=== Verification complete ==="
