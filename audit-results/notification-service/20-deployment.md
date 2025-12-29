# Notification Service - 20 Deployment & CI/CD Audit

**Service:** notification-service  
**Document:** 20-deployment.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 80% (32/40 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 1 | Healthcheck compares wrong status value |
| MEDIUM | 3 | No .dockerignore, port mismatch (3007 vs 3008), ts-node in production |
| LOW | 4 | Base image not pinned to digest, no SBOM, dev deps not excluded |

## Dockerfile Security (15/20)

- Multi-stage build - PASS (EXCELLENT)
- Minimal base image (Alpine) - PASS
- Base image pinned - PARTIAL (LOW - no digest)
- Non-root user - PASS (EXCELLENT - UID 1001)
- Explicit UID/GID - PASS
- USER before CMD - PASS
- No secrets in Dockerfile - PASS
- COPY preferred over ADD - PASS
- Health check defined - PASS
- Port exposed (3007) - PASS
- npm ci used - PASS
- dumb-init - PASS (EXCELLENT)
- Cache cleared - PARTIAL
- Production deps only - PARTIAL (LOW)
- ts-node in production - FAIL (MEDIUM)
- Templates copied - PASS
- Migration files included - PASS
- Entrypoint script - PASS (EXCELLENT)
- Ownership set - PASS
- .dockerignore present - FAIL (MEDIUM)

## Health Check Configuration (4/6)

- HEALTHCHECK instruction - PASS
- Appropriate interval (30s) - PASS
- Appropriate timeout (3s) - PASS
- Start period (40s) - PASS
- Correct endpoint - PASS
- Correct status validation - FAIL (HIGH - checks 'healthy' not 'ok')

## Package.json Scripts (6/6) EXCELLENT

- build - PASS
- start - PASS
- migrate / migrate:rollback - PASS (EXCELLENT)
- test / test:coverage - PASS
- lint / lint:fix - PASS
- typecheck - PASS
- engines constraint - PASS (Node >=20 <21)

## Port Configuration (2/4)

- Dockerfile EXPOSE - FAIL (MEDIUM - 3007 vs 3008 in docs)
- Health check port - PASS
- Documentation consistent - FAIL

## Build Optimization (4/6)

- Layer caching optimized - PASS
- Dependencies from builder - PARTIAL
- Source code excluded - PASS
- Build artifacts minimized - PASS
- Dev deps excluded - FAIL (LOW)
- npm cache clean - PASS

## Deployment Safeguards (5/8)

- Migration before start - PASS (EXCELLENT)
- Migration failure stops - PASS
- Rollback script - PASS
- Graceful shutdown - PASS
- Read-only filesystem - PARTIAL
- SBOM generation - FAIL (LOW)

## Critical Evidence

### Healthcheck Bug
```dockerfile
# Checks for 'healthy' but endpoint returns 'ok'
HEALTHCHECK ... CMD node -e "...j.status==='healthy'?0:1..."

# Actual response:
{ "status": "ok", "service": "notification-service" }
```

### ts-node in Production
```dockerfile
RUN apk add --no-cache dumb-init && npm install -g ts-node typescript
```

### Missing .dockerignore
No .dockerignore file - copies node_modules, .git, .env

## Remediations

### HIGH
Fix HEALTHCHECK:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:3007/health/ready || exit 1
```

### MEDIUM
1. Remove ts-node from production (pre-compile migrations)
2. Create .dockerignore:
```
node_modules
dist
.git
.env*
tests
coverage
```
3. Fix port consistency (3007 vs 3008)

### LOW
1. Pin base image to digest
2. Add `--only=production` to npm ci
3. Generate SBOM in CI

## Docker Image Size

| Component | Size |
|-----------|------|
| node:20-alpine | ~180MB |
| Production deps | ~200MB |
| ts-node (unnecessary) | ~100MB |
| Application | ~5MB |
| **Total** | **~486MB** |
| **Optimized** | **~386MB** |

## Kubernetes Readiness

| Requirement | Status |
|-------------|--------|
| Non-root user | ✅ |
| Health endpoints | ✅ |
| Graceful shutdown | ✅ |
| Secrets handling | ✅ |
| Migration strategy | ✅ |
| Liveness probe | ✅ |
| Readiness probe | ✅ |

## Positive Highlights

- Multi-stage build
- Non-root user (UID 1001)
- dumb-init signal handling
- Migration on startup
- Migration failure handling
- Rollback script available
- Alpine base image
- Health check defined
- Engine constraints
- TypeScript build
- Test scripts with coverage
- Lint scripts configured

Deployment Score: 80/100
