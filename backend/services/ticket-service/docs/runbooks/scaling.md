# Scaling Procedure

## Overview

This runbook documents scaling procedures for the ticket-service to handle varying load.

## Capacity Guidelines

### Resource Requirements Per Pod

| Resource | Request | Limit | Notes |
|----------|---------|-------|-------|
| CPU | 250m | 1000m | Scales with request volume |
| Memory | 256Mi | 512Mi | Steady state ~200Mi |
| Connections | - | 20 | Database pool per pod |

### Recommended Replica Counts

| Load Level | Replicas | RPS Capacity | Use Case |
|------------|----------|--------------|----------|
| Low | 2 | ~500 | Normal operations |
| Medium | 4 | ~1000 | Popular events on sale |
| High | 8 | ~2000 | Major event launch |
| Critical | 16+ | ~4000+ | High-demand events |

## Horizontal Scaling (Kubernetes)

### Manual Scaling

```bash
# Scale to specific replicas
kubectl scale deployment/ticket-service --replicas=4 -n production

# Verify scaling
kubectl get deployment ticket-service -n production
kubectl get pods -l app=ticket-service -n production
```

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ticket-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ticket-service
  minReplicas: 2
  maxReplicas: 16
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

Apply HPA:

```bash
kubectl apply -f hpa.yaml
kubectl get hpa ticket-service-hpa -n production
```

### KEDA Event-Driven Scaling

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ticket-service-scaler
  namespace: production
spec:
  scaleTargetRef:
    name: ticket-service
  minReplicaCount: 2
  maxReplicaCount: 20
  triggers:
    - type: rabbitmq
      metadata:
        queueName: ticket-purchases
        queueLength: "50"
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: http_requests_per_second
        threshold: "100"
```

## Vertical Scaling

### Increase Resources

```yaml
# Update deployment resources
spec:
  containers:
    - name: ticket-service
      resources:
        requests:
          cpu: "500m"
          memory: "512Mi"
        limits:
          cpu: "2000m"
          memory: "1Gi"
```

### Database Connection Pool

When scaling pods, consider connection limits:

```
Total Connections = Pods × Pool Size
PostgreSQL max_connections = 200
PgBouncer max_client_conn = 1000

Example:
- 8 pods × 20 connections = 160 (OK)
- 16 pods × 20 connections = 320 (reduce pool size to 10)
```

Update pool configuration:

```bash
# Set pool size per pod
DB_POOL_MAX=10 kubectl set env deployment/ticket-service -n production
```

## Pre-Event Scaling

For anticipated high-traffic events:

### 1 Hour Before Event

```bash
# Scale up proactively
kubectl scale deployment/ticket-service --replicas=8 -n production

# Warm up connection pools
curl http://ticket-service.production/health/ready

# Pre-populate caches
curl -X POST http://ticket-service.production/internal/cache/warm \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -d '{"eventId": "event-uuid"}'
```

### During Event

```bash
# Monitor metrics
watch kubectl top pods -l app=ticket-service -n production

# Check HPA status
kubectl describe hpa ticket-service-hpa -n production
```

### After Event

```bash
# Let HPA scale down naturally (wait 5+ minutes)
# Or scale down manually
kubectl scale deployment/ticket-service --replicas=2 -n production
```

## Scaling Dependencies

When scaling ticket-service, also consider:

### Redis

```bash
# Check Redis memory
redis-cli INFO memory | grep used_memory_human

# Scale Redis if needed (ElastiCache)
aws elasticache modify-replication-group \
  --replication-group-id ticket-redis \
  --cache-node-type cache.r6g.large
```

### RabbitMQ

```bash
# Check queue depths
rabbitmqctl list_queues name messages

# Add nodes if queues backing up
kubectl scale statefulset/rabbitmq --replicas=3 -n production
```

### Database

```bash
# Monitor connection count
SELECT count(*) FROM pg_stat_activity WHERE datname = 'tickettoken';

# Scale read replicas (RDS)
aws rds create-db-instance-read-replica \
  --db-instance-identifier ticket-db-replica-2 \
  --source-db-instance-identifier ticket-db
```

## Monitoring During Scaling

```bash
# Watch pod status
kubectl get pods -l app=ticket-service -n production -w

# Monitor resource usage
kubectl top pods -l app=ticket-service -n production

# Check for pending pods
kubectl get pods -l app=ticket-service --field-selector=status.phase=Pending

# View HPA decisions
kubectl describe hpa ticket-service-hpa -n production | grep -A5 Events
```

## Troubleshooting

### Pods Not Starting

```bash
# Check events
kubectl get events -n production --sort-by='.lastTimestamp' | grep ticket-service

# Common issues:
# - Insufficient cluster resources -> Add nodes
# - Image pull errors -> Check registry access
# - Resource quota exceeded -> Request quota increase
```

### Uneven Load Distribution

```bash
# Check pod distribution
kubectl get pods -l app=ticket-service -o wide -n production

# Verify service endpoints
kubectl get endpoints ticket-service -n production
```

### Connection Pool Exhaustion

```bash
# Signs: "too many connections" errors
# Solution: Reduce pool size or add connection pooler

# Check current usage
kubectl exec -it ticket-service-xxxxx -- node -e \
  "console.log(process.env.DB_POOL_MAX)"
```

## Capacity Testing

Before major events, run load tests:

```bash
# Using k6
k6 run --vus 100 --duration 5m tests/load/purchase.js

# Monitor during test
kubectl top pods -l app=ticket-service -n staging
```
