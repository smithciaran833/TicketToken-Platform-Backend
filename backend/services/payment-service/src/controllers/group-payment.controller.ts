import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { GroupPaymentService, ContributionTrackerService } from '../services/group';
import { serializeGroupPaymentWithMembers } from '../serializers';

export class GroupPaymentController {
  private groupPaymentService: GroupPaymentService;
  private contributionTracker: ContributionTrackerService;

  constructor() {
    this.groupPaymentService = new GroupPaymentService();
    this.contributionTracker = new ContributionTrackerService();
  }

  async createGroup(request: FastifyRequest, reply: FastifyReply) {
    const { eventId, ticketSelections, members } = request.body as any;
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const organizerId = user.id;

    const groupPayment = await this.groupPaymentService.createGroupPayment(
      organizerId,
      eventId,
      ticketSelections,
      members
    );

    // SECURITY: Serialize group payment - organizer view includes member emails
    const serialized = serializeGroupPaymentWithMembers(groupPayment, groupPayment.members || []);

    return reply.status(201).send({
      success: true,
      groupPayment: serialized,
      // Organizer can see emails for payment link distribution
      paymentLinks: (groupPayment.members || []).map((m: any) => ({
        memberId: m.id,
        email: m.email,
        amount: m.amount_due || m.amountDue,
        link: `${process.env.FRONTEND_URL}/group-payment/${groupPayment.id}/${m.id}`
      }))
    });
  }

  async contributeToGroup(request: FastifyRequest, reply: FastifyReply) {
    const { groupId, memberId } = request.params as any;
    const { paymentMethodId } = request.body as any;

    await this.groupPaymentService.recordMemberPayment(
      groupId,
      memberId,
      paymentMethodId
    );

    const status = await this.groupPaymentService.getGroupStatus(groupId);

    return reply.send({
      success: true,
      message: 'Payment recorded successfully',
      groupStatus: status.summary
    });
  }

  async getGroupStatus(request: FastifyRequest, reply: FastifyReply) {
    const { groupId } = request.params as any;

    const status = await this.groupPaymentService.getGroupStatus(groupId);

    // SECURITY: This endpoint has no authentication - return only summary info
    // The summary is pre-computed safe data from the service
    return reply.send({
      group: {
        id: status.group.id,
        eventId: status.group.eventId,
        status: status.group.status,
        expiresAt: status.group.expiresAt,
      },
      summary: status.summary,
    });
  }

  async sendReminders(request: FastifyRequest, reply: FastifyReply) {
    const { groupId } = request.params as any;
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Get group payment to verify organizer
    const group = await this.groupPaymentService.getGroupPayment(groupId);

    if (!group) {
      return reply.status(404).send({ error: 'Group payment not found' });
    }

    // Verify user is the organizer
    if (group.organizerId !== user.id) {
      return reply.status(403).send({
        error: 'Only the organizer can send reminders'
      });
    }

    await this.groupPaymentService.sendReminders(groupId);

    return reply.send({
      success: true,
      message: 'Reminders sent to unpaid members'
    });
  }

  async getContributionHistory(request: FastifyRequest, reply: FastifyReply) {
    const { groupId } = request.params as any;

    const history = await this.contributionTracker.getContributionHistory(groupId);

    // SECURITY: Serialize history - this endpoint has no authentication
    // Filter any sensitive payment data from contribution history
    const safeContributions = (history?.contributions || []).map((entry: any) => ({
      memberId: entry.memberId,
      memberName: entry.memberName,
      amount: entry.amount,
      contributedAt: entry.contributedAt,
      status: entry.status,
      // Note: email and payment details excluded for privacy
    }));

    // Timeline events are already safe summary data
    const safeTimeline = (history?.timeline || []).map((event: any) => ({
      timestamp: event.timestamp,
      event: event.event,
      // Note: details may contain sensitive info, filter carefully
      details: typeof event.details === 'string' ? event.details : undefined,
    }));

    return reply.send({
      contributions: safeContributions,
      timeline: safeTimeline,
    });
  }
}
