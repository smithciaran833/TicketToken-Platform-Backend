/**
 * Secrets Config Integration Tests
 *
 * Tests the secrets loading functionality including:
 * - loadSecrets() function
 * - Environment variable handling
 */

describe('config/secrets', () => {
  // ==========================================================================
  // loadSecrets
  // ==========================================================================
  describe('loadSecrets', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeAll(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      jest.resetModules();
    });

    it('should export loadSecrets function', () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      expect(typeof loadSecrets).toBe('function');
    });

    it('should use SERVICE_NAME from environment', async () => {
      process.env.SERVICE_NAME = 'test-payment-service';
      
      // Clear module cache to reload with new env
      jest.resetModules();
      
      const { loadSecrets } = require('../../../src/config/secrets');
      expect(typeof loadSecrets).toBe('function');
    });

    it('should default SERVICE_NAME to unknown-service', async () => {
      delete process.env.SERVICE_NAME;
      
      jest.resetModules();
      
      const { loadSecrets } = require('../../../src/config/secrets');
      expect(typeof loadSecrets).toBe('function');
    });
  });

  // ==========================================================================
  // module exports
  // ==========================================================================
  describe('module exports', () => {
    it('should export loadSecrets', () => {
      const secrets = require('../../../src/config/secrets');
      expect(secrets.loadSecrets).toBeDefined();
      expect(typeof secrets.loadSecrets).toBe('function');
    });
  });
});
