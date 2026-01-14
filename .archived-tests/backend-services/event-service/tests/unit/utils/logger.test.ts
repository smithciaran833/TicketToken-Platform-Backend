import { logger } from '../../../src/utils/logger';

describe('Logger Utils', () => {
  describe('Logger methods', () => {
    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('Logger child', () => {
    it('should create child logger', () => {
      const child = logger.child({ service: 'test' });

      expect(typeof child.info).toBe('function');
      expect(typeof child.error).toBe('function');
    });
  });
});
