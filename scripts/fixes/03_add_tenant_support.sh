#!/bin/bash
# Add tenant_id column to all schema files

set -euo pipefail

echo "Adding tenant support to all tables..."

# Function to add tenant_id to a file
add_tenant_to_file() {
    local file=$1
    echo "Adding tenant_id to: $file"
    
    # Check if tenant_id already exists
    if grep -q "tenant_id UUID" "$file"; then
        echo "  tenant_id already exists in $file, skipping..."
        return
    fi
    
    # Add tenant_id after the id column
    # This looks for "id UUID PRIMARY KEY" and adds tenant_id on the next line
    sed -i '/id UUID PRIMARY KEY/a\    tenant_id UUID,' "$file"
    
    # Add tenant indexes before the last line of the file
    # Find the last occurrence of CREATE INDEX and add after it
    sed -i '$i\
\
-- Tenant isolation indexes\
CREATE INDEX IF NOT EXISTS idx_'$(basename "$file" .sql)'_tenant_id ON '$(basename "$file" .sql)'(tenant_id) WHERE tenant_id IS NOT NULL;\
CREATE INDEX IF NOT EXISTS idx_'$(basename "$file" .sql)'_tenant_created ON '$(basename "$file" .sql)'(tenant_id, created_at) WHERE tenant_id IS NOT NULL;' "$file"
}

# Process all schema files
find database/postgresql/schemas -name "*.sql" -type f | while read -r file; do
    # Skip audit_logs.sql as it will be handled differently (partitioned)
    if [[ ! "$file" =~ "audit_logs.sql" ]]; then
        add_tenant_to_file "$file"
    fi
done

echo "Tenant support addition complete!"
