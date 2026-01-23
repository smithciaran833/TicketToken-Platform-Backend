// @ts-nocheck
/**
 * Internal Routes Unit Tests - marketplace-service
 *
 * Tests for the internal routes endpoints:
 * - POST /internal/events
 * - GET /internal/listings/:listingId
 * - GET /internal/escrow/:transferId
 * - POST /internal/escrow/release
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the database (knex)
const mockKnex = jest.fn();
mockKnex.mockReturnValue({
  where: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue(1),
});

jest.mock('../../../src/config/database', () => mockKnex);

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import internalRoutes from '../../../src/routes/internal.routes';

describe('Internal Routes - marketplace-service', () => {
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
    // Reset mock chain
    mockKnex.mockClear();
    mockKnex.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1),
    });
  });

  // =========================================================================
  // POST /internal/events
  // =========================================================================

  describe('POST /internal/events', () => {
    test('should handle order.completed event', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/events',
        payload: {
          event: 'order.completed',
          data: {
            id: 'payment-123',
            metadata: { listingId: 'listing-456' },
          },
        },
        headers: {
          'x-internal-service': 'payment-service',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Order completed processed');
    });

    test('should handle payment.failed event', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/events',
        payload: {
          event: 'payment.failed',
          data: {
            id: 'payment-456',
            metadata: { listingId: 'listing-789' },
          },
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Payment failed processed');
    });

    test('should handle refund.processed event', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/events',
        payload: {
          event: 'refund.processed',
          data: {
            id: 'refund-123',
            metadata: { listingId: 'listing-abc' },
          },
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Refund processed');
    });

    test('should return 400 for unknown event type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/events',
        payload: {
          event: 'unknown.event',
          data: {},
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unknown event type');
    });
  });

  // =========================================================================
  // GET /internal/listings/:listingId
  // =========================================================================

  describe('GET /internal/listings/:listingId', () => {
    const mockListing = {
      id: 'listing-123',
      tenant_id: 'tenant-abc',
      ticket_id: 'ticket-456',
      event_id: 'event-789',
      seller_id: 'seller-001',
      status: 'ACTIVE',
      price: 10000,
      currency: 'USD',
      listed_at: new Date(),
      sold_at: null,
      buyer_id: null,
      escrow_status: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    test('should return listing details for valid listing', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockListing),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/listings/listing-123',
        headers: {
          'x-internal-service': 'payment-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.listing).toBeDefined();
      expect(body.listing.id).toBe('listing-123');
      expect(body.listing.status).toBe('ACTIVE');
      expect(body.listing.price).toBe(10000);
    });

    test('should return 404 for non-existent listing', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/listings/non-existent',
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Listing not found');
    });
  });

  // =========================================================================
  // GET /internal/escrow/:transferId
  // =========================================================================

  describe('GET /internal/escrow/:transferId', () => {
    const mockEscrow = {
      id: 'escrow-123',
      transfer_id: 'transfer-456',
      listing_id: 'listing-789',
      seller_id: 'seller-001',
      buyer_id: 'buyer-002',
      amount: 10000,
      currency: 'USD',
      status: 'HELD',
      platform_fee: 500,
      seller_payout: 9500,
      released_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    test('should return escrow details for valid transfer', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEscrow),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/escrow/transfer-456',
        headers: {
          'x-internal-service': 'transfer-service',
          'x-trace-id': 'trace-789',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.escrow).toBeDefined();
      expect(body.escrow.id).toBe('escrow-123');
      expect(body.escrow.status).toBe('HELD');
      expect(body.escrow.amount).toBe(10000);
    });

    test('should return 404 for non-existent escrow', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/escrow/non-existent',
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Escrow not found');
    });
  });

  // =========================================================================
  // POST /internal/escrow/release
  // =========================================================================

  describe('POST /internal/escrow/release', () => {
    const mockEscrow = {
      id: 'escrow-123',
      transfer_id: 'transfer-456',
      status: 'HELD',
      seller_id: 'seller-001',
      seller_payout: 9500,
    };

    test('should release escrow successfully', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEscrow),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/escrow/release',
        payload: {
          escrowId: 'escrow-123',
          transferId: 'transfer-456',
          releaseReason: 'transfer_completed',
        },
        headers: {
          'x-internal-service': 'transfer-service',
          'x-trace-id': 'trace-abc',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Escrow released successfully');
      expect(body.escrow.status).toBe('RELEASED');
    });

    test('should return success for already released escrow (idempotency)', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ ...mockEscrow, status: 'RELEASED' }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/escrow/release',
        payload: {
          escrowId: 'escrow-123',
          transferId: 'transfer-456',
        },
        headers: {
          'x-internal-service': 'transfer-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Escrow already released');
    });

    test('should return 400 for escrow not in HELD status', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ ...mockEscrow, status: 'CANCELLED' }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/escrow/release',
        payload: {
          escrowId: 'escrow-123',
          transferId: 'transfer-456',
        },
        headers: {
          'x-internal-service': 'transfer-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Cannot release escrow');
    });

    test('should return 404 for non-existent escrow', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/escrow/release',
        payload: {
          escrowId: 'non-existent',
          transferId: 'transfer-456',
        },
        headers: {
          'x-internal-service': 'transfer-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Escrow not found');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully on listing lookup', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/listings/listing-error',
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on escrow lookup', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Query timeout')),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/escrow/transfer-error',
        headers: {
          'x-internal-service': 'transfer-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on event processing', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockRejectedValue(new Error('Connection reset')),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/events',
        payload: {
          event: 'order.completed',
          data: { metadata: { listingId: 'listing-error' } },
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });
});
