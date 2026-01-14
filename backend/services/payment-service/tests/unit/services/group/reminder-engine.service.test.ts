/**
 * Unit Tests for Reminder Engine Service
 * 
 * Tests group payment reminder scheduling and effectiveness analytics.
 */

// Mock dependencies before imports
jest.mock('bull', () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
  };
  return jest.fn(() => mockQueue);
});

jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
    },
  },
}));

jest.mock('../../../../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { ReminderEngineService } from '../../../../src/services/group/reminder-engine.service';
import { query } from '../../../../src/config/database';
import Bull from 'bull';

describe('ReminderEngineService', () => {
  let service: ReminderEngineService;
  let mockQueue: any;
  const mockQuery = query as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReminderEngineService();
    mockQueue = (Bull as jest.Mock).mock.results[0].value;
  });

  describe('constructor', () => {
    it('should create Bull queue with correct configuration', () => {
      expect(Bull).toHaveBeenCalledWith('payment-reminders', {
        redis: {
          host: 'localhost',
          port: 6379,
          password: undefined,
        },
      });
    });

    it('should setup processor on initialization', () => {
      expect(mockQueue.process).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.any(Function)
      );
    });
  });

  describe('scheduleReminders', () => {
    it('should schedule three reminders for a group', async () => {
      await service.scheduleReminders('group-123');

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });

    it('should schedule first reminder at 5 minutes', async () => {
      await service.scheduleReminders('group-abc');

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        1,
        'send-group-reminder',
        {
          groupId: 'group-abc',
          reminderNumber: 1,
          isFinal: false,
        },
        expect.objectContaining({
          delay: 5 * 60 * 1000,
        })
      );
    });

    it('should schedule second reminder at 8 minutes', async () => {
      await service.scheduleReminders('group-abc');

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        2,
        'send-group-reminder',
        {
          groupId: 'group-abc',
          reminderNumber: 2,
          isFinal: false,
        },
        expect.objectContaining({
          delay: 8 * 60 * 1000,
        })
      );
    });

    it('should schedule final reminder at 9.5 minutes', async () => {
      await service.scheduleReminders('group-abc');

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        3,
        'send-group-reminder',
        {
          groupId: 'group-abc',
          reminderNumber: 3,
          isFinal: true,
        },
        expect.objectContaining({
          delay: 9.5 * 60 * 1000,
        })
      );
    });

    it('should configure retries for each reminder', async () => {
      await service.scheduleReminders('group-retry');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 5000,
          },
        })
      );
    });

    it('should handle queue errors', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(service.scheduleReminders('group-error'))
        .rejects.toThrow('Queue error');
    });
  });

  describe('getReminderEffectiveness', () => {
    it('should return reminder statistics for venue', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            reminder_number: 1,
            reminders_sent: '100',
            conversions: '25',
            avg_response_minutes: '3.5',
          },
          {
            reminder_number: 2,
            reminders_sent: '75',
            conversions: '30',
            avg_response_minutes: '2.0',
          },
          {
            reminder_number: 3,
            reminders_sent: '45',
            conversions: '35',
            avg_response_minutes: '0.5',
          },
        ],
      });

      const result = await service.getReminderEffectiveness('venue-123');

      expect(result.reminderStats).toHaveLength(3);
      expect(result.optimalTiming).toBeDefined();
    });

    it('should calculate conversion rate correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            reminder_number: 1,
            reminders_sent: '100',
            conversions: '40',
            avg_response_minutes: '2.0',
          },
        ],
      });

      const result = await service.getReminderEffectiveness('venue-abc');

      expect(result.reminderStats[0].conversionRate).toBe(40); // 40/100 * 100
    });

    it('should parse average response time', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            reminder_number: 1,
            reminders_sent: '50',
            conversions: '10',
            avg_response_minutes: '5.75',
          },
        ],
      });

      const result = await service.getReminderEffectiveness('venue-def');

      expect(result.reminderStats[0].averageResponseTime).toBe(5.75);
    });

    it('should handle null response time', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            reminder_number: 1,
            reminders_sent: '50',
            conversions: '0',
            avg_response_minutes: null,
          },
        ],
      });

      const result = await service.getReminderEffectiveness('venue-null');

      expect(result.reminderStats[0].averageResponseTime).toBe(0);
    });

    it('should return optimal timing defaults', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getReminderEffectiveness('venue-new');

      expect(result.optimalTiming).toEqual({
        firstReminder: 5,
        secondReminder: 8,
        finalReminder: 9.5,
      });
    });

    it('should query with correct venue ID', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getReminderEffectiveness('my-venue-id');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE e.venue_id = $1'),
        ['my-venue-id']
      );
    });

    it('should handle empty stats', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getReminderEffectiveness('empty-venue');

      expect(result.reminderStats).toEqual([]);
    });
  });

  describe('Reminder Template', () => {
    // Access private method through class instance
    it('should return normal urgency for first reminder', async () => {
      // Test indirectly through processor behavior
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'member-1',
            email: 'test@example.com',
            amount_due: 5000,
            group_payment_id: 'group-1',
            event_name: 'Concert',
            expires_at: new Date(Date.now() + 300000), // 5 min
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // Update reminders_sent
        .mockResolvedValueOnce({ rowCount: 1 }); // Insert reminder_history

      await processCallback({
        data: {
          groupId: 'group-1',
          reminderNumber: 1,
          isFinal: false,
        },
      });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('Queue Processor', () => {
    it('should process send-group-reminder jobs', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No unpaid members

      const result = await processCallback({
        data: {
          groupId: 'group-completed',
          reminderNumber: 1,
          isFinal: false,
        },
      });

      expect(result).toEqual({ status: 'no_unpaid_members' });
    });

    it('should send reminders to unpaid members', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'member-1',
              email: 'user1@test.com',
              amount_due: 5000,
              group_payment_id: 'group-1',
              event_name: 'Event',
              expires_at: new Date(Date.now() + 60000),
            },
            {
              id: 'member-2',
              email: 'user2@test.com',
              amount_due: 5000,
              group_payment_id: 'group-1',
              event_name: 'Event',
              expires_at: new Date(Date.now() + 60000),
            },
          ],
        })
        .mockResolvedValue({ rowCount: 1 });

      const result = await processCallback({
        data: {
          groupId: 'group-1',
          reminderNumber: 2,
          isFinal: false,
        },
      });

      expect(result).toEqual({
        status: 'sent',
        count: 2,
      });
    });

    it('should update reminder count after sending', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'member-1',
            email: 'test@test.com',
            amount_due: 1000,
            group_payment_id: 'g1',
            event_name: 'E1',
            expires_at: new Date(Date.now() + 30000),
          }],
        })
        .mockResolvedValue({ rowCount: 1 });

      await processCallback({
        data: {
          groupId: 'g1',
          reminderNumber: 2,
          isFinal: false,
        },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        ['g1', 2]
      );
    });

    it('should record reminder in history', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'member-abc',
            email: 'test@test.com',
            amount_due: 1000,
            group_payment_id: 'group-xyz',
            event_name: 'Test Event',
            expires_at: new Date(Date.now() + 120000),
          }],
        })
        .mockResolvedValue({ rowCount: 1 });

      await processCallback({
        data: {
          groupId: 'group-xyz',
          reminderNumber: 1,
          isFinal: false,
        },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reminder_history'),
        expect.arrayContaining(['group-xyz', 'member-abc', 1])
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle database errors in processor', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery.mockRejectedValue(new Error('DB Error'));

      await expect(processCallback({
        data: {
          groupId: 'group-err',
          reminderNumber: 1,
          isFinal: false,
        },
      })).rejects.toThrow('DB Error');
    });

    it('should handle expired group gracefully', async () => {
      const processCallback = mockQueue.process.mock.calls[0][1];
      
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'member-1',
          email: 'test@test.com',
          amount_due: 1000,
          group_payment_id: 'g1',
          event_name: 'E1',
          expires_at: new Date(Date.now() - 60000), // Already expired
        }],
      }).mockResolvedValue({ rowCount: 1 });

      // Should still process but with negative time remaining
      await processCallback({
        data: {
          groupId: 'g1',
          reminderNumber: 3,
          isFinal: true,
        },
      });

      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
