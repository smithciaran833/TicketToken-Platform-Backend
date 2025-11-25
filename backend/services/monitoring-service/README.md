# Monitoring Service

Comprehensive monitoring and alerting service for the TicketToken platform.

## Overview

The monitoring service provides:
- **Prometheus metrics collection** - 19+ custom metrics for business intelligence
- **Health aggregation** - Monitors 21 microservices across the platform
- **Alert management** - Rule-based alerts with multi-channel notifications
- **Background workers** - Metric aggregation, cleanup, ML analysis, and reporting
- **Multi-channel notifications** - Email, Slack, and PagerDuty integration

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL 14+
- Redis 6+
- InfluxDB 2.x (optional for time-series storage)
- Elasticsearch 8.x (optional for log aggregation)

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run database migrations
npm run migrate

# Start the service
npm run dev
```

### Docker Deployment

```bash
# Build image
docker build -t monitoring-service .

# Run container
docker run -d \
  -p 3017:3017 \
  -e DATABASE_URL=postgresql://user:pass@localhost:5432/monitoring \
  -e REDIS_URL=redis://localhost:6379 \
  -e JWT_SECRET=your-secret-key \
  --name monitoring-service \
  monitoring-service
```

## Architecture

### Service Structure

```
monitoring-service/
├── src/
│   ├── alerting/          # Alert management system
│   │   ├── alert.manager.ts
│   │   ├── rules/         # Rule engine
│   │   ├── channels/      # Notification channels
│   │   └── escalation/    # Escalation policies
│   ├── checkers/          # Health checkers
│   ├── collectors/        # Metric collectors
│   ├── workers/           # Background workers
│   ├── middleware/        # Auth, validation
│   └── routes/            # API endpoints
├── tests/                 # Test suite
└── docs/                  # Documentation
```

### Key Components

#### 1. Metrics Collector
Collects and exposes Prometheus metrics:
- Business metrics (tickets sold, revenue)
- Performance metrics (response times, error rates)
- System metrics (CPU, memory, disk)
- Blockchain metrics (NFT minting, transactions)

#### 2. Alert Manager
Evaluates rules and sends notifications:
- 8 pre-configured alert rules
- Multi-level escalation policies
- Cooldown periods to prevent spam
- Acknowledgement system

#### 3. Health Aggregator
Monitors all platform services:
- Checks 21 microservices
- Database connection monitoring
- Redis health checks
- Dependency status tracking

#### 4. Background Workers
- **Alert Evaluation** - Runs every 60s
- **Metric Aggregation** - Runs every 5m
- **Cleanup** - Runs daily at 2 AM
- **ML Analysis** - Runs every 10m
- **Report Generation** - Runs daily at 8 AM

## API Documentation

### Endpoints

#### Health & Status

```http
GET /health
Returns overall system health status

Response:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime": 123456,
  "services": [...],
  "dependencies": {...}
}
```

```http
GET /status
Returns simplified status check

Response:
{
  "status": "ok",
  "timestamp": "2025-11-18T14:00:00Z"
}
```

#### Metrics

```http
GET /metrics
Prometheus-formatted metrics export

Headers:
  Authorization: Bearer <token> (if configured)

Response: Prometheus text format
```

```http
GET /api/business-metrics
Business metrics in JSON format

Response:
{
  "totalTicketsSold": 1234,
  "totalRevenue": 567890,
  "activeListings": 45,
  "totalRefunds": 12
}
```

#### Alerts

```http
GET /api/alerts
Get current alert status

Response:
{
  "active": [...],
  "recent": [...]
}
```

### Authentication

Most endpoints require JWT authentication:

```http
Authorization: Bearer <jwt-token>
```

The `/health` and `/metrics` endpoints can be configured for public access.

## Configuration

### Environment Variables

```bash
# Server
PORT=3017
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/monitoring
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key-here

# Monitoring
PROMETHEUS_IPS=10.0.0.1,10.0.0.2  # Whitelist for /metrics

