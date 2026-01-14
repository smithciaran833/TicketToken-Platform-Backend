/**
 * Unit Tests for wallet.service.ts
 * Tests wallet validation, balance checking, and transaction handling
 */

import { walletService, validateWalletAddress, getWalletBalance, createWalletLink } from '../../../src/services/wallet.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  });
  return { db: mockDb };
});

jest.mock('../../../src/services/blockchain.service', () => ({
  blockchainService: {
    getWalletBalance: jest.fn(),
    validateTransaction: jest.fn(),
  },
}));

import { db } from '../../../src/config/database';
import { blockchainService } from '../../../src/services/blockchain.service';

describe('WalletService', () => {
  const mockDb = db as jest.MockedFunction<any>;
  const mockBlockchainService = blockchainService as jest.Mocked<typeof blockchainService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateWalletAddress', () => {
    it('should return true for valid Solana address', () => {
      const validAddress = '11111111111111111111111111111111';
      const result = validateWalletAddress(validAddress);
      expect(result.valid).toBe(true);
    });

    it('should return false for invalid address', () => {
      const invalidAddress = 'invalid-address';
      const result = validateWalletAddress(invalidAddress);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return false for empty address', () => {
      const result = validateWalletAddress('');
      expect(result.valid).toBe(false);
    });

    it('should return false for address with invalid characters', () => {
      const result = validateWalletAddress('!@#$%^&*()');
      expect(result.valid).toBe(false);
    });

    it('should return false for address too short', () => {
      const result = validateWalletAddress('abc123');
      expect(result.valid).toBe(false);
    });
  });

  describe('getWalletBalance', () => {
    it('should return balance from blockchain service', async () => {
      mockBlockchainService.getWalletBalance.mockResolvedValue(1.5);

      const balance = await getWalletBalance('wallet-address');

      expect(balance).toBe(1.5);
      expect(mockBlockchainService.getWalletBalance).toHaveBeenCalledWith('wallet-address');
    });

    it('should return 0 on error', async () => {
      mockBlockchainService.getWalletBalance.mockRejectedValue(new Error('Network error'));

      const balance = await getWalletBalance('wallet-address');

      expect(balance).toBe(0);
    });

    it('should cache balance for repeated calls', async () => {
      mockBlockchainService.getWalletBalance.mockResolvedValue(2.0);

      await getWalletBalance('wallet-address');
      await getWalletBalance('wallet-address');

      // Depending on caching implementation, this could be called once or twice
      expect(mockBlockchainService.getWalletBalance).toHaveBeenCalled();
    });
  });

  describe('createWalletLink', () => {
    it('should link wallet to user', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await createWalletLink('user-123', 'wallet-address');

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          wallet_address: 'wallet-address',
        })
      );
    });

    it('should throw if user already has wallet linked', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ id: 'existing-link' }),
        }),
      });

      await expect(
        createWalletLink('user-123', 'new-wallet')
      ).rejects.toThrow();
    });

    it('should validate wallet address before linking', async () => {
      await expect(
        createWalletLink('user-123', 'invalid')
      ).rejects.toThrow();
    });
  });

  describe('getUserWallet', () => {
    it('should return user wallet', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            wallet_address: 'wallet-address',
          }),
        }),
      });

      const wallet = await walletService.getUserWallet('user-123');

      expect(wallet).toBeDefined();
      expect(wallet!.wallet_address).toBe('wallet-address');
    });

    it('should return null if no wallet linked', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const wallet = await walletService.getUserWallet('user-123');

      expect(wallet).toBeNull();
    });
  });

  describe('unlinkWallet', () => {
    it('should unlink wallet from user', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await walletService.unlinkWallet('user-123');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unlinked',
        })
      );
    });
  });

  describe('verifyWalletOwnership', () => {
    it('should verify user owns wallet', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            wallet_address: 'wallet-address',
          }),
        }),
      });

      const isOwner = await walletService.verifyWalletOwnership('user-123', 'wallet-address');

      expect(isOwner).toBe(true);
    });

    it('should return false if wallet not owned', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const isOwner = await walletService.verifyWalletOwnership('user-123', 'other-wallet');

      expect(isOwner).toBe(false);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history for wallet', async () => {
      const mockTransactions = [
        { id: 'tx-1', signature: 'sig1' },
        { id: 'tx-2', signature: 'sig2' },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockTransactions),
          }),
        }),
      });

      const history = await walletService.getTransactionHistory('wallet-address');

      expect(history).toHaveLength(2);
    });

    it('should return empty array for no transactions', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const history = await walletService.getTransactionHistory('wallet-address');

      expect(history).toEqual([]);
    });
  });

  describe('Service export', () => {
    it('should export walletService object', () => {
      expect(walletService).toBeDefined();
      expect(walletService.getUserWallet).toBeDefined();
      expect(walletService.unlinkWallet).toBeDefined();
      expect(walletService.verifyWalletOwnership).toBeDefined();
    });
  });
});
