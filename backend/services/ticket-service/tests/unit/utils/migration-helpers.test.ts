/**
 * Unit Tests for src/utils/migration-helpers.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  createIndex,
  dropIndex,
  ifTableExists,
  ifTableNotExists,
  ifColumnExists,
  ifColumnNotExists,
  addColumnIfNotExists,
  dropColumnIfExists,
  constraintExists,
  addConstraintIfNotExists,
  dropConstraintIfExists,
  createPolicyIfNotExists,
  dropPolicyIfExists,
  addEnumValueIfNotExists,
  ensureMigrationsTable,
  recordMigration,
  isMigrationApplied,
} from '../../../src/utils/migration-helpers';

describe('utils/migration-helpers', () => {
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    mockClient = {
      query: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('Index Operations', () => {
    describe('createIndex()', () => {
      it('checks if index exists when ifNotExists=true', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // Index exists
        
        await createIndex(mockPool, {
          name: 'idx_test',
          table: 'tickets',
          columns: ['user_id'],
          ifNotExists: true,
        });
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('pg_indexes'),
          ['idx_test']
        );
        // Should not create index since it exists
        expect(mockPool.query).toHaveBeenCalledTimes(1);
      });

      it('skips creation if index already exists', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        
        await createIndex(mockPool, {
          name: 'idx_test',
          table: 'tickets',
          columns: ['user_id'],
          ifNotExists: true,
        });
        
        // Only the check query, no create
        expect(mockPool.query).toHaveBeenCalledTimes(1);
      });

      it('builds SQL with UNIQUE when unique=true', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] }); // Index doesn't exist
        mockPool.query.mockResolvedValue({}); // For create and timeout queries
        
        await createIndex(mockPool, {
          name: 'idx_test',
          table: 'tickets',
          columns: ['email'],
          unique: true,
          concurrently: false,
        });
        
        const createCall = mockPool.query.mock.calls.find((c: any) => 
          c[0].includes('CREATE') && c[0].includes('UNIQUE')
        );
        expect(createCall).toBeDefined();
      });

      it('builds SQL with CONCURRENTLY when concurrently=true', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        mockPool.query.mockResolvedValue({});
        
        await createIndex(mockPool, {
          name: 'idx_test',
          table: 'tickets',
          columns: ['user_id'],
          concurrently: true,
        });
        
        const createCall = mockPool.query.mock.calls.find((c: any) => 
          c[0].includes('CONCURRENTLY')
        );
        expect(createCall).toBeDefined();
      });

      it('builds SQL with WHERE clause for partial indexes', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        mockPool.query.mockResolvedValue({});
        
        await createIndex(mockPool, {
          name: 'idx_active',
          table: 'tickets',
          columns: ['status'],
          where: "status = 'active'",
          concurrently: false,
        });
        
        const createCall = mockPool.query.mock.calls.find((c: any) => 
          c[0].includes('WHERE')
        );
        expect(createCall).toBeDefined();
      });
    });

    describe('dropIndex()', () => {
      it('builds SQL with CONCURRENTLY', async () => {
        mockPool.query.mockResolvedValue({});
        
        await dropIndex(mockPool, 'idx_test', { concurrently: true });
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('CONCURRENTLY')
        );
      });

      it('builds SQL with IF EXISTS', async () => {
        mockPool.query.mockResolvedValue({});
        
        await dropIndex(mockPool, 'idx_test', { ifExists: true });
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('IF EXISTS')
        );
      });
    });
  });

  describe('Table/Column Helpers', () => {
    describe('ifTableExists()', () => {
      it('executes SQL only when table exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await ifTableExists(mockClient, 'tickets', 'SELECT 1');
        
        expect(mockClient.query).toHaveBeenCalledTimes(2);
      });

      it('skips when table doesnt exist', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        
        await ifTableExists(mockClient, 'nonexistent', 'SELECT 1');
        
        expect(mockClient.query).toHaveBeenCalledTimes(1);
      });
    });

    describe('ifTableNotExists()', () => {
      it('executes SQL only when table doesnt exist', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await ifTableNotExists(mockClient, 'new_table', 'CREATE TABLE new_table()');
        
        expect(mockClient.query).toHaveBeenCalledTimes(2);
      });

      it('skips when table exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        
        await ifTableNotExists(mockClient, 'tickets', 'CREATE TABLE tickets()');
        
        expect(mockClient.query).toHaveBeenCalledTimes(1);
      });
    });

    describe('ifColumnExists()', () => {
      it('executes SQL only when column exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await ifColumnExists(mockClient, 'tickets', 'status', 'ALTER TABLE...');
        
        expect(mockClient.query).toHaveBeenCalledTimes(2);
      });
    });

    describe('ifColumnNotExists()', () => {
      it('executes SQL only when column doesnt exist', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await ifColumnNotExists(mockClient, 'tickets', 'new_col', 'ALTER TABLE...');
        
        expect(mockClient.query).toHaveBeenCalledTimes(2);
      });
    });

    describe('addColumnIfNotExists()', () => {
      it('adds column when not present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await addColumnIfNotExists(mockClient, 'tickets', 'new_col', 'VARCHAR(255)');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('ADD COLUMN new_col')
        );
      });
    });

    describe('dropColumnIfExists()', () => {
      it('drops column when present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await dropColumnIfExists(mockClient, 'tickets', 'old_col');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('DROP COLUMN old_col')
        );
      });
    });
  });

  describe('Constraint Helpers', () => {
    describe('constraintExists()', () => {
      it('returns true when constraint exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        
        const result = await constraintExists(mockClient, 'tickets', 'pk_tickets');
        
        expect(result).toBe(true);
      });

      it('returns false when constraint doesnt exist', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        
        const result = await constraintExists(mockClient, 'tickets', 'nonexistent');
        
        expect(result).toBe(false);
      });
    });

    describe('addConstraintIfNotExists()', () => {
      it('adds constraint when not present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await addConstraintIfNotExists(mockClient, 'tickets', 'fk_user', 'FOREIGN KEY (user_id) REFERENCES users(id)');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('ADD CONSTRAINT fk_user')
        );
      });

      it('skips when constraint exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        
        await addConstraintIfNotExists(mockClient, 'tickets', 'fk_user', 'FOREIGN KEY...');
        
        expect(mockClient.query).toHaveBeenCalledTimes(1);
      });
    });

    describe('dropConstraintIfExists()', () => {
      it('drops constraint when present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ exists: true }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await dropConstraintIfExists(mockClient, 'tickets', 'old_fk');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('DROP CONSTRAINT old_fk')
        );
      });
    });
  });

  describe('RLS Policy Helpers', () => {
    describe('createPolicyIfNotExists()', () => {
      it('creates policy when not present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // Policy doesn't exist
        mockClient.query.mockResolvedValueOnce({});
        
        await createPolicyIfNotExists(mockClient, 'tickets', 'tenant_isolation', 'tenant_id = current_tenant()');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('CREATE POLICY tenant_isolation')
        );
      });

      it('includes WITH CHECK when provided', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        mockClient.query.mockResolvedValueOnce({});
        
        await createPolicyIfNotExists(
          mockClient,
          'tickets',
          'tenant_insert',
          'true',
          'tenant_id = current_tenant()',
          'INSERT'
        );
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('WITH CHECK')
        );
      });

      it('skips when policy exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        
        await createPolicyIfNotExists(mockClient, 'tickets', 'existing', 'true');
        
        expect(mockClient.query).toHaveBeenCalledTimes(1);
      });
    });

    describe('dropPolicyIfExists()', () => {
      it('drops policy when present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        mockClient.query.mockResolvedValueOnce({});
        
        await dropPolicyIfExists(mockClient, 'tickets', 'old_policy');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining('DROP POLICY old_policy')
        );
      });
    });
  });

  describe('Enum Helpers', () => {
    describe('addEnumValueIfNotExists()', () => {
      it('adds value when not present', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] }); // Value doesn't exist
        mockClient.query.mockResolvedValueOnce({});
        
        await addEnumValueIfNotExists(mockClient, 'ticket_status', 'pending');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining("ADD VALUE 'pending'")
        );
      });

      it('includes AFTER clause when provided', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        mockClient.query.mockResolvedValueOnce({});
        
        await addEnumValueIfNotExists(mockClient, 'ticket_status', 'pending', 'active');
        
        expect(mockClient.query).toHaveBeenLastCalledWith(
          expect.stringContaining("AFTER 'active'")
        );
      });

      it('skips when value exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        
        await addEnumValueIfNotExists(mockClient, 'ticket_status', 'active');
        
        expect(mockClient.query).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Migration Tracking', () => {
    describe('ensureMigrationsTable()', () => {
      it('creates schema_migrations table', async () => {
        mockClient.query.mockResolvedValueOnce({});
        
        await ensureMigrationsTable(mockClient);
        
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
        );
      });
    });

    describe('recordMigration()', () => {
      it('inserts migration record', async () => {
        mockClient.query.mockResolvedValueOnce({});
        
        await recordMigration(mockClient, '001_initial', 1, 'abc123');
        
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO schema_migrations'),
          ['001_initial', 1, 'abc123']
        );
      });

      it('updates applied_at on conflict', async () => {
        mockClient.query.mockResolvedValueOnce({});
        
        await recordMigration(mockClient, '001_initial', 1);
        
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT'),
          expect.any(Array)
        );
      });
    });

    describe('isMigrationApplied()', () => {
      it('returns true when migration exists', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        
        const result = await isMigrationApplied(mockClient, '001_initial');
        
        expect(result).toBe(true);
      });

      it('returns false when migration doesnt exist', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        
        const result = await isMigrationApplied(mockClient, 'nonexistent');
        
        expect(result).toBe(false);
      });
    });
  });
});
