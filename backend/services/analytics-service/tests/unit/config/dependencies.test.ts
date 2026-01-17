/**
 * Dependencies Configuration Tests
 */

import {
  setDependency,
  getDependency,
  getAllDependencies,
  Dependencies,
} from '../../../src/config/dependencies';

describe('Dependencies', () => {
  beforeEach(() => {
    // Clear all dependencies before each test
    const deps = getAllDependencies();
    Object.keys(deps).forEach((key) => {
      setDependency(key as keyof Dependencies, undefined);
    });
  });

  describe('setDependency', () => {
    it('should set a dependency', () => {
      const mockService = { name: 'mockMetricsService' };
      setDependency('metricsService', mockService);
      
      expect(getDependency('metricsService')).toBe(mockService);
    });

    it('should overwrite existing dependency', () => {
      const firstService = { name: 'first' };
      const secondService = { name: 'second' };
      
      setDependency('metricsService', firstService);
      setDependency('metricsService', secondService);
      
      expect(getDependency('metricsService')).toBe(secondService);
    });

    it('should set multiple dependencies', () => {
      const mockMetrics = { type: 'metrics' };
      const mockAggregation = { type: 'aggregation' };
      
      setDependency('metricsService', mockMetrics);
      setDependency('aggregationService', mockAggregation);
      
      expect(getDependency('metricsService')).toBe(mockMetrics);
      expect(getDependency('aggregationService')).toBe(mockAggregation);
    });
  });

  describe('getDependency', () => {
    it('should return undefined for unset dependency', () => {
      expect(getDependency('metricsService')).toBeUndefined();
    });

    it('should return the set dependency', () => {
      const mockService = { id: 123 };
      setDependency('alertService', mockService);
      
      expect(getDependency('alertService')).toBe(mockService);
    });
  });

  describe('getAllDependencies', () => {
    it('should return all dependencies object', () => {
      const deps = getAllDependencies();
      expect(typeof deps).toBe('object');
    });

    it('should reflect set dependencies', () => {
      const mockMetrics = { type: 'metrics' };
      const mockExport = { type: 'export' };
      
      setDependency('metricsService', mockMetrics);
      setDependency('exportService', mockExport);
      
      const deps = getAllDependencies();
      expect(deps.metricsService).toBe(mockMetrics);
      expect(deps.exportService).toBe(mockExport);
    });

    it('should return same reference', () => {
      const deps1 = getAllDependencies();
      const deps2 = getAllDependencies();
      expect(deps1).toBe(deps2);
    });
  });

  describe('Dependencies interface', () => {
    it('should support all expected service keys', () => {
      const serviceKeys: (keyof Dependencies)[] = [
        'metricsService',
        'aggregationService',
        'customerIntelService',
        'predictionService',
        'messageGatewayService',
        'attributionService',
        'exportService',
        'alertService',
        'anonymizationService',
        'websocketService',
      ];

      serviceKeys.forEach((key) => {
        const mockValue = { key };
        setDependency(key, mockValue);
        expect(getDependency(key)).toBe(mockValue);
      });
    });
  });
});
