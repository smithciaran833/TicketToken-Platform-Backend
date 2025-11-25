# TicketToken Platform - Service Port Assignments

## Master Port Map (Updated: 2024)

| Port | Service | Status | Notes |
|------|---------|--------|-------|
| 3000 | api-gateway | ✅ Correct | Gateway entry point |
| 3001 | auth-service | ✅ Correct | Authentication |
| 3002 | venue-service | ✅ Correct | Venue management |
| 3003 | event-service | ✅ Correct | Event management |
| 3004 | ticket-service | ✅ Correct | Ticket operations |
| 3005 | order-service | ✅ Correct | Order processing |
| 3006 | payment-service | ✅ Correct | Payment processing |
| 3007 | notification-service | 🔧 Needs Fix | Notification system |
| 3008 | queue-service | 🔧 Needs Fix | Message queue management |
| 3009 | scanning-service | 🔧 Needs Fix | QR/ticket scanning |
| 3010 | analytics-service | 🔧 Needs Fix | Analytics & reporting |
| 3011 | blockchain-service | ✅ Correct | Blockchain operations |
| 3012 | blockchain-indexer | ✅ Correct | Blockchain indexing |
| 3013 | file-service | ✅ Correct | File management |
| 3014 | compliance-service | 🔧 Needs Fix | Compliance checks |
| 3015 | integration-service | 🔧 Needs Fix | External integrations |
| 3016 | marketplace-service | 🔧 Needs Fix | Secondary marketplace |
| 3017 | monitoring-service | 🔧 Needs Fix | System monitoring |
| 3018 | minting-service | 🔧 Needs Fix | NFT minting |
| 3019 | transfer-service | ✅ Correct | Ticket transfers |
| 3020 | search-service | 🔧 Needs Fix | Search indexing |

## Infrastructure Ports
- 5432: PostgreSQL
- 6379: Redis
- 5672: RabbitMQ (AMQP)
- 15672: RabbitMQ Management UI
- 27017: MongoDB
- 9200: Elasticsearch HTTP
- 9300: Elasticsearch Transport
- 8086: InfluxDB

## Services Needing Port Fixes

### High Priority (Multiple conflicts)
1. **analytics-service**: Currently has 3016 (index.ts) and 3007 (config) → **Fix to 3010**
2. **scanning-service**: Currently 3007 → **Fix to 3009**
3. **search-service**: Currently 3012 → **Fix to 3020**

### Medium Priority (Single file mismatch)
4. **notification-service**: No default set → **Fix to 3007**
5. **queue-service**: Has 3020 (index) and 3004 (config) → **Fix to 3008**
6. **compliance-service**: Currently 3018 → **Fix to 3014**
7. **integration-service**: Currently 3007 → **Fix to 3015**
8. **marketplace-service**: Currently 3008 → **Fix to 3016**
9. **monitoring-service**: Currently 9090 → **Fix to 3017**
10. **minting-service**: Currently shares 3018 → **Fix to 3018** (keep, move compliance)
11. **payment-service**: Config has wrong port 3003 → **Fix to 3006**

## Fix Order
1. analytics-service (3016 → 3010)
2. scanning-service (3007 → 3009)
3. search-service (3012 → 3020)
4. notification-service (undefined → 3007)
5. queue-service (3020 → 3008)
6. compliance-service (3018 → 3014)
7. integration-service (3007 → 3015)
8. marketplace-service (3008 → 3016)
9. monitoring-service (9090 → 3017)
10. payment-service (config: 3003 → 3006)

## Commands to Verify After Fixes
```bash
# Check all services have correct ports
cd ~/Desktop/TicketToken-Platform/backend/services
for service in */; do
  echo "=== ${service%/} ==="
  grep -rn "process.env.PORT" "${service}src/" 2>/dev/null | grep -v node_modules
done
```
