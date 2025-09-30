#!/bin/bash

echo "Starting services with SECURITY ENABLED..."

# Set security environment variables
export SECURITY_ENABLED=true
export JWT_ACCESS_TOKEN_EXPIRY=15m
export JWT_REFRESH_TOKEN_EXPIRY=7d
export RATE_LIMIT_ENABLED=true

# Start API Gateway on 3000
cd backend/services/api-gateway
PORT=3000 node src/index.js > /tmp/api-gateway.log 2>&1 &
echo "✅ API Gateway starting on port 3000..."
cd ../../..

# Start Auth Service on 3001
cd backend/services/auth-service  
PORT=3001 node src/index.js > /tmp/auth-service.log 2>&1 &
echo "✅ Auth Service starting on port 3001..."
cd ../../..

# Start other critical services
cd backend/services/venue-service
PORT=3002 node src/index.js > /tmp/venue-service.log 2>&1 &
echo "✅ Venue Service starting on port 3002..."
cd ../../..

cd backend/services/event-service
PORT=3006 node src/index.js > /tmp/event-service.log 2>&1 &
echo "✅ Event Service starting on port 3006..."
cd ../../..

cd backend/services/payment-service
PORT=3008 node src/index.js > /tmp/payment-service.log 2>&1 &
echo "✅ Payment Service starting on port 3008..."
cd ../../..

cd backend/services/order-service
PORT=3007 node src/index.js > /tmp/order-service.log 2>&1 &
echo "✅ Order Service starting on port 3007..."
cd ../../..

echo ""
echo "Services started. Waiting for initialization..."
sleep 10

# Verify services
echo ""
echo "Verifying services..."
for port in 3000 3001 3002 3006 3007 3008; do
    if curl -s -o /dev/null http://localhost:$port/health; then
        echo "✅ Port $port responding"
    else
        echo "❌ Port $port not responding"
    fi
done
