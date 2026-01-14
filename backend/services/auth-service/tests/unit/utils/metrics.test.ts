import {
  register,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  loginAttemptsTotal,
  registrationTotal,
  tokenRefreshTotal,
  authDuration,
  keyRotationTotal,
  keyAgeGauge,
  keyRotationNeededGauge,
} from '../../../src/utils/metrics';

describe('metrics', () => {
  describe('register', () => {
    it('should be a Prometheus registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should return metrics string', async () => {
      const metrics = await register.metrics();
      expect(typeof metrics).toBe('string');
    });
  });

  describe('HTTP metrics', () => {
    it('should have httpRequestsTotal counter', () => {
      expect(httpRequestsTotal).toBeDefined();
    });

    it('should have httpRequestDurationSeconds histogram', () => {
      expect(httpRequestDurationSeconds).toBeDefined();
    });
  });

  describe('Auth metrics', () => {
    it('should have loginAttemptsTotal counter', () => {
      expect(loginAttemptsTotal).toBeDefined();
    });

    it('should have registrationTotal counter', () => {
      expect(registrationTotal).toBeDefined();
    });

    it('should have tokenRefreshTotal counter', () => {
      expect(tokenRefreshTotal).toBeDefined();
    });

    it('should have authDuration histogram', () => {
      expect(authDuration).toBeDefined();
    });
  });

  describe('Key rotation metrics', () => {
    it('should have keyRotationTotal counter', () => {
      expect(keyRotationTotal).toBeDefined();
    });

    it('should have keyAgeGauge gauge', () => {
      expect(keyAgeGauge).toBeDefined();
    });

    it('should have keyRotationNeededGauge gauge', () => {
      expect(keyRotationNeededGauge).toBeDefined();
    });
  });

  describe('metric operations', () => {
    it('should increment counter', () => {
      // This should not throw
      loginAttemptsTotal.inc({ status: 'success' });
      loginAttemptsTotal.inc({ status: 'failure' });
    });

    it('should observe histogram', () => {
      // This should not throw
      authDuration.observe({ operation: 'login' }, 0.5);
    });

    it('should set gauge', () => {
      // This should not throw
      keyAgeGauge.set({ key_type: 'jwt' }, 30);
      keyRotationNeededGauge.set({ key_type: 'jwt' }, 0);
    });
  });
});
