# Venue Service - 20 Deployment & CI/CD Audit

**Service:** venue-service
**Document:** 20-deployment-cicd.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 78% (28/36 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 1 | No image scanning integrated |
| MEDIUM | 4 | Base image not pinned to digest, No GitHub workflows, No deployment approval docs, npm install instead of npm ci |
| LOW | 3 | No image signing, No OIDC docs, Missing secrets files in .dockerignore |

---

## Base Image

### BI1: Using official/verified images
**Status:** PASS
**Evidence:** node:20-alpine (official).

### BI2: Base image version pinned
**Status:** PARTIAL
**Evidence:** Pinned to 20-alpine but not to digest.
**Remediation:** Use node:20-alpine@sha256:...

### BI3: Minimal base image used
**Status:** PASS
**Evidence:** Alpine variant.

---

## Build Security

### BS1: Multi-stage build
**Status:** PASS
**Evidence:** Two-stage (builder, production).

### BS2: No secrets in build args
**Status:** PASS

### BS3: .dockerignore excludes sensitive files
**Status:** PASS
**Evidence:** .env, .env.local, .git excluded.

### BS4: COPY preferred over ADD
**Status:** PASS

### BS5: Package cache cleared
**Status:** PARTIAL
**Evidence:** Alpine auto-cleans with --no-cache.

### BS6: Using npm ci
**Status:** FAIL
**Evidence:** Uses npm install instead of npm ci.
**Remediation:** Use npm ci --only=production.

---

## Runtime Security

### RS1: Non-root user defined
**Status:** PASS
**Evidence:** adduser -S nodejs -u 1001

### RS2: USER before ENTRYPOINT
**Status:** PASS

### RS3: Explicit UID/GID
**Status:** PASS
**Evidence:** -g 1001, -u 1001

### RS4: Only required ports exposed
**Status:** PASS
**Evidence:** EXPOSE 3002

### RS5: Health check defined
**Status:** PASS
**Evidence:** HTTP check on /health, 30s interval, 3s timeout.

### RS6: Using dumb-init
**Status:** PASS
**Evidence:** Proper signal handling.

---

## .dockerignore

### DI1-DI5: node_modules, .env, .git, tests, IDE files
**Status:** PASS

### DI6: Missing items
**Status:** PARTIAL
**Evidence:** Missing *.pem, *.key, .env.*, docker-compose*.yml

---

## CI/CD Pipeline

### PS1: Workflow files exist
**Status:** FAIL
**Evidence:** No .github/workflows/ in venue-service.

---

## Security Scanning

### SC1: Image scanning enabled
**Status:** FAIL
**Remediation:** Add Trivy scanning to CI.

### SC2-SC3: Secret scanning, dependency scanning
**Status:** PARTIAL

---

## Deployment Safeguards

### EC2: Different secrets per environment
**Status:** PASS

### DS2: Health checks for deployment validation
**Status:** PASS

### DS3: Rollback procedure documented
**Status:** FAIL

### DS4: Database migration strategy
**Status:** PASS
**Evidence:** Migrations run on container start.

---

## Dockerfile Summary

| Check | Status |
|-------|--------|
| Multi-stage build | ✅ |
| Non-root user | ✅ |
| Alpine base | ✅ |
| Health check | ✅ |
| dumb-init | ✅ |
| Migrations | ✅ |
| .env excluded | ✅ |
| Image pinned to digest | ❌ |
| npm ci | ❌ |
| Image scanning | ❌ |

---

## Remediation Priority

### HIGH (This Week)
1. Add Trivy image scanning to CI/CD
2. Use npm ci instead of npm install

### MEDIUM (This Month)
1. Pin base image to digest
2. Add rollback documentation
3. Expand .dockerignore (*.pem, *.key, .env*)

### LOW (This Quarter)
1. Add image signing with Cosign
2. Document deployment approval process
3. Add OIDC authentication
