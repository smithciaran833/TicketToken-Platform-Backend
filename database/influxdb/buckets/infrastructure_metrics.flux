// Infrastructure Metrics Bucket Configuration
// Purpose: Track system performance, resource utilization, and service health
// Retention: 30 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "infrastructure_metrics"
org = "tickettoken"
retention = "30d"
description = "System performance, infrastructure monitoring, and SLO tracking"

// System Metrics
system_metrics = {
    measurement: "system",
    tags: [
        "host",
        "region",
        "environment",
        "service",
        "cluster",
        "availability_zone"
    ],
    fields: {
        cpu_usage: "float",
        memory_usage: "float",
        disk_usage: "float",
        network_in: "float",
        network_out: "float",
        load_average: "float",
        iops_read: "float",
        iops_write: "float",
        open_file_descriptors: "integer",
        tcp_connections: "integer",
        thread_count: "integer"
    }
}

// Service Health
service_health = {
    measurement: "health",
    tags: [
        "service_name",
        "instance_id",
        "region",
        "version",
        "deployment_id",
        "container_id"
    ],
    fields: {
        status: "integer",
        uptime: "integer",
        restart_count: "integer",
        health_score: "float",
        response_time: "float",
        error_rate: "float",
        circuit_breaker_state: "integer",
        dependency_health: "float"
    }
}

// API Metrics
api_metrics = {
    measurement: "api",
    tags: [
        "endpoint",
        "method",
        "service",
        "status_code",
        "api_version",
        "client_id"
    ],
    fields: {
        request_count: "integer",
        response_time: "float",
        error_count: "integer",
        request_size: "float",
        response_size: "float",
        rate_limit_remaining: "integer",
        latency_p50: "float",
        latency_p95: "float",
        latency_p99: "float",
        timeout_count: "integer"
    }
}

// Database Metrics
database_metrics = {
    measurement: "database",
    tags: [
        "db_type",
        "instance",
        "database_name",
        "pool_name",
        "operation"
    ],
    fields: {
        connection_count: "integer",
        active_connections: "integer",
        idle_connections: "integer",
        query_time: "float",
        query_count: "integer",
        slow_query_count: "integer",
        lock_wait_time: "float",
        replication_lag: "float",
        transaction_rate: "float",
        deadlock_count: "integer",
        cache_hit_ratio: "float"
    }
}

// Cache Metrics
cache_metrics = {
    measurement: "cache",
    tags: [
        "cache_type",
        "instance",
        "cache_name",
        "operation"
    ],
    fields: {
        hit_rate: "float",
        miss_rate: "float",
        eviction_count: "integer",
        memory_usage: "float",
        key_count: "integer",
        get_latency: "float",
        set_latency: "float",
        connection_count: "integer",
        command_rate: "float",
        expired_keys: "integer"
    }
}

// Container Metrics
container_metrics = {
    measurement: "container",
    tags: [
        "container_name",
        "pod_name",
        "namespace",
        "node",
        "image",
        "deployment"
    ],
    fields: {
        cpu_usage: "float",
        memory_usage: "float",
        memory_limit: "float",
        network_rx_bytes: "float",
        network_tx_bytes: "float",
        disk_read_bytes: "float",
        disk_write_bytes: "float",
        restart_count: "integer",
        oom_kill_count: "integer",
        cpu_throttled_time: "float"
    }
}

// Queue Metrics
queue_metrics = {
    measurement: "queue",
    tags: [
        "queue_name",
        "queue_type",
        "consumer_group",
        "priority"
    ],
    fields: {
        queue_size: "integer",
        messages_published: "integer",
        messages_consumed: "integer",
        processing_time: "float",
        error_count: "integer",
        dlq_count: "integer",
        consumer_lag: "integer",
        oldest_message_age: "float"
    }
}

// Load Balancer Metrics
load_balancer_metrics = {
    measurement: "load_balancer",
    tags: [
        "lb_name",
        "region",
        "target_group",
        "availability_zone"
    ],
    fields: {
        active_connections: "integer",
        new_connections: "integer",
        processed_bytes: "float",
        healthy_hosts: "integer",
        unhealthy_hosts: "integer",
        response_time: "float",
        error_rate: "float"
    }
}

