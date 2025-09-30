#!/bin/bash
set -e

echo "🚀 Starting staging environment..."

# Check if .env.staging exists
if [ ! -f .env.staging ]; then
  echo "❌ .env.staging not found! Please create it from .env.example"
  exit 1
fi

# Export variables from .env.staging
set -a
source .env.staging
set +a

# Check for required Stripe keys
if [[ "$STRIPE_SECRET_KEY" == *"your_key_here"* ]]; then
  echo "⚠️  Warning: Stripe keys are still placeholders in .env.staging"
  echo "   Please add real test keys for payment testing"
fi

# Start infrastructure first
echo "🏗️ Starting infrastructure services..."
docker-compose up -d postgres redis rabbitmq

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until docker exec tickettoken-postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

# Create staging database if it doesn't exist
docker exec tickettoken-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'tickettoken_staging'" | grep -q 1 || \
  docker exec tickettoken-postgres psql -U postgres -c "CREATE DATABASE tickettoken_staging"
echo "✅ Database 'tickettoken_staging' exists"

# Apply migrations
echo "🗃️ Applying migrations..."
for migration in database/postgresql/migrations/*.sql; do
  if [ -f "$migration" ]; then
    echo "  Applying $(basename $migration)..."
    docker exec -i tickettoken-postgres psql -U postgres -d tickettoken_staging < "$migration" 2>/dev/null || true
  fi
done

# Start monitoring stack
echo "📊 Starting monitoring services..."
docker-compose -f docker-compose.monitoring.yml up -d

# Start application services with staging overlay
echo "🚀 Starting application services..."
docker-compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check gateway health
if curl -s http://localhost:3000/ready > /dev/null 2>&1; then
  echo "✅ API Gateway is ready"
else
  echo "⚠️  API Gateway not responding yet"
fi

# Show status
echo ""
echo "✅ Staging environment is running!"
echo ""
docker-compose -f docker-compose.yml -f docker-compose.staging.yml ps
echo ""
echo "📝 Services available at:"
echo "  - API Gateway: http://localhost:3000"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana: http://localhost:3031 (admin/admin)"
echo "  - RabbitMQ: http://localhost:15672 (admin/admin)"
echo "  - PostgreSQL: localhost:5432 (postgres/postgres)"
echo "  - Redis: localhost:6379"
echo ""
echo "Run './scripts/staging-logs.sh' to view logs"
echo "Run './scripts/staging-down.sh' to stop everything"
