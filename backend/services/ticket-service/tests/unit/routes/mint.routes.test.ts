import { FastifyInstance } from 'fastify';

// Mock dependencies
const mockProcessMintJob = jest.fn();
jest.mock('../../../src/workers/mintWorker', () => ({
  MintWorker: {
    processMintJob: mockProcessMintJob,
  },
}));

const mockPoolQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(() => ({
      query: mockPoolQuery,
    })),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

import mintRoutes from '../../../src/routes/mintRoutes';

describe('Mint Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let routes: Record<string, { handler: Function; preHandler?: Function[] }>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = {};

    mockFastify = {
      post: jest.fn((path, opts, handler) => {
        routes[`POST ${path}`] = { handler, preHandler: opts?.preHandler };
      }),
    };

    process.env.MINT_SERVICE_SECRET = 'test-mint-secret';
  });

  it('should register mint route', async () => {
    await mintRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/process-mint',
      expect.any(Object),
      expect.any(Function)
    );
  });

  describe('POST /process-mint', () => {
    it('should process mint job successfully', async () => {
      await mintRoutes(mockFastify as FastifyInstance);

      mockProcessMintJob.mockResolvedValue({
        success: true,
        tickets: [{ id: 'ticket-1' }],
      });

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {
          orderId: 'order-123',
          userId: 'user-456',
          quantity: 2,
        },
        tenantId: 'tenant-789',
      };

      await routes['POST /process-mint'].handler(mockRequest, mockReply);

      expect(mockProcessMintJob).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 500 on mint failure', async () => {
      await mintRoutes(mockFastify as FastifyInstance);

      mockProcessMintJob.mockRejectedValue(new Error('Mint failed'));

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {
          orderId: 'order-123',
          userId: 'user-456',
          quantity: 2,
        },
        tenantId: 'tenant-789',
      };

      await routes['POST /process-mint'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
