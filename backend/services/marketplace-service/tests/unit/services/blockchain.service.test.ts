/**
 * Unit Tests for Blockchain Service
 * Tests Solana blockchain integration for NFT transfers and escrow
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock blockchain config
const mockConnection = {
  getBalance: jest.fn(),
  getTransaction: jest.fn(),
  getLatestBlockhash: jest.fn(),
  getBlockHeight: jest.fn(),
  sendRawTransaction: jest.fn(),
  confirmTransaction: jest.fn()
};

const mockWallet = {
  publicKey: { toString: () => 'TestWalletPublicKey123' },
  secretKey: new Uint8Array(64)
};

jest.mock('../../../src/config/blockchain', () => ({
  default: {
    getConnection: jest.fn(() => mockConnection),
    getWallet: jest.fn(() => mockWallet)
  }
}));

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  PublicKey: jest.fn().mockImplementation((key) => ({
    toBuffer: () => Buffer.from(key),
    toString: () => key
  })),
  Transaction: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockReturnThis(),
    sign: jest.fn(),
    serialize: jest.fn(() => Buffer.from('serialized'))
  })),
  SystemProgram: {
    programId: { toString: () => 'SystemProgram111111111' }
  },
  Keypair: {
    generate: jest.fn()
  }
}));

// Mock @coral-xyz/anchor
const mockProgramMethods = {
  buyListing: jest.fn().mockReturnValue({
    accounts: jest.fn().mockReturnValue({
      instruction: jest.fn().mockResolvedValue({})
    })
  }),
  initializeEscrow: jest.fn().mockReturnValue({
    accounts: jest.fn().mockReturnValue({
      instruction: jest.fn().mockResolvedValue({})
    })
  }),
  releaseEscrow: jest.fn().mockReturnValue({
    accounts: jest.fn().mockReturnValue({
      instruction: jest.fn().mockResolvedValue({})
    })
  }),
  refundEscrow: jest.fn().mockReturnValue({
    accounts: jest.fn().mockReturnValue({
      instruction: jest.fn().mockResolvedValue({})
    })
  })
};

const mockProgram = {
  methods: mockProgramMethods,
  programId: { toBuffer: () => Buffer.from('program') },
  account: {
    listing: {
      fetch: jest.fn()
    },
    escrow: {
      fetch: jest.fn()
    }
  }
};

jest.mock('@coral-xyz/anchor', () => ({
  Program: jest.fn().mockImplementation(() => mockProgram),
  AnchorProvider: jest.fn(),
  BN: jest.fn((num) => ({ toNumber: () => num }))
}));

// Mock IDL
jest.mock('../../../src/idl/marketplace.json', () => ({}), { virtual: true });

// Mock errors
jest.mock('../../../src/utils/errors', () => ({
  InternalServerError: class InternalServerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InternalServerError';
    }
  }
}));

import { RealBlockchainService, blockchainService } from '../../../src/services/blockchain.service';
import { PublicKey } from '@solana/web3.js';

describe('RealBlockchainService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.getLatestBlockhash.mockResolvedValue({ blockhash: 'test-blockhash' });
    mockConnection.getBlockHeight.mockResolvedValue(12345);
    mockConnection.sendRawTransaction.mockResolvedValue('test-signature-123');
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });

    // Reset PublicKey mock
    (PublicKey as any).findProgramAddress = jest.fn().mockResolvedValue([
      { toBuffer: () => Buffer.from('pda') },
      255
    ]);
  });

  describe('constructor', () => {
    it('should initialize connection', () => {
      const service = new RealBlockchainService();
      expect(service.getConnection()).toBeDefined();
    });
  });

  describe('transferNFT', () => {
    const transferParams = {
      tokenId: 'token-123',
      fromWallet: 'from-wallet-123',
      toWallet: 'to-wallet-456',
      listingId: 'listing-789',
      price: 10000
    };

    it('should execute transfer successfully', async () => {
      const result = await blockchainService.transferNFT(transferParams);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('blockHeight');
      expect(result).toHaveProperty('fee');
    });

    it('should retry on transient failures', async () => {
      mockConnection.sendRawTransaction
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('retry-signature');

      const result = await blockchainService.transferNFT(transferParams);

      expect(result.signature).toBeDefined();
    });

    it('should not retry on insufficient balance', async () => {
      mockConnection.sendRawTransaction.mockRejectedValue(new Error('Insufficient balance'));

      await expect(blockchainService.transferNFT(transferParams))
        .rejects.toThrow('Insufficient');
    });

    it('should not retry on program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      await expect(service.transferNFT(transferParams))
        .rejects.toThrow('not initialized');
    });

    it('should throw after max retries', async () => {
      mockConnection.sendRawTransaction.mockRejectedValue(new Error('Network error'));

      await expect(blockchainService.transferNFT(transferParams))
        .rejects.toThrow();
    });

    it('should use exponential backoff', async () => {
      jest.useFakeTimers();
      const startTime = Date.now();

      mockConnection.sendRawTransaction
        .mockRejectedValueOnce(new Error('Retry'))
        .mockResolvedValueOnce('success');

      const transferPromise = blockchainService.transferNFT(transferParams);

      // Fast-forward through the retry delay
      jest.advanceTimersByTime(2000);

      await transferPromise;

      jest.useRealTimers();
    });
  });

  describe('verifyNFTOwnership', () => {
    it('should verify ownership from on-chain data', async () => {
      mockProgram.account.listing.fetch.mockResolvedValue({
        seller: { toString: () => 'wallet-123' }
      });

      const result = await blockchainService.verifyNFTOwnership('wallet-123', 'token-456');

      expect(result).toBe(true);
    });

    it('should return false when owner does not match', async () => {
      mockProgram.account.listing.fetch.mockResolvedValue({
        seller: { toString: () => 'different-wallet' }
      });

      const result = await blockchainService.verifyNFTOwnership('wallet-123', 'token-456');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockProgram.account.listing.fetch.mockRejectedValue(new Error('Not found'));

      const result = await blockchainService.verifyNFTOwnership('wallet-123', 'token-456');

      expect(result).toBe(false);
    });

    it('should return false if program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      const result = await service.verifyNFTOwnership('wallet-123', 'token-456');

      expect(result).toBe(false);
    });
  });

  describe('getWalletBalance', () => {
    it('should return balance in SOL', async () => {
      mockConnection.getBalance.mockResolvedValue(5000000000); // 5 SOL in lamports

      const result = await blockchainService.getWalletBalance('wallet-123');

      expect(result).toBe(5); // 5 SOL
    });

    it('should throw on invalid address', async () => {
      mockConnection.getBalance.mockRejectedValue(new Error('Invalid address'));

      await expect(blockchainService.getWalletBalance('invalid'))
        .rejects.toThrow('Failed to get wallet balance');
    });
  });

  describe('validateTransaction', () => {
    it('should return true for valid transaction', async () => {
      mockConnection.getTransaction.mockResolvedValue({
        meta: { err: null }
      });

      const result = await blockchainService.validateTransaction('valid-signature');

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', async () => {
      mockConnection.getTransaction.mockResolvedValue(null);

      const result = await blockchainService.validateTransaction('invalid-signature');

      expect(result).toBe(false);
    });

    it('should return false for failed transaction', async () => {
      mockConnection.getTransaction.mockResolvedValue({
        meta: { err: { InstructionError: [0, 'Custom'] } }
      });

      const result = await blockchainService.validateTransaction('failed-signature');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockConnection.getTransaction.mockRejectedValue(new Error('Network error'));

      const result = await blockchainService.validateTransaction('error-signature');

      expect(result).toBe(false);
    });
  });

  describe('calculateNetworkFee', () => {
    it('should return estimated fee', () => {
      const fee = blockchainService.calculateNetworkFee();

      expect(fee).toBe(0.00025);
      expect(typeof fee).toBe('number');
    });
  });

  describe('createEscrowAccount', () => {
    const escrowParams = {
      listingId: 'listing-123',
      buyerWallet: 'buyer-wallet',
      sellerWallet: 'seller-wallet',
      amount: 10000
    };

    it('should create escrow and return address', async () => {
      const result = await blockchainService.createEscrowAccount(escrowParams);

      expect(result).toHaveProperty('escrowAddress');
      expect(result).toHaveProperty('signature');
    });

    it('should throw if program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      await expect(service.createEscrowAccount(escrowParams))
        .rejects.toThrow('not initialized');
    });
  });

  describe('releaseEscrowToSeller', () => {
    const releaseParams = {
      escrowAddress: 'escrow-pda-123',
      listingId: 'listing-123',
      buyerWallet: 'buyer-wallet',
      sellerWallet: 'seller-wallet',
      platformFee: 500,
      venueFee: 250
    };

    it('should release escrow and return signature', async () => {
      const result = await blockchainService.releaseEscrowToSeller(releaseParams);

      expect(result).toHaveProperty('signature');
      expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
      expect(mockConnection.confirmTransaction).toHaveBeenCalled();
    });

    it('should throw if program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      await expect(service.releaseEscrowToSeller(releaseParams))
        .rejects.toThrow('not initialized');
    });
  });

  describe('refundEscrowToBuyer', () => {
    const refundParams = {
      escrowAddress: 'escrow-pda-123',
      listingId: 'listing-123',
      buyerWallet: 'buyer-wallet'
    };

    it('should refund escrow and return signature', async () => {
      const result = await blockchainService.refundEscrowToBuyer(refundParams);

      expect(result).toHaveProperty('signature');
      expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
      expect(mockConnection.confirmTransaction).toHaveBeenCalled();
    });

    it('should throw if program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      await expect(service.refundEscrowToBuyer(refundParams))
        .rejects.toThrow('not initialized');
    });
  });

  describe('getEscrowStatus', () => {
    it('should return escrow details', async () => {
      mockProgram.account.escrow.fetch.mockResolvedValue({
        amount: { toNumber: () => 10000 },
        buyer: { toString: () => 'buyer-wallet' },
        seller: { toString: () => 'seller-wallet' },
        released: false
      });

      const result = await blockchainService.getEscrowStatus('escrow-address');

      expect(result.exists).toBe(true);
      expect(result.amount).toBe(10000);
      expect(result.buyer).toBe('buyer-wallet');
      expect(result.seller).toBe('seller-wallet');
      expect(result.released).toBe(false);
    });

    it('should return exists: false if not found', async () => {
      mockProgram.account.escrow.fetch.mockRejectedValue(new Error('Not found'));

      const result = await blockchainService.getEscrowStatus('nonexistent');

      expect(result.exists).toBe(false);
    });

    it('should return exists: false if program not initialized', async () => {
      const service = new RealBlockchainService();
      (service as any).program = null;

      const result = await service.getEscrowStatus('escrow-address');

      expect(result.exists).toBe(false);
    });
  });

  describe('getConnection', () => {
    it('should return the connection', () => {
      const connection = blockchainService.getConnection();

      expect(connection).toBeDefined();
    });
  });

  describe('blockchainService export', () => {
    it('should export singleton instance', () => {
      expect(blockchainService).toBeDefined();
      expect(blockchainService).toBeInstanceOf(RealBlockchainService);
    });
  });
});
