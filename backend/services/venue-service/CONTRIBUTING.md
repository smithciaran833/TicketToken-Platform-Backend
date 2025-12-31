# Contributing to Venue Service

Thank you for your interest in contributing to the Venue Service! This document provides guidelines and best practices for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Security](#security)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please read and follow our Code of Conduct in all interactions.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- Git

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tickettoken/platform.git
   cd platform/backend/services/venue-service
   ```

2. **Install dependencies:**
   ```bash
   npm ci
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start dependencies:**
   ```bash
   docker-compose up -d postgres redis
   ```

5. **Run migrations:**
   ```bash
   npm run migrate
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

## Making Changes

### Code Style

- We use TypeScript with strict mode enabled
- Follow the ESLint configuration provided
- Use Prettier for code formatting
- Write meaningful commit messages following [Conventional Commits](https://www.conventionalcommits.org/)

### Testing Requirements

All changes must include appropriate tests:

- **Unit tests:** For utility functions and business logic
- **Integration tests:** For API endpoints and database operations
- **Security tests:** For authentication/authorization changes

Run tests before submitting:
```bash
npm test
npm run test:coverage
```

### Security Considerations

**IMPORTANT:** Review our [SECURITY.md](SECURITY.md) before contributing.

- Never commit secrets, credentials, or API keys
- Validate all user inputs
- Use parameterized queries to prevent SQL injection
- Follow the principle of least privilege
- Add tenant isolation checks for all new features

### Database Changes

1. Create timestamped migration files:
   ```bash
   npm run migrate:create -- add_feature_name
   ```

2. Keep migrations small and focused (one logical change per file)

3. Always include a `down` migration for rollbacks

4. Test migrations in both directions:
   ```bash
   npm run migrate:latest
   npm run migrate:rollback
   npm run migrate:latest
   ```

## Security

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. Email security@tickettoken.io with details
3. See [SECURITY.md](SECURITY.md) for our responsible disclosure policy

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Write tests** for your changes

4. **Run the full test suite:**
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

5. **Update documentation** if needed

6. **Submit a Pull Request:**
   - Fill out the PR template completely
   - Link any related issues
   - Request review from appropriate team members

### PR Review Criteria

- All tests pass
- Code follows style guidelines
- Security considerations addressed
- Documentation updated
- No decrease in test coverage
- Performance impact considered

## Questions?

- Open a Discussion on GitHub
- Reach out to the team on Slack (#venue-service)

Thank you for contributing! 🎉
