// Test to verify mocking is working
import { pool } from '../../src/config/database';

jest.mock('../../src/config/database', () => ({
  pool: { 
    query: jest.fn() 
  }
}));

describe('Mock Test', () => {
  it('should use mocked pool', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce({ rows: [{ test: 'data' }] });
    
    const result = await pool.query('SELECT * FROM test');
    
    expect(result.rows[0].test).toBe('data');
    expect(mockQuery).toHaveBeenCalled();
  });
});
