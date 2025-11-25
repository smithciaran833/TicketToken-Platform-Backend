# API Gateway - Disaster Recovery & Operational Runbooks

**Service:** API Gateway  
**Version:** 1.0.0  
**Last Updated:** November 13, 2025

---

## Table of Contents

1. [Alert Response Procedures](#alert-response-procedures)
2. [Incident Playbooks](#incident-playbooks)
3. [Disaster Recovery](#disaster-recovery)
4. [Common Issues & Solutions](#common-issues--solutions)
5. [Emergency Contacts](#emergency-contacts)

---

## Alert Response Procedures

### Critical Alerts (P0 - Immediate Response Required)

#### 🚨 APIGatewayDown
**Alert:** `up{job="api-gateway"} == 0`  
**Severity:** Critical  
**SLA:** Acknowledge < 5min, Resolve < 15min

**Symptoms:**
- Service unreachable
- All health checks failing
- No metrics being reported

**Investigation Steps:**
1. Check service status:
   ```bash
   kubectl get pods -n production -l app=api-gateway
   kubectl describe pod <pod-name> -n production
   kubectl logs <pod-name> -n production --tail=100
   ```

2. Check for recent deployments:
   ```bash
   kubectl rollout history deployment/api-gateway -n production
   ```

3. Check resource utilization:
   ```bash
   kubectl top pods -n production -l app=api-gateway
   ```

**Resolution:**
- **If pods are crashing:** Check logs for errors, may need rollback
- **If OOM killed:** Increase memory limits
- **If deployment issue:** Rollback to previous version
- **If infrastructure issue:** Escalate to infrastructure team

**Rollback Command:**
```bash
kubectl rollout undo deployment/api-gateway -n production
kubectl rollout status deployment/api-gateway -n production
```

**Post-Resolution:**
- Document root cause
- Update monitoring if needed
- Schedule post-mortem

---

#### 🚨 APIGatewayHighErrorRate
**Alert:** `5xx error rate > 5%`  
**Severity:** Critical  
**SLA:** Acknowledge < 5min, Resolve < 30min

**Symptoms:**
- High rate of 500/503 errors
- Users unable to complete operations
- Elevated error metrics

**Investigation Steps:**
1. Check error distribution:
   ```bash
   # In Grafana, check Error Rate panel
   # Or query Prometheus:
   curl 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{service="api-gateway",status_code=~"5.."}[5m])'
   ```

2. Check recent logs:
   ```bash
   kubectl logs -n production -l app=api-gateway --tail=200 | grep ERROR
   ```

3. Check downstream service health:
   ```bash
   # Check circuit breaker status in Grafana
   # Or check health endpoints
   for service in auth-service venue-service event-service ticket-service; do
     echo "Checking $service..."
     kubectl exec -n production <gateway-pod> -- curl http://$service/health
   done
   ```

**Common Causes:**
- Downstream service failure → Check circuit breakers
- Database connection issues → Check connection pools
- Memory leak → Check memory usage
- Configuration error → Check recent config changes

**Resolution:**
- **Downstream failure:** Circuit breakers should protect, wait for recovery
- **Database issues:** Restart affected service or scale up connections
- **Memory leak:** Restart pods, plan fix deployment
- **Config error:** Rollback configuration

**Mitigation:**
```bash
# If specific downstream service is down, circuit breaker should handle it
# Monitor circuit breaker dashboard

# If widespread, consider rate limiting to reduce load
kubectl edit configmap api-gateway-config -n production
# Adjust RATE_LIMIT_MAX to lower value temporarily
```

---

#### 🚨 SecurityViolationDetected
**Alert:** `increase(security_violations_total) > 0`  
**Severity:** Critical (Security)  
**SLA:** Acknowledge < 2min, Investigate < 15min

**Symptoms:**
- Security violation alerts firing
- Attempted unauthorized access
- Potential breach detected

**IMMEDIATE ACTIONS:**
1. **DO NOT IGNORE THIS ALERT**
2. Check violation type:
   ```bash
   # Query Prometheus for violation details
   curl 'http://prometheus:9090/api/v1/query?query=security_violations_total{service="api-gateway"}'
   ```

3. Check application logs:
   ```bash
   kubectl logs -n production -l app=api-gateway --tail=500 | grep -i "security\|violation\|unauthorized"
   ```

4. Identify source:
   - IP address
   - User ID (if authenticated)
   - Endpoint attempted
   - Violation type

**Response Actions:**
- **If credential brute force:** Ban IP immediately
- **If token manipulation:** Revoke tokens, force re-auth
- **If SQL injection attempt:** Verify input validation, ban IP
- **If cross-tenant attempt:** Review tenant isolation, audit user

**Ban IP Command:**
```bash
# Add to firewall/WAF
kubectl exec -n production <gateway-pod> -- \
  redis-cli SET "banned:ip:<ip-address>" "1" EX 3600
```

**Escalation:**
- Notify security team immediately
- Create security incident ticket
- Preserve logs for forensics
- Document timeline of events

---

#### 🚨 CrossTenantAccessAttempt
**Alert:** `increase(cross_tenant_attempts_total) > 0`  
**Severity:** Critical (Security)  
**SLA:** Acknowledge < 2min, Investigate < 15min

**This is a CRITICAL security violation - potential data breach attempt**

**IMMEDIATE ACTIONS:**
1. Identify the attempt:
   ```bash
   kubectl logs -n production -l app=api-gateway --tail=1000 | grep "cross-tenant"
   ```

2. Extract details:
   - Source tenant ID
   - Target tenant ID
   - User ID
   - Attempted resource
   - Timestamp

3. Check if successful:
   ```bash
   # CRITICAL: Check if data was accessed
   # Review response codes - should be 403/404
   kubectl logs -n production -l app=api-gateway | grep "<user-id>" | grep "200"
   ```

**Response Actions:**
- **If blocked (403/404):** Good - system working correctly, but investigate attempt
- **If successful (200):** CRITICAL DATA BREACH - Follow breach protocol

**Breach Protocol (if data accessed):**
1. Immediately notify:
   - Security team
   - Engineering manager
   - CTO
   - Legal team (for compliance notification)

2. Contain:
   - Revoke user tokens
   - Ban IP address
   - Disable user account
   - Review all recent accesses by user

3. Investigate:
   - How was tenant isolation bypassed?
   - What data was accessed?
   - Duration of breach?
   - Other affected users?

4. Remediate:
   - Fix vulnerability immediately
   - Deploy patch
   - Audit all similar code patterns

**Post-Incident:**
- Full security review
- Compliance notifications (GDPR, etc.)
- Customer notifications if required
- Post-mortem within 24 hours

---

### Warning Alerts (P1 - Response Within 1 Hour)

#### ⚠️ CircuitBreakerOpen
**Alert:** `circuit_breaker_state == 1`  
**Severity:** Warning  
**SLA:** Investigate < 1 hour

**Investigation:**
1. Identify affected service:
   ```bash
   # Check Grafana Circuit Breaker panel
   # Or query Prometheus
   curl 'http://prometheus:9090/api/v1/query?query=circuit_breaker_state{service="api-gateway"}'
   ```

2. Check downstream service:
   ```bash
   SERVICE_NAME=<affected-service>
   kubectl get pods -n production -l app=$SERVICE_NAME
   kubectl logs -n production -l app=$SERVICE_NAME --tail=100
   ```

3. Review recent changes:
   - Recent deployments?
   - Configuration changes?
   - Load spike?

**Resolution:**
- Circuit breaker will auto-recover when service is healthy
- Fix underlying issue in downstream service
- Monitor for auto-recovery (circuit moves to half-open, then closed)
- If doesn't recover in 30min, restart downstream service

---

#### ⚠️ HighAuthenticationFailureRate
**Alert:** `auth failure rate > 10%`  
**Severity:** Warning  
**SLA:** Investigate < 1 hour

**Possible Causes:**
- Credential brute force attempt
- Invalid JWT tokens (expiry issue)
- Auth service issues
- Client application bug

**Investigation:**
1. Check failure types:
   ```bash
   kubectl logs -n production -l app=api-gateway --tail=500 | grep "auth.*fail"
   ```

2. Check patterns:
   - Same IP repeatedly failing? → Brute force
   - Many different users? → System issue
   - Specific time period? → Deployment correlation

**Resolution:**
- **Brute force:** Ban IP, implement stricter rate limiting
- **Token expiry:** Check JWT configuration
- **Auth service:** Check auth-service health
- **Client bug:** Notify application team

---

## Incident Playbooks

### Playbook 1: Service Unavailable

**Scenario:** Gateway returns 503 errors

**Checklist:**
- [ ] Check pod status
- [ ] Review recent deployments
- [ ] Check resource utilization
- [ ] Verify downstream services
- [ ] Check Redis connectivity
- [ ] Review circuit breaker status
- [ ] Check for memory leaks
- [ ] Review error logs

**Commands:**
```bash
# 1. Pod status
kubectl get pods -n production -l app=api-gateway

# 2. Resource usage
kubectl top pods -n production -l app=api-gateway

# 3. Logs
kubectl logs -n production -l app=api-gateway --tail=200

# 4. Describe pod
kubectl describe pod <pod-name> -n production

# 5. Check events
kubectl get events -n production --sort-by='.lastTimestamp' | head -20

# 6. Test Redis
kubectl exec -n production <gateway-pod> -- redis-cli -h redis PING

# 7. Test downstream
kubectl exec -n production <gateway-pod> -- \
  curl http://auth-service:4001/health
```

---

### Playbook 2: High Latency

**Scenario:** P95 latency > 2s

**Investigation Tree:**
```
High Latency
├── Downstream slow?
│   ├── Check circuit breaker metrics
│   ├── Check downstream latency panel
│   └── → Fix slow service
├── Database slow?
│   ├── N/A (no database)
│   └── Check Redis latency
├── High CPU?
│   ├── Check CPU metrics
│   └── → Scale horizontally
├── Memory pressure?
│   ├── Check memory metrics
│   └── → Restart or scale
└── Network issues?
    ├── Check network latency
    └── → Check infrastructure
```

**Resolution Steps:**
1. Identify bottleneck using Grafana
2. Scale if resource-constrained:
   ```bash
   kubectl scale deployment/api-gateway --replicas=6 -n production
   ```
3. If downstream issue, wait for circuit breaker
4. If memory leak, restart pods:
   ```bash
   kubectl rollout restart deployment/api-gateway -n production
   ```

---

### Playbook 3: Memory Leak

**Scenario:** Memory usage continuously increasing

**Detection:**
```bash
# Watch memory over time
kubectl top pods -n production -l app=api-gateway --watch

# Or check Grafana Memory Usage panel
```

**Mitigation:**
1. **Immediate:** Restart affected pods
   ```bash
   kubectl delete pod <pod-name> -n production
   # New pod will be created automatically
   ```

2. **Short-term:** Monitor for recurrence
3. **Long-term:** 
   - Profile application
   - Find leak source
   - Deploy fix
   - Add memory alerts

---

### Playbook 4: Redis Connection Issues

**Scenario:** Cannot connect to Redis

**Symptoms:**
- Auth failures
- Cache miss rate 100%
- Errors about Redis connection

**Diagnosis:**
```bash
# 1. Check Redis pod
kubectl get pods -n production -l app=redis

# 2. Test connection from gateway
kubectl exec -n production <gateway-pod> -- \
  redis-cli -h redis-service PING

# 3. Check Redis logs
kubectl logs -n production -l app=redis --tail=100
```

**Resolution:**
- **Redis down:** Restart Redis
- **Network issue:** Check service/DNS
- **Auth issue:** Verify REDIS_PASSWORD
- **Connection pool exhausted:** Increase pool size or restart gateway

**Restart Redis:**
```bash
kubectl rollout restart statefulset/redis -n production
# Monitor for recovery
kubectl rollout status statefulset/redis -n production
```

---

## Disaster Recovery

### Disaster Scenarios

#### Scenario 1: Complete Service Failure

**RTO:** 15 minutes  
**RPO:** 0 (stateless service)

**Recovery Steps:**
1. Verify backup region is healthy (if multi-region)
2. Restore from last known good image:
   ```bash
   # Rollback to previous version
   kubectl rollout undo deployment/api-gateway -n production
   ```
3. If complete infrastructure failure:
   ```bash
   # Redeploy from scratch
   kubectl apply -f k8s/
   ```
4. Verify service is operational
5. Redirect traffic

#### Scenario 2: Data Center Failure

**RTO:** 30 minutes  
**RPO:** 0

**Multi-Region Failover:**
1. Update DNS to point to secondary region
2. Verify secondary region health
3. Monitor traffic shift
4. Update Grafana dashboards to secondary

#### Scenario 3: Security Breach

**Immediate Actions:**
1. Isolate affected systems
2. Revoke all tokens
3. Force re-authentication
4. Deploy security patch
5. Audit all access logs

#### Scenario 4: Redis Data Loss

**RTO:** 10 minutes  
**RPO:** Acceptable (cache only)

**Recovery:**
1. Restart Redis
   ```bash
   kubectl rollout restart statefulset/redis -n production
   ```
2. Cache will rebuild automatically
3. Monitor for performance impact during cache warm-up

---

## Common Issues & Solutions

### Issue: High 401 Error Rate

**Cause:** JWT tokens expiring  
**Solution:**
- Check JWT_ACCESS_TOKEN_EXPIRY
- Verify clock sync across services
- Check auth service health

### Issue: Circuit Breaker Tripping Frequently

**Cause:** Downstream service unstable  
**Solution:**
- Fix downstream service
- Adjust circuit breaker thresholds if too sensitive
- Scale downstream service

### Issue: Rate Limiting Too Aggressive

**Cause:** RATE_LIMIT_MAX too low  
**Solution:**
```bash
# Temporary adjustment
kubectl edit configmap api-gateway-config -n production
# Set RATE_LIMIT_MAX to higher value

# Restart to apply
kubectl rollout restart deployment/api-gateway -n production
```

### Issue: Slow Response Times

**Cause:** Multiple possibilities  
**Solution:**
1. Check Grafana "Downstream Service Latency" panel
2. Identify slowest service
3. Scale slow service or optimize

### Issue: Memory Usage High

**Cause:** Memory leak or high load  
**Solution:**
- Check for leak (continuously rising?)
- If leak: Restart and plan hot fix
- If high load: Scale horizontally

---

## Emergency Contacts

### On-Call Rotation

**Primary On-Call:**
- Name: [Engineer Name]
- Phone: [Phone Number]
- Slack: @engineer
- PagerDuty: [PD Email]

**Secondary On-Call:**
- Name: [Engineer Name]
- Phone: [Phone Number]
- Slack: @engineer
- PagerDuty: [PD Email]

### Escalation Chain

1. **Level 1:** On-call engineer
2. **Level 2:** Team lead
3. **Level 3:** Engineering manager
4. **Level 4:** CTO

**Escalation Triggers:**
- Unable to resolve in SLA
- Security breach
- Data loss
- Multi-service outage

### External Contacts

**Cloud Provider Support:**
- AWS: 1-800-XXX-XXXX
- Account: [Account ID]

**Security Team:**
- Slack: #security-incidents
- Email: security@tickettoken.com
- Phone: [Phone]

**Infrastructure Team:**
- Slack: #infrastructure
- On-call: @infrastructure-oncall

---

## Maintenance Windows

### Scheduled Maintenance

**Preferred Window:**
- Day: Sunday
- Time: 02:00-04:00 UTC (lowest traffic)
- Duration: 2 hours max

**Pre-Maintenance Checklist:**
- [ ] Notify users 48h in advance
- [ ] Backup current state
- [ ] Test changes in staging
- [ ] Prepare rollback plan
- [ ] Ensure full on-call coverage

**Maintenance Steps:**
1. Place maintenance banner
2. Enable read-only mode if possible
3. Execute changes
4. Verify health
5. Monitor for 1 hour
6. Remove maintenance banner

---

## Quick Reference

### Useful Commands

```bash
# Check pod status
kubectl get pods -n production -l app=api-gateway

# Get logs
kubectl logs -n production -l app=api-gateway --tail=100 --follow

# Describe pod
kubectl describe pod <pod-name> -n production

# Execute command in pod
kubectl exec -it <pod-name> -n production -- /bin/sh

# Scale deployment
kubectl scale deployment/api-gateway --replicas=5 -n production

# Rollback deployment
kubectl rollout undo deployment/api-gateway -n production

# Check rollout status
kubectl rollout status deployment/api-gateway -n production

# Restart deployment
kubectl rollout restart deployment/api-gateway -n production

# Get events
kubectl get events -n production --sort-by='.lastTimestamp'

# Port forward for local testing
kubectl port-forward -n production svc/api-gateway 8080:3000
```

### Dashboard Links

- **Grafana:** https://grafana.tickettoken.com/d/api-gateway
- **Prometheus:** https://prometheus.tickettoken.com
- **Jaeger:** https://jaeger.tickettoken.com
- **PagerDuty:** https://tickettoken.pagerduty.com
- **Logs:** https://logs.tickettoken.com

### Key Metrics Queries

```promql
# Error rate
sum(rate(http_requests_total{service="api-gateway",status_code=~"5.."}[5m]))

# P95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="api-gateway"}[5m])) by (le))

# Circuit breaker state
circuit_breaker_state{service="api-gateway"}

# Auth success rate
sum(rate(auth_attempts_total{service="api-gateway",status="success"}[5m])) / sum(rate(auth_attempts_total{service="api-gateway"}[5m]))
```

---

**Document Version:** 1.0.0  
**Last Updated:** November 13, 2025  
**Next Review:** December 13, 2025
