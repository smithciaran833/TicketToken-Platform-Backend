# Auth Service - 20 Deployment & CI/CD Audit

**Service:** auth-service
**Document:** 20-deployment-cicd.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 52% (17/33)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No CI/CD pipeline exists |
| HIGH | 3 | No image scanning, no deployment approval gates, no rollback procedures |
| MEDIUM | 5 | Base image not pinned to digest, missing security scanning, no artifact signing |
| LOW | 7 | Minor Dockerfile improvements |

---

## Section 3.1: CI/CD Pipeline Configuration

### Pipeline Existence

#### CD-P1: CI/CD pipeline exists
**Status:** FAIL
**Evidence:** No .github, .gitlab-ci.yml, or Jenkinsfile found.
**Issue:** No CI/CD pipeline defined for auth-service.
**Remediation:** Create .github/workflows/ci.yml with build, test, scan, deploy stages.

#### CD-P2: Pipeline configuration is version controlled
**Status:** FAIL
**Evidence:** No pipeline config files exist to version control.

#### CD-P3: No hardcoded secrets in workflow files
**Status:** N/A
**Evidence:** No workflow files exist.

#### CD-P4: Third-party actions pinned to SHA
**Status:** N/A
**Evidence:** No workflow files exist.

#### CD-P5: Secret scanning in CI pipeline
**Status:** FAIL
**Evidence:** No CI pipeline to run secret scanning.
**Remediation:** Add gitleaks or trufflehog to CI.

#### CD-P6: SAST enabled
**Status:** FAIL
**Evidence:** No static analysis in CI.

#### CD-P7: Dependency vulnerability scanning
**Status:** PARTIAL
**Evidence:** package.json has npm audit available but no automated CI integration.

#### CD-P8: Container image scanning
**Status:** FAIL
**Evidence:** No Trivy or similar scanner in pipeline.
**Remediation:** Add Trivy scan step in CI.

---

## Section 3.2: Dockerfile Security

### Base Image

#### CD-D1: Using official/verified images
**Status:** PASS
**Evidence:** Dockerfile Line 1: FROM node:20-alpine AS builder

#### CD-D2: Base image version pinned (not :latest)
**Status:** PASS
**Evidence:** Uses node:20-alpine, not :latest.

#### CD-D3: Minimal base image used
**Status:** PASS
**Evidence:** Alpine variant is minimal (~5MB base).

#### CD-D4: Base image pinned to digest
**Status:** FAIL
**Evidence:** Uses tag node:20-alpine, not digest.
**Remediation:** Use node:20-alpine@sha256:abc123... for reproducibility.

### Build Security

#### CD-D5: Multi-stage build
**Status:** PASS
**Evidence:** Dockerfile Lines 1, 17: FROM node:20-alpine AS builder ... FROM node:20-alpine

#### CD-D6: No secrets in build arguments
**Status:** PASS
**Evidence:** No ARG or ENV with secrets in Dockerfile.

#### CD-D7: .dockerignore excludes sensitive files
**Status:** PASS
**Evidence:** .dockerignore includes .env, .env.local, .git

#### CD-D8: COPY preferred over ADD
**Status:** PASS
**Evidence:** All file operations use COPY, not ADD.

### Runtime Security

#### CD-D9: Non-root user with explicit UID/GID
**Status:** PASS
**Evidence:** Dockerfile Lines 42-43: RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 / USER nodejs

#### CD-D10: USER instruction before ENTRYPOINT/CMD
**Status:** PASS
**Evidence:** USER nodejs appears before ENTRYPOINT and CMD.

#### CD-D11: Only required ports exposed
**Status:** PASS
**Evidence:** Dockerfile Line 45: EXPOSE 3001

#### CD-D12: Health check defined
**Status:** PASS
**Evidence:** Dockerfile Lines 46-47: HEALTHCHECK with 30s interval, 3s timeout, 10s start-period

#### CD-D13: Using init system (dumb-init/tini)
**Status:** PASS
**Evidence:** Dockerfile Lines 19, 49: RUN apk add --no-cache dumb-init / ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]

#### CD-D14: Package cache cleared after install
**Status:** PARTIAL
**Evidence:** Uses npm ci but doesn't clear npm cache.
**Remediation:** Add && npm cache clean --force after install.

---

## Section 3.3: Deployment Safeguards

### Environment Controls

#### CD-E1: Production requires approval
**Status:** FAIL
**Evidence:** No CI/CD pipeline with approval gates.
**Remediation:** Add GitHub Environment protection rules.

#### CD-E2: Different secrets per environment
**Status:** PASS
**Evidence:** secrets.ts uses secretsManager which supports per-env secrets.

#### CD-E3: Deployment history tracked
**Status:** FAIL
**Evidence:** No deployment tracking without CI/CD.

### Deployment Strategy

#### CD-S1: Deployment strategy documented
**Status:** PARTIAL
**Evidence:** docker-compose.yml exists but no K8s deployment strategy documented.

#### CD-S2: Health checks for deployment validation
**Status:** PASS
**Evidence:** Docker HEALTHCHECK defined; monitoring.service.ts has readiness endpoint.

#### CD-S3: Rollback procedure documented
**Status:** FAIL
**Evidence:** No rollback procedures documented.
**Remediation:** Create docs/ROLLBACK.md

#### CD-S4: Database migration rollback
**Status:** PARTIAL
**Evidence:** Knex supports rollback (knex migrate:rollback) but not tested.

---

## Section 3.4: Artifact Security

#### CD-A1: Images signed
**Status:** FAIL
**Evidence:** No Cosign/Sigstore integration.

#### CD-A2: Images scanned before deployment
**Status:** FAIL
**Evidence:** No Trivy or image scanning.

#### CD-A3: SBOM generated
**Status:** FAIL
**Evidence:** No Software Bill of Materials generation.

---

## Remediation Priority

### CRITICAL (Do Immediately)
1. Create CI/CD pipeline - No automation currently exists

### HIGH (Do This Week)
1. Add Trivy image scanning
2. Add production approval gates
3. Document rollback procedures

### MEDIUM (Do This Month)
1. Pin base image to digest
2. Add SAST/dependency scanning
3. Implement image signing
4. Add secret scanning
5. Clear npm cache in Dockerfile

