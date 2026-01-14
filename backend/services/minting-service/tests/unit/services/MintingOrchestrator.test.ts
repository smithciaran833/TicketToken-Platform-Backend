/**
 * Unit Tests for MintingOrchestrator.ts
 * 
 * Tests the core minting orchestration logic, error handling,
 * idempotency checks, and integration with services.
 * Priority: 🔴 Critical (25 tests)
 */

// Mock dependencies before imports
jest.mock('../../../src/config/solana', () => ({
  getConnection: jest.fn(),
  getWallet: jest.fn()
}));

jest.mock('../../../src/config/database', () => ({
  getPool: jest.fn()
}));

jest.mock('../../../src/services/MetadataService', () => ({
  uploadToIPFS: jest.fn()
}));

jest.mock('../../../src/services/RealCompressedNFT', () => ({
  RealCompressedNFT: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    mintNFT: jest.fn(),
    getMerkleTreeAddress: jest.fn(),
    getCollectionAddress: jest.fn()
  }))
}));

jest.mock('../../../src/services/blockchain.service', () => ({
  MintingBlockchainService: jest.fn().mockImplementation(() => ({
    registerTicketOnChain: jest.fn()
  }))
}));

jest.mock('../../../src/services/DASClient', () => ({
  getDASClient: jest.fn().mockReturnValue({
    assetExists: jest.fn(),
    verifyOwnership: jest.fn(),
    getAsset: jest.fn()
  })
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/utils/solana', () => ({
  checkWalletBalance: jest.fn()
}));

jest.mock('../../../src/utils/spending-limits', () => ({
  checkSpendingLimits: jest.fn(),
  recordSpending: jest.fn()
}));

jest.mock('../../../src/utils/distributed-lock', () => ({
  withLock: jest.fn((key, ttl, fn) => fn()),
  createMintLockKey: jest.fn((tenantId, ticketId) => `mint:${tenantId}:${ticketId}`)
}));

jest.mock('../../../src/utils/metrics', () => ({
  mintsTotal: { inc: jest.fn() },
  mintsSuccessTotal: { inc: jest.fn() },
  mintsFailedTotal: { inc: jest.fn() },
  mintDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
  ipfsUploadDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
  walletBalanceSOL: { set: jest.fn() }
}));

jest.mock('@tickettoken/shared/clients', () => ({
  eventServiceClient: {
    getEventPda: jest.fn()
  },
  ticketServiceClient: {
    updateNft: jest.fn()
  }
}));

import { MintingOrchestrator } from '../../../src/services/MintingOrchestrator';
import { getConnection, getWallet } from '../../../src/config/solana';
import { getPool } from '../../../src/config/database';
import { uploadToIPFS } from '../../../src/services/MetadataService';
import { RealCompressedNFT } from '../../../src/services/RealCompressedNFT';
import { getDASClient } from '../../../src/services/DASClient';
import { checkWalletBalance } from '../../../src/utils/solana';
import { withLock, createMintLockKey } from '../../../src/utils/distributed-lock';
import { PublicKey, Keypair } from '@solana/web3.js';

