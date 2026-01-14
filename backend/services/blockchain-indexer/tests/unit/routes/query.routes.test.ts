/**
 * Comprehensive Unit Tests for src/routes/query.routes.ts
 *
 * Tests query routes with authentication and validation
 */

// Mock logger - not used directly but needed for imports
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock auth middleware
const mockVerifyJWT = jest.fn((req, reply) => Promise.resolve());
jest.mock('../../../src/middleware/auth', () => ({
  verifyJWT: mockVerifyJWT,
}));

// Mock database
const mockDb = {
  query: jest.fn(),
};
jest.mock('../../../src/utils/database', () => ({
  default: mockDb,
  __esModule: true,
}));

// Mock Mongoose models
const mockBlockchainTransaction = {
  findOne: jest.fn(),
};
jest.mock('../../../src/models/blockchain-transaction.model', () => ({
  BlockchainTransaction: mockBlockchainTransaction,
}));

const mockWalletActivity = {
  find: jest.fn(),
  countDocuments: jest.fn(),
};
jest.mock('../../../src/models/wallet-activity.model', () => ({
  WalletActivity: mockWalletActivity,
}));

const mockMarketplaceEvent = {
  find: jest.fn(),
  countDocuments: jest.fn(),
};
jest.mock('../../../src/models/marketplace-event.model', () => ({
  MarketplaceEvent: mockMarketplaceEvent,
}));

// Mock cache
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};
const mockGetCache = jest.fn(() => mockCache);
jest.mock('../../../src/utils/cache', () => ({
  getCache: mockGetCache,
  CacheKeys: {
    transaction: jest.fn(),
    walletActivity: jest.fn(),
  },
}));

import queryRoutes from '../../../src/routes/query.routes';

