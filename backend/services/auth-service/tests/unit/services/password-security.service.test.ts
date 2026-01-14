import { PasswordSecurityService } from '../../../src/services/password-security.service';

describe('PasswordSecurityService', () => {
  let service: PasswordSecurityService;

  beforeEach(() => {
    service = new PasswordSecurityService();
  });

  describe('validatePassword', () => {
    const validPassword = 'MySecure@Pass123';

    it('accepts strong password', () => {
      const result = service.validatePassword(validPassword);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects password shorter than 12 characters', () => {
      const result = service.validatePassword('Short@1');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('12'))).toBe(true);
    });

    it('rejects password longer than 128 characters', () => {
      const longPassword = 'A'.repeat(100) + 'a1@' + 'B'.repeat(30);
      const result = service.validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('128'))).toBe(true);
    });

    it('rejects missing uppercase', () => {
      const result = service.validatePassword('mysecure@pass123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    it('rejects missing lowercase', () => {
      const result = service.validatePassword('MYSECURE@PASS123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('rejects missing number', () => {
      const result = service.validatePassword('MySecure@Password');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });

    it('rejects missing special character', () => {
      const result = service.validatePassword('MySecurePass123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('special'))).toBe(true);
    });

    it('rejects common passwords', () => {
      const result = service.validatePassword('password123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('common'))).toBe(true);
    });

    it('rejects common passwords case-insensitively', () => {
      const result = service.validatePassword('PASSWORD123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('common'))).toBe(true);
    });

    it('rejects 3+ repeated characters', () => {
      const result = service.validatePassword('MySecuuure@Pass1');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('repeated'))).toBe(true);
    });

    it('allows 2 repeated characters', () => {
      const result = service.validatePassword('MySecu@Pass1234');
      expect(result.valid).toBe(true);
    });

    it('returns all errors, not just first', () => {
      const result = service.validatePassword('short');
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('hashPassword', () => {
    const validPassword = 'MySecure@Pass123';

    it('returns argon2 hash', async () => {
      const hash = await service.hashPassword(validPassword);
      expect(hash).toMatch(/^\$argon2/);
    });

    it('produces different hashes for same password (salted)', async () => {
      const hash1 = await service.hashPassword(validPassword);
      const hash2 = await service.hashPassword(validPassword);
      expect(hash1).not.toBe(hash2);
    });

    it('throws on invalid password', async () => {
      await expect(service.hashPassword('weak')).rejects.toThrow();
    });
  });

  describe('verifyPassword', () => {
    const validPassword = 'MySecure@Pass123';

    it('returns true for correct password', async () => {
      const hash = await service.hashPassword(validPassword);
      const result = await service.verifyPassword(hash, validPassword);
      expect(result).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      const hash = await service.hashPassword(validPassword);
      const result = await service.verifyPassword(hash, 'WrongPassword@123');
      expect(result).toBe(false);
    });

    it('returns false for invalid hash', async () => {
      const result = await service.verifyPassword('invalid-hash', validPassword);
      expect(result).toBe(false);
    });
  });

  describe('generateSecurePassword', () => {
    it('generates password of correct length', () => {
      const password = service.generateSecurePassword();
      expect(password.length).toBe(16);
    });

    it('generated password passes validation', () => {
      // Generate multiple passwords to ensure consistency
      for (let i = 0; i < 10; i++) {
        const password = service.generateSecurePassword();
        const result = service.validatePassword(password);
        expect(result.valid).toBe(true);
      }
    });

    it('contains uppercase letter', () => {
      const password = service.generateSecurePassword();
      expect(/[A-Z]/.test(password)).toBe(true);
    });

    it('contains lowercase letter', () => {
      const password = service.generateSecurePassword();
      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('contains number', () => {
      const password = service.generateSecurePassword();
      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('contains special character', () => {
      const password = service.generateSecurePassword();
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });

    it('generates different passwords each time', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passwords.add(service.generateSecurePassword());
      }
      expect(passwords.size).toBe(10);
    });
  });
});
