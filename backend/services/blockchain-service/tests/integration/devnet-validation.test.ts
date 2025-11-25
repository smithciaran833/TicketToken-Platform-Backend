import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TreasuryWallet } from '../../src/wallets/treasury';

/**
 * Devnet Validation Tests
 * 
 * These tests validate the service works correctly with Solana devnet.
 * Run these manually when you have devnet SOL available.
 * 
 * To run: npm run test:integration -- devnet-validation
 */
describe('Devnet Validation Tests', () => {
  let connection: Connection;
  let treasuryWallet: TreasuryWallet;
  
  beforeAll(() => {
    // Connect to devnet
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Create a treasury wallet (would normally load from env)
    const keypair = Keypair.generate();
    treasuryWallet = new TreasuryWallet(connection, keypair);
  });

  // Skip these tests by default - they require funded accounts
  describe.skip('Treasury Wallet Operations', () => {
    it('should have sufficient balance', async () => {
      const balance = await treasuryWallet.getBalance();
      
      // Treasury should have at least 0.1 SOL for operations
      expect(balance).toBeGreaterThan(0.1);
    });

    it('should check treasury balance status', async () => {
      const balance = await treasuryWallet.getBalance();
      
      // Balance should be a number
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Devnet Connection Health', () => {
    it('should connect to devnet successfully', async () => {
      const version = await connection.getVersion();
      
      expect(version).toBeDefined();
      expect(version['solana-core']).toBeDefined();
    });

    it('should get current slot from devnet', async () => {
      const slot = await connection.getSlot();
      
      expect(slot).toBeGreaterThan(0);
      expect(typeof slot).toBe('number');
    });

    it('should get recent blockhash from devnet', async () => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      expect(blockhash).toBeDefined();
      expect(blockhash.length).toBeGreaterThan(0);
      expect(lastValidBlockHeight).toBeGreaterThan(0);
    });

    it('should get epoch info from devnet', async () => {
      const epochInfo = await connection.getEpochInfo();
      
      expect(epochInfo.epoch).toBeGreaterThanOrEqual(0);
      expect(epochInfo.slotIndex).toBeGreaterThanOrEqual(0);
      expect(epochInfo.slotsInEpoch).toBeGreaterThan(0);
    });

    it('should get minimum balance for rent exemption', async () => {
      const minBalance = await connection.getMinimumBalanceForRentExemption(165);
      
      expect(minBalance).toBeGreaterThan(0);
    });
  });

  describe('Account Queries', () => {
    it('should query account balance', async () => {
      const testAddress = Keypair.generate().publicKey;
      const balance = await connection.getBalance(testAddress);
      
      // New account should have 0 balance
      expect(balance).toBe(0);
    });

    it('should query account info', async () => {
      const testAddress = Keypair.generate().publicKey;
      const accountInfo = await connection.getAccountInfo(testAddress);
      
      // New account should not exist
      expect(accountInfo).toBeNull();
    });

    it('should get token accounts by owner (empty for new address)', async () => {
      const testAddress = Keypair.generate().publicKey;
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        testAddress,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );
      
      expect(tokenAccounts.value).toHaveLength(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should measure RPC response time', async () => {
      const startTime = Date.now();
      await connection.getSlot();
      const endTime = Date.now();
      
      const latency = endTime - startTime;
      
      // RPC should respond within 3 seconds
      expect(latency).toBeLessThan(3000);
    });

    it('should get performance samples', async () => {
      const samples = await connection.getRecentPerformanceSamples(5);
      
      expect(Array.isArray(samples)).toBe(true);
      expect(samples.length).toBeGreaterThan(0);
      expect(samples[0].numTransactions).toBeGreaterThan(0);
    });
  });

  describe.skip('Manual Validation (requires funded wallet)', () => {
    /**
     * These tests should be run manually with a funded devnet wallet
     * to validate end-to-end minting operations
     */
    
    it('should validate treasury wallet has funds', async () => {
      const balance = await treasuryWallet.getBalance();
      console.log(`Treasury Balance: ${balance} SOL`);
      
      expect(balance).toBeGreaterThan(0);
    });

    it('should request airdrop on devnet', async () => {
      const testWallet = Keypair.generate();
      
      // Request 1 SOL airdrop
      const signature = await connection.requestAirdrop(
        testWallet.publicKey,
        LAMPORTS_PER_SOL
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature);
      
      // Check balance
      const balance = await connection.getBalance(testWallet.publicKey);
      expect(balance).toBeGreaterThan(0);
    });
  });
});
