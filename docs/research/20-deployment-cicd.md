# Deployment and CI/CD Security Audit Guide

**Platform**: TicketToken (Blockchain Ticketing SaaS)  
**Stack**: Node.js/TypeScript, Docker, GitHub Actions, Kubernetes  
**Date**: December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Verification Commands](#4-verification-commands)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 CI/CD Pipeline Security

The OWASP Top 10 CI/CD Security Risks identifies the most critical vulnerabilities in modern DevOps environments, including poisoned pipeline execution, insufficient access controls, and dependency chain abuse.

**Core Principles**:

| Principle | Implementation |
|-----------|----------------|
| Least Privilege | Pipeline identities should have minimum permissions needed for their task |
| Defense in Depth | Multiple security layers: SCM, CI, deployment, runtime |
| Shift Left | Embed security scanning early in development |
| Zero Trust | Verify every component, assume breach |

**Pipeline Security Controls**:

- **Version Control**: All pipeline configuration must be version controlled with change history
- **Isolated Build Environments**: Run builds in appropriately isolated nodes to prevent cross-contamination
- **Secure Communication**: Use TLS 1.2+ for all SCM and CI/CD platform communication
- **IP Restrictions**: Restrict access to CI/CD environments by IP where possible
- **Privileged Mode**: Never use `--privileged` flag in Docker builds within pipelines
- **Manual Approval Gates**: Require human approval before production deployments

**NSA/CISA Guidance** (June 2023):
- Implement network segmentation between CI/CD systems and production
- Use endpoint detection and response (EDR) tools on CI runners
- Scan every image pulled into the pipeline
- Only use software from trusted, verified sources

### 1.2 Container Image Security

**Base Image Selection**:

| Image Type | Use Case | Security Level |
|------------|----------|----------------|
| Scratch | Compiled Go/Rust binaries | Highest (no OS) |
| Distroless | Production workloads | Very High |
| Alpine | Size-sensitive deployments | High |
| Slim variants | General purpose | Medium |
| Full OS images | Development only | Lower |

**Dockerfile Security Best Practices**:

```dockerfile
# GOOD: Multi-stage build with non-root user
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Create non-root user with explicit UID
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy with appropriate ownership
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Switch to non-root user
USER 1001

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Image Scanning** with Trivy:
- Scan for OS package vulnerabilities (CVEs)
- Detect application dependency vulnerabilities
- Identify misconfigurations in Dockerfiles
- Find embedded secrets
- Generate Software Bill of Materials (SBOM)

**Scanning Integration**:
```yaml
# GitHub Actions example
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}'
    format: 'sarif'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'  # Fail pipeline on critical/high vulnerabilities
```

### 1.3 Deployment Strategies

#### Blue-Green Deployment

**How It Works**: Maintain two identical production environments (Blue = current, Green = new). Deploy to Green, test, then switch traffic instantly.

| Aspect | Blue-Green |
|--------|------------|
| Downtime | Near-zero |
| Rollback Speed | Instant (traffic switch) |
| Resource Cost | 2x infrastructure during deployment |
| Risk Scope | All users affected simultaneously |
| Best For | Critical updates requiring zero downtime |

**Kubernetes Example** (Argo Rollouts):
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: tickettoken-api
spec:
  replicas: 3
  strategy:
    blueGreen:
      activeService: tickettoken-api-active
      previewService: tickettoken-api-preview
      autoPromotionEnabled: false  # Require manual approval
```

#### Canary Deployment

**How It Works**: Gradually roll out changes to a small subset of users, monitor, then expand.

| Aspect | Canary |
|--------|--------|
| Downtime | None |
| Rollback Speed | Fast (redirect traffic) |
| Resource Cost | Incremental |
| Risk Scope | Limited to canary group |
| Best For | Feature validation, risk-sensitive releases |

**Traffic Progression Example**:
```
Stage 1: 5% traffic → Monitor 15 minutes
Stage 2: 25% traffic → Monitor 30 minutes  
Stage 3: 50% traffic → Monitor 1 hour
Stage 4: 100% traffic → Full rollout
```

#### Rolling Update (Kubernetes Default)

