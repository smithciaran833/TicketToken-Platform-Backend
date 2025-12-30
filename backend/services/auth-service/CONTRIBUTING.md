# Contributing to Auth-Service

## Development Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Local Development
```bash
# Install dependencies
npm install

# Start dependencies
docker-compose up -d postgres redis

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Write JSDoc comments for public functions

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add user profile endpoint
fix: correct password reset token expiry
docs: update API documentation
test: add MFA verification tests
refactor: simplify token generation
chore: update dependencies
```

### Pull Request Process

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Update documentation if needed
6. Request review from at least one team member

### Testing
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.service.test.ts

# Run in watch mode
npm run test:watch
```

### Database Migrations

See [MIGRATION_GUIDE.md](./docs/MIGRATION_GUIDE.md) for best practices.
```bash
# Create new migration
npm run migrate:make migration_name

# Run migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback
```

## Architecture

See [SERVICE_OVERVIEW.md](./docs/SERVICE_OVERVIEW.md) for detailed architecture documentation.

## Questions?

- Check existing issues and PRs
- Ask in #auth-service Slack channel
- Contact the platform team
