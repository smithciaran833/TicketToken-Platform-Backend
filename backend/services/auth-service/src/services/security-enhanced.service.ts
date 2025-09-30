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
        locked: true,
        lockoutUntil: new Date(Date.now() + this.lockoutDuration * 1000)
      };
    }
    
    return {
      locked: false,
      remainingAttempts: this.maxLoginAttempts - attempts
    };
  }

  async recordFailedAttempt(identifier: string): Promise<void> {
    const attemptKey = `auth_attempts:${identifier}`;
    await this.redis.incr(attemptKey);
    await this.redis.expire(attemptKey, 900); // 15 minutes
  }

  async clearFailedAttempts(identifier: string): Promise<void> {
    const attemptKey = `auth_attempts:${identifier}`;
    await this.redis.del(attemptKey);
  }

  // Session security
  async createSecureSession(userId: string, deviceInfo: any): Promise<string> {
    const sessionId = crypto.randomUUID();
    const sessionData = {
      userId,
      deviceInfo,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent
    };
    
    // Store session with 24 hour expiry
    await this.redis.setex(
      `session:${sessionId}`,
      86400,
      JSON.stringify(sessionData)
    );
    
    return sessionId;
  }

  async validateSession(sessionId: string): Promise<any> {
    const sessionData = await this.redis.get(`session:${sessionId}`);
    if (!sessionData) {
      return null;
    }
    
    const session = JSON.parse(sessionData);
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    await this.redis.setex(
      `session:${sessionId}`,
      86400,
      JSON.stringify(session)
    );
    
    return session;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    // Get all sessions for user
    const keys = await this.redis.keys(`session:*`);
    
    for (const key of keys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.userId === userId) {
          await this.redis.del(key);
        }
      }
    }
  }

  // Token blacklisting for logout
  async blacklistToken(token: string, expirySeconds: number): Promise<void> {
    await this.redis.setex(`blacklist:${token}`, expirySeconds, 'revoked');
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${token}`);
    return !!result;
  }

  // Generate secure random tokens
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // CSRF token management
  async generateCSRFToken(sessionId: string): Promise<string> {
    const token = this.generateSecureToken();
    await this.redis.setex(`csrf:${sessionId}`, 3600, token); // 1 hour
    return token;
  }

  async validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
    const storedToken = await this.redis.get(`csrf:${sessionId}`);
    return storedToken === token;
  }
}
