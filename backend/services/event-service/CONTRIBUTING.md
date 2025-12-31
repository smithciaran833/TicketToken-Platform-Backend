# Contributing to Event Service

Thank you for your interest in contributing to the Event Service! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Commit Message Format](#commit-message-format)
- [Architecture Guidelines](#architecture-guidelines)

---

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose (optional, for containerized development)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/tickettoken-platform.git
   cd tickettoken-platform/backend/services/event-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Set up JWT keys** (required for authentication)
   ```bash
   mkdir -p ~/tickettoken-secrets
   openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 2048
   openssl rsa -in ~/tickettoken-secrets/jwt-private.pem -pubout -out ~/tickettoken-secrets/jwt-public.pem
   ```

5. **Run database migrations**
   ```bash
   npm run migrate
   ```

6. **Start the service**
   ```bash
   npm run dev
   ```

### Using Docker

```bash
docker-compose up -d
```

---

## Code Style

We use TypeScript with strict mode enabled. Follow these guidelines:

### General Rules

- Use **TypeScript** for all new code
- Enable **strict mode** (`"strict": true` in tsconfig)
- Use **async/await** instead of raw promises
- Prefer **functional patterns** over classes where appropriate
- Use **meaningful variable names** (avoid single letters except in loops)

### Formatting

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Line length**: 100 characters max
- **Trailing commas**: Required in multi-line objects/arrays

We use ESLint and Prettier. Run before committing:

```bash
npm run lint
npm run format
```

### File Organization

```
src/
├── config/          # Configuration files
├── controllers/     # HTTP request handlers
├── middleware/      # Express/Fastify middleware
├── models/          # Database models
├── routes/          # Route definitions
├── services/        # Business logic
├── utils/           # Utility functions
├── validations/     # Input validation schemas
├── jobs/            # Background job definitions
└── types/           # TypeScript type definitions
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `event-service.ts` |
| Classes | PascalCase | `EventService` |
| Functions | camelCase | `createEvent` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_ATTEMPTS` |
| Interfaces | PascalCase (I prefix optional) | `EventData` or `IEventData` |
| Types | PascalCase | `EventStatus` |

---

## Pull Request Process

### Before Submitting

1. **Create an issue** first (if one doesn't exist)
2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Write tests** for new functionality
4. **Run the full test suite**:
   ```bash
   npm test
   ```
5. **Ensure linting passes**:
   ```bash
   npm run lint
   ```
6. **Update documentation** if needed

### PR Requirements

- [ ] Descriptive title following commit message format
- [ ] Link to related issue(s)
- [ ] Description of changes
- [ ] Screenshots (for UI changes)
- [ ] All tests passing
- [ ] No linting errors
- [ ] Documentation updated
- [ ] Breaking changes documented

### Review Process

1. Request review from at least one team member
2. Address all review comments
3. Squash commits if requested
4. Merge after approval

### Branch Naming

```
feature/   - New features
bugfix/    - Bug fixes
hotfix/    - Production hotfixes
docs/      - Documentation only
refactor/  - Code refactoring
test/      - Test additions/updates
```

---

## Testing Requirements

### Coverage Thresholds

All code must meet minimum coverage:

| Metric | Threshold |
|--------|-----------|
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |
| Statements | 80% |

### Test Types

1. **Unit Tests** (`tests/unit/`)
   - Test individual functions/classes in isolation
   - Mock external dependencies
   - Fast execution

2. **Integration Tests** (`tests/integration/`)
   - Test component interactions
   - Use real database (with transaction isolation)
   - May use mocked external services

3. **E2E Tests** (`tests/e2e/`)
   - Test full request/response cycle
   - Use test fixtures
   - Verify HTTP status codes and response bodies

4. **Contract Tests** (`tests/contract/`)
   - Pact consumer contracts for service dependencies
   - Ensure API compatibility

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test File Naming

```
*.test.ts      - Test files
*.spec.ts      - Alternative test files
setup.ts       - Test setup/fixtures
```

---

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, auxiliary tools |
| `ci` | CI/CD changes |

### Scopes (Optional)

- `api` - API changes
- `db` - Database changes
- `auth` - Authentication/authorization
- `events` - Event management
- `pricing` - Pricing functionality
- `capacity` - Capacity management

### Examples

```bash
feat(events): add event cancellation workflow

fix(pricing): correct dynamic pricing calculation

docs(api): update OpenAPI specification

test(capacity): add integration tests for reservation

refactor(auth): simplify token validation logic

chore: update dependencies
```

### Breaking Changes

Include `BREAKING CHANGE:` in the footer:

```
feat(api)!: change event response format

BREAKING CHANGE: The event response now includes nested pricing object
```

---

## Architecture Guidelines

### Key Principles

1. **Multi-tenancy**: All data is tenant-scoped via RLS
2. **Idempotency**: POST/PUT operations support Idempotency-Key header
3. **State Machine**: Events follow defined state transitions
4. **Circuit Breaker**: External service calls use circuit breaker pattern
5. **Structured Logging**: Use logger with context, avoid console.log

### Adding New Features

1. Review existing patterns in the codebase
2. Consider state machine implications for events
3. Add appropriate validation schemas
4. Include OpenAPI documentation
5. Write ADR if making architectural decisions

### Security Considerations

- Never log PII (logger auto-redacts sensitive fields)
- Use parameterized queries (never string concatenation)
- Validate all inputs with schemas
- Check tenant access for all operations
- Use service tokens for S2S communication

---

## Questions?

- Check existing documentation in `docs/`
- Review ADRs in `docs/adr/`
- Ask in the team Slack channel
- Open a discussion issue

Thank you for contributing! 🎉
