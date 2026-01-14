# Ticket Service

A secure, multi-tenant ticket management service for the TicketToken platform. Handles ticket purchases, transfers, NFT minting integration, and QR code validation.

## Features

- **Ticket Lifecycle Management**: Purchase, transfer, refund, and check-in
- **NFT Integration**: Mint tickets as Solana compressed NFTs
- **Multi-tenant Architecture**: Row-Level Security (RLS) for tenant isolation
- **QR Code Validation**: Rotating encrypted QR codes for event entry
- **State Machine**: Predictable ticket state transitions
- **High Availability**: Circuit breakers, retries, and graceful degradation

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with RLS support
- Redis 6+
- RabbitMQ 3.9+

### Development Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start dependencies
docker-compose up -d postgres redis rabbitmq

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Service port | No | 3004 |
| `NODE_ENV` | Environment | No | development |
| `DATABASE_URL` | PostgreSQL connection | Yes (prod) | - |
| `REDIS_URL` | Redis connection | Yes (prod) | - |
| `RABBITMQ_URL` | RabbitMQ connection | Yes (prod) | - |
| `JWT_SECRET` | JWT signing key (64+ chars) | Yes | - |
| `QR_ENCRYPTION_KEY` | QR encryption (32 chars) | Yes | - |
| `INTERNAL_SERVICE_SECRET` | Service-to-service auth | Yes | - |

See `.env.example` for full configuration options.

## API Endpoints

### Health Checks

| Endpoint | Description | Used For |
|----------|-------------|----------|
| `GET /health` | Basic health check | Load balancer |
| `GET /health/ready` | Readiness probe | Kubernetes |
| `GET /health/live` | Liveness probe | Kubernetes |
| `GET /health/startup` | Startup probe | Kubernetes |

### Ticket Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/tickets` | GET | List tickets (with pagination) |
| `/api/v1/tickets/:id` | GET | Get ticket details |
| `/api/v1/tickets/reserve` | POST | Reserve tickets |
| `/api/v1/tickets/purchase` | POST | Complete purchase |
| `/api/v1/tickets/:id/transfer` | POST | Initiate transfer |
| `/api/v1/tickets/:id/qr` | GET | Get rotating QR code |
| `/api/v1/tickets/:id/validate` | POST | Validate QR code |
| `/api/v1/tickets/:id/checkin` | POST | Check in ticket |

### Internal Endpoints (S2S)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/internal/tickets/:id` | GET | Get ticket (service auth) |
| `/internal/tickets/:id/reserve` | POST | Reserve for order service |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Ticket Service                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Routes    │  │ Middleware  │  │      Services       │  │
│  │             │  │             │  │                     │  │
│  │ - Purchase  │  │ - Auth      │  │ - TicketService     │  │
│  │ - Transfer  │  │ - Tenant    │  │ - SolanaService     │  │
│  │ - Health    │  │ - Idempot.  │  │ - SecurityService   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│  PostgreSQL   │   │     Redis     │   │   RabbitMQ    │
│  (with RLS)   │   │   (Cache)     │   │   (Events)    │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Security

### Multi-Tenant Isolation

- Row-Level Security (RLS) enforces tenant isolation at database level
- All queries automatically filtered by `tenant_id`
- Service role bypasses RLS for cross-tenant operations

### Authentication

- JWT-based authentication for user requests
- Service-to-service authentication with signed tokens
- API key support for external integrations

### Input Validation

- Zod schemas with `.strict()` mode
- Response sanitization to prevent data leakage
- Rate limiting per tenant/user

## Testing

```bash
# Run all tests
npm test

# Run with coverage (requires 80%)
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Deployment

### Docker

```bash
docker build -t ticket-service .
docker run -p 3004:3004 --env-file .env ticket-service
```

### Kubernetes

See `docs/runbooks/` for:
- [Restart Procedure](docs/runbooks/restart.md)
- [Scaling Guide](docs/runbooks/scaling.md)
- [Rollback Procedure](docs/runbooks/rollback.md)
- [Blockchain Incidents](docs/runbooks/blockchain-incidents.md)

## Documentation

- [OpenAPI Specification](docs/openapi.yaml)
- [ADR: Blockchain Source of Truth](docs/adr/ADR-001-blockchain-source-of-truth.md)
- [Fix Progress](docs/FIX_PROGRESS.md)

## Contributing

1. Follow the coding standards in `CONTRIBUTING.md`
2. All changes require tests
3. Run `npm run lint` before committing
4. Create feature branches from `main`

## License

Proprietary - TicketToken Platform
