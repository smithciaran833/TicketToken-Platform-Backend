#!/bin/bash

echo "=== TESTING WP-10 SECURITY IMPLEMENTATION ==="

# Test rate limiting
echo -e "\n1. Testing Rate Limiting..."
for i in {1..10}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
  echo "Request $i: HTTP $response"
  if [ "$response" = "429" ]; then
    echo "✅ Rate limiting working!"
    break
  fi
done

# Test SQL injection protection
echo -e "\n2. Testing SQL Injection Protection..."
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM users; DROP TABLE users;"}' \
  -w "\nHTTP Status: %{http_code}\n"

# Check audit logs
echo -e "\n3. Checking Audit Logs..."
docker exec tickettoken-postgres psql -U tickettoken -d tickettoken_db -c \
  "SELECT action, severity, success, created_at FROM security_audit_logs ORDER BY created_at DESC LIMIT 5;"

# Check security headers
echo -e "\n4. Testing Security Headers..."
curl -I http://localhost:3000/api/health 2>/dev/null | grep -E "X-Frame-Options|X-Content-Type|Strict-Transport"

echo -e "\n✅ Security tests complete!"
