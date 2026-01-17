/**
 * Unit Tests for Solana Configuration
 * 
 * Tests:
 * - Environment variable validation
 * - Helper functions (cluster name, explorer URL)
 * - Configuration structure
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Mock dependencies BEFORE any imports
jest.mock('@solana/web3.js');
jest.mock('@metaplex-foundation/js');
jest.mock('bs58');

// Set up environment before importing config
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_TREASURY_PRIVATE_KEY = 'base58privatekey123';
process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';

describe('Solana Configuration', () => {
  describe('Environment Variable Validation', () => {
    it('should throw error when SOLANA_RPC_URL is missing', () => {
      const originalEnv = { ...process.env };
      
      expect(() => {
        jest.resetModules();
        delete process.env.SOLANA_RPC_URL;
        require('../../../src/config/solana.config');
      }).toThrow('Missing required environment variable: SOLANA_RPC_URL');
      
      process.env = originalEnv;
    });

    it('should throw error when SOLANA_TREASURY_PRIVATE_KEY is missing', () => {
      const originalEnv = { ...process.env };
      
      expect(() => {
        jest.resetModules();
        delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
        require('../../../src/config/solana.config');
      }).toThrow('Missing required environment variable: SOLANA_TREASURY_PRIVATE_KEY');
      
      process.env = originalEnv;
    });

    it('should throw error when SOLANA_COLLECTION_MINT is missing', () => {
      const originalEnv = { ...process.env };
      
      expect(() => {
        jest.resetModules();
        delete process.env.SOLANA_COLLECTION_MINT;
        require('../../../src/config/solana.config');
      }).toThrow('Missing required environment variable: SOLANA_COLLECTION_MINT');
      
      process.env = originalEnv;
    });

    it('should not throw when all required env vars are present', () => {
      expect(() => {
        jest.resetModules();
        process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
        process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
        process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
        require('../../../src/config/solana.config');
      }).not.toThrow();
    });
  });

  describe('getClusterName()', () => {
    let getClusterName: (rpcUrl?: string) => string;

    beforeAll(() => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      getClusterName = config.getClusterName;
    });

    it('should return "devnet" for devnet RPC URL', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      expect(getClusterName()).toBe('devnet');
    });

    it('should return "testnet" for testnet RPC URL', () => {
      process.env.SOLANA_RPC_URL = 'https://api.testnet.solana.com';
      expect(getClusterName()).toBe('testnet');
    });

    it('should return "mainnet-beta" for mainnet RPC URL', () => {
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
      expect(getClusterName()).toBe('mainnet-beta');
    });

    it('should return "localnet" for localhost RPC URL', () => {
      process.env.SOLANA_RPC_URL = 'http://localhost:8899';
      expect(getClusterName()).toBe('localnet');
    });

    it('should return "localnet" for custom RPC URL', () => {
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.example.com';
      expect(getClusterName()).toBe('localnet');
    });

    it('should use case-sensitive cluster detection', () => {
      // The implementation uses .includes() which is case-sensitive
      process.env.SOLANA_RPC_URL = 'https://api.DEVNET.solana.com';
      expect(getClusterName()).toBe('localnet'); // Uppercase not detected
    });

    it('should handle RPC URL with trailing slash', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com/';
      expect(getClusterName()).toBe('devnet');
    });

    it('should handle RPC URL with query parameters', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com?api-key=test';
      expect(getClusterName()).toBe('devnet');
    });

    it('should handle RPC URL with path', () => {
      process.env.SOLANA_RPC_URL = 'https://rpc.example.com/solana/devnet';
      expect(getClusterName()).toBe('devnet');
    });
  });

  describe('getExplorerUrl()', () => {
    let getExplorerUrl: (signature: string) => string;

    beforeAll(() => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      getExplorerUrl = config.getExplorerUrl;
    });

    it('should generate devnet explorer URL with cluster parameter', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const url = getExplorerUrl('signature123');
      expect(url).toBe('https://explorer.solana.com/tx/signature123?cluster=devnet');
    });

    it('should generate testnet explorer URL with cluster parameter', () => {
      process.env.SOLANA_RPC_URL = 'https://api.testnet.solana.com';
      const url = getExplorerUrl('signature456');
      expect(url).toBe('https://explorer.solana.com/tx/signature456?cluster=testnet');
    });

    it('should generate mainnet explorer URL without cluster parameter', () => {
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
      const url = getExplorerUrl('signature789');
      expect(url).toBe('https://explorer.solana.com/tx/signature789');
    });

    it('should generate localnet explorer URL with cluster parameter', () => {
      process.env.SOLANA_RPC_URL = 'http://localhost:8899';
      const url = getExplorerUrl('signatureABC');
      expect(url).toBe('https://explorer.solana.com/tx/signatureABC?cluster=localnet');
    });

    it('should handle special characters in signature', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const signature = '5Kf7FV8NTM9JaU3x4TqGhZVfPY8dVQ2zM7Lj3Ku4jW9X';
      const url = getExplorerUrl(signature);
      
      expect(url).toContain(signature);
      expect(url).toBe(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    });

    it('should handle empty signature', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const url = getExplorerUrl('');
      expect(url).toBe('https://explorer.solana.com/tx/?cluster=devnet');
    });

    it('should handle signature with special URL characters', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const signature = 'sig+with/special=chars';
      const url = getExplorerUrl(signature);
      expect(url).toContain('sig+with/special=chars');
    });

    it('should work with different cluster URLs', () => {
      const testCases = [
        { rpc: 'https://api.devnet.solana.com', cluster: 'devnet' },
        { rpc: 'https://api.testnet.solana.com', cluster: 'testnet' },
        { rpc: 'https://api.mainnet-beta.solana.com', cluster: '' },
        { rpc: 'http://localhost:8899', cluster: 'localnet' }
      ];

      for (const { rpc, cluster } of testCases) {
        process.env.SOLANA_RPC_URL = rpc;
        const url = getExplorerUrl('test-sig');
        
        if (cluster === '') {
          expect(url).toBe('https://explorer.solana.com/tx/test-sig');
        } else {
          expect(url).toBe(`https://explorer.solana.com/tx/test-sig?cluster=${cluster}`);
        }
      }
    });
  });

  describe('Configuration Structure', () => {
    let solanaConfig: any;

    beforeAll(() => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      solanaConfig = config.solanaConfig;
    });

    it('should export solanaConfig object', () => {
      expect(solanaConfig).toBeDefined();
      expect(typeof solanaConfig).toBe('object');
    });

    it('should have connection property', () => {
      expect(solanaConfig.connection).toBeDefined();
    });

    it('should have metaplex property', () => {
      expect(solanaConfig.metaplex).toBeDefined();
    });

    it('should have treasury property', () => {
      expect(solanaConfig.treasury).toBeDefined();
    });

    it('should have collectionMint property', () => {
      expect(solanaConfig.collectionMint).toBeDefined();
    });

    it('should have all required properties', () => {
      expect(solanaConfig).toHaveProperty('connection');
      expect(solanaConfig).toHaveProperty('metaplex');
      expect(solanaConfig).toHaveProperty('treasury');
      expect(solanaConfig).toHaveProperty('collectionMint');
    });
  });

  describe('Helper Functions Export', () => {
    it('should export getClusterName function', () => {
      jest.resetModules();
      const config = require('../../../src/config/solana.config');
      expect(typeof config.getClusterName).toBe('function');
    });

    it('should export getExplorerUrl function', () => {
      jest.resetModules();
      const config = require('../../../src/config/solana.config');
      expect(typeof config.getExplorerUrl).toBe('function');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle whitespace in environment variables', () => {
      expect(() => {
        jest.resetModules();
        process.env.SOLANA_RPC_URL = '  https://api.devnet.solana.com  ';
        process.env.SOLANA_TREASURY_PRIVATE_KEY = '  privatekey  ';
        process.env.SOLANA_COLLECTION_MINT = '  11111111111111111111111111111111  ';
        require('../../../src/config/solana.config');
      }).not.toThrow();
    });

    it('should handle empty string as missing env var', () => {
      expect(() => {
        jest.resetModules();
        process.env.SOLANA_RPC_URL = '';
        process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
        process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
        require('../../../src/config/solana.config');
      }).toThrow('Missing required environment variable: SOLANA_RPC_URL');
    });
  });

  describe('Cluster Detection Edge Cases', () => {
    let getClusterName: () => string;

    beforeAll(() => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      getClusterName = config.getClusterName;
    });

    it('should detect devnet in subdomain', () => {
      process.env.SOLANA_RPC_URL = 'https://devnet.rpc.example.com';
      expect(getClusterName()).toBe('devnet');
    });

    it('should detect testnet in path', () => {
      process.env.SOLANA_RPC_URL = 'https://rpc.example.com/testnet/api';
      expect(getClusterName()).toBe('testnet');
    });

    it('should detect mainnet-beta with hyphen', () => {
      process.env.SOLANA_RPC_URL = 'https://mainnet-beta.example.com';
      expect(getClusterName()).toBe('mainnet-beta');
    });

    it('should prioritize earlier cluster detection', () => {
      // If multiple cluster names appear, first match wins
      process.env.SOLANA_RPC_URL = 'https://devnet.testnet.example.com';
      expect(getClusterName()).toBe('devnet');
    });

    it('should be case-sensitive for cluster detection', () => {
      // The implementation uses .includes() which is case-sensitive
      process.env.SOLANA_RPC_URL = 'https://API.DEVNET.SOLANA.COM';
      expect(getClusterName()).toBe('localnet'); // Uppercase not matched
    });
  });

  describe('Explorer URL Generation Edge Cases', () => {
    let getExplorerUrl: (signature: string) => string;

    beforeAll(() => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      getExplorerUrl = config.getExplorerUrl;
    });

    it('should handle very long signatures', () => {
      const longSig = 'a'.repeat(100);
      const url = getExplorerUrl(longSig);
      expect(url).toContain(longSig);
    });

    it('should not double-encode cluster parameter', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const url = getExplorerUrl('test');
      
      // Should have exactly one '?cluster='
      const matches = url.match(/\?cluster=/g);
      expect(matches).toHaveLength(1);
    });

    it('should handle mainnet without trailing question mark', () => {
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
      const url = getExplorerUrl('test-sig');
      
      expect(url).not.toContain('?');
      expect(url).toBe('https://explorer.solana.com/tx/test-sig');
    });

    it('should be consistent for same signature', () => {
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      const sig = 'consistent-sig-123';
      
      const url1 = getExplorerUrl(sig);
      const url2 = getExplorerUrl(sig);
      
      expect(url1).toBe(url2);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should work with Helius RPC URL containing mainnet', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=xxx';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      // Should detect as mainnet-beta since URL contains 'mainnet'
      expect(config.getClusterName()).toBe('mainnet-beta');
    });

    it('should work with QuickNode RPC URL', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://example.solana-mainnet.quiknode.pro/xxx/';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      // Should detect as mainnet-beta since URL contains 'mainnet'
      expect(config.getClusterName()).toBe('mainnet-beta');
    });

    it('should work with Alchemy devnet URL', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://solana-devnet.g.alchemy.com/v2/xxx';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      expect(config.getClusterName()).toBe('devnet');
    });

    it('should work with GenesysGo RPC URL', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://ssc-dao.genesysgo.net/';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      // No cluster keyword in URL
      expect(config.getClusterName()).toBe('localnet');
    });
  });

  describe('Configuration Behavior', () => {
    it('should work with minimum required env vars', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'http://localhost:8899';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'testkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      expect(() => {
        require('../../../src/config/solana.config');
      }).not.toThrow();
    });

    it('should prioritize devnet over testnet in URL', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://devnet-testnet.example.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      // devnet is checked first in the code
      expect(config.getClusterName()).toBe('devnet');
    });

    it('should prioritize devnet over mainnet in URL', () => {
      jest.resetModules();
      process.env.SOLANA_RPC_URL = 'https://devnet-mainnet.example.com';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'validkey';
      process.env.SOLANA_COLLECTION_MINT = '11111111111111111111111111111111';
      
      const config = require('../../../src/config/solana.config');
      
      // devnet is checked first in the code
      expect(config.getClusterName()).toBe('devnet');
    });
  });
});
