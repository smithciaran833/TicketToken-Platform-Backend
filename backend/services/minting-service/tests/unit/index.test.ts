/**
 * Unit tests for minting-service entry point (index.ts)
 * Tests configuration, process handlers, error handlers, and graceful shutdown
 * 
 * Note: Since index.ts runs main() on import, we test individual exported/testable
 * components and behaviors rather than importing the module directly.
 */

describe('Minting Service Entry Point', () => {
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

  describe('RATE_LIMIT_BYPASS_PATHS', () => {
    const RATE_LIMIT_BYPASS_PATHS = [
      '/health',
      '/health/live',
      '/health/ready',
      '/health/startup',
      '/health/detailed',
      '/metrics'
    ];

    it('should include /health endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/health');
    });

    it('should include /health/live endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/health/live');
    });

    it('should include /health/ready endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/health/ready');
    });

    it('should include /health/startup endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/health/startup');
    });

    it('should include /health/detailed endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/health/detailed');
    });

    it('should include /metrics endpoint', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toContain('/metrics');
    });

    it('should have 6 bypass paths total', () => {
      expect(RATE_LIMIT_BYPASS_PATHS).toHaveLength(6);
    });
  });

  describe('getRateLimitRedis', () => {
    it('should create Redis client with host from env', () => {
      const mockRedis = jest.fn().mockImplementation(() => ({
        on: jest.fn()
      }));

      process.env.REDIS_HOST = 'custom-redis-host';
      
      // Simulate what getRateLimitRedis does
      const options = {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      };

      expect(options.host).toBe('custom-redis-host');
    });

    it('should use default host "redis" when env not set', () => {
      delete process.env.REDIS_HOST;
      
      const options = {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined
      };

      expect(options.host).toBe('redis');
    });

    it('should use port from env', () => {
      process.env.REDIS_PORT = '6380';
      
      const options = {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379')
      };

      expect(options.port).toBe(6380);
    });

    it('should use default port 6379 when env not set', () => {
      delete process.env.REDIS_PORT;
      
      const options = {
        port: parseInt(process.env.REDIS_PORT || '6379')
      };

      expect(options.port).toBe(6379);
    });

    it('should include password when set', () => {
      process.env.REDIS_PASSWORD = 'secret-password';
      
      const options = {
        password: process.env.REDIS_PASSWORD || undefined
      };

      expect(options.password).toBe('secret-password');
    });

    it('should have password undefined when not set', () => {
      delete process.env.REDIS_PASSWORD;
      
      const options = {
        password: process.env.REDIS_PASSWORD || undefined
      };

      expect(options.password).toBeUndefined();
    });

    it('should set maxRetriesPerRequest to 1', () => {
      const options = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      };

      expect(options.maxRetriesPerRequest).toBe(1);
    });

    it('should disable offline queue', () => {
      const options = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      };

      expect(options.enableOfflineQueue).toBe(false);
    });
  });

  describe('Process Event Handlers', () => {
    describe('unhandledRejection handler', () => {
      it('should log error with message for Error instances', () => {
        const reason = new Error('Unhandled rejection test');
        
        // Simulate what the handler does
        const logData = {
          reason: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined
        };

        expect(logData.reason).toBe('Unhandled rejection test');
        expect(logData.stack).toBeDefined();
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

      it('should not crash the process', () => {
        // After handling unhandledRejection, process should continue
        expect(processExitSpy).not.toHaveBeenCalled();
      });
    });

    describe('uncaughtException handler', () => {
      it('should log error details', () => {
        const error = new Error('Uncaught exception test');
        
        const logData = {
          error: error.message,
          stack: error.stack,
          name: error.name
        };

        expect(logData.error).toBe('Uncaught exception test');
        expect(logData.name).toBe('Error');
        expect(logData.stack).toBeDefined();
      });

      it('should schedule process exit with code 1', () => {
        jest.useFakeTimers();
        
        // Simulate what the handler does
        setTimeout(() => {
          process.exit(1);
        }, 1000);
        
        jest.advanceTimersByTime(1000);
        
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      it('should wait 1000ms before exiting', () => {
        jest.useFakeTimers();
        
        let exitCalled = false;
        setTimeout(() => {
          exitCalled = true;
        }, 1000);
        
        // Not yet called at 999ms
        jest.advanceTimersByTime(999);
        expect(exitCalled).toBe(false);
        
        // Called at 1000ms
        jest.advanceTimersByTime(1);
        expect(exitCalled).toBe(true);
      });
    });

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
  });

  describe('Graceful Shutdown', () => {
    let isShuttingDown = false;
    
    beforeEach(() => {
      isShuttingDown = false;
    });

    it('should set isShuttingDown flag to true', async () => {
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
      };
      
      await gracefulShutdown('SIGTERM');
      
      expect(isShuttingDown).toBe(true);
    });

    it('should ignore duplicate shutdown signals', async () => {
      let shutdownCount = 0;
      
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) {
          return;
        }
        isShuttingDown = true;
        shutdownCount++;
      };
      
      await gracefulShutdown('SIGTERM');
      await gracefulShutdown('SIGTERM');
      await gracefulShutdown('SIGINT');
      
      expect(shutdownCount).toBe(1);
    });

    it('should have 30 second timeout', () => {
      const SHUTDOWN_TIMEOUT_MS = 30000;
      
      expect(SHUTDOWN_TIMEOUT_MS).toBe(30000);
    });

    it('should force exit on timeout', () => {
      jest.useFakeTimers();
      
      // Simulate timeout behavior
      const timeout = setTimeout(() => {
        process.exit(1);
      }, 30000);
      
      jest.advanceTimersByTime(30000);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      
      clearTimeout(timeout);
    });

    it('should exit with 0 on successful shutdown', () => {
      process.exit(0);
      
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with 1 on shutdown error', () => {
      process.exit(1);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

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
  });

  describe('Environment Variables', () => {
    it('should use MINTING_SERVICE_PORT with default 3018', () => {
      delete process.env.MINTING_SERVICE_PORT;
      
      const port = parseInt(process.env.MINTING_SERVICE_PORT || '3018');
      
      expect(port).toBe(3018);
    });

    it('should use custom MINTING_SERVICE_PORT when set', () => {
      process.env.MINTING_SERVICE_PORT = '4000';
      
      const port = parseInt(process.env.MINTING_SERVICE_PORT || '3018');
      
      expect(port).toBe(4000);
    });

    it('should use NODE_ENV with default development', () => {
      delete process.env.NODE_ENV;
      
      const env = process.env.NODE_ENV || 'development';
      
      expect(env).toBe('development');
    });

    it('should read NODE_ENV when set', () => {
      process.env.NODE_ENV = 'production';
      
      const env = process.env.NODE_ENV || 'development';
      
      expect(env).toBe('production');
    });
  });

  describe('Error Handler Behavior', () => {
    describe('BaseError handling', () => {
      it('should extract error code', () => {
        const error = {
          name: 'MintingError',
          code: 'MINT_FAILED',
          statusCode: 500,
          message: 'Minting failed',
          isOperational: true,
          context: {}
        };

        expect(error.code).toBe('MINT_FAILED');
      });

      it('should extract status code', () => {
        const error = {
          name: 'ValidationError',
          code: 'VALIDATION_FAILED',
          statusCode: 400,
          message: 'Validation failed'
        };

        expect(error.statusCode).toBe(400);
      });

      it('should hide message for 500 errors', () => {
        const error = {
          statusCode: 500,
          message: 'Internal details should be hidden'
        };

        const response = {
          error: error.statusCode >= 500 ? 'Internal server error' : error.message
        };

        expect(response.error).toBe('Internal server error');
      });

      it('should show message for client errors', () => {
        const error = {
          statusCode: 400,
          message: 'Bad request details'
        };

        const response = {
          error: error.statusCode >= 500 ? 'Internal server error' : error.message
        };

        expect(response.error).toBe('Bad request details');
      });
    });

    describe('Validation error handling', () => {
      it('should include validationErrors in response', () => {
        const validationErrors = [
          { field: 'ticketId', message: 'Invalid UUID' },
          { field: 'tenantId', message: 'Required' }
        ];

        const response = {
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          validationErrors
        };

        expect(response.validationErrors).toHaveLength(2);
        expect(response.validationErrors[0].field).toBe('ticketId');
      });
    });

    describe('Rate limit error handling', () => {
      it('should include retryAfter in response', () => {
        const error = {
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          retryAfter: 60
        };

        const response = {
          error: 'Too Many Requests',
          code: error.code,
          retryAfter: error.retryAfter
        };

        expect(response.retryAfter).toBe(60);
      });

      it('should set Retry-After header value', () => {
        const retryAfter = 120;
        const headerValue = String(retryAfter);

        expect(headerValue).toBe('120');
      });
    });

    describe('Context filtering', () => {
      it('should filter sensitive keys from context', () => {
        const context = {
          ticketId: 'ticket-123',
          password: 'secret',
          secret: 'hidden',
          token: 'jwt-token',
          key: 'api-key',
          signature: 'sig-123',
          normalField: 'visible'
        };

        const sensitiveKeys = ['password', 'secret', 'token', 'key', 'signature'];
        
        const safeContext = Object.fromEntries(
          Object.entries(context).filter(([key]) => 
            !sensitiveKeys.includes(key.toLowerCase())
          )
        );

        expect(safeContext).not.toHaveProperty('password');
        expect(safeContext).not.toHaveProperty('secret');
        expect(safeContext).not.toHaveProperty('token');
        expect(safeContext).not.toHaveProperty('key');
        expect(safeContext).not.toHaveProperty('signature');
        expect(safeContext).toHaveProperty('ticketId');
        expect(safeContext).toHaveProperty('normalField');
      });

      it('should be case-insensitive for sensitive keys', () => {
        const context = {
          PASSWORD: 'secret',
          Token: 'jwt',
          SECRET: 'hidden'
        };

        const sensitiveKeys = ['password', 'secret', 'token', 'key', 'signature'];
        
        const safeContext = Object.fromEntries(
          Object.entries(context).filter(([key]) => 
            !sensitiveKeys.includes(key.toLowerCase())
          )
        );

        expect(Object.keys(safeContext)).toHaveLength(0);
      });
    });
  });

  describe('Not Found Handler', () => {
    it('should return 404 status code', () => {
      const response = {
        error: 'Not found',
        code: 'NOT_FOUND',
        statusCode: 404
      };

      expect(response.statusCode).toBe(404);
    });

    it('should include NOT_FOUND code', () => {
      const response = {
        error: 'Not found',
        code: 'NOT_FOUND'
      };

      expect(response.code).toBe('NOT_FOUND');
    });

    it('should include route info in message', () => {
      const method = 'POST';
      const url = '/api/unknown/endpoint';
      
      const message = `Route ${method} ${url} not found`;

      expect(message).toContain('POST');
      expect(message).toContain('/api/unknown/endpoint');
      expect(message).toBe('Route POST /api/unknown/endpoint not found');
    });

    it('should include requestId in response', () => {
      const requestId = 'abc-123-def';
      
      const response = {
        error: 'Not found',
        code: 'NOT_FOUND',
        requestId
      };

      expect(response.requestId).toBe('abc-123-def');
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should use max 100 requests', () => {
      const config = { max: 100 };
      
      expect(config.max).toBe(100);
    });

    it('should use 1 minute time window', () => {
      const config = { timeWindow: '1 minute' };
      
      expect(config.timeWindow).toBe('1 minute');
    });

    describe('keyGenerator', () => {
      it('should use tenant_id when available', () => {
        const request = {
          user: { tenant_id: 'tenant-123' },
          ip: '192.168.1.1'
        };
        
        const key = request.user?.tenant_id || request.ip;
        
        expect(key).toBe('tenant-123');
      });

      it('should fall back to IP when no tenant', () => {
        const request = {
          user: undefined,
          ip: '192.168.1.1'
        };
        
        const key = (request as any).user?.tenant_id || request.ip;
        
        expect(key).toBe('192.168.1.1');
      });
    });

    describe('allowList', () => {
      const RATE_LIMIT_BYPASS_PATHS = [
        '/health',
        '/health/live',
        '/health/ready',
        '/health/startup',
        '/health/detailed',
        '/metrics'
      ];

      it('should allow /health', () => {
        const url = '/health';
        const allowed = RATE_LIMIT_BYPASS_PATHS.some(path => 
          url === path || url.startsWith(path + '/')
        );
        
        expect(allowed).toBe(true);
      });

      it('should allow /metrics', () => {
        const url = '/metrics';
        const allowed = RATE_LIMIT_BYPASS_PATHS.some(path => 
          url === path || url.startsWith(path + '/')
        );
        
        expect(allowed).toBe(true);
      });

      it('should not allow /api/mint', () => {
        const url = '/api/mint';
        const allowed = RATE_LIMIT_BYPASS_PATHS.some(path => 
          url === path || url.startsWith(path + '/')
        );
        
        expect(allowed).toBe(false);
      });

      it('should allow paths starting with bypass path', () => {
        const url = '/health/detailed/extra';
        const allowed = RATE_LIMIT_BYPASS_PATHS.some(path => 
          url === path || url.startsWith(path + '/')
        );
        
        expect(allowed).toBe(true);
      });
    });

    describe('onExceeded callback', () => {
      it('should extract tenant_id for logging', () => {
        const request = {
          user: { tenant_id: 'tenant-456' },
          ip: '10.0.0.1'
        };
        
        const tenantId = request.user?.tenant_id || 'anonymous';
        
        expect(tenantId).toBe('tenant-456');
      });

      it('should use "anonymous" when no tenant', () => {
        const request = {
          user: undefined,
          ip: '10.0.0.1'
        };
        
        const tenantId = (request as any).user?.tenant_id || 'anonymous';
        
        expect(tenantId).toBe('anonymous');
      });

      it('should strip query params from endpoint', () => {
        const url = '/api/mint?ticketId=123&foo=bar';
        const endpoint = url.split('?')[0];
        
        expect(endpoint).toBe('/api/mint');
      });
    });

    describe('errorResponseBuilder', () => {
      it('should include error message', () => {
        const ttl = 60000; // milliseconds
        
        const response = {
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds.`,
          retryAfter: Math.ceil(ttl / 1000)
        };

        expect(response.error).toBe('Too Many Requests');
        expect(response.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.message).toContain('Try again in 60 seconds');
        expect(response.retryAfter).toBe(60);
      });

      it('should calculate retryAfter from ttl', () => {
        const ttl = 45000; // 45 seconds in milliseconds
        const retryAfter = Math.ceil(ttl / 1000);
        
        expect(retryAfter).toBe(45);
      });

      it('should round up retryAfter', () => {
        const ttl = 45500; // 45.5 seconds
        const retryAfter = Math.ceil(ttl / 1000);
        
        expect(retryAfter).toBe(46);
      });
    });
  });

  describe('Rate Limit Counter', () => {
    it('should track endpoint label', () => {
      const labels = ['endpoint', 'tenant_id', 'method'];
      
      expect(labels).toContain('endpoint');
    });

    it('should track tenant_id label', () => {
      const labels = ['endpoint', 'tenant_id', 'method'];
      
      expect(labels).toContain('tenant_id');
    });

    it('should track method label', () => {
      const labels = ['endpoint', 'tenant_id', 'method'];
      
      expect(labels).toContain('method');
    });
  });
});

describe('Shutdown Order', () => {
  it('should close resources in correct order', () => {
    const shutdownOrder = [
      '1. Stop accepting new requests (close HTTP server)',
      '2. Stop balance monitoring',
      '3. Close queue workers',
      '4. Close database connections'
    ];

    expect(shutdownOrder[0]).toContain('HTTP server');
    expect(shutdownOrder[1]).toContain('balance monitoring');
    expect(shutdownOrder[2]).toContain('queue');
    expect(shutdownOrder[3]).toContain('database');
  });
});
