#!/bin/bash

echo "🧪 Running comprehensive auth service tests..."
echo ""

if ! curl -s http://localhost:3001/health >/dev/null 2>&1; then
    echo "❌ Auth service is not running!"
    echo "Start it with: npm run dev"
    exit 1
fi

echo "✓ Auth service is running"
echo ""

npm test -- tests/endpoints/auth-endpoints-comprehensive.test.ts --verbose
