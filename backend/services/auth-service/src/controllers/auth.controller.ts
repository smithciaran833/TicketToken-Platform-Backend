import { AuthService } from '../services/auth.service';
import { MFAService } from '../services/mfa.service';
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
      
      // Cache the new user data
      if (result.user.id) { await userCache.setUser(result.user.id, result.user); }
      
      reply.status(201).send({
        user: result.user,
        tokens: result.tokens,
      });
    } catch (error: any) {
      //Handle duplicate key error (email already exists)
      if (error.code === '23505' || error.code === 'DUPLICATE_EMAIL' || error.statusCode === 409 || 
          error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        return reply.status(409).send({
          error: error.message || 'User with this email already exists'
        });
      }
      // Handle other errors
      console.error('Registration error:', error);
      return reply.status(error.statusCode || 500).send({
        error: error.message || 'Registration failed'
      });
    }
  }

  async login(request: any, reply: any) {
    try {
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || 'unknown';

      // First, authenticate with credentials only
      const result = await this.authService.login({
        email: request.body.email,
        password: request.body.password,
        ipAddress,
        userAgent,
      });

      console.log('[LOGIN] Auth service returned:', {
        hasUser: !!result.user,
        hasTokens: !!result.tokens,
        mfaEnabled: result.user?.mfa_enabled,
        mfaTokenProvided: !!request.body.mfaToken
      });

      // Check if MFA is enabled
      if (result.user.mfa_enabled) {
        // If no MFA token provided, request it
        if (!request.body.mfaToken) {
          console.log('[LOGIN] MFA required, no token provided');
          return reply.status(200).send({
            requiresMFA: true,
            userId: result.user.id,
          });
        }

        // MFA token provided - verify it
        console.log('[LOGIN] Verifying MFA token...');
        let mfaValid = false;
        let usedBackupCode = false;
        
        // Try TOTP first
        try {
          mfaValid = await this.mfaService.verifyTOTP(result.user.id!, request.body.mfaToken);
          console.log('[LOGIN] TOTP verification result:', mfaValid);
          
          // If TOTP returns false (not an error), try backup code
          if (!mfaValid) {
            console.log('[LOGIN] TOTP returned false, trying backup code');
            mfaValid = await this.mfaService.verifyBackupCode(result.user.id!, request.body.mfaToken);
            usedBackupCode = mfaValid;
            console.log('[LOGIN] Backup code verification result:', mfaValid);
          }
        } catch (error) {
          // TOTP threw an error (e.g., recently used token), try backup code
          console.log('[LOGIN] TOTP error, trying backup code:', error);
          try {
            mfaValid = await this.mfaService.verifyBackupCode(result.user.id!, request.body.mfaToken);
            usedBackupCode = mfaValid;
            console.log('[LOGIN] Backup code verification result:', mfaValid);
          } catch (backupError) {
            console.log('[LOGIN] Backup code also failed:', backupError);
            mfaValid = false;
          }
        }

        // If both TOTP and backup code failed, return 401
        if (!mfaValid) {
          console.log('[LOGIN] Both MFA methods failed');
          return reply.status(401).send({
            error: 'Invalid MFA token',
          });
        }

        console.log('[LOGIN] MFA verified successfully, regenerating tokens');
        
        // MFA verified - regenerate tokens with MFA confirmation
        result.tokens = await this.authService.regenerateTokensAfterMFA(result.user);
      }

      // Cache user and session data
      if (result.user.id) { await userCache.setUser(result.user.id, result.user); }
      if (result.tokens) {
        await sessionCache.setSession(result.tokens.accessToken, {
          userId: result.user.id,
          email: result.user.email,
          createdAt: Date.now()
        });
      }

      // Return user and tokens
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
      // Generic error for invalid credentials (prevent user enumeration)
      if (error.message?.includes('Invalid') || error.message?.includes('not found') || error.message?.includes('password')) {
        return reply.status(401).send({
          error: 'Invalid credentials'
        });
      }
      console.error('Login error:', error);
      return reply.status(500).send({
        error: 'Login failed'
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

      reply.send(result);
    } catch (error: any) {
      // Preserve error message from JWT service (e.g., "Token reuse detected")
      return reply.status(401).send({
        error: error.message || 'Unauthorized'
      });
    }
  }

  async logout(request: any, reply: any) {
    const userId = request.user.id;
    
    // Clear cache for this user
    await userCache.deleteUser(userId);
    await sessionCache.deleteUserSessions(userId);
    
    await this.authService.logout(userId);

    reply.status(204).send();
  }

  async getMe(request: any, reply: any) {
    const userId = request.user.id;
    
    // Try cache first
    let user = await userCache.getUser(userId);
    
    if (!user) {
      // Cache miss - get from database
      user = await db('users')
        .where('id', userId)
        .whereNull('deleted_at')
        .first();
      
      if (user) {
        // Cache for next time
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
    reply.send({ valid: true, user: request.user });
  }

  async getCurrentUser(request: any, reply: any) {
    reply.send({ user: request.user });
  }

  async setupMFA(request: any, reply: any) {
    try {
      const userId = request.user?.id;
      const result = await this.mfaService.setupTOTP(userId);
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
      const { token } = request.body;
      const result = await this.mfaService.verifyAndEnableTOTP(userId, token);
      reply.send(result);
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
      const { token } = request.body;
      const valid = await this.mfaService.verifyTOTP(userId, token);
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
      const { password, token } = request.body;
      await this.mfaService.disableTOTP(userId, password, token);
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
