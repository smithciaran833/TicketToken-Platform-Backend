import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { TokenError } from '../errors';
import { pool } from '../config/database';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  permissions?: string[];
  role?: string;
  family?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  family: string;
  createdAt: number;
  ipAddress: string;
  userAgent: string;
}

export class JWTService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly issuer: string;

  constructor() {
    this.accessSecret = env.JWT_ACCESS_SECRET;
    this.refreshSecret = env.JWT_REFRESH_SECRET;
    this.issuer = env.JWT_ISSUER;
  }

  async generateTokenPair(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    // Ensure we have tenant_id - fetch if not provided
    let tenantId = user.tenant_id;
    if (!tenantId && user.id) {
      const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [user.id]
      );
      tenantId = result.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';
    }

    // Access token - now includes tenant_id
    const accessTokenPayload = {
      sub: user.id,
      type: 'access' as const,
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      permissions: user.permissions || ['buy:tickets', 'view:events', 'transfer:tickets'],
      role: user.role || 'customer',
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
      issuer: this.issuer,
      audience: this.issuer,
      algorithm: 'HS256',
    };

    const accessToken = jwt.sign(accessTokenPayload, this.accessSecret, accessTokenOptions);

    // Refresh token - also includes tenant_id for consistency
    const refreshTokenId = crypto.randomUUID();
    const family = crypto.randomUUID();

    const refreshTokenPayload = {
      sub: user.id,
      type: 'refresh' as const,
      jti: refreshTokenId,
      tenant_id: tenantId,
      family,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
      algorithm: 'HS256',
    };

    const refreshToken = jwt.sign(refreshTokenPayload, this.refreshSecret, refreshTokenOptions);

    // Store refresh token metadata with tenant_id
    const refreshData: RefreshTokenData = {
      userId: user.id,
      tenantId: tenantId,
      family,
      createdAt: Date.now(),
      ipAddress: user.ipAddress || 'unknown',
      userAgent: user.userAgent || 'unknown',
    };

    await redis.setex(
      `refresh_token:${refreshTokenId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(refreshData)
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: this.issuer,
        algorithms: ['HS256'],
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new TokenError('Invalid token type');
      }

      // Validate tenant_id is present
      if (!decoded.tenant_id) {
        throw new TokenError('Invalid token - missing tenant context');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenError('Access token expired');
      }
      throw new TokenError('Invalid access token');
    }
  }

  async refreshTokens(refreshToken: string, ipAddress: string, userAgent: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshSecret, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new TokenError('Invalid token type');
      }

      // Check if token exists and hasn't been revoked
      const storedData = await redis.get(`refresh_token:${decoded.jti}`);

      if (!storedData) {
        // Token reuse detected - invalidate entire family
        await this.invalidateTokenFamily(decoded.family!);
        throw new TokenError('Token reuse detected - possible theft');
      }

      // Parse stored data
      const tokenData: RefreshTokenData = JSON.parse(storedData);

      // Fetch fresh user data to ensure correct tenant_id
      const userResult = await pool.query(
        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        throw new TokenError('User not found');
      }

      const user = userResult.rows[0];

      // Generate new token pair with current tenant_id
      const newTokens = await this.generateTokenPair({
        id: user.id,
        tenant_id: user.tenant_id,
        permissions: user.permissions,
        role: user.role,
        ipAddress,
        userAgent,
      });

      // Invalidate old refresh token
      await redis.del(`refresh_token:${decoded.jti}`);

      return newTokens;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid refresh token');
    }
  }

  async invalidateTokenFamily(family: string): Promise<void> {
    // Find all tokens in the family
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.family === family) {
          await redis.del(key);
        }
      }
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  decode(token: string): any {
    const jwt = require('jsonwebtoken');
    return jwt.decode(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(token, this.refreshSecret);
    } catch {
      throw new Error('Invalid refresh token');
    }
  }
}
