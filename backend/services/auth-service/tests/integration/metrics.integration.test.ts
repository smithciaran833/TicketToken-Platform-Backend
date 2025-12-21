import {
  register,
  loginAttemptsTotal,
  registrationTotal,
  tokenRefreshTotal,
  authDuration
} from '../../src/utils/metrics';

/**
 * INTEGRATION TESTS FOR METRICS
 * 
 * These tests use REAL Prometheus client:
 * - Real metric registration
 * - Real counter increments
 * - Real histogram observations
 * - No mocks
 */

describe('Metrics Integration Tests', () => {
  describe('register', () => {
    it('should export prom-client Registry instance', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
      expect(typeof register.clear).toBe('function');
    });

    it('should have getSingleMetric method', () => {
      expect(typeof register.getSingleMetric).toBe('function');
    });

    it('should return metrics string', async () => {
      const metrics = await register.metrics();
      
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('loginAttemptsTotal (Counter)', () => {
    it('should have name auth_login_attempts_total', () => {
      expect(loginAttemptsTotal.name).toBe('auth_login_attempts_total');
    });

    it('should have status label', async () => {
      loginAttemptsTotal.inc({ status: 'success' });
      
      const metrics = await register.metrics();
      expect(metrics).toContain('auth_login_attempts_total');
      expect(metrics).toContain('status="success"');
    });

    it('should be registered in register', () => {
      const metric = register.getSingleMetric('auth_login_attempts_total');
      expect(metric).toBeDefined();
    });

    it('should increment with .inc()', async () => {
      const before = await register.metrics();
      const beforeMatch = before.match(/auth_login_attempts_total\{status="test"\} (\d+)/);
      const beforeValue = beforeMatch ? parseInt(beforeMatch[1]) : 0;

      loginAttemptsTotal.inc({ status: 'test' });

      const after = await register.metrics();
      const afterMatch = after.match(/auth_login_attempts_total\{status="test"\} (\d+)/);
      const afterValue = afterMatch ? parseInt(afterMatch[1]) : 0;

      expect(afterValue).toBe(beforeValue + 1);
    });

    it('should support success and failure labels', async () => {
      loginAttemptsTotal.inc({ status: 'success' });
      loginAttemptsTotal.inc({ status: 'failure' });

      const metrics = await register.metrics();
      expect(metrics).toContain('status="success"');
      expect(metrics).toContain('status="failure"');
    });
  });

  describe('registrationTotal (Counter)', () => {
    it('should have name auth_registrations_total', () => {
      expect(registrationTotal.name).toBe('auth_registrations_total');
    });

    it('should have status label', async () => {
      registrationTotal.inc({ status: 'success' });
      
      const metrics = await register.metrics();
      expect(metrics).toContain('auth_registrations_total');
    });

    it('should be registered', () => {
      const metric = register.getSingleMetric('auth_registrations_total');
      expect(metric).toBeDefined();
    });

    it('should increment independently from login counter', async () => {
      loginAttemptsTotal.inc({ status: 'test1' });
      registrationTotal.inc({ status: 'test2' });

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_login_attempts_total');
      expect(metrics).toContain('auth_registrations_total');
    });
  });

  describe('tokenRefreshTotal (Counter)', () => {
    it('should have name auth_token_refresh_total', () => {
      expect(tokenRefreshTotal.name).toBe('auth_token_refresh_total');
    });

    it('should have status label', async () => {
      tokenRefreshTotal.inc({ status: 'success' });
      
      const metrics = await register.metrics();
      expect(metrics).toContain('auth_token_refresh_total');
    });

    it('should be registered', () => {
      const metric = register.getSingleMetric('auth_token_refresh_total');
      expect(metric).toBeDefined();
    });
  });

  describe('authDuration (Histogram)', () => {
    it('should have name auth_operation_duration_seconds', () => {
      expect(authDuration.name).toBe('auth_operation_duration_seconds');
    });

    it('should have operation label', async () => {
      authDuration.observe({ operation: 'login' }, 0.5);
      
      const metrics = await register.metrics();
      expect(metrics).toContain('auth_operation_duration_seconds');
      expect(metrics).toContain('operation="login"');
    });

    it('should observe duration with .observe()', async () => {
      authDuration.observe({ operation: 'test' }, 1.5);

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_operation_duration_seconds');
    });

    it('should be registered', () => {
      const metric = register.getSingleMetric('auth_operation_duration_seconds');
      expect(metric).toBeDefined();
    });

    it('should record sum and count', async () => {
      authDuration.observe({ operation: 'sum-test' }, 2.0);
      authDuration.observe({ operation: 'sum-test' }, 3.0);

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_operation_duration_seconds_sum');
      expect(metrics).toContain('auth_operation_duration_seconds_count');
    });

    it('should support different operation types', async () => {
      authDuration.observe({ operation: 'login' }, 0.1);
      authDuration.observe({ operation: 'register' }, 0.2);
      authDuration.observe({ operation: 'refresh' }, 0.05);

      const metrics = await register.metrics();
      expect(metrics).toContain('operation="login"');
      expect(metrics).toContain('operation="register"');
      expect(metrics).toContain('operation="refresh"');
    });
  });

  describe('Metrics format', () => {
    it('should return Prometheus-formatted metrics', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should include metric types', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('# TYPE auth_login_attempts_total counter');
      expect(metrics).toContain('# TYPE auth_registrations_total counter');
      expect(metrics).toContain('# TYPE auth_token_refresh_total counter');
      expect(metrics).toContain('# TYPE auth_operation_duration_seconds histogram');
    });

    it('should have valid metric lines', async () => {
      loginAttemptsTotal.inc({ status: 'format-test' });
      
      const metrics = await register.metrics();
      const lines = metrics.split('\n');
      const metricLines = lines.filter(l => l.startsWith('auth_login_attempts_total'));

      expect(metricLines.length).toBeGreaterThan(0);
      expect(metricLines[0]).toMatch(/auth_login_attempts_total\{.*\} \d+/);
    });
  });

  describe('Real-world usage scenarios', () => {
    it('should track successful logins', async () => {
      const before = await register.metrics();
      
      loginAttemptsTotal.inc({ status: 'success' });
      
      const after = await register.metrics();
      expect(after).toContain('auth_login_attempts_total');
    });

    it('should track login duration', async () => {
      const start = Date.now();
      // Simulate login operation
      await new Promise(resolve => setTimeout(resolve, 10));
      const duration = (Date.now() - start) / 1000;

      authDuration.observe({ operation: 'login' }, duration);

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_operation_duration_seconds');
    });

    it('should track multiple metrics concurrently', async () => {
      loginAttemptsTotal.inc({ status: 'concurrent1' });
      registrationTotal.inc({ status: 'concurrent2' });
      tokenRefreshTotal.inc({ status: 'concurrent3' });
      authDuration.observe({ operation: 'concurrent' }, 0.1);

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_login_attempts_total');
      expect(metrics).toContain('auth_registrations_total');
      expect(metrics).toContain('auth_token_refresh_total');
      expect(metrics).toContain('auth_operation_duration_seconds');
    });
  });
});
