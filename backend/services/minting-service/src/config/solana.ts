import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import logger from '../utils/logger';
import { validateSolanaConfig, checkWalletBalance } from '../utils/solana';

let connection: Connection | null = null;
let wallet: Keypair | null = null;
let programId: PublicKey | null = null;
let collectionMint: PublicKey | null = null;
let merkleTree: PublicKey | null = null;

export interface SolanaConfig {
  connection: Connection;
  wallet: Keypair;
  programId: PublicKey;
  collectionMint: PublicKey | null;
  merkleTree: PublicKey | null;
}

export async function initializeSolana(): Promise<SolanaConfig> {
  try {
    // Validate environment variables
    validateSolanaConfig();

    // Connect to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const commitment = (process.env.CONFIRMATION_COMMITMENT || 'confirmed') as 'processed' | 'confirmed' | 'finalized';
    
    connection = new Connection(rpcUrl, commitment);

    // Load wallet
    const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
    if (!fs.existsSync(walletPath)) {
      throw new Error(
        `Wallet file not found at ${walletPath}. ` +
        'Please create a wallet first or set WALLET_PATH environment variable.'
      );
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

    // Load program ID
    const programIdStr = process.env.PROGRAM_ID || 'HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF';
    programId = new PublicKey(programIdStr);

    // Load collection mint (optional for now)
    if (process.env.COLLECTION_MINT && process.env.COLLECTION_MINT !== 'CHANGE_ME_after_collection_deployed') {
      try {
        collectionMint = new PublicKey(process.env.COLLECTION_MINT);
        logger.info('Collection mint configured', {
          collectionMint: collectionMint.toString()
        });
      } catch (error) {
        logger.warn('Invalid COLLECTION_MINT address, skipping', {
          value: process.env.COLLECTION_MINT
        });
      }
    }

    // Load merkle tree (optional for now)
    if (process.env.MERKLE_TREE_ADDRESS && process.env.MERKLE_TREE_ADDRESS !== 'CHANGE_ME_after_merkle_tree_created') {
      try {
        merkleTree = new PublicKey(process.env.MERKLE_TREE_ADDRESS);
        logger.info('Merkle tree configured', {
          merkleTree: merkleTree.toString()
        });
      } catch (error) {
        logger.warn('Invalid MERKLE_TREE_ADDRESS, skipping', {
          value: process.env.MERKLE_TREE_ADDRESS
        });
      }
    }

    // Test connection
    const version = await connection.getVersion();
    logger.info('✅ Solana connection initialized', {
      rpcUrl,
      commitment,
      version: version['solana-core'],
      network: process.env.SOLANA_NETWORK || 'devnet'
    });

    logger.info('Wallet loaded', {
      publicKey: wallet.publicKey.toString()
    });

    // Check wallet balance
    const balanceCheck = await checkWalletBalance(
      connection,
      wallet.publicKey,
      parseFloat(process.env.MIN_SOL_BALANCE || '0.1')
    );

    if (!balanceCheck.sufficient) {
      logger.warn('⚠️  Low wallet balance!', {
        balance: balanceCheck.balance,
        minRequired: process.env.MIN_SOL_BALANCE || '0.1',
        faucet: 'https://faucet.solana.com'
      });
    } else {
      logger.info('Wallet balance sufficient', {
        balance: balanceCheck.balance
      });
    }

    // Verify program exists
    try {
      const programInfo = await connection.getAccountInfo(programId);
      if (programInfo) {
        logger.info('Program verified on-chain', {
          programId: programId.toString(),
          dataLength: programInfo.data.length,
          executable: programInfo.executable
        });
      } else {
        logger.warn('⚠️  Program account not found on-chain', {
          programId: programId.toString()
        });
      }
    } catch (error) {
      logger.warn('Could not verify program', {
        programId: programId.toString(),
        error: (error as Error).message
      });
    }

    return {
      connection,
      wallet,
      programId,
      collectionMint,
      merkleTree
    };
  } catch (error) {
    logger.error('❌ Failed to initialize Solana', {
      error: (error as Error).message
    });
    throw error;
  }
}

export function getConnection(): Connection {
  if (!connection) {
    throw new Error('Solana not initialized. Call initializeSolana() first.');
  }
  return connection;
}

export function getWallet(): Keypair {
  if (!wallet) {
    throw new Error('Wallet not initialized. Call initializeSolana() first.');
  }
  return wallet;
}

export function getProgramId(): PublicKey {
  if (!programId) {
    throw new Error('Program ID not initialized. Call initializeSolana() first.');
  }
  return programId;
}

export function getCollectionMint(): PublicKey | null {
  return collectionMint;
}

export function getMerkleTree(): PublicKey | null {
  return merkleTree;
}

export function getSolanaConfig(): SolanaConfig {
  if (!connection || !wallet || !programId) {
    throw new Error('Solana not initialized. Call initializeSolana() first.');
  }
  return {
    connection,
    wallet,
    programId,
    collectionMint,
    merkleTree
  };
}

/**
 * Load collection configuration from file
 */
export function loadCollectionConfig(): {
  collectionMint: string;
  collectionMetadata: string;
  collectionMasterEdition: string;
} | null {
  const configPath = './collection-config.json';
  
  if (!fs.existsSync(configPath)) {
    logger.warn('Collection config file not found', { path: configPath });
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    logger.info('Loaded collection config', {
      collectionMint: config.collectionMint
    });
    return config;
  } catch (error) {
    logger.error('Failed to load collection config', {
      error: (error as Error).message
    });
    return null;
  }
}

/**
 * Load merkle tree configuration from file
 */
export function loadMerkleTreeConfig(): {
  merkleTree: string;
  treeAuthority: string;
  maxDepth: number;
  maxBufferSize: number;
} | null {
  const configPath = './real-merkle-tree-config.json';
  
  if (!fs.existsSync(configPath)) {
    logger.warn('Merkle tree config file not found', { path: configPath });
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    logger.info('Loaded merkle tree config', {
      merkleTree: config.merkleTree,
      maxDepth: config.maxDepth
    });
    return config;
  } catch (error) {
    logger.error('Failed to load merkle tree config', {
      error: (error as Error).message
    });
    return null;
  }
}
