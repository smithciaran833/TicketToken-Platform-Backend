import { AuthService } from '../services/auth.service';
import { MFAService } from '../services/mfa.service';
import { captchaService } from '../services/captcha.service';
import { db } from '../config/database';
import { userCache, sessionCache, getCacheStats } from '../services/cache-integration';

export class AuthController {
  constructor(
    private authService: AuthService,
    private mfaService: MFAService
  ) {}

  async register(request: any, reply: any) {
    try {
      const result = await this.authService.register(request.body);

      if (result.user.id) { await userCache.setUser(result.user.id, result.user); }

      reply.status(201).send({
        user: result.user,
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
      });

      // Clear CAPTCHA failures on successful login
      await captchaService.clearFailures(identifier);

      console.log('[LOGIN] Auth service returned:', {
        hasUser: !!result.user,
        hasTokens: !!result.tokens,
        mfaEnabled: result.user?.mfa_enabled,
        mfaTokenProvided: !!request.body.mfaToken
      });

      if (result.user.mfa_enabled) {
        if (!request.body.mfaToken) {
          console.log('[LOGIN] MFA required, no token provided');
          return reply.status(200).send({
            requiresMFA: true,
            userId: result.user.id,
          });
        }

        console.log('[LOGIN] Verifying MFA token...');
        let mfaValid = false;
        let usedBackupCode = false;
        const tenantId = result.user.tenant_id;

        try {
          mfaValid = await this.mfaService.verifyTOTP(result.user.id!, request.body.mfaToken, tenantId);
          console.log('[LOGIN] TOTP verification result:', mfaValid);

          if (!mfaValid) {
            console.log('[LOGIN] TOTP returned false, trying backup code');
            mfaValid = await this.mfaService.verifyBackupCode(result.user.id!, request.body.mfaToken, tenantId);
            usedBackupCode = mfaValid;
            console.log('[LOGIN] Backup code verification result:', mfaValid);
          }
        } catch (error) {
          console.log('[LOGIN] TOTP error, trying backup code:', error);
          try {
            mfaValid = await this.mfaService.verifyBackupCode(result.user.id!, request.body.mfaToken, tenantId);
            usedBackupCode = mfaValid;
            console.log('[LOGIN] Backup code verification result:', mfaValid);
          } catch (backupError) {
            console.log('[LOGIN] Backup code also failed:', backupError);
            mfaValid = false;
          }
        }

        if (!mfaValid) {
          console.log('[LOGIN] Both MFA methods failed');
          return reply.status(401).send({
            error: 'Invalid MFA token',
            code: 'AUTHENTICATION_FAILED',
          });
        }

        console.log('[LOGIN] MFA verified successfully, regenerating tokens');
        result.tokens = await this.authService.regenerateTokensAfterMFA(result.user);
      }

      if (result.user.id) { await userCache.setUser(result.user.id, result.user); }
      if (result.tokens) {
        await sessionCache.setSession(result.tokens.accessToken, {
          userId: result.user.id,
          email: result.user.email,
          createdAt: Date.now()
        });
      }

      console.log('[LOGIN] Sending response with tokens:', {
        hasTokens: !!result.tokens,
        hasAccessToken: !!result.tokens?.accessToken,
        hasRefreshToken: !!result.tokens?.refreshToken
      });

      reply.send({
        user: result.user,
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

      reply.send(result.tokens);
    } catch (error: any) {
      return reply.status(401).send({
        error: error.message || 'Unauthorized',
        code: 'TOKEN_INVALID',
      });
    }
  }

  async logout(request: any, reply: any) {
    const userId = request.user.id;

    await userCache.deleteUser(userId);
    await sessionCache.deleteUserSessions(userId);

    await this.authService.logout(userId);

    reply.send({ success: true });
  }

  async getMe(request: any, reply: any) {
    const userId = request.user.id;

    let user = await userCache.getUser(userId);

    if (!user) {
      user = await db('users')
        .where('id', userId)
        .whereNull('deleted_at')
        .first();

      if (user) {
        await userCache.setUser(userId, user);
      }
    }

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    reply.send({ user });
  }

  async getCacheStats(request: any, reply: any) {
    const stats = getCacheStats();
    reply.send(stats);
  }

  async verifyToken(request: any, reply: any) {
    // Fetch full user from DB to satisfy response schema
    const userId = request.user.id;
    const user = await db('users')
      .where('id', userId)
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    reply.send({ valid: true, user });
  }

  async getCurrentUser(request: any, reply: any) {
    // Fetch full user from DB to satisfy response schema
    const userId = request.user.id;
    const user = await db('users')
      .where('id', userId)
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    reply.send({ user });
  }

  async setupMFA(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const tenantId = request.user?.tenant_id;
      const result = await this.mfaService.setupTOTP(userId, tenantId);
      reply.send(result);
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
      reply.send({ success: true, backupCodes: result.backupCodes });
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
      reply.send({ valid });
    } catch (error: any) {
      console.error('MFA verification error:', error);
      return reply.status(500).send({ error: 'Failed to verify MFA' });
    }
  }

  async regenerateBackupCodes(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const result = await this.mfaService.regenerateBackupCodes(userId);
      reply.send(result);
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
      reply.send({ success: true });
    } catch (error: any) {
      if (error.message?.includes('Invalid')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('MFA disable error:', error);
      return reply.status(500).send({ error: 'Failed to disable MFA' });
    }
  }
}
