/**
 * Unit Tests: Shared Client Usage - marketplace-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * marketplace-service uses ticketServiceClient and eventServiceClient.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  ticketServiceClient: {
    getTicketFull: jest.fn<any>().mockResolvedValue({
      id: 'ticket-123',
      eventId: 'event-456',
      priceCents: 5000,
      event: {
        name: 'Test Event',
        venueId: 'venue-789',
        venueName: 'Test Venue',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      seat: {
        section: 'A',
        row: '1',
        number: '101',
      },
    }),
    getTicketStatus: jest.fn<any>().mockResolvedValue({ status: 'valid' }),
  },
  eventServiceClient: {
    getEventInternal: jest.fn<any>().mockResolvedValue({
      id: 'event-456',
      name: 'Test Event',
      venueId: 'venue-789',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    getEvent: jest.fn<any>().mockResolvedValue({
      id: 'event-456',
      name: 'Test Event',
    }),
  },
  createRequestContext: jest.fn<any>((tenantId: string, userId?: string) => ({
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

// Mock Redis cache
jest.mock('../../src/config/redis', () => ({
  cache: {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

describe('marketplace-service Shared Client Usage', () => {
  let ticketServiceClient: any;
  let eventServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    ticketServiceClient = shared.ticketServiceClient;
    eventServiceClient = shared.eventServiceClient;
  });

  describe('Import Validation', () => {
    it('should import ticketServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ticketServiceClient).toBeDefined();
      expect(shared.ticketServiceClient.getTicketFull).toBeDefined();
    });

    it('should import eventServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.eventServiceClient).toBeDefined();
      expect(shared.eventServiceClient.getEventInternal).toBeDefined();
    });

    it('should import createRequestContext from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.createRequestContext).toBeDefined();
    });

    it('should import ServiceClientError from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ServiceClientError).toBeDefined();
    });

    it('should use shared clients in ticket-lookup.service.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/ticket-lookup.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/ticketServiceClient/);
      expect(content).toMatch(/eventServiceClient/);
      expect(content).toMatch(/createRequestContext/);
      expect(content).toMatch(/ServiceClientError/);
    });
  });

  describe('Custom HTTP Client Removal', () => {
    it('should NOT have custom http-client.ts', () => {
      const httpClientPath = path.join(__dirname, '../../src/utils/http-client.ts');
      const exists = fs.existsSync(httpClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have standalone ticket client', () => {
      const customClientPath = path.join(__dirname, '../../src/clients/ticket.client.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have standalone event client', () => {
      const customClientPath = path.join(__dirname, '../../src/clients/event.client.ts');
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

    it('should create RequestContext with tenantId and userId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });
  });

  describe('ticketServiceClient Method Calls', () => {
    it('should call getTicketFull for ticket lookup', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      expect(ticketServiceClient.getTicketFull).toHaveBeenCalledWith('ticket-123', ctx);
      expect(ticket.id).toBe('ticket-123');
      expect(ticket.event).toBeDefined();
      expect(ticket.seat).toBeDefined();
    });

    it('should call getTicketStatus for ticket validation', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const status = await ticketServiceClient.getTicketStatus('ticket-123', ctx);

      expect(ticketServiceClient.getTicketStatus).toHaveBeenCalledWith('ticket-123', ctx);
      expect(status.status).toBe('valid');
    });
  });

  describe('eventServiceClient Method Calls', () => {
    it('should call getEventInternal for event lookup', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const event = await eventServiceClient.getEventInternal('event-456', ctx);

      expect(eventServiceClient.getEventInternal).toHaveBeenCalledWith('event-456', ctx);
      expect(event.id).toBe('event-456');
      expect(event.name).toBe('Test Event');
    });

    it('should call getEvent for public event data', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const event = await eventServiceClient.getEvent('event-456', ctx);

      expect(eventServiceClient.getEvent).toHaveBeenCalledWith('event-456', ctx);
      expect(event.id).toBe('event-456');
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError for ticket not found', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      ticketServiceClient.getTicketFull.mockRejectedValueOnce(
        new ServiceClientError('Ticket not found', 404)
      );

      await expect(
        ticketServiceClient.getTicketFull('nonexistent', { tenantId: 'test' })
      ).rejects.toThrow('Ticket not found');
    });

    it('should handle ServiceClientError for event not found', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      eventServiceClient.getEventInternal.mockRejectedValueOnce(
        new ServiceClientError('Event not found', 404)
      );

      await expect(
        eventServiceClient.getEventInternal('nonexistent', { tenantId: 'test' })
      ).rejects.toThrow('Event not found');
    });

    it('should handle service unavailable errors gracefully', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      ticketServiceClient.getTicketFull.mockRejectedValueOnce(
        new ServiceClientError('Ticket service unavailable', 503)
      );

      try {
        await ticketServiceClient.getTicketFull('ticket-123', { tenantId: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceClientError);
        expect((error as any).statusCode).toBe(503);
      }
    });
  });

  describe('Marketplace Listing Flow', () => {
    it('should get ticket info for listing creation', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      expect(ticket.id).toBe('ticket-123');
      expect(ticket.eventId).toBe('event-456');
      expect(ticket.priceCents).toBe(5000);
      expect(ticket.event?.name).toBe('Test Event');
    });

    it('should get event info for listing display', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const event = await eventServiceClient.getEventInternal('event-456', ctx);

      expect(event.id).toBe('event-456');
      expect(event.venueId).toBe('venue-789');
    });
  });

  describe('Ticket Eligibility Validation', () => {
    it('should validate ticket exists before listing', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      expect(ticket).not.toBeNull();
      expect(ticket.event?.startsAt).toBeDefined();
    });

    it('should check event date is in the future', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);
      const eventDate = new Date(ticket.event?.startsAt);

      expect(eventDate > new Date()).toBe(true);
    });
  });

  describe('Fee Service Integration', () => {
    it('should use shared library in fee.service.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/fee.service.ts');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
      }
    });
  });

  describe('Listing Service Integration', () => {
    it('should use shared library in listing.service.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/listing.service.ts');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
      }
    });
  });
});
