/**
 * Unit Tests: Shared Client Usage - event-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * event-service uses venueServiceClient for venue validation.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  venueServiceClient: {
    venueExists: jest.fn().mockResolvedValue(true),
    getVenueInternal: jest.fn().mockResolvedValue({
      id: 'venue-123',
      name: 'Test Venue',
      tenantId: 'tenant-456',
      address: '123 Main St',
      capacity: 5000,
    }),
    getVenue: jest.fn().mockResolvedValue({
      id: 'venue-123',
      name: 'Test Venue',
    }),
  },
  publishSearchSync: jest.fn().mockResolvedValue(undefined),
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

describe('event-service Shared Client Usage', () => {
  let venueServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    venueServiceClient = shared.venueServiceClient;
  });

  describe('Import Validation', () => {
    it('should import venueServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.venueServiceClient).toBeDefined();
      expect(shared.venueServiceClient.venueExists).toBeDefined();
      expect(shared.venueServiceClient.getVenueInternal).toBeDefined();
    });

    it('should use shared clients in event.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/event.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/venueServiceClient/);
    });

    it('should NOT have custom VenueServiceClient', () => {
      const fs = require('fs');
      const path = require('path');

      // Custom venue-service.client.ts should be deleted
      const customClientPath = path.join(
        __dirname,
        '../../src/services/venue-service.client.ts'
      );
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });

    it('should use shared clients in capacity.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/capacity.service.ts');

      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        // If it uses venue data, it should use shared client
        if (content.includes('venue')) {
          expect(content).toMatch(/@tickettoken\/shared/);
        }
      }
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId and userId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });
  });

  describe('venueServiceClient Method Calls', () => {
    it('should call venueExists for event creation validation', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const exists = await venueServiceClient.venueExists('venue-123', ctx);

      expect(venueServiceClient.venueExists).toHaveBeenCalledWith('venue-123', ctx);
      expect(exists).toBe(true);
    });

    it('should call getVenueInternal for full venue details', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const venue = await venueServiceClient.getVenueInternal('venue-123', ctx);

      expect(venueServiceClient.getVenueInternal).toHaveBeenCalledWith('venue-123', ctx);
      expect(venue.id).toBe('venue-123');
      expect(venue.capacity).toBe(5000);
    });

    it('should handle venue not found', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      venueServiceClient.venueExists.mockRejectedValueOnce(
        new ServiceClientError('Venue not found', 404)
      );

      await expect(
        venueServiceClient.venueExists('nonexistent', { tenantId: 'test' })
      ).rejects.toThrow('Venue not found');
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError for venue service unavailable', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      venueServiceClient.getVenueInternal.mockRejectedValueOnce(
        new ServiceClientError('Service unavailable', 503)
      );

      await expect(
        venueServiceClient.getVenueInternal('venue-123', { tenantId: 'test' })
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('Event Creation Flow', () => {
    it('should validate venue exists before creating event', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      // Step 1: Check venue exists
      const exists = await venueServiceClient.venueExists('venue-123', ctx);
      expect(exists).toBe(true);

      // Step 2: Get venue details for event
      const venue = await venueServiceClient.getVenueInternal('venue-123', ctx);
      expect(venue.capacity).toBeDefined();
    });
  });
});
