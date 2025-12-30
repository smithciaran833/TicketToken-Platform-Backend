# API Gateway

The central entry point for all client requests to the TicketToken platform. Handles authentication, routing, rate limiting, and request validation before proxying to downstream microservices.

## Features

- **Authentication & Authorization**: JWT validation, RBAC, venue-scoped permissions
- **Request Routing**: Proxies to 15+ downstream services
- **Rate Limiting**: Global and per-endpoint limits with Redis-backed sliding window
- **Request Validation**: Gateway-level schema validation (Joi) for critical endpoints
- **Circuit Breakers**: Prevents cascade failures when services are unhealthy
- **Multi-tenancy**: Venue isolation and tenant context propagation
- **Security Headers**: HSTS, CSP, XSS protection via Helmet
- **Observability**: Structured logging, Prometheus metrics, correlation IDs
- **Health Probes**: Kubernetes-compatible liveness, readiness, and startup probes

## Architecture
```
Client Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                   API Gateway                        │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Auth   │→ │  Rate    │→ │  Route/Validate   │  │
│  │Middleware│  │ Limiter  │  │    & Proxy        │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  auth-service │ venue-service │ ticket-service │ ...│
└─────────────────────────────────────────────────────┘
```

## Quick Start
```bash
# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build
npm start

# Tests
npm test
npm run test:coverage
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `REDIS_HOST` | Yes | Redis host for caching/rate limiting |
| `REDIS_PASSWORD` | Prod | Redis password |
| `INTERNAL_SERVICE_SECRET` | Yes | Service-to-service auth secret |
| `*_SERVICE_URL` | Yes | URLs for downstream services |

See `.env.example` for complete configuration options.

## API Endpoints

### Health & Monitoring
- `GET /health` - Basic health check
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health/startup` - Startup probe (Kubernetes)
- `GET /metrics` - Prometheus metrics

### Proxied Services
All requests to `/api/v1/*` are authenticated and proxied:
- `/api/v1/auth/*` → auth-service
- `/api/v1/venues/*` → venue-service
- `/api/v1/events/*` → event-service
- `/api/v1/tickets/*` → ticket-service
- `/api/v1/payments/*` → payment-service
- `/api/v1/marketplace/*` → marketplace-service
- ... and more

## Security

### Headers
- Strict-Transport-Security (HSTS)
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff

### Authentication
- JWT Bearer tokens required for protected routes
- Token validation via auth-service
- Refresh token rotation supported

### Rate Limiting
- Global: 100 requests/minute per IP
- Ticket purchase: 5 requests/minute per user
- Configurable per-venue tier multipliers

### Service-to-Service Auth
Downstream requests include HMAC-signed headers:
- `x-internal-service`: Service name
- `x-internal-timestamp`: Unix timestamp
- `x-internal-signature`: HMAC-SHA256 signature

## Development

### Project Structure
```
src/
├── config/          # Configuration and env validation
├── middleware/      # Auth, rate limit, validation, etc.
├── routes/          # Route handlers and proxies
├── schemas/         # Joi validation schemas
├── services/        # Circuit breaker, service discovery
├── utils/           # Logger, security helpers
└── server.ts        # Application entry point
```

### Adding New Routes
1. Add service URL to `config/services.ts`
2. Create route file in `routes/`
3. Register in `routes/index.ts`
4. Add validation schema if needed in `schemas/index.ts`

### Testing
```bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage    # With coverage report
```

## Docker
```bash
# Build
docker build -t tickettoken/api-gateway .

# Run
docker run -p 3000:3000 --env-file .env tickettoken/api-gateway
```

## Monitoring

### Metrics (Prometheus)
- `http_request_duration_seconds` - Request latency histogram
- `http_requests_total` - Request counter by method/route/status
- `http_requests_in_progress` - Gauge of active requests
- `circuit_breaker_state` - Circuit breaker status per service

### Logging
Structured JSON logs via Pino:
- Request/response logging with correlation IDs
- Security event logging (auth failures, rate limits)
- PII redaction (email, phone, passwords)

## License

Proprietary - TicketToken Inc.
