import { 
  httpRequestDuration, 
  httpRequestTotal, 
  venueOperations, 
  activeVenues,
  register 
} from '../../../src/utils/metrics';

describe('Metrics Utils', () => {
  // =============================================================================
  // Metric Instances - 4 test cases
  // =============================================================================

  describe('Metric Instances', () => {
    it('should have httpRequestDuration histogram', () => {
      expect(httpRequestDuration).toBeDefined();
      expect(typeof httpRequestDuration.observe).toBe('function');
    });

    it('should have httpRequestTotal counter', () => {
      expect(httpRequestTotal).toBeDefined();
      expect(typeof httpRequestTotal.inc).toBe('function');
    });

    it('should have venueOperations counter', () => {
      expect(venueOperations).toBeDefined();
      expect(typeof venueOperations.inc).toBe('function');
    });

    it('should have activeVenues gauge', () => {
      expect(activeVenues).toBeDefined();
      expect(typeof activeVenues.set).toBe('function');
    });
  });

  // =============================================================================
  // Metric Operations - 4 test cases
  // =============================================================================

  describe('Metric Operations', () => {
    it('should increment httpRequestTotal', () => {
      expect(() => {
        httpRequestTotal.inc({ method: 'GET', route: '/venues', status_code: '200' });
      }).not.toThrow();
    });

    it('should observe httpRequestDuration', () => {
      expect(() => {
        httpRequestDuration.observe({ method: 'GET', route: '/venues', status_code: '200' }, 0.5);
      }).not.toThrow();
    });

    it('should increment venueOperations', () => {
      expect(() => {
        venueOperations.inc({ operation: 'create', status: 'success' });
      }).not.toThrow();
    });

    it('should set activeVenues gauge', () => {
      expect(() => {
        activeVenues.set(42);
      }).not.toThrow();
    });
  });

  // =============================================================================
  // Registry - 1 test case
  // =============================================================================

  describe('Registry', () => {
    it('should have metrics registered', async () => {
      const metrics = await register.metrics();
      
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('venue_operations_total');
      expect(metrics).toContain('active_venues_total');
    });
  });
});