**How It Works**: Incrementally replace old pods with new ones.

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Max pods over desired count
      maxUnavailable: 0  # Never go below desired count
```

### 1.4 Rollback Procedures

**Automated Rollback Triggers**:
- Health check failures exceed threshold
- Error rate exceeds baseline
- Latency increases beyond SLA
- Resource consumption anomalies

**Rollback Strategy Matrix**:

| Scenario | Action | Time to Restore |
|----------|--------|-----------------|
| Blue-Green failure | Switch traffic to Blue | Seconds |
| Canary failure | Stop progression, redirect traffic | Seconds |
| Rolling update failure | `kubectl rollout undo` | Minutes |
| Database migration failure | Execute reverse migration script | Variable |

**Kubernetes Rollback**:
```bash
# View rollout history
kubectl rollout history deployment/tickettoken-api

# Rollback to previous revision
kubectl rollout undo deployment/tickettoken-api

# Rollback to specific revision
kubectl rollout undo deployment/tickettoken-api --to-revision=2
```

### 1.5 Infrastructure as Code Security

**IaC Scanning Tools**:

| Tool | Focus Area | Integration |
|------|------------|-------------|
| Checkov | Multi-cloud, 1000+ policies | CLI, CI/CD, IDE |
| TFSec | Terraform-specific | CLI, CI/CD |
| Terrascan | Policy-as-code | CLI, CI/CD |
| KICS | Multi-IaC (TF, CF, K8s, Docker) | CLI, CI/CD |

**Terraform Security Best Practices**:

1. **State File Security**:
   - Store state in encrypted remote backend (S3 + DynamoDB, Terraform Cloud)
   - Never commit state files to version control
   - Enable state file locking

2. **Secrets Management**:
   ```hcl
   # BAD: Hardcoded secret
   resource "aws_db_instance" "db" {
     password = "hardcoded_password"  # NEVER DO THIS
   }
   
   # GOOD: Reference from secrets manager
   data "aws_secretsmanager_secret_version" "db_password" {
     secret_id = "tickettoken/db/password"
   }
   
   resource "aws_db_instance" "db" {
     password = data.aws_secretsmanager_secret_version.db_password.secret_string
   }
   ```

3. **Variable Sensitivity**:
   ```hcl
   variable "database_password" {
     type      = string
     sensitive = true  # Prevents value from appearing in logs
   }
   ```

4. **CI/CD Integration**:
   ```yaml
   # Scan Terraform before apply
   - name: Run Checkov
     uses: bridgecrewio/checkov-action@master
     with:
       directory: terraform/
       framework: terraform
       soft_fail: false
   ```

### 1.6 Secrets in CI/CD

**GitHub Actions Secrets Best Practices**:

| Practice | Implementation |
|----------|----------------|
| Never hardcode | Use `${{ secrets.SECRET_NAME }}` |
| Environment-specific | Use environment secrets for prod/staging |
| Least privilege | Scope to specific repositories |
| Rotation | Rotate every 30-90 days |
| OIDC over static | Use workload identity federation |

**Secret Levels in GitHub Actions**:
1. **Organization Secrets**: Shared across repositories (use sparingly)
2. **Repository Secrets**: Specific to single repository
3. **Environment Secrets**: Require approval workflows, most secure

**OIDC Configuration** (Eliminates long-lived credentials):
```yaml
jobs:
  deploy:
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
          aws-region: us-east-1
          # No access keys stored - uses OIDC token
```

**Secret Detection Tools**:
- Pre-commit: git-secrets, detect-secrets, gitleaks
- CI/CD: GitHub Secret Scanning, TruffleHog, GitGuardian

### 1.7 Artifact Signing and Verification

**Sigstore/Cosign** provides cryptographic signing for container images:

**Signing Workflow**:
```bash
# Generate key pair (one-time)
cosign generate-key-pair

# Sign image (always use digest, not tag)
cosign sign --key cosign.key $IMAGE@sha256:abc123...

# Keyless signing (recommended for CI/CD)
# Uses OIDC identity from GitHub/GitLab/Google
cosign sign $IMAGE@sha256:abc123...
```

**Verification**:
```bash
# Verify with public key
cosign verify --key cosign.pub $IMAGE

