import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as nacl from 'tweetnacl';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
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
// AWS KMS WALLET PROVIDER
// =============================================================================

/**
 * Encrypted key data structure for storage
 */
export interface EncryptedKeyData {
  encryptedPrivateKey: string;  // Base64 encoded encrypted private key
  encryptedDataKey: string;     // Base64 encoded KMS-encrypted data key
  iv: string;                   // Base64 encoded initialization vector
  publicKey: string;            // Base58 encoded public key
  kmsKeyId: string;             // KMS key ARN/ID used for encryption
  version: number;              // Key format version
}

/**
 * AWS KMS wallet provider using envelope encryption
 *
 * AWS KMS doesn't support ed25519 (Solana's signing algorithm), so we use
 * envelope encryption:
 * 1. Generate ed25519 keypair locally (Solana compatible)
 * 2. Encrypt the private key using KMS data key (AES-256-GCM)
 * 3. Store encrypted key in database
 * 4. Decrypt on-demand for signing
 *
 * Security benefits:
 * - Private keys never leave the service in plaintext
 * - KMS provides hardware-backed encryption
 * - Key material is encrypted at rest
 * - Auditable through KMS CloudTrail
 */
class KMSWalletProvider implements WalletProvider {
  readonly type = 'kms' as const;
  private readonly kmsKeyId: string;
  private readonly kmsClient: KMSClient;
  private keypair: Keypair | null = null;
  private publicKey: PublicKey | null = null;
  private encryptedKeyData: EncryptedKeyData | null = null;

  constructor(encryptedKeyData?: EncryptedKeyData) {
    this.kmsKeyId = process.env.KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || '';

    if (!this.kmsKeyId) {
      throw new Error('KMS_KEY_ID or AWS_KMS_KEY_ID environment variable required');
    }

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.kmsClient = new KMSClient({ region });

    if (encryptedKeyData) {
      this.encryptedKeyData = encryptedKeyData;
      this.publicKey = new PublicKey(encryptedKeyData.publicKey);
    }

    logger.info('KMSWalletProvider initialized', {
      keyId: this.kmsKeyId.substring(0, 30) + '...',
      region,
      hasEncryptedKey: !!encryptedKeyData
    });
  }

  /**
   * Generate a new custodial wallet with KMS envelope encryption
   * Returns encrypted key data for storage
   */
  async generateWallet(): Promise<EncryptedKeyData> {
    // Generate ed25519 keypair (Solana compatible)
    const keypair = Keypair.generate();

    // Generate a data key from KMS
    const dataKeyResponse = await this.kmsClient.send(new GenerateDataKeyCommand({
      KeyId: this.kmsKeyId,
      KeySpec: 'AES_256',
    }));

    if (!dataKeyResponse.Plaintext || !dataKeyResponse.CiphertextBlob) {
      throw new Error('Failed to generate data key from KMS');
    }

    // Encrypt the private key using AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(dataKeyResponse.Plaintext),
      iv
    );

    const encryptedPrivateKey = Buffer.concat([
      cipher.update(Buffer.from(keypair.secretKey)),
      cipher.final(),
      cipher.getAuthTag() // 16 bytes auth tag
    ]);

    // Clear plaintext data key from memory
    dataKeyResponse.Plaintext.fill(0);

    const encryptedKeyData: EncryptedKeyData = {
      encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
      encryptedDataKey: Buffer.from(dataKeyResponse.CiphertextBlob).toString('base64'),
      iv: iv.toString('base64'),
      publicKey: keypair.publicKey.toBase58(),
      kmsKeyId: this.kmsKeyId,
      version: 1,
    };

    logger.info('Generated new custodial wallet', {
      publicKey: keypair.publicKey.toBase58(),
      kmsKeyId: this.kmsKeyId.substring(0, 30) + '...'
    });

