#!/bin/bash
# Usage: ./create-migration.sh "description"

if [ -z "$1" ]; then
    echo "Usage: $0 'migration description'"
    exit 1
fi

# Get next migration number
LAST_NUM=$(ls database/postgresql/migrations/*.sql 2>/dev/null | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort -n | tail -1)
NEXT_NUM=$(printf "%03d" $((10#$LAST_NUM + 1)))

# Create filename
FILENAME="database/postgresql/migrations/${NEXT_NUM}_${1// /_}.sql"

# Create migration file
cat << MIGRATION > "$FILENAME"
-- Migration: ${NEXT_NUM}_${1// /_}.sql
-- Created: $(date)
-- Description: $1

-- Add your SQL here

MIGRATION

echo "Created: $FILENAME"
