# Contributing to Auth Service

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Start dependencies: `docker-compose up -d postgres redis`
5. Run migrations: `npm run migrate`
6. Start dev server: `npm run dev`

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add MFA backup codes
fix: handle expired refresh tokens
docs: update API documentation
test: add jwt.service tests
```

### Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure build passes: `npm run build`
5. Update documentation if needed
6. Submit PR to `develop`
7. Request review from at least one team member

## Code Standards

### TypeScript

- Use strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types on public functions
- No `any` without justification

### Testing

- Unit tests for all services
- Integration tests for API endpoints
- Minimum 80% coverage for new code
- Name tests descriptively: `should return 401 when token expired`

### Security

- Never log sensitive data (passwords, tokens, PII)
- Use parameterized queries (no string concatenation)
- Validate all inputs
- Follow OWASP guidelines

## Project Structure
```
src/
├── config/        # Configuration files
├── controllers/   # Route handlers
├── middleware/    # Express middleware
├── services/      # Business logic
├── utils/         # Utility functions
├── validators/    # Input validation schemas
├── errors/        # Custom error classes
└── routes/        # Route definitions
```

## Running Tests
```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Specific service
npm run test:auth
npm run test:jwt
```

## Questions?

- Check existing issues and discussions
- Ask in #auth-service Slack channel
- Tag @auth-team in your PR
