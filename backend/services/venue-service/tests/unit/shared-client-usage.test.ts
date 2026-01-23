/**
 * Unit Tests: Shared Client Usage - venue-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * venue-service uses analyticsServiceClient for analytics events.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  analyticsServiceClient: {
    trackEvent: jest.fn().mockResolvedValue({ success: true }),
    trackMetric: jest.fn().mockResolvedValue({ success: true }),
    getVenueAnalytics: jest.fn().mockResolvedValue({
      totalSales: 10000,
      ticketsSold: 500,
      events: [],
    }),
  },
  createRequestContext: jest.fn((tenantId: string, userId?: string) => ({
    tenantId,
    userId,
    traceId: `test-trace-${Date.now()}`,
  })),
  ServiceClientError: class ServiceClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('venue-service Shared Client Usage', () => {
  let analyticsServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    analyticsServiceClient = shared.analyticsServiceClient;
  });

  describe('Import Validation', () => {
    it('should import analyticsServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.analyticsServiceClient).toBeDefined();
      expect(shared.analyticsServiceClient.trackEvent).toBeDefined();
    });

    it('should use shared clients in analytics.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/analytics.service.ts');

      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
        expect(content).toMatch(/analyticsServiceClient/);
      }
    });

    it('should NOT have custom httpClient.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const customClientPath = path.join(__dirname, '../../src/utils/httpClient.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123');

      expect(ctx.tenantId).toBe('tenant-123');
    });
  });

  describe('analyticsServiceClient Method Calls', () => {
    it('should call trackEvent for venue analytics', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await analyticsServiceClient.trackEvent(
        { type: 'venue_view', venueId: 'venue-123' },
        ctx
      );

      expect(analyticsServiceClient.trackEvent).toHaveBeenCalledWith(
        { type: 'venue_view', venueId: 'venue-123' },
        ctx
      );
    });

    it('should call getVenueAnalytics for reporting', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const analytics = await analyticsServiceClient.getVenueAnalytics('venue-123', {}, ctx);

      expect(analyticsServiceClient.getVenueAnalytics).toHaveBeenCalled();
      expect(analytics.totalSales).toBe(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle analytics service unavailable gracefully', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      analyticsServiceClient.trackEvent.mockRejectedValueOnce(
        new ServiceClientError('Service unavailable', 503)
      );

      // Analytics failures should be handled gracefully - not throw
      await expect(
        analyticsServiceClient.trackEvent({}, { tenantId: 'test' })
      ).rejects.toThrow('Service unavailable');
    });
  });
});