// Kubernetes Metrics
kubernetes_metrics = {
    measurement: "kubernetes",
    tags: [
        "cluster",
        "namespace",
        "workload_type",
        "workload_name"
    ],
    fields: {
        pod_count: "integer",
        ready_pods: "integer",
        pending_pods: "integer",
        failed_pods: "integer",
        node_count: "integer",
        cpu_request: "float",
        cpu_limit: "float",
        memory_request: "float",
        memory_limit: "float"
    }
}

// SLO Tracking
slo_metrics = {
    measurement: "slo",
    tags: [
        "service",
        "slo_name",
        "slo_type",
        "customer_tier"
    ],
    fields: {
        availability: "float",
        latency_budget_remaining: "float",
        error_budget_remaining: "float",
        sli_value: "float",
        slo_target: "float",
        burn_rate: "float",
        violations: "integer"
    }
}

// Infrastructure Cost Metrics
cost_metrics = {
    measurement: "infrastructure_cost",
    tags: [
        "service",
        "resource_type",
        "region",
        "cost_center"
    ],
    fields: {
        hourly_cost: "float",
        daily_cost: "float",
        projected_monthly_cost: "float",
        resource_utilization: "float",
        cost_per_request: "float"
    }
}

// Infrastructure Retention Policies
infrastructure_retention = {
    raw_data: "30d",
    hourly_aggregates: "90d",
    daily_aggregates: "1y",
    monthly_aggregates: "3y"
}

// Alert Configurations
alert_configs = {
    cpu_warning: 75.0,
    cpu_critical: 90.0,
    memory_warning: 70.0,
    memory_critical: 85.0,
    disk_warning: 75.0,
    disk_critical: 90.0,
    api_error_rate_warning: 1.0,
    api_error_rate_critical: 5.0,
    api_latency_p99_warning: 500.0,
    api_latency_p99_critical: 1000.0,
    database_slow_query_warning: 500.0,
    database_slow_query_critical: 1000.0,
    cache_hit_rate_warning: 85.0,
    cache_hit_rate_critical: 80.0,
    container_restart_warning: 3,
    container_restart_critical: 5,
    slo_burn_rate_warning: 1.5,
    slo_burn_rate_critical: 3.0
}

// Monitoring Dashboards
dashboards = {
    system_overview: {
        widgets: ["cpu_usage", "memory_usage", "disk_usage", "network_traffic"],
        refresh_interval: "30s"
    },
    api_performance: {
        widgets: ["request_rate", "error_rate", "latency_percentiles", "top_endpoints"],
        refresh_interval: "10s"
    },
    database_health: {
        widgets: ["connection_pool", "query_performance", "replication_lag", "lock_waits"],
        refresh_interval: "60s"
    },
    kubernetes_cluster: {
        widgets: ["pod_status", "node_resources", "deployment_health", "namespace_quotas"],
        refresh_interval: "30s"
    },
    slo_compliance: {
        widgets: ["availability_slo", "latency_slo", "error_budget", "burn_rate"],
        refresh_interval: "60s"
    },
    cost_optimization: {
        widgets: ["daily_spend", "resource_efficiency", "cost_trends", "waste_detection"],
        refresh_interval: "300s"
    }
}

// Aggregation Queries
from(bucket: "infrastructure_metrics")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement =~ /system|health|api|database|cache|container|queue|kubernetes|slo/)
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "infrastructure_metrics_hourly", org: "tickettoken")

// SLO Calculations
slo_availability = from(bucket: "infrastructure_metrics")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "api" and r._field == "error_count")
  |> window(every: 1d)
  |> reduce(
      fn: (r, accumulator) => ({
          total: accumulator.total + r.request_count,
          errors: accumulator.errors + r.error_count,
          availability: (accumulator.total - accumulator.errors) / accumulator.total * 100
      }),
      identity: {total: 0, errors: 0, availability: 100.0}
  )

// Critical Alert Rules
critical_alerts = {
    service_down: "service_health.status == 0",
    high_error_rate: "api_metrics.error_rate > 5.0",
    database_lag: "database_metrics.replication_lag > 10000",
    slo_violation: "slo_metrics.error_budget_remaining < 0",
    cost_overrun: "cost_metrics.projected_monthly_cost > budget * 1.2"
}
