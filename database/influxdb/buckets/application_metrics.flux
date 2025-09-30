// Application Metrics Bucket Configuration
// Purpose: Track application performance, errors, and health metrics
// Retention: 30 days for raw data, downsampled for longer retention

// Bucket Definition
bucket = "application_metrics"
org = "tickettoken"
retention = "30d"
description = "Core application performance and health metrics"

// API Performance Metrics
api_performance = {
    measurement: "api_performance",
    tags: [
        "service",
        "endpoint", 
        "method",
        "status_code",
        "environment",
        "version",
        "region",
        "client_type"
    ],
    fields: {
        response_time: "float",
        request_count: "integer",
        request_size: "integer",
        response_size: "integer",
        error_count: "integer",
        latency_p50: "float",
        latency_p95: "float",
        latency_p99: "float",
        throughput: "float"
    }
}

// Application Health Metrics
application_health = {
    measurement: "application_health",
    tags: [
        "service",
        "instance",
        "environment",
        "container_id",
        "host",
        "datacenter",
        "cluster"
    ],
    fields: {
        cpu_usage: "float",
        memory_usage: "float",
        memory_allocated: "integer",
        uptime: "integer",
        goroutines: "integer",
        open_connections: "integer",
        active_requests: "integer",
        heap_objects: "integer",
        gc_pause_ns: "integer"
    }
}

// Error Tracking
error_tracking = {
    measurement: "errors",
    tags: [
        "service",
        "error_type",
        "severity",
        "endpoint",
        "environment",
        "version",
        "user_segment"
    ],
    fields: {
        count: "integer",
        error_message: "string",
        stack_trace_hash: "string",
        affected_users: "integer",
        error_rate: "float",
        recovery_time: "float"
    }
}

// Database Performance
database_performance = {
    measurement: "database_performance",
    tags: [
        "database",
        "operation",
        "table",
        "connection_pool",
        "environment",
        "shard",
        "replica"
    ],
    fields: {
        query_time: "float",
        rows_affected: "integer",
        connection_wait_time: "float",
        active_connections: "integer",
        idle_connections: "integer",
        failed_queries: "integer",
        deadlocks: "integer",
        transaction_time: "float"
    }
}

// Cache Performance
cache_performance = {
    measurement: "cache_performance", 
    tags: [
        "cache_type",
        "operation",
        "cache_name",
        "environment",
        "node"
    ],
    fields: {
        hit_count: "integer",
        miss_count: "integer",
        hit_rate: "float",
        eviction_count: "integer",
        size_bytes: "integer",
        latency: "float",
        items_count: "integer",
        memory_usage: "float"
    }
}

// Message Queue Metrics
message_queue = {
    measurement: "message_queue",
    tags: [
        "queue_name",
        "operation",
        "environment",
        "consumer_group",
        "partition"
    ],
    fields: {
        messages_published: "integer",
        messages_consumed: "integer", 
        queue_depth: "integer",
        processing_time: "float",
        failed_messages: "integer",
        dlq_messages: "integer",
        lag: "integer",
        throughput: "float"
    }
}

// Blockchain Metrics
blockchain_metrics = {
    measurement: "blockchain_metrics",
    tags: [
        "chain",
        "network",
        "contract",
        "method",
        "status",
        "environment"
    ],
    fields: {
        gas_used: "integer",
        gas_price: "float",
        transaction_time: "float",
        block_confirmations: "integer",
        transaction_fee: "float",
        retry_attempts: "integer",
        nonce: "integer",
        block_height: "integer"
    }
}

// External Service Metrics
external_services = {
    measurement: "external_services",
    tags: [
        "service_name",
        "endpoint",
        "method",
        "environment",
        "provider"
    ],
    fields: {
        response_time: "float",
        availability: "float",
        error_rate: "float",
        timeout_count: "integer",
        circuit_breaker_open: "boolean",
        rate_limit_remaining: "integer",
        retry_count: "integer"
    }
}

// Feature Flag Metrics
feature_flags = {
    measurement: "feature_flags",
    tags: [
        "flag_name",
        "variant",
        "user_segment",
        "environment"
    ],
    fields: {
        evaluations: "integer",
        enabled_count: "integer",
        disabled_count: "integer",
        error_count: "integer",
        conversion_rate: "float"
    }
}

// WebSocket Metrics
websocket_metrics = {
    measurement: "websocket_metrics",
    tags: [
        "service",
        "room",
        "event_type",
        "environment"
    ],
    fields: {
        active_connections: "integer",
        messages_sent: "integer",
        messages_received: "integer",
        bytes_sent: "integer",
        bytes_received: "integer",
        disconnections: "integer",
        reconnections: "integer"
    }
}

