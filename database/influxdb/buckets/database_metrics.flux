// Database Metrics Bucket Configuration
// Purpose: Track database performance, query patterns, and resource utilization
// Retention: 30 days for detailed data, aggregated for long-term

// Bucket Definition
bucket = "database_metrics"
org = "tickettoken"
retention = "30d"
description = "Comprehensive database monitoring with slow query analysis and maintenance tracking"

// Query Performance Metrics
query_metrics = {
    measurement: "db_queries",
    tags: [
        "database",
        "query_type",
        "table_name",
        "operation",
        "status",
        "user",
        "application",
        "query_hash"
    ],
    fields: {
        query_count: "integer",
        execution_time: "float",
        rows_affected: "integer",
        rows_returned: "integer",
        query_cost: "float",
        lock_wait_time: "float",
        temp_space_used: "float",
        cpu_time: "float",
        io_time: "float"
    }
}

// Connection Pool Metrics
connection_metrics = {
    measurement: "db_connections",
    tags: [
        "database",
        "pool_name",
        "connection_state",
        "host",
        "application",
        "ssl_enabled",
        "pooler_mode"
    ],
    fields: {
        total_connections: "integer",
        active_connections: "integer",
        idle_connections: "integer",
        waiting_connections: "integer",
        connection_errors: "integer",
        connection_time: "float",
        max_lifetime_reached: "integer",
        connection_resets: "integer",
        auth_failures: "integer"
    }
}

// Storage Metrics
storage_metrics = {
    measurement: "db_storage",
    tags: [
        "database",
        "table_name",
        "storage_type",
        "tablespace",
        "partition",
        "compression_type"
    ],
    fields: {
        table_size: "float",
        index_size: "float",
        total_size: "float",
        row_count: "integer",
        dead_tuples: "integer",
        bloat_ratio: "float",
        last_vacuum: "integer",
        last_analyze: "integer",
        autovacuum_count: "integer",
        pages_read: "integer",
        pages_written: "integer"
    }
}

// Transaction Metrics
transaction_metrics = {
    measurement: "db_transactions",
    tags: [
        "database",
        "transaction_type",
        "isolation_level",
        "application",
        "status",
        "transaction_state"
    ],
    fields: {
        transaction_count: "integer",
        commit_count: "integer",
        rollback_count: "integer",
        deadlock_count: "integer",
        avg_duration: "float",
        max_duration: "float",
        locks_held: "integer",
        savepoint_count: "integer",
        wal_records: "integer",
        wal_bytes: "integer"
    }
}

// Replication Metrics
replication_metrics = {
    measurement: "db_replication",
    tags: [
        "primary_host",
        "replica_host",
        "replication_type",
        "channel",
        "status",
        "sync_state"
    ],
    fields: {
        replication_lag: "float",
        lag_bytes: "integer",
        write_lag: "float",
        flush_lag: "float",
        replay_lag: "float",
        sent_location: "integer",
        write_location: "integer",
        flush_location: "integer",
        replay_location: "integer",
        sync_priority: "integer",
        replica_delay: "float"
    }
}

// Cache Performance
cache_metrics = {
    measurement: "db_cache",
    tags: [
        "database",
        "cache_type",
        "object_type",
        "cache_level"
    ],
    fields: {
        cache_hits: "integer",
        cache_misses: "integer",
        hit_ratio: "float",
        cache_size: "float",
        evictions: "integer",
        reads_from_disk: "integer",
        dirty_pages: "integer",
        checkpoint_buffers: "integer",
        backend_buffers: "integer"
    }
}

// Index Performance
index_metrics = {
    measurement: "db_indexes",
    tags: [
        "database",
        "table_name",
        "index_name",
        "index_type",
        "index_method"
    ],
    fields: {
        index_scans: "integer",
        index_reads: "integer",
        index_hits: "float",
        unused_indexes: "integer",
        duplicate_indexes: "integer",
        index_bloat: "float",
        maintenance_time: "float",
        index_size: "float",
        fragmentation: "float"
    }
}

// Lock Monitoring
lock_metrics = {
    measurement: "db_locks",
    tags: [
        "database",
        "lock_type",
        "lock_mode",
        "table_name",
        "blocking_pid",
        "wait_event_type"
    ],
    fields: {
        lock_count: "integer",
        lock_duration: "float",
        blocked_queries: "integer",
        deadlock_count: "integer",
        lock_timeout_count: "integer",
        exclusive_locks: "integer",
        shared_locks: "integer",
        advisory_locks: "integer",
        wait_events: "integer"
    }
}

