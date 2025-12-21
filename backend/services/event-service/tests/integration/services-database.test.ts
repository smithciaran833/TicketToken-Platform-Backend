/**
 * DatabaseService Integration Tests
 */

import { DatabaseService } from '../../src/services/databaseService';

describe('DatabaseService', () => {
  describe('initialize', () => {
    it('should initialize and verify connection', async () => {
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT 1 as num');
      expect(result.rows[0].num).toBe(1);
    });
  });

  describe('getPool', () => {
    it('should return pool after initialization', () => {
      const pool = DatabaseService.getPool();
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
    });
  });
});