// Background Job Metrics
background_jobs = {
    measurement: "background_jobs",
    tags: [
        "job_type",
        "queue",
        "status",
        "environment"
    ],
    fields: {
        execution_time: "float",
        success_count: "integer",
        failure_count: "integer",
        retry_count: "integer",
        queue_wait_time: "float",
        memory_usage: "float"
    }
}

// Security Metrics
security_metrics = {
    measurement: "security_metrics",
    tags: [
        "event_type",
        "severity",
        "source",
        "environment"
    ],
    fields: {
        failed_auth_attempts: "integer",
        blocked_requests: "integer",
        suspicious_activities: "integer",
        rate_limit_violations: "integer",
        jwt_validation_failures: "integer"
    }
}

// Retention Policies
retention_policies = [
    {
        name: "raw",
        duration: "7d",
        replication: 1,
        shardGroupDuration: "1h",
        default: true
    },
    {
        name: "downsampled_5m",
        duration: "30d",
        replication: 1,
        shardGroupDuration: "1d"
    },
    {
        name: "downsampled_1h",
        duration: "90d",
        replication: 1,
        shardGroupDuration: "7d"
    },
    {
        name: "downsampled_1d",
        duration: "365d",
        replication: 1,
        shardGroupDuration: "30d"
    }
]

// Continuous Queries for Downsampling
continuous_queries = [
    {
        name: "cq_api_performance_5m",
        interval: "5m",
        query: '''
            CREATE CONTINUOUS QUERY cq_api_performance_5m ON application_metrics
            BEGIN
                SELECT 
                    mean("response_time") as response_time_avg,
                    percentile("response_time", 95) as response_time_p95,
                    sum("request_count") as request_count_total,
                    sum("error_count") as error_count_total,
                    mean("throughput") as throughput_avg
                INTO application_metrics.downsampled_5m.api_performance
                FROM application_metrics.raw.api_performance
                GROUP BY time(5m), *
            END
        '''
    },
    {
        name: "cq_blockchain_metrics_1h",
        interval: "1h", 
        query: '''
            CREATE CONTINUOUS QUERY cq_blockchain_metrics_1h ON application_metrics
            BEGIN
                SELECT 
                    mean("gas_used") as gas_used_avg,
                    sum("transaction_fee") as transaction_fee_total,
                    count("transaction_time") as transaction_count,
                    mean("block_confirmations") as confirmations_avg
                INTO application_metrics.downsampled_1h.blockchain_metrics
                FROM application_metrics.raw.blockchain_metrics
                GROUP BY time(1h), *
            END
        '''
    }
]

// Alert Rules
alert_rules = [
    {
        name: "high_error_rate",
        query: '''
            SELECT mean("error_rate") 
            FROM api_performance 
            WHERE time > now() - 5m 
            GROUP BY service
        ''',
        condition: "value > 0.05",
        message: "Error rate exceeds 5% for service {service}"
    },
    {
        name: "high_response_time",
        query: '''
            SELECT mean("response_time") 
            FROM api_performance 
            WHERE time > now() - 5m 
            GROUP BY endpoint
        ''',
        condition: "value > 1000",
        message: "Response time exceeds 1s for endpoint {endpoint}"
    },
    {
        name: "blockchain_failures",
        query: '''
            SELECT sum("retry_attempts") 
            FROM blockchain_metrics 
            WHERE status = 'failed' AND time > now() - 10m
        ''',
        condition: "value > 10",
        message: "Blockchain transaction failures exceeding threshold"
    }
]

// Sample Queries
sample_queries = {
    api_performance_dashboard: '''
        SELECT 
            mean("response_time") as avg_response_time,
            sum("request_count") as total_requests,
            sum("error_count") / sum("request_count") * 100 as error_rate
        FROM api_performance
        WHERE time > now() - 1h
        GROUP BY time(1m), service, endpoint
    ''',
    
    system_health_overview: '''
        SELECT 
            mean("cpu_usage") as cpu,
            mean("memory_usage") as memory,
            mean("active_requests") as active_requests
        FROM application_health
        WHERE time > now() - 30m
        GROUP BY time(1m), service
    ''',
    
    blockchain_costs: '''
        SELECT 
            sum("gas_used") * mean("gas_price") as total_gas_cost,
            sum("transaction_fee") as total_fees,
            count("transaction_time") as transaction_count
        FROM blockchain_metrics
        WHERE time > now() - 24h
        GROUP BY time(1h), chain
    '''
}
