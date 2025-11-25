import { Registry, Counter, Histogram, Gauge, Metric } from 'prom-client';

export const securityMetrics = {
  // Authentication metrics
  loginAttempts: new Counter({
    name: 'auth_login_attempts_total',
    help: 'Total number of login attempts',
    labelNames: ['status', 'method'],
  }),
  failedLogins: new Counter({
    name: 'auth_failed_logins_total',
    help: 'Total number of failed login attempts',
    labelNames: ['reason'],
  }),
  accountLockouts: new Counter({
    name: 'auth_account_lockouts_total',
    help: 'Total number of account lockouts',
  }),
  // Rate limiting metrics
  rateLimitHits: new Counter({
    name: 'rate_limit_hits_total',
    help: 'Total number of rate limit hits',
    labelNames: ['endpoint', 'type'],
  }),
  // Security violations
  sqlInjectionAttempts: new Counter({
    name: 'security_sql_injection_attempts_total',
    help: 'Total SQL injection attempts detected',
  }),
  xssAttempts: new Counter({
    name: 'security_xss_attempts_total',
    help: 'Total XSS attempts detected',
  }),
  suspiciousRequests: new Counter({
    name: 'security_suspicious_requests_total',
    help: 'Total suspicious requests detected',
    labelNames: ['type'],
  }),
  // API Security
  apiRequestDuration: new Histogram({
    name: 'api_request_duration_seconds',
    help: 'API request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5],
  }),
  activeConnections: new Gauge({
    name: 'api_active_connections',
    help: 'Number of active connections',
  }),
  // Audit metrics
  auditLogEntries: new Counter({
    name: 'audit_log_entries_total',
    help: 'Total audit log entries',
    labelNames: ['severity', 'action'],
  }),
  // Payment security
  fraudulentPayments: new Counter({
    name: 'payment_fraudulent_attempts_total',
    help: 'Total fraudulent payment attempts detected',
  }),
  // System security
  blockedIPs: new Gauge({
    name: 'security_blocked_ips_total',
    help: 'Total number of blocked IP addresses',
  }),
};

// Export all metrics for Prometheus
export function registerSecurityMetrics(register: Registry) {
  Object.values(securityMetrics).forEach((metric) => {
    // Cast to any to bypass the type checking issue with different label types
    register.registerMetric(metric as any);
  });
}
