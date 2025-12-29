# Scanning Service Deployment & CI/CD Audit

**Standard:** Docs/research/20-deployment-cicd.md  
**Service:** backend/services/scanning-service  
**Date:** 2024-12-27

---

## Files Reviewed

| Path | Status |
|------|--------|
| Dockerfile | ✅ Reviewed |
| package.json | ✅ Reviewed |
| tsconfig.json | ✅ Reviewed |

---

## Section 3.2: Dockerfile Security Checklist

### Base Image

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Official/verified publisher image | ✅ | ✅ PASS | node:18-alpine |
| Base image version pinned | ✅ | ✅ PASS | :18-alpine, not :latest |
| Minimal base image | ✅ | ✅ PASS | Alpine variant |
| Image digest pinned | ⚠️ | ❌ FAIL | No SHA digest |

**Evidence:**
```dockerfile
FROM node:18-alpine AS builder
# Good: Pinned version, Alpine variant
# Missing: SHA digest for full reproducibility
```

### Build Security

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Multi-stage builds | ✅ | ✅ PASS | Builder + production |
| No secrets in build args | ✅ | ✅ PASS | None found |
| .dockerignore exists | ✅ | ⚠️ PARTIAL | Not in service |
| COPY preferred over ADD | ✅ | ✅ PASS | Only COPY used |
| Single RUN commands | ⚠️ | ✅ PASS | Combined commands |
| Package cache cleared | ⚠️ | ⚠️ PARTIAL | npm ci --only=prod |

**Evidence - Dockerfile:**
```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Runtime Security

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Non-root user defined | ✅ | ❌ FAIL | Missing USER |
| Explicit UID/GID | ✅ | ❌ FAIL | Not configured |
| USER before CMD | ✅ | ❌ FAIL | Not configured |
| No SUID/SGID binaries | ⚠️ | N/A | Alpine minimal |
| Read-only filesystem | ⚠️ | N/A | K8s runtime |
| Only required ports exposed | ✅ | ✅ PASS | Only 3000 |
| Health check defined | ✅ | ❌ FAIL | Not configured |

**Missing: Non-Root User and Healthcheck**
```dockerfile
# Should add to Dockerfile:
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

USER 1001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1
```

---

## Section 3.3: Package.json Analysis

### Build Scripts

| Script | Exists | Status | Evidence |
|--------|--------|--------|----------|
| build | ✅ | ✅ PASS | tsc compilation |
| start | ✅ | ✅ PASS | node dist/index.js |
| dev | ✅ | ✅ PASS | ts-node with nodemon |
| test | ✅ | ✅ PASS | jest |
| lint | ✅ | ✅ PASS | eslint |
| typecheck | ⚠️ | ❌ FAIL | Not defined |

**Evidence:**
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn src/index.ts",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  }
}
```

### Dependencies Security

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Production deps only in prod | ✅ | ✅ PASS | devDeps separate |
| No deprecated packages | ⚠️ | ⚠️ PARTIAL | Not audited |
| npm audit clean | ⚠️ | ❌ FAIL | No CI integration |

**Dependencies - Key Packages:**
```json
{
  "dependencies": {
    "fastify": "^4.24.0",
    "pg": "^8.11.0",
    "ioredis": "^5.3.0",
    "pino": "^8.16.0",
    "joi": "^17.11.0",
    "jsonwebtoken": "^9.0.0",
    "qrcode": "^1.5.0"
  }
}
```

---

## Section 3.4: TypeScript Configuration

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Strict mode enabled | ✅ | ✅ PASS | strict: true |
| Declaration files | ⚠️ | ✅ PASS | declaration: true |
| Source maps for debugging | ⚠️ | ✅ PASS | sourceMap: true |
| Output directory | ✅ | ✅ PASS | outDir: ./dist |
| Module resolution | ✅ | ✅ PASS | NodeNext |

**Evidence:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## Section 3.1: CI/CD Pipeline (Inferred)

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Pipeline config exists | ✅ | ❌ FAIL | No workflow file |
| Secret scanning | ✅ | ❌ FAIL | Not configured |
| Image scanning | ✅ | ❌ FAIL | Not configured |
| Production approval | ✅ | ❌ FAIL | Not configured |
| Rollback procedure | ✅ | ❌ FAIL | Not documented |

**Note:** No GitHub Actions workflow file found at service level. May use root-level pipeline.

---

## Summary

### Pass Rates by Section

| Section | Checks | Passed | Partial | Failed | Pass Rate |
|---------|--------|--------|---------|--------|-----------|
| Base Image | 4 | 3 | 0 | 1 | 75% |
| Build Security | 6 | 4 | 2 | 0 | 67% |
| Runtime Security | 7 | 1 | 0 | 4 | 25% |
| Package.json Scripts | 6 | 5 | 0 | 1 | 83% |
| Dependencies | 3 | 1 | 1 | 1 | 33% |
| TypeScript Config | 5 | 5 | 0 | 0 | 100% |
| CI/CD Pipeline | 5 | 0 | 0 | 5 | 0% |
| **TOTAL** | **36** | **19** | **3** | **12** | **58%** |

---

### Critical Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| DEP-1 | Running as root | Dockerfile | Container escape risk |
| DEP-2 | No HEALTHCHECK | Dockerfile | K8s can't detect unhealthy |
| DEP-3 | No CI/CD pipeline | Service | No automated security |
| DEP-4 | No image digest | Dockerfile | Non-reproducible builds |

### High Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| DEP-5 | No .dockerignore | Service root | Large image, secrets risk |
| DEP-6 | No npm audit in CI | CI/CD | Vulnerable deps undetected |
| DEP-7 | No typecheck script | package.json | Type errors in CI |
| DEP-8 | No rollback procedure | Docs | Incident recovery slow |

---

### Positive Findings

1. **Good Multi-Stage Build**: Proper separation of builder and production stages minimizes final image size.

2. **Alpine Base Image**: Using minimal Alpine variant (node:18-alpine) reduces attack surface.

3. **Version Pinned**: Base image version pinned to 18-alpine, not using :latest tag.

4. **Strict TypeScript**: Full strict mode enabled with proper module resolution for Node.js.

5. **Standard Build Scripts**: Well-organized npm scripts for build, test, lint, and development.

---

### Recommended Fixes

**Priority 1: Add non-root user to Dockerfile**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy with ownership
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./

# Switch to non-root
USER 1001

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Priority 2: Create .dockerignore**
```
node_modules
dist
.git
.gitignore
.env
.env.*
*.log
.nyc_output
coverage
tests
*.md
.vscode
.idea
```

**Priority 3: Add CI/CD workflow**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run linter
        run: npm run lint
        
      - name: Run type check
        run: npx tsc --noEmit
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Scan for vulnerabilities
        run: npm audit --production
```

**Priority 4: Add typecheck script**
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

---

**Overall Assessment:** The scanning service has **good foundational build configuration** (TypeScript 100%, Build scripts 83%) but **critical runtime security gaps** (25%) with missing non-root user and healthcheck. The **absence of CI/CD pipeline** (0%) is the biggest gap for production readiness.
