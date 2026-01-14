# Order Service

The Order Service manages the complete order lifecycle for ticket purchases in the TicketToken platform.

## Overview

This service handles:
- Order creation, reservation, and confirmation
- Payment integration with Payment Service
- Ticket allocation with Ticket Service
- Full and partial refunds
- Order modifications and upgrades
- Tax calculation and compliance
- Refund policies and eligibility
- Promo codes and discounts

## Quick Start

### Prerequisites

- Node.js 20.x
- PostgreSQL 14+
- Redis 7+
- RabbitMQ 3.12+

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `RABBITMQ_URL` | RabbitMQ connection URL | Yes |
| `INTERNAL_SERVICE_SECRET` | S2S authentication secret | Yes |
| `PAYMENT_SERVICE_URL` | Payment service URL | Yes |
| `TICKET_SERVICE_URL` | Ticket service URL | Yes |

### Database Setup

Run migrations:

```bash
npm run migrate
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders/:orderId` | Get order |
| GET | `/api/v1/orders` | List user orders |
| POST | `/api/v1/orders/:orderId/reserve` | Reserve order |
| POST | `/api/v1/orders/:orderId/cancel` | Cancel order |
| POST | `/api/v1/orders/:orderId/refund` | Full refund |
| POST | `/api/v1/orders/:orderId/refund/partial` | Partial refund |

### Tax

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tax/calculate` | Calculate tax |
| GET | `/api/v1/tax/jurisdictions` | List jurisdictions |
| POST | `/api/v1/tax/jurisdictions` | Create jurisdiction (admin) |

### Refund Policies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/refund-policy/policies` | List policies |
| POST | `/api/v1/refund-policy/check-eligibility` | Check eligibility |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health/startup` | Startup probe (K8s) |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/health` | Detailed health check |

## Architecture

### Service Dependencies

```
┌─────────────────┐
│  Order Service  │
└────────┬────────┘
         │
    ┌────┴────┬─────────┐
    ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐
│Payment│ │Ticket │ │Event  │
│Service│ │Service│ │Service│
└───────┘ └───────┘ └───────┘
```

### Database Tables

The service owns 15 database tables:
- `orders` - Main orders table
- `order_items` - Order line items
- `order_events` - Event history
- `order_refunds` - Refund records
- `refund_policies` - Policy definitions
- `refund_policy_rules` - Policy rules
- `refund_reasons` - Reason catalog
- And more...

### Security Features

- **JWT Authentication**: All routes require valid JWT tokens
- **Algorithm Whitelist**: Only HS256 allowed
- **S2S Authentication**: HMAC-based service-to-service auth
- **Input Validation**: All routes use Joi schemas with `.unknown(false)`
- **Log Redaction**: Sensitive data automatically redacted
- **Multi-tenant Isolation**: Row-level security policies

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/order.service.test.ts
```

Coverage thresholds are enforced:
- Global: 80% lines
- Critical paths: 90% lines

## Development

### Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── events/          # Event publishing/subscription
├── jobs/            # Background jobs
├── middleware/      # Express middleware
├── migrations/      # Database migrations
├── models/          # Database models
├── plugins/         # Fastify plugins
├── routes/          # Route definitions
├── services/        # Business logic
├── types/           # TypeScript types
├── utils/           # Utility functions
└── validators/      # Input validation schemas
```

### Adding New Routes

1. Create validation schema in `validators/`
2. Create controller in `controllers/`
3. Add route in `routes/` with auth and validation
4. Update this README

## Deployment

### Docker

```bash
docker build -t order-service .
docker run -p 3005:3005 order-service
```

### Kubernetes

The service exposes three probes:
- Startup: `/health/startup`
- Liveness: `/health/live`
- Readiness: `/health/ready`

## Troubleshooting

### Common Issues

1. **JWT_SECRET not configured**: Ensure `JWT_SECRET` env var is set (min 32 chars)
2. **Database connection failed**: Check `DATABASE_URL` and database accessibility
3. **Redis connection failed**: Check `REDIS_URL` and Redis accessibility

### Logs

Logs are output in JSON format with automatic redaction of sensitive fields.

## License

Proprietary - TicketToken
