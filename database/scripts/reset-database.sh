#!/bin/bash
# Reset database to fresh state

DB="${1:-tickettoken_db}"
echo "WARNING: This will drop and recreate database: $DB"
read -p "Continue? (y/n): " confirm

if [ "$confirm" != "y" ]; then
    echo "Cancelled"
    exit 0
fi

echo "Dropping database..."
PGPASSWORD='TicketToken2024Secure!' dropdb -h localhost -p 5432 -U postgres "$DB"

echo "Creating database..."
PGPASSWORD='TicketToken2024Secure!' createdb -h localhost -p 5432 -U postgres "$DB"

echo "Running migrations..."
./database/scripts/run-migrations.sh "$DB"

echo "Database reset complete"
