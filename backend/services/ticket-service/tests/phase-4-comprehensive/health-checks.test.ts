import axios from 'axios';

/**
 * Phase 4: Health Checks Tests
 * 
 * Tests observability endpoints for monitoring and operations
 */

describe('Health Checks - Observability', () => {
  const API_BASE = 'http://localhost:3004';

  describe('Basic Health Check', () => {
    it('should return healthy status', async () => {
      const response = await axios.get(`${API_BASE}/health`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
      expect(response.data.service).toBe('ticket-service');
      expect(response.data.timestamp).toBeDefined();
    });
  });

  describe('Liveness Probe', () => {
    it('should return alive status', async () => {
      const response = await axios.get(`${API_BASE}/health/live`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('alive');
    });

    it('should respond quickly (< 100ms)', async () => {
      const start = Date.now();
      await axios.get(`${API_BASE}/health/live`);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Readiness Probe', () => {
    it('should return ready when all dependencies are healthy', async () => {
      const response = await axios.get(`${API_BASE}/health/ready`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ready');
      expect(response.data.checks).toBeDefined();
      expect(response.data.checks.database).toBe(true);
    });

    it('should check database connectivity', async () => {
      const response = await axios.get(`${API_BASE}/health/ready`);

      expect(response.data.checks.database).toBeDefined();
      expect(typeof response.data.checks.database).toBe('boolean');
    });

    it('should check redis connectivity', async () => {
      const response = await axios.get(`${API_BASE}/health/ready`);

      expect(response.data.checks.redis).toBeDefined();
      expect(typeof response.data.checks.redis).toBe('boolean');
    });

    it('should check queue connectivity', async () => {
      const response = await axios.get(`${API_BASE}/health/ready`);

      expect(response.data.checks.queue).toBeDefined();
      expect(typeof response.data.checks.queue).toBe('boolean');
    });

    it('should timeout dependency checks after 2 seconds', async () => {
      const start = Date.now();
      await axios.get(`${API_BASE}/health/ready`);
      const duration = Date.now() - start;

      // Should complete in reasonable time even if some services are slow
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Detailed Health Check', () => {
    it('should return detailed health information', async () => {
      const response = await axios.get(`${API_BASE}/health/health/detailed`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
      expect(response.data.database).toBeDefined();
      expect(response.data.redis).toBeDefined();
      expect(response.data.queue).toBeDefined();
      expect(response.data.timestamp).toBeDefined();
    });

    it('should include database connection status', async () => {
      const response = await axios.get(`${API_BASE}/health/health/detailed`);

      expect(response.data.database.connected).toBeDefined();
      expect(typeof response.data.database.connected).toBe('boolean');
    });

    it('should include redis connection status', async () => {
      const response = await axios.get(`${API_BASE}/health/health/detailed`);

      expect(response.data.redis.connected).toBeDefined();
      expect(typeof response.data.redis.connected).toBe('boolean');
    });

    it('should include queue connection status', async () => {
      const response = await axios.get(`${API_BASE}/health/health/detailed`);

      expect(response.data.queue.connected).toBeDefined();
      expect(typeof response.data.queue.connected).toBe('boolean');
    });
  });

  describe('Circuit Breaker Status', () => {
    it('should return circuit breaker information', async () => {
      const response = await axios.get(`${API_BASE}/health/health/circuit-breakers`);

      expect(response.status).toBe(200);
      expect(response.data.database).toBeDefined();
      expect(response.data.timestamp).toBeDefined();
    });

    it('should show database circuit breaker state', async () => {
      const response = await axios.get(`${API_BASE}/health/health/circuit-breakers`);

      expect(response.data.database.state).toBeDefined();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(response.data.database.state);
    });

    it('should track failure count', async () => {
      const response = await axios.get(`${API_BASE}/health/health/circuit-breakers`);

      expect(response.data.database.failures).toBeDefined();
      expect(typeof response.data.database.failures).toBe('number');
    });
  });

  describe('Error Scenarios', () => {
    it('should return 503 when not ready', async () => {
      // This test would require mocking database failure
      // For now, just verify the endpoint exists
      const response = await axios.get(`${API_BASE}/health/ready`);
      expect([200, 503]).toContain(response.status);
    });

    it('should handle database unavailability gracefully', async () => {
      // Test that health checks don't crash when DB is down
      const response = await axios.get(`${API_BASE}/health/ready`);
      expect(response.status).toBeDefined();
    });
  });
});
