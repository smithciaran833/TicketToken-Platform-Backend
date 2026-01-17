/**
 * MongoDB Configuration Tests
 */

// Mock MongoDB before imports
const mockCollection = {
  createIndex: jest.fn().mockResolvedValue('index_name'),
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
};

const mockClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockDb),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => mockClient),
  Db: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    mongodb: {
      uri: 'mongodb://localhost:27017/test',
      user: '',
      password: '',
    },
  },
}));

describe('MongoDB Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectMongoDB', () => {
    it('should connect to MongoDB successfully', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const { MongoClient } = require('mongodb');
      
      await connectMongoDB();
      
      expect(MongoClient).toHaveBeenCalled();
    });

    it('should create indexes after connection', async () => {
      const { connectMongoDB, getMongoDB } = require('../../../src/config/mongodb');
      
      await connectMongoDB();
      const db = getMongoDB();
      
      expect(db.collection).toHaveBeenCalledWith('user_behavior');
      expect(db.collection).toHaveBeenCalledWith('event_analytics');
      expect(db.collection).toHaveBeenCalledWith('application_logs');
    });
  });

  describe('getMongoDB', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      
      jest.mock('mongodb', () => ({
        MongoClient: jest.fn(),
        Db: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { mongodb: { uri: 'mongodb://localhost:27017/test', user: '', password: '' } },
      }));

      const { getMongoDB } = require('../../../src/config/mongodb');
      
      expect(() => getMongoDB()).toThrow('MongoDB not initialized');
    });

    it('should return db after connection', async () => {
      jest.resetModules();
      
      jest.mock('mongodb', () => ({
        MongoClient: jest.fn().mockImplementation(() => mockClient),
        Db: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { mongodb: { uri: 'mongodb://localhost:27017/test', user: '', password: '' } },
      }));

      const { connectMongoDB, getMongoDB } = require('../../../src/config/mongodb');
      
      await connectMongoDB();
      const db = getMongoDB();
      
      expect(db).toBeDefined();
    });
  });

  describe('getMongoClient', () => {
    it('should throw if not initialized', () => {
      jest.resetModules();
      
      jest.mock('mongodb', () => ({
        MongoClient: jest.fn(),
        Db: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { mongodb: { uri: 'mongodb://localhost:27017/test', user: '', password: '' } },
      }));

      const { getMongoClient } = require('../../../src/config/mongodb');
      
      expect(() => getMongoClient()).toThrow('MongoDB client not initialized');
    });
  });

  describe('closeMongoDB', () => {
    it('should close connection', async () => {
      jest.resetModules();
      
      jest.mock('mongodb', () => ({
        MongoClient: jest.fn().mockImplementation(() => mockClient),
        Db: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { mongodb: { uri: 'mongodb://localhost:27017/test', user: '', password: '' } },
      }));

      const { connectMongoDB, closeMongoDB, getMongoClient } = require('../../../src/config/mongodb');
      
      await connectMongoDB();
      await closeMongoDB();
      
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle case when not connected', async () => {
      jest.resetModules();
      
      jest.mock('mongodb', () => ({
        MongoClient: jest.fn(),
        Db: jest.fn(),
      }));
      jest.mock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.mock('../../../src/config/index', () => ({
        config: { mongodb: { uri: 'mongodb://localhost:27017/test', user: '', password: '' } },
      }));

      const { closeMongoDB } = require('../../../src/config/mongodb');
      
      await expect(closeMongoDB()).resolves.toBeUndefined();
    });
  });
});
