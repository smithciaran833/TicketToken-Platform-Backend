# Blockchain Indexer Service

**AUDIT FIX: DOC-3 - README.md missing**

A high-performance Solana blockchain indexer for the TicketToken platform. This service indexes transactions, tracks marketplace activity, and reconciles on-chain state with the database.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Rate Limiting](#rate-limiting)
- [Authentication](#authentication)
- [Logging](#logging)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Overview

The blockchain-indexer service provides:

- **Transaction Indexing**: Real-time indexing of Solana transactions
- **Marketplace Tracking**: Monitor NFT marketplace activities (Magic Eden, etc.)
- **Reconciliation**: Periodic verification between on-chain and database state
- **Query API**: Fast queries for indexed blockchain data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Blockchain Indexer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Indexer    │  │  Marketplace │  │  Reconciliation   │  │
│  │  (polling)  │  │  Tracker     │  │  Engine           │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                │                     │            │
│         ▼                ▼                     ▼            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Transaction Processor                   │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                │                     │            │
│         ▼                ▼                     ▼            │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │ PostgreSQL │  │   MongoDB   │  │       Redis        │  │
│  │  (RLS)     │  │  (history)  │  │   (cache/locks)    │  │
│  └────────────┘  └─────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| Indexer | Polls Solana RPC for new blocks/transactions |
| Marketplace Tracker | WebSocket connection to marketplace APIs |
| Reconciliation Engine | Periodic verification of on-chain state |
| Transaction Processor | Parses and stores transaction data |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- MongoDB 6+
- Redis 7+
- Solana RPC endpoint

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Quick Start

```bash
# Run with Docker
docker-compose up -d

# Check health
curl http://localhost:3012/health
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment mode |
| `PORT` | No | 3012 | Server port |
| `DATABASE_HOST` | Yes | - | PostgreSQL host |
| `DATABASE_NAME` | Yes | - | PostgreSQL database name |
| `DATABASE_USER` | Yes | - | PostgreSQL username |
| `DATABASE_PASSWORD` | Yes | - | PostgreSQL password |
| `DATABASE_SSL` | No | true | Enable SSL |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `REDIS_HOST` | Yes | - | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `SOLANA_RPC_URL` | Yes | - | Primary Solana RPC URL |
| `SOLANA_FALLBACK_RPC_URLS` | No | - | Comma-separated fallback RPCs |
| `JWT_SECRET` | Yes | - | JWT signing secret (min 32 chars) |
| `LOG_LEVEL` | No | info | Log level (see Logging section) |

### Config Validation

All configuration is validated at startup using Zod schemas. Invalid configuration will cause the service to exit immediately with clear error messages.

## API Reference

See [docs/API.md](docs/API.md) for complete API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health check |
| `/live` | GET | Liveness probe |
| `/ready` | GET | Readiness probe |
| `/api/v1/transactions/:signature` | GET | Get transaction by signature |
| `/api/v1/wallets/:address/activity` | GET | Get wallet activity |
| `/api/v1/nfts/:tokenId/history` | GET | Get NFT ownership history |
| `/api/v1/marketplace/activity` | GET | Get marketplace events |

## Rate Limiting

**AUDIT FIX: RL-8 - Rate limit documentation**

Rate limits are enforced per tenant using Redis:

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/api/v1/*` | 100 requests | 1 minute |
| `/health`, `/live`, `/ready` | No limit | - |
| `/metrics` | 10 requests | 1 minute |

### Rate Limit Headers

All rate-limited responses include:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704295200
Retry-After: 45  (only when limit exceeded)
```

### Rate Limit Exceeded Response

```json
{
  "type": "https://tickettoken.io/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 45 seconds.",
  "instance": "/api/v1/transactions/abc123",
  "retryAfter": 45
}
```

## Authentication

**AUDIT FIX: S2S-12 - Per-endpoint authorization documentation**

### JWT Authentication

All API endpoints (except health checks) require a valid JWT token:

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.tickettoken.io/blockchain-indexer/api/v1/transactions/...
```

### Token Claims

| Claim | Required | Description |
|-------|----------|-------------|
| `sub` | Yes | User or service ID |
| `tenant_id` | Yes | Tenant UUID |
| `iss` | Yes | Token issuer (must be tickettoken-auth-service) |
| `aud` | Yes | Token audience (must include blockchain-indexer) |
| `exp` | Yes | Expiration timestamp |
| `roles` | No | Array of user roles |
| `scopes` | No | Array of permission scopes |

### Endpoint Authorization Rules

| Endpoint Pattern | Roles Required | Notes |
|------------------|----------------|-------|
| `GET /health`, `/live`, `/ready` | None (public) | Health checks |
| `GET /api/v1/*` | Any authenticated | Query endpoints |
| `POST /internal/*` | `service` | Service-to-service only |
| `POST /admin/*` | `admin` | Admin operations |
| `DELETE /admin/*` | `admin` | Admin operations |

### Service-to-Service (S2S) Calls

S2S calls use the same JWT format but include a `serviceId` claim instead of `userId`:

```json
{
  "sub": "minting-service",
  "serviceId": "minting-service",
  "tenant_id": "system",
  "iss": "tickettoken-auth-service",
  "aud": ["blockchain-indexer"],
  "exp": 1704295200
}
```

All S2S calls are audit logged. See `src/middleware/auth-audit.ts`.

## Logging

**AUDIT FIX: LOG-16 - Missing log level documentation**

### Log Levels

| Level | Priority | Use Case |
|-------|----------|----------|
| `fatal` | 60 | Application cannot continue |
| `error` | 50 | Error that should be investigated |
| `warn` | 40 | Warning conditions |
| `info` | 30 | Normal operational messages |
| `debug` | 20 | Debug information |
| `trace` | 10 | Very detailed tracing |

### Log Format

All logs are JSON formatted (pino) with the following fields:

```json
{
  "level": 30,
  "time": 1704295200000,
  "pid": 12345,
  "hostname": "indexer-pod-abc123",
  "service": "blockchain-indexer",
  "version": "1.0.0",
  "requestId": "req-123",
  "correlationId": "corr-456",
  "tenantId": "tenant-789",
  "msg": "Request completed"
}
```

### Sensitive Data Redaction

The following fields are automatically redacted:
- `password`
- `secret`
- `token`
- `authorization`
- `privateKey`
- `apiKey`

### Setting Log Level

```bash
# Via environment variable
LOG_LEVEL=debug npm start

# Defaults by environment
# development: debug
# test: warn
# production: info
```

## Testing

See [docs/TESTING.md](docs/TESTING.md) for comprehensive testing documentation.

### Quick Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

### Coverage Requirements

| Metric | Minimum |
|--------|---------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

## Deployment

### Kubernetes Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 3012
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3012
  initialDelaySeconds: 5
  periodSeconds: 5

startupProbe:
  httpGet:
    path: /startup
    port: 3012
  initialDelaySeconds: 0
  periodSeconds: 5
  failureThreshold: 30
```

### Resource Recommendations

| Deployment | CPU | Memory |
|------------|-----|--------|
| Development | 0.5 | 512Mi |
| Staging | 1 | 1Gi |
| Production | 2 | 2Gi |

## Troubleshooting

### Common Issues

#### Indexer Not Processing Blocks

1. Check Solana RPC connectivity: `curl $SOLANA_RPC_URL -X POST ...`
2. Verify Redis lock: `redis-cli GET blockchain-indexer:lock:indexer`
3. Check logs for circuit breaker state

#### High Memory Usage

1. Reduce `INDEXER_BATCH_SIZE`
2. Reduce `DATABASE_POOL_MAX`
3. Check for MongoDB cursor leaks

#### Rate Limit Issues

1. Check per-tenant usage: `redis-cli KEYS ratelimit:*`
2. Verify tenant ID in JWT
3. Increase limits in config if needed

### Runbooks

See [docs/RUNBOOKS.md](docs/RUNBOOKS.md) for detailed operational procedures.

## License

Copyright © 2025 TicketToken. All rights reserved.
