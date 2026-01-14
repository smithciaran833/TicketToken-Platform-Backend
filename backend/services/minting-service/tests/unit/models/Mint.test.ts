/**
 * Unit Tests for models/Mint.ts
 * 
 * Tests the MintModel class including CRUD operations, soft delete support,
 * immutable field protection, and query builders.
 * Priority: 🔴 Critical (30+ tests)
 */

import { MintModel, IMint, ActiveMint } from '../../../src/models/Mint';
import { Knex } from 'knex';

// =============================================================================
// Mock Setup
// =============================================================================

// Create a mock query builder that tracks method calls and supports chaining
const createMockQueryBuilder = () => {
  const mockBuilder: any = {
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    first: jest.fn(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    del: jest.fn(),
    delete: jest.fn(),
    returning: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    increment: jest.fn(),
    clone: jest.fn().mockReturnThis(),
  };
  return mockBuilder;
};

// Create mock Knex instance
const createMockKnex = () => {
  const mockQueryBuilder = createMockQueryBuilder();
  const mockKnex = jest.fn().mockReturnValue(mockQueryBuilder) as unknown as Knex;
  (mockKnex as any).__queryBuilder = mockQueryBuilder;
  return mockKnex;
};

// Mock logger to prevent console output and track calls
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import logger after mocking
import logger from '../../../src/utils/logger';

// =============================================================================
// Interface & Constants Tests
// =============================================================================

describe('IMint Interface & Constants', () => {
  describe('IMint interface', () => {
    it('should define required fields', () => {
      const validMint: IMint = {
        ticket_id: 'ticket-123',
        status: 'pending',
        blockchain: 'solana'
      };
      
      expect(validMint.ticket_id).toBeDefined();
      expect(validMint.status).toBeDefined();
      expect(validMint.blockchain).toBeDefined();
    });

    it('should include ticket_id', () => {
      const mint: IMint = {
        ticket_id: 'uuid-ticket-id',
        status: 'pending',
        blockchain: 'solana'
      };
      expect(mint.ticket_id).toBe('uuid-ticket-id');
    });

    it('should include tenant_id', () => {
      const mint: IMint = {
        ticket_id: 'ticket-123',
        tenant_id: 'tenant-uuid',
        status: 'pending',
        blockchain: 'solana'
      };
      expect(mint.tenant_id).toBe('tenant-uuid');
    });

    it('should include status enum (pending, minting, completed, failed)', () => {
      const statuses: IMint['status'][] = ['pending', 'minting', 'completed', 'failed'];
      
      statuses.forEach(status => {
        const mint: IMint = {
          ticket_id: 'ticket-123',
          status,
          blockchain: 'solana'
        };
        expect(mint.status).toBe(status);
      });
    });

    it('should include soft delete fields (deleted_at, deleted_by)', () => {
      const mint: IMint = {
        ticket_id: 'ticket-123',
        status: 'pending',
        blockchain: 'solana',
        deleted_at: new Date(),
        deleted_by: 'admin-user-id'
      };
      
      expect(mint.deleted_at).toBeInstanceOf(Date);
      expect(mint.deleted_by).toBe('admin-user-id');
    });

    it('should allow null for soft delete fields when not deleted', () => {
      const activeMint: IMint = {
        ticket_id: 'ticket-123',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: null,
        deleted_by: null
      };
      
      expect(activeMint.deleted_at).toBeNull();
      expect(activeMint.deleted_by).toBeNull();
    });
  });

  describe('ActiveMint type', () => {
    it('should represent non-deleted records with deleted_at as null', () => {
      // ActiveMint type requires deleted_at to be null
      const activeMint: ActiveMint = {
        ticket_id: 'ticket-123',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: null
      };
      
      expect(activeMint.deleted_at).toBeNull();
    });
  });
});

// =============================================================================
// stripImmutableFields Function Tests
// =============================================================================

describe('stripImmutableFields Function', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  it('should strip tenant_id from update data', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      ticket_id: 'ticket-1',
      tenant_id: 'original-tenant',
      status: 'completed',
      blockchain: 'solana'
    }]);

    await model.update('mint-1', { 
      tenant_id: 'malicious-tenant',
      status: 'completed' 
    }, 'original-tenant');

    // Verify update was called without tenant_id
    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('tenant_id');
    expect(updateCall.status).toBe('completed');
  });

  it('should strip id from update data', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'original-id',
      ticket_id: 'ticket-1',
      status: 'completed',
      blockchain: 'solana'
    }]);

    await model.update('original-id', { 
      id: 'malicious-id',
      status: 'completed' 
    });

    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('id');
  });

  it('should strip created_at from update data', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      ticket_id: 'ticket-1',
      status: 'completed',
      blockchain: 'solana'
    }]);

    await model.update('mint-1', { 
      created_at: new Date('2020-01-01'),
      status: 'completed' 
    });

    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('created_at');
  });

  it('should strip ticket_id from update data', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      ticket_id: 'original-ticket',
      status: 'completed',
      blockchain: 'solana'
    }]);

    await model.update('mint-1', { 
      ticket_id: 'different-ticket',
      status: 'completed' 
    });

    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('ticket_id');
  });

  it('should preserve mutable fields', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      ticket_id: 'ticket-1',
      status: 'completed',
      transaction_hash: 'tx-hash-123',
      error: null,
      retry_count: 2,
      blockchain: 'solana'
    }]);

    await model.update('mint-1', {
      status: 'completed',
      transaction_hash: 'tx-hash-123',
      error: null,
      retry_count: 2
    });

    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall.status).toBe('completed');
    expect(updateCall.transaction_hash).toBe('tx-hash-123');
    expect(updateCall.error).toBeNull();
    expect(updateCall.retry_count).toBe(2);
  });

  it('should log warning when attempting to modify immutable fields', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      ticket_id: 'ticket-1',
      status: 'completed',
      blockchain: 'solana'
    }]);

    await model.update('mint-1', {
      tenant_id: 'malicious-tenant',
      ticket_id: 'malicious-ticket',
      status: 'completed'
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Attempted to modify immutable field: tenant_id',
      expect.objectContaining({ field: 'tenant_id' })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Attempted to modify immutable field: ticket_id',
      expect.objectContaining({ field: 'ticket_id' })
    );
  });
});

