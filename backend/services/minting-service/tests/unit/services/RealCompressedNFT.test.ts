/**
 * Unit tests for RealCompressedNFT service
 * Tests compressed NFT minting using Metaplex Bubblegum protocol
 */

import { RealCompressedNFT } from '../../../src/services/RealCompressedNFT';

// Mock dependencies
jest.mock('@metaplex-foundation/umi-bundle-defaults', () => ({
  createUmi: jest.fn(() => ({
    use: jest.fn().mockReturnThis(),
    eddsa: {
      createKeypairFromSecretKey: jest.fn(() => ({
        publicKey: 'mockPublicKey123456789',
        secretKey: new Uint8Array(64)
      }))
    }
  }))
}));

jest.mock('@metaplex-foundation/umi', () => ({
  createSignerFromKeypair: jest.fn(() => ({
    publicKey: { toString: () => 'mockSignerPublicKey123' }
  })),
  publicKey: jest.fn((addr) => addr),
  signerIdentity: jest.fn()
}));

jest.mock('@metaplex-foundation/mpl-bubblegum', () => ({
  mintToCollectionV1: jest.fn(() => ({
    sendAndConfirm: jest.fn().mockResolvedValue({
      signature: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })),
  mplBubblegum: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import fs from 'fs';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintToCollectionV1 } from '@metaplex-foundation/mpl-bubblegum';
import logger from '../../../src/utils/logger';

describe('RealCompressedNFT', () => {
  let service: RealCompressedNFT;
  const mockFs = fs as jest.Mocked<typeof fs>;

  const mockMerkleTreeConfig = {
    merkleTree: 'TreeAddress123456789012345678901234567890',
    treeAuthority: 'AuthorityAddress1234567890123456789012',
    maxDepth: 14,
    maxBufferSize: 64
  };

  const mockCollectionConfig = {
    collectionMint: 'CollectionMint12345678901234567890123',
    metadataUri: 'https://api.tickettoken.io/collection/metadata'
  };

  const mockWalletData = JSON.stringify(Array(64).fill(1));

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RealCompressedNFT();

    // Default mock setup for successful initialization
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('wallet') || path.includes('devnet-wallet')) return true;
      if (path.includes('merkle-tree-config')) return true;
      if (path.includes('collection-config')) return true;
      return false;
    });

    mockFs.readFileSync.mockImplementation((path: any) => {
      if (path.includes('wallet') || path.includes('devnet-wallet')) {
        return mockWalletData;
      }
      if (path.includes('merkle-tree-config')) {
        return JSON.stringify(mockMerkleTreeConfig);
      }
      if (path.includes('collection-config')) {
        return JSON.stringify(mockCollectionConfig);
      }
      return '';
    });
  });

  describe('getMerkleTreeAddress', () => {
    it('should return null when not initialized', () => {
      expect(service.getMerkleTreeAddress()).toBeNull();
    });

    it('should return address when initialized', async () => {
      await service.initialize();
      expect(service.getMerkleTreeAddress()).toBe(mockMerkleTreeConfig.merkleTree);
    });
  });

  describe('getCollectionAddress', () => {
    it('should return null when not initialized', () => {
      expect(service.getCollectionAddress()).toBeNull();
    });

    it('should return address when initialized', async () => {
      await service.initialize();
      expect(service.getCollectionAddress()).toBe(mockCollectionConfig.collectionMint);
    });
  });

  describe('initialize', () => {
    it('should create Umi instance', async () => {
      await service.initialize();
      
      expect(createUmi).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Real Compressed NFT service initialized (Umi)');
    });

    it('should load wallet from file', async () => {
      await service.initialize();
      
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should throw if wallet file is missing', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('wallet') || path.includes('devnet-wallet')) return false;
        return true;
      });

      await expect(service.initialize()).rejects.toThrow('Wallet not found');
    });

    it('should load merkle tree config', async () => {
      await service.initialize();
      
      expect(service.getMerkleTreeAddress()).toBe(mockMerkleTreeConfig.merkleTree);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Merkle Tree:'));
    });

    it('should throw if merkle tree config is missing', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('merkle-tree-config')) return false;
        return true;
      });

      await expect(service.initialize()).rejects.toThrow('Merkle tree config not found');
    });

    it('should load collection config', async () => {
      await service.initialize();
      
      expect(service.getCollectionAddress()).toBe(mockCollectionConfig.collectionMint);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Collection:'));
    });

    it('should throw if collection config is missing', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('collection-config')) return false;
        return true;
      });

      await expect(service.initialize()).rejects.toThrow('Collection config not found');
    });

    it('should use SOLANA_RPC_URL from env', async () => {
      const originalEnv = process.env.SOLANA_RPC_URL;
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.example.com';

      await service.initialize();

      expect(createUmi).toHaveBeenCalledWith('https://custom-rpc.example.com');

      process.env.SOLANA_RPC_URL = originalEnv;
    });

    it('should default to devnet URL when SOLANA_RPC_URL not set', async () => {
      const originalEnv = process.env.SOLANA_RPC_URL;
      delete process.env.SOLANA_RPC_URL;

      await service.initialize();

      expect(createUmi).toHaveBeenCalledWith('https://api.devnet.solana.com');

      process.env.SOLANA_RPC_URL = originalEnv;
    });
  });

  describe('mintNFT', () => {
    const mockTicketData = {
      ticketId: 'ticket-123',
      ownerAddress: 'OwnerWalletAddress123456789012345678901234',
      metadata: {
        name: 'Concert Ticket #123',
        uri: 'https://api.tickettoken.io/metadata/ticket-123'
      }
    };

    it('should throw if not initialized', async () => {
      await expect(service.mintNFT(mockTicketData)).rejects.toThrow(
        'RealCompressedNFT not initialized. Call initialize() first.'
      );
    });

    it('should use ownerAddress as leafOwner', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          leafOwner: mockTicketData.ownerAddress
        })
      );
    });

    it('should use wallet publicKey when ownerAddress not provided', async () => {
      await service.initialize();
      const ticketWithoutOwner = {
        ticketId: 'ticket-456',
        metadata: {
          name: 'Concert Ticket #456'
        }
      };

      await service.mintNFT(ticketWithoutOwner);

      expect(mintToCollectionV1).toHaveBeenCalled();
    });

    it('should return success with signature and tree', async () => {
      await service.initialize();
      const result = await service.mintNFT(mockTicketData);

      expect(result.success).toBe(true);
      expect(result.signature).toBeDefined();
      expect(result.merkleTree).toBe(mockMerkleTreeConfig.merkleTree);
      expect(result.ticketId).toBe(mockTicketData.ticketId);
    });

    it('should use metadata name if provided', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: mockTicketData.metadata.name
          })
        })
      );
    });

    it('should use default name format if metadata name not provided', async () => {
      await service.initialize();
      const ticketWithoutName = {
        ticketId: 'ticket-789',
        ownerAddress: 'OwnerWalletAddress123456789012345678901234',
        metadata: {}
      };

      await service.mintNFT(ticketWithoutName);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: 'Ticket #ticket-789'
          })
        })
      );
    });

    it('should use metadata uri if provided', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            uri: mockTicketData.metadata.uri
          })
        })
      );
    });

    it('should use default uri format if metadata uri not provided', async () => {
      await service.initialize();
      const ticketWithoutUri = {
        ticketId: 'ticket-999',
        ownerAddress: 'OwnerWalletAddress123456789012345678901234',
        metadata: {}
      };

      await service.mintNFT(ticketWithoutUri);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            uri: 'https://api.tickettoken.io/metadata/ticket-999'
          })
        })
      );
    });

    it('should set symbol to TCKT', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            symbol: 'TCKT'
          })
        })
      );
    });

    it('should set sellerFeeBasisPoints to 500 (5%)', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            sellerFeeBasisPoints: 500
          })
        })
      );
    });

    it('should use merkle tree address', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          merkleTree: mockMerkleTreeConfig.merkleTree
        })
      );
    });

    it('should use collection mint address', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(mintToCollectionV1).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          collectionMint: mockCollectionConfig.collectionMint
        })
      );
    });

    it('should log success on successful mint', async () => {
      await service.initialize();
      await service.mintNFT(mockTicketData);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Minting compressed NFT'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Compressed NFT minted'));
    });

    it('should log error and throw on mint failure', async () => {
      const mockError = new Error('Mint transaction failed');
      (mintToCollectionV1 as jest.Mock).mockReturnValueOnce({
        sendAndConfirm: jest.fn().mockRejectedValue(mockError)
      });

      await service.initialize();

      await expect(service.mintNFT(mockTicketData)).rejects.toThrow('Mint transaction failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to mint compressed NFT'),
        expect.objectContaining({
          error: 'Mint transaction failed'
        })
      );
    });

    it('should include error logs in error context', async () => {
      const mockError = new Error('Transaction simulation failed');
      (mockError as any).logs = ['Log line 1', 'Log line 2'];
      (mintToCollectionV1 as jest.Mock).mockReturnValueOnce({
        sendAndConfirm: jest.fn().mockRejectedValue(mockError)
      });

      await service.initialize();

      await expect(service.mintNFT(mockTicketData)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          logs: ['Log line 1', 'Log line 2']
        })
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple mints after single initialization', async () => {
      await service.initialize();

      const ticket1 = { ticketId: 'ticket-1', metadata: {} };
      const ticket2 = { ticketId: 'ticket-2', metadata: {} };
      const ticket3 = { ticketId: 'ticket-3', metadata: {} };

      const result1 = await service.mintNFT(ticket1);
      const result2 = await service.mintNFT(ticket2);
      const result3 = await service.mintNFT(ticket3);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });

    it('should maintain state between calls', async () => {
      await service.initialize();

      const treeAddress1 = service.getMerkleTreeAddress();
      await service.mintNFT({ ticketId: 'test', metadata: {} });
      const treeAddress2 = service.getMerkleTreeAddress();

      expect(treeAddress1).toBe(treeAddress2);
    });
  });
});
