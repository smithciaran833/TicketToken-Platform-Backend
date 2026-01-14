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
  grantRoleSchema,
  disableMFASchema,
  updateProfileSchema,
} from '../../../src/validators/auth.validators';

describe('Auth Validators', () => {
  describe('registerSchema', () => {
    it('should validate valid registration data', async () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await registerSchema.validateAsync(data);
      expect(result).toEqual(data);
    });

    it('should reject invalid email', async () => {
      const data = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(registerSchema.validateAsync(data)).rejects.toThrow();
    });

    it('should reject short password', async () => {
      const data = {
        email: 'test@example.com',
        password: 'short',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(registerSchema.validateAsync(data)).rejects.toThrow();
    });

    it('should accept valid phone number', async () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+14155552671',
      };

      const result = await registerSchema.validateAsync(data);
      expect(result.phone).toBe('+14155552671');
    });
  });

  describe('loginSchema', () => {
    it('should validate valid login data', async () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await loginSchema.validateAsync(data);
      expect(result).toEqual(data);
    });

    it('should reject missing password', async () => {
      const data = {
        email: 'test@example.com',
      };

      await expect(loginSchema.validateAsync(data)).rejects.toThrow();
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate refresh token', async () => {
      const data = { refreshToken: 'valid-token' };
      const result = await refreshTokenSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });

  describe('verifyEmailSchema', () => {
    it('should validate email verification token', async () => {
      const data = { token: 'verification-token' };
      const result = await verifyEmailSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should validate forgot password request', async () => {
      const data = { email: 'test@example.com' };
      const result = await forgotPasswordSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });

  describe('resetPasswordSchema', () => {
    it('should validate password reset', async () => {
      const data = {
        token: 'reset-token',
        newPassword: 'newpassword123',
      };

      const result = await resetPasswordSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate password change', async () => {
      const data = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
      };

      const result = await changePasswordSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });

  describe('verifyMFASchema', () => {
    it('should validate 6-digit MFA token', async () => {
      const data = { token: '123456' };
      const result = await verifyMFASchema.validateAsync(data);
      expect(result).toEqual(data);
    });

    it('should reject non-numeric token', async () => {
      const data = { token: 'abc123' };
      await expect(verifyMFASchema.validateAsync(data)).rejects.toThrow();
    });

    it('should reject wrong length token', async () => {
      const data = { token: '12345' };
      await expect(verifyMFASchema.validateAsync(data)).rejects.toThrow();
    });
  });

  describe('grantRoleSchema', () => {
    it('should validate role grant', async () => {
      const data = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        venueId: '123e4567-e89b-12d3-a456-426614174001',
        role: 'venue-manager',
      };

      const result = await grantRoleSchema.validateAsync(data);
      expect(result.role).toBe('venue-manager');
    });

    it('should reject invalid role', async () => {
      const data = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        venueId: '123e4567-e89b-12d3-a456-426614174001',
        role: 'invalid-role',
      };

      await expect(grantRoleSchema.validateAsync(data)).rejects.toThrow();
    });
  });

  describe('updateProfileSchema', () => {
    it('should validate profile update', async () => {
      const data = {
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+14155552671',
      };

      const result = await updateProfileSchema.validateAsync(data);
      expect(result).toEqual(data);
    });

    it('should allow partial updates', async () => {
      const data = { first_name: 'Jane' };
      const result = await updateProfileSchema.validateAsync(data);
      expect(result).toEqual(data);
    });
  });
});
