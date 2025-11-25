// =============================================================================
// TEST SUITE: blockchain config
// =============================================================================

describe('blockchain config', () => {
  let blockchainConfig: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Solana Configuration - 6 test cases
  // ===========================================================================

  describe('Solana Configuration', () => {
    it('should use default Solana RPC URL when env var not set', () => {
      delete process.env.SOLANA_RPC_URL;
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.rpcUrl).toBe('https://api.devnet.solana.com');
    });

    it('should use SOLANA_RPC_URL env var when provided', () => {
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should have confirmed commitment level', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.commitment).toBe('confirmed');
    });

    it('should use SOLANA_PROGRAM_ID env var or empty string', () => {
      process.env.SOLANA_PROGRAM_ID = 'SoLaNaPr0gr4mId123';
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.programId).toBe('SoLaNaPr0gr4mId123');
    });

    it('should default to empty string for programId when not set', () => {
      delete process.env.SOLANA_PROGRAM_ID;
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.programId).toBe('');
    });

    it('should have priority fees configuration', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.solana.priorityFees).toEqual({
        low: 1000,
        medium: 10000,
        high: 100000,
      });
    });
  });

  // ===========================================================================
  // Polygon Configuration - 5 test cases
  // ===========================================================================

  describe('Polygon Configuration', () => {
    it('should use default Polygon RPC URL when env var not set', () => {
      delete process.env.POLYGON_RPC_URL;
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.polygon.rpcUrl).toBe('https://rpc-mumbai.maticvigil.com');
    });

    it('should use POLYGON_RPC_URL env var when provided', () => {
      process.env.POLYGON_RPC_URL = 'https://polygon-mainnet.infura.io';
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.polygon.rpcUrl).toBe('https://polygon-mainnet.infura.io');
    });

    it('should have Mumbai testnet chain ID', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.polygon.chainId).toBe(80001);
    });

    it('should use POLYGON_CONTRACT env var or empty string', () => {
      process.env.POLYGON_CONTRACT = '0xContractAddress123';
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.polygon.contractAddress).toBe('0xContractAddress123');
    });

    it('should have gas limits configuration', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.polygon.gasLimits).toEqual({
        mint: 150000,
        transfer: 65000,
      });
    });
  });

  // ===========================================================================
  // Batch Sizes - 2 test cases
  // ===========================================================================

  describe('Batch Sizes', () => {
    it('should have Solana batch size of 50', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.batchSizes.solana).toBe(50);
    });

    it('should have Polygon batch size of 100', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.batchSizes.polygon).toBe(100);
    });
  });

  // ===========================================================================
  // Retry Configuration - 3 test cases
  // ===========================================================================

  describe('Retry Configuration', () => {
    it('should have max attempts of 3', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.retryConfig.maxAttempts).toBe(3);
    });

    it('should have base delay of 5000ms', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.retryConfig.baseDelay).toBe(5000);
    });

    it('should have max delay of 60000ms', () => {
      blockchainConfig = require('../../../src/config/blockchain').blockchainConfig;

      expect(blockchainConfig.retryConfig.maxDelay).toBe(60000);
    });
  });
});
