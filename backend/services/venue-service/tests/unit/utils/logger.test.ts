import { logger } from '../../../src/utils/logger';

describe('Logger Utils', () => {
  // =============================================================================
  // Logger Instance - 3 test cases
  // =============================================================================

  describe('Logger Instance', () => {
    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });
  });

  // =============================================================================
  // Logger Methods - 3 test cases
  // =============================================================================

  describe('Logger Methods', () => {
    it('should log info messages', () => {
      // Just verify it doesn't throw
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log with object context', () => {
      expect(() => logger.info({ userId: '123' }, 'User action')).not.toThrow();
    });
  });
});
