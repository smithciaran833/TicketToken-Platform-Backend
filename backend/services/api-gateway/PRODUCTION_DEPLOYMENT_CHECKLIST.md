# API Gateway - Production Deployment Checklist

**Service:** API Gateway  
**Version:** 1.0.0  
**Date:** November 13, 2025

---

## Pre-Deployment Checklist

### 1. Code Quality & Testing ✅

- [x] All unit tests passing (100% on critical paths)
- [x] All integration tests passing
- [x] Load tests executed successfully (500+ concurrent users)
- [x] Security tests passing (ZERO tenant violations)
- [x] Code reviewed and approved
- [x] No critical or high-severity vulnerabilities
- [x] TypeScript compilation successful
- [x] Linting passes with no errors
- [x] Dependencies audited (npm audit)

### 2. Configuration & Environment ✅

- [ ] Production environment variables configured
  - [ ] JWT_SECRET (≥32 chars, unique per environment)
  - [ ] REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
  - [ ] All 19 downstream service URLs
  - [ ] CORS_ORIGIN (production domain)
  - [ ] NODE_ENV=production
  - [ ] LOG_LEVEL=info
  - [ ] RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS
  
- [ ] Secrets management
  - [ ] Secrets stored in secure vault (AWS Secrets Manager, etc.)
  - [ ] No hardcoded secrets in code
  - [ ] Secrets rotation schedule documented
  - [ ] Access controls on secrets configured
  
- [ ] Environment validation
  - [ ] Test startup with production-like config
  - [ ] Validate all required env vars present
  - [ ] Verify service URLs are reachable

### 3. Infrastructure ✅

- [ ] Docker image built and pushed to registry
  - [ ] Image tagged with version number
  - [ ] Image scanned for vulnerabilities
  - [ ] Size optimized (<500MB)
  
- [ ] Kubernetes manifests prepared
  - [ ] Deployment YAML configured
  - [ ] Service YAML configured
  - [ ] ConfigMap/Secret YAMLs configured
  - [ ] Resource limits set (CPU, memory)
  - [ ] Health check endpoints configured
  - [ ] Horizontal Pod Autoscaler (HPA) configured
  
- [ ] Networking
  - [ ] Internal service mesh configured
  - [ ] Load balancer configured
  - [ ] TLS certificates installed
  - [ ] DNS records configured
  - [ ] Firewall rules configured

### 4. Database & Cache ✅

- [ ] Redis cluster deployed
  - [ ] Password authentication enabled
  - [ ] TLS enabled
  - [ ] Persistence configured
  - [ ] Backup strategy in place
  - [ ] Monitoring enabled
  
