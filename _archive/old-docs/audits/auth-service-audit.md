# DATABASE AUDIT: auth-service
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.0.1",
    "nodemailer": "^6.9.7",
    "otplib": "^12.0.1",
    "pg": "^8.11.3",
    "pino": "^8.21.0",
    "pino-http": "^10.5.0",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import { Pool } from 'pg';
import knex from 'knex';

// Simple, working configuration
const dbConfig = {
  host: process.env.DB_HOST || 'tickettoken-postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export const pool = new Pool({
  ...dbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 2, max: 10 }
});

pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result.rows[0];
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function closeDatabaseConnections() {
  await db.destroy();
  await pool.end();
}
```


## 3. MODEL/ENTITY FILES
### backend/services/auth-service//src/models/user.model.ts
```typescript
export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_level: number;
  mfa_enabled: boolean;
  mfa_secret?: string;
  backup_codes?: string[];
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_login_ip?: string;
  failed_login_attempts: number;
  locked_until?: Date;
  password_reset_token?: string;
  password_reset_expires?: Date;
  email_verification_token?: string;
  email_verification_expires?: Date;
  deleted_at?: Date;
  deleted_by?: string;
  deletion_reason?: string;
  version: number; // For optimistic locking
}

export interface UserVenueRole {
  id: string;
  user_id: string;
  venue_id: string;
  role: 'venue-owner' | 'venue-manager' | 'box-office' | 'door-staff';
  granted_by: string;
  granted_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  expires_at: Date;
  revoked_at?: Date;
}

export interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  success: boolean;
  attempted_at: Date;
  failure_reason?: string;
}
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/auth-service//src/index.ts:190:        `UPDATE users
backend/services/auth-service//src/index.ts:229:      `INSERT INTO auth_audit_log (user_id, event_type, ip_address)
backend/services/auth-service//src/middleware/token-validator.ts:45:         FROM active_tokens t
backend/services/auth-service//src/middleware/token-validator.ts:46:         LEFT JOIN token_families f ON t.family_id = f.family_id
backend/services/auth-service//src/middleware/token-validator.ts:70:          `INSERT INTO auth_audit_log (user_id, event_type, ip_address, details)
backend/services/auth-service//src/middleware/token-validator.ts:88:        'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:109:      'UPDATE active_tokens SET revoked = TRUE WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:121:      'SELECT jti FROM active_tokens WHERE user_id = $1',
backend/services/auth-service//src/middleware/token-validator.ts:136:      'SELECT * FROM token_families WHERE family_id = $1 AND revoked = FALSE',
backend/services/auth-service//src/middleware/token-validator.ts:151:      'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:157:      `UPDATE token_families
backend/services/auth-service//src/middleware/token-validator.ts:169:      `UPDATE token_families
backend/services/auth-service//src/middleware/token-validator.ts:176:      'UPDATE active_tokens SET revoked = TRUE WHERE family_id = $1',
backend/services/auth-service//src/middleware/token-validator.ts:214:      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
backend/services/auth-service//src/middleware/token-validator.ts:220:      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
backend/services/auth-service//src/middleware/enhanced-security.ts:31:        `SELECT locked_until FROM failed_login_attempts
backend/services/auth-service//src/services/auth.service.ts:31:        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:47:        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
backend/services/auth-service//src/services/auth.service.ts:92:        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:169:        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:185:          `INSERT INTO token_refresh_log (user_id, ip_address, user_agent, refreshed_at)
backend/services/auth-service//src/services/auth.service.ts:231:          `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
backend/services/auth-service//src/services/auth.service.ts:240:        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:262:      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
backend/services/auth-service//src/services/auth.service.ts:282:        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:292:          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
backend/services/auth-service//src/services/auth.service.ts:330:      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:342:      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:353:      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:371:      'UPDATE users SET password_hash = $1 WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:380:      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/jwt.service.ts:63:        'SELECT tenant_id FROM users WHERE id = $1',
backend/services/auth-service//src/services/jwt.service.ts:179:        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### biometric.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';

