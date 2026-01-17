/**
 * Unit Tests for NFTService
 * 
 * Tests:
 * - NFT transfer operations
 * - NFT metadata retrieval
 * - Ownership verification
 * - NFT existence checks
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/config/solana.config');
jest.mock('../../../src/utils/logger');

describe('NFTService', () => {
  let NFTService: any;
  let nftService: any;
  let mockMetaplex: any;
  let mockNfts: any;
  let mockPublicKey: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Create mock PublicKey class
    mockPublicKey = jest.fn((key: string) => ({
      toBase58: () => key,
      toString: () => key,
      _key: key
    }));

    // Mock @solana/web3.js module
    jest.doMock('@solana/web3.js', () => ({
      PublicKey: mockPublicKey
    }));

    // Mock NFT operations
    mockNfts = {
      findByMint: jest.fn(),
      transfer: jest.fn()
    };

    mockMetaplex = {
      nfts: jest.fn(() => mockNfts),
      connection: {
        getTokenAccountsByOwner: jest.fn()
      }
    };

    // Mock solana config
    const solanaConfig = require('../../../src/config/solana.config');
    solanaConfig.solanaConfig = { metaplex: mockMetaplex };
    solanaConfig.getExplorerUrl = jest.fn((sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

    // Import service after mocks
    const serviceModule = require('../../../src/services/nft.service');
    NFTService = serviceModule.NFTService;
    nftService = new NFTService();
  });

  describe('transferNFT()', () => {
    it('should successfully transfer NFT', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockNfts.transfer.mockResolvedValue({
        response: { signature: 'signature123' }
      });

      const result = await nftService.transferNFT({
        mintAddress: 'mint123',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(result.success).toBe(true);
      expect(result.signature).toBe('signature123');
      expect(result.explorerUrl).toContain('signature123');
      expect(mockNfts.findByMint).toHaveBeenCalled();
      expect(mockNfts.transfer).toHaveBeenCalled();
    });

    it('should return error when NFT not found', async () => {
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.transferNFT({
        mintAddress: 'mint123',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NFT not found');
      expect(result.signature).toBe('');
      expect(result.explorerUrl).toBe('');
    });

    it('should handle transfer errors', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockNfts.transfer.mockRejectedValue(new Error('Transfer failed'));

      const result = await nftService.transferNFT({
        mintAddress: 'mint123',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transfer failed');
    });

    it('should create PublicKey objects for all addresses', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockNfts.transfer.mockResolvedValue({
        response: { signature: 'sig123' }
      });

      await nftService.transferNFT({
        mintAddress: 'mint123',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(mockPublicKey).toHaveBeenCalledWith('mint123');
      expect(mockPublicKey).toHaveBeenCalledWith('from123');
      expect(mockPublicKey).toHaveBeenCalledWith('to123');
    });

    it('should call metaplex transfer with correct parameters', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockNfts.transfer.mockResolvedValue({
        response: { signature: 'sig123' }
      });

      await nftService.transferNFT({
        mintAddress: 'mint123',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(mockNfts.transfer).toHaveBeenCalledWith({
        nftOrSft: mockNft,
        fromOwner: expect.anything(),
        toOwner: expect.anything()
      });
    });

    it('should handle invalid public key format', async () => {
      mockPublicKey.mockImplementation(() => {
        throw new Error('Invalid public key');
      });

      const result = await nftService.transferNFT({
        mintAddress: 'invalid',
        fromWallet: 'from123',
        toWallet: 'to123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid public key');
    });
  });

  describe('getNFTMetadata()', () => {
    it('should return NFT metadata when found', async () => {
      const mockNft = {
        address: { toBase58: () => 'nft-address' },
        name: 'Test NFT',
        symbol: 'TEST'
      };
      mockNfts.findByMint.mockResolvedValue(mockNft);

      const result = await nftService.getNFTMetadata('mint123');

      expect(result).toEqual(mockNft);
      expect(mockNfts.findByMint).toHaveBeenCalled();
    });

    it('should return null when NFT not found', async () => {
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.getNFTMetadata('mint123');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockNfts.findByMint.mockRejectedValue(new Error('Network error'));

      const result = await nftService.getNFTMetadata('mint123');

      expect(result).toBeNull();
    });

    it('should create PublicKey from mint address', async () => {
      mockNfts.findByMint.mockResolvedValue({});

      await nftService.getNFTMetadata('mint123');

      expect(mockPublicKey).toHaveBeenCalledWith('mint123');
    });
  });

  describe('verifyOwnership()', () => {
    it('should return true when wallet owns NFT', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockMetaplex.connection.getTokenAccountsByOwner.mockResolvedValue({
        value: [{ account: {} }] // Has token accounts
      });

      const result = await nftService.verifyOwnership('mint123', 'wallet123');

      expect(result).toBe(true);
      expect(mockMetaplex.connection.getTokenAccountsByOwner).toHaveBeenCalled();
    });

    it('should return false when wallet does not own NFT', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockMetaplex.connection.getTokenAccountsByOwner.mockResolvedValue({
        value: [] // No token accounts
      });

      const result = await nftService.verifyOwnership('mint123', 'wallet123');

      expect(result).toBe(false);
    });

    it('should return false when NFT not found', async () => {
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.verifyOwnership('mint123', 'wallet123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockNfts.findByMint.mockRejectedValue(new Error('Network error'));

      const result = await nftService.verifyOwnership('mint123', 'wallet123');

      expect(result).toBe(false);
    });

    it('should check token accounts with correct parameters', async () => {
      const mockNft = { address: { toBase58: () => 'nft-address' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockMetaplex.connection.getTokenAccountsByOwner.mockResolvedValue({
        value: [{}]
      });

      await nftService.verifyOwnership('mint123', 'wallet123');

      expect(mockMetaplex.connection.getTokenAccountsByOwner).toHaveBeenCalledWith(
        expect.anything(), // wallet PublicKey
        { mint: expect.anything() } // mint PublicKey
      );
    });
  });

  describe('getNFTOwner()', () => {
    it('should return owner address when NFT found', async () => {
      const mockNft = {
        address: {
          toBase58: () => 'owner-address-123'
        }
      };
      mockNfts.findByMint.mockResolvedValue(mockNft);

      const result = await nftService.getNFTOwner('mint123');

      expect(result).toBe('owner-address-123');
    });

    it('should return null when NFT not found', async () => {
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.getNFTOwner('mint123');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockNfts.findByMint.mockRejectedValue(new Error('Network error'));

      const result = await nftService.getNFTOwner('mint123');

      expect(result).toBeNull();
    });

    it('should call findByMint with correct parameters', async () => {
      mockNfts.findByMint.mockResolvedValue({
        address: { toBase58: () => 'owner' }
      });

      await nftService.getNFTOwner('mint123');

      expect(mockNfts.findByMint).toHaveBeenCalledWith({
        mintAddress: expect.anything()
      });
    });
  });

  describe('nftExists()', () => {
    it('should return true when NFT exists', async () => {
      mockNfts.findByMint.mockResolvedValue({
        address: { toBase58: () => 'nft-address' }
      });

      const result = await nftService.nftExists('mint123');

      expect(result).toBe(true);
    });

    it('should return false when NFT not found', async () => {
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.nftExists('mint123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockNfts.findByMint.mockRejectedValue(new Error('Network error'));

      const result = await nftService.nftExists('mint123');

      expect(result).toBe(false);
    });

    it('should handle invalid mint address', async () => {
      mockPublicKey.mockImplementation(() => {
        throw new Error('Invalid public key');
      });

      const result = await nftService.nftExists('invalid');

      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string addresses', async () => {
      const result = await nftService.transferNFT({
        mintAddress: '',
        fromWallet: '',
        toWallet: ''
      });

      expect(result.success).toBe(false);
    });

    it('should handle whitespace in addresses', async () => {
      const mockNft = { address: { toBase58: () => 'nft' } };
      mockNfts.findByMint.mockResolvedValue(mockNft);
      mockNfts.transfer.mockResolvedValue({
        response: { signature: 'sig' }
      });

      const result = await nftService.transferNFT({
        mintAddress: '  mint123  ',
        fromWallet: '  from123  ',
        toWallet: '  to123  '
      });

      // PublicKey constructor should receive the strings as-is
      expect(mockPublicKey).toHaveBeenCalledWith('  mint123  ');
    });

    it('should handle multiple concurrent NFT operations', async () => {
      mockNfts.findByMint.mockResolvedValue({
        address: { toBase58: () => 'nft' }
      });

      const promises = [
        nftService.nftExists('mint1'),
        nftService.nftExists('mint2'),
        nftService.nftExists('mint3')
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([true, true, true]);
      expect(mockNfts.findByMint).toHaveBeenCalledTimes(3);
    });

    it('should handle very long addresses', async () => {
      const longAddress = 'a'.repeat(1000);
      mockNfts.findByMint.mockResolvedValue(null);

      const result = await nftService.nftExists(longAddress);

      expect(result).toBe(false);
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', () => {
      const serviceModule = require('../../../src/services/nft.service');
      
      expect(serviceModule.nftService).toBeDefined();
      expect(serviceModule.nftService).toBeInstanceOf(NFTService);
    });
  });
});
