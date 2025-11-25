#!/bin/bash

BASE_URL="http://localhost:3004"
TOKEN="your-jwt-token-here"

echo "=== Testing Customer Insights API ==="

echo ""
echo "1. Get customer profile"
curl -X GET "$BASE_URL/api/insights/customers/USER_ID/profile" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "2. Get customer preferences"
curl -X GET "$BASE_URL/api/insights/customers/USER_ID/preferences" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "3. Get venue customer segments"
curl -X GET "$BASE_URL/api/insights/venues/VENUE_ID/segments" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "4. Get venue customers (VIP only)"
curl -X GET "$BASE_URL/api/insights/venues/VENUE_ID/customers?segment=vip&minSpent=50000" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "5. Get cohort analysis"
curl -X GET "$BASE_URL/api/insights/venues/VENUE_ID/cohorts?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer $TOKEN"