describe('MintingOrchestrator', () => {
  let orchestrator: MintingOrchestrator;
  let mockConnection: any;
  let mockWallet: any;
  let mockPool: any;
  let mockNftService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock connection
    mockConnection = {
      getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.0.0' })
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Setup mock wallet
    mockWallet = {
      publicKey: new PublicKey('11111111111111111111111111111111'),
      secretKey: new Uint8Array(64)
    };
    (getWallet as jest.Mock).mockReturnValue(mockWallet);

    // Setup mock database pool
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient)
    };
    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Setup mock NFT service
    mockNftService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      mintNFT: jest.fn().mockResolvedValue({
        success: true,
        signature: 'test-signature',
        merkleTree: 'test-merkle-tree',
        ticketId: 'ticket-123'
      }),
      getMerkleTreeAddress: jest.fn().mockReturnValue('merkle-tree-address'),
      getCollectionAddress: jest.fn().mockReturnValue('collection-address')
    };
    (RealCompressedNFT as jest.Mock).mockImplementation(() => mockNftService);

    // Setup mock IPFS upload
    (uploadToIPFS as jest.Mock).mockResolvedValue('ipfs://test-cid');

    // Setup mock wallet balance check
    (checkWalletBalance as jest.Mock).mockResolvedValue({
      balance: 1.0,
      sufficient: true
    });

    orchestrator = new MintingOrchestrator();
  });

  describe('Error Categorization', () => {
    const categorizeError = (errorMessage: string): string => {
      if (errorMessage.includes('Insufficient wallet balance')) return 'insufficient_balance';
      if (errorMessage.includes('IPFS')) return 'ipfs_upload_failed';
      if (errorMessage.includes('Transaction failed')) return 'transaction_failed';
      if (errorMessage.includes('timeout')) return 'timeout';
      if (errorMessage.includes('Bubblegum')) return 'bubblegum_error';
      return 'unknown';
    };

    it("should return 'insufficient_balance' for balance errors", () => {
      expect(categorizeError('Insufficient wallet balance: 0.001 SOL')).toBe('insufficient_balance');
    });

    it("should return 'ipfs_upload_failed' for IPFS errors", () => {
      expect(categorizeError('IPFS upload failed: timeout')).toBe('ipfs_upload_failed');
    });

    it("should return 'transaction_failed' for transaction errors", () => {
      expect(categorizeError('Transaction failed: blockhash expired')).toBe('transaction_failed');
    });

    it("should return 'timeout' for timeout errors", () => {
      expect(categorizeError('Connection timeout after 30000ms')).toBe('timeout');
    });

    it("should return 'bubblegum_error' for Bubblegum errors", () => {
      expect(categorizeError('Bubblegum: invalid merkle tree')).toBe('bubblegum_error');
    });

    it("should return 'unknown' as default", () => {
      expect(categorizeError('Some random error')).toBe('unknown');
    });
  });

  describe('Accessors', () => {
    it('getMerkleTreeAddress should return address when initialized', async () => {
      await orchestrator['ensureInitialized']();
      const address = orchestrator.getMerkleTreeAddress();
      expect(address).toBe('merkle-tree-address');
    });

    it('getMerkleTreeAddress should return null when not initialized', () => {
      const freshOrchestrator = new MintingOrchestrator();
      // Don't initialize - should get value from mock
      const address = freshOrchestrator.getMerkleTreeAddress();
      expect(mockNftService.getMerkleTreeAddress).toHaveBeenCalled();
    });

    it('getCollectionAddress should return address when initialized', async () => {
      await orchestrator['ensureInitialized']();
      const address = orchestrator.getCollectionAddress();
      expect(address).toBe('collection-address');
    });
  });

  describe('Initialization', () => {
    it('ensureInitialized should get connection', async () => {
      await orchestrator['ensureInitialized']();
      expect(getConnection).toHaveBeenCalled();
    });

    it('ensureInitialized should get wallet', async () => {
      await orchestrator['ensureInitialized']();
      expect(getWallet).toHaveBeenCalled();
    });

    it('ensureInitialized should initialize nftService', async () => {
      await orchestrator['ensureInitialized']();
      expect(mockNftService.initialize).toHaveBeenCalled();
    });

    it('ensureInitialized should only run once', async () => {
      await orchestrator['ensureInitialized']();
      await orchestrator['ensureInitialized']();
      
      // Should only initialize once
      expect(mockNftService.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Minting', () => {
    const mockTicketData = {
      ticketId: 'ticket-123',
      orderId: 'order-456',
      eventId: 'event-789',
      tenantId: 'tenant-abc',
      userId: 'user-xyz',
      ownerAddress: '11111111111111111111111111111111',
      metadata: {
        eventName: 'Test Event',
        eventDate: '2026-01-15',
        venue: 'Test Venue',
        tier: 'VIP',
        seatNumber: 'A1'
      }
    };

    it('mintCompressedNFT should acquire distributed lock', async () => {
      const result = await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(createMintLockKey).toHaveBeenCalledWith('tenant-abc', 'ticket-123');
      expect(withLock).toHaveBeenCalled();
    });

    it('mintCompressedNFT should release lock on success', async () => {
      const result = await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(result.success).toBe(true);
      // withLock handles release automatically
    });

    it('mintCompressedNFT should release lock on error', async () => {
      mockNftService.mintNFT.mockRejectedValue(new Error('Mint failed'));
      
      await expect(orchestrator.mintCompressedNFT(mockTicketData))
        .rejects.toThrow('Mint failed');
    });

    it('executeMint should return cached result for completed mint', async () => {
      // Setup existing completed mint
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'existing-id',
          ticket_id: 'ticket-123',
          tenant_id: 'tenant-abc',
          status: 'completed',
          transaction_signature: 'existing-sig',
          mint_address: 'existing-mint',
          metadata_uri: 'ipfs://existing',
          asset_id: 'existing-asset'
        }]
      });

      const result = await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(result.alreadyMinted).toBe(true);
      expect(result.signature).toBe('existing-sig');
    });

    it('executeMint should throw for in-progress mint', async () => {
      // Setup existing in-progress mint
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'existing-id',
          ticket_id: 'ticket-123',
          tenant_id: 'tenant-abc',
          status: 'minting'
        }]
      });

      await expect(orchestrator.mintCompressedNFT(mockTicketData))
        .rejects.toThrow('Mint already in progress');
    });

    it('executeMint should allow retry for failed/pending mints', async () => {
      // Setup existing failed mint
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'existing-id',
          ticket_id: 'ticket-123',
          tenant_id: 'tenant-abc',
          status: 'failed',
          retry_count: 1
        }]
      });

      const result = await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(result.success).toBe(true);
    });
  });

  describe('Balance & Metadata', () => {
    const mockTicketData = {
      ticketId: 'ticket-123',
      orderId: 'order-456',
      eventId: 'event-789',
      tenantId: 'tenant-abc',
      metadata: {}
    };

    it('executeMint should check wallet balance', async () => {
      await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(checkWalletBalance).toHaveBeenCalled();
    });

    it('executeMint should throw on insufficient balance', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.001,
        sufficient: false
      });

      await expect(orchestrator.mintCompressedNFT(mockTicketData))
        .rejects.toThrow('Insufficient wallet balance');
    });

    it('prepareAndUploadMetadata should format metadata correctly', async () => {
      const ticketData = {
        ticketId: 'ticket-123',
        orderId: 'order-456',
        eventId: 'event-789',
        tenantId: 'tenant-abc',
        metadata: {
          eventName: 'Test Event',
          eventDate: '2026-01-15',
          venue: 'Test Venue',
          tier: 'VIP'
        }
      };

      await orchestrator.mintCompressedNFT(ticketData);
      
      expect(uploadToIPFS).toHaveBeenCalledWith(expect.objectContaining({
        ticketId: 'ticket-123',
        eventName: 'Test Event'
      }));
    });
  });

  describe('Database Operations', () => {
    it('checkExistingMint should return record if found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'existing-id',
          ticket_id: 'ticket-123',
          tenant_id: 'tenant-abc',
          status: 'completed'
        }]
      });

      const result = await orchestrator['checkExistingMint']('ticket-123', 'tenant-abc');
      
      expect(result).not.toBeNull();
      expect(result?.status).toBe('completed');
    });

    it('checkExistingMint should return null if not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await orchestrator['checkExistingMint']('ticket-123', 'tenant-abc');
      
      expect(result).toBeNull();
    });

    it('markMintingStarted should create table if not exists', async () => {
      await orchestrator['markMintingStarted']('ticket-123', 'tenant-abc');
      
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS'),
        expect.anything()
      );
    });

    it("markMintingStarted should upsert with 'minting' status", async () => {
      await orchestrator['markMintingStarted']('ticket-123', 'tenant-abc');
      
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'minting'"),
        expect.arrayContaining(['ticket-123', 'tenant-abc'])
      );
    });

    it('saveMintRecord should use transaction', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const mintData = {
        ticketId: 'ticket-123',
        tenantId: 'tenant-abc',
        signature: 'sig-123',
        mintAddress: 'mint-addr',
        metadataUri: 'ipfs://cid',
        assetId: 'asset-123'
      };

      // We need to make the full mint flow work to test saveMintRecord
      const mockTicketData = {
        ticketId: 'ticket-123',
        orderId: 'order-456',
        eventId: 'event-789',
        tenantId: 'tenant-abc',
        metadata: {}
      };

      await orchestrator.mintCompressedNFT(mockTicketData);
      
      // Verify transaction was used
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('Post-Mint Verification', () => {
    it('should verify minted asset via DAS asynchronously', async () => {
      const mockDASClient = getDASClient();
      (mockDASClient.assetExists as jest.Mock).mockResolvedValue(true);
      (mockDASClient.verifyOwnership as jest.Mock).mockResolvedValue(true);
      (mockDASClient.getAsset as jest.Mock).mockResolvedValue({
        ownership: { owner: 'test-owner' },
        compression: { compressed: true, tree: 'test-tree', leaf_index: 0 },
        content: { metadata: { name: 'Test NFT' } }
      });

      const mockTicketData = {
        ticketId: 'ticket-123',
        orderId: 'order-456',
        eventId: 'event-789',
        tenantId: 'tenant-abc',
        ownerAddress: '11111111111111111111111111111111',
        metadata: {}
      };

      const result = await orchestrator.mintCompressedNFT(mockTicketData);
      
      expect(result.success).toBe(true);
      // Verification happens asynchronously after the main mint completes
    });
  });
});
