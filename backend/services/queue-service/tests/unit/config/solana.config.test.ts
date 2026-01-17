// Mock dependencies before imports
const mockConnection = {
  getVersion: jest.fn(),
  getBalance: jest.fn(),
};

const mockKeypair = {
  publicKey: {
    toBase58: jest.fn(() => 'TestPublicKey123'),
  },
  secretKey: new Uint8Array(64),
};

const mockMetaplexInstance = {
  use: jest.fn(function(this: any) { return this; }), // Return self for chaining
  identity: jest.fn(() => ({
    setDriver: jest.fn(),
  })),
};

const mockMetaplex = {
  make: jest.fn(() => mockMetaplexInstance),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(() => mockConnection),
  Keypair: {
    fromSecretKey: jest.fn(() => mockKeypair),
  },
  clusterApiUrl: jest.fn((network) => `https://api.${network}.solana.com`),
}));

jest.mock('@metaplex-foundation/js', () => ({
  Metaplex: mockMetaplex,
}));

jest.mock('bs58', () => ({
  decode: jest.fn(() => new Uint8Array(64)),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

describe('Config - Solana Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    jest.resetModules();
    
    // Set required env var
    process.env.SOLANA_PRIVATE_KEY = 'test_private_key_base58';
    
    // Setup mock promises
    mockConnection.getVersion.mockResolvedValue({ 'solana-core': '1.14.0' });
    mockConnection.getBalance.mockResolvedValue(100000000); // 0.1 SOL
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Required environment variables', () => {
    it('should throw error if SOLANA_PRIVATE_KEY is missing', () => {
      delete process.env.SOLANA_PRIVATE_KEY;
      
      expect(() => {
        require('../../../src/config/solana.config');
      }).toThrow('FATAL: SOLANA_PRIVATE_KEY environment variable is required');
    });

    it('should throw error if SOLANA_PRIVATE_KEY is empty', () => {
      process.env.SOLANA_PRIVATE_KEY = '';
      
      expect(() => {
        require('../../../src/config/solana.config');
      }).toThrow('FATAL: SOLANA_PRIVATE_KEY environment variable is required');
    });
  });

  describe('Configuration defaults', () => {
    it('should use default network "devnet" when not specified', () => {
      delete process.env.SOLANA_NETWORK;
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.network).toBe('devnet');
    });

    it('should use custom network from env var', () => {
      process.env.SOLANA_NETWORK = 'mainnet-beta';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.network).toBe('mainnet-beta');
    });

    it('should use default commitment "confirmed" when not specified', () => {
      delete process.env.SOLANA_COMMITMENT;
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.commitment).toBe('confirmed');
    });

    it('should use custom commitment from env var', () => {
      process.env.SOLANA_COMMITMENT = 'finalized';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.commitment).toBe('finalized');
    });

    it('should use default maxRetries of 3 when not specified', () => {
      delete process.env.SOLANA_MAX_RETRIES;
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.maxRetries).toBe(3);
    });

    it('should parse maxRetries from env var', () => {
      process.env.SOLANA_MAX_RETRIES = '5';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.maxRetries).toBe(5);
    });

    it('should use default timeout of 60000ms when not specified', () => {
      delete process.env.SOLANA_TIMEOUT_MS;
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.timeoutMs).toBe(60000);
    });

    it('should parse timeout from env var', () => {
      process.env.SOLANA_TIMEOUT_MS = '90000';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.timeoutMs).toBe(90000);
    });
  });

  describe('RPC URL configuration', () => {
    it('should use SOLANA_RPC_URL when provided', () => {
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.example.com';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.rpcUrl).toBe('https://custom-rpc.example.com');
    });

    it('should use clusterApiUrl for devnet when RPC URL not provided', () => {
      delete process.env.SOLANA_RPC_URL;
      process.env.SOLANA_NETWORK = 'devnet';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.rpcUrl).toBe('https://api.devnet.solana.com');
    });

    it('should use clusterApiUrl for mainnet-beta when RPC URL not provided', () => {
      delete process.env.SOLANA_RPC_URL;
      process.env.SOLANA_NETWORK = 'mainnet-beta';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    });
  });

  describe('Connection initialization', () => {
    it('should create Connection with correct parameters', () => {
      const { Connection } = require('@solana/web3.js');
      require('../../../src/config/solana.config');
      
      expect(Connection).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          commitment: expect.any(String),
          confirmTransactionInitialTimeout: expect.any(Number),
        })
      );
    });

    it('should export connection object', () => {
      const { connection } = require('../../../src/config/solana.config');
      expect(connection).toBeDefined();
      expect(connection).toBe(mockConnection);
    });
  });

  describe('Wallet initialization', () => {
    it('should decode private key using bs58', () => {
      const bs58 = require('bs58');
      require('../../../src/config/solana.config');
      expect(bs58.decode).toHaveBeenCalledWith('test_private_key_base58');
    });

    it('should create keypair from secret key', () => {
      const { Keypair } = require('@solana/web3.js');
      require('../../../src/config/solana.config');
      expect(Keypair.fromSecretKey).toHaveBeenCalledWith(expect.any(Uint8Array));
    });

    it('should export wallet keypair', () => {
      const { wallet } = require('../../../src/config/solana.config');
      expect(wallet).toBeDefined();
      expect(wallet).toBe(mockKeypair);
    });

    it('should log wallet public key on successful load', () => {
      require('../../../src/config/solana.config');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Solana wallet loaded',
        expect.objectContaining({
          publicKey: 'TestPublicKey123',
        })
      );
    });

    it('should throw error if keypair creation fails', () => {
      const { Keypair } = require('@solana/web3.js');
      Keypair.fromSecretKey.mockImplementationOnce(() => {
        throw new Error('Invalid secret key');
      });

      expect(() => {
        require('../../../src/config/solana.config');
      }).toThrow('FATAL: Failed to load Solana wallet keypair');
    });
  });

  describe('Metaplex initialization', () => {
    it('should create Metaplex instance', () => {
      const { Metaplex } = require('@metaplex-foundation/js');
      require('../../../src/config/solana.config');
      expect(Metaplex.make).toHaveBeenCalledWith(mockConnection);
    });

    it('should export metaplex instance', () => {
      const { metaplex } = require('../../../src/config/solana.config');
      expect(metaplex).toBeDefined();
      expect(metaplex).toBe(mockMetaplexInstance);
    });

    it('should call use() method on metaplex instance', () => {
      require('../../../src/config/solana.config');
      expect(mockMetaplexInstance.use).toHaveBeenCalled();
    });
  });

  describe('solanaConfig object', () => {
    it('should have all required properties', () => {
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig).toHaveProperty('rpcUrl');
      expect(solanaConfig).toHaveProperty('network');
      expect(solanaConfig).toHaveProperty('commitment');
      expect(solanaConfig).toHaveProperty('maxRetries');
      expect(solanaConfig).toHaveProperty('timeoutMs');
      expect(solanaConfig).toHaveProperty('walletPublicKey');
      expect(solanaConfig).toHaveProperty('isDevnet');
      expect(solanaConfig).toHaveProperty('isMainnet');
    });

    it('should have walletPublicKey as string', () => {
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(typeof solanaConfig.walletPublicKey).toBe('string');
      expect(solanaConfig.walletPublicKey).toBe('TestPublicKey123');
    });

    it('should have isDevnet true when network is devnet', () => {
      process.env.SOLANA_NETWORK = 'devnet';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.isDevnet).toBe(true);
      expect(solanaConfig.isMainnet).toBe(false);
    });

    it('should have isMainnet true when network is mainnet-beta', () => {
      process.env.SOLANA_NETWORK = 'mainnet-beta';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.isMainnet).toBe(true);
      expect(solanaConfig.isDevnet).toBe(false);
    });

    it('should have numeric maxRetries', () => {
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(typeof solanaConfig.maxRetries).toBe('number');
    });

    it('should have numeric timeoutMs', () => {
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(typeof solanaConfig.timeoutMs).toBe('number');
    });
  });

  describe('Connection verification', () => {
    it('should verify connection on startup', async () => {
      require('../../../src/config/solana.config');
      // Wait for async calls
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockConnection.getVersion).toHaveBeenCalled();
    });

    it('should log success when connection established', async () => {
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Solana connection established',
        expect.objectContaining({
          version: '1.14.0',
        })
      );
    });

    it('should log error when connection fails', async () => {
      mockConnection.getVersion.mockRejectedValueOnce(new Error('Connection failed'));
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to establish Solana connection',
        expect.any(Object)
      );
    });
  });

  describe('Wallet balance check', () => {
    it('should check wallet balance on startup', async () => {
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockConnection.getBalance).toHaveBeenCalledWith(mockKeypair.publicKey);
    });

    it('should log balance in SOL', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(100000000); // 0.1 SOL
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Solana wallet balance',
        expect.objectContaining({
          balance: 0.1,
          lamports: 100000000,
        })
      );
    });

    it('should warn if balance is low', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(5000000); // 0.005 SOL
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Low Solana wallet balance'),
        expect.any(Object)
      );
    });

    it('should not warn if balance is sufficient', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(100000000); // 0.1 SOL
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log error if balance check fails', async () => {
      mockConnection.getBalance.mockRejectedValueOnce(new Error('Balance check failed'));
      require('../../../src/config/solana.config');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check wallet balance',
        expect.any(Object)
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid maxRetries env var', () => {
      process.env.SOLANA_MAX_RETRIES = 'invalid';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.maxRetries).toBeNaN();
    });

    it('should handle invalid timeout env var', () => {
      process.env.SOLANA_TIMEOUT_MS = 'invalid';
      const { solanaConfig } = require('../../../src/config/solana.config');
      expect(solanaConfig.timeoutMs).toBeNaN();
    });
  });
});
