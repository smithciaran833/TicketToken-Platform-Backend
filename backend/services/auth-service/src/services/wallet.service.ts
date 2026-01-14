import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { pool } from '../config/database';
import { getRedis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { JWTService } from './jwt.service';
import { auditService } from './audit.service';
import { redisKeys } from '../utils/redisKeys';
import { logger } from '../utils/logger';

export class WalletService {
  private jwtService: JWTService;
  private log = logger.child({ component: 'WalletService' });

  constructor(jwtService?: JWTService) {
    this.jwtService = jwtService || new JWTService();
  }

  async generateNonce(publicKey: string, chain: string, tenantId?: string): Promise<{ nonce: string; message: string }> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const message = `Sign this message to authenticate with TicketToken\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    const nonceData = {
      nonce,
      publicKey,
      chain,
      timestamp,
      tenantId,
      expiresAt: timestamp + 900000
    };

    const redis = getRedis();
    await redis.setex(redisKeys.walletNonce(nonce, tenantId), 900, JSON.stringify(nonceData));

    return { nonce, message };
  }

  async verifySolanaSignature(
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const publicKeyObj = new PublicKey(publicKey);
      const signatureBuffer = bs58.decode(signature);
      const messageBuffer = Buffer.from(message);

      return nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKeyObj.toBytes()
      );
    } catch (error) {
      this.log.warn('Solana signature verification failed', {
        publicKey: publicKey.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async verifyEthereumSignature(
    address: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.log.warn('Ethereum signature verification failed', {
        address: address.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async getNonceData(nonce: string, tenantId?: string): Promise<{ data: any; key: string } | null> {
    const redis = getRedis();

    if (tenantId) {
      const data = await redis.get(redisKeys.walletNonce(nonce, tenantId));
      if (data) {
        return { data: JSON.parse(data), key: redisKeys.walletNonce(nonce, tenantId) };
      }
    }

    const data = await redis.get(`wallet-nonce:${nonce}`);
    if (data) {
      return { data: JSON.parse(data), key: `wallet-nonce:${nonce}` };
    }

    return null;
  }

  private async deleteNonce(nonce: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
    await redis.del(redisKeys.walletNonce(nonce, tenantId));
    await redis.del(`wallet-nonce:${nonce}`);
  }

  async registerWithWallet(
    publicKey: string,
    signature: string,
    nonce: string,
    chain: 'solana' | 'ethereum',
    tenantId: string
  ): Promise<{ user: any; tokens: any; wallet: any }> {
    const nonceResult = await this.getNonceData(nonce, tenantId);
    if (!nonceResult) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const storedNonce = nonceResult.data;
    if (storedNonce.publicKey !== publicKey || storedNonce.chain !== chain) {
      throw new AuthenticationError('Nonce mismatch');
    }

    const message = `Sign this message to authenticate with TicketToken\nNonce: ${storedNonce.nonce}\nTimestamp: ${storedNonce.timestamp}`;

    let isValid = false;
    if (chain === 'solana') {
      isValid = await this.verifySolanaSignature(publicKey, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(publicKey, signature, message);
    }

    if (!isValid) {
      await this.deleteNonce(nonce, tenantId);
      throw new AuthenticationError('Invalid wallet signature');
    }

    const client = await pool.connect();
    let user;
    let tokens;
    let sessionId;

    try {
      await client.query('BEGIN');

      const syntheticEmail = `wallet-${publicKey.substring(0, 16).toLowerCase()}@internal.wallet`;

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, email_verified, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, email_verified, mfa_enabled, permissions, role, tenant_id`,
        [syntheticEmail, '', true, tenantId, new Date()]
      );

      user = userResult.rows[0];

      const network = chain;
      await client.query(
        `INSERT INTO wallet_connections (user_id, tenant_id, wallet_address, network, verified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, tenantId, publicKey, network, true, new Date()]
      );

      const sessionResult = await client.query(
        `INSERT INTO user_sessions (user_id, tenant_id, started_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [user.id, tenantId]
      );
      sessionId = sessionResult.rows[0].id;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await auditService.logSessionCreated(user.id, sessionId, undefined, undefined, tenantId);

    await this.deleteNonce(nonce, tenantId);

    tokens = await this.jwtService.generateTokenPair({
      id: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      permissions: user.permissions,
      role: user.role,
      wallet: publicKey
    });

    this.log.info('Wallet registration successful', {
      userId: user.id,
      chain,
      walletPrefix: publicKey.substring(0, 8)
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
        mfa_enabled: user.mfa_enabled || false,
        tenant_id: user.tenant_id
      },
      tokens,
      wallet: {
        address: publicKey,
        chain,
        connected: true
      }
    };
  }

  async loginWithWallet(
    publicKey: string,
    signature: string,
    nonce: string,
    chain: 'solana' | 'ethereum'
  ): Promise<{ user: any; tokens: any; wallet: any }> {
    const nonceResult = await this.getNonceData(nonce);
    if (!nonceResult) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const storedNonce = nonceResult.data;
    if (storedNonce.publicKey !== publicKey || storedNonce.chain !== chain) {
      throw new AuthenticationError('Nonce mismatch');
    }

    const message = `Sign this message to authenticate with TicketToken\nNonce: ${storedNonce.nonce}\nTimestamp: ${storedNonce.timestamp}`;

    let isValid = false;
    if (chain === 'solana') {
      isValid = await this.verifySolanaSignature(publicKey, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(publicKey, signature, message);
    }

    if (!isValid) {
      await this.deleteNonce(nonce, storedNonce.tenantId);
      throw new AuthenticationError('Invalid wallet signature');
    }

    const network = chain;

    const connectionResult = await pool.query(
      'SELECT wc.*, u.tenant_id FROM wallet_connections wc JOIN users u ON wc.user_id = u.id WHERE wc.wallet_address = $1 AND wc.network = $2 AND wc.verified = true AND u.deleted_at IS NULL',
      [publicKey, network]
    );

    if (connectionResult.rows.length === 0) {
      await this.deleteNonce(nonce, storedNonce.tenantId);
      throw new AuthenticationError('Wallet not connected to any account');
    }

    const connection = connectionResult.rows[0];

    const userResult = await pool.query(
      'SELECT id, email, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [connection.user_id]
    );

    if (userResult.rows.length === 0) {
      await this.deleteNonce(nonce, storedNonce.tenantId);
      throw new AuthenticationError('User not found');
    }

    const user = userResult.rows[0];

    const client = await pool.connect();
    let tokens;
    let sessionId;

    try {
      await client.query('BEGIN');

      const sessionResult = await client.query(
        `INSERT INTO user_sessions (user_id, tenant_id, started_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [user.id, user.tenant_id]
      );
      sessionId = sessionResult.rows[0].id;

      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await auditService.logSessionCreated(user.id, sessionId, undefined, undefined, user.tenant_id);

    await this.deleteNonce(nonce, user.tenant_id);

    tokens = await this.jwtService.generateTokenPair({
      id: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      permissions: user.permissions,
      role: user.role,
      wallet: publicKey
    });

    this.log.info('Wallet login successful', {
      userId: user.id,
      chain,
      walletPrefix: publicKey.substring(0, 8)
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
        mfa_enabled: user.mfa_enabled || false,
        tenant_id: user.tenant_id
      },
      tokens,
      wallet: {
        address: publicKey,
        chain,
        connected: true
      }
    };
  }

  async linkWallet(
    userId: string,
    publicKey: string,
    signature: string,
    nonce: string,
    chain: 'solana' | 'ethereum'
  ): Promise<{ success: boolean; wallet: any }> {
    const nonceResult = await this.getNonceData(nonce);
    if (!nonceResult) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const storedNonce = nonceResult.data;
    if (storedNonce.publicKey !== publicKey || storedNonce.chain !== chain) {
      throw new AuthenticationError('Nonce mismatch');
    }

    const message = `Sign this message to authenticate with TicketToken\nNonce: ${storedNonce.nonce}\nTimestamp: ${storedNonce.timestamp}`;

    let isValid = false;
    if (chain === 'solana') {
      isValid = await this.verifySolanaSignature(publicKey, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(publicKey, signature, message);
    }

    if (!isValid) {
      await this.deleteNonce(nonce, storedNonce.tenantId);
      throw new AuthenticationError('Invalid wallet signature');
    }

    const network = chain;

    const userCheck = await pool.query(
      'SELECT tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      await this.deleteNonce(nonce, storedNonce.tenantId);
      throw new AuthenticationError('User not found');
    }

    const userTenantId = userCheck.rows[0].tenant_id;

    const existingResult = await pool.query(
      'SELECT wc.user_id, u.tenant_id FROM wallet_connections wc JOIN users u ON wc.user_id = u.id WHERE wc.wallet_address = $1 AND wc.network = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL',
      [publicKey, network, userTenantId]
    );

    if (existingResult.rows.length > 0 && existingResult.rows[0].user_id !== userId) {
      await this.deleteNonce(nonce, userTenantId);
      throw new AuthenticationError('Wallet already connected to another account');
    }

    if (existingResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO wallet_connections (user_id, tenant_id, wallet_address, network, verified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, userTenantId, publicKey, network, true, new Date()]
      );
    }

    await this.deleteNonce(nonce, userTenantId);

    this.log.info('Wallet linked successfully', {
      userId,
      chain,
      walletPrefix: publicKey.substring(0, 8)
    });

    return {
      success: true,
      wallet: {
        address: publicKey,
        chain,
        connected: true
      }
    };
  }

  async unlinkWallet(
    userId: string,
    publicKey: string
  ): Promise<{ success: boolean }> {
    const result = await pool.query(
      'DELETE FROM wallet_connections wc USING users u WHERE wc.user_id = u.id AND wc.user_id = $1 AND wc.wallet_address = $2 AND u.deleted_at IS NULL',
      [userId, publicKey]
    );

    if (result.rowCount === 0) {
      throw new AuthenticationError('Wallet not found or not linked to your account');
    }

    this.log.info('Wallet unlinked successfully', {
      userId,
      walletPrefix: publicKey.substring(0, 8)
    });

    return { success: true };
  }
}
