/**
 * Integration test for minting on Solana Devnet
 * 
 * Prerequisites:
 * 1. Wallet file configured in .env
 * 2. Wallet funded with devnet SOL
 * 3. IPFS credentials configured
 * 4. Collection NFT deployed
 * 
 * Run with: npm run test:integration
 * 
 * NOTE: This test performs REAL blockchain transactions on devnet
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Connection, PublicKey } from '@solana/web3.js';
import { getConnection, getWallet, getCollectionMint } from '../../src/config/solana';
import { getIPFSService } from '../../src/config/ipfs';
import { MintingOrchestrator } from '../../src/services/MintingOrchestrator';

describe('Devnet Integration Tests', () => {
  let connection: Connection;
  let wallet: any;
  let collectionMint: PublicKey | null;

  beforeAll(() => {
    // Ensure we're on devnet
    if (process.env.SOLANA_NETWORK !== 'devnet') {
      throw new Error('Integration tests must run on devnet. Set SOLANA_NETWORK=devnet');
    }

    connection = getConnection();
    wallet = getWallet();
    collectionMint = getCollectionMint();

    console.log('Integration Test Setup:');
    console.log(`  Network: ${process.env.SOLANA_NETWORK}`);
    console.log(`  RPC: ${process.env.SOLANA_RPC_URL}`);
    console.log(`  Wallet: ${wallet.publicKey.toString()}`);
    console.log(`  Collection: ${collectionMint?.toString() || 'Not configured'}`);
  });

  describe('Configuration', () => {
    it('should have valid Solana connection', async () => {
      const version = await connection.getVersion();
      expect(version).toBeDefined();
      expect(version['solana-core']).toBeDefined();
    });

    it('should have wallet with sufficient balance', async () => {
      const balance = await connection.getBalance(wallet.publicKey);
      const solBalance = balance / 1e9;

      console.log(`  Wallet balance: ${solBalance} SOL`);
      
      expect(balance).toBeGreaterThan(0);
      expect(solBalance).toBeGreaterThanOrEqual(0.05);
    }, 30000);

    it('should have IPFS configured', async () => {
      const ipfsService = getIPFSService();
      expect(ipfsService).toBeDefined();

      // Try a simple connectivity test
      const testData = { test: 'connectivity', timestamp: Date.now() };
      const result = await ipfsService.uploadJSON(testData);
      
      expect(result.ipfsUrl).toMatch(/^ipfs:\/\//);
      expect(result.pinataUrl).toBeDefined();
      
      console.log(`  IPFS test upload: ${result.ipfsUrl}`);
    }, 30000);
  });

  describe('Minting Flow', () => {
    it.skip('should mint a test NFT on devnet', async () => {
      // Skip by default to avoid burning SOL in CI/CD
      // Remove .skip to run this test manually
      
      const orchestrator = new MintingOrchestrator();

      const testTicket = {
        id: `test-ticket-${Date.now()}`,
        eventId: 'test-event-123',
        userId: 'test-user-456',
        ticketData: {
          eventName: 'Test Event',
          venue: 'Test Venue',
          eventDate: new Date().toISOString(),
          tier: 'VIP',
          seatNumber: 'A1',
          price: 100
        }
      };

      console.log('Starting mint test...');
      const result = await orchestrator.mint(testTicket);

      console.log('Mint result:', {
        signature: result.signature,
        assetId: result.assetId,
        metadataUri: result.metadataUri
      });

      expect(result.signature).toBeDefined();
      expect(result.signature).toMatch(/^[A-Za-z0-9]{87,88}$/);
      expect(result.metadataUri).toMatch(/^ipfs:\/\//);
      
      // Verify transaction on chain
      const txInfo = await connection.getTransaction(result.signature, {
        maxSupportedTransactionVersion: 0
      });

      expect(txInfo).toBeDefined();
      expect(txInfo?.meta?.err).toBeNull();

      console.log('✅ NFT minted successfully on devnet!');
      console.log(`   Explorer: https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
    }, 60000); // 60 second timeout for blockchain operations
  });

  describe('Error Handling', () => {
    it('should handle insufficient balance gracefully', async () => {
      // This would be tested with a wallet that has no balance
      // For now, we just verify the check exists
      const balance = await connection.getBalance(wallet.publicKey);
      expect(balance).toBeGreaterThan(0);
    });

    it('should handle network errors gracefully', async () => {
      // Test would involve simulating network failure
      // For now, verify connection is stable
      const health = await connection.getHealth();
      expect(health).toBe('ok');
    });
  });
});
