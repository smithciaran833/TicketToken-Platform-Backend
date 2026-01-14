// =============================================================================
// TEST SUITE: group.types
// =============================================================================

import { GroupPayment, GroupMember, GroupPaymentStatus } from '../../../src/types/group.types';

describe('group.types', () => {
  // ===========================================================================
  // GroupPayment Interface - 5 test cases
  // ===========================================================================

  describe('GroupPayment Interface', () => {
    it('should allow valid GroupPayment object', () => {
      const groupPayment: GroupPayment = {
        id: 'gp-123',
        organizerId: 'user-456',
        eventId: 'event-789',
        totalAmount: 10000,
        ticketSelections: [],
        members: [],
        expiresAt: new Date(),
        status: GroupPaymentStatus.COLLECTING,
        createdAt: new Date(),
      };

      expect(groupPayment.id).toBe('gp-123');
      expect(groupPayment.organizerId).toBe('user-456');
      expect(groupPayment.eventId).toBe('event-789');
      expect(groupPayment.totalAmount).toBe(10000);
      expect(groupPayment.status).toBe(GroupPaymentStatus.COLLECTING);
    });

    it('should allow GroupPayment with ticket selections', () => {
      const groupPayment: GroupPayment = {
        id: 'gp-123',
        organizerId: 'user-456',
        eventId: 'event-789',
        totalAmount: 20000,
        ticketSelections: [
          {
            ticketTypeId: 'tt-1',
            quantity: 2,
            pricePerTicket: 5000,
          },
          {
            ticketTypeId: 'tt-2',
            quantity: 2,
            pricePerTicket: 5000,
          },
        ] as any,
        members: [],
        expiresAt: new Date(),
        status: GroupPaymentStatus.COLLECTING,
        createdAt: new Date(),
      };

      expect(groupPayment.ticketSelections).toHaveLength(2);
    });

    it('should allow GroupPayment with members', () => {
      const members: GroupMember[] = [
        {
          id: 'member-1',
          email: 'user1@test.com',
          name: 'User One',
          amountDue: 5000,
          paid: true,
          remindersSent: 0,
        },
        {
          id: 'member-2',
          email: 'user2@test.com',
          name: 'User Two',
          amountDue: 5000,
          paid: false,
          remindersSent: 2,
        },
      ];

      const groupPayment: GroupPayment = {
        id: 'gp-123',
        organizerId: 'user-456',
        eventId: 'event-789',
        totalAmount: 10000,
        ticketSelections: [],
        members,
        expiresAt: new Date(),
        status: GroupPaymentStatus.PARTIALLY_PAID,
        createdAt: new Date(),
      };

      expect(groupPayment.members).toHaveLength(2);
    });

    it('should store timestamps as Date objects', () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 86400000);

      const groupPayment: GroupPayment = {
        id: 'gp-123',
        organizerId: 'user-456',
        eventId: 'event-789',
        totalAmount: 10000,
        ticketSelections: [],
        members: [],
        expiresAt,
        status: GroupPaymentStatus.COLLECTING,
        createdAt: now,
      };

      expect(groupPayment.createdAt).toBeInstanceOf(Date);
      expect(groupPayment.expiresAt).toBeInstanceOf(Date);
      expect(groupPayment.createdAt).toBe(now);
      expect(groupPayment.expiresAt).toBe(expiresAt);
    });

    it('should allow different payment statuses', () => {
      const statuses: GroupPaymentStatus[] = [
        GroupPaymentStatus.COLLECTING,
        GroupPaymentStatus.COMPLETED,
        GroupPaymentStatus.PARTIALLY_PAID,
        GroupPaymentStatus.EXPIRED,
        GroupPaymentStatus.CANCELLED,
      ];

      statuses.forEach(status => {
        const groupPayment: GroupPayment = {
          id: 'gp-123',
          organizerId: 'user-456',
          eventId: 'event-789',
          totalAmount: 10000,
          ticketSelections: [],
          members: [],
          expiresAt: new Date(),
          status,
          createdAt: new Date(),
        };

        expect(groupPayment.status).toBe(status);
      });
    });
  });

  // ===========================================================================
  // GroupMember Interface - 8 test cases
  // ===========================================================================

  describe('GroupMember Interface', () => {
    it('should allow valid GroupMember object', () => {
      const member: GroupMember = {
        id: 'member-123',
        userId: 'user-456',
        email: 'user@example.com',
        name: 'John Doe',
        amountDue: 5000,
        paid: false,
        remindersSent: 0,
      };

      expect(member.id).toBe('member-123');
      expect(member.userId).toBe('user-456');
      expect(member.email).toBe('user@example.com');
      expect(member.name).toBe('John Doe');
      expect(member.amountDue).toBe(5000);
      expect(member.paid).toBe(false);
      expect(member.remindersSent).toBe(0);
    });

    it('should allow optional userId', () => {
      const memberWithUser: GroupMember = {
        id: 'member-1',
        userId: 'user-123',
        email: 'user@test.com',
        name: 'User',
        amountDue: 1000,
        paid: false,
        remindersSent: 0,
      };

      const memberWithoutUser: GroupMember = {
        id: 'member-2',
        email: 'guest@test.com',
        name: 'Guest',
        amountDue: 1000,
        paid: false,
        remindersSent: 0,
      };

      expect(memberWithUser.userId).toBe('user-123');
      expect(memberWithoutUser.userId).toBeUndefined();
    });

    it('should allow optional paidAt timestamp', () => {
      const paidMember: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 5000,
        paid: true,
        paidAt: new Date(),
        remindersSent: 0,
      };

      const unpaidMember: GroupMember = {
        id: 'member-2',
        email: 'user2@test.com',
        name: 'User Two',
        amountDue: 5000,
        paid: false,
        remindersSent: 1,
      };

      expect(paidMember.paidAt).toBeInstanceOf(Date);
      expect(unpaidMember.paidAt).toBeUndefined();
    });

    it('should allow optional paymentId', () => {
      const paidMember: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 5000,
        paid: true,
        paymentId: 'payment-abc',
        remindersSent: 0,
      };

      const unpaidMember: GroupMember = {
        id: 'member-2',
        email: 'user2@test.com',
        name: 'User Two',
        amountDue: 5000,
        paid: false,
        remindersSent: 0,
      };

      expect(paidMember.paymentId).toBe('payment-abc');
      expect(unpaidMember.paymentId).toBeUndefined();
    });

    it('should track paid status as boolean', () => {
      const paidMember: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 5000,
        paid: true,
        remindersSent: 0,
      };

      const unpaidMember: GroupMember = {
        id: 'member-2',
        email: 'user2@test.com',
        name: 'User Two',
        amountDue: 5000,
        paid: false,
        remindersSent: 0,
      };

      expect(paidMember.paid).toBe(true);
      expect(unpaidMember.paid).toBe(false);
    });

    it('should track number of reminders sent', () => {
      const member: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 5000,
        paid: false,
        remindersSent: 3,
      };

      expect(member.remindersSent).toBe(3);
      expect(typeof member.remindersSent).toBe('number');
    });

    it('should allow zero reminders sent', () => {
      const member: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 5000,
        paid: false,
        remindersSent: 0,
      };

      expect(member.remindersSent).toBe(0);
    });

    it('should store amountDue as number', () => {
      const member: GroupMember = {
        id: 'member-1',
        email: 'user@test.com',
        name: 'User',
        amountDue: 7500,
        paid: false,
        remindersSent: 0,
      };

      expect(member.amountDue).toBe(7500);
      expect(typeof member.amountDue).toBe('number');
    });
  });

  // ===========================================================================
  // GroupPaymentStatus Enum - 5 test cases
  // ===========================================================================

  describe('GroupPaymentStatus Enum', () => {
    it('should have COLLECTING status', () => {
      expect(GroupPaymentStatus.COLLECTING).toBe('collecting');
    });

    it('should have COMPLETED status', () => {
      expect(GroupPaymentStatus.COMPLETED).toBe('completed');
    });

    it('should have PARTIALLY_PAID status', () => {
      expect(GroupPaymentStatus.PARTIALLY_PAID).toBe('partially_paid');
    });

    it('should have EXPIRED status', () => {
      expect(GroupPaymentStatus.EXPIRED).toBe('expired');
    });

    it('should have CANCELLED status', () => {
      expect(GroupPaymentStatus.CANCELLED).toBe('cancelled');
    });
  });
});
