#!/bin/bash
set -e

echo "🎭 Basic E2E Test"
echo "=================="

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 10

# Test database connection
echo "✓ Testing database connection..."
docker exec tickettoken-postgres psql -U postgres -d tickettoken_staging -c "SELECT version();" > /dev/null

# Test Redis
echo "✓ Testing Redis..."
docker exec tickettoken-redis redis-cli ping > /dev/null

# Test RabbitMQ
echo "✓ Testing RabbitMQ..."
curl -s -u admin:admin http://localhost:15672/api/overview > /dev/null

# Create test data
echo "📦 Creating test data..."
docker exec -i tickettoken-postgres psql -U postgres -d tickettoken_staging << 'SQL'
-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS venues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255),
    capacity INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    venue_id UUID REFERENCES venues(id),
    name VARCHAR(255),
    starts_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test data
INSERT INTO venues (name, capacity) 
VALUES ('Test Venue', 1000)
ON CONFLICT DO NOTHING;

INSERT INTO events (venue_id, name, starts_at)
SELECT id, 'Test Event', NOW() + INTERVAL '1 day'
FROM venues 
WHERE name = 'Test Venue'
ON CONFLICT DO NOTHING;

-- Verify
SELECT COUNT(*) as venue_count FROM venues;
SELECT COUNT(*) as event_count FROM events;
SQL

echo ""
echo "✅ Basic E2E Test Complete!"
echo ""
echo "Next steps:"
echo "1. Install Stripe CLI: https://stripe.com/docs/stripe-cli"
echo "2. Configure your .env file with real Stripe test keys"
echo "3. Run the full E2E test when services are properly configured"
