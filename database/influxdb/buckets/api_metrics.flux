// API Metrics Bucket Configuration
// Purpose: Track API performance, usage patterns, and service health
// Retention: 30 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "api_metrics"
org = "tickettoken"
retention = "30d"
description = "Comprehensive API monitoring with SLA tracking and advanced analytics"

// Request Metrics
request_metrics = {
    measurement: "api_requests",
    tags: [
        "endpoint",
        "method",
        "version",
        "status_code",
        "service",
        "environment",
        "client_type",
        "request_id"
    ],
    fields: {
        request_count: "integer",
        response_time: "float",
        request_size: "float",
        response_size: "float",
        error_count: "integer",
        cache_hit: "boolean",
        compression_ratio: "float",
        queue_time: "float",
        processing_time: "float"
    }
}

// Response Time Metrics
latency_metrics = {
    measurement: "api_latency",
    tags: [
        "endpoint",
        "method",
        "region",
        "percentile",
        "cache_status",
        "load_balancer"
    ],
    fields: {
        p50_latency: "float",
        p75_latency: "float",
        p90_latency: "float",
        p95_latency: "float",
        p99_latency: "float",
        max_latency: "float",
        min_latency: "float",
        avg_latency: "float",
        latency_variance: "float"
    }
}

// Error Tracking
error_metrics = {
    measurement: "api_errors",
    tags: [
        "endpoint",
        "error_type",
        "error_code",
        "service",
        "severity",
        "user_agent",
        "retry_eligible",
        "error_source"
    ],
    fields: {
        error_count: "integer",
        error_rate: "float",
        affected_users: "integer",
        retry_attempts: "integer",
        resolution_time: "float",
        stack_trace_id: "string",
        correlation_id: "string",
        monetary_impact: "float"
    }
}

// Rate Limiting Metrics
rate_limit_metrics = {
    measurement: "api_rate_limits",
    tags: [
        "client_id",
        "endpoint",
        "limit_type",
        "tier",
        "enforcement_action",
        "rate_limit_key"
    ],
    fields: {
        requests_allowed: "integer",
        requests_blocked: "integer",
        limit_threshold: "integer",
        current_usage: "integer",
        reset_timestamp: "integer",
        burst_allowance: "integer",
        throttle_duration: "float",
        quota_remaining: "integer",
        overage_charges: "float"
    }
}

// Authentication Metrics
auth_metrics = {
    measurement: "api_authentication",
    tags: [
        "auth_method",
        "token_type",
        "client_id",
        "success",
        "failure_reason",
        "oauth_provider"
    ],
    fields: {
        auth_attempts: "integer",
        successful_auths: "integer",
        failed_auths: "integer",
        token_refreshes: "integer",
        token_revocations: "integer",
        avg_token_lifetime: "float",
        mfa_challenges: "integer",
        permission_denials: "integer",
        session_duration: "float"
    }
}

// Client Analytics
client_metrics = {
    measurement: "api_clients",
    tags: [
        "client_id",
        "client_name",
        "sdk_version",
        "platform",
        "api_version",
        "integration_type"
    ],
    fields: {
        unique_clients: "integer",
        requests_per_client: "integer",
        data_transferred: "float",
        active_endpoints: "integer",
        error_rate_per_client: "float",
        avg_request_size: "float",
        subscription_tier: "string",
        api_spend: "float",
        last_seen: "integer"
    }
}

// Endpoint Performance
endpoint_metrics = {
    measurement: "api_endpoints",
    tags: [
        "endpoint",
        "method",
        "resource_type",
        "deprecated",
        "public_private",
        "requires_auth"
    ],
    fields: {
        total_calls: "integer",
        unique_callers: "integer",
        avg_response_time: "float",
        error_percentage: "float",
        data_volume: "float",
        deprecation_warnings: "integer",
        resource_utilization: "float",
        cpu_time: "float",
        memory_usage: "float"
    }
}

// Geographic Distribution
geo_metrics = {
    measurement: "api_geography",
    tags: [
        "country",
        "region",
        "city",
        "datacenter",
        "cdn_node",
        "isp"
    ],
    fields: {
        request_count: "integer",
        avg_latency: "float",
        error_rate: "float",
        bandwidth_usage: "float",
        unique_users: "integer",
        cache_hit_rate: "float",
        edge_compute_usage: "float"
    }
}

