/**
 * Unit Tests for BlockchainTransferService
 * 
 * Tests:
 * - Blockchain transfer execution
 * - Deduplication checks
 * - Retry logic integration
 * - Service client integration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { BlockchainTransferService } from '../../../src/services/blockchain-transfer.service';

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/nft.service', () => ({
  nftService: {
    verifyOwnership: jest.fn(),
    transferNFT: jest.fn(),
    getNFTOwner: jest.fn(),
    getNFTMetadata: jest.fn()
  }
}));
jest.mock('../../../src/utils/blockchain-retry', () => ({
  retryBlockchainOperation: jest.fn((fn) => fn()),
  pollForConfirmation: jest.fn()
}));
jest.mock('../../../src/utils/blockchain-metrics', () => ({
  blockchainMetrics: {
    recordTransferSuccess: jest.fn(),
    recordTransferFailure: jest.fn()
  }
}));
jest.mock('@tickettoken/shared/clients', () => ({
  ticketServiceClient: {
    updateNft: jest.fn(),
    getTicketFull: jest.fn()
  }
}));

describe('BlockchainTransferService', () => {
  let blockchainService: BlockchainTransferService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  let nftService: any;
  let ticketServiceClient: any;
  let pollForConfirmation: any;
  let blockchainMetrics: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    } as any;

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    } as any;

    blockchainService = new BlockchainTransferService(mockPool);

    nftService = require('../../../src/services/nft.service').nftService;
    ticketServiceClient = require('@tickettoken/shared/clients').ticketServiceClient;
    pollForConfirmation = require('../../../src/utils/blockchain-retry').pollForConfirmation;
    blockchainMetrics = require('../../../src/utils/blockchain-metrics').blockchainMetrics;

    jest.clearAllMocks();
  });

  describe('executeBlockchainTransfer()', () => {
    it('should execute blockchain transfer successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] }) // check existing
        .mockResolvedValueOnce({}) // mark in progress
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE ticket_transfers
        .mockResolvedValueOnce({}) // COMMIT

      nftService.verifyOwnership
        .mockResolvedValueOnce(true) // ownership check
        .mockResolvedValueOnce(true); // confirmation check

      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.solana.com/tx/sig-123'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockResolvedValue({});

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(true);
      expect(result.signature).toBe('sig-123');
      expect(result.explorerUrl).toContain('sig-123');
      expect(blockchainMetrics.recordTransferSuccess).toHaveBeenCalled();
    });

    it('should return existing result if already executed', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          blockchain_signature: 'existing-sig',
          blockchain_explorer_url: 'https://explorer.solana.com/tx/existing-sig',
          blockchain_transfer_status: 'COMPLETED'
        }]
      });

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(true);
      expect(result.signature).toBe('existing-sig');
      expect(nftService.transferNFT).not.toHaveBeenCalled();
    });

    it('should throw error if transfer in progress', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          blockchain_signature: null,
          blockchain_transfer_status: 'IN_PROGRESS',
          blockchain_transferred_at: new Date()
        }]
      });

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('TRANSFER_IN_PROGRESS');
    });

    it('should mark transfer as in progress', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({}); // mark in progress

      nftService.verifyOwnership.mockRejectedValue(new Error('Test error'));

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      const markInProgressCall = mockClient.query.mock.calls[1];
      expect(markInProgressCall[0]).toContain("blockchain_transfer_status = 'IN_PROGRESS'");
    });

    it('should verify NFT ownership before transfer', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({});

      nftService.verifyOwnership.mockResolvedValue(false);

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ownership verification failed');
      expect(blockchainMetrics.recordTransferFailure).toHaveBeenCalledWith('ownership_verification_failed');
    });

    it('should handle NFT transfer failure', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: false,
        error: 'Transfer failed'
      });

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transfer failed');
      expect(blockchainMetrics.recordTransferFailure).toHaveBeenCalledWith('blockchain_transfer_failed');
    });

    it('should wait for transaction confirmation', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.com'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockResolvedValue({});

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(pollForConfirmation).toHaveBeenCalled();
    });

    it('should update ticket via service client', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.com'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockResolvedValue({});

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(ticketServiceClient.updateNft).toHaveBeenCalledWith(
        'ticket-1',
        expect.objectContaining({
          nftMintAddress: 'mint-123',
          nftTransferSignature: 'sig-123',
          walletAddress: 'wallet-to'
        }),
        expect.anything()
      );
    });

    it('should fallback to local update if service client fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.com'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockRejectedValue(new Error('Service error'));

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      // Should have fallback UPDATE tickets query
      const ticketUpdateCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('UPDATE tickets')
      );
      expect(ticketUpdateCall).toBeDefined();
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({});

      nftService.verifyOwnership.mockRejectedValue(new Error('Verification failed'));

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should record failed transfer', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({});

      mockPool.query.mockResolvedValue({});

      nftService.verifyOwnership.mockRejectedValue(new Error('Test error'));

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_blockchain_transfers'),
        expect.arrayContaining(['transfer-1', 'Test error'])
      );
    });

    it('should release client on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.com'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockResolvedValue({});

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ blockchain_signature: null, blockchain_transfer_status: null }] })
        .mockResolvedValueOnce({});

      nftService.verifyOwnership.mockRejectedValue(new Error('Error'));

      await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getBlockchainTransferDetails()', () => {
    it('should return transfer details', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          blockchain_signature: 'sig-123',
          blockchain_explorer_url: 'https://explorer.com',
          blockchain_transferred_at: new Date()
        }]
      } as any);

      const result = await blockchainService.getBlockchainTransferDetails('transfer-1');

      expect(result).toBeDefined();
      expect(result.blockchain_signature).toBe('sig-123');
    });

    it('should return null if not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await blockchainService.getBlockchainTransferDetails('transfer-1');

      expect(result).toBeNull();
    });
  });

  describe('verifyBlockchainTransfer()', () => {
    it('should verify transfer succeeded', async () => {
      nftService.getNFTOwner.mockResolvedValue('expected-owner');

      const result = await blockchainService.verifyBlockchainTransfer('mint-123', 'expected-owner');

      expect(result).toBe(true);
    });

    it('should return false if owner mismatch', async () => {
      nftService.getNFTOwner.mockResolvedValue('different-owner');

      const result = await blockchainService.verifyBlockchainTransfer('mint-123', 'expected-owner');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      nftService.getNFTOwner.mockRejectedValue(new Error('Error'));

      const result = await blockchainService.verifyBlockchainTransfer('mint-123', 'expected-owner');

      expect(result).toBe(false);
    });
  });

  describe('getTicketNFTMetadata()', () => {
    it('should get metadata via service client', async () => {
      ticketServiceClient.getTicketFull.mockResolvedValue({
        mintAddress: 'mint-123'
      });

      nftService.getNFTMetadata.mockResolvedValue({ name: 'NFT' });

      const result = await blockchainService.getTicketNFTMetadata('ticket-1');

      expect(result).toEqual({ name: 'NFT' });
      expect(ticketServiceClient.getTicketFull).toHaveBeenCalledWith('ticket-1', expect.anything());
    });

    it('should return null if ticket has no mint address', async () => {
      ticketServiceClient.getTicketFull.mockResolvedValue({
        mintAddress: null
      });

      const result = await blockchainService.getTicketNFTMetadata('ticket-1');

      expect(result).toBeNull();
    });

    it('should fallback to direct query on service error', async () => {
      ticketServiceClient.getTicketFull.mockRejectedValue(new Error('Service error'));
      mockPool.query.mockResolvedValue({
        rows: [{ nft_mint_address: 'mint-123' }]
      } as any);

      nftService.getNFTMetadata.mockResolvedValue({ name: 'NFT' });

      const result = await blockchainService.getTicketNFTMetadata('ticket-1');

      expect(result).toEqual({ name: 'NFT' });
    });

    it('should return null if no mint address in fallback', async () => {
      ticketServiceClient.getTicketFull.mockRejectedValue(new Error('Service error'));
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await blockchainService.getTicketNFTMetadata('ticket-1');

      expect(result).toBeNull();
    });
  });

  describe('Stale In-Progress Detection', () => {
    it('should allow retry for stale in-progress status', async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            blockchain_signature: null,
            blockchain_transfer_status: 'IN_PROGRESS',
            blockchain_transferred_at: staleDate
          }]
        })
        .mockResolvedValueOnce({})
        .mockResolvedValue({});

      nftService.verifyOwnership.mockResolvedValue(true);
      nftService.transferNFT.mockResolvedValue({
        success: true,
        signature: 'sig-123',
        explorerUrl: 'https://explorer.com'
      });

      pollForConfirmation.mockResolvedValue(true);
      ticketServiceClient.updateNft.mockResolvedValue({});

      const result = await blockchainService.executeBlockchainTransfer({
        transferId: 'transfer-1',
        ticketId: 'ticket-1',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        nftMintAddress: 'mint-123'
      });

      expect(result.success).toBe(true);
    });
  });
});