# Keyless verification
cosign verify \
  --certificate-identity=https://github.com/org/repo/.github/workflows/build.yaml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  $IMAGE
```

**Kubernetes Admission Control**:
- Use Sigstore Policy Controller or Connaisseur
- Reject unsigned images automatically
- Enforce signing policies per namespace

**GitHub Actions Integration**:
```yaml
- name: Sign Container Image
  env:
    COSIGN_EXPERIMENTAL: 'true'
  run: |
    cosign sign --yes ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Secrets Exposed in CI Logs

**Real-World Incidents**:
- Travis CI exposed 73,000+ tokens through public build logs
- Azure CLI bug (CVE-2023, Nov 2023) leaked secrets in CI/CD build logs
- GitLab CVE-2024-9164 (CVSS 9.6) allowed attackers to access every configured secret

**How Secrets Leak**:
```yaml
# BAD: Direct echo exposes secret
- run: echo "Deploying with key: ${{ secrets.API_KEY }}"

# BAD: Debug mode exposes environment
- run: printenv  # Dumps all env vars including secrets

# BAD: Error messages may contain secrets
- run: curl -H "Authorization: Bearer $TOKEN" https://api.example.com || echo "Failed with $?"

# BAD: Command history persistence
- run: |
    export AWS_SECRET_KEY=abc123  # May persist in shell history
```

**Prevention**:
- Never print secrets to console
- Mask secrets in log output
- Use `::add-mask::` in GitHub Actions
- Redirect verbose output to /dev/null
- Review workflow logs for accidental exposure

### 2.2 No Image Scanning

**Risks**:
- Known CVEs in OS packages
- Vulnerable application dependencies
- Embedded credentials
- Malicious code in base images

**Statistics** (2024 Container Security Report):
- 60%+ of production Docker images contain at least one high-severity vulnerability
- 54% of images on Docker Hub contain sensitive information

**Solution**: Implement scanning at multiple points:
1. During build (fail pipeline on critical CVEs)
2. Before push to registry
3. At runtime (continuous monitoring)

### 2.3 No Rollback Plan

**Symptoms**:
- Panicked manual interventions during incidents
- Extended downtime during failed deployments
- No clear ownership of rollback decisions

**Required Components**:
- [ ] Documented rollback procedure for each service
- [ ] Automated rollback triggers defined
- [ ] Previous known-good version always available
- [ ] Database migration rollback scripts
- [ ] Tested rollback procedure (disaster recovery drills)

### 2.4 Running Containers as Root

**Risks**:
- Container escape can grant host root access
- Privilege escalation attacks
- File system manipulation
- Network namespace attacks

**Report**: 58% of images run container entrypoint as root (UID 0)

**Fix**:
```dockerfile
# Create non-root user
RUN groupadd -r -g 1001 appgroup && \
    useradd -r -u 1001 -g appgroup appuser

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root
USER 1001

# Runtime: prevent privilege escalation
# docker run --security-opt=no-new-privileges:true
```

### 2.5 Outdated Base Images

**Risks**:
- Unpatched CVEs accumulate over time
- Known exploits for old vulnerabilities
- Compliance violations

**Best Practices**:
- Pin images to specific versions (not `latest`)
- Use image digests for reproducibility: `node:20-alpine@sha256:abc123...`
- Implement automated rebuild on base image updates
- Track base image age in dashboards

### 2.6 No Deployment Approval Process

**Risks**:
- Accidental production deployments
- Unauthorized changes reaching production
- No audit trail for deployments
- Compliance violations (SOC 2, PCI-DSS)

**Required Controls**:

| Control | Implementation |
|---------|----------------|
| Environment Protection | Require approvals for production environment |
| Branch Protection | Only deploy from protected branches |
| Separation of Duties | Deployer cannot approve their own deployment |
| Audit Logging | All approvals logged with timestamp and approver |
| Timeout | Auto-reject if not approved within timeframe |

---

## 3. Audit Checklist

### 3.1 CI/CD Pipeline Configuration

