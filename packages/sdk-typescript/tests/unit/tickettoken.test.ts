import { TicketToken } from '../../src/tickettoken';
import { ConfigurationError } from '../../src/errors';
import { ENVIRONMENTS } from '../../src/types/config';

describe('TicketToken SDK', () => {
  describe('Constructor', () => {
    it('should throw error if no API key provided', () => {
      expect(() => {
        new TicketToken({ apiKey: '' });
      }).toThrow(ConfigurationError);
    });

    it('should create SDK with API key', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      expect(sdk).toBeInstanceOf(TicketToken);
    });

    it('should initialize resource modules', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      expect(sdk.events).toBeDefined();
      expect(sdk.tickets).toBeDefined();
      expect(sdk.users).toBeDefined();
    });

    it('should use production environment by default', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      const config = sdk.getConfig();
      expect(config.environment).toBe('production');
      expect(config.baseUrl).toBe(ENVIRONMENTS.production);
    });

    it('should allow custom baseUrl', () => {
      const customUrl = 'https://custom-api.example.com';
      const sdk = new TicketToken({
        apiKey: 'test-key',
        baseUrl: customUrl,
      });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(customUrl);
    });

    it('should allow custom timeout', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        timeout: 60000,
      });
      const config = sdk.getConfig();
      expect(config.timeout).toBe(60000);
    });

    it('should allow custom max retries', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        maxRetries: 5,
      });
      const config = sdk.getConfig();
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('resolveConfig', () => {
    it('should resolve production environment URL', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'production',
      });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(ENVIRONMENTS.production);
    });

    it('should resolve staging environment URL', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'staging',
      });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(ENVIRONMENTS.staging);
    });

    it('should resolve development environment URL', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'development',
      });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(ENVIRONMENTS.development);
    });

    it('should prefer custom baseUrl over environment', () => {
      const customUrl = 'https://my-api.example.com';
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'production',
        baseUrl: customUrl,
      });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(customUrl);
    });

    it('should merge custom headers', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });
      const config = sdk.getConfig();
      expect(config.headers).toHaveProperty('X-Custom-Header', 'custom-value');
    });
  });

  describe('updateConfig', () => {
    it('should update timeout', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      sdk.updateConfig({ timeout: 45000 });
      const config = sdk.getConfig();
      expect(config.timeout).toBe(45000);
    });

    it('should update baseUrl', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      const newUrl = 'https://new-api.example.com';
      sdk.updateConfig({ baseUrl: newUrl });
      const config = sdk.getConfig();
      expect(config.baseUrl).toBe(newUrl);
    });

    it('should update headers', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      sdk.updateConfig({
        headers: { 'X-New-Header': 'new-value' },
      });
      const config = sdk.getConfig();
      expect(config.headers).toHaveProperty('X-New-Header', 'new-value');
    });
  });

  describe('setApiKey', () => {
    it('should update API key', () => {
      const sdk = new TicketToken({ apiKey: 'old-key' });
      sdk.setApiKey('new-key');
      const config = sdk.getConfig();
      expect(config.apiKey).toBe('new-key');
    });
  });

  describe('setEnvironment', () => {
    it('should update to staging environment', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      sdk.setEnvironment('staging');
      const config = sdk.getConfig();
      expect(config.environment).toBe('staging');
      expect(config.baseUrl).toBe(ENVIRONMENTS.staging);
    });

    it('should update to development environment', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      sdk.setEnvironment('development');
      const config = sdk.getConfig();
      expect(config.environment).toBe('development');
      expect(config.baseUrl).toBe(ENVIRONMENTS.development);
    });

    it('should update to production environment', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'development',
      });
      sdk.setEnvironment('production');
      const config = sdk.getConfig();
      expect(config.environment).toBe('production');
      expect(config.baseUrl).toBe(ENVIRONMENTS.production);
    });
  });

  describe('setDebug', () => {
    it('should enable debug mode', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      sdk.setDebug(true);
      const config = sdk.getConfig();
      expect(config.debug).toBe(true);
    });

    it('should disable debug mode', () => {
      const sdk = new TicketToken({ apiKey: 'test-key', debug: true });
      sdk.setDebug(false);
      const config = sdk.getConfig();
      expect(config.debug).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const sdk = new TicketToken({
        apiKey: 'test-key',
        environment: 'production',
        timeout: 30000,
      });
      const config = sdk.getConfig();
      expect(config.apiKey).toBe('test-key');
      expect(config.environment).toBe('production');
      expect(config.timeout).toBe(30000);
    });

    it('should return a frozen copy', () => {
      const sdk = new TicketToken({ apiKey: 'test-key' });
      const config = sdk.getConfig();
      
      expect(() => {
        // @ts-ignore - testing runtime immutability
        config.apiKey = 'hacked';
      }).toThrow();
    });
  });
});
