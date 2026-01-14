# Capacity Planning Guide

## Current Capacity

| Resource | Capacity | Utilization Target |
|----------|----------|-------------------|
| Pods | 3-10 | 60-80% CPU |
| Database connections | 100 | 60% |
| Redis memory | 1 GB | 70% |
| RabbitMQ queues | 100k messages | 10% |

## Scaling Triggers

### Horizontal Pod Autoscaler
```yaml
spec:
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        targetAverageUtilization: 70
```

### Database

Scale when:
- Connection pool > 80% utilized
- Query latency p99 > 500ms
- CPU > 70%

### Redis

Scale when:
- Memory > 80%
- Operations latency > 10ms
- Eviction rate increasing

## Load Estimates

| Event Size | Tickets | Peak RPS | Pods Needed |
|------------|---------|----------|-------------|
| Small | 1,000 | 50 | 3 |
| Medium | 10,000 | 200 | 5 |
| Large | 50,000 | 500 | 8 |
| Major | 100,000+ | 1000+ | 10+ |

## Capacity Formula
```
pods_needed = ceil(expected_rps / rps_per_pod)
rps_per_pod = 100 (baseline, adjust based on load tests)
```

## Pre-Event Scaling

For major events:

1. **24 hours before**
   - Scale pods to expected peak
   - Warm up database connections
   - Pre-populate cache

2. **1 hour before**
   - Verify all systems healthy
   - Enable enhanced monitoring
   - Alert team on standby

3. **During event**
   - Monitor real-time metrics
   - Manual scale if needed
   - Watch for bottlenecks

4. **After event**
   - Scale down gradually
   - Review performance data
   - Document learnings