#### Source Code Management (SCM)
- [ ] Branch protection enabled on main/production branches
- [ ] Require pull request reviews (minimum 1-2 reviewers)
- [ ] Require status checks to pass before merging
- [ ] Signed commits required or encouraged
- [ ] No direct pushes to protected branches

#### Pipeline Security
- [ ] Pipeline configuration is version controlled
- [ ] No hardcoded secrets in workflow files
- [ ] Secrets stored in platform secret management (not env files)
- [ ] OIDC used instead of long-lived credentials where possible
- [ ] Third-party actions pinned to full SHA (not tags)
- [ ] `GITHUB_TOKEN` permissions set to minimum required
- [ ] Self-hosted runners secured (if used)
- [ ] Build artifacts signed and verified

#### Secret Management
- [ ] All secrets encrypted at rest and in transit
- [ ] Secrets scoped to specific environments (dev/staging/prod)
- [ ] Secret rotation schedule documented and followed
- [ ] Secret detection in pre-commit hooks
- [ ] Secret scanning in CI pipeline
- [ ] No organizational secrets accessible to all repositories
- [ ] Audit log review for secret access

#### Security Scanning Integration
- [ ] SAST (Static Application Security Testing) enabled
- [ ] DAST (Dynamic Application Security Testing) in staging
- [ ] Dependency vulnerability scanning (SCA)
- [ ] Container image scanning with severity thresholds
- [ ] IaC scanning (Terraform, CloudFormation, Kubernetes manifests)
- [ ] Pipeline fails on critical/high vulnerabilities

### 3.2 Dockerfile Security

#### Base Image
- [ ] Using official or verified publisher images
- [ ] Base image version pinned (not `latest`)
- [ ] Minimal base image used (Alpine, Distroless, Scratch)
- [ ] Base image regularly updated (monthly minimum)
- [ ] Base image scanned before use

#### Build Security
- [ ] Multi-stage builds to minimize final image size
- [ ] No secrets in build arguments or environment variables
- [ ] `.dockerignore` excludes sensitive files (.env, .git, credentials)
- [ ] `COPY` preferred over `ADD` (unless extracting archives)
- [ ] Single `RUN` commands to reduce layers
- [ ] Package manager cache cleared after install

#### Runtime Security
- [ ] Non-root user defined with explicit UID/GID
- [ ] `USER` instruction present before `ENTRYPOINT`/`CMD`
- [ ] No SUID/SGID binaries unless required
- [ ] Read-only root filesystem where possible
- [ ] Only required ports exposed
- [ ] Health check defined

#### Dockerfile Checklist Script
```bash
# Quick Dockerfile audit
grep -E "^FROM.*:latest" Dockerfile && echo "WARNING: Using :latest tag"
grep -E "^USER root|^USER 0" Dockerfile && echo "WARNING: Running as root"
grep -E "ADD http|ADD https" Dockerfile && echo "WARNING: ADD from URL (use curl/wget)"
grep -E "ENV.*PASSWORD|ENV.*SECRET|ENV.*KEY" Dockerfile && echo "CRITICAL: Possible hardcoded secret"
grep -E "^EXPOSE" Dockerfile || echo "INFO: No ports exposed"
grep -E "^HEALTHCHECK" Dockerfile || echo "WARNING: No healthcheck defined"
```

### 3.3 Deployment Safeguards

#### Environment Controls
- [ ] Production environment requires approval
- [ ] Different secrets per environment (dev/staging/prod)
- [ ] Environment-specific configurations validated
- [ ] Production access limited to specific teams/individuals
- [ ] Deployment history tracked and auditable

#### Deployment Strategy
- [ ] Deployment strategy documented (rolling/blue-green/canary)
- [ ] Health checks configured for deployment validation
- [ ] Rollback procedure documented and tested
- [ ] Database migration strategy includes rollback
- [ ] Feature flags used for gradual rollouts

#### Monitoring & Alerting
- [ ] Deployment alerts configured
- [ ] Error rate monitoring post-deployment
- [ ] Latency monitoring post-deployment
- [ ] Resource utilization monitoring
- [ ] Automatic rollback on health check failures

