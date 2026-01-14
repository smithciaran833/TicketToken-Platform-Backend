import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as nacl from 'tweetnacl';
import logger from '../utils/logger';

// =============================================================================
// WALLET PROVIDER INTERFACE
// =============================================================================

/**
 * Abstract interface for wallet operations
 * Allows swapping between file-based wallet and KMS-based wallet
 */
export interface WalletProvider {
  /**
   * Get the wallet's public key
   */
  getPublicKey(): Promise<PublicKey>;

  /**
   * Get the full keypair (only for file-based provider)
   * Throws for KMS provider - use sign() instead
   */
  getKeypair(): Promise<Keypair>;

  /**
   * Sign a message/transaction
   */
  sign(message: Uint8Array): Promise<Uint8Array>;

  /**
   * Sign a transaction
   */
  signTransaction(transaction: Transaction): Promise<Transaction>;

  /**
   * Provider type identifier
   */
  readonly type: 'file' | 'kms' | 'hardware';
}

// =============================================================================
// FILE-BASED WALLET PROVIDER
// =============================================================================

/**
 * File-based wallet provider
 * Loads keypair from a JSON file on disk
 */
class FileWalletProvider implements WalletProvider {
  readonly type = 'file' as const;
  private keypair: Keypair | null = null;
  private readonly walletPath: string;

  constructor(walletPath?: string) {
    this.walletPath = walletPath || process.env.SOLANA_WALLET_PATH || process.env.WALLET_PATH || '';

    if (!this.walletPath) {
      throw new Error('SOLANA_WALLET_PATH or WALLET_PATH environment variable required');
    }

    // Verify file exists at construction time
    if (!fs.existsSync(this.walletPath)) {
      throw new Error(`Wallet file not found: ${this.walletPath}`);
    }

    logger.info('FileWalletProvider initialized', {
      walletPath: this.walletPath.replace(/.*\//, '***/')  // Hide path
    });
  }

  async getKeypair(): Promise<Keypair> {
    if (!this.keypair) {
      try {
        const walletData = JSON.parse(fs.readFileSync(this.walletPath, 'utf-8'));
        this.keypair = Keypair.fromSecretKey(new Uint8Array(walletData));

        logger.info('Wallet keypair loaded', {
          publicKey: this.keypair.publicKey.toString()
        });
      } catch (error) {
        logger.error('Failed to load wallet keypair', {
          error: (error as Error).message
        });
        throw new Error(`Failed to load wallet: ${(error as Error).message}`);
      }
    }
    return this.keypair;
  }

  async getPublicKey(): Promise<PublicKey> {
    const keypair = await this.getKeypair();
    return keypair.publicKey;
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    const keypair = await this.getKeypair();
    return nacl.sign.detached(message, keypair.secretKey);
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    const keypair = await this.getKeypair();
    transaction.sign(keypair);
    return transaction;
  }
}

// =============================================================================
// AWS KMS WALLET PROVIDER (Placeholder)
// =============================================================================

/**
 * AWS KMS wallet provider
 * Signs transactions using AWS KMS
 * 
 * NOTE: This is a placeholder implementation
 * Full implementation requires AWS SDK and specific KMS key configuration
 */
class KMSWalletProvider implements WalletProvider {
  readonly type = 'kms' as const;
  private readonly keyId: string;
  private publicKey: PublicKey | null = null;

  constructor() {
    this.keyId = process.env.KMS_KEY_ID || '';

    if (!this.keyId) {
      throw new Error('KMS_KEY_ID environment variable required for KMS wallet provider');
    }

    logger.info('KMSWalletProvider initialized', {
      keyId: this.keyId.substring(0, 20) + '...'
    });
  }

  async getKeypair(): Promise<Keypair> {
    // KMS does not expose the full keypair - this is by design
    throw new Error(
      'KMS wallet provider does not expose the full keypair. ' +
      'Use sign() or signTransaction() instead.'
    );
  }

