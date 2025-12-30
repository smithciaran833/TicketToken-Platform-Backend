# Auth Service

Authentication and authorization service for the TicketToken platform.

## Overview

The auth-service handles all authentication, authorization, and user identity management for the TicketToken platform. It provides JWT-based authentication, multi-factor authentication (MFA), OAuth integration, wallet-based authentication, and role-based access control (RBAC).

## Features

- **JWT Authentication** - Access and refresh token management with rotation support
- **Multi-Factor Authentication** - TOTP-based MFA with backup codes
- **OAuth Integration** - Google and GitHub social login
- **Wallet Authentication** - Solana wallet-based login/registration
- **Role-Based Access Control** - Granular permissions with venue-level roles
- **Session Management** - Track and revoke user sessions
- **Biometric Authentication** - WebAuthn/FIDO2 support
- **Rate Limiting** - Protection against brute force attacks
- **Audit Logging** - Comprehensive security event logging

## Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Fastify
- **Language:** TypeScript
- **Database:** PostgreSQL (with Row-Level Security)
- **Cache:** Redis
- **Auth:** JWT (RS256), OAuth 2.0
- **Docs:** OpenAPI/Swagger

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

## Quick Start

### Local Development
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npx knex migrate:latest

# Start development server
npm run dev
```

### Using Docker
```bash
# Build image
docker build -t auth-service .

# Run with docker-compose (from repo root)
docker-compose up auth-service
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Service port | `3001` |
| `LOG_LEVEL` | Logging level | `info` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `6432` |
| `DB_NAME` | Database name | `tickettoken_db` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_PRIVATE_KEY` | RSA private key for JWT signing | - |
| `JWT_PUBLIC_KEY` | RSA public key for JWT verification | - |
| `JWT_ACCESS_EXPIRY` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry | `7d` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | - |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | - |

## API Documentation

When running locally, API documentation is available at:
- **Swagger UI:** http://localhost:3001/docs
- **OpenAPI JSON:** http://localhost:3001/docs/json

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | User login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/verify-email` | Verify email address |
| POST | `/auth/oauth/:provider/callback` | OAuth callback |
| POST | `/auth/wallet/nonce` | Get wallet auth nonce |
| POST | `/auth/wallet/register` | Register with wallet |
| POST | `/auth/wallet/login` | Login with wallet |

### Authenticated Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/me` | Get current user |
| GET | `/auth/verify` | Verify token validity |
| POST | `/auth/logout` | Logout user |
| PUT | `/auth/change-password` | Change password |
| GET | `/auth/profile` | Get user profile |
| PUT | `/auth/profile` | Update user profile |
| GET | `/auth/sessions` | List active sessions |
| DELETE | `/auth/sessions/:id` | Revoke specific session |
| DELETE | `/auth/sessions/all` | Revoke all sessions |

### MFA Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/mfa/setup` | Initialize MFA setup |
| POST | `/auth/mfa/verify-setup` | Complete MFA setup |
| POST | `/auth/mfa/verify` | Verify MFA code |
| DELETE | `/auth/mfa/disable` | Disable MFA |
| POST | `/auth/mfa/regenerate-backup-codes` | Regenerate backup codes |

## Health Checks

| Endpoint | Description |
|----------|-------------|
| `/health/live` | Liveness probe (is the service running?) |
| `/health/ready` | Readiness probe (can the service handle requests?) |
| `/health/startup` | Startup probe (has the service initialized?) |
| `/health/pressure` | Load status (under-pressure check) |

## Testing
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Project Structure
```
src/
├── config/           # Configuration files
│   ├── database.ts   # Database connection
│   ├── redis.ts      # Redis connection
│   ├── env.ts        # Environment variables
│   ├── oauth.ts      # OAuth providers config
│   ├── secrets.ts    # Secrets manager
│   ├── swagger.ts    # OpenAPI config
│   └── tracing.ts    # OpenTelemetry config
├── controllers/      # Request handlers
├── middleware/       # Fastify middleware
│   ├── auth.middleware.ts      # JWT verification
│   ├── tenant.middleware.ts    # Multi-tenant RLS
│   ├── validation.middleware.ts # Input validation
│   └── correlation.middleware.ts # Request tracing
├── services/         # Business logic
├── routes/           # Route definitions
├── models/           # Data models
├── validators/       # Input validation schemas
├── errors/           # Custom error classes
├── utils/            # Utility functions
│   ├── circuit-breaker.ts # External call protection
│   ├── http-client.ts     # HTTP client with retry
│   └── logger.ts          # Structured logging
├── migrations/       # Database migrations
├── app.ts            # Fastify app setup
└── index.ts          # Entry point
```

## Security Features

- **Row-Level Security (RLS)** - Database-enforced tenant isolation
- **Rate Limiting** - Per-endpoint and per-IP rate limits
- **Circuit Breakers** - Protection against cascade failures
- **Correlation IDs** - Request tracing across services
- **Audit Logging** - Security event tracking
- **HSTS** - HTTP Strict Transport Security
- **Input Validation** - Joi schema validation on all inputs

## Monitoring

- **Metrics:** Prometheus metrics at `/metrics`
- **Tracing:** OpenTelemetry integration
- **Logging:** Structured JSON logs with correlation IDs
- **Health:** Kubernetes-compatible health probes

## Related Documentation

- [SERVICE_OVERVIEW.md](./SERVICE_OVERVIEW.md) - Detailed service documentation
- [docs/AUDIT_FINDINGS.md](./docs/AUDIT_FINDINGS.md) - Security audit results
- [docs/REMEDIATION_PLAN.md](./docs/REMEDIATION_PLAN.md) - Remediation roadmap

## License

Proprietary - TicketToken Inc.
