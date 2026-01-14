/**
 * Unit Tests for models/Collection.ts
 * 
 * Tests the CollectionModel class including CRUD operations and collection-specific
 * functionality like supply management.
 * Priority: 🟡 Medium (12+ tests)
 */

import { CollectionModel, ICollection } from '../../../src/models/Collection';
import { Knex } from 'knex';

// =============================================================================
// Mock Setup
// =============================================================================

// Create a mock query builder that tracks method calls and supports chaining
const createMockQueryBuilder = () => {
  const mockBuilder: any = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    del: jest.fn(),
    returning: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    increment: jest.fn(),
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

// =============================================================================
// ICollection Interface Tests
// =============================================================================

describe('ICollection Interface', () => {
  describe('interface definition', () => {
    it('should define required fields', () => {
      const validCollection: ICollection = {
        name: 'Test Collection',
        symbol: 'TST',
        contract_address: '0x1234567890abcdef',
        blockchain: 'solana'
      };
      
      expect(validCollection.name).toBeDefined();
      expect(validCollection.symbol).toBeDefined();
      expect(validCollection.contract_address).toBeDefined();
      expect(validCollection.blockchain).toBeDefined();
    });

    it('should include name, symbol, contract_address', () => {
      const collection: ICollection = {
        name: 'My NFT Collection',
        symbol: 'MNC',
        contract_address: 'DeFiNftCollectionAddress123',
        blockchain: 'solana'
      };
      
      expect(collection.name).toBe('My NFT Collection');
      expect(collection.symbol).toBe('MNC');
      expect(collection.contract_address).toBe('DeFiNftCollectionAddress123');
    });

    it('should include max_supply, current_supply', () => {
      const collection: ICollection = {
        name: 'Limited Collection',
        symbol: 'LTD',
        contract_address: 'addr123',
        blockchain: 'solana',
        max_supply: 10000,
        current_supply: 5432
      };
      
      expect(collection.max_supply).toBe(10000);
      expect(collection.current_supply).toBe(5432);
    });

    it('should include optional id field', () => {
      const collection: ICollection = {
        id: 'uuid-collection-id',
        name: 'Collection',
        symbol: 'COL',
        contract_address: 'addr',
        blockchain: 'solana'
      };
      
      expect(collection.id).toBe('uuid-collection-id');
    });

    it('should include optional metadata field', () => {
      const collection: ICollection = {
        name: 'Collection',
        symbol: 'COL',
        contract_address: 'addr',
        blockchain: 'solana',
        metadata: {
          description: 'A test collection',
          image: 'https://example.com/image.png',
          external_url: 'https://example.com'
        }
      };
      
      expect(collection.metadata).toBeDefined();
      expect(collection.metadata.description).toBe('A test collection');
    });

    it('should include timestamp fields', () => {
      const collection: ICollection = {
        name: 'Collection',
        symbol: 'COL',
        contract_address: 'addr',
        blockchain: 'solana',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-06-15')
      };
      
      expect(collection.created_at).toBeInstanceOf(Date);
      expect(collection.updated_at).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// CRUD Operations Tests
// =============================================================================

describe('CollectionModel CRUD Operations', () => {
  let model: CollectionModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new CollectionModel(mockKnex);
  });

  describe('create', () => {
    it('should insert and return with RETURNING', async () => {
      const newCollection: ICollection = {
        name: 'New Collection',
        symbol: 'NEW',
        contract_address: 'newContractAddr123',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newCollection,
        created_at: new Date(),
        updated_at: new Date()
      }]);

      const result = await model.create(newCollection);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(newCollection);
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result.id).toBe('generated-id');
      expect(result.name).toBe('New Collection');
    });

    it('should set timestamps', async () => {
      const newCollection: ICollection = {
        name: 'Collection',
        symbol: 'COL',
        contract_address: 'addr',
        blockchain: 'solana'
      };

      const now = new Date();
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'gen-id',
        ...newCollection,
        created_at: now,
        updated_at: now
      }]);

      const result = await model.create(newCollection);

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should handle all optional fields', async () => {
      const fullCollection: ICollection = {
        name: 'Full Collection',
        symbol: 'FUL',
        contract_address: 'fullAddr',
        blockchain: 'solana',
        max_supply: 1000,
        current_supply: 0,
        metadata: { description: 'Full test' }
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'gen-id',
        ...fullCollection
      }]);

      const result = await model.create(fullCollection);

      expect(result.max_supply).toBe(1000);
      expect(result.current_supply).toBe(0);
      expect(result.metadata).toEqual({ description: 'Full test' });
    });
  });

  describe('findById', () => {
    it('should return null when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await model.findById('nonexistent-id');

      expect(result).toBeNull();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'nonexistent-id' });
    });

    it('should return collection when found', async () => {
      const existingCollection = {
        id: 'existing-id',
        name: 'Existing Collection',
        symbol: 'EXS',
        contract_address: 'existingAddr',
        blockchain: 'solana'
      };

      mockQueryBuilder.first.mockResolvedValue(existingCollection);

      const result = await model.findById('existing-id');

      expect(result).toEqual(existingCollection);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'existing-id' });
    });
  });

  describe('findByContract', () => {
    it('should find by contract_address', async () => {
      const collection = {
        id: 'col-id',
        name: 'Contract Collection',
        symbol: 'CTR',
        contract_address: 'specificContractAddr',
        blockchain: 'solana'
      };

      mockQueryBuilder.first.mockResolvedValue(collection);

      const result = await model.findByContract('specificContractAddr');

      expect(result).toEqual(collection);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        contract_address: 'specificContractAddr' 
      });
    });

    it('should return undefined when contract not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await model.findByContract('nonexistentAddr');

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should set updated_at timestamp', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'col-id',
        name: 'Updated Collection',
        symbol: 'UPD',
        contract_address: 'addr',
        blockchain: 'solana',
        updated_at: new Date()
      }]);

      await model.update('col-id', { name: 'Updated Collection' });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });

    it('should use RETURNING clause', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'col-id',
        name: 'Updated',
        symbol: 'UPD',
        contract_address: 'addr',
        blockchain: 'solana'
      }]);

      await model.update('col-id', { name: 'Updated' });

      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
    });

    it('should return null when collection not found', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await model.update('nonexistent', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should update multiple fields', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'col-id',
        name: 'New Name',
        symbol: 'NEW',
        contract_address: 'addr',
        blockchain: 'solana',
        max_supply: 5000
      }]);

      const result = await model.update('col-id', {
        name: 'New Name',
        symbol: 'NEW',
        max_supply: 5000
      });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.name).toBe('New Name');
      expect(updateCall.symbol).toBe('NEW');
      expect(updateCall.max_supply).toBe(5000);
      expect(result?.name).toBe('New Name');
    });
  });

  describe('incrementSupply', () => {
    it('should increment current_supply by 1', async () => {
      mockQueryBuilder.increment.mockResolvedValue(1);

      const result = await model.incrementSupply('col-id');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'col-id' });
      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('current_supply', 1);
      expect(result).toBe(true);
    });

    it('should return boolean success', async () => {
      // Success case
      mockQueryBuilder.increment.mockResolvedValue(1);
      let result = await model.incrementSupply('col-id');
      expect(result).toBe(true);

      // Failure case (no rows affected)
      mockQueryBuilder.increment.mockResolvedValue(0);
      result = await model.incrementSupply('nonexistent');
      expect(result).toBe(false);
    });

    it('should handle increment for non-existent collection', async () => {
      mockQueryBuilder.increment.mockResolvedValue(0);

      const result = await model.incrementSupply('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should return boolean (true if deleted)', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      const result = await model.delete('col-id');

      expect(result).toBe(true);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'col-id' });
      expect(mockQueryBuilder.del).toHaveBeenCalled();
    });

    it('should return false if collection not found', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await model.delete('nonexistent-id');

      expect(result).toBe(false);
    });
  });
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('CollectionModel Constructor', () => {
  it('should accept custom db instance', () => {
    const customDb = createMockKnex();
    const model = new CollectionModel(customDb);
    
    expect(model).toBeDefined();
  });

  it('should use default db when not provided', () => {
    // In tests, we always provide a mock to avoid real DB connections
    // This test just ensures the constructor doesn't throw without args
    expect(() => new CollectionModel()).not.toThrow();
  });
});

