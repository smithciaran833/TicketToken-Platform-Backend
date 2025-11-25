import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { GroupPaymentService, ContributionTrackerService } from '../services/group';

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

    return reply.status(201).send({
      success: true,
      groupPayment,
      paymentLinks: groupPayment.members.map(m => ({
        memberId: m.id,
        email: m.email,
        amount: m.amountDue,
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

    return reply.send(status);
  }

  async sendReminders(request: FastifyRequest, reply: FastifyReply) {
    const { groupId } = request.params as any;
    const user = (request as any).user;

    // Verify organizer
    // TODO: Make getGroupPayment public or add a public method
    const group = { organizerId: "" }; // await this.groupPaymentService.getGroupPayment(groupId);
    
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    
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

    return reply.send(history);
  }
}
