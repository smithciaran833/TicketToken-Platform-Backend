# PRODUCTION DEPLOYMENT CHECKLIST - Venue Service

**Service:** venue-service  
**Version:** 1.0.0  
**Deployment Date:** ___________  
**Deployed By:** ___________

---

## PRE-DEPLOYMENT

### Code Quality
- [ ] All critical security fixes applied (Phase 1 complete)
- [ ] No hardcoded secrets in codebase
- [ ] TypeScript compilation successful (`npm run build`)
- [ ] All linting checks pass (`npm run lint`)
- [ ] Test coverage ≥ 60% (`npm run test:coverage`)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review completed and approved

### Dependencies
- [ ] `npm audit` shows no critical/high vulnerabilities
- [ ] All dependencies up to date
- [ ] No dependency conflicts (Express removed)
- [ ] Production dependencies only in package.json

### Environment Configuration
- [ ] `.env` file created from `.env.example`
- [ ] JWT_ACCESS_SECRET set (CRITICAL - no default)
- [ ] Database credentials configured
- [ ] Redis credentials configured
- [ ] RabbitMQ credentials configured (if enabled)
- [ ] All required environment variables set
- [ ] Environment validation test passed

### Database
- [ ] Database backup completed
- [ ] Migration files reviewed
- [ ] Dry-run of migrations successful
- [ ] Database connection tested
- [ ] Migration rollback plan documented

### External Integrations
- [ ] Stripe API keys configured (if used)
- [ ] Plaid credentials configured (if used)
- [ ] All integration credentials tested
- [ ] Webhook endpoints configured
- [ ] Rate limits configured appropriately

---

## DEPLOYMENT

### Pre-Deploy Steps
- [ ] Announce maintenance window (if applicable)
- [ ] Scale down non-critical services (if needed)
- [ ] Create deployment tag: `git tag v1.0.0`
- [ ] Push tag: `git push origin v1.0.0`

### Database Migrations
- [ ] Stop accepting new requests (optional)
- [ ] Run migrations: `npm run migrate:latest`
- [ ] Verify migrations applied: Check `/health/full` endpoint
- [ ] Verify no pending migrations
- [ ] Test critical queries after migration

### Application Deployment
- [ ] Build application: `npm run build`
- [ ] Install production dependencies: `npm ci --production`
- [ ] Start application: `npm start`
- [ ] Verify service starts without errors
- [ ] Check logs for startup issues

### Health Checks
- [ ] `/health` returns 200 OK
- [ ] `/health/ready` shows all systems healthy
- [ ] `/health/full` shows detailed status
- [ ] Database check: status = 'ok'
- [ ] Redis check: status = 'ok'
- [ ] RabbitMQ check: status = 'ok' or 'warning'
- [ ] Migrations check: pendingCount = 0

---

## POST-DEPLOYMENT VALIDATION

### Smoke Tests
- [ ] Create venue → Success
- [ ] List venues → Success
- [ ] Get venue by ID → Success
- [ ] Update venue → Success
- [ ] Delete venue (soft) → Success
- [ ] Add staff member → Success
- [ ] Authentication working → JWT tokens validated
- [ ] Authorization working → Permissions enforced

### Integration Tests
- [ ] Auth service integration → Token validation works
- [ ] Event service integration → Events published
- [ ] RabbitMQ events → Messages delivered
- [ ] Redis caching → Cache operations functional
- [ ] Database queries → Performant and accurate

### Performance Validation
- [ ] Response times acceptable (P95 < 500ms for reads)
- [ ] No memory leaks detected
- [ ] No connection leaks detected
- [ ] CPU usage normal (< 70% sustained)
- [ ] Memory usage stable

### Monitoring & Observability
- [ ] Logs flowing to centralized logging
- [ ] Metrics exposed on `/metrics`
- [ ] Prometheus scraping metrics
- [ ] Grafana dashboards showing data
- [ ] APM traces visible
- [ ] Alerts configured and active
- [ ] PagerDuty/on-call rotation set up

### Security Validation
- [ ] HTTPS enforced
- [ ] CORS configured correctly
- [ ] Rate limiting active
- [ ] Authentication cannot be bypassed
- [ ] Authorization enforced on all endpoints
- [ ] Sensitive data encrypted
- [ ] Secrets not exposed in logs

---

## ROLLBACK PLAN

### When to Rollback
Rollback immediately if:
- Critical errors in logs
- Health checks failing
- Database corruption detected
- Performance degradation > 50%
- Authorization bypass discovered
- Data loss occurring

### Rollback Steps
1. [ ] Stop new application instances
2. [ ] Rollback database migrations: `npm run migrate:rollback`
3. [ ] Deploy previous version
4. [ ] Verify health checks pass
5. [ ] Run smoke tests
6. [ ] Monitor for 30 minutes
7. [ ] Document what went wrong

### Rollback Verification
- [ ] Previous version running
- [ ] Database state consistent
- [ ] No data loss
- [ ] All services operational
- [ ] Incident report filed

---

## MONITORING (First 24 Hours)

### Hour 1
- [ ] Monitor error rates (should be < 0.1%)
- [ ] Check response times (P95 < 500ms)
- [ ] Verify no 500 errors
- [ ] Check database connection pool
- [ ] Monitor memory usage

### Hour 4
- [ ] Review logs for warnings
- [ ] Check cache hit rates
- [ ] Verify event publishing
- [ ] Monitor queue depths
- [ ] Check for slow queries

### Hour 12
- [ ] Performance trends nominal
- [ ] No memory leaks detected
- [ ] Error rates stable
- [ ] User feedback positive
- [ ] No critical alerts fired

### Hour 24
- [ ] All metrics within thresholds
- [ ] No degradation over time
- [ ] Load handling as expected
- [ ] Ready to close deployment window

---

## SIGN-OFF

### Technical Sign-off
- [ ] Engineering Lead: ___________  Date: ___________
- [ ] DevOps Engineer: ___________  Date: ___________
- [ ] QA Lead: ___________  Date: ___________

### Security Sign-off
- [ ] Security Engineer: ___________  Date: ___________
- [ ] Compliance Officer: ___________  Date: ___________

### Management Sign-off
- [ ] Product Manager: ___________  Date: ___________
- [ ] CTO/VP Engineering: ___________  Date: ___________

---

## NOTES

### Issues Encountered:
```
[Document any issues that occurred during deployment]
```

### Performance Observations:
```
[Document performance metrics observed]
```

### Action Items:
```
[Document any follow-up actions needed]
```

---

## EMERGENCY CONTACTS

- **On-Call Engineer:** _______________ (Phone: _______________)
- **Database Admin:** _______________ (Phone: _______________)
- **DevOps Lead:** _______________ (Phone: _______________)
- **Engineering Manager:** _______________ (Phone: _______________)

---

**Deployment Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back

**Final Status:** ___________  
**Completion Time:** ___________  
**Total Downtime:** ___________
