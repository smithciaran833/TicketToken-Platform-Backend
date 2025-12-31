# Venue Service

The Venue Service manages venue-related operations for the TicketToken platform, including venue profiles, settings, integrations with external systems (Stripe, Square, Toast), and venue-specific configurations.

## Overview

**Service Name:** `venue-service`  
**Default Port:** `3004`  
**Database:** PostgreSQL with multi-tenant RLS (Row Level Security)

## Features

- **Venue Management**: Create, read, update venue profiles with multi-tenant isolation
- **Stripe Connect Integration**: Onboard venues to Stripe Connect for payment processing
- **Third-Party Integrations**: Connect venues with Square, Toast, Mailchimp, Twilio
- **Settings Management**: Configure venue-specific settings (fees, limits, policies)
- **Internal Validation**: Service-to-service validation endpoints
- **Audit Logging**: Comprehensive audit trail for all venue operations

## API Endpoints

### Venues
- `GET /venues` - List venues (paginated)
- `GET /venues/:venueId` - Get venue by ID
- `POST /venues` - Create new venue
- `PUT /venues/:venueId` - Update venue
- `DELETE /venues/:venueId` - Delete venue

### Settings
- `GET /venues/:venueId/settings` - Get venue settings
- `PUT /venues/:venueId/settings` - Update venue settings

### Integrations
- `GET /venues/:venueId/integrations` - List integrations
- `POST /venues/:venueId/integrations` - Create integration
- `PUT /venues/:venueId/integrations/:integrationId` - Update integration
- `DELETE /venues/:venueId/integrations/:integrationId` - Delete integration

### Stripe Connect
- `POST /venues/:venueId/stripe/connect` - Initiate Stripe Connect onboarding
- `GET /venues/:venueId/stripe/status` - Get Connect account status
- `POST /venues/:venueId/stripe/refresh` - Refresh onboarding link
- `POST /webhooks/stripe` - Stripe webhook handler

### Internal
- `POST /internal/validate/venue` - Validate venue exists
- `POST /internal/validate/integration` - Validate integration

## Configuration

Environment variables are validated at startup using `envalid`. See `src/config/index.ts` for all available options.

### Required Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=6432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<secure-password>

# Security
JWT_SECRET=<your-jwt-secret>
INTERNAL_SERVICE_SECRET=<service-to-service-secret>

# Stripe
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET_VENUE=<webhook-secret>
```

### Optional Environment Variables

```env
# Server
NODE_ENV=production
PORT=3004
LOG_LEVEL=info

# Database
DB_SSL_MODE=require
DB_STATEMENT_TIMEOUT=30000
DB_LOCK_TIMEOUT=10000

# Security
FORCE_HTTPS=true
ALLOWED_URL_DOMAINS=tickettoken.com,*.tickettoken.com

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# External Services
EVENT_SERVICE_URL=http://event-service:3002
AUTH_SERVICE_URL=http://auth-service:3001
```

## Development

### Prerequisites

<!-- AUDIT FIX (RD3): Complete prerequisites documentation -->

**Required Software:**
- Node.js 20.x (LTS) - Required for native fetch, ESM support
- PostgreSQL 14+ with SSL support
- Redis 7+ (standalone or cluster mode)
- Docker & Docker Compose (for local development)

**Required Services:**
- PostgreSQL database with RLS-enabled schema
- Redis instance for caching and rate limiting
- Stripe account with Connect enabled (for payment processing)

**System Requirements:**
- Minimum 2GB RAM for local development
- Port 3004 available (configurable via PORT env var)
- Network access to other platform services

**Security Requirements:**
<!-- AUDIT FIX (DC2, DC3): Database credential documentation -->
- Each service MUST use unique database credentials (see Database Credentials section)
- Database user should have minimal required privileges (see Least Privilege section)

### Database Credentials (DC2)

**IMPORTANT:** Each service deployment MUST use unique database credentials:

```env
# Production - venue-service ONLY
DB_USER=venue_service_prod
DB_PASSWORD=<unique-secure-password>

# Staging - venue-service ONLY  
DB_USER=venue_service_staging
DB_PASSWORD=<unique-secure-password>
```

**Why unique credentials?**
- Audit trail: Track which service made database changes
- Blast radius: Compromised credentials only affect one service
- Access control: Revoke single service access without affecting others
- Compliance: Meet SOC2/PCI-DSS credential management requirements

### Least Privilege Access (DC3)

Database user for venue-service should have ONLY:

```sql
-- Required privileges (DO grant)
GRANT CONNECT ON DATABASE tickettoken_db TO venue_service;
GRANT USAGE ON SCHEMA public TO venue_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON venues, venue_settings, integrations TO venue_service;
GRANT SELECT ON events TO venue_service;  -- Read-only access to events
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO venue_service;

-- Privileges to DENY
REVOKE CREATE ON SCHEMA public FROM venue_service;
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM venue_service;
REVOKE SUPERUSER, CREATEDB, CREATEROLE FROM venue_service;
```

### Setup

```bash
# Install dependencies
npm install

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/tests/venue.test.ts
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Security Features

This service implements comprehensive security measures:

### Authentication & Authorization
- JWT-based authentication with tenant extraction
- API key authentication with SHA-256 hashing
- Service-to-service authentication with HMAC signatures
- Role-based access control (owner, manager, staff)

### Multi-Tenancy
- Row Level Security (RLS) policies with tenant isolation
- Tenant context middleware with UUID validation
- Explicit tenant filtering on all queries

### Input Validation
- UUID format validation on all route params
- Joi schema validation on request bodies
- Provider-specific credential schemas (no arbitrary properties)

### Error Handling
- RFC 7807 Problem Details format
- Correlation ID in all responses
- Rate limit headers (RateLimit-Limit/Remaining/Reset)

### Database Security
- SSL/TLS connections in production
- Statement timeout (30s) to prevent runaway queries
- Lock timeout to prevent deadlocks
- FOR UPDATE locking for critical operations

### HTTP Security
- HSTS headers in production
- HTTPS redirect support
- Security headers (X-Content-Type-Options, X-Frame-Options)
- Service identity headers on outbound requests

### Reliability
- Retry with exponential backoff and jitter
- Circuit breaker on external service calls
- Idempotency support for state-changing operations
- Webhook deduplication

## Architecture

```
src/
├── config/           # Configuration management
│   ├── index.ts      # Centralized config with validation
│   └── database.ts   # Database configuration
├── controllers/      # Route handlers
├── middleware/       # Express middleware
│   ├── auth.middleware.ts
│   ├── tenant.middleware.ts
│   └── idempotency.middleware.ts
├── migrations/       # Database migrations
├── routes/           # Route definitions
├── schemas/          # Joi validation schemas
├── services/         # Business logic
├── utils/            # Shared utilities
│   ├── error-handler.ts  # RFC 7807 errors
│   ├── httpClient.ts     # HTTP client with retry
│   ├── database-helpers.ts # Locking utilities
│   └── retry.ts          # Retry with backoff
└── tests/            # Test files
```

## Migrations

Run migrations with:

```bash
# Run pending migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Create new migration
npm run migrate:make <name>
```

## Monitoring

The service exposes Prometheus metrics at `/metrics`:

- `venue_operations_total` - Total venue operations by type
- `http_request_duration_seconds` - Request latency histogram
- `db_query_duration_seconds` - Database query latency

## License

Copyright © 2024 TicketToken. All rights reserved.
