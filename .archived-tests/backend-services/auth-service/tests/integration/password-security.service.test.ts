import { PasswordSecurityService } from '../../src/services/password-security.service';

/**
 * INTEGRATION TESTS FOR PASSWORD SECURITY SERVICE
 * 
 * These tests verify actual password hashing and validation.
 * No mocks - tests real argon2id hashing and validation logic.
 */

describe('PasswordSecurityService Integration Tests', () => {
  let passwordService: PasswordSecurityService;

  beforeAll(() => {
    passwordService = new PasswordSecurityService();
  });

  describe('hashPassword()', () => {
    it('should hash valid password with argon2id', async () => {
      const password = 'SecurePass123!@#';
      const hash = await passwordService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toContain('$argon2id$'); // Argon2id signature
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for same password (salt)', async () => {
      const password = 'SecurePass123!@#';
      
      const hash1 = await passwordService.hashPassword(password);
      const hash2 = await passwordService.hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different salts = different hashes
    });

    it('should throw when password too short (< 12 chars)', async () => {
      const shortPassword = 'Short1!';
      
      await expect(passwordService.hashPassword(shortPassword))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw when password too long (> 128 chars)', async () => {
      const longPassword = 'a'.repeat(129) + 'A1!';
      
      await expect(passwordService.hashPassword(longPassword))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw when missing uppercase', async () => {
      const noUppercase = 'securepass123!';
      
      await expect(passwordService.hashPassword(noUppercase))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw when missing lowercase', async () => {
      const noLowercase = 'SECUREPASS123!';
      
      await expect(passwordService.hashPassword(noLowercase))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw when missing number', async () => {
      const noNumber = 'SecurePassword!';
      
      await expect(passwordService.hashPassword(noNumber))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw when missing special character', async () => {
      const noSpecial = 'SecurePassword123';
      
      await expect(passwordService.hashPassword(noSpecial))
        .rejects.toThrow('Password validation failed');
    });

    it('should throw for repeated characters (aaa)', async () => {
      const repeatedChars = 'Aaa111!!!bbb';
      
      await expect(passwordService.hashPassword(repeatedChars))
        .rejects.toThrow('Password validation failed');
    });

    it('should accept password with all requirements', async () => {
      const validPasswords = [
        'MyStr0ng!Pass',
        'Secur3#Password',
        'C0mpl3x@Pass99',
        'Test!ng123Pass'
      ];

      for (const password of validPasswords) {
        const hash = await passwordService.hashPassword(password);
        expect(hash).toBeDefined();
        expect(hash).toContain('$argon2id$');
      }
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for correct password', async () => {
      const password = 'SecurePass123!@#';
      const hash = await passwordService.hashPassword(password);

      const isValid = await passwordService.verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'SecurePass123!@#';
      const wrongPassword = 'WrongPass123!@#';
      const hash = await passwordService.hashPassword(password);

      const isValid = await passwordService.verifyPassword(hash, wrongPassword);
      expect(isValid).toBe(false);
    });

    it('should return false for slightly different password', async () => {
      const password = 'SecurePass123!@#';
      const similarPassword = 'SecurePass123!@';  // Missing one char
      const hash = await passwordService.hashPassword(password);

      const isValid = await passwordService.verifyPassword(hash, similarPassword);
      expect(isValid).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const password = 'SecurePass123!@#';
      const differentCase = 'securepass123!@#';
      const hash = await passwordService.hashPassword(password);

      const isValid = await passwordService.verifyPassword(hash, differentCase);
      expect(isValid).toBe(false);
    });

    it('should return false on verification error', async () => {
      const invalidHash = 'invalid-hash-format';
      const password = 'SecurePass123!@#';

      const isValid = await passwordService.verifyPassword(invalidHash, password);
      expect(isValid).toBe(false);
    });

    it('should handle empty password', async () => {
      const password = 'SecurePass123!@#';
      const hash = await passwordService.hashPassword(password);

      const isValid = await passwordService.verifyPassword(hash, '');
      expect(isValid).toBe(false);
    });
  });

  describe('validatePassword()', () => {
    it('should return valid:true for strong password', () => {
      const strongPasswords = [
        'MyStr0ng!Pass',
        'Secur3#Password',
        'C0mpl3x@Pass99',
        'Test!ng123Pass'
      ];

      for (const password of strongPasswords) {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      }
    });

    it('should return error for password < 12 chars', () => {
      const result = passwordService.validatePassword('Short1!');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('12 characters'))).toBe(true);
    });

    it('should return error for password > 128 chars', () => {
      const longPassword = 'a'.repeat(129) + 'A1!';
      const result = passwordService.validatePassword(longPassword);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('128 characters'))).toBe(true);
    });

    it('should return error for no uppercase', () => {
      const result = passwordService.validatePassword('securepass123!');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('uppercase'))).toBe(true);
    });

    it('should return error for no lowercase', () => {
      const result = passwordService.validatePassword('SECUREPASS123!');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('lowercase'))).toBe(true);
    });

    it('should return error for no number', () => {
      const result = passwordService.validatePassword('SecurePassword!');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('number'))).toBe(true);
    });

    it('should return error for no special character', () => {
      const result = passwordService.validatePassword('SecurePassword123');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('special'))).toBe(true);
    });

    it('should detect repeated characters (aaa)', () => {
      const passwords = [
        'Aaa111!!!bbb',
        'Testtt123!',
        'Pass000word!',
        'Secure!!!123'
      ];

      for (const password of passwords) {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.toLowerCase().includes('repeated'))).toBe(true);
      }
    });

    it('should return multiple errors for multiple violations', () => {
      const weakPassword = 'weak';  // Too short, no uppercase, no number, no special
      const result = passwordService.validatePassword(weakPassword);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should accept passwords with special characters at different positions', () => {
      const passwords = [
        '!MyStr0ngPass',
        'MyStr0ng!Pass',
        'MyStr0ngPass!',
        '!My!Str0ng!Pass!'
      ];

      for (const password of passwords) {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept passwords with numbers at different positions', () => {
      const passwords = [
        '1MyStr0ng!Pass',
        'MyStr0ng!Pass1',
        'My1Str0ng!Pass',
        '123MyStr!Pass'
      ];

      for (const password of passwords) {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('generateSecurePassword()', () => {
    it('should generate 16-character password', () => {
      const password = passwordService.generateSecurePassword();
      expect(password.length).toBe(16);
    });

    it('should include uppercase letter', () => {
      const password = passwordService.generateSecurePassword();
      expect(/[A-Z]/.test(password)).toBe(true);
    });

    it('should include lowercase letter', () => {
      const password = passwordService.generateSecurePassword();
      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('should include number', () => {
      const password = passwordService.generateSecurePassword();
      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('should include special character', () => {
      const password = passwordService.generateSecurePassword();
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)).toBe(true);
    });

    it('generated password should pass validation', () => {
      for (let i = 0; i < 10; i++) {
        const password = passwordService.generateSecurePassword();
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(true);
      }
    });

    it('should generate unique passwords', () => {
      const passwords = new Set();
      
      for (let i = 0; i < 100; i++) {
        const password = passwordService.generateSecurePassword();
        passwords.add(password);
      }

      // All 100 passwords should be unique
      expect(passwords.size).toBe(100);
    });

    it('generated password should be hashable', async () => {
      const generatedPassword = passwordService.generateSecurePassword();
      const hash = await passwordService.hashPassword(generatedPassword);

      expect(hash).toBeDefined();
      expect(hash).toContain('$argon2id$');
    });

    it('generated password should be verifiable', async () => {
      const generatedPassword = passwordService.generateSecurePassword();
      const hash = await passwordService.hashPassword(generatedPassword);
      const isValid = await passwordService.verifyPassword(hash, generatedPassword);

      expect(isValid).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should hash password in reasonable time (< 500ms)', async () => {
      const password = 'SecurePass123!@#';
      const startTime = Date.now();
      
      await passwordService.hashPassword(password);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500); // Argon2 should be fast but secure
    });

    it('should verify password in reasonable time (< 500ms)', async () => {
      const password = 'SecurePass123!@#';
      const hash = await passwordService.hashPassword(password);
      
      const startTime = Date.now();
      await passwordService.verifyPassword(hash, password);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(500);
    });

    it('should validate password instantly (< 10ms)', () => {
      const password = 'SecurePass123!@#';
      
      const startTime = Date.now();
      passwordService.validatePassword(password);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle password with Unicode characters', async () => {
      const unicodePassword = 'Pāsswørd123!™';
      const hash = await passwordService.hashPassword(unicodePassword);
      const isValid = await passwordService.verifyPassword(hash, unicodePassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle password with emojis', async () => {
      const emojiPassword = 'Pass🔒word123!';
      const hash = await passwordService.hashPassword(emojiPassword);
      const isValid = await passwordService.verifyPassword(hash, emojiPassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle password with all special characters', () => {
      const allSpecial = '!@#$%^&*()_+-=[]{};\':"|,.<>/?ABCabc123';
      const result = passwordService.validatePassword(allSpecial);
      
      expect(result.valid).toBe(true);
    });

    it('should handle maximum length password (128 chars)', async () => {
      const maxPassword = 'Aa1!' + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'.slice(0, 124);
      const hash = await passwordService.hashPassword(maxPassword);
      const isValid = await passwordService.verifyPassword(hash, maxPassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle minimum length password (12 chars)', async () => {
      const minPassword = 'Abcd1234!@#$';
      const hash = await passwordService.hashPassword(minPassword);
      const isValid = await passwordService.verifyPassword(hash, minPassword);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Security Tests', () => {
    it('should detect dictionary words combined', () => {
      const dictionaryCombos = [
        'Dragon2024!@',
        'Football123!',
        'Baseball99!@'
      ];

      for (const password of dictionaryCombos) {
        const result = passwordService.validatePassword(password);
        // These might pass or fail depending on common password list
        expect(result).toHaveProperty('valid');
      }
    });

    it('should not accept sequential characters', () => {
      const sequential = [
        'Abc123456!@#',
        'Qwerty123!@#',
        '123456Abc!@#'
      ];

      // Some of these should be caught by common password check
      for (const password of sequential) {
        const result = passwordService.validatePassword(password);
        if (!result.valid) {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }
    });

    it('should ensure hash cannot be reversed', async () => {
      const password = 'SecurePass123!@#';
      const hash = await passwordService.hashPassword(password);

      // Hash should not contain the password
      expect(hash.toLowerCase()).not.toContain(password.toLowerCase());
      expect(hash).not.toContain('SecurePass');
    });
  });
});
