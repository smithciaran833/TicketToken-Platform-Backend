/**
 * Comprehensive Unit Tests for src/config/mongodb.ts
 * 
 * Tests MongoDB connection management
 */

// Mock mongoose BEFORE any imports
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('mongoose', () => ({
  connect: mockConnect,
  disconnect: mockDisconnect,
}));

// Mock logger
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  info: mockLoggerInfo,
  error: mockLoggerError,
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('src/config/mongodb.ts - Comprehensive Unit Tests', () => {
  
  beforeEach(() => {
    // Clear mock calls but keep the mock implementations
    jest.clearAllMocks();
  });

  // =============================================================================
  // connectMongoDB()
  // =============================================================================

  describe('connectMongoDB()', () => {
    it('should call mongoose.connect with MongoDB URL', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await connectMongoDB();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledWith(expect.any(String));
    });

    it('should call mongoose.connect with correct URL format', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await connectMongoDB();

      const callArg = mockConnect.mock.calls[0][0];
      expect(callArg).toMatch(/^mongodb/);
    });

    it('should log success message after connection', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await connectMongoDB();

      expect(mockLoggerInfo).toHaveBeenCalledWith('✅ Connected to MongoDB');
    });

    it('should resolve when connection succeeds', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await expect(connectMongoDB()).resolves.toBeUndefined();
    });

    it('should log error when connection fails', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValue(error);

      try {
        await connectMongoDB();
      } catch (e) {
        // Expected to throw
      }

      expect(mockLoggerError).toHaveBeenCalledWith(
        { error },
        '❌ MongoDB connection error'
      );
    });

    it('should throw error when connection fails', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValue(error);

      await expect(connectMongoDB()).rejects.toThrow('Connection failed');
    });

    it('should throw the exact error from mongoose.connect', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const customError = new Error('Custom connection error');
      mockConnect.mockRejectedValue(customError);

      await expect(connectMongoDB()).rejects.toThrow(customError);
    });

    it('should handle network errors', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const networkError = new Error('ECONNREFUSED');
      mockConnect.mockRejectedValue(networkError);

      await expect(connectMongoDB()).rejects.toThrow('ECONNREFUSED');
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: networkError },
        '❌ MongoDB connection error'
      );
    });

    it('should handle authentication errors', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const authError = new Error('Authentication failed');
      mockConnect.mockRejectedValue(authError);

      await expect(connectMongoDB()).rejects.toThrow('Authentication failed');
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: authError },
        '❌ MongoDB connection error'
      );
    });

    it('should not log success if connection throws', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValue(error);

      try {
        await connectMongoDB();
      } catch (e) {
        // Expected to throw
      }

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const timeoutError = new Error('Connection timeout');
      timeoutError.name = 'MongooseServerSelectionError';
      mockConnect.mockRejectedValue(timeoutError);

      await expect(connectMongoDB()).rejects.toThrow('Connection timeout');
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: timeoutError },
        '❌ MongoDB connection error'
      );
    });

    it('should handle non-Error objects thrown by mongoose', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const errorObject = { code: 'ECONNREFUSED', message: 'Connection refused' };
      mockConnect.mockRejectedValue(errorObject);

      await expect(connectMongoDB()).rejects.toEqual(errorObject);
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: errorObject },
        '❌ MongoDB connection error'
      );
    });

    it('should handle string errors', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockRejectedValue('String error');

      await expect(connectMongoDB()).rejects.toBe('String error');
      expect(mockLoggerError).toHaveBeenCalledWith(
        { error: 'String error' },
        '❌ MongoDB connection error'
      );
    });
  });

  // =============================================================================
  // disconnectMongoDB()
  // =============================================================================

  describe('disconnectMongoDB()', () => {
    it('should call mongoose.disconnect', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectMongoDB();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should log success message after disconnection', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectMongoDB();

      expect(mockLoggerInfo).toHaveBeenCalledWith('MongoDB disconnected');
    });

    it('should resolve when disconnection succeeds', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await expect(disconnectMongoDB()).resolves.toBeUndefined();
    });

    it('should throw error if mongoose.disconnect fails', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Disconnect failed');
      mockDisconnect.mockRejectedValue(error);

      await expect(disconnectMongoDB()).rejects.toThrow('Disconnect failed');
    });

    it('should not log success if disconnection throws', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Disconnect failed');
      mockDisconnect.mockRejectedValue(error);

      try {
        await disconnectMongoDB();
      } catch (e) {
        // Expected to throw
      }

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('should handle already disconnected state', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectMongoDB();
      await disconnectMongoDB();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('exports', () => {
    it('should export connectMongoDB function', () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      expect(connectMongoDB).toBeDefined();
      expect(typeof connectMongoDB).toBe('function');
    });

    it('should export disconnectMongoDB function', () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      expect(disconnectMongoDB).toBeDefined();
      expect(typeof disconnectMongoDB).toBe('function');
    });

    it('should export mongoose instance', () => {
      const mongodbModule = require('../../../src/config/mongodb');
      expect(mongodbModule.mongoose).toBeDefined();
      expect(typeof mongodbModule.mongoose).toBe('object');
    });
  });

  // =============================================================================
  // INTEGRATION SCENARIOS
  // =============================================================================

  describe('integration scenarios', () => {
    it('should connect and disconnect in sequence', async () => {
      const { connectMongoDB, disconnectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);
      mockDisconnect.mockResolvedValue(undefined);

      await connectMongoDB();
      await disconnectMongoDB();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(mockLoggerInfo).toHaveBeenCalledWith('✅ Connected to MongoDB');
      expect(mockLoggerInfo).toHaveBeenCalledWith('MongoDB disconnected');
    });

    it('should handle multiple connection attempts', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await connectMongoDB();
      await connectMongoDB();
      await connectMongoDB();

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(mockLoggerInfo).toHaveBeenCalledTimes(3);
    });

    it('should handle connection retry after failure', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('First attempt failed');
      
      // First call fails
      mockConnect.mockRejectedValueOnce(error);
      // Second call succeeds
      mockConnect.mockResolvedValueOnce(undefined);

      await expect(connectMongoDB()).rejects.toThrow('First attempt failed');
      await expect(connectMongoDB()).resolves.toBeUndefined();

      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple disconnection calls', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectMongoDB();
      await disconnectMongoDB();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    });

    it('should handle disconnect error then success', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('First disconnect failed');
      
      mockDisconnect.mockRejectedValueOnce(error);
      mockDisconnect.mockResolvedValueOnce(undefined);

      await expect(disconnectMongoDB()).rejects.toThrow('First disconnect failed');
      await expect(disconnectMongoDB()).resolves.toBeUndefined();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // BEHAVIOR VERIFICATION
  // =============================================================================

  describe('behavior verification', () => {
    it('should not call disconnect during connect', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      mockConnect.mockResolvedValue(undefined);

      await connectMongoDB();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it('should not call connect during disconnect', async () => {
      const { disconnectMongoDB } = require('../../../src/config/mongodb');
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectMongoDB();

      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should log error and throw in correct order', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Test error');
      mockConnect.mockRejectedValue(error);

      let errorLogged = false;
      let exceptionThrown = false;

      mockLoggerError.mockImplementation(() => {
        errorLogged = true;
      });

      try {
        await connectMongoDB();
        exceptionThrown = false;
      } catch (e) {
        exceptionThrown = true;
      }

      expect(errorLogged).toBe(true);
      expect(exceptionThrown).toBe(true);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should preserve error details in logging', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const error = new Error('Detailed error');
      error.stack = 'Error stack trace here';
      mockConnect.mockRejectedValue(error);

      try {
        await connectMongoDB();
      } catch (e) {
        // Expected
      }

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({ error }),
        expect.any(String)
      );
    });

    it('should pass through the original error object unchanged', async () => {
      const { connectMongoDB } = require('../../../src/config/mongodb');
      const originalError = new Error('Original error');
      originalError.name = 'CustomError';
      (originalError as any).customProperty = 'customValue';
      mockConnect.mockRejectedValue(originalError);

      try {
        await connectMongoDB();
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBe(originalError);
        expect((e as any).customProperty).toBe('customValue');
      }
    });
  });

});
