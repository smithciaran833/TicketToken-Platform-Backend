/**
 * Graceful Degradation Integration Tests
 * 100% code coverage
 */

import {
  GracefulDegradationManager,
  DegradationLevel,
  degradationManager,
  executeWithDegradation,
  calculateTaxWithFallback,
  estimateGasWithFallback,
  getHealthStatus,
} from '../../../src/utils/graceful-degradation';
import { circuitBreakerManager } from '../../../src/utils/circuit-breaker';

describe('GracefulDegradationManager', () => {
  let manager: GracefulDegradationManager;

  beforeEach(() => {
    manager = new GracefulDegradationManager();
  });

  describe('getDegradationLevel()', () => {
    it('should return FULL initially', () => {
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.FULL);
    });
  });

  describe('updateServiceHealth()', () => {
    it('should update database health', () => {
      manager.updateServiceHealth('database', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.MINIMAL);
    });

    it('should update stripe health', () => {
      manager.updateServiceHealth('stripe', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.MINIMAL);
    });

    it('should update redis health', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);
    });

    it('should update taxjar health', () => {
      manager.updateServiceHealth('taxjar', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);
    });

    it('should update blockchain health', () => {
      manager.updateServiceHealth('blockchain', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);
    });

    it('should return to FULL when service recovers', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);

      manager.updateServiceHealth('redis', true);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.FULL);
    });

    it('should handle multiple degraded services', () => {
      manager.updateServiceHealth('redis', false);
      manager.updateServiceHealth('taxjar', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);
    });

    it('should prioritize critical service failures', () => {
      manager.updateServiceHealth('redis', false);
      manager.updateServiceHealth('database', false);
      expect(manager.getDegradationLevel()).toBe(DegradationLevel.MINIMAL);
    });
  });

  describe('isFeatureAvailable()', () => {
    it('should return true for payment_processing at MINIMAL', () => {
      manager.updateServiceHealth('database', false);
      expect(manager.isFeatureAvailable('payment_processing')).toBe(true);
    });

    it('should return true for refunds at PARTIAL', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('refunds')).toBe(true);
    });

    it('should return false for refunds at MINIMAL', () => {
      manager.updateServiceHealth('database', false);
      expect(manager.isFeatureAvailable('refunds')).toBe(false);
    });

    it('should return true for dynamic_fees at PARTIAL', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('dynamic_fees')).toBe(true);
    });

    it('should return false for dynamic_fees at MINIMAL', () => {
      manager.updateServiceHealth('database', false);
      expect(manager.isFeatureAvailable('dynamic_fees')).toBe(false);
    });

    it('should return true for real_time_tax at FULL', () => {
      expect(manager.isFeatureAvailable('real_time_tax')).toBe(true);
    });

    it('should return false for real_time_tax at PARTIAL', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('real_time_tax')).toBe(false);
    });

    it('should return true for blockchain_minting at FULL', () => {
      expect(manager.isFeatureAvailable('blockchain_minting')).toBe(true);
    });

    it('should return false for blockchain_minting at PARTIAL', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('blockchain_minting')).toBe(false);
    });

    it('should return true for analytics at FULL', () => {
      expect(manager.isFeatureAvailable('analytics')).toBe(true);
    });

    it('should return false for analytics at PARTIAL', () => {
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('analytics')).toBe(false);
    });

    it('should default to FULL requirement for unknown features', () => {
      expect(manager.isFeatureAvailable('unknown_feature')).toBe(true);
      manager.updateServiceHealth('redis', false);
      expect(manager.isFeatureAvailable('unknown_feature')).toBe(false);
    });
  });

  describe('getFallback()', () => {
    it('should return service result on success', async () => {
      const result = await manager.getFallback(
        async () => 'service result',
        'fallback value',
        'test-service'
      );
      expect(result).toBe('service result');
    });

    it('should return fallback on service failure', async () => {
      const result = await manager.getFallback(
        async () => { throw new Error('service failed'); },
        'fallback value',
        'test-service'
      );
      expect(result).toBe('fallback value');
    });

    it('should return complex fallback objects', async () => {
      const fallback = { status: 'degraded', value: 0 };
      const result = await manager.getFallback(
        async () => { throw new Error('failed'); },
        fallback,
        'test-service'
      );
      expect(result).toEqual(fallback);
    });
  });
});

