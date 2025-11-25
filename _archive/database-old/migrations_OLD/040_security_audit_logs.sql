-- Security Audit Logs Table
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  tenant_id UUID REFERENCES venues(id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON security_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON security_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON security_audit_logs(severity) WHERE severity IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_audit_ip_address ON security_audit_logs(ip_address);

-- Failed login attempts tracking
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  attempt_count INTEGER DEFAULT 1,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_failed_login_email_ip ON failed_login_attempts(email, ip_address);

-- Rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  violation_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_violations(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_violations(window_start);

-- Security alerts
CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  metadata JSONB,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_unresolved ON security_alerts(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