#### Kubernetes-Specific
- [ ] Pod Security Standards enforced (restricted)
- [ ] Network policies defined and enforced
- [ ] Resource limits and requests set
- [ ] Liveness and readiness probes configured
- [ ] Service accounts with minimal permissions
- [ ] Secrets mounted as files (not env vars) where possible

### 3.4 GitHub Actions Specific Checklist

```yaml
# Security-hardened workflow template
name: Secure Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Restrict default permissions
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write  # For OIDC
    
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1 pinned
        
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@f95db51fddba0c2d1ec667646a06c2ce06100226  # v3.0.0 pinned
        
      # OIDC authentication - no stored credentials
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502  # v4.0.2 pinned
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
          
      - name: Scan for secrets
        uses: trufflesecurity/trufflehog@main  # Secret scanning
        with:
          path: ./
          
      - name: Build image
        run: |
          docker build -t $IMAGE_NAME:${{ github.sha }} .
          
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ env.IMAGE_NAME }}:${{ github.sha }}'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
          
      - name: Sign image with Cosign
        env:
          COSIGN_EXPERIMENTAL: 'true'
        run: cosign sign --yes $IMAGE_NAME@$DIGEST

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production  # Requires approval
    
    steps:
      - name: Deploy to Kubernetes
        run: |
          # Deployment commands
```

### 3.5 Quick Reference: What to Verify

| Component | Must Have | Red Flags |
|-----------|-----------|-----------|
| **Workflows** | Pinned action SHAs, minimal permissions | `@main` tags, `permissions: write-all` |
| **Secrets** | Environment-scoped, rotated regularly | Org-wide secrets, never rotated |
| **Images** | Scanned, signed, non-root | No scanning, root user, `:latest` tag |
| **Deployments** | Approval gates, rollback plan | Auto-deploy to prod, no monitoring |
| **IaC** | Scanned, state encrypted | Hardcoded secrets, local state |
| **Logs** | Secrets masked | Credentials visible in output |

---

## 4. Verification Commands

### Pipeline Security Verification

```bash
# Check for secrets in git history
gitleaks detect --source . --verbose

# Scan repository with TruffleHog
trufflehog git file://. --only-verified

# Verify GitHub Actions workflows
# Check for unpinned actions
grep -r "uses:.*@main\|uses:.*@master" .github/workflows/

# Check for overly permissive permissions
grep -r "permissions:" .github/workflows/ | grep -i "write-all"
```

### Docker Security Verification

```bash
# Scan image with Trivy
trivy image --severity HIGH,CRITICAL $IMAGE:$TAG

# Check for secrets in image
trivy image --scanners secret $IMAGE:$TAG

# Verify image is running as non-root
docker run --rm $IMAGE:$TAG id
# Should NOT show uid=0(root)

# Check image history for secrets
docker history --no-trunc $IMAGE:$TAG | grep -iE "secret|password|key|token"

# Inspect image for USER directive
docker inspect $IMAGE:$TAG | jq '.[0].Config.User'
# Should NOT be empty or "root" or "0"

# Verify image signature
cosign verify --key cosign.pub $IMAGE:$TAG
```

### Kubernetes Security Verification

```bash
# Check for containers running as root
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].securityContext.runAsUser}{"\n"}{end}'

# Check for privileged containers
kubectl get pods -A -o json | jq '.items[] | select(.spec.containers[].securityContext.privileged==true) | .metadata.name'

# Verify pod security standards
kubectl get pods -A -o json | jq '.items[] | {name: .metadata.name, securityContext: .spec.securityContext}'

# Check for secrets mounted as env vars (less secure)
kubectl get pods -A -o json | jq '.items[] | {name: .metadata.name, envFrom: .spec.containers[].envFrom}'
```

### IaC Security Verification

```bash
# Scan Terraform with Checkov
checkov -d terraform/

# Scan with TFSec
tfsec terraform/

# Check for hardcoded secrets in Terraform
grep -r "password\s*=\s*\"" terraform/
grep -r "secret\s*=\s*\"" terraform/

# Verify state file is encrypted
terraform state pull | jq -r '.encryption'
```

---

## 5. Sources

### Official Documentation & Standards

1. **OWASP CI/CD Security Cheat Sheet**  
   https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html

