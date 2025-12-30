import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { getScanner } from '@tickettoken/shared';
import { getRedis } from '../config/redis';
import { TokenError } from '../errors';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { redisKeys } from '../utils/redisKeys';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  email?: string;
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

interface KeyPair {
  keyId: string;
  privateKey: string;
  publicKey: string;
}

// Key management
class JWTKeyManager {
  private keys: Map<string, KeyPair> = new Map();
  private currentKeyId: string = '';
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (process.env.NODE_ENV === 'production') {
      await this.loadFromSecretsManager();
    } else {
      await this.loadFromFilesystem();
    }

    this.initialized = true;
  }

  private async loadFromSecretsManager(): Promise<void> {
    const privateKey = process.env.JWT_PRIVATE_KEY;
    const publicKey = process.env.JWT_PUBLIC_KEY;

    if (!privateKey || !publicKey) {
      throw new Error('JWT keys not found in environment. Ensure secrets are loaded.');
    }

    const decodedPrivate = this.decodeKey(privateKey);
    const decodedPublic = this.decodeKey(publicKey);

    this.keys.set('current', {
      keyId: 'current',
      privateKey: decodedPrivate,
      publicKey: decodedPublic,
    });
    this.currentKeyId = 'current';

    const previousPrivate = process.env.JWT_PRIVATE_KEY_PREVIOUS;
    const previousPublic = process.env.JWT_PUBLIC_KEY_PREVIOUS;

    if (previousPrivate && previousPublic) {
      this.keys.set('previous', {
        keyId: 'previous',
        privateKey: this.decodeKey(previousPrivate),
        publicKey: this.decodeKey(previousPublic),
      });
      logger.info('JWT key rotation: previous key loaded');
    }

    logger.info('JWT keys loaded from secrets manager');
  }

  private async loadFromFilesystem(): Promise<void> {
    const defaultKeyPath = path.join(process.env.HOME!, 'tickettoken-secrets');
    const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(defaultKeyPath, 'jwt-private.pem');
    const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(defaultKeyPath, 'jwt-public.pem');

    try {
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

      this.keys.set('dev', {
        keyId: 'dev',
        privateKey,
        publicKey,
      });
      this.currentKeyId = 'dev';

      logger.info('JWT keys loaded from filesystem (development mode)');
    } catch (error) {
      throw new Error(
        `JWT keys not found at ${privateKeyPath}. Run: openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096 && openssl rsa -in ~/tickettoken-secrets/jwt-private.pem -pubout -out ~/tickettoken-secrets/jwt-public.pem`
      );
    }
  }

  private decodeKey(key: string): string {
    if (!key.includes('-----BEGIN')) {
      return Buffer.from(key, 'base64').toString('utf8');
    }
    return key;
  }

  getCurrentKeyId(): string {
    return this.currentKeyId;
  }

  getPrivateKey(keyId?: string): string {
    const id = keyId || this.currentKeyId;
    const keyPair = this.keys.get(id);
    if (!keyPair) {
      throw new Error(`JWT key not found: ${id}`);
    }
    return keyPair.privateKey;
  }

  getPublicKey(keyId?: string): string {
    if (!keyId) {
      const keyPair = this.keys.get(this.currentKeyId);
      if (!keyPair) throw new Error('No current JWT key');
      return keyPair.publicKey;
    }

    const keyPair = this.keys.get(keyId);
    if (keyPair) return keyPair.publicKey;

    for (const [, kp] of this.keys) {
      return kp.publicKey;
    }

    throw new Error(`JWT public key not found: ${keyId}`);
  }

  getAllPublicKeys(): Array<{ keyId: string; publicKey: string }> {
    return Array.from(this.keys.entries()).map(([keyId, kp]) => ({
      keyId,
      publicKey: kp.publicKey,
    }));
  }
}

const keyManager = new JWTKeyManager();

export class JWTService {
  private readonly issuer: string;
  private scanner = getScanner();

  constructor() {
    this.issuer = env.JWT_ISSUER;
  }

  async initialize(): Promise<void> {
    await keyManager.initialize();
  }

  async generateTokenPair(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    await keyManager.initialize();

    let tenantId = user.tenant_id;
    if (!tenantId && user.id) {
      const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [user.id]
      );
      tenantId = result.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';
    }

    const currentKeyId = keyManager.getCurrentKeyId();

