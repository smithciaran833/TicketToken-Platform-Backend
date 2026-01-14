// Mock dependencies before import
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

import { pool, db } from '../../../src/config/database';

describe('database config', () => {
  describe('pool', () => {
    it('should export a Pool instance', () => {
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
      expect(typeof pool.connect).toBe('function');
    });

    it('should have pool configuration', () => {
      expect(pool.options).toBeDefined();
    });
  });

  describe('db (knex)', () => {
    it('should export a knex instance', () => {
      expect(db).toBeDefined();
      expect(typeof db.raw).toBe('function');
      expect(typeof db.select).toBe('function');
    });
  });

  describe('pool events', () => {
    it('should have connect event handler', () => {
      const listeners = pool.listeners('connect');
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should have error event handler', () => {
      const listeners = pool.listeners('error');
      expect(listeners.length).toBeGreaterThan(0);
    });
  });
});
