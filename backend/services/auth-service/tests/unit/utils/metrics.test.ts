import { 
  register, 
  loginAttemptsTotal, 
  registrationTotal, 
  tokenRefreshTotal, 
  authDuration 
} from '../../../src/utils/metrics';

describe('Metrics Utils', () => {
  describe('register', () => {
    it('should be defined', () => {
      expect(register).toBeDefined();
    });

    it('should have metrics method', () => {
      expect(typeof register.metrics).toBe('function');
    });
  });

  describe('loginAttemptsTotal', () => {
    it('should be a Counter metric', () => {
      expect(loginAttemptsTotal).toBeDefined();
      expect(typeof loginAttemptsTotal.inc).toBe('function');
    });

    it('should increment counter', () => {
      loginAttemptsTotal.inc({ status: 'success' });
      // Just verify it doesn't throw
      expect(loginAttemptsTotal).toBeDefined();
    });
  });

  describe('registrationTotal', () => {
    it('should be a Counter metric', () => {
      expect(registrationTotal).toBeDefined();
      expect(typeof registrationTotal.inc).toBe('function');
    });

    it('should increment counter', () => {
      registrationTotal.inc({ status: 'success' });
      expect(registrationTotal).toBeDefined();
    });
  });

  describe('tokenRefreshTotal', () => {
    it('should be a Counter metric', () => {
      expect(tokenRefreshTotal).toBeDefined();
      expect(typeof tokenRefreshTotal.inc).toBe('function');
    });

    it('should increment counter', () => {
      tokenRefreshTotal.inc({ status: 'success' });
      expect(tokenRefreshTotal).toBeDefined();
    });
  });

  describe('authDuration', () => {
    it('should be a Histogram metric', () => {
      expect(authDuration).toBeDefined();
      expect(typeof authDuration.observe).toBe('function');
    });

    it('should observe duration', () => {
      authDuration.observe({ operation: 'login' }, 0.5);
      expect(authDuration).toBeDefined();
    });

    it('should observe multiple operations', () => {
      authDuration.observe({ operation: 'register' }, 1.2);
      authDuration.observe({ operation: 'refresh' }, 0.3);
      expect(authDuration).toBeDefined();
    });
  });
});
