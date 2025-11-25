#!/bin/bash

echo "Fixing database port defaults in all services..."

# Fix all config/index.ts files
find ~/Desktop/TicketToken-Platform/backend/services -path "*/src/config/index.ts" -type f | while read file; do
  echo "Fixing: $file"
  sed -i "s/DB_PORT || '5432'/DB_PORT || '6432'/g" "$file"
  sed -i 's/DB_PORT || "5432"/DB_PORT || "6432"/g' "$file"
done

# Fix all knexfile.ts files  
find ~/Desktop/TicketToken-Platform/backend/services -name "knexfile.ts" -type f | while read file; do
  echo "Fixing: $file"
  sed -i "s/DB_PORT || '5432'/DB_PORT || '6432'/g" "$file"
  sed -i 's/DB_PORT || "5432"/DB_PORT || "6432"/g' "$file"
done

# Fix all database.ts files
find ~/Desktop/TicketToken-Platform/backend/services -path "*/src/config/database.ts" -type f | while read file; do
  echo "Fixing: $file"
  sed -i "s/DB_PORT || '5432'/DB_PORT || '6432'/g" "$file"
  sed -i 's/DB_PORT || "5432"/DB_PORT || "6432"/g' "$file"
done

echo "Done! All database ports now default to 6432 (PgBouncer)"
