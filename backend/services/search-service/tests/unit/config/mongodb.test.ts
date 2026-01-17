// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/mongodb.ts
 */

jest.mock('mongoose');
jest.mock('../../../src/utils/logger');

describe('src/config/mongodb.ts - Comprehensive Unit Tests', () => {
  let mongoose: any;
  let logger: any;
  let mockConnection: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock connection
    mockConnection = {
      readyState: 1,
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      db: {
        admin: jest.fn().mockReturnValue({
          ping: jest.fn().mockResolvedValue({ ok: 1 })
        })
      }
    };

    // Mock mongoose
    mongoose = require('mongoose');
    mongoose.connect = jest.fn().mockResolvedValue(undefined);
    mongoose.connection = mockConnection;

    // Mock logger
    logger = require('../../../src/utils/logger').logger;
    logger.info = jest.fn();
    logger.error = jest.fn();
    logger.warn = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // mongoConfig - Default Values
  // =============================================================================

  describe('mongoConfig - Default Values', () => {
    it('should use default URI when not set', () => {
      delete process.env.MONGODB_URI;

      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.uri).toBe('mongodb://localhost:27017/tickettoken_content');
    });

    it('should use environment URI when set', () => {
      process.env.MONGODB_URI = 'mongodb://custom:27017/customdb';

      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.uri).toBe('mongodb://custom:27017/customdb');
    });

    it('should have maxPoolSize of 10', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.maxPoolSize).toBe(10);
    });

    it('should have minPoolSize of 2', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.minPoolSize).toBe(2);
    });

    it('should have socketTimeoutMS of 45000', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.socketTimeoutMS).toBe(45000);
    });

    it('should have serverSelectionTimeoutMS of 5000', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.serverSelectionTimeoutMS).toBe(5000);
    });

    it('should use IPv4', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.family).toBe(4);
    });

    it('should prefer secondary for reads', () => {
      const { mongoConfig } = require('../../../src/config/mongodb');

      expect(mongoConfig.options.readPreference).toBe('secondaryPreferred');
    });
  });

  // =============================================================================
  // initializeMongoDB() - Success Cases
  // =============================================================================

  describe('initializeMongoDB() - Success Cases', () => {
    it('should connect to MongoDB', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxPoolSize: 10,
          minPoolSize: 2
        })
      );
    });

    it('should return connection', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      const result = await initializeMongoDB();

      expect(result).toBe(mockConnection);
    });

    it('should log connection attempt', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(logger.info).toHaveBeenCalledWith(
        '[MongoDB] Connecting (read-only)...',
        expect.any(Object)
      );
    });

    it('should mask credentials in logs', async () => {
      process.env.MONGODB_URI = 'mongodb://user:password@localhost:27017/db';

      const { initializeMongoDB } = require('../../../src/config/mongodb');
      await initializeMongoDB();

      const logCall = logger.info.mock.calls.find(
        call => call[0].includes('Connecting')
      );
      expect(logCall[1].uri).not.toContain('password');
      expect(logCall[1].uri).toContain('***');
    });

    it('should register connected event handler', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(mockConnection.on).toHaveBeenCalledWith('connected', expect.any(Function));
    });

    it('should register error event handler', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register disconnected event handler', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(mockConnection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('should return existing connection if already connected', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      jest.clearAllMocks();
      const result = await initializeMongoDB();

      expect(mongoose.connect).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Already connected');
    });

    it('should log completion', async () => {
      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Initialization complete');
    });
  });

  // =============================================================================
  // initializeMongoDB() - Error Cases
  // =============================================================================

  describe('initializeMongoDB() - Error Cases', () => {
    it('should throw on connection failure', async () => {
      const error = new Error('Connection failed');
      mongoose.connect.mockRejectedValueOnce(error);

      const { initializeMongoDB } = require('../../../src/config/mongodb');

      await expect(initializeMongoDB()).rejects.toThrow('Connection failed');
    });

    it('should log error on failure', async () => {
      const error = new Error('Connection failed');
      mongoose.connect.mockRejectedValueOnce(error);

      const { initializeMongoDB } = require('../../../src/config/mongodb');

      try {
        await initializeMongoDB();
      } catch (e) {}

      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Failed to initialize:', error);
    });
  });

  // =============================================================================
  // getMongoDB() - Success Cases
  // =============================================================================

  describe('getMongoDB() - Success Cases', () => {
    it('should return connection when initialized', async () => {
      const { initializeMongoDB, getMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      const result = getMongoDB();

      expect(result).toBe(mockConnection);
    });

    it('should return connection with readyState 1', async () => {
      const { initializeMongoDB, getMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      const result = getMongoDB();

      expect(result.readyState).toBe(1);
    });
  });

  // =============================================================================
  // getMongoDB() - Error Cases
  // =============================================================================

  describe('getMongoDB() - Error Cases', () => {
    it('should throw when not initialized', () => {
      const { getMongoDB } = require('../../../src/config/mongodb');

      expect(() => getMongoDB()).toThrow('MongoDB not initialized');
    });

    it('should throw when connection not ready', async () => {
      mockConnection.readyState = 0;
      const { initializeMongoDB, getMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      expect(() => getMongoDB()).toThrow('MongoDB not initialized');
    });
  });

  // =============================================================================
  // closeMongoDB() - Success Cases
  // =============================================================================

  describe('closeMongoDB() - Success Cases', () => {
    it('should close connection', async () => {
      const { initializeMongoDB, closeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      await closeMongoDB();

      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should log closure', async () => {
      const { initializeMongoDB, closeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      await closeMongoDB();

      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Connection closed');
    });

    it('should handle null connection gracefully', async () => {
      const { closeMongoDB } = require('../../../src/config/mongodb');

      await expect(closeMongoDB()).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // closeMongoDB() - Error Cases
  // =============================================================================

  describe('closeMongoDB() - Error Cases', () => {
    it('should throw on close error', async () => {
      const error = new Error('Close failed');
      mockConnection.close.mockRejectedValueOnce(error);

      const { initializeMongoDB, closeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      await expect(closeMongoDB()).rejects.toThrow('Close failed');
    });

    it('should log error on failure', async () => {
      const error = new Error('Close failed');
      mockConnection.close.mockRejectedValueOnce(error);

      const { initializeMongoDB, closeMongoDB } = require('../../../src/config/mongodb');

      await initializeMongoDB();

      try {
        await closeMongoDB();
      } catch (e) {}

      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Error closing connection:', error);
    });
  });

  // =============================================================================
  // checkMongoDBHealth() - Success Cases
  // =============================================================================

  describe('checkMongoDBHealth() - Success Cases', () => {
    it('should return true when healthy', async () => {
      const { initializeMongoDB, checkMongoDBHealth } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      const result = await checkMongoDBHealth();

      expect(result).toBe(true);
    });

    it('should call ping', async () => {
      const { initializeMongoDB, checkMongoDBHealth } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      await checkMongoDBHealth();

      expect(mockConnection.db.admin().ping).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // checkMongoDBHealth() - Failure Cases
  // =============================================================================

  describe('checkMongoDBHealth() - Failure Cases', () => {
    it('should return false when not initialized', async () => {
      const { checkMongoDBHealth } = require('../../../src/config/mongodb');

      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });

    it('should return false when ping fails', async () => {
      mockConnection.db.admin().ping.mockRejectedValueOnce(new Error('Ping failed'));

      const { initializeMongoDB, checkMongoDBHealth } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });

    it('should log error on health check failure', async () => {
      const error = new Error('Ping failed');
      mockConnection.db.admin().ping.mockRejectedValueOnce(error);

      const { initializeMongoDB, checkMongoDBHealth } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      await checkMongoDBHealth();

      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Health check failed:', error);
    });

    it('should return false when readyState not 1', async () => {
      mockConnection.readyState = 0;

      const { initializeMongoDB, checkMongoDBHealth } = require('../../../src/config/mongodb');

      await initializeMongoDB();
      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export mongoConfig', () => {
      const module = require('../../../src/config/mongodb');

      expect(module.mongoConfig).toBeDefined();
      expect(typeof module.mongoConfig).toBe('object');
    });

    it('should export initializeMongoDB', () => {
      const module = require('../../../src/config/mongodb');

      expect(module.initializeMongoDB).toBeDefined();
      expect(typeof module.initializeMongoDB).toBe('function');
    });

    it('should export getMongoDB', () => {
      const module = require('../../../src/config/mongodb');

      expect(module.getMongoDB).toBeDefined();
      expect(typeof module.getMongoDB).toBe('function');
    });

    it('should export closeMongoDB', () => {
      const module = require('../../../src/config/mongodb');

      expect(module.closeMongoDB).toBeDefined();
      expect(typeof module.closeMongoDB).toBe('function');
    });

    it('should export checkMongoDBHealth', () => {
      const module = require('../../../src/config/mongodb');

      expect(module.checkMongoDBHealth).toBeDefined();
      expect(typeof module.checkMongoDBHealth).toBe('function');
    });
  });
});
