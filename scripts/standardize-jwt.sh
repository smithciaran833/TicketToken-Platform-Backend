#!/bin/bash

# Use a consistent JWT secret for all services
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

echo "Standardizing JWT secrets across all services..."

# Update all services to use the same JWT_ACCESS_SECRET
docker exec -e JWT_ACCESS_SECRET="$JWT_SECRET" tickettoken-ticket sh -c 'echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET" >> /app/.env'
docker exec -e JWT_ACCESS_SECRET="$JWT_SECRET" tickettoken-auth sh -c 'echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET" >> /app/.env'
docker exec -e JWT_ACCESS_SECRET="$JWT_SECRET" tickettoken-venue sh -c 'echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET" >> /app/.env'
docker exec -e JWT_ACCESS_SECRET="$JWT_SECRET" tickettoken-event sh -c 'echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET" >> /app/.env'

# Restart services to pick up the new secret
docker-compose restart ticket auth venue event

echo "Services restarted. Waiting for them to be ready..."
sleep 10

# Verify services are healthy
curl -s http://localhost:3001/health | grep -q "healthy" && echo "✓ Auth service healthy"
curl -s http://localhost:3004/health | grep -q "healthy" && echo "✓ Ticket service healthy"

echo "Done. JWT secrets standardized."
