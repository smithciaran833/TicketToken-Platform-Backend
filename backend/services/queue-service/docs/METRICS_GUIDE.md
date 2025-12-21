# Queue Service Metrics Guide

## Overview

The Queue Service exposes comprehensive metrics through Prometheus for monitoring queue health, job processing, and system performance.

## Accessing Metrics

- **Endpoint**: `http://localhost:9090/metrics`
- **Format**: Prometheus exposition format
- **Update Frequency**: Real-time

## Key Metrics

### Queue Metrics

#### `queue_jobs_waiting`
- **Type**: Gauge
- **Description**: Number of jobs waiting in queue
- **Labels**: `queue_name`, `service`
- **Example**: `queue_jobs_waiting{queue_name="money",service="queue-service"} 42`

#### `queue_jobs_active`
- **Type**: Gauge
- **Description**: Number of jobs currently being processed
- **Labels**: `queue_name`, `service`

#### `queue_jobs_completed_total`
- **Type**: Counter
- **Description**: Total number of completed jobs
- **Labels**: `queue_name`, `job_type`, `service`

#### `queue_jobs_failed_total`
- **Type**: Counter  
- **Description**: Total number of failed jobs
- **Labels**: `queue_name`, `job_type`, `service`

#### `queue_job_duration_seconds`
- **Type**: Histogram
- **Description**: Job processing duration distribution
- **Labels**: `queue_name`, `job_type`, `service`
- **Buckets**: 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300 seconds

### Rate Limiter Metrics

#### `rate_limiter_tokens_available`
- **Type**: Gauge
- **Description**: Available rate limit tokens for each service
- **Labels**: `service_name`

#### `rate_limiter_concurrent_requests`
- **Type**: Gauge
- **Description**: Current concurrent requests per service
- **Labels**: `service_name`

#### `rate_limiter_max_concurrent`
- **Type**: Gauge
- **Description**: Maximum allowed concurrent requests
- **Labels**: `service_name`

### Idempotency Metrics

#### `idempotency_checks_total`
- **Type**: Counter
- **Description**: Total idempotency checks performed
- **Labels**: `service`

#### `idempotency_hits_total`
- **Type**: Counter
- **Description**: Number of idempotency cache hits
- **Labels**: `service`

#### `idempotency_hit_rate`
- **Type**: Gauge
- **Description**: Percentage of idempotency cache hits
- **Unit**: Percentage (0-100)

### Circuit Breaker Metrics

#### `circuit_breaker_state`
- **Type**: Gauge
- **Description**: Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)
- **Labels**: `service_name`

#### `circuit_breaker_failures`
- **Type**: Counter
- **Description**: Total circuit breaker failures
- **Labels**: `service_name`

### Redis Metrics

#### `redis_connected`
- **Type**: Gauge
- **Description**: Redis connection status (1=connected, 0=disconnected)
- **Labels**: `redis_db`, `service`

#### `redis_commands_total`
- **Type**: Counter
- **Description**: Total Redis commands executed
- **Labels**: `redis_db`, `command`, `service`

## Alert Rules

### Critical Alerts

```yaml
# Queue depth too high
- alert: QueueDepthHigh
  expr: queue_jobs_waiting > 1000
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Queue {{$labels.queue_name}} depth exceeds 1000"

# Job failure rate too high  
- alert: JobFailureRateHigh
  expr: rate(queue_jobs_failed_total[5m]) / rate(queue_jobs_total[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Job failure rate above 10% for {{$labels.queue_name}}"

# Circuit breaker open
- alert: CircuitBreakerOpen
  expr: circuit_breaker_state == 1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Circuit breaker OPEN for {{$labels.service_name}}"
```

### Warning Alerts

```yaml
# Queue processing slow
- alert: QueueProcessingSlow
  expr: histogram_quantile(0.95, rate(queue_job_duration_seconds_bucket[5m])) > 60
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "95th percentile job duration above 60s for {{$labels.queue_name}}"

# Low idempotency hit rate
- alert: LowIdempotencyHitRate
  expr: idempotency_hit_rate < 50
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Idempotency hit rate below 50%"
```

## Grafana Dashboard

Import the Grafana dashboard from `grafana/queue-service-dashboard.json` to visualize these metrics.

### Dashboard Panels

1. **Queue Depth Over Time** - Real-time queue depth
2. **Job Processing Rate** - Jobs completed/failed per second
3. **Job Failure Rate** - Percentage of failed jobs
4. **Rate Limiter Status** - Available tokens per service
5. **Idempotency Hit Rate** - Cache hit percentage
6. **Worker Concurrency** - Current vs max concurrent workers
7. **Circuit Breaker States** - Status of all circuit breakers
8. **Job Processing Duration** - p95 latency by queue
9. **Redis Connection Status** - Connection health per database

## Querying Examples

### PromQL Queries

```promql
# Average job processing time
avg(rate(queue_job_duration_seconds_sum[5m]) / rate(queue_job_duration_seconds_count[5m]))

# Job throught per minute by queue
sum(rate(queue_jobs_completed_total[1m])) by (queue_name) * 60

# Failed job percentage
(rate(queue_jobs_failed_total[5m]) / rate(queue_jobs_total[5m])) * 100

# Rate limiter utilization
(rate_limiter_concurrent/ rate_limiter_max_concurrent) * 100
```

## Integration

### Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'queue-service'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

### Monitoring Best Practices

1. **Set up alerts** for critical metrics
2. **Review dashboards** daily for anomalies
3. **Track trends** weekly for capacity planning
4. **Investigate spikes** in failure rates immediately
5. **Monitor circuit breakers** for service health

## Troubleshooting

### High Queue Depth
- Check worker health
- Review rate limiter settings
- Verify external service availability

### High Failure Rate
- Check circuit breaker states
- Review job logs for common errors
- Verify network connectivity

### Low Idempotency Hit Rate
- Check Redis connectivity
- Review TTL settings
- Verify idempotency key generation

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Getting Started](https://grafana.com/docs/)
- [Queue Service API Docs](http://localhost:3011/api/v1/queue/docs)
