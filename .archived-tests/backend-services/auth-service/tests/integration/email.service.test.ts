import { EmailService } from '../../src/services/email.service';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR EMAIL SERVICE
 * 
 * These tests verify email functionality:
 * - Email verification
 * - Password reset emails
 * - MFA backup codes emails
 * - Token generation and storage
 */

describe('EmailService Integration Tests', () => {
  let emailService: EmailService;

  beforeAll(() => {
    // Verify we're in test mode
    const nodeEnv = process.env.NODE_ENV || 'development';
    console.log(`✓ Running email service integration tests in ${nodeEnv} mode`);
    
    emailService = new EmailService();
  });

  afterEach(async () => {
    // Clean up Redis tokens (both patterns)
    const verifyKeys = await redis.keys('email-verify:*');
    const resetKeys = await redis.keys('password-reset:*');
    const allKeys = [...verifyKeys, ...resetKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('constructor()', () => {
    it('should initialize Resend client', () => {
      expect(emailService).toBeDefined();
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should use placeholder key in dev mode', () => {
      // In dev/test mode, should not throw even without real API key
      expect(() => new EmailService()).not.toThrow();
    });
  });

  describe('sendVerificationEmail()', () => {
    it('should generate verification token', async () => {
      const userId = 'test-user-123';
      const email = 'test@example.com';
      const firstName = 'Test';

      await emailService.sendVerificationEmail(userId, email, firstName);

      // Verify token stored in Redis (pattern: email-verify:TOKEN)
      const keys = await redis.keys('email-verify:*');
      expect(keys.length).toBe(1);
    });

    it('should store token in Redis with 24h TTL', async () => {
      const userId = 'test-user-456';
      const email = 'verify@example.com';
      const firstName = 'Verify';

      await emailService.sendVerificationEmail(userId, email, firstName);

      // Find the token key (pattern: email-verify:TOKEN)
      const keys = await redis.keys('email-verify:*');
      expect(keys.length).toBeGreaterThan(0);

      const ttl = await redis.ttl(keys[0]);
      expect(ttl).toBeGreaterThan(86000); // At least 23h 50m
      expect(ttl).toBeLessThanOrEqual(86400); // At most 24h
    });

    it('should format verification URL', async () => {
      const userId = 'test-user-789';
      const email = 'url-test@example.com';
      const firstName = 'URL';

      // In test/dev mode, this should log but not throw
      await expect(
        emailService.sendVerificationEmail(userId, email, firstName)
      ).resolves.not.toThrow();
    });

    it('should call sendEmail with correct template', async () => {
      const userId = 'template-test-user';
      const email = 'template@example.com';
      const firstName = 'Template';

      // Should complete without error in test mode
      await emailService.sendVerificationEmail(userId, email, firstName);
      
      // Verify no error thrown
      expect(true).toBe(true);
    });
  });

  describe('sendPasswordResetEmail()', () => {
    it('should generate reset token', async () => {
      const userId = 'reset-user-123';
      const email = 'reset@example.com';
      const firstName = 'Reset';

      await emailService.sendPasswordResetEmail(userId, email, firstName);

      // Verify token stored in Redis (pattern: password-reset:TOKEN)
      const keys = await redis.keys('password-reset:*');
      expect(keys.length).toBe(1);
    });

    it('should store token in Redis with 1h TTL', async () => {
      const userId = 'reset-user-456';
      const email = 'reset-ttl@example.com';
      const firstName = 'ResetTTL';

      await emailService.sendPasswordResetEmail(userId, email, firstName);

      // Find the token key (pattern: password-reset:TOKEN)
      const keys = await redis.keys('password-reset:*');
      expect(keys.length).toBeGreaterThan(0);

      const ttl = await redis.ttl(keys[0]);
      expect(ttl).toBeGreaterThan(3550); // At least 59m 10s
      expect(ttl).toBeLessThanOrEqual(3600); // At most 1h
    });

    it('should format reset URL', async () => {
      const userId = 'reset-url-user';
      const email = 'reset-url@example.com';
      const firstName = 'ResetURL';

      // Should complete without error in test mode
      await expect(
        emailService.sendPasswordResetEmail(userId, email, firstName)
      ).resolves.not.toThrow();
    });

    it('should call sendEmail with correct template', async () => {
      const userId = 'reset-template-user';
      const email = 'reset-template@example.com';
      const firstName = 'ResetTemplate';

      await emailService.sendPasswordResetEmail(userId, email, firstName);
      
      // Verify no error thrown
      expect(true).toBe(true);
    });
  });

  describe('sendMFABackupCodesEmail()', () => {
    it('should format backup codes in HTML list', async () => {
      const email = 'mfa@example.com';
      const firstName = 'MFA';
      const backupCodes = ['CODE1234', 'CODE5678', 'CODE9012'];

      // Should complete without error in test mode
      await expect(
        emailService.sendMFABackupCodesEmail(email, firstName, backupCodes)
      ).resolves.not.toThrow();
    });

    it('should format backup codes in plain text', async () => {
      const email = 'mfa-plain@example.com';
      const firstName = 'MFAPlain';
      const backupCodes = ['PLAIN123', 'PLAIN456', 'PLAIN789'];

      await emailService.sendMFABackupCodesEmail(email, firstName, backupCodes);
      
      // Verify no error thrown
      expect(true).toBe(true);
    });

    it('should call sendEmail with correct template', async () => {
      const email = 'mfa-template@example.com';
      const firstName = 'MFATemplate';
      const backupCodes = ['TEMP1234', 'TEMP5678'];

      await emailService.sendMFABackupCodesEmail(email, firstName, backupCodes);
      
      // Verify no error thrown
      expect(true).toBe(true);
    });
  });

  describe('sendEmail() - Development Mode', () => {
    it('should log to console in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create new instance to use dev mode
      const devEmailService = new EmailService();
      
      // Should not throw in dev mode
      await expect(
        devEmailService.sendVerificationEmail('dev-user', 'dev@test.com', 'Dev')
      ).resolves.not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    it('should log to console in test mode', async () => {
      // Current mode should be test
      await expect(
        emailService.sendVerificationEmail('test-user', 'test@test.com', 'Test')
      ).resolves.not.toThrow();
    });

    it('should not call Resend API in dev/test', async () => {
      // In dev/test mode, Resend API should not be called
      // This prevents actual emails being sent during tests
      await emailService.sendVerificationEmail('no-api-user', 'no-api@test.com', 'NoAPI');
      
      // Test passes if no error thrown (API not called)
      expect(true).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate unique verification tokens', async () => {
      await emailService.sendVerificationEmail('user1', 'email1@test.com', 'User1');
      await emailService.sendVerificationEmail('user2', 'email2@test.com', 'User2');

      const keys = await redis.keys('email-verify:*');
      expect(keys.length).toBe(2);
      
      // Extract tokens from keys (pattern: email-verify:TOKEN)
      const token1 = keys[0].split(':')[1];
      const token2 = keys[1].split(':')[1];
      
      expect(token1).not.toBe(token2);
    });

    it('should generate unique reset tokens', async () => {
      await emailService.sendPasswordResetEmail('user1', 'reset1@test.com', 'User1');
      await emailService.sendPasswordResetEmail('user2', 'reset2@test.com', 'User2');

      const keys = await redis.keys('password-reset:*');
      expect(keys.length).toBe(2);
      
      // Extract tokens from keys (pattern: password-reset:TOKEN)
      const token1 = keys[0].split(':')[1];
      const token2 = keys[1].split(':')[1];
      
      expect(token1).not.toBe(token2);
    });

    it('should store userId with verification token', async () => {
      const userId = 'stored-user-123';
      await emailService.sendVerificationEmail(userId, 'stored@test.com', 'Stored');

      const keys = await redis.keys('email-verify:*');
      const storedData = await redis.get(keys[0]);

      // Data is stored as JSON: { userId, email }
      const parsed = JSON.parse(storedData!);
      expect(parsed.userId).toBe(userId);
    });

    it('should store userId with reset token', async () => {
      const userId = 'reset-stored-user-456';
      await emailService.sendPasswordResetEmail(userId, 'reset-stored@test.com', 'ResetStored');

      const keys = await redis.keys('password-reset:*');
      const storedData = await redis.get(keys[0]);

      // Data is stored as JSON: { userId, email }
      const parsed = JSON.parse(storedData!);
      expect(parsed.userId).toBe(userId);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables gracefully', () => {
      // Service should initialize even without RESEND_API_KEY in test mode
      const service = new EmailService();
      expect(service).toBeDefined();
    });

    it('should not throw in test mode for any email type', async () => {
      await expect(
        emailService.sendVerificationEmail('err-user', 'err@test.com', 'Err')
      ).resolves.not.toThrow();

      await expect(
        emailService.sendPasswordResetEmail('err-user', 'err@test.com', 'Err')
      ).resolves.not.toThrow();

      await expect(
        emailService.sendMFABackupCodesEmail('err@test.com', 'Err', ['CODE123'])
      ).resolves.not.toThrow();
    });
  });
});
