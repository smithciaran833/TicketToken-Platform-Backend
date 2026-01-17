import { FastifyInstance } from 'fastify';
import { Container } from '../config/dependencies';
import { AuthController } from '../controllers/auth.controller';
import { AuthExtendedController } from '../controllers/auth-extended.controller';
import { SessionController } from '../controllers/session.controller';
import { ProfileController } from '../controllers/profile.controller';
import { WalletController } from '../controllers/wallet.controller';
import { createAuthMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { validateTenant } from '../middleware/tenant.middleware';
import * as schemas from '../validators/auth.validators';
import { responseSchemas } from '../validators/response.schemas';
import { loginRateLimiter, registrationRateLimiter } from '../utils/rateLimiter';
import { db } from '../config/database';
import { AuthenticationError } from '../errors';

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
  const auditService = container.resolve('auditService');

  // Create controllers and middleware
  const controller = new AuthController(authService, mfaService);
  const extendedController = new AuthExtendedController(authExtendedService);
  const sessionController = new SessionController();
  const profileController = new ProfileController();
  const walletController = new WalletController(walletService);
  const authMiddleware = createAuthMiddleware(jwtService, rbacService);

  // ============================================
  // PUBLIC ROUTES (Still need rate limiting)
  // ============================================

  fastify.post('/register', {
    schema: { response: responseSchemas.register },
    preHandler: async (request: any, reply: any) => {
      await registrationRateLimiter.consume(request.ip);
      await validate(schemas.registerSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.register(request, reply);
  });

  fastify.post('/login', {
    schema: { response: responseSchemas.login },
    preHandler: async (request: any, reply: any) => {
      try {
        await rateLimitService.consume('login', null, request.ip);
      } catch (error) {
        throw error;
      }
      await loginRateLimiter.consume(request.ip);
      await validate(schemas.loginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.login(request, reply);
  });

  fastify.post('/forgot-password', {
    schema: { response: responseSchemas.forgotPassword },
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('forgot-password', null, request.ip);
      await validate(schemas.forgotPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.forgotPassword(request, reply);
  });

  fastify.post('/reset-password', {
    schema: { response: responseSchemas.resetPassword },
    preHandler: async (request: any, reply: any) => {
      try {
        await rateLimitService.consume('reset-password', null, request.ip);
      } catch (error) {
        throw error;
      }
      await validate(schemas.resetPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.resetPassword(request, reply);
  });

  fastify.get('/verify-email', {
    schema: { response: responseSchemas.verifyEmail },
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.verifyEmailSchema, 'query')(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await extendedController.verifyEmail(request, reply);
  });

  fastify.post('/refresh', {
    schema: { response: responseSchemas.refresh },
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.refreshTokenSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return await controller.refreshTokens(request, reply);
  });

  // ============================================
  // OAUTH ROUTES (Public - special auth flow)
  // ============================================

  fastify.post('/oauth/:provider/callback', {
    schema: { response: responseSchemas.oauthCallback },
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

  fastify.post('/oauth/:provider/login', {
    schema: { response: responseSchemas.oauthCallback },
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
    schema: { response: responseSchemas.walletNonce },
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-nonce', null, request.ip);
      await validate(schemas.walletNonceSchema)(request, reply);
    }
  }, walletController.requestNonce.bind(walletController));

  fastify.post('/wallet/register', {
    schema: { response: responseSchemas.walletRegister },
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-register', null, request.ip);
      await validate(schemas.walletRegisterSchema)(request, reply);
    }
  }, walletController.register.bind(walletController));

  fastify.post('/wallet/login', {
    schema: { response: responseSchemas.walletLogin },
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-login', null, request.ip);
      await validate(schemas.walletLoginSchema)(request, reply);
    }
  }, walletController.login.bind(walletController));

  // ============================================
  // PUBLIC BIOMETRIC ROUTES (For passwordless login)
  // ============================================

  fastify.post('/biometric/challenge', {
    schema: { response: responseSchemas.biometricChallenge },
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.biometricChallengeSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { userId, tenantId } = request.body;
    const challenge = await biometricService.generateChallenge(userId, tenantId);
    return { challenge };
  });

  fastify.post('/biometric/authenticate', {
    schema: { response: responseSchemas.biometricAuthenticate },
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.biometricAuthenticateSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { userId, tenantId, credentialId, signature, challenge } = request.body;
    try {
      const result = await biometricService.verifyBiometric(
        userId,
        tenantId,
        credentialId,
        signature,
        challenge
      );

      if (result.valid) {
        // SECURITY FIX: Check user status before issuing tokens
        const user = await db('users')
          .where({ id: userId, tenant_id: tenantId })
          .first();

        if (!user) {
          throw new AuthenticationError('User not found');
        }

        if (user.deleted_at) {
          throw new AuthenticationError('Account has been deleted');
        }

        if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
          throw new AuthenticationError('Account is not active');
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          throw new AuthenticationError('Account is temporarily locked');
        }

        const tokens = await jwtService.generateTokenPair({ id: userId, tenant_id: tenantId });

        // Audit log the successful biometric authentication
        await auditService.logBiometricAuth(userId, credentialId, request.ip, request.headers['user-agent'], true, tenantId);

        return { success: true, tokens };
      }

      return reply.status(401).send({ error: 'Biometric verification failed' });
    } catch (error: any) {
      // Audit log failed biometric authentication
      await auditService.logBiometricAuth(userId, credentialId, request.ip, request.headers['user-agent'], false, tenantId, error.message);

      return reply.status(401).send({ error: error.message });
    }
  });

  // ============================================
  // AUTHENTICATED ROUTES (Require valid JWT)
  // ============================================

  fastify.register(async function authenticatedRoutes(fastify) {
    fastify.addHook('preHandler', async (request: any, reply: any) => {
      await authMiddleware.authenticate(request, reply);
      await validateTenant(request, reply);
    });

    fastify.get('/verify', {
      schema: { response: responseSchemas.verifyToken },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyToken(request, reply);
    });

    fastify.get('/me', {
      schema: { response: responseSchemas.getCurrentUser },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.getCurrentUser(request, reply);
    });

    fastify.post('/logout', {
      schema: { response: responseSchemas.logout },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.logoutSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.logout(request, reply);
    });

    fastify.post('/resend-verification', {
      schema: { response: responseSchemas.resendVerification },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return extendedController.resendVerification(request, reply);
    });

    fastify.put('/change-password', {
      schema: { response: responseSchemas.changePassword },
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
      schema: { response: responseSchemas.setupMFA },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.setupMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.setupMFA(request, reply);
    });

    fastify.post('/mfa/verify-setup', {
      schema: { response: responseSchemas.verifyMFASetup },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFASetup(request, reply);
    });

    fastify.post('/mfa/verify', {
      schema: { response: responseSchemas.verifyMFA },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFA(request, reply);
    });

    fastify.post('/mfa/regenerate-backup-codes', {
      schema: { response: responseSchemas.regenerateBackupCodes },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.regenerateBackupCodes(request, reply);
    });

    fastify.delete('/mfa/disable', {
      schema: { response: responseSchemas.disableMFA },
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
      schema: { response: responseSchemas.walletLink },
      preHandler: async (request: any, reply: any) => {
        await rateLimitService.consume('wallet-link', null, request.ip);
        await validate(schemas.walletLinkSchema)(request, reply);
      }
    }, walletController.linkWallet.bind(walletController));

    fastify.delete('/wallet/unlink/:publicKey', {
      schema: { response: responseSchemas.walletUnlink },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.publicKeyParamSchema, 'params')(request, reply);
        await rateLimitService.consume('wallet-unlink', null, request.ip);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, walletController.unlinkWallet.bind(walletController));

    // ============================================
    // BIOMETRIC ROUTES (Authenticated)
    // ============================================

    fastify.post('/biometric/register', {
      schema: { response: responseSchemas.biometricRegister },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.biometricRegisterSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      try {
        const { publicKey, deviceId, biometricType } = request.body;
        const result = await biometricService.registerBiometric(
          request.user.id,
          request.user.tenant_id,
          deviceId,
          publicKey,
          biometricType || 'faceId'
        );

        // Audit log biometric registration
        await auditService.logBiometricRegistration(
          request.user.id,
          result.credentialId,
          deviceId,
          biometricType || 'faceId',
          request.ip,
          request.user.tenant_id
        );

        return reply.status(201).send(result);
      } catch (error: any) {
        if (error.message === 'Device already registered') {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    });

    fastify.get('/biometric/challenge', {
      schema: { response: responseSchemas.biometricChallenge },
    }, async (request: any, reply: any) => {
      const challenge = await biometricService.generateChallenge(request.user.id, request.user.tenant_id);
      return { challenge };
    });

    fastify.get('/biometric/devices', {
      schema: { response: responseSchemas.biometricDevices },
    }, async (request: any, reply: any) => {
      const devices = await biometricService.listBiometricDevices(request.user.id, request.user.tenant_id);
      return { devices };
    });

    fastify.delete('/biometric/devices/:credentialId', {
      schema: { response: responseSchemas.deleteBiometricDevice },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.credentialIdParamSchema, 'params')(request, reply);
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      try {
        const { credentialId } = request.params as { credentialId: string };
        await biometricService.removeBiometricDevice(request.user.id, request.user.tenant_id, credentialId);

        // Audit log biometric device deletion
        await auditService.logBiometricDeviceDeleted(
          request.user.id,
          credentialId,
          request.ip,
          request.user.tenant_id
        );

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
      schema: { response: responseSchemas.oauthLink },
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
      schema: { response: responseSchemas.oauthUnlink },
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
      schema: { response: responseSchemas.listSessions },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.paginationQuerySchema, 'query')(request, reply);
      }
    }, async (request: any, reply: any) => {
      return sessionController.listSessions(request, reply);
    });

    fastify.delete('/sessions/all', {
      schema: { response: responseSchemas.invalidateAllSessions },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return sessionController.invalidateAllSessions(request, reply);
    });

    fastify.delete('/sessions/:sessionId', {
      schema: { response: responseSchemas.revokeSession },
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
      schema: { response: responseSchemas.getProfile },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.getProfile(request, reply);
    });

    fastify.put('/profile', {
      schema: { response: responseSchemas.updateProfile },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.updateProfileSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.updateProfile(request, reply);
    });

    // ============================================
    // GDPR / DATA RIGHTS (Authenticated)
    // ============================================

    fastify.get('/gdpr/export', {
      schema: { response: responseSchemas.exportData },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.exportData(request, reply);
    });

    fastify.get('/consent', {
      schema: { response: responseSchemas.getConsent },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.emptyBodySchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.getConsent(request, reply);
    });

    fastify.put('/consent', {
      schema: { response: responseSchemas.updateConsent },
    }, async (request: any, reply: any) => {
      return profileController.updateConsent(request, reply);
    });

    fastify.post('/gdpr/delete', {
      schema: { response: responseSchemas.requestDeletion },
    }, async (request: any, reply: any) => {
      return profileController.requestDeletion(request, reply);
    });

    // ============================================
    // VENUE ROLE MANAGEMENT (Authenticated + Permissions)
    // ============================================

    fastify.post('/venues/:venueId/roles', {
      schema: { response: responseSchemas.grantVenueRole },
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.venueIdParamSchema, 'params')(request, reply);
        await authMiddleware.requirePermission('roles:manage')(request, reply);
        await validate(schemas.grantRoleSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params as { venueId: string };
      const { userId, role } = request.body as { userId: string; role: string };

      await rbacService.grantVenueRole(userId, request.user.tenant_id, venueId, role, request.user.id);

      return {
        success: true,
        message: `Role ${role} granted to user ${userId} for venue ${venueId}`
      };
    });

    fastify.delete('/venues/:venueId/roles/:userId', {
      schema: { response: responseSchemas.revokeVenueRole },
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
      schema: { response: responseSchemas.getVenueRoles },
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
