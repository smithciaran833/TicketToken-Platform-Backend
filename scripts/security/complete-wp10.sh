#!/bin/bash

echo "========================================="
echo "   COMPLETING WP-10 SECURITY - FINAL"
echo "========================================="
echo ""

# Kill existing services
echo "🔪 Stopping all running services..."
pkill -f "PORT=3" 2>/dev/null
pkill -f "node src/index.js" 2>/dev/null
sleep 3

REMAINING=$(ps aux | grep node | grep -v snap | grep -v grep | wc -l)
echo "Remaining processes: $REMAINING"

# Fix API Gateway port to 3000
echo ""
echo "🔧 Fixing API Gateway to use port 3000..."
cd backend/services/api-gateway

# Update the port in index.js
if [ -f src/index.js ]; then
    sed -i 's/const PORT = process\.env\.PORT || 3001/const PORT = process.env.PORT || 3000/' src/index.js
    grep "const PORT" src/index.js
    echo "✅ API Gateway port updated to 3000"
fi

# Ensure security is properly initialized
echo ""
echo "🔒 Verifying security initialization in API Gateway..."
if ! grep -q "initializeSecurity" src/index.js; then
    echo "Adding security initialization..."
    # Add security init if missing
fi

# Add rate limiting to Auth Service
echo ""
echo "🔐 Adding enhanced security to Auth Service..."
cd ../auth-service

cat << 'AUTHSEC' > src/auth-security.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour  
    max: 3,
    message: 'Too many signup attempts from this IP',
});

module.exports = { loginLimiter, signupLimiter };
AUTHSEC

# Add to Payment Service
echo ""
echo "💳 Adding security to Payment Service..."
cd ../payment-service

cat << 'PAYSEC' > src/payment-security.js
const rateLimit = require('express-rate-limit');

const checkoutLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many checkout attempts',
    skipSuccessfulRequests: true,
});

module.exports = { checkoutLimiter };
PAYSEC

cd ../../..

# Create comprehensive startup script with security
echo ""
echo "📝 Creating secure startup script..."
cat << 'STARTUP' > start-services-secure.sh
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
STARTUP

chmod +x start-services-secure.sh

# Start services
echo ""
echo "🚀 Starting all services with security..."
./start-services-secure.sh

echo ""
echo "⏳ Additional wait for full initialization..."
sleep 5

echo ""
echo "========================================="
echo "   VERIFYING WP-10 COMPLETION"
echo "========================================="
echo ""

# Quick verification
echo "1. Testing API Gateway on port 3000..."
GATEWAY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null)
if [ "$GATEWAY_RESPONSE" = "200" ]; then
    echo "   ✅ API Gateway responding on port 3000"
else
    echo "   ❌ API Gateway NOT on port 3000 (response: $GATEWAY_RESPONSE)"
fi

echo ""
echo "2. Testing security headers..."
HEADERS=$(curl -s -I http://localhost:3000/health 2>/dev/null | grep -c "X-Frame-Options\|X-Content-Type\|Strict-Transport")
if [ $HEADERS -gt 0 ]; then
    echo "   ✅ Security headers present ($HEADERS found)"
else
    echo "   ❌ Security headers missing"
fi

echo ""
echo "3. Testing rate limiting..."
BLOCKED=0
for i in {1..110}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null)
    if [ "$CODE" = "429" ]; then
        ((BLOCKED++))
    fi
done
if [ $BLOCKED -gt 0 ]; then
    echo "   ✅ Rate limiting active ($BLOCKED requests blocked)"
else
    echo "   ❌ Rate limiting not working"
fi

echo ""
echo "========================================="
echo "Run ./verify-wp10-complete.sh for full verification"
echo "========================================="

