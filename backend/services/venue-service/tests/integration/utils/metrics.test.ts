/**
 * Metrics Integration Tests
 */

import {
  register,
  httpRequestDuration,
  httpRequestTotal,
  venueOperations,
  activeVenues
} from '../../../src/utils/metrics';

describe('Metrics Integration Tests', () => {
  beforeEach(async () => {
    // Reset metrics before each test
    register.resetMetrics();
  });

  describe('Prometheus Registry', () => {
    it('should have register defined', () => {
      expect(register).toBeDefined();
    });

    it('should return metrics string', async () => {
      const metrics = await register.metrics();
      expect(typeof metrics).toBe('string');
    });

    it('should have content type', () => {
      expect(register.contentType).toBeDefined();
      expect(register.contentType).toContain('text/plain');
    });
  });

  describe('HTTP Request Duration Histogram', () => {
    it('should be defined', () => {
      expect(httpRequestDuration).toBeDefined();
    });

    it('should observe duration values', () => {
      expect(() => {
        httpRequestDuration.observe(
          { method: 'GET', route: '/test', status_code: '200' },
          0.5
        );
      }).not.toThrow();
    });

    it('should record multiple observations', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/api', status_code: '200' }, 0.1);
      httpRequestDuration.observe({ method: 'POST', route: '/api', status_code: '201' }, 0.2);
      httpRequestDuration.observe({ method: 'GET', route: '/api', status_code: '404' }, 0.05);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('HTTP Request Total Counter', () => {
    it('should be defined', () => {
      expect(httpRequestTotal).toBeDefined();
    });

    it('should increment counter', () => {
      expect(() => {
        httpRequestTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
      }).not.toThrow();
    });

    it('should increment by specific amount', () => {
      expect(() => {
        httpRequestTotal.inc({ method: 'GET', route: '/test', status_code: '200' }, 5);
      }).not.toThrow();
    });
  });

  describe('Venue Operations Counter', () => {
    it('should be defined', () => {
      expect(venueOperations).toBeDefined();
    });

    it('should track venue operations', () => {
      expect(() => {
        venueOperations.inc({ operation: 'create', status: 'success' });
        venueOperations.inc({ operation: 'update', status: 'success' });
        venueOperations.inc({ operation: 'delete', status: 'failure' });
      }).not.toThrow();
    });
  });

  describe('Active Venues Gauge', () => {
    it('should be defined', () => {
      expect(activeVenues).toBeDefined();
    });

    it('should set gauge value', () => {
      expect(() => {
        activeVenues.set(100);
      }).not.toThrow();
    });

    it('should increment and decrement', () => {
      expect(() => {
        activeVenues.set(50);
        activeVenues.inc();
        activeVenues.dec();
      }).not.toThrow();
    });
  });

  describe('Metrics Output', () => {
    it('should include http_request_duration_seconds in output', async () => {
      httpRequestDuration.observe({ method: 'GET', route: '/', status_code: '200' }, 0.1);
      const output = await register.metrics();
      expect(output).toContain('http_request_duration_seconds');
    });

    it('should include http_requests_total in output', async () => {
      httpRequestTotal.inc({ method: 'GET', route: '/', status_code: '200' });
      const output = await register.metrics();
      expect(output).toContain('http_requests_total');
    });

    it('should include venue_operations_total in output', async () => {
      venueOperations.inc({ operation: 'create', status: 'success' });
      const output = await register.metrics();
      expect(output).toContain('venue_operations_total');
    });
  });
});
