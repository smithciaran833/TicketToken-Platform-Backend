import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NotificationService } from '../../../src/services/notification.service';
import { EmailProvider } from '../../../src/providers/email/email.provider';
import { SMSProvider} from '../../../src/providers/sms/sms.provider';
import { PushProvider } from '../../../src/providers/push/push.provider';
import { db } from '../../../src/config/database';
import axios from 'axios';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/providers/email/email.provider');
jest.mock('../../../src/providers/sms/sms.provider');
jest.mock('../../../src/providers/push/push.provider');
jest.mock('axios');
jest.mock('fs');

const mockDb = db as jest.MockedFunction<any>;
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('NotificationService', () => {
  let service: NotificationService;
  let mockEmailProvider: any;
  let mockSMSProvider: any;
  let mockPushProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock providers
    mockEmailProvider = {
      send: jest.fn().mockResolvedValue({ id: 'email-123', status: 'sent', channel: 'email' })
    };
    
    mockSMSProvider = {
      send: jest.fn().mockResolvedValue({ id: 'sms-123', status: 'sent', channel: 'sms' })
    };
    
    mockPushProvider = {
      send: jest.fn().mockResolvedValue({ id: 'push-123', status: 'sent', channel: 'push' })
    };

    service = new NotificationService();
    (service as any).emailProvider = mockEmailProvider;
    (service as any).smsProvider = mockSMSProvider;
    (service as any).pushProvider = mockPushProvider;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Send Notification Flow', () => {
    it('should send email notification successfully', async () => {
      // Mock consent check
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      // Mock notification storage
      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      // Mock status update
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'order-confirmation',
        priority: 'high' as const,
        data: { orderId: 'order-123' }
      };

      const result = await service.send(request);

      expect(result).toBeDefined();
      expect(result.channel).toBe('email');
      expect(mockEmailProvider.send).toHaveBeenCalled();
    });

    it('should send SMS notification successfully', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          phone: '+1234567890',
          name: 'Test User'
        },
        channel: 'sms' as const,
        type: 'transactional' as const,
        template: 'payment-success',
        priority: 'normal' as const,
        data: { message: 'Payment confirmed' }
      };

      const result = await service.send(request);

      expect(result.channel).toBe('sms');
      expect(mockSMSProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+1234567890'
        })
      );
    });

    it('should send push notification successfully', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: {
          id: 'user-123',
          pushToken: 'token-123',
          name: 'Test User'
        },
        channel: 'push' as const,
        type: 'transactional' as const,
        template: 'event-reminder',
        priority: 'normal' as const,
        data: { 
          title: 'Event Reminder',
          body: 'Your event starts soon'
        }
      };

      const result = await service.send(request);

      expect(result.channel).toBe('push');
      expect(mockPushProvider.send).toHaveBeenCalled();
    });

    it('should throw error for unsupported channel', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'webhook' as any,
        type: 'transactional' as const,
        template: 'test',
        priority: 'normal' as const,
        data: {}
      };

      await expect(service.send(request)).rejects.toThrow('Unsupported channel');
    });
  });

  describe('Consent Checking', () => {
    it('should block marketing notification without consent', async () => {
      // Mock no consent
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      const result = await service.send(request);

      expect(result.status).toBe('queued');
      expect(mockEmailProvider.send).not.toHaveBeenCalled();
    });

    it('should allow transactional notification without consent', async () => {
      // Mock consent check (transactional skips consent)
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const

 request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'order-confirmation',
        priority: 'high' as const,
        data: {}
      };

      await service.send(request);

      expect(mockEmailProvider.send).toHaveBeenCalled();
    });

    it('should allow marketing notification with consent', async () => {
      // Mock consent granted
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true, customer_id: 'user-123' })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'marketing' as const,
        template: 'newsletter',
        priority: 'low' as const,
        data: {}
      };

      await service.send(request);

      expect(mockEmailProvider.send).toHaveBeenCalled();
    });
  });

  describe('Status Tracking', () => {
    it('should store notification record', async () => {
      const insertMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([{ id: 'notif-123' }]);

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: insertMock,
        returning: returningMock
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'test',
        priority: 'normal' as const,
        data: { test: 'data' }
      };

      await service.send(request);

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-123',
          recipient_id: 'user-123',
          channel: 'email',
          type: 'transactional',
          template: 'test',
          priority: 'normal'
        })
      );
    });

    it('should update notification status after sending', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      const updateMock = jest.fn().mockResolvedValue(true);
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: updateMock
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'test',
        priority: 'normal' as const,
        data: {}
      };

      await service.send(request);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sent'
        })
      );
    });

    it('should get notification status', async () => {
      const result = await service.getNotificationStatus('notif-123');

      expect(result).toBe('queued');
    });
  });

  describe('Venue Branding Integration', () => {
    it('should fetch and apply venue branding', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          branding: {
            email_from_name: 'Custom Venue',
            email_reply_to: 'venue@example.com',
            primaryColor: '#FF0000'
          }
        }
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ hide_platform_branding: true })
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'order-confirmation',
        priority: 'normal' as const,
        data: {}
      };

      await service.send(request);

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/branding/venue-123'),
        expect.any(Object)
      );

      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('Custom Venue')
        })
      );
    });

    it('should use default branding when venue branding unavailable', async () => {
      mockAxios.get.mockRejectedValue(new Error('Not found'));

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'order-confirmation',
        priority: 'normal' as const,
        data: {}
      };

      await service.send(request);

      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('TicketToken')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle provider send failure', async () => {
      mockEmailProvider.send.mockRejectedValue(new Error('Provider error'));

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'test',
        priority: 'normal' as const,
        data: {}
      };

      await expect(service.send(request)).rejects.toThrow('Provider error');
    });

    it('should handle missing template', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      const request = {
        venueId: 'venue-123',
        recipientId: 'user-123',
        recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        channel: 'email' as const,
        type: 'transactional' as const,
        template: 'non-existent-template',
        priority: 'normal' as const,
        data: {}
      };

      await expect(service.send(request)).rejects.toThrow('Template not found');
    });
  });

  describe('Batch Operations', () => {
    it('should send multiple notifications successfully', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ granted: true })
      });

      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'notif-123' }])
      });

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      const requests = [
        {
          venueId: 'venue-123',
          recipientId: 'user-1',
          recipient: { id: 'user-1', email: 'user1@example.com', name: 'User 1' },
          channel: 'email' as const,
          type: 'transactional' as const,
          template: 'test',
          priority: 'normal' as const,
          data: {}
        },
        {
          venueId: 'venue-123',
          recipientId: 'user-2',
          recipient: { id: 'user-2', email: 'user2@example.com', name: 'User 2' },
          channel: 'email' as const,
          type: 'transactional' as const,
          template: 'test',
          priority: 'normal' as const,
          data: {}
        }
      ];

      const results = await Promise.all(requests.map(r => service.send(r)));

      expect(results).toHaveLength(2);
      expect(mockEmailProvider.send).toHaveBeenCalledTimes(2);
    });
  });
});
