# Ticket Service - Developer Onboarding

Welcome to the Ticket Service team! This guide will help you get up to speed quickly.

## Overview

The Ticket Service is responsible for:
- Ticket purchasing and inventory management
- NFT minting on Solana blockchain
- QR code generation for event entry
- Ticket transfers between users
- Check-in validation at venues

## Quick Start

### Prerequisites

Before starting, ensure you have:

- [ ] Node.js 18+ installed
- [ ] Docker Desktop installed
- [ ] Access to GitHub repository
- [ ] Access to 1Password vault (credentials)
- [ ] VPN access configured

### First Day Setup

```bash
# 1. Clone the repository
git clone git@github.com:tickettoken/platform.git
cd platform/backend/services/ticket-service

# 2. Copy environment file
cp .env.example .env

# 3. Get secrets from 1Password
# Look for "Ticket Service Dev" in 1Password

# 4. Install dependencies
npm install

# 5. Start local infrastructure
docker-compose up -d

# 6. Run database migrations
npm run migrate

# 7. Start development server
npm run dev

# 8. Verify it works
curl http://localhost:3004/health
```

## Architecture

### System Context

```
                    ┌─────────────┐
                    │  API Gateway│
                    └──────┬──────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌──────────┐        ┌─────────────┐        ┌───────────┐
│  Auth    │        │   Ticket    │        │   Event   │
│  Service │◀──────▶│   Service   │◀──────▶│   Service │
└──────────┘        └──────┬──────┘        └───────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐     ┌───────────┐    ┌───────────┐
    │PostgreSQL│    │   Redis   │    │ RabbitMQ  │
    └─────────┘     └───────────┘    └───────────┘
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Routes | API endpoint definitions | `src/routes/` |
| Services | Business logic | `src/services/` |
| Middleware | Request processing | `src/middleware/` |
| Schemas | Input validation | `src/schemas/` |
| Migrations | Database changes | `src/migrations/` |

## Development Workflow

### Branch Strategy

```
main          ──●──────────●──────────●────▶ Production
               │            │          │
develop       ─┴─●──●──●────┴──●──●────┴──▶ Staging
                 │     │        │
feature/xxx    ──┴─────┴────────┴──────────▶ Feature work
```

### Making Changes

1. **Create branch from develop**
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/TKT-123-add-feature
   ```

2. **Make changes with tests**
   ```bash
   # Write code
   # Add tests
   npm run test:watch
   ```

3. **Commit with conventional commits**
   ```bash
   git commit -m "feat(purchase): add bulk purchase endpoint"
   ```

4. **Push and create PR**
   ```bash
   git push -u origin feature/TKT-123-add-feature
   # Create PR in GitHub
   ```

### Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests (requires Docker)
npm run test:integration

# Run specific test file
npm test -- src/services/ticketService.test.ts

# Run with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Type check
npm run typecheck
```

## Key Concepts

### Multi-Tenancy

Every request must include a tenant context:
- JWT token contains `tenantId`
- All database queries filter by tenant
- RLS policies enforce isolation

```typescript
// Good - tenant context from JWT
const tickets = await db('tickets')
  .where('tenant_id', request.tenantId);

// Bad - no tenant context
const tickets = await db('tickets'); // RLS will block!
```

### Idempotency

State-changing operations must be idempotent:

```typescript
// Client sends idempotency key
POST /tickets/purchase
Idempotency-Key: purchase-user123-event456-timestamp
```

### Blockchain Integration

Tickets are minted as NFTs on Solana:
1. Database record created (status: `pending`)
2. Mint transaction queued
3. Blockchain confirmation received
4. Database updated (status: `minted`)

See `src/services/solanaService.ts` for details.

## Common Tasks

### Adding a New Endpoint

1. Create schema in `src/schemas/`
2. Create route in `src/routes/`
3. Implement logic in `src/services/`
4. Add tests
5. Update OpenAPI spec

### Adding a Migration

```bash
npm run migrate:make add_new_column

# Edit the generated file in src/migrations/
# Include both up() and down() functions
```

### Debugging

```bash
# Start with debugging
npm run dev:debug

# Attach debugger in VS Code
# Use "Node: Attach" launch configuration
```

### Viewing Logs

```bash
# Development
npm run dev | pino-pretty

# Production (via kubectl)
kubectl logs -f deployment/ticket-service -n production
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `REDIS_URL` | Redis connection | Yes |
| `RABBITMQ_URL` | RabbitMQ connection | Yes |
| `JWT_SECRET` | JWT signing key | Yes |
| `SOLANA_RPC_ENDPOINTS` | Blockchain RPCs | Yes |

See `.env.example` for complete list.

## Useful Resources

### Documentation

- [README](../README.md) - Service overview
- [OpenAPI Spec](./openapi.yaml) - API documentation
- [ADRs](./adr/) - Architecture decisions
- [Runbooks](./runbooks/) - Operational procedures

### External Tools

- **Grafana**: http://grafana.tickettoken.io
- **Jaeger**: http://jaeger.tickettoken.io
- **RabbitMQ**: http://rabbitmq.tickettoken.io
- **Swagger UI**: http://localhost:3004/docs

### Team Resources

- **Slack**: #ticket-service
- **Jira**: TKT project
- **Confluence**: Ticket Service space
- **On-Call**: PagerDuty

## Common Issues

### Database Connection Failed

```
Error: Connection refused (localhost:5432)
```

**Solution**: Start PostgreSQL
```bash
docker-compose up -d postgres
```

### Redis Connection Failed

```
Error: ECONNREFUSED redis://localhost:6379
```

**Solution**: Start Redis
```bash
docker-compose up -d redis
```

### Migration Failed

```
Error: relation "tickets" already exists
```

**Solution**: Check migration status
```bash
npm run migrate:status
npm run migrate:rollback
npm run migrate:latest
```

## Getting Help

1. Check this documentation
2. Search existing issues in GitHub
3. Ask in #ticket-service Slack
4. Pair with a team member

## First Week Checklist

- [ ] Complete local setup
- [ ] Run all tests successfully
- [ ] Review OpenAPI documentation
- [ ] Read ADR documents
- [ ] Understand multi-tenancy model
- [ ] Understand blockchain integration
- [ ] Complete first PR (starter task)
- [ ] Attend team standup
- [ ] Review recent PRs

Welcome to the team! 🎉
