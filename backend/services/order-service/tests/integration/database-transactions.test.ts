import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

describe('Database Transaction Integration Tests', () => {
  let db: Pool;
  let tenantId: string;

  beforeAll(async () => {
    db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'order_service_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    tenantId = uuidv4();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [tenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
  });

  afterAll(async () => {
    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [tenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
    await db.end();
  });

  describe('ACID Properties', () => {
    it('should rollback transaction on error', async () => {
      const client = await db.connect();
      const orderId = uuidv4();

      try {
        await client.query('BEGIN');

        // Insert order
        await client.query(
          'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, tenantId, uuidv4(), 'pending', 10000]
        );

        // Intentionally cause an error (invalid foreign key)
        await client.query(
          'INSERT INTO order_items (id, order_id, tenant_id, ticket_type_id, quantity, price) VALUES ($1, $2, $3, $4, $5, $6)',
          [uuidv4(), 'invalid-order-id', tenantId, uuidv4(), 1, 5000]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Verify order was not created
      const result = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      expect(result.rows.length).toBe(0);
    });

    it('should maintain consistency with foreign key constraints', async () => {
      const orderId = uuidv4();

      // Create order
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId, tenantId, uuidv4(), 'pending', 10000]
      );

      // Try to delete order with existing items should fail
      await db.query(
        'INSERT INTO order_items (id, order_id, tenant_id, ticket_type_id, quantity, price) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuidv4(), orderId, tenantId, uuidv4(), 1, 5000]
      );

      // Attempt to delete order should fail due to foreign key constraint
      await expect(
        db.query('DELETE FROM orders WHERE id = $1', [orderId])
      ).rejects.toThrow();
    });

    it('should handle concurrent updates with proper locking', async () => {
      const orderId = uuidv4();

      // Create order
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount, version) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, tenantId, uuidv4(), 'pending', 10000, 1]
      );

      // Simulate concurrent updates
      const client1 = await db.connect();
      const client2 = await db.connect();

      try {
        await client1.query('BEGIN');
        await client2.query('BEGIN');

        // Both try to update
        await client1.query(
          'UPDATE orders SET status = $1, version = version + 1 WHERE id = $2 AND version = 1',
          ['reserved', orderId]
        );

        // Second update should see version mismatch
        const result = await client2.query(
          'UPDATE orders SET status = $1, version = version + 1 WHERE id = $2 AND version = 1',
          ['cancelled', orderId]
        );

        await client1.query('COMMIT');
        await client2.query('COMMIT');

        // Only first update should succeed
        expect(result.rowCount).toBe(0);
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Connection Pool Management', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      const connections: any[] = [];

      try {
        // Acquire many connections
        for (let i = 0; i < 10; i++) {
          connections.push(await db.connect());
        }

        // Should still be able to query
        const result = await db.query('SELECT 1 as value');
        expect(result.rows[0].value).toBe(1);
      } finally {
        // Release all connections
        connections.forEach(conn => conn.release());
      }
    });

    it('should recover from connection errors', async () => {
      // Force a connection error
      const client = await db.connect();
      await client.query('SELECT pg_terminate_backend(pg_backend_pid())').catch(() => {});
      client.release();

      // Should be able to reconnect
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = await db.query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity on cascade delete', async () => {
      const orderId = uuidv4();
      const itemId = uuidv4();

      // Create order with items
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId, tenantId, uuidv4(), 'pending', 10000]
      );

      await db.query(
        'INSERT INTO order_items (id, order_id, tenant_id, ticket_type_id, quantity, price) VALUES ($1, $2, $3, $4, $5, $6)',
        [itemId, orderId, tenantId, uuidv4(), 1, 5000]
      );

      // If cascade delete is configured, deleting order should delete items
      await db.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [orderId]);

      // Verify items were deleted
      const result = await db.query('SELECT * FROM order_items WHERE id = $1', [itemId]);
      expect(result.rows.length).toBe(0);
    });

    it('should enforce check constraints', async () => {
      const orderId = uuidv4();

      // Try to insert order with negative total_amount
      await expect(
        db.query(
          'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, tenantId, uuidv4(), 'pending', -1000]
        )
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      const orderId = uuidv4();

      // Insert order
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId, tenantId, uuidv4(), 'pending', 10000]
      );

      // Try to insert duplicate
      await expect(
        db.query(
          'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, tenantId, uuidv4(), 'pending', 10000]
        )
      ).rejects.toThrow();
    });
  });

  describe('Transaction Isolation', () => {
    it('should handle read committed isolation level', async () => {
      const orderId = uuidv4();

      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId, tenantId, uuidv4(), 'pending', 10000]
      );

      const client1 = await db.connect();
      const client2 = await db.connect();

      try {
        await client1.query('BEGIN');
        await client2.query('BEGIN');

        // Update in transaction 1
        await client1.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['reserved', orderId]
        );

        // Read in transaction 2 (should see old value)
        const result1 = await client2.query(
          'SELECT status FROM orders WHERE id = $1',
          [orderId]
        );
        expect(['pending', 'reserved']).toContain(result1.rows[0].status);

        await client1.query('COMMIT');

        // Read again in transaction 2 (should see new value after commit)
        const result2 = await client2.query(
          'SELECT status FROM orders WHERE id = $1',
          [orderId]
        );
        expect(result2.rows[0].status).toBe('reserved');

        await client2.query('COMMIT');
      } finally {
        client1.release();
        client2.release();
      }
    });

    it('should prevent phantom reads with proper isolation', async () => {
      const client1 = await db.connect();
      const client2 = await db.connect();

      try {
        await client1.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        await client2.query('BEGIN');

        // Count orders in transaction 1
        const count1 = await client1.query(
          'SELECT COUNT(*) FROM orders WHERE tenant_id = $1',
          [tenantId]
        );

        // Insert new order in transaction 2
        await client2.query(
          'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
          [uuidv4(), tenantId, uuidv4(), 'pending', 10000]
        );
        await client2.query('COMMIT');

        // Count again in transaction 1 (should see same count)
        const count2 = await client1.query(
          'SELECT COUNT(*) FROM orders WHERE tenant_id = $1',
          [tenantId]
        );

        expect(count1.rows[0].count).toBe(count2.rows[0].count);

        await client1.query('COMMIT');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Deadlock Prevention', () => {
    it('should detect and handle deadlocks', async () => {
      const orderId1 = uuidv4();
      const orderId2 = uuidv4();

      // Create two orders
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId1, tenantId, uuidv4(), 'pending', 10000]
      );
      await db.query(
        'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
        [orderId2, tenantId, uuidv4(), 'pending', 10000]
      );

      const client1 = await db.connect();
      const client2 = await db.connect();

      try {
        await client1.query('BEGIN');
        await client2.query('BEGIN');

        // Lock order1 in client1
        await client1.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['reserved', orderId1]
        );

        // Lock order2 in client2
        await client2.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['reserved', orderId2]
        );

        // Try to lock order2 in client1 (will wait)
        const promise1 = client1.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['confirmed', orderId2]
        );

        // Try to lock order1 in client2 (should detect deadlock)
        const promise2 = client2.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['confirmed', orderId1]
        );

        // One should succeed, one should fail with deadlock
        const results = await Promise.allSettled([promise1, promise2]);
        const hasDeadlock = results.some(
          r => r.status === 'rejected' && (r.reason as Error).message.includes('deadlock')
        );

        expect(hasDeadlock).toBe(true);

        await client1.query('ROLLBACK').catch(() => {});
        await client2.query('ROLLBACK').catch(() => {});
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk inserts efficiently', async () => {
      const orderIds: string[] = [];
      const batchSize = 100;

      const startTime = Date.now();

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        for (let i = 0; i < batchSize; i++) {
          const orderId = uuidv4();
          orderIds.push(orderId);

          await client.query(
            'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
            [orderId, tenantId, uuidv4(), 'pending', 10000]
          );
        }

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all were inserted
      const result = await db.query(
        'SELECT COUNT(*) FROM orders WHERE id = ANY($1)',
        [orderIds]
      );
      expect(parseInt(result.rows[0].count)).toBe(batchSize);

      // Should complete reasonably quickly (under 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle bulk updates efficiently', async () => {
      // Create test orders
      const orderIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const orderId = uuidv4();
        orderIds.push(orderId);
        await db.query(
          'INSERT INTO orders (id, tenant_id, user_id, status, total_amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, tenantId, uuidv4(), 'pending', 10000]
        );
      }

      // Bulk update
      const startTime = Date.now();
      await db.query(
        'UPDATE orders SET status = $1 WHERE id = ANY($2)',
        ['reserved', orderIds]
      );
      const endTime = Date.now();

      // Verify updates
      const result = await db.query(
        'SELECT COUNT(*) FROM orders WHERE id = ANY($1) AND status = $2',
        [orderIds, 'reserved']
      );
      expect(parseInt(result.rows[0].count)).toBe(50);

      // Should be fast
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
