// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { websocketService } from '../../../src/services/websocket.service';
import { logger } from '../../../src/utils/logger';

describe('WebSocketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should log initialization message', async () => {
      const mockServer = {};

      await websocketService.initialize(mockServer);

      expect(logger.info).toHaveBeenCalledWith('WebSocket service initialized (placeholder)');
    });

    it('should accept any server object', async () => {
      const mockHttpServer = { listen: jest.fn() };

      await expect(websocketService.initialize(mockHttpServer)).resolves.toBeUndefined();
    });

    it('should handle null server', async () => {
      await expect(websocketService.initialize(null)).resolves.toBeUndefined();
    });
  });

  describe('broadcast', () => {
    it('should log broadcast data', () => {
      const data = { type: 'metric', value: 42 };

      websocketService.broadcast(data);

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', data);
    });

    it('should handle complex data objects', () => {
      const complexData = {
        type: 'alert',
        payload: {
          id: 'alert-123',
          severity: 'critical',
          nested: { deep: 'value' },
        },
        timestamp: new Date(),
      };

      websocketService.broadcast(complexData);

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', complexData);
    });

    it('should handle null data', () => {
      websocketService.broadcast(null);

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', null);
    });

    it('should handle undefined data', () => {
      websocketService.broadcast(undefined);

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', undefined);
    });

    it('should handle string data', () => {
      websocketService.broadcast('simple message');

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', 'simple message');
    });

    it('should handle array data', () => {
      const arrayData = [1, 2, 3, { nested: true }];

      websocketService.broadcast(arrayData);

      expect(logger.debug).toHaveBeenCalledWith('Broadcasting data:', arrayData);
    });
  });

  describe('getConnectionCount', () => {
    it('should return 0 when no connections', () => {
      const count = websocketService.getConnectionCount();

      expect(count).toBe(0);
    });

    it('should return number type', () => {
      const count = websocketService.getConnectionCount();

      expect(typeof count).toBe('number');
    });
  });

  describe('exported instance', () => {
    it('should export websocketService as singleton', () => {
      const { websocketService: exported1 } = require('../../../src/services/websocket.service');
      const { websocketService: exported2 } = require('../../../src/services/websocket.service');
      expect(exported1).toBe(exported2);
    });
  });
});
