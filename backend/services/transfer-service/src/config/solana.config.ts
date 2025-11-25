import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import bs58 from 'bs58';

/**
 * SOLANA CONFIGURATION
 * 
 * Blockchain connection and Metaplex setup
 * Phase 5: Blockchain Integration
 */

export interface SolanaConfig {
  connection: Connection;
  metaplex: Metaplex;
  treasury: Keypair;
  collectionMint: PublicKey;
}

// Validate required environment variables
const requiredEnvVars = [
  'SOLANA_RPC_URL',
  'SOLANA_TREASURY_PRIVATE_KEY',
  'SOLANA_COLLECTION_MINT'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Initialize Solana connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL!,
  {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
  }
);

// Initialize treasury keypair from private key
const treasuryPrivateKey = process.env.SOLANA_TREASURY_PRIVATE_KEY!;
const treasury = Keypair.fromSecretKey(
  bs58.decode(treasuryPrivateKey)
);

// Initialize collection mint public key
const collectionMint = new PublicKey(process.env.SOLANA_COLLECTION_MINT!);

// Initialize Metaplex
const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(treasury));

export const solanaConfig: SolanaConfig = {
  connection,
  metaplex,
  treasury,
  collectionMint
};

// Helper to get cluster name
export function getClusterName(): string {
  const url = process.env.SOLANA_RPC_URL!;
  
  if (url.includes('devnet')) return 'devnet';
  if (url.includes('testnet')) return 'testnet';
  if (url.includes('mainnet')) return 'mainnet-beta';
  
  return 'localnet';
}

// Helper to get explorer URL
export function getExplorerUrl(signature: string): string {
  const cluster = getClusterName();
  const clusterParam = cluster !== 'mainnet-beta' ? `?cluster=${cluster}` : '';
  
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}
