# Contributing to Compliance Service

**AUDIT FIX: DOC-H4**

Thank you for your interest in contributing to the Compliance Service! This document provides guidelines and best practices for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Security Considerations](#security-considerations)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the project's security guidelines

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker (recommended)

### Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd backend/services/compliance-service
```

2. Install dependencies:
```bash
npm ci
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start dependencies:
```bash
docker-compose up -d postgres redis
```

5. Run migrations:
```bash
npm run migrate
```

6. Start development server:
```bash
npm run dev
```

## Making Changes

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `security/` - Security-related changes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `security`: Security fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(gdpr): add data export endpoint
fix(auth): resolve JWT validation issue
security(webhook): implement HMAC verification
```

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following coding standards
3. **Add tests** for new functionality
4. **Update documentation** as needed
5. **Run all tests** locally: `npm test`
6. **Run linter**: `npm run lint`
7. **Create PR** with clear description

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No sensitive data in code
- [ ] Migrations are reversible
- [ ] No breaking API changes (or documented)

## Coding Standards

### TypeScript

- Use strict mode
- Avoid `any` type - use proper typing
- Use `.strict()` on Zod schemas
- Handle all error cases

### Security

- Never commit secrets
- Use parameterized queries
- Validate all inputs
- Sanitize all outputs
- Use HMAC for webhooks
- Implement proper authorization

### Error Handling

```typescript
// Good: RFC 7807 format
return reply.code(400).send({
  type: 'urn:error:compliance-service:validation',
  title: 'Validation Error',
  status: 400,
  detail: 'Invalid venue ID format',
  instance: request.requestId
});

// Bad: Exposing internal details
return reply.code(500).send({
  error: error.message,
  stack: error.stack
});
```

### Logging

```typescript
// Good: Structured logging
logger.info({
  requestId: request.requestId,
  userId: user.id,
  action: 'gdpr_export'
}, 'Data export requested');

// Bad: Logging sensitive data
logger.info(`User ${user.email} SSN ${user.ssn} exported data`);
```

## Testing Requirements

### Coverage Thresholds

- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Test Types

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test API endpoints
3. **Security Tests**: Test auth/authz

### Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Security Considerations

### Sensitive Data

The compliance service handles sensitive data including:
- Tax information (EIN, SSN)
- Bank account details
- GDPR personal data

**Never**:
- Log sensitive fields
- Store unencrypted PII
- Skip input validation
- Bypass authorization

### Authentication

All endpoints require authentication except:
- `/health`
- `/health/live`
- `/health/ready`
- `/metrics` (internal network only)

### Authorization

Use appropriate middleware:
- `requireAuth` - Basic authentication
- `requireComplianceOfficer` - Compliance officer role
- `requireAdmin` - Admin role

## Architecture Decisions

Major architectural decisions are documented in ADRs located in `docs/adr/`.

## Getting Help

- Check existing issues
- Review documentation
- Ask in team chat
- Create a new issue

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
