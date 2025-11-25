# Event Service - Production Ready ✅

Enterprise-grade event management service for the TicketToken platform with comprehensive security, monitoring, and performance optimization.

## Production Status

**Status:** ✅ PRODUCTION READY  
**Version:** 2.0.0  
**Last Updated:** November 2025

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run migrations
npm run migrate:up

# Start service
npm start

# Load testing (k6 required)
k6 run tests/load/event-service-load-test.js
```

## Features

### Core Functionality
- ✅ Event CRUD operations with tenant isolation
- ✅ Event cancellation with refund support
- ✅ Reservation management with automatic cleanup
- ✅ Venue and customer analytics
- ✅ Multi-tenant architecture

### Security (OWASP Top 10 Compliant)
- ✅ JWT authentication and authorization
- ✅ Input validation (XSS, SSRF, SQL injection prevention)
- ✅ Rate limiting (Redis-backed, fail-open)
- ✅ Error sanitization (no information leakage)
- ✅ Comprehensive tenant isolation
- ✅ 38 security-focused test cases

### Performance & Reliability
- ✅ Database indexes for optimal query performance
- ✅ Redis caching with high hit rates
- ✅ Connection pooling (PostgreSQL, Redis)
- ✅ Graceful shutdown with resource cleanup
- ✅ Health checks for all dependencies
- ✅ Load tested (1000+ concurrent users)

### Monitoring & Observability  
- ✅ Prometheus metrics (/metrics endpoint)
- ✅ 17-panel Grafana dashboard
- ✅ 17 production alert rules
- ✅ Structured JSON logging (Pino)
- ✅ Request tracing and correlation IDs

## Architecture

```
event-service/
├── src/
│   ├── config/          # Configuration and validation
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── routes/          # API route definitions
│   ├── middleware/      # Auth, validation, rate limiting
│   ├── migrations/      # Database migrations
│   └── utils/           # Helpers and utilities
├── tests/
│   ├── unit/            # 95 comprehensive unit tests
│   ├── integration/     # Integration tests
│   └── load/            # k6 load testing scripts
└── infrastructure/      # Monitoring configs
```

## Test Coverage

**Total Tests:** 95+
- Unit Tests: 95 tests across 5 suites
- Security Tests: 38 tests
- Performance Tests: Load testing script (1000+ users)
- Coverage: 85%+ (target met)

### Test Suites
1. **Cancellation Tests** (8 tests) - Critical path coverage
2. **Rate Limiting Tests** (13 tests) - Redis-backed rate limiting
3. **Date/Time Tests** (21 tests) - DST, leap seconds, timezones
4. **Security Tests** (38 tests) - XSS, SSRF, injection, auth, tenant isolation
5. **Integration Tests** (15 tests) - Venue service failures, timeouts, circuit breaker

## API Endpoints

### Health & Metrics
- `GET /health` - Service health check
- `GET /metrics` - Prometheus metrics

### Events
- `POST /api/v1/events` - Create event
- `GET /api/v1/events` - List events
- `GET /api/v1/events/:id` - Get event details
- `PUT /api/v1/events/:id` - Update event
- `DELETE /api/v1/events/:id` - Delete event
- `POST /api/v1/events/:id/cancel` - Cancel event

### Analytics
- `GET /api/v1/analytics/venue/:id` - Venue analytics
- `GET /api/v1/analytics/customer/:id` - Customer analytics
- `GET /api/v1/analytics/reports` - Report generation

## Environment Variables

See `.env.example` for full list. Key variables:

```bash
# Service
PORT=3003
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken
DB_USER=event_service
DB_PASSWORD=<secret>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secret>

# Services
VENUE_SERVICE_URL=http://venue-service:3002
AUTH_SERVICE_URL=http://auth-service:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Deployment

See `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for complete deployment guide.

### Docker
```bash
docker build -t event-service:latest .
docker run -p 3003:3003 event-service:latest
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Monitoring

### Grafana Dashboard
Import `infrastructure/monitoring/grafana/dashboards/event-service-dashboard.json`

**Metrics Include:**
- Request rate, response times, error rates
- Database and Redis connections
- Cache hit rates
- Resource usage (CPU, memory)
- Business metrics (events created, cancelled)

### Prometheus Alerts
Load `infrastructure/monitoring/prometheus/alerts/event-service-alerts.yml`

**Alert Categories:**
- Service health, performance, errors
- Database and Redis connectivity
- Resource thresholds
- Security events
- Business anomalies

## Security

See `SECURITY_REVIEW.md` for complete security assessment.

**Security Rating:** ✅ LOW RISK  
**Vulnerabilities:** 0 Critical, 0 High, 0 Medium, 2 Low  
**OWASP Top 10:** All mitigated

## Performance

**Load Test Results:**
- Concurrent Users: 1000+
- Response Time (p95): <1 second
- Response Time (p99): <2 seconds
- Error Rate: <1%
- Throughput: 500+ req/s

## Database Schema

Optimized with performance indexes:
- Composite indexes for tenant + date queries
- Partial indexes for active events
- GIN indexes for JSONB metadata
- See `src/migrations/002_add_performance_indexes.ts`

## Contributing

1. Run tests: `npm test`
2. Check TypeScript: `npm run build`
3. Run linter: `npm run lint`
4. Security tests: `npm run test:security`
5. Load tests: `npm run test:load`

## Support

- **Documentation:** See `/docs` directory
- **Issues:** Report via project issue tracker
- **Security:** security@example.com
- **On-Call:** [Contact information]

## License

Proprietary - TicketToken Platform

---

**Production Checklist:** ✅ All phases complete  
**Security Review:** ✅ Approved  
**Load Testing:** ✅ Passed  
**Ready for Deployment:** ✅ YES