- [ ] Database migrations
  - [ ] N/A (Gateway doesn't have database)

### 5. Monitoring & Observability ✅

- [ ] Prometheus configured
  - [ ] Scrape config for API Gateway
  - [ ] Service discovery working
  - [ ] Metrics endpoint accessible
  
- [ ] Grafana dashboards
  - [ ] API Gateway dashboard imported
  - [ ] Datasource connected
  - [ ] Dashboard accessible to ops team
  
- [ ] Alerting
  - [ ] Alert rules loaded in Prometheus
  - [ ] Alertmanager configured
  - [ ] PagerDuty integration tested
  - [ ] Slack integration tested
  - [ ] On-call rotation established
  
- [ ] Distributed tracing
  - [ ] Jaeger/Tempo deployed
  - [ ] OTLP endpoint configured
  - [ ] Traces visible in UI
  - [ ] Trace propagation verified

- [ ] Logging
  - [ ] Centralized logging (ELK/Loki) configured
  - [ ] Log retention policy set (30 days)
  - [ ] Log aggregation working
  - [ ] Sensitive data masked in logs

### 6. Security ✅

- [ ] Security review completed
  - [ ] All CVEs fixed
  - [ ] Penetration testing planned (post-launch)
  - [ ] Security sign-off obtained
  
- [ ] TLS/SSL
  - [ ] Valid certificates installed
  - [ ] TLS 1.3 enforced
  - [ ] Certificate expiry monitoring enabled
  
- [ ] Authentication & Authorization
  - [ ] JWT validation on all routes
  - [ ] Tenant isolation verified
  - [ ] Header filtering enabled
  - [ ] Rate limiting configured
  
- [ ] Network security
  - [ ] Firewall rules configured
  - [ ] VPC/subnet isolation
  - [ ] Security groups configured
  - [ ] DDoS protection enabled

### 7. Documentation ✅

- [ ] API documentation complete
  - [ ] OpenAPI spec published
  - [ ] Example requests/responses
  - [ ] Error codes documented
  
- [ ] Runbooks created
  - [ ] Alert response procedures
  - [ ] Incident playbooks
  - [ ] Disaster recovery plan
  - [ ] Rollback procedures
  
- [ ] Operational docs
  - [ ] Deployment guide
  - [ ] Configuration guide
  - [ ] Troubleshooting guide
  - [ ] Architecture diagrams

### 8. Backup & Disaster Recovery ✅

- [ ] Backup strategy
  - [ ] Redis data backup configured
  - [ ] Backup schedule documented
  - [ ] Backup restoration tested
  
- [ ] Disaster recovery plan
  - [ ] RTO/RPO defined
  - [ ] Failover procedures documented
  - [ ] DR drills scheduled
  - [ ] Multi-region setup (if applicable)

---

## Deployment Steps

### Phase 1: Pre-Deployment (T-24 hours)

**1. Final Testing**
```bash
# Run full test suite
npm run test
npm run test:integration
npm run test:e2e

# Run load tests
k6 run tests/load/api-gateway-load-test.js

# Security scan
npm audit --production
```

**2. Build & Tag Image**
```bash
# Build Docker image
docker build -t api-gateway:1.0.0 .

# Tag for registry
docker tag api-gateway:1.0.0 registry.example.com/api-gateway:1.0.0
docker tag api-gateway:1.0.0 registry.example.com/api-gateway:latest

# Push to registry
docker push registry.example.com/api-gateway:1.0.0
docker push registry.example.com/api-gateway:latest
```

**3. Prepare Kubernetes Manifests**
```bash
# Validate manifests
kubectl apply --dry-run=client -f k8s/
kubectl apply --dry-run=server -f k8s/

# Review resource allocations
kubectl describe -f k8s/deployment.yaml
```

**4. Notify Stakeholders**
- Send deployment notification to team
- Schedule deployment window
- Ensure on-call coverage

### Phase 2: Deployment (T-0)

**1. Pre-Deployment Health Check**
```bash
# Verify all downstream services healthy
kubectl get pods -n production
curl http://auth-service:4001/health
curl http://venue-service:4002/health
# ... check all 19 services ...

# Verify monitoring stack healthy
curl http://prometheus:9090/-/healthy
curl http://grafana:3000/api/health
```

**2. Deploy to Staging**
```bash
# Deploy to staging first
kubectl config use-context staging
kubectl apply -f k8s/

# Wait for rollout
kubectl rollout status deployment/api-gateway -n staging

# Run smoke tests
npm run test:smoke -- --env=staging
```

**3. Deploy to Production**
```bash
# Switch to production context
kubectl config use-context production

# Create deployment
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml

# Monitor rollout
kubectl rollout status deployment/api-gateway -n production --timeout=10m

# Check pod status
kubectl get pods -n production -l app=api-gateway
kubectl logs -n production -l app=api-gateway --tail=100
```

**4. Verify Deployment**
```bash
# Check health endpoints
curl https://api.tickettoken.com/health/live
curl https://api.tickettoken.com/health/ready

# Verify metrics
curl https://api.tickettoken.com/metrics

# Test authentication flow
curl -X POST https://api.tickettoken.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Test protected route
curl https://api.tickettoken.com/api/v1/venues \
  -H "Authorization: Bearer <token>"
```

**5. Monitor Initial Traffic**
- Watch Grafana dashboard for 15 minutes
- Monitor error rates and latency
- Check circuit breaker status
- Verify no security violations
- Monitor memory/CPU usage

### Phase 3: Post-Deployment (T+1 hour)

**1. Smoke Testing**
```bash
# Run automated smoke tests
npm run test:smoke -- --env=production

# Test critical user flows
# - User authentication
# - Venue browsing
# - Event viewing
# - Ticket purchasing (test mode)
```

**2. Monitoring Validation**
```bash
# Verify metrics flowing to Prometheus
curl http://prometheus:9090/api/v1/query?query=up{job="api-gateway"}

# Check alert rules
curl http://prometheus:9090/api/v1/rules | jq '.data.groups[] | select(.name | contains("api_gateway"))'

# Verify traces in Jaeger
curl http://jaeger:16686/api/traces?service=api-gateway&limit=10
```

**3. Load Testing**
```bash
# Run controlled load test
k6 run tests/load/api-gateway-load-test.js \
  --env API_GATEWAY_URL=https://api.tickettoken.com

# Monitor during load:
# - Response times
# - Error rates
# - Circuit breaker behavior
# - Resource utilization
```

**4. Documentation Update**
- Update deployment logs
- Document any issues encountered
- Update runbooks if needed
- Send success notification

---

## Rollback Procedures

### When to Rollback

Trigger rollback if:
- Error rate >5% for >5 minutes
- P95 latency >2s for >10 minutes
- Any security violations detected
- Circuit breakers open for multiple services
- Memory/CPU at >90% sustained
- Critical alerts firing

### Rollback Steps

**1. Immediate Rollback**
```bash
# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n production

# Monitor rollback
kubectl rollout status deployment/api-gateway -n production

# Verify previous version running
kubectl get pods -n production -l app=api-gateway
```

**2. Verify Rollback**
```bash
# Check health
curl https://api.tickettoken.com/health/ready

# Run smoke tests
npm run test:smoke -- --env=production

# Monitor metrics for 15 minutes
```

**3. Post-Rollback**
- Notify stakeholders
- Document rollback reason
- Create incident ticket
- Schedule post-mortem
- Plan fix and re-deployment

---

## Post-Deployment Monitoring

### First 24 Hours

**Monitor continuously:**
- [ ] Error rates (<0.1%)
- [ ] Response times (p95 <1s, p99 <2s)
- [ ] Circuit breaker health
- [ ] Memory/CPU usage
- [ ] Tenant isolation (ZERO violations)
- [ ] Security alerts (ZERO violations)

**Check hourly:**
- [ ] Grafana dashboards
- [ ] PagerDuty incidents
- [ ] Slack alerts
- [ ] Application logs
- [ ] Downstream service health

### First Week

**Daily checks:**
- [ ] Review metrics trends
- [ ] Check for any anomalies
- [ ] Verify alert configuration
- [ ] Review incident reports
- [ ] Update documentation

**Weekly tasks:**
- [ ] Performance review meeting
- [ ] Review user feedback
- [ ] Plan optimization if needed
- [ ] Update monitoring thresholds

---

## Success Criteria

Deployment is considered successful when:

- ✅ Service is running and healthy for 24 hours
- ✅ Error rate <0.1%
- ✅ P95 latency <1s
- ✅ All health checks passing
- ✅ No critical alerts fired
- ✅ ZERO security violations
- ✅ ZERO tenant isolation violations
- ✅ Circuit breakers functioning properly
- ✅ Monitoring and alerts working
- ✅ Load tests passing
- ✅ User feedback positive

---

## Emergency Contacts

**On-Call Rotation:**
- Primary: [Name] - [Phone] - [Email]
- Secondary: [Name] - [Phone] - [Email]
- Manager: [Name] - [Phone] - [Email]

**Escalation Path:**
1. On-call engineer (PagerDuty)
2. Team lead
3. Engineering manager
4. CTO

**External Contacts:**
- Cloud Provider Support: [Phone]
- Infrastructure Team: [Slack Channel]
- Security Team: [Slack Channel]

---

## Sign-Off

**Deployment Approved By:**

- [ ] Engineering Lead: _________________ Date: _______
- [ ] Security Team: _________________ Date: _______
- [ ] Operations Team: _________________ Date: _______
- [ ] Product Manager: _________________ Date: _______

**Deployment Executed By:** _________________  
**Deployment Date:** _________________  
**Deployment Status:** _________________

---

## Notes

**Issues Encountered:**
_Record any issues encountered during deployment_

**Lessons Learned:**
_Document lessons learned for future deployments_

**Follow-up Actions:**
_List any follow-up actions required_
