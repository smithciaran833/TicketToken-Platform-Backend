import { InterServiceClient } from '../../src/services/interServiceClient';
import axios, { AxiosRequestConfig } from 'axios';
import MockAdapter from 'axios-mock-adapter';

/**
 * INTEGRATION TESTS FOR INTER-SERVICE CLIENT
 * Tests HTTP communication between microservices
 */

describe('InterServiceClient Integration Tests', () => {
  let mock: MockAdapter;

  beforeAll(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.reset();
  });

  afterAll(() => {
    mock.restore();
  });

  describe('initialization', () => {
    it('should initialize clients for all services', () => {
      expect(InterServiceClient).toBeDefined();
    });

    it('should check health status for services', async () => {
      const health = await InterServiceClient.checkHealth();

      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });

    it('should get health status for specific service', () => {
      const status = InterServiceClient.getHealthStatus('auth');

      expect(typeof status).toBe('boolean');
    });
  });

  describe('request method', () => {
    it('should make successful GET request', async () => {
      mock.onGet(/\/test/).reply(200, { data: 'test' });

      const result = await InterServiceClient.get('auth', '/test');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should make successful POST request', async () => {
      mock.onPost(/\/test/).reply(201, { id: '123' });

      const result = await InterServiceClient.post('auth', '/test', { name: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should make successful PUT request', async () => {
      mock.onPut(/\/test/).reply(200, { updated: true });

      const result = await InterServiceClient.put('auth', '/test/123', { name: 'updated' });

      expect(result.success).toBe(true);
    });

    it('should make successful DELETE request', async () => {
      mock.onDelete(/\/test/).reply(204);

      const result = await InterServiceClient.delete('auth', '/test/123');

      expect(result.success).toBe(true);
    });

    it('should handle 404 errors', async () => {
      mock.onGet(/\/notfound/).reply(404, { error: 'Not found' });

      const result = await InterServiceClient.get('auth', '/notfound');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle 500 errors', async () => {
      mock.onGet(/\/error/).reply(500, { error: 'Internal error' });

      const result = await InterServiceClient.get('auth', '/error');

      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      mock.onGet(/\/timeout/).networkError();

      const result = await InterServiceClient.get('auth', '/timeout');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include metadata in successful response', async () => {
      mock.onGet(/test/).reply(200, { data: 'test' }, {
        'x-request-id': 'req-123',
        'x-trace-id': 'trace-456'
      });

      const result = await InterServiceClient.get('auth', '/test');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle custom headers', async () => {
      mock.onGet(/\/headers/).reply((config: AxiosRequestConfig) => {
        expect(config.headers?.['X-Custom']).toBe('test');
        return [200, { received: true }];
      });

      await InterServiceClient.get('auth', '/headers', {
        headers: { 'X-Custom': 'test' }
      });
    });
  });

  describe('convenience methods', () => {
    it('should use get convenience method', async () => {
      mock.onGet(/\/users/).reply(200, [{ id: 1 }, { id: 2 }]);

      const result = await InterServiceClient.get('auth', '/users');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should use post convenience method', async () => {
      mock.onPost(/\/users/).reply(201, { id: 3 });

      const result = await InterServiceClient.post('auth', '/users', {
        name: 'New User'
      });

      expect(result.success).toBe(true);
    });

    it('should use put convenience method', async () => {
      mock.onPut(/\/users\/1/).reply(200, { id: 1, updated: true });

      const result = await InterServiceClient.put('auth', '/users/1', {
        name: 'Updated'
      });

      expect(result.success).toBe(true);
    });

    it('should use delete convenience method', async () => {
      mock.onDelete(/\/users\/1/).reply(204);

      const result = await InterServiceClient.delete('auth', '/users/1');

      expect(result.success).toBe(true);
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx errors when retry enabled', async () => {
      let attempts = 0;
      mock.onGet(/\/retry/).reply(() => {
        attempts++;
        if (attempts < 3) {
          return [500, { error: 'Server error' }];
        }
        return [200, { success: true }];
      });

      const result = await InterServiceClient.get('auth', '/retry', {
        retry: true,
        maxRetries: 3
      });

      expect(attempts).toBeGreaterThan(1);
      expect(result.success).toBe(true);
    });

    it('should not retry when retry disabled', async () => {
      let attempts = 0;
      mock.onGet(/\/no-retry/).reply(() => {
        attempts++;
        return [500, { error: 'Server error' }];
      });

      const result = await InterServiceClient.get('auth', '/no-retry', {
        retry: false
      });

      expect(attempts).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should not retry on 4xx errors', async () => {
      let attempts = 0;
      mock.onGet(/\/client-error/).reply(() => {
        attempts++;
        return [404, { error: 'Not found' }];
      });

      const result = await InterServiceClient.get('auth', '/client-error', {
        retry: true
      });

      expect(attempts).toBe(1);
      expect(result.success).toBe(false);
    });
  });

  describe('health checks', () => {
    it('should check health of all services', async () => {
      const health = await InterServiceClient.checkHealth();

      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });

    it('should return health status for specific service', () => {
      const authHealth = InterServiceClient.getHealthStatus('auth');

      expect(typeof authHealth).toBe('boolean');
    });
  });

  describe('request interceptors', () => {
    it('should add tracing headers to requests', async () => {
      mock.onGet(/\/trace/).reply((config: AxiosRequestConfig) => {
        expect(config.headers?.['X-Service']).toBe('ticket-service');
        expect(config.headers?.['X-Request-Id']).toBeDefined();
        return [200, { traced: true }];
      });

      await InterServiceClient.get('auth', '/trace');
    });

    it('should track request duration', async () => {
      mock.onGet(/\/duration/).reply(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve([200, { data: 'test' }]), 50);
        });
      });

      const result = await InterServiceClient.get('auth', '/duration');

      expect(result.metadata?.duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('error handling', () => {
    it('should handle axios errors gracefully', async () => {
      mock.onGet(/\/axios-error/).reply(400, {
        error: 'Bad request',
        details: 'Invalid parameters'
      });

      const result = await InterServiceClient.get('auth', '/axios-error');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle timeout errors', async () => {
      mock.onGet(/\/timeout/).timeout();

      const result = await InterServiceClient.get('auth', '/timeout', {
        timeout: 1000
      });

      expect(result.success).toBe(false);
    });

    it('should handle malformed responses', async () => {
      mock.onGet(/\/malformed/).reply(200, 'not-json');

      const result = await InterServiceClient.get('auth', '/malformed');

      expect(result).toBeDefined();
    });
  });

  describe('multiple services', () => {
    it('should communicate with auth service', async () => {
      mock.onGet(/\/auth/).reply(200, { service: 'auth' });

      const result = await InterServiceClient.get('auth', '/users');

      expect(result).toBeDefined();
    });

    it('should communicate with event service', async () => {
      mock.onGet(/\/events/).reply(200, { service: 'event' });

      const result = await InterServiceClient.get('event', '/events');

      expect(result).toBeDefined();
    });

    it('should communicate with payment service', async () => {
      mock.onGet(/\/payments/).reply(200, { service: 'payment' });

      const result = await InterServiceClient.get('payment', '/payments');

      expect(result).toBeDefined();
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      mock.onGet(/\/concurrent/).reply(200, { id: Math.random() });

      const requests = Array.from({ length: 5 }, (_, i) =>
        InterServiceClient.get('auth', `/concurrent/${i}`)
      );

      const results = await Promise.all(requests);

      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle mixed success and failure', async () => {
      mock.onGet(/\/mixed\/success/).reply(200, { ok: true });
      mock.onGet(/\/mixed\/failure/).reply(500, { error: true });

      const results = await Promise.all([
        InterServiceClient.get('auth', '/mixed/success'),
        InterServiceClient.get('auth', '/mixed/failure')
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('request data handling', () => {
    it('should send JSON data in POST request', async () => {
      mock.onPost(/\/json/).reply((config: AxiosRequestConfig) => {
        const data = JSON.parse(config.data);
        expect(data.name).toBe('test');
        return [201, { received: data }];
      });

      const result = await InterServiceClient.post('auth', '/json', {
        name: 'test',
        value: 123
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty request body', async () => {
      mock.onPost(/\/empty/).reply(200, { received: true });

      const result = await InterServiceClient.post('auth', '/empty');

      expect(result.success).toBe(true);
    });
  });

  describe('response metadata', () => {
    it('should include request timing', async () => {
      mock.onGet(/\/timing/).reply(200, { data: 'test' });

      const result = await InterServiceClient.get('auth', '/timing');

      expect(result.metadata?.duration).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include request ID if provided', async () => {
      mock.onGet(/\/req-id/).reply(200, { data: 'test' }, {
        'x-request-id': 'unique-id-123'
      });

      const result = await InterServiceClient.get('auth', '/req-id');

      expect(result.metadata?.requestId).toBe('unique-id-123');
    });
  });
});
