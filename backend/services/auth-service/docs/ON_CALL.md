# On-Call Guide

## Overview

This guide covers on-call responsibilities for the auth-service.

## Rotation Schedule

- Primary on-call: Weekly rotation (Monday 9am to Monday 9am)
- Secondary on-call: Backup for escalations
- Schedule managed in PagerDuty

## Response SLAs

| Severity | Response Time | Resolution Target |
|----------|---------------|-------------------|
| P1 - Critical | 15 minutes | 1 hour |
| P2 - High | 30 minutes | 4 hours |
| P3 - Medium | 2 hours | 24 hours |
| P4 - Low | 8 hours | 1 week |

## Severity Definitions

### P1 - Critical
- Complete auth outage
- Users cannot login
- Data breach suspected
- All tokens invalid

### P2 - High
- Partial outage (>10% errors)
- MFA not working
- OAuth providers failing
- High latency (>2s p99)

### P3 - Medium
- Single endpoint degraded
- Non-critical feature broken
- Elevated error rate (<10%)
- Performance degradation

### P4 - Low
- Minor bug
- Documentation issue
- Non-urgent improvement

## Runbooks

See `docs/runbooks/` for specific incident response procedures:

- [auth-failures.md](runbooks/auth-failures.md) - Authentication failures
- [database-issues.md](runbooks/database-issues.md) - Database problems
- [redis-issues.md](runbooks/redis-issues.md) - Redis/cache issues
- [rate-limiting.md](runbooks/rate-limiting.md) - Rate limit problems
- [token-issues.md](runbooks/token-issues.md) - JWT/token problems
- [high-error-rate.md](runbooks/high-error-rate.md) - Elevated errors

## Key Dashboards

- **Grafana**: https://grafana.internal/d/auth-service
- **Logs**: https://kibana.internal/app/logs (filter: `service:auth-service`)
- **Traces**: https://jaeger.internal (service: auth-service)
- **Alerts**: https://pagerduty.com/services/auth-service

## Key Metrics to Monitor
```
# Error rate (should be <1%)
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])

# Latency p99 (should be <500ms)
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Login success rate
rate(auth_login_attempts_total{status="success"}[5m]) / rate(auth_login_attempts_total[5m])
```

## Escalation Path

1. **Primary On-Call** - First responder
2. **Secondary On-Call** - If primary unavailable (15 min)
3. **Tech Lead** - If P1 not resolved in 30 min
4. **Engineering Manager** - If P1 not resolved in 1 hour
5. **Security Team** - If security incident suspected

## Handoff Checklist

At end of rotation:

- [ ] Review open incidents
- [ ] Document any ongoing issues
- [ ] Update runbooks if needed
- [ ] Brief incoming on-call
- [ ] Transfer PagerDuty rotation
