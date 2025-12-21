# Health Checks and Readiness Probes: Standards, Best Practices & Audit Checklist

## Overview

This document provides comprehensive guidance on implementing health checks and readiness probes for production systems, with specific focus on Kubernetes deployments, Fastify applications, PostgreSQL, Redis, and external services (Stripe, Solana RPC).

---

## 1. Standards & Best Practices

### 1.1 Liveness vs Readiness vs Startup Probes

Kubernetes provides three distinct probe types, each serving a specific purpose:

| Probe Type | Purpose | Failure Action | When to Use |
|------------|---------|----------------|-------------|
| **Liveness** | Detect if container is running but stuck (deadlock, infinite loop) | Restart container | Catch unrecoverable application failures |
| **Readiness** | Detect if container can accept traffic | Remove from load balancer (no restart) | Control traffic routing during temporary issues |
| **Startup** | Detect if application has finished starting | Block liveness/readiness until success | Slow-starting applications |

**Key Distinctions:**

- **Liveness probes do NOT wait for readiness probes to succeed.** Use `initialDelaySeconds` or a startup probe to delay liveness checks.
- **Readiness probes run throughout the container's entire lifecycle**, not just at startup. They can be used for maintenance windows or temporary overload recovery.
- **Startup probes disable liveness and readiness checks until successful**, preventing premature container termination during slow initialization.

**Source:** [Kubernetes Official Documentation - Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)

### 1.2 Kubernetes Probe Configuration

#### Configuration Parameters

| Parameter | Default | Description | Recommendation |
|-----------|---------|-------------|----------------|
| `initialDelaySeconds` | 0 | Seconds before first probe | Set based on application startup time |
| `periodSeconds` | 10 | Frequency of probes | 5-10s for most applications |
| `timeoutSeconds` | 1 | Timeout for probe response | 2-5s depending on operation complexity |
| `successThreshold` | 1 | Consecutive successes to mark healthy | 1 for liveness (must be 1), 1-3 for readiness |
| `failureThreshold` | 3 | Consecutive failures before action | 3-5 typically |

#### Probe Types

```yaml
# HTTP GET Probe (most common)
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

# TCP Socket Probe (for non-HTTP services)
livenessProbe:
  tcpSocket:
    port: 5432
  initialDelaySeconds: 15
  periodSeconds: 20

# Exec Probe (run command inside container)
livenessProbe:
  exec:
    command:
      - cat
      - /tmp/healthy
  initialDelaySeconds: 5
  periodSeconds: 5

# gRPC Probe
livenessProbe:
  grpc:
    port: 50051
    service: "health"
  initialDelaySeconds: 10
  periodSeconds: 10
```

#### Recommended Configuration Pattern

```yaml
spec:
  containers:
  - name: app
    ports:
    - containerPort: 8080
      name: http
    
    # Startup probe for slow-starting apps
    startupProbe:
      httpGet:
        path: /health/startup
        port: http
      failureThreshold: 30    # 30 * 10s = 5 minutes max startup
      periodSeconds: 10
    
    # Liveness probe - keep simple
    livenessProbe:
      httpGet:
        path: /health/live
        port: http
      initialDelaySeconds: 0   # Startup probe handles delay
      periodSeconds: 10
      timeoutSeconds: 3
      failureThreshold: 3
    
    # Readiness probe - can be more thorough
    readinessProbe:
      httpGet:
        path: /health/ready
        port: http
      initialDelaySeconds: 0
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 3
      successThreshold: 1
```

**Formula for Startup Probe:**
If container usually starts in more than `initialDelaySeconds + failureThreshold × periodSeconds`, use a startup probe.

