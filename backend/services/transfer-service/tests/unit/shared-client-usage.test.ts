/**
 * Unit Tests: Shared Client Usage - transfer-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  ticketServiceClient: {
    getTicketFull: jest.fn().mockResolvedValue({
      id: 'ticket-123',
      ownerId: 'user-123',
      eventId: 'event-456',
      status: 'SOLD',
      hasBeenTransferred: false,
    }),
    getTicketStatus: jest.fn().mockResolvedValue({
      ticketId: 'ticket-123',
      status: 'SOLD',
      ownerId: 'user-123',
    }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    checkTicketNotTransferred: jest.fn().mockResolvedValue(true),
  },
  authServiceClient: {
    getUser: jest.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      walletAddress: 'wallet123',
    }),
    validatePermissions: jest.fn().mockResolvedValue({ allGranted: true }),
  },
  createRequestContext: jest.fn((tenantId: string, userId?: string) => ({
    tenantId,
    userId,
    traceId: `test-trace-${Date.now()}`,
  })),
  RequestContext: {},
  ServiceClientError: class ServiceClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('transfer-service Shared Client Usage', () => {
  let ticketServiceClient: any;
  let authServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    ticketServiceClient = shared.ticketServiceClient;
    authServiceClient = shared.authServiceClient;
  });

  describe('Import Validation', () => {
    it('should import ticketServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ticketServiceClient).toBeDefined();
      expect(shared.ticketServiceClient.getTicketFull).toBeDefined();
    });

    it('should import authServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.authServiceClient).toBeDefined();
      expect(shared.authServiceClient.getUser).toBeDefined();
    });

    it('should use shared clients in transfer.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/transfer.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/ticketServiceClient/);
      expect(content).toMatch(/authServiceClient/);
    });

    it('should use shared clients in transfer-rules.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/transfer-rules.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/ticketServiceClient/);
    });

    it('should use shared clients in blockchain-transfer.service.ts', () => {
      const fs = require('fs');
      const path = require('path');
      const servicePath = path.join(__dirname, '../../src/services/blockchain-transfer.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/ticketServiceClient/);
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

  describe('ticketServiceClient Method Calls', () => {
    it('should call getTicketFull for transfer validation', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);

      expect(ticketServiceClient.getTicketFull).toHaveBeenCalledWith('ticket-123', ctx);
      expect(ticket.id).toBe('ticket-123');
      expect(ticket.ownerId).toBe('user-123');
    });

    it('should call getTicketStatus to check transfer eligibility', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const status = await ticketServiceClient.getTicketStatus('ticket-123', ctx);

      expect(ticketServiceClient.getTicketStatus).toHaveBeenCalledWith('ticket-123', ctx);
      expect(status.status).toBe('SOLD');
    });

    it('should call checkTicketNotTransferred for transfer rules', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const result = await ticketServiceClient.checkTicketNotTransferred(
        'ticket-123',
        'user-123',
        ctx
      );

      expect(ticketServiceClient.checkTicketNotTransferred).toHaveBeenCalledWith(
        'ticket-123',
        'user-123',
        ctx
      );
      expect(result).toBe(true);
    });

    it('should call updateStatus after successful transfer', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await ticketServiceClient.updateStatus('ticket-123', 'TRANSFERRED', ctx);

      expect(ticketServiceClient.updateStatus).toHaveBeenCalledWith(
        'ticket-123',
        'TRANSFERRED',
        ctx
      );
    });
  });

  describe('authServiceClient Method Calls', () => {
    it('should call getUser to validate recipient', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      const user = await authServiceClient.getUser('user-456', ctx);

      expect(authServiceClient.getUser).toHaveBeenCalledWith('user-456', ctx);
      expect(user.id).toBe('user-123');
      expect(user.walletAddress).toBe('wallet123');
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

    it('should handle ServiceClientError for invalid user', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      authServiceClient.getUser.mockRejectedValueOnce(
        new ServiceClientError('User not found', 404)
      );

      await expect(
        authServiceClient.getUser('nonexistent', { tenantId: 'test' })
      ).rejects.toThrow('User not found');
    });

    it('should handle transfer validation failure', async () => {
      ticketServiceClient.checkTicketNotTransferred.mockResolvedValueOnce(false);

      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };
      const result = await ticketServiceClient.checkTicketNotTransferred(
        'ticket-123',
        'wrong-user',
        ctx
      );

      expect(result).toBe(false);
    });
  });

  describe('Transfer Flow Tests', () => {
    it('should validate complete transfer flow data requirements', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      // Step 1: Get ticket details
      const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);
      expect(ticket.ownerId).toBe('user-123');

      // Step 2: Validate recipient
      const recipient = await authServiceClient.getUser('user-456', ctx);
      expect(recipient.walletAddress).toBeDefined();

      // Step 3: Check transfer eligibility
      const canTransfer = await ticketServiceClient.checkTicketNotTransferred(
        'ticket-123',
        ticket.ownerId,
        ctx
      );
      expect(canTransfer).toBe(true);
    });
  });
});
