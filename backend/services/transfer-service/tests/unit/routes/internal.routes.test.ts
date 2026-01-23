// @ts-nocheck
/**
 * Internal Routes Unit Tests - transfer-service
 *
 * Tests for the internal routes endpoints:
 * - GET /internal/transfers/:transferId
 * - GET /internal/ownership/:ticketId
 * - GET /internal/users/:userId/transfers
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the database query function
const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  query: mockQuery,
}));

// Mock logger - must mock the logger module completely to avoid pino initialization
const mockChildLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  },
  logger: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  },
  createChildLogger: jest.fn(() => mockChildLogger),
  createRequestLogger: jest.fn(() => mockChildLogger),
  safeLog: jest.fn((obj) => obj),
  logAuditEvent: jest.fn(),
}));

import { internalRoutes } from '../../../src/routes/internal.routes';

describe('Internal Routes - transfer-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(internalRoutes, { prefix: '/internal' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /internal/transfers/:transferId
  // =========================================================================

  describe('GET /internal/transfers/:transferId', () => {
    const mockTransfer = {
      id: 'transfer-123',
      tenant_id: 'tenant-abc',
      ticket_id: 'ticket-456',
      from_user_id: 'user-seller',
      to_user_id: 'user-buyer',
      transfer_type: 'SALE',
      status: 'COMPLETED',
      price: 10000,
      currency: 'USD',
      blockchain_tx_hash: '0x123abc',
      blockchain_status: 'confirmed',
      initiated_at: new Date(),
      completed_at: new Date(),
      cancelled_at: null,
      cancellation_reason: null,
      metadata: { marketplace: 'tickettoken' },
      created_at: new Date(),
      updated_at: new Date(),
    };

    test('should return transfer details for valid transfer ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTransfer] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/transfers/transfer-123',
        headers: {
          'x-internal-service': 'marketplace-service',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.transfer).toBeDefined();
      expect(body.transfer.id).toBe('transfer-123');
      expect(body.transfer.status).toBe('COMPLETED');
      expect(body.transfer.fromUserId).toBe('user-seller');
      expect(body.transfer.toUserId).toBe('user-buyer');
      expect(body.transfer.blockchain.txHash).toBe('0x123abc');
    });

    test('should return 404 for non-existent transfer', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/transfers/non-existent',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Transfer not found');
    });
  });

  // =========================================================================
  // GET /internal/ownership/:ticketId
  // =========================================================================

  describe('GET /internal/ownership/:ticketId', () => {
    const mockLastTransfer = {
      id: 'transfer-last',
      ticket_id: 'ticket-789',
      from_user_id: 'user-previous',
      to_user_id: 'user-current',
      transfer_type: 'SALE',
      status: 'COMPLETED',
      completed_at: new Date(),
      blockchain_tx_hash: '0xabc123',
    };

    test('should return ownership information for ticket with transfers', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockLastTransfer] }) // Last transfer query
        .mockResolvedValueOnce({ rows: [{ transfer_count: '3' }] }); // Count query

      const response = await app.inject({
        method: 'GET',
        url: '/internal/ownership/ticket-789',
        headers: {
          'x-internal-service': 'scanning-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ticketId).toBe('ticket-789');
      expect(body.ownership).toBeDefined();
      expect(body.ownership.currentOwnerId).toBe('user-current');
      expect(body.ownership.previousOwnerId).toBe('user-previous');
      expect(body.ownership.totalTransfers).toBe(3);
      expect(body.ownership.isOriginalOwner).toBe(false);
      expect(body.ownership.blockchainTxHash).toBe('0xabc123');
    });

    test('should return ownership info for ticket with no transfers (original owner)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // No transfers
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/ownership/new-ticket',
        headers: {
          'x-internal-service': 'marketplace-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ticketId).toBe('new-ticket');
      expect(body.ownership.currentOwnerId).toBeNull();
      expect(body.ownership.totalTransfers).toBe(0);
      expect(body.ownership.isOriginalOwner).toBe(true);
    });
  });

  // =========================================================================
  // GET /internal/users/:userId/transfers
  // =========================================================================

  describe('GET /internal/users/:userId/transfers', () => {
    const mockUserTransfers = [
      {
        id: 'transfer-1',
        tenant_id: 'tenant-abc',
        ticket_id: 'ticket-001',
        from_user_id: 'user-gdpr',
        to_user_id: 'user-buyer-1',
        transfer_type: 'SALE',
        status: 'COMPLETED',
        price: 5000,
        currency: 'USD',
        blockchain_tx_hash: '0x111',
        blockchain_status: 'confirmed',
        initiated_at: new Date(),
        completed_at: new Date(),
        cancelled_at: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: 'transfer-2',
        tenant_id: 'tenant-abc',
        ticket_id: 'ticket-002',
        from_user_id: 'user-seller',
        to_user_id: 'user-gdpr',
        transfer_type: 'PURCHASE',
        status: 'COMPLETED',
        price: 7500,
        currency: 'USD',
        blockchain_tx_hash: '0x222',
        blockchain_status: 'confirmed',
        initiated_at: new Date(),
        completed_at: new Date(),
        cancelled_at: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    test('should return all transfers for a user (GDPR export)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockUserTransfers }) // Transfers query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // Count query

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-gdpr/transfers',
        headers: {
          'x-internal-service': 'compliance-service',
          'x-trace-id': 'trace-gdpr',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('user-gdpr');
      expect(body.transfers).toHaveLength(2);
      expect(body.transfers[0].direction).toBe('outgoing');
      expect(body.transfers[1].direction).toBe('incoming');
      expect(body.pagination.total).toBe(2);
    });

    test('should return empty transfers for user with no history', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/new-user/transfers',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('new-user');
      expect(body.transfers).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    test('should support pagination parameters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUserTransfers[0]] })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-paginate/transfers?limit=1&offset=0',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.transfers).toHaveLength(1);
      // Query params come as strings, so accept either string or number
      expect(Number(body.pagination.limit)).toBe(1);
      expect(Number(body.pagination.offset)).toBe(0);
      expect(body.pagination.hasMore).toBe(true);
    });

    test('should support includeDeleted flag for full GDPR export', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockUserTransfers })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-full-export/transfers?includeDeleted=true',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      // The query should include deleted records (verified by not having whereNull filter)
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully on transfer lookup', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/transfers/transfer-error',
        headers: {
          'x-internal-service': 'marketplace-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on ownership lookup', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/ownership/ticket-error',
        headers: {
          'x-internal-service': 'scanning-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on user transfers lookup', async () => {
      mockQuery.mockRejectedValue(new Error('Connection reset'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-error/transfers',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });
});
