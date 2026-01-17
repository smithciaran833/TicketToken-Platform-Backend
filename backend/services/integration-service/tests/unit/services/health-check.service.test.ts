// Mock provider sync services BEFORE imports
const mockMailchimpVerify = jest.fn();
const mockQuickbooksVerify = jest.fn();
const mockSquareVerify = jest.fn();
const mockStripeVerify = jest.fn();

jest.mock('../../../src/services/providers/mailchimp-sync.service', () => ({
  mailchimpSyncService: {
    verifyConnection: mockMailchimpVerify,
  },
}));

jest.mock('../../../src/services/providers/quickbooks-sync.service', () => ({
  quickbooksSyncService: {
    verifyConnection: mockQuickbooksVerify,
  },
}));

jest.mock('../../../src/services/providers/square-sync.service', () => ({
  squareSyncService: {
    verifyConnection: mockSquareVerify,
  },
}));

jest.mock('../../../src/services/providers/stripe-sync.service', () => ({
  stripeSyncService: {
    verifyConnection: mockStripeVerify,
  },
}));

import { HealthCheckService, healthCheckService } from '../../../src/services/health-check.service';

describe('HealthCheckService', () => {
  let service: HealthCheckService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new HealthCheckService();
  });

  afterEach(() => {
    service.stopMonitoring();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize health statuses for all providers', () => {
      const statuses = service.getAllStatuses();

      expect(statuses).toHaveLength(4);
      expect(statuses.map(s => s.provider).sort()).toEqual([
        'mailchimp', 'quickbooks', 'square', 'stripe'
      ].sort());
    });

    it('should initialize all providers as healthy', () => {
      const statuses = service.getAllStatuses();

      for (const status of statuses) {
        expect(status.status).toBe('healthy');
        expect(status.consecutiveFailures).toBe(0);
      }
    });
  });

  describe('startMonitoring', () => {
    it('should start periodic health checks', () => {
      mockMailchimpVerify.mockResolvedValue(true);
      mockQuickbooksVerify.mockResolvedValue(true);
      mockSquareVerify.mockResolvedValue(true);
      mockStripeVerify.mockResolvedValue(true);

      service.startMonitoring();

      // Should run initial check
      expect(mockMailchimpVerify).toHaveBeenCalled();
    });

    it('should not start multiple monitors', () => {
      mockMailchimpVerify.mockResolvedValue(true);
      mockQuickbooksVerify.mockResolvedValue(true);
      mockSquareVerify.mockResolvedValue(true);
      mockStripeVerify.mockResolvedValue(true);

      service.startMonitoring();
      const callCount = mockMailchimpVerify.mock.calls.length;

      service.startMonitoring(); // Second call should be ignored

      expect(mockMailchimpVerify.mock.calls.length).toBe(callCount);
    });

    it('should run checks at configured interval', async () => {
      mockMailchimpVerify.mockResolvedValue(true);
      mockQuickbooksVerify.mockResolvedValue(true);
      mockSquareVerify.mockResolvedValue(true);
      mockStripeVerify.mockResolvedValue(true);

      service.startMonitoring();

      // Clear initial call counts
      jest.clearAllMocks();

      // Advance time by 5 minutes (CHECK_INTERVAL_MS)
      jest.advanceTimersByTime(300000);

      expect(mockMailchimpVerify).toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop periodic health checks', () => {
      mockMailchimpVerify.mockResolvedValue(true);
      mockQuickbooksVerify.mockResolvedValue(true);
      mockSquareVerify.mockResolvedValue(true);
      mockStripeVerify.mockResolvedValue(true);

      service.startMonitoring();
      service.stopMonitoring();

      jest.clearAllMocks();
      jest.advanceTimersByTime(300000);

      expect(mockMailchimpVerify).not.toHaveBeenCalled();
    });

    it('should handle stopping when not monitoring', () => {
      expect(() => service.stopMonitoring()).not.toThrow();
    });
  });

  describe('checkProvider', () => {
    it('should mark provider as healthy on successful check', async () => {
      mockStripeVerify.mockResolvedValue(true);

      const status = await service.checkProvider('stripe', 'venue-123');

      expect(status.status).toBe('healthy');
      expect(status.consecutiveFailures).toBe(0);
      expect(status.lastSuccessful).toBeDefined();
      expect(status.responseTime).toBeDefined();
    });

    it('should mark provider as degraded on first failure', async () => {
      mockStripeVerify.mockResolvedValue(false);

      const status = await service.checkProvider('stripe', 'venue-123');

      expect(status.status).toBe('degraded');
      expect(status.consecutiveFailures).toBe(1);
    });

    it('should mark provider as unhealthy after 3 consecutive failures', async () => {
      mockStripeVerify.mockResolvedValue(false);

      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      const status = await service.checkProvider('stripe', 'venue-123');

      expect(status.status).toBe('unhealthy');
      expect(status.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      mockStripeVerify.mockResolvedValue(true);
      const status = await service.checkProvider('stripe', 'venue-123');

      expect(status.status).toBe('healthy');
      expect(status.consecutiveFailures).toBe(0);
    });

    it('should handle errors and mark as degraded/unhealthy', async () => {
      mockStripeVerify.mockRejectedValue(new Error('Connection refused'));

      const status = await service.checkProvider('stripe', 'venue-123');

      expect(status.status).toBe('degraded');
      expect(status.lastError).toBeDefined();
      expect(status.lastError!.message).toBe('Connection refused');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        service.checkProvider('unknown', 'venue-123')
      ).rejects.toThrow('Unknown provider: unknown');
    });

    it('should check mailchimp provider', async () => {
      mockMailchimpVerify.mockResolvedValue(true);

      await service.checkProvider('mailchimp', 'venue-123');

      expect(mockMailchimpVerify).toHaveBeenCalledWith('venue-123');
    });

    it('should check quickbooks provider', async () => {
      mockQuickbooksVerify.mockResolvedValue(true);

      await service.checkProvider('quickbooks', 'venue-123');

      expect(mockQuickbooksVerify).toHaveBeenCalledWith('venue-123');
    });

    it('should check square provider', async () => {
      mockSquareVerify.mockResolvedValue(true);

      await service.checkProvider('square', 'venue-123');

      expect(mockSquareVerify).toHaveBeenCalledWith('venue-123');
    });

    it('should track response time', async () => {
      mockStripeVerify.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      jest.useRealTimers(); // Need real timers for this test
      const status = await service.checkProvider('stripe', 'venue-123');
      jest.useFakeTimers();

      expect(status.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkAllProviders', () => {
    it('should check all providers', async () => {
      mockMailchimpVerify.mockResolvedValue(true);
      mockQuickbooksVerify.mockResolvedValue(true);
      mockSquareVerify.mockResolvedValue(true);
      mockStripeVerify.mockResolvedValue(true);

      await service.checkAllProviders();

      expect(mockMailchimpVerify).toHaveBeenCalled();
      expect(mockQuickbooksVerify).toHaveBeenCalled();
      expect(mockSquareVerify).toHaveBeenCalled();
      expect(mockStripeVerify).toHaveBeenCalled();
    });
  });

  describe('getProviderStatus', () => {
    it('should return status for existing provider', () => {
      const status = service.getProviderStatus('stripe');

      expect(status).toBeDefined();
      expect(status!.provider).toBe('stripe');
    });

    it('should return undefined for non-existent provider', () => {
      const status = service.getProviderStatus('unknown');

      expect(status).toBeUndefined();
    });
  });

  describe('getAllStatuses', () => {
    it('should return all provider statuses', () => {
      const statuses = service.getAllStatuses();

      expect(statuses).toHaveLength(4);
    });
  });

  describe('getOverallHealth', () => {
    it('should return healthy when all providers healthy', () => {
      const health = service.getOverallHealth();

      expect(health.status).toBe('healthy');
      expect(health.providers).toHaveLength(4);
    });

    it('should return degraded when any provider degraded', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');

      const health = service.getOverallHealth();

      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy when any provider unhealthy', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      const health = service.getOverallHealth();

      expect(health.status).toBe('unhealthy');
    });

    it('should prioritize unhealthy over degraded', async () => {
      mockStripeVerify.mockResolvedValue(false);
      mockSquareVerify.mockResolvedValue(false);

      // Make stripe unhealthy (3 failures)
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      // Make square degraded (1 failure)
      await service.checkProvider('square', 'venue-123');

      const health = service.getOverallHealth();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('resetProviderStatus', () => {
    it('should reset provider to healthy', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      service.resetProviderStatus('stripe');

      const status = service.getProviderStatus('stripe');
      expect(status!.status).toBe('healthy');
      expect(status!.consecutiveFailures).toBe(0);
      expect(status!.lastError).toBeUndefined();
    });

    it('should handle resetting non-existent provider', () => {
      expect(() => service.resetProviderStatus('unknown')).not.toThrow();
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for healthy provider', () => {
      expect(service.isProviderAvailable('stripe')).toBe(true);
    });

    it('should return true for degraded provider', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');

      expect(service.isProviderAvailable('stripe')).toBe(true);
    });

    it('should return false for unhealthy provider', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      expect(service.isProviderAvailable('stripe')).toBe(false);
    });

    it('should return true for unknown provider (status is undefined, not unhealthy)', () => {
      // Implementation: status?.status !== 'unhealthy'
      // When status is undefined, undefined !== 'unhealthy' is true
      expect(service.isProviderAvailable('unknown')).toBe(true);
    });
  });

  describe('getHealthMetrics', () => {
    it('should return correct counts when all healthy', () => {
      const metrics = service.getHealthMetrics();

      expect(metrics.totalProviders).toBe(4);
      expect(metrics.healthy).toBe(4);
      expect(metrics.degraded).toBe(0);
      expect(metrics.unhealthy).toBe(0);
    });

    it('should count degraded providers', async () => {
      mockStripeVerify.mockResolvedValue(false);
      mockSquareVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('square', 'venue-123');

      const metrics = service.getHealthMetrics();

      expect(metrics.healthy).toBe(2);
      expect(metrics.degraded).toBe(2);
    });

    it('should count unhealthy providers', async () => {
      mockStripeVerify.mockResolvedValue(false);
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('stripe', 'venue-123');

      const metrics = service.getHealthMetrics();

      expect(metrics.unhealthy).toBe(1);
    });

    it('should calculate average response time', async () => {
      mockStripeVerify.mockResolvedValue(true);
      mockMailchimpVerify.mockResolvedValue(true);

      jest.useRealTimers();
      await service.checkProvider('stripe', 'venue-123');
      await service.checkProvider('mailchimp', 'venue-123');
      jest.useFakeTimers();

      const metrics = service.getHealthMetrics();

      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 average when no response times', () => {
      const metrics = service.getHealthMetrics();

      expect(metrics.averageResponseTime).toBe(0);
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(healthCheckService).toBeInstanceOf(HealthCheckService);
    });
  });
});
