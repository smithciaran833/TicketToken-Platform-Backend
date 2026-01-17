import mongoose from 'mongoose';
import { logger } from '../../../src/utils/logger';

// Mock mongoose and logger BEFORE importing mongodb
jest.mock('mongoose');
jest.mock('../../../src/utils/logger');

describe('MongoDB Configuration', () => {
  let mockConnection: any;
  let initializeMongoDB: any;
  let getMongoDB: any;
  let closeMongoDB: any;
  let checkMongoDBHealth: any;
  let mongoConfig: any;

  beforeEach(() => {
    // Clear all mocks and reset modules to get fresh state
    jest.clearAllMocks();
    jest.resetModules();

    // Create fresh mock connection
    mockConnection = {
      readyState: 1,
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      db: {
        admin: jest.fn().mockReturnValue({
          ping: jest.fn().mockResolvedValue({ ok: 1 }),
        }),
      },
    };

    // Mock mongoose methods
    (mongoose.connect as jest.Mock) = jest.fn().mockResolvedValue(mockConnection);
    Object.defineProperty(mongoose, 'connection', {
      get: () => mockConnection,
      configurable: true,
    });

    // Re-import module to get fresh instance
    const mongoModule = require('../../../src/config/mongodb');
    initializeMongoDB = mongoModule.initializeMongoDB;
    getMongoDB = mongoModule.getMongoDB;
    closeMongoDB = mongoModule.closeMongoDB;
    checkMongoDBHealth = mongoModule.checkMongoDBHealth;
    mongoConfig = mongoModule.mongoConfig;
  });

  describe('mongoConfig', () => {
    it('should have default MongoDB URI', () => {
      expect(mongoConfig.uri).toBe('mongodb://localhost:27017/tickettoken_content');
    });

    it('should use environment variable for URI', () => {
      const originalEnv = process.env.MONGODB_URI;
      process.env.MONGODB_URI = 'mongodb://custom:27017/custom_db';

      jest.resetModules();
      const { mongoConfig: config } = require('../../../src/config/mongodb');

      expect(config.uri).toBe('mongodb://custom:27017/custom_db');

      process.env.MONGODB_URI = originalEnv;
    });

    it('should have connection pool configuration', () => {
      expect(mongoConfig.options.maxPoolSize).toBe(10);
      expect(mongoConfig.options.minPoolSize).toBe(2);
    });

    it('should have timeout configuration', () => {
      expect(mongoConfig.options.socketTimeoutMS).toBe(45000);
      expect(mongoConfig.options.serverSelectionTimeoutMS).toBe(5000);
    });

    it('should configure IPv4', () => {
      expect(mongoConfig.options.family).toBe(4);
    });
  });

  describe('initializeMongoDB()', () => {
    it('should connect to MongoDB successfully', async () => {
      const connection = await initializeMongoDB();

      expect(mongoose.connect).toHaveBeenCalledWith(mongoConfig.uri, mongoConfig.options);
      expect(connection).toBe(mockConnection);
      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Connecting...', expect.any(Object));
    });

    it('should mask credentials in logs', async () => {
      const originalEnv = process.env.MONGODB_URI;
      process.env.MONGODB_URI = 'mongodb://user:password@localhost:27017/db';

      jest.resetModules();
      Object.defineProperty(mongoose, 'connection', {
        get: () => mockConnection,
        configurable: true,
      });
      const { initializeMongoDB: init } = require('../../../src/config/mongodb');

      await init();

      expect(logger.info).toHaveBeenCalledWith(
        '[MongoDB] Connecting...',
        expect.objectContaining({
          uri: expect.stringContaining('***:***@'),
        })
      );

      process.env.MONGODB_URI = originalEnv;
    });

    it('should return existing connection if already connected', async () => {
      await initializeMongoDB();
      (mongoose.connect as jest.Mock).mockClear();

      const connection = await initializeMongoDB();

      expect(mongoose.connect).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Already connected');
      expect(connection).toBe(mockConnection);
    });

    it('should setup event handlers', async () => {
      await initializeMongoDB();

      expect(mockConnection.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('should log on connected event', async () => {
      await initializeMongoDB();

      const connectedHandler = mockConnection.on.mock.calls.find(
        (call: any) => call[0] === 'connected'
      )[1];

      connectedHandler();

      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Connected successfully');
    });

    it('should log on error event', async () => {
      await initializeMongoDB();

      const errorHandler = mockConnection.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )[1];

      const error = new Error('Connection error');
      errorHandler(error);

      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Connection error:', error);
    });

    it('should log on disconnected event', async () => {
      await initializeMongoDB();

      const disconnectedHandler = mockConnection.on.mock.calls.find(
        (call: any) => call[0] === 'disconnected'
      )[1];

      disconnectedHandler();

      expect(logger.warn).toHaveBeenCalledWith('[MongoDB] Disconnected');
    });

    it('should log initialization complete', async () => {
      await initializeMongoDB();

      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Initialization complete');
    });

    it('should throw error on connection failure', async () => {
      const error = new Error('Connection failed');
      (mongoose.connect as jest.Mock).mockRejectedValue(error);

      await expect(initializeMongoDB()).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Failed to initialize:', error);
    });
  });

  describe('getMongoDB()', () => {
    it('should return connection when connected', async () => {
      await initializeMongoDB();

      const connection = getMongoDB();

      expect(connection).toBe(mockConnection);
    });

    it('should throw error when not initialized', () => {
      expect(() => getMongoDB()).toThrow('MongoDB not initialized. Call initializeMongoDB() first.');
    });

    it('should throw error when connection is not ready', async () => {
      await initializeMongoDB();
      mockConnection.readyState = 0;

      expect(() => getMongoDB()).toThrow('MongoDB not initialized. Call initializeMongoDB() first.');
    });
  });

  describe('closeMongoDB()', () => {
    it('should close connection successfully', async () => {
      await initializeMongoDB();

      await closeMongoDB();

      expect(mockConnection.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[MongoDB] Connection closed');
    });

    it('should handle null connection', async () => {
      await closeMongoDB();

      expect(mockConnection.close).not.toHaveBeenCalled();
    });

    it('should throw error on close failure', async () => {
      await initializeMongoDB();
      const error = new Error('Close failed');
      mockConnection.close.mockRejectedValue(error);

      await expect(closeMongoDB()).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Error closing connection:', error);
    });
  });

  describe('checkMongoDBHealth()', () => {
    it('should return true when healthy', async () => {
      await initializeMongoDB();

      const result = await checkMongoDBHealth();

      expect(result).toBe(true);
      expect(mockConnection.db.admin).toHaveBeenCalled();
    });

    it('should return false when connection is null', async () => {
      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });

    it('should return false when db is undefined', async () => {
      await initializeMongoDB();
      mockConnection.db = undefined;

      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });

    it('should return false when ping fails', async () => {
      await initializeMongoDB();
      mockConnection.db.admin().ping.mockRejectedValue(new Error('Ping failed'));

      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('[MongoDB] Health check failed:', expect.any(Error));
    });

    it('should return false when readyState is not 1', async () => {
      await initializeMongoDB();
      mockConnection.readyState = 0;

      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });

    it('should return false when ping.ok is not 1', async () => {
      await initializeMongoDB();
      mockConnection.db.admin().ping.mockResolvedValue({ ok: 0 });

      const result = await checkMongoDBHealth();

      expect(result).toBe(false);
    });
  });

  describe('SIGINT Handler', () => {
    it('should setup SIGINT handler', async () => {
      const processSpy = jest.spyOn(process, 'on');

      await initializeMongoDB();

      expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      processSpy.mockRestore();
    });
  });
});
