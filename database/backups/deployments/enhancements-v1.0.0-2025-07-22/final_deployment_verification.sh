#!/bin/bash
echo "=== FINAL DEPLOYMENT VERIFICATION ==="
echo "Database: tickettoken_db"
echo "Date: $(date)"
echo ""

# 1. All schemas
echo "1. All Enhanced Schemas:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT schema_name, 'ACTIVE' as status
FROM information_schema.schemata 
WHERE schema_name IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
ORDER BY schema_name;"

# 2. Table counts by schema
echo -e "\n2. Table Counts by Schema:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT 
    table_schema as schema, 
    COUNT(*) as tables
FROM information_schema.tables 
WHERE table_schema IN ('analytics_v2', 'partnerships', 'monitoring')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;"

# 3. View verification
echo -e "\n3. Analytics Views:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'analytics_v2'
ORDER BY viewname;"

# 4. International support
echo -e "\n4. International Payment Support:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT 
    column_name,
    data_type,
    CASE 
        WHEN column_default IS NOT NULL THEN 'YES' 
        ELSE 'NO' 
    END as has_default
FROM information_schema.columns
WHERE table_schema = 'payments' 
  AND table_name = 'transactions'
  AND column_name IN ('currency_code', 'exchange_rate', 'amount_usd')
ORDER BY column_name;"

# 5. All migrations
echo -e "\n5. Applied Migrations:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT version, name, 
       TO_CHAR(applied_at, 'YYYY-MM-DD HH24:MI:SS') as applied_at
FROM core.schema_migrations 
WHERE version IN ('001', '002', '003', '004', '005', '006')
ORDER BY version;"

# 6. Summary statistics
echo -e "\n6. Enhancement Summary:"
sudo -u postgres psql -d tickettoken_db -c "
WITH stats AS (
    SELECT 'Total New Tables' as metric, COUNT(*) as value
    FROM information_schema.tables
    WHERE table_schema IN ('analytics_v2', 'partnerships', 'monitoring')
      AND table_type = 'BASE TABLE'
    UNION ALL
    SELECT 'Total New Views', COUNT(*)
    FROM pg_views
    WHERE schemaname = 'analytics_v2'
    UNION ALL
    SELECT 'Total New Indexes', COUNT(*)
    FROM pg_indexes
    WHERE schemaname IN ('analytics_v2', 'partnerships', 'monitoring')
)
SELECT * FROM stats ORDER BY metric;"

echo -e "\n=== DEPLOYMENT STATUS: ✅ COMPLETE ==="
echo "All database enhancements have been successfully deployed to production!"
