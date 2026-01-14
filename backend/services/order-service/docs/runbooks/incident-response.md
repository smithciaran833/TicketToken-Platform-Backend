# Order Service - Incident Response Playbook

## Overview
This document outlines procedures for responding to incidents in the order-service.

---

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **SEV-1** | Critical - Service down, data loss | 15 min | Complete outage, payment failures |
| **SEV-2** | High - Major feature broken | 30 min | Refunds failing, order creation errors |
| **SEV-3** | Medium - Degraded performance | 2 hours | Slow responses, intermittent errors |
| **SEV-4** | Low - Minor issues | 24 hours | UI bugs, non-critical errors |

---

## SEV-1: Complete Service Outage

### Symptoms
- Health checks failing
- No orders being processed
- 5xx errors on all endpoints

### Immediate Actions
1. **Alert team** via PagerDuty/Slack
2. **Check service status:**
```bash
   kubectl get pods -l app=order-service
   kubectl logs -l app=order-service --tail=100
```
3. **Check dependencies:**
```bash
   # Database
   kubectl exec -it order-service-xxx -- nc -zv tickettoken-postgres 5432
   
   # Redis
   kubectl exec -it order-service-xxx -- nc -zv tickettoken-redis 6379
   
   # RabbitMQ
   kubectl exec -it order-service-xxx -- nc -zv tickettoken-rabbitmq 5672
```

### Recovery Steps
1. If pods crashing, check logs and rollback:
```bash
   kubectl rollout undo deployment/order-service
```
2. If database issue, check connection pool:
```bash
   kubectl exec -it tickettoken-postgres-0 -- psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'orders';"
```
3. If memory issue, increase limits or restart:
```bash
   kubectl delete pod -l app=order-service
```

---

## SEV-2: Payment/Refund Failures

### Symptoms
- Stripe webhook errors
- Orders stuck in PENDING
- Refunds not processing

### Immediate Actions
1. **Check Stripe Dashboard** for webhook failures
2. **Check webhook logs:**
```bash
   kubectl logs -l app=order-service --tail=500 | grep -i "stripe\|webhook\|payment"
```
3. **Check for idempotency issues:**
```sql
   SELECT * FROM webhook_events 
   WHERE processed_at IS NULL 
   AND created_at > NOW() - INTERVAL '1 hour';
```

### Recovery Steps
1. **Replay failed webhooks** from Stripe Dashboard
2. **Manually process stuck orders:**
```sql
   -- Find stuck orders
   SELECT id, status, created_at, stripe_payment_intent_id 
   FROM orders 
   WHERE status = 'PENDING' 
   AND created_at < NOW() - INTERVAL '30 minutes';
```
3. **Check payment-service health:**
```bash
   curl http://payment-service:3006/health
```

---

## SEV-2: High Dispute Rate

### Symptoms
- Multiple chargebacks in short period
- Fraud alerts from Stripe

### Immediate Actions
1. **Pause new orders** if fraud detected:
```bash
   kubectl set env deployment/order-service ORDERS_PAUSED=true
```
2. **Review recent orders:**
```sql
   SELECT user_id, COUNT(*) as order_count, SUM(total_cents) as total
   FROM orders 
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY user_id
   ORDER BY order_count DESC
   LIMIT 20;
```

### Recovery Steps
1. Block suspicious users
2. Submit dispute evidence via Stripe
3. Review fraud detection thresholds

---

## SEV-3: Slow Response Times

### Symptoms
- P95 latency > 1s
- Timeouts on some requests
- Under-pressure alerts

### Immediate Actions
1. **Check pod resource usage:**
```bash
   kubectl top pods -l app=order-service
```
2. **Check database queries:**
```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active' AND now() - query_start > interval '5 seconds';
```

### Recovery Steps
1. **Scale up if CPU/memory bound:**
```bash
   kubectl scale deployment/order-service --replicas=4
```
2. **Kill long-running queries:**
```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE duration > interval '30 seconds' AND state = 'active';
```
3. **Add missing indexes** if query-related

---

## Communication Templates

### Internal Alert
```
🚨 [SEV-X] Order Service Issue
Status: Investigating/Identified/Resolved
Impact: [Description of user impact]
Start Time: [UTC timestamp]
Current Status: [What's happening]
Next Update: [When]
```

### Customer Communication (SEV-1/SEV-2)
```
We're currently experiencing issues with order processing. 
Our team is actively working to resolve this. 
We apologize for any inconvenience and will update you shortly.
```

---

## Post-Incident

1. **Create incident ticket** with timeline
2. **Schedule post-mortem** within 48 hours
3. **Document root cause** and fixes
4. **Create action items** to prevent recurrence
5. **Update this runbook** if needed

---

## Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | Check PagerDuty |
| Engineering Lead | @engineering-lead |
| DevOps | @devops-team |
| Stripe Support | support.stripe.com |

---

## Related Runbooks
- [Database Failover](./database-failover.md)
- [Deployment Rollback](./deployment-rollback.md)
- [Graceful Degradation](../GRACEFUL_DEGRADATION_STRATEGIES.md)
