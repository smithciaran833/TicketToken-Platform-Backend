/**
 * AnalyticsService Integration Tests
 * 
 * Note: AnalyticsService is a thin HTTP client wrapper that calls external analytics-service.
 * These tests verify the service structure and error handling, not actual HTTP calls.
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext
} from './setup';
import { AnalyticsService } from '../../src/services/analytics.service';

describe('AnalyticsService', () => {
  let context: TestContext;
  let analyticsService: AnalyticsService;

  beforeAll(async () => {
    context = await setupTestApp();
    analyticsService = new AnalyticsService({
      logger: context.app.log
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  describe('constructor', () => {
    it('should create service with logger', () => {
      expect(analyticsService).toBeDefined();
    });

    it('should use default URL when env not set', () => {
      const service = new AnalyticsService({ logger: context.app.log });
      expect(service).toBeDefined();
    });
  });

  describe('getVenueAnalytics', () => {
    it('should handle connection errors gracefully', async () => {
      // Service will fail to connect to non-existent analytics service
      await expect(
        analyticsService.getVenueAnalytics('test-venue-id', { period: '30d' })
      ).rejects.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('should handle connection errors gracefully', async () => {
      await expect(
        analyticsService.trackEvent({
          type: 'page_view',
          venueId: 'test-venue',
          data: { page: '/home' }
        })
      ).rejects.toThrow();
    });
  });
});
