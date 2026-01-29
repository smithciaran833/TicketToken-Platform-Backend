/**
 * COMPONENT TEST: ReminderEngineService
 *
 * Tests group payment reminder scheduling and sending
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

// Mock Bull
const mockAdd = jest.fn().mockResolvedValue({ id: 'job_123' });
const mockProcess = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: mockAdd,
    process: mockProcess,
  }));
});

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: { host: 'localhost', port: 6379, password: '' },
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

import { ReminderEngineService } from '../../../../src/services/group/reminder-engine.service';

describe('ReminderEngineService Component Tests', () => {
  let service: ReminderEngineService;
  let groupId: string;
  let venueId: string;

  beforeEach(() => {
    groupId = uuidv4();
    venueId = uuidv4();
    mockQuery.mockReset();
    mockAdd.mockClear();
    service = new ReminderEngineService();
  });

  // ===========================================================================
  // SCHEDULE REMINDERS
  // ===========================================================================
  describe('scheduleReminders()', () => {
    it('should schedule 3 reminders', async () => {
      await service.scheduleReminders(groupId);

      expect(mockAdd).toHaveBeenCalledTimes(3);
    });

    it('should schedule first reminder at 5 minutes', async () => {
      await service.scheduleReminders(groupId);

      expect(mockAdd).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.objectContaining({ groupId, reminderNumber: 1, isFinal: false }),
        expect.objectContaining({ delay: 5 * 60 * 1000 })
      );
    });

    it('should schedule second reminder at 8 minutes', async () => {
      await service.scheduleReminders(groupId);

      expect(mockAdd).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.objectContaining({ groupId, reminderNumber: 2, isFinal: false }),
        expect.objectContaining({ delay: 8 * 60 * 1000 })
      );
    });

    it('should schedule final reminder at 9.5 minutes', async () => {
      await service.scheduleReminders(groupId);

      expect(mockAdd).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.objectContaining({ groupId, reminderNumber: 3, isFinal: true }),
        expect.objectContaining({ delay: 9.5 * 60 * 1000 })
      );
    });

    it('should configure retry attempts', async () => {
      await service.scheduleReminders(groupId);

      expect(mockAdd).toHaveBeenCalledWith(
        'send-group-reminder',
        expect.any(Object),
        expect.objectContaining({ attempts: 3 })
      );
    });
  });

  // ===========================================================================
  // GET REMINDER EFFECTIVENESS
  // ===========================================================================
  describe('getReminderEffectiveness()', () => {
    it('should return reminder stats and optimal timing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { reminder_number: 1, reminders_sent: '100', conversions: '20', avg_response_minutes: '2.5' },
          { reminder_number: 2, reminders_sent: '80', conversions: '30', avg_response_minutes: '1.5' },
          { reminder_number: 3, reminders_sent: '50', conversions: '40', avg_response_minutes: '0.5' },
        ]
      });

      const result = await service.getReminderEffectiveness(venueId);

      expect(result.reminderStats).toHaveLength(3);
      expect(result.reminderStats[0].conversionRate).toBe(20);
      expect(result.reminderStats[1].conversionRate).toBe(37.5);
      expect(result.reminderStats[2].conversionRate).toBe(80);
      expect(result.optimalTiming).toBeDefined();
    });

    it('should query by venue ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getReminderEffectiveness(venueId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.venue_id = $1'),
        [venueId]
      );
    });

    it('should return default optimal timing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getReminderEffectiveness(venueId);

      expect(result.optimalTiming.firstReminder).toBe(5);
      expect(result.optimalTiming.secondReminder).toBe(8);
      expect(result.optimalTiming.finalReminder).toBe(9.5);
    });
  });
});
