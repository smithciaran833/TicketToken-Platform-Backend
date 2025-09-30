import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { JWTService } from './jwt.service';
import { SecurityEnhancedService } from './security-enhanced.service';
import { User } from '../models/user.model';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  RateLimitError
} from '../errors';
import { env } from '../config/env';

export class AuthService {
  private jwtService: JWTService;
  private securityService: SecurityEnhancedService;

  constructor(jwtService: JWTService, securityService: SecurityEnhancedService) {
    this.jwtService = jwtService;
    this.securityService = securityService;
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<{ user: Partial<User>; tokens: { accessToken: string; refreshToken: string } }> {
    // Check if user exists
    const existingUser = await db('users')
      .where('email', data.email)
      .whereNull('deleted_at')
      .first();

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Use enhanced security service for password validation and hashing
    const passwordHash = await this.securityService.hashPassword(data.password);

    // Generate verification token
    const verificationToken = this.securityService.generateSecureToken();

    // Begin transaction
    const trx = await db.transaction();

    try {
      // Create user
      const [userId] = await trx('users').insert({
        email: data.email.toLowerCase(),
        password_hash: passwordHash,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        is_active: false,
        email_verified: false,
        verification_token: verificationToken,
        created_at: new Date(),
      });

      // Assign default role
      await trx('user_roles').insert({
        user_id: userId,
        role_id: 1, // Default 'user' role
        created_at: new Date(),
      });

      await trx.commit();

      // Generate tokens
      const tokens = await this.jwtService.generateTokenPair({ id: userId.toString(), role: 'user' });

      // Create secure session
      const sessionId = await this.securityService.createSecureSession(
        userId.toString(),
        { ipAddress: '0.0.0.0', userAgent: 'unknown' } // Should be passed from request
      );

      return {
        user: {
          id: userId.toString(),
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          email_verified: false,
        },
        tokens,
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async login(email: string, password: string, deviceInfo?: any): Promise<{
    user: Partial<User>;
    tokens: { accessToken: string; refreshToken: string };
    sessionId: string;
  }> {
    // Check brute force
    const bruteForceStatus = await this.securityService.checkBruteForce(email);
    if (bruteForceStatus.locked) {
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again after ${bruteForceStatus.lockoutUntil}`
      );
    }

    // Find user
    const user = await db('users')
      .where('email', email.toLowerCase())
      .whereNull('deleted_at')
      .first();

    if (!user) {
      await this.securityService.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password using enhanced security
    const isValidPassword = await this.securityService.verifyPassword(
      user.password_hash,
      password
    );

    if (!isValidPassword) {
      await this.securityService.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid credentials');
    }

    // Clear failed attempts on successful login
    await this.securityService.clearFailedAttempts(email);

    // Check if account is active
    if (!user.is_active) {
      throw new AuthenticationError('Account is not active');
    }

    // Get user role
    const userRole = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.name')
      .first();

    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair({ id: user.id.toString(), role: userRole?.name || 'user' });


    // Create secure session
    const sessionId = await this.securityService.createSecureSession(
      user.id.toString(),
      deviceInfo || { ipAddress: '0.0.0.0', userAgent: 'unknown' }
    );

    // Update last login
    await db('users')
      .where('id', user.id)
      .update({
        last_login_at: new Date(),
        last_login_ip: deviceInfo?.ipAddress || '0.0.0.0',
      });

    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
      },
      tokens,
      sessionId,
    };
  }

  async logout(token: string, sessionId?: string): Promise<void> {
    // Blacklist the token
    const decoded = this.jwtService.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.securityService.blacklistToken(token, ttl);
      }
    }

    // Invalidate session if provided
    if (sessionId) {
      await this.securityService.invalidateSession(sessionId);
    }
  }

  async logoutAllDevices(userId: string): Promise<void> {
    // Invalidate all user sessions
    await this.securityService.invalidateAllUserSessions(userId);
    
    // Note: You might also want to blacklist all active tokens
    // This would require tracking tokens per user
  }
}
