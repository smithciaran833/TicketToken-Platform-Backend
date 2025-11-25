import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BlockchainQueryService from '../../src/services/BlockchainQueryService';
import TransactionConfirmationService from '../../src/services/TransactionConfirmationService';

describe('Solana Integration Tests', () => {
  let connection: Connection;
  let queryService: BlockchainQueryService;
  let confirmationService: TransactionConfirmationService;
  let testWallet: Keypair;

  beforeAll(() => {
    // Use devnet for integration tests
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    queryService = new BlockchainQueryService(connection);
    confirmationService = new TransactionConfirmationService(connection);
    testWallet = Keypair.generate();
  });

  describe('BlockchainQueryService', () => {
    it('should get current slot', async () => {
      const slot = await queryService.getCurrentSlot();
      expect(slot).toBeGreaterThan(0);
      expect(typeof slot).toBe('number');
    });

    it('should get latest blockhash', async () => {
      const blockhash = await queryService.getLatestBlockhash();
      expect(blockhash).toBeDefined();
      expect(blockhash.blockhash).toBeDefined();
      expect(blockhash.lastValidBlockHeight).toBeGreaterThan(0);
    });

    it('should get balance for any address', async () => {
      const balance = await queryService.getBalance(testWallet.publicKey.toString());
      expect(balance).toBeGreaterThanOrEqual(0);
      expect(typeof balance).toBe('number');
    });

    it('should get minimum rent exemption', async () => {
      const minBalance = await queryService.getMinimumBalanceForRentExemption(165);
      expect(minBalance).toBeGreaterThan(0);
      expect(typeof minBalance).toBe('number');
    });

    it('should handle non-existent account gracefully', async () => {
      const accountInfo = await queryService.getAccountInfo(testWallet.publicKey.toString());
      // New account should not exist
      expect(accountInfo).toBeNull();
    });

    it('should get token accounts (empty for new wallet)', async () => {
      const tokens = await queryService.getTokenAccounts(testWallet.publicKey.toString());
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens).toHaveLength(0);
    });

    it('should get NFTs (empty for new wallet)', async () => {
      const nfts = await queryService.getNFTsByOwner(testWallet.publicKey.toString());
      expect(Array.isArray(nfts)).toBe(true);
      expect(nfts).toHaveLength(0);
    });
  });

  describe('TransactionConfirmationService', () => {
    it('should handle non-existent transaction', async () => {
      const fakeSignature = '1'.repeat(88);
      
      await expect(
        confirmationService.getTransactionStatus(fakeSignature)
      ).rejects.toThrow();
    });

    it('should get block time for a slot', async () => {
      // Get current slot first
      const currentSlot = await connection.getSlot();
      
      // Get block time for a recent slot (current - 100)
      const recentSlot = currentSlot - 100;
      const blockTime = await queryService.getBlockTime(recentSlot);
      
      // Should either have a time or be null if slot not yet processed
      if (blockTime !== null) {
        expect(blockTime).toBeGreaterThan(0);
        expect(typeof blockTime).toBe('number');
      }
    });
  });

  describe('Connection Health', () => {
   
    it('should connect to Solana devnet', async () => {
      const version = await connection.getVersion();
      expect(version).toBeDefined();
      expect(version['solana-core']).toBeDefined();
    });

    it('should get recent performance samples', async () => {
      const samples = await connection.getRecentPerformanceSamples(1);
      expect(Array.isArray(samples)).toBe(true);
      expect(samples.length).toBeGreaterThan(0);
    });
  });
});