describe('DegradationLevel enum', () => {
  it('should have FULL level', () => {
    expect(DegradationLevel.FULL).toBe('FULL');
  });

  it('should have PARTIAL level', () => {
    expect(DegradationLevel.PARTIAL).toBe('PARTIAL');
  });

  it('should have MINIMAL level', () => {
    expect(DegradationLevel.MINIMAL).toBe('MINIMAL');
  });
});

describe('degradationManager singleton', () => {
  beforeEach(() => {
    degradationManager.updateServiceHealth('database', true);
    degradationManager.updateServiceHealth('redis', true);
    degradationManager.updateServiceHealth('taxjar', true);
    degradationManager.updateServiceHealth('blockchain', true);
    degradationManager.updateServiceHealth('stripe', true);
  });

  it('should be an instance of GracefulDegradationManager', () => {
    expect(degradationManager).toBeInstanceOf(GracefulDegradationManager);
  });

  it('should maintain state across calls', () => {
    degradationManager.updateServiceHealth('redis', false);
    expect(degradationManager.getDegradationLevel()).toBe(DegradationLevel.PARTIAL);
  });
});

describe('executeWithDegradation()', () => {
  beforeEach(() => {
    circuitBreakerManager.resetAll();
    degradationManager.updateServiceHealth('database', true);
    degradationManager.updateServiceHealth('redis', true);
    degradationManager.updateServiceHealth('taxjar', true);
    degradationManager.updateServiceHealth('blockchain', true);
    degradationManager.updateServiceHealth('stripe', true);
  });

  it('should execute function and return result', async () => {
    const result = await executeWithDegradation(
      'test-service',
      async () => 'success',
      'fallback'
    );
    expect(result).toBe('success');
  });

  it('should return fallback when function fails', async () => {
    const result = await executeWithDegradation(
      'failing-service',
      async () => { throw new Error('failed'); },
      'fallback value'
    );
    expect(result).toBe('fallback value');
  });

  it('should return fallback when circuit breaker is open', async () => {
    const breaker = circuitBreakerManager.getBreaker('open-circuit', {
      failureThreshold: 1,
      timeout: 10000,
    });

    await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});

    const result = await executeWithDegradation(
      'open-circuit',
      async () => 'should not run',
      'circuit open fallback'
    );
    expect(result).toBe('circuit open fallback');
  });
});

describe('calculateTaxWithFallback()', () => {
  beforeEach(() => {
    circuitBreakerManager.resetAll();
    degradationManager.updateServiceHealth('database', true);
    degradationManager.updateServiceHealth('redis', true);
    degradationManager.updateServiceHealth('taxjar', true);
    degradationManager.updateServiceHealth('blockchain', true);
    degradationManager.updateServiceHealth('stripe', true);
  });

  it('should return TaxJar result when available', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'CA',
      async () => 725
    );
    expect(result.taxCents).toBe(725);
    expect(result.source).toBe('taxjar');
  });

  it('should use fallback when TaxJar returns 0', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'CA',
      async () => 0
    );
    expect(result.source).toBe('fallback');
    expect(result.taxCents).toBe(725);
  });

  it('should use fallback when TaxJar fails', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'TX',
      async () => { throw new Error('TaxJar API error'); }
    );
    expect(result.source).toBe('fallback');
    expect(result.taxCents).toBe(625);
  });

  it('should use fallback when real_time_tax feature unavailable', async () => {
    degradationManager.updateServiceHealth('redis', false);
    
    const result = await calculateTaxWithFallback(
      10000,
      'NY',
      async () => 800
    );
    expect(result.source).toBe('fallback');
    expect(result.taxCents).toBe(400);
  });

  it('should use default rate for unknown states', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'XX',
      async () => { throw new Error('failed'); }
    );
    expect(result.source).toBe('fallback');
    expect(result.taxCents).toBe(700);
  });

  it('should calculate correct fallback for states with 0% tax', async () => {
    const zeroTaxStates = ['AK', 'DE', 'MT', 'NH', 'OR'];
    
    for (const state of zeroTaxStates) {
      const result = await calculateTaxWithFallback(
        10000,
        state,
        async () => { throw new Error('failed'); }
      );
      expect(result.taxCents).toBe(0);
    }
  });

  it('should calculate correct fallback for FL (6%)', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'FL',
      async () => { throw new Error('failed'); }
    );
    expect(result.taxCents).toBe(600);
  });

  it('should calculate correct fallback for TN (7%)', async () => {
    const result = await calculateTaxWithFallback(
      10000,
      'TN',
      async () => { throw new Error('failed'); }
    );
    expect(result.taxCents).toBe(700);
  });
});

