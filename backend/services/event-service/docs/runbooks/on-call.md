# On-Call Procedures

## Overview

This document outlines on-call responsibilities and procedures for the event-service.

## On-Call Rotation

### Schedule
- **Primary**: 1 week rotation
- **Secondary**: Backup for primary
- **Handoff**: Mondays at 10:00 AM UTC

### Coverage
- **Hours**: 24/7
- **Response SLA**: 
  - P1 (Critical): 15 minutes
  - P2 (High): 1 hour
  - P3 (Medium): 4 hours
  - P4 (Low): Next business day

## Responsibilities

### Primary On-Call

1. **Monitor alerts** from PagerDuty/Opsgenie
2. **Acknowledge** alerts within SLA
3. **Triage** incidents by severity
4. **Resolve** or **escalate** as needed
5. **Document** actions in incident channel
6. **Handoff** unresolved issues at rotation end

### Secondary On-Call

1. **Available** if primary unreachable
2. **Assist** primary on P1 incidents
3. **Cover** primary during breaks

## Alert Response

### Step 1: Acknowledge
```bash
# Acknowledge in PagerDuty
pd incident:ack <incident-id>
```

### Step 2: Assess

Check dashboards:
- Grafana: `https://grafana.internal/d/event-service`
- Logs: `https://kibana.internal/app/logs?service=event-service`

### Step 3: Investigate
```bash
# Check service health
curl https://event-service.internal/health

# Check recent deployments
kubectl rollout history deployment/event-service -n production

# Check error rates
curl https://event-service.internal/metrics | grep errors_total
```

### Step 4: Mitigate

See [incident-response.md](./incident-response.md) for specific scenarios.

### Step 5: Resolve

1. Confirm service is healthy
2. Update incident status
3. Notify stakeholders
4. Schedule post-mortem if needed

## Common Issues

| Alert | Likely Cause | Quick Fix |
|-------|--------------|-----------|
| High Error Rate | Bad deployment | Rollback |
| High Latency | DB slow queries | Kill queries |
| Memory High | Memory leak | Restart pods |
| Disk Full | Log accumulation | Clear logs |
| Circuit Open | Venue service down | Wait/bypass |

## Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| Engineering Lead | TBD | TBD | @eng-lead |
| Platform Team | TBD | TBD | @platform |
| Database Team | TBD | TBD | @database |
| Security Team | TBD | TBD | @security |

## Tools Access

Ensure you have access to:
- [ ] PagerDuty/Opsgenie
- [ ] Grafana dashboards
- [ ] Kibana logs
- [ ] kubectl (production cluster)
- [ ] Database read replica
- [ ] Slack incident channels
