import { 
  register,
  eventCreatedTotal,
  capacityReservedTotal,
  pricingCalculatedTotal,
  httpRequestsTotal,
  eventOperationDuration
} from '../../../src/utils/metrics';

describe('Metrics Utils', () => {
  describe('Metric instances', () => {
    it('should have event metrics', () => {
      expect(eventCreatedTotal).toBeDefined();
      expect(typeof eventCreatedTotal.inc).toBe('function');
    });

    it('should have capacity metrics', () => {
      expect(capacityReservedTotal).toBeDefined();
      expect(typeof capacityReservedTotal.inc).toBe('function');
    });

    it('should have pricing metrics', () => {
      expect(pricingCalculatedTotal).toBeDefined();
      expect(typeof pricingCalculatedTotal.inc).toBe('function');
    });

    it('should have http metrics', () => {
      expect(httpRequestsTotal).toBeDefined();
      expect(typeof httpRequestsTotal.inc).toBe('function');
    });

    it('should have duration histogram', () => {
      expect(eventOperationDuration).toBeDefined();
      expect(typeof eventOperationDuration.observe).toBe('function');
    });
  });

  describe('Metric operations', () => {
    it('should increment counters', () => {
      expect(() => {
        eventCreatedTotal.inc({ status: 'success', event_type: 'concert' });
      }).not.toThrow();
    });

    it('should observe histograms', () => {
      expect(() => {
        eventOperationDuration.observe({ operation: 'create' }, 0.5);
      }).not.toThrow();
    });
  });

  describe('Registry', () => {
    it('should have metrics registered', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('event_created_total');
      expect(metrics).toContain('capacity_reserved_total');
    });
  });
});
