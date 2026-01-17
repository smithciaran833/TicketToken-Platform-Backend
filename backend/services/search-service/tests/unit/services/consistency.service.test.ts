// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/consistency.service.ts
 */

describe('src/services/consistency.service.ts - Comprehensive Unit Tests', () => {
  let ConsistencyService: any;
  let mockElasticsearch: any;
  let mockDb: any;
  let mockLogger: any;
  let mockTrx: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useFakeTimers();
    jest.spyOn(global, 'setInterval');

    // Create chainable query builder
    const createQueryChain = (result: any) => {
      const chain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(result),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
        whereNull: jest.fn().mockReturnThis()
      };
      return chain;
    };

    // Mock transaction - must be CALLABLE and have methods
    mockTrx = jest.fn((table) => {
      if (table === 'index_queue') {
        return createQueryChain(null);
      }
      if (table === 'index_versions') {
        return createQueryChain({ version: 1 });
      }
      if (table === 'read_consistency_tokens') {
        return createQueryChain(null);
      }
      return createQueryChain(null);
    });

    // Add transaction methods
    mockTrx.commit = jest.fn().mockResolvedValue(undefined);
    mockTrx.rollback = jest.fn().mockResolvedValue(undefined);
    mockTrx.raw = jest.fn().mockResolvedValue({ rows: [{ version: 1 }] });

    // Mock database - transaction returns the callable mockTrx
    mockDb = jest.fn((table) => createQueryChain(null));
    mockDb.transaction = jest.fn().mockResolvedValue(mockTrx);
    mockDb.fn = { now: jest.fn().mockReturnValue('NOW()') };
    mockDb.raw = jest.fn().mockReturnThis();

    // Mock Elasticsearch
    mockElasticsearch = {
      index: jest.fn().mockResolvedValue({ result: 'created' }),
      delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
      indices: {
        refresh: jest.fn().mockResolvedValue({ _shards: { successful: 1 } })
      }
    };

    // Mock logger
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    };

    ConsistencyService = require('../../../src/services/consistency.service').ConsistencyService;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with elasticsearch', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(service['elasticsearch']).toBe(mockElasticsearch);
    });

    it('should initialize with database', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(service['db']).toBe(mockDb);
    });

    it('should create child logger', () => {
      new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(mockLogger.child).toHaveBeenCalledWith({ component: 'ConsistencyService' });
    });

    it('should initialize indexingInProgress map', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(service['indexingInProgress']).toBeInstanceOf(Map);
    });

    it('should start background processor', () => {
      new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
  });

  // =============================================================================
  // indexWithConsistency() - Basic Flow
  // =============================================================================

  describe('indexWithConsistency() - Basic Flow', () => {
    it('should generate consistency token', async () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      const result = await service.indexWithConsistency({
        entityType: 'event',
        entityId: 'event-1',
        operation: 'CREATE',
        payload: {}
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('versions');
      expect(result).toHaveProperty('expiresAt');
    });

    it('should call transaction', async () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      await service.indexWithConsistency({
        entityType: 'event',
        entityId: 'event-1',
        operation: 'CREATE',
        payload: {}
      });

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should commit transaction', async () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      await service.indexWithConsistency({
        entityType: 'event',
        entityId: 'event-1',
        operation: 'CREATE',
        payload: {}
      });

      expect(mockTrx.commit).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // waitForConsistency()
  // =============================================================================

  describe('waitForConsistency()', () => {
    it('should return true for missing token', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      }));

      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      const result = await service.waitForConsistency('invalid-token');

      expect(result).toBe(true);
    });

    it('should return true for expired token', async () => {
      const expiredDate = new Date(Date.now() - 10000);
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          required_versions: '{}',
          expires_at: expiredDate
        })
      }));

      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      const result = await service.waitForConsistency('expired-token');

      expect(result).toBe(true);
    });

    it('should return true on error', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('DB error'))
      }));

      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      const result = await service.waitForConsistency('error-token');

      expect(result).toBe(true);
    });
  });

  // =============================================================================
  // forceRefresh()
  // =============================================================================

  describe('forceRefresh()', () => {
    it('should refresh specified indices', async () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      await service.forceRefresh(['events', 'venues']);

      expect(mockElasticsearch.indices.refresh).toHaveBeenCalledWith({
        index: ['events', 'venues']
      });
    });

    it('should refresh default indices', async () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      await service.forceRefresh();

      expect(mockElasticsearch.indices.refresh).toHaveBeenCalledWith({
        index: ['events', 'venues']
      });
    });

    it('should log errors', async () => {
      mockElasticsearch.indices.refresh.mockRejectedValue(new Error('Refresh failed'));

      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      await service.forceRefresh();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Class Structure
  // =============================================================================

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(service).toBeInstanceOf(ConsistencyService);
    });

    it('should have indexWithConsistency method', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(typeof service.indexWithConsistency).toBe('function');
    });

    it('should have waitForConsistency method', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(typeof service.waitForConsistency).toBe('function');
    });

    it('should have forceRefresh method', () => {
      const service = new ConsistencyService({
        elasticsearch: mockElasticsearch,
        db: mockDb,
        logger: mockLogger
      });

      expect(typeof service.forceRefresh).toBe('function');
    });
  });
});