**Source:** [Kubernetes - Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

### 1.3 Dependency Health Checks

#### What to Check vs. What NOT to Check

**DO check (in appropriate probes):**
- Database connectivity (connection pool health)
- Cache connectivity (Redis PING)
- Required file system access
- Essential configuration validity

**DO NOT check (to avoid cascading failures):**
- Other microservices' health endpoints
- External APIs (Stripe, Solana RPC) in liveness probes
- Shared dependencies that could take down all pods

#### Dependency Check Strategy

| Probe Type | Check Infrastructure Dependencies? | Check External Services? |
|------------|-----------------------------------|-------------------------|
| Startup | ✅ Yes - verify config and connections | ❌ No |
| Liveness | ❌ No - keep simple and local | ❌ No |
| Readiness | ⚠️ Carefully - only critical owned dependencies | ❌ No |

**Source:** [AWS Builders Library - Implementing health checks](https://aws.amazon.com/builders-library/implementing-health-checks/)

### 1.4 Health Check Response Formats

#### IETF Draft Standard (RFC draft-inadarei-api-health-check)

The recommended response format uses `application/health+json` media type:

```json
{
  "status": "pass",
  "version": "1.0.0",
  "releaseId": "abc123",
  "serviceId": "my-service",
  "description": "API health check",
  "checks": {
    "postgresql:connection": [
      {
        "status": "pass",
        "componentType": "datastore",
        "observedValue": 5,
        "observedUnit": "ms",
        "time": "2024-01-15T10:30:00Z"
      }
    ],
    "redis:ping": [
      {
        "status": "pass",
        "componentType": "datastore",
        "observedValue": 1,
        "observedUnit": "ms"
      }
    ]
  }
}
```

**Status Values:**
- `pass` (or `ok`, `up`): Healthy - HTTP 2xx/3xx
- `warn`: Healthy with concerns - HTTP 2xx/3xx
- `fail` (or `error`, `down`): Unhealthy - HTTP 4xx/5xx

**Source:** [IETF Health Check Response Format for HTTP APIs](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06)

#### Simple Response Format (Kubernetes Compatible)

For Kubernetes probes, a simple response is often sufficient:

```json
// Liveness endpoint - minimal
{ "status": "ok" }

// Readiness endpoint - with component status
{
  "status": "ok",
  "checks": {
    "database": "pass",
    "redis": "pass"
  }
}
```

**Source:** [MicroProfile Health - Health checks for microservices](https://openliberty.io/docs/latest/health-check-microservices.html)

### 1.5 Shallow vs Deep Health Checks

#### Shallow Health Checks

Verify the process is running and can respond to requests:
- Return static 200 OK
- Check HTTP server is listening
- Verify process isn't deadlocked
- Check local resources (disk space, memory)

**Pros:** Fast, low overhead, no cascading failures
**Cons:** May miss configuration errors or broken dependencies

#### Deep Health Checks

Verify connections to dependencies work:
- Database query execution
- Cache connectivity
- File system access
- Configuration validity

**Pros:** Catch real issues, verify functionality
**Cons:** Slow, expensive, can cause cascading failures

#### Recommended Approach

| Probe Type | Depth | What to Include |
|------------|-------|-----------------|
| Liveness | Shallow | Process alive, event loop not blocked |
| Startup | Deep | All critical dependencies configured and connected |
| Readiness | Medium | Owned infrastructure (DB, cache), not external services |

**Anti-pattern Warning:** Deep health checks in readiness probes that check other microservices can cause cascading failures where a single service failure brings down the entire system.

**Source:** [Encore.dev - Distributed Systems Horror Stories: Kubernetes Deep Health Checks](https://encore.dev/blog/horror-stories-k8s)

### 1.6 Health Aggregation Across Services

#### Watchdog Pattern

A dedicated service that aggregates health from all microservices:

```
┌─────────────────────────────────────────────────┐
│                   Watchdog                       │
│  Queries /health from all services periodically  │
│  Aggregates into unified dashboard               │
│  Triggers alerts based on status                 │
└─────────────────────────────────────────────────┘
         │         │         │
         ▼         ▼         ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │Service │ │Service │ │Service │
    │   A    │ │   B    │ │   C    │
    └────────┘ └────────┘ └────────┘
```

#### Implementation Recommendations

1. **Centralized health aggregation** - Use a watchdog or dedicated monitoring service
2. **Individual service responsibility** - Each service exposes its own health endpoint
3. **Do NOT have services query each other's health endpoints** to avoid circular dependencies
4. **Use external monitoring tools** (Prometheus, Datadog, etc.) for aggregation

**Source:** [Microsoft - Health monitoring for microservices](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/monitor-app-health)

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Health Check That Always Returns 200

**Problem:** Health endpoint returns 200 OK regardless of actual system state.

```javascript
// ❌ BAD - Always returns 200
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

**Impact:**
- Broken services receive traffic
- Misconfigured deployments pass health checks
- Load balancers route to unhealthy instances

**Fix:**
```javascript
// ✅ GOOD - Actually checks health
app.get('/health', async (req, res) => {
  try {
    // Verify event loop isn't blocked
    const eventLoopDelay = getEventLoopDelay();
    if (eventLoopDelay > 100) {
      throw new Error('Event loop blocked');
    }
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message });
  }
});
```

**Source:** [Datree - Best Practices for Kubernetes Readiness and Liveness Probes](https://www.datree.io/resources/kubernetes-readiness-and-liveness-probes-best-practices)

### 2.2 Not Checking Database Connectivity

**Problem:** Application reports healthy but cannot connect to database.

```javascript
// ❌ BAD - No database check
app.get('/health/ready', (req, res) => {
  res.json({ status: 'ok' });
});
```

**Impact:**
- Traffic routed to pods that can't fulfill requests
- Silent failures and degraded user experience
- Delayed detection of database issues

**Fix:**
```javascript
// ✅ GOOD - Includes database check
app.get('/health/ready', async (req, res) => {
  try {
    // Execute simple query with timeout
    await db.raw('SELECT 1').timeout(2000);
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});
```

**Source:** [Pgpool Documentation - Health Check](https://www.pgpool.net/docs/latest/en/html/runtime-config-health-check.html)

### 2.3 Health Check That's Too Slow

**Problem:** Health check takes longer than probe timeout.

**Impact:**
- Kubernetes treats timeout as failure
- Healthy pods marked unhealthy and restarted
- Restart loops under high load

**Symptoms:**
- Pods constantly restarting
- `kubectl describe pod` shows probe failures
- Increased latency triggers more failures

**Fix:**
```yaml
# Increase timeout for slow health checks
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  timeoutSeconds: 5      # Increase from default 1s
  periodSeconds: 10
  failureThreshold: 3

# OR make health check faster
# - Cache health check results
# - Use connection pooling
# - Avoid expensive operations in health checks
```

**Health Check Performance Guidelines:**
- Liveness: < 100ms
- Readiness: < 500ms
- Startup: < 1s per check (total time managed by failureThreshold)

**Source:** [Spacelift - Guide to Kubernetes Liveness Probes](https://spacelift.io/blog/kubernetes-liveness-probe)

### 2.4 Missing Readiness Checks During Startup

**Problem:** Application receives traffic before fully initialized.

```yaml
# ❌ BAD - Only liveness probe
spec:
  containers:
  - name: app
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
    # No readiness probe!
```

**Impact:**
- Requests fail during cold start
- Connection pool not initialized
- Caches not warmed
- Migrations not complete

**Fix:**
```yaml
# ✅ GOOD - Startup probe for initialization, readiness for traffic
spec:
  containers:
  - name: app
    startupProbe:
      httpGet:
        path: /health/startup
        port: 8080
      failureThreshold: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
```

**Source:** [Kubernetes - Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)

### 2.5 Circular Dependency in Health Checks

**Problem:** Services check each other's health, creating dependency loops.

```
Service A checks → Service B checks → Service C checks → Service A
```

**Impact:**
- All services report unhealthy if one fails
- Startup deadlock (A waits for B, B waits for C, C waits for A)
- Complete system outage from single failure

**Fix:**
1. **Never include other services' health endpoints in your health check**
2. Only check **owned infrastructure** (your database, your cache)
3. Use **external monitoring** for cross-service health

```javascript
// ❌ BAD - Checking other services
async function healthCheck() {
  await fetch('http://auth-service/health');  // Don't do this!
  await fetch('http://payments-service/health');  // Don't do this!
}

// ✅ GOOD - Only check owned dependencies
async function healthCheck() {
  await db.query('SELECT 1');        // Your database
  await redis.ping();                 // Your cache
  // Do NOT check other services
}
```

**Source:** [GitHub - Circular health checks dependency loops](https://github.com/dotnet-architecture/HealthChecks/issues/87)

### 2.6 Exposing Sensitive Information in Health Endpoints

**Problem:** Health endpoints reveal internal details.

```javascript
// ❌ BAD - Exposes sensitive information
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: {
      host: 'prod-db.internal.company.com',  // Internal hostname
      user: 'app_user',                       // Username
      connectionString: process.env.DB_URL,   // Full connection string!
      version: '14.5'                         // Version info for attacks
    },
    environment: process.env                  // ALL env vars!
  });
});
```

**Impact:**
- Attackers learn infrastructure details
- Connection strings potentially exposed
- Version information enables targeted exploits
- Compliance violations (PCI-DSS, HIPAA)

**Fix:**
```javascript
// ✅ GOOD - Minimal safe information
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// For detailed health (internal only)
app.get('/health/detailed', authMiddleware, (req, res) => {
  // Require authentication for detailed health
  res.json({
    status: 'ok',
    checks: {
      database: 'pass',  // Only pass/fail, no details
      cache: 'pass'
    }
  });
});
```

**Security Best Practices:**
1. **No connection strings** in health responses
2. **No version numbers** of dependencies
3. **No internal hostnames** or IP addresses
4. **Require authentication** for detailed endpoints
5. **Use internal-only exposure** for sensitive endpoints

**Source:** [Spring Boot - Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)

---

## 3. Audit Checklists

### 3.1 Fastify Application Health Check

#### Required Endpoints

| Endpoint | Purpose | What to Check | Timeout |
|----------|---------|---------------|---------|
| `GET /health/live` | Liveness probe | Event loop not blocked | < 100ms |
| `GET /health/ready` | Readiness probe | DB connected, Redis connected | < 500ms |
| `GET /health/startup` | Startup probe | All dependencies initialized | < 1s |

#### Fastify Implementation

```javascript
// Using fastify-healthcheck plugin
import Fastify from 'fastify';
import healthcheck from 'fastify-healthcheck';
import underPressure from '@fastify/under-pressure';

