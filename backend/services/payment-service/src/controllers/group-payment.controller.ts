import { serviceCache } from '../services/cache-integration';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GroupPaymentService, ContributionTrackerService } from '../services/group';

export class GroupPaymentController {
  private groupPaymentService: GroupPaymentService;
  private contributionTracker: ContributionTrackerService;
  
  constructor() {
    this.groupPaymentService = new GroupPaymentService();
    this.contributionTracker = new ContributionTrackerService();
  }
  
  async createGroup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { eventId, ticketSelections, members } = req.body;
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const organizerId = req.user.id;
      
      const groupPayment = await this.groupPaymentService.createGroupPayment(
        organizerId,
        eventId,
        ticketSelections,
        members
      );
      
      res.status(201).json({
        success: true,
        groupPayment,
        paymentLinks: groupPayment.members.map(m => ({
          memberId: m.id,
          email: m.email,
          amount: m.amountDue,
          link: `${process.env.FRONTEND_URL}/group-payment/${groupPayment.id}/${m.id}`
        }))
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async contributeToGroup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { groupId, memberId } = req.params;
      const { paymentMethodId } = req.body;
      
      await this.groupPaymentService.recordMemberPayment(
        groupId,
        memberId,
        paymentMethodId
      );
      
      const status = await this.groupPaymentService.getGroupStatus(groupId);
      
      res.json({
        success: true,
        message: 'Payment recorded successfully',
        groupStatus: status.summary
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async getGroupStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { groupId } = req.params;
      
      const status = await this.groupPaymentService.getGroupStatus(groupId);
      
      res.json(status);
    } catch (error) {
      return next(error);
    }
  }
  
  async sendReminders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { groupId } = req.params;
      
      // Verify organizer
      // TODO: Make getGroupPayment public or add a public method
      const group = { organizerId: "" }; // await this.groupPaymentService.getGroupPayment(groupId);
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (group.organizerId !== req.user.id) {
        return res.status(403).json({
          error: 'Only the organizer can send reminders'
        });
      }
      
      await this.groupPaymentService.sendReminders(groupId);
      
      res.json({
        success: true,
        message: 'Reminders sent to unpaid members'
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async getContributionHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { groupId } = req.params;
      
      const history = await this.contributionTracker.getContributionHistory(groupId);
      
      res.json(history);
    } catch (error) {
      return next(error);
    }
  }
}
