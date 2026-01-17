// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Solana and Metaplex
const mockUploadMetadata = jest.fn();
const mockCreate = jest.fn();
const mockTransfer = jest.fn();
const mockFindByMint = jest.fn();

const mockMetaplex = {
  nfts: jest.fn().mockReturnValue({
    uploadMetadata: mockUploadMetadata,
    create: mockCreate,
    transfer: mockTransfer,
    findByMint: mockFindByMint,
  }),
};

const mockGetBalance = jest.fn();
const mockConnection = {
  getBalance: mockGetBalance,
};

const mockWallet = {
  publicKey: {
    toBase58: jest.fn().mockReturnValue('WalletPublicKey123'),
  },
};

const mockSolanaConfig = {
  network: 'devnet',
  walletPublicKey: 'WalletPublicKey123',
  rpcUrl: 'https://api.devnet.solana.com',
  isDevnet: true,
  isMainnet: false,
};

jest.mock('../../../src/config/solana.config', () => ({
  metaplex: mockMetaplex,
  connection: mockConnection,
  wallet: mockWallet,
  solanaConfig: mockSolanaConfig,
}));

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((address) => {
    if (address === 'invalid-address') {
      throw new Error('Invalid public key input');
    }
    return {
      toBase58: () => address,
    };
  }),
}));

import { NFTService, MintNFTRequest } from '../../../src/services/nft.service';
import { logger } from '../../../src/utils/logger';