2. **OWASP Top 10 CI/CD Security Risks**  
   https://owasp.org/www-project-top-10-ci-cd-security-risks/

3. **NSA/CISA: Defending CI/CD Environments** (June 2023)  
   https://media.defense.gov/2023/Jun/28/2003249466/-1/-1/0/CSI_DEFENDING_CI_CD_ENVIRONMENTS.PDF

4. **GitHub Security Hardening for Actions**  
   https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

5. **Docker Build Best Practices**  
   https://docs.docker.com/build/building/best-practices/

6. **Sigstore Cosign Documentation**  
   https://docs.sigstore.dev/cosign/signing/signing_with_containers/

### Container & Image Security

7. **Trivy Scanner (Aqua Security)**  
   https://github.com/aquasecurity/trivy

8. **Sysdig: Top 20 Dockerfile Best Practices**  
   https://www.sysdig.com/learn-cloud-native/dockerfile-best-practices

9. **Snyk: 10 Docker Image Security Best Practices**  
   https://snyk.io/blog/10-docker-image-security-best-practices/

10. **GitGuardian: Docker Security Cheat Sheet**  
    https://blog.gitguardian.com/how-to-improve-your-docker-containers-security-cheat-sheet/

### Deployment Strategies

11. **Harness: Blue-Green and Canary Deployments**  
    https://www.harness.io/blog/blue-green-canary-deployment-strategies

12. **Spacelift: Blue-Green Deployment Kubernetes**  
    https://spacelift.io/blog/blue-green-deployment-kubernetes

13. **Codefresh: Deployment Strategy Comparison**  
    https://codefresh.io/learn/software-deployment/blue-green-deployment-vs-canary-5-key-differences-and-how-to-choose/

### CI/CD & Secrets Management

14. **GitHub Actions Secrets Best Practices (Blacksmith)**  
    https://www.blacksmith.sh/blog/best-practices-for-managing-secrets-in-github-actions

15. **GitGuardian: GitHub Actions Security Cheat Sheet**  
    https://blog.gitguardian.com/github-actions-security-cheat-sheet/

16. **StepSecurity: GitHub Actions Secrets Management**  
    https://www.stepsecurity.io/blog/github-actions-secrets-management-best-practices

17. **Wiz: Hardening GitHub Actions**  
    https://www.wiz.io/blog/github-actions-security-guide

### Infrastructure as Code

18. **Spacelift: Terraform Security Best Practices**  
    https://spacelift.io/blog/terraform-security

19. **Wiz: Terraform Security Best Practices**  
    https://www.wiz.io/academy/terraform-security-best-practices

20. **GitGuardian: IaC Security with Terraform**  
    https://blog.gitguardian.com/security-in-infrastructure-as-code-with-terraform/

### Artifact Signing

21. **OpenSSF: Sigstore for Container Image Signing**  
    https://openssf.org/blog/2024/02/16/scaling-up-supply-chain-security-implementing-sigstore-for-seamless-container-image-signing/

22. **GitLab: Sigstore Keyless Signing**  
    https://docs.gitlab.com/ci/yaml/signing_examples/

---

## Implementation Priority

### Phase 1: Critical (Week 1)
- [ ] Enable secret scanning in CI pipeline
- [ ] Pin all third-party actions to SHA
- [ ] Set minimum `GITHUB_TOKEN` permissions
- [ ] Add Trivy image scanning (fail on CRITICAL)
- [ ] Verify all containers run as non-root

### Phase 2: High (Week 2-3)
- [ ] Implement OIDC for cloud provider authentication
- [ ] Add production deployment approval gates
- [ ] Enable IaC scanning (Checkov/TFSec)
- [ ] Document and test rollback procedures
- [ ] Configure environment-specific secrets

### Phase 3: Enhanced (Month 1)
- [ ] Implement container image signing with Cosign
- [ ] Set up Kubernetes admission control for signed images
- [ ] Enable deployment strategy (blue-green or canary)
- [ ] Automate security scanning reports
- [ ] Conduct team training on CI/CD security

---

*Document Version: 1.0*  
*Last Updated: December 2024*  
*Next Review: March 2025*