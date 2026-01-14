// Mock resend first (before any imports)
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
  })),
}));

// Mock all services to avoid initialization issues
jest.mock('../../../src/services/rate-limit.service');
jest.mock('../../../src/services/device-trust.service');
jest.mock('../../../src/services/biometric.service');
jest.mock('../../../src/services/jwt.service');
jest.mock('../../../src/services/auth.service');
jest.mock('../../../src/services/auth-extended.service');
jest.mock('../../../src/services/rbac.service');
jest.mock('../../../src/services/mfa.service');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/services/lockout.service');
jest.mock('../../../src/services/audit.service');
jest.mock('../../../src/services/monitoring.service');
jest.mock('../../../src/services/wallet.service');
jest.mock('../../../src/services/oauth.service');
jest.mock('../../../src/config/database', () => ({
  db: {},
}));
jest.mock('../../../src/config/env', () => ({
  env: {},
}));

import { createDependencyContainer } from '../../../src/config/dependencies';

describe('dependencies config', () => {
  describe('createDependencyContainer', () => {
    it('should create a container', () => {
      const container = createDependencyContainer();
      expect(container).toBeDefined();
    });

    it('should register env', () => {
      const container = createDependencyContainer();
      expect(container.resolve('env')).toBeDefined();
    });

    it('should register db', () => {
      const container = createDependencyContainer();
      expect(container.resolve('db')).toBeDefined();
    });

    it('should register jwtService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('jwtService')).toBeDefined();
    });

    it('should register authService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('authService')).toBeDefined();
    });

    it('should register authExtendedService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('authExtendedService')).toBeDefined();
    });

    it('should register rbacService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('rbacService')).toBeDefined();
    });

    it('should register mfaService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('mfaService')).toBeDefined();
    });

    it('should register walletService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('walletService')).toBeDefined();
    });

    it('should register rateLimitService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('rateLimitService')).toBeDefined();
    });

    it('should register deviceTrustService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('deviceTrustService')).toBeDefined();
    });

    it('should register biometricService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('biometricService')).toBeDefined();
    });

    it('should register oauthService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('oauthService')).toBeDefined();
    });

    it('should register emailService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('emailService')).toBeDefined();
    });

    it('should register lockoutService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('lockoutService')).toBeDefined();
    });

    it('should register auditService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('auditService')).toBeDefined();
    });

    it('should register monitoringService', () => {
      const container = createDependencyContainer();
      expect(container.resolve('monitoringService')).toBeDefined();
    });
  });
});
