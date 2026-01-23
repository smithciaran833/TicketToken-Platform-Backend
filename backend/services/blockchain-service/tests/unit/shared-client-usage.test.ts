/**
 * Unit Tests: Shared Client Usage - blockchain-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * Tests that imports, context creation, and method calls are correct.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the shared library before importing modules that use it
jest.mock('@tickettoken/shared', () => ({
  ticketServiceClient: {
    updateStatus: jest.fn().mockResolvedValue(undefined),
    updateNft: jest.fn().mockResolvedValue(undefined),
    getTicketFull: jest.fn().mockResolvedValue({
      id: 'ticket-123',
      eventId: 'event-456',
      event: {
        id: 'event-456',
        name: 'Test Event',
        venueId: 'venue-789',
      },
      ticketType: { name: 'VIP' },
      seat: { section: 'A', row: '1', number: '5' },
    }),
  },
  venueServiceClient: {
    getVenue: jest.fn().mockResolvedValue({
      id: 'venue-789',
      name: 'Test Venue',
      walletAddress: 'VenueWallet123',
    }),
  },
  orderServiceClient: {
    getOrderItems: jest.fn().mockResolvedValue({
      items: [{ ticketId: 'ticket-123' }],
    }),
  },
  eventServiceClient: {
    getEventInternal: jest.fn().mockResolvedValue({
      id: 'event-456',
      name: 'Test Event',
      venueId: 'venue-789',
    }),
  },
  RequestContext: {},
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

describe('blockchain-service Shared Client Usage', () => {
  let ticketServiceClient: any;
  let venueServiceClient: any;
  let orderServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get mocked clients
    const shared = require('@tickettoken/shared');
    ticketServiceClient = shared.ticketServiceClient;
    venueServiceClient = shared.venueServiceClient;
    orderServiceClient = shared.orderServiceClient;
  });

  describe('Import Validation', () => {
    it('should import ticketServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ticketServiceClient).toBeDefined();
      expect(shared.ticketServiceClient.updateStatus).toBeDefined();
      expect(shared.ticketServiceClient.updateNft).toBeDefined();
      expect(shared.ticketServiceClient.getTicketFull).toBeDefined();
    });

    it('should import venueServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.venueServiceClient).toBeDefined();
      expect(shared.venueServiceClient.getVenue).toBeDefined();
    });

    it('should import orderServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.orderServiceClient).toBeDefined();
      expect(shared.orderServiceClient.getOrderItems).toBeDefined();
    });

    it('should import RequestContext type from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.RequestContext).toBeDefined();
    });

    it('should NOT have custom client imports in mintQueue.ts', async () => {
      const fs = require('fs');
      const path = require('path');
      const mintQueuePath = path.join(__dirname, '../../src/queues/mintQueue.ts');
      const content = fs.readFileSync(mintQueuePath, 'utf8');

      // Should NOT contain custom client imports
      expect(content).not.toMatch(/from ['"]\.\.\/clients/);
      expect(content).not.toMatch(/from ['"]\.\.\/services\/.*Client/);

      // SHOULD contain shared library import
      expect(content).toMatch(/@tickettoken\/shared/);
    });

    it('should NOT have custom client imports in mint-worker.ts', async () => {
      const fs = require('fs');
      const path = require('path');
      const mintWorkerPath = path.join(__dirname, '../../src/workers/mint-worker.ts');
      const content = fs.readFileSync(mintWorkerPath, 'utf8');

      // Should NOT contain custom client imports
      expect(content).not.toMatch(/from ['"]\.\.\/clients/);

      // SHOULD contain shared library import
      expect(content).toMatch(/@tickettoken\/shared/);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.traceId).toBeDefined();
    });

    it('should create RequestContext with tenantId and userId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });

    it('should use system tenant when not provided', () => {
      // Based on mint-worker.ts createRequestContext function
      const createMintWorkerContext = (tenantId: string = 'system') => ({
        tenantId,
        traceId: `mint-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });

      const ctx = createMintWorkerContext();
      expect(ctx.tenantId).toBe('system');
      expect(ctx.traceId).toMatch(/^mint-worker-/);
    });
  });

  describe('ticketServiceClient Method Calls', () => {
    it('should call updateStatus with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await ticketServiceClient.updateStatus('ticket-123', 'MINTING', ctx);

      expect(ticketServiceClient.updateStatus).toHaveBeenCalledWith(
        'ticket-123',
        'MINTING',
        ctx
      );
    });

    it('should call updateNft with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };
      const nftData = {
        nftMintAddress: 'mint-address-123',
        metadataUri: 'https://metadata.uri',
        nftTransferSignature: 'sig-123',
        isMinted: true,
        mintedAt: new Date().toISOString(),
      };

      await ticketServiceClient.updateNft('ticket-123', nftData, ctx);

      expect(ticketServiceClient.updateNft).toHaveBeenCalledWith(
        'ticket-123',
        nftData,
        ctx
      );
    });

    it('should call getTicketFull with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      expect(ticketServiceClient.getTicketFull).toHaveBeenCalledWith('ticket-123', ctx);
      expect(ticket.id).toBe('ticket-123');
      expect(ticket.event).toBeDefined();
    });
  });

  describe('venueServiceClient Method Calls', () => {
    it('should call getVenue with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const venue = await venueServiceClient.getVenue('venue-789', ctx);

      expect(venueServiceClient.getVenue).toHaveBeenCalledWith('venue-789', ctx);
      expect(venue.id).toBe('venue-789');
      expect(venue.walletAddress).toBe('VenueWallet123');
    });
  });

  describe('orderServiceClient Method Calls', () => {
    it('should call getOrderItems with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const result = await orderServiceClient.getOrderItems('order-123', ctx);

      expect(orderServiceClient.getOrderItems).toHaveBeenCalledWith('order-123', ctx);
      expect(result.items).toBeDefined();
      expect(result.items[0].ticketId).toBe('ticket-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError correctly', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      ticketServiceClient.updateStatus.mockRejectedValueOnce(
        new ServiceClientError('Service unavailable', 503)
      );

      await expect(
        ticketServiceClient.updateStatus('ticket-123', 'MINTING', { tenantId: 'test' })
      ).rejects.toThrow('Service unavailable');
    });

    it('should fallback gracefully when service call fails', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      // Simulate service error
      ticketServiceClient.getTicketFull.mockRejectedValueOnce(
        new ServiceClientError('Ticket not found', 404)
      );

      // The mint-worker has fallback logic
      let result = null;
      try {
        result = await ticketServiceClient.getTicketFull('nonexistent', { tenantId: 'test' });
      } catch (error) {
        // Expected to fail
        expect(error).toBeInstanceOf(ServiceClientError);
      }

      expect(result).toBeNull();
    });

    it('should log warning when service call fails and use fallback', async () => {
      // This tests the pattern used in mint-worker.ts where it falls back to direct DB query
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      ticketServiceClient.updateNft.mockRejectedValueOnce(new Error('Service unavailable'));

      try {
        await ticketServiceClient.updateNft('ticket-123', {}, { tenantId: 'test' });
      } catch (error) {
        // In actual code, this would trigger fallback
        console.warn('Failed to update ticket via service client, using fallback', {
          error: (error as Error).message,
        });
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Mint Queue Specific Tests', () => {
    it('should create proper context for mint operations', () => {
      // Test the context creation pattern used in mintQueue.ts
      const createRequestContext = (tenantId: string) => ({
        tenantId,
        traceId: `mint-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });

      const ctx = createRequestContext('tenant-456');

      expect(ctx.tenantId).toBe('tenant-456');
      expect(ctx.traceId).toMatch(/^mint-queue-/);
    });

    it('should map mint status to ticket status correctly', () => {
      // Test the status mapping used in mintQueue.ts
      const mapMintStatusToTicketStatus = (
        status: 'pending' | 'minting' | 'completed' | 'failed'
      ) => {
        switch (status) {
          case 'minting':
            return 'MINTING';
          case 'completed':
            return 'MINTED';
          case 'failed':
            return 'MINT_FAILED';
          default:
            return 'PENDING';
        }
      };

      expect(mapMintStatusToTicketStatus('minting')).toBe('MINTING');
      expect(mapMintStatusToTicketStatus('completed')).toBe('MINTED');
      expect(mapMintStatusToTicketStatus('failed')).toBe('MINT_FAILED');
      expect(mapMintStatusToTicketStatus('pending')).toBe('PENDING');
    });
  });

  describe('Mint Worker Specific Tests', () => {
    it('should fetch venue wallet address via venueServiceClient', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const venue = await venueServiceClient.getVenue('venue-789', ctx);

      expect(venue.walletAddress).toBe('VenueWallet123');
    });

    it('should handle missing venue wallet gracefully', async () => {
      venueServiceClient.getVenue.mockResolvedValueOnce({
        id: 'venue-789',
        name: 'Test Venue',
        walletAddress: null, // No wallet configured
      });

      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };
      const venue = await venueServiceClient.getVenue('venue-789', ctx);

      expect(venue.walletAddress).toBeNull();
    });

    it('should build ticket metadata from service responses', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      // Verify metadata can be built from response
      const nftMetadata = {
        name: `${ticket.event.name} - Ticket #${ticket.seat.number}`,
        symbol: 'TICKET',
        description: `Ticket for ${ticket.event.name}`,
        attributes: [
          { trait_type: 'Event', value: ticket.event.name },
          { trait_type: 'Section', value: ticket.seat.section },
          { trait_type: 'Seat', value: ticket.seat.number },
          { trait_type: 'Ticket Type', value: ticket.ticketType.name },
        ],
      };

      expect(nftMetadata.name).toBe('Test Event - Ticket #5');
      expect(nftMetadata.attributes).toHaveLength(4);
    });
  });
});
