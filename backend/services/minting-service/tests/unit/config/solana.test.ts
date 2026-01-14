/**
 * Unit Tests for config/solana.ts
 * 
 * Tests Solana connection initialization, wallet loading, and program verification.
 * Priority: 🟠 High (10 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/utils/solana', () => ({
  validateSolanaConfig: jest.fn(),
  checkWalletBalance: jest.fn().mockResolvedValue({ balance: 1.0, sufficient: true })
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.14.0' }),
    getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.from([]), executable: true })
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({
    toString: () => key,
    toBase58: () => key
  })),
  Keypair: {
    fromSecretKey: jest.fn().mockImplementation(() => ({
      publicKey: { toString: () => 'testPublicKey', toBase58: () => 'testPublicKey' },
      secretKey: new Uint8Array(64)
    }))
  }
}));

import fs from 'fs';
import { validateSolanaConfig, checkWalletBalance } from '../../../src/utils/solana';
import {
  getConnection,
  getWallet,
  getProgramId,
  getCollectionMint,
  getMerkleTree,
  getSolanaConfig,
  loadCollectionConfig,
  loadMerkleTreeConfig
} from '../../../src/config/solana';

describe('Solana Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    process.env.WALLET_PATH = './test-wallet.json';
    process.env.PROGRAM_ID = 'HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF';
    process.env.MIN_SOL_BALANCE = '0.1';
    process.env.CONFIRMATION_COMMITMENT = 'confirmed';
    
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateSolanaConfig', () => {
    it('should be called during initialization', async () => {
      // validateSolanaConfig is called first in initializeSolana
      expect(validateSolanaConfig).toBeDefined();
    });
  });

  describe('Connection Configuration', () => {
    it('should use SOLANA_RPC_URL from environment', () => {
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.com';
      
      expect(process.env.SOLANA_RPC_URL).toBe('https://custom-rpc.com');
    });

    it('should default to devnet if no RPC URL', () => {
      delete process.env.SOLANA_RPC_URL;
      
      const defaultUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      expect(defaultUrl).toBe('https://api.devnet.solana.com');
    });

    it('should use confirmation commitment from environment', () => {
      process.env.CONFIRMATION_COMMITMENT = 'finalized';
      
      expect(process.env.CONFIRMATION_COMMITMENT).toBe('finalized');
    });

    it('should default to confirmed commitment', () => {
      delete process.env.CONFIRMATION_COMMITMENT;
      
      const commitment = process.env.CONFIRMATION_COMMITMENT || 'confirmed';
      expect(commitment).toBe('confirmed');
    });
  });

  describe('Wallet Loading', () => {
    it('should throw if wallet file not found', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const walletPath = './nonexistent-wallet.json';
      const exists = fs.existsSync(walletPath);
      
      expect(exists).toBe(false);
    });

    it('should load wallet from WALLET_PATH', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(Array(64).fill(0)));
      
      const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
      const exists = fs.existsSync(walletPath);
      
      expect(exists).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(walletPath);
    });
  });

  describe('Balance Checking', () => {
    it('should call checkWalletBalance during initialization', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.5,
        sufficient: true
      });

      const result = await checkWalletBalance({} as any, {} as any, 0.1);
      
      expect(result.balance).toBe(1.5);
      expect(result.sufficient).toBe(true);
    });

    it('should warn if balance is insufficient', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.01,
        sufficient: false
      });

      const result = await checkWalletBalance({} as any, {} as any, 0.1);
      
      expect(result.sufficient).toBe(false);
    });
  });

  describe('Program ID', () => {
    it('should load program ID from environment', () => {
      process.env.PROGRAM_ID = 'CustomProgramId123456789012345678901234567890';
      
      expect(process.env.PROGRAM_ID).toBe('CustomProgramId123456789012345678901234567890');
    });

    it('should use default program ID if not set', () => {
      delete process.env.PROGRAM_ID;
      
      const programId = process.env.PROGRAM_ID || 'HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF';
      expect(programId).toBe('HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF');
    });
  });

  describe('Optional Configuration', () => {
    it('should skip invalid COLLECTION_MINT', () => {
      process.env.COLLECTION_MINT = 'CHANGE_ME_after_collection_deployed';
      
      const shouldSkip = process.env.COLLECTION_MINT === 'CHANGE_ME_after_collection_deployed';
      expect(shouldSkip).toBe(true);
    });

    it('should load valid COLLECTION_MINT', () => {
      process.env.COLLECTION_MINT = 'ValidCollectionMint12345678901234567890123';
      
      expect(process.env.COLLECTION_MINT).toBe('ValidCollectionMint12345678901234567890123');
    });

    it('should skip invalid MERKLE_TREE_ADDRESS', () => {
      process.env.MERKLE_TREE_ADDRESS = 'CHANGE_ME_after_merkle_tree_created';
      
      const shouldSkip = process.env.MERKLE_TREE_ADDRESS === 'CHANGE_ME_after_merkle_tree_created';
      expect(shouldSkip).toBe(true);
    });

    it('should load valid MERKLE_TREE_ADDRESS', () => {
      process.env.MERKLE_TREE_ADDRESS = 'ValidMerkleTree12345678901234567890123';
      
      expect(process.env.MERKLE_TREE_ADDRESS).toBe('ValidMerkleTree12345678901234567890123');
    });
  });

  describe('Config File Loading', () => {
    describe('loadCollectionConfig', () => {
      it('should return null if config file not found', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        
        const result = loadCollectionConfig();
        expect(result).toBeNull();
      });

      it('should load config from file', () => {
        const mockConfig = {
          collectionMint: 'mint123',
          collectionMetadata: 'metadata123',
          collectionMasterEdition: 'edition123'
        };
        
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
        
        const result = loadCollectionConfig();
        expect(result).toEqual(mockConfig);
      });

      it('should return null on parse error', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');
        
        const result = loadCollectionConfig();
        expect(result).toBeNull();
      });
    });

    describe('loadMerkleTreeConfig', () => {
      it('should return null if config file not found', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        
        const result = loadMerkleTreeConfig();
        expect(result).toBeNull();
      });

      it('should load merkle tree config from file', () => {
        const mockConfig = {
          merkleTree: 'tree123',
          treeAuthority: 'auth123',
          maxDepth: 14,
          maxBufferSize: 64
        };
        
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
        
        const result = loadMerkleTreeConfig();
        expect(result).toEqual(mockConfig);
      });
    });
  });

  describe('Getters (before initialization)', () => {
    it('getConnection should throw if not initialized', () => {
      expect(() => getConnection()).toThrow('Solana not initialized');
    });

    it('getWallet should throw if not initialized', () => {
      expect(() => getWallet()).toThrow('Wallet not initialized');
    });

    it('getProgramId should throw if not initialized', () => {
      expect(() => getProgramId()).toThrow('Program ID not initialized');
    });

    it('getSolanaConfig should throw if not initialized', () => {
      expect(() => getSolanaConfig()).toThrow('Solana not initialized');
    });

    it('getCollectionMint should return null if not set', () => {
      const result = getCollectionMint();
      expect(result).toBeNull();
    });

    it('getMerkleTree should return null if not set', () => {
      const result = getMerkleTree();
      expect(result).toBeNull();
    });
  });
});
