# Developer Onboarding Guide (ON1)

Welcome to the Venue Service team! This guide will help you get started with development.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Architecture Overview](#architecture-overview)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Common Tasks](#common-tasks)
8. [Resources](#resources)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x LTS | Runtime |
| npm | 9.x+ | Package manager |
| Docker | 20.x+ | Container runtime |
| Docker Compose | 2.x+ | Multi-container orchestration |
| PostgreSQL client | 15+ | Database access (optional) |
| Redis CLI | 7.x | Cache debugging (optional) |

### Accounts & Access

Request access to:
- [ ] GitHub repository (tickettoken/platform)
- [ ] Slack channels (#venue-service, #platform-team, #deployments)
- [ ] Jira project (VENUE)
- [ ] 1Password vault (Platform Engineering)
- [ ] Datadog dashboard access
- [ ] Staging environment

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone git@github.com:tickettoken/platform.git
cd platform/backend/services/venue-service
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit with your local values (or use defaults for Docker)
```

Key environment variables:

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/venue_service
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017/venue_service

# Optional (defaults work for local dev)
NODE_ENV=development
PORT=3004
LOG_LEVEL=debug
```

### 4. Start Infrastructure (Docker)

```bash
# From the repository root
docker-compose up -d postgres redis mongodb

# Or just run everything including the service
docker-compose up -d venue-service
```

### 5. Run Database Migrations

```bash
npm run migrate
```

### 6. Seed Development Data (Optional)

```bash
npm run seed:dev
```

### 7. Start the Service

```bash
# Development mode with hot reload
npm run dev

# Or production-like mode
npm run build && npm start
```

### 8. Verify Setup

```bash
# Health check
curl http://localhost:3004/health

# Expected output:
# {"status":"ok","timestamp":"...","version":"..."}
```

---

## Architecture Overview

### Service Structure

```
venue-service/
├── src/
│   ├── app.ts              # Fastify application setup
│   ├── index.ts            # Entry point
│   ├── config/             # Configuration modules
│   ├── controllers/        # Request handlers
│   ├── middleware/         # Auth, rate-limit, tenant
│   ├── migrations/         # Database migrations
│   ├── routes/             # Route definitions
│   ├── schemas/            # Validation schemas
│   ├── services/           # Business logic
│   └── utils/              # Utilities (logger, errors, etc.)
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── e2e/                # End-to-end tests
│   ├── load/               # Load tests (k6)
│   ├── security/           # Security tests
│   └── contract/           # API contract tests
├── docs/
│   ├── api/                # API documentation
│   ├── architecture/       # Architecture diagrams
│   ├── adr/                # Architecture Decision Records
│   └── runbooks/           # Operational runbooks
└── migrations/             # SQL migration files
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `src/index.ts` | Starts the server |
| Application | `src/app.ts` | Fastify setup, plugins, routes |
| Auth Middleware | `src/middleware/auth.middleware.ts` | JWT verification |
| Tenant Middleware | `src/middleware/tenant.middleware.ts` | Multi-tenant RLS |
| Database Config | `src/config/database.ts` | PostgreSQL connection pool |
| Redis Config | `src/config/redis.ts` | Redis cluster/HA setup |
| Error Handler | `src/utils/error-handler.ts` | Centralized error handling |
| Logger | `src/utils/logger.ts` | Structured logging (Pino) |

### Data Flow

```
Request → API Gateway → Auth Middleware → Tenant Middleware → Controller → Service → Database
                                                                    ↓
                                                              Cache Service
```

### Multi-Tenant Architecture

We use PostgreSQL Row-Level Security (RLS) for tenant isolation:

1. Tenant ID extracted from JWT in auth middleware
2. Tenant context set via `SET LOCAL app.tenant_id = 'uuid'`
3. RLS policies automatically filter all queries by tenant

See: `docs/adr/ADR-001-multi-tenant-rls.md`

---

## Development Workflow

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/VENUE-123-add-feature

# Make changes and commit
git add .
git commit -m "feat(venues): add feature description

VENUE-123"

# Push and create PR
git push -u origin feature/VENUE-123-add-feature
```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Request Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] TypeScript types correct
- [ ] PR description clear
- [ ] Linked to Jira ticket

### Code Review Guidelines

- Focus on correctness, security, and maintainability
- Be constructive and specific
- Approve only when ready to merge

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires Docker)
npm run test:integration

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Specific file
npm test -- tests/unit/venues.test.ts
```

### Test Structure

```typescript
// Unit test example
describe('VenueService', () => {
  describe('createVenue', () => {
    it('should create a venue with valid data', async () => {
      // Arrange
      const input = { name: 'Test Venue', ... };
      
      // Act
      const result = await venueService.createVenue(input);
      
      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Venue');
    });

    it('should throw error for duplicate slug', async () => {
      // Test error cases
    });
  });
});
```

### Load Testing

```bash
# Install k6
brew install k6  # or download from k6.io

# Run load tests
k6 run tests/load/venue.load.test.js
```

---

## Debugging

### Local Debugging (VS Code)

1. Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Venue Service",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 9229,
      "cwd": "${workspaceFolder}/backend/services/venue-service",
      "console": "integratedTerminal"
    }
  ]
}
```

2. Set breakpoints in VS Code
3. Press F5 to start debugging

### Viewing Logs

```bash
# Local development
npm run dev  # Logs to console with pretty printing

# Production-style logs
LOG_LEVEL=debug npm start

# Docker logs
docker-compose logs -f venue-service
```

### Database Queries

```bash
# Connect to local database
psql $DATABASE_URL

# Useful queries
SELECT * FROM venues WHERE tenant_id = 'uuid';
SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;

# Check RLS is working
SET LOCAL app.tenant_id = 'tenant-uuid';
SELECT * FROM venues;  -- Only shows tenant's venues
```

### Redis Debugging

```bash
redis-cli

# Check cache keys
KEYS venue:*

# View key value
GET venue:cache:venue-id

# Monitor real-time
MONITOR
```

---

## Common Tasks

### Adding a New Endpoint

1. **Define schema** in `src/schemas/`:
```typescript
export const createWidgetSchema = z.object({
  name: z.string().min(1).max(255),
});
```

2. **Create controller** in `src/controllers/`:
```typescript
export async function createWidget(request, reply) {
  const widget = await widgetService.create(request.body);
  return reply.status(201).send(widget);
}
```

3. **Add route** in `src/routes/`:
```typescript
app.post('/widgets', { schema: createWidgetSchema }, createWidget);
```

4. **Add tests**
5. **Update API documentation**

### Adding a Database Migration

```bash
# Create migration file
npm run migrate:make add_widgets_table

# Edit the generated file in src/migrations/
# Then run:
npm run migrate

# Rollback if needed:
npm run migrate:rollback
```

### Adding a New Service Dependency

```bash
# Add to package.json
npm install some-package

# Add types if needed
npm install -D @types/some-package

# Update tests mocks if necessary
```

---

## Resources

### Documentation

- [API Reference](./docs/api/README.md)
- [Error Codes](./docs/api/error-codes.md)
- [Architecture Diagrams](./docs/architecture/)
- [ADRs](./docs/adr/)
- [Runbooks](./docs/runbooks/)

### External Resources

- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Knex.js Query Builder](https://knexjs.org/)
- [Zod Schema Validation](https://zod.dev/)
- [Stripe Connect Docs](https://stripe.com/docs/connect)

### Team Resources

- **Weekly Sync**: Tuesdays 10am EST
- **On-Call Rotation**: PagerDuty schedule
- **Slack**: #venue-service, #platform-team
- **Wiki**: [Confluence - Venue Service](https://tickettoken.atlassian.net/wiki/venue-service)

### Getting Help

1. Check this documentation
2. Search existing Jira tickets
3. Ask in #venue-service Slack channel
4. Pair with a team member

---

## First Week Checklist

- [ ] Complete local setup
- [ ] Run tests successfully
- [ ] Create first "Hello World" PR (fix typo, add comment)
- [ ] Review recent PRs to understand code style
- [ ] Shadow an on-call engineer
- [ ] Complete security training
- [ ] Set up local debugging

Welcome to the team! 🎉
