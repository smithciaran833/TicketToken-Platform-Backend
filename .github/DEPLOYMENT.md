# Deployment Guide

## Environments

### Staging
- **Branch:** `develop`
- **Auto-deploy:** Yes
- **URL:** https://staging-auth.tickettoken.com

### Production
- **Branch:** `main`
- **Auto-deploy:** No (requires approval)
- **URL:** https://auth.tickettoken.com

## Required GitHub Settings

### Environment Protection Rules

1. Go to **Settings > Environments**
2. Create `staging` environment
3. Create `production` environment with:
   - ✅ Required reviewers (add at least 1 team member)
   - ✅ Wait timer: 5 minutes (optional)
   - ✅ Deployment branches: `main` only

### Required Secrets

| Secret | Description | Required For |
|--------|-------------|--------------|
| `GITHUB_TOKEN` | Auto-provided | All jobs |
| `SEMGREP_APP_TOKEN` | Semgrep Cloud token (optional) | SAST |

## Rollback Procedures

### Quick Rollback (Kubernetes)
```bash
# View deployment history
kubectl rollout history deployment/auth-service

# Rollback to previous version
kubectl rollout undo deployment/auth-service

# Rollback to specific revision
kubectl rollout undo deployment/auth-service --to-revision=2
```

### Image-based Rollback
1. Go to GitHub Packages
2. Find the previous working image tag
3. Update deployment to use that tag:
```bash
kubectl set image deployment/auth-service auth-service=ghcr.io/OWNER/REPO/auth-service:PREVIOUS_SHA
```

### Database Rollback
```bash
cd backend/services/auth-service
npx knex migrate:rollback
```

**⚠️ Warning:** Always test rollback procedures in staging first.

## Pipeline Overview
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Lint     │     │   Secret    │     │    SAST     │
│  TypeCheck  │     │  Scanning   │     │  (Semgrep)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Tests    │
                    │ Unit + Int  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Build    │
                    │  & Push     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Trivy     │
                    │ Container   │
                    │   Scan      │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │   Staging   │          │ Production  │
       │ (auto)      │          │ (approval)  │
       └─────────────┘          └─────────────┘
```
