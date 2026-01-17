// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/tenant.middleware.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

describe('src/middleware/tenant.middleware.ts - Comprehensive Unit Tests', () => {
  let tenantMiddleware: any;
  let getPool: any;
  let logger: any;
  let mockPool: any;
  let mockClient: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock client
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    logger = require('../../../src/utils/logger').default;

    getPool.mockReturnValue(mockPool);

    // Import middleware
    tenantMiddleware = require('../../../src/middleware/tenant.middleware');

    // Mock request
    mockRequest = {
      tenantId: undefined,
      user: undefined,
      url: '/api/test',
    };

    // Mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // setTenantContext()
  // =============================================================================

  describe('setTenantContext()', () => {
    it('should set tenant context when tenantId present', async () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.user = { userId: 'user-456' };

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-123']);
      expect(logger.debug).toHaveBeenCalledWith('Tenant context set', expect.objectContaining({
        tenantId: 'tenant-123',
        userId: 'user-456',
      }));
    });

    it('should return early when tenantId not present', async () => {
      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('No tenant context to set - request not authenticated');
    });

    it('should not set context when tenantId is null', async () => {
      mockRequest.tenantId = null;

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should not set context when tenantId is empty string', async () => {
      mockRequest.tenantId = '';

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database error and return 500', async () => {
      mockRequest.tenantId = 'tenant-123';
      const dbError = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(dbError);

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Failed to set tenant context', expect.objectContaining({
        tenantId: 'tenant-123',
        error: dbError,
      }));
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to establish security context',
      });
    });

    it('should log request URL in debug', async () => {
      mockRequest.tenantId = 'tenant-456';
      mockRequest.url = '/api/scan/validate';

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith('Tenant context set', expect.objectContaining({
        path: '/api/scan/validate',
      }));
    });

    it('should handle missing user gracefully', async () => {
      mockRequest.tenantId = 'tenant-789';
      mockRequest.user = undefined;

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Tenant context set', expect.objectContaining({
        tenantId: 'tenant-789',
        userId: undefined,
      }));
    });

    it('should not proceed on database failure', async () => {
      mockRequest.tenantId = 'tenant-fail';
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await tenantMiddleware.setTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getTenantClient()
  // =============================================================================

  describe('getTenantClient()', () => {
    it('should return client with tenant context set', async () => {
      const client = await tenantMiddleware.getTenantClient('tenant-123');

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-123']);
      expect(client).toBe(mockClient);
    });

    it('should release client if setting context fails', async () => {
      const contextError = new Error('Failed to set context');
      mockClient.query.mockRejectedValue(contextError);

      await expect(tenantMiddleware.getTenantClient('tenant-123')).rejects.toThrow('Failed to set context');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should propagate database connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockPool.connect.mockRejectedValue(connectionError);

      await expect(tenantMiddleware.getTenantClient('tenant-456')).rejects.toThrow('Connection failed');
    });

    it('should handle different tenant IDs', async () => {
      await tenantMiddleware.getTenantClient('tenant-abc');
      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-abc']);

      await tenantMiddleware.getTenantClient('tenant-xyz');
      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-xyz']);
    });

    it('should not release client on success', async () => {
      await tenantMiddleware.getTenantClient('tenant-123');

      expect(mockClient.release).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // queryWithTenant()
  // =============================================================================

  describe('queryWithTenant()', () => {
    it('should execute query with tenant context', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test' }] }); // actual query

      const result = await tenantMiddleware.queryWithTenant(
        'tenant-123',
        'SELECT * FROM devices WHERE id = $1',
        ['device-1']
      );

      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-123']);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM devices WHERE id = $1', ['device-1']);
      expect(result.rows).toEqual([{ id: 1, name: 'Test' }]);
    });

    it('should release client after query', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await tenantMiddleware.queryWithTenant('tenant-123', 'SELECT 1');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if query fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Query failed'));

      await expect(tenantMiddleware.queryWithTenant('tenant-123', 'SELECT * FROM invalid')).rejects.toThrow('Query failed');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle queries without parameters', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] });

      const result = await tenantMiddleware.queryWithTenant('tenant-456', 'SELECT COUNT(*) FROM devices');

      expect(mockClient.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM devices', undefined);
      expect(result.rows[0].count).toBe(10);
    });

    it('should handle queries with multiple parameters', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await tenantMiddleware.queryWithTenant(
        'tenant-789',
        'INSERT INTO devices (id, name, zone) VALUES ($1, $2, $3)',
        ['device-1', 'Scanner 1', 'GA']
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO devices (id, name, zone) VALUES ($1, $2, $3)',
        ['device-1', 'Scanner 1', 'GA']
      );
    });

    it('should release client even if context setting fails', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Context failed'));

      await expect(tenantMiddleware.queryWithTenant('tenant-123', 'SELECT 1')).rejects.toThrow('Context failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // transactionWithTenant()
  // =============================================================================

  describe('transactionWithTenant()', () => {
    it('should execute transaction with tenant context', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // callback query 1
        .mockResolvedValueOnce({ rows: [] }) // callback query 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const callback = jest.fn(async (client) => {
        await client.query('INSERT INTO devices...');
        await client.query('INSERT INTO scans...');
        return 'success';
      });

      const result = await tenantMiddleware.transactionWithTenant('tenant-123', callback);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-123']);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(result).toBe('success');
    });

    it('should rollback on callback error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const callback = jest.fn(async () => {
        throw new Error('Transaction failed');
      });

      await expect(tenantMiddleware.transactionWithTenant('tenant-123', callback)).rejects.toThrow('Transaction failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client after commit', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const callback = jest.fn(async () => 'done');

      await tenantMiddleware.transactionWithTenant('tenant-456', callback);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client after rollback', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const callback = jest.fn(async () => {
        throw new Error('Rollback needed');
      });

      await expect(tenantMiddleware.transactionWithTenant('tenant-789', callback)).rejects.toThrow('Rollback needed');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return callback result', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const callback = jest.fn(async () => ({ inserted: 5, updated: 3 }));

      const result = await tenantMiddleware.transactionWithTenant('tenant-abc', callback);

      expect(result).toEqual({ inserted: 5, updated: 3 });
    });

    it('should handle complex transactions', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT device
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // INSERT scan
        .mockResolvedValueOnce({ rows: [] }) // UPDATE ticket
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const callback = jest.fn(async (client) => {
        const device = await client.query('INSERT INTO devices... RETURNING id');
        const scan = await client.query('INSERT INTO scans... RETURNING id');
        await client.query('UPDATE tickets SET scan_count = scan_count + 1');
        return { deviceId: device.rows[0].id, scanId: scan.rows[0].id };
      });

      const result = await tenantMiddleware.transactionWithTenant('tenant-xyz', callback);

      expect(result).toEqual({ deviceId: 1, scanId: 2 });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle rollback failure gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Query failed')); // Callback fails

      // ROLLBACK also fails
      mockClient.query.mockRejectedValueOnce(new Error('Rollback failed'));

      const callback = jest.fn(async (client) => {
        await client.query('BAD QUERY');
      });

      await expect(tenantMiddleware.transactionWithTenant('tenant-123', callback)).rejects.toThrow('Query failed');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if commit fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // set_tenant_context
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Callback succeeds
        .mockRejectedValueOnce(new Error('Commit failed')); // COMMIT fails

      const callback = jest.fn(async () => 'ok');

      await expect(tenantMiddleware.transactionWithTenant('tenant-456', callback)).rejects.toThrow('Commit failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration Tests', () => {
    it('should use getTenantClient in queryWithTenant', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ data: 'test' }] });

      await tenantMiddleware.queryWithTenant('tenant-integration', 'SELECT * FROM test');

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-integration']);
    });

    it('should use getTenantClient in transactionWithTenant', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const callback = jest.fn(async () => 'done');

      await tenantMiddleware.transactionWithTenant('tenant-integration', callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT set_tenant_context($1)', ['tenant-integration']);
    });

    it('should handle multiple sequential operations', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await tenantMiddleware.queryWithTenant('tenant-1', 'SELECT 1');
      await tenantMiddleware.queryWithTenant('tenant-2', 'SELECT 2');

      expect(mockPool.connect).toHaveBeenCalledTimes(2);
      expect(mockClient.release).toHaveBeenCalledTimes(2);
    });
  });
});
