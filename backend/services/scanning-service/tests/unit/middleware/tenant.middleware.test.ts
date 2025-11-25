import { FastifyRequest, FastifyReply } from 'fastify';
import {
  setTenantContext,
  getTenantClient,
  queryWithTenant,
  transactionWithTenant
} from '../../../src/middleware/tenant.middleware';
import { getPool } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

describe('Tenant Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockPool: any;
  let mockClient: any;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    // Setup mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Setup mock reply
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock
    } as any;

    mockRequest = {
      tenantId: undefined,
      user: undefined,
      url: '/test-endpoint'
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setTenantContext', () => {
    it('should set tenant context successfully', async () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.user = {
        userId: 'user-456',
        tenantId: 'tenant-123',
        role: 'VENUE_STAFF',
        permissions: []
      };

      mockPool.query.mockResolvedValue({});

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        ['tenant-123']
      );
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should skip when no tenant ID present', async () => {
      mockRequest.tenantId = undefined;

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).not.toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 500 on database error', async () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.user = {
        userId: 'user-456',
        tenantId: 'tenant-123',
        role: 'VENUE_STAFF',
        permissions: []
      };

      const dbError = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(dbError);

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to establish security context'
      });
    });

    it('should handle missing user object gracefully', async () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.user = undefined;

      mockPool.query.mockResolvedValue({});

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        ['tenant-123']
      );
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('getTenantClient', () => {
    it('should return client with tenant context set', async () => {
      const tenantId = 'tenant-123';
      mockClient.query.mockResolvedValue({});

      const client = await getTenantClient(tenantId);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        [tenantId]
      );
      expect(client).toBe(mockClient);
    });

    it('should release client and throw on context set failure', async () => {
      const tenantId = 'tenant-123';
      const error = new Error('Context set failed');
      mockClient.query.mockRejectedValue(error);

      await expect(getTenantClient(tenantId)).rejects.toThrow('Context set failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const tenantId = 'tenant-123';
      const error = new Error('Connection failed');
      mockPool.connect.mockRejectedValue(error);

      await expect(getTenantClient(tenantId)).rejects.toThrow('Connection failed');
    });

    it('should work with different tenant IDs', async () => {
      const tenantIds = ['tenant-1', 'tenant-2', 'tenant-3'];
      mockClient.query.mockResolvedValue({});

      for (const tenantId of tenantIds) {
        await getTenantClient(tenantId);
        expect(mockClient.query).toHaveBeenCalledWith(
          'SELECT set_tenant_context($1)',
          [tenantId]
        );
      }
    });
  });

  describe('queryWithTenant', () => {
    it('should execute query with tenant context', async () => {
      const tenantId = 'tenant-123';
      const query = 'SELECT * FROM devices WHERE id = $1';
      const params = ['device-456'];
      const mockResult = { rows: [{ id: 'device-456', name: 'Scanner 1' }] };

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockResolvedValueOnce(mockResult); // actual query

      const result = await queryWithTenant(tenantId, query, params);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        [tenantId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(query, params);
      expect(result).toEqual(mockResult);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even on query error', async () => {
      const tenantId = 'tenant-123';
      const query = 'SELECT * FROM devices';
      const error = new Error('Query failed');

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockRejectedValueOnce(error); // query fails

      await expect(queryWithTenant(tenantId, query)).rejects.toThrow('Query failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should work with queries without params', async () => {
      const tenantId = 'tenant-123';
      const query = 'SELECT * FROM devices';
      const mockResult = { rows: [] };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(mockResult);

      const result = await queryWithTenant(tenantId, query);

      expect(mockClient.query).toHaveBeenCalledWith(query, undefined);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty result sets', async () => {
      const tenantId = 'tenant-123';
      const query = 'SELECT * FROM devices WHERE id = $1';
      const params = ['nonexistent'];
      const mockResult = { rows: [] };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(mockResult);

      const result = await queryWithTenant(tenantId, query, params);

      expect(result.rows).toHaveLength(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should propagate context set errors', async () => {
      const tenantId = 'tenant-123';
      const query = 'SELECT * FROM devices';
      const error = new Error('Context set failed');

      mockClient.query.mockRejectedValueOnce(error);

      await expect(queryWithTenant(tenantId, query)).rejects.toThrow('Context set failed');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transactionWithTenant', () => {
    it('should execute transaction with tenant context', async () => {
      const tenantId = 'tenant-123';
      const mockResult = { id: 'new-device' };

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValue({});

      const callback = jest.fn().mockResolvedValue(mockResult);

      const result = await transactionWithTenant(tenantId, callback);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        [tenantId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual(mockResult);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on callback error', async () => {
      const tenantId = 'tenant-123';
      const error = new Error('Transaction failed');

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      const callback = jest.fn().mockRejectedValue(error);

      await expect(transactionWithTenant(tenantId, callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      const tenantId = 'tenant-123';
      const callbackError = new Error('Transaction failed');
      const rollbackError = new Error('Rollback failed');

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(rollbackError); // ROLLBACK fails

      const callback = jest.fn().mockRejectedValue(callbackError);

      await expect(transactionWithTenant(tenantId, callback))
        .rejects.toThrow('Rollback failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle multiple operations in transaction', async () => {
      const tenantId = 'tenant-123';

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT #1
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // INSERT #2
        .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // INSERT #3
        .mockResolvedValueOnce({}); // COMMIT

      const callback = async (client: any) => {
        await client.query('INSERT INTO table1...');
        await client.query('INSERT INTO table2...');
        await client.query('INSERT INTO table3...');
        return { success: true };
      };

      const result = await transactionWithTenant(tenantId, callback);

      expect(result).toEqual({ success: true });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should propagate context set errors', async () => {
      const tenantId = 'tenant-123';
      const error = new Error('Context set failed');

      mockClient.query.mockRejectedValueOnce(error);

      const callback = jest.fn();

      await expect(transactionWithTenant(tenantId, callback))
        .rejects.toThrow('Context set failed');

      expect(callback).not.toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle BEGIN failure', async () => {
      const tenantId = 'tenant-123';
      const error = new Error('BEGIN failed');

      mockClient.query
        .mockResolvedValueOnce({}) // set_tenant_context
        .mockRejectedValueOnce(error); // BEGIN fails

      const callback = jest.fn();

      await expect(transactionWithTenant(tenantId, callback))
        .rejects.toThrow('BEGIN failed');

      expect(callback).not.toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return callback result', async () => {
      const tenantId = 'tenant-123';
      const expectedResult = {
        devices: [{ id: 1 }, { id: 2 }],
        count: 2
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const callback = jest.fn().mockResolvedValue(expectedResult);

      const result = await transactionWithTenant(tenantId, callback);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle nested tenant operations', async () => {
      const tenantId = 'tenant-123';

      mockClient.query.mockResolvedValue({});

      // Simulate nested operations
      const client = await getTenantClient(tenantId);
      
      await client.query('SELECT 1');
      await client.query('SELECT 2');
      
      client.release();

      expect(mockClient.query).toHaveBeenCalledTimes(3); // context + 2 queries
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent tenant operations', async () => {
      const tenantIds = ['tenant-1', 'tenant-2', 'tenant-3'];
      
      mockClient.query.mockResolvedValue({});

      // Simulate concurrent operations
      const promises = tenantIds.map(id => 
        queryWithTenant(id, 'SELECT * FROM devices')
      );

      await Promise.all(promises);

      expect(mockPool.connect).toHaveBeenCalledTimes(3);
      expect(mockClient.release).toHaveBeenCalledTimes(3);
    });
  });
});
