# Metrics Naming Convention

## Format
```
{namespace}_{subsystem}_{name}_{unit}
```

## Examples

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | Request latency |
| `database_queries_total` | Counter | Total DB queries |
| `database_query_duration_seconds` | Histogram | Query latency |
| `database_connection_pool` | Gauge | Pool connections |
| `ticket_purchases_total` | Counter | Tickets purchased |
| `ticket_transfers_total` | Counter | Tickets transferred |
| `ticket_scans_total` | Counter | Tickets scanned |
| `blockchain_transactions_total` | Counter | Blockchain txns |
| `circuit_breaker_state` | Gauge | Breaker state (0/1/2) |

## Labels

Standard labels included on all metrics:

| Label | Description |
|-------|-------------|
| `service` | Service name |
| `environment` | dev/staging/prod |
| `version` | Service version |

## HTTP Metrics Labels

| Label | Description |
|-------|-------------|
| `method` | GET, POST, etc. |
| `route` | URL pattern |
| `status` | HTTP status code |
| `status_class` | 2xx, 4xx, 5xx |

## Business Metrics Labels

| Label | Description |
|-------|-------------|
| `tenant_id` | Tenant identifier |
| `event_id` | Event identifier |
| `status` | success, failure |

## Units

Always include units in metric names:

| Unit | Suffix |
|------|--------|
| Seconds | `_seconds` |
| Bytes | `_bytes` |
| Total count | `_total` |
| Current value | (no suffix) |

## Prometheus Endpoint
```
GET /metrics
```

Returns all metrics in Prometheus text format.
