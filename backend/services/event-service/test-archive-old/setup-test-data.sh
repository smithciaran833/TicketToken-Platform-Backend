#!/bin/bash

echo "Setting up test data for event-service integration tests..."

# Database connection details from .env or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"

# Run the SQL script
PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f ~/Desktop/TicketToken-Platform/backend/services/event-service/tests/setup-test-data.sql

if [ $? -eq 0 ]; then
  echo "✅ Test data setup complete!"
else
  echo "❌ Failed to setup test data"
  exit 1
fi
