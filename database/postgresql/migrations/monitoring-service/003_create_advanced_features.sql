-- Migration: Add Advanced Features Tables
-- Created: 2025-11-18
-- Description: Creates tables for dashboards, reports, webhooks, and WebSocket subscriptions

-- Dashboards Table
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  layout VARCHAR(20) NOT NULL DEFAULT 'grid',
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN DEFAULT false,
  shared_with UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboards_user_id ON dashboards(user_id);
CREATE INDEX idx_dashboards_is_public ON dashboards(is_public);
CREATE INDEX idx_dashboards_shared_with ON dashboards USING GIN(shared_with);
CREATE INDEX idx_dashboards_updated_at ON dashboards(updated_at DESC);

-- Dashboard Widgets Table (for easier querying)
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  metric VARCHAR(255) NOT NULL,
  position JSONB NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_widgets_dashboard_id ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_metric ON dashboard_widgets(metric);

-- Reports Table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_id VARCHAR(100),
  schedule_cron VARCHAR(100),
  recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  format VARCHAR(20) DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'json', 'html')),
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT true,
  last_generated TIMESTAMPTZ,
  next_generation TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_enabled ON reports(enabled);
CREATE INDEX idx_reports_next_generation ON reports(next_generation) WHERE enabled = true;
CREATE INDEX idx_reports_created_by ON reports(created_by);

-- Report History Table
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  format VARCHAR(20) NOT NULL,
  file_path TEXT,
  file_size BIGINT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generation_duration_ms INTEGER,
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_report_history_report_id ON report_history(report_id);
CREATE INDEX idx_report_history_generated_at ON report_history(generated_at DESC);
CREATE INDEX idx_report_history_status ON report_history(status);

-- Webhooks Table
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(10) DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH')),
  events TEXT[] NOT NULL,
  secret VARCHAR(255),
  headers JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 10000,
  last_triggered TIMESTAMPTZ,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);
CREATE INDEX idx_webhooks_created_by ON webhooks(created_by);

-- Webhook Delivery Log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempt_number INTEGER DEFAULT 1,
  duration_ms INTEGER,
  error_message TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_delivered_at ON webhook_deliveries(delivered_at DESC);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);

-- WebSocket Subscriptions (ephemeral, for tracking)
CREATE TABLE IF NOT EXISTS ws_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id VARCHAR(255) NOT NULL,
  user_id UUID,
  metric_name VARCHAR(255) NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ws_subscriptions_connection_id ON ws_subscriptions(connection_id);
CREATE INDEX idx_ws_subscriptions_metric_name ON ws_subscriptions(metric_name);
CREATE INDEX idx_ws_subscriptions_user_id ON ws_subscriptions(user_id);
-- Auto-cleanup old subscriptions (> 1 hour inactive)
CREATE INDEX idx_ws_subscriptions_last_activity ON ws_subscriptions(last_activity) 
  WHERE last_activity < NOW() - INTERVAL '1 hour';

-- External Integrations Configuration
CREATE TABLE IF NOT EXISTS external_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('datadog', 'newrelic', 'grafana', 'prometheus', 'custom')),
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  api_key_encrypted TEXT,
  enabled BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, name)
);

CREATE INDEX idx_external_integrations_type ON external_integrations(type);
CREATE INDEX idx_external_integrations_enabled ON external_integrations(enabled);

-- Dashboard Templates (predefined)
CREATE TABLE IF NOT EXISTS dashboard_templates (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  layout VARCHAR(20) NOT NULL DEFAULT 'grid',
  widgets JSONB NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_templates_category ON dashboard_templates(category);
CREATE INDEX idx_dashboard_templates_tags ON dashboard_templates USING GIN(tags);
CREATE INDEX idx_dashboard_templates_usage ON dashboard_templates(usage_count DESC);

-- Insert default templates
INSERT INTO dashboard_templates (id, name, description, category, widgets, tags, is_system) VALUES
('system-overview', 'System Overview', 'Monitor overall system health and performance', 'system', 
  '[
    {"id":"w1","type":"gauge","title":"CPU Usage","metric":"system_cpu_usage_percent","position":{"x":0,"y":0,"w":3,"h":4},"config":{"threshold":80,"criticalThreshold":90}},
    {"id":"w2","type":"gauge","title":"Memory Usage","metric":"system_memory_usage_percent","position":{"x":3,"y":0,"w":3,"h":4},"config":{"threshold":80,"criticalThreshold":90}},
    {"id":"w3","type":"line_chart","title":"Request Rate","metric":"http_requests_total","position":{"x":0,"y":4,"w":6,"h":4},"config":{"timeRange":"1h","refreshInterval":10000}}
  ]'::jsonb,
  ARRAY['system', 'health', 'performance'], true),
  
('payment-monitoring', 'Payment Monitoring', 'Track payment metrics and success rates', 'business',
  '[
    {"id":"w1","type":"number","title":"Success Rate","metric":"payment_success_rate","position":{"x":0,"y":0,"w":3,"h":2},"config":{"unit":"%","decimals":2}},
    {"id":"w2","type":"line_chart","title":"Payment Volume","metric":"payment_success_total","position":{"x":0,"y":2,"w":6,"h":4},"config":{"timeRange":"24h"}},
    {"id":"w3","type":"table","title":"Recent Failures","metric":"payment_failure_total","position":{"x":6,"y":0,"w":6,"h":6},"config":{"limit":10}}
  ]'::jsonb,
  ARRAY['payment', 'business', 'revenue'], true),

('service-health', 'Service Health Dashboard', 'Monitor all microservices health status', 'infrastructure',
  '[
    {"id":"w1","type":"heatmap","title":"Service Status","metric":"service_health_status","position":{"x":0,"y":0,"w":12,"h":6},"config":{"services":"all"}},
    {"id":"w2","type":"table","title":"Recent Incidents","metric":"alerts_fired","position":{"x":0,"y":6,"w":12,"h":4},"config":{"limit":20}}
  ]'::jsonb,
  ARRAY['infrastructure', 'health', 'services'], true)
ON CONFLICT (id) DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers
CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON dashboards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_integrations_updated_at BEFORE UPDATE ON external_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_templates_updated_at BEFORE UPDATE ON dashboard_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function for old WebSocket subscriptions
CREATE OR REPLACE FUNCTION cleanup_old_ws_subscriptions()
RETURNS void AS $$
BEGIN
  DELETE FROM ws_subscriptions 
  WHERE last_activity < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE dashboards IS 'User-created monitoring dashboards with custom widgets';
COMMENT ON TABLE reports IS 'Scheduled and on-demand report configurations';
COMMENT ON TABLE webhooks IS 'Outgoing webhook configurations for external integrations';
COMMENT ON TABLE ws_subscriptions IS 'Active WebSocket metric subscriptions (ephemeral)';
COMMENT ON TABLE external_integrations IS 'External monitoring tool integrations';
COMMENT ON TABLE dashboard_templates IS 'Predefined dashboard templates for quick setup';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO monitoring_service;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO monitoring_service;
