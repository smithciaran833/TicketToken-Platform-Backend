# monitoring-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how monitoring-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for API routes + IP/Basic Auth for metrics scraping
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT authentication
- `src/middleware/metrics-auth.middleware.ts` - Prometheus metrics authentication

### System 1: JWT Authentication (API Routes)

**How it works:**
- Standard JWT verification using jsonwebtoken library
- Extracts user info (id, venueId, role, permissions)
- Uses `JWT_SECRET` (required in production, fallback 'dev-secret' in development)
- No algorithm whitelist specified (gap)

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  // Validate JWT_SECRET is set in production
  const jwtSecret = process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-secret');

  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  const decoded = jwt.verify(token, jwtSecret) as any;

  request.user = {
    id: decoded.userId || decoded.id,
    venueId: decoded.venueId,
    role: decoded.role || 'user',
    permissions: decoded.permissions || []
  };
}
```

### Role-Based Authorization

```typescript
// From middleware/auth.middleware.ts
export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}
```

### System 2: Prometheus Metrics Authentication

**How it works:**
- Dual authentication: IP whitelist OR Basic authentication
- IP whitelist via `PROMETHEUS_ALLOWED_IPS` (default: `127.0.0.1`)
- Basic auth via `METRICS_BASIC_AUTH` (format: `username:password`)
- Supports CIDR notation for IP ranges (e.g., `10.0.0.0/8`)
- Handles X-Forwarded-For and X-Real-IP headers for proxy environments

**Code Example:**
```typescript
// From middleware/metrics-auth.middleware.ts
export async function metricsAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const clientIP = getClientIP(request);
  const allowedIPs = parseIPWhitelist();
  const basicAuthCreds = parseBasicAuth();

  // Check IP whitelist first
  if (isIPAllowed(clientIP, allowedIPs)) {
    logger.debug(`Metrics access granted for IP: ${clientIP}`);
    return;
  }

  // If IP not whitelisted, check Basic auth (if configured)
  if (basicAuthCreds) {
    if (checkBasicAuth(request, basicAuthCreds)) {
      logger.debug(`Metrics access granted via Basic auth from IP: ${clientIP}`);
      return;
    }
  }

  // Access denied
  logger.warn(`Metrics access denied for IP: ${clientIP}`);

  // Return 401 with WWW-Authenticate header if Basic auth is configured
  if (basicAuthCreds) {
    return reply.status(401)
      .header('WWW-Authenticate', 'Basic realm="Prometheus Metrics"')
      .send({ error: 'Authentication required' });
  }

  // Return 403 if only IP whitelist is used
  return reply.status(403).send({
    error: 'Access denied',
    message: 'Your IP address is not authorized to access metrics'
  });
}

function isIPInCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  return (ipNum & mask) === (rangeNum & mask);
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/index.ts`
- `src/routes/` directory

**Findings:**
- monitoring-service does **not expose** any `/internal/` routes
- All routes are either public (health, prometheus export) or JWT-protected
- This is appropriate - monitoring-service is the **observer**, not a data provider to other services

**Public API Routes:**

| Route Prefix | Auth | Description |
|--------------|------|-------------|
| `/health` | None | Health check endpoints |
| `/status` | None | Service status |
| `/api/v1/monitoring/metrics` | JWT | Metrics API (push/pull) |
| `/api/v1/monitoring/metrics/export` | IP/Basic | Prometheus scrape endpoint |
| `/api/v1/monitoring/alerts` | JWT | Alert management |
| `/api/v1/monitoring/dashboard` | JWT | Dashboard data |
| `/cache/stats` | None | Cache statistics |
| `/cache/flush` | None | Cache flush |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Simple axios (no HMAC authentication)
**Files Examined:**
- `src/services/health.service.ts`
- `src/checkers/service.checker.ts`
- `src/alerting/channels/notification.manager.ts`

### Health Check Client

**Purpose:** Monitor health of all platform services

**How it works:**
- Uses simple axios with 5-second timeout
- Calls `/health` endpoint on each service
- No authentication headers - relies on health endpoints being public
- Classifies response: healthy (<2s), degraded (>=2s or 4xx), unhealthy (5xx or timeout)

**Services Monitored:**
| Service | URL Environment Variable |
|---------|-------------------------|
| auth | `AUTH_SERVICE_URL` |
| venue | `VENUE_SERVICE_URL` |
| event | `EVENT_SERVICE_URL` |
| ticket | `TICKET_SERVICE_URL` |
| payment | `PAYMENT_SERVICE_URL` |
| marketplace | `MARKETPLACE_SERVICE_URL` |
| analytics | `ANALYTICS_SERVICE_URL` |
| apiGateway | `API_GATEWAY_URL` |

**Code Example:**
```typescript
// From services/health.service.ts
async getServiceHealth(serviceName: string): Promise<any> {
  try {
    const serviceUrl = (config.services as any)[serviceName];
    if (!serviceUrl) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const response = await axios.get(`${serviceUrl}/health`, {
      timeout: 5000,
    });

    return {
      service: serviceName,
      status: 'healthy',
      responseTime: response.headers['x-response-time'] || null,
      timestamp: new Date(),
      details: response.data,
    };
  } catch (error: any) {
    return {
      service: serviceName,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date(),
    };
  }
}
```

### Service Health Checker

**Purpose:** Detailed health checking with latency classification

```typescript
// From checkers/service.checker.ts
async check(): Promise<any> {
  const start = Date.now();

  try {
    const response = await axios.get(`${this.serviceUrl}/health`, {
      timeout: 5000,
      validateStatus: (status) => status < 500, // Accept 4xx as service is up
    });

    const latency = Date.now() - start;

    if (response.status === 200) {
      return {
        status: latency < 2000 ? 'healthy' : 'degraded',
        latency,
        httpStatus: response.status,
        service: this.serviceName,
        message: latency < 2000 ? 'Service responsive' : 'Service slow',
      };
    }
    // ... handle other statuses
  } catch (error: any) {
    // Handle specific error types: ECONNREFUSED, ETIMEDOUT, ECONNABORTED
  }
}
```

### Notification Channels

**Purpose:** Send alerts via multiple channels

| Channel | Library | Destination |
|---------|---------|-------------|
| Email | `nodemailer` | SMTP server |
| Slack | `@slack/web-api` | Slack channel |
| PagerDuty | `axios` | PagerDuty Events API v2 |
| Webhook | `axios` | Custom webhook URL |

**Code Example (PagerDuty):**
```typescript
// From alerting/channels/notification.manager.ts
private async sendPagerDuty(message: string, alert: Alert): Promise<void> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY;

  const event = {
    routing_key: routingKey,
    event_action: 'trigger',
    payload: {
      summary: `${alert.severity.toUpperCase()}: ${alert.ruleName}`,
      severity: this.mapSeverityToPagerDuty(alert.severity),
      source: 'monitoring-service',
      timestamp: alert.timestamp.toISOString(),
      component: 'alert-system',
      group: 'monitoring',
      class: alert.ruleId,
      custom_details: {
        rule_name: alert.ruleName,
        current_value: alert.value,
        threshold: alert.threshold,
        message: alert.message
      }
    }
  };

  await axios.post('https://events.pagerduty.com/v2/enqueue', event, {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Note:** Health check calls do **not use HMAC authentication** - they rely on `/health` endpoints being publicly accessible. This is a design choice, not a gap.

---

## Category 4: Message Queues

**Implementation:** None - uses native JavaScript intervals
**Files Examined:**
- Searched for: amqplib, rabbitmq, Bull, bullmq, pg-boss
- `src/config/index.ts`

**Findings:**
- monitoring-service does **not use any message queues**
- Uses native JavaScript `setInterval` for periodic operations
- This is appropriate for a monitoring service that polls metrics

### Scheduled Operations (setInterval-based)

| Operation | Interval | Configurable Via |
|-----------|----------|------------------|
| Health checks | 30s | `HEALTH_CHECK_INTERVAL` |
| Metric collection | 60s | `METRIC_COLLECTION_INTERVAL` |
| Alert evaluation | 60s | `ALERT_EVALUATION_INTERVAL` |

**Configuration:**
```typescript
// From config/index.ts
intervals: {
  healthCheck: envVars.HEALTH_CHECK_INTERVAL * 1000,       // Default: 30s
  metricCollection: envVars.METRIC_COLLECTION_INTERVAL * 1000, // Default: 60s
  alertEvaluation: envVars.ALERT_EVALUATION_INTERVAL * 1000,  // Default: 60s
},
```

### Alert Thresholds

| Metric | Default Threshold | Configurable Via |
|--------|-------------------|------------------|
| CPU | 80% | `CPU_THRESHOLD` |
| Memory | 85% | `MEMORY_THRESHOLD` |
| Disk | 90% | `DISK_THRESHOLD` |
| Error Rate | 5% | `ERROR_RATE_THRESHOLD` |
| Response Time | 2000ms | `RESPONSE_TIME_THRESHOLD_MS` |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + IP/Basic for metrics | No HMAC for internal services |
| Internal Endpoints | **None** | Monitoring is observer, not provider |
| HTTP Client (Outgoing) | axios (no HMAC) | Health checks to public endpoints |
| Message Queues | **None** | Uses setInterval for scheduling |

**Key Characteristics:**
- monitoring-service is the **platform observer** - it watches other services
- Prometheus metrics secured via IP whitelist OR Basic authentication
- Health checks rely on public `/health` endpoints (no authentication needed)
- Alert notifications via email (SMTP), Slack, PagerDuty, and custom webhooks
- Time-series data stored in InfluxDB
- Logs and events stored in Elasticsearch
- No message queues - uses polling intervals

**Dependencies Health Checked:**
- PostgreSQL (via query)
- Redis (via ping)
- MongoDB (via admin ping)
- Elasticsearch (via ping)

**Standardization Notes:**
- JWT authentication does not specify algorithm whitelist (gap)
- Health checks don't need HMAC - they call public endpoints
- Metrics endpoint appropriately uses IP whitelist for Prometheus scraping

