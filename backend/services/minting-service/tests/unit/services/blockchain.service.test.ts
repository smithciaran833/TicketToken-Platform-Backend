/**
 * Unit tests for MintingBlockchainService
 * Tests blockchain integration for ticket registration
 */

// Mock dependencies before imports
jest.mock('@tickettoken/shared', () => ({
  BlockchainClient: jest.fn().mockImplementation(() => ({
    registerTicket: jest.fn(),
    close: jest.fn()
  })),
  BlockchainError: class BlockchainError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BlockchainError';
    }
  }
}));

jest.mock('pino', () => jest.fn(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
})));

import { MintingBlockchainService } from '../../../src/services/blockchain.service';
import { BlockchainClient, BlockchainError } from '@tickettoken/shared';

describe('MintingBlockchainService', () => {
  let service: MintingBlockchainService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      registerTicket: jest.fn().mockResolvedValue({
        ticketPda: 'mockTicketPda123',
        signature: 'mockSignature123'
      }),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    (BlockchainClient as jest.Mock).mockImplementation(() => mockClient);
    
    service = new MintingBlockchainService();
  });

  afterEach(async () => {
    await service.close();
  });

  describe('getClient', () => {
    it('should create with correct config', async () => {
      const ticketData = {
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      };
      
      await service.registerTicketOnChain(ticketData);
      
      expect(BlockchainClient).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcUrl: expect.any(String),
          programId: expect.any(String),
          platformWalletPath: expect.any(String),
          commitment: 'confirmed'
        })
      );
    });

    it('should use env vars', async () => {
      const originalRpcUrl = process.env.SOLANA_RPC_URL;
      const originalProgramId = process.env.TICKETTOKEN_PROGRAM_ID;
      
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.example.com';
      process.env.TICKETTOKEN_PROGRAM_ID = 'CustomProgramId123';
      
      // Create new service to pick up new env vars
      const newService = new MintingBlockchainService();
      
      await newService.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      expect(BlockchainClient).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcUrl: 'https://custom-rpc.example.com',
          programId: 'CustomProgramId123'
        })
      );
      
      await newService.close();
      
      process.env.SOLANA_RPC_URL = originalRpcUrl;
      process.env.TICKETTOKEN_PROGRAM_ID = originalProgramId;
    });

    it('should use defaults when env not set', async () => {
      const originalRpcUrl = process.env.SOLANA_RPC_URL;
      const originalProgramId = process.env.TICKETTOKEN_PROGRAM_ID;
      
      delete process.env.SOLANA_RPC_URL;
      delete process.env.TICKETTOKEN_PROGRAM_ID;
      
      const newService = new MintingBlockchainService();
      
      await newService.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      expect(BlockchainClient).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcUrl: 'https://api.devnet.solana.com',
          programId: 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS'
        })
      );
      
      await newService.close();
      
      process.env.SOLANA_RPC_URL = originalRpcUrl;
      process.env.TICKETTOKEN_PROGRAM_ID = originalProgramId;
    });

    it('should return singleton', async () => {
      const ticketData = {
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      };
      
      await service.registerTicketOnChain(ticketData);
      await service.registerTicketOnChain(ticketData);
      
      // BlockchainClient should only be instantiated once
      expect(BlockchainClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerTicketOnChain', () => {
    const mockTicketData = {
      eventPda: 'eventPda123',
      ticketId: 42,
      nftAssetId: 'nftAsset123',
      ownerId: 'owner456'
    };

    it('should call client.registerTicket', async () => {
      await service.registerTicketOnChain(mockTicketData);
      
      expect(mockClient.registerTicket).toHaveBeenCalledWith({
        eventPda: 'eventPda123',
        ticketId: 42,
        nftAssetId: 'nftAsset123',
        ownerId: 'owner456'
      });
    });

    it('should return registration result', async () => {
      const result = await service.registerTicketOnChain(mockTicketData);
      
      expect(result).toEqual({
        ticketPda: 'mockTicketPda123',
        signature: 'mockSignature123'
      });
    });

    it('should log success', async () => {
      await service.registerTicketOnChain(mockTicketData);
      
      // Pino logger is mocked, we just verify no errors thrown
      expect(mockClient.registerTicket).toHaveBeenCalled();
    });

    it('should re-throw BlockchainError', async () => {
      const blockchainError = new BlockchainError('Blockchain operation failed');
      mockClient.registerTicket.mockRejectedValue(blockchainError);
      
      await expect(
        service.registerTicketOnChain(mockTicketData)
      ).rejects.toThrow(BlockchainError);
    });

    it('should wrap other errors in BlockchainError', async () => {
      mockClient.registerTicket.mockRejectedValue(new Error('Generic error'));
      
      await expect(
        service.registerTicketOnChain(mockTicketData)
      ).rejects.toThrow(BlockchainError);
    });

    it('should include original error message in wrapped error', async () => {
      mockClient.registerTicket.mockRejectedValue(new Error('Specific failure'));
      
      await expect(
        service.registerTicketOnChain(mockTicketData)
      ).rejects.toThrow(/Specific failure/);
    });

    it('should pass all ticket data fields', async () => {
      const fullTicketData = {
        eventPda: 'event-pda-full',
        ticketId: 100,
        nftAssetId: 'nft-asset-full',
        ownerId: 'owner-full'
      };
      
      await service.registerTicketOnChain(fullTicketData);
      
      expect(mockClient.registerTicket).toHaveBeenCalledWith(fullTicketData);
    });
  });

  describe('close', () => {
    it('should close client', async () => {
      // Initialize the client first
      await service.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      await service.close();
      
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should nullify client after close', async () => {
      // Initialize the client
      await service.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      await service.close();
      
      // Calling registerTicketOnChain again should create a new client
      await service.registerTicketOnChain({
        eventPda: 'event456',
        ticketId: 2,
        nftAssetId: 'nft456',
        ownerId: 'owner456'
      });
      
      // Should have been called twice (once before close, once after)
      expect(BlockchainClient).toHaveBeenCalledTimes(2);
    });

    it('should handle close when client not initialized', async () => {
      // Don't initialize client, just call close
      await expect(service.close()).resolves.not.toThrow();
    });

    it('should handle multiple close calls', async () => {
      await service.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      await service.close();
      await service.close(); // Second close should not throw
      
      // close should only be called once on the client
      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle string errors', async () => {
      mockClient.registerTicket.mockRejectedValue('String error');
      
      await expect(
        service.registerTicketOnChain({
          eventPda: 'event123',
          ticketId: 1,
          nftAssetId: 'nft123',
          ownerId: 'owner123'
        })
      ).rejects.toThrow(BlockchainError);
    });

    it('should handle null/undefined errors', async () => {
      mockClient.registerTicket.mockRejectedValue(null);
      
      await expect(
        service.registerTicketOnChain({
          eventPda: 'event123',
          ticketId: 1,
          nftAssetId: 'nft123',
          ownerId: 'owner123'
        })
      ).rejects.toThrow(BlockchainError);
    });
  });

  describe('configuration', () => {
    it('should use PLATFORM_WALLET_PATH from env', async () => {
      const originalPath = process.env.PLATFORM_WALLET_PATH;
      process.env.PLATFORM_WALLET_PATH = '/custom/wallet/path.json';
      
      const newService = new MintingBlockchainService();
      
      await newService.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      expect(BlockchainClient).toHaveBeenCalledWith(
        expect.objectContaining({
          platformWalletPath: '/custom/wallet/path.json'
        })
      );
      
      await newService.close();
      process.env.PLATFORM_WALLET_PATH = originalPath;
    });

    it('should set commitment to confirmed', async () => {
      await service.registerTicketOnChain({
        eventPda: 'event123',
        ticketId: 1,
        nftAssetId: 'nft123',
        ownerId: 'owner123'
      });
      
      expect(BlockchainClient).toHaveBeenCalledWith(
        expect.objectContaining({
          commitment: 'confirmed'
        })
      );
    });
  });
});
