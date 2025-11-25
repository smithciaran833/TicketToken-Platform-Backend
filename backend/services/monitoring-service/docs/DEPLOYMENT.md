# Monitoring Service Deployment Guide

This guide covers deploying the monitoring service to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deployment Methods](#deployment-methods)
  - [Docker](#docker-deployment)
  - [Kubernetes](#kubernetes-deployment)
  - [PM2](#pm2-deployment)
- [Configuration](#configuration)
- [Database Migrations](#database-migrations)
- [Monitoring the Monitor](#monitoring-the-monitor)
- [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Infrastructure Requirements

**Minimum:**
- 2 CPU cores
- 4GB RAM
- 20GB disk space
- PostgreSQL 14+
- Redis 6+

**Recommended:**
- 4 CPU cores
- 8GB RAM
- 50GB disk space (with metric history)
- PostgreSQL 14+ (with replication)
- Redis 6+ (with persistence)
- InfluxDB 2.x (time-series storage)
- Elasticsearch 8.x (log aggregation)

### Network Requirements

**Inbound:**
- Port 3017 (HTTP API)
- Port 9090 (Prometheus scraping, if using dedicated port)

**Outbound:**
- PostgreSQL: 5432
- Redis: 6379
- InfluxDB: 8086 (optional)
- Elasticsearch: 9200 (optional)
- SMTP: 587 (for email alerts)
- Slack API: 443
- PagerDuty API: 443
- All monitored services: Various ports

### Dependencies

- Node.js 20.x
- npm or yarn
- Git (for deployments from repository)
- Docker (for containerized deployments)

## Environment Setup

### 1. Create Environment File

```bash
cd backend/services/monitoring-service
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your specific values:

```bash
# Server Configuration
PORT=3017
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://monitor:password@postgres-host:5432/monitoring_prod
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://redis-host:6379
REDIS_PASSWORD=your-redis-password

# Security
JWT_SECRET=your-very-secure-jwt-secret-key-change-this
PROMETHEUS_IPS=10.0.1.5,10.0.1.6  # Prometheus server IPs

# SMTP (Email Alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=alerts@tickettoken.com
SMTP_PASS=your-app-specific-password
ALERT_FROM_EMAIL=noreply@tickettoken.com
ALERT_TO_EMAIL=ops@tickettoken.com,oncall@tickettoken.com

# Slack (Alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL=#alerts

# PagerDuty (Critical Alerts)
PAGERDUTY_API_KEY=your-pagerduty-integration-key
PAGERDUTY_SERVICE_ID=your-service-id

# Optional - Time Series Storage
INFLUXDB_URL=http://influxdb-host:8086
INFLUXDB_TOKEN=your-influxdb-token
INFLUXDB_ORG=tickettoken
INFLUXDB_BUCKET=monitoring_metrics

# Optional - Log Aggregation  
ELASTICSEARCH_NODE=http://elasticsearch-host:9200
ELASTICSEARCH_API_KEY=your-elasticsearch-api-key

# Service Discovery URLs (all 21 services)
AUTH_SERVICE_URL=http://auth-service:3000
VENUE_SERVICE_URL=http://venue-service:3001
EVENT_SERVICE_URL=http://event-service:3002
TICKET_SERVICE_URL=http://ticket-service:3003
PAYMENT_SERVICE_URL=http://payment-service:3004
MARKETPLACE_SERVICE_URL=http://marketplace-service:3005
ANALYTICS_SERVICE_URL=http://analytics-service:3006
NOTIFICATION_SERVICE_URL=http://notification-service:3007
INTEGRATION_SERVICE_URL=http://integration-service:3008
COMPLIANCE_SERVICE_URL=http://compliance-service:3009
QUEUE_SERVICE_URL=http://queue-service:3010
SEARCH_SERVICE_URL=http://search-service:3011
FILE_SERVICE_URL=http://file-service:3012
MONITORING_SERVICE_URL=http://monitoring-service:3017
BLOCKCHAIN_SERVICE_URL=http://blockchain-service:3013
ORDER_SERVICE_URL=http://order-service:3014
MINTING_SERVICE_URL=http://minting-service:3015
TRANSFER_SERVICE_URL=http://transfer-service:3016
SCANNING_SERVICE_URL=http://scanning-service:3018
BLOCKCHAIN_INDEXER_URL=http://blockchain-indexer:3019
API_GATEWAY_URL=http://api-gateway:3020
```

### 3. Secure Secrets

**Never commit secrets to git!**

For production, use a secrets management service:
- AWS Secrets Manager
- HashiCorp Vault
- Kubernetes Secrets
- Azure Key Vault

Example with AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name monitoring-service/prod \
  --secret-string file://.env
```

## Deployment Methods

### Docker Deployment

#### Build Image

```bash
# From repository root
cd backend/services/monitoring-service

# Build
docker build -t tickettoken/monitoring-service:1.0.0 .

# Tag as latest
docker tag tickettoken/monitoring-service:1.0.0 tickettoken/monitoring-service:latest
```

#### Run Container

```bash
docker run -d \
  --name monitoring-service \
  --restart unless-stopped \
  -p 3017:3017 \
  -e NODE_ENV=production \
  -e DATABASE_URL=${DATABASE_URL} \
  -e REDIS_URL=${REDIS_URL} \
  -e JWT_SECRET=${JWT_SECRET} \
  -e SMTP_HOST=${SMTP_HOST} \
  -e SMTP_USER=${SMTP_USER} \
  -e SMTP_PASS=${SMTP_PASS} \
  -e SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL} \
  --network=tickettoken-network \
  tickettoken/monitoring-service:1.0.0
```

#### Docker Compose

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  monitoring-service:
    image: tickettoken/monitoring-service:1.0.0
    container_name: monitoring-service
    restart: unless-stopped
    ports:
      - "3017:3017"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://monitor:${DB_PASSWORD}@postgres:5432/monitoring_prod
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3017/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - tickettoken-network
    volumes:
      - monitoring-logs:/app/logs

volumes:
  monitoring-logs:

networks:
  tickettoken-network:
    external: true
```

Deploy:
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

### Kubernetes Deployment

#### 1. Create Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tickettoken-monitoring
```

#### 2. Create Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: monitoring-secrets
  namespace: tickettoken-monitoring
type: Opaque
stringData:
  database-url: postgresql://monitor:password@postgres:5432/monitoring_prod
  redis-url: redis://:password@redis:6379
  jwt-secret: your-jwt-secret
  smtp-password: your-smtp-password
  slack-webhook: your-slack-webhook-url
```

Apply:
```bash
kubectl apply -f k8s/secrets.yaml
```

#### 3. Create ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: monitoring-config
  namespace: tickettoken-monitoring
data:
  PORT: "3017"
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  SMTP_HOST: "smtp.gmail.com"
  SMTP_PORT: "587"
  ALERT_FROM_EMAIL: "alerts@tickettoken.com"
  ALERT_TO_EMAIL: "ops@tickettoken.com"
```

#### 4. Create Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monitoring-service
  namespace: tickettoken-monitoring
  labels:
    app: monitoring-service
spec:
  replicas: 2
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: monitoring-service
  template:
    metadata:
      labels:
        app: monitoring-service
        version: v1.0.0
    spec:
      containers:
      - name: monitoring-service
        image: tickettoken/monitoring-service:1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3017
          name: http
          protocol: TCP
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: monitoring-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: monitoring-secrets
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: monitoring-secrets
              key: jwt-secret
        envFrom:
        - configMapRef:
            name: monitoring-config
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3017
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3017
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: logs
        emptyDir: {}
```

#### 5. Create Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: monitoring-service
  namespace: tickettoken-monitoring
  labels:
    app: monitoring-service
spec:
  type: ClusterIP
  selector:
    app: monitoring-service
  ports:
  - port: 3017
    targetPort: 3017
    protocol: TCP
    name: http
```

#### 6. Create Ingress (Optional)

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monitoring-ingress
  namespace: tickettoken-monitoring
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - monitoring.tickettoken.com
    secretName: monitoring-tls
  rules:
  - host: monitoring.tickettoken.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: monitoring-service
            port:
              number: 3017
```

#### Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -n tickettoken-monitoring
kubectl get svc -n tickettoken-monitoring

# Check logs
kubectl logs -f deployment/monitoring-service -n tickettoken-monitoring

# Scale deployment
kubectl scale deployment monitoring-service --replicas=3 -n tickettoken-monitoring
```

### PM2 Deployment

For traditional server deployments using PM2:

#### 1. Install Dependencies

```bash
cd backend/services/monitoring-service
npm ci --production
```

#### 2. Run Migrations

```bash
npm run migrate
```

#### 3. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'monitoring-service',
    script: './dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3017
    },
    env_file: '.env.production',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

#### 4. Start with PM2

```bash
# Start
pm2 start ecosystem.config.js

# Save configuration
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit

# Logs
pm2 logs monitoring-service
```

## Database Migrations

### Run Migrations

```bash
# Development
npm run migrate

# Production
NODE_ENV=production npm run migrate
```

### Migration Strategy

**Blue-Green Deployment:**
1. Run migrations on new environment
2. Test new environment
3. Switch traffic to new environment
4. Keep old environment for rollback

**In-Place Update:**
1. Enable maintenance mode
2. Run migrations
3. Restart service
4. Disable maintenance mode

### Rollback Migrations

```bash
# Rollback last migration
npm run migrate:rollback

# Rollback to specific version
npm run migrate:rollback -- --to=20250101000000
```

## Configuration

### Prometheus Configuration

Add to Prometheus `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'monitoring-service'
    scrape_interval: 15s
    static_configs:
      - targets: ['monitoring-service:3017']
    metrics_path: '/metrics'
    # If using authentication:
    basic_auth:
      username: prometheus
      password: your-password
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name monitoring.tickettoken.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name monitoring.tickettoken.com;

    ssl_certificate /etc/letsencrypt/live/monitoring.tickettoken.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoring.tickettoken.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:3017;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Restrict /metrics to Prometheus IPs only
    location /metrics {
        allow 10.0.1.5;  # Prometheus server
        allow 10.0.1.6;  # Backup Prometheus
        deny all;
        
        proxy_pass http://localhost:3017;
    }
}
```

## Monitoring the Monitor

Yes, you need to monitor the monitoring service!

### External Health Checks

Use an external service to monitor availability:

**Pingdom, UptimeRobot, or similar:**
- Monitor: `https://monitoring.tickettoken.com/health`
- Interval: 1 minute
- Alert: ops@tickettoken.com

### Prometheus Self-Monitoring

The monitoring service exports its own metrics:
- `process_cpu_percent`
- `process_memory_bytes`
- `http_requests_total`
- `http_request_duration_seconds`

### Log Aggregation

Configure log shipping to Elasticsearch or similar:

```yaml
# fluent-bit.conf
[INPUT]
    Name tail
    Path /app/logs/monitoring-*.log
    Tag monitoring-service

[OUTPUT]
    Name es
    Match monitoring-service
    Host elasticsearch-host
    Port 9200
    Index monitoring-logs
```

## Rollback Procedures

### Docker Rollback

```bash
# Stop current version
docker stop monitoring-service

# Start previous version
docker run -d \
  --name monitoring-service \
  # ... same parameters ...
  tickettoken/monitoring-service:0.9.0
```

### Kubernetes Rollback

```bash
# Rollback to previous revision
kubectl rollout undo deployment/monitoring-service -n tickettoken-monitoring

# Rollback to specific revision
kubectl rollout undo deployment/monitoring-service --to-revision=2 -n tickettoken-monitoring

# Check rollout history
kubectl rollout history deployment/monitoring-service -n tickettoken-monitoring
```

### PM2 Rollback

```bash
# Stop current version
pm2 stop monitoring-service

# Switch to previous version files
cd /path/to/previous/version

# Start previous version
pm2 start ecosystem.config.js
```

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://monitoring.tickettoken.com/health
```

Expected:
```json
{
  "status": "healthy",
  "services": [...],
  "dependencies": {...}
}
```

### 2. Metrics Check

```bash
curl https://monitoring.tickettoken.com/metrics
```

Should return Prometheus-formatted metrics.

### 3. Alert Test

Trigger a test alert to verify notifications:

```bash
# Via API (if test endpoint exists)
curl -X POST https://monitoring.tickettoken.com/api/alerts/test
```

### 4. Service Monitoring

Check that all 21 services are being monitored:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://monitoring.tickettoken.com/api/v1/monitoring/services
```

### 5. Worker Status

Verify background workers are running:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://monitoring.tickettoken.com/api/v1/monitoring/workers
```

## Troubleshooting Deployment

### Container Won't Start

```bash
# Check logs
docker logs monitoring-service

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

### Migration Errors

```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check migrations table
psql $DATABASE_URL -c "SELECT * FROM knex_migrations"

# Run migrations manually
npm run migrate
```

### High Memory Usage

```bash
# Check metrics
curl http://localhost:3017/metrics | grep process_resident_memory
```

Adjust resources in deployment configuration.

## Security Checklist

Before going to production:

- [ ] Change all default passwords
- [ ] Set strong JWT_SECRET
- [ ] Enable HTTPS/TLS
- [ ] Restrict /metrics endpoint
- [ ] Configure rate limiting
- [ ] Enable firewall rules
- [ ] Setup log aggregation
- [ ] Configure backup strategy
- [ ] Test alert notifications
- [ ] Document deployment procedures
- [ ] Train operations team

## Support

For deployment issues:
- Check logs: `/app/logs` or `kubectl logs`
- Review [Troubleshooting](../README.md#troubleshooting)
- Contact DevOps team

---

**Last Updated:** 2025-11-18
