/**
 * COMPONENT TEST: GroupPaymentController
 *
 * Tests group payment operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.FRONTEND_URL = 'https://example.com';

// Mock services
const mockCreateGroupPayment = jest.fn();
const mockRecordMemberPayment = jest.fn();
const mockGetGroupStatus = jest.fn();
const mockGetGroupPayment = jest.fn();
const mockSendReminders = jest.fn();
const mockGetContributionHistory = jest.fn();

jest.mock('../../../src/services/group', () => ({
  GroupPaymentService: jest.fn().mockImplementation(() => ({
    createGroupPayment: mockCreateGroupPayment,
    recordMemberPayment: mockRecordMemberPayment,
    getGroupStatus: mockGetGroupStatus,
    getGroupPayment: mockGetGroupPayment,
    sendReminders: mockSendReminders,
  })),
  ContributionTrackerService: jest.fn().mockImplementation(() => ({
    getContributionHistory: mockGetContributionHistory,
  })),
}));

// Mock serializers
jest.mock('../../../src/serializers', () => ({
  serializeGroupPaymentWithMembers: jest.fn((group, members) => ({
    id: group.id,
    eventId: group.eventId,
    status: group.status,
    memberCount: members.length,
  })),
}));

// Mock cache
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { GroupPaymentController } from '../../../src/controllers/group-payment.controller';

// Helper to create mock request
function createMockRequest(overrides: any = {}): FastifyRequest {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;

  const reply = {
    send: jest.fn().mockImplementation((data) => {
      response = data;
      return reply;
    }),
    status: jest.fn().mockImplementation((code) => {
      status = code;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getResponse: () => response,
    getStatus: () => status,
  };
}

describe('GroupPaymentController Component Tests', () => {
  let controller: GroupPaymentController;
  let groupId: string;
  let eventId: string;
  let userId: string;

  beforeEach(() => {
    groupId = uuidv4();
    eventId = uuidv4();
    userId = uuidv4();

    mockCreateGroupPayment.mockReset();
    mockRecordMemberPayment.mockReset();
    mockGetGroupStatus.mockReset();
    mockGetGroupPayment.mockReset();
    mockSendReminders.mockReset();
    mockGetContributionHistory.mockReset();

    controller = new GroupPaymentController();
  });

  // ===========================================================================
  // CREATE GROUP
  // ===========================================================================
  describe('createGroup()', () => {
    it('should create group payment', async () => {
      const members = [
        { id: uuidv4(), email: 'member1@test.com', amountDue: 2500 },
        { id: uuidv4(), email: 'member2@test.com', amountDue: 2500 },
      ];

      mockCreateGroupPayment.mockResolvedValueOnce({
        id: groupId,
        eventId,
        status: 'pending',
        members,
      });

      const request = createMockRequest({
        body: {
          eventId,
          ticketSelections: [{ ticketTypeId: uuidv4(), quantity: 2 }],
          members,
        },
        user: { id: userId },
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.createGroup(request, reply);

      expect(mockCreateGroupPayment).toHaveBeenCalledWith(
        userId,
        eventId,
        expect.any(Array),
        members
      );

      expect(getStatus()).toBe(201);
      const response = getResponse();
      expect(response.success).toBe(true);
      expect(response.paymentLinks).toHaveLength(2);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        body: { eventId, ticketSelections: [], members: [] },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.createGroup(request, reply);

      expect(getStatus()).toBe(401);
      expect(getResponse().error).toContain('Authentication required');
    });

    it('should include payment links for members', async () => {
      const memberId = uuidv4();
      mockCreateGroupPayment.mockResolvedValueOnce({
        id: groupId,
        eventId,
        status: 'pending',
        members: [{ id: memberId, email: 'test@test.com', amountDue: 5000 }],
      });

      const request = createMockRequest({
        body: { eventId, ticketSelections: [], members: [] },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.createGroup(request, reply);

      const response = getResponse();
      expect(response.paymentLinks[0].link).toContain(groupId);
      expect(response.paymentLinks[0].link).toContain(memberId);
    });
  });

  // ===========================================================================
  // CONTRIBUTE TO GROUP
  // ===========================================================================
  describe('contributeToGroup()', () => {
    it('should record member payment', async () => {
      const memberId = uuidv4();

      mockRecordMemberPayment.mockResolvedValueOnce({ success: true });
      mockGetGroupStatus.mockResolvedValueOnce({
        group: { id: groupId },
        summary: { totalPaid: 5000, totalDue: 10000 },
      });

      const request = createMockRequest({
        params: { groupId, memberId },
        body: { paymentMethodId: 'pm_test123' },
      });
      const { reply, getResponse } = createMockReply();

      await controller.contributeToGroup(request, reply);

      expect(mockRecordMemberPayment).toHaveBeenCalledWith(
        groupId,
        memberId,
        'pm_test123'
      );

      const response = getResponse();
      expect(response.success).toBe(true);
      expect(response.groupStatus).toBeDefined();
    });
  });

  // ===========================================================================
  // GET GROUP STATUS
  // ===========================================================================
  describe('getGroupStatus()', () => {
    it('should return group status (no auth required)', async () => {
      mockGetGroupStatus.mockResolvedValueOnce({
        group: {
          id: groupId,
          eventId,
          status: 'pending',
          expiresAt: new Date(),
          organizerId: userId, // Should not be exposed
        },
        summary: { totalPaid: 5000, totalDue: 10000, paidCount: 1, totalCount: 2 },
      });

      const request = createMockRequest({
        params: { groupId },
        // No user - public endpoint
      });
      const { reply, getResponse } = createMockReply();

      await controller.getGroupStatus(request, reply);

      const response = getResponse();
      expect(response.group.id).toBe(groupId);
      expect(response.group.organizerId).toBeUndefined(); // Security: not exposed
      expect(response.summary).toBeDefined();
    });
  });

  // ===========================================================================
  // SEND REMINDERS
  // ===========================================================================
  describe('sendReminders()', () => {
    it('should send reminders for organizer', async () => {
      mockGetGroupPayment.mockResolvedValueOnce({
        id: groupId,
        organizerId: userId,
      });
      mockSendReminders.mockResolvedValueOnce({ sent: 2 });

      const request = createMockRequest({
        params: { groupId },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.sendReminders(request, reply);

      expect(mockSendReminders).toHaveBeenCalledWith(groupId);
      expect(getResponse().success).toBe(true);
    });

    it('should reject non-organizer', async () => {
      mockGetGroupPayment.mockResolvedValueOnce({
        id: groupId,
        organizerId: uuidv4(), // Different user
      });

      const request = createMockRequest({
        params: { groupId },
        user: { id: userId },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.sendReminders(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().error).toContain('organizer');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { groupId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.sendReminders(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should return 404 for non-existent group', async () => {
      mockGetGroupPayment.mockResolvedValueOnce(null);

      const request = createMockRequest({
        params: { groupId },
        user: { id: userId },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.sendReminders(request, reply);

      expect(getStatus()).toBe(404);
      expect(getResponse().error).toContain('not found');
    });
  });

  // ===========================================================================
  // GET CONTRIBUTION HISTORY
  // ===========================================================================
  describe('getContributionHistory()', () => {
    it('should return sanitized contribution history', async () => {
      mockGetContributionHistory.mockResolvedValueOnce({
        contributions: [
          { memberId: uuidv4(), memberName: 'John', amount: 2500, email: 'john@test.com' },
        ],
        timeline: [
          { timestamp: new Date(), event: 'Payment received', details: 'Member paid' },
        ],
      });

      const request = createMockRequest({
        params: { groupId },
        // No auth required
      });
      const { reply, getResponse } = createMockReply();

      await controller.getContributionHistory(request, reply);

      const response = getResponse();
      expect(response.contributions[0].email).toBeUndefined(); // Security: email filtered
      expect(response.contributions[0].memberId).toBeDefined();
    });
  });
});
