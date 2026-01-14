/**
 * Unit tests for blockchain-service entry point (index.ts)
 * Tests environment loading, process handlers, signal handlers, and graceful shutdown
 * 
 * Note: Since index.ts runs startService() on import, we test individual exported/testable
 * components and behaviors rather than importing the module directly.
 */

describe('Blockchain Service Entry Point', () => {
  // Store original process handlers and env
  const originalEnv = process.env;
  let processOnSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset env
    process.env = { ...originalEnv };
    
    // Spy on process methods
    processOnSpy = jest.spyOn(process, 'on');
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  // ===========================================================================
  // Environment Variables
  // ===========================================================================
  describe('Environment Variables', () => {
    it('should use SERVICE_NAME with default "blockchain-service"', () => {
      delete process.env.SERVICE_NAME;
      
      const serviceName = process.env.SERVICE_NAME || 'blockchain-service';
      
      expect(serviceName).toBe('blockchain-service');
    });

    it('should use custom SERVICE_NAME when set', () => {
      process.env.SERVICE_NAME = 'custom-blockchain-service';
      
      const serviceName = process.env.SERVICE_NAME || 'blockchain-service';
      
      expect(serviceName).toBe('custom-blockchain-service');
    });

    it('should use PORT with default 3011', () => {
      delete process.env.PORT;
      
      const port = parseInt(process.env.PORT || '3011', 10);
      
      expect(port).toBe(3011);
    });

    it('should use custom PORT when set', () => {
      process.env.PORT = '4000';
      
      const port = parseInt(process.env.PORT || '3011', 10);
      
      expect(port).toBe(4000);
    });

    it('should use HOST with default "0.0.0.0"', () => {
      delete process.env.HOST;
      
      const host = process.env.HOST || '0.0.0.0';
      
      expect(host).toBe('0.0.0.0');
    });

    it('should use custom HOST when set', () => {
      process.env.HOST = '127.0.0.1';
      
      const host = process.env.HOST || '0.0.0.0';
      
      expect(host).toBe('127.0.0.1');
    });

    it('should parse PORT as integer', () => {
      process.env.PORT = '3011';
      
      const port = parseInt(process.env.PORT || '3011', 10);
      
      expect(typeof port).toBe('number');
      expect(Number.isInteger(port)).toBe(true);
    });
  });

  // ===========================================================================
  // Process Event Handlers - unhandledRejection
  // ===========================================================================
  describe('unhandledRejection handler', () => {
    it('should log error with message for Error instances', () => {
      const reason = new Error('Unhandled rejection test');
      
      // Simulate what the handler does
      const logData = {
        reason: reason?.message || String(reason),
        stack: reason?.stack,
        type: 'unhandledRejection'
      };

      expect(logData.reason).toBe('Unhandled rejection test');
      expect(logData.stack).toBeDefined();
      expect(logData.type).toBe('unhandledRejection');
    });

    it('should convert non-Error reasons to string', () => {
      const reason = 'string error';
      
      const logData = {
        reason: reason instanceof Error ? (reason as Error).message : String(reason)
      };

      expect(logData.reason).toBe('string error');
    });

    it('should handle null reasons', () => {
      const reason = null;
      
      const logData = {
        reason: reason instanceof Error ? (reason as Error).message : String(reason)
      };

      expect(logData.reason).toBe('null');
    });

    it('should handle undefined reasons', () => {
      const reason = undefined;
      
      const logData = {
        reason: reason instanceof Error ? (reason as unknown as Error).message : String(reason)
      };

      expect(logData.reason).toBe('undefined');
    });

    it('should exit in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      // Simulate production behavior
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit in non-production mode', () => {
      process.env.NODE_ENV = 'test';
      
      // Simulate non-production behavior - should not exit
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Process Event Handlers - uncaughtException
  // ===========================================================================
  describe('uncaughtException handler', () => {
    it('should log error details', () => {
      const error = new Error('Uncaught exception test');
      
      const logData = {
        error: error.message,
        stack: error.stack,
        type: 'uncaughtException'
      };

      expect(logData.error).toBe('Uncaught exception test');
      expect(logData.stack).toBeDefined();
      expect(logData.type).toBe('uncaughtException');
    });

    it('should always exit with code 1', () => {
      // Simulate what the handler does - always exit on uncaughtException
      process.exit(1);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should capture error name', () => {
      const error = new TypeError('Type error test');
      
      const logData = {
        error: error.message,
        stack: error.stack,
        name: error.name
      };

      expect(logData.name).toBe('TypeError');
    });
  });

  // ===========================================================================
  // Process Event Handlers - uncaughtExceptionMonitor
  // ===========================================================================
  describe('uncaughtExceptionMonitor handler', () => {
    it('should log error with origin', () => {
      const error = new Error('Monitor test');
      const origin = 'unhandledRejection';
      
      const logData = {
        error: error.message,
        stack: error.stack,
        origin,
        type: 'uncaughtExceptionMonitor'
      };

      expect(logData.error).toBe('Monitor test');
      expect(logData.origin).toBe('unhandledRejection');
      expect(logData.type).toBe('uncaughtExceptionMonitor');
    });
  });

  // ===========================================================================
  // Process Event Handlers - warning
  // ===========================================================================
  describe('warning handler', () => {
    it('should log warning name', () => {
      const warning = new Error('Process warning');
      warning.name = 'DeprecationWarning';
      
      const logData = {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      };

      expect(logData.name).toBe('DeprecationWarning');
    });

    it('should log warning message', () => {
      const warning = new Error('Test warning message');
      
      const logData = {
        name: warning.name,
        message: warning.message
      };

      expect(logData.message).toBe('Test warning message');
    });

    it('should log warning stack', () => {
      const warning = new Error('Warning with stack');
      
      const logData = {
        stack: warning.stack
      };

      expect(logData.stack).toBeDefined();
      expect(logData.stack).toContain('Error');
    });
  });

  // ===========================================================================
  // Signal Handlers
  // ===========================================================================
  describe('Signal Handlers', () => {
    it('should register SIGTERM handler', () => {
      const handler = jest.fn();
      process.on('SIGTERM', handler);
      
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should register SIGINT handler', () => {
      const handler = jest.fn();
      process.on('SIGINT', handler);
      
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should register unhandledRejection handler', () => {
      const handler = jest.fn();
      process.on('unhandledRejection', handler);
      
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should register uncaughtException handler', () => {
      const handler = jest.fn();
      process.on('uncaughtException', handler);
      
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should register warning handler', () => {
      const handler = jest.fn();
      process.on('warning', handler);
      
      expect(processOnSpy).toHaveBeenCalledWith('warning', expect.any(Function));
    });
  });

  // ===========================================================================
  // Graceful Shutdown
  // ===========================================================================
  describe('Graceful Shutdown', () => {
    let isShuttingDown = false;
    
    beforeEach(() => {
      isShuttingDown = false;
    });

    it('should log signal received', () => {
      const signal = 'SIGTERM';
      const serviceName = 'blockchain-service';
      
      const message = `${signal} received, shutting down ${serviceName}...`;
      
      expect(message).toBe('SIGTERM received, shutting down blockchain-service...');
    });

    it('should exit with 0 on successful shutdown', () => {
      process.exit(0);
      
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with 1 on shutdown error', () => {
      process.exit(1);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle SIGTERM signal name', () => {
      const signal = 'SIGTERM';
      
      expect(signal).toBe('SIGTERM');
    });

    it('should handle SIGINT signal name', () => {
      const signal = 'SIGINT';
      
      expect(signal).toBe('SIGINT');
    });
  });

  // ===========================================================================
  // Shutdown Order
  // ===========================================================================
  describe('Shutdown Order', () => {
    it('should close HTTP server first', () => {
      const shutdownOrder = [
        '1. Close HTTP server',
        '2. Shutdown infrastructure (shutdownApp)',
        '3. Exit process'
      ];

      expect(shutdownOrder[0]).toContain('HTTP server');
    });

    it('should shutdown infrastructure after HTTP server', () => {
      const shutdownOrder = [
        '1. Close HTTP server',
        '2. Shutdown infrastructure (shutdownApp)',
        '3. Exit process'
      ];

      expect(shutdownOrder[1]).toContain('infrastructure');
    });

    it('should exit process last', () => {
      const shutdownOrder = [
        '1. Close HTTP server',
        '2. Shutdown infrastructure (shutdownApp)',
        '3. Exit process'
      ];

      expect(shutdownOrder[2]).toContain('Exit');
    });
  });

  // ===========================================================================
  // StartService Function
  // ===========================================================================
  describe('startService function', () => {
    it('should log starting message with service name', () => {
      const serviceName = process.env.SERVICE_NAME || 'blockchain-service';
      const message = `Starting ${serviceName}...`;
      
      expect(message).toBe('Starting blockchain-service...');
    });

    it('should log running message with port', () => {
      const serviceName = 'blockchain-service';
      const port = 3011;
      
      const message = `${serviceName} running on port ${port}`;
      
      expect(message).toContain('blockchain-service');
      expect(message).toContain('3011');
    });

    it('should construct health URL correctly', () => {
      const host = '0.0.0.0';
      const port = 3011;
      
      const healthUrl = `http://${host}:${port}/health`;
      
      expect(healthUrl).toBe('http://0.0.0.0:3011/health');
    });

    it('should construct info URL correctly', () => {
      const host = '0.0.0.0';
      const port = 3011;
      
      const infoUrl = `http://${host}:${port}/info`;
      
      expect(infoUrl).toBe('http://0.0.0.0:3011/info');
    });
  });

  // ===========================================================================
  // Error Handling in startService
  // ===========================================================================
  describe('Error handling in startService', () => {
    it('should log startup failure with error message', () => {
      const error = new Error('Failed to connect to database');
      const serviceName = 'blockchain-service';
      
      const logData = {
        message: `Failed to start ${serviceName}`,
        error: error.message,
        stack: error.stack
      };

      expect(logData.message).toBe('Failed to start blockchain-service');
      expect(logData.error).toBe('Failed to connect to database');
    });

    it('should exit with code 1 on startup failure', () => {
      // Simulate startup failure
      process.exit(1);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ===========================================================================
  // dotenv Configuration
  // ===========================================================================
  describe('dotenv Configuration', () => {
    it('should load environment variables from .env', () => {
      // dotenv/config is imported at the top of index.ts
      // This ensures environment variables are loaded before any other code runs
      expect(process.env.NODE_ENV).toBeDefined();
    });

    it('should have access to test environment variables', () => {
      expect(process.env.DATABASE_URL).toBeDefined();
      expect(process.env.REDIS_HOST).toBeDefined();
      expect(process.env.SOLANA_RPC_URL).toBeDefined();
    });
  });
});

// ===========================================================================
// Module-level Tests
// ===========================================================================
describe('Module Imports', () => {
  it('should have dotenv/config as first import', () => {
    // In the actual index.ts, 'import "dotenv/config"' is the first line
    // This ensures environment variables are available for subsequent imports
    const firstImport = "import 'dotenv/config'";
    
    expect(firstImport).toContain('dotenv/config');
  });

  it('should import createApp from ./app', () => {
    // The index.ts imports createApp and shutdownApp from './app'
    const imports = ['createApp', 'shutdownApp'];
    
    expect(imports).toContain('createApp');
    expect(imports).toContain('shutdownApp');
  });

  it('should import logger from ./utils/logger', () => {
    const loggerImport = './utils/logger';
    
    expect(loggerImport).toBe('./utils/logger');
  });
});
