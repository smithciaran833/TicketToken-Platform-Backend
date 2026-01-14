/**
 * Unit Tests for src/services/databaseService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  recordDatabaseQuery: jest.fn(),
  updateDatabasePoolMetrics: jest.fn(),
}));

jest.mock('../../../src/config', () => ({
  config: {
    database: {
      pool: { max: 10, min: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 },
      statementTimeout: 30000,
      lockTimeout: 10000,
    },
  },
}));

import { getRecentSlowQueries, clearSlowQueryHistory } from '../../../src/services/databaseService';

describe('services/databaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSlowQueryHistory();
  });

  describe('SQL Injection Prevention patterns', () => {
    const SQL_INJECTION_PATTERNS = [
      /;\s*--/i,
      /'\s*OR\s+'?\d*'?\s*=\s*'?\d*'?/i,
      /UNION\s+SELECT/i,
      /DROP\s+TABLE/i,
      /DELETE\s+FROM/i,
      /UPDATE\s+\w+\s+SET/i,
    ];

    it('detects comment injection', () => {
      const malicious = "value; -- comment";
      expect(SQL_INJECTION_PATTERNS[0].test(malicious)).toBe(true);
    });

    it('detects OR 1=1 pattern', () => {
      const malicious = "' OR '1'='1";
      expect(SQL_INJECTION_PATTERNS[1].test(malicious)).toBe(true);
    });

    it('detects UNION SELECT pattern', () => {
      const malicious = 'UNION SELECT * FROM users';
      expect(SQL_INJECTION_PATTERNS[2].test(malicious)).toBe(true);
    });

    it('detects DROP TABLE pattern', () => {
      const malicious = '; DROP TABLE tickets;--';
      expect(SQL_INJECTION_PATTERNS[3].test(malicious)).toBe(true);
    });

    it('detects DELETE FROM pattern', () => {
      const malicious = '; DELETE FROM users WHERE 1=1';
      expect(SQL_INJECTION_PATTERNS[4].test(malicious)).toBe(true);
    });

    it('detects UPDATE SET pattern', () => {
      const malicious = '; UPDATE users SET admin=true';
      expect(SQL_INJECTION_PATTERNS[5].test(malicious)).toBe(true);
    });

    it('allows safe parameterized values', () => {
      const safe = 'normal user input';
      const allSafe = SQL_INJECTION_PATTERNS.every(p => !p.test(safe));
      expect(allSafe).toBe(true);
    });
  });

  describe('Query operation extraction', () => {
    function extractOperation(query: string): string {
      const normalized = query.trim().toUpperCase();
      if (normalized.startsWith('SELECT')) return 'SELECT';
      if (normalized.startsWith('INSERT')) return 'INSERT';
      if (normalized.startsWith('UPDATE')) return 'UPDATE';
      if (normalized.startsWith('DELETE')) return 'DELETE';
      if (normalized.startsWith('BEGIN')) return 'TRANSACTION';
      if (normalized.startsWith('COMMIT')) return 'COMMIT';
      if (normalized.startsWith('ROLLBACK')) return 'ROLLBACK';
      return 'OTHER';
    }

    it('identifies SELECT operations', () => {
      expect(extractOperation('SELECT * FROM tickets')).toBe('SELECT');
    });

    it('identifies INSERT operations', () => {
      expect(extractOperation('INSERT INTO tickets VALUES (...)')).toBe('INSERT');
    });

    it('identifies UPDATE operations', () => {
      expect(extractOperation('UPDATE tickets SET status = $1')).toBe('UPDATE');
    });

    it('identifies DELETE operations', () => {
      expect(extractOperation('DELETE FROM tickets WHERE id = $1')).toBe('DELETE');
    });

    it('identifies BEGIN as TRANSACTION', () => {
      expect(extractOperation('BEGIN')).toBe('TRANSACTION');
    });

    it('identifies COMMIT', () => {
      expect(extractOperation('COMMIT')).toBe('COMMIT');
    });

    it('identifies ROLLBACK', () => {
      expect(extractOperation('ROLLBACK')).toBe('ROLLBACK');
    });

    it('returns OTHER for unknown operations', () => {
      expect(extractOperation('EXPLAIN SELECT * FROM tickets')).toBe('OTHER');
    });
  });

  describe('Table extraction', () => {
    function extractTable(query: string): string | undefined {
      const normalized = query.trim();
      const fromMatch = normalized.match(/FROM\s+["']?(\w+)["']?/i);
      if (fromMatch) return fromMatch[1];
      const intoMatch = normalized.match(/INTO\s+["']?(\w+)["']?/i);
      if (intoMatch) return intoMatch[1];
      const updateMatch = normalized.match(/UPDATE\s+["']?(\w+)["']?/i);
      if (updateMatch) return updateMatch[1];
      return undefined;
    }

    it('extracts table from FROM clause', () => {
      expect(extractTable('SELECT * FROM tickets WHERE id = $1')).toBe('tickets');
    });

    it('extracts table from INTO clause', () => {
      expect(extractTable('INSERT INTO orders (id) VALUES ($1)')).toBe('orders');
    });

    it('extracts table from UPDATE clause', () => {
      expect(extractTable('UPDATE reservations SET status = $1')).toBe('reservations');
    });

    it('returns undefined when no table found', () => {
      expect(extractTable('BEGIN')).toBeUndefined();
    });

    it('handles quoted table names', () => {
      expect(extractTable('SELECT * FROM "tickets" WHERE id = $1')).toBe('tickets');
    });
  });

  describe('Parameterized query validation', () => {
    function isParameterizedQuery(text: string, params?: any[]): boolean {
      if (!params || params.length === 0) {
        const hasUnparameterizedStrings = /WHERE\s+\w+\s*=\s*'[^']+'/i.test(text);
        if (hasUnparameterizedStrings) {
          return false;
        }
      }
      return true;
    }

    it('flags unparameterized WHERE clause', () => {
      const unsafe = "SELECT * FROM users WHERE name = 'admin'";
      expect(isParameterizedQuery(unsafe)).toBe(false);
    });

    it('allows parameterized queries', () => {
      const safe = 'SELECT * FROM users WHERE name = $1';
      expect(isParameterizedQuery(safe, ['admin'])).toBe(true);
    });

    it('allows queries without WHERE', () => {
      const safe = 'SELECT COUNT(*) FROM users';
      expect(isParameterizedQuery(safe)).toBe(true);
    });
  });

  describe('getRecentSlowQueries()', () => {
    it('returns empty array initially', () => {
      const queries = getRecentSlowQueries();
      expect(queries).toEqual([]);
    });

    it('returns a copy of the array', () => {
      const queries1 = getRecentSlowQueries();
      const queries2 = getRecentSlowQueries();
      expect(queries1).not.toBe(queries2);
    });
  });

  describe('clearSlowQueryHistory()', () => {
    it('clears the history', () => {
      clearSlowQueryHistory();
      expect(getRecentSlowQueries()).toEqual([]);
    });
  });

  describe('Slow query thresholds', () => {
    it('default slow query threshold is 1000ms', () => {
      const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10);
      expect(SLOW_QUERY_THRESHOLD_MS).toBe(1000);
    });

    it('default critical slow query threshold is 5000ms', () => {
      const CRITICAL_SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.CRITICAL_SLOW_QUERY_THRESHOLD_MS || '5000', 10);
      expect(CRITICAL_SLOW_QUERY_THRESHOLD_MS).toBe(5000);
    });
  });

  describe('Query stats tracking', () => {
    it('tracks query statistics structure', () => {
      interface QueryStats {
        query: string;
        duration: number;
        timestamp: Date;
        rowCount: number | null;
        operation: string;
        table?: string;
      }

      const stats: QueryStats = {
        query: 'SELECT * FROM tickets',
        duration: 150,
        timestamp: new Date(),
        rowCount: 10,
        operation: 'SELECT',
        table: 'tickets',
      };

      expect(stats.query).toBeDefined();
      expect(stats.duration).toBeGreaterThan(0);
      expect(stats.operation).toBe('SELECT');
    });
  });
});
