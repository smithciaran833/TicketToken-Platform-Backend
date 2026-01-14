// =============================================================================
// MOCKS - Must be before ALL imports
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockConnection = {
  getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.14.0' }),
};

const mockKeypair = {
  publicKey: {
    toBase58: jest.fn().mockReturnValue('MockPublicKey123'),
  },
  secretKey: new Uint8Array(64),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => mockConnection),
  Keypair: {
    fromSecretKey: jest.fn().mockReturnValue(mockKeypair),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    solana: {
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      commitment: 'confirmed',
      walletPrivateKey: 'dGVzdC1wcml2YXRlLWtleQ==',
    },
  },
}));

// Now import everything
import { SolanaService } from '../../../src/services/solanaService';
import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../../../src/config';
import { NFTMintRequest } from '../../../src/types';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('SolanaService', () => {
  beforeEach(() => {
    (Connection as jest.Mock).mockImplementation(() => mockConnection);
    jest.clearAllMocks();

    // Reset the service state
    (SolanaService as any).connection = null;
    (SolanaService as any).wallet = null;

    // Reset mock implementations
    mockConnection.getVersion.mockResolvedValue({ 'solana-core': '1.14.0' });
    (Connection as jest.Mock).mockClear();
    (Keypair.fromSecretKey as jest.Mock).mockClear();
  });

  // =============================================================================
  // initialize() - 12 test cases
  // =============================================================================

  describe('initialize()', () => {
    it('should initialize Solana connection successfully', async () => {
      await SolanaService.initialize();

      expect(Connection).toHaveBeenCalledWith(
        'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
    });

    it('should create connection with correct parameters', async () => {
      await SolanaService.initialize();

      expect(Connection).toHaveBeenCalledWith(
        config.solana.rpcUrl,
        config.solana.commitment
      );
    });

    it('should load wallet from private key', async () => {
      await SolanaService.initialize();

      expect(Keypair.fromSecretKey).toHaveBeenCalled();
    });

    it('should decode base64 private key', async () => {
      await SolanaService.initialize();

      const callArg = (Keypair.fromSecretKey as jest.Mock).mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Uint8Array);
    });

    it('should log wallet public key on success', async () => {
      await SolanaService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Solana wallet loaded', {
        publicKey: 'MockPublicKey123',
      });
    });

    it('should test connection and log version', async () => {
      await SolanaService.initialize();

      expect(mockConnection.getVersion).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Solana connected', {
        version: { 'solana-core': '1.14.0' },
      });
    });

    it('should warn if wallet private key is not configured', async () => {
      (config as any).solana.walletPrivateKey = null;

      await SolanaService.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Solana wallet not configured - NFT minting will be simulated'
      );
    });

    it('should warn if wallet private key is default placeholder', async () => {
      (config as any).solana.walletPrivateKey = 'your-wallet-private-key';

      await SolanaService.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Solana wallet not configured - NFT minting will be simulated'
      );
    });

    it('should continue if wallet loading fails', async () => {
      (Keypair.fromSecretKey as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid private key');
      });

      await SolanaService.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Solana wallet not configured - NFT minting will be simulated',
        expect.any(Error)
      );
    });

    it('should throw error if connection fails', async () => {
      (Connection as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await expect(SolanaService.initialize()).rejects.toThrow('Connection failed');
    });

    it('should log error if initialization fails', async () => {
      const error = new Error('Connection failed');
      (Connection as jest.Mock).mockImplementation(() => {
        throw error;
      });

      try {
        await SolanaService.initialize();
      } catch (e) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize Solana:', error);
    });

    it('should throw error if getVersion fails', async () => {
      (Connection as jest.Mock).mockImplementation(() => mockConnection);
      mockConnection.getVersion.mockRejectedValue(new Error('Version check failed'));

      await expect(SolanaService.initialize()).rejects.toThrow('Version check failed');
    });
  });

  // =============================================================================
  // getConnection() - 4 test cases
  // =============================================================================

  describe('getConnection()', () => {
    it('should return connection if initialized', async () => {
      await SolanaService.initialize();

      const connection = SolanaService.getConnection();

      expect(connection).toBeDefined();
      expect(connection).toBe(mockConnection);
    });

    it('should throw error if not initialized', () => {
      expect(() => SolanaService.getConnection()).toThrow('Solana not initialized');
    });

    it('should return same connection instance', async () => {
      await SolanaService.initialize();

      const connection1 = SolanaService.getConnection();
      const connection2 = SolanaService.getConnection();

      expect(connection1).toBe(connection2);
    });

    it('should return connection with getVersion method', async () => {
      await SolanaService.initialize();

      const connection = SolanaService.getConnection();

      expect(connection.getVersion).toBeDefined();
    });
  });

  // =============================================================================
  // getWallet() - 6 test cases
  // =============================================================================

  describe('getWallet()', () => {
    it('should return wallet if initialized', async () => {
      await SolanaService.initialize();

      const wallet = SolanaService.getWallet();

      expect(wallet).toBeDefined();
      expect(wallet).toBe(mockKeypair);
    });

    it('should throw error if wallet not initialized', () => {
      expect(() => SolanaService.getWallet()).toThrow('Solana wallet not initialized');
    });

    it('should throw error if wallet not configured', async () => {
      (config as any).solana.walletPrivateKey = null;
      await SolanaService.initialize();

      expect(() => SolanaService.getWallet()).toThrow('Solana wallet not initialized');
    });

    it('should return wallet with publicKey', async () => {
      await SolanaService.initialize();

      const wallet = SolanaService.getWallet();

      expect(wallet.publicKey).toBeDefined();
      expect(wallet.publicKey.toBase58()).toBe('MockPublicKey123');
    });

    it('should return same wallet instance', async () => {
      await SolanaService.initialize();

      const wallet1 = SolanaService.getWallet();
      const wallet2 = SolanaService.getWallet();

      expect(wallet1).toBe(wallet2);
    });

    it('should return wallet with secretKey', async () => {
      await SolanaService.initialize();

      const wallet = SolanaService.getWallet();

      expect(wallet.secretKey).toBeDefined();
      expect(wallet.secretKey).toBeInstanceOf(Uint8Array);
    });
  });

  // =============================================================================
  // mintNFT() - 8 test cases
  // =============================================================================

  describe('mintNFT()', () => {
    const mockRequest: NFTMintRequest = {
      ticketId: 'ticket-123',
      owner: 'user-789',
      metadata: {
        eventId: 'event-456',
        eventName: 'Summer Music Festival',
        venueName: 'Madison Square Garden',
        eventDate: '2025-07-15',
        ticketType: 'VIP',
        seatInfo: 'Section A, Row 1, Seat 5',
        imageUrl: 'https://example.com/ticket.png',
      },
    };

    it('should mint NFT and return tokenId and transactionHash', async () => {
      const result = await SolanaService.mintNFT(mockRequest);

      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('transactionHash');
    });

    it('should return tokenId with token_ prefix', async () => {
      const result = await SolanaService.mintNFT(mockRequest);

      expect(result.tokenId).toMatch(/^token_\d+$/);
    });

    it('should return transactionHash with tx_ prefix', async () => {
      const result = await SolanaService.mintNFT(mockRequest);

      expect(result.transactionHash).toMatch(/^tx_\d+$/);
    });

    it('should log minting operation', async () => {
      await SolanaService.mintNFT(mockRequest);

      expect(mockLogger.info).toHaveBeenCalledWith('Minting NFT (simulated)', {
        ticketId: 'ticket-123',
      });
    });

    it('should generate unique tokenIds', async () => {
      const result1 = await SolanaService.mintNFT(mockRequest);
      
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const result2 = await SolanaService.mintNFT(mockRequest);

      expect(result1.tokenId).not.toBe(result2.tokenId);
    });

    it('should generate unique transactionHashes', async () => {
      const result1 = await SolanaService.mintNFT(mockRequest);
      
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const result2 = await SolanaService.mintNFT(mockRequest);

      expect(result1.transactionHash).not.toBe(result2.transactionHash);
    });

    it('should work without initialization (simulated)', async () => {
      const result = await SolanaService.mintNFT(mockRequest);

      expect(result).toBeDefined();
      expect(result.tokenId).toBeDefined();
    });

    it('should handle different ticket IDs', async () => {
      const request1 = { ...mockRequest, ticketId: 'ticket-1' };
      const request2 = { ...mockRequest, ticketId: 'ticket-2' };

      await SolanaService.mintNFT(request1);
      await SolanaService.mintNFT(request2);

      expect(mockLogger.info).toHaveBeenCalledWith('Minting NFT (simulated)', {
        ticketId: 'ticket-1',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Minting NFT (simulated)', {
        ticketId: 'ticket-2',
      });
    });
  });

  // =============================================================================
  // transferNFT() - 8 test cases
  // =============================================================================

  describe('transferNFT()', () => {
    const tokenId = 'token-123';
    const fromAddress = 'from-address-456';
    const toAddress = 'to-address-789';

    it('should transfer NFT and return transaction hash', async () => {
      const result = await SolanaService.transferNFT(tokenId, fromAddress, toAddress);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should return transaction hash with transfer_tx_ prefix', async () => {
      const result = await SolanaService.transferNFT(tokenId, fromAddress, toAddress);

      expect(result).toMatch(/^transfer_tx_\d+$/);
    });

    it('should log transfer operation', async () => {
      await SolanaService.transferNFT(tokenId, fromAddress, toAddress);

      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId: 'token-123',
        from: 'from-address-456',
        to: 'to-address-789',
      });
    });

    it('should generate unique transaction hashes', async () => {
      const result1 = await SolanaService.transferNFT(tokenId, fromAddress, toAddress);
      
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const result2 = await SolanaService.transferNFT(tokenId, fromAddress, toAddress);

      expect(result1).not.toBe(result2);
    });

    it('should work without initialization (simulated)', async () => {
      const result = await SolanaService.transferNFT(tokenId, fromAddress, toAddress);

      expect(result).toBeDefined();
    });

    it('should handle different token IDs', async () => {
      await SolanaService.transferNFT('token-1', fromAddress, toAddress);
      await SolanaService.transferNFT('token-2', fromAddress, toAddress);

      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId: 'token-1',
        from: fromAddress,
        to: toAddress,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId: 'token-2',
        from: fromAddress,
        to: toAddress,
      });
    });

    it('should handle different from addresses', async () => {
      await SolanaService.transferNFT(tokenId, 'from-1', toAddress);
      await SolanaService.transferNFT(tokenId, 'from-2', toAddress);

      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId,
        from: 'from-1',
        to: toAddress,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId,
        from: 'from-2',
        to: toAddress,
      });
    });

    it('should handle different to addresses', async () => {
      await SolanaService.transferNFT(tokenId, fromAddress, 'to-1');
      await SolanaService.transferNFT(tokenId, fromAddress, 'to-2');

      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId,
        from: fromAddress,
        to: 'to-1',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Transferring NFT (simulated)', {
        tokenId,
        from: fromAddress,
        to: 'to-2',
      });
    });
  });

  // =============================================================================
  // Service singleton test
  // =============================================================================

  describe('SolanaService instance', () => {
    it('should export a singleton instance', () => {
      expect(SolanaService).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof SolanaService.initialize).toBe('function');
      expect(typeof SolanaService.getConnection).toBe('function');
      expect(typeof SolanaService.getWallet).toBe('function');
      expect(typeof SolanaService.mintNFT).toBe('function');
      expect(typeof SolanaService.transferNFT).toBe('function');
    });
  });
});
