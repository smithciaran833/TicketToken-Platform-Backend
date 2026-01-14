# Compliance Service

TicketToken's compliance microservice handling GDPR, OFAC screening, risk assessment, and tax (1099) reporting.

## Overview

The compliance service provides:

- **GDPR Processing**: Data export, deletion requests, and consent management
- **OFAC Screening**: SDN list checking for sanctions compliance
- **Risk Assessment**: Venue risk scoring and fraud detection
- **Tax Compliance**: IRS 1099 form generation for eligible venues

## Quick Start

```bash
# Install dependencies
npm ci

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate:up

# Start development server
npm run dev

# Run tests
npm test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│               Compliance Service                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  GDPR   │ │  OFAC   │ │  Risk   │ │  Tax    │           │
│  │ Module  │ │ Module  │ │ Module  │ │ Module  │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │           │           │           │                  │
│       └───────────┴───────────┴───────────┘                  │
│                       │                                      │
│              ┌────────┴────────┐                             │
│              │   Data Layer    │                             │
│              └────────┬────────┘                             │
└─────────────────────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │PostgreSQL│  │  Redis   │  │ External │
    │   RLS    │  │  Cache   │  │   APIs   │
    └──────────┘  └──────────┘  └──────────┘
```

## API Endpoints

### GDPR

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/gdpr/export` | POST | Request data export |
| `/api/v1/gdpr/delete` | POST | Request account deletion |
| `/api/v1/gdpr/requests` | GET | List GDPR requests |
| `/api/v1/gdpr/requests/:id` | GET | Get request status |

### Risk Assessment

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/risk/assess` | POST | Assess venue risk |
| `/api/v1/risk/flags` | GET | List risk flags |
| `/api/v1/risk/flags/:id` | PATCH | Update flag status |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/stripe` | POST | Stripe webhook handler |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe |
| `/metrics` | GET | Prometheus metrics |

## Configuration

See [.env.example](.env.example) for all configuration options.

### Required Environment Variables

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<32+ characters>
WEBHOOK_SECRET=<16+ characters>
```

### Feature Flags

| Flag | Description | Default |
|------|-------------|---------|
| `FEATURE_DETAILED_HEALTH` | Include component health | true |
| `FEATURE_METRICS_ENABLED` | Enable /metrics endpoint | true |
| `FEATURE_BULKHEAD` | Enable bulkhead pattern | true |
| `FEATURE_LOAD_SHEDDING` | Enable load shedding | true |

## Development

### Prerequisites

- Node.js 20 LTS
- PostgreSQL 15+
- Redis 7+
- Docker (for local development)

### Running Locally

```bash
# Start dependencies
docker-compose up -d postgres redis

# Run migrations
npm run migrate:up

# Start development server
npm run dev
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage

# Type checking
npm run typecheck
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Security audit
npm audit
```

## Documentation

- [API Documentation](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [GDPR Compliance](docs/GDPR_COMPLIANCE.md)
- [Secrets Rotation](docs/SECRETS_ROTATION.md)
- [Runbooks](docs/RUNBOOKS.md)
- [Contributing](docs/CONTRIBUTING.md)

## Security

See [SECURITY.md](SECURITY.md) for:
- Vulnerability reporting
- Security controls
- Compliance information

## Deployment

### Docker

```bash
docker build -t compliance-service .
docker run -p 3008:3008 compliance-service
```

### Kubernetes

```bash
kubectl apply -f k8s/deployment.yaml
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## Monitoring

### Metrics

Prometheus metrics available at `/metrics`:

- `http_request_duration_seconds` - Request latency
- `http_requests_total` - Request count
- `gdpr_requests_total` - GDPR request count
- `risk_assessments_total` - Risk assessment count
- `ofac_screenings_total` - OFAC screening count

### Health Checks

- `/health/live` - Returns 200 if process is running
- `/health/ready` - Returns 200 if all dependencies healthy

### Logging

Structured JSON logging with:
- Request ID correlation
- Tenant context
- Sensitive data redaction

## Multi-Tenancy

All data is isolated by `tenant_id`:
- Database: Row Level Security (RLS) policies
- Cache: Tenant-prefixed keys
- Logs: Tenant context included

## License

[MIT](LICENSE)
