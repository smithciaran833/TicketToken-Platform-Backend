import { getServiceUrl, serviceUrls } from '../../../src/config/services';

describe('services.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getServiceUrl', () => {
    it('returns environment variable value when set', () => {
      process.env.TEST_SERVICE_URL = 'http://custom-service:9999';
      
      const url = getServiceUrl('TEST_SERVICE_URL', 'default-service', 3000);
      
      expect(url).toBe('http://custom-service:9999');
    });

    it('returns default docker service URL when env var not set', () => {
      delete process.env.TEST_SERVICE_URL;
      
      const url = getServiceUrl('TEST_SERVICE_URL', 'default-service', 3000);
      
      expect(url).toBe('http://default-service:3000');
    });

    it('constructs URL with correct port', () => {
      delete process.env.AUTH_URL;
      
      const url = getServiceUrl('AUTH_URL', 'auth-service', 8080);
      
      expect(url).toBe('http://auth-service:8080');
    });

    it('handles empty string env var as falsy', () => {
      process.env.TEST_SERVICE_URL = '';
      
      const url = getServiceUrl('TEST_SERVICE_URL', 'fallback-service', 5000);
      
      expect(url).toBe('http://fallback-service:5000');
    });

    it('uses env var even if it looks unusual', () => {
      process.env.TEST_SERVICE_URL = 'https://external-service.com:443';
      
      const url = getServiceUrl('TEST_SERVICE_URL', 'default', 3000);
      
      expect(url).toBe('https://external-service.com:443');
    });

    it('constructs URL with port 0', () => {
      delete process.env.TEST_URL;
      
      const url = getServiceUrl('TEST_URL', 'service', 0);
      
      expect(url).toBe('http://service:0');
    });

    it('constructs URL with large port number', () => {
      delete process.env.TEST_URL;
      
      const url = getServiceUrl('TEST_URL', 'service', 65535);
      
      expect(url).toBe('http://service:65535');
    });
  });

  describe('serviceUrls', () => {
    it('contains auth service URL', () => {
      expect(serviceUrls.auth).toBeDefined();
      expect(typeof serviceUrls.auth).toBe('string');
      expect(serviceUrls.auth).toMatch(/^http:\/\//);
    });

    it('contains venue service URL', () => {
      expect(serviceUrls.venue).toBeDefined();
      expect(typeof serviceUrls.venue).toBe('string');
      expect(serviceUrls.venue).toMatch(/^http:\/\//);
    });

    it('contains all required service URLs', () => {
      const requiredServices: Array<keyof typeof serviceUrls> = [
        'auth', 'venue', 'event', 'ticket', 'payment', 'marketplace',
        'analytics', 'notification', 'integration', 'compliance',
        'queue', 'search', 'file', 'monitoring', 'blockchain',
        'order', 'scanning', 'minting', 'transfer'
      ];

      requiredServices.forEach(service => {
        expect(serviceUrls[service]).toBeDefined();
        expect(typeof serviceUrls[service]).toBe('string');
        expect(serviceUrls[service]).toContain('http://');
      });
    });

    it('auth service uses port 3001', () => {
      expect(serviceUrls.auth).toMatch(/:3001$/);
    });

    it('venue service uses port 3002', () => {
      expect(serviceUrls.venue).toMatch(/:3002$/);
    });

    it('payment service uses port 3005', () => {
      expect(serviceUrls.payment).toMatch(/:3005$/);
    });

    it('all services use different ports', () => {
      const ports = Object.values(serviceUrls).map(url => {
        const match = url.match(/:(\d+)$/);
        return match ? match[1] : null;
      });

      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(19); // All 19 services should have unique ports
    });
  });
});
