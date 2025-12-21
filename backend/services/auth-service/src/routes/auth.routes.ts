import { FastifyInstance } from 'fastify';
import { Container } from '../config/dependencies';
import { AuthController } from '../controllers/auth.controller';
import { AuthExtendedController } from '../controllers/auth-extended.controller';
import { SessionController } from '../controllers/session.controller';
import { ProfileController } from '../controllers/profile.controller';
import { WalletController } from '../controllers/wallet.controller';
import { createAuthMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import * as schemas from '../validators/auth.validators';
import { loginRateLimiter, registrationRateLimiter } from '../utils/rateLimiter';

export async function authRoutes(fastify: FastifyInstance, options: { container: Container }) {
  const { container } = options;

  // Get services from container
  const authService = container.resolve('authService');
  const authExtendedService = container.resolve('authExtendedService');
  const mfaService = container.resolve('mfaService');
  const jwtService = container.resolve('jwtService');
  const walletService = container.resolve('walletService');
  const oauthService = container.resolve('oauthService');
  const rateLimitService = container.resolve('rateLimitService');
  const deviceTrustService = container.resolve('deviceTrustService');
  const biometricService = container.resolve('biometricService');
  const rbacService = container.resolve('rbacService');

  // Create controllers and middleware
  const controller = new AuthController(authService, mfaService);
  const extendedController = new AuthExtendedController(authExtendedService);
  const sessionController = new SessionController();
  const profileController = new ProfileController();
  const walletController = new WalletController(walletService);
  const authMiddleware = createAuthMiddleware(jwtService, rbacService);

  // Helper to add tenant context
  const addTenantContext = async (request: any) => {
    const user = request.user;
    const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
    request.tenantId = tenantId;
  };

  // ============================================
  // PUBLIC ROUTES (Still need rate limiting)
  // ============================================

  // These routes are legitimately public but rate-limited
  fastify.post('/register', {
    preHandler: async (request: any, reply: any) => {
      await registrationRateLimiter.consume(request.ip);
      await validate(schemas.registerSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.register(request, reply);
  });

  fastify.post('/login', {
    preHandler: async (request: any, reply: any) => {
      try {
        await rateLimitService.consume('login', null, request.ip);
      } catch (error) {
        return reply.status(429).send({
          error: 'Too many login attempts. Please try again later.'
        });
      }
      await loginRateLimiter.consume(request.ip);
      await validate(schemas.loginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.login(request, reply);
  });

  // Password reset routes (public but rate-limited)
  fastify.post('/forgot-password', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('forgot-password', null, request.ip);
      await validate(schemas.forgotPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.forgotPassword(request, reply);
  });

  fastify.post('/reset-password', {
    preHandler: async (request: any, reply: any) => {
      // Rate limit password reset attempts to prevent brute force
      try {
        await rateLimitService.consume('reset-password', null, request.ip);
      } catch (error) {
        return reply.status(429).send({
          error: 'Too many password reset attempts. Please try again later.'
        });
      }
      await validate(schemas.resetPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.resetPassword(request, reply);
  });

  // Email verification (public with token validation)
  fastify.get('/verify-email', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.verifyEmailSchema, 'query')(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.verifyEmail(request, reply);
  });

  // Token refresh (requires refresh token)
  fastify.post('/refresh', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.refreshTokenSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.refreshTokens(request, reply);
  });

  // ============================================
  // OAUTH ROUTES (Public - special auth flow)
  // ============================================

  // OAuth callback endpoints (for login/registration)
  fastify.post('/oauth/:provider/callback', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.providerParamSchema, 'params')(request, reply);
      await rateLimitService.consume('oauth-callback', null, request.ip);
      await validate(schemas.oauthCallbackSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { provider } = request.params as { provider: string };
    const { code, tenant_id } = request.body as { code: string; tenant_id?: string };

    try {
      const result = await oauthService.authenticate(
        provider,
        code,
        tenant_id,
        request.ip,
        request.headers['user-agent']
      );

      return {
        user: result.user,
        tokens: result.tokens
      };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  // Legacy OAuth login endpoint (keep for backward compatibility)
  fastify.post('/oauth/:provider/login', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.providerParamSchema, 'params')(request, reply);
      await rateLimitService.consume('oauth-login', null, request.ip);
      await validate(schemas.oauthLoginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { provider } = request.params as { provider: string };
    const { code } = request.body as { code: string };

    try {
      const result = await oauthService.authenticate(provider, code);
      return {
        user: result.user,
        tokens: result.tokens
      };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  // ============================================
  // WALLET ROUTES (Special auth flow)
  // ============================================

  fastify.post('/wallet/nonce', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-nonce', null, request.ip);
      await validate(schemas.walletNonceSchema)(request, reply);
    }
  }, walletController.requestNonce.bind(walletController));

  fastify.post('/wallet/register', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-register', null, request.ip);
      await validate(schemas.walletRegisterSchema)(request, reply);
    }
  }, walletController.register.bind(walletController));

  fastify.post('/wallet/login', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-login', null, request.ip);
      await validate(schemas.walletLoginSchema)(request, reply);
    }
  }, walletController.login.bind(walletController));

  // ============================================
  // PUBLIC BIOMETRIC ROUTES (For passwordless login)
  // ============================================

  // Generate challenge for biometric login (public - needs userId)
  fastify.post('/biometric/challenge', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.biometricChallengeSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { userId } = request.body;
    const challenge = await biometricService.generateChallenge(userId);
    return { challenge };
  });

  // Authenticate with biometric (public - passwordless login)
  fastify.post('/biometric/authenticate', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.biometricAuthenticateSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { userId, credentialId, signature, challenge } = request.body;
    try {
      const result = await biometricService.verifyBiometric(
        userId,
        credentialId,
        signature,
        challenge
      );

      if (result.valid) {
        // Generate tokens for the user
        const tokens = await jwtService.generateTokens({ id: userId });
        return { success: true, tokens };
      }

      return reply.status(401).send({ error: 'Biometric verification failed' });
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  // ============================================
  // AUTHENTICATED ROUTES (Require valid JWT)
  // ============================================

  // Register authenticated routes group
  fastify.register(async function authenticatedRoutes(fastify) {
    // Add authentication to ALL routes in this group
    fastify.addHook('preHandler', async (request: any, reply: any) => {
      await authMiddleware.authenticate(request, reply);
      await addTenantContext(request);
    });

    // User verification status
    fastify.get('/verify', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyToken(request, reply);
    });

    // Current user info
    fastify.get('/me', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.getCurrentUser(request, reply);
    });

    // Logout
    fastify.post('/logout', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.logoutSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.logout(request, reply);
    });

    // Resend verification email
    fastify.post('/resend-verification', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return extendedController.resendVerification(request, reply);
    });

    // Change password (requires current password)
    fastify.put('/change-password', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.changePasswordSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return extendedController.changePassword(request, reply);
    });

    // ============================================
    // MFA ROUTES (Authenticated)
    // ============================================

    fastify.post('/mfa/setup', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.setupMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.setupMFA(request, reply);
    });

    fastify.post('/mfa/verify-setup', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFASetup(request, reply);
    });

    fastify.post('/mfa/verify', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFA(request, reply);
    });

    fastify.post('/mfa/regenerate-backup-codes', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.regenerateBackupCodes(request, reply);
    });

    fastify.delete('/mfa/disable', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.disableMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.disableMFA(request, reply);
    });

    // ============================================
    // WALLET MANAGEMENT (Authenticated)
    // ============================================

    fastify.post('/wallet/link', {
      preHandler: async (request: any, reply: any) => {
        await rateLimitService.consume('wallet-link', null, request.ip);
        await validate(schemas.walletLinkSchema)(request, reply);
      }
    }, walletController.linkWallet.bind(walletController));

    fastify.delete('/wallet/unlink/:publicKey', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.publicKeyParamSchema, 'params')(request, reply);
        await rateLimitService.consume('wallet-unlink', null, request.ip);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, walletController.unlinkWallet.bind(walletController));

    // ============================================
    // BIOMETRIC ROUTES (Authenticated)
    // ============================================

    // Register a new biometric credential
    fastify.post('/biometric/register', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.biometricRegisterSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      try {
        const { publicKey, deviceId, biometricType } = request.body;
        const result = await biometricService.registerBiometric(
          request.user.id,
          deviceId,
          publicKey,
          biometricType || 'faceId'
        );
        return reply.status(201).send(result);
      } catch (error: any) {
        if (error.message === 'Device already registered') {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    });

    // Generate a challenge for biometric setup verification
    fastify.get('/biometric/challenge', async (request: any, reply: any) => {
      const challenge = await biometricService.generateChallenge(request.user.id);
      return { challenge };
    });

    // List registered biometric devices
    fastify.get('/biometric/devices', async (request: any, reply: any) => {
      const devices = await biometricService.listBiometricDevices(request.user.id);
      return { devices };
    });

    // Remove a biometric device
    fastify.delete('/biometric/devices/:credentialId', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.credentialIdParamSchema, 'params')(request, reply);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      try {
        const { credentialId } = request.params as { credentialId: string };
        await biometricService.removeBiometricDevice(request.user.id, credentialId);
        return reply.status(204).send();
      } catch (error: any) {
        if (error.message === 'Biometric credential not found') {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    });

    // ============================================
    // OAUTH LINKING (Authenticated)
    // ============================================

    fastify.post('/oauth/:provider/link', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.providerParamSchema, 'params')(request, reply);
        await validate(schemas.oauthLinkSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { provider } = request.params as { provider: string };
      const { code } = request.body as { code: string };
      return oauthService.linkProvider(request.user.id, provider, code);
    });

    fastify.delete('/oauth/:provider/unlink', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.providerParamSchema, 'params')(request, reply);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { provider } = request.params as { provider: string };
      return oauthService.unlinkProvider(request.user.id, provider);
    });

    // ============================================
    // SESSION MANAGEMENT (Authenticated)
    // ============================================

    fastify.get('/sessions', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.paginationQuerySchema, 'query')(request, reply);
      }
    }, async (request: any, reply: any) => {
      return sessionController.listSessions(request, reply);
    });

    // IMPORTANT: /sessions/all must come BEFORE /sessions/:sessionId
    // or "all" will be captured as a sessionId parameter
    fastify.delete('/sessions/all', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return sessionController.invalidateAllSessions(request, reply);
    });

    fastify.delete('/sessions/:sessionId', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.sessionIdParamSchema, 'params')(request, reply);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return sessionController.revokeSession(request, reply);
    });

    // ============================================
    // PROFILE MANAGEMENT (Authenticated)
    // ============================================

    fastify.get('/profile', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.getProfile(request, reply);
    });

    fastify.put('/profile', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.updateProfileSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.updateProfile(request, reply);
    });

    // ============================================
    // VENUE ROLE MANAGEMENT (Authenticated + Permissions)
    // ============================================

    fastify.post('/venues/:venueId/roles', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.venueIdParamSchema, 'params')(request, reply);
        await authMiddleware.requirePermission('roles:manage')(request, reply);
        await validate(schemas.grantRoleSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params as { venueId: string };
      const { userId, role } = request.body as { userId: string; role: string };

      await rbacService.grantVenueRole(userId, venueId, role);

      return {
        success: true,
        message: `Role ${role} granted to user ${userId} for venue ${venueId}`
      };
    });

    fastify.delete('/venues/:venueId/roles/:userId', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.venueIdAndUserIdParamSchema, 'params')(request, reply);
        await authMiddleware.requirePermission('roles:manage')(request, reply);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId, userId } = request.params as { venueId: string; userId: string };

      await rbacService.revokeVenueRoles(userId, venueId);

      return {
        success: true,
        message: `All roles revoked for user ${userId} at venue ${venueId}`
      };
    });

    fastify.get('/venues/:venueId/roles', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.venueIdParamSchema, 'params')(request, reply);
        await authMiddleware.requireVenueAccess(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params as { venueId: string };
      const roles = await rbacService.getVenueRoles(venueId);
      return { roles };
    });
  });
}
