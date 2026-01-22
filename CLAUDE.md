# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TicketToken Platform is an NFT-based ticketing platform built as a monorepo with:
- **Backend**: 22+ microservices (Node.js + TypeScript + Fastify)
- **Frontend**: Next.js applications (Turbo monorepo)
- **SDKs**: TypeScript, JavaScript, and React packages (Lerna monorepo)
- **Databases**: PostgreSQL (primary), MongoDB (content), Redis (caching)

## Common Commands

### Backend Services (in `backend/services/<service>/`)

```bash
npm run dev              # Run with tsx watch (hot reload)
npm run build            # Compile TypeScript
npm test                 # Run unit tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:integration # Integration tests (uses Testcontainers)
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix linting
npm run typecheck        # TypeScript check (no emit)
npm run migrate          # Apply database migrations
npm run migrate:rollback # Rollback last migration
npm run migrate:make     # Create new migration
```

### Run specific test file
```bash
npm test -- path/to/test.ts
npm run test:integration -- tests/integration/specific.test.ts
```

### Frontend (in `frontend/`)
```bash
npm run dev              # Dev mode (all apps)
npm run build            # Build all
turbo dev --filter=web   # Dev specific app
```

### SDKs (in `packages/`)
```bash
npm run build            # Build all packages (Lerna)
npm test                 # Test all packages
npm run lint             # Lint all
```

### Docker/Make (root)
```bash
make up                  # Start all services
make down                # Stop all services
make logs                # Stream logs
make clean               # Remove containers/volumes
```

## Architecture

### Service Structure
Every backend service follows this pattern:
```
src/
├── index.ts             # Entry point
├── app.ts               # Fastify app setup
├── config/
│   ├── env.ts           # Environment validation (Zod)
│   └── dependencies.ts  # Awilix DI container
├── controllers/         # HTTP request handlers
├── services/            # Business logic
├── routes/              # Route definitions
├── middleware/          # Custom middleware
├── validators/          # Request/response schemas
├── migrations/          # Knex migrations
└── errors/              # Custom error types
```

### Request Flow
Routes → Controllers → Services → Repositories → Database

### Key Patterns

**Dependency Injection**: Awilix container configured per service
```typescript
const container = createDependencyContainer();
app.decorate('container', container);
```

**Multi-tenancy**: Row-Level Security (RLS) at database layer
- Tenant context set via `app.current_tenant_id` in middleware
- PostgreSQL RLS policies enforce isolation

**Service-to-Service Communication**:
- HTTP with circuit breaker (Opossum)
- S2S JWT authentication (RS256, 24h TTL)
- RabbitMQ for async events

**Error Handling**: Custom error classes with `statusCode` and `code` properties

### Database

- **PostgreSQL 16**: Primary RDBMS with RLS, triggers, partitions
- **PgBouncer**: Connection pooling (port 6432)
- **MongoDB**: Content documents (reviews, comments)
- **Redis**: Sessions, caching, rate limits, job queues (Bull)

### Testing

- **Unit tests**: Jest with @swc/jest, mocked dependencies
- **Integration tests**: Testcontainers (PostgreSQL, MongoDB, Redis)
- **Test files**: `tests/unit/` and `tests/integration/`
- **Run with `--runInBand`** for integration tests to avoid port conflicts

### Authentication

- JWT (RS256) for user auth (15m access, 7d refresh)
- MFA support (TOTP, biometric)
- Separate S2S JWT keypair for inter-service calls

## Commit Style

Use emoji prefixes (optional):
- ✨ `:sparkles:` - New features
- 🐛 `:bug:` - Bug fixes
- 🔒 `:lock:` - Security fixes
- ⚡ `:zap:` - Performance
- 📝 `:memo:` - Documentation
- ✅ `:white_check_mark:` - Tests

Limit first line to 72 characters.

## Key Files

- `backend/shared/` - Shared utilities, middleware, http-client with circuit breaker
- `docker-compose.yml` - Local development stack
- `database/postgresql/` - Core DB functions, indexes, views, RLS policies
