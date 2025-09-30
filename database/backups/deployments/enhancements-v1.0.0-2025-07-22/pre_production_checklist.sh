#!/bin/bash
echo "=== Pre-Production Deployment Checklist ==="
echo ""

# Check disk space
echo "1. Checking disk space:"
df -h | grep -E "(Filesystem|/$)"

# Check current connections
echo -e "\n2. Current database connections:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT COUNT(*) as active_connections 
FROM pg_stat_activity 
WHERE datname = 'tickettoken_db' 
  AND state = 'active';"

# Verify backup exists
echo -e "\n3. Recent backups:"
ls -lh database/backups/ | tail -5

# Check if production has same structure as test
echo -e "\n4. Comparing production vs test schemas:"
sudo -u postgres psql -d tickettoken_db -c "
SELECT COUNT(*) as prod_schemas FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%';"

sudo -u postgres psql -d tickettoken_test -c "
SELECT COUNT(*) as test_schemas FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%';"

echo -e "\n5. Ready for deployment? Check all items:"
echo "   [ ] Backup completed and verified"
echo "   [ ] Low database activity (few active connections)"
echo "   [ ] Sufficient disk space (>10GB free)"
echo "   [ ] Team notified of deployment"
echo "   [ ] Rollback script tested"
