import { Connection, Keypair, clusterApiUrl, Commitment } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import bs58 from 'bs58';
import { logger } from '../utils/logger';

/**
 * Solana Configuration
 * Initializes Solana connection, wallet keypair, and Metaplex instance
 */

// Validate required environment variables
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const SOLANA_COMMITMENT = (process.env.SOLANA_COMMITMENT || 'confirmed') as Commitment;
const SOLANA_MAX_RETRIES = parseInt(process.env.SOLANA_MAX_RETRIES || '3', 10);
const SOLANA_TIMEOUT_MS = parseInt(process.env.SOLANA_TIMEOUT_MS || '60000', 10);

if (!SOLANA_PRIVATE_KEY) {
  throw new Error('FATAL: SOLANA_PRIVATE_KEY environment variable is required for service startup');
}

// Initialize Solana connection
const rpcUrl = SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK as 'devnet' | 'testnet' | 'mainnet-beta');

export const connection = new Connection(rpcUrl, {
  commitment: SOLANA_COMMITMENT,
  confirmTransactionInitialTimeout: SOLANA_TIMEOUT_MS,
});

// Initialize wallet keypair from private key
let walletKeypair: Keypair;
try {
  const privateKeyBytes = bs58.decode(SOLANA_PRIVATE_KEY);
  walletKeypair = Keypair.fromSecretKey(privateKeyBytes);
  logger.info('Solana wallet loaded', {
    publicKey: walletKeypair.publicKey.toBase58(),
  });
} catch (error: any) {
  throw new Error(`FATAL: Failed to load Solana wallet keypair: ${error.message}`);
}

export const wallet = walletKeypair;

// Initialize Metaplex instance for NFT operations
export const metaplex = Metaplex.make(connection).use({
  install(metaplex) {
    metaplex.identity().setDriver({
      publicKey: wallet.publicKey,
      secretKey: wallet.secretKey,
      signMessage: async (message: Uint8Array) => {
        return wallet.secretKey;
      },
      signTransaction: async (transaction: any) => {
        transaction.sign([wallet]);
        return transaction;
      },
      signAllTransactions: async (transactions: any[]) => {
        return transactions.map((tx) => {
          tx.sign([wallet]);
          return tx;
        });
      },
    });
  },
});

// Export configuration
export const solanaConfig = {
  rpcUrl,
  network: SOLANA_NETWORK,
  commitment: SOLANA_COMMITMENT,
  maxRetries: SOLANA_MAX_RETRIES,
  timeoutMs: SOLANA_TIMEOUT_MS,
  walletPublicKey: wallet.publicKey.toBase58(),
  isDevnet: SOLANA_NETWORK === 'devnet',
  isMainnet: SOLANA_NETWORK === 'mainnet-beta',
};

// Verify connection
connection
  .getVersion()
  .then((version) => {
    logger.info('Solana connection established', {
      rpcUrl,
      network: SOLANA_NETWORK,
      version: version['solana-core'],
      commitment: SOLANA_COMMITMENT,
    });
  })
  .catch((error) => {
    logger.error('Failed to establish Solana connection', {
      rpcUrl,
      error: error.message,
    });
  });

// Check wallet balance on startup
connection
  .getBalance(wallet.publicKey)
  .then((balance) => {
    const solBalance = balance / 1e9; // Convert lamports to SOL
    logger.info('Solana wallet balance', {
      publicKey: wallet.publicKey.toBase58(),
      balance: solBalance,
      lamports: balance,
    });

    if (solBalance < 0.01) {
      logger.warn('Low Solana wallet balance - may not be sufficient for transactions', {
        balance: solBalance,
        recommendedMinimum: 0.1,
      });
    }
  })
  .catch((error) => {
    logger.error('Failed to check wallet balance', {
      error: error.message,
    });
  });
