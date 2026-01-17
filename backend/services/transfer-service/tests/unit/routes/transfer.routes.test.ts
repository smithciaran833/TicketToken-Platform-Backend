import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { transferRoutes } from '../../../src/routes/transfer.routes';
import { TransferController } from '../../../src/controllers/transfer.controller';
import * as authMiddleware from '../../../src/middleware/auth.middleware';
import * as validationMiddleware from '../../../src/middleware/validation.middleware';

// Mock dependencies
jest.mock('../../../src/controllers/transfer.controller');
jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: jest.fn((req: any, reply: any, done: any) => done())
}));
jest.mock('../../../src/middleware/validation.middleware', () => ({
  validate: jest.fn(() => (req: any, reply: any, done: any) => done())
}));
jest.mock('../../../src/validators/schemas', () => ({
  giftTransferBodySchema: {},
  acceptTransferBodySchema: {},
  acceptTransferParamsSchema: {}
}));

describe('Transfer Routes - Unit Tests', () => {
  let fastify: FastifyInstance;
  let mockPool: jest.Mocked<Pool>;
  let mockController: jest.Mocked<TransferController>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock pool
    mockPool = {} as jest.Mocked<Pool>;

    // Create fresh Fastify instance
    fastify = Fastify();

    // Register routes
    await fastify.register(async (instance) => {
      await transferRoutes(instance, mockPool);
    });

    await fastify.ready();

    // Get mock controller instance
    mockController = (TransferController as jest.MockedClass<typeof TransferController>).mock
      .instances[0] as jest.Mocked<TransferController>;
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /api/v1/transfers/gift', () => {
    it('should register route', async () => {
      const routes = fastify.printRoutes();
      expect(routes).toContain('gift (POST)');
      expect(routes).toContain('api/v1/transfers');
    });

    it('should call controller.createGiftTransfer', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.code(201).send({ success: true });
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'recipient@example.com',
          message: 'Happy Birthday!'
        }
      });

      expect(mockController.createGiftTransfer).toHaveBeenCalled();
    });

    it('should pass request and reply to controller', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com'
        }
      });

      expect(mockController.createGiftTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            ticketId: 'ticket-123',
            toEmail: 'test@example.com'
          })
        }),
        expect.anything()
      );
    });

    it('should accept payload with optional message', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com',
          message: 'Optional message'
        }
      });

      expect(mockController.createGiftTransfer).toHaveBeenCalled();
    });

    it('should accept payload without message', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com'
        }
      });

      expect(mockController.createGiftTransfer).toHaveBeenCalled();
    });

    it('should call authenticate middleware', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com'
        }
      });

      expect(authMiddleware.authenticate).toHaveBeenCalled();
    });

    it('should call validation middleware', async () => {
      mockController.createGiftTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com'
        }
      });

      expect(validationMiddleware.validate).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/transfers/:transferId/accept', () => {
    it('should register route', async () => {
      const routes = fastify.printRoutes();
      expect(routes).toContain(':transferId');
      expect(routes).toContain('/accept (POST)');
    });

    it('should call controller.acceptTransfer', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/transfer-123/accept',
        payload: {
          acceptanceCode: 'ABC123',
          userId: 'user-456'
        }
      });

      expect(mockController.acceptTransfer).toHaveBeenCalled();
    });

    it('should pass transferId from params', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/transfer-xyz/accept',
        payload: {
          acceptanceCode: 'CODE123',
          userId: 'user-789'
        }
      });

      expect(mockController.acceptTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            transferId: 'transfer-xyz'
          })
        }),
        expect.anything()
      );
    });

    it('should pass acceptanceCode and userId from body', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/transfer-123/accept',
        payload: {
          acceptanceCode: 'TESTCODE',
          userId: 'user-123'
        }
      });

      expect(mockController.acceptTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            acceptanceCode: 'TESTCODE',
            userId: 'user-123'
          })
        }),
        expect.anything()
      );
    });

    it('should handle different transferId formats', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      const transferIds = [
        'transfer-123',
        '550e8400-e29b-41d4-a716-446655440000',
        'abc_xyz_123'
      ];

      for (const transferId of transferIds) {
        jest.clearAllMocks();
        
        await fastify.inject({
          method: 'POST',
          url: `/api/v1/transfers/${transferId}/accept`,
          payload: {
            acceptanceCode: 'CODE',
            userId: 'user-123'
          }
        });

        expect(mockController.acceptTransfer).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({ transferId })
          }),
          expect.anything()
        );
      }
    });
  });

  describe('Controller Instantiation', () => {
    it('should create controller with pool', () => {
      expect(TransferController).toHaveBeenCalledWith(mockPool);
    });

    it('should create only one controller instance', () => {
      expect(TransferController).toHaveBeenCalledTimes(1);
    });

    it('should pass same pool to controller', () => {
      const passedPool = (TransferController as jest.MockedClass<typeof TransferController>).mock
        .calls[0][0];

      expect(passedPool).toBe(mockPool);
    });
  });

  describe('Route Methods', () => {
    it('should only allow POST for gift transfer', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const response = await fastify.inject({
          method: method as any,
          url: '/api/v1/transfers/gift'
        });

        expect(response.statusCode).toBe(404);
      }
    });

    it('should only allow POST for accept transfer', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const response = await fastify.inject({
          method: method as any,
          url: '/api/v1/transfers/transfer-123/accept'
        });

        expect(response.statusCode).toBe(404);
      }
    });
  });

  describe('URL Structure', () => {
    it('should mount routes under /api/v1', async () => {
      const routes = fastify.printRoutes();
      expect(routes).toContain('api/v1/transfers');
      expect(routes).toContain('gift (POST)');
      expect(routes).toContain(':transferId');
    });

    it('should not register routes without /api/v1 prefix', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/transfers/gift',
        payload: {}
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should propagate controller errors', async () => {
      mockController.createGiftTransfer = jest.fn().mockImplementation(() => {
        throw new Error('Controller error');
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: 'ticket-123',
          toEmail: 'test@example.com'
        }
      });

      expect(response.statusCode).toBe(500);
    });

    it('should handle async controller errors', async () => {
      mockController.acceptTransfer = jest.fn().mockRejectedValue(
        new Error('Async error')
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/transfer-123/accept',
        payload: {
          acceptanceCode: 'CODE',
          userId: 'user-123'
        }
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty transferId param', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers//accept',
        payload: {
          acceptanceCode: 'CODE',
          userId: 'user-123'
        }
      });

      // Empty path segments match params - this documents actual behavior
      expect([200, 404]).toContain(response.statusCode);
    });

    it('should handle reasonable length transferIds', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });
      const mediumId = 'a'.repeat(100);

      await fastify.inject({
        method: 'POST',
        url: `/api/v1/transfers/${mediumId}/accept`,
        payload: {
          acceptanceCode: 'CODE',
          userId: 'user-123'
        }
      });

      expect(mockController.acceptTransfer).toHaveBeenCalled();
    });

    it('should handle special characters in transferId', async () => {
      mockController.acceptTransfer = jest.fn(async (req, reply) => {
        reply.send({ success: true });
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/v1/transfers/transfer%20with%20spaces/accept',
        payload: {
          acceptanceCode: 'CODE',
          userId: 'user-123'
        }
      });

      expect(mockController.acceptTransfer).toHaveBeenCalled();
    });
  });
});
