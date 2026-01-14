// Mock all dependencies before imports
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
};

const mockAuthExtendedService = {
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  changePassword: jest.fn(),
};

const mockMfaService = {
  setup: jest.fn(),
  verify: jest.fn(),
};

const mockJwtService = {
  verifyAccessToken: jest.fn(),
  generateTokens: jest.fn(),
};

const mockWalletService = {
  generateNonce: jest.fn(),
  register: jest.fn(),
  login: jest.fn(),
  linkWallet: jest.fn(),
  unlinkWallet: jest.fn(),
};

const mockOauthService = {
  authenticate: jest.fn(),
  linkProvider: jest.fn(),
  unlinkProvider: jest.fn(),
};

const mockRateLimitService = {
  consume: jest.fn(),
};

const mockDeviceTrustService = {};

const mockBiometricService = {
  generateChallenge: jest.fn(),
  verifyBiometric: jest.fn(),
  registerBiometric: jest.fn(),
  listBiometricDevices: jest.fn(),
  removeBiometricDevice: jest.fn(),
};

const mockRbacService = {
  getUserPermissions: jest.fn(),
  grantVenueRole: jest.fn(),
  revokeVenueRoles: jest.fn(),
  getVenueRoles: jest.fn(),
};

const mockContainer = {
  resolve: jest.fn((name: string) => {
    const services: Record<string, any> = {
      authService: mockAuthService,
      authExtendedService: mockAuthExtendedService,
      mfaService: mockMfaService,
      jwtService: mockJwtService,
      walletService: mockWalletService,
      oauthService: mockOauthService,
      rateLimitService: mockRateLimitService,
      deviceTrustService: mockDeviceTrustService,
      biometricService: mockBiometricService,
      rbacService: mockRbacService,
    };
    return services[name];
  }),
};

// Mock rate limiters
jest.mock('../../../src/utils/rateLimiter', () => ({
  loginRateLimiter: { consume: jest.fn() },
  registrationRateLimiter: { consume: jest.fn() },
}));

// Mock zod-to-json-schema
jest.mock('zod-to-json-schema', () => ({
  zodToJsonSchema: jest.fn(() => ({ type: 'object', additionalProperties: true })),
}));

