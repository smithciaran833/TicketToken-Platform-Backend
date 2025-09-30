import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: 6379
});

export class TokenValidator {
  private readonly CACHE_TTL = 60; // Cache validation results for 60 seconds

  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Decode token to get JTI
      const decoded: any = jwt.decode(token);
      if (!decoded || !decoded.jti) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const jti = decoded.jti;
      const userId = decoded.sub;

      // 1. Check Redis cache first (fastest)
      const cachedStatus = await redis.get(`token:${jti}`);
      if (cachedStatus === 'revoked') {
        return res.status(401).json({ error: 'Token has been revoked' });
      }
      if (cachedStatus === 'valid') {
        req.user = decoded;
        return next();
      }

      // 2. Check database (if not in cache)
      const result = await pool.query(
        `SELECT t.revoked, t.expires_at, f.revoked as family_revoked
         FROM active_tokens t
         LEFT JOIN token_families f ON t.family_id = f.family_id
         WHERE t.jti = $1`,
        [jti]
      );

      if (result.rows.length === 0) {
        // Token not tracked - could be old format, verify signature only
        try {
          jwt.verify(token, process.env.JWT_SECRET!);
          req.user = decoded;
          return next();
        } catch {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }

      const tokenData = result.rows[0];

      // Check if revoked
      if (tokenData.revoked || tokenData.family_revoked) {
        await redis.setex(`token:${jti}`, this.CACHE_TTL, 'revoked');

        // Log suspicious activity if token used after revocation
        await pool.query(
          `INSERT INTO auth_audit_log (user_id, event_type, ip_address, details)
           VALUES ($1, 'REVOKED_TOKEN_USE', $2, $3)`,
          [userId, req.ip, JSON.stringify({ jti })]
        );

        return res.status(401).json({ error: 'Token has been revoked' });
      }

      // Check expiration
      if (new Date(tokenData.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Token expired' });
      }

      // Token is valid - cache it
      await redis.setex(`token:${jti}`, this.CACHE_TTL, 'valid');

      // Update last used timestamp (async, don't wait)
      pool.query(
        'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
        [jti]
      ).catch(err => console.error('Failed to update token usage:', err));

      // Verify JWT signature
      try {
        jwt.verify(token, process.env.JWT_SECRET!);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token signature' });
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return res.status(500).json({ error: 'Token validation failed' });
    }
  }

  // Revoke a specific token
  async revokeToken(jti: string, reason: string = 'User action') {
    await pool.query(
      'UPDATE active_tokens SET revoked = TRUE WHERE jti = $1',
      [jti]
    );
    await redis.setex(`token:${jti}`, 86400, 'revoked'); // Cache for 24 hours
  }

  // Revoke all tokens for a user
  async revokeUserTokens(userId: string, reason: string = 'Security') {
    await pool.query('SELECT revoke_all_user_tokens($1, $2)', [userId, reason]);

    // Clear Redis cache for user's tokens
    const tokens = await pool.query(
      'SELECT jti FROM active_tokens WHERE user_id = $1',
      [userId]
    );

    for (const token of tokens.rows) {
      await redis.del(`token:${token.jti}`);
    }
  }

  // Implement refresh token rotation
  async rotateRefreshToken(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const decoded: any = jwt.decode(oldRefreshToken);

    // Check if refresh token family is valid
    const familyCheck = await pool.query(
      'SELECT * FROM token_families WHERE family_id = $1 AND revoked = FALSE',
      [decoded.familyId]
    );

    if (familyCheck.rows.length === 0) {
      // Possible token theft - revoke entire family
      await this.revokeTokenFamily(decoded.familyId, 'Possible token theft detected');
      throw new Error('Invalid refresh token family');
    }

    // Generate new token pair
    const newTokens = await this.generateTokenPair(decoded.sub, decoded.familyId);

    // Mark old refresh token as used
    await pool.query(
      'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
      [decoded.jti]
    );

    // Update family rotation info
    await pool.query(
      `UPDATE token_families
       SET last_rotated_at = CURRENT_TIMESTAMP,
           rotation_count = rotation_count + 1
       WHERE family_id = $1`,
      [decoded.familyId]
    );

    return newTokens;
  }

  private async revokeTokenFamily(familyId: string, reason: string) {
    await pool.query(
      `UPDATE token_families
       SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revoke_reason = $1
       WHERE family_id = $2`,
      [reason, familyId]
    );

    await pool.query(
      'UPDATE active_tokens SET revoked = TRUE WHERE family_id = $1',
      [familyId]
    );
  }

  private async generateTokenPair(userId: string, familyId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenJti = uuidv4();
    const refreshTokenJti = uuidv4();
    
    // Generate access token (15 minutes)
    const accessToken = jwt.sign(
      { 
        sub: userId, 
        jti: accessTokenJti,
        familyId: familyId,
        type: 'access'
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );
    
    // Generate refresh token (7 days)
    const refreshToken = jwt.sign(
      { 
        sub: userId, 
        jti: refreshTokenJti,
        familyId: familyId,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Track tokens in database
    const accessExpires = new Date(Date.now() + 15 * 60 * 1000);
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await pool.query(
      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [accessTokenJti, userId, familyId, 'access', accessExpires]
    );
    
    await pool.query(
      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [refreshTokenJti, userId, familyId, 'refresh', refreshExpires]
    );
    
    return { accessToken, refreshToken };
  }
}
