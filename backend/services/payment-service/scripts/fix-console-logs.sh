#!/bin/bash

# Script to replace console.log/error/warn/info with logger equivalents
# Runs in the src/ directory

echo "Fixing console.log statements in payment-service..."

# Find all TypeScript files in src/ (excluding node_modules, dist, tests)
find src/ -type f -name "*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*" | while read file; do
    # Skip if file already uses logger import at top
    if grep -q "^import.*logger.*from.*utils/logger" "$file"; then
        echo "Processing: $file (logger already imported)"
    elif grep -q "console\.\(log\|error\|warn\|info\)" "$file"; then
        echo "Processing: $file (adding logger import)"
        # Add logger import after other imports
        sed -i '1a import { logger } from '\''../utils/logger'\'';' "$file" 2>/dev/null || \
        sed -i '1a import { logger } from '\''./utils/logger'\'';' "$file" 2>/dev/null || \
        sed -i '1a import { logger } from '\''../../utils/logger'\'';' "$file" 2>/dev/null
    fi
    
    # Replace console statements (basic replacements)
    sed -i 's/console\.log(/logger.info(/g' "$file"
    sed -i 's/console\.error(/logger.error(/g' "$file"
    sed -i 's/console\.warn(/logger.warn(/g' "$file"
    sed -i 's/console\.info(/logger.info(/g' "$file"
done

echo "Done! Please review the changes and test the service."