// Mock controllers
jest.mock('../../../src/controllers/auth.controller', () => ({
  AuthController: jest.fn().mockImplementation(() => ({
    register: jest.fn().mockResolvedValue({ user: {}, tokens: {} }),
    login: jest.fn().mockResolvedValue({ user: {}, tokens: {} }),
    refreshTokens: jest.fn().mockResolvedValue({ accessToken: 'token', refreshToken: 'token' }),
    verifyToken: jest.fn().mockResolvedValue({ valid: true, user: {} }),
    getCurrentUser: jest.fn().mockResolvedValue({ user: {} }),
    logout: jest.fn().mockResolvedValue({ success: true }),
    setupMFA: jest.fn().mockResolvedValue({ secret: 'secret', qrCode: 'qr' }),
    verifyMFASetup: jest.fn().mockResolvedValue({ success: true, backupCodes: [] }),
    verifyMFA: jest.fn().mockResolvedValue({ valid: true }),
    regenerateBackupCodes: jest.fn().mockResolvedValue({ backupCodes: [] }),
    disableMFA: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

jest.mock('../../../src/controllers/auth-extended.controller', () => ({
  AuthExtendedController: jest.fn().mockImplementation(() => ({
    forgotPassword: jest.fn().mockResolvedValue({ message: 'Email sent' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'Password reset' }),
    verifyEmail: jest.fn().mockResolvedValue({ message: 'Email verified' }),
    resendVerification: jest.fn().mockResolvedValue({ message: 'Sent' }),
    changePassword: jest.fn().mockResolvedValue({ message: 'Changed' }),
  })),
}));

jest.mock('../../../src/controllers/session.controller', () => ({
  SessionController: jest.fn().mockImplementation(() => ({
    listSessions: jest.fn().mockResolvedValue({ success: true, sessions: [] }),
    revokeSession: jest.fn().mockResolvedValue({ success: true, message: 'Revoked' }),
    invalidateAllSessions: jest.fn().mockResolvedValue({ success: true, message: 'Done', sessions_revoked: 0 }),
  })),
}));

jest.mock('../../../src/controllers/profile.controller', () => ({
  ProfileController: jest.fn().mockImplementation(() => ({
    getProfile: jest.fn().mockResolvedValue({ success: true, user: {} }),
    updateProfile: jest.fn().mockResolvedValue({ success: true, user: {} }),
    exportData: jest.fn().mockResolvedValue({ exportedAt: new Date().toISOString() }),
    getConsent: jest.fn().mockResolvedValue({ success: true, consent: {} }),
    updateConsent: jest.fn().mockResolvedValue({ success: true }),
    requestDeletion: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

jest.mock('../../../src/controllers/wallet.controller', () => ({
  WalletController: jest.fn().mockImplementation(() => ({
    requestNonce: jest.fn().mockResolvedValue({ nonce: 'nonce' }),
    register: jest.fn().mockResolvedValue({ success: true, user: {}, tokens: {} }),
    login: jest.fn().mockResolvedValue({ success: true, user: {}, tokens: {} }),
    linkWallet: jest.fn().mockResolvedValue({ success: true }),
    unlinkWallet: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

// Mock middleware
jest.mock('../../../src/middleware/auth.middleware', () => ({
  createAuthMiddleware: jest.fn(() => ({
    authenticate: jest.fn().mockImplementation(async (req: any) => {
      req.user = { id: 'user-123', tenant_id: 'tenant-123' };
    }),
    requirePermission: jest.fn(() => jest.fn()),
    requireVenueAccess: jest.fn(),
  })),
}));

jest.mock('../../../src/middleware/tenant.middleware', () => ({
  validateTenant: jest.fn(),
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validate: jest.fn(() => jest.fn()),
}));

import Fastify from 'fastify';
import { authRoutes } from '../../../src/routes/auth.routes';

describe('auth.routes', () => {
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRateLimitService.consume.mockResolvedValue(undefined);
    mockBiometricService.generateChallenge.mockResolvedValue('challenge-123');
    mockBiometricService.verifyBiometric.mockResolvedValue({ valid: true });
    mockJwtService.generateTokens.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    mockOauthService.authenticate.mockResolvedValue({ user: {}, tokens: {} });
    mockOauthService.linkProvider.mockResolvedValue({ success: true, provider: 'google' });
    mockOauthService.unlinkProvider.mockResolvedValue({ success: true });
    mockRbacService.getVenueRoles.mockResolvedValue([]);
    
    app = Fastify();
    await app.register(authRoutes, { container: mockContainer });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Public Routes', () => {
    describe('POST /register', () => {
      it('should register a new user', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/register',
          payload: {
            email: 'test@example.com',
            password: 'Password123!',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /login', () => {
      it('should login a user', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/login',
          payload: {
            email: 'test@example.com',
            password: 'Password123!',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /forgot-password', () => {
      it('should send forgot password email', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/forgot-password',
          payload: {
            email: 'test@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /reset-password', () => {
      it('should reset password', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/reset-password',
          payload: {
            token: 'reset-token',
            password: 'NewPassword123!',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('GET /verify-email', () => {
      it('should verify email', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/verify-email?token=verify-token',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /refresh', () => {
      it('should refresh tokens', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/refresh',
          payload: {
            refreshToken: 'refresh-token',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('OAuth Routes', () => {
    describe('POST /oauth/:provider/callback', () => {
      it('should handle OAuth callback', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/oauth/google/callback',
          payload: {
            code: 'auth-code',
          },
        });

        expect(response.statusCode).toBe(200);
        expect(mockOauthService.authenticate).toHaveBeenCalled();
      });

      it('should return 401 on OAuth error', async () => {
        mockOauthService.authenticate.mockRejectedValue(new Error('OAuth failed'));

        const response = await app.inject({
          method: 'POST',
          url: '/oauth/google/callback',
          payload: {
            code: 'bad-code',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /oauth/:provider/login', () => {
      it('should handle OAuth login', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/oauth/github/login',
          payload: {
            code: 'auth-code',
          },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should return 401 on OAuth login error', async () => {
        mockOauthService.authenticate.mockRejectedValue(new Error('Login failed'));

        const response = await app.inject({
          method: 'POST',
          url: '/oauth/github/login',
          payload: {
            code: 'bad-code',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe('Wallet Routes', () => {
    describe('POST /wallet/nonce', () => {
      it('should return nonce', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/wallet/nonce',
          payload: {
            publicKey: '0x123',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /wallet/register', () => {
      it('should register wallet', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/wallet/register',
          payload: {
            publicKey: '0x123',
            signature: 'sig',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /wallet/login', () => {
      it('should login with wallet', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/wallet/login',
          payload: {
            publicKey: '0x123',
            signature: 'sig',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Public Biometric Routes', () => {
    describe('POST /biometric/challenge', () => {
      it('should return challenge', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/biometric/challenge',
          payload: {
            userId: 'user-123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.challenge).toBe('challenge-123');
      });
    });

    describe('POST /biometric/authenticate', () => {
      it('should authenticate with biometric', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/biometric/authenticate',
          payload: {
            userId: 'user-123',
            credentialId: 'cred-123',
            signature: 'sig',
            challenge: 'challenge',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should return 401 on invalid biometric', async () => {
        mockBiometricService.verifyBiometric.mockResolvedValue({ valid: false });

        const response = await app.inject({
          method: 'POST',
          url: '/biometric/authenticate',
          payload: {
            userId: 'user-123',
            credentialId: 'cred-123',
            signature: 'bad-sig',
            challenge: 'challenge',
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it('should return 401 on biometric error', async () => {
        mockBiometricService.verifyBiometric.mockRejectedValue(new Error('Biometric error'));

        const response = await app.inject({
          method: 'POST',
          url: '/biometric/authenticate',
          payload: {
            userId: 'user-123',
            credentialId: 'cred-123',
            signature: 'sig',
            challenge: 'challenge',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe('Authenticated Routes', () => {
    describe('GET /verify', () => {
      it('should verify token', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/verify',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('GET /me', () => {
      it('should get current user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/me',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /logout', () => {
      it('should logout user', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/logout',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /resend-verification', () => {
      it('should resend verification email', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/resend-verification',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('PUT /change-password', () => {
      it('should change password', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/change-password',
          payload: {
            currentPassword: 'old',
            newPassword: 'new',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('MFA Routes', () => {
    describe('POST /mfa/setup', () => {
      it('should setup MFA', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/setup',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /mfa/verify-setup', () => {
      it('should verify MFA setup', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/verify-setup',
          payload: { code: '123456' },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /mfa/verify', () => {
      it('should verify MFA', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/verify',
          payload: { code: '123456' },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /mfa/regenerate-backup-codes', () => {
      it('should regenerate backup codes', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/mfa/regenerate-backup-codes',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /mfa/disable', () => {
      it('should disable MFA', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/mfa/disable',
          payload: { password: 'password' },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Authenticated Wallet Routes', () => {
    describe('POST /wallet/link', () => {
      it('should link wallet', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/wallet/link',
          payload: {
            publicKey: '0x123',
            signature: 'sig',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /wallet/unlink/:publicKey', () => {
      it('should unlink wallet', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/wallet/unlink/0x123',
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Authenticated Biometric Routes', () => {
    describe('POST /biometric/register', () => {
      it('should register biometric', async () => {
        mockBiometricService.registerBiometric.mockResolvedValue({ success: true, credentialId: 'cred' });

        const response = await app.inject({
          method: 'POST',
          url: '/biometric/register',
          payload: {
            publicKey: 'pk',
            deviceId: 'device',
            biometricType: 'faceId',
          },
        });

        expect(response.statusCode).toBe(201);
      });

      it('should return 409 on duplicate device', async () => {
        mockBiometricService.registerBiometric.mockRejectedValue(new Error('Device already registered'));

        const response = await app.inject({
          method: 'POST',
          url: '/biometric/register',
          payload: {
            publicKey: 'pk',
            deviceId: 'device',
          },
        });

        expect(response.statusCode).toBe(409);
      });
    });

    describe('GET /biometric/challenge', () => {
      it('should get challenge for authenticated user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/biometric/challenge',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('GET /biometric/devices', () => {
      it('should list devices', async () => {
        mockBiometricService.listBiometricDevices.mockResolvedValue([]);

        const response = await app.inject({
          method: 'GET',
          url: '/biometric/devices',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /biometric/devices/:credentialId', () => {
      it('should delete device', async () => {
        mockBiometricService.removeBiometricDevice.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'DELETE',
          url: '/biometric/devices/cred-123',
        });

        expect(response.statusCode).toBe(204);
      });

      it('should return 404 on not found', async () => {
        mockBiometricService.removeBiometricDevice.mockRejectedValue(new Error('Biometric credential not found'));

        const response = await app.inject({
          method: 'DELETE',
          url: '/biometric/devices/not-found',
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('OAuth Linking Routes', () => {
    describe('POST /oauth/:provider/link', () => {
      it('should link OAuth provider', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/oauth/google/link',
          payload: { code: 'auth-code' },
        });

        expect(response.statusCode).toBe(200);
        expect(mockOauthService.linkProvider).toHaveBeenCalled();
      });
    });

    describe('DELETE /oauth/:provider/unlink', () => {
      it('should unlink OAuth provider', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/oauth/google/unlink',
        });

        expect(response.statusCode).toBe(200);
        expect(mockOauthService.unlinkProvider).toHaveBeenCalled();
      });
    });
  });

  describe('Session Routes', () => {
    describe('GET /sessions', () => {
      it('should list sessions', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/sessions',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /sessions/all', () => {
      it('should invalidate all sessions', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/sessions/all',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /sessions/:sessionId', () => {
      it('should revoke session', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/sessions/session-123',
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Profile Routes', () => {
    describe('GET /profile', () => {
      it('should get profile', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/profile',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('PUT /profile', () => {
      it('should update profile', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/profile',
          payload: { firstName: 'John' },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('GDPR Routes', () => {
    describe('GET /gdpr/export', () => {
      it('should export data', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/export',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('GET /consent', () => {
      it('should get consent', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/consent',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('PUT /consent', () => {
      it('should update consent', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/consent',
          payload: { marketing: true },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /gdpr/delete', () => {
      it('should request deletion', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Venue Role Routes', () => {
    describe('POST /venues/:venueId/roles', () => {
      it('should grant venue role', async () => {
        mockRbacService.grantVenueRole.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/venues/venue-123/roles',
          payload: { userId: 'user-456', role: 'manager' },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('DELETE /venues/:venueId/roles/:userId', () => {
      it('should revoke venue role', async () => {
        mockRbacService.revokeVenueRoles.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'DELETE',
          url: '/venues/venue-123/roles/user-456',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('GET /venues/:venueId/roles', () => {
      it('should get venue roles', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venues/venue-123/roles',
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });
});
