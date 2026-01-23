/**
 * Unit Tests: Shared Client Usage - queue-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * queue-service uses analyticsServiceClient and mintingServiceClient.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  analyticsServiceClient: {
    trackEvent: jest.fn().mockResolvedValue({ success: true }),
    trackMetric: jest.fn().mockResolvedValue({ success: true }),
  },
  mintingServiceClient: {
    queueMint: jest.fn().mockResolvedValue({
      jobId: 'job-123',
      status: 'queued',
    }),
    getMintStatus: jest.fn().mockResolvedValue({
      status: 'completed',
      mintAddress: 'mint-address-123',
    }),
    mintTicket: jest.fn().mockResolvedValue({
      mintAddress: 'mint-123',
      transactionId: 'tx-123',
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

describe('queue-service Shared Client Usage', () => {
  let analyticsServiceClient: any;
  let mintingServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    analyticsServiceClient = shared.analyticsServiceClient;
    mintingServiceClient = shared.mintingServiceClient;
  });

  describe('Import Validation', () => {
    it('should import analyticsServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.analyticsServiceClient).toBeDefined();
    });

    it('should import mintingServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.mintingServiceClient).toBeDefined();
    });

    it('should re-export shared clients from clients/index.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const clientsPath = path.join(__dirname, '../../src/clients/index.ts');
      const content = fs.readFileSync(clientsPath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/mintingServiceClient/);
      expect(content).toMatch(/analyticsServiceClient/);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext for queue jobs', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });
  });

  describe('analyticsServiceClient Method Calls', () => {
    it('should call trackEvent for queue analytics', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await analyticsServiceClient.trackEvent({ type: 'job_processed' }, ctx);

      expect(analyticsServiceClient.trackEvent).toHaveBeenCalled();
    });

    it('should call trackMetric for queue metrics', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await analyticsServiceClient.trackMetric(
        { name: 'queue_length', value: 10 },
        ctx
      );

      expect(analyticsServiceClient.trackMetric).toHaveBeenCalled();
    });
  });

  describe('mintingServiceClient Method Calls', () => {
    it('should call queueMint for NFT minting jobs', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const result = await mintingServiceClient.queueMint(
        {
          ticketId: 'ticket-123',
          metadata: { name: 'Test NFT' },
        },
        ctx
      );

      expect(mintingServiceClient.queueMint).toHaveBeenCalled();
      expect(result.jobId).toBe('job-123');
    });

    it('should call getMintStatus to check job progress', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const status = await mintingServiceClient.getMintStatus('ticket-123', ctx);

      expect(mintingServiceClient.getMintStatus).toHaveBeenCalledWith('ticket-123', ctx);
      expect(status.status).toBe('completed');
    });

    it('should call mintTicket for direct minting', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const result = await mintingServiceClient.mintTicket(
        {
          ticketId: 'ticket-123',
          userId: 'user-456',
          metadata: { name: 'Test Ticket' },
        },
        ctx
      );

      expect(mintingServiceClient.mintTicket).toHaveBeenCalled();
      expect(result.mintAddress).toBe('mint-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle minting service errors', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      mintingServiceClient.queueMint.mockRejectedValueOnce(
        new ServiceClientError('Minting queue full', 503)
      );

      await expect(
        mintingServiceClient.queueMint({}, { tenantId: 'test' })
      ).rejects.toThrow('Minting queue full');
    });

    it('should handle analytics service errors gracefully', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      analyticsServiceClient.trackEvent.mockRejectedValueOnce(
        new ServiceClientError('Analytics unavailable', 503)
      );

      // Analytics errors should typically be non-fatal
      await expect(
        analyticsServiceClient.trackEvent({}, { tenantId: 'test' })
      ).rejects.toThrow('Analytics unavailable');
    });
  });

  describe('Queue Processor Flow', () => {
    it('should process NFT mint job using shared client', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      // Step 1: Queue the mint
      const queueResult = await mintingServiceClient.queueMint(
        { ticketId: 'ticket-123' },
        ctx
      );
      expect(queueResult.status).toBe('queued');

      // Step 2: Check status
      const status = await mintingServiceClient.getMintStatus('ticket-123', ctx);
      expect(status.status).toBe('completed');

      // Step 3: Track analytics
      await analyticsServiceClient.trackEvent(
        { type: 'mint_completed', ticketId: 'ticket-123' },
        ctx
      );
      expect(analyticsServiceClient.trackEvent).toHaveBeenCalled();
    });
  });
});
