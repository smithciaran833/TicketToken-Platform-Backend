import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export class EnhancedJWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry = '2h';
  private readonly refreshTokenExpiry = '7d';
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(64).toString('hex');
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    this.redis = redis;
    
    if (!process.env.JWT_ACCESS_SECRET) {
      console.warn('⚠️  JWT_ACCESS_SECRET not set, using random secret (not for production!)');
    }
  }
  
  async generateTokenPair(userId: string, role: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const jti = crypto.randomUUID(); // JWT ID for tracking
    
    const accessToken = jwt.sign(
      { 
        userId, 
        role,
        type: 'access',
        jti 
      },
      this.accessTokenSecret,
      { 
        expiresIn: this.accessTokenExpiry,
        issuer: 'tickettoken',
        audience: 'tickettoken-api'
      }
    );
    
    const refreshToken = jwt.sign(
      { 
        userId,
        type: 'refresh',
        jti: crypto.randomUUID()
      },
      this.refreshTokenSecret,
      { 
        expiresIn: this.refreshTokenExpiry,
        issuer: 'tickettoken'
      }
    );
    
    // Store refresh token in Redis with expiry
    await this.redis.setex(
      `refresh_token:${userId}:${refreshToken}`,
      7 * 24 * 60 * 60, // 7 days in seconds
      JSON.stringify({ userId, createdAt: new Date().toISOString() })
    );
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    };
  }
  
  async verifyAccessToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'tickettoken',
        audience: 'tickettoken-api'
      });
      
      // Check if token is blacklisted (for logout)
      const isBlacklisted = await this.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }
  
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshTokenSecret) as any;
      
      // Check if refresh token exists in Redis
      const storedToken = await this.redis.get(`refresh_token:${decoded.userId}:${refreshToken}`);
      if (!storedToken) {
        throw new Error('Refresh token not found or expired');
      }
      
      // Delete old refresh token (rotation)
      await this.redis.del(`refresh_token:${decoded.userId}:${refreshToken}`);
      
      // Generate new token pair
      return await this.generateTokenPair(decoded.userId, decoded.role || 'user');
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
  
  async revokeToken(token: string): Promise<void> {
    // Add to blacklist with TTL matching token expiry
    const decoded = jwt.decode(token) as any;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.setex(`blacklist:${token}`, ttl, 'revoked');
      }
    }
  }
  
  async revokeAllUserTokens(userId: string): Promise<void> {
    // Get all refresh tokens for user
    const keys = await this.redis.keys(`refresh_token:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
