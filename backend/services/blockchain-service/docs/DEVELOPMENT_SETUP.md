# Development Setup Guide

This document explains how to set up the development environment for the blockchain-service, including pre-commit hooks, dependency management, and CI/CD integration.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Pre-commit Hooks](#pre-commit-hooks)
- [Dependency Management](#dependency-management)
- [CI/CD Pipeline](#cicd-pipeline)
- [Branch Protection](#branch-protection)

## Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Git 2.x or later
- Access to PostgreSQL 15+ and Redis 7+ (for integration tests)

## Initial Setup

1. **Clone and install dependencies:**

```bash
cd backend/services/blockchain-service
npm ci
```

2. **Install Husky hooks:**

```bash
npm run prepare
```

This will set up the pre-commit hooks automatically.

3. **Create your environment file:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

## Pre-commit Hooks

### What Runs on Commit

When you run `git commit`, the following checks run automatically:

1. **lint-staged** - Runs ESLint and Prettier on staged files only
2. **TypeScript check** - Validates the entire project compiles

### Configuration Files

- `.husky/pre-commit` - Hook script
- `.lintstagedrc.json` - lint-staged configuration

### Skipping Hooks (Emergency Only)

If you need to skip hooks in an emergency:

```bash
git commit --no-verify -m "Emergency fix"
```

⚠️ **Warning:** Only use `--no-verify` in emergencies. CI will still catch issues.

### Running Checks Manually

```bash
# Run ESLint
npm run lint

# Run TypeScript check
npm run typecheck

# Run Prettier check
npx prettier --check "src/**/*.ts"

# Run all pre-commit checks
npx lint-staged && npm run typecheck
```

## Dependency Management

### Pinned Versions (AUDIT FIX #61)

All dependencies are pinned to exact versions for security and reproducibility.

The `.npmrc` file ensures:
- `save-exact=true` - New packages saved with exact versions
- `save-dev-exact=true` - Dev packages also exact
- `engine-strict=true` - Fail if Node version doesn't match

### Updating Dependencies

**Step 1: Check for updates**

```bash
npm outdated
```

**Step 2: Review changelogs**

Before updating, check the changelog for each package:
- Look for breaking changes
- Review security fixes
- Check compatibility notes

**Step 3: Update one package at a time**

```bash
# Update specific package
npm install <package>@<version>

# Example
npm install express@4.18.3
```

**Step 4: Run tests**

```bash
npm run test
npm run typecheck
npm run build
```

**Step 5: Commit the update**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): update <package> to <version>"
```

### Security Audits

```bash
# Run npm audit
npm audit

# Fix automatically (where possible)
npm audit fix

# View only high/critical issues
npm audit --audit-level=high
```

## CI/CD Pipeline

### Workflow Overview

The CI pipeline (`.github/workflows/ci.yml`) runs on every push and PR:

| Job | Description | Duration |
|-----|-------------|----------|
| `lint` | ESLint + Prettier | ~2 min |
| `typecheck` | TypeScript compilation | ~2 min |
| `test` | Unit + integration tests | ~5 min |
| `build` | Production build | ~3 min |
| `security` | npm audit + Snyk | ~2 min |
| `docker` | Docker build (main only) | ~5 min |

### Required Status Checks

Before merging to `main`:
- ✅ lint
- ✅ typecheck
- ✅ test
- ✅ build

### Running CI Locally

```bash
# Simulate full CI run
npm run lint -- --max-warnings 0
npm run typecheck
npm test -- --coverage
npm run build

# Docker build
docker build -t blockchain-service:local .
```

### CI Badges

Add these badges to your README:

```markdown
![CI](https://github.com/<org>/TicketToken-Platform/workflows/CI/badge.svg)
![Coverage](https://codecov.io/gh/<org>/TicketToken-Platform/branch/main/graph/badge.svg)
```

## Branch Protection

### Recommended Settings

Configure these in GitHub Settings → Branches → Branch protection rules:

**For `main` branch:**

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Select: `lint`, `typecheck`, `test`, `build`
- [x] Require branches to be up to date before merging
- [x] Require conversation resolution before merging
- [x] Do not allow bypassing the above settings
- [x] Restrict deletions

**For `develop` branch:**

- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging

## Package.json Scripts Reference

```json
{
  "scripts": {
    "prepare": "husky install",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn src/index.ts"
  }
}
```

## Troubleshooting

### Hooks not running

```bash
# Reinstall husky
npm run prepare

# Verify .husky directory exists
ls -la .husky/
```

### ESLint errors

```bash
# Auto-fix what can be fixed
npm run lint:fix

# Show rule violations
npm run lint -- --format stylish
```

### TypeScript errors

```bash
# See detailed errors
npm run typecheck -- --pretty

# Generate types only
npx tsc --declaration --emitDeclarationOnly
```

### Package-lock conflicts

```bash
# When merging with package-lock.json conflicts
npm ci

# This regenerates package-lock.json from package.json
npm install
```

## Additional Resources

- [ESLint Rules](https://eslint.org/docs/rules/)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged Documentation](https://github.com/okonet/lint-staged)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