const fastify = Fastify({ logger: true });

// Register under-pressure for system health
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,           // 1 second max
  maxHeapUsedBytes: 1000000000,      // ~1GB
  maxRssBytes: 1500000000,           // ~1.5GB
  maxEventLoopUtilization: 0.98,     // 98%
  pressureHandler: (req, rep, type, value) => {
    rep.status(503).send({ 
      status: 'error', 
      reason: `${type} pressure: ${value}` 
    });
  }
});

// Register healthcheck
await fastify.register(healthcheck, {
  healthcheckUrl: '/health/live',
  exposeUptime: false,  // Don't expose uptime
  underPressureOptions: {}
});

// Custom readiness endpoint
fastify.get('/health/ready', async (request, reply) => {
  const checks = {};
  
  try {
    // Check PostgreSQL
    const dbStart = Date.now();
    await fastify.pg.query('SELECT 1');
    checks.postgresql = {
      status: 'pass',
      responseTime: Date.now() - dbStart
    };
  } catch (error) {
    checks.postgresql = { status: 'fail' };
    return reply.status(503).send({ status: 'error', checks });
  }
  
  try {
    // Check Redis
    const redisStart = Date.now();
    await fastify.redis.ping();
    checks.redis = {
      status: 'pass',
      responseTime: Date.now() - redisStart
    };
  } catch (error) {
    checks.redis = { status: 'fail' };
    return reply.status(503).send({ status: 'error', checks });
  }
  
  return { status: 'ok', checks };
});

