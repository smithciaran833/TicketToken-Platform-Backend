# Analytics Service

Real-time analytics, business metrics, customer insights, RFM scoring, dashboards, and reports for the TicketToken platform.

## Overview

The Analytics Service provides comprehensive data analytics capabilities including:

- **Real-time Analytics**: Live event tracking and streaming metrics
- **Business Metrics**: Revenue, sales, attendance tracking
- **Customer Insights**: Segmentation, behavior analysis
- **RFM Scoring**: Recency, Frequency, Monetary customer scoring
- **Dashboards**: Customizable analytics dashboards
- **Reports**: Scheduled and on-demand report generation

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Fastify
- **Databases**: 
  - PostgreSQL (relational data)
  - Redis (caching, distributed locks)
  - InfluxDB (time-series metrics)
  - MongoDB (optional, document storage)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- InfluxDB 2.x (optional)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for all configuration options. Key variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_HOST` | PostgreSQL host | Yes |
| `DATABASE_PASSWORD` | PostgreSQL password | Yes |
| `REDIS_HOST` | Redis host | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `INTERNAL_AUTH_SECRET` | S2S auth secret | Yes |
| `INFLUXDB_URL` | InfluxDB URL | No |
| `INFLUXDB_TOKEN` | InfluxDB token | No |

## API Endpoints

### Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Comprehensive health check |
| `/live` | GET | Kubernetes liveness probe |
| `/ready` | GET | Kubernetes readiness probe |
| `/metrics` | GET | Prometheus metrics |

### Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/analytics/events` | POST | Track analytics event |
| `/api/v1/analytics/query` | POST | Query analytics data |
| `/api/v1/analytics/metrics` | GET | Get metrics summary |

### Dashboards

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/dashboards` | GET | List dashboards |
| `/api/v1/dashboards` | POST | Create dashboard |
| `/api/v1/dashboards/:id` | GET | Get dashboard |
| `/api/v1/dashboards/:id` | PUT | Update dashboard |
| `/api/v1/dashboards/:id` | DELETE | Delete dashboard |

### Reports

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/reports` | POST | Generate report |
| `/api/v1/reports/scheduled` | GET | List scheduled reports |
| `/api/v1/reports/scheduled` | POST | Create scheduled report |

### Customer Insights

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/customers/insights` | GET | Get customer insights |
| `/api/v1/customers/rfm` | GET | Get RFM scores |
| `/api/v1/customers/segments` | GET | Get customer segments |

## Development

### Scripts

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Fix lint issues
npm run lint:fix

# Type checking
npm run typecheck

# Database migrations
npm run db:migrate
npm run db:rollback
npm run db:seed
```

### Project Structure

```
src/
├── config/           # Configuration files
│   ├── index.ts      # Main config
│   ├── database.ts   # Database config
│   ├── redis.ts      # Redis config
│   └── validate.ts   # Config validation
├── middleware/       # Fastify middleware
│   ├── auth.middleware.ts
│   ├── tenant-context.ts
│   ├── rate-limit.middleware.ts
│   └── ...
├── routes/           # API routes
│   └── health.routes.ts
├── services/         # Business logic
│   ├── cache.service.ts
│   ├── customer-insights.service.ts
│   └── influxdb-metrics.service.ts
├── workers/          # Background workers
│   └── rfm-calculator.worker.ts
├── utils/            # Utility functions
│   ├── logger.ts
│   ├── distributed-lock.ts
│   └── metrics.ts
├── schemas/          # Validation schemas
│   └── validation.ts
├── errors/           # Error classes
│   └── index.ts
├── app.ts            # Fastify app setup
└── index.ts          # Entry point
```

## Security

### Authentication

- JWT-based authentication with algorithm, issuer, and audience validation
- Service-to-service authentication via HMAC-signed tokens
- No mock authentication in production

### Multi-Tenancy

- Row-Level Security (RLS) at database level
- Tenant context middleware for all requests
- Tenant-prefixed cache keys

### Data Protection

- PII redaction in logs
- Response filtering for sensitive data
- Input validation with Zod schemas

## Monitoring

### Prometheus Metrics

Available at `/metrics`:

- `analytics_request_duration_seconds` - Request latency histogram
- `analytics_requests_total` - Request counter by endpoint
- `analytics_errors_total` - Error counter
- `analytics_cache_hits_total` - Cache hit counter
- `analytics_cache_misses_total` - Cache miss counter

### Health Checks

- `/health` - Full dependency check (PostgreSQL, Redis, InfluxDB)
- `/live` - Basic liveness (service running)
- `/ready` - Readiness (dependencies available)

### Logging

Structured JSON logging with:
- Request correlation IDs
- Tenant context
- PII redaction
- Configurable log levels

## Deployment

### Docker

```bash
# Build image
docker build -t analytics-service .

# Run container
docker run -p 3006:3006 --env-file .env analytics-service
```

### Kubernetes

Health probes are configured for:
- Liveness: `/livez` (basic health)
- Readiness: `/readyz` (dependency health)

## License

Proprietary - TicketToken Platform