    const accessTokenPayload = {
      sub: user.id,
      type: 'access' as const,
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      email: user.email,
      permissions: user.permissions || ['buy:tickets', 'view:events', 'transfer:tickets'],
      role: user.role || 'customer',
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
      issuer: this.issuer,
      audience: this.issuer,
      algorithm: 'RS256',
      keyid: currentKeyId,
    };

    const accessToken = jwt.sign(
      accessTokenPayload,
      keyManager.getPrivateKey(),
      accessTokenOptions
    );

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
      algorithm: 'RS256',
      keyid: currentKeyId,
    };

    const refreshToken = jwt.sign(
      refreshTokenPayload,
      keyManager.getPrivateKey(),
      refreshTokenOptions
    );

    const refreshData: RefreshTokenData = {
      userId: user.id,
      tenantId: tenantId,
      family,
      createdAt: Date.now(),
      ipAddress: user.ipAddress || 'unknown',
      userAgent: user.userAgent || 'unknown',
    };

    const redis = getRedis();
    // Use tenant-prefixed key for multi-tenant isolation
    await redis.setex(
      redisKeys.refreshToken(refreshTokenId, tenantId),
      7 * 24 * 60 * 60,
      JSON.stringify(refreshData)
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    await keyManager.initialize();

    try {
      const decoded = jwt.decode(token, { complete: true });
      const keyId = decoded?.header?.kid;

      const payload = jwt.verify(token, keyManager.getPublicKey(keyId), {
        issuer: this.issuer,
        audience: this.issuer,
        algorithms: ['RS256'],
      }) as TokenPayload;

      if (payload.type !== 'access') {
        throw new TokenError('Invalid token type');
      }

      if (!payload.tenant_id) {
        throw new TokenError('Invalid token - missing tenant context');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenError('Access token expired');
      }
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid access token');
    }
  }

  async refreshTokens(
    refreshToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await keyManager.initialize();

    try {
      const redis = getRedis();

      const decodedHeader = jwt.decode(refreshToken, { complete: true });
      const keyId = decodedHeader?.header?.kid;

      const decoded = jwt.verify(refreshToken, keyManager.getPublicKey(keyId), {
        algorithms: ['RS256'],
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new TokenError('Invalid token type');
      }

      // Use tenant-prefixed key
      const storedData = await redis.get(redisKeys.refreshToken(decoded.jti, decoded.tenant_id));

      if (!storedData) {
        await this.invalidateTokenFamily(decoded.family!, decoded.tenant_id);
        throw new TokenError('Token reuse detected - possible theft');
      }

      const tokenData: RefreshTokenData = JSON.parse(storedData);

      const userResult = await pool.query(
        'SELECT id, tenant_id, email, permissions, role FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        throw new TokenError('User not found');
      }

      const user = userResult.rows[0];

      const newTokens = await this.generateTokenPair({
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        permissions: user.permissions,
        role: user.role,
        ipAddress,
        userAgent,
      });

      // Use tenant-prefixed key
      await redis.del(redisKeys.refreshToken(decoded.jti, decoded.tenant_id));

      return newTokens;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid refresh token');
    }
  }

  async invalidateTokenFamily(family: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
    // Scan for keys with tenant prefix if provided
    const pattern = tenantId 
      ? `tenant:${tenantId}:refresh_token:*`
      : 'refresh_token:*';
    const keys = await this.scanner.scanKeys(pattern);

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

  async revokeAllUserTokens(userId: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
    // Scan for keys with tenant prefix if provided
    const pattern = tenantId 
      ? `tenant:${tenantId}:refresh_token:*`
      : 'refresh_token:*';
    const keys = await this.scanner.scanKeys(pattern);

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
    return jwt.decode(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    await keyManager.initialize();

    try {
      const decodedHeader = jwt.decode(token, { complete: true });
      const keyId = decodedHeader?.header?.kid;

      return jwt.verify(token, keyManager.getPublicKey(keyId), {
        algorithms: ['RS256'],
      });
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  getJWKS(): { keys: any[] } {
    const publicKeys = keyManager.getAllPublicKeys();

    return {
      keys: publicKeys.map(({ keyId, publicKey }) => ({
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: keyId,
        pem: publicKey,
      })),
    };
  }

  getPublicKey(): string {
    return keyManager.getPublicKey();
  }
}
