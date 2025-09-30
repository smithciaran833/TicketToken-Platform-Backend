#!/bin/bash
# Fix UUID generation functions properly

set -euo pipefail

echo "Fixing UUID generation functions properly..."

# Function to fix UUIDs in a file
fix_uuid_in_file() {
    local file=$1
    echo "Fixing: $file"
    
    # Replace all uuid_generate_v4() with uuid_generate_v1()
    # Use word boundaries to ensure exact match
    sed -i 's/\buuid_generate_v4()/uuid_generate_v1()/g' "$file"
    
    # Also fix any DEFAULT gen_random_uuid() if present
    sed -i 's/\bgen_random_uuid()/uuid_generate_v1()/g' "$file"
}

# Fix all schema files
echo "Processing schema files..."
find database/postgresql/schemas -name "*.sql" -type f | while read -r file; do
    fix_uuid_in_file "$file"
done

# Fix all migration files
echo "Processing migration files..."
find database/postgresql/migrations -name "*.sql" -type f | while read -r file; do
    fix_uuid_in_file "$file"
done

echo "UUID fix complete!"

# Verify the fix
echo -e "\nVerifying fix..."
v4_count=$(grep -r "uuid_generate_v4()" database/postgresql/ | wc -l)
v1_count=$(grep -r "uuid_generate_v1()" database/postgresql/ | wc -l)
echo "uuid_generate_v4(): $v4_count occurrences"
echo "uuid_generate_v1(): $v1_count occurrences"