// Startup endpoint
fastify.get('/health/startup', async (request, reply) => {
  // Verify all required configurations
  const required = ['DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    return reply.status(503).send({
      status: 'error',
      message: 'Missing configuration'
    });
  }
  
  return { status: 'ok' };
});
```

**Sources:**
- [npm - fastify-healthcheck](https://www.npmjs.com/package/fastify-healthcheck)
- [GitHub - fastify-custom-healthcheck](https://github.com/gkampitakis/fastify-custom-healthcheck)

#### Fastify Health Check Audit Checklist

```
□ Event loop monitoring configured (@fastify/under-pressure)
□ Liveness endpoint returns < 100ms
□ Readiness endpoint checks database and cache
□ No sensitive information in responses
□ Health endpoints don't require authentication
□ Proper HTTP status codes (200 healthy, 503 unhealthy)
□ Timeouts configured for all dependency checks
□ Graceful degradation when dependencies fail
```

### 3.2 PostgreSQL Health Check

#### What to Check

| Check | Query/Method | Timeout | Probe Type |
|-------|--------------|---------|------------|
| Connection alive | `SELECT 1` | 2s | Readiness |
| Can execute queries | Simple query | 3s | Readiness |
| Connection pool healthy | Pool stats | 1s | Readiness |
| Replication lag (if replica) | `pg_last_wal_receive_lsn()` | 2s | Readiness |

#### Implementation

```javascript
// PostgreSQL health check function
async function checkPostgres(pool) {
  const timeout = 2000; // 2 seconds
  
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      )
    ]);
    
    try {
      // Execute simple query
      const result = await client.query('SELECT 1 as health');
      
      // Check pool stats
      const poolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
      
      return {
        status: 'pass',
        pool: poolStats,
        responseTime: result.duration || 0
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: 'fail',
      error: error.message  // Safe to expose error type, not details
    };
  }
}
```

#### PostgreSQL Health Check Audit Checklist

```
□ Connection pooling configured (pg-pool, knex)
□ Health check uses connection from pool (not new connection)
□ Query timeout configured (statement_timeout)
□ Connection timeout configured (connect_timeout)
□ Health check query is lightweight (SELECT 1)
□ Pool exhaustion detected (waitingCount monitoring)
□ No credentials in error messages
□ Replica lag monitoring (if using read replicas)
```

#### Recommended Timeouts

| Setting | Value | Purpose |
|---------|-------|---------|
| `connect_timeout` | 5s | Time to establish connection |
| `statement_timeout` | 3s | Maximum query execution time |
| `idle_timeout` | 10min | Release idle connections |
| `health_check_interval` | 30s | Pgpool health check frequency |

**Source:** [Pgpool Documentation - Health Check](https://www.pgpool.net/docs/latest/en/html/runtime-config-health-check.html)

### 3.3 Redis Health Check

#### What to Check

| Check | Command | Timeout | Probe Type |
|-------|---------|---------|------------|
| Connection alive | `PING` | 1s | Readiness |
| Memory usage | `INFO memory` | 2s | Monitoring |
| Replication status | `INFO replication` | 2s | Readiness (if replica) |

#### Implementation

```javascript
// Redis health check function
async function checkRedis(redis) {
  const timeout = 1000; // 1 second
  
  try {
    const start = Date.now();
    
    // PING is O(1) and fast
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis timeout')), timeout)
      )
    ]);
    
    if (pong !== 'PONG') {
      return { status: 'fail', reason: 'Unexpected response' };
    }
    
    return {
      status: 'pass',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'fail',
      error: error.message
    };
  }
}
```

#### Docker Compose Health Check

```yaml
redis:
  image: redis:7-alpine
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 5s
```

#### Redis Health Check Audit Checklist

```
□ PING command used for health check
□ Timeout configured (< 1s recommended)
□ Connection pooling in use
□ Health check interval configured (every 3-10s)
□ Keepalive configured for idle connections (< 10 minutes)
□ Error handling for connection failures
□ No sensitive data in health responses
□ Memory monitoring for eviction warnings
```

#### Recommended Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `health_check_interval` | 3s | Redis client health check |
| `socket_connect_timeout` | 5s | Connection establishment |
| `socket_timeout` | 5s | Command timeout |
| `keepalive` | 300s | Keepalive for idle connections |

**Source:** [Redis Documentation - Production usage](https://redis.io/docs/latest/develop/clients/redis-py/produsage/)

### 3.4 External Services: Stripe

#### What NOT to Check

**⚠️ Do NOT include Stripe API health in your liveness or readiness probes.**

**Reasons:**
1. Stripe API issues shouldn't restart your pods
2. Network latency to Stripe varies
3. Stripe rate limits could fail your health checks
4. You cannot fix Stripe outages by restarting

#### Recommended Approach

```javascript
// ❌ BAD - Don't do this in health checks
app.get('/health/ready', async (req, res) => {
  await stripe.balance.retrieve(); // Don't check Stripe!
});

