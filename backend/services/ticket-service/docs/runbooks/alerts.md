# Alert Rules & Runbooks

## Critical Alerts

### TicketServiceDown
- **Condition**: Health check failing for > 2 minutes
- **Severity**: Critical
- **Runbook**: [restart.md](./restart.md)
- **Action**: Check pod status, restart if needed

### DatabaseConnectionFailed
- **Condition**: DB connection pool exhausted
- **Severity**: Critical
- **Runbook**: [restart.md](./restart.md)
- **Action**: Check DB status, connection limits

### BlockchainSyncFailed
- **Condition**: Blockchain sync lag > 10 minutes
- **Severity**: Critical
- **Runbook**: [blockchain-incidents.md](./blockchain-incidents.md)
- **Action**: Check RPC endpoints, circuit breaker

## High Alerts

### HighErrorRate
- **Condition**: 5xx error rate > 5% for 5 minutes
- **Severity**: High
- **Action**: Check logs for error patterns

### HighLatency
- **Condition**: p99 latency > 5s for 5 minutes
- **Severity**: High
- **Action**: Check DB queries, external services

### CircuitBreakerOpen
- **Condition**: Any circuit breaker OPEN
- **Severity**: High
- **Runbook**: [blockchain-incidents.md](./blockchain-incidents.md)
- **Action**: Check upstream service health

### RateLimitExceeded
- **Condition**: Rate limit hits > 1000/min
- **Severity**: High
- **Action**: Check for abuse, adjust limits

## Medium Alerts

### HighMemoryUsage
- **Condition**: Memory > 80% for 10 minutes
- **Severity**: Medium
- **Action**: Check for memory leaks, scale up

### QueueBacklog
- **Condition**: Queue depth > 10,000 messages
- **Severity**: Medium
- **Action**: Scale consumers, check processing

### CertificateExpiringSoon
- **Condition**: TLS cert expires in < 14 days
- **Severity**: Medium
- **Runbook**: [key-rotation.md](./key-rotation.md)
- **Action**: Rotate certificates

## Alert Configuration
```yaml
# prometheus/alerts.yml
groups:
  - name: ticket-service
    rules:
      - alert: TicketServiceDown
        expr: up{service="ticket-service"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Ticket service is down"
          runbook: "https://docs/runbooks/restart.md"
```

## Notification Channels

| Severity | Channel |
|----------|---------|
| Critical | PagerDuty + Slack #incidents |
| High | Slack #alerts |
| Medium | Slack #monitoring |
