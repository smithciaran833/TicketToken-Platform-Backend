#!/bin/bash
# Run all migrations on the database

DB="${1:-tickettoken_db}"
echo "Running migrations on database: $DB"

for migration in $(ls database/postgresql/migrations/*.sql | sort); do
    echo "Running: $(basename $migration)"
    PGPASSWORD='TicketToken2024Secure!' psql -h localhost -p 5432 -U postgres -d "$DB" -f "$migration"
done

echo "All migrations complete"
