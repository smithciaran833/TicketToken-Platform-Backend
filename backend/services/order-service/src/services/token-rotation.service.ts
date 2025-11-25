/**
 * Token Rotation Service
 * Manages JWT token rotation and blacklisting
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TokenPayload {
  userId: string;
  sessionId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export class TokenRotationService {
  private pool: Pool;
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex');
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  /**
   * Generate new token pair
   */
  async generateTokenPair(userId: string, sessionId: string): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(userId, sessionId);
    const refreshToken = this.generateRefreshToken(userId, sessionId);

    // Store refresh token
    await this.storeRefreshToken(userId, refreshToken, sessionId);

    // Get expiry time
    const decoded = jwt.decode(accessToken) as any;
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

    logger.info('Token pair generated', { userId, sessionId });

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshTokenSecret) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      // Check if refresh token exists in database
      const exists = await this.refreshTokenExists(decoded.userId, refreshToken);
      if (!exists) {
        throw new Error('Refresh token not found');
      }

      // Generate new token pair
      const newTokenPair = await this.generateTokenPair(decoded.userId, decoded.sessionId);

      // Blacklist old refresh token
      await this.blacklistToken(refreshToken, decoded.exp);

      logger.info('Access token refreshed', {
        userId: decoded.userId,
        sessionId: decoded.sessionId,
      });

      return newTokenPair;

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      return decoded;

    } catch (error) {
      logger.debug('Token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeUserTokens(userId: string): Promise<void> {
    // Get all refresh tokens for user
    const result = await this.pool.query(
      `SELECT refresh_token, expires_at FROM refresh_tokens WHERE user_id = $1`,
      [userId]
    );

    // Blacklist each token
    for (const row of result.rows) {
      const expiresAt = Math.floor(new Date(row.expires_at).getTime() / 1000);
      await this.blacklistToken(row.refresh_token, expiresAt);
    }

    // Delete refresh tokens from database
    await this.pool.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [userId]
    );

    logger.info('All user tokens revoked', { userId });
  }

  /**
   * Revoke specific token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded) {
        throw new Error('Invalid token');
      }

      await this.blacklistToken(token, decoded.exp);

      if (decoded.type === 'refresh') {
        await this.pool.query(
          `DELETE FROM refresh_tokens WHERE refresh_token = $1`,
          [token]
        );
      }

      logger.info('Token revoked', {
        userId: decoded.userId,
        type: decoded.type,
      });

    } catch (error) {
      logger.error('Token revocation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens(): Promise<{ refreshTokens: number; blacklist: number }> {
    const [refreshResult, blacklistResult] = await Promise.all([
      // Delete expired refresh tokens
      this.pool.query(
        `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
      ),

      // Delete expired blacklist entries
      this.pool.query(
        `DELETE FROM token_blacklist WHERE expires_at < NOW()`
      ),
    ]);

    const refreshCount = refreshResult.rowCount || 0;
    const blacklistCount = blacklistResult.rowCount || 0;

    if (refreshCount > 0 || blacklistCount > 0) {
      logger.info('Expired tokens cleaned up', {
        refreshTokens: refreshCount,
        blacklist: blacklistCount,
      });
    }

    return { refreshTokens: refreshCount, blacklist: blacklistCount };
  }

  /**
   * Generate access token
   */
  private generateAccessToken(userId: string, sessionId: string): string {
    return jwt.sign(
      {
        userId,
        sessionId,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
      } as jwt.SignOptions
    );
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(userId: string, sessionId: string): string {
    return jwt.sign(
      {
        userId,
        sessionId,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
      } as jwt.SignOptions
    );
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    sessionId: string
  ): Promise<void> {
    const decoded = jwt.decode(refreshToken) as TokenPayload;
    const expiresAt = new Date(decoded.exp * 1000);

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, refresh_token, session_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, refreshToken, sessionId, expiresAt]
    );
  }

  /**
   * Check if refresh token exists
   */
  private async refreshTokenExists(userId: string, refreshToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM refresh_tokens WHERE user_id = $1 AND refresh_token = $2`,
      [userId, refreshToken]
    );

    return result.rows.length > 0;
  }

  /**
   * Add token to blacklist
   */
  private async blacklistToken(token: string, expiresAt: number): Promise<void> {
    const expiryDate = new Date(expiresAt * 1000);

    await this.pool.query(
      `INSERT INTO token_blacklist (token, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (token) DO NOTHING`,
      [token, expiryDate]
    );
  }

  /**
   * Check if token is blacklisted
   */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM token_blacklist WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    return result.rows.length > 0;
  }
}
