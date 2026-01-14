/**
 * Unit Tests for models/NFT.ts
 * 
 * Tests the NFTModel class including CRUD operations and NFT-specific
 * functionality like finding by owner and token ID.
 * Priority: 🟡 Medium (10+ tests)
 */

import { NFTModel, INFT } from '../../../src/models/NFT';
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
// INFT Interface Tests
// =============================================================================

describe('INFT Interface', () => {
  describe('interface definition', () => {
    it('should define required fields', () => {
      const validNFT: INFT = {
        token_id: 'token-123',
        contract_address: 'contractAddr123',
        owner_address: 'ownerAddr456',
        blockchain: 'solana'
      };
      
      expect(validNFT.token_id).toBeDefined();
      expect(validNFT.contract_address).toBeDefined();
      expect(validNFT.owner_address).toBeDefined();
      expect(validNFT.blockchain).toBeDefined();
    });

    it('should include token_id, contract_address, owner_address', () => {
      const nft: INFT = {
        token_id: 'unique-token-id-123',
        contract_address: 'SolanaContractAddr789',
        owner_address: 'OwnerWalletAddress456',
        blockchain: 'solana'
      };
      
      expect(nft.token_id).toBe('unique-token-id-123');
      expect(nft.contract_address).toBe('SolanaContractAddr789');
      expect(nft.owner_address).toBe('OwnerWalletAddress456');
    });

    it('should include metadata_uri, metadata', () => {
      const nft: INFT = {
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana',
        metadata_uri: 'ipfs://QmXyz123/metadata.json',
        metadata: {
          name: 'My NFT',
          description: 'A unique NFT',
          image: 'ipfs://QmXyz123/image.png',
          attributes: [
            { trait_type: 'Color', value: 'Blue' },
            { trait_type: 'Rarity', value: 'Rare' }
          ]
        }
      };
      
      expect(nft.metadata_uri).toBe('ipfs://QmXyz123/metadata.json');
      expect(nft.metadata).toBeDefined();
      expect(nft.metadata.name).toBe('My NFT');
      expect(nft.metadata.attributes).toHaveLength(2);
    });

    it('should include optional id field', () => {
      const nft: INFT = {
        id: 'uuid-nft-id',
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana'
      };
      
      expect(nft.id).toBe('uuid-nft-id');
    });

    it('should include timestamp fields', () => {
      const nft: INFT = {
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-06-15')
      };
      
      expect(nft.created_at).toBeInstanceOf(Date);
      expect(nft.updated_at).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// CRUD Operations Tests
// =============================================================================

describe('NFTModel CRUD Operations', () => {
  let model: NFTModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new NFTModel(mockKnex);
  });

  describe('create', () => {
    it('should use RETURNING clause', async () => {
      const newNFT: INFT = {
        token_id: 'new-token-123',
        contract_address: 'newContractAddr',
        owner_address: 'ownerAddr',
        blockchain: 'solana'
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'generated-id',
        ...newNFT,
        created_at: new Date(),
        updated_at: new Date()
      }]);

      const result = await model.create(newNFT);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(newNFT);
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result.id).toBe('generated-id');
      expect(result.token_id).toBe('new-token-123');
    });

    it('should handle all fields including metadata', async () => {
      const fullNFT: INFT = {
        token_id: 'full-token-123',
        contract_address: 'fullContractAddr',
        owner_address: 'fullOwnerAddr',
        blockchain: 'solana',
        metadata_uri: 'ipfs://QmFull/metadata.json',
        metadata: {
          name: 'Full NFT',
          description: 'Complete NFT with all fields',
          image: 'ipfs://QmFull/image.png'
        }
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'gen-id',
        ...fullNFT,
        created_at: new Date()
      }]);

      const result = await model.create(fullNFT);

      expect(result.metadata_uri).toBe('ipfs://QmFull/metadata.json');
      expect(result.metadata.name).toBe('Full NFT');
    });
  });

  describe('findById', () => {
    it('should return null when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await model.findById('nonexistent-id');

      expect(result).toBeNull();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'nonexistent-id' });
    });

    it('should return NFT when found', async () => {
      const existingNFT = {
        id: 'existing-id',
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana'
      };

      mockQueryBuilder.first.mockResolvedValue(existingNFT);

      const result = await model.findById('existing-id');

      expect(result).toEqual(existingNFT);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'existing-id' });
    });
  });

  describe('findByTokenId', () => {
    it('should require both tokenId and contractAddress', async () => {
      const nft = {
        id: 'nft-id',
        token_id: 'specific-token',
        contract_address: 'specific-contract',
        owner_address: 'owner',
        blockchain: 'solana'
      };

      mockQueryBuilder.first.mockResolvedValue(nft);

      const result = await model.findByTokenId('specific-token', 'specific-contract');

      expect(result).toEqual(nft);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        token_id: 'specific-token',
        contract_address: 'specific-contract'
      });
    });

    it('should return undefined when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await model.findByTokenId('unknown-token', 'unknown-contract');

      expect(result).toBeUndefined();
    });
  });

  describe('findByOwner', () => {
    it('should return array of NFTs', async () => {
      const ownerNFTs = [
        {
          id: 'nft-1',
          token_id: 'token-1',
          contract_address: 'contract-1',
          owner_address: 'owner-wallet',
          blockchain: 'solana',
          created_at: new Date('2024-06-01')
        },
        {
          id: 'nft-2',
          token_id: 'token-2',
          contract_address: 'contract-2',
          owner_address: 'owner-wallet',
          blockchain: 'solana',
          created_at: new Date('2024-05-01')
        }
      ];

      mockQueryBuilder.orderBy.mockResolvedValue(ownerNFTs);

      const result = await model.findByOwner('owner-wallet');

      expect(result).toEqual(ownerNFTs);
      expect(result).toHaveLength(2);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        owner_address: 'owner-wallet' 
      });
    });

    it('should order by created_at DESC', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await model.findByOwner('owner-wallet');

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should return empty array when owner has no NFTs', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      const result = await model.findByOwner('owner-with-no-nfts');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should set updated_at', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'nft-id',
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'new-owner',
        blockchain: 'solana',
        updated_at: new Date()
      }]);

      await model.update('nft-id', { owner_address: 'new-owner' });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });

    it('should use RETURNING clause', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'nft-id',
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana'
      }]);

      await model.update('nft-id', { owner_address: 'new-owner' });

      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
    });

    it('should return null when NFT not found', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await model.update('nonexistent', { owner_address: 'new-owner' });

      expect(result).toBeNull();
    });

    it('should update multiple fields', async () => {
      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'nft-id',
        token_id: 'token-123',
        contract_address: 'addr',
        owner_address: 'new-owner',
        metadata_uri: 'ipfs://new-uri',
        blockchain: 'solana'
      }]);

      await model.update('nft-id', {
        owner_address: 'new-owner',
        metadata_uri: 'ipfs://new-uri',
        metadata: { name: 'Updated NFT' }
      });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.owner_address).toBe('new-owner');
      expect(updateCall.metadata_uri).toBe('ipfs://new-uri');
      expect(updateCall.metadata).toEqual({ name: 'Updated NFT' });
    });
  });

  describe('delete', () => {
    it('should return boolean', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      const result = await model.delete('nft-id');

      expect(result).toBe(true);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'nft-id' });
      expect(mockQueryBuilder.del).toHaveBeenCalled();
    });

    it('should return false if NFT not found', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await model.delete('nonexistent-id');

      expect(result).toBe(false);
    });
  });
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('NFTModel Constructor', () => {
  it('should accept custom db instance', () => {
    const customDb = createMockKnex();
    const model = new NFTModel(customDb);
    
    expect(model).toBeDefined();
  });

  it('should use default db when not provided', () => {
    // In tests, we always provide a mock to avoid real DB connections
    // This test just ensures the constructor doesn't throw without args
    expect(() => new NFTModel()).not.toThrow();
  });
});

