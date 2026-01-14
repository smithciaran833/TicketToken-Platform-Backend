/**
 * Unit Tests for src/utils/async-handler.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { setupGlobalErrorHandlers } from '../../../src/utils/async-handler';

describe('utils/async-handler', () => {
  let mockExit: jest.SpyInstance;
  let mockProcessOn: jest.SpyInstance;
  let registeredHandlers: Map<string, Function>;

  beforeEach(() => {
    registeredHandlers = new Map();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockProcessOn = jest.spyOn(process, 'on').mockImplementation((event: string, handler: Function) => {
      registeredHandlers.set(event, handler);
      return process;
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockProcessOn.mockRestore();
  });

  describe('setupGlobalErrorHandlers()', () => {
    it('registers uncaughtException handler', () => {
      setupGlobalErrorHandlers();

      expect(registeredHandlers.has('uncaughtException')).toBe(true);
    });

    it('registers unhandledRejection handler', () => {
      setupGlobalErrorHandlers();

      expect(registeredHandlers.has('unhandledRejection')).toBe(true);
    });
  });

  describe('uncaughtException handler', () => {
    it('logs error and exits with code 1', () => {
      setupGlobalErrorHandlers();

      const handler = registeredHandlers.get('uncaughtException');
      expect(handler).toBeDefined();

      const testError = new Error('Uncaught test error');
      handler!(testError);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('unhandledRejection handler', () => {
    it('logs reason and exits with code 1', () => {
      setupGlobalErrorHandlers();

      const handler = registeredHandlers.get('unhandledRejection');
      expect(handler).toBeDefined();

      const reason = new Error('Unhandled rejection');
      const promise = Promise.resolve();
      handler!(reason, promise);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
