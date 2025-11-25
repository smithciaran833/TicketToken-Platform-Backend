// Mock dependencies BEFORE imports
const mockNacl = {
  sign: {
    detached: {
      verify: jest.fn(),
    },
  },
};

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn(),
}));
jest.mock('ethers', () => ({
  ethers: {
    verifyMessage: jest.fn(),
  },
}));
jest.mock('tweetnacl', () => ({
  __esModule: true,
  default: mockNacl,
}));
jest.mock('crypto');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  })),
}));
jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));
jest.mock('../../../src/services/jwt.service');

import { WalletService } from '../../../src/services/wallet.service';
import { AuthenticationError } from '../../../src/errors';
import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import crypto from 'crypto';
import { db } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';
import { JWTService } from '../../../src/services/jwt.service';

describe('WalletService', () => {
  let service: WalletService;
  let mockDb: any;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    mockDb = db as jest.MockedFunction<typeof db>;
    mockRedis = redis as jest.Mocked<typeof redis>;
    
    (JWTService as jest.MockedClass<typeof JWTService>).mockImplementation(() => ({
      generateTokenPair: jest.fn(),
    } as any));

    service = new WalletService();
    jest.clearAllMocks();
  });

  describe('generateNonce', () => {
    const walletAddress = '0x1234567890abcdef';

    it('should generate and store nonce', async () => {
      const mockNonce = 'random-nonce-123';
      (crypto.randomBytes as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue(mockNonce),
      });

      const nonce = await service.generateNonce(walletAddress);

      expect(nonce).toBe(mockNonce);
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `wallet_nonce:${walletAddress}`,
        300,
        mockNonce
      );
    });
  });

  describe('verifySolanaSignature', () => {
    const publicKey = 'solana-public-key';
    const signature = Buffer.from('signature').toString('base64');
    const message = 'test message';

    it('should verify valid Solana signature', async () => {
      const mockPublicKey = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array()),
      };
      (PublicKey as jest.MockedClass<typeof PublicKey>).mockImplementation(() => mockPublicKey as any);
      mockNacl.sign.detached.verify.mockReturnValue(true);

      const result = await service.verifySolanaSignature(publicKey, signature, message);

      expect(result).toBe(true);
    });

    it('should return false for invalid Solana signature', async () => {
      const mockPublicKey = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array()),
      };
      (PublicKey as jest.MockedClass<typeof PublicKey>).mockImplementation(() => mockPublicKey as any);
      mockNacl.sign.detached.verify.mockReturnValue(false);

      const result = await service.verifySolanaSignature(publicKey, signature, message);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (PublicKey as jest.MockedClass<typeof PublicKey>).mockImplementation(() => {
        throw new Error('Invalid public key');
      });

      const result = await service.verifySolanaSignature(publicKey, signature, message);

      expect(result).toBe(false);
    });
  });

  describe('verifyEthereumSignature', () => {
    const address = '0x1234567890abcdef';
    const signature = '0xsignature';
    const message = 'test message';

    it('should verify valid Ethereum signature', async () => {
      (ethers.verifyMessage as jest.Mock).mockReturnValue(address);

      const result = await service.verifyEthereumSignature(address, signature, message);

      expect(result).toBe(true);
      expect(ethers.verifyMessage).toHaveBeenCalledWith(message, signature);
    });

    it('should handle case-insensitive address comparison', async () => {
      (ethers.verifyMessage as jest.Mock).mockReturnValue(address.toUpperCase());

      const result = await service.verifyEthereumSignature(address.toLowerCase(), signature, message);

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', async () => {
      (ethers.verifyMessage as jest.Mock).mockReturnValue('0xdifferentaddress');

      const result = await service.verifyEthereumSignature(address, signature, message);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (ethers.verifyMessage as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = await service.verifyEthereumSignature(address, signature, message);

      expect(result).toBe(false);
    });
  });

  describe('connectWallet', () => {
    const userId = 'user-123';
    const walletAddress = '0x1234567890abcdef';
    const signature = '0xsignature';
    const nonce = 'nonce-123';

    beforeEach(() => {
      mockRedis.get.mockResolvedValue(nonce);
      (ethers.verifyMessage as jest.Mock).mockReturnValue(walletAddress);
    });

    it('should connect Ethereum wallet successfully', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.connectWallet(userId, walletAddress, 'ethereum', signature);

      expect(result.success).toBe(true);
      expect(result.wallet.address).toBe(walletAddress);
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          wallet_address: walletAddress,
          network: 'ethereum',
          verified: true,
        })
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`wallet_nonce:${walletAddress}`);
    });

    it('should connect Solana wallet successfully', async () => {
      const mockPublicKey = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array()),
      };
      (PublicKey as jest.MockedClass<typeof PublicKey>).mockImplementation(() => mockPublicKey as any);
      mockNacl.sign.detached.verify.mockReturnValue(true);

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.connectWallet(userId, walletAddress, 'solana', signature);

      expect(result.success).toBe(true);
      expect(result.wallet.network).toBe('solana');
    });

    it('should throw error when nonce not found', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.connectWallet(userId, walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Nonce expired or not found');
    });

    it('should throw error for invalid signature', async () => {
      (ethers.verifyMessage as jest.Mock).mockReturnValue('0xdifferentaddress');

      await expect(
        service.connectWallet(userId, walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Invalid wallet signature');
    });

    it('should throw error if wallet connected to another account', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ user_id: 'other-user' }),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.connectWallet(userId, walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Wallet already connected to another account');
    });

    it('should not insert if wallet already connected to same user', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ user_id: userId }),
        insert: jest.fn(),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.connectWallet(userId, walletAddress, 'ethereum', signature);

      expect(result.success).toBe(true);
      expect(mockQuery.insert).not.toHaveBeenCalled();
    });
  });

  describe('loginWithWallet', () => {
    const walletAddress = '0x1234567890abcdef';
    const signature = '0xsignature';
    const nonce = 'nonce-123';
    const user = { id: 'user-123', email: 'user@example.com' };

    beforeEach(() => {
      mockRedis.get.mockResolvedValue(nonce);
      (ethers.verifyMessage as jest.Mock).mockReturnValue(walletAddress);
    });

    it('should login with Ethereum wallet successfully', async () => {
      const connection = { user_id: user.id, wallet_address: walletAddress };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(connection)
          .mockResolvedValueOnce(user),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const mockJWT = (service as any).jwtService;
      mockJWT.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.loginWithWallet(walletAddress, 'ethereum', signature);

      expect(result.success).toBe(true);
      expect(result.user.id).toBe(user.id);
      expect(result.tokens).toBeDefined();
      expect(mockRedis.del).toHaveBeenCalledWith(`wallet_nonce:${walletAddress}`);
    });

    it('should login with Solana wallet successfully', async () => {
      const mockPublicKey = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array()),
      };
      (PublicKey as jest.MockedClass<typeof PublicKey>).mockImplementation(() => mockPublicKey as any);
      mockNacl.sign.detached.verify.mockReturnValue(true);

      const connection = { user_id: user.id };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(connection)
          .mockResolvedValueOnce(user),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const mockJWT = (service as any).jwtService;
      mockJWT.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.loginWithWallet(walletAddress, 'solana', signature);

      expect(result.success).toBe(true);
      expect(result.wallet.network).toBe('solana');
    });

    it('should throw error when nonce expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.loginWithWallet(walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Nonce expired or not found');
    });

    it('should throw error for invalid signature', async () => {
      (ethers.verifyMessage as jest.Mock).mockReturnValue('0xdifferentaddress');

      await expect(
        service.loginWithWallet(walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Invalid wallet signature');
    });

    it('should throw error when wallet not connected', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.loginWithWallet(walletAddress, 'ethereum', signature)
      ).rejects.toThrow('Wallet not connected to any account');
    });

    it('should throw error when user not found', async () => {
      const connection = { user_id: user.id };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(connection)
          .mockResolvedValueOnce(null),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.loginWithWallet(walletAddress, 'ethereum', signature)
      ).rejects.toThrow('User not found');
    });

    it('should update last login timestamp', async () => {
      const connection = { user_id: user.id };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(connection)
          .mockResolvedValueOnce(user),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const mockJWT = (service as any).jwtService;
      mockJWT.generateTokenPair.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      await service.loginWithWallet(walletAddress, 'ethereum', signature);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_login_at: expect.any(Date),
        })
      );
    });
  });
});
