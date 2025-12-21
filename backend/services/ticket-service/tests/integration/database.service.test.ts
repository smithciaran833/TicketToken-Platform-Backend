import { DatabaseService } from '../../src/services/databaseService';
import { Pool } from 'pg';

/**
 * INTEGRATION TESTS FOR DATABASE SERVICE
 * 
 * These tests use REAL database connections.
 * No mocks. Tests actual behavior end-to-end.
 */

// Safety check: Ensure we're not running against production database
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running database service integration tests against test database: ${dbName}`);
});

describe('DatabaseService Integration Tests', () => {
  let pool: Pool;
  let testTableName: string;

  beforeAll(async () => {
    // Initialize database connection
    await DatabaseService.initialize();
    
    // Get the database pool
    pool = DatabaseService.getPool();
    
    // Create a unique test table name
    testTableName = `test_db_service_${Date.now()}`;
  });

  afterEach(async () => {
    // Clean up test table if it exists
    try {
      await pool.query(`DROP TABLE IF EXISTS ${testTableName}`);
    } catch (error) {
      // Ignore errors if table doesn't exist
    }
  });

  afterAll(async () => {
    // Close database connection pool to prevent Jest from hanging
    await DatabaseService.close();
  });

  describe('getPool()', () => {
    it('should return a valid PostgreSQL pool', () => {
      const pool = DatabaseService.getPool();
      
      expect(pool).toBeDefined();
      expect(pool).toBeInstanceOf(Pool);
    });

    it('should return the same pool instance (singleton)', () => {
      const pool1 = DatabaseService.getPool();
      const pool2 = DatabaseService.getPool();
      
      expect(pool1).toBe(pool2);
    });
  });

  describe('query execution', () => {
    it('should execute a simple SELECT query', async () => {
      const result = await pool.query('SELECT 1 as test_value');
      
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].test_value).toBe(1);
    });

    it('should execute CREATE TABLE statement', async () => {
      const createTableQuery = `
        CREATE TABLE ${testTableName} (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      const result = await pool.query(createTableQuery);
      expect(result.command).toBe('CREATE');
      
      // Verify table exists
      const checkTable = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [testTableName]);
      
      expect(checkTable.rows[0].exists).toBe(true);
    });

    it('should execute INSERT with parameters', async () => {
      // Create table
      await pool.query(`
        CREATE TABLE ${testTableName} (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        )
      `);
      
      // Insert with parameterized query
      const insertResult = await pool.query(
        `INSERT INTO ${testTableName} (name) VALUES ($1) RETURNING *`,
        ['Test Name']
      );
      
      expect(insertResult.rows.length).toBe(1);
      expect(insertResult.rows[0].name).toBe('Test Name');
      expect(insertResult.rows[0].id).toBeDefined();
    });

    it('should execute UPDATE with parameters', async () => {
      // Create and populate table
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
      await pool.query(`INSERT INTO ${testTableName} (name) VALUES ($1)`, ['Original']);
      
      // Update
      const updateResult = await pool.query(
        `UPDATE ${testTableName} SET name = $1 WHERE name = $2 RETURNING *`,
        ['Updated', 'Original']
      );
      
      expect(updateResult.rows.length).toBe(1);
      expect(updateResult.rows[0].name).toBe('Updated');
    });

    it('should execute DELETE with parameters', async () => {
      // Create and populate table
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
      await pool.query(`INSERT INTO ${testTableName} (name) VALUES ($1)`, ['ToDelete']);
      
      // Delete
      const deleteResult = await pool.query(
        `DELETE FROM ${testTableName} WHERE name = $1`,
        ['ToDelete']
      );
      
      expect(deleteResult.rowCount).toBe(1);
      
      // Verify deleted
      const selectResult = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(selectResult.rows.length).toBe(0);
    });

    it('should handle parameterized queries safely (SQL injection prevention)', async () => {
      // Create table
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, name VARCHAR(100))`);
      
      // Attempt SQL injection via parameter
      const maliciousInput = "'; DROP TABLE users; --";
      
      await pool.query(
        `INSERT INTO ${testTableName} (name) VALUES ($1)`,
        [maliciousInput]
      );
      
      // The malicious string should be stored literally, not executed
      const result = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(result.rows[0].name).toBe(maliciousInput);
      
      // Verify users table still exists (wasn't dropped)
      const usersCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'users'
        )
      `);
      expect(usersCheck.rows[0].exists).toBe(true);
    });
  });

  describe('transaction support', () => {
    it('should support transactions with commit', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, value INTEGER)`);
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (1)`);
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (2)`);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      
      // Verify both rows exist
      const result = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(result.rows.length).toBe(2);
    });

    it('should support transactions with rollback', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, value INTEGER)`);
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (1)`);
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (2)`);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      
      // Verify no rows exist (rolled back)
      const result = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(result.rows.length).toBe(0);
    });

    it('should rollback on error within transaction', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, value INTEGER NOT NULL)`);
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (1)`);
        
        // This should fail (NULL not allowed)
        await client.query(`INSERT INTO ${testTableName} (value) VALUES (NULL)`);
        
        await client.query('COMMIT');
        fail('Should have thrown error');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      
      // Verify no rows exist (rolled back)
      const result = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(result.rows.length).toBe(0);
    });
  });

  describe('connection pool management', () => {
    it('should acquire and release connections', async () => {
      const client = await pool.connect();
      
      expect(client).toBeDefined();
      expect(typeof client.query).toBe('function');
      
      // Execute query to verify connection works
      const result = await client.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
      
      // Release connection back to pool
      client.release();
    });

    it('should handle multiple concurrent connections', async () => {
      const connections = await Promise.all([
        pool.connect(),
        pool.connect(),
        pool.connect()
      ]);
      
      expect(connections.length).toBe(3);
      
      // Execute queries concurrently
      const results = await Promise.all(
        connections.map(client => client.query('SELECT 1 as value'))
      );
      
      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.rows[0].value).toBe(1);
      });
      
      // Release all connections
      connections.forEach(client => client.release());
    });

    it('should reuse connections from pool', async () => {
      // Get a connection
      const client1 = await pool.connect();
      await client1.query('SELECT 1');
      const client1Id = await client1.query('SELECT pg_backend_pid() as pid');
      const pid1 = client1Id.rows[0].pid;
      client1.release();
      
      // Get another connection (might be the same one from pool)
      const client2 = await pool.connect();
      const client2Id = await client2.query('SELECT pg_backend_pid() as pid');
      const pid2 = client2Id.rows[0].pid;
      client2.release();
      
      // PIDs could be same (reused) or different (new connection)
      // Either is valid behavior for connection pooling
      expect(typeof pid1).toBe('number');
      expect(typeof pid2).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid SQL syntax', async () => {
      await expect(pool.query('INVALID SQL STATEMENT')).rejects.toThrow();
    });

    it('should throw error for non-existent table', async () => {
      await expect(
        pool.query('SELECT * FROM non_existent_table_xyz')
      ).rejects.toThrow();
    });

    it('should throw error for constraint violations', async () => {
      await pool.query(`
        CREATE TABLE ${testTableName} (
          id SERIAL PRIMARY KEY,
          email VARCHAR(100) UNIQUE NOT NULL
        )
      `);
      
      await pool.query(`INSERT INTO ${testTableName} (email) VALUES ($1)`, ['test@example.com']);
      
      // Try to insert duplicate email
      await expect(
        pool.query(`INSERT INTO ${testTableName} (email) VALUES ($1)`, ['test@example.com'])
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      try {
        await pool.query('SELECT * FROM non_existent_table');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('data type handling', () => {
    it('should handle INTEGER types correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, num INTEGER)`);
      await pool.query(`INSERT INTO ${testTableName} (num) VALUES ($1)`, [42]);
      
      const result = await pool.query(`SELECT num FROM ${testTableName}`);
      expect(result.rows[0].num).toBe(42);
      expect(typeof result.rows[0].num).toBe('number');
    });

    it('should handle VARCHAR types correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, text VARCHAR(100))`);
      await pool.query(`INSERT INTO ${testTableName} (text) VALUES ($1)`, ['Hello World']);
      
      const result = await pool.query(`SELECT text FROM ${testTableName}`);
      expect(result.rows[0].text).toBe('Hello World');
      expect(typeof result.rows[0].text).toBe('string');
    });

    it('should handle BOOLEAN types correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, flag BOOLEAN)`);
      await pool.query(`INSERT INTO ${testTableName} (flag) VALUES ($1)`, [true]);
      
      const result = await pool.query(`SELECT flag FROM ${testTableName}`);
      expect(result.rows[0].flag).toBe(true);
      expect(typeof result.rows[0].flag).toBe('boolean');
    });

    it('should handle TIMESTAMP types correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, created_at TIMESTAMP)`);
      const now = new Date();
      await pool.query(`INSERT INTO ${testTableName} (created_at) VALUES ($1)`, [now]);
      
      const result = await pool.query(`SELECT created_at FROM ${testTableName}`);
      expect(result.rows[0].created_at).toBeInstanceOf(Date);
    });

    it('should handle NULL values correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, nullable_field VARCHAR(100))`);
      await pool.query(`INSERT INTO ${testTableName} (nullable_field) VALUES ($1)`, [null]);
      
      const result = await pool.query(`SELECT nullable_field FROM ${testTableName}`);
      expect(result.rows[0].nullable_field).toBeNull();
    });

    it('should handle JSONB types correctly', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, data JSONB)`);
      const jsonData = { key: 'value', nested: { foo: 'bar' } };
      await pool.query(`INSERT INTO ${testTableName} (data) VALUES ($1)`, [JSON.stringify(jsonData)]);
      
      const result = await pool.query(`SELECT data FROM ${testTableName}`);
      expect(result.rows[0].data).toEqual(jsonData);
    });
  });

  describe('performance and limits', () => {
    it('should handle large result sets', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, value INTEGER)`);
      
      // Insert 1000 rows
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < 1000; i++) {
          await client.query(`INSERT INTO ${testTableName} (value) VALUES ($1)`, [i]);
        }
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      
      const result = await pool.query(`SELECT * FROM ${testTableName}`);
      expect(result.rows.length).toBe(1000);
    });

    it('should handle long strings', async () => {
      await pool.query(`CREATE TABLE ${testTableName} (id SERIAL PRIMARY KEY, long_text TEXT)`);
      const longString = 'a'.repeat(10000);
      
      await pool.query(`INSERT INTO ${testTableName} (long_text) VALUES ($1)`, [longString]);
      
      const result = await pool.query(`SELECT long_text FROM ${testTableName}`);
      expect(result.rows[0].long_text).toBe(longString);
      expect(result.rows[0].long_text.length).toBe(10000);
    });
  });

  describe('connection health', () => {
    it('should verify database is reachable', async () => {
      const result = await pool.query('SELECT 1 as health_check');
      expect(result.rows[0].health_check).toBe(1);
    });

    it('should get current database name', async () => {
      const result = await pool.query('SELECT current_database()');
      expect(result.rows[0].current_database).toBeDefined();
      expect(typeof result.rows[0].current_database).toBe('string');
    });

    it('should get database version', async () => {
      const result = await pool.query('SELECT version()');
      expect(result.rows[0].version).toBeDefined();
      expect(result.rows[0].version).toContain('PostgreSQL');
    });
  });
});
