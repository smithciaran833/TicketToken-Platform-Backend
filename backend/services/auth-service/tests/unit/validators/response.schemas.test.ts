// Mock zod-to-json-schema before importing
jest.mock('zod-to-json-schema', () => ({
  zodToJsonSchema: jest.fn((schema) => ({ type: 'object', mocked: true })),
}));

import { responseSchemas } from '../../../src/validators/response.schemas';

describe('response.schemas', () => {
  describe('auth schemas', () => {
    it('should have register schema', () => {
      expect(responseSchemas.register).toBeDefined();
      expect(responseSchemas.register[201]).toBeDefined();
    });

    it('should have login schema', () => {
      expect(responseSchemas.login).toBeDefined();
      expect(responseSchemas.login[200]).toBeDefined();
    });

    it('should have refresh schema', () => {
      expect(responseSchemas.refresh).toBeDefined();
      expect(responseSchemas.refresh[200]).toBeDefined();
    });

    it('should have verifyToken schema', () => {
      expect(responseSchemas.verifyToken).toBeDefined();
    });

    it('should have getCurrentUser schema', () => {
      expect(responseSchemas.getCurrentUser).toBeDefined();
    });

    it('should have logout schema', () => {
      expect(responseSchemas.logout).toBeDefined();
    });
  });

  describe('password schemas', () => {
    it('should have forgotPassword schema', () => {
      expect(responseSchemas.forgotPassword).toBeDefined();
    });

    it('should have resetPassword schema', () => {
      expect(responseSchemas.resetPassword).toBeDefined();
    });

    it('should have changePassword schema', () => {
      expect(responseSchemas.changePassword).toBeDefined();
    });
  });

  describe('email verification schemas', () => {
    it('should have verifyEmail schema', () => {
      expect(responseSchemas.verifyEmail).toBeDefined();
    });

    it('should have resendVerification schema', () => {
      expect(responseSchemas.resendVerification).toBeDefined();
    });
  });

  describe('MFA schemas', () => {
    it('should have setupMFA schema', () => {
      expect(responseSchemas.setupMFA).toBeDefined();
    });

    it('should have verifyMFASetup schema', () => {
      expect(responseSchemas.verifyMFASetup).toBeDefined();
    });

    it('should have verifyMFA schema', () => {
      expect(responseSchemas.verifyMFA).toBeDefined();
    });

    it('should have regenerateBackupCodes schema', () => {
      expect(responseSchemas.regenerateBackupCodes).toBeDefined();
    });

    it('should have disableMFA schema', () => {
      expect(responseSchemas.disableMFA).toBeDefined();
    });
  });

  describe('wallet schemas', () => {
    it('should have walletNonce schema', () => {
      expect(responseSchemas.walletNonce).toBeDefined();
    });

    it('should have walletRegister schema', () => {
      expect(responseSchemas.walletRegister).toBeDefined();
    });

    it('should have walletLogin schema', () => {
      expect(responseSchemas.walletLogin).toBeDefined();
    });

    it('should have walletLink schema', () => {
      expect(responseSchemas.walletLink).toBeDefined();
    });

    it('should have walletUnlink schema', () => {
      expect(responseSchemas.walletUnlink).toBeDefined();
    });
  });

  describe('biometric schemas', () => {
    it('should have biometricChallenge schema', () => {
      expect(responseSchemas.biometricChallenge).toBeDefined();
    });

    it('should have biometricAuthenticate schema', () => {
      expect(responseSchemas.biometricAuthenticate).toBeDefined();
    });

    it('should have biometricRegister schema', () => {
      expect(responseSchemas.biometricRegister).toBeDefined();
    });

    it('should have biometricDevices schema', () => {
      expect(responseSchemas.biometricDevices).toBeDefined();
    });

    it('should have deleteBiometricDevice schema', () => {
      expect(responseSchemas.deleteBiometricDevice).toBeDefined();
    });
  });

  describe('OAuth schemas', () => {
    it('should have oauthCallback schema', () => {
      expect(responseSchemas.oauthCallback).toBeDefined();
    });

    it('should have oauthLink schema', () => {
      expect(responseSchemas.oauthLink).toBeDefined();
    });

    it('should have oauthUnlink schema', () => {
      expect(responseSchemas.oauthUnlink).toBeDefined();
    });
  });

  describe('session schemas', () => {
    it('should have listSessions schema', () => {
      expect(responseSchemas.listSessions).toBeDefined();
    });

    it('should have revokeSession schema', () => {
      expect(responseSchemas.revokeSession).toBeDefined();
    });

    it('should have invalidateAllSessions schema', () => {
      expect(responseSchemas.invalidateAllSessions).toBeDefined();
    });
  });

  describe('profile schemas', () => {
    it('should have getProfile schema', () => {
      expect(responseSchemas.getProfile).toBeDefined();
    });

    it('should have updateProfile schema', () => {
      expect(responseSchemas.updateProfile).toBeDefined();
    });
  });

  describe('GDPR schemas', () => {
    it('should have exportData schema', () => {
      expect(responseSchemas.exportData).toBeDefined();
    });

    it('should have getConsent schema', () => {
      expect(responseSchemas.getConsent).toBeDefined();
    });

    it('should have updateConsent schema', () => {
      expect(responseSchemas.updateConsent).toBeDefined();
    });

    it('should have requestDeletion schema', () => {
      expect(responseSchemas.requestDeletion).toBeDefined();
    });
  });

  describe('venue role schemas', () => {
    it('should have grantVenueRole schema', () => {
      expect(responseSchemas.grantVenueRole).toBeDefined();
    });

    it('should have revokeVenueRole schema', () => {
      expect(responseSchemas.revokeVenueRole).toBeDefined();
    });

    it('should have getVenueRoles schema', () => {
      expect(responseSchemas.getVenueRoles).toBeDefined();
    });
  });

  describe('internal S2S schemas', () => {
    it('should have validatePermissions schema', () => {
      expect(responseSchemas.validatePermissions).toBeDefined();
    });

    it('should have validateUsers schema', () => {
      expect(responseSchemas.validateUsers).toBeDefined();
    });

    it('should have userTenant schema', () => {
      expect(responseSchemas.userTenant).toBeDefined();
    });

    it('should have internalHealth schema', () => {
      expect(responseSchemas.internalHealth).toBeDefined();
    });
  });

  describe('common schemas', () => {
    it('should have error schema', () => {
      expect(responseSchemas.error).toBeDefined();
    });

    it('should have message schema', () => {
      expect(responseSchemas.message).toBeDefined();
    });
  });
});
