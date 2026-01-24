import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import config from '../config';

/**
 * CUSTODIAL WALLET SERVICE
 *
 * Phase 1: Custodial Wallet Foundation
 *
 * Provides secure custodial wallet management:
 * - Lazy wallet creation (on first purchase)
 * - KMS envelope encryption for private keys
 * - Balance tracking and monitoring
 * - Transaction signing for custodial wallets
 *
 * Security:
 * - Private keys encrypted at rest using AWS KMS
 * - Keys only decrypted when needed for signing
 * - Automatic cache clearing after signing
 * - Audit logging for all key access
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CustodialWallet {
  id: string;
  userId: string;
  tenantId: string;
  walletAddress: string;
  walletType: 'CUSTODIAL' | 'EXTERNAL' | 'TREASURY' | 'ESCROW';
  blockchainType: string;
  network: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION' | 'LOCKED' | 'ARCHIVED';
  solBalance: number;
  kmsKeyArn: string;
  kmsKeyId: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedKeyData {
  encryptedPrivateKey: string;
  encryptedDataKey: string;
  iv: string;
  publicKey: string;
  kmsKeyId: string;
  version: number;
}

export interface CreateWalletResult {
  wallet: CustodialWallet;
  publicKey: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class CustodialWalletService {
  private pool: Pool;
  private connection: Connection;
  private kmsClient: KMSClient;
  private kmsKeyId: string;

  constructor(pool: Pool, connection: Connection) {
    this.pool = pool;
    this.connection = connection;

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.kmsClient = new KMSClient({ region });
    this.kmsKeyId = process.env.KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || '';

    if (!this.kmsKeyId) {
      logger.warn('KMS_KEY_ID not configured - custodial wallet creation will fail');
    }

    logger.info('CustodialWalletService initialized', {
      kmsConfigured: !!this.kmsKeyId,
      region,
      network: config.solana.network
    });
  }

  // ===========================================================================
  // WALLET CREATION
  // ===========================================================================

  /**
   * Create a new custodial wallet for a user
   * Called lazily on first purchase
   */
  async createWallet(
    userId: string,
    tenantId: string,
    options?: { transactionClient?: PoolClient }
  ): Promise<CreateWalletResult> {
    const client = options?.transactionClient || await this.pool.connect();
    const shouldRelease = !options?.transactionClient;

    try {
      // Set tenant context for RLS
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Check if wallet already exists
      const existingWallet = await client.query(
        `SELECT * FROM custodial_wallets WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (existingWallet.rows.length > 0) {
        logger.info('User already has custodial wallet', {
          userId,
          tenantId,
          walletAddress: existingWallet.rows[0].wallet_address
        });
        return {
          wallet: this.mapWalletRow(existingWallet.rows[0]),
          publicKey: existingWallet.rows[0].wallet_address
        };
      }

      // Generate new keypair and encrypt
      const encryptedKeyData = await this.generateEncryptedKeypair();

      // Insert wallet record
      const walletResult = await client.query(
        `INSERT INTO custodial_wallets (
          user_id, tenant_id, wallet_address, wallet_type, blockchain_type, network,
          status, kms_key_arn, kms_key_id, key_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          userId,
          tenantId,
          encryptedKeyData.publicKey,
          'CUSTODIAL',
          'SOLANA',
          config.solana.network,
          'ACTIVE',
          encryptedKeyData.kmsKeyId,
          encryptedKeyData.kmsKeyId,
          encryptedKeyData.version
        ]
      );

      const wallet = walletResult.rows[0];

      // Insert encrypted private key
      await client.query(
        `INSERT INTO wallet_private_keys (
          wallet_id, tenant_id, kms_key_arn, kms_key_id,
          encrypted_private_key, encrypted_data_key, iv, key_version,
          key_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          wallet.id,
          tenantId,
          encryptedKeyData.kmsKeyId,
          encryptedKeyData.kmsKeyId,
          encryptedKeyData.encryptedPrivateKey,
          encryptedKeyData.encryptedDataKey,
          encryptedKeyData.iv,
          encryptedKeyData.version,
          JSON.stringify({
            algorithm: 'AES-256-GCM',
            createdAt: new Date().toISOString(),
            publicKey: encryptedKeyData.publicKey
          })
        ]
      );

      logger.info('Custodial wallet created', {
        userId,
        tenantId,
        walletId: wallet.id,
        walletAddress: encryptedKeyData.publicKey
      });

      return {
        wallet: this.mapWalletRow(wallet),
        publicKey: encryptedKeyData.publicKey
      };
    } finally {
      if (shouldRelease) {
        client.release();
      }
    }
  }

  /**
   * Get or create a custodial wallet for a user
   * This is the main entry point for lazy wallet creation
   */
  async getOrCreateWallet(userId: string, tenantId: string): Promise<CustodialWallet> {
    // Try to get existing wallet first
    const existing = await this.getWalletByUserId(userId, tenantId);
    if (existing) {
      return existing;
    }

    // Create new wallet
    const result = await this.createWallet(userId, tenantId);
    return result.wallet;
  }

  // ===========================================================================
  // WALLET RETRIEVAL
  // ===========================================================================

  /**
   * Get wallet by user ID
   */
  async getWalletByUserId(userId: string, tenantId: string): Promise<CustodialWallet | null> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const result = await client.query(
        `SELECT * FROM custodial_wallets WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapWalletRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get wallet by wallet address
   */
  async getWalletByAddress(walletAddress: string): Promise<CustodialWallet | null> {
    const client = await this.pool.connect();
    try {
      // Need system access to query without tenant context
      await client.query(`SELECT set_config('app.is_system_user', 'true', true)`);

      const result = await client.query(
        `SELECT * FROM custodial_wallets WHERE wallet_address = $1 AND deleted_at IS NULL`,
        [walletAddress]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapWalletRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string, tenantId: string): Promise<CustodialWallet | null> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const result = await client.query(
        `SELECT * FROM custodial_wallets WHERE id = $1 AND deleted_at IS NULL`,
        [walletId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapWalletRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // TRANSACTION SIGNING
  // ===========================================================================

  /**
   * Sign a transaction with a custodial wallet
   * Decrypts the private key, signs, then clears from memory
   */
  async signTransaction(
    walletId: string,
    tenantId: string,
    transaction: Transaction,
    reason: string
  ): Promise<Transaction> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Get encrypted key data
      const keyResult = await client.query(
        `SELECT wpk.*, cw.wallet_address
         FROM wallet_private_keys wpk
         JOIN custodial_wallets cw ON cw.id = wpk.wallet_id
         WHERE wpk.wallet_id = $1 AND wpk.deleted_at IS NULL`,
        [walletId]
      );

      if (keyResult.rows.length === 0) {
        throw new Error(`No private key found for wallet ${walletId}`);
      }

      const keyRow = keyResult.rows[0];

      // Update access audit
      await client.query(
        `UPDATE wallet_private_keys
         SET last_accessed_at = NOW(), access_count = access_count + 1,
             last_accessed_by = 'blockchain-service', last_accessed_reason = $2
         WHERE id = $1`,
        [keyRow.id, reason]
      );

      // Decrypt and sign
      const keypair = await this.decryptPrivateKey({
        encryptedPrivateKey: keyRow.encrypted_private_key,
        encryptedDataKey: keyRow.encrypted_data_key,
        iv: keyRow.iv,
        publicKey: keyRow.wallet_address,
        kmsKeyId: keyRow.kms_key_id,
        version: keyRow.key_version
      });

      transaction.sign(keypair);

      // Clear keypair from memory
      keypair.secretKey.fill(0);

      logger.info('Transaction signed with custodial wallet', {
        walletId,
        walletAddress: keyRow.wallet_address,
        reason
      });

      return transaction;
    } finally {
      client.release();
    }
  }

  /**
   * Get keypair for signing (use with caution - prefer signTransaction)
   */
  async getKeypair(walletId: string, tenantId: string, reason: string): Promise<Keypair> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const keyResult = await client.query(
        `SELECT wpk.*, cw.wallet_address
         FROM wallet_private_keys wpk
         JOIN custodial_wallets cw ON cw.id = wpk.wallet_id
         WHERE wpk.wallet_id = $1 AND wpk.deleted_at IS NULL`,
        [walletId]
      );

      if (keyResult.rows.length === 0) {
        throw new Error(`No private key found for wallet ${walletId}`);
      }

      const keyRow = keyResult.rows[0];

      // Update access audit
      await client.query(
        `UPDATE wallet_private_keys
         SET last_accessed_at = NOW(), access_count = access_count + 1,
             last_accessed_by = 'blockchain-service', last_accessed_reason = $2
         WHERE id = $1`,
        [keyRow.id, reason]
      );

      return this.decryptPrivateKey({
        encryptedPrivateKey: keyRow.encrypted_private_key,
        encryptedDataKey: keyRow.encrypted_data_key,
        iv: keyRow.iv,
        publicKey: keyRow.wallet_address,
        kmsKeyId: keyRow.kms_key_id,
        version: keyRow.key_version
      });
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // BALANCE MANAGEMENT
  // ===========================================================================

  /**
   * Get wallet balance from blockchain
   */
  async getWalletBalance(walletAddress: string): Promise<number> {
    const pubkey = new PublicKey(walletAddress);
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Sync wallet balance to database
   */
  async syncWalletBalance(walletId: string, tenantId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const walletResult = await client.query(
        `SELECT wallet_address FROM custodial_wallets WHERE id = $1`,
        [walletId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error(`Wallet not found: ${walletId}`);
      }

      const balance = await this.getWalletBalance(walletResult.rows[0].wallet_address);

      await client.query(
        `UPDATE custodial_wallets
         SET sol_balance = $1, last_balance_sync = NOW()
         WHERE id = $2`,
        [balance, walletId]
      );

      return balance;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // WALLET STATUS MANAGEMENT
  // ===========================================================================

  /**
   * Update wallet status
   */
  async updateWalletStatus(
    walletId: string,
    tenantId: string,
    status: CustodialWallet['status'],
    reason?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      await client.query(
        `UPDATE custodial_wallets
         SET status = $1, status_reason = $2, status_changed_at = NOW()
         WHERE id = $3`,
        [status, reason, walletId]
      );

      logger.info('Wallet status updated', { walletId, status, reason });
    } finally {
      client.release();
    }
  }

  /**
   * Suspend a wallet (e.g., for fraud)
   */
  async suspendWallet(walletId: string, tenantId: string, reason: string): Promise<void> {
    await this.updateWalletStatus(walletId, tenantId, 'SUSPENDED', reason);
  }

  /**
   * Lock a wallet (temporary hold)
   */
  async lockWallet(walletId: string, tenantId: string, reason: string): Promise<void> {
    await this.updateWalletStatus(walletId, tenantId, 'LOCKED', reason);
  }

  /**
   * Reactivate a wallet
   */
  async reactivateWallet(walletId: string, tenantId: string): Promise<void> {
    await this.updateWalletStatus(walletId, tenantId, 'ACTIVE', 'Reactivated');
  }

  // ===========================================================================
  // ENCRYPTION HELPERS
  // ===========================================================================

  /**
   * Generate a new encrypted keypair using KMS envelope encryption
   */
  private async generateEncryptedKeypair(): Promise<EncryptedKeyData> {
    if (!this.kmsKeyId) {
      throw new Error('KMS_KEY_ID not configured');
    }

    // Generate ed25519 keypair
    const keypair = Keypair.generate();

    // Generate data key from KMS
    const dataKeyResponse = await this.kmsClient.send(new GenerateDataKeyCommand({
      KeyId: this.kmsKeyId,
      KeySpec: 'AES_256',
    }));

    if (!dataKeyResponse.Plaintext || !dataKeyResponse.CiphertextBlob) {
      throw new Error('Failed to generate data key from KMS');
    }

    // Encrypt private key using AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(dataKeyResponse.Plaintext),
      iv
    );

    const encryptedPrivateKey = Buffer.concat([
      cipher.update(Buffer.from(keypair.secretKey)),
      cipher.final(),
      cipher.getAuthTag()
    ]);

    // Clear plaintext data key
    dataKeyResponse.Plaintext.fill(0);

    return {
      encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
      encryptedDataKey: Buffer.from(dataKeyResponse.CiphertextBlob).toString('base64'),
      iv: iv.toString('base64'),
      publicKey: keypair.publicKey.toBase58(),
      kmsKeyId: this.kmsKeyId,
      version: 1
    };
  }

  /**
   * Decrypt private key using KMS
   */
  private async decryptPrivateKey(encryptedData: EncryptedKeyData): Promise<Keypair> {
    // Decrypt data key using KMS
    const decryptResponse = await this.kmsClient.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedData.encryptedDataKey, 'base64'),
      KeyId: encryptedData.kmsKeyId,
    }));

    if (!decryptResponse.Plaintext) {
      throw new Error('Failed to decrypt data key from KMS');
    }

    // Decrypt private key using AES-256-GCM
    const encryptedBuffer = Buffer.from(encryptedData.encryptedPrivateKey, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');

    // Extract auth tag (last 16 bytes)
    const authTag = encryptedBuffer.subarray(-16);
    const ciphertext = encryptedBuffer.subarray(0, -16);

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

    // Clear plaintext data key
    decryptResponse.Plaintext.fill(0);

    // Create keypair
    const keypair = Keypair.fromSecretKey(new Uint8Array(decryptedPrivateKey));

    // Verify public key matches
    if (keypair.publicKey.toBase58() !== encryptedData.publicKey) {
      throw new Error('Public key mismatch - key integrity check failed');
    }

    return keypair;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private mapWalletRow(row: any): CustodialWallet {
    return {
      id: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      walletAddress: row.wallet_address,
      walletType: row.wallet_type,
      blockchainType: row.blockchain_type,
      network: row.network,
      status: row.status,
      solBalance: parseFloat(row.sol_balance || '0'),
      kmsKeyArn: row.kms_key_arn,
      kmsKeyId: row.kms_key_id,
      keyVersion: row.key_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
