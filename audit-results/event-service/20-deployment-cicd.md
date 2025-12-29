# Event Service - 20 Deployment & CI/CD Audit

**Service:** event-service
**Document:** 20-deployment-cicd.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 86% (32/37 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 0 | None |
| MEDIUM | 1 | No rollback runbook |
| LOW | 2 | No image digest pinning, No read-only filesystem |

---

## Base Image (2/3)

| Check | Status | Evidence |
|-------|--------|----------|
| Official/verified images | PASS | node:20-alpine |
| Version pinned | PARTIAL | 20-alpine, not full digest |
| Minimal base | PASS | Alpine variant |

---

## Build Security (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Multi-stage builds | PASS | builder → production |
| No secrets in build args | PASS | No ENV with secrets |
| .dockerignore complete | PASS | .env, .git, credentials excluded |
| COPY over ADD | PASS | All COPY commands |
| Package cache cleared | PARTIAL | npm ci (implicit) |
| dumb-init for signals | PASS | Installed and used |

---

## Runtime Security (6/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Non-root user | PASS | adduser -S nodejs -u 1001 |
| Explicit UID/GID | PASS | 1001:1001 |
| USER before CMD | PASS | USER nodejs before EXPOSE |
| Ownership correct | PASS | chown -R nodejs:nodejs /app |
| Only required ports | PASS | EXPOSE 3003 only |
| Health check defined | PASS | HEALTHCHECK --interval=30s |
| Read-only filesystem | FAIL | Not configured |

---

## Migration Handling (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Migrations at startup | PASS | entrypoint runs npm run migrate |
| Failure stops container | PASS | exit 1 on failure |
| Migration files copied | PASS | knexfile.ts and src/migrations |
| Rollback script | PASS | npm run migrate:rollback |

---

## Health Checks (5/5 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Health check in Dockerfile | PASS | HTTP on /health |
| Start period | PASS | --start-period=10s |
| Interval | PASS | --interval=30s |
| Timeout | PASS | --timeout=3s |
| Retries | PASS | --retries=3 |

---

## Package Dependencies (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Node version pinned | PASS | "node": ">=20 <21" |
| Package versions pinned | PASS | Specific versions |
| No deprecated packages | PARTIAL | node-fetch@2.x is legacy |
| Local deps handled | PASS | file:../../shared |

---

## Scripts (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| build | PASS | tsc -p tsconfig.json |
| start | PASS | node dist/index.js |
| migrate | PASS | migrate, migrate:rollback, migrate:make |
| test | PASS | test, test:watch, test:coverage |
| typecheck | PASS | Present |
| clean | PASS | rimraf dist |

---

## Rollback (1/2)

| Check | Status | Evidence |
|-------|--------|----------|
| DB migration rollback | PASS | npm run migrate:rollback |
| Rollback documented | FAIL | No runbook |

---

## Positive Findings

- Excellent multi-stage build
- Non-root user with explicit UID 1001
- Comprehensive healthcheck with all parameters
- Migration with failure handling (exit 1)
- dumb-init for proper signal handling
- Complete .dockerignore
- Engine version pinning (Node >=20 <21)

---

## Remediation Priority

### MEDIUM (This Month)
1. Create docs/runbooks/rollback.md

### LOW (Backlog)
1. Pin base image to full SHA digest:
```dockerfile
FROM node:20-alpine@sha256:abc123... AS builder
```

2. Configure read-only filesystem at Kubernetes level:
```yaml
securityContext:
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1001
```
