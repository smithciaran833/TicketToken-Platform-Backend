#!/bin/bash
echo "=== Verifying Database Enhancements ==="

# Check new schemas exist
echo -e "\n1. Checking new schemas:"
sudo -u postgres psql -d tickettoken_test -c "
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
ORDER BY schema_name;"

# Check table counts in new schemas
echo -e "\n2. Checking tables in new schemas:"
sudo -u postgres psql -d tickettoken_test -c "
SELECT 
    table_schema, 
    COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;"

# Check views in analytics_v2
echo -e "\n3. Checking views in analytics_v2:"
sudo -u postgres psql -d tickettoken_test -c "
SELECT 
    schemaname,
    viewname
FROM pg_views 
WHERE schemaname = 'analytics_v2'
ORDER BY viewname;"

# Check international columns were added
echo -e "\n4. Checking international columns in payments.transactions:"
sudo -u postgres psql -d tickettoken_test -c "
SELECT 
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'payments' 
  AND table_name = 'transactions'
  AND column_name IN ('currency_code', 'exchange_rate', 'amount_usd')
ORDER BY column_name;"

# Check migrations table
echo -e "\n5. Checking applied migrations:"
sudo -u postgres psql -d tickettoken_test -c "
SELECT version, name, applied_at 
FROM core.schema_migrations 
ORDER BY version;"

# Summary of all objects created
echo -e "\n6. Summary of all new objects:"
sudo -u postgres psql -d tickettoken_test -c "
WITH new_objects AS (
    SELECT 'Table' as object_type, table_schema as schema, table_name as object_name
    FROM information_schema.tables
    WHERE table_schema IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
      AND table_type = 'BASE TABLE'
    UNION ALL
    SELECT 'View' as object_type, schemaname as schema, viewname as object_name
    FROM pg_views
    WHERE schemaname IN ('analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations')
)
SELECT 
    schema,
    object_type,
    COUNT(*) as count
FROM new_objects
GROUP BY schema, object_type
ORDER BY schema, object_type;"

echo -e "\n=== Enhancement verification complete ==="
