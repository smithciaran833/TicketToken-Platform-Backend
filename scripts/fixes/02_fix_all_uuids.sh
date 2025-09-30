#!/bin/bash
# Fix all UUID generation functions across all files

set -euo pipefail

echo "Starting UUID fix across all database files..."

# Function to fix UUIDs in a file
fix_uuids_in_file() {
    local file=$1
    echo "Processing: $file"
    
    # Create backup
    cp "$file" "$file.backup"
    
    # Replace uuid_generate_v4() with uuid_generate_v1()
    sed -i 's/uuid_generate_v4()/uuid_generate_v1()/g' "$file"
    
    # Ensure extension is created (add if not present at the top after initial comments)
    if ! grep -q "uuid-ossp" "$file"; then
        # Add at the beginning of the file after initial comments
        sed -i '/^-- =/,/^-- =/!b; /^-- =/a\
\
-- Ensure UUID extension is available\
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\
' "$file"
    fi
}

# Fix all schema files
echo "Fixing schema files..."
find database/postgresql/schemas -name "*.sql" -type f | while read -r file; do
    fix_uuids_in_file "$file"
done

# Fix all migration files
echo "Fixing migration files..."
if [ -d "database/postgresql/migrations" ]; then
    find database/postgresql/migrations -name "*.sql" -type f | while read -r file; do
        fix_uuids_in_file "$file"
    done
fi

echo "UUID fix complete!"
echo "Backup files created with .backup extension"
