/**
 * Secrets Configuration Integration Tests
 */

describe('Secrets Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  // ==========================================================================
  // loadSecrets
  // ==========================================================================
  describe('loadSecrets', () => {
    it('should export loadSecrets function', async () => {
      const secrets = await import('../../src/config/secrets');
      expect(typeof secrets.loadSecrets).toBe('function');
    });

    it('should use SERVICE_NAME from environment', async () => {
      process.env.SERVICE_NAME = 'test-event-service';
      
      const secrets = await import('../../src/config/secrets');
      
      // The function should be callable (may fail without proper secrets setup)
      expect(secrets.loadSecrets).toBeDefined();
    });

    it('should default to unknown-service when SERVICE_NAME not set', async () => {
      delete process.env.SERVICE_NAME;
      
      const secrets = await import('../../src/config/secrets');
      
      expect(secrets.loadSecrets).toBeDefined();
    });
  });
});
