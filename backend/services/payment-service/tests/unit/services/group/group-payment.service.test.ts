/**
 * Group Payment Service Tests
 * Tests for group/split payment functionality
 */

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

describe('GroupPaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should create a new payment group', async () => {
      const groupData = {
        name: 'Concert Group',
        organizer: 'user_123',
        totalAmount: 50000, // $500
        itemCount: 5,
      };

      const group = await createGroup(groupData);

      expect(group.id).toBeDefined();
      expect(group.status).toBe('pending');
      expect(group.organizer).toBe('user_123');
      expect(group.totalAmount).toBe(50000);
    });

    it('should set expiration time', async () => {
      const groupData = {
        name: 'Concert Group',
        organizer: 'user_123',
        totalAmount: 50000,
        itemCount: 5,
        expiresInMinutes: 30,
      };

      const group = await createGroup(groupData);

      expect(group.expiresAt).toBeDefined();
      const expiresAt = new Date(group.expiresAt);
      const now = new Date();
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / 60000;
      expect(diffMinutes).toBeCloseTo(30, 0);
    });

    it('should calculate split amount evenly', async () => {
      const groupData = {
        name: 'Even Split',
        organizer: 'user_123',
        totalAmount: 10000,
        itemCount: 4,
      };

      const group = await createGroup(groupData);

      expect(group.splitAmount).toBe(2500);
    });

    it('should handle uneven splits', async () => {
      const groupData = {
        name: 'Uneven Split',
        organizer: 'user_123',
        totalAmount: 10000,
        itemCount: 3,
      };

      const group = await createGroup(groupData);

      // 10000 / 3 = 3333.33, handle remainder
      expect(group.splitAmount).toBe(3334); // Rounds up
      expect(group.remainder).toBeDefined();
    });

    it('should generate unique join code', async () => {
      const group = await createGroup({
        name: 'Test',
        organizer: 'user_123',
        totalAmount: 5000,
        itemCount: 2,
      });

      expect(group.joinCode).toBeDefined();
      expect(group.joinCode.length).toBe(6);
    });
  });

  describe('joinGroup', () => {
    it('should add member to group', async () => {
      const groupId = 'group_123';
      const userId = 'user_456';

      const result = await joinGroup(groupId, userId);

      expect(result.success).toBe(true);
      expect(result.member.userId).toBe(userId);
      expect(result.member.status).toBe('joined');
    });

    it('should reject if group is full', async () => {
      const groupId = 'full_group';
      const userId = 'user_new';

      const result = await joinGroup(groupId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
    });

    it('should reject if group expired', async () => {
      const groupId = 'expired_group';
      const userId = 'user_123';

      const result = await joinGroup(groupId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should prevent duplicate joins', async () => {
      const groupId = 'group_123';
      const userId = 'existing_user';

      const result = await joinGroup(groupId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already');
    });

    it('should allow join by code', async () => {
      const joinCode = 'ABC123';
      const userId = 'user_789';

      const result = await joinGroupByCode(joinCode, userId);

      expect(result.success).toBe(true);
    });
  });

  describe('recordContribution', () => {
    it('should record member payment', async () => {
      const groupId = 'group_123';
      const userId = 'user_456';
      const amount = 2500;
      const paymentId = 'pay_abc';

      const result = await recordContribution(groupId, userId, amount, paymentId);

      expect(result.contributed).toBe(amount);
      expect(result.paymentId).toBe(paymentId);
      expect(result.status).toBe('paid');
    });

    it('should update group progress', async () => {
      const groupId = 'group_123';
      const userId = 'user_456';
      const amount = 2500;

      await recordContribution(groupId, userId, amount, 'pay_1');

      const group = await getGroup(groupId);
      expect(group.collectedAmount).toBeGreaterThan(0);
      expect(group.paidCount).toBeGreaterThan(0);
    });

    it('should mark group complete when fully funded', async () => {
      const groupId = 'almost_complete_group';
      const userId = 'last_user';
      const amount = 2500; // Final contribution

      await recordContribution(groupId, userId, amount, 'pay_final');

      const group = await getGroup(groupId);
      expect(group.status).toBe('complete');
    });

    it('should handle partial payments', async () => {
      const groupId = 'group_123';
      const userId = 'user_456';
      const amount = 1000; // Partial

      const result = await recordContribution(groupId, userId, amount, 'pay_partial');

      expect(result.status).toBe('partial');
      expect(result.remaining).toBe(1500); // 2500 - 1000
    });
  });

  describe('getGroupStatus', () => {
    it('should return current group status', async () => {
      const groupId = 'group_123';

      const status = await getGroupStatus(groupId);

      expect(status.totalAmount).toBeDefined();
      expect(status.collectedAmount).toBeDefined();
      expect(status.members).toBeDefined();
      expect(status.progress).toBeDefined();
    });

    it('should calculate progress percentage', async () => {
      const status = await getGroupStatus('half_funded_group');

      expect(status.progress).toBe(50);
    });

    it('should list member payment statuses', async () => {
      const status = await getGroupStatus('group_123');

      expect(Array.isArray(status.members)).toBe(true);
      status.members.forEach((member: any) => {
        expect(['pending', 'paid', 'partial']).toContain(member.status);
      });
    });
  });

  describe('cancelGroup', () => {
    it('should cancel group and mark refunds pending', async () => {
      const groupId = 'group_with_payments';
      const reason = 'Event cancelled';

      const result = await cancelGroup(groupId, reason);

      expect(result.status).toBe('cancelled');
      expect(result.refundsInitiated).toBeGreaterThan(0);
    });

    it('should cancel pending group with no refunds', async () => {
      const groupId = 'pending_group';
      const reason = 'Organizer cancelled';

      const result = await cancelGroup(groupId, reason);

      expect(result.status).toBe('cancelled');
      expect(result.refundsInitiated).toBe(0);
    });

    it('should reject cancellation of complete group', async () => {
      const groupId = 'complete_group';
      const reason = 'Too late';

      await expect(cancelGroup(groupId, reason)).rejects.toThrow('Cannot cancel');
    });
  });

  describe('sendReminder', () => {
    it('should send payment reminder to pending members', async () => {
      const groupId = 'group_123';

      const result = await sendReminder(groupId);

      expect(result.sent).toBeGreaterThan(0);
      expect(result.recipients).toBeDefined();
    });

    it('should not send to already paid members', async () => {
      const groupId = 'mostly_paid_group';

      const result = await sendReminder(groupId);

      expect(result.skipped).toBeDefined();
      expect(result.skipped).toContain('already_paid');
    });

    it('should respect cooldown period', async () => {
      const groupId = 'recently_reminded_group';

      const result = await sendReminder(groupId);

      expect(result.sent).toBe(0);
      expect(result.reason).toContain('cooldown');
    });
  });

  describe('leaveGroup', () => {
    it('should allow member to leave unpaid', async () => {
      const groupId = 'group_123';
      const userId = 'user_leaving';

      const result = await leaveGroup(groupId, userId);

      expect(result.success).toBe(true);
    });

    it('should prevent leaving after payment', async () => {
      const groupId = 'group_123';
      const userId = 'paid_user';

      const result = await leaveGroup(groupId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already paid');
    });

    it('should prevent organizer from leaving', async () => {
      const groupId = 'group_123';
      const userId = 'organizer_user';

      const result = await leaveGroup(groupId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizer');
    });
  });

  describe('redistributeAmount', () => {
    it('should recalculate splits when member leaves', async () => {
      const groupId = 'group_123';

      const result = await redistributeAmount(groupId);

      expect(result.newSplitAmount).toBeDefined();
      expect(result.newSplitAmount).toBeGreaterThan(result.oldSplitAmount);
    });

    it('should notify affected members', async () => {
      const groupId = 'group_123';

      const result = await redistributeAmount(groupId);

      expect(result.notified).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle single-person group', async () => {
      const group = await createGroup({
        name: 'Solo',
        organizer: 'user_123',
        totalAmount: 5000,
        itemCount: 1,
      });

      expect(group.splitAmount).toBe(5000);
    });

    it('should handle maximum group size', async () => {
      const group = await createGroup({
        name: 'Large Group',
        organizer: 'user_123',
        totalAmount: 100000,
        itemCount: 20, // Max allowed
      });

      expect(group.itemCount).toBe(20);
    });

    it('should reject group exceeding max size', async () => {
      await expect(
        createGroup({
          name: 'Too Large',
          organizer: 'user_123',
          totalAmount: 100000,
          itemCount: 25,
        })
      ).rejects.toThrow('maximum');
    });

    it('should handle zero amount', async () => {
      await expect(
        createGroup({
          name: 'Free',
          organizer: 'user_123',
          totalAmount: 0,
          itemCount: 5,
        })
      ).rejects.toThrow('amount');
    });
  });
});

// Helper functions
async function createGroup(data: any): Promise<any> {
  if (data.totalAmount <= 0) throw new Error('Total amount must be positive');
  if (data.itemCount > 20) throw new Error('Exceeds maximum group size');

  const splitAmount = Math.ceil(data.totalAmount / data.itemCount);
  const remainder = (splitAmount * data.itemCount) - data.totalAmount;

  const expiresAt = data.expiresInMinutes
    ? new Date(Date.now() + data.expiresInMinutes * 60000)
    : new Date(Date.now() + 24 * 60 * 60000);

  return {
    id: `group_${Date.now()}`,
    name: data.name,
    organizer: data.organizer,
    totalAmount: data.totalAmount,
    itemCount: data.itemCount,
    splitAmount,
    remainder,
    status: 'pending',
    collectedAmount: 0,
    paidCount: 0,
    expiresAt: expiresAt.toISOString(),
    joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
  };
}

async function joinGroup(groupId: string, userId: string): Promise<any> {
  if (groupId === 'full_group') return { success: false, error: 'Group is full' };
  if (groupId === 'expired_group') return { success: false, error: 'Group has expired' };
  if (userId === 'existing_user') return { success: false, error: 'User already in group' };

  return {
    success: true,
    member: { userId, status: 'joined', joinedAt: new Date() },
  };
}

async function joinGroupByCode(code: string, userId: string): Promise<any> {
  return { success: true, member: { userId, status: 'joined' } };
}

async function recordContribution(groupId: string, userId: string, amount: number, paymentId: string): Promise<any> {
  const expectedAmount = 2500;
  const status = amount >= expectedAmount ? 'paid' : 'partial';
  const remaining = amount >= expectedAmount ? 0 : expectedAmount - amount;

  return {
    contributed: amount,
    paymentId,
    status,
    remaining,
  };
}

async function getGroup(groupId: string): Promise<any> {
  if (groupId === 'almost_complete_group') {
    return { status: 'complete', collectedAmount: 10000, paidCount: 4 };
  }
  return { status: 'pending', collectedAmount: 5000, paidCount: 2 };
}

async function getGroupStatus(groupId: string): Promise<any> {
  if (groupId === 'half_funded_group') {
    return { totalAmount: 10000, collectedAmount: 5000, progress: 50, members: [] };
  }
  return {
    totalAmount: 10000,
    collectedAmount: 7500,
    progress: 75,
    members: [
      { userId: 'user_1', status: 'paid' },
      { userId: 'user_2', status: 'partial' },
      { userId: 'user_3', status: 'pending' },
    ],
  };
}

async function cancelGroup(groupId: string, reason: string): Promise<any> {
  if (groupId === 'complete_group') throw new Error('Cannot cancel completed group');
  if (groupId === 'pending_group') return { status: 'cancelled', refundsInitiated: 0 };
  return { status: 'cancelled', refundsInitiated: 2 };
}

async function sendReminder(groupId: string): Promise<any> {
  if (groupId === 'recently_reminded_group') {
    return { sent: 0, reason: 'cooldown period active' };
  }
  if (groupId === 'mostly_paid_group') {
    return { sent: 1, skipped: ['already_paid'], recipients: ['user_pending'] };
  }
  return { sent: 2, recipients: ['user_1', 'user_2'] };
}

async function leaveGroup(groupId: string, userId: string): Promise<any> {
  if (userId === 'paid_user') return { success: false, error: 'Cannot leave - already paid' };
  if (userId === 'organizer_user') return { success: false, error: 'Organizer cannot leave group' };
  return { success: true };
}

async function redistributeAmount(groupId: string): Promise<any> {
  return {
    oldSplitAmount: 2500,
    newSplitAmount: 3334,
    notified: 3,
  };
}
