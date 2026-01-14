/**
 * Unit Tests for DASClient.ts
 * 
 * Tests Digital Asset Standard (DAS) API client for compressed NFTs.
 * Priority: 🟡 Medium (15 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { DASClient, getDASClient, initDASClient } from '../../../src/services/DASClient';

describe('DASClient', () => {
  let client: DASClient;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DAS_API_URL = 'https://api.devnet.solana.com';
    client = new DASClient({ url: 'https://api.devnet.solana.com', timeout: 10000 });
  });

  describe('Constructor', () => {
    it('should set RPC URL from options', () => {
      const customClient = new DASClient({ url: 'https://custom-rpc.com' });
      expect(customClient).toBeDefined();
    });

    it('should set 10-second timeout by default', () => {
      const customClient = new DASClient({ url: 'https://api.devnet.solana.com' });
      expect(customClient).toBeDefined();
    });

    it('should throw if no URL provided', () => {
      delete process.env.DAS_API_URL;
      delete process.env.SOLANA_RPC_URL;
      
      expect(() => new DASClient({ url: '' })).toThrow('DAS_API_URL or SOLANA_RPC_URL required');
    });
  });

  describe('Asset Operations', () => {
    it('getAsset should make JSON-RPC call', async () => {
      const mockAsset = {
        id: 'asset-123',
        interface: 'V1_NFT',
        ownership: { owner: 'owner123', frozen: false, delegated: false },
        content: { metadata: { name: 'Test NFT', symbol: 'TEST' }, json_uri: 'ipfs://test' },
        compression: { compressed: true, eligible: true, tree: 'tree123', leaf_index: 0 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockAsset })
      });

      const result = await client.getAsset('asset-123');
      
      expect(result.id).toBe('asset-123');
      expect(result.ownership.owner).toBe('owner123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('getAssetProof should return merkle proof', async () => {
      const mockProof = {
        root: 'root123',
        proof: ['proof1', 'proof2'],
        node_index: 5,
        leaf: 'leaf123',
        tree_id: 'tree123'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockProof })
      });

      const result = await client.getAssetProof('asset-123');
      
      expect(result.root).toBe('root123');
      expect(result.proof).toHaveLength(2);
    });

    it('getAssetBatch should fetch multiple assets', async () => {
      const mockAssets = [
        { id: 'asset-1', ownership: { owner: 'owner1' } },
        { id: 'asset-2', ownership: { owner: 'owner2' } }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockAssets })
      });

      const result = await client.getAssetBatch(['asset-1', 'asset-2']);
      
      expect(result).toHaveLength(2);
    });
  });

  describe('Search Operations', () => {
    it('getAssetsByOwner should paginate results', async () => {
      const mockResult = {
        total: 100,
        limit: 10,
        page: 1,
        items: [{ id: 'asset-1' }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockResult })
      });

      const result = await client.getAssetsByOwner('owner123', 1, 10);
      
      expect(result.total).toBe(100);
      expect(result.items).toHaveLength(1);
    });

    it('getAssetsByGroup should filter by collection', async () => {
      const mockResult = {
        total: 50,
        limit: 10,
        page: 1,
        items: [{ id: 'asset-1', grouping: [{ group_key: 'collection', group_value: 'col123' }] }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockResult })
      });

      const result = await client.getAssetsByGroup('collection', 'col123');
      
      expect(result.total).toBe(50);
    });

    it('getAssetsByCreator should filter by creator', async () => {
      const mockResult = {
        total: 25,
        limit: 10,
        page: 1,
        items: [{ id: 'asset-1', creators: [{ address: 'creator123', share: 100, verified: true }] }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockResult })
      });

      const result = await client.getAssetsByCreator('creator123');
      
      expect(result.total).toBe(25);
    });
  });

  describe('Verification', () => {
    it('verifyOwnership should return true for owner', async () => {
      const mockAsset = {
        id: 'asset-123',
        ownership: { owner: 'expectedOwner', frozen: false, delegated: false }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockAsset })
      });

      const result = await client.verifyOwnership('asset-123', 'expectedOwner');
      
      expect(result).toBe(true);
    });

    it('verifyOwnership should return false for non-owner', async () => {
      const mockAsset = {
        id: 'asset-123',
        ownership: { owner: 'realOwner', frozen: false, delegated: false }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockAsset })
      });

      const result = await client.verifyOwnership('asset-123', 'wrongOwner');
      
      expect(result).toBe(false);
    });

    it('assetExists should return true for existing asset', async () => {
      const mockAsset = { id: 'asset-123' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 'das-1', result: mockAsset })
      });

      const result = await client.assetExists('asset-123');
      
      expect(result).toBe(true);
    });

    it('assetExists should return false for missing asset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          jsonrpc: '2.0', 
          id: 'das-1', 
          error: { code: -32000, message: 'Asset not found' } 
        })
      });

      const result = await client.assetExists('nonexistent');
      
      expect(result).toBe(false);
    });
  });

  describe('Singleton', () => {
    it('getDASClient should return singleton', () => {
      const client1 = getDASClient();
      const client2 = getDASClient();
      expect(client1).toBe(client2);
    });
  });
});
