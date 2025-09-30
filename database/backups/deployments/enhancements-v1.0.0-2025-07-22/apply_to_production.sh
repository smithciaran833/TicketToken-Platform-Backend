#!/bin/bash
# Script to apply enhancements to production database

echo "=== TicketToken Database Enhancement Production Deployment ==="
echo "Target database: tickettoken_db"
echo ""
read -p "Are you sure you want to apply enhancements to PRODUCTION? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled."
    exit 1
fi

# Create fresh backup
echo "Creating production backup..."
BACKUP_FILE="database/backups/production_pre_enhancement_$(date +%Y%m%d_%H%M%S).sql"
sudo -u postgres pg_dump tickettoken_db > $BACKUP_FILE
echo "Backup created: $BACKUP_FILE"

# Apply migrations in order
MIGRATIONS=(
    "001_create_new_schemas_fixed.sql"
    "002_add_analytics_tables_complete.sql"
    "003_add_partnership_tables.sql"
    "004_add_monitoring_tables.sql"
    "005_add_international_columns.sql"
    "006_add_analytics_views_corrected.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    echo -e "\nApplying migration: $migration"
    sudo -u postgres psql -d tickettoken_db -f database/migrations/pending/$migration
    
    if [ $? -eq 0 ]; then
        echo "✅ $migration applied successfully"
        # Move to applied folder
        mv database/migrations/pending/$migration database/migrations/applied/
    else
        echo "❌ Error applying $migration"
        echo "Rolling back is recommended. Backup available at: $BACKUP_FILE"
        exit 1
    fi
done

echo -e "\n=== All enhancements applied successfully to production! ==="