# Alerts - Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@tickettoken.com
SMTP_PASS=your-password
ALERT_FROM_EMAIL=noreply@tickettoken.com
ALERT_TO_EMAIL=ops@tickettoken.com

# Alerts - Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
SLACK_TOKEN=xoxb-your-token

# Alerts - PagerDuty
PAGERDUTY_API_KEY=your-api-key
PAGERDUTY_SERVICE_ID=your-service-id

# Optional - Time Series Storage
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token
INFLUXDB_ORG=tickettoken
INFLUXDB_BUCKET=metrics

# Optional - Log Aggregation
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_API_KEY=your-api-key

# Service Discovery
AUTH_SERVICE_URL=http://auth-service:3000
VENUE_SERVICE_URL=http://venue-service:3001
# ... (add all 21 services)
```

## Metrics

### Business Metrics

- `tickets_sold_total` - Total tickets sold (Counter)
- `tickets_listed_total` - Marketplace listings (Counter)
- `revenue_total_cents` - Revenue by type (Counter)
- `refunds_processed_total` - Refunds by reason (Counter)

### Performance Metrics

- `http_request_duration_ms` - Request latency (Histogram)
- `db_query_duration_ms` - Database query time (Histogram)
-  `api_response_time_ms` - API response time (Summary)

### System Metrics

- `active_users` - Current active users (Gauge)
- `queue_size` - Queue depth (Gauge)
- `cache_hit_rate` - Cache effectiveness (Gauge)
- `errors_total` - Error count by type (Counter)

### Payment Metrics

- `payment_success_total` - Successful payments (Counter)
- `payment_failure_total` - Failed payments (Counter)
- `payment_processing_duration_ms` - Payment processing time (Histogram)

### Blockchain Metrics

- `nft_minted_total` - NFTs minted (Counter)
- `nft_transferred_total` - NFT transfers (Counter)
- `solana_transaction_time_ms` - Transaction time (Histogram)

## Alert Rules

### Pre-configured Alerts

1. **High Refund Rate** (Warning)
   - Threshold: 10%
   - Channels: Email, Slack

2. **Payment Failure Spike** (Error)
   - Threshold: 20%
   - Channels: Email, Slack, PagerDuty

3. **Database Slow** (Warning)
   - Threshold: 1000ms
   - Channels: Slack

4. **API Error Rate High** (Error)
   - Threshold: 5%
   - Channels: Email, Slack

5. **Solana Network Issues** (Critical)
   - Threshold: 10% failure rate
   - Channels: Email, Slack, PagerDuty

6. **Queue Backup** (Warning)
   - Threshold: 1000 items
   - Channels: Slack

7. **Revenue Drop** (Info)
   - Threshold: -50%
   - Channels: Email

8. **Concurrent Users Spike** (Info)
   - Threshold: 10,000 users
   - Channels: Slack

### Escalation Policies

**Critical Alerts:**
- Level 1: On-Call Engineer (5 minutes)
- Level 2: Team Lead (15 minutes)
- Level 3: Engineering Manager (30 minutes)

**Error Alerts:**
- Level 1: On-Call Engineer (15 minutes)
- Level 2: Team Lead (1 hour)

## Operations

### Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Specific test file
npm test -- rule.engine.test.ts
```

### Health Checks

```bash
# Quick health check
curl http://localhost:3017/health

# Detailed service health
curl http://localhost:3017/api/v1/monitoring/health/detailed
```

### Viewing Metrics

```bash
# Prometheus format
curl http://localhost:3017/metrics

# JSON format
curl http://localhost:3017/api/business-metrics
```

### Managing Alerts

```bash
# View active alerts
curl -H "Authorization: Bearer <token>" \
  http://localhost:3017/api/alerts

# Acknowledge alert
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:3017/api/alerts/acknowledge/alert-123
```

## Troubleshooting

### Service Won't Start

