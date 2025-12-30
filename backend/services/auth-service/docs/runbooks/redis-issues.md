# Redis Issues Runbook

## Symptoms
- Rate limiting not working
- Session/token operations failing
- Health check failing for Redis

## Diagnosis

### 1. Check Redis Connectivity
```bash
redis-cli -h <redis-host> ping
redis-cli -h <redis-host> info
```

### 2. Check Memory
```bash
redis-cli info memory
# Look for: used_memory_human, maxmemory, evicted_keys
```

### 3. Check Connected Clients
```bash
redis-cli client list | wc -l
redis-cli info clients
```

## Resolution

### Connection Issues
1. Check security group/firewall rules
2. Check Redis is running: `kubectl get pods -l app=redis`
3. Check service endpoint: `kubectl get svc redis`

### Memory Pressure
```bash
# Check eviction policy
redis-cli config get maxmemory-policy

# Flush non-critical keys if emergency
redis-cli KEYS "captcha:*" | xargs redis-cli DEL
```

### Failover
If using Redis Cluster/Sentinel:
1. Check sentinel status
2. Manual failover if needed: `redis-cli -p 26379 SENTINEL failover mymaster`

## Impact During Outage
- Rate limiting fails open (allows requests)
- New logins may fail (can't store refresh tokens)
- MFA setup will fail

## Escalation
- Prolonged outage: Page Platform Team
