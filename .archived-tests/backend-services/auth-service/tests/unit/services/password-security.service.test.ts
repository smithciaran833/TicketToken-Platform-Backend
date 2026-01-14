import { PasswordSecurityService } from '../../../src/services/password-security.service';

// Mock argon2
jest.mock('argon2');

import argon2 from 'argon2';

describe('PasswordSecurityService', () => {
  let service: PasswordSecurityService;

  beforeEach(() => {
    service = new PasswordSecurityService();
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    const validPassword = 'ValidPass123!@#';

    it('should hash valid password', async () => {
      (argon2.hash as jest.Mock).mockResolvedValue('hashed_password');

      const hash = await service.hashPassword(validPassword);

      expect(hash).toBe('hashed_password');
      expect(argon2.hash).toHaveBeenCalledWith(
        validPassword,
        expect.objectContaining({
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        })
      );
    });

    it('should throw error for invalid password', async () => {
      const invalidPassword = 'short';

      await expect(service.hashPassword(invalidPassword))
        .rejects.toThrow('Password validation failed');
    });

    it('should not call argon2 for invalid password', async () => {
      const invalidPassword = 'weak';

      try {
        await service.hashPassword(invalidPassword);
      } catch (error) {
        // Expected to throw
      }

      expect(argon2.hash).not.toHaveBeenCalled();
    });
  });

  describe('verifyPassword', () => {
    const hash = 'hashed_password';
    const password = 'ValidPass123!@#';

    it('should return true for correct password', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword(hash, password);

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(hash, password);
    });

    it('should return false for incorrect password', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      const result = await service.verifyPassword(hash, 'WrongPass123!');

      expect(result).toBe(false);
    });

    it('should return false on verification error', async () => {
      (argon2.verify as jest.Mock).mockRejectedValue(new Error('Verification failed'));

      const result = await service.verifyPassword(hash, password);

      expect(result).toBe(false);
    });
  });

  describe('validatePassword', () => {
    describe('length validation', () => {
      it('should reject password shorter than 12 characters', () => {
        const result = service.validatePassword('Short1!');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be at least 12 characters');
      });

      it('should reject password longer than 128 characters', () => {
        const longPassword = 'A'.repeat(129) + '1!';

        const result = service.validatePassword(longPassword);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be less than 128 characters');
      });

      it('should accept password of valid length', () => {
        const result = service.validatePassword('ValidPass123!@#');

        expect(result.valid).toBe(true);
      });
    });

    describe('character requirements', () => {
      it('should reject password without uppercase letter', () => {
        const result = service.validatePassword('validpass123!@#');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should reject password without lowercase letter', () => {
        const result = service.validatePassword('VALIDPASS123!@#');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      });

      it('should reject password without number', () => {
        const result = service.validatePassword('ValidPassword!@#');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one number');
      });

      it('should reject password without special character', () => {
        const result = service.validatePassword('ValidPassword123');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one special character');
      });
    });

    describe('common password detection', () => {
      it('should reject common password', () => {
        const result = service.validatePassword('Password123!');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password is too common');
      });

      it('should reject common password case-insensitively', () => {
        const result = service.validatePassword('PASSWORD123!');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password is too common');
      });
    });

    describe('repeated character detection', () => {
      it('should reject password with 3+ repeated characters', () => {
        const result = service.validatePassword('ValidPasss123!');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password cannot contain more than 2 repeated characters');
      });

      it('should allow password with 2 repeated characters', () => {
        const result = service.validatePassword('ValidPass123!@#');

        expect(result.valid).toBe(true);
      });
    });

    describe('valid passwords', () => {
      it('should accept strong password', () => {
        const result = service.validatePassword('MyStr0ng!Pass');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept password with multiple special characters', () => {
        const result = service.validatePassword('C0mpl3x!P@ssw0rd#');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('multiple validation errors', () => {
      it('should return all validation errors', () => {
        const result = service.validatePassword('weak');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password of correct length', () => {
      const password = service.generateSecurePassword();

      expect(password.length).toBe(16);
    });

    it('should generate password with uppercase letter', () => {
      const password = service.generateSecurePassword();

      expect(/[A-Z]/.test(password)).toBe(true);
    });

    it('should generate password with lowercase letter', () => {
      const password = service.generateSecurePassword();

      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('should generate password with number', () => {
      const password = service.generateSecurePassword();

      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('should generate password with special character', () => {
      const password = service.generateSecurePassword();

      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });

    it('should generate different passwords on multiple calls', () => {
      const password1 = service.generateSecurePassword();
      const password2 = service.generateSecurePassword();

      expect(password1).not.toBe(password2);
    });

    it('should generate password that passes validation', () => {
      const password = service.generateSecurePassword();
      const validation = service.validatePassword(password);

      expect(validation.valid).toBe(true);
    });
  });
});