// =============================================================================
// Edge Cases & Additional Tests
// =============================================================================

describe('CollectionModel Edge Cases', () => {
  let model: CollectionModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new CollectionModel(mockKnex);
  });

  it('should handle empty metadata object', async () => {
    const collection: ICollection = {
      name: 'Empty Metadata',
      symbol: 'EMT',
      contract_address: 'addr',
      blockchain: 'solana',
      metadata: {}
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...collection
    }]);

    const result = await model.create(collection);

    expect(result.metadata).toEqual({});
  });

  it('should handle complex metadata structures', async () => {
    const complexMetadata = {
      description: 'Complex collection',
      properties: {
        category: 'art',
        tags: ['digital', 'abstract'],
        creators: [
          { name: 'Artist1', share: 50 },
          { name: 'Artist2', share: 50 }
        ]
      },
      external_links: {
        website: 'https://example.com',
        twitter: 'https://twitter.com/example'
      }
    };

    const collection: ICollection = {
      name: 'Complex',
      symbol: 'CMP',
      contract_address: 'addr',
      blockchain: 'solana',
      metadata: complexMetadata
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...collection
    }]);

    const result = await model.create(collection);

    expect(result.metadata).toEqual(complexMetadata);
  });

  it('should handle zero supply values', async () => {
    const collection: ICollection = {
      name: 'Zero Supply',
      symbol: 'ZER',
      contract_address: 'addr',
      blockchain: 'solana',
      max_supply: 0,
      current_supply: 0
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...collection
    }]);

    const result = await model.create(collection);

    expect(result.max_supply).toBe(0);
    expect(result.current_supply).toBe(0);
  });

  it('should handle very large supply numbers', async () => {
    const collection: ICollection = {
      name: 'Large Supply',
      symbol: 'LRG',
      contract_address: 'addr',
      blockchain: 'solana',
      max_supply: Number.MAX_SAFE_INTEGER,
      current_supply: 1000000000
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...collection
    }]);

    const result = await model.create(collection);

    expect(result.max_supply).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.current_supply).toBe(1000000000);
  });

  it('should handle special characters in name and symbol', async () => {
    const collection: ICollection = {
      name: 'Test Collection (Special) #1 - "Edition"',
      symbol: 'TST-1',
      contract_address: 'addr',
      blockchain: 'solana'
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...collection
    }]);

    const result = await model.create(collection);

    expect(result.name).toBe('Test Collection (Special) #1 - "Edition"');
    expect(result.symbol).toBe('TST-1');
  });

  it('should preserve existing fields during partial update', async () => {
    const existingCollection = {
      id: 'col-id',
      name: 'Original Name',
      symbol: 'ORG',
      contract_address: 'originalAddr',
      blockchain: 'solana',
      max_supply: 1000,
      current_supply: 500,
      metadata: { description: 'Original' }
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      ...existingCollection,
      name: 'Updated Name',
      updated_at: new Date()
    }]);

    const result = await model.update('col-id', { name: 'Updated Name' });

    // Only name should be in the update call (plus updated_at)
    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall.name).toBe('Updated Name');
    expect(updateCall.updated_at).toBeDefined();
    expect(Object.keys(updateCall)).toHaveLength(2);
  });
});
