/**
 * Unit Tests: Transaction Utility
 *
 * Tests database transaction wrapper
 */

import { withTransaction } from '../../../src/utils/transaction';
import { Pool, PoolClient } from 'pg';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Transaction Utility', () => {
  let mockPool: jest.Mocked<Partial<Pool>>;
  let mockClient: jest.Mocked<Partial<PoolClient>>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient as PoolClient),
    };
  });

  // ============================================
  // Successful Transactions
  // ============================================
  describe('Successful Transactions', () => {
    it('should begin transaction', async () => {
      await withTransaction(mockPool as Pool, async () => 'result');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    });

    it('should commit transaction on success', async () => {
      await withTransaction(mockPool as Pool, async () => 'result');

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should return function result', async () => {
      const result = await withTransaction(mockPool as Pool, async () => ({
        id: '123',
        status: 'created',
      }));

      expect(result).toEqual({ id: '123', status: 'created' });
    });

    it('should release client after success', async () => {
      await withTransaction(mockPool as Pool, async () => 'result');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should pass client to callback function', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      await withTransaction(mockPool as Pool, callback);

      expect(callback).toHaveBeenCalledWith(mockClient);
    });

    it('should allow queries within transaction', async () => {
      await withTransaction(mockPool as Pool, async (client) => {
        await client.query('SELECT * FROM orders WHERE id = $1', ['123']);
        await client.query('UPDATE orders SET status = $1 WHERE id = $2', [
          'confirmed',
          '123',
        ]);
        return { updated: true };
      });

      expect(mockClient.query).toHaveBeenCalledTimes(4); // BEGIN, 2 queries, COMMIT
    });

    it('should maintain query order', async () => {
      const queries: string[] = [];
      (mockClient.query as jest.Mock).mockImplementation((query: string) => {
        queries.push(query);
        return Promise.resolve({ rows: [] });
      });

      await withTransaction(mockPool as Pool, async (client) => {
        await client.query('SELECT 1');
        await client.query('SELECT 2');
      });

      expect(queries[0]).toBe('BEGIN');
      expect(queries[1]).toBe('SELECT 1');
      expect(queries[2]).toBe('SELECT 2');
      expect(queries[3]).toBe('COMMIT');
    });
  });

  // ============================================
  // Failed Transactions
  // ============================================
  describe('Failed Transactions', () => {
    it('should rollback transaction on error', async () => {
      const error = new Error('Query failed');

      await expect(
        withTransaction(mockPool as Pool, async () => {
          throw error;
        })
      ).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should not commit on error', async () => {
      await expect(
        withTransaction(mockPool as Pool, async () => {
          throw new Error('Failed');
        })
      ).rejects.toThrow();

      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('should release client after error', async () => {
      await expect(
        withTransaction(mockPool as Pool, async () => {
          throw new Error('Failed');
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should re-throw the original error', async () => {
      const originalError = new Error('Specific error message');

      await expect(
        withTransaction(mockPool as Pool, async () => {
          throw originalError;
        })
      ).rejects.toBe(originalError);
    });

    it('should rollback on async rejection', async () => {
      await expect(
        withTransaction(mockPool as Pool, async () => {
          return Promise.reject(new Error('Async rejection'));
        })
      ).rejects.toThrow('Async rejection');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ============================================
  // Connection Handling
  // ============================================
  describe('Connection Handling', () => {
    it('should acquire connection from pool', async () => {
      await withTransaction(mockPool as Pool, async () => 'result');

      expect(mockPool.connect).toHaveBeenCalledTimes(1);
    });

    it('should always release connection', async () => {
      // Success case
      await withTransaction(mockPool as Pool, async () => 'success');
      expect(mockClient.release).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Error case
      await expect(
        withTransaction(mockPool as Pool, async () => {
          throw new Error('error');
        })
      ).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle connection acquisition failure', async () => {
      (mockPool.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(
        withTransaction(mockPool as Pool, async () => 'result')
      ).rejects.toThrow('Connection failed');
    });
  });

  // ============================================
  // Real-world Scenarios
  // ============================================
  describe('Real-world Scenarios', () => {
    it('should handle order creation transaction', async () => {
      let orderCreated = false;
      let itemsCreated = false;

      const result = await withTransaction(mockPool as Pool, async (client) => {
        await client.query(
          'INSERT INTO orders (id, status) VALUES ($1, $2)',
          ['order-123', 'pending']
        );
        orderCreated = true;

        await client.query(
          'INSERT INTO order_items (order_id, ticket_type_id) VALUES ($1, $2)',
          ['order-123', 'ticket-type-1']
        );
        itemsCreated = true;

        return { orderId: 'order-123' };
      });

      expect(orderCreated).toBe(true);
      expect(itemsCreated).toBe(true);
      expect(result).toEqual({ orderId: 'order-123' });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback partial operations on failure', async () => {
      let orderCreated = false;

      await expect(
        withTransaction(mockPool as Pool, async (client) => {
          await client.query(
            'INSERT INTO orders (id, status) VALUES ($1, $2)',
            ['order-123', 'pending']
          );
          orderCreated = true;

          throw new Error('Item creation failed');
        })
      ).rejects.toThrow('Item creation failed');

      expect(orderCreated).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should support nested async operations', async () => {
      const result = await withTransaction(mockPool as Pool, async (client) => {
        const orderResult = await client.query('INSERT INTO orders ...');

        await new Promise(resolve => setTimeout(resolve, 10));

        const itemResult = await client.query('INSERT INTO items ...');

        return { order: orderResult, items: itemResult };
      });

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  // ============================================
  // Query Order Verification
  // ============================================
  describe('Query Order Verification', () => {
    it('should execute BEGIN before any other queries', async () => {
      const callOrder: number[] = [];
      let callIndex = 0;

      (mockClient.query as jest.Mock).mockImplementation((query: string) => {
        callIndex++;
        if (query === 'BEGIN') callOrder.push(callIndex);
        return Promise.resolve({ rows: [] });
      });

      await withTransaction(mockPool as Pool, async (client) => {
        await client.query('SELECT 1');
      });

      expect(callOrder[0]).toBe(1);
    });

    it('should execute COMMIT after all queries on success', async () => {
      const callOrder: string[] = [];

      (mockClient.query as jest.Mock).mockImplementation((query: string) => {
        callOrder.push(query);
        return Promise.resolve({ rows: [] });
      });

      await withTransaction(mockPool as Pool, async (client) => {
        await client.query('QUERY 1');
        await client.query('QUERY 2');
      });

      expect(callOrder[callOrder.length - 1]).toBe('COMMIT');
    });

    it('should execute ROLLBACK after queries on failure', async () => {
      const callOrder: string[] = [];

      (mockClient.query as jest.Mock).mockImplementation((query: string) => {
        callOrder.push(query);
        return Promise.resolve({ rows: [] });
      });

      await expect(
        withTransaction(mockPool as Pool, async (client) => {
          await client.query('QUERY 1');
          throw new Error('Failed');
        })
      ).rejects.toThrow();

      expect(callOrder[callOrder.length - 1]).toBe('ROLLBACK');
    });
  });
});
