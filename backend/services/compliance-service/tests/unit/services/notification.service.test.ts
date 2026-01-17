/**
 * Unit Tests for Notification Service
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock database service before imports
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn<any>().mockResolvedValue({ rows: [], rowCount: 0 })
  }
}));

describe('NotificationService', () => {
  let db: any;
  let NotificationService: any;
  let notificationService: any;
  let consoleSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Get mocked db
    const dbModule = await import('../../../src/services/database.service');
    db = dbModule.db;

    // Import service after mocking
    const module = await import('../../../src/services/notification.service');
    NotificationService = module.NotificationService;
    notificationService = module.notificationService;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should log email details', async () => {
      await notificationService.sendEmail(
        'user@example.com',
        'Test Subject',
        'test-template',
        { key: 'value' }
      );

      expect(consoleSpy).toHaveBeenCalledWith('📧 Email sent to user@example.com: Test Subject');
      expect(consoleSpy).toHaveBeenCalledWith('   Template: test-template');
      expect(consoleSpy).toHaveBeenCalledWith('   Data:', { key: 'value' });
    });

    it('should insert notification log into database', async () => {
      await notificationService.sendEmail(
        'user@example.com',
        'Test Subject',
        'test-template',
        { key: 'value' }
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_log'),
        ['user@example.com', 'Test Subject', 'test-template']
      );
    });

    it('should handle complex template data', async () => {
      const complexData = {
        user: { id: '123', name: 'Test User' },
        items: [1, 2, 3],
        nested: { deep: { value: true } }
      };

      await notificationService.sendEmail(
        'user@example.com',
        'Complex Email',
        'complex-template',
        complexData
      );

      expect(consoleSpy).toHaveBeenCalledWith('   Data:', complexData);
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('Database error'));

      await expect(
        notificationService.sendEmail('user@example.com', 'Test', 'template', {})
      ).rejects.toThrow('Database error');
    });
  });

  describe('sendSMS', () => {
    it('should log SMS details', async () => {
      await notificationService.sendSMS('+1234567890', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('📱 SMS sent to +1234567890: Test message');
    });

    it('should insert notification log into database', async () => {
      await notificationService.sendSMS('+1234567890', 'Test message');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_log'),
        ['+1234567890', 'Test message']
      );
    });

    it('should handle long messages', async () => {
      const longMessage = 'A'.repeat(500);

      await notificationService.sendSMS('+1234567890', longMessage);

      expect(db.query).toHaveBeenCalledWith(
        expect.anything(),
        ['+1234567890', longMessage]
      );
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('Connection lost'));

      await expect(
        notificationService.sendSMS('+1234567890', 'Test')
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('notifyThresholdReached', () => {
    it('should send email when venue found', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({
          rows: [{ business_name: 'Test Venue', venue_id: 'venue-123' }],
          rowCount: 1
        })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      await notificationService.notifyThresholdReached('venue-123', 75000);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM venue_verifications WHERE venue_id = $1',
        ['venue-123']
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1099-K Threshold Reached')
      );
    });

    it('should not send email when venue not found', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });

      await notificationService.notifyThresholdReached('nonexistent-venue', 75000);

      // Only the SELECT query should be called, not the INSERT for notification
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should include correct threshold data in email', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({
          rows: [{ business_name: 'My Business', venue_id: 'v-1' }],
          rowCount: 1
        })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      await notificationService.notifyThresholdReached('v-1', 100000);

      expect(consoleSpy).toHaveBeenCalledWith('   Data:', {
        businessName: 'My Business',
        amount: 100000,
        threshold: 600,
        action: 'Please ensure your W-9 is up to date'
      });
    });
  });

  describe('notifyVerificationStatus', () => {
    beforeEach(() => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 1 });
    });

    it('should send approved notification', async () => {
      await notificationService.notifyVerificationStatus('venue-123', 'approved');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Verification approved')
      );
      expect(consoleSpy).toHaveBeenCalledWith('   Template: verification-approved');
    });

    it('should send rejected notification', async () => {
      await notificationService.notifyVerificationStatus('venue-123', 'rejected');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Verification rejected')
      );
      expect(consoleSpy).toHaveBeenCalledWith('   Template: verification-rejected');
    });

    it('should send needs_info notification', async () => {
      await notificationService.notifyVerificationStatus('venue-123', 'needs_info');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Verification needs_info')
      );
      expect(consoleSpy).toHaveBeenCalledWith('   Template: verification-needs-info');
    });

    it('should include venueId and status in data', async () => {
      await notificationService.notifyVerificationStatus('venue-456', 'approved');

      expect(consoleSpy).toHaveBeenCalledWith('   Data:', {
        venueId: 'venue-456',
        status: 'approved'
      });
    });
  });

  describe('exported singleton', () => {
    it('should export notificationService instance', () => {
      expect(notificationService).toBeDefined();
      expect(notificationService.sendEmail).toBeInstanceOf(Function);
      expect(notificationService.sendSMS).toBeInstanceOf(Function);
      expect(notificationService.notifyThresholdReached).toBeInstanceOf(Function);
      expect(notificationService.notifyVerificationStatus).toBeInstanceOf(Function);
    });
  });
});
