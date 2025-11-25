-- Migration: 004_add_monitoring_tables.sql
-- Description: Add monitoring and SLA tracking tables
-- Safe: Only creates new tables in monitoring schema

BEGIN;

-- SLA metrics tracking
CREATE TABLE monitoring.sla_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) CHECK (metric_type IN ('uptime', 'response_time', 'error_rate', 'throughput', 'availability')),
    service_name VARCHAR(100) NOT NULL,
    measured_value DECIMAL(10,4) NOT NULL,
    sla_target DECIMAL(10,4) NOT NULL,
    compliance BOOLEAN GENERATED ALWAYS AS (measured_value >= sla_target) STORED,
    measurement_period TSTZRANGE NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sla_metrics_period ON monitoring.sla_metrics USING gist(measurement_period);
CREATE INDEX idx_sla_metrics_type_service ON monitoring.sla_metrics(metric_type, service_name);
CREATE INDEX idx_sla_metrics_compliance ON monitoring.sla_metrics(compliance) WHERE compliance = false;

-- System health checks
CREATE TABLE monitoring.health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    check_type VARCHAR(50) CHECK (check_type IN ('database', 'api', 'redis', 'elasticsearch', 'payment_gateway', 'blockchain')),
    status VARCHAR(20) CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    response_time_ms INTEGER,
    details JSONB,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_checks_service_time ON monitoring.health_checks(service_name, checked_at DESC);
CREATE INDEX idx_health_checks_status ON monitoring.health_checks(status) WHERE status != 'healthy';

-- Performance metrics
CREATE TABLE monitoring.performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(200) NOT NULL,
    metric_value DECIMAL(20,4) NOT NULL,
    metric_unit VARCHAR(50),
    tags JSONB,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_perf_metrics_name_time ON monitoring.performance_metrics(metric_name, recorded_at DESC);
CREATE INDEX idx_perf_metrics_tags ON monitoring.performance_metrics USING gin(tags);

-- Alert history
CREATE TABLE monitoring.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    affected_service VARCHAR(100),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
    metadata JSONB,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX idx_alerts_status ON monitoring.alerts(status) WHERE status IN ('open', 'acknowledged');
CREATE INDEX idx_alerts_severity_time ON monitoring.alerts(severity, triggered_at DESC);
CREATE INDEX idx_alerts_service ON monitoring.alerts(affected_service);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA monitoring TO tickettoken;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA monitoring TO tickettoken;

COMMIT;
