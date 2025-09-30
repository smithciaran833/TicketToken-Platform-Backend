import * as schemas from '../../../src/validators/auth.validators';

describe('Auth Validators', () => {
  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890'
      };

      const result = schemas.registerSchema.validate(validData);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = schemas.registerSchema.validate(invalidData);
      expect(result.error).toBeDefined();
    });

    it('should reject short password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'short',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = schemas.registerSchema.validate(invalidData);
      expect(result.error).toBeDefined();
    });
  });

  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      const result = schemas.loginSchema.validate(validData);
      expect(result.error).toBeUndefined();
    });
  });
});
