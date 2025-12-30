# High Error Rate Runbook

## Symptoms
- 5xx error rate > 1%
- Alert: `auth_service_error_rate_high`

## Diagnosis

### 1. Check Service Health
```bash
curl http://auth-service:3001/health/ready
curl http://auth-service:3001/health/live
```

### 2. Check Logs
```bash
# Recent errors
kubectl logs -l app=auth-service --tail=100 | grep -i error

# Error breakdown
kubectl logs -l app=auth-service --tail=1000 | grep "statusCode\":5" | jq '.msg' | sort | uniq -c
```

### 3. Check Dependencies
```bash
# Database
curl http://auth-service:3001/health/ready | jq '.checks.database'

# Redis
curl http://auth-service:3001/health/ready | jq '.checks.redis'
```

### 4. Check Metrics
- Grafana: Auth Service Dashboard
- Look for: latency spikes, connection pool exhaustion, circuit breaker trips

## Resolution

### Database Connection Issues
See [database-issues.md](./database-issues.md)

### Redis Connection Issues
See [redis-issues.md](./redis-issues.md)

### Memory/CPU Issues
```bash
# Check resource usage
kubectl top pods -l app=auth-service

# Restart if OOM
kubectl rollout restart deployment/auth-service
```

### Circuit Breaker Open
- Check downstream service health
- Wait for automatic recovery (30s reset timeout)
- If persistent, check downstream service

## Escalation
If error rate persists after 15 minutes:
1. Page L2 Engineering
2. Consider traffic reduction via rate limits
