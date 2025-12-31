# Auth Service Onboarding

Welcome to the auth-service team! This guide will help you get started.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL client (psql)
- Redis client (redis-cli)
- Git

## Local Development Setup

### 1. Clone and Install
```bash
git clone https://github.com/tickettoken/tickettoken-platform.git
cd tickettoken-platform/backend/services/auth-service
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```

Edit `.env` with your local settings:
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/auth_dev
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=<base64-encoded-key>
JWT_PUBLIC_KEY=<base64-encoded-key>
```

### 3. Start Dependencies
```bash
docker-compose up -d postgres redis
```

### 4. Run Migrations
```bash
npm run migrate
```

### 5. Start Development Server
```bash
npm run dev
```

The service will be available at `http://localhost:3001`

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /health | Health check |
| GET /metrics | Prometheus metrics |
| GET /docs | Swagger UI |
| POST /auth/register | User registration |
| POST /auth/login | User login |
| POST /auth/refresh | Token refresh |

## Architecture Overview
```
┌─────────────────────────────────────────────────────┐
│                    API Gateway                       │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                    Auth Service                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │Controller│→│ Service │→│   DB    │            │
│  └─────────┘  └─────────┘  └─────────┘            │
│       │            │                               │
│       ▼            ▼                               │
│  ┌─────────┐  ┌─────────┐                         │
│  │  JWT    │  │  Redis  │                         │
│  └─────────┘  └─────────┘                         │
└─────────────────────────────────────────────────────┘
```

## Key Concepts

### JWT Tokens
- Access tokens: Short-lived (15 min), used for API auth
- Refresh tokens: Long-lived (7 days), used to get new access tokens
- Signed with RS256 (asymmetric)

### Multi-Tenancy
- All users belong to a tenant
- RLS enforces data isolation
- Tenant ID in JWT claims

### MFA
- TOTP-based (Google Authenticator compatible)
- Backup codes for recovery

## Running Tests
```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Specific test
npm test -- auth.service
```

## Common Tasks

### Generate JWT Keys
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
base64 -w 0 private.pem > private.b64
base64 -w 0 public.pem > public.b64
```

### Create a Migration
```bash
npm run migrate:make -- add_new_column
```

### Access Local Database
```bash
psql $DATABASE_URL
```

## Resources

- [API Documentation](/docs) (when running locally)
- [Architecture Docs](ARCHITECTURE.md)
- [Error Codes](ERROR_CODES.md)
- [ADRs](adr/)

## Getting Help

- Slack: #auth-service
- Team Lead: @auth-lead
- On-Call: Check PagerDuty schedule