describe('estimateGasWithFallback()', () => {
  beforeEach(() => {
    circuitBreakerManager.resetAll();
    degradationManager.updateServiceHealth('database', true);
    degradationManager.updateServiceHealth('redis', true);
    degradationManager.updateServiceHealth('taxjar', true);
    degradationManager.updateServiceHealth('blockchain', true);
    degradationManager.updateServiceHealth('stripe', true);
  });

  it('should return blockchain result when available', async () => {
    const result = await estimateGasWithFallback(
      5,
      async () => 300
    );
    expect(result.feeCents).toBe(300);
    expect(result.source).toBe('blockchain');
  });

  it('should use fallback when blockchain returns 0', async () => {
    const result = await estimateGasWithFallback(
      5,
      async () => 0
    );
    expect(result.source).toBe('fallback');
    expect(result.feeCents).toBe(250);
  });

  it('should use fallback when blockchain fails', async () => {
    const result = await estimateGasWithFallback(
      3,
      async () => { throw new Error('Blockchain error'); }
    );
    expect(result.source).toBe('fallback');
    expect(result.feeCents).toBe(150);
  });

  it('should use fallback when blockchain_minting feature unavailable', async () => {
    degradationManager.updateServiceHealth('redis', false);
    
    const result = await estimateGasWithFallback(
      10,
      async () => 1000
    );
    expect(result.source).toBe('fallback');
    expect(result.feeCents).toBe(500);
  });

  it('should calculate correct fallback for 1 ticket', async () => {
    const result = await estimateGasWithFallback(
      1,
      async () => { throw new Error('failed'); }
    );
    expect(result.feeCents).toBe(50);
  });

  it('should calculate correct fallback for 100 tickets', async () => {
    const result = await estimateGasWithFallback(
      100,
      async () => { throw new Error('failed'); }
    );
    expect(result.feeCents).toBe(5000);
  });
});

describe('getHealthStatus()', () => {
  beforeEach(() => {
    circuitBreakerManager.resetAll();
    degradationManager.updateServiceHealth('database', true);
    degradationManager.updateServiceHealth('redis', true);
    degradationManager.updateServiceHealth('taxjar', true);
    degradationManager.updateServiceHealth('blockchain', true);
    degradationManager.updateServiceHealth('stripe', true);
  });

  it('should return healthy status when all services up', () => {
    const status = getHealthStatus();
    expect(status.degradationLevel).toBe(DegradationLevel.FULL);
    expect(status.isHealthy).toBe(true);
  });

  it('should return unhealthy status when services down', () => {
    degradationManager.updateServiceHealth('redis', false);
    
    const status = getHealthStatus();
    expect(status.degradationLevel).toBe(DegradationLevel.PARTIAL);
    expect(status.isHealthy).toBe(false);
  });

  it('should include service health details', () => {
    const status = getHealthStatus();
    expect(status.serviceHealth).toBeDefined();
    expect(status.serviceHealth.database).toBe(true);
    expect(status.serviceHealth.redis).toBe(true);
    expect(status.serviceHealth.stripe).toBe(true);
  });

  it('should include circuit breaker states', () => {
    circuitBreakerManager.getBreaker('health-check-test');
    
    const status = getHealthStatus();
    expect(status.circuitBreakers).toBeDefined();
  });

  it('should reflect degraded service health', () => {
    degradationManager.updateServiceHealth('taxjar', false);
    
    const status = getHealthStatus();
    expect(status.serviceHealth.taxjar).toBe(false);
  });
});