**Issue:** Port already in use
```bash
# Find process using port
lsof -i :3017
kill -9 <PID>
```

**Issue:** Database connection failed
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Metrics Not Updating

**Check if collectors are running:**
```bash
# View logs
docker logs monitoring-service | grep collector

# Check worker status
curl http://localhost:3017/api/v1/monitoring/workers
```

### Alerts Not Firing

**Verify alert configuration:**
```bash
# Check alert rules
curl http://localhost:3017/api/v1/monitoring/alerts/rules

# Test notification channels
npm run test:notifications
```

### High Memory Usage

**Check worker intervals:**
- Metric aggregation: 5 minutes
- Alert evaluation: 60 seconds
- Cleanup: Daily

**Adjust in code if needed:**
```typescript
// src/workers/metric-aggregation.worker.ts
this.interval = 10 * 60 * 1000; // Change to 10 minutes
```

## Development

### Adding New Metrics

```typescript
// src/metrics.collector.ts
this.myNewMetric = new Counter({
  name: 'my_new_metric_total',
  help: 'Description of metric',
  labelNames: ['label1', 'label2']
});

// Record metric
metricsCollector.myNewMetric.inc({ label1: 'value1' });
```

### Adding New Alert Rules

```typescript
// src/alerting/default-rules.ts
{
  id: 'my_new_alert',
  name: 'My New Alert',
  condition: 'metric > threshold',
  threshold: 100,
  severity: 'warning',
  channels: ['email', 'slack'],
  cooldown: 30 * 60 * 1000
}
```

### Adding New Health Checkers

```typescript
// src/checkers/my-service.checker.ts
export class MyServiceChecker {
  async check(): Promise<HealthCheckResult> {
    try {
      // Perform health check
      return { status: 'healthy', latency: 50 };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}
```

## Security

### Best Practices

1. **Never expose /metrics publicly** - Use IP whitelist or VPN
2. **Rotate JWT secrets regularly** - Set in environment variables
3. **Use HTTPS in production** - Configure reverse proxy
4. **Limit API rate limiting** - Prevent abuse
5. **Validate all inputs** - Prevent injection attacks

### Security Checklist

- [ ] JWT_SECRET set in production
- [ ] /metrics endpoint restricted to Prometheus IPs
- [ ] SMTP credentials secured
- [ ] Slack webhook URLs not in code
- [ ] Database credentials in environment only
- [ ] Rate limiting configured
- [ ] Input validation enabled
- [ ] HTTPS/TLS configured

## Performance

### Optimization Tips

1. **Metric Collection**
   - Batch metric updates when possible
   - Use labels efficiently (high cardinality = more memory)
   - Archive old metrics to InfluxDB

2. **Alert Evaluation**
   - Adjust evaluation interval based on needs
   - Use cooldown periods to prevent spam
   - Disable unused alert rules

3. **Database Queries**
   - Index frequently queried columns
   - Use connection pooling
   - Archive old alert history

## Monitoring the Monitor

Yes, the monitoring service should be monitored too!

### Key Metrics to Watch

- Service uptime
- Alert evaluation lag
- Worker execution time
- Database connection pool usage
- Memory usage trends

### External Monitoring

Consider setting up:
- Uptime monitoring (e.g., Pingdom)
- Log aggregation (already uses Elasticsearch)
- APM tools (already uses OpenTelemetry)

## Support

### Getting Help

- **Documentation:** See `/docs` directory
- **API Docs:** Visit `/api/docs` when service is running
- **Issues:** Report via project issue tracker
- **Logs:** Check `monitoring-*.log` files

### Common Issues

See [Troubleshooting](#troubleshooting) section above.

## License

Proprietary - TicketToken Platform

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Prometheus metrics integration
- 19 custom metrics
- 8 alert rules
- Multi-channel notifications
- Background workers
- Comprehensive testing

---

**Built with ❤️ by the TicketToken Platform Team**
