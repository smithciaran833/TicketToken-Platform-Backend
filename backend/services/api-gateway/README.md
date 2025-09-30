# TicketToken API Gateway

Production-ready API Gateway for the TicketToken NFT ticketing platform.

## Features

- **Multi-strategy routing**: Path-based, header-based, and venue-tier routing
- **Circuit breaker pattern**: Prevents cascade failures with bulkhead isolation
- **Hierarchical timeouts**: Different timeouts for different operations
- **Multi-layer rate limiting**: Global, per-endpoint, and sliding window for ticket purchases
- **JWT authentication**: With refresh token rotation detection
- **Venue-scoped RBAC**: Role-based access control with venue isolation
- **Service discovery**: Support for Consul and static configuration
- **Request aggregation**: Combine data from multiple services
- **Distributed tracing**: OpenTelemetry support ready
- **Graceful degradation**: Non-critical service failures don't break the platform

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  API Gateway │────▶│ Backend Services│
└─────────────┘     └──────────────┘     └─────────────────┘
                            │
                            ├── Auth Service (3001)
                            ├── Venue Service (3002)
                            ├── Ticket Service (3003)
                            ├── Payment Service (3004)
                            ├── NFT Service (3005)
                            └── Analytics Service (3006)
```

## Quick Start

### Prerequisites

- Node.js v20.19.4+
- PostgreSQL 15+
- Redis 7+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
nano .env

# Generate JWT secrets
npm run generate-keys
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# The gateway will be available at http://localhost:3000
```

### Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up

# Or build just the gateway
docker build -t tickettoken-gateway .
docker run -p 3000:3000 --env-file .env tickettoken-gateway
```

## API Endpoints

### Health Checks

- `GET /health` - Basic health check
- `GET /ready` - Readiness probe (checks Redis, circuit breakers)
- `GET /live` - Liveness probe
- `GET /metrics` - Prometheus metrics (when configured)

### Authentication

- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout (requires auth)
- `GET /api/v1/auth/me` - Get current user (requires auth)

### Venues

- `GET /api/v1/venues` - List public venues
- `GET /api/v1/venues/:venueId` - Get venue details
- `POST /api/v1/venues` - Create venue (admin only)
- `PUT /api/v1/venues/:venueId` - Update venue (requires permission)

### Events

- `GET /api/v1/events` - List events
- `GET /api/v1/events/:eventId` - Get event with aggregated data
- `POST /api/v1/events` - Create event (requires permission)

### Tickets

- `POST /api/v1/tickets/purchase` - Purchase tickets (rate limited)
- `POST /api/v1/tickets/:ticketId/validate` - Validate ticket
- `GET /api/v1/tickets/my-tickets` - Get user's tickets

### Marketplace

- `GET /api/v1/marketplace/listings` - Browse NFT listings
- `POST /api/v1/marketplace/listings` - Create listing

### Analytics

- `GET /api/v1/analytics/venues/:venueId` - Venue analytics
- `GET /api/v1/analytics/events/:eventId` - Event analytics

## Configuration

### Environment Variables

See `.env.example` for all available options. Key configurations:

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `JWT_ACCESS_SECRET` - Secret for access tokens (min 32 chars)
- `JWT_REFRESH_SECRET` - Secret for refresh tokens (min 32 chars)
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL connection string

### Rate Limiting

Default rate limits:
- Global: 1000 requests/minute
- Ticket purchases: 3 per minute per user/event
- Payment operations: 5 per hour

### Timeouts

- Default: 5 seconds
- Payment operations: 30 seconds
- NFT minting: 2 minutes

## Security

- All sensitive data is redacted from logs
- SQL injection prevention on all inputs
- XSS protection headers
- CORS properly configured
- Rate limiting on all endpoints
- JWT tokens with short expiry
- Refresh token rotation detection
- API key management for venues

## Monitoring

The gateway exposes several monitoring endpoints:

- Circuit breaker states at `/health/services`
- Prometheus metrics at `/metrics` (when configured)
- Structured JSON logs with correlation IDs

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port 3000
   lsof -i :3000
   # Kill the process
   kill -9 <PID>
   ```

2. **Redis connection failed**
   - Ensure Redis is running: `redis-cli ping`
   - Check REDIS_URL in .env

3. **JWT errors**
   - Ensure JWT secrets are at least 32 characters
   - Secrets must be different for access and refresh tokens

4. **Rate limit errors**
   - Check Redis is running and accessible
   - Verify rate limit configuration in .env

## Development Tips

1. Use correlation IDs for tracing requests across services
2. Check circuit breaker states when services fail
3. Monitor rate limit headers in responses
4. Use idempotency keys for payment operations
5. Always include venue context in requests

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Follow the existing code style

## License

Copyright (c) 2024 TicketToken. All rights reserved.
