import { AuthService } from '../services/auth.service';
import { MFAService } from '../services/mfa.service';
import { captchaService } from '../services/captcha.service';
import { db } from '../config/database';
import { userCache, sessionCache, getCacheStats } from '../services/cache-integration';
import { serializeUser, SAFE_USER_SELECT } from '../serializers/user.serializer';

export class AuthController {
  constructor(
    private authService: AuthService,
    private mfaService: MFAService
  ) {}

  async register(request: any, reply: any) {
    try {
      const result = await this.authService.register(request.body);

      // Cache the safe user data
      const safeUser = serializeUser(result.user);
      if (safeUser.id) { await userCache.setUser(safeUser.id, safeUser); }

      // SECURITY: Always serialize user data before returning
      return reply.status(201).send({
        user: safeUser,
        tokens: result.tokens,
      });
    } catch (error: any) {
      if (error.code === '23505' || error.code === 'DUPLICATE_EMAIL' || error.statusCode === 409 ||
          error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        return reply.status(409).send({
          error: error.message || 'User with this email already exists',
          code: 'CONFLICT',
        });
      }
      console.error('Registration error:', error);
      return reply.status(error.statusCode || 500).send({
        error: error.message || 'Registration failed',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async login(request: any, reply: any) {
    const ipAddress = request.ip;
    const identifier = request.body.email?.toLowerCase() || ipAddress;

    try {
      // Check if CAPTCHA is required (after N failed attempts)
      const captchaRequired = await captchaService.isCaptchaRequired(identifier);

      if (captchaRequired) {
        const captchaToken = request.body.captchaToken;

        if (!captchaToken) {
          return reply.status(428).send({
            error: 'CAPTCHA required',
            code: 'CAPTCHA_REQUIRED',
            requiresCaptcha: true,
          });
        }

        const captchaResult = await captchaService.verify(captchaToken, ipAddress);

        if (!captchaResult.success) {
          return reply.status(400).send({
            error: 'CAPTCHA verification failed',
            code: 'CAPTCHA_FAILED',
            requiresCaptcha: true,
          });
        }
      }

      const userAgent = request.headers['user-agent'] || 'unknown';

      const result = await this.authService.login({
        email: request.body.email,
        password: request.body.password,
        ipAddress,
        userAgent,
        mfaToken: request.body.mfaToken, // Pass MFA token to service
      });

      // Clear CAPTCHA failures on successful login
      await captchaService.clearFailures(identifier);

      // SECURITY: Always serialize user data before returning
      const safeUser = serializeUser(result.user);

      // FIX: If tokens is null, it means MFA is required
      if (!result.tokens && safeUser.mfa_enabled) {
        return reply.status(200).send({
          requiresMFA: true,
          userId: safeUser.id,
        });
      }

      // If MFA was provided and verified, or MFA not enabled
      if (safeUser.id) { await userCache.setUser(safeUser.id, safeUser); }
      if (result.tokens) {
        await sessionCache.setSession(result.tokens.accessToken, {
          userId: safeUser.id,
          email: safeUser.email,
          createdAt: Date.now()
        });
      }

      return reply.send({
        user: safeUser,
        tokens: result.tokens,
      });
    } catch (error: any) {
      // Record failure for CAPTCHA threshold
      const failureResult = await captchaService.recordFailure(identifier);

      if (error.message?.includes('Invalid') || error.message?.includes('not found') || error.message?.includes('password') || error.message?.includes('locked')) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          code: 'AUTHENTICATION_FAILED',
          requiresCaptcha: failureResult.requiresCaptcha,
        });
      }
      console.error('Login error:', error);
      return reply.status(500).send({
        error: 'Login failed',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  async refreshTokens(request: any, reply: any) {
    try {
      const { refreshToken } = request.body;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || 'unknown';

      const result = await this.authService.refreshTokens(
        refreshToken,
        ipAddress,
        userAgent
      );

      return reply.send(result.tokens);
    } catch (error: any) {
      return reply.status(401).send({
        error: error.message || 'Unauthorized',
        code: 'TOKEN_INVALID',
      });
    }
  }

  async logout(request: any, reply: any) {
    const userId = request.user.id;
    const refreshToken = request.body?.refreshToken;
    const tenantId = request.user.tenant_id;

    // FIX Issue #3: Extract access token from Authorization header
    const authHeader = request.headers.authorization;
    let accessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }

    await userCache.deleteUser(userId);
    await sessionCache.deleteUserSessions(userId);

    // FIX Issue #3: Pass access token to logout service
    await this.authService.logout(userId, refreshToken, tenantId, accessToken);

    return reply.send({ success: true });
  }

  async getMe(request: any, reply: any) {
    const userId = request.user.id;

    // Try cache first (cache should only contain safe fields)
    let user = await userCache.getUser(userId);

    if (!user) {
      // SECURITY: Use explicit field selection - never SELECT *
      user = await db('users')
        .select(db.raw(SAFE_USER_SELECT))
        .where('id', userId)
        .whereNull('deleted_at')
        .first();

      if (user) {
        // Cache only safe user data
        await userCache.setUser(userId, user);
      }
    }

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // SECURITY: Always serialize before returning (defense in depth)
    return reply.send({ user: serializeUser(user) });
  }

  async getCacheStats(request: any, reply: any) {
    const stats = getCacheStats();
    return reply.send(stats);
  }

  async verifyToken(request: any, reply: any) {
    const userId = request.user.id;

    // SECURITY: Use explicit field selection - never SELECT *
    const user = await db('users')
      .select(db.raw(SAFE_USER_SELECT))
      .where('id', userId)
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // SECURITY: Always serialize before returning (defense in depth)
    return reply.send({ valid: true, user: serializeUser(user) });
  }

  async getCurrentUser(request: any, reply: any) {
    const userId = request.user.id;

    // SECURITY: Use explicit field selection - never SELECT *
    const user = await db('users')
      .select(db.raw(SAFE_USER_SELECT))
      .where('id', userId)
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // SECURITY: Always serialize before returning (defense in depth)
    return reply.send({ user: serializeUser(user) });
  }

  async setupMFA(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const tenantId = request.user?.tenant_id;
      const result = await this.mfaService.setupTOTP(userId, tenantId);
      return reply.send(result);
    } catch (error: any) {
      if (error.message?.includes('already enabled')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('MFA setup error:', error);
      return reply.status(500).send({ error: 'Failed to setup MFA' });
    }
  }

  async verifyMFASetup(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const tenantId = request.user?.tenant_id;
      const { token } = request.body;
      const result = await this.mfaService.verifyAndEnableTOTP(userId, token, tenantId);
      // Add success: true to satisfy response schema
      return reply.send({ success: true, backupCodes: result.backupCodes });
    } catch (error: any) {
      if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('MFA verification error:', error);
      return reply.status(500).send({ error: 'Failed to verify MFA setup' });
    }
  }

  async verifyMFA(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const tenantId = request.user?.tenant_id;
      const { token } = request.body;
      const valid = await this.mfaService.verifyTOTP(userId, token, tenantId);
      return reply.send({ valid });
    } catch (error: any) {
      console.error('MFA verification error:', error);
      return reply.status(500).send({ error: 'Failed to verify MFA' });
    }
  }

  async regenerateBackupCodes(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const result = await this.mfaService.regenerateBackupCodes(userId);
      return reply.send(result);
    } catch (error: any) {
      if (error.message?.includes('not enabled')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('Backup code regeneration error:', error);
      return reply.status(500).send({ error: 'Failed to regenerate backup codes' });
    }
  }

  async disableMFA(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const tenantId = request.user?.tenant_id;
      const { password, token } = request.body;
      await this.mfaService.disableTOTP(userId, password, token, tenantId);
      return reply.send({ success: true });
    } catch (error: any) {
      if (error.message?.includes('Invalid')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('MFA disable error:', error);
      return reply.status(500).send({ error: 'Failed to disable MFA' });
    }
  }
}
