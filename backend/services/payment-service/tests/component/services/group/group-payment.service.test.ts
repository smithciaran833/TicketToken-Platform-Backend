/**
 * COMPONENT TEST: GroupPaymentService
 *
 * Tests group payment creation and management
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
  getClient: jest.fn().mockResolvedValue({
    client: {
      query: mockClientQuery,
    },
    release: mockClientRelease,
  }),
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

import { GroupPaymentService } from '../../../../src/services/group/group-payment.service';
import { GroupPaymentStatus } from '../../../../src/types';

describe('GroupPaymentService Component Tests', () => {
  let service: GroupPaymentService;
  let organizerId: string;
  let eventId: string;
  let groupId: string;

  beforeEach(() => {
    organizerId = uuidv4();
    eventId = uuidv4();
    groupId = uuidv4();
    
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockAdd.mockClear();

    service = new GroupPaymentService();
  });

  // ===========================================================================
  // CREATE GROUP PAYMENT
  // ===========================================================================
  describe('createGroupPayment()', () => {
    beforeEach(() => {
      // Setup transaction mocks
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ 
          rows: [{
            id: groupId,
            organizer_id: organizerId,
            event_id: eventId,
            total_amount: 10000,
            status: 'collecting',
          }]
        }) // INSERT group
        .mockResolvedValueOnce({ rows: [{ id: uuidv4(), name: 'John', email: 'john@test.com', amount_due: 5000 }] }) // INSERT member 1
        .mockResolvedValueOnce({ rows: [{ id: uuidv4(), name: 'Jane', email: 'jane@test.com', amount_due: 5000 }] }) // INSERT member 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should create group payment with members', async () => {
      const result = await service.createGroupPayment(
        organizerId,
        eventId,
        [{ ticketTypeId: 'tt_1', price: 5000, quantity: 2 }],
        [
          { email: 'john@test.com', name: 'John', ticketCount: 1 },
          { email: 'jane@test.com', name: 'Jane', ticketCount: 1 },
        ]
      );

      expect(result.id).toBeDefined();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should calculate total amount from ticket selections', async () => {
      await service.createGroupPayment(
        organizerId,
        eventId,
        [
          { ticketTypeId: 'tt_1', price: 5000, quantity: 2 },
          { ticketTypeId: 'tt_2', price: 3000, quantity: 1 },
        ],
        [{ email: 'john@test.com', name: 'John', ticketCount: 3 }]
      );

      // Total = (5000 * 2) + (3000 * 1) = 13000
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO group_payments'),
        expect.arrayContaining([13000])
      );
    });

    it('should schedule expiry check', async () => {
      await service.createGroupPayment(
        organizerId,
        eventId,
        [{ ticketTypeId: 'tt_1', price: 5000, quantity: 1 }],
        [{ email: 'john@test.com', name: 'John', ticketCount: 1 }]
      );

      expect(mockAdd).toHaveBeenCalledWith(
        'check-expiry',
        expect.objectContaining({ groupId: expect.any(String) }),
        expect.objectContaining({ delay: 10 * 60 * 1000 })
      );
    });

    it('should rollback on error', async () => {
      mockClientQuery.mockReset();
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')) // INSERT fails
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(service.createGroupPayment(
        organizerId,
        eventId,
        [{ ticketTypeId: 'tt_1', price: 5000, quantity: 1 }],
        [{ email: 'john@test.com', name: 'John', ticketCount: 1 }]
      )).rejects.toThrow('DB error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ===========================================================================
  // RECORD MEMBER PAYMENT
  // ===========================================================================
  describe('recordMemberPayment()', () => {
    const memberId = uuidv4();

    beforeEach(() => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: memberId, amount_due: 5000, paid: false, email: 'john@test.com', name: 'John' }] }) // SELECT member
        .mockResolvedValueOnce({ rows: [] }) // UPDATE member
        .mockResolvedValueOnce({ rows: [{ unpaid: '1' }] }) // Check unpaid count
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should record member payment', async () => {
      await service.recordMemberPayment(groupId, memberId, 'pm_123');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        expect.arrayContaining([memberId, groupId])
      );
    });

    it('should reject already paid member', async () => {
      mockClientQuery
        .mockReset()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: memberId, paid: true }] }) // SELECT - already paid
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(service.recordMemberPayment(groupId, memberId, 'pm_123'))
        .rejects.toThrow('Member already paid');
    });

    it('should complete group when all members paid', async () => {
      mockClientQuery.mockReset();
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: memberId, amount_due: 5000, paid: false, email: 'john@test.com', name: 'John' }] }) // SELECT member
        .mockResolvedValueOnce({ rows: [] }) // UPDATE member paid
        .mockResolvedValueOnce({ rows: [{ unpaid: '0' }] }) // No unpaid members
        .mockResolvedValueOnce({ rows: [] }) // UPDATE group status to completed
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock query for getGroupPaymentInternal called by completePurchase
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: groupId, total_amount: 5000, ticket_selections: '[]' }] }) // SELECT group
        .mockResolvedValueOnce({ rows: [] }); // SELECT members

      await service.recordMemberPayment(groupId, memberId, 'pm_123');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        expect.arrayContaining([groupId, GroupPaymentStatus.COMPLETED])
      );
    });
  });

  // ===========================================================================
  // SEND REMINDERS
  // ===========================================================================
  describe('sendReminders()', () => {
    it('should queue reminders for unpaid members', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: uuidv4(), email: 'john@test.com', name: 'John', amountDue: 5000, remindersSent: 0 },
          { id: uuidv4(), email: 'jane@test.com', name: 'Jane', amountDue: 5000, remindersSent: 1 },
        ]
      });
      mockQuery.mockResolvedValue({ rows: [] }); // UPDATE reminders_sent

      await service.sendReminders(groupId);

      expect(mockAdd).toHaveBeenCalledWith(
        'send-reminder',
        expect.objectContaining({ groupId })
      );
    });

    it('should not send reminder if max reached', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: uuidv4(), email: 'john@test.com', name: 'John', remindersSent: 3 }, // Max reached
        ]
      });

      await service.sendReminders(groupId);

      expect(mockAdd).not.toHaveBeenCalledWith('send-reminder', expect.any(Object));
    });
  });

  // ===========================================================================
  // GET GROUP PAYMENT
  // ===========================================================================
  describe('getGroupPayment()', () => {
    it('should return group payment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: groupId,
          organizer_id: organizerId,
          event_id: eventId,
          total_amount: '10000',
          status: 'collecting',
          expires_at: new Date(),
          created_at: new Date(),
        }]
      });

      const result = await service.getGroupPayment(groupId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(groupId);
      expect(result!.totalAmount).toBe(10000);
    });

    it('should return null for non-existent group', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getGroupPayment('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // GET GROUP STATUS
  // ===========================================================================
  describe('getGroupStatus()', () => {
    it('should return group with summary', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: groupId,
            total_amount: 10000,
            status: 'collecting',
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: uuidv4(), paid: true, amount_due: 5000 },
            { id: uuidv4(), paid: false, amount_due: 5000 },
          ]
        });

      const result = await service.getGroupStatus(groupId);

      expect(result.summary.totalMembers).toBe(2);
      expect(result.summary.paidMembers).toBe(1);
      expect(result.summary.totalCollected).toBe(5000);
      expect(result.summary.percentageCollected).toBe(50);
    });
  });
});
