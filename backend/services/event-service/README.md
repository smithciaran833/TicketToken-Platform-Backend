# Event Service

Event management microservice for the TicketToken platform. Handles event creation, scheduling, pricing, capacity management, and state transitions.

## Features

- **Event CRUD Operations**: Create, read, update, delete events
- **Multi-tenant Support**: RLS-enforced tenant isolation
- **State Machine**: Proper event lifecycle management (DRAFT → PUBLISHED → ON_SALE → COMPLETED)
- **Capacity Management**: Track available tickets per event/section
- **Pricing Management**: Base prices, dynamic pricing, early bird, and group discounts
- **Blockchain Integration**: Solana event PDA creation for on-chain ticketing

## Quick Start

### Prerequisites

- **Node.js** >= 20.x ([Download](https://nodejs.org/))
- **PostgreSQL** 14+ ([Docker](https://hub.docker.com/_/postgres) or local install)
- **Redis** 6+ ([Docker](https://hub.docker.com/_/redis) or local install)
- **Docker & Docker Compose** (recommended for local development)
- **RabbitMQ** (optional, for async messaging)

### Local Development Setup

#### Option 1: Using Docker Compose (Recommended)

```bash
# Clone the repository (if not already)
cd backend/services/event-service

# Start all dependencies (PostgreSQL, Redis, RabbitMQ)
docker-compose up -d postgres redis rabbitmq

# Wait for services to be healthy
docker-compose ps

# Install Node.js dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env - the defaults work with docker-compose

# Run database migrations
npm run migrate

# Start development server with hot reload
npm run dev
```

#### Option 2: Manual Setup

1. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql@14
   brew services start postgresql@14
   
   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql
   
   # Create database
   createdb event_service
   ```

2. **Install Redis**
   ```bash
   # macOS
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt install redis-server
   sudo systemctl start redis
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local credentials
   ```

4. **Install dependencies and start**
   ```bash
   npm install
   npm run migrate
   npm run dev
   ```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:3003/health

# Expected response:
# {"status":"healthy","service":"event-service",...}

# Check metrics
curl http://localhost:3003/metrics

# Run tests
npm test
```

### Installation (Quick)

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Service port (default: 3002) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | Secret for JWT validation | Yes |
| `AUTH_SERVICE_URL` | Auth service URL | Yes |
| `VENUE_SERVICE_URL` | Venue service URL | Yes |

## API Endpoints

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/events` | List events |
| `GET` | `/api/v1/events/:id` | Get event by ID |
| `POST` | `/api/v1/events` | Create event |
| `PUT` | `/api/v1/events/:id` | Update event |
| `DELETE` | `/api/v1/events/:id` | Delete event |
| `POST` | `/api/v1/events/:id/publish` | Publish event |

### Pricing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/events/:eventId/pricing` | Get event pricing |
| `GET` | `/events/:eventId/pricing/active` | Get active pricing |
| `POST` | `/events/:eventId/pricing` | Create pricing tier |
| `PUT` | `/pricing/:id` | Update pricing |
| `POST` | `/pricing/:id/calculate` | Calculate price |

### Capacity

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/events/:eventId/capacity` | Get event capacity |
| `GET` | `/events/:eventId/capacity/total` | Get total capacity |
| `POST` | `/events/:eventId/capacity` | Create capacity section |
| `PUT` | `/capacity/:id` | Update capacity |
| `POST` | `/capacity/:id/check` | Check availability |
| `POST` | `/capacity/:id/reserve` | Reserve capacity |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |

## Event States

Events follow a defined state machine with the following states:

```
DRAFT → REVIEW → APPROVED → PUBLISHED → ON_SALE → IN_PROGRESS → COMPLETED
                                    ↓              ↓
                              SALES_PAUSED    SOLD_OUT
                                    ↓              ↓
                                    └──────┬───────┘
                                           ↓
                                      CANCELLED
```

### State Descriptions

| State | Description |
|-------|-------------|
| `DRAFT` | Initial state, event is being created |
| `REVIEW` | Event submitted for review |
| `APPROVED` | Event approved, ready to publish |
| `PUBLISHED` | Event is public but not on sale |
| `ON_SALE` | Tickets available for purchase |
| `SALES_PAUSED` | Sales temporarily paused |
| `SOLD_OUT` | All tickets sold |
| `IN_PROGRESS` | Event is currently happening |
| `COMPLETED` | Event has ended (terminal) |
| `CANCELLED` | Event cancelled (terminal) |
| `POSTPONED` | Event postponed |

## Architecture

### Directory Structure

```
src/
├── config/           # Configuration files
├── controllers/      # Route handlers
├── middleware/       # Express/Fastify middleware
│   ├── auth.ts              # Authentication
│   ├── tenant.ts            # Multi-tenant context
│   ├── api-key.middleware.ts # S2S authentication
│   ├── idempotency.middleware.ts # Idempotency
│   └── error-handler.ts     # Error handling
├── migrations/       # Database migrations
├── models/           # Data models
├── routes/           # Route definitions
├── schemas/          # JSON Schema validation
├── services/         # Business logic
│   ├── event.service.ts
│   ├── event-state-machine.ts
│   ├── pricing.service.ts
│   └── capacity.service.ts
├── types/            # TypeScript types
├── utils/            # Utility functions
└── validations/      # Input validation
```

### Multi-Tenancy

This service implements Row-Level Security (RLS) for tenant isolation:

1. **Middleware**: `tenantHook` extracts tenant_id from JWT and sets `app.current_tenant_id` in PostgreSQL
2. **RLS Policies**: All tenant tables have RLS policies that filter by `current_setting('app.current_tenant_id')`
3. **Defense in Depth**: Service layer also filters by tenant_id

### Security Features

- **JWT Authentication**: All routes require valid JWT
- **API Key Authentication**: Service-to-service calls use API keys
- **Input Validation**: JSON Schema validation on all inputs with `additionalProperties: false`
- **SQL Injection Prevention**: Parameterized queries via Knex
- **Error Sanitization**: Internal errors never exposed to clients

## Development

### Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run migrate      # Run database migrations
npm run migrate:rollback # Rollback last migration
npm run typecheck    # TypeScript type checking
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- event.service.test.ts
```

## Migrations

### Creating a Migration

```bash
npm run migrate:make -- migration_name
```

### Running Migrations

```bash
npm run migrate
```

### Rolling Back

```bash
npm run migrate:rollback
```

## Deployment

### Docker

```bash
docker build -t event-service .
docker run -p 3002:3002 --env-file .env event-service
```

### Health Checks

The service exposes `/health` for liveness probes. It checks:
- Database connectivity
- Redis connectivity

**Note**: External services (auth-service, venue-service) are NOT checked in health to prevent cascading failures.

## Troubleshooting

### Common Issues

1. **"tenant_id is required for searchEvents"**: Ensure authenticated requests include tenant context
2. **"Cannot transition from terminal state"**: COMPLETED/CANCELLED events cannot change state
3. **Database connection errors**: Check DATABASE_URL and PostgreSQL availability

### Logging

Logs are structured JSON via Pino. Set `LOG_LEVEL` environment variable:
- `debug`: Verbose logging
- `info`: Standard operations (default)
- `warn`: Warnings only
- `error`: Errors only

## Contributing

1. Create feature branch from `main`
2. Make changes with tests
3. Ensure `npm run typecheck` passes
4. Submit PR for review

## License

Proprietary - TicketToken Platform