export class BiometricService {
  /**
   * Register biometric public key for a device
   */
  async registerBiometric(
    userId: string,
    deviceId: string,
    publicKey: string,
    type: 'faceId' | 'touchId' | 'fingerprint'
  ): Promise<any> {
    // Generate a unique credential ID
    const credentialId = crypto.randomUUID();
    
    // Store biometric credential
    await db('biometric_credentials').insert({
      id: credentialId,
      user_id: userId,
      device_id: deviceId,
      public_key: publicKey,
      credential_type: type,
      created_at: new Date()
    });
    
    return {
      success: true,
      credentialId,
      type
    };
  }

  /**
   * Verify biometric authentication
   */
  async verifyBiometric(
    userId: string,
    deviceId: string,
    credentialId: string,
    signature: string,
    challenge: string
  ): Promise<boolean> {
    // Get stored credential
    const credential = await db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        device_id: deviceId,
        is_active: true
      })
      .first();
    
    if (!credential) {
      throw new AuthenticationError('Biometric credential not found');
    }
    
    // In production, verify signature with public key
    // For now, we'll do a simple check
    const expectedSignature = crypto
      .createHash('sha256')
      .update(challenge + credential.public_key)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * Generate biometric challenge
   */
  async generateChallenge(userId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    
    // Store challenge in Redis with 5 minute expiry
    await redis.setex(
      `biometric_challenge:${userId}`,
      300,
      challenge
    );
    
    return challenge;
  }

  /**
   * List registered biometric devices
   */
  async listBiometricDevices(userId: string): Promise<any[]> {
    return db('biometric_credentials')
      .where({ user_id: userId, is_active: true })
      .select('id', 'device_id', 'credential_type', 'created_at');
  }
}
```

### audit.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { auditLogger } from '../config/logger';

export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    try {
      // Log to database
      await db('audit_logs').insert({
        user_id: event.userId,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date()
      });

      // Also log to file/stdout for centralized logging
      auditLogger.info({
        ...event,
        timestamp: new Date().toISOString()
      }, `Audit: ${event.action}`);
    } catch (error) {
      // Don't fail the request if audit logging fails
      auditLogger.error({ error, event }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string) {
    await this.log({
      userId,
      action: 'user.login',
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.registration',
      ipAddress,
      metadata: { email },
      status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.password_changed',
      ipAddress,
      status: 'success'
    });
  }

  async logMFAEnabled(userId: string) {
    await this.log({
      userId,
      action: 'user.mfa_enabled',
      status: 'success'
    });
  }

  async logTokenRefresh(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'token.refreshed',
      ipAddress,
      status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string) {
    await this.log({
      userId: grantedBy,
      action: 'role.granted',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { targetUserId: userId, role },
      status: 'success'
    });
```

### monitoring.service.ts
First 100 lines:
```typescript
import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { pool } from '../config/database';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
  details?: any;
}

export class MonitoringService {
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory()
    ]);

    const [database, redisCheck, memory] = checks;
    
    const allHealthy = checks.every(check => check.status === 'ok');
    const anyUnhealthy = checks.some(check => check.status === 'error');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database,
        redis: redisCheck,
        memory
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await db.raw('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        latency,
        details: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingConnections: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await redis.ping();
      const latency = Date.now() - start;
      
      const info = await redis.info('stats');
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
      return {
        status: 'ok',
        latency,
        details: {
          connectedClients: connectedClients ? parseInt(connectedClients) : undefined
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
```

### enhanced-jwt.service.ts
First 100 lines:
```typescript
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
```

