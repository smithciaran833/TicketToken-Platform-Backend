import { env } from '../config/env';
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { EmailService } from './email.service';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import { stripHtml } from '../utils/sanitize';
import { normalizeEmail, normalizePhone, normalizeText } from '../utils/normalize';

// Idempotency window for password reset (15 minutes)
const PASSWORD_RESET_IDEMPOTENCY_WINDOW = 15 * 60 * 1000;

export class AuthService {
  private log = logger.child({ component: 'AuthService' });
  private emailService: EmailService;

  // Dummy hash for timing attack prevention (not readonly so it can be updated)
  private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';

  constructor(private jwtService: JWTService) {
    this.emailService = new EmailService();
    // Pre-generate a dummy hash to use for timing consistency
    bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
      this.DUMMY_HASH = hash;
    });
  }

  async register(data: any) {
    this.log.info('Registration attempt', {
      hasEmail: !!data.email,
      hasPassword: !!data.password
    });

    try {
      this.log.debug('Checking for existing user');
      const existingResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [normalizeEmail(data.email)]
      );

      if (existingResult.rows.length > 0) {
        const error: any = new Error('User with this email already exists');
        error.code = 'DUPLICATE_EMAIL';
        error.statusCode = 409;
        throw error;
      }

      const tenantId = data.tenant_id || env.DEFAULT_TENANT_ID;

      const tenantResult = await pool.query(
        'SELECT id FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (tenantResult.rows.length === 0) {
        const error: any = new Error('Invalid tenant');
        error.code = 'TENANT_INVALID';
        error.statusCode = 400;
        throw error;
      }

      this.log.debug('Hashing password');
      const passwordHash = await bcrypt.hash(data.password, 10);

      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      const sanitizedFirstName = normalizeText(stripHtml(data.firstName || ''));
      const sanitizedLastName = normalizeText(stripHtml(data.lastName || ''));

      const client = await pool.connect();
      let user;
      let tokens;
      let sessionId;

      try {
        await client.query('BEGIN');

        this.log.info('Creating new user', { tenantId });
        const insertResult = await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, email_verification_token, tenant_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, email, first_name, last_name, email_verified, mfa_enabled, role, tenant_id, created_at, updated_at`,
          [normalizeEmail(data.email), passwordHash, sanitizedFirstName, sanitizedLastName, normalizePhone(data.phone) || null, false, emailVerificationToken, tenantId, new Date()]
        );

        user = insertResult.rows[0];
        this.log.info('User created successfully', {
          userId: user.id,
          tenantId: user.tenant_id
        });

        tokens = await this.jwtService.generateTokenPair(user);

        const sessionResult = await client.query(
          `INSERT INTO user_sessions (user_id, tenant_id, ip_address, user_agent, started_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
          [user.id, user.tenant_id, data.ipAddress || null, data.userAgent || null]
        );
        sessionId = sessionResult.rows[0].id;

        await client.query('COMMIT');
        this.log.info('Transaction committed successfully');
      } catch (error) {
        await client.query('ROLLBACK');
        this.log.error('Transaction rolled back', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      } finally {
        client.release();
      }

      // Audit session creation
      await auditService.logSessionCreated(user.id, sessionId, data.ipAddress, data.userAgent, user.tenant_id);

      await this.emailService.sendVerificationEmail(user.id, user.email, user.first_name, user.tenant_id);

      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          role: user.role || 'user',
          tenant_id: user.tenant_id,
          created_at: user.created_at,
          updated_at: user.updated_at || user.created_at,
        },
        tokens,
      };
    } catch (error) {
      this.log.error('Registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async login(data: any) {
    this.log.info('Login attempt');

    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 500;
    const MAX_FAILED_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MINUTES = 15;

    try {
      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, role, tenant_id, failed_login_attempts, locked_until, created_at, updated_at FROM users WHERE email = $1 AND deleted_at IS NULL',
        [normalizeEmail(data.email)]
      );

      let user = result.rows[0];

      if (user && user.locked_until) {
        const lockoutExpiry = new Date(user.locked_until);
        if (lockoutExpiry > new Date()) {
          const minutesRemaining = Math.ceil((lockoutExpiry.getTime() - Date.now()) / 60000);
          this.log.warn('Login attempt on locked account', {
            userId: user.id,
            lockedUntil: user.locked_until
          });

          const elapsed = Date.now() - startTime;
          if (elapsed < MIN_RESPONSE_TIME) {
            await this.delay(MIN_RESPONSE_TIME - elapsed);
          }

          throw new Error(`Account is temporarily locked. Please try again in ${minutesRemaining} minutes.`);
        } else {
          await pool.query(
            'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
            [user.id]
          );
          user.failed_login_attempts = 0;
          user.locked_until = null;
        }
      }

      let passwordHash = user?.password_hash || this.DUMMY_HASH;

      const valid = await bcrypt.compare(data.password, passwordHash);

      const jitter = crypto.randomInt(0, 50);
      await this.delay(jitter);

      if (!user || !valid) {
        if (user) {
          const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
          const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

          if (shouldLock) {
            const lockoutExpiry = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
            await pool.query(
              'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
              [newFailedAttempts, lockoutExpiry, user.id]
            );

            this.log.warn('Account locked due to failed attempts', {
              userId: user.id,
              attempts: newFailedAttempts,
              lockedUntil: lockoutExpiry
            });
          } else {
            await pool.query(
              'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
              [newFailedAttempts, user.id]
            );
          }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_RESPONSE_TIME) {
          await this.delay(MIN_RESPONSE_TIME - elapsed);
        }

        this.log.warn('Login failed', {
          reason: !user ? 'user_not_found' : 'invalid_password'
        });
        throw new Error('Invalid credentials');
      }

      const client = await pool.connect();
      let tokens;
      let sessionId;

      try {
        await client.query('BEGIN');

        // Atomic update: reset failed attempts, increment login_count, update last_login
        await client.query(
          `UPDATE users SET
            failed_login_attempts = 0,
            locked_until = NULL,
            login_count = login_count + 1,
            last_login_at = NOW(),
            last_login_ip = $2,
            last_active_at = NOW()
          WHERE id = $1`,
          [user.id, data.ipAddress || null]
        );

        tokens = await this.jwtService.generateTokenPair(user);

        const sessionResult = await client.query(
          `INSERT INTO user_sessions (user_id, tenant_id, ip_address, user_agent, started_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
          [user.id, user.tenant_id, data.ipAddress || null, data.userAgent || null]
        );
        sessionId = sessionResult.rows[0].id;

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        this.log.error('Login transaction failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      } finally {
        client.release();
      }

      // Audit session creation
      await auditService.logSessionCreated(user.id, sessionId, data.ipAddress, data.userAgent, user.tenant_id);

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }

      this.log.info('Login successful', {
        userId: user.id,
        tenantId: user.tenant_id
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          role: user.role || 'user',
          tenant_id: user.tenant_id,
          created_at: user.created_at,
          updated_at: user.updated_at || user.created_at,
        },
        tokens,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      throw error;
    }
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    this.log.info('Token refresh attempt', { ipAddress, userAgent });

    try {
      const tokens = await this.jwtService.refreshTokens(
        refreshToken,
        ipAddress || 'unknown',
        userAgent || 'unknown'
      );

      const decoded = this.jwtService.decode(tokens.accessToken);
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, role, tenant_id, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.sub]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      this.log.info('Token refresh successful', { userId: user.id });

      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          role: user.role || 'user',
          tenant_id: user.tenant_id,
          created_at: user.created_at,
          updated_at: user.updated_at || user.created_at,
        },
        tokens,
      };
    } catch (error) {
      this.log.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent
      });
      throw error;
    }
  }

  async logout(userId: string, refreshToken?: string, tenantId?: string) {
    this.log.info('Logout attempt', { userId });

    try {
      // Get tenant_id if not provided
      let userTenantId = tenantId;
      if (!userTenantId) {
        const userResult = await pool.query(
          'SELECT tenant_id FROM users WHERE id = $1',
          [userId]
        );
        if (userResult.rows.length > 0) {
          userTenantId = userResult.rows[0].tenant_id;
        }
      }

      if (refreshToken && userTenantId) {
        const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await pool.query(
          `INSERT INTO invalidated_tokens (token, user_id, tenant_id, invalidated_at, expires_at)
           VALUES ($1, $2, $3, NOW(), $4)
           ON CONFLICT (token) DO NOTHING`,
          [refreshToken, userId, userTenantId, expiryTime]
        );
      }

      await pool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      this.log.info('Logout successful', { userId });

      return { success: true };
    } catch (error) {
      this.log.error('Logout error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return { success: true };
    }
  }

  async verifyEmail(token: string) {
    this.log.info('Email verification attempt');

    const result = await pool.query(
      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
      [token]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }

    return { success: true };
  }

  /**
   * Password reset with idempotency
   * If a valid reset token exists within the idempotency window, reuse it
   * instead of generating a new one and sending a new email
   */
  async forgotPassword(email: string) {
    this.log.info('Password reset request');

    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 300;

    try {
      const result = await pool.query(
        `SELECT id, email, password_reset_token, password_reset_expires
         FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [normalizeEmail(email)]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];

        // Idempotency check: if a valid token exists and was created recently, don't send another email
        const hasValidToken = user.password_reset_token &&
          user.password_reset_expires &&
          new Date(user.password_reset_expires) > new Date();

        const tokenAge = user.password_reset_expires
          ? (new Date(user.password_reset_expires).getTime() - Date.now() - 3600000 + PASSWORD_RESET_IDEMPOTENCY_WINDOW)
          : Infinity;

        const isWithinIdempotencyWindow = tokenAge < PASSWORD_RESET_IDEMPOTENCY_WINDOW;

        if (hasValidToken && isWithinIdempotencyWindow) {
          // Token was recently created, don't spam the user
          this.log.info('Password reset token already exists within idempotency window', {
            userId: user.id,
            tokenExpiresIn: Math.round((new Date(user.password_reset_expires).getTime() - Date.now()) / 1000 / 60) + ' minutes'
          });
        } else {
          // Generate new token
          const resetToken = crypto.randomBytes(32).toString('hex');
          const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

          await pool.query(
            'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
            [resetToken, resetExpiry, user.id]
          );

          this.sendPasswordResetEmail(user.email, resetToken).catch(err =>
            this.log.error('Failed to send password reset email', err)
          );
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }

      return {
        message: 'If an account exists with this email, a password reset link has been sent.'
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }

      return {
        message: 'If an account exists with this email, a password reset link has been sent.'
      };
    }
  }

  /**
   * Reset password using token
   * Uses FOR UPDATE to prevent race conditions
   */
  async resetPassword(token: string, newPassword: string) {
    this.log.info('Password reset attempt');

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // FOR UPDATE prevents concurrent password resets with the same token
      const result = await client.query(
        `SELECT id FROM users
         WHERE password_reset_token = $1
         AND password_reset_expires > NOW()
         AND deleted_at IS NULL
         FOR UPDATE`,
        [token]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Invalid or expired reset token');
      }

      const user = result.rows[0];
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await client.query(
        `UPDATE users
         SET password_hash = $1,
             password_reset_token = NULL,
             password_reset_expires = NULL,
             password_changed_at = NOW()
         WHERE id = $2`,
        [passwordHash, user.id]
      );

      await client.query('COMMIT');

      this.log.info('Password reset successful', { userId: user.id });

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Change password for authenticated user
   * Uses FOR UPDATE to prevent race conditions
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    this.log.info('Password change attempt', { userId });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // FOR UPDATE prevents concurrent password changes
      const result = await client.query(
        `SELECT password_hash FROM users
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('User not found');
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(oldPassword, user.password_hash);

      if (!valid) {
        await client.query('ROLLBACK');
        throw new Error('Invalid current password');
      }

      // SL5: Ensure new password is different from current
      if (oldPassword === newPassword) {
        await client.query('ROLLBACK');
        throw new Error('New password must be different from current password');
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await client.query(
        'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      await client.query('COMMIT');

      this.log.info('Password change successful', { userId });

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserById(userId: string) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, role, tenant_id, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  async regenerateTokensAfterMFA(user: any) {
    this.log.info('Regenerating tokens after MFA verification', { userId: user.id });

    const tokens = await this.jwtService.generateTokenPair(user);

    return tokens;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    this.log.info('Queuing password reset email', { email: email.substring(0, 3) + '***' });
  }
}
