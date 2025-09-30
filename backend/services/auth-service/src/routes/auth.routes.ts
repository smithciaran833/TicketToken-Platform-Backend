import { FastifyInstance } from 'fastify';
import { Container } from '../config/dependencies';
import { AuthController } from '../controllers/auth.controller';
import { AuthExtendedController } from '../controllers/auth-extended.controller';
import { SessionController } from '../controllers/session.controller';
import { ProfileController } from '../controllers/profile.controller';
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
    return controller.register(request, reply);
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
    return controller.login(request, reply);
  });

  // Password reset routes (public but rate-limited)
  fastify.post('/forgot-password', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('forgot-password', null, request.ip);
      await validate(schemas.forgotPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.forgotPassword(request, reply);
  });

  fastify.post('/reset-password', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.resetPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.resetPassword(request, reply);
  });

  // Email verification (public with token validation)
  fastify.get('/verify-email', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.verifyEmailSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.verifyEmail(request, reply);
  });

  // Token refresh (requires refresh token)
  fastify.post('/refresh', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.refreshTokenSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return controller.refreshTokens(request, reply);
  });

  // ============================================
  // WALLET ROUTES (Special auth flow)
  // ============================================
  
  fastify.get('/wallet/nonce/:address', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-nonce', null, request.ip);
    }
  }, async (request: any, reply: any) => {
    const { address } = request.params;
    const nonce = await walletService.generateNonce(address);
    return { nonce };
  });

  fastify.post('/wallet/login', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-login', null, request.ip);
      await validate(schemas.walletLoginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { address, signature } = request.body;
    return walletService.verifyAndLogin(address, signature);
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
    fastify.get('/verify', async (request: any, reply: any) => {
      return controller.verifyToken(request, reply);
    });

    // Current user info
    fastify.get('/me', async (request: any, reply: any) => {
      return controller.getCurrentUser(request, reply);
    });

    // Logout
    fastify.post('/logout', async (request: any, reply: any) => {
      return controller.logout(request, reply);
    });

    // Resend verification email
    fastify.post('/resend-verification', async (request: any, reply: any) => {
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

    fastify.post('/mfa/verify', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFA(request, reply);
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
    
    fastify.post('/wallet/connect', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.connectWalletSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { address } = request.body;
      return walletService.connectWallet(request.user.id, address);
    });

    // ============================================
    // BIOMETRIC ROUTES (Authenticated)
    // ============================================
    
    fastify.post('/biometric/register', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.biometricRegisterSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const result = await biometricService.registerBiometric(
        request.user.id, 
        request.body.publicKey
      );
      return result;
    });

    fastify.get('/biometric/challenge', async (request: any, reply: any) => {
      const challenge = await biometricService.generateChallenge(request.user.id);
      return { challenge };
    });

    // ============================================
    // OAUTH LINKING (Authenticated)
    // ============================================
    
    fastify.post('/oauth/:provider/link', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.oauthLinkSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { provider } = request.params;
      const { code } = request.body;
      return oauthService.linkProvider(request.user.id, provider, code);
    });

    // ============================================
    // SESSION MANAGEMENT (Authenticated)
    // ============================================
    
    fastify.get('/sessions', async (request: any, reply: any) => {
      return sessionController.listSessions(request, reply);
    });

    fastify.delete('/sessions/all', async (request: any, reply: any) => {
      return sessionController.invalidateAllSessions(request, reply);
    });

    fastify.delete('/sessions/:sessionId', async (request: any, reply: any) => {
      return sessionController.revokeSession(request, reply);
    });

    // ============================================
    // PROFILE MANAGEMENT (Authenticated)
    // ============================================
    
    fastify.get('/profile', async (request: any, reply: any) => {
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
        await authMiddleware.requirePermission('roles:manage')(request, reply);
        await validate(schemas.grantRoleSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params;
      const { userId, role } = request.body;
      
      await rbacService.grantVenueRole(userId, venueId, role);
      
      return {
        success: true,
        message: `Role ${role} granted to user ${userId} for venue ${venueId}`
      };
    });

    fastify.delete('/venues/:venueId/roles/:userId', {
      preHandler: async (request: any, reply: any) => {
        await authMiddleware.requirePermission('roles:manage')(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId, userId } = request.params;
      
      await rbacService.revokeVenueRoles(userId, venueId);
      
      return {
        success: true,
        message: `All roles revoked for user ${userId} at venue ${venueId}`
      };
    });

    fastify.get('/venues/:venueId/roles', {
      preHandler: async (request: any, reply: any) => {
        await authMiddleware.requireVenueAccess(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params;
      const roles = await rbacService.getVenueRoles(venueId);
      return { roles };
    });
  });

  // OAuth routes (separate group with different auth flow)
  fastify.post('/oauth/:provider/login', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('oauth-login', null, request.ip);
      await validate(schemas.oauthLoginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { provider } = request.params;
    const { code } = request.body;
    
    try {
      const result = await oauthService.authenticate(provider, code);
      return {
        user: {
          id: result.user.id,
          email: result.user.email,
        },
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }
      };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });
}

  // Cache statistics endpoint
