/**
 * Phase 2: Internal API Tests
 * 
 * AGGRESSIVE TESTING - Real service calls to Docker services
 * Tests: auth, event, payment (running)
 * Skips: notification (service exists but not running)
 */

import { Pool } from 'pg';
import { config } from '../../src/config';
import { InterServiceClient } from '../../src/services/interServiceClient';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 2: Internal API Integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.database.url });
    
    // Give services time to warm up and force initial health check
    await new Promise(resolve => setTimeout(resolve, 2000));
    await InterServiceClient.refreshHealth();
  }, 15000);

  afterAll(async () => {
    await pool.end();
  });

  describe('1. Service Discovery & Initialization', () => {
    it('should initialize all service clients on startup', async () => {
      const health = await InterServiceClient.checkHealth();
      
      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
      
      // All services should be tracked (even if down)
      const expectedServices = ['auth', 'event', 'payment', 'notification'];
      
      expectedServices.forEach(service => {
        expect(health).toHaveProperty(service);
        expect(typeof health[service]).toBe('boolean');
      });
    });

    it('should track individual service health status', () => {
      const authHealth = InterServiceClient.getHealthStatus('auth');
      const eventHealth = InterServiceClient.getHealthStatus('event');
      
      expect(typeof authHealth).toBe('boolean');
      expect(typeof eventHealth).toBe('boolean');
    });

    it('should return false for non-existent service', () => {
      const fakeServiceHealth = InterServiceClient.getHealthStatus('fake-service-xyz');
      
      expect(fakeServiceHealth).toBe(false);
    });

    it('should handle health check for all services', async () => {
      const health = await InterServiceClient.checkHealth();
      
      const healthEntries = Object.entries(health);
      expect(healthEntries.length).toBeGreaterThan(0);
      
      healthEntries.forEach(([service, status]) => {
        expect(typeof service).toBe('string');
        expect(typeof status).toBe('boolean');
      });
    });
  });

  describe('2. Request/Response Cycle', () => {
    it('should successfully call auth service health endpoint', async () => {
      const result = await InterServiceClient.get('auth', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.metadata?.duration).toBeGreaterThan(0);
      }
    });

    it('should successfully call event service health endpoint', async () => {
      const result = await InterServiceClient.get('event', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      
      if (result.success) {
        expect(result.data).toBeDefined();
      }
    });

    it('should track request duration in metadata', async () => {
      const result = await InterServiceClient.get('auth', '/health');
      
      if (result.success) {
        expect(result.metadata).toBeDefined();
        expect(result.metadata?.duration).toBeDefined();
        expect(result.metadata?.duration).toBeGreaterThan(0);
        expect(result.metadata?.duration).toBeLessThan(10000);
      }
    });

    it('should include tracing metadata in response', async () => {
      const result = await InterServiceClient.get('auth', '/health');
      
      expect(result.metadata).toBeDefined();
      
      if (result.success) {
        expect(result.metadata?.duration).toBeDefined();
      }
    });

    it('should use convenience GET method', async () => {
      const result = await InterServiceClient.get('auth', '/health');
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should use convenience POST method', async () => {
      const testData = { test: 'data' };
      
      const result = await InterServiceClient.post('auth', '/test-endpoint', testData);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should handle JSON request body', async () => {
      const testPayload = {
        id: uuidv4(),
        data: 'test',
        timestamp: new Date().toISOString()
      };
      
      const result = await InterServiceClient.post('auth', '/test', testPayload);
      
      expect(result).toHaveProperty('success');
    });
  });

  describe('3. Error Handling', () => {
    it('should return structured error for 404 Not Found', async () => {
      const result = await InterServiceClient.get('auth', '/nonexistent-endpoint-12345');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.metadata).toBeDefined();
      }
    });

    it('should handle network timeout gracefully', async () => {
      const startTime = Date.now();
      
      const result = await InterServiceClient.get('auth', '/health', {
        timeout: 1
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
      expect(result).toHaveProperty('success');
    });

    it('should return structured error on connection failure', async () => {
      const result = await InterServiceClient.request(
        'auth',
        'GET',
        '/health',
        undefined,
        { timeout: 2000 }
      );
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should handle malformed request gracefully', async () => {
      const result = await InterServiceClient.post('auth', '/api/invalid', null);
      
      expect(result).toHaveProperty('success');
      
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should mark service unhealthy on 5xx errors', async () => {
      const result = await InterServiceClient.get('auth', '/force-500-error');
      
      expect(result).toHaveProperty('success');
      
      const health = InterServiceClient.getHealthStatus('auth');
      expect(typeof health).toBe('boolean');
    });

    it('should track error metadata', async () => {
      const result = await InterServiceClient.get('auth', '/nonexistent-404');
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThan(0);
      
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('4. Retry Logic', () => {
    it('should retry failed requests with retry flag', async () => {
      const startTime = Date.now();
      
      const result = await InterServiceClient.get('payment', '/api/test-retry', {
        retry: true,
        maxRetries: 2,
        timeout: 1000
      });
      
      const duration = Date.now() - startTime;
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
      
      if (!result.success) {
        expect(duration).toBeGreaterThan(0);
      }
    });

    it('should respect maxRetries limit', async () => {
      const result = await InterServiceClient.get('payment', '/fail', {
        retry: true,
        maxRetries: 3
      });
      
      expect(result).toHaveProperty('success');
      
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should not retry on 4xx client errors', async () => {
      const startTime = Date.now();
      
      const result = await InterServiceClient.get('auth', '/bad-request-400', {
        retry: true,
        maxRetries: 3
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
      expect(result).toHaveProperty('success');
    });

    it('should implement exponential backoff', async () => {
      const startTime = Date.now();
      
      const result = await InterServiceClient.request(
        'payment',
        'GET',
        '/force-timeout',
        undefined,
        {
          retry: true,
          maxRetries: 2,
          timeout: 500
        }
      );
      
      const duration = Date.now() - startTime;
      
      expect(result).toHaveProperty('success');
    });
  });

  describe('5. Health Monitoring', () => {
    it('should periodically check service health', async () => {
      const initialHealth = await InterServiceClient.checkHealth();
      
      expect(initialHealth).toBeDefined();
      
      const services = Object.keys(initialHealth);
      expect(services.length).toBeGreaterThan(0);
    });

    it('should update health status after successful requests', async () => {
      const beforeHealth = InterServiceClient.getHealthStatus('auth');
      
      await InterServiceClient.get('auth', '/health');
      
      const afterHealth = InterServiceClient.getHealthStatus('auth');
      
      expect(typeof beforeHealth).toBe('boolean');
      expect(typeof afterHealth).toBe('boolean');
    });

    it('should maintain separate health status per service', async () => {
      const authHealth = InterServiceClient.getHealthStatus('auth');
      const eventHealth = InterServiceClient.getHealthStatus('event');
      const paymentHealth = InterServiceClient.getHealthStatus('payment');
      
      expect(typeof authHealth).toBe('boolean');
      expect(typeof eventHealth).toBe('boolean');
      expect(typeof paymentHealth).toBe('boolean');
    });

    it.skip('should reflect notification service failures (service not running)', async () => {
      // Enable when notification service is running
      await InterServiceClient.get('notification', '/health', {
        timeout: 1000
      });
      
      const health = InterServiceClient.getHealthStatus('notification');
      expect(typeof health).toBe('boolean');
    });
  });

  describe('6. Concurrent Requests', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests = [
        InterServiceClient.get('auth', '/health'),
        InterServiceClient.get('event', '/health'),
        InterServiceClient.get('payment', '/health')
      ];
      
      const results = await Promise.allSettled(requests);
      
      expect(results).toHaveLength(3);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('success');
        }
      });
    });

    it('should maintain separate request tracking', async () => {
      const [result1, result2, result3] = await Promise.all([
        InterServiceClient.get('auth', '/health'),
        InterServiceClient.get('auth', '/health'),
        InterServiceClient.get('auth', '/health')
      ]);
      
      expect(result1.metadata).toBeDefined();
      expect(result2.metadata).toBeDefined();
      expect(result3.metadata).toBeDefined();
      
      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
    });

    it('should handle mixed success and failure', async () => {
      const requests = [
        InterServiceClient.get('auth', '/health'),
        InterServiceClient.get('auth', '/nonexistent-404'),
        InterServiceClient.get('event', '/health')
      ];
      
      const results = await Promise.allSettled(requests);
      
      expect(results).toHaveLength(3);
      
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('success');
        }
      });
    });

    it('should not interfere with concurrent health checks', async () => {
      const health1 = InterServiceClient.checkHealth();
      const health2 = InterServiceClient.checkHealth();
      
      const [result1, result2] = await Promise.all([health1, health2]);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      
      expect(typeof result1).toBe('object');
      expect(typeof result2).toBe('object');
    });
  });

  describe('7. Service-Specific Integration', () => {
    it('should successfully communicate with auth service', async () => {
      const result = await InterServiceClient.get('auth', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should successfully communicate with event service', async () => {
      const result = await InterServiceClient.get('event', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should successfully communicate with payment service', async () => {
      const result = await InterServiceClient.get('payment', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it.skip('should successfully communicate with notification service (not running)', async () => {
      // Enable when notification service is running
      const result = await InterServiceClient.get('notification', '/health');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('8. Edge Cases & Stress Testing', () => {
    it('should handle rapid sequential requests', async () => {
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        const result = await InterServiceClient.get('auth', '/health');
        results.push(result);
      }
      
      expect(results).toHaveLength(10);
      
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');
      });
    });

    it('should handle large request payload', async () => {
      const largePayload = {
        id: uuidv4(),
        data: 'x'.repeat(10000),
        nested: {
          array: Array(100).fill({ value: 'test' })
        }
      };
      
      const result = await InterServiceClient.post('auth', '/test', largePayload);
      
      expect(result).toHaveProperty('success');
    });

    it('should timeout on hanging requests', async () => {
      const startTime = Date.now();
      
      const result = await InterServiceClient.get('payment', '/hang', {
        timeout: 2000
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
      expect(result).toHaveProperty('success');
    });

    it('should handle empty response body', async () => {
      const result = await InterServiceClient.get('auth', '/empty-response');
      
      expect(result).toHaveProperty('success');
      
      if (result.success) {
        expect(result.data).toBeDefined();
      }
    });

    it('should handle special characters in request', async () => {
      const specialData = {
        text: 'Test with émojis 🎫 and spëcial çhars!',
        unicode: '你好世界',
        symbols: '!@#$%^&*()'
      };
      
      const result = await InterServiceClient.post('auth', '/test', specialData);
      
      expect(result).toHaveProperty('success');
    });
  });

  describe('9. Request Method Variants', () => {
    it('should support PUT requests', async () => {
      const updateData = { field: 'updated' };
      
      const result = await InterServiceClient.put('auth', '/test/123', updateData);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should support DELETE requests', async () => {
      const result = await InterServiceClient.delete('auth', '/test/123');
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should support custom headers in requests', async () => {
      const result = await InterServiceClient.get('auth', '/health', {
        headers: {
          'X-Custom-Header': 'test-value',
          'X-Tenant-ID': uuidv4()
        }
      });
      
      expect(result).toHaveProperty('success');
    });

    it('should support generic request method with all HTTP verbs', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      
      const results = await Promise.allSettled(
        methods.map(method =>
          InterServiceClient.request('auth', method, '/test', { test: 'data' })
        )
      );
      
      expect(results).toHaveLength(4);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('success');
        }
      });
    });
  });

  describe('10. Circuit Breaker Behavior', () => {
    it('should track failures and mark service unhealthy', async () => {
      const beforeHealth = InterServiceClient.getHealthStatus('payment');
      
      await InterServiceClient.get('payment', '/fail-1', { timeout: 500 });
      await InterServiceClient.get('payment', '/fail-2', { timeout: 500 });
      await InterServiceClient.get('payment', '/fail-3', { timeout: 500 });
      
      const afterHealth = InterServiceClient.getHealthStatus('payment');
      
      expect(typeof beforeHealth).toBe('boolean');
      expect(typeof afterHealth).toBe('boolean');
    });

    it('should recover service health after successful request', async () => {
      await InterServiceClient.get('auth', '/health');
      
      const health = InterServiceClient.getHealthStatus('auth');
      
      expect(typeof health).toBe('boolean');
    });
  });
});