// Slow Query Analysis
slow_query_metrics = {
    measurement: "db_slow_queries",
    tags: [
        "database",
        "query_type",
        "table_names",
        "user",
        "application",
        "optimization_hint"
    ],
    fields: {
        execution_time: "float",
        total_time: "float",
        calls: "integer",
        mean_time: "float",
        min_time: "float",
        max_time: "float",
        stddev_time: "float",
        rows_per_call: "float",
        buffer_hit_percentage: "float",
        temp_files_created: "integer",
        temp_bytes_written: "integer"
    }
}

// Maintenance Operations
maintenance_metrics = {
    measurement: "db_maintenance",
    tags: [
        "database",
        "operation_type",
        "table_name",
        "maintenance_reason",
        "initiated_by"
    ],
    fields: {
        operation_duration: "float",
        rows_processed: "integer",
        pages_processed: "integer",
        dead_tuples_removed: "integer",
        space_reclaimed: "float",
        index_rebuild_count: "integer",
        statistics_updated: "boolean",
        maintenance_cost: "float"
    }
}

// Backup Metrics
backup_metrics = {
    measurement: "db_backups",
    tags: [
        "database",
        "backup_type",
        "backup_method",
        "destination",
        "status"
    ],
    fields: {
        backup_size: "float",
        backup_duration: "float",
        compression_ratio: "float",
        tables_backed_up: "integer",
        backup_throughput: "float",
        wal_files_archived: "integer",
        last_successful_backup: "integer",
        recovery_time_estimate: "float"
    }
}

// Resource Utilization
resource_metrics = {
    measurement: "db_resources",
    tags: [
        "database",
        "resource_type",
        "resource_pool"
    ],
    fields: {
        cpu_usage: "float",
        memory_usage: "float",
        disk_io_read: "float",
        disk_io_write: "float",
        network_bytes_sent: "float",
        network_bytes_received: "float",
        temp_file_usage: "float",
        work_mem_usage: "float"
    }
}

// Database Retention Policies
database_retention = {
    raw_data: "30d",
    minute_aggregates: "90d",
    hourly_aggregates: "1y",
    daily_aggregates: "3y",
    slow_queries: "90d"
}

// Performance Thresholds
db_thresholds = {
    max_query_time: 5000.0,          // milliseconds
    max_connection_wait: 1000.0,     // milliseconds
    max_replication_lag: 1000.0,     // milliseconds
    min_cache_hit_ratio: 90.0,       // percentage
    max_lock_duration: 5000.0,       // milliseconds
    max_deadlock_rate: 0.1,          // per minute
    slow_query_threshold: 1000.0,    // milliseconds
    max_bloat_ratio: 20.0,           // percentage
    min_backup_frequency: 86400      // seconds (24 hours)
}

// Optimization Recommendations
optimization_rules = {
    missing_index: "seq_scan_count > 1000 AND index_scan_count < 100",
    table_bloat: "bloat_ratio > 20",
    connection_exhaustion: "waiting_connections > 10",
    cache_inefficiency: "hit_ratio < 90",
    replication_lag: "replication_lag > 5000",
    long_running_transaction: "max_duration > 3600000"
}

// Alert Rules
database_alerts = {
    slow_query_spike: "execution_time > 5000",
    connection_pool_exhausted: "waiting_connections > 20",
    replication_failure: "status != 'streaming'",
    storage_critical: "disk_usage > 90",
    deadlock_detected: "deadlock_count > 0",
    backup_overdue: "time() - last_successful_backup > 172800"
}

// Analytics Dashboards
database_dashboards = {
    performance_overview: {
        widgets: ["query_performance", "connection_pool", "cache_efficiency", "replication_status"],
        refresh_interval: "30s"
    },
    slow_query_analysis: {
        widgets: ["top_slow_queries", "query_patterns", "optimization_hints", "historical_trends"],
        refresh_interval: "300s"
    },
    maintenance_tracking: {
        widgets: ["vacuum_status", "index_maintenance", "bloat_analysis", "backup_status"],
        refresh_interval: "900s"
    },
    resource_utilization: {
        widgets: ["cpu_usage", "memory_consumption", "disk_io", "network_traffic"],
        refresh_interval: "60s"
    },
    replication_monitoring: {
        widgets: ["lag_tracking", "sync_status", "wal_statistics", "replica_health"],
        refresh_interval: "60s"
    }
}

// Aggregation Queries
from(bucket: "database_metrics")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement =~ /db_queries|db_connections|db_transactions|db_slow_queries/)
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
  |> to(bucket: "database_metrics_5min", org: "tickettoken")

// Query Pattern Analysis
query_patterns = from(bucket: "database_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "db_queries")
  |> group(columns: ["query_hash"])
  |> reduce(
      fn: (r, accumulator) => ({
          count: accumulator.count + 1,
          total_time: accumulator.total_time + r.execution_time,
          avg_time: accumulator.total_time / accumulator.count
      }),
      identity: {count: 0, total_time: 0.0, avg_time: 0.0}
  )
