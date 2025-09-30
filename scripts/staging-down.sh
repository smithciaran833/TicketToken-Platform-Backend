#!/bin/bash
set -e

echo "🛑 Stopping staging environment..."

# Stop application services
docker-compose -f docker-compose.yml -f docker-compose.staging.yml down

# Stop monitoring
docker-compose -f docker-compose.monitoring.yml down

echo "✅ Staging environment stopped"
