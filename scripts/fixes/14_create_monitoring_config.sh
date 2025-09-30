#!/bin/bash
# Create monitoring configuration files

set -euo pipefail

echo "Creating monitoring configuration files..."

# Create monitoring directory structure
mkdir -p monitoring/prometheus
mkdir -p monitoring/grafana/dashboards
mkdir -p monitoring/alerts

# Create Prometheus configuration
cat > monitoring/prometheus.yml << 'YAML'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

scrape_configs:
  # PostgreSQL exporter
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: postgres-exporter:9187

  # Redis exporter
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Node exporter
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
YAML

# Create Grafana dashboard
cat > monitoring/grafana/dashboards/database-overview.json << 'JSON'
{
  "dashboard": {
    "title": "TicketToken Database Overview",
    "panels": [
      {
        "title": "Database Connections",
        "targets": [
          {
            "expr": "postgresql_connections_active{job='postgres'}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "title": "Query Performance",
        "targets": [
          {
            "expr": "rate(postgresql_queries_total[5m])"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      },
      {
        "title": "Cache Hit Rate",
        "targets": [
          {
            "expr": "redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
      },
      {
        "title": "Disk Usage",
        "targets": [
          {
            "expr": "node_filesystem_avail_bytes{mountpoint='/'} / node_filesystem_size_bytes{mountpoint='/'} * 100"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
      }
    ]
  }
}
JSON

# Create alerting rules
cat > monitoring/alerts.yml << 'YAML'
groups:
  - name: database_alerts
    interval: 30s
    rules:
      - alert: HighConnectionCount
        expr: postgresql_connections_active > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High database connection count"
          description: "{{ $labels.instance }} has {{ $value }} active connections"

      - alert: SlowQueries
        expr: rate(postgresql_slow_queries_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many slow queries"
          description: "{{ $labels.instance }} has {{ $value }} slow queries per second"

      - alert: LowCacheHitRate
        expr: redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low Redis cache hit rate"
          description: "Cache hit rate is {{ $value | humanize }}%"

      - alert: HighDiskUsage
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High disk usage"
          description: "{{ $labels.instance }} has only {{ $value | humanize }}% disk space left"
YAML

echo "Monitoring configuration files created successfully!"
