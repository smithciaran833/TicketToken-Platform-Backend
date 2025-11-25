import { healthCheckService } from '../../../src/services/health-check.service';
import { mailchimpSyncService } from '../../../src/services/providers/mailchimp-sync.service';
import { quickbooksSyncService } from '../../../src/services/providers/quickbooks-sync.service';
import { squareSyncService } from '../../../src/services/providers/square-sync.service';
import { stripeSyncService } from '../../../src/services/providers/stripe-sync.service';

// Mock all provider services
jest.mock('../../../src/services/providers/mailchimp-sync.service');
jest.mock('../../../src/services/providers/quickbooks-sync.service');
jest.mock('../../../src/services/providers/square-sync.service');
jest.mock('../../../src/services/providers/stripe-sync.service');

const mockedMailchimp = mailchimpSyncService as jest.Mocked<typeof mailchimpSyncService>;
const mockedQuickBooks = quickbooksSyncService as jest.Mocked<typeof quickbooksSyncService>;
const mockedSquare = squareSyncService as jest.Mocked<typeof squareSyncService>;
const mockedStripe = stripeSyncService as jest.Mocked<typeof stripeSyncService>;

describe('HealthCheckService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    healthCheckService.stopMonitoring();
  });

  afterEach(() => {
    healthCheckService.stopMonitoring();
  });

  describe('checkProvider', () => {
    it('should return healthy status for successful check', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);

      const result = await healthCheckService.checkProvider('mailchimp', 'venue-123');

      expect(result.status).toBe('healthy');
      expect(result.provider).toBe('mailchimp');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.consecutiveFailures).toBe(0);
      expect(mockedMailchimp.verifyConnection).toHaveBeenCalledWith('venue-123');
    });

    it('should return degraded status on first failure', async () => {
      mockedStripe.verifyConnection.mockResolvedValue(false);

      const result = await healthCheckService.checkProvider('stripe', 'venue-123');

      expect(result.status).toBe('degraded');
      expect(result.consecutiveFailures).toBe(1);
    });

    it('should return unhealthy status after multiple failures', async () => {
      mockedQuickBooks.verifyConnection.mockResolvedValue(false);

      // First two failures - should be degraded
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123');

      // Third failure - should be unhealthy
      const result = await healthCheckService.checkProvider('quickbooks', 'venue-123');

      expect(result.status).toBe('unhealthy');
      expect(result.consecutiveFailures).toBe(3);
    });

    it('should track consecutive failures', async () => {
      mockedSquare.verifyConnection.mockResolvedValue(false);

      let result = await healthCheckService.checkProvider('square', 'venue-123');
      expect(result.consecutiveFailures).toBe(1);

      result = await healthCheckService.checkProvider('square', 'venue-123');
      expect(result.consecutiveFailures).toBe(2);

      result = await healthCheckService.checkProvider('square', 'venue-123');
      expect(result.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures after success', async () => {
      // First failure
      mockedMailchimp.verifyConnection.mockResolvedValueOnce(false);
      let result = await healthCheckService.checkProvider('mailchimp', 'venue-123');
      expect(result.consecutiveFailures).toBe(1);

      // Success
      mockedMailchimp.verifyConnection.mockResolvedValueOnce(true);
      result = await healthCheckService.checkProvider('mailchimp', 'venue-123');
      expect(result.consecutiveFailures).toBe(0);
      expect(result.status).toBe('healthy');
    });

    it('should measure response time', async () => {
      mockedStripe.verifyConnection.mockResolvedValue(true);

      const result = await healthCheckService.checkProvider('stripe', 'venue-123');

      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.responseTime).toBe('number');
    });

    it('should handle connection errors', async () => {
      mockedMailchimp.verifyConnection.mockRejectedValue(new Error('Connection refused'));

      const result = await healthCheckService.checkProvider('mailchimp', 'venue-123');

      expect(result.status).toBe('degraded');
      expect(result.lastError).toBeDefined();
      expect(result.lastError?.message).toContain('Connection refused');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        healthCheckService.checkProvider('unknown', 'venue-123')
      ).rejects.toThrow('Unknown provider');
    });
  });

  describe('getProviderStatus', () => {
    it('should return status for checked provider', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      const status = healthCheckService.getProviderStatus('mailchimp');

      expect(status).toBeDefined();
      expect(status?.provider).toBe('mailchimp');
      expect(status?.status).toBe('healthy');
    });

    it('should return undefined for unchecked provider', () => {
      // Note: Service initializes all providers, so this might always return a value
      // Testing with a provider that doesn't get initialized
      const status = healthCheckService.getProviderStatus('unknown-provider');

      expect(status).toBeUndefined();
    });
  });

  describe('getAllStatuses', () => {
    it('should return statuses for all providers', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      mockedStripe.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123');

      const statuses = healthCheckService.getAllStatuses();

      expect(statuses.length).toBeGreaterThan(0);
      const providers = statuses.map(s => s.provider);
      expect(providers).toContain('mailchimp');
      expect(providers).toContain('stripe');
    });
  });

  describe('getOverallHealth', () => {
    it('should return healthy if all providers are healthy', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      mockedStripe.verifyConnection.mockResolvedValue(true);
      mockedQuickBooks.verifyConnection.mockResolvedValue(true);
      mockedSquare.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('square', 'venue-123');

      const health = healthCheckService.getOverallHealth();

      expect(health.status).toBe('healthy');
      expect(health.providers).toHaveLength(4);
    });

    it('should return degraded if some providers are degraded', async () => {
      // Healthy provider
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      await healthCheckService.checkProvider('mailchimp', 'venue-123');

      // Degraded provider (one failure)
      mockedStripe.verifyConnection.mockResolvedValue(false);
      await healthCheckService.checkProvider('stripe', 'venue-123');

      const health = healthCheckService.getOverallHealth();

      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy if any provider is unhealthy', async () => {
      // Healthy provider
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      await healthCheckService.checkProvider('mailchimp', 'venue-123');

      // Unhealthy provider (3 failures)
      mockedStripe.verifyConnection.mockResolvedValue(false);
      await healthCheckService.checkProvider('stripe', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123');

      const health = healthCheckService.getOverallHealth();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('startMonitoring', () => {
    it('should start periodic health checks', async () => {
      jest.useFakeTimers();
      
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      mockedStripe.verifyConnection.mockResolvedValue(true);
      mockedQuickBooks.verifyConnection.mockResolvedValue(true);
      mockedSquare.verifyConnection.mockResolvedValue(true);

      healthCheckService.startMonitoring();

      // Wait for initial check
      await Promise.resolve();
      
      expect(mockedMailchimp.verifyConnection).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should not start monitoring if already running', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      healthCheckService.startMonitoring();
      
      // Clear the first call
      consoleSpy.mockClear();
      
      // Try to start again - should be ignored
      healthCheckService.startMonitoring();

      // Should not see the "Starting" message again
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Starting provider')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop periodic health checks', () => {
      jest.useFakeTimers();

      healthCheckService.startMonitoring();
      healthCheckService.stopMonitoring();

      // Clear any pending calls
      jest.mock('../../../src/services/providers/mailchimp-sync.service');
      mockedMailchimp.verifyConnection.mockClear();

      // Advance timer - should not trigger checks
      jest.advanceTimersByTime(300000 * 2);

      expect(mockedMailchimp.verifyConnection).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('resetProviderStatus', () => {
    it('should reset provider status', async () => {
      // Create failures
      mockedMailchimp.verifyConnection.mockResolvedValue(false);
      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      await healthCheckService.checkProvider('mailchimp', 'venue-123');

      let status = healthCheckService.getProviderStatus('mailchimp');
      expect(status?.consecutiveFailures).toBe(2);
      expect(status?.status).toBe('degraded');

      // Reset
      healthCheckService.resetProviderStatus('mailchimp');

      status = healthCheckService.getProviderStatus('mailchimp');
      expect(status?.consecutiveFailures).toBe(0);
      expect(status?.status).toBe('healthy');
      expect(status?.lastError).toBeUndefined();
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for healthy provider', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      await healthCheckService.checkProvider('mailchimp', 'venue-123');

      const available = healthCheckService.isProviderAvailable('mailchimp');

      expect(available).toBe(true);
    });

    it('should return true for degraded provider', async () => {
      mockedStripe.verifyConnection.mockResolvedValue(false);
      await healthCheckService.checkProvider('stripe', 'venue-123');

      const available = healthCheckService.isProviderAvailable('stripe');

      expect(available).toBe(true); // Degraded is still available
    });

    it('should return false for unhealthy provider', async () => {
      mockedQuickBooks.verifyConnection.mockResolvedValue(false);
      // 3 failures to make it unhealthy
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123');

      const available = healthCheckService.isProviderAvailable('quickbooks');

      expect(available).toBe(false);
    });
  });

  describe('getHealthMetrics', () => {
    it('should return health metrics summary', async () => {
      // Set up different health states
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      mockedStripe.verifyConnection.mockResolvedValue(false);
      mockedQuickBooks.verifyConnection.mockResolvedValue(false);
      mockedSquare.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123'); // degraded
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123');
      await healthCheckService.checkProvider('quickbooks', 'venue-123'); // unhealthy
      await healthCheckService.checkProvider('square', 'venue-123');

      const metrics = healthCheckService.getHealthMetrics();

      expect(metrics.totalProviders).toBe(4);
      expect(metrics.healthy).toBeGreaterThanOrEqual(0);
      expect(metrics.degraded).toBeGreaterThanOrEqual(0);
      expect(metrics.unhealthy).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.averageResponseTime).toBe('number');
    });

    it('should calculate average response time', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);
      mockedStripe.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      await healthCheckService.checkProvider('stripe', 'venue-123');

      const metrics = healthCheckService.getHealthMetrics();

      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Provider-specific checks', () => {
    it('should check Mailchimp provider', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('mailchimp', 'venue-123');

      expect(mockedMailchimp.verifyConnection).toHaveBeenCalledWith('venue-123');
    });

    it('should check QuickBooks provider', async () => {
      mockedQuickBooks.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('quickbooks', 'venue-123');

      expect(mockedQuickBooks.verifyConnection).toHaveBeenCalledWith('venue-123');
    });

    it('should check Square provider', async () => {
      mockedSquare.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('square', 'venue-123');

      expect(mockedSquare.verifyConnection).toHaveBeenCalledWith('venue-123');
    });

    it('should check Stripe provider', async () => {
      mockedStripe.verifyConnection.mockResolvedValue(true);

      await healthCheckService.checkProvider('stripe', 'venue-123');

      expect(mockedStripe.verifyConnection).toHaveBeenCalledWith('venue-123');
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockedMailchimp.verifyConnection.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await healthCheckService.checkProvider('mailchimp', 'venue-123');

      expect(result.status).toBe('degraded');
      expect(result.lastError).toBeDefined();
      expect(result.lastError?.message).toContain('ECONNREFUSED');
    });

    it('should handle timeout errors', async () => {
      mockedStripe.verifyConnection.mockRejectedValue(new Error('timeout exceeded'));

      const result = await healthCheckService.checkProvider('stripe', 'venue-123');

      expect(result.status).toBe('degraded');
      expect(result.lastError?.message).toContain('timeout');
    });

    it('should store error timestamp', async () => {
      mockedQuickBooks.verifyConnection.mockRejectedValue(new Error('Test error'));

      const before = new Date();
      const result = await healthCheckService.checkProvider('quickbooks', 'venue-123');
      const after = new Date();

      expect(result.lastError?.timestamp).toBeInstanceOf(Date);
      expect(result.lastError!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastError!.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Health state tracking', () => {
    it('should track last check time', async () => {
      mockedMailchimp.verifyConnection.mockResolvedValue(true);

      const before = new Date();
      await healthCheckService.checkProvider('mailchimp', 'venue-123');
      const after = new Date();

      const status = healthCheckService.getProviderStatus('mailchimp');

      expect(status?.lastChecked).toBeInstanceOf(Date);
      expect(status!.lastChecked.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status!.lastChecked.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should track last successful check', async () => {
      mockedStripe.verifyConnection.mockResolvedValue(true);

      const before = new Date();
      await healthCheckService.checkProvider('stripe', 'venue-123');
      const after = new Date();

      const status = healthCheckService.getProviderStatus('stripe');

      expect(status?.lastSuccessful).toBeInstanceOf(Date);
      expect(status!.lastSuccessful!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status!.lastSuccessful!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
