#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Payment Service Endpoint Tests ===${NC}\n"

# 1. Health checks
echo -e "${YELLOW}1. Testing health endpoints...${NC}"
curl -s http://localhost:3006/health | jq '.'
curl -s http://localhost:3006/health/db | jq '.'
echo ""

# 2. Test without auth (should fail)
echo -e "${YELLOW}2. Testing protected endpoint without auth (should fail)...${NC}"
curl -s -X POST http://localhost:3006/payments/calculate-fees \
  -H "Content-Type: application/json" \
  -d '{"venueId": "venue123", "amount": 100, "ticketCount": 2}' | jq '.'
echo ""

# 3. Generate a test JWT token
echo -e "${YELLOW}3. Generating test JWT token...${NC}"
node << 'NODESCRIPT'
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(process.env.HOME, 'tickettoken-secrets', 'jwt-private.pem'), 'utf8');

const token = jwt.sign(
  {
    userId: 'test-user-123',
    id: 'test-user-123',
    email: 'test@example.com',
    role: 'user',
    tenantId: 'test-tenant',
    isAdmin: false
  },
  privateKey,
  {
    algorithm: 'RS256',
    expiresIn: '1h',
    issuer: 'tickettoken-auth',
    audience: 'tickettoken-auth'
  }
);

console.log(token);
NODESCRIPT

TOKEN=$(node << 'NODESCRIPT'
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(process.env.HOME, 'tickettoken-secrets', 'jwt-private.pem'), 'utf8');

const token = jwt.sign(
  {
    userId: 'test-user-123',
    id: 'test-user-123',
    email: 'test@example.com',
    role: 'user',
    tenantId: 'test-tenant',
    isAdmin: false
  },
  privateKey,
  {
    algorithm: 'RS256',
    expiresIn: '1h',
    issuer: 'tickettoken-auth',
    audience: 'tickettoken-auth'
  }
);

console.log(token);
NODESCRIPT
)

echo ""

# 4. Test with valid JWT
echo -e "${YELLOW}4. Testing calculate-fees with valid JWT...${NC}"
curl -s -X POST http://localhost:3006/payments/calculate-fees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"venueId": "venue123", "amount": 100, "ticketCount": 2}' | jq '.'
echo ""

# 5. Test internal endpoint with HMAC
echo -e "${YELLOW}5. Testing internal endpoint with HMAC auth...${NC}"
TIMESTAMP=$(date +%s)000
SERVICE_NAME="test-service"
METHOD="POST"
PATH="/internal/calculate-tax"
BODY='{"amount":100,"venueAddress":{"state":"CA"},"customerAddress":{"state":"CA"}}'
SECRET="${INTERNAL_SERVICE_SECRET:-internal-service-secret-change-in-production}"

# Create HMAC signature
PAYLOAD="${SERVICE_NAME}:${TIMESTAMP}:${METHOD}:${PATH}:${BODY}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -s -X POST http://localhost:3006/internal/calculate-tax \
  -H "Content-Type: application/json" \
  -H "x-internal-service: $SERVICE_NAME" \
  -H "x-internal-timestamp: $TIMESTAMP" \
  -H "x-internal-signature: $SIGNATURE" \
  -d "$BODY" | jq '.'
echo ""

echo -e "${GREEN}=== Tests Complete ===${NC}"
