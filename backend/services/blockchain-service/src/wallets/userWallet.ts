import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Pool } from 'pg';

interface ConnectionResult {
  success: boolean;
  wallet?: any;
  message: string;
  error?: string;
}

export class UserWalletManager {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async connectWallet(userId: string, walletAddress: string, signatureBase64: string, message?: string): Promise<ConnectionResult> {
    try {
      // Default message if not provided
      const signMessage = message || `Connect wallet to TicketToken: ${userId}`;

      // Verify signature
      const verified = await this.verifySignature(
        walletAddress,
        signatureBase64,
        signMessage
      );

      if (!verified) {
        throw new Error('Invalid wallet signature');
      }

      // Check if wallet already exists
      const existing = await this.db.query(
        'SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2',
        [userId, walletAddress]
      );

      if (existing.rows.length > 0) {
        // Update existing connection
        await this.db.query(`
          UPDATE wallet_addresses
          SET verified_at = NOW(),
              is_primary = true,
              last_used_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1 AND wallet_address = $2
        `, [userId, walletAddress]);

        // Update other wallets to not be primary
        await this.db.query(`
          UPDATE wallet_addresses
          SET is_primary = false
          WHERE user_id = $1 AND wallet_address != $2
        `, [userId, walletAddress]);

        return {
          success: true,
          wallet: existing.rows[0],
          message: 'Wallet reconnected successfully'
        };
      }

      // Set other wallets as non-primary
      await this.db.query(`
        UPDATE wallet_addresses
        SET is_primary = false
        WHERE user_id = $1
      `, [userId]);

      // Store new wallet connection
      const result = await this.db.query(`
        INSERT INTO wallet_addresses
        (user_id, wallet_address, blockchain_type, is_primary, verified_at, created_at, updated_at)
        VALUES ($1, $2, 'SOLANA', true, NOW(), NOW(), NOW())
        RETURNING *
      `, [userId, walletAddress]);

      // Log connection in user_wallet_connections
      await this.db.query(`
        INSERT INTO user_wallet_connections
        (user_id, wallet_address, signature_proof, connected_at, is_primary)
        VALUES ($1, $2, $3, NOW(), true)
      `, [userId, walletAddress, signatureBase64]);

      return {
        success: true,
        wallet: result.rows[0],
        message: 'Wallet connected successfully'
      };

    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      return {
        success: false,
        message: '',
        error: error.message
      };
    }
  }

  async verifySignature(publicKeyString: string, signatureBase64: string, message: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(publicKeyString);
      const signature = Buffer.from(signatureBase64, 'base64');
      const messageBytes = new TextEncoder().encode(message);

      return nacl.sign.detached.verify(
        messageBytes,
        signature,
        publicKey.toBuffer()
      );
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  async getUserWallets(userId: string): Promise<any[]> {
    const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1
      ORDER BY is_primary DESC NULLS LAST, created_at DESC
    `, [userId]);

    return result.rows;
  }

  async getPrimaryWallet(userId: string): Promise<any | null> {
    const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1 AND is_primary = true
      LIMIT 1
    `, [userId]);

    return result.rows[0] || null;
  }

  async verifyOwnership(userId: string, walletAddress: string): Promise<boolean> {
    const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);

    return result.rows.length > 0;
  }

  async disconnectWallet(userId: string, walletAddress: string): Promise<{ success: boolean; message: string }> {
    await this.db.query(`
      DELETE FROM wallet_addresses
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);

    return { success: true, message: 'Wallet disconnected' };
  }

  async updateLastUsed(userId: string, walletAddress: string): Promise<void> {
    await this.db.query(`
      UPDATE wallet_addresses
      SET last_used_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);
  }
}

export default UserWalletManager;
