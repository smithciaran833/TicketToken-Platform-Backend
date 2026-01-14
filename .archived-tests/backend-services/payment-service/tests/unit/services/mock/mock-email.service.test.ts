import { MockEmailService } from '../../../../src/services/mock/mock-email.service';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('MockEmailService', () => {
  let mockEmailService: MockEmailService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockEmailService = new MockEmailService();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ===========================================================================
  // sendEmail() - 8 test cases
  // ===========================================================================

  describe('sendEmail()', () => {
    it('should send email with correct parameters', async () => {
      const result = await mockEmailService.sendEmail(
        'test@example.com',
        'Test Subject',
        'Test Body'
      );

      expect(result.to).toBe('test@example.com');
      expect(result.subject).toBe('Test Subject');
      expect(result.status).toBe('sent');
    });

    it('should return email with generated id', async () => {
      const result = await mockEmailService.sendEmail(
        'user@test.com',
        'Subject',
        'Body'
      );

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^email_\d+$/);
    });

    it('should mark email as mock data', async () => {
      const result = await mockEmailService.sendEmail(
        'test@example.com',
        'Subject',
        'Body'
      );

      expect(result.mockData).toBe(true);
    });

    it('should log email details to console', async () => {
      await mockEmailService.sendEmail(
        'test@example.com',
        'Test Subject',
        'Test Body'
      );

      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('Mock Email Sent');
      expect(logOutput).toContain('test@example.com');
      expect(logOutput).toContain('Test Subject');
      expect(logOutput).toContain('Test Body');
    });

    it('should include timestamp in log', async () => {
      await mockEmailService.sendEmail('test@test.com', 'Subject', 'Body');

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('Timestamp:');
    });

    it('should return status as sent', async () => {
      const result = await mockEmailService.sendEmail(
        'test@example.com',
        'Subject',
        'Body'
      );

      expect(result.status).toBe('sent');
    });

    it('should handle empty body', async () => {
      const result = await mockEmailService.sendEmail(
        'test@example.com',
        'Subject',
        ''
      );

      expect(result.to).toBe('test@example.com');
      expect(result.subject).toBe('Subject');
      expect(result.status).toBe('sent');
    });

    it('should generate unique email ids', async () => {
      const result1 = await mockEmailService.sendEmail('test1@test.com', 'Sub1', 'Body1');
      const result2 = await mockEmailService.sendEmail('test2@test.com', 'Sub2', 'Body2');

      expect(result1.id).not.toBe(result2.id);
    });
  });

  // ===========================================================================
  // sendGroupPaymentInvite() - 7 test cases
  // ===========================================================================

  describe('sendGroupPaymentInvite()', () => {
    it('should send group payment invite email', async () => {
      const result = await mockEmailService.sendGroupPaymentInvite(
        'member@example.com',
        'group-123',
        50.00
      );

      expect(result.to).toBe('member@example.com');
      expect(result.status).toBe('sent');
    });

    it('should use correct subject for group payment', async () => {
      const result = await mockEmailService.sendGroupPaymentInvite(
        'user@test.com',
        'group-456',
        100
      );

      expect(result.subject).toBe('You have been invited to a group payment');
    });

    it('should include amount in email body', async () => {
      await mockEmailService.sendGroupPaymentInvite(
        'user@test.com',
        'group-789',
        75.50
      );

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('$75.5');
    });

    it('should include group link in email body', async () => {
      await mockEmailService.sendGroupPaymentInvite(
        'user@test.com',
        'group-abc',
        25
      );

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('http://localhost:3000/group/group-abc');
    });

    it('should return email result with id', async () => {
      const result = await mockEmailService.sendGroupPaymentInvite(
        'test@test.com',
        'group-123',
        100
      );

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^email_\d+$/);
    });

    it('should mark as mock data', async () => {
      const result = await mockEmailService.sendGroupPaymentInvite(
        'test@test.com',
        'group-123',
        100
      );

      expect(result.mockData).toBe(true);
    });

    it('should format amount correctly in body', async () => {
      await mockEmailService.sendGroupPaymentInvite(
        'user@test.com',
        'group-123',
        150.75
      );

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('Please pay $150.75');
    });
  });
});
