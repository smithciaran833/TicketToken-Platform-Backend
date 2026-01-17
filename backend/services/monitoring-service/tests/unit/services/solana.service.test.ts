// Mock dependencies BEFORE imports
const mockConnection = {
  getBlockHeight: jest.fn(),
  getBalance: jest.fn(),
  getAccountInfo: jest.fn(),
  getTokenAccountBalance: jest.fn(),
  getSignatureStatus: jest.fn(),
};

const mockMetaplex = {
  nfts: jest.fn().mockReturnValue({
    create: jest.fn(),
  }),
  use: jest.fn(),
};

const mockKeypair = {
  publicKey: {
    toString: jest.fn().mockReturnValue('mock-public-key'),
  },
  secretKey: Buffer.from('mock-secret-key'),
};

const mockNft = {
  address: {
    toString: jest.fn().mockReturnValue('mock-mint-address'),
  },
  json: {
    name: 'Test NFT',
    symbol: 'TEST',
  },
};

const mockDb = jest.fn().mockReturnValue({
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  onConflict: jest.fn().mockReturnThis(),
  merge: jest.fn(),
});

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(() => mockConnection),
  Keypair: {
    generate: jest.fn(() => mockKeypair),
    fromSecretKey: jest.fn(() => mockKeypair),
  },
  PublicKey: jest.fn((key) => ({ toString: () => key })),
  Transaction: jest.fn(() => ({
    add: jest.fn().mockReturnThis(),
  })),
  sendAndConfirmTransaction: jest.fn().mockResolvedValue('mock-signature'),
  SystemProgram: {},
  LAMPORTS_PER_SOL: 1000000000,
}));

jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: jest.fn().mockResolvedValue('mock-token-account'),
  createAssociatedTokenAccountInstruction: jest.fn().mockReturnValue({}),
  createTransferInstruction: jest.fn().mockReturnValue({}),
  TOKEN_PROGRAM_ID: 'token-program-id',
}));