// ✅ GOOD - Check Stripe status separately for monitoring
async function checkStripeStatus() {
  // Use Stripe's official status page for monitoring
  // https://status.stripe.com/
  
  // Or check if YOUR Stripe integration is configured
  try {
    // Just verify API key is set, don't call Stripe
    if (!process.env.STRIPE_SECRET_KEY) {
      return { status: 'warn', reason: 'API key not configured' };
    }
    return { status: 'pass', note: 'API key configured' };
  } catch (error) {
    return { status: 'warn', error: error.message };
  }
}
```

#### Stripe Integration Monitoring Checklist

```
□ API key configured in environment
□ Webhook endpoint accessible
□ Webhook signature verification working
□ Error handling for Stripe API failures
□ Circuit breaker pattern for Stripe calls
□ Monitoring for Stripe error rates (400, 429, 500)
□ Alerts configured for Stripe status page
□ Stripe NOT included in liveness/readiness probes
```

#### External Status Monitoring

Monitor Stripe status externally:
- **Status Page:** https://status.stripe.com/
- **Health Alerts:** Available with Premium/Enterprise support plans
- **Workbench Health Tab:** Real-time monitoring in Stripe Dashboard

**Source:** [Stripe Documentation - Health alerts](https://docs.stripe.com/health-alerts)

### 3.5 External Services: Solana RPC

#### Solana RPC Health Endpoints

| Endpoint | Method | Response | Use Case |
|----------|--------|----------|----------|
| `GET /health` | HTTP GET | `ok`, `behind`, `unknown` | Load balancer checks |
| `getHealth` | JSON-RPC | `ok` or error | Application health |

#### What to Check

```javascript
// Solana RPC health check
async function checkSolanaRPC(rpcUrl) {
  const timeout = 5000; // 5 seconds
  
  try {
    // Option 1: HTTP health endpoint (preferred for basic checks)
    const healthResponse = await fetch(`${rpcUrl}/health`, {
      signal: AbortSignal.timeout(timeout)
    });
    const healthStatus = await healthResponse.text();
    
    if (healthStatus === 'ok') {
      return { status: 'pass' };
    } else if (healthStatus.startsWith('behind')) {
      // Node is behind but operational
      return { status: 'warn', reason: healthStatus };
    } else {
      return { status: 'fail', reason: healthStatus };
    }
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

// Option 2: JSON-RPC getHealth
async function checkSolanaRPCJsonRpc(rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getHealth'
    }),
    signal: AbortSignal.timeout(5000)
  });
  
  const data = await response.json();
  return data.result === 'ok' 
    ? { status: 'pass' } 
    : { status: 'fail', reason: data.error };
}
```

#### Solana RPC Health Check Audit Checklist

```
□ RPC endpoint URL configured
□ Timeout configured (5-10s for RPC calls)
□ Health check uses GET /health or getHealth
□ "behind" status handled appropriately
□ Multiple RPC endpoints configured (failover)
□ Circuit breaker for RPC failures
□ Rate limiting awareness
□ NOT included in liveness probe
□ Included in readiness only if Solana is critical path
```

#### Recommended Solana RPC Timeouts

| Operation | Timeout | Notes |
|-----------|---------|-------|
| Health check | 5s | Simple status check |
| getBalance | 10s | Account lookup |
| sendTransaction | 30s | Transaction submission |
| confirmTransaction | 60s | Block confirmation |

**Sources:**
- [Solana Docs - RPC HTTP Methods](https://solana.com/docs/rpc/http)
- [Helius Docs - getHealth](https://www.helius.dev/docs/rpc/guides/gethealth)

---

## 4. Complete Kubernetes Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastify-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fastify-app
  template:
    metadata:
      labels:
        app: fastify-app
    spec:
      containers:
      - name: app
        image: myapp:latest
        ports:
        - containerPort: 3000
          name: http
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        # Environment variables
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: redis-url
        
        # Startup probe - wait for app to initialize
        startupProbe:
          httpGet:
            path: /health/startup
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 30    # 30 * 5s = 150s max startup
          successThreshold: 1
        
        # Liveness probe - is the process healthy?
        livenessProbe:
          httpGet:
            path: /health/live
            port: http
          initialDelaySeconds: 0  # Startup probe handles delay
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
          successThreshold: 1
        
        # Readiness probe - can it receive traffic?
        readinessProbe:
          httpGet:
            path: /health/ready
            port: http
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 5
          failureThreshold: 3
          successThreshold: 1
```

