// =============================================================================
// TEST SUITE - purchaseController
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { PurchaseController } from '../../../src/controllers/purchaseController';
import knex from 'knex';
import { discountService } from '../../../src/services/discountService';

jest.mock('knex');
jest.mock('../../../src/services/discountService');

describe('PurchaseController', () => {
  let controller: PurchaseController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockTrx: any;
  let mockDb: any;

  beforeEach(() => {
    controller = new PurchaseController();
    
    mockRequest = {
      body: {},
      headers: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockTrx = {
      transaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      raw: jest.fn((sql, params) => `${sql} with ${params}`),
    };

    // Mock query builder chain
    const createQueryBuilder = () => {
      const builder: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn(),
        insert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(1),
      };
      return builder;
    };

    mockTrx = jest.fn((tableName: string) => createQueryBuilder());
    mockTrx.transaction = jest.fn();
    mockTrx.commit = jest.fn();
    mockTrx.rollback = jest.fn();
    mockTrx.raw = jest.fn((sql) => sql);

    mockDb = jest.fn(() => mockTrx);
    mockDb.transaction = jest.fn((callback) => callback(mockTrx));

    (knex as any).mockReturnValue(mockDb);

    jest.clearAllMocks();
  });

  describe('createOrder()', () => {
    it('should return 400 if idempotency key missing', async () => {
      mockRequest.headers = {};

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required',
      });
    });

    it('should return 400 if eventId missing', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-123' };
      mockRequest.body = { items: [] };
      (mockRequest as any).userId = 'user-123';

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required',
      });
    });

    it('should return 400 if items array empty', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-123' };
      mockRequest.body = { eventId: 'event-123', items: [], tenantId: 'tenant-123' };
      (mockRequest as any).userId = 'user-123';

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if tenantId missing', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-123' };
      mockRequest.body = {
        eventId: 'event-123',
        items: [{ ticketTypeId: 'type-1', quantity: 1 }],
      };
      (mockRequest as any).userId = 'user-123';

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'tenantId required',
      });
    });
  });
});
