#!/bin/bash
echo "Waiting for PostgreSQL to be ready..."
until docker exec tickettoken-postgres pg_isready -U postgres > /dev/null 2>&1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is ready!"