  async getPublicKey(): Promise<PublicKey> {
    if (!this.publicKey) {
      // TODO: Implement fetching public key from KMS
      // const kms = new KMSClient({ region: process.env.AWS_REGION });
      // const response = await kms.send(new GetPublicKeyCommand({ KeyId: this.keyId }));
      // this.publicKey = new PublicKey(response.PublicKey);
      throw new Error(
        'KMS wallet provider not yet implemented. ' +
        'Set WALLET_PROVIDER=file or implement KMS integration.'
      );
    }
    return this.publicKey;
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    // TODO: Implement KMS signing
    // const kms = new KMSClient({ region: process.env.AWS_REGION });
    // const response = await kms.send(new SignCommand({
    //   KeyId: this.keyId,
    //   Message: message,
    //   SigningAlgorithm: 'ECDSA_SHA_256'
    // }));
    // return new Uint8Array(response.Signature);
    throw new Error('KMS signing not yet implemented');
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    // KMS signing requires special handling for Solana transactions
    throw new Error('KMS transaction signing not yet implemented');
  }
}

// =============================================================================
// HARDWARE WALLET PROVIDER (Placeholder)
// =============================================================================

/**
 * Hardware wallet provider (Ledger)
 * Signs transactions using a hardware wallet
 * 
 * NOTE: This is a placeholder for future implementation
 */
class HardwareWalletProvider implements WalletProvider {
  readonly type = 'hardware' as const;

  constructor() {
    logger.warn('HardwareWalletProvider is a placeholder and not yet functional');
  }

  async getKeypair(): Promise<Keypair> {
    throw new Error('Hardware wallet does not expose the full keypair');
  }

  async getPublicKey(): Promise<PublicKey> {
    throw new Error('Hardware wallet provider not yet implemented');
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    throw new Error('Hardware wallet signing not yet implemented');
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    throw new Error('Hardware wallet transaction signing not yet implemented');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let walletProvider: WalletProvider | null = null;

/**
 * Get the configured wallet provider
 * Uses WALLET_PROVIDER env var to determine which provider to use
 */
export function getWalletProvider(): WalletProvider {
  if (!walletProvider) {
    const providerType = process.env.WALLET_PROVIDER || 'file';

    switch (providerType.toLowerCase()) {
      case 'file':
        walletProvider = new FileWalletProvider();
        break;

      case 'kms':
        walletProvider = new KMSWalletProvider();
        break;

      case 'hardware':
      case 'ledger':
        walletProvider = new HardwareWalletProvider();
        break;

      default:
        throw new Error(
          `Unknown wallet provider: ${providerType}. ` +
          `Valid options: file, kms, hardware`
        );
    }

    logger.info('Wallet provider initialized', {
      type: walletProvider.type
    });
  }

  return walletProvider;
}

/**
 * Initialize wallet provider with specific configuration
 * Useful for testing or custom setups
 */
export function initWalletProvider(options: {
  type: 'file' | 'kms' | 'hardware';
  walletPath?: string;
  keyId?: string;
}): WalletProvider {
  switch (options.type) {
    case 'file':
      walletProvider = new FileWalletProvider(options.walletPath);
      break;

    case 'kms':
      if (options.keyId) {
        process.env.KMS_KEY_ID = options.keyId;
      }
      walletProvider = new KMSWalletProvider();
      break;

    case 'hardware':
      walletProvider = new HardwareWalletProvider();
      break;
  }

  return walletProvider;
}

/**
 * Clear the cached wallet provider (for testing)
 */
export function clearWalletProvider(): void {
  walletProvider = null;
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Get the wallet's public key using the configured provider
 */
export async function getWalletPublicKey(): Promise<PublicKey> {
  const provider = getWalletProvider();
  return provider.getPublicKey();
}

/**
 * Sign a transaction using the configured provider
 */
export async function signTransaction(transaction: Transaction): Promise<Transaction> {
  const provider = getWalletProvider();
  return provider.signTransaction(transaction);
}
