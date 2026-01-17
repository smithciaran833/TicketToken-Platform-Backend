import { LoadBalancerService } from '../../../src/services/load-balancer.service';
import { ServiceInstance } from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('LoadBalancerService', () => {
  let loadBalancer: LoadBalancerService;
  let healthyInstances: ServiceInstance[];
  let mixedInstances: ServiceInstance[];

  beforeEach(() => {
    loadBalancer = new LoadBalancerService();

    healthyInstances = [
      { id: 'instance-1', name: 'service-1', address: 'http://service-1', port: 3001, healthy: true },
      { id: 'instance-2', name: 'service-2', address: 'http://service-2', port: 3001, healthy: true },
      { id: 'instance-3', name: 'service-3', address: 'http://service-3', port: 3001, healthy: true },
    ];

    mixedInstances = [
      { id: 'instance-1', name: 'service-1', address: 'http://service-1', port: 3001, healthy: true },
      { id: 'instance-2', name: 'service-2', address: 'http://service-2', port: 3001, healthy: false },
      { id: 'instance-3', name: 'service-3', address: 'http://service-3', port: 3001, healthy: true },
    ];
  });

  describe('selectInstance', () => {
    it('throws error when no instances available', () => {
      expect(() => {
        loadBalancer.selectInstance('auth-service', [], 'round-robin');
      }).toThrow('No instances available for service: auth-service');
    });

    it('filters out unhealthy instances', () => {
      const selected = loadBalancer.selectInstance('auth-service', mixedInstances, 'round-robin');

      expect(selected.healthy).toBe(true);
      expect(['instance-1', 'instance-3']).toContain(selected.id);
    });

    it('uses all instances when no healthy instances available', () => {
      const unhealthyInstances: ServiceInstance[] = [
        { id: 'instance-1', name: 'service-1', address: 'http://service-1', port: 3001, healthy: false },
        { id: 'instance-2', name: 'service-2', address: 'http://service-2', port: 3001, healthy: false },
      ];

      const selected = loadBalancer.selectInstance('auth-service', unhealthyInstances, 'round-robin');

      expect(['instance-1', 'instance-2']).toContain(selected.id);
    });

    it('defaults to round-robin strategy when not specified', () => {
      const first = loadBalancer.selectInstance('auth-service', healthyInstances);
      const second = loadBalancer.selectInstance('auth-service', healthyInstances);
      const third = loadBalancer.selectInstance('auth-service', healthyInstances);

      expect(first.id).toBe('instance-1');
      expect(second.id).toBe('instance-2');
      expect(third.id).toBe('instance-3');
    });
  });

  describe('round-robin strategy', () => {
    it('cycles through instances sequentially', () => {
      const results = [];
      for (let i = 0; i < 6; i++) {
        const selected = loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
        results.push(selected.id);
      }

      expect(results).toEqual([
        'instance-1',
        'instance-2',
        'instance-3',
        'instance-1',
        'instance-2',
        'instance-3',
      ]);
    });

    it('maintains separate counters for different services', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');

      loadBalancer.selectInstance('venue-service', healthyInstances, 'round-robin');
      const venueResult = loadBalancer.selectInstance('venue-service', healthyInstances, 'round-robin');

      const authResult = loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');

      expect(authResult.id).toBe('instance-3');
      expect(venueResult.id).toBe('instance-2');
    });

    it('wraps around correctly when reaching end', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');

      const result = loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      expect(result.id).toBe('instance-1');
    });

    it('handles single instance correctly', () => {
      const singleInstance = [healthyInstances[0]];

      const first = loadBalancer.selectInstance('auth-service', singleInstance, 'round-robin');
      const second = loadBalancer.selectInstance('auth-service', singleInstance, 'round-robin');

      expect(first.id).toBe('instance-1');
      expect(second.id).toBe('instance-1');
    });
  });

  describe('least-connections strategy', () => {
    it('selects instance with least connections', () => {
      const first = loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      expect(first.id).toBe('instance-1');

      const second = loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      expect(second.id).toBe('instance-2');

      const third = loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      expect(third.id).toBe('instance-3');
    });

    it('increments connection count on selection', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections['instance-1']).toBe(1);
      expect(state['auth-service'].connections['instance-2']).toBe(1);
      expect(state['auth-service'].connections['instance-3']).toBe(1);
    });

    it('balances connections evenly across instances', () => {
      for (let i = 0; i < 9; i++) {
        loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      }

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections['instance-1']).toBe(3);
      expect(state['auth-service'].connections['instance-2']).toBe(3);
      expect(state['auth-service'].connections['instance-3']).toBe(3);
    });

    it('maintains separate connection counts per service', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('venue-service', healthyInstances, 'least-connections');

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections['instance-1']).toBe(1);
      expect(state['venue-service'].connections['instance-1']).toBe(1);
    });

    it('handles instance with no prior connections', () => {
      const newInstances: ServiceInstance[] = [
        ...healthyInstances,
        { id: 'instance-4', name: 'service-4', address: 'http://service-4', port: 3001, healthy: true },
      ];

      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      const result = loadBalancer.selectInstance('auth-service', newInstances, 'least-connections');

      expect(['instance-2', 'instance-3', 'instance-4']).toContain(result.id);
    });
  });

  describe('random strategy', () => {
    it('selects from available instances', () => {
      const selected = loadBalancer.selectInstance('auth-service', healthyInstances, 'random');

      expect(['instance-1', 'instance-2', 'instance-3']).toContain(selected.id);
    });

    it('distributes selections across instances over time', () => {
      const counts = new Map<string, number>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const selected = loadBalancer.selectInstance('auth-service', healthyInstances, 'random');
        counts.set(selected.id, (counts.get(selected.id) || 0) + 1);
      }

      const expectedCount = iterations / 3;
      const tolerance = expectedCount * 0.3;

      for (const instance of healthyInstances) {
        const count = counts.get(instance.id) || 0;
        expect(count).toBeGreaterThan(expectedCount - tolerance);
        expect(count).toBeLessThan(expectedCount + tolerance);
      }
    });

    it('handles single instance', () => {
      const singleInstance = [healthyInstances[0]];
      const selected = loadBalancer.selectInstance('auth-service', singleInstance, 'random');

      expect(selected.id).toBe('instance-1');
    });
  });

  describe('consistent-hash strategy', () => {
    it('returns same instance for same session key', () => {
      const first = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'consistent-hash',
        'user-123'
      );
      const second = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'consistent-hash',
        'user-123'
      );

      expect(first.id).toBe(second.id);
    });

    it('distributes different session keys across instances', () => {
      // Use more varied session keys to ensure distribution
      const sessions = Array.from({ length: 30 }, (_, i) => `user-${i * 100}`);
      const selections = new Set<string>();

      for (const session of sessions) {
        const selected = loadBalancer.selectInstance(
          'auth-service',
          healthyInstances,
          'consistent-hash',
          session
        );
        selections.add(selected.id);
      }

      // With 30 varied keys and 3 instances, we should get at least 2 different instances
      expect(selections.size).toBeGreaterThan(1);
    });

    it('falls back to random when no session key provided', () => {
      const selected = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'consistent-hash'
      );

      expect(['instance-1', 'instance-2', 'instance-3']).toContain(selected.id);
    });

    it('maintains consistency when instance list changes', () => {
      const first = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'consistent-hash',
        'user-123'
      );

      const reducedInstances = healthyInstances.slice(0, 2);
      const second = loadBalancer.selectInstance(
        'auth-service',
        reducedInstances,
        'consistent-hash',
        'user-123'
      );

      expect(['instance-1', 'instance-2']).toContain(second.id);
    });

    it('handles hash collisions gracefully', () => {
      const selected = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'consistent-hash',
        'collision-test-key'
      );

      expect(healthyInstances.some(i => i.id === selected.id)).toBe(true);
    });
  });

  describe('releaseConnection', () => {
    it('decrements connection count for least-connections', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      loadBalancer.releaseConnection('auth-service', 'instance-1');

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections['instance-1']).toBe(0);
      expect(state['auth-service'].connections['instance-2']).toBe(1);
      expect(state['auth-service'].connections['instance-3']).toBe(1);
    });

    it('does not decrement below zero', () => {
      loadBalancer.releaseConnection('auth-service', 'instance-1');
      loadBalancer.releaseConnection('auth-service', 'instance-1');

      const state = loadBalancer.getState();
      expect(state['auth-service']).toBeUndefined();
    });

    it('handles release for non-existent service gracefully', () => {
      expect(() => {
        loadBalancer.releaseConnection('non-existent-service', 'instance-1');
      }).not.toThrow();
    });

    it('handles release for non-existent instance gracefully', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      expect(() => {
        loadBalancer.releaseConnection('auth-service', 'non-existent-instance');
      }).not.toThrow();
    });

    it('properly tracks multiple acquire and release cycles', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      loadBalancer.releaseConnection('auth-service', 'instance-1');
      loadBalancer.releaseConnection('auth-service', 'instance-2');

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections['instance-1']).toBe(1);
      expect(state['auth-service'].connections['instance-2']).toBe(0);
      expect(state['auth-service'].connections['instance-3']).toBe(1);
    });
  });

  describe('reset', () => {
    it('resets counters for specific service', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('venue-service', healthyInstances, 'round-robin');

      loadBalancer.reset('auth-service');

      const state = loadBalancer.getState();
      expect(state['auth-service']).toBeUndefined();
      expect(state['venue-service']).toBeDefined();
    });

    it('resets all counters when no service specified', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('venue-service', healthyInstances, 'round-robin');

      loadBalancer.reset();

      const state = loadBalancer.getState();
      expect(Object.keys(state)).toHaveLength(0);
    });

    it('resets round-robin counter', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');

      loadBalancer.reset('auth-service');

      const selected = loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      expect(selected.id).toBe('instance-1');
    });

    it('resets least-connections map', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      loadBalancer.reset('auth-service');

      const state = loadBalancer.getState();
      expect(state['auth-service']).toBeUndefined();
    });
  });

  describe('getState', () => {
    it('returns empty state initially', () => {
      const state = loadBalancer.getState();
      expect(state).toEqual({});
    });

    it('returns round-robin counter state', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');

      const state = loadBalancer.getState();
      expect(state['auth-service'].roundRobinCounter).toBe(2);
    });

    it('returns connection counts state', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');
      loadBalancer.selectInstance('auth-service', healthyInstances, 'least-connections');

      const state = loadBalancer.getState();
      expect(state['auth-service'].connections).toEqual({
        'instance-1': 1,
        'instance-2': 1,
        'instance-3': 1,
      });
    });

    it('returns state for multiple services', () => {
      loadBalancer.selectInstance('auth-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('venue-service', healthyInstances, 'round-robin');
      loadBalancer.selectInstance('venue-service', healthyInstances, 'least-connections');

      const state = loadBalancer.getState();
      expect(state['auth-service']).toBeDefined();
      expect(state['venue-service']).toBeDefined();
    });
  });

  describe('unknown strategy fallback', () => {
    it('falls back to round-robin for unknown strategy', () => {
      const first = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'unknown-strategy' as any
      );
      const second = loadBalancer.selectInstance(
        'auth-service',
        healthyInstances,
        'unknown-strategy' as any
      );

      expect(first.id).toBe('instance-1');
      expect(second.id).toBe('instance-2');
    });
  });
});