### auth-extended.service.ts
First 100 lines:
```typescript
import argon2 from 'argon2';
// import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { ValidationError, AuthenticationError } from '../errors';
import { passwordResetRateLimiter } from '../utils/rateLimiter';
import { EmailService } from './email.service';

export class AuthExtendedService {
  private emailService: EmailService;

  constructor(emailService: EmailService) {
    this.emailService = emailService;
  }

  async requestPasswordReset(email: string, ipAddress: string): Promise<void> {
    // Rate limit password reset requests
    await passwordResetRateLimiter.consume(ipAddress);

    // Find user
    const user = await db('users')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(
      user.id,
      user.email,
      user.first_name
    );

    // Log the request
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'password_reset_requested',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async resetPassword(token: string, newPassword: string, ipAddress: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`password-reset:${token}`);
    
    if (!tokenData) {
      throw new ValidationError('Invalid or expired reset token' as any);
    }

    const { userId } = JSON.parse(tokenData);

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const hashedPassword = await argon2.hash(newPassword);

    // Update password
    await db('users')
      .where({ id: userId })
      .update({
        password_hash: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      });

    // Delete the reset token
    await redis.del(`password-reset:${token}`);

    // Invalidate all refresh tokens for this user
    const keys = await redis.keys(`refresh_token:*`);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }

    // Log the password reset
    await db('audit_logs').insert({
      user_id: userId,
      action: 'password_reset_completed',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async verifyEmail(token: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`email-verify:${token}`);
    
    if (!tokenData) {
```

### wallet.service.ts
First 100 lines:
```typescript
import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { JWTService } from './jwt.service';

export class WalletService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = new JWTService();
  }

  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.setex(`wallet_nonce:${walletAddress}`, 300, nonce);
    return nonce;
  }

  async verifySolanaSignature(
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const publicKeyObj = new PublicKey(publicKey);
      const signatureBuffer = Buffer.from(signature, 'base64');
      const messageBuffer = Buffer.from(message);
      
      return nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKeyObj.toBytes()
      );
    } catch (error) {
      console.error('Solana signature verification failed:', error);
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
      console.error('Ethereum signature verification failed:', error);
      return false;
    }
  }

  async connectWallet(
    userId: string,
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Connect wallet to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const existingConnection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network })
      .first();

    if (existingConnection && existingConnection.user_id !== userId) {
      throw new AuthenticationError('Wallet already connected to another account');
    }

    if (!existingConnection) {
      await db('wallet_connections').insert({
        user_id: userId,
        wallet_address: walletAddress,
        network: network,
        verified: true
      });
    }

    await redis.del(`wallet_nonce:${walletAddress}`);

```

### mfa.service.ts
First 100 lines:
```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { AuthenticationError } from '../errors';

export class MFAService {
  async setupTOTP(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    // Get user
    const user = await db('users').where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `TicketToken (${user.email})`,
      issuer: env.MFA_ISSUER || 'TicketToken',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store temporarily until verified
    await redis.setex(
      `mfa:setup:${userId}`,
      600, // 10 minutes
      JSON.stringify({
        secret: this.encrypt(secret.base32),
        backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
      })
    );

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async verifyAndEnableTOTP(userId: string, token: string): Promise<boolean> {
    // Get temporary setup data
    const setupData = await redis.get(`mfa:setup:${userId}`);
    if (!setupData) {
      throw new Error('MFA setup expired or not found');
    }

    const { secret, backupCodes } = JSON.parse(setupData);
    const decryptedSecret = this.decrypt(secret);

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new AuthenticationError('Invalid MFA token');
    }

    // Enable MFA for user
    await db('users').where('id', userId).update({
      mfa_enabled: true,
      mfa_secret: secret,
      backup_codes: JSON.stringify(backupCodes),
    });

    // Clean up temporary data
    await redis.del(`mfa:setup:${userId}`);

    return true;
  }

  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      return false;
    }

    const secret = this.decrypt(user.mfa_secret);

    // Check recent use to prevent replay attacks
    const recentKey = `mfa:recent:${userId}:${token}`;
    const recentlyUsed = await redis.get(recentKey);
    
    if (recentlyUsed) {
      throw new AuthenticationError('MFA token recently used');
```

