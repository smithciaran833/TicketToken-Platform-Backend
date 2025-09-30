#!/bin/bash
echo "Running Smoke Tests..."
curl -s http://localhost:3000/health > /dev/null && echo "✓ API Health" || echo "✗ API Health"
PGPASSWORD=TicketToken2024Secure! psql -U postgres -d tickettoken -c "SELECT 1" > /dev/null 2>&1 && echo "✓ Database" || echo "✗ Database"