// =============================================================================
// Edge Cases & Additional Tests
// =============================================================================

describe('NFTModel Edge Cases', () => {
  let model: NFTModel;
  let mockKnex: Knex;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    mockQueryBuilder = (mockKnex as any).__queryBuilder;
    model = new NFTModel(mockKnex);
  });

  it('should handle Solana-specific long addresses', async () => {
    const solanaAddresses = {
      token_id: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      contract_address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      owner_address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      blockchain: 'solana'
    };

    const nft: INFT = {
      ...solanaAddresses
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...nft
    }]);

    const result = await model.create(nft);

    expect(result.contract_address).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(result.owner_address).toBe('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  });

  it('should handle complex metadata with attributes', async () => {
    const complexMetadata = {
      name: 'Event Ticket #1234',
      description: 'VIP Access Pass for Tech Conference 2024',
      image: 'ipfs://QmTicketImage/1234.png',
      external_url: 'https://tickettoken.com/ticket/1234',
      animation_url: 'ipfs://QmAnimated/1234.mp4',
      attributes: [
        { trait_type: 'Event', value: 'Tech Conference 2024' },
        { trait_type: 'Tier', value: 'VIP' },
        { trait_type: 'Section', value: 'A' },
        { trait_type: 'Row', value: '1' },
        { trait_type: 'Seat', value: '15' },
        { trait_type: 'Valid Until', value: '2024-12-31', display_type: 'date' }
      ],
      properties: {
        category: 'ticket',
        files: [
          { uri: 'ipfs://QmTicketImage/1234.png', type: 'image/png' }
        ]
      }
    };

    const nft: INFT = {
      token_id: 'ticket-1234',
      contract_address: 'ticketContractAddr',
      owner_address: 'userWallet',
      blockchain: 'solana',
      metadata_uri: 'ipfs://QmMetadata/1234.json',
      metadata: complexMetadata
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...nft
    }]);

    const result = await model.create(nft);

    expect(result.metadata.attributes).toHaveLength(6);
    expect(result.metadata.properties.files).toHaveLength(1);
  });

  it('should handle empty metadata object', async () => {
    const nft: INFT = {
      token_id: 'token-1',
      contract_address: 'addr',
      owner_address: 'owner',
      blockchain: 'solana',
      metadata: {}
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...nft
    }]);

    const result = await model.create(nft);

    expect(result.metadata).toEqual({});
  });

  it('should handle null metadata_uri', async () => {
    const nft: INFT = {
      token_id: 'token-1',
      contract_address: 'addr',
      owner_address: 'owner',
      blockchain: 'solana',
      metadata_uri: undefined
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...nft
    }]);

    const result = await model.create(nft);

    expect(result.metadata_uri).toBeUndefined();
  });

  it('should handle ownership transfer update', async () => {
    const originalOwner = 'originalOwnerWallet123';
    const newOwner = 'newOwnerWallet456';

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'nft-id',
      token_id: 'token-123',
      contract_address: 'addr',
      owner_address: newOwner,
      blockchain: 'solana',
      updated_at: new Date()
    }]);

    const result = await model.update('nft-id', { owner_address: newOwner });

    expect(result?.owner_address).toBe(newOwner);
    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall.owner_address).toBe(newOwner);
  });

  it('should handle different blockchain types', async () => {
    const ethereumNFT: INFT = {
      token_id: '12345',
      contract_address: '0x1234567890abcdef1234567890abcdef12345678',
      owner_address: '0xabcdef1234567890abcdef1234567890abcdef12',
      blockchain: 'ethereum'
    };

    mockQueryBuilder.returning.mockResolvedValue([{
      id: 'gen-id',
      ...ethereumNFT
    }]);

    const result = await model.create(ethereumNFT);

    expect(result.blockchain).toBe('ethereum');
  });

  it('should find multiple NFTs by same owner from different contracts', async () => {
    const multiContractNFTs = [
      {
        id: 'nft-1',
        token_id: 'token-a',
        contract_address: 'contract-1',
        owner_address: 'shared-owner',
        blockchain: 'solana'
      },
      {
        id: 'nft-2',
        token_id: 'token-b',
        contract_address: 'contract-2',
        owner_address: 'shared-owner',
        blockchain: 'solana'
      },
      {
        id: 'nft-3',
        token_id: 'token-c',
        contract_address: 'contract-1',
        owner_address: 'shared-owner',
        blockchain: 'solana'
      }
    ];

    mockQueryBuilder.orderBy.mockResolvedValue(multiContractNFTs);

    const result = await model.findByOwner('shared-owner');

    expect(result).toHaveLength(3);
    // Verify there are NFTs from multiple contracts
    const contracts = new Set(result.map(nft => nft.contract_address));
    expect(contracts.size).toBe(2);
  });

  it('should handle metadata URI with different protocols', async () => {
    const uriProtocols = [
      'ipfs://QmExample123',
      'https://arweave.net/example123',
      'ar://example123',
      'https://metadata.example.com/token/123'
    ];

    for (const uri of uriProtocols) {
      const nft: INFT = {
        token_id: 'token-1',
        contract_address: 'addr',
        owner_address: 'owner',
        blockchain: 'solana',
        metadata_uri: uri
      };

      mockQueryBuilder.returning.mockResolvedValue([{
        id: 'gen-id',
        ...nft
      }]);

      const result = await model.create(nft);

      expect(result.metadata_uri).toBe(uri);
    }
  });

  it('should preserve all data through update cycle', async () => {
    const originalNFT = {
      id: 'nft-id',
      token_id: 'token-123',
      contract_address: 'addr',
      owner_address: 'original-owner',
      blockchain: 'solana',
      metadata_uri: 'ipfs://original',
      metadata: { name: 'Original Name' }
    };

    // Simulate update that only changes metadata
    mockQueryBuilder.returning.mockResolvedValue([{
      ...originalNFT,
      metadata: { name: 'Updated Name' },
      updated_at: new Date()
    }]);

    await model.update('nft-id', { metadata: { name: 'Updated Name' } });

    // Verify only metadata was in the update call
    const updateCall = mockQueryBuilder.update.mock.calls[0][0];
    expect(updateCall.metadata).toEqual({ name: 'Updated Name' });
    expect(updateCall.updated_at).toBeDefined();
    // Other fields should not be in the update
    expect(updateCall.token_id).toBeUndefined();
    expect(updateCall.contract_address).toBeUndefined();
  });
});