jest.mock('@metaplex-foundation/js', () => ({
  Metaplex: jest.fn(() => mockMetaplex),
  keypairIdentity: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { SolanaService } from '../../../src/services/solana.service';
import { Connection, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';

describe('SolanaService', () => {
  let service: SolanaService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    
    // Set up environment
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    process.env.SOLANA_PAYER_SECRET_KEY = JSON.stringify([1, 2, 3, 4]);

    // Reset mock implementations
    mockMetaplex.nfts.mockReturnValue({
      create: jest.fn().mockResolvedValue({ nft: mockNft }),
    });

    service = new SolanaService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize connection with RPC URL from environment', () => {
      expect(Connection).toHaveBeenCalledWith(
        'https://api.devnet.solana.com',
        'confirmed'
      );
    });

    it('should use default RPC URL if not provided', () => {
      delete process.env.SOLANA_RPC_URL;
      (Connection as jest.Mock).mockClear();

      new SolanaService();

      expect(Connection).toHaveBeenCalledWith(
        'https://api.devnet.solana.com',
        'confirmed'
      );
    });

    it('should load payer keypair from environment', () => {
      expect(Keypair.fromSecretKey).toHaveBeenCalled();
    });

    it('should generate keypair if not provided and log warning', () => {
      delete process.env.SOLANA_PAYER_SECRET_KEY;
      (Keypair.generate as jest.Mock).mockClear();
      mockLoggerWarn.mockClear();

      new SolanaService();

      expect(Keypair.generate).toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Using generated keypair - fund this address:',
        'mock-public-key'
      );
    });

    it('should initialize Metaplex with keypair identity', () => {
      expect(mockMetaplex.use).toHaveBeenCalled();
    });
  });

  describe('mintTicketNFT', () => {
    const mockRequest = {
      ticketId: 'ticket-123',
      ownerAddress: 'owner-address',
      metadata: {
        name: 'VIP Ticket',
        symbol: 'VIP',
        uri: 'https://metadata.example.com/ticket-123',
        eventId: 'event-456',
        venueId: 'venue-789',
        seatNumber: 'A-101',
        eventDate: '2024-12-31',
      },
    };

    it('should return existing mint if already minted (idempotency)', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          mint_address: 'existing-mint-address',
        }),
      });

      const result = await service.mintTicketNFT(mockRequest);

      expect(result).toBe('existing-mint-address');
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Ticket ticket-123 already minted: existing-mint-address'
      );
    });

    it('should create new NFT if not already minted', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.mintTicketNFT(mockRequest);

      expect(result).toBe('mock-mint-address');
      expect(mockMetaplex.nfts().create).toHaveBeenCalledWith({
        uri: mockRequest.metadata.uri,
        name: mockRequest.metadata.name,
        symbol: mockRequest.metadata.symbol,
        sellerFeeBasisPoints: 250,
        creators: [
          {
            address: mockKeypair.publicKey,
            share: 100,
          },
        ],
        isMutable: false,
        maxSupply: 1,
      });
    });

    it('should store mint record for idempotency', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue(undefined),
      });

      await service.mintTicketNFT(mockRequest);

      expect(mockDb).toHaveBeenCalledWith('nft_mints');
      expect(mockDb().insert).toHaveBeenCalledWith({
        ticket_id: 'ticket-123',
        mint_address: 'mock-mint-address',
        metadata: JSON.stringify(mockNft.json),
        status: 'completed',
        created_at: expect.any(Date),
      });
      expect(mockDb().onConflict).toHaveBeenCalledWith('ticket_id');
      expect(mockDb().merge).toHaveBeenCalled();
    });

    it('should transfer NFT to owner if different from payer', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue(undefined),
      });

      await service.mintTicketNFT(mockRequest);

      // Transfer should be called since owner is different from payer
      expect(sendAndConfirmTransaction).toHaveBeenCalled();
    });

    it('should not transfer NFT if owner is payer', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue(undefined),
      });

      const requestSameOwner = {
        ...mockRequest,
        ownerAddress: 'mock-public-key',
      };

      (sendAndConfirmTransaction as jest.Mock).mockClear();
      await service.mintTicketNFT(requestSameOwner);

      // Transfer should NOT be called
      expect(sendAndConfirmTransaction).not.toHaveBeenCalled();
    });

    it('should log success with duration', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue(undefined),
      });

      await service.mintTicketNFT(mockRequest);

      // Check that logger was called with the mint success message
      const mintLogCall = mockLoggerInfo.mock.calls.find(call =>
        call[0] && call[0].includes('NFT minted in')
      );
      expect(mintLogCall).toBeDefined();
      expect(mintLogCall[0]).toContain('mock-mint-address');
    });

    it('should handle errors and log them', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const error = new Error('Mint failed');
      mockMetaplex.nfts.mockReturnValue({
        create: jest.fn().mockRejectedValue(error),
      });

      await expect(service.mintTicketNFT(mockRequest)).rejects.toThrow('Mint failed');
      expect(mockLoggerError).toHaveBeenCalledWith('Mint failed:', error);
    });

    it('should not retry on non-retryable errors', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const nonRetryableError = new Error('Invalid metadata');
      mockMetaplex.nfts.mockReturnValue({
        create: jest.fn().mockRejectedValue(nonRetryableError),
      });

      await expect(service.mintTicketNFT(mockRequest)).rejects.toThrow('Invalid metadata');
      
      // Should not log retry message
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(expect.stringContaining('Retrying'));
    });
  });

  describe('transferNFT', () => {
    const mockTransferRequest = {
      tokenAddress: 'token-address',
      fromAddress: 'from-address',
      toAddress: 'to-address',
      amount: 1,
    };

    it('should transfer NFT successfully', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({ data: 'exists' });
      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.transferNFT(mockTransferRequest);

      expect(result).toBe('mock-signature');
      expect(sendAndConfirmTransaction).toHaveBeenCalled();
    });

    it('should create associated token account if it does not exist', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);
      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue(undefined),
      });

      await service.transferNFT(mockTransferRequest);

      expect(mockConnection.getAccountInfo).toHaveBeenCalled();
      // Transaction should have instructions to create account
      expect(sendAndConfirmTransaction).toHaveBeenCalled();
    });

    it('should store transfer record', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({ data: 'exists' });
      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue(undefined),
      });

      await service.transferNFT(mockTransferRequest);

      expect(mockDb).toHaveBeenCalledWith('nft_transfers');
      expect(mockDb().insert).toHaveBeenCalledWith({
        token_address: 'token-address',
        from_address: 'from-address',
        to_address: 'to-address',
        amount: 1,
        signature: 'mock-signature',
        status: 'completed',
        created_at: expect.any(Date),
      });
    });

    it('should log success with duration', async () => {
      mockConnection.getAccountInfo.mockResolvedValue({ data: 'exists' });
      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue(undefined),
      });

      await service.transferNFT(mockTransferRequest);

      // Check that logger was called with the transfer success message
      const transferLogCall = mockLoggerInfo.mock.calls.find(call =>
        call[0] && call[0].includes('NFT transferred in')
      );
      expect(transferLogCall).toBeDefined();
      expect(transferLogCall[0]).toContain('mock-signature');
    });

    it('should handle transfer errors', async () => {
      const error = new Error('Transfer failed');
      (sendAndConfirmTransaction as jest.Mock).mockRejectedValue(error);

      await expect(service.transferNFT(mockTransferRequest)).rejects.toThrow('Transfer failed');
      expect(mockLoggerError).toHaveBeenCalledWith('Transfer failed:', error);
    });
  });

  describe('verifyOwnership', () => {
    it('should return true if owner has 1 token', async () => {
      mockConnection.getTokenAccountBalance.mockResolvedValue({
        value: { uiAmount: 1 },
      });

      const result = await service.verifyOwnership('token-address', 'owner-address');

      expect(result).toBe(true);
    });

    it('should return false if owner has 0 tokens', async () => {
      mockConnection.getTokenAccountBalance.mockResolvedValue({
        value: { uiAmount: 0 },
      });

      const result = await service.verifyOwnership('token-address', 'owner-address');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockConnection.getTokenAccountBalance.mockRejectedValue(new Error('Account not found'));

      const result = await service.verifyOwnership('token-address', 'owner-address');

      expect(result).toBe(false);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Ownership verification failed:',
        expect.any(Error)
      );
    });
  });

  describe('getTransactionStatus', () => {
    it('should return finalized for finalized transactions', async () => {
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: {
          err: null,
          confirmationStatus: 'finalized',
        },
      });

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('finalized');
    });

    it('should return confirmed for confirmed transactions', async () => {
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: {
          err: null,
          confirmationStatus: 'confirmed',
        },
      });

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('confirmed');
    });

    it('should return failed for transactions with errors', async () => {
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: {
          err: 'Transaction failed',
          confirmationStatus: 'confirmed',
        },
      });

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('failed');
    });

    it('should return unknown if status not available', async () => {
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: null,
      });

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('unknown');
    });

    it('should return processing for pending transactions', async () => {
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: {
          err: null,
          confirmationStatus: 'processed',
        },
      });

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('processing');
    });

    it('should return error on exception', async () => {
      mockConnection.getSignatureStatus.mockRejectedValue(new Error('RPC error'));

      const result = await service.getTransactionStatus('signature');

      expect(result).toBe('error');
      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true when connection is healthy', async () => {
      mockConnection.getBlockHeight.mockResolvedValue(12345);
      mockConnection.getBalance.mockResolvedValue(1000000000); // 1 SOL

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Solana health check:', {
        blockHeight: 12345,
        balance: 1,
        address: 'mock-public-key',
      });
    });

    it('should return false on connection error', async () => {
      mockConnection.getBlockHeight.mockRejectedValue(new Error('Connection failed'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Solana health check failed:',
        expect.any(Error)
      );
    });

    it('should return false if block height is 0', async () => {
      mockConnection.getBlockHeight.mockResolvedValue(0);
      mockConnection.getBalance.mockResolvedValue(0);

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });
});
