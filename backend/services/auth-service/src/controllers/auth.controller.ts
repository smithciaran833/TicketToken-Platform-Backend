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
    const result = await this.authService.register(request.body);
    
    // Cache the new user data
    if (result.user.id) { await userCache.setUser(result.user.id, result.user); }
    
    reply.status(201).send({
      user: result.user,
      tokens: result.tokens,
    });
  }

  async login(request: any, reply: any) {
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';

    const result = await this.authService.login({
      email: request.body.email,
      password: request.body.password,
      ipAddress,
      userAgent,
    });

    // Cache user and session data
    if (result.user.id) { await userCache.setUser(result.user.id, result.user); }
    if (result.tokens) {
      await sessionCache.setSession(result.tokens.accessToken, {
        userId: result.user.id,
        email: result.user.email,
        createdAt: Date.now()
      });
    }

    // Check if MFA is required
    if (result.user.mfa_enabled) {
      if (!request.body.mfaToken) {
        return reply.status(200).send({
          requiresMFA: true,
          userId: result.user.id,
        });
      }

      // Verify MFA token
      const mfaValid = await this.mfaService.verifyTOTP(
        result.user.id!,
        request.body.mfaToken
      );

      if (!mfaValid) {
        // Try backup code
        const backupValid = await this.mfaService.verifyBackupCode(
          result.user.id!,
          request.body.mfaToken
        );

        if (!backupValid) {
          return reply.status(401).send({
            error: 'Invalid MFA token',
          });
        }
      }
    }

    reply.send({
      user: result.user,
      tokens: result.tokens,
    });
  }

  async refreshTokens(request: any, reply: any) {
    const { refreshToken } = request.body;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';

    const result = await this.authService.refreshTokens(
      refreshToken,
      ipAddress,
      userAgent
    );

    reply.send(result);
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
    const userId = request.user?.id;
    const secret = await this.mfaService.generateSecret(userId);
    reply.send({ secret });
  }

  async verifyMFA(request: any, reply: any) {
    const userId = request.user?.id;
    const { token } = request.body;
    const valid = await this.mfaService.verifyTOTP(userId, token);
    reply.send({ valid });
  }

  async disableMFA(request: any, reply: any) {
    const userId = request.user?.id;
    await this.mfaService.disable(userId);
    reply.send({ success: true });
  }
}
