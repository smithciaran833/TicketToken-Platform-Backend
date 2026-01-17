import { FastifyInstance } from 'fastify';
import { gracefulShutdown } from '../../../src/utils/graceful-shutdown';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../../../src/config/redis', () => ({
  closeRedisConnections: jest.fn().mockResolvedValue(undefined),
}));

describe('graceful-shutdown.ts', () => {
  let mockServer: any;
  let mockExit: jest.SpyInstance;
  let mockSetTimeout: jest.SpyInstance;
  let mockClearTimeout: jest.SpyInstance;
  let processOnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockServer = {
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockSetTimeout = jest.spyOn(global, 'setTimeout');
    mockClearTimeout = jest.spyOn(global, 'clearTimeout');
    processOnSpy = jest.spyOn(process, 'on');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('gracefulShutdown', () => {
    it('registers SIGTERM and SIGINT handlers', () => {
      gracefulShutdown(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('closes server on shutdown signal', async () => {
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('closes Redis connections on shutdown', async () => {
      const { closeRedisConnections } = require('../../../src/config/redis');
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(closeRedisConnections).toHaveBeenCalled();
    });

    it('exits with code 0 on successful shutdown', async () => {
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with code 1 on error during shutdown', async () => {
      const error = new Error('Shutdown failed');
      mockServer.close = jest.fn().mockRejectedValue(error);

      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('sets a 30 second timeout for shutdown', async () => {
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('clears timeout on successful shutdown', async () => {
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      await sigtermHandler();

      expect(mockClearTimeout).toHaveBeenCalled();
    });

    it('ignores duplicate shutdown signals', async () => {
      gracefulShutdown(mockServer);

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];
      
      // First call
      const firstShutdown = sigtermHandler();
      
      // Second call before first completes
      await sigtermHandler();

      await firstShutdown;

      // Server.close should only be called once
      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });
  });
});
