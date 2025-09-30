#!/bin/bash
# Create monthly partitions for the next 3 months

set -euo pipefail

# Load environment variables
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# PostgreSQL connection
PSQL="PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME"

# Function to create partition
create_partition() {
    local table=$1
    local year=$2
    local month=$3
    local next_month=$4
    local next_year=$year
    
    if [ $next_month -eq 13 ]; then
        next_month=1
        next_year=$((year + 1))
    fi
    
    local partition_name="${table}_${year}_$(printf %02d $month)"
    local start_date="${year}-$(printf %02d $month)-01"
    local end_date="${next_year}-$(printf %02d $next_month)-01"
    
    echo "Creating partition: $partition_name"
    
    $PSQL << SQL
    CREATE TABLE IF NOT EXISTS $partition_name 
    PARTITION OF $table
    FOR VALUES FROM ('$start_date') TO ('$end_date');
SQL
}

# Get current date
current_year=$(date +%Y)
current_month=$(date +%m)

# Tables to partition
tables="audit_logs tickets transactions user_sessions"

# Create partitions for next 3 months
for table in $tables; do
    echo "Creating partitions for $table..."
    
    for i in 0 1 2; do
        month=$((current_month + i))
        year=$current_year
        
        if [ $month -gt 12 ]; then
            month=$((month - 12))
            year=$((current_year + 1))
        fi
        
        next_month=$((month + 1))
        create_partition "$table" "$year" "$month" "$next_month"
    done
done

echo "Partition creation complete!"
