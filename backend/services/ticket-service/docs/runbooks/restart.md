# Restart Procedure

## Overview

This runbook documents the procedure for restarting the ticket-service in various environments.

## Pre-Restart Checklist

- [ ] Check if there are any in-flight ticket purchases
- [ ] Verify no migrations are running
- [ ] Ensure at least one replica remains available (for rolling restart)
- [ ] Check message queues for pending work

## Kubernetes Restart

### Rolling Restart (Recommended)

```bash
# Rolling restart - zero downtime
kubectl rollout restart deployment/ticket-service -n production

# Monitor rollout progress
kubectl rollout status deployment/ticket-service -n production

# Check pod status
kubectl get pods -l app=ticket-service -n production
```

### Single Pod Restart

```bash
# Delete a specific pod (Kubernetes will recreate it)
kubectl delete pod ticket-service-xxxxx-xxxxx -n production

# Force immediate restart
kubectl delete pod ticket-service-xxxxx-xxxxx -n production --grace-period=0 --force
```

## Docker Compose Restart

### Graceful Restart

```bash
# Stop and restart
docker-compose restart ticket-service

# Full restart with pull
docker-compose pull ticket-service
docker-compose up -d ticket-service
```

### Force Restart

```bash
# Force recreate
docker-compose up -d --force-recreate ticket-service
```

## Health Check Validation

After restart, verify service health:

```bash
# Basic health
curl http://localhost:3004/health

# Readiness (all dependencies)
curl http://localhost:3004/health/ready

# Expected response
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "checks": {
    "database": "up",
    "redis": "up",
    "rabbitmq": "up"
  }
}
```

## Connection Draining

The service supports graceful shutdown:

1. Kubernetes sends SIGTERM
2. Service stops accepting new requests (5s grace period)
3. In-flight requests complete (30s timeout)
4. Database connections close
5. Process exits

### Timeout Configuration

```yaml
# In Kubernetes deployment
spec:
  terminationGracePeriodSeconds: 45
  containers:
    - name: ticket-service
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
```

## Emergency Restart

If the service is unresponsive:

```bash
# 1. Check for OOM or resource issues
kubectl top pods -l app=ticket-service -n production

# 2. Check logs for errors
kubectl logs -l app=ticket-service -n production --tail=100

# 3. Force kill and restart
kubectl delete pod -l app=ticket-service -n production --force --grace-period=0

# 4. Scale to zero then back up
kubectl scale deployment/ticket-service --replicas=0 -n production
kubectl scale deployment/ticket-service --replicas=3 -n production
```

## Post-Restart Verification

1. **Health Check**: All endpoints respond
2. **Metrics**: Prometheus scraping works
3. **Logs**: No error spam
4. **Queue**: RabbitMQ consumers reconnected
5. **Database**: Connection pool healthy

```bash
# Check metrics
curl http://localhost:3004/metrics | grep http_requests_total

# Check recent errors
kubectl logs -l app=ticket-service -n production --since=5m | grep -i error
```

## Troubleshooting

### Service Won't Start

1. Check environment variables are set
2. Verify database connectivity
3. Check Redis availability
4. Ensure JWT secret is valid

### Slow Startup

1. Database migrations may be running
2. Initial connection pool warmup
3. Check if initialization is stuck

### Continuous Restart Loop

```bash
# Check crash reason
kubectl describe pod ticket-service-xxxxx-xxxxx -n production

# Common causes:
# - Missing environment variables
# - Database connection failed
# - Invalid configuration
```

## Contact

- **On-call**: #incident-response Slack channel
- **Escalation**: Platform team lead
