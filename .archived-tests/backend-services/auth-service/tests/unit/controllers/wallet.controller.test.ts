import { FastifyRequest, FastifyReply } from 'fastify';
import { WalletController } from '../../../src/controllers/wallet.controller';
import { WalletService } from '../../../src/services/wallet.service';

// Mock the wallet service
jest.mock('../../../src/services/wallet.service');

describe('WalletController', () => {
  let walletController: WalletController;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    // Create mock wallet service
    mockWalletService = {
      generateNonce: jest.fn(),
      verifySolanaSignature: jest.fn(),
      verifyEthereumSignature: jest.fn(),
      registerWithWallet: jest.fn(),
      loginWithWallet: jest.fn(),
      linkWallet: jest.fn(),
      unlinkWallet: jest.fn(),
    } as any;

    walletController = new WalletController(mockWalletService);

    // Mock request and reply
    mockRequest = {
      body: {},
      params: {},
      user: { id: 'user-123', tenant_id: 'tenant-123' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestNonce', () => {
    it('should generate nonce for valid public key', async () => {
      const mockNonceData = {
        nonce: 'test-nonce-123',
        message: 'Sign this message to authenticate: test-nonce-123',
      };

      mockRequest.body = {
        publicKey: 'solana-public-key-123',
        chain: 'solana',
      };

      mockWalletService.generateNonce.mockResolvedValue(mockNonceData);

      await walletController.requestNonce(mockRequest as any, mockReply as any);

      expect(mockWalletService.generateNonce).toHaveBeenCalledWith('solana-public-key-123', 'solana');
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(mockNonceData);
    });

    it('should handle missing public key', async () => {
      mockRequest.body = { chain: 'solana' };

      await walletController.requestNonce(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Public key is required',
      });
    });

    it('should handle missing chain', async () => {
      mockRequest.body = { publicKey: 'test-key' };

      await walletController.requestNonce(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Chain is required',
      });
    });

    it('should handle service errors', async () => {
      mockRequest.body = {
        publicKey: 'test-key',
        chain: 'solana',
      };

      mockWalletService.generateNonce.mockRejectedValue(new Error('Nonce generation failed'));

      await walletController.requestNonce(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to generate nonce',
      });
    });
  });

  describe('register', () => {
    it('should register new user with Solana wallet', async () => {
      const mockUser = {
        id: 'user-456',
        email: 'wallet-user@test.com',
        tenant_id: 'tenant-123',
      };

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
      };

      mockRequest.body = {
        publicKey: 'solana-key-123',
        signature: 'valid-signature',
        nonce: 'nonce-123',
        chain: 'solana',
        tenant_id: 'tenant-123',
      };

      mockWalletService.registerWithWallet.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      await walletController.register(mockRequest as any, mockReply as any);

      expect(mockWalletService.registerWithWallet).toHaveBeenCalledWith({
        publicKey: 'solana-key-123',
        signature: 'valid-signature',
        nonce: 'nonce-123',
        chain: 'solana',
        tenant_id: 'tenant-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockUser,
        tokens: mockTokens,
      });
    });

    it('should register new user with Ethereum wallet', async () => {
      mockRequest.body = {
        publicKey: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        signature: 'eth-signature',
        nonce: 'nonce-456',
        chain: 'ethereum',
        tenant_id: 'tenant-123',
      };

      const mockResult = {
        user: { id: 'user-789' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' },
      };

      mockWalletService.registerWithWallet.mockResolvedValue(mockResult);

      await walletController.register(mockRequest as any, mockReply as any);

      expect(mockWalletService.registerWithWallet).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should handle invalid signature', async () => {
      mockRequest.body = {
        publicKey: 'test-key',
        signature: 'invalid-sig',
        nonce: 'nonce',
        chain: 'solana',
        tenant_id: 'tenant-123',
      };

      mockWalletService.registerWithWallet.mockRejectedValue(
        new Error('Invalid signature')
      );

      await walletController.register(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid signature',
      });
    });

    it('should handle expired nonce', async () => {
      mockRequest.body = {
        publicKey: 'test-key',
        signature: 'sig',
        nonce: 'expired-nonce',
        chain: 'solana',
        tenant_id: 'tenant-123',
      };

      mockWalletService.registerWithWallet.mockRejectedValue(
        new Error('Nonce expired or invalid')
      );

      await walletController.register(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should handle missing required fields', async () => {
      mockRequest.body = {
        publicKey: 'test-key',
        // Missing signature, nonce, chain
      };

      await walletController.register(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Missing required fields',
      });
    });
  });

  describe('login', () => {
    it('should login user with valid wallet signature', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'wallet-user@test.com',
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockRequest.body = {
        publicKey: 'solana-key',
        signature: 'valid-sig',
        nonce: 'nonce-123',
        chain: 'solana',
      };

      mockWalletService.loginWithWallet.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      await walletController.login(mockRequest as any, mockReply as any);

      expect(mockWalletService.loginWithWallet).toHaveBeenCalledWith({
        publicKey: 'solana-key',
        signature: 'valid-sig',
        nonce: 'nonce-123',
        chain: 'solana',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockUser,
        tokens: mockTokens,
      });
    });

    it('should reject login with invalid signature', async () => {
      mockRequest.body = {
        publicKey: 'key',
        signature: 'invalid',
        nonce: 'nonce',
        chain: 'solana',
      };

      mockWalletService.loginWithWallet.mockRejectedValue(
        new Error('Invalid signature')
      );

      await walletController.login(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject login for unregistered wallet', async () => {
      mockRequest.body = {
        publicKey: 'unregistered-key',
        signature: 'sig',
        nonce: 'nonce',
        chain: 'solana',
      };

      mockWalletService.loginWithWallet.mockRejectedValue(
        new Error('Wallet not registered')
      );

      await walletController.login(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Wallet not registered',
      });
    });

    it('should prevent nonce reuse', async () => {
      mockRequest.body = {
        publicKey: 'key',
        signature: 'sig',
        nonce: 'used-nonce',
        chain: 'solana',
      };

      mockWalletService.loginWithWallet.mockRejectedValue(
        new Error('Nonce already used')
      );

      await walletController.login(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('linkWallet', () => {
    it('should link wallet to authenticated user', async () => {
      mockRequest.body = {
        publicKey: 'new-wallet-key',
        signature: 'sig',
        nonce: 'nonce',
        chain: 'solana',
      };

      mockWalletService.linkWallet.mockResolvedValue({
        success: true,
        walletAddress: 'new-wallet-key',
      });

      await walletController.linkWallet(mockRequest as any, mockReply as any);

      expect(mockWalletService.linkWallet).toHaveBeenCalledWith(
        'user-123',
        {
          publicKey: 'new-wallet-key',
          signature: 'sig',
          nonce: 'nonce',
          chain: 'solana',
        }
      );
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        walletAddress: 'new-wallet-key',
      });
    });

    it('should reject linking already linked wallet', async () => {
      mockRequest.body = {
        publicKey: 'existing-wallet',
        signature: 'sig',
        nonce: 'nonce',
        chain: 'solana',
      };

      mockWalletService.linkWallet.mockRejectedValue(
        new Error('Wallet already linked to another account')
      );

      await walletController.linkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Wallet already linked to another account',
      });
    });

    it('should require authentication', async () => {
      mockRequest.user = undefined;

      await walletController.linkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required',
      });
    });

    it('should validate signature before linking', async () => {
      mockRequest.body = {
        publicKey: 'key',
        signature: 'invalid-sig',
        nonce: 'nonce',
        chain: 'solana',
      };

      mockWalletService.linkWallet.mockRejectedValue(
        new Error('Invalid signature')
      );

      await walletController.linkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('unlinkWallet', () => {
    it('should unlink wallet from authenticated user', async () => {
      mockRequest.params = { walletAddress: 'wallet-to-unlink' };

      mockWalletService.unlinkWallet.mockResolvedValue({ success: true });

      await walletController.unlinkWallet(mockRequest as any, mockReply as any);

      expect(mockWalletService.unlinkWallet).toHaveBeenCalledWith(
        'user-123',
        'wallet-to-unlink'
      );
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it('should handle wallet not found', async () => {
      mockRequest.params = { walletAddress: 'nonexistent-wallet' };

      mockWalletService.unlinkWallet.mockRejectedValue(
        new Error('Wallet not found')
      );

      await walletController.unlinkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Wallet not found',
      });
    });

    it('should prevent unlinking wallet from another user', async () => {
      mockRequest.params = { walletAddress: 'other-user-wallet' };

      mockWalletService.unlinkWallet.mockRejectedValue(
        new Error('Wallet does not belong to this user')
      );

      await walletController.unlinkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should require authentication', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { walletAddress: 'wallet' };

      await walletController.unlinkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should handle missing wallet address', async () => {
      mockRequest.params = {};

      await walletController.unlinkWallet(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Wallet address is required',
      });
    });
  });
});
