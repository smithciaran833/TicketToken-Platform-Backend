# Mass Authentication Failures Runbook

## Symptoms
- Spike in 401 errors
- User complaints about login failures
- Alert: `auth_failure_rate_high`

## Diagnosis

### 1. Check Error Pattern
```bash
# Are failures for specific users or all users?
kubectl logs -l app=auth-service --tail=1000 | grep "401" | jq '.email' | sort | uniq -c | sort -rn | head
```

### 2. Check JWT Keys
```bash
# Verify keys are loaded
kubectl exec -it <pod> -- env | grep JWT
```

### 3. Check Token Expiry
- Are access tokens expiring too quickly?
- Is clock drift an issue?

### 4. Check Database
```bash
# Can we read user records?
kubectl exec -it <pod> -- node -e "require('./dist/config/database').pool.query('SELECT 1')"
```

## Resolution

### JWT Key Issues
1. Verify JWT_PUBLIC_KEY and JWT_PRIVATE_KEY are set
2. Check key rotation hasn't invalidated all tokens
3. If keys corrupted, generate new and restart

### Clock Drift
```bash
# Check pod time
kubectl exec -it <pod> -- date

# Compare to node time
```

### Brute Force Attack
If single IP causing failures:
1. Check rate limiter is working
2. Add IP to blocklist if necessary
3. Consider enabling CAPTCHA globally

## Escalation
- If key compromise suspected: Immediate L3 + Security Team
