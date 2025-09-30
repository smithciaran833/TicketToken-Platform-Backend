const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/tickettoken_db'
});

// Helper to run concurrent operations
async function testConcurrency(operation, count = 5) {
  const promises = Array(count).fill(0).map(() => operation());
  const results = await Promise.allSettled(promises);
  return {
    successful: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results
  };
}

// Helper to measure performance
async function measurePerformance(operation, maxMs = 1000) {
  const start = Date.now();
  const result = await operation();
  const duration = Date.now() - start;
  return { result, duration, passed: duration < maxMs };
}

// Helper to test database state
async function verifyDatabaseState(query, params) {
  const result = await pool.query(query, params);
  return result.rows;
}

// Helper to test transaction rollback
async function testTransactionRollback(operations) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const op of operations) {
      await op(client);
    }
    // Intentionally rollback to test
    await client.query('ROLLBACK');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testConcurrency,
  measurePerformance,
  verifyDatabaseState,
  testTransactionRollback
};
