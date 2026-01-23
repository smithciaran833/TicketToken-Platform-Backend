/**
 * Unit Tests: Shared Client Usage - notification-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  authServiceClient: {
    getUser: jest.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    }),
    validatePermissions: jest.fn().mockResolvedValue({ allGranted: true }),
  },
  eventServiceClient: {
    getEventInternal: jest.fn().mockResolvedValue({
      id: 'event-123',
      name: 'Test Event',
      startsAt: '2025-06-01T19:00:00Z',
      venueId: 'venue-456',
    }),
  },
  ticketServiceClient: {
    getTicketFull: jest.fn().mockResolvedValue({
      id: 'ticket-123',
      eventId: 'event-123',
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
  QUEUES: {
    NOTIFICATION: 'notification',
    EMAIL: 'email',
  },
  createCache: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

describe('notification-service Shared Client Usage', () => {
  let authServiceClient: any;
  let eventServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    authServiceClient = shared.authServiceClient;
    eventServiceClient = shared.eventServiceClient;
  });

  describe('Import Validation', () => {
    it('should import authServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.authServiceClient).toBeDefined();
      expect(shared.authServiceClient.getUser).toBeDefined();
    });

    it('should import eventServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.eventServiceClient).toBeDefined();
      expect(shared.eventServiceClient.getEventInternal).toBeDefined();
    });

    it('should re-export shared clients from clients/index.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const clientsPath = path.join(__dirname, '../../src/clients/index.ts');
      const content = fs.readFileSync(clientsPath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/authServiceClient/);
      expect(content).toMatch(/eventServiceClient/);
    });

    it('should NOT have custom HTTP client implementations', () => {
      const fs = require('fs');
      const path = require('path');
      const srcDir = path.join(__dirname, '../../src');

      // Check for absence of custom http client files
      const hasCustomHttpClient = fs.existsSync(
        path.join(srcDir, 'utils/http-client.ts')
      );
      expect(hasCustomHttpClient).toBe(false);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.traceId).toBeDefined();
    });
  });

  describe('authServiceClient Method Calls', () => {
    it('should call getUser with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const user = await authServiceClient.getUser('user-123', ctx);

      expect(authServiceClient.getUser).toHaveBeenCalledWith('user-123', ctx);
      expect(user.id).toBe('user-123');
      expect(user.email).toBe('test@example.com');
    });
  });

  describe('eventServiceClient Method Calls', () => {
    it('should call getEventInternal with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const event = await eventServiceClient.getEventInternal('event-123', ctx);

      expect(eventServiceClient.getEventInternal).toHaveBeenCalledWith('event-123', ctx);
      expect(event.id).toBe('event-123');
      expect(event.name).toBe('Test Event');
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError correctly', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      authServiceClient.getUser.mockRejectedValueOnce(
        new ServiceClientError('User not found', 404)
      );

      await expect(
        authServiceClient.getUser('nonexistent', { tenantId: 'test' })
      ).rejects.toThrow('User not found');
    });
  });
});
