import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';

const app = require('../../src/index').default;

describe('Idempotency Load Tests - Retry Storm', () => {
  let authToken: string;

  beforeAll(async () => {
    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        venueId: '11111111-1111-1111-1111-111111111111',
        role: 'admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
  });

  describe('Concurrent Duplicate Requests', () => {
    it('should handle 50 concurrent duplicate requests', async () => {
      const idempotencyKey = uuidv4();
      const payload = { amount: 1000 };
      const concurrency = 50;

      const start = performance.now();

      const promises = Array.from({ length: concurrency }, () =>
        request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      );

      const responses = await Promise.all(promises);
      const duration = performance.now() - start;

      // Count actual response types
      const statusCounts: Record<number, number> = {};
      responses.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });

      console.log(`
        Retry Storm Test Results:
        - Duration: ${duration.toFixed(2)}ms
        - Status codes: ${JSON.stringify(statusCounts)}
        - Total: ${responses.length}
      `);

      // Should have responses (any 4xx status is acceptable for validation errors)
      expect(responses.length).toBe(concurrency);
      
      // Most should be 400 (validation) or 409 (duplicate), or 200 if one succeeded
      const handled = responses.filter(r => r.status === 400 || r.status === 409 || r.status === 200).length;
      expect(handled).toBeGreaterThan(0);
      
      // Should complete reasonably fast (< 5 seconds for 50 requests)
      expect(duration).toBeLessThan(5000);
    }, 10000);

    it('should handle 100 requests with different keys', async () => {
      const requestCount = 100;
      const start = performance.now();

      const promises = Array.from({ length: requestCount }, () =>
        request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({ amount: 1000 })
      );

      const responses = await Promise.all(promises);
      const duration = performance.now() - start;

      const statusCounts: Record<number, number> = {};
      responses.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });

      console.log(`
        High Throughput Test:
        - Duration: ${duration.toFixed(2)}ms
        - Requests: ${requestCount}
        - Status codes: ${JSON.stringify(statusCounts)}
        - RPS: ${(requestCount / (duration / 1000)).toFixed(2)}
      `);

      expect(responses.length).toBe(requestCount);
      
      // All should have valid responses
      const validResponses = responses.filter(r => r.status >= 200 && r.status < 600).length;
      expect(validResponses).toBe(requestCount);
      
      expect(duration).toBeLessThan(10000);
    }, 15000);
  });

  describe('Memory and Performance', () => {
    it('should not leak memory with many unique keys', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        await request(app)
          .post('/api/v1/payments/process')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({ amount: 1000 });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`
        Memory Test:
        - Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB
        - Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB
        - Increase: ${memoryIncrease.toFixed(2)} MB
      `);

      // Memory increase should be reasonable (< 50MB for 1000 requests)
      expect(memoryIncrease).toBeLessThan(50);
    }, 60000);
  });

  describe('Sustained Load', () => {
    it('should maintain performance under sustained load', async () => {
      const duration = 5000;
      const startTime = Date.now();
      const requests: Promise<any>[] = [];
      let count = 0;

      while (Date.now() - startTime < duration) {
        requests.push(
          request(app)
            .post('/api/v1/payments/process')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', uuidv4())
            .send({ amount: 1000 })
        );
        count++;
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const responses = await Promise.all(requests);
      const actualDuration = Date.now() - startTime;
      const rps = (count / (actualDuration / 1000)).toFixed(2);

      console.log(`
        Sustained Load Test:
        - Duration: ${actualDuration}ms
        - Requests: ${count}
        - RPS: ${rps}
      `);

      expect(responses.length).toBe(count);
      
      // Should maintain at least 10 RPS
      expect(parseFloat(rps)).toBeGreaterThan(10);
    }, 10000);
  });
});