describe('NFTService', () => {
  let service: NFTService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NFTService();

    // Default mock implementations
    mockUploadMetadata.mockResolvedValue({ uri: 'https://arweave.net/metadata123' });
    mockCreate.mockResolvedValue({
      nft: {
        address: { toBase58: () => 'MintAddress123' },
        token: { address: { toBase58: () => 'TokenAddress456' } },
      },
    });
    mockFindByMint.mockResolvedValue({
      address: { toBase58: () => 'MintAddress123' },
      token: { ownerAddress: { toBase58: () => 'OwnerAddress789' } },
    });
    mockTransfer.mockResolvedValue({
      response: { signature: 'TransactionSignature123' },
    });
    mockGetBalance.mockResolvedValue(5000000000); // 5 SOL in lamports
  });

  describe('mintNFT', () => {
    const validRequest: MintNFTRequest = {
      recipientAddress: 'RecipientAddress123',
      metadata: {
        name: 'Test NFT',
        symbol: 'TNFT',
        description: 'A test NFT',
        image: 'https://example.com/image.png',
        attributes: [
          { trait_type: 'Event', value: 'Concert' },
          { trait_type: 'Seat', value: 'A1' },
        ],
      },
      sellerFeeBasisPoints: 500,
      isMutable: true,
    };

    it('should mint NFT successfully', async () => {
      const result = await service.mintNFT(validRequest);

      expect(result.success).toBe(true);
      expect(result.mintAddress).toBe('MintAddress123');
      expect(result.tokenAddress).toBe('TokenAddress456');
      expect(result.metadataUri).toBe('https://arweave.net/metadata123');
      expect(result.explorerUrl).toContain('MintAddress123');
    });

    it('should upload metadata to Arweave/IPFS', async () => {
      await service.mintNFT(validRequest);

      expect(mockUploadMetadata).toHaveBeenCalledWith({
        name: 'Test NFT',
        symbol: 'TNFT',
        description: 'A test NFT',
        image: 'https://example.com/image.png',
        attributes: [
          { trait_type: 'Event', value: 'Concert' },
          { trait_type: 'Seat', value: 'A1' },
        ],
        external_url: undefined,
        animation_url: undefined,
        properties: undefined,
      });
    });

    it('should create NFT with correct parameters', async () => {
      await service.mintNFT(validRequest);

      expect(mockCreate).toHaveBeenCalledWith({
        uri: 'https://arweave.net/metadata123',
        name: 'Test NFT',
        symbol: 'TNFT',
        sellerFeeBasisPoints: 500,
        isMutable: true,
        maxSupply: null,
        tokenOwner: expect.any(Object),
      });
    });

    it('should use default seller fee of 0 when not provided', async () => {
      const requestWithoutFee = {
        ...validRequest,
        sellerFeeBasisPoints: undefined,
      };

      await service.mintNFT(requestWithoutFee);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerFeeBasisPoints: 0,
        })
      );
    });

    it('should default isMutable to true when not provided', async () => {
      const requestWithoutMutable = {
        ...validRequest,
        isMutable: undefined,
      };

      await service.mintNFT(requestWithoutMutable);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          isMutable: true,
        })
      );
    });

    it('should return error for invalid recipient address', async () => {
      const invalidRequest = {
        ...validRequest,
        recipientAddress: 'invalid-address',
      };

      const result = await service.mintNFT(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipient address');
    });

    it('should log minting progress', async () => {
      await service.mintNFT(validRequest);

      expect(logger.info).toHaveBeenCalledWith('Starting NFT mint', {
        recipient: 'RecipientAddress123',
        name: 'Test NFT',
        symbol: 'TNFT',
      });
      expect(logger.info).toHaveBeenCalledWith('Uploading NFT metadata');
      expect(logger.info).toHaveBeenCalledWith('Metadata uploaded', {
        uri: 'https://arweave.net/metadata123',
      });
      expect(logger.info).toHaveBeenCalledWith('Creating NFT on-chain');
      expect(logger.info).toHaveBeenCalledWith('NFT minted successfully', expect.any(Object));
    });

    it('should handle metadata upload failure', async () => {
      mockUploadMetadata.mockRejectedValue(new Error('Arweave upload failed'));

      const result = await service.mintNFT(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Arweave upload failed');
      expect(logger.error).toHaveBeenCalledWith('NFT minting failed', expect.any(Object));
    });

    it('should handle NFT creation failure', async () => {
      mockCreate.mockRejectedValue(new Error('Insufficient SOL'));

      const result = await service.mintNFT(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient SOL');
    });

    it('should convert numeric attributes to strings', async () => {
      const requestWithNumericAttr: MintNFTRequest = {
        ...validRequest,
        metadata: {
          ...validRequest.metadata,
          attributes: [
            { trait_type: 'Row', value: 5 },
          ],
        },
      };

      await service.mintNFT(requestWithNumericAttr);

      expect(mockUploadMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: [{ trait_type: 'Row', value: '5' }],
        })
      );
    });

    it('should handle empty attributes', async () => {
      const requestWithoutAttrs: MintNFTRequest = {
        ...validRequest,
        metadata: {
          ...validRequest.metadata,
          attributes: undefined,
        },
      };

      await service.mintNFT(requestWithoutAttrs);

      expect(mockUploadMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: [],
        })
      );
    });

    it('should include optional metadata fields when provided', async () => {
      const requestWithOptionals: MintNFTRequest = {
        ...validRequest,
        metadata: {
          ...validRequest.metadata,
          externalUrl: 'https://tickettoken.com/ticket/123',
          animationUrl: 'https://example.com/animation.mp4',
          properties: {
            files: [{ uri: 'https://example.com/file.pdf', type: 'application/pdf' }],
            category: 'ticket',
          },
        },
      };

      await service.mintNFT(requestWithOptionals);

      expect(mockUploadMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          external_url: 'https://tickettoken.com/ticket/123',
          animation_url: 'https://example.com/animation.mp4',
          properties: {
            files: [{ uri: 'https://example.com/file.pdf', type: 'application/pdf' }],
            category: 'ticket',
          },
        })
      );
    });
  });

  describe('transferNFT', () => {
    it('should transfer NFT successfully', async () => {
      const result = await service.transferNFT('MintAddress123', 'NewOwnerAddress');

      expect(result.success).toBe(true);
      expect(result.signature).toBe('TransactionSignature123');
    });

    it('should find NFT by mint address before transfer', async () => {
      await service.transferNFT('MintAddress123', 'NewOwnerAddress');

      expect(mockFindByMint).toHaveBeenCalledWith({
        mintAddress: expect.any(Object),
      });
    });

    it('should call transfer with correct parameters', async () => {
      await service.transferNFT('MintAddress123', 'NewOwnerAddress');

      expect(mockTransfer).toHaveBeenCalledWith({
        nftOrSft: expect.any(Object),
        toOwner: expect.any(Object),
      });
    });

    it('should log transfer progress', async () => {
      await service.transferNFT('MintAddress123', 'NewOwnerAddress');

      expect(logger.info).toHaveBeenCalledWith('Transferring NFT', {
        mintAddress: 'MintAddress123',
        recipient: 'NewOwnerAddress',
      });
      expect(logger.info).toHaveBeenCalledWith('NFT transferred successfully', {
        signature: 'TransactionSignature123',
      });
    });

    it('should handle transfer failure', async () => {
      mockTransfer.mockRejectedValue(new Error('Transfer failed'));

      const result = await service.transferNFT('MintAddress123', 'NewOwnerAddress');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transfer failed');
      expect(logger.error).toHaveBeenCalledWith('NFT transfer failed', expect.any(Object));
    });

    it('should handle invalid mint address', async () => {
      const result = await service.transferNFT('invalid-address', 'NewOwnerAddress');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid public key');
    });
  });

  describe('getNFTMetadata', () => {
    it('should return NFT metadata', async () => {
      const result = await service.getNFTMetadata('MintAddress123');

      expect(result).toBeTruthy();
      expect(mockFindByMint).toHaveBeenCalled();
    });

    it('should return null when NFT not found', async () => {
      mockFindByMint.mockRejectedValue(new Error('NFT not found'));

      const result = await service.getNFTMetadata('NonexistentMint');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Failed to fetch NFT metadata', expect.any(Object));
    });
  });

  describe('verifyOwnership', () => {
    it('should return true when ownership matches', async () => {
      const result = await service.verifyOwnership('MintAddress123', 'OwnerAddress789');

      expect(result).toBe(true);
    });

    it('should return false when ownership does not match', async () => {
      const result = await service.verifyOwnership('MintAddress123', 'DifferentOwner');

      expect(result).toBe(false);
    });

    it('should return false when NFT not found', async () => {
      mockFindByMint.mockRejectedValue(new Error('NFT not found'));

      const result = await service.verifyOwnership('MintAddress123', 'AnyOwner');

      expect(result).toBe(false);
    });

    it('should log error when metadata fetch fails during verification', async () => {
      mockFindByMint.mockRejectedValue(new Error('Verification error'));

      await service.verifyOwnership('MintAddress123', 'Owner');

      // The error is logged in getNFTMetadata which is called by verifyOwnership
      expect(logger.error).toHaveBeenCalledWith('Failed to fetch NFT metadata', {
        mintAddress: 'MintAddress123',
        error: 'Verification error',
      });
    });
  });

  describe('getWalletBalance', () => {
    it('should return wallet balance in SOL', async () => {
      mockGetBalance.mockResolvedValue(5000000000); // 5 SOL in lamports

      const balance = await service.getWalletBalance();

      expect(balance).toBe(5);
    });

    it('should return 0 on error', async () => {
      mockGetBalance.mockRejectedValue(new Error('Connection error'));

      const balance = await service.getWalletBalance();

      expect(balance).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('Failed to get wallet balance', {
        error: 'Connection error',
      });
    });

    it('should handle zero balance', async () => {
      mockGetBalance.mockResolvedValue(0);

      const balance = await service.getWalletBalance();

      expect(balance).toBe(0);
    });

    it('should handle fractional SOL amounts', async () => {
      mockGetBalance.mockResolvedValue(1500000000); // 1.5 SOL

      const balance = await service.getWalletBalance();

      expect(balance).toBe(1.5);
    });
  });

  describe('getExplorerUrl', () => {
    it('should return devnet explorer URL', () => {
      const url = service.getExplorerUrl('MintAddress123');

      expect(url).toBe('https://explorer.solana.com/address/MintAddress123?cluster=devnet');
    });

    it('should return mainnet explorer URL when on mainnet', () => {
      // Temporarily modify config
      const originalIsMainnet = mockSolanaConfig.isMainnet;
      mockSolanaConfig.isMainnet = true;

      const url = service.getExplorerUrl('MintAddress123');

      expect(url).toBe('https://explorer.solana.com/address/MintAddress123');

      // Restore
      mockSolanaConfig.isMainnet = originalIsMainnet;
    });
  });

  describe('getConfig', () => {
    it('should return configuration info', () => {
      const config = service.getConfig();

      expect(config).toEqual({
        network: 'devnet',
        walletPublicKey: 'WalletPublicKey123',
        rpcUrl: 'https://api.devnet.solana.com',
        isDevnet: true,
        isMainnet: false,
      });
    });
  });
});