// =============================================================================
// Query Builders Tests
// =============================================================================

describe('Query Builders', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  describe('activeQuery (via findById)', () => {
    it('should exclude soft-deleted records (whereNull deleted_at)', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await model.findById('mint-1');

      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  describe('allQuery (via findByIdIncludeDeleted)', () => {
    it('should include all records without deleted_at filter', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'mint-1',
        ticket_id: 'ticket-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      });

      const result = await model.findByIdIncludeDeleted('mint-1');

      // Should NOT call whereNull for deleted_at
      expect(mockQueryBuilder.whereNull).not.toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
      expect(result?.deleted_at).toBeDefined();
    });
  });

  describe('deletedQuery (via findDeleted)', () => {
    it('should only return soft-deleted records (whereNotNull deleted_at)', async () => {
      mockQueryBuilder.limit.mockReturnThis();
      mockQueryBuilder.orderBy.mockReturnThis();
      
      // Mock the final execution to return an array
      const mockChain = createMockQueryBuilder();
      mockChain.whereNotNull.mockReturnThis();
      mockChain.orderBy.mockReturnThis();
      mockChain.where.mockReturnThis();
      mockChain.limit.mockResolvedValue([
        {
          id: 'deleted-mint-1',
          ticket_id: 'ticket-1',
          status: 'completed',
          blockchain: 'solana',
          deleted_at: new Date()
        }
      ]);
      
      (mockKnex as jest.Mock).mockReturnValue(mockChain);
      
      await model.findDeleted('tenant-1');

      expect(mockChain.whereNotNull).toHaveBeenCalledWith('deleted_at');
    });
  });
});

// =============================================================================
// CRUD Operations Tests
// =============================================================================

describe('CRUD Operations', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  describe('create', () => {
    it('should use RETURNING clause', async () => {
      const newMint: IMint = {
        ticket_id: 'ticket-123',
        tenant_id: 'tenant-456',
        status: 'pending',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newMint,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      }]);

      await model.create(newMint);

      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
    });

    it('should set created_at and updated_at', async () => {
      const newMint: IMint = {
        ticket_id: 'ticket-123',
        status: 'pending',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newMint,
        created_at: new Date(),
        updated_at: new Date()
      }]);

      await model.create(newMint);

      const insertCall = mockQueryBuilder.insert.mock.calls[0][0];
      expect(insertCall.created_at).toBeInstanceOf(Date);
      expect(insertCall.updated_at).toBeInstanceOf(Date);
    });

    it('should set deleted_at to null', async () => {
      const newMint: IMint = {
        ticket_id: 'ticket-123',
        status: 'pending',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newMint,
        deleted_at: null
      }]);

      await model.create(newMint);

      const insertCall = mockQueryBuilder.insert.mock.calls[0][0];
      expect(insertCall.deleted_at).toBeNull();
    });

    it('should log creation info', async () => {
      const newMint: IMint = {
        ticket_id: 'ticket-123',
        tenant_id: 'tenant-456',
        status: 'pending',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newMint
      }]);

      await model.create(newMint);

      expect(logger.info).toHaveBeenCalledWith(
        'Mint record created',
        expect.objectContaining({
          id: 'generated-id',
          ticketId: 'ticket-123',
          tenantId: 'tenant-456'
        })
      );
    });
  });

  describe('findById', () => {
    it('should filter by tenant when provided', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana'
      });

      await model.findById('mint-1', 'tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('should exclude soft-deleted', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await model.findById('mint-1');

      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should return null when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await model.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByIdIncludeDeleted', () => {
    it('should return deleted records', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'mint-1',
        ticket_id: 'ticket-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      });

      const result = await model.findByIdIncludeDeleted('mint-1');

      expect(result).toBeDefined();
      expect(result?.deleted_at).toBeInstanceOf(Date);
    });
  });

  describe('findByTicketId', () => {
    it('should require tenantId parameter', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana'
      });

      await model.findByTicketId('ticket-1', 'tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1'
      });
    });
  });

  describe('findPending', () => {
    it('should filter status=pending', async () => {
      // Set up the mock chain for the query
      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.orderBy.mockReturnThis();
      mockQueryBuilder.limit.mockResolvedValue([]);

      await model.findPending(10);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('should filter retry_count < 3', async () => {
      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.orderBy.mockReturnThis();
      mockQueryBuilder.limit.mockResolvedValue([]);

      await model.findPending(10);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('retry_count', '<', 3);
    });

    it('should order by created_at ASC', async () => {
      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.orderBy.mockReturnThis();
      mockQueryBuilder.limit.mockResolvedValue([]);

      await model.findPending(10);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'asc');
    });
  });

  describe('findByStatus', () => {
    it('should support pagination (limit, offset)', async () => {
      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.orderBy.mockReturnThis();
      mockQueryBuilder.limit.mockReturnThis();
      mockQueryBuilder.offset.mockResolvedValue([]);

      await model.findByStatus('completed', 'tenant-1', { limit: 20, offset: 40 });

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(40);
    });
  });

  describe('update', () => {
    it('should strip immutable fields', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana'
      }]);

      await model.update('mint-1', {
        id: 'new-id',
        tenant_id: 'new-tenant',
        ticket_id: 'new-ticket',
        created_at: new Date(),
        status: 'completed'
      });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('id');
      expect(updateCall).not.toHaveProperty('tenant_id');
      expect(updateCall).not.toHaveProperty('ticket_id');
      expect(updateCall).not.toHaveProperty('created_at');
      expect(updateCall.status).toBe('completed');
    });

    it('should use RETURNING clause', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        status: 'completed',
        blockchain: 'solana'
      }]);

      await model.update('mint-1', { status: 'completed' });

      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
    });

    it('should set updated_at', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        status: 'completed',
        blockchain: 'solana'
      }]);

      await model.update('mint-1', { status: 'completed' });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });

    it('should return null when record not found', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await model.update('nonexistent', { status: 'completed' });

      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Soft Delete Tests
// =============================================================================

describe('Soft Delete', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  describe('softDelete', () => {
    it('should set deleted_at timestamp', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      }]);

      await model.softDelete('mint-1', 'tenant-1');

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.deleted_at).toBeInstanceOf(Date);
    });

    it('should record deleted_by', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date(),
        deleted_by: 'admin-user-id'
      }]);

      await model.softDelete('mint-1', 'tenant-1', 'admin-user-id');

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.deleted_by).toBe('admin-user-id');
    });

    it('should use RETURNING clause', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      }]);

      await model.softDelete('mint-1', 'tenant-1');

      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
    });

    it('should log soft delete info', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      }]);

      await model.softDelete('mint-1', 'tenant-1', 'admin-user');

      expect(logger.info).toHaveBeenCalledWith(
        'Mint record soft deleted',
        expect.objectContaining({
          id: 'mint-1',
          ticketId: 'ticket-1',
          tenantId: 'tenant-1',
          deletedBy: 'admin-user'
        })
      );
    });
  });

  describe('restore', () => {
    it('should clear deleted_at', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: null,
        deleted_by: null
      }]);

      await model.restore('mint-1', 'tenant-1');

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.deleted_at).toBeNull();
    });

    it('should clear deleted_by', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: null,
        deleted_by: null
      }]);

      await model.restore('mint-1', 'tenant-1');

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.deleted_by).toBeNull();
    });

    it('should use deletedQuery to only restore deleted records', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        status: 'completed',
        blockchain: 'solana'
      }]);

      await model.restore('mint-1', 'tenant-1');

      expect(mockQueryBuilder.whereNotNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should log restoration info', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana'
      }]);

      await model.restore('mint-1', 'tenant-1');

      expect(logger.info).toHaveBeenCalledWith(
        'Mint record restored',
        expect.objectContaining({
          id: 'mint-1',
          ticketId: 'ticket-1',
          tenantId: 'tenant-1'
        })
      );
    });
  });

  describe('hardDelete', () => {
    it('should require confirm flag', async () => {
      const result = await model.hardDelete('mint-1', 'tenant-1');

      expect(result).toBe(false);
      expect(mockQueryBuilder.del).not.toHaveBeenCalled();
    });

    it('should return false without confirmation', async () => {
      const result = await model.hardDelete('mint-1', 'tenant-1', { confirm: false });

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Hard delete attempted without confirmation',
        expect.objectContaining({ id: 'mint-1', tenantId: 'tenant-1' })
      );
    });

    it('should perform delete with confirmation', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      const result = await model.hardDelete('mint-1', 'tenant-1', { confirm: true });

      expect(result).toBe(true);
      expect(mockQueryBuilder.del).toHaveBeenCalled();
    });

    it('should log permanent deletion warning', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      await model.hardDelete('mint-1', 'tenant-1', { confirm: true });

      expect(logger.warn).toHaveBeenCalledWith(
        'Mint record permanently deleted',
        expect.objectContaining({
          id: 'mint-1',
          tenantId: 'tenant-1',
          warning: 'This action cannot be undone'
        })
      );
    });

    it('should return false when record not found', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await model.hardDelete('nonexistent', 'tenant-1', { confirm: true });

      expect(result).toBe(false);
    });
  });

  describe('delete (deprecated)', () => {
    it('should redirect to soft delete', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'mint-1',
        ticket_id: 'ticket-1',
        tenant_id: 'tenant-1',
        status: 'completed',
        blockchain: 'solana',
        deleted_at: new Date()
      }]);

      const result = await model.delete('mint-1', 'tenant-1');

      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Using deprecated delete method - prefer softDelete',
        expect.any(Object)
      );
    });

    it('should not allow delete without tenantId', async () => {
      const result = await model.delete('mint-1');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Hard delete without tenantId is not allowed'
      );
    });
  });
});

