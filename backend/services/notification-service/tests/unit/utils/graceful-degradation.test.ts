import {
  degradationManager,
  DegradationMode,
  DEGRADATION_ERROR_MESSAGES,
  DEGRADATION_STATUS_CODES,
} from '../../../src/utils/graceful-degradation';
import { metricsService } from '../../../src/services/metrics.service';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    setGauge: jest.fn(),
    incrementCounter: jest.fn(),
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Graceful Degradation Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    degradationManager.reset();
  });

  describe('Service Health Updates', () => {
    it('should start in NORMAL mode with all services healthy', () => {
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.NORMAL);
      expect(degradationManager.canHandleRequests()).toBe(true);
    });

    it('should transition to CRITICAL when database is down', () => {
      degradationManager.updateServiceHealth('database', false);

      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.CRITICAL);
      expect(degradationManager.canHandleRequests()).toBe(false);
    });

    it('should transition to DEGRADED when Redis is down', () => {
      degradationManager.updateServiceHealth('redis', false);

      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);
      expect(degradationManager.canHandleRequests()).toBe(true);
    });

    it('should transition to DEGRADED when both notification providers are down', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);

      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);
    });

    it('should transition to PARTIAL when only one provider is down', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.PARTIAL);
      expect(degradationManager.canHandleRequests()).toBe(true);
    });

    it('should log service health changes', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(logger.info).toHaveBeenCalledWith('Service health changed: email', {
        from: 'healthy',
        to: 'unhealthy',
      });
    });

    it('should not log if health status unchanged', () => {
      degradationManager.updateServiceHealth('email', true);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('Degradation Mode Transitions', () => {
    it('should track mode changes in metrics', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(metricsService.setGauge).toHaveBeenCalledWith(
        'degradation_mode',
        1, // PARTIAL = 1
        { mode: DegradationMode.PARTIAL }
      );

      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'degradation_mode_changes_total',
        {
          from: DegradationMode.NORMAL,
          to: DegradationMode.PARTIAL,
        }
      );
    });

    it('should transition from PARTIAL to DEGRADED', () => {
      degradationManager.updateServiceHealth('email', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.PARTIAL);

      degradationManager.updateServiceHealth('sms', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);
    });

    it('should recover from DEGRADED to PARTIAL', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);

      degradationManager.updateServiceHealth('email', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.PARTIAL);
    });

    it('should recover from PARTIAL to NORMAL', () => {
      degradationManager.updateServiceHealth('email', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.PARTIAL);

      degradationManager.updateServiceHealth('email', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.NORMAL);
    });

    it('should recover from CRITICAL to NORMAL', () => {
      degradationManager.updateServiceHealth('database', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.CRITICAL);

      degradationManager.updateServiceHealth('database', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.NORMAL);
    });
  });

  describe('Feature Availability', () => {
    it('should report all features available in NORMAL mode', () => {
      expect(degradationManager.isFeatureAvailable('email')).toBe(true);
      expect(degradationManager.isFeatureAvailable('sms')).toBe(true);
      expect(degradationManager.isFeatureAvailable('database')).toBe(true);
      expect(degradationManager.isFeatureAvailable('redis')).toBe(true);
    });

    it('should report email unavailable when down', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(degradationManager.isFeatureAvailable('email')).toBe(false);
      expect(degradationManager.isFeatureAvailable('sms')).toBe(true);
    });

    it('should report database unavailable when down', () => {
      degradationManager.updateServiceHealth('database', false);

      expect(degradationManager.isFeatureAvailable('database')).toBe(false);
    });
  });

  describe('Request Queuing Logic', () => {
    it('should not queue requests in NORMAL mode', () => {
      expect(degradationManager.shouldQueueRequest('high')).toBe(false);
      expect(degradationManager.shouldQueueRequest('medium')).toBe(false);
      expect(degradationManager.shouldQueueRequest('low')).toBe(false);
    });

    it('should not queue requests in PARTIAL mode', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(degradationManager.shouldQueueRequest('high')).toBe(false);
      expect(degradationManager.shouldQueueRequest('medium')).toBe(false);
      expect(degradationManager.shouldQueueRequest('low')).toBe(false);
    });

    it('should queue low-priority requests in DEGRADED mode', () => {
      degradationManager.updateServiceHealth('redis', false);

      expect(degradationManager.shouldQueueRequest('high')).toBe(false);
      expect(degradationManager.shouldQueueRequest('medium')).toBe(false);
      expect(degradationManager.shouldQueueRequest('low')).toBe(true);
    });

    it('should queue non-high-priority requests in CRITICAL mode', () => {
      degradationManager.updateServiceHealth('database', false);

      expect(degradationManager.shouldQueueRequest('high')).toBe(false);
      expect(degradationManager.shouldQueueRequest('medium')).toBe(true);
      expect(degradationManager.shouldQueueRequest('low')).toBe(true);
    });
  });

  describe('Fallback Strategy', () => {
    it('should use primary channel when available', () => {
      const strategy = degradationManager.getFallbackStrategy('email');

      expect(strategy.useChannel).toBe('email');
      expect(strategy.shouldQueue).toBe(false);
      expect(strategy.reason).toBe('primary_channel_available');
    });

    it('should fallback to alternative channel', () => {
      degradationManager.updateServiceHealth('email', false);

      const strategy = degradationManager.getFallbackStrategy('email');

      expect(strategy.useChannel).toBe('sms');
      expect(strategy.shouldQueue).toBe(false);
      expect(strategy.reason).toBe('fallback_channel_available');

      expect(logger.info).toHaveBeenCalledWith('Using fallback channel', {
        requested: 'email',
        fallback: 'sms',
      });

      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'fallback_channel_used_total',
        { from: 'email', to: 'sms' }
      );
    });

    it('should queue when all channels unavailable', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);

      const strategy = degradationManager.getFallbackStrategy('email');

      expect(strategy.useChannel).toBeNull();
      expect(strategy.shouldQueue).toBe(true);
      expect(strategy.reason).toBe('all_channels_unavailable');

      expect(logger.warn).toHaveBeenCalledWith(
        'All notification channels unavailable, queueing request',
        expect.any(Object)
      );

      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'notifications_queued_due_to_degradation_total',
        { channel: 'email' }
      );
    });

    it('should fallback from SMS to email', () => {
      degradationManager.updateServiceHealth('sms', false);

      const strategy = degradationManager.getFallbackStrategy('sms');

      expect(strategy.useChannel).toBe('email');
      expect(strategy.reason).toBe('fallback_channel_available');
    });
  });

  describe('Status Messages', () => {
    it('should provide correct message for NORMAL mode', () => {
      expect(degradationManager.getDegradationMessage()).toBe('All systems operational');
    });

    it('should provide correct message for PARTIAL mode', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(degradationManager.getDegradationMessage()).toBe(
        'Some features may be unavailable. Service running in partial mode.'
      );
    });

    it('should provide correct message for DEGRADED mode', () => {
      degradationManager.updateServiceHealth('redis', false);

      expect(degradationManager.getDegradationMessage()).toBe(
        'Service experiencing issues. Some features unavailable.'
      );
    });

    it('should provide correct message for CRITICAL mode', () => {
      degradationManager.updateServiceHealth('database', false);

      expect(degradationManager.getDegradationMessage()).toBe(
        'Service temporarily unavailable. Please try again later.'
      );
    });
  });

  describe('Recommended Actions', () => {
    it('should recommend no action in NORMAL mode', () => {
      expect(degradationManager.getRecommendedAction()).toBe('none');
    });

    it('should recommend alternative channel in PARTIAL mode', () => {
      degradationManager.updateServiceHealth('email', false);

      expect(degradationManager.getRecommendedAction()).toBe(
        'Use alternative notification channel if available'
      );
    });

    it('should recommend critical only in DEGRADED mode', () => {
      degradationManager.updateServiceHealth('redis', false);

      expect(degradationManager.getRecommendedAction()).toBe(
        'Critical notifications only. Queue non-critical requests.'
      );
    });

    it('should recommend queue all in CRITICAL mode', () => {
      degradationManager.updateServiceHealth('database', false);

      expect(degradationManager.getRecommendedAction()).toBe(
        'Queue all requests for later processing'
      );
    });
  });

  describe('Status Report', () => {
    it('should provide comprehensive status report', () => {
      degradationManager.updateServiceHealth('email', false);

      const report = degradationManager.getStatusReport();

      expect(report.mode).toBe(DegradationMode.PARTIAL);
      expect(report.canHandleRequests).toBe(true);
      expect(report.message).toBeTruthy();
      expect(report.recommendedAction).toBeTruthy();
      expect(report.serviceHealth).toEqual({
        database: true,
        redis: true,
        email: false,
        sms: true,
      });
    });

    it('should reflect CRITICAL status', () => {
      degradationManager.updateServiceHealth('database', false);

      const report = degradationManager.getStatusReport();

      expect(report.mode).toBe(DegradationMode.CRITICAL);
      expect(report.canHandleRequests).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have error messages for all modes', () => {
      expect(DEGRADATION_ERROR_MESSAGES[DegradationMode.NORMAL]).toBeNull();
      expect(DEGRADATION_ERROR_MESSAGES[DegradationMode.PARTIAL]).toBeTruthy();
      expect(DEGRADATION_ERROR_MESSAGES[DegradationMode.DEGRADED]).toBeTruthy();
      expect(DEGRADATION_ERROR_MESSAGES[DegradationMode.CRITICAL]).toBeTruthy();
    });

    it('should have status codes for all modes', () => {
      expect(DEGRADATION_STATUS_CODES[DegradationMode.NORMAL]).toBe(200);
      expect(DEGRADATION_STATUS_CODES[DegradationMode.PARTIAL]).toBe(200);
      expect(DEGRADATION_STATUS_CODES[DegradationMode.DEGRADED]).toBe(202);
      expect(DEGRADATION_STATUS_CODES[DegradationMode.CRITICAL]).toBe(503);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to NORMAL mode', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);

      degradationManager.reset();

      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.NORMAL);
      expect(degradationManager.isFeatureAvailable('email')).toBe(true);
      expect(degradationManager.isFeatureAvailable('sms')).toBe(true);
    });
  });

  describe('Complex Degradation Scenarios', () => {
    it('should handle multiple simultaneous failures', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('redis', false);

      // Redis down overrides single provider down
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);
    });

    it('should prioritize database failure over others', () => {
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);

      degradationManager.updateServiceHealth('database', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.CRITICAL);
    });

    it('should recover services in sequence', () => {
      // All down
      degradationManager.updateServiceHealth('database', false);
      degradationManager.updateServiceHealth('redis', false);
      degradationManager.updateServiceHealth('email', false);
      degradationManager.updateServiceHealth('sms', false);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.CRITICAL);

      // Database recovers
      degradationManager.updateServiceHealth('database', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED);

      // One provider recovers
      degradationManager.updateServiceHealth('email', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.DEGRADED); // Still degraded due to Redis

      // Redis recovers
      degradationManager.updateServiceHealth('redis', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.PARTIAL); // Still missing SMS

      // SMS recovers
      degradationManager.updateServiceHealth('sms', true);
      expect(degradationManager.getCurrentMode()).toBe(DegradationMode.NORMAL);
    });
  });
});
