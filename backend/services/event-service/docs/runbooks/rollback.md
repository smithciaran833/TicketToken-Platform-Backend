# Service Rollback Runbook

This runbook covers rollback procedures for the Event Service deployment.

## Quick Reference

| Scenario | Command |
|----------|---------|
| Kubernetes deployment | `kubectl rollout undo deployment/event-service -n production` |
| Feature flag | Toggle off in LaunchDarkly/config |
| Database migration | See [migration-rollback.md](./migration-rollback.md) |

---

## Table of Contents

1. [When to Rollback vs Fix Forward](#when-to-rollback-vs-fix-forward)
2. [Kubernetes Deployment Rollback](#kubernetes-deployment-rollback)
3. [Feature Flag Rollback](#feature-flag-rollback)
4. [Emergency Rollback Procedure](#emergency-rollback-procedure)
5. [Post-Rollback Checklist](#post-rollback-checklist)

---

## When to Rollback vs Fix Forward

### Rollback When:

- ❌ Service is completely down (500 errors on all endpoints)
- ❌ Data corruption is occurring
- ❌ Security vulnerability discovered
- ❌ Critical business flow broken (ticket purchases failing)
- ❌ Fix will take more than 30 minutes
- ❌ Root cause is unknown

### Fix Forward When:

- ✅ Issue is isolated to non-critical feature
- ✅ Root cause is identified
- ✅ Fix is simple and well-tested
- ✅ Fix can be deployed in under 15 minutes
- ✅ Rollback would cause data issues

---

## Kubernetes Deployment Rollback

### Step 1: Verify Current State

```bash
# Check deployment status
kubectl get deployment event-service -n production

# View recent rollout history
kubectl rollout history deployment/event-service -n production

# Check pod status
kubectl get pods -l app=event-service -n production
```

### Step 2: Perform Rollback

**Rollback to Previous Version:**
```bash
kubectl rollout undo deployment/event-service -n production
```

**Rollback to Specific Revision:**
```bash
# List revisions
kubectl rollout history deployment/event-service -n production

# Rollback to specific revision (e.g., revision 5)
kubectl rollout undo deployment/event-service -n production --to-revision=5
```

### Step 3: Verify Rollback

```bash
# Watch rollback progress
kubectl rollout status deployment/event-service -n production

# Verify pods are running
kubectl get pods -l app=event-service -n production

# Check service health
curl -s https://api.tickettoken.com/event-service/health/live
```

### Step 4: Verify Functionality

```bash
# Check ready endpoint
curl -s https://api.tickettoken.com/event-service/health/ready

# Verify API is responding
curl -s https://api.tickettoken.com/api/v1/events?limit=1 -H "Authorization: Bearer $TOKEN"
```

---

## Feature Flag Rollback

For features behind feature flags, rollback without deployment:

### LaunchDarkly (if using)

1. Log into LaunchDarkly dashboard
2. Navigate to Event Service flags
3. Toggle the problematic flag OFF
4. Wait for propagation (~30 seconds)

### Environment Variable Flags

```bash
# Update ConfigMap
kubectl edit configmap event-service-config -n production

# Or patch directly
kubectl patch configmap event-service-config -n production \
  --type='json' \
  -p='[{"op": "replace", "path": "/data/FEATURE_NEW_PRICING", "value": "false"}]'

# Restart pods to pick up changes
kubectl rollout restart deployment/event-service -n production
```

### Code-Level Feature Flags

Common feature flags in event-service:

| Flag | Description | Default |
|------|-------------|---------|
| `FEATURE_STATE_MACHINE` | Use new state machine | true |
| `FEATURE_DYNAMIC_PRICING` | Enable dynamic pricing | true |
| `FEATURE_CANCELLATION_WORKFLOW` | New cancellation flow | true |

---

## Emergency Rollback Procedure

**Time-Critical Scenario: Service is Down**

### 1. Declare Incident (30 seconds)
```bash
# Post to incident channel
# Assign incident commander
```

### 2. Immediate Rollback (60 seconds)
```bash
# One-liner rollback
kubectl rollout undo deployment/event-service -n production && \
kubectl rollout status deployment/event-service -n production --timeout=120s
```

### 3. Verify (30 seconds)
```bash
# Quick health check
curl -sf https://api.tickettoken.com/event-service/health/live && echo "HEALTHY" || echo "STILL DOWN"
```

### 4. If Still Down
```bash
# Check previous revision
kubectl rollout undo deployment/event-service -n production --to-revision=<N-2>

# Or scale to 0 and back (nuclear option)
kubectl scale deployment/event-service -n production --replicas=0
kubectl scale deployment/event-service -n production --replicas=3
```

### 5. Escalation Path

| Time | Action |
|------|--------|
| 0-5 min | Rollback attempted |
| 5-10 min | Page on-call SRE |
| 10-15 min | Page engineering lead |
| 15+ min | Incident war room |

---

## Post-Rollback Checklist

### Immediate (First 15 minutes)

- [ ] Verify service health endpoints return 200
- [ ] Check error rates in monitoring (should decrease)
- [ ] Verify critical flows work:
  - [ ] List events: `GET /api/v1/events`
  - [ ] Get event: `GET /api/v1/events/:id`
  - [ ] Create event: `POST /api/v1/events`
- [ ] Notify stakeholders of rollback
- [ ] Update incident ticket/channel

### Within 1 Hour

- [ ] Review logs from failed deployment
- [ ] Identify root cause
- [ ] Create post-mortem document
- [ ] Check for any data inconsistencies

### Within 24 Hours

- [ ] Complete post-mortem
- [ ] Identify preventive measures
- [ ] Create follow-up tickets
- [ ] Schedule fix deployment

---

## Rollback Impact Assessment

### Things That May Break After Rollback

| Feature | Impact | Mitigation |
|---------|--------|------------|
| New API fields | Clients may expect new fields | Communicate to clients |
| Database schema | New columns may exist | Migrations are forward-compatible |
| Background jobs | Job format may differ | Clear stuck jobs |
| Cache format | Cache keys may differ | Flush Redis keys |

### Flush Caches If Needed

```bash
# Connect to Redis
kubectl exec -it redis-0 -n production -- redis-cli

# Flush event-service keys
KEYS event:* | xargs -r DEL
KEYS capacity:* | xargs -r DEL
KEYS price:* | xargs -r DEL
```

### Clear Stuck Jobs

```bash
# Connect to app pod
kubectl exec -it deployment/event-service -n production -- /bin/sh

# Clear Bull queue
npm run queue:clear
```

---

## Related Runbooks

- [Migration Rollback](./migration-rollback.md) - Database migration rollback
- [Incident Response](./incident-response.md) - Full incident response procedure
- [README](./README.md) - Runbooks overview

---

## Contact

- **On-call**: Check PagerDuty rotation
- **Slack**: #event-service-alerts
- **Email**: platform-team@tickettoken.com