---

## 5. Quick Reference: Timeout Configuration

### Summary Table

| Component | Health Check Timeout | Connection Timeout | Command/Query Timeout |
|-----------|---------------------|-------------------|----------------------|
| **Kubernetes Liveness** | 3s | - | - |
| **Kubernetes Readiness** | 5s | - | - |
| **Kubernetes Startup** | 3s | - | - |
| **PostgreSQL** | 2s | 5s | 3s |
| **Redis** | 1s | 5s | 5s |
| **Stripe** | ❌ Don't check | 30s | 30s |
| **Solana RPC** | 5s | 10s | 30-60s |

### What to Expose vs Hide

| Expose | Hide |
|--------|------|
| Status (pass/fail/warn) | Connection strings |
| Response times | Credentials |
| Component names | Internal hostnames |
| Timestamps | Version numbers |
| Error types | Stack traces |
| | Environment variables |
| | IP addresses |

---

## 6. Sources & References

### Kubernetes Documentation
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

### Health Check Standards
- [IETF Health Check Response Format for HTTP APIs](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06)
- [MicroProfile Health - Health checks for microservices](https://openliberty.io/docs/latest/health-check-microservices.html)
- [Microsoft - Health monitoring for microservices](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/monitor-app-health)

### AWS & Cloud Providers
- [AWS Builders Library - Implementing health checks](https://aws.amazon.com/builders-library/implementing-health-checks/)
- [Microsoft Azure - Health Endpoint Monitoring pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring)
- [Google Cloud SQL - Manage database connections](https://cloud.google.com/sql/docs/postgres/manage-connections)

### Fastify & Node.js
- [npm - fastify-healthcheck](https://www.npmjs.com/package/fastify-healthcheck)
- [GitHub - fastify-custom-healthcheck](https://github.com/gkampitakis/fastify-custom-healthcheck)
- [Fastify Ecosystem](https://fastify.dev/ecosystem/)

### Database Health Checks
- [Pgpool Documentation - Health Check](https://www.pgpool.net/docs/latest/en/html/runtime-config-health-check.html)
- [Redis Documentation - Production usage](https://redis.io/docs/latest/develop/clients/redis-py/produsage/)
- [Redis Commands - PING](https://redis.io/commands/ping/)
- [Microsoft Azure Cache for Redis - Best practices for connection resilience](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-best-practices-connection)

### External Services
- [Stripe Documentation - Health alerts](https://docs.stripe.com/health-alerts)
- [Stripe Status Page](https://status.stripe.com/)
- [Solana Docs - RPC HTTP Methods](https://solana.com/docs/rpc/http)
- [Solana Docs - getHealth](https://solana.com/docs/rpc/http/gethealth)
- [Helius Docs - How to Use getHealth](https://www.helius.dev/docs/rpc/guides/gethealth)

### Best Practices & Anti-Patterns
- [Datree - Best Practices for Kubernetes Readiness and Liveness Probes](https://www.datree.io/resources/kubernetes-readiness-and-liveness-probes-best-practices)
- [Encore.dev - Distributed Systems Horror Stories: Kubernetes Deep Health Checks](https://encore.dev/blog/horror-stories-k8s)
- [DZone - An Overview of Health Check Patterns](https://dzone.com/articles/an-overview-of-health-check-patterns)
- [Fairwinds - Guide to Understanding Kubernetes Liveness Probes](https://www.fairwinds.com/blog/a-guide-to-understanding-kubernetes-liveness-probes-best-practices)
- [Spacelift - Guide to Kubernetes Liveness Probes](https://spacelift.io/blog/kubernetes-liveness-probe)
- [Google SRE Book - Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Andrew Klotz - API Health checks for graceful or cascading failure](https://klotzandrew.com/blog/api-health-checks-for-graceful-or-cascading-failure/)

### Security
- [Spring Boot - Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [OWASP - API Security](https://owasp.org/API-Security/editions/2019/en/0xa3-excessive-data-exposure/)
- [Acunetix - Spring Boot Actuator Misconfiguration](https://www.acunetix.com/vulnerabilities/web/spring-boot-misconfiguration-all-spring-boot-actuator-endpoints-are-web-exposed/)

---

## 7. Audit Summary Checklist

### Pre-Deployment Checklist

```
Architecture & Design
□ Three probe types defined (startup, liveness, readiness)
□ Probe purposes clearly separated
□ No circular dependencies in health checks
□ External services NOT in liveness probes
□ Cascading failure scenarios documented

Fastify Application
□ /health/live endpoint implemented (< 100ms)
□ /health/ready endpoint implemented (< 500ms)
□ /health/startup endpoint implemented
□ @fastify/under-pressure configured
□ Event loop monitoring enabled

PostgreSQL
□ Connection pooling configured
□ Health check uses pool connection
□ Query timeout: 3s
□ Connection timeout: 5s
□ SELECT 1 health check query

Redis
□ PING health check implemented
□ Timeout: 1s
□ Connection pooling configured
□ Keepalive: < 10 minutes

External Services (Stripe, Solana)
□ NOT included in liveness probe
□ Circuit breaker pattern implemented
□ Fallback/degradation strategy defined
□ External status page monitoring configured

Security
□ No credentials in health responses
□ No version numbers exposed
□ No internal hostnames exposed
□ Detailed endpoints require authentication
□ Health endpoints use HTTPS in production

Kubernetes Configuration
□ Startup probe failureThreshold covers max startup time
□ Liveness probe timeout > typical response time
□ Readiness probe runs throughout lifecycle
□ Resource requests/limits configured
□ Graceful shutdown configured (terminationGracePeriodSeconds)
```

---

*Document Version: 1.0*
*Last Updated: December 2025*
*Compiled from 50+ authoritative sources*