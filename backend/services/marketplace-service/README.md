# Marketplace Service

Secondary marketplace for ticket trading with escrow protection and transparent fee distribution.

## Features

- ✅ Listing management (create, update, cancel)
- ✅ Secure purchase flow with distributed locking
- ✅ Escrow-based fund protection
- ✅ Automatic fee distribution (platform + venue)
- ✅ Blockchain integration (Solana NFT transfers)
- ✅ Comprehensive monitoring and metrics
- ✅ Rate limiting and security controls

## Architecture

```
Buyer Purchase Request
    ↓
Distributed Lock (Redis)
    ↓
Create Escrow PDA ← Holds buyer funds securely
    ↓
Transfer NFT on Solana
    ↓
Release Escrow → Platform Fee (2.5%) + Venue Fee (5%) + Seller Payment
    ↓
Update Listing Status
```

## API Endpoints

### Listings

#### GET /api/v1/marketplace/listings
Get all active listings with filtering and pagination.

**Query Parameters:**
- `event_id` (string, optional): Filter by event
- `venue_id` (string, optional): Filter by venue
- `min_price` (number, optional): Minimum price filter
- `max_price` (number, optional): Maximum price filter
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20)

**Response:**
```json
{
  "listings": [
    {
      "id": "listing-uuid",
      "ticketId": "ticket-uuid",
      "sellerId": "user-uuid",
      "price": 10000,
      "originalFaceValue": 10000,
      "status": "active",
      "eventId": "event-uuid",
      "venueId": "venue-uuid",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### POST /api/v1/marketplace/listings
Create a new listing.

**Authentication:** Required

**Request Body:**
```json
{
  "ticketId": "ticket-uuid",
  "price": 10000,
  "walletAddress": "solana-wallet-address"
}
```

**Validation:**
- Price must not exceed 300% of face value
- Ticket must not already have an active listing
- User must own the ticket
- Event must not have already occurred

**Response:** `201 Created`
```json
{
  "listing": {
    "id": "listing-uuid",
    "ticketId": "ticket-uuid",
    "sellerId": "user-uuid",
    "price": 10000,
    "status": "active",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

#### PATCH /api/v1/marketplace/listings/:listingId
Update listing price.

**Authentication:** Required (seller only)

**Request Body:**
```json
{
  "price": 12000
}
```

**Response:** `200 OK`

#### POST /api/v1/marketplace/listings/:listingId/cancel
Cancel a listing.

**Authentication:** Required (seller only)

**Response:** `200 OK`

### Purchases

#### POST /api/v1/marketplace/listings/:listingId/buy
Purchase a listing.

**Authentication:** Required

**Request Body:**
```json
{
  "walletAddress": "buyer-solana-wallet",
  "offeredPrice": 10000
}
```

**Flow:**
1. Validates buyer has sufficient funds
2. Creates escrow PDA to hold buyer funds
3. Transfers NFT on Solana blockchain
4. Releases escrow with fee distribution
5. Marks listing as sold

**Response:** `200 OK`
```json
{
  "success": true,
  "transfer": {
    "id": "transfer-uuid",
    "ticketId": "ticket-uuid",
    "price": 10000,
    "platformFee": 250,
    "venueFee": 500,
    "total": 10750,
    "signature": "solana-tx-signature",
    "blockHeight": 12345,
    "status": "completed"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid wallet, insufficient funds, buying own listing
- `403 Forbidden`: Not authorized
- `404 Not Found`: Listing not found
- `409 Conflict`: Listing unavailable or concurrent purchase
- `503 Service Unavailable`: Blockchain service unavailable

### Health & Monitoring

#### GET /health
Basic health check.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "marketplace-service",
  "database": "connected",
  "blockchain": "connected",
  "blockHeight": 12345,
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### GET /health/blockchain
Detailed blockchain connectivity check.

**Response:** `200 OK` or `503 Service Unavailable`

#### GET /metrics
Prometheus-formatted metrics.

**Response:** `200 OK` (text/plain)
```
# HELP marketplace_active_listings Number of active listings
# TYPE marketplace_active_listings gauge
marketplace_active_listings 42

# HELP marketplace_total_volume_usd Total transaction volume in USD
# TYPE marketplace_total_volume_usd counter
marketplace_total_volume_usd 1500000
...
```

#### GET /metrics/json
JSON-formatted metrics for dashboards.

**Response:** `200 OK`
```json
{
  "timestamp": "2025-01-01T00:00:00Z",
  "listings": {
    "active": 42,
    "sold": 128,
    "cancelled": 15,
    "total": 185
  },
  "transfers": {
    "completed": 128,
    "failed": 3,
    "initiated": 2,
    "totalVolume": 1500000
  },
  "escrow": {
    "active": 2,
    "timedOut": 0,
    "totalValue": 25000
  },
  "fees": {
    "platformCollected": 37500,
    "venueCollected": 75000,
    "totalCollected": 112500,
    "transactionCount": 128,
    "averagePerTransaction": 878
  }
}
```

## Security

### Authentication
- JWT-based authentication required for all write operations
- Read operations may be public or require authentication based on configuration

### Authorization
- Users can only modify/cancel their own listings
- Proper ownership validation on all operations
- Prevention of self-purchasing

### Rate Limiting
- Configurable rate limits per endpoint
- Protection against DoS attacks

### Input Validation
- Price caps (300% maximum markup)
- Wallet address validation
- SQL injection prevention
- XSS prevention

### Concurrent Access Protection
- Distributed locks (Redis) prevent race conditions
- Automatic retry with exponential backoff
- Conflict detection and resolution

## Configuration

### Environment Variables

```bash
# Service
NODE_ENV=production
PORT=3016
SERVICE_NAME=marketplace-service

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketplace_db
DB_USER=marketplace_user
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Blockchain
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
MARKETPLACE_PROGRAM_ID=your-program-id
MARKETPLACE_TREASURY=platform-treasury-address
VENUE_TREASURY=venue-treasury-address

# Service URLs
AUTH_SERVICE_URL=http://auth-service:3001
TICKET_SERVICE_URL=http://event-service:3003
BLOCKCHAIN_SERVICE_URL=http://blockchain-service:3010

# Fees (as decimals)
PLATFORM_FEE_RATE=0.025  # 2.5%
VENUE_FEE_RATE=0.05      # 5%

# Security
JWT_SECRET=your-jwt-secret
```

## Running the Service

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker
```bash
docker build -t marketplace-service .
docker run -p 3016:3016 marketplace-service
```

### Database Migrations
```bash
npm run migrate
```

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Security Tests
```bash
npm run test:security
```

### Load Tests
```bash
MARKETPLACE_URL=http://localhost:3016 \
TEST_LISTING_ID=your-test-listing-id \
npm run test:load
```

## Monitoring

### Metrics
- **Prometheus endpoint:** `/metrics`
- **JSON endpoint:** `/metrics/json`
- **Health checks:** `/health`, `/health/db`, `/health/blockchain`

### Key Metrics
- Active listings count
- Transaction volume (USD)
- Escrow status (active, timed out, total value)
- Fee collection (platform, venue, total)
- Transfer success/failure rates

### Logging
- Structured JSON logging with Winston
- Log levels: error, warn, info, debug
- Request/response logging
- Security event logging

## Background Services

### Escrow Monitor
- Runs every 60 seconds
- Checks for timed-out escrows (> 5 minutes)
- Automatically refunds timed-out escrows to buyers
- Logs all refund operations

**Manual Resolution:**
```typescript
import { escrowMonitorService } from './services/escrow-monitor.service';

// Force refund
await escrowMonitorService.manuallyResolveEscrow({
  transferId: 'transfer-uuid',
  action: 'refund',
  reason: 'Manual intervention required'
});

// Force release
await escrowMonitorService.manuallyResolveEscrow({
  transferId: 'transfer-uuid',
  action: 'release',
  reason: 'Verified successful transfer'
});
```

## Troubleshooting

### Common Issues

**Issue:** Purchases fail with 409 Conflict
- **Cause:** Concurrent purchase attempts
- **Solution:** Normal behavior - only one buyer can purchase. Losers receive 409.

**Issue:** Escrow timeouts
- **Cause:** Blockchain RPC unavailable or slow
- **Solution:** Escrows automatically refunded after 5 minutes

**Issue:** High failure rate
- **Check:** Blockchain service health (`GET /health/blockchain`)
- **Check:** Database connectivity (`GET /health/db`)
- **Check:** Logs for specific error patterns

### Debug Mode
```bash
LOG_LEVEL=debug npm run dev
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Redis accessible
- [ ] Blockchain RPC endpoint configured
- [ ] Treasury wallets configured
- [ ] Fee rates verified
- [ ] Monitoring/alerting configured
- [ ] Load testing completed
- [ ] Security audit completed
- [ ] Backup strategy in place

## Support

For issues or questions:
1. Check logs: `/var/log/marketplace-service/`
2. Check metrics: `GET /metrics/json`
3. Review documentation: This README
4. Contact: devops@tickettoken.com
