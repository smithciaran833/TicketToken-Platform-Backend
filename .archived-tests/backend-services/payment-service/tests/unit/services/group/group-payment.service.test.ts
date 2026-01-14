import { GroupPaymentService } from '../../../../src/services/group/group-payment.service';
import { GroupPaymentStatus } from '../../../../src/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const mockGetClient = jest.fn().mockResolvedValue({
  client: mockClient,
  release: mockClient.release
});

jest.mock('../../../../src/config/database', () => ({
  getClient: () => mockGetClient(),
  query: jest.fn()
}));

// Mock Bull
const mockQueue = {
  add: jest.fn(),
  process: jest.fn()
};

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => mockQueue);
});

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';

describe('GroupPaymentService', () => {
  let service: GroupPaymentService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new GroupPaymentService();
  });

  describe('createGroupPayment', () => {
    it('should create group payment with correct calculations', async () => {
      const ticketSelections = [
        { ticketTypeId: 'type_1', price: 10000, quantity: 4 } // $100 each, 4 tickets = $400 total
      ];

      const members = [
        { email: 'user1@test.com', name: 'User 1', ticketCount: 2 },
        { email: 'user2@test.com', name: 'User 2', ticketCount: 2 }
      ];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ // INSERT group
          rows: [{
            id: 'group_1',
            organizer_id: 'organizer_1',
            total_amount: 40000,
            status: GroupPaymentStatus.COLLECTING
          }]
        })
        .mockResolvedValueOnce({ // INSERT member 1
          rows: [{
            id: 'member_1',
            amount_due: 20000 // $200 (2 tickets @ $100 each)
          }]
        })
        .mockResolvedValueOnce({ // INSERT member 2
          rows: [{
            id: 'member_2',
            amount_due: 20000
          }]
        })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createGroupPayment(
        'organizer_1',
        'event_1',
        ticketSelections,
        members
      );

      expect(result.total_amount).toBe(40000);
      expect(result.members[0].amount_due).toBe(20000);
      expect(result.members[1].amount_due).toBe(20000);
    });

    it('should schedule expiry check', async () => {
      const ticketSelections = [
        { ticketTypeId: 'type_1', price: 10000, quantity: 2 }
      ];

      const members = [
        { email: 'user1@test.com', name: 'User 1', ticketCount: 1 },
        { email: 'user2@test.com', name: 'User 2', ticketCount: 1 }
      ];

      mockClient.query.mockResolvedValue({ rows: [{ id: 'group_1' }] });

      await service.createGroupPayment(
        'organizer_1',
        'event_1',
        ticketSelections,
        members
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-expiry',
        { groupId: 'mock-uuid' },
        { delay: 10 * 60 * 1000 }
      );
    });

    it('should handle uneven ticket distribution', async () => {
      const ticketSelections = [
        { ticketTypeId: 'type_1', price: 10000, quantity: 5 } // $500 total, 5 tickets
      ];

      const members = [
        { email: 'user1@test.com', name: 'User 1', ticketCount: 3 }, // $300
        { email: 'user2@test.com', name: 'User 2', ticketCount: 2 }  // $200
      ];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'group_1', total_amount: 50000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'member_1', amount_due: 30000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'member_2', amount_due: 20000 }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createGroupPayment(
        'organizer_1',
        'event_1',
        ticketSelections,
        members
      );

      expect(result.members[0].amount_due).toBe(30000);
      expect(result.members[1].amount_due).toBe(20000);
    });

    it('should rollback on error', async () => {
      const ticketSelections = [{ ticketTypeId: 'type_1', price: 10000, quantity: 2 }];
      const members = [{ email: 'user1@test.com', name: 'User 1', ticketCount: 2 }];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        service.createGroupPayment('organizer_1', 'event_1', ticketSelections, members)
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('recordMemberPayment', () => {
    it('should record member payment successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ // GET member
          rows: [{
            id: 'member_1',
            paid: false,
            amount_due: 20000
          }]
        })
        .mockResolvedValueOnce({}) // UPDATE member
        .mockResolvedValueOnce({ rows: [{ unpaid: 1 }] }) // Status check (still unpaid members)
        .mockResolvedValueOnce({}); // COMMIT

      await service.recordMemberPayment('group_1', 'member_1', 'pm_mock');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        expect.any(Array)
      );
    });

    it('should throw error if member already paid', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ // GET member (already paid)
          rows: [{
            id: 'member_1',
            paid: true
          }]
        });

      await expect(
        service.recordMemberPayment('group_1', 'member_1', 'pm_mock')
      ).rejects.toThrow('Member already paid');
    });

    it('should complete group when all members paid', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'member_1', paid: false }] })
        .mockResolvedValueOnce({}) // UPDATE member
        .mockResolvedValueOnce({ rows: [{ unpaid: 0 }] }) // All paid!
        .mockResolvedValueOnce({}) // UPDATE group status
        .mockResolvedValueOnce({}); // COMMIT

      // Mock getGroupPayment for completePurchase
      mockQuery.mockResolvedValue({ rows: [{ id: 'group_1', totalAmount: 40000 }] });

      await service.recordMemberPayment('group_1', 'member_1', 'pm_mock');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payments'),
        ['group_1', GroupPaymentStatus.COMPLETED]
      );
    });

    it('should throw error if member not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Member not found

      await expect(
        service.recordMemberPayment('group_1', 'invalid_member', 'pm_mock')
      ).rejects.toThrow('Member not found');
    });
  });

  describe('sendReminders', () => {
    it('should send reminders to unpaid members', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'member_1', email: 'user1@test.com', name: 'User 1', amountDue: 20000, remindersSent: 0 },
          { id: 'member_2', email: 'user2@test.com', name: 'User 2', amountDue: 20000, remindersSent: 0 }
        ]
      });

      await service.sendReminders('group_1');

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        expect.any(Array)
      );
    });

    it('should not send more than 3 reminders', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'member_1', email: 'user1@test.com', remindersSent: 3 }
        ]
      });

      await service.sendReminders('group_1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle empty unpaid members list', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.sendReminders('group_1');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('handleExpiredGroup', () => {
    it('should cancel group when no one paid', async () => {
      mockQuery
        .mockResolvedValueOnce({ // Get group
          rows: [{
            id: 'group_1',
            status: GroupPaymentStatus.COLLECTING
          }]
        })
        .mockResolvedValueOnce({ // Get members
          rows: [
            { id: 'member_1', paid: false },
            { id: 'member_2', paid: false }
          ]
        })
        .mockResolvedValueOnce({}); // Cancel query

      mockClient.query.mockResolvedValue({});

      await service.handleExpiredGroup('group_1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payments'),
        expect.arrayContaining(['group_1', GroupPaymentStatus.CANCELLED])
      );
    });

    it('should process partial group when some paid', async () => {
      mockQuery
        .mockResolvedValueOnce({ // Get group
          rows: [{
            id: 'group_1',
            status: GroupPaymentStatus.COLLECTING
          }]
        })
        .mockResolvedValueOnce({ // Get members
          rows: [
            { id: 'member_1', paid: true },
            { id: 'member_2', paid: false }
          ]
        })
        .mockResolvedValueOnce({}); // Partial status update

      mockClient.query.mockResolvedValue({});

      await service.handleExpiredGroup('group_1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payments'),
        expect.arrayContaining(['group_1', GroupPaymentStatus.PARTIALLY_PAID])
      );
    });

    it('should skip if group already processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'group_1',
          status: GroupPaymentStatus.COMPLETED // Already completed
        }]
      });

      mockClient.query.mockResolvedValue({});

      await service.handleExpiredGroup('group_1');

      // Should not call any update queries
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getGroupStatus', () => {
    it('should calculate group status correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ // Get group
          rows: [{
            id: 'group_1',
            totalAmount: 40000
          }]
        })
        .mockResolvedValueOnce({ // Get members
          rows: [
            { id: 'member_1', paid: true, amountDue: 20000 },
            { id: 'member_2', paid: false, amountDue: 20000 }
          ]
        });

      const result = await service.getGroupStatus('group_1');

      expect(result.summary.totalMembers).toBe(2);
      expect(result.summary.paidMembers).toBe(1);
      expect(result.summary.totalExpected).toBe(40000);
      expect(result.summary.totalCollected).toBe(20000);
      expect(result.summary.percentageCollected).toBe(50);
    });

    it('should handle fully paid group', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'group_1', totalAmount: 40000 }]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'member_1', paid: true, amountDue: 20000 },
            { id: 'member_2', paid: true, amountDue: 20000 }
          ]
        });

      const result = await service.getGroupStatus('group_1');

      expect(result.summary.paidMembers).toBe(2);
      expect(result.summary.percentageCollected).toBe(100);
    });

    it('should handle no payments yet', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'group_1', totalAmount: 40000 }]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'member_1', paid: false, amountDue: 20000 },
            { id: 'member_2', paid: false, amountDue: 20000 }
          ]
        });

      const result = await service.getGroupStatus('group_1');

      expect(result.summary.paidMembers).toBe(0);
      expect(result.summary.totalCollected).toBe(0);
      expect(result.summary.percentageCollected).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single member group', async () => {
      const ticketSelections = [
        { ticketTypeId: 'type_1', price: 10000, quantity: 1 }
      ];

      const members = [
        { email: 'user1@test.com', name: 'User 1', ticketCount: 1 }
      ];

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'group_1', total_amount: 10000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'member_1', amount_due: 10000 }] })
        .mockResolvedValueOnce({});

      const result = await service.createGroupPayment(
        'organizer_1',
        'event_1',
        ticketSelections,
        members
      );

      expect(result.members).toHaveLength(1);
      expect(result.members[0].amount_due).toBe(10000);
    });

    it('should handle large groups', async () => {
      const ticketSelections = [
        { ticketTypeId: 'type_1', price: 10000, quantity: 20 }
      ];

      const members = Array(20).fill(null).map((_, i) => ({
        email: `user${i}@test.com`,
        name: `User ${i}`,
        ticketCount: 1
      }));

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'group_1', total_amount: 200000 }] });

      // Mock individual member inserts
      for (let i = 0; i < 20; i++) {
        mockClient.query.mockResolvedValueOnce({
          rows: [{ id: `member_${i}`, amount_due: 10000 }]
        });
      }

      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const result = await service.createGroupPayment(
        'organizer_1',
        'event_1',
        ticketSelections,
        members
      );

      expect(result.members).toHaveLength(20);
    });
  });
});
