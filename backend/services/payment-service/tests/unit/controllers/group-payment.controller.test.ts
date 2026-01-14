/**
 * Unit Tests for Group Payment Controller
 * 
 * Tests group payment endpoints including create, contribute, status, and reminders.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}));

jest.mock('../../../src/services/group', () => ({
  GroupPaymentService: jest.fn().mockImplementation(() => ({
    createGroupPayment: jest.fn(),
    recordMemberPayment: jest.fn(),
    getGroupStatus: jest.fn(),
    sendReminders: jest.fn(),
  })),
  ContributionTrackerService: jest.fn().mockImplementation(() => ({
    getContributionHistory: jest.fn(),
    trackContribution: jest.fn(),
  })),
}));

import { GroupPaymentController } from '../../../src/controllers/group-payment.controller';

describe('GroupPaymentController', () => {
  let controller: GroupPaymentController;
  let mockGroupPaymentService: any;
  let mockContributionTracker: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GroupPaymentController();
    // Access the mocked services through the controller
    mockGroupPaymentService = (controller as any).groupPaymentService;
    mockContributionTracker = (controller as any).contributionTracker;
  });

  describe('createGroup', () => {
    it('should create a group payment successfully', async () => {
      const request = createMockRequest({
        body: {
          eventId: 'event-123',
          ticketSelections: [
            { ticketTypeId: 'type-1', quantity: 2, price: 5000 },
            { ticketTypeId: 'type-2', quantity: 1, price: 7500 },
          ],
          members: [
            { email: 'member1@example.com', amountDue: 5000 },
            { email: 'member2@example.com', amountDue: 5000 },
            { email: 'member3@example.com', amountDue: 7500 },
          ],
        },
        user: {
          id: 'organizer-123',
          userId: 'organizer-123',
          tenantId: 'tenant-abc',
          roles: ['user'],
        },
      });
      const reply = createMockReply();

      const mockGroupPayment = {
        id: 'group-payment-123',
        organizerId: 'organizer-123',
        eventId: 'event-123',
        totalAmount: 17500,
        status: 'pending',
        members: [
          { id: 'member-1', email: 'member1@example.com', amountDue: 5000, paid: false },
          { id: 'member-2', email: 'member2@example.com', amountDue: 5000, paid: false },
          { id: 'member-3', email: 'member3@example.com', amountDue: 7500, paid: false },
        ],
      };

      mockGroupPaymentService.createGroupPayment.mockResolvedValue(mockGroupPayment);

      await controller.createGroup(request, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          groupPayment: mockGroupPayment,
          paymentLinks: expect.arrayContaining([
            expect.objectContaining({
              memberId: 'member-1',
              email: 'member1@example.com',
              amount: 5000,
            }),
          ]),
        })
      );
      expect(mockGroupPaymentService.createGroupPayment).toHaveBeenCalledWith(
        'organizer-123',
        'event-123',
        request.body.ticketSelections,
        request.body.members
      );
    });

    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest({
        body: {
          eventId: 'event-123',
          ticketSelections: [],
          members: [],
        },
        user: null,
      });
      const reply = createMockReply();

      await controller.createGroup(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle service errors gracefully', async () => {
      const request = createMockRequest({
        body: {
          eventId: 'event-123',
          ticketSelections: [{ ticketTypeId: 'type-1', quantity: 1, price: 5000 }],
          members: [{ email: 'member1@example.com', amountDue: 5000 }],
        },
        user: { id: 'organizer-123' },
      });
      const reply = createMockReply();

      mockGroupPaymentService.createGroupPayment.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(controller.createGroup(request, reply)).rejects.toThrow('Database connection failed');
    });

    it('should generate correct payment links for each member', async () => {
      process.env.FRONTEND_URL = 'https://app.tickettoken.com';
      
      const request = createMockRequest({
        body: {
          eventId: 'event-456',
          ticketSelections: [{ ticketTypeId: 'type-1', quantity: 2, price: 10000 }],
          members: [
            { email: 'alice@example.com', amountDue: 10000 },
            { email: 'bob@example.com', amountDue: 10000 },
          ],
        },
        user: { id: 'organizer-456' },
      });
      const reply = createMockReply();

      const mockGroupPayment = {
        id: 'group-789',
        members: [
          { id: 'mem-1', email: 'alice@example.com', amountDue: 10000 },
          { id: 'mem-2', email: 'bob@example.com', amountDue: 10000 },
        ],
      };

      mockGroupPaymentService.createGroupPayment.mockResolvedValue(mockGroupPayment);

      await controller.createGroup(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.paymentLinks).toHaveLength(2);
      expect(response.paymentLinks[0].link).toContain('group-789');
      expect(response.paymentLinks[0].link).toContain('mem-1');
    });
  });

  describe('contributeToGroup', () => {
    it('should record member payment successfully', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
          memberId: 'member-456',
        },
        body: {
          paymentMethodId: 'pm_card_visa',
        },
      });
      const reply = createMockReply();

      const mockStatus = {
        summary: {
          totalMembers: 3,
          paidMembers: 2,
          totalAmount: 15000,
          collectedAmount: 10000,
          remainingAmount: 5000,
        },
      };

      mockGroupPaymentService.recordMemberPayment.mockResolvedValue(undefined);
      mockGroupPaymentService.getGroupStatus.mockResolvedValue(mockStatus);

      await controller.contributeToGroup(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Payment recorded successfully',
        groupStatus: mockStatus.summary,
      });
      expect(mockGroupPaymentService.recordMemberPayment).toHaveBeenCalledWith(
        'group-123',
        'member-456',
        'pm_card_visa'
      );
    });

    it('should handle payment processing errors', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
          memberId: 'member-456',
        },
        body: {
          paymentMethodId: 'pm_card_declined',
        },
      });
      const reply = createMockReply();

      mockGroupPaymentService.recordMemberPayment.mockRejectedValue(
        new Error('Card declined')
      );

      await expect(controller.contributeToGroup(request, reply)).rejects.toThrow('Card declined');
    });

    it('should handle non-existent group', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'non-existent-group',
          memberId: 'member-456',
        },
        body: {
          paymentMethodId: 'pm_card_visa',
        },
      });
      const reply = createMockReply();

      mockGroupPaymentService.recordMemberPayment.mockRejectedValue(
        new Error('Group not found')
      );

      await expect(controller.contributeToGroup(request, reply)).rejects.toThrow('Group not found');
    });

    it('should handle duplicate payment attempts', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
          memberId: 'member-already-paid',
        },
        body: {
          paymentMethodId: 'pm_card_visa',
        },
      });
      const reply = createMockReply();

      mockGroupPaymentService.recordMemberPayment.mockRejectedValue(
        new Error('Member has already paid')
      );

      await expect(controller.contributeToGroup(request, reply)).rejects.toThrow('Member has already paid');
    });
  });

  describe('getGroupStatus', () => {
    it('should return group status successfully', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
        },
      });
      const reply = createMockReply();

      const mockStatus = {
        id: 'group-123',
        organizerId: 'organizer-123',
        eventId: 'event-456',
        status: 'partial',
        summary: {
          totalMembers: 4,
          paidMembers: 2,
          totalAmount: 20000,
          collectedAmount: 10000,
          remainingAmount: 10000,
        },
        members: [
          { id: 'mem-1', email: 'a@example.com', amountDue: 5000, paid: true },
          { id: 'mem-2', email: 'b@example.com', amountDue: 5000, paid: true },
          { id: 'mem-3', email: 'c@example.com', amountDue: 5000, paid: false },
          { id: 'mem-4', email: 'd@example.com', amountDue: 5000, paid: false },
        ],
      };

      mockGroupPaymentService.getGroupStatus.mockResolvedValue(mockStatus);

      await controller.getGroupStatus(request, reply);

      expect(reply.send).toHaveBeenCalledWith(mockStatus);
      expect(mockGroupPaymentService.getGroupStatus).toHaveBeenCalledWith('group-123');
    });

    it('should handle non-existent group', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'non-existent-group',
        },
      });
      const reply = createMockReply();

      mockGroupPaymentService.getGroupStatus.mockRejectedValue(
        new Error('Group payment not found')
      );

      await expect(controller.getGroupStatus(request, reply)).rejects.toThrow('Group payment not found');
    });

    it('should return completed status when all members paid', async () => {
      const request = createMockRequest({
        params: { groupId: 'group-complete' },
      });
      const reply = createMockReply();

      const mockStatus = {
        id: 'group-complete',
        status: 'completed',
        summary: {
          totalMembers: 2,
          paidMembers: 2,
          totalAmount: 10000,
          collectedAmount: 10000,
          remainingAmount: 0,
        },
      };

      mockGroupPaymentService.getGroupStatus.mockResolvedValue(mockStatus);

      await controller.getGroupStatus(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('completed');
      expect(response.summary.remainingAmount).toBe(0);
    });
  });

  describe('sendReminders', () => {
    it('should send reminders successfully when called by organizer', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
        },
        user: {
          id: 'organizer-123',
          userId: 'organizer-123',
        },
      });
      const reply = createMockReply();

      // Note: The controller has a TODO - getGroupPayment is not public
      // Testing with the current implementation
      mockGroupPaymentService.sendReminders.mockResolvedValue(undefined);

      await controller.sendReminders(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Reminders sent to unpaid members',
      });
      expect(mockGroupPaymentService.sendReminders).toHaveBeenCalledWith('group-123');
    });

    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
        },
        user: null,
      });
      const reply = createMockReply();

      await controller.sendReminders(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle reminder service errors', async () => {
      const request = createMockRequest({
        params: { groupId: 'group-123' },
        user: { id: 'organizer-123' },
      });
      const reply = createMockReply();

      mockGroupPaymentService.sendReminders.mockRejectedValue(
        new Error('Email service unavailable')
      );

      await expect(controller.sendReminders(request, reply)).rejects.toThrow('Email service unavailable');
    });
  });

  describe('getContributionHistory', () => {
    it('should return contribution history successfully', async () => {
      const request = createMockRequest({
        params: {
          groupId: 'group-123',
        },
      });
      const reply = createMockReply();

      const mockHistory = {
        groupId: 'group-123',
        contributions: [
          {
            id: 'contrib-1',
            memberId: 'member-1',
            memberEmail: 'alice@example.com',
            amount: 5000,
            status: 'completed',
            paidAt: '2026-01-10T10:00:00Z',
          },
          {
            id: 'contrib-2',
            memberId: 'member-2',
            memberEmail: 'bob@example.com',
            amount: 5000,
            status: 'completed',
            paidAt: '2026-01-10T11:30:00Z',
          },
        ],
        totalContributions: 2,
        totalAmount: 10000,
      };

      mockContributionTracker.getContributionHistory.mockResolvedValue(mockHistory);

      await controller.getContributionHistory(request, reply);

      expect(reply.send).toHaveBeenCalledWith(mockHistory);
      expect(mockContributionTracker.getContributionHistory).toHaveBeenCalledWith('group-123');
    });

    it('should return empty history for new group', async () => {
      const request = createMockRequest({
        params: { groupId: 'new-group' },
      });
      const reply = createMockReply();

      const mockHistory = {
        groupId: 'new-group',
        contributions: [],
        totalContributions: 0,
        totalAmount: 0,
      };

      mockContributionTracker.getContributionHistory.mockResolvedValue(mockHistory);

      await controller.getContributionHistory(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.contributions).toHaveLength(0);
      expect(response.totalAmount).toBe(0);
    });

    it('should handle non-existent group', async () => {
      const request = createMockRequest({
        params: { groupId: 'non-existent' },
      });
      const reply = createMockReply();

      mockContributionTracker.getContributionHistory.mockRejectedValue(
        new Error('Group not found')
      );

      await expect(controller.getContributionHistory(request, reply)).rejects.toThrow('Group not found');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty member list', async () => {
      const request = createMockRequest({
        body: {
          eventId: 'event-123',
          ticketSelections: [{ ticketTypeId: 'type-1', quantity: 1, price: 5000 }],
          members: [],
        },
        user: { id: 'organizer-123' },
      });
      const reply = createMockReply();

      const mockGroupPayment = {
        id: 'group-solo',
        members: [],
      };

      mockGroupPaymentService.createGroupPayment.mockResolvedValue(mockGroupPayment);

      await controller.createGroup(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.paymentLinks).toHaveLength(0);
    });

    it('should handle large group with many members', async () => {
      const members = Array.from({ length: 50 }, (_, i) => ({
        email: `member${i}@example.com`,
        amountDue: 1000,
      }));

      const request = createMockRequest({
        body: {
          eventId: 'event-large',
          ticketSelections: [{ ticketTypeId: 'type-1', quantity: 50, price: 1000 }],
          members,
        },
        user: { id: 'organizer-large' },
      });
      const reply = createMockReply();

      const mockGroupPayment = {
        id: 'group-large',
        members: members.map((m, i) => ({ ...m, id: `mem-${i}`, paid: false })),
      };

      mockGroupPaymentService.createGroupPayment.mockResolvedValue(mockGroupPayment);

      await controller.createGroup(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.paymentLinks).toHaveLength(50);
    });

    it('should handle special characters in email addresses', async () => {
      const request = createMockRequest({
        body: {
          eventId: 'event-123',
          ticketSelections: [{ ticketTypeId: 'type-1', quantity: 1, price: 5000 }],
          members: [
            { email: "special+chars@example.com", amountDue: 5000 },
          ],
        },
        user: { id: 'organizer-123' },
      });
      const reply = createMockReply();

      const mockGroupPayment = {
        id: 'group-special',
        members: [{ id: 'mem-1', email: 'special+chars@example.com', amountDue: 5000 }],
      };

      mockGroupPaymentService.createGroupPayment.mockResolvedValue(mockGroupPayment);

      await controller.createGroup(request, reply);

      expect(mockGroupPaymentService.createGroupPayment).toHaveBeenCalled();
    });
  });
});
