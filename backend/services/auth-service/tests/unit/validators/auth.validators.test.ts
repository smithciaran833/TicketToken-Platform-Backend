import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  setupMFASchema,
  verifyMFASchema,
  disableMFASchema,
  walletNonceSchema,
  walletRegisterSchema,
  walletLoginSchema,
  walletLinkSchema,
  biometricRegisterSchema,
  biometricChallengeSchema,
  biometricAuthenticateSchema,
  oauthCallbackSchema,
  updateProfileSchema,
  grantRoleSchema,
  providerParamSchema,
  sessionIdParamSchema,
  paginationQuerySchema,
} from '../../../src/validators/auth.validators';

// Helper to validate and get error details
const validate = (schema: any, data: any) => {
  const result = schema.validate(data, { abortEarly: false });
  return {
    isValid: !result.error,
    errors: result.error?.details.map((d: any) => d.message) || [],
    value: result.value,
  };
};

describe('auth.validators', () => {
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  describe('registerSchema', () => {
    const validData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
      tenant_id: validUUID,
    };

    it('passes with valid data', () => {
      const { isValid } = validate(registerSchema, validData);
      expect(isValid).toBe(true);
    });

    it('passes with optional phone', () => {
      const { isValid } = validate(registerSchema, { ...validData, phone: '+14155551234' });
      expect(isValid).toBe(true);
    });

    it('rejects invalid email', () => {
      const { isValid, errors } = validate(registerSchema, { ...validData, email: 'invalid' });
      expect(isValid).toBe(false);
      expect(errors.some((e: string) => e.includes('email'))).toBe(true);
    });

    it('rejects short password', () => {
      const { isValid, errors } = validate(registerSchema, { ...validData, password: 'short' });
      expect(isValid).toBe(false);
      expect(errors.some((e: string) => e.includes('8'))).toBe(true);
    });

    it('rejects missing required fields', () => {
      const { isValid } = validate(registerSchema, {});
      expect(isValid).toBe(false);
    });

    it('rejects invalid tenant_id format', () => {
      const { isValid } = validate(registerSchema, { ...validData, tenant_id: 'not-a-uuid' });
      expect(isValid).toBe(false);
    });

    it('strips unknown fields', () => {
      const { isValid, value } = validate(registerSchema, { ...validData, unknown: 'field' });
      expect(isValid).toBe(false); // unknown(false) rejects unknown fields
    });

    it('rejects invalid phone format', () => {
      const { isValid } = validate(registerSchema, { ...validData, phone: '123' });
      expect(isValid).toBe(false);
    });
  });

  describe('loginSchema', () => {
    const validData = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('passes with valid data', () => {
      const { isValid } = validate(loginSchema, validData);
      expect(isValid).toBe(true);
    });

    it('passes with optional mfaToken', () => {
      const { isValid } = validate(loginSchema, { ...validData, mfaToken: '123456' });
      expect(isValid).toBe(true);
    });

    it('rejects invalid email', () => {
      const { isValid } = validate(loginSchema, { ...validData, email: 'invalid' });
      expect(isValid).toBe(false);
    });

    it('rejects missing password', () => {
      const { isValid } = validate(loginSchema, { email: 'test@example.com' });
      expect(isValid).toBe(false);
    });

    it('rejects mfaToken with wrong length', () => {
      const { isValid } = validate(loginSchema, { ...validData, mfaToken: '12345' });
      expect(isValid).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('passes with valid refreshToken', () => {
      const { isValid } = validate(refreshTokenSchema, { refreshToken: 'valid-token-string' });
      expect(isValid).toBe(true);
    });

    it('rejects missing refreshToken', () => {
      const { isValid } = validate(refreshTokenSchema, {});
      expect(isValid).toBe(false);
    });
  });

  describe('verifyEmailSchema', () => {
    it('passes with valid token', () => {
      const { isValid } = validate(verifyEmailSchema, { token: 'verification-token' });
      expect(isValid).toBe(true);
    });

    it('rejects missing token', () => {
      const { isValid } = validate(verifyEmailSchema, {});
      expect(isValid).toBe(false);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('passes with valid email', () => {
      const { isValid } = validate(forgotPasswordSchema, { email: 'test@example.com' });
      expect(isValid).toBe(true);
    });

    it('rejects invalid email', () => {
      const { isValid } = validate(forgotPasswordSchema, { email: 'invalid' });
      expect(isValid).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('passes with valid data', () => {
      const { isValid } = validate(resetPasswordSchema, { token: 'reset-token', newPassword: 'NewPassword123!' });
      expect(isValid).toBe(true);
    });

    it('rejects short newPassword', () => {
      const { isValid } = validate(resetPasswordSchema, { token: 'reset-token', newPassword: 'short' });
      expect(isValid).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('passes with valid data', () => {
      const { isValid } = validate(changePasswordSchema, { currentPassword: 'old123', newPassword: 'NewPassword123!' });
      expect(isValid).toBe(true);
    });

    it('rejects missing currentPassword', () => {
      const { isValid } = validate(changePasswordSchema, { newPassword: 'NewPassword123!' });
      expect(isValid).toBe(false);
    });
  });

  describe('MFA schemas', () => {
    describe('setupMFASchema', () => {
      it('passes with empty object', () => {
        const { isValid } = validate(setupMFASchema, {});
        expect(isValid).toBe(true);
      });

      it('rejects unknown fields', () => {
        const { isValid } = validate(setupMFASchema, { unknown: 'field' });
        expect(isValid).toBe(false);
      });
    });

    describe('verifyMFASchema', () => {
      it('passes with 6-digit token', () => {
        const { isValid } = validate(verifyMFASchema, { token: '123456' });
        expect(isValid).toBe(true);
      });

      it('rejects token with wrong length', () => {
        const { isValid } = validate(verifyMFASchema, { token: '12345' });
        expect(isValid).toBe(false);
      });
    });

    describe('disableMFASchema', () => {
      it('passes with valid data', () => {
        const { isValid } = validate(disableMFASchema, { password: 'password123', token: '123456' });
        expect(isValid).toBe(true);
      });

      it('rejects missing password', () => {
        const { isValid } = validate(disableMFASchema, { token: '123456' });
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Wallet schemas', () => {
    describe('walletNonceSchema', () => {
      it('passes with valid data', () => {
        const { isValid } = validate(walletNonceSchema, { publicKey: 'a'.repeat(44), chain: 'solana' });
        expect(isValid).toBe(true);
      });

      it('accepts ethereum chain', () => {
        const { isValid } = validate(walletNonceSchema, { publicKey: 'a'.repeat(44), chain: 'ethereum' });
        expect(isValid).toBe(true);
      });

      it('rejects invalid chain', () => {
        const { isValid } = validate(walletNonceSchema, { publicKey: 'a'.repeat(44), chain: 'bitcoin' });
        expect(isValid).toBe(false);
      });

      it('rejects short publicKey', () => {
        const { isValid } = validate(walletNonceSchema, { publicKey: 'short', chain: 'solana' });
        expect(isValid).toBe(false);
      });
    });

    describe('walletRegisterSchema', () => {
      const validData = {
        publicKey: 'a'.repeat(44),
        signature: 'b'.repeat(88),
        nonce: 'c'.repeat(32),
        chain: 'solana',
        tenant_id: validUUID,
      };

      it('passes with valid data', () => {
        const { isValid } = validate(walletRegisterSchema, validData);
        expect(isValid).toBe(true);
      });

      it('rejects missing tenant_id', () => {
        const { publicKey, signature, nonce, chain } = validData;
        const { isValid } = validate(walletRegisterSchema, { publicKey, signature, nonce, chain });
        expect(isValid).toBe(false);
      });
    });

    describe('walletLoginSchema', () => {
      const validData = {
        publicKey: 'a'.repeat(44),
        signature: 'b'.repeat(88),
        nonce: 'c'.repeat(32),
        chain: 'ethereum',
      };

      it('passes with valid data', () => {
        const { isValid } = validate(walletLoginSchema, validData);
        expect(isValid).toBe(true);
      });
    });

    describe('walletLinkSchema', () => {
      const validData = {
        publicKey: 'a'.repeat(44),
        signature: 'b'.repeat(88),
        nonce: 'c'.repeat(32),
        chain: 'solana',
      };

      it('passes with valid data', () => {
        const { isValid } = validate(walletLinkSchema, validData);
        expect(isValid).toBe(true);
      });
    });
  });

  describe('Biometric schemas', () => {
    describe('biometricRegisterSchema', () => {
      it('passes with valid data', () => {
        const { isValid } = validate(biometricRegisterSchema, { publicKey: 'key123', deviceId: 'device123' });
        expect(isValid).toBe(true);
      });

      it('passes with optional biometricType', () => {
        const { isValid } = validate(biometricRegisterSchema, { publicKey: 'key123', deviceId: 'device123', biometricType: 'faceId' });
        expect(isValid).toBe(true);
      });

      it('rejects invalid biometricType', () => {
        const { isValid } = validate(biometricRegisterSchema, { publicKey: 'key123', deviceId: 'device123', biometricType: 'invalid' });
        expect(isValid).toBe(false);
      });
    });

    describe('biometricChallengeSchema', () => {
      it('passes with valid userId', () => {
        const { isValid } = validate(biometricChallengeSchema, { userId: validUUID });
        expect(isValid).toBe(true);
      });

      it('rejects invalid userId', () => {
        const { isValid } = validate(biometricChallengeSchema, { userId: 'not-uuid' });
        expect(isValid).toBe(false);
      });
    });

    describe('biometricAuthenticateSchema', () => {
      it('passes with valid data', () => {
        const { isValid } = validate(biometricAuthenticateSchema, {
          userId: validUUID,
          credentialId: validUUID,
          signature: 'signature123',
          challenge: 'challenge123',
        });
        expect(isValid).toBe(true);
      });
    });
  });

  describe('OAuth schemas', () => {
    describe('oauthCallbackSchema', () => {
      it('passes with valid code', () => {
        const { isValid } = validate(oauthCallbackSchema, { code: 'oauth-code' });
        expect(isValid).toBe(true);
      });

      it('passes with optional state and tenant_id', () => {
        const { isValid } = validate(oauthCallbackSchema, { code: 'oauth-code', state: 'state123', tenant_id: validUUID });
        expect(isValid).toBe(true);
      });

      it('rejects missing code', () => {
        const { isValid } = validate(oauthCallbackSchema, { state: 'state123' });
        expect(isValid).toBe(false);
      });
    });
  });

  describe('updateProfileSchema', () => {
    it('passes with partial data', () => {
      const { isValid } = validate(updateProfileSchema, { firstName: 'John' });
      expect(isValid).toBe(true);
    });

    it('passes with all optional fields', () => {
      const { isValid } = validate(updateProfileSchema, {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+14155551234',
        email: 'new@example.com',
      });
      expect(isValid).toBe(true);
    });

    it('passes with empty object', () => {
      const { isValid } = validate(updateProfileSchema, {});
      expect(isValid).toBe(true);
    });

    it('rejects invalid email', () => {
      const { isValid } = validate(updateProfileSchema, { email: 'invalid' });
      expect(isValid).toBe(false);
    });
  });

  describe('grantRoleSchema', () => {
    it('passes with valid data', () => {
      const { isValid } = validate(grantRoleSchema, { userId: validUUID, role: 'admin' });
      expect(isValid).toBe(true);
    });

    it('rejects invalid userId', () => {
      const { isValid } = validate(grantRoleSchema, { userId: 'not-uuid', role: 'admin' });
      expect(isValid).toBe(false);
    });
  });

  describe('providerParamSchema', () => {
    it('passes with valid provider', () => {
      expect(validate(providerParamSchema, { provider: 'google' }).isValid).toBe(true);
      expect(validate(providerParamSchema, { provider: 'github' }).isValid).toBe(true);
      expect(validate(providerParamSchema, { provider: 'facebook' }).isValid).toBe(true);
      expect(validate(providerParamSchema, { provider: 'apple' }).isValid).toBe(true);
    });

    it('rejects invalid provider', () => {
      const { isValid } = validate(providerParamSchema, { provider: 'twitter' });
      expect(isValid).toBe(false);
    });
  });

  describe('sessionIdParamSchema', () => {
    it('passes with valid UUID', () => {
      const { isValid } = validate(sessionIdParamSchema, { sessionId: validUUID });
      expect(isValid).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const { isValid } = validate(sessionIdParamSchema, { sessionId: 'invalid' });
      expect(isValid).toBe(false);
    });
  });

  describe('paginationQuerySchema', () => {
    it('passes with empty object and uses defaults', () => {
      const { isValid, value } = validate(paginationQuerySchema, {});
      expect(isValid).toBe(true);
      expect(value.page).toBe(1);
      expect(value.limit).toBe(20);
      expect(value.order).toBe('desc');
    });

    it('passes with custom values', () => {
      const { isValid, value } = validate(paginationQuerySchema, { page: 2, limit: 50, order: 'asc' });
      expect(isValid).toBe(true);
      expect(value.page).toBe(2);
      expect(value.limit).toBe(50);
      expect(value.order).toBe('asc');
    });

    it('rejects page less than 1', () => {
      const { isValid } = validate(paginationQuerySchema, { page: 0 });
      expect(isValid).toBe(false);
    });

    it('rejects limit greater than 100', () => {
      const { isValid } = validate(paginationQuerySchema, { limit: 101 });
      expect(isValid).toBe(false);
    });

    it('rejects invalid sortBy', () => {
      const { isValid } = validate(paginationQuerySchema, { sortBy: 'invalid' });
      expect(isValid).toBe(false);
    });
  });
});