    return encryptedKeyData;
  }

  /**
   * Decrypt and load the keypair from encrypted storage
   */
  private async loadKeypair(): Promise<Keypair> {
    if (this.keypair) {
      return this.keypair;
    }

    if (!this.encryptedKeyData) {
      throw new Error('No encrypted key data available. Call setEncryptedKeyData() first.');
    }

    // Decrypt the data key using KMS
    const decryptResponse = await this.kmsClient.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(this.encryptedKeyData.encryptedDataKey, 'base64'),
      KeyId: this.encryptedKeyData.kmsKeyId,
    }));

    if (!decryptResponse.Plaintext) {
      throw new Error('Failed to decrypt data key from KMS');
    }

    // Decrypt the private key using AES-256-GCM
    const encryptedData = Buffer.from(this.encryptedKeyData.encryptedPrivateKey, 'base64');
    const iv = Buffer.from(this.encryptedKeyData.iv, 'base64');

    // Extract auth tag (last 16 bytes)
    const authTag = encryptedData.subarray(-16);
    const ciphertext = encryptedData.subarray(0, -16);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(decryptResponse.Plaintext),
      iv
    );
    decipher.setAuthTag(authTag);

    const decryptedPrivateKey = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Clear plaintext data key from memory
    decryptResponse.Plaintext.fill(0);

    // Create keypair from decrypted secret key
    this.keypair = Keypair.fromSecretKey(new Uint8Array(decryptedPrivateKey));
    this.publicKey = this.keypair.publicKey;

    // Verify public key matches
    if (this.keypair.publicKey.toBase58() !== this.encryptedKeyData.publicKey) {
      this.keypair = null;
      this.publicKey = null;
      throw new Error('Public key mismatch after decryption - key integrity check failed');
    }

    logger.debug('Keypair decrypted successfully', {
      publicKey: this.keypair.publicKey.toBase58()
    });

    return this.keypair;
  }

  /**
   * Set encrypted key data for an existing wallet
   */
  setEncryptedKeyData(data: EncryptedKeyData): void {
    this.encryptedKeyData = data;
    this.publicKey = new PublicKey(data.publicKey);
    this.keypair = null; // Clear any cached keypair
  }

  async getKeypair(): Promise<Keypair> {
    return this.loadKeypair();
  }

  async getPublicKey(): Promise<PublicKey> {
    if (this.publicKey) {
      return this.publicKey;
    }

    // If we have encrypted data but haven't loaded keypair yet
    if (this.encryptedKeyData) {
      this.publicKey = new PublicKey(this.encryptedKeyData.publicKey);
      return this.publicKey;
    }

    throw new Error(
      'No wallet loaded. Call setEncryptedKeyData() with encrypted key data, ' +
      'or generateWallet() to create a new wallet.'
    );
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    const keypair = await this.loadKeypair();
    return nacl.sign.detached(message, keypair.secretKey);
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    const keypair = await this.loadKeypair();
    transaction.sign(keypair);
    return transaction;
  }

  /**
   * Sign multiple transactions
   */
  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const keypair = await this.loadKeypair();
    for (const tx of transactions) {
      tx.sign(keypair);
    }
    return transactions;
  }

  /**
   * Sign a versioned transaction
   */
  async signVersionedTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction> {
    const keypair = await this.loadKeypair();
    transaction.sign([keypair]);
    return transaction;
  }

  /**
   * Clear cached keypair from memory
   * Call this after signing operations to reduce exposure time
   */
  clearCache(): void {
    if (this.keypair) {
      // Zero out the secret key bytes
      this.keypair.secretKey.fill(0);
      this.keypair = null;
    }
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
  encryptedKeyData?: EncryptedKeyData;
}): WalletProvider {
  switch (options.type) {
    case 'file':
      walletProvider = new FileWalletProvider(options.walletPath);
      break;

    case 'kms':
      if (options.keyId) {
        process.env.KMS_KEY_ID = options.keyId;
      }
      walletProvider = new KMSWalletProvider(options.encryptedKeyData);
      break;

    case 'hardware':
      walletProvider = new HardwareWalletProvider();
      break;
  }

  return walletProvider;
}

/**
 * Create a KMS wallet provider for a specific custodial wallet
 * Used by CustodialWalletService to sign transactions
 */
export function createKMSWalletProvider(encryptedKeyData: EncryptedKeyData): KMSWalletProvider {
  return new KMSWalletProvider(encryptedKeyData);
}

/**
 * Generate a new custodial wallet using KMS envelope encryption
 * Returns encrypted key data for secure storage
 */
export async function generateCustodialWallet(): Promise<EncryptedKeyData> {
  const provider = new KMSWalletProvider();
  return provider.generateWallet();
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

