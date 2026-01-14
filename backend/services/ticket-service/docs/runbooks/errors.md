# Error Rate Thresholds

## Alerting Thresholds

| Metric | Warning | Critical | Window |
|--------|---------|----------|--------|
| 5xx Error Rate | > 1% | > 5% | 5 minutes |
| 4xx Error Rate | > 10% | > 25% | 5 minutes |
| Timeout Rate | > 0.5% | > 2% | 5 minutes |
| Circuit Breaker Opens | Any | > 2 | 5 minutes |

## Error Rate Calculation
```
error_rate = (5xx_count / total_requests) * 100
```

## Prometheus Queries

### 5xx Error Rate
```promql
sum(rate(http_requests_total{status_class="5xx"}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100
```

### Error Rate by Endpoint
```promql
sum by (route) (rate(http_requests_total{status_class="5xx"}[5m]))
/
sum by (route) (rate(http_requests_total[5m]))
* 100
```

## Response Actions

### Warning (1-5% errors)
1. Check recent deployments
2. Review error logs
3. Identify affected endpoints
4. Monitor for escalation

### Critical (>5% errors)
1. Page on-call engineer
2. Check service health
3. Consider rollback
4. Enable degraded mode if needed

## Error Categories

| Category | Typical Cause | Action |
|----------|---------------|--------|
| Database errors | Connection issues | Check DB health |
| Timeout errors | Slow queries/services | Check dependencies |
| Validation errors | Bad client input | Review API docs |
| Auth errors | Token issues | Check auth service |
| Blockchain errors | RPC issues | Check circuit breaker |

## SLO Targets

| Metric | Target |
|--------|--------|
| Availability | 99.9% |
| Error rate | < 0.1% |
| p99 Latency | < 1s |
