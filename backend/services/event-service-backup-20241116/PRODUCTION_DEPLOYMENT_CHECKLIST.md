# Event Service - Production Deployment Checklist

## Pre-Deployment Requirements

### 1. Code Quality ✅
- [x] All tests passing (95+ test cases)
- [x] TypeScript compilation successful
- [x] No linter errors
- [x] Code review completed
- [ ] Load testing completed (1000+ concurrent users)
- [ ] Performance benchmarks met

### 2. Security Hardening ✅
- [x] Environment variable validation implemented
- [x] Input validation and sanitization (XSS, SSRF, SQL injection)
- [x] Authentication and authorization enforced
- [x] Tenant isolation implemented
- [x] Rate limiting configured
- [x] Error responses sanitized (no information leakage)
- [x] HTTPS/TLS configured
- [x] Secrets stored in environment variables (not in code)

### 3. Database Readiness ✅
- [x] Migrations tested
- [x] Performance indexes created
- [x] Backup strategy defined
- [ ] Migrations applied to production database
- [ ] Connection pooling configured (min: 2, max: 10)
- [ ] Database credentials rotated

### 4. Monitoring & Observability ✅
- [x] Prometheus metrics endpoint exposed
- [x] Grafana dashboard created
- [x] Alert rules configured
- [ ] Alert notifications configured (PagerDuty/Slack)
- [x] Structured logging implemented
- [ ] Log aggregation configured (ELK/CloudWatch)

### 5. Infrastructure ✅
- [x] Health check endpoint implemented
- [x] Graceful shutdown implemented
- [x] Docker image built and tested
- [ ] Container registry configured
- [ ] Kubernetes manifests ready
- [ ] Resource limits defined (CPU, Memory)
- [ ] Auto-scaling policies configured

## Deployment Steps

### Phase 1: Pre-Production Verification
```bash
# 1. Run all tests
npm test

# 2. Build production bundle
npm run build

# 3. Run migrations (staging)
npm run migrate:up

# 4. Verify environment variables
npm run validate:env

# 5. Run load tests
npm run test:load
```

### Phase 2: Database Migration
```bash
# 1. Backup production database
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply migrations
NODE_ENV=production npm run migrate:up

# 3. Verify migration
npm run migrate:status
```

### Phase 3: Service Deployment
```bash
# 1. Build Docker image
docker build -t event-service:$VERSION .

# 2. Push to registry
docker push $REGISTRY/event-service:$VERSION

# 3. Deploy to Kubernetes
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 4. Verify deployment
kubectl rollout status deployment/event-service
kubectl get pods -l app=event-service
```

### Phase 4: Post-Deployment Verification
```bash
# 1. Health check
curl https://api.example.com/event-service/health

# 2. Metrics check
curl https://api.example.com/event-service/metrics

# 3. Smoke tests
npm run test:smoke

# 4. Monitor logs
kubectl logs -f deployment/event-service
```

## Environment Variables Checklist

### Required Variables
- [ ] `PORT` - Service port (default: 3003)
- [ ] `NODE_ENV` - Set to 'production'
- [ ] `LOG_LEVEL` - Set to 'info' or 'warn'
- [ ] `LOG_FORMAT` - Set to 'json'

### Database
- [ ] `DB_HOST` - PostgreSQL host
- [ ] `DB_PORT` - PostgreSQL port (5432)
- [ ] `DB_NAME` - Database name
- [ ] `DB_USER` - Database user
- [ ] `DB_PASSWORD` - Database password (from secrets)
- [ ] `DB_POOL_MIN` - Min connections (2)
- [ ] `DB_POOL_MAX` - Max connections (10)

### Redis
- [ ] `REDIS_HOST` - Redis host
- [ ] `REDIS_PORT` - Redis port (6379)
- [ ] `REDIS_PASSWORD` - Redis password (from secrets)
- [ ] `REDIS_DB` - Redis database number

### Service Integration
- [ ] `VENUE_SERVICE_URL` - Venue service endpoint
- [ ] `AUTH_SERVICE_URL` - Auth service endpoint
- [ ] `INTERNAL_API_KEY` - Internal service authentication key

### Rate Limiting
- [ ] `RATE_LIMIT_WINDOW_MS` - Window in milliseconds (60000)
- [ ] `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (100)

### Monitoring
- [ ] `METRICS_PORT` - Metrics port (if separate)
- [ ] `SENTRY_DSN` - Error tracking (optional)

## Rollback Plan

### Immediate Rollback
```bash
# 1. Revert to previous version
kubectl rollout undo deployment/event-service

# 2. Verify rollback
kubectl rollout status deployment/event-service

# 3. Check health
curl https://api.example.com/event-service/health
```

### Database Rollback
```bash
# 1. Restore database backup
psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_TIMESTAMP.sql

# 2. Rollback migrations
npm run migrate:down
```

## Post-Deployment Monitoring

### First 24 Hours
- [ ] Monitor error rates (< 1%)
- [ ] Monitor response times (p95 < 1s)
- [ ] Monitor CPU usage (< 80%)
- [ ] Monitor memory usage (< 80%)
- [ ] Monitor database connections
- [ ] Monitor Redis hit rate (> 90%)
- [ ] Check alert notifications
- [ ] Review logs for errors

### First Week
- [ ] Performance trending analysis
- [ ] Capacity planning review
- [ ] Security audit logs review
- [ ] User feedback collection
- [ ] Incident retrospective (if any)

## Emergency Contacts

- **On-Call Engineer:** [Name/Contact]
- **Database Admin:** [Name/Contact]
- **DevOps Lead:** [Name/Contact]
- **Security Team:** [Name/Contact]

## Success Criteria

✅ Service is accessible and responding to health checks
✅ All critical alerts are silent
✅ Error rate < 1%
✅ Response time p95 < 1 second
✅ CPU usage < 80%
✅ Memory usage < 80%
✅ No database connection errors
✅ Rate limiting functioning correctly
✅ Monitoring dashboards showing green metrics
✅ No critical security vulnerabilities

## Sign-Off

- [ ] Engineering Lead: _________________ Date: _______
- [ ] DevOps Lead: _________________ Date: _______
- [ ] Security Lead: _________________ Date: _______
- [ ] Product Owner: _________________ Date: _______