describe('src/routes/query.routes.ts - Comprehensive Unit Tests', () => {
  let mockApp: any;
  let routes: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    mockApp = {
      get: jest.fn((path: string, options: any, handler: any) => {
        // If handler is undefined, options is the handler
        const actualHandler = handler || options;
        routes.set(path, actualHandler);
      }),
    };

    // Setup default mock behaviors
    mockDb.query.mockResolvedValue({ rows: [] });
    mockBlockchainTransaction.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    mockWalletActivity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    mockWalletActivity.countDocuments.mockResolvedValue(0);
    mockMarketplaceEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    mockMarketplaceEvent.countDocuments.mockResolvedValue(0);
  });

  // =============================================================================
  // ROUTE REGISTRATION
  // =============================================================================

  describe('Route Registration', () => {
    it('should register all query routes', async () => {
      await queryRoutes(mockApp);

      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/transactions/:signature',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/wallets/:address/activity',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/transactions/by-slot/:slot',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/nfts/:tokenId/history',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/marketplace/activity',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/sync/status',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockApp.get).toHaveBeenCalledWith(
        '/api/v1/reconciliation/discrepancies',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // =============================================================================
  // GET /api/v1/transactions/:signature
  // =============================================================================

  describe('GET /api/v1/transactions/:signature', () => {
    it('should return transaction with full data', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/:signature');

      const pgData = {
        id: '1',
        signature: 'sig123',
        slot: 12345,
        block_time: '2024-01-01T00:00:00Z',
      };

      const mongoData = {
        signature: 'sig123',
        accounts: [],
        instructions: [],
      };

      mockDb.query.mockResolvedValue({ rows: [pgData] });
      mockBlockchainTransaction.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mongoData),
      });

      const mockRequest = {
        params: { signature: 'sig123' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        ...pgData,
        fullData: mongoData,
      });

      expect(mockRequest.log.info).toHaveBeenCalledWith(
        expect.objectContaining({ signature: 'sig123' }),
        'Querying transaction by signature'
      );
    });

    it('should return 404 when transaction not found', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/:signature');

      mockDb.query.mockResolvedValue({ rows: [] });

      const mockRequest = {
        params: { signature: 'nonexistent' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Transaction not found',
      });
    });

    it('should handle database errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/:signature');

      mockDb.query.mockRejectedValue(new Error('DB error'));

      const mockRequest = {
        params: { signature: 'sig123' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/wallets/:address/activity
  // =============================================================================

  describe('GET /api/v1/wallets/:address/activity', () => {
    it('should return wallet activity with pagination', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/wallets/:address/activity');

      const activities = [
        { walletAddress: 'wallet123', activityType: 'purchase' },
        { walletAddress: 'wallet123', activityType: 'sale' },
      ];

      mockWalletActivity.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(activities),
      });
      mockWalletActivity.countDocuments.mockResolvedValue(100);

      const mockRequest = {
        params: { address: 'wallet123' },
        query: { limit: 50, offset: 0, activityType: 'all' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        activities,
        pagination: {
          total: 100,
          limit: 50,
          offset: 0,
          hasMore: true,
        },
      });
    });

    it('should filter by activity type', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/wallets/:address/activity');

      mockWalletActivity.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const mockRequest = {
        params: { address: 'wallet123' },
        query: { activityType: 'purchase' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      await handler(mockRequest, {});

      expect(mockWalletActivity.find).toHaveBeenCalledWith({
        walletAddress: 'wallet123',
        activityType: 'purchase',
      });
    });

    it('should use default pagination values', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/wallets/:address/activity');

      mockWalletActivity.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const mockRequest = {
        params: { address: 'wallet123' },
        query: {},
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result.pagination.limit).toBe(50);
      expect(result.pagination.offset).toBe(0);
    });

    it('should handle errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/wallets/:address/activity');

      mockWalletActivity.find.mockImplementation(() => {
        throw new Error('DB error');
      });

      const mockRequest = {
        params: { address: 'wallet123' },
        query: {},
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/transactions/by-slot/:slot
  // =============================================================================

  describe('GET /api/v1/transactions/by-slot/:slot', () => {
    it('should return transactions for a slot', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/by-slot/:slot');

      const transactions = [
        { signature: 'sig1', slot: 12345 },
        { signature: 'sig2', slot: 12345 },
      ];

      mockDb.query.mockResolvedValue({ rows: transactions });

      const mockRequest = {
        params: { slot: '12345' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({ transactions });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE slot = $1'),
        [12345]
      );
    });

    it('should return 400 for invalid slot', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/by-slot/:slot');

      const mockRequest = {
        params: { slot: 'invalid' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid slot number',
      });
    });

    it('should handle database errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/transactions/by-slot/:slot');

      mockDb.query.mockRejectedValue(new Error('DB error'));

      const mockRequest = {
        params: { slot: '12345' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/nfts/:tokenId/history
  // =============================================================================

  describe('GET /api/v1/nfts/:tokenId/history', () => {
    it('should return NFT transfer history', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/nfts/:tokenId/history');

      const history = [
        { assetId: 'token123', activityType: 'transfer' },
        { assetId: 'token123', activityType: 'mint' },
      ];

      mockWalletActivity.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(history),
      });

      const mockRequest = {
        params: { tokenId: 'token123' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        tokenId: 'token123',
        history,
      });

      expect(mockWalletActivity.find).toHaveBeenCalledWith({
        assetId: 'token123',
      });
    });

    it('should handle errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/nfts/:tokenId/history');

      mockWalletActivity.find.mockImplementation(() => {
        throw new Error('DB error');
      });

      const mockRequest = {
        params: { tokenId: 'token123' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/marketplace/activity
  // =============================================================================

  describe('GET /api/v1/marketplace/activity', () => {
    it('should return marketplace events with pagination', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/marketplace/activity');

      const events = [
        { eventType: 'sale', marketplace: 'magic_eden' },
        { eventType: 'listing', marketplace: 'tensor' },
      ];

      mockMarketplaceEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(events),
      });
      mockMarketplaceEvent.countDocuments.mockResolvedValue(50);

      const mockRequest = {
        query: { limit: 50, offset: 0 },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        events,
        pagination: {
          total: 50,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      });
    });

    it('should filter by marketplace', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/marketplace/activity');

      mockMarketplaceEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const mockRequest = {
        query: { marketplace: 'magic_eden' },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      await handler(mockRequest, {});

      expect(mockMarketplaceEvent.find).toHaveBeenCalledWith({
        marketplace: 'magic_eden',
      });
    });

    it('should handle errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/marketplace/activity');

      mockMarketplaceEvent.find.mockImplementation(() => {
        throw new Error('DB error');
      });

      const mockRequest = {
        query: {},
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/sync/status
  // =============================================================================

  describe('GET /api/v1/sync/status', () => {
    it('should return indexer sync status', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/sync/status');

      const state = {
        id: 1,
        last_processed_slot: 12345,
        last_processed_signature: 'sig123',
        indexer_version: '1.0.0',
        is_running: true,
        started_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };

      mockDb.query.mockResolvedValue({ rows: [state] });

      const mockRequest = {
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        lastProcessedSlot: 12345,
        lastProcessedSignature: 'sig123',
        indexerVersion: '1.0.0',
        isRunning: true,
        startedAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      });
    });

    it('should return 404 when state not found', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/sync/status');

      mockDb.query.mockResolvedValue({ rows: [] });

      const mockRequest = {
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Indexer state not found',
      });
    });

    it('should handle errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/sync/status');

      mockDb.query.mockRejectedValue(new Error('DB error'));

      const mockRequest = {
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // GET /api/v1/reconciliation/discrepancies
  // =============================================================================

  describe('GET /api/v1/reconciliation/discrepancies', () => {
    it('should return discrepancies with pagination', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/reconciliation/discrepancies');

      const discrepancies = [
        { id: 1, ticket_id: 'ticket1', resolved: false },
        { id: 2, ticket_id: 'ticket2', resolved: false },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: discrepancies });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const mockRequest = {
        query: { limit: 50, offset: 0 },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const result = await handler(mockRequest, {});

      expect(result).toEqual({
        discrepancies,
        pagination: {
          total: 10,
          limit: 50,
          offset: 0,
        },
      });
    });

    it('should filter by resolved status', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/reconciliation/discrepancies');

      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const mockRequest = {
        query: { resolved: true },
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      await handler(mockRequest, {});

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE resolved = $1'),
        expect.arrayContaining([true])
      );
    });

    it('should handle errors', async () => {
      await queryRoutes(mockApp);
      const handler = routes.get('/api/v1/reconciliation/discrepancies');

      mockDb.query.mockRejectedValue(new Error('DB error'));

      const mockRequest = {
        query: {},
        log: { info: jest.fn(), error: jest.fn() },
        user: { userId: 'user-123' },
      };

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export query routes function', () => {
      expect(typeof queryRoutes).toBe('function');
    });
  });
});