// SLA Monitoring
sla_metrics = {
    measurement: "api_sla",
    tags: [
        "service",
        "endpoint",
        "client_tier",
        "sla_type",
        "measurement_period"
    ],
    fields: {
        uptime_percentage: "float",
        availability_percentage: "float",
        response_time_compliance: "float",
        error_rate_compliance: "float",
        sla_breaches: "integer",
        downtime_minutes: "float",
        credits_owed: "float",
        mttr: "float",
        mtbf: "float"
    }
}

// Webhook Metrics
webhook_metrics = {
    measurement: "api_webhooks",
    tags: [
        "webhook_type",
        "destination",
        "event_type",
        "status",
        "retry_count"
    ],
    fields: {
        delivery_attempts: "integer",
        successful_deliveries: "integer",
        failed_deliveries: "integer",
        avg_delivery_time: "float",
        payload_size: "float",
        retry_exhausted: "integer",
        response_time: "float",
        queue_depth: "integer"
    }
}

// API Gateway Metrics
gateway_metrics = {
    measurement: "api_gateway",
    tags: [
        "gateway_id",
        "region",
        "stage",
        "backend_service"
    ],
    fields: {
        request_count: "integer",
        backend_latency: "float",
        integration_latency: "float",
        cache_hit_count: "integer",
        cache_miss_count: "integer",
        throttle_count: "integer",
        connection_count: "integer",
        active_connections: "integer"
    }
}

// Cost Analytics
cost_metrics = {
    measurement: "api_costs",
    tags: [
        "service",
        "client_id",
        "resource_type",
        "billing_period"
    ],
    fields: {
        compute_cost: "float",
        bandwidth_cost: "float",
        storage_cost: "float",
        request_cost: "float",
        total_cost: "float",
        cost_per_request: "float",
        margin: "float"
    }
}

// API Retention Policies
api_retention = {
    raw_data: "30d",
    minute_aggregates: "90d",
    hourly_aggregates: "1y",
    daily_aggregates: "3y",
    sla_data: "7y"
}

// Performance Thresholds
api_thresholds = {
    max_response_time: 1000.0,       // milliseconds
    max_error_rate: 1.0,             // percentage
    min_cache_hit_rate: 80.0,        // percentage
    rate_limit_window: 3600,         // seconds
    token_expiry_default: 86400,     // seconds
    sla_uptime_target: 99.9,         // percentage
    webhook_timeout: 30000,          // milliseconds
    max_retry_attempts: 3
}

// SLA Definitions
sla_definitions = {
    premium: {
        uptime: 99.99,
        response_time_p99: 200,
        error_rate_max: 0.1,
        support_response: 3600
    },
    standard: {
        uptime: 99.9,
        response_time_p99: 500,
        error_rate_max: 0.5,
        support_response: 14400
    },
    basic: {
        uptime: 99.5,
        response_time_p99: 1000,
        error_rate_max: 1.0,
        support_response: 86400
    }
}

// Alert Rules
api_alerts = {
    high_error_rate: "error_rate > 5.0",
    slow_response: "p99_latency > 2000",
    rate_limit_abuse: "requests_blocked > 1000",
    sla_breach: "uptime_percentage < sla_target",
    authentication_spike: "failed_auths > 1000",
    cost_overrun: "total_cost > budget * 1.2"
}

// Analytics Dashboards
api_dashboards = {
    overview: {
        widgets: ["request_volume", "error_rates", "latency_percentiles", "top_endpoints"],
        refresh_interval: "30s"
    },
    performance: {
        widgets: ["response_times", "throughput", "cache_performance", "backend_health"],
        refresh_interval: "60s"
    },
    sla_compliance: {
        widgets: ["uptime_tracker", "sla_breaches", "credit_calculator", "incident_timeline"],
        refresh_interval: "300s"
    },
    client_usage: {
        widgets: ["top_clients", "usage_patterns", "rate_limit_status", "billing_preview"],
        refresh_interval: "900s"
    },
    security: {
        widgets: ["auth_failures", "suspicious_patterns", "blocked_requests", "api_abuse"],
        refresh_interval: "60s"
    }
}

// Aggregation Queries
from(bucket: "api_metrics")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement =~ /api_requests|api_latency|api_errors|api_sla/)
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
  |> to(bucket: "api_metrics_5min", org: "tickettoken")

// SLA Calculations
sla_calculation = from(bucket: "api_metrics")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "api_requests")
  |> group(columns: ["service", "endpoint"])
  |> reduce(
      fn: (r, accumulator) => ({
          total: accumulator.total + r.request_count,
          errors: accumulator.errors + r.error_count,
          uptime: (accumulator.total - accumulator.errors) / accumulator.total * 100
      }),
      identity: {total: 0, errors: 0, uptime: 100.0}
  )
