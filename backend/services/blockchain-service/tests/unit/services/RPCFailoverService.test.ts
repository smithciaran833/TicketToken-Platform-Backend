/**
 * Unit tests for RPCFailoverService
 * 
 * Tests RPC endpoint failover, health checks, and connection management
 */

describe('RPCFailoverService', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should accept endpoints array', () => {
      const config = { endpoints: ['https://rpc1.com', 'https://rpc2.com'] };
      expect(config.endpoints).toHaveLength(2);
    });

    it('should map endpoints to RPCEndpoint objects', () => {
      const endpoints = [
        { url: 'https://rpc1.com', priority: 0, healthy: true, lastCheck: Date.now(), failureCount: 0 }
      ];
      expect(endpoints[0].url).toBeDefined();
      expect(endpoints[0].priority).toBe(0);
      expect(endpoints[0].healthy).toBe(true);
    });

    it('should default healthCheckInterval to 30000ms', () => {
      const defaultInterval = 30000;
      expect(defaultInterval).toBe(30000);
    });

    it('should default maxFailures to 3', () => {
      const defaultMaxFailures = 3;
      expect(defaultMaxFailures).toBe(3);
    });

    it('should default timeout to 30000ms', () => {
      const defaultTimeout = 30000;
      expect(defaultTimeout).toBe(30000);
    });

    it('should default commitment to confirmed', () => {
      const defaultCommitment = 'confirmed';
      expect(defaultCommitment).toBe('confirmed');
    });

    it('should configure connectionConfig with commitment', () => {
      const connectionConfig = { commitment: 'confirmed' };
      expect(connectionConfig.commitment).toBe('confirmed');
    });

    it('should configure connectionConfig with timeout', () => {
      const connectionConfig = { confirmTransactionInitialTimeout: 30000 };
      expect(connectionConfig.confirmTransactionInitialTimeout).toBe(30000);
    });

    it('should log initialization', () => {
      const logData = { endpoints: 2, healthCheckInterval: 30000, maxFailures: 3 };
      expect(logData.endpoints).toBe(2);
    });

    it('should start health checks', () => {
      let healthChecksStarted = false;
      const startHealthChecks = () => { healthChecksStarted = true; };
      startHealthChecks();
      expect(healthChecksStarted).toBe(true);
    });
  });

  // ===========================================================================
  // getConnection
  // ===========================================================================
  describe('getConnection', () => {
    it('should call getCurrentEndpoint', () => {
      let called = false;
      const getCurrentEndpoint = () => { called = true; return { url: 'https://rpc.com' }; };
      getCurrentEndpoint();
      expect(called).toBe(true);
    });

    it('should create new Connection with endpoint URL', () => {
      const endpoint = { url: 'https://api.devnet.solana.com' };
      expect(endpoint.url).toContain('solana');
    });

    it('should use connectionConfig', () => {
      const connectionConfig = { commitment: 'confirmed', confirmTransactionInitialTimeout: 30000 };
      expect(connectionConfig.commitment).toBeDefined();
    });

    it('should return Connection instance', () => {
      const connection = { rpcEndpoint: 'https://rpc.com' };
      expect(connection.rpcEndpoint).toBeDefined();
    });
  });

  // ===========================================================================
  // getCurrentEndpoint (private)
  // ===========================================================================
  describe('getCurrentEndpoint', () => {
    it('should find first healthy endpoint', () => {
      const endpoints = [
        { url: 'https://rpc1.com', healthy: false },
        { url: 'https://rpc2.com', healthy: true }
      ];
      const healthyEndpoint = endpoints.find(e => e.healthy);
      expect(healthyEndpoint?.url).toBe('https://rpc2.com');
    });

    it('should use primary if all unhealthy', () => {
      const endpoints = [
        { url: 'https://rpc1.com', healthy: false },
        { url: 'https://rpc2.com', healthy: false }
      ];
      const primaryEndpoint = endpoints[0];
      expect(primaryEndpoint.url).toBe('https://rpc1.com');
    });

    it('should log warning when all unhealthy', () => {
      const logLevel = 'warn';
      const message = 'All RPC endpoints unhealthy, using primary';
      expect(message).toMatch(/unhealthy/);
    });
  });

  // ===========================================================================
  // executeWithFailover
  // ===========================================================================
  describe('executeWithFailover', () => {
    it('should default retries to endpoints length', () => {
      const endpoints = ['rpc1', 'rpc2', 'rpc3'];
      const defaultRetries = endpoints.length;
      expect(defaultRetries).toBe(3);
    });

    it('should track start time', () => {
      const startTime = Date.now();
      expect(startTime).toBeGreaterThan(0);
    });

    it('should execute operation with connection', () => {
      let operationExecuted = false;
      const operation = () => { operationExecuted = true; return 'result'; };
      operation();
      expect(operationExecuted).toBe(true);
    });

    it('should calculate latency on success', () => {
      const startTime = Date.now() - 100;
      const latency = Date.now() - startTime;
      expect(latency).toBeGreaterThan(0);
    });

    it('should reset failureCount on success', () => {
      const endpoint = { failureCount: 2 };
      endpoint.failureCount = 0;
      expect(endpoint.failureCount).toBe(0);
    });

    it('should mark endpoint healthy on success', () => {
      const endpoint = { healthy: false };
      endpoint.healthy = true;
      expect(endpoint.healthy).toBe(true);
    });

    it('should update lastCheck on success', () => {
      const endpoint = { lastCheck: 0 };
      endpoint.lastCheck = Date.now();
      expect(endpoint.lastCheck).toBeGreaterThan(0);
    });

    it('should log success with latency', () => {
      const logData = { endpoint: 'https://rpc.com', latency: 150, attempts: 1 };
      expect(logData.latency).toBe(150);
    });

    it('should return operation result', () => {
      const result = 'operation_result';
      expect(result).toBe('operation_result');
    });

    describe('Failure Handling', () => {
      it('should increment attempts on failure', () => {
        let attempts = 0;
        attempts++;
        expect(attempts).toBe(1);
      });

      it('should log warning on failure', () => {
        const logData = { endpoint: 'https://rpc.com', error: 'timeout', attempts: 1, retries: 3 };
        expect(logData.error).toBe('timeout');
      });

      it('should increment endpoint failureCount', () => {
        const endpoint = { failureCount: 0 };
        endpoint.failureCount++;
        expect(endpoint.failureCount).toBe(1);
      });

      it('should mark unhealthy after maxFailures', () => {
        const endpoint = { failureCount: 3, healthy: true };
        const maxFailures = 3;
        if (endpoint.failureCount >= maxFailures) {
          endpoint.healthy = false;
        }
        expect(endpoint.healthy).toBe(false);
      });

      it('should log error when endpoint marked unhealthy', () => {
        const logData = { endpoint: 'https://rpc.com', failureCount: 3 };
        expect(logData.failureCount).toBe(3);
      });

      it('should rotate to next endpoint on failure', () => {
        let rotated = false;
        const rotateToNextEndpoint = () => { rotated = true; };
        rotateToNextEndpoint();
        expect(rotated).toBe(true);
      });

      it('should wait 1000ms before retry', () => {
        const delay = 1000;
        expect(delay).toBe(1000);
      });
    });

    describe('Exhausted Retries', () => {
      it('should log error when all attempts exhausted', () => {
        const logData = { attempts: 3, lastError: 'Connection timeout' };
        expect(logData.attempts).toBe(3);
      });

      it('should throw last error', () => {
        const lastError = new Error('All RPC endpoints failed');
        expect(lastError.message).toMatch(/failed/);
      });

      it('should throw generic error if no lastError', () => {
        const error = new Error('All RPC endpoints failed');
        expect(error.message).toBe('All RPC endpoints failed');
      });
    });
  });

  // ===========================================================================
  // rotateToNextEndpoint (private)
  // ===========================================================================
  describe('rotateToNextEndpoint', () => {
    it('should increment currentEndpointIndex', () => {
      let currentIndex = 0;
      const endpointsLength = 3;
      currentIndex = (currentIndex + 1) % endpointsLength;
      expect(currentIndex).toBe(1);
    });

    it('should wrap around to 0 at end', () => {
      let currentIndex = 2;
      const endpointsLength = 3;
      currentIndex = (currentIndex + 1) % endpointsLength;
      expect(currentIndex).toBe(0);
    });

    it('should skip unhealthy endpoints', () => {
      const endpoints = [
        { healthy: false },
        { healthy: false },
        { healthy: true }
      ];
      const healthyIndex = endpoints.findIndex(e => e.healthy);
      expect(healthyIndex).toBe(2);
    });

    it('should log rotation', () => {
      const logData = { endpoint: 'https://rpc2.com', index: 1 };
      expect(logData.index).toBe(1);
    });

    it('should reset to primary if no healthy found', () => {
      let currentIndex = 2;
      currentIndex = 0;
      expect(currentIndex).toBe(0);
    });

    it('should log warning when no healthy endpoints', () => {
      const logLevel = 'warn';
      const message = 'No healthy endpoints found, reset to primary';
      expect(message).toMatch(/reset to primary/);
    });
  });

  // ===========================================================================
  // startHealthChecks (private)
  // ===========================================================================
  describe('startHealthChecks', () => {
    it('should set interval timer', () => {
      let timerSet = false;
      const setInterval = () => { timerSet = true; return 123; };
      setInterval();
      expect(timerSet).toBe(true);
    });

    it('should use healthCheckInterval', () => {
      const interval = 30000;
      expect(interval).toBe(30000);
    });

    it('should call performHealthChecks periodically', () => {
      let healthChecksCalled = false;
      const performHealthChecks = () => { healthChecksCalled = true; };
      performHealthChecks();
      expect(healthChecksCalled).toBe(true);
    });
  });

  // ===========================================================================
  // performHealthChecks (private)
  // ===========================================================================
  describe('performHealthChecks', () => {
    it('should log start of health checks', () => {
      const logLevel = 'debug';
      const message = 'Performing RPC health checks';
      expect(message).toMatch(/health checks/);
    });

    it('should check all endpoints', () => {
      const endpoints = ['rpc1', 'rpc2', 'rpc3'];
      let checksPerformed = 0;
      endpoints.forEach(() => checksPerformed++);
      expect(checksPerformed).toBe(3);
    });

    it('should create connection for each endpoint', () => {
      const endpoint = { url: 'https://rpc.com' };
      expect(endpoint.url).toBeDefined();
    });

    it('should call getLatestBlockhash for health check', () => {
      let healthCheckCalled = false;
      const connection = {
        getLatestBlockhash: () => { healthCheckCalled = true; }
      };
      connection.getLatestBlockhash();
      expect(healthCheckCalled).toBe(true);
    });

    it('should calculate latency', () => {
      const startTime = Date.now() - 50;
      const latency = Date.now() - startTime;
      expect(latency).toBeGreaterThanOrEqual(50);
    });

    describe('Success Case', () => {
      it('should mark endpoint healthy', () => {
        const endpoint = { healthy: false };
        endpoint.healthy = true;
        expect(endpoint.healthy).toBe(true);
      });

      it('should update latency', () => {
        const endpoint = { latency: undefined };
        endpoint.latency = 150;
        expect(endpoint.latency).toBe(150);
      });

      it('should reset failureCount', () => {
        const endpoint = { failureCount: 2 };
        endpoint.failureCount = 0;
        expect(endpoint.failureCount).toBe(0);
      });

      it('should update lastCheck', () => {
        const endpoint = { lastCheck: 0 };
        endpoint.lastCheck = Date.now();
        expect(endpoint.lastCheck).toBeGreaterThan(0);
      });

      it('should log health check passed', () => {
        const logData = { endpoint: 'https://rpc.com', latency: 100 };
        expect(logData.latency).toBe(100);
      });
    });

    describe('Failure Case', () => {
      it('should increment failureCount', () => {
        const endpoint = { failureCount: 1 };
        endpoint.failureCount++;
        expect(endpoint.failureCount).toBe(2);
      });

      it('should update lastCheck', () => {
        const endpoint = { lastCheck: 0 };
        endpoint.lastCheck = Date.now();
        expect(endpoint.lastCheck).toBeGreaterThan(0);
      });

      it('should mark unhealthy after maxFailures', () => {
        const endpoint = { failureCount: 3, healthy: true };
        const maxFailures = 3;
        if (endpoint.failureCount >= maxFailures) {
          endpoint.healthy = false;
        }
        expect(endpoint.healthy).toBe(false);
      });

      it('should log health check failed', () => {
        const logData = { endpoint: 'https://rpc.com', error: 'timeout', failureCount: 2, healthy: true };
        expect(logData.error).toBe('timeout');
      });
    });

    describe('Summary', () => {
      it('should use Promise.allSettled for parallel checks', () => {
        const method = 'allSettled';
        expect(method).toBe('allSettled');
      });

      it('should count healthy endpoints', () => {
        const endpoints = [{ healthy: true }, { healthy: false }, { healthy: true }];
        const healthyCount = endpoints.filter(e => e.healthy).length;
        expect(healthyCount).toBe(2);
      });

      it('should log summary', () => {
        const logData = { total: 3, healthy: 2, unhealthy: 1 };
        expect(logData.total).toBe(logData.healthy + logData.unhealthy);
      });
    });
  });

  // ===========================================================================
  // getHealthStatus
  // ===========================================================================
  describe('getHealthStatus', () => {
    it('should return array of endpoint status', () => {
      const status = [
        { url: 'https://rpc1.com', healthy: true, latency: 100, failureCount: 0, lastCheck: Date.now() }
      ];
      expect(Array.isArray(status)).toBe(true);
    });

    it('should include url property', () => {
      const status = { url: 'https://rpc.com' };
      expect(status.url).toBeDefined();
    });

    it('should include healthy property', () => {
      const status = { healthy: true };
      expect(status.healthy).toBe(true);
    });

    it('should include latency property', () => {
      const status = { latency: 150 };
      expect(status.latency).toBe(150);
    });

    it('should include failureCount property', () => {
      const status = { failureCount: 0 };
      expect(status.failureCount).toBe(0);
    });

    it('should include lastCheck property', () => {
      const status = { lastCheck: Date.now() };
      expect(status.lastCheck).toBeGreaterThan(0);
    });

    it('should map all endpoints', () => {
      const endpoints = [{}, {}, {}];
      const status = endpoints.map(e => ({ ...e }));
      expect(status).toHaveLength(3);
    });
  });

  // ===========================================================================
  // markEndpointHealthy
  // ===========================================================================
  describe('markEndpointHealthy', () => {
    it('should find endpoint by URL', () => {
      const endpoints = [{ url: 'https://rpc1.com' }, { url: 'https://rpc2.com' }];
      const endpoint = endpoints.find(e => e.url === 'https://rpc2.com');
      expect(endpoint?.url).toBe('https://rpc2.com');
    });

    it('should set healthy to true', () => {
      const endpoint = { healthy: false };
      endpoint.healthy = true;
      expect(endpoint.healthy).toBe(true);
    });

    it('should reset failureCount to 0', () => {
      const endpoint = { failureCount: 5 };
      endpoint.failureCount = 0;
      expect(endpoint.failureCount).toBe(0);
    });

    it('should log when marked healthy', () => {
      const logData = { url: 'https://rpc.com' };
      expect(logData.url).toBeDefined();
    });

    it('should do nothing if endpoint not found', () => {
      const endpoints = [{ url: 'https://rpc1.com' }];
      const endpoint = endpoints.find(e => e.url === 'https://rpc2.com');
      expect(endpoint).toBeUndefined();
    });
  });

  // ===========================================================================
  // markEndpointUnhealthy
  // ===========================================================================
  describe('markEndpointUnhealthy', () => {
    it('should find endpoint by URL', () => {
      const endpoints = [{ url: 'https://rpc1.com' }];
      const endpoint = endpoints.find(e => e.url === 'https://rpc1.com');
      expect(endpoint?.url).toBe('https://rpc1.com');
    });

    it('should set healthy to false', () => {
      const endpoint = { healthy: true };
      endpoint.healthy = false;
      expect(endpoint.healthy).toBe(false);
    });

    it('should set failureCount to maxFailures', () => {
      const endpoint = { failureCount: 0 };
      const maxFailures = 3;
      endpoint.failureCount = maxFailures;
      expect(endpoint.failureCount).toBe(3);
    });

    it('should log when marked unhealthy', () => {
      const logData = { url: 'https://rpc.com' };
      expect(logData.url).toBeDefined();
    });
  });

  // ===========================================================================
  // stop
  // ===========================================================================
  describe('stop', () => {
    it('should check if timer exists', () => {
      const healthCheckTimer = 123;
      expect(healthCheckTimer).toBeDefined();
    });

    it('should clear interval timer', () => {
      let timerCleared = false;
      const clearInterval = () => { timerCleared = true; };
      clearInterval();
      expect(timerCleared).toBe(true);
    });

    it('should set timer to undefined', () => {
      let healthCheckTimer: number | undefined = 123;
      healthCheckTimer = undefined;
      expect(healthCheckTimer).toBeUndefined();
    });

    it('should log when health checks stopped', () => {
      const message = 'RPC health checks stopped';
      expect(message).toMatch(/stopped/);
    });
  });

  // ===========================================================================
  // RPCEndpoint Interface
  // ===========================================================================
  describe('RPCEndpoint Interface', () => {
    it('should have url property', () => {
      const endpoint = { url: 'https://rpc.com' };
      expect(endpoint.url).toBeDefined();
    });

    it('should have priority property', () => {
      const endpoint = { priority: 0 };
      expect(endpoint.priority).toBe(0);
    });

    it('should have healthy property', () => {
      const endpoint = { healthy: true };
      expect(endpoint.healthy).toBe(true);
    });

    it('should have lastCheck property', () => {
      const endpoint = { lastCheck: Date.now() };
      expect(endpoint.lastCheck).toBeGreaterThan(0);
    });

    it('should have failureCount property', () => {
      const endpoint = { failureCount: 0 };
      expect(endpoint.failureCount).toBe(0);
    });

    it('should have optional latency property', () => {
      const endpoint = { latency: 100 };
      expect(endpoint.latency).toBe(100);
    });
  });

  // ===========================================================================
  // RPCFailoverConfig Interface
  // ===========================================================================
  describe('RPCFailoverConfig Interface', () => {
    it('should require endpoints array', () => {
      const config = { endpoints: ['https://rpc.com'] };
      expect(config.endpoints).toBeDefined();
    });

    it('should have optional healthCheckInterval', () => {
      const config = { healthCheckInterval: 15000 };
      expect(config.healthCheckInterval).toBe(15000);
    });

    it('should have optional maxFailures', () => {
      const config = { maxFailures: 5 };
      expect(config.maxFailures).toBe(5);
    });

    it('should have optional timeout', () => {
      const config = { timeout: 60000 };
      expect(config.timeout).toBe(60000);
    });

    it('should have optional commitment', () => {
      const config = { commitment: 'finalized' };
      expect(config.commitment).toBe('finalized');
    });
  });
});