### rate-limit.service.ts
First 100 lines:
```typescript
import { redis } from '../config/redis';

export class RateLimitService {
  private limits: Map<string, { points: number; duration: number }> = new Map([
    ['login', { points: 5, duration: 60 }],  // 5 attempts per minute
    ['register', { points: 3, duration: 300 }], // 3 per 5 minutes
    ['wallet', { points: 10, duration: 60 }], // 10 per minute
  ]);

  async consume(
    action: string,
    venueId: string | null,
    identifier: string
  ): Promise<void> {
    const limit = this.limits.get(action) || { points: 100, duration: 60 };
    const key = venueId 
      ? `rate:${action}:${venueId}:${identifier}`
      : `rate:${action}:${identifier}`;
    
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, limit.duration);
    }
    
    if (current > limit.points) {
      const ttl = await redis.ttl(key);
      throw new Error(`Rate limit exceeded. Try again in ${ttl} seconds.`);
    }
  }
}
```

### auth.service.ts
First 100 lines:
```typescript
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class AuthService {
  private log = logger.child({ component: 'AuthService' });
  
  // Dummy hash for timing attack prevention (not readonly so it can be updated)
  private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';
  
  constructor(private jwtService: JWTService) {
    // Pre-generate a dummy hash to use for timing consistency
    bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
      this.DUMMY_HASH = hash;
    });
  }
  
  async register(data: any) {
    // Don't log the actual email or password
    this.log.info('Registration attempt', {
      hasEmail: !!data.email,
      hasPassword: !!data.password
    });
    
    try {
      // Use direct pool query instead of Knex
      this.log.debug('Checking for existing user');
      const existingResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      if (existingResult.rows.length > 0) {
        throw new Error('Email already registered');
      }
      
      this.log.debug('Hashing password');
      const passwordHash = await bcrypt.hash(data.password, 10);
      
      // Determine tenant_id
      const tenantId = data.tenant_id || process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
      
      this.log.info('Creating new user', { tenantId });
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id`,
        [data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null, false, tenantId, new Date()]
      );
      
      const user = insertResult.rows[0];
      this.log.info('User created successfully', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      const tokens = await this.jwtService.generateTokenPair(user);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Log error without exposing sensitive details
      this.log.error('Registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async login(data: any) {
    this.log.info('Login attempt');
    
    // Store start time for consistent timing
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 500; // Minimum response time in ms
    
    try {
      // Always perform database lookup
      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      let user = result.rows[0];
      let passwordHash = user?.password_hash || this.DUMMY_HASH;
      
      // Always perform bcrypt comparison to maintain consistent timing
      const valid = await bcrypt.compare(data.password, passwordHash);
```

### security-enhanced.service.ts
First 100 lines:
```typescript
import argon2 from 'argon2';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export class SecurityEnhancedService {
  private redis: Redis;
  private readonly maxLoginAttempts = 5;
  private readonly lockoutDuration = 15 * 60; // 15 minutes in seconds
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  // Enhanced password hashing with security checks
  async hashPassword(password: string): Promise<string> {
    const validation = this.validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const minLength = 12;
    
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters`);
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Check for common passwords
    const commonPasswords = ['password123', '12345678', 'qwerty123', 'admin123'];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Brute force protection
  async checkBruteForce(identifier: string): Promise<{
    locked: boolean;
    remainingAttempts?: number;
    lockoutUntil?: Date;
  }> {
    const lockKey = `auth_lock:${identifier}`;
    const attemptKey = `auth_attempts:${identifier}`;
    
    // Check if locked
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      return {
        locked: true,
        lockoutUntil: new Date(Date.now() + ttl * 1000)
      };
    }
    
    // Get current attempts
    const attempts = parseInt(await this.redis.get(attemptKey) || '0');
    
    if (attempts >= this.maxLoginAttempts) {
      // Lock the account
      await this.redis.setex(lockKey, this.lockoutDuration, 'locked');
      await this.redis.del(attemptKey);
      return {
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

