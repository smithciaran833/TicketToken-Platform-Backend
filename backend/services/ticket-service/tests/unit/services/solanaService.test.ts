// Mock @solana/web3.js
const mockGetVersion = jest.fn();
const mockGetSlot = jest.fn();
const mockGetBlockHeight = jest.fn();
const mockGetLatestBlockhash = jest.fn();
const mockGetSignatureStatus = jest.fn();
const mockOnSignature = jest.fn();
const mockRemoveSignatureListener = jest.fn();

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getVersion: mockGetVersion,
    getSlot: mockGetSlot,
    getBlockHeight: mockGetBlockHeight,
    getLatestBlockhash: mockGetLatestBlockhash,
    getSignatureStatus: mockGetSignatureStatus,
    onSignature: mockOnSignature,
    removeSignatureListener: mockRemoveSignatureListener,
  })),
  Keypair: {
    fromSecretKey: jest.fn().mockReturnValue({
      publicKey: { toBase58: () => 'mockPublicKey123' },
    }),
  },
  PublicKey: jest.fn(),
  Transaction: jest.fn(),
}));

// Mock DatabaseService
const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      cluster: 'devnet',
      commitment: 'confirmed',
      walletPrivateKey: null,
    },
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Import after mocks
import { SolanaService } from '../../../src/services/solanaService';

describe('SolanaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mock implementations
    mockGetVersion.mockResolvedValue({ 'solana-core': '1.14.0' });
    mockGetSlot.mockResolvedValue(12345678);
    mockGetBlockHeight.mockResolvedValue(12345670);
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: 'mockBlockhash123',
      lastValidBlockHeight: 12345700,
    });
    mockGetSignatureStatus.mockResolvedValue({
      value: {
        slot: 12345679,
        confirmationStatus: 'confirmed',
        err: null,
      },
    });
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await SolanaService.initialize();

      expect(mockGetVersion).toHaveBeenCalled();
    });

    it('should handle initialization failure gracefully', async () => {
      mockGetVersion.mockRejectedValueOnce(new Error('Connection failed'));

      // Should use fallback from circuit breaker
      await expect(SolanaService.initialize()).resolves.not.toThrow();
    });
  });

  describe('getConnection', () => {
    it('should return connection after initialization', async () => {
      await SolanaService.initialize();
      
      const connection = SolanaService.getConnection();
      expect(connection).toBeDefined();
    });
  });

  describe('getWallet', () => {
    it('should throw if wallet not configured', () => {
      expect(() => SolanaService.getWallet()).toThrow('wallet not initialized');
    });
  });

  describe('mintNFT', () => {
    it('should mint NFT and return token info', async () => {
      await SolanaService.initialize();

      const result = await SolanaService.mintNFT({
        ticketId: 'ticket-123',
        eventId: 'event-456',
        metadata: { name: 'Test Ticket' },
      });

      expect(result.tokenId).toBeDefined();
      expect(result.transactionHash).toBeDefined();
      expect(result.transactionHash).toContain('tx_mint_');
    });

    it('should record pending transaction', async () => {
      await SolanaService.initialize();

      await SolanaService.mintNFT({
        ticketId: 'ticket-123',
        metadata: { name: 'Test Ticket' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('create_pending_transaction'),
        expect.arrayContaining(['mint', 'ticket-123'])
      );
    });
  });

  describe('transferNFT', () => {
    it('should transfer NFT and return transaction signature', async () => {
      await SolanaService.initialize();

      const signature = await SolanaService.transferNFT(
        'token-123',
        'fromWallet',
        'toWallet'
      );

      expect(signature).toBeDefined();
      expect(signature).toContain('tx_transfer_');
    });

    it('should record pending transaction for transfer', async () => {
      await SolanaService.initialize();

      await SolanaService.transferNFT('token-123', 'from', 'to');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('create_pending_transaction'),
        expect.arrayContaining(['transfer'])
      );
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      await SolanaService.initialize();

      const status = await SolanaService.getSyncStatus();

      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('syncLag');
      expect(status).toHaveProperty('lastBlockProcessed');
      expect(status).toHaveProperty('currentSlot');
      expect(status).toHaveProperty('slotsBehind');
      expect(status).toHaveProperty('rpcEndpoint');
      expect(status).toHaveProperty('cluster');
    });

    it('should return status with current slot info', async () => {
      await SolanaService.initialize();
      mockGetSlot.mockResolvedValueOnce(99999999);

      const status = await SolanaService.getSyncStatus();

      expect(status.currentSlot).toBe(99999999);
    });

    it('should handle errors in getSyncStatus', async () => {
      await SolanaService.initialize();
      mockGetSlot.mockRejectedValueOnce(new Error('RPC error'));

      const status = await SolanaService.getSyncStatus();

      expect(status.healthy).toBe(false);
      expect(status.syncErrors).toBeGreaterThan(0);
    });
  });

  describe('getSyncMetrics', () => {
    it('should return Prometheus format metrics', async () => {
      await SolanaService.initialize();

      const metrics = SolanaService.getSyncMetrics();

      expect(metrics).toContain('blockchain_sync_lag_ms');
      expect(metrics).toContain('blockchain_last_processed_slot');
      expect(metrics).toContain('blockchain_sync_errors_total');
      expect(metrics).toContain('blockchain_transactions_processed_total');
      expect(metrics).toContain('blockchain_healthy');
    });
  });

  describe('getHealthStatus', () => {
    it('should return comprehensive health status', async () => {
      await SolanaService.initialize();

      const health = SolanaService.getHealthStatus();

      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('circuitBreaker');
      expect(health).toHaveProperty('rpcEndpoints');
      expect(health).toHaveProperty('websocket');
      expect(health.circuitBreaker).toHaveProperty('state');
      expect(health.circuitBreaker).toHaveProperty('failureCount');
    });

    it('should show connected as true after initialization', async () => {
      await SolanaService.initialize();

      const health = SolanaService.getHealthStatus();

      expect(health.connected).toBe(true);
    });
  });

  describe('verifyOwnership', () => {
    it('should verify token ownership', async () => {
      await SolanaService.initialize();

      const result = await SolanaService.verifyOwnership(
        'tokenMint123',
        'expectedOwner'
      );

      expect(result).toBe(true);
    });
  });

  describe('CircuitBreaker behavior', () => {
    it('should track failure count', async () => {
      await SolanaService.initialize();

      const health = SolanaService.getHealthStatus();
      expect(health.circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('RPC Failover', () => {
    it('should include RPC endpoint in health status', async () => {
      await SolanaService.initialize();

      const health = SolanaService.getHealthStatus();

      expect(health.rpcEndpoints).toBeDefined();
      expect(Object.keys(health.rpcEndpoints).length).toBeGreaterThan(0);
    });
  });
});
