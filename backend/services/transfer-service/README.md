# Transfer Service

## Overview

The Transfer Service handles ticket transfers between users in the TicketToken platform. It supports gift transfers, acceptance flows, and blockchain NFT transfers on Solana.

## Features

- **Gift Transfers**: Send tickets as gifts to other users via email or wallet address
- **Acceptance Flows**: Secure acceptance codes for transfer verification
- **Blockchain Transfers**: NFT transfers on Solana with multi-RPC failover
- **Batch Transfers**: Process up to 50 transfers in a single batch
- **Multi-Tenancy**: Full tenant isolation with Row-Level Security
- **Idempotency**: Prevent duplicate transfers with Redis-based idempotency keys

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Transfer Service                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Routes    │  │ Controllers │  │     Services        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│  ┌──────▼────────────────▼─────────────────────▼──────────┐ │
│  │                    Middleware                           │ │
│  │  • Auth  • Rate Limit  • Idempotency  • Tenant Context │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   PostgreSQL     │  │      Redis       │  │  Solana RPC      │
│   (transfers)    │  │ (cache, locks)   │  │  (NFT transfers) │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Access to Solana RPC endpoints

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
# IMPORTANT: Never commit .env files!
```

### Configuration

See `.env.example` for all configuration options. Key settings:

```bash
# Database
DB_HOST=localhost
DB_NAME=transfer_service
DB_USER=transfer_service
DB_PASSWORD=your-password

# Redis
REDIS_URL=redis://localhost:6379

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_URL_SECONDARY=https://backup-rpc.example.com

# Secrets (use AWS Secrets Manager in production!)
SECRETS_PROVIDER=aws
```

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm start

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## API Endpoints

### Transfers

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transfers` | Initiate a transfer |
| POST | `/api/v1/transfers/:id/accept` | Accept a transfer |
| POST | `/api/v1/transfers/:id/reject` | Reject a transfer |
| POST | `/api/v1/transfers/:id/cancel` | Cancel a transfer |
| GET | `/api/v1/transfers/:id` | Get transfer details |
| GET | `/api/v1/transfers` | List user's transfers |
| POST | `/api/v1/transfers/batch` | Batch transfer |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

## Security

### Authentication

- **User Auth**: JWT tokens with RS256/HS256 algorithms
- **Service-to-Service**: HMAC-signed requests

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /transfers | 10/min per user |
| POST /transfers/batch | 2/min per user |
| Blockchain operations | 3/min per user |

### Secrets Management

In production, all secrets are loaded from AWS Secrets Manager:
- `JWT_SECRET`
- `INTERNAL_SERVICE_SECRET`
- `SOLANA_TREASURY_PRIVATE_KEY`

Never store secrets in environment variables in production!

## Database

### Migrations

```bash
# Run migrations
npm run migrate

# Create new migration
npm run migrate:create -- my_migration_name

# Rollback
npm run migrate:rollback
```

### Row-Level Security (RLS)

All tables enforce tenant isolation via PostgreSQL RLS policies:

```sql
-- Example policy
CREATE POLICY tenant_isolation ON transfers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

## Blockchain Integration

### Solana Configuration

The service supports multiple RPC endpoints with automatic failover:

```bash
SOLANA_RPC_URL=https://primary-rpc.example.com
SOLANA_RPC_URL_SECONDARY=https://secondary-rpc.example.com
SOLANA_RPC_URL_TERTIARY=https://tertiary-rpc.example.com
```

### NFT Transfer Flow

1. Verify ownership via DAS API
2. Build transfer transaction
3. Simulate transaction
4. Sign with treasury keypair (if custodial)
5. Send and confirm with retry

### Priority Fees

The service automatically estimates and applies priority fees based on network congestion.

## Monitoring

### Prometheus Metrics

Key metrics exposed at `/metrics`:
- `transfer_service_transfers_initiated_total`
- `transfer_service_transfers_completed_total`
- `transfer_service_blockchain_transfer_duration_seconds`
- `transfer_service_rpc_request_duration_seconds`

### Logging

Structured JSON logs with Pino:
- All sensitive data is redacted
- Request IDs for correlation
- Tenant context included

## Error Handling

All errors follow RFC 7807 format:

```json
{
  "type": "about:blank",
  "title": "Transfer not found",
  "status": 404,
  "detail": "Transfer with ID xyz not found",
  "instance": "/requests/abc123"
}
```

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

Coverage requirements:
- Global: 70% lines, 60% branches
- Critical paths (transfer.service.ts, blockchain-transfer.service.ts): 80% lines

## Deployment

### Docker

```bash
# Build image
docker build -t transfer-service .

# Run container
docker run -p 3019:3019 --env-file .env transfer-service
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests.

### CI/CD

GitHub Actions workflow runs on push to main/develop:
1. Lint & Type Check
2. Unit Tests
3. Integration Tests
4. Security Scan
5. Build & Push Docker Image
6. Deploy to Staging/Production

## Contributing

1. Create a feature branch from `develop`
2. Write tests for new functionality
3. Ensure all tests pass and coverage thresholds are met
4. Submit a pull request

## License

Proprietary - TicketToken Inc.