// =============================================================================
// Statistics Tests
// =============================================================================

describe('Statistics', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  describe('countByStatus', () => {
    it('should return counts per status', async () => {
      mockQueryBuilder.groupBy.mockResolvedValue([
        { status: 'pending', count: '5' },
        { status: 'minting', count: '2' },
        { status: 'completed', count: '100' },
        { status: 'failed', count: '3' }
      ]);

      const result = await model.countByStatus();

      expect(result).toEqual({
        pending: 5,
        minting: 2,
        completed: 100,
        failed: 3
      });
    });

    it('should filter by tenant', async () => {
      mockQueryBuilder.groupBy.mockResolvedValue([
        { status: 'completed', count: '50' }
      ]);

      await model.countByStatus('tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('should return zero for statuses with no records', async () => {
      mockQueryBuilder.groupBy.mockResolvedValue([
        { status: 'completed', count: '10' }
      ]);

      const result = await model.countByStatus();

      expect(result.pending).toBe(0);
      expect(result.minting).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.completed).toBe(10);
    });
  });

  describe('getCounts', () => {
    it('should return total, active, deleted counts', async () => {
      // Mock the count queries
      const mockClonedBuilder = createMockQueryBuilder();
      mockClonedBuilder.count.mockReturnThis();
      mockClonedBuilder.whereNotNull.mockReturnThis();
      mockClonedBuilder.first.mockResolvedValueOnce({ count: '100' })
                       .mockResolvedValueOnce({ count: '10' });
      
      mockQueryBuilder.clone.mockReturnValue(mockClonedBuilder);

      const result = await model.getCounts();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('active');
      expect(result).toHaveProperty('deleted');
    });

    it('should filter by tenant when provided', async () => {
      const mockClonedBuilder = createMockQueryBuilder();
      mockClonedBuilder.count.mockReturnThis();
      mockClonedBuilder.whereNotNull.mockReturnThis();
      mockClonedBuilder.first.mockResolvedValue({ count: '50' });
      
      mockQueryBuilder.clone.mockReturnValue(mockClonedBuilder);
      mockQueryBuilder.where.mockReturnThis();

      await model.getCounts('tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('should calculate active as total minus deleted', async () => {
      const mockClonedBuilder = createMockQueryBuilder();
      mockClonedBuilder.count.mockReturnThis();
      mockClonedBuilder.whereNotNull.mockReturnThis();
      mockClonedBuilder.first.mockResolvedValueOnce({ count: '100' })
                       .mockResolvedValueOnce({ count: '25' });
      
      mockQueryBuilder.clone.mockReturnValue(mockClonedBuilder);

      const result = await model.getCounts();

      expect(result.total).toBe(100);
      expect(result.deleted).toBe(25);
      expect(result.active).toBe(75);
    });
  });
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('MintModel Constructor', () => {
  it('should accept custom db instance', () => {
    const customDb = createMockKnex();
    const model = new MintModel(customDb);
    
    // Model should use the provided db instance
    expect(model).toBeDefined();
  });

  it('should use default db when not provided', () => {
    // This would use the actual knex instance from config/database
    // In tests, we always provide a mock to avoid real DB connections
    expect(() => new MintModel()).not.toThrow();
  });
});

// =============================================================================
// Additional Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  let model: MintModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new MintModel(mockKnex);
  });

  it('should handle empty results from findPending', async () => {
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.limit.mockResolvedValue([]);

    const result = await model.findPending();

    expect(result).toEqual([]);
  });

  it('should handle optional fields in create', async () => {
    const minimalMint: IMint = {
      ticket_id: 'ticket-1',
      status: 'pending',
      blockchain: 'solana'
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'generated-id',
      ...minimalMint,
      created_at: new Date(),
      updated_at: new Date()
    }]);

    const result = await model.create(minimalMint);

    expect(result.id).toBe('generated-id');
    expect(result.tenant_id).toBeUndefined();
    expect(result.nft_id).toBeUndefined();
  });

  it('should handle update with only status change', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      status: 'minting',
      blockchain: 'solana'
    }]);

    const result = await model.update('mint-1', { status: 'minting' });

    expect(result?.status).toBe('minting');
  });

  it('should not modify deleted_at through regular update', async () => {
    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'mint-1',
      status: 'completed',
      blockchain: 'solana',
      deleted_at: null
    }]);

    await model.update('mint-1', {
      status: 'completed',
      deleted_at: new Date(), // Try to set deleted_at
      deleted_by: 'attacker'
    } as any);

    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('deleted_at');
    expect(updateCall).not.toHaveProperty('deleted_by');
  });
});
