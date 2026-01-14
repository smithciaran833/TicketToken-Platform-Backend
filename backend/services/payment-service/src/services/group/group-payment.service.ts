import { v4 as uuidv4 } from 'uuid';
import { GroupPayment, GroupMember, GroupPaymentStatus, TicketSelection } from '../../types';
import { query, getClient } from '../../config/database';
import Bull from 'bull';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'GroupPayment' });

export class GroupPaymentService {
  private reminderQueue: Bull.Queue;
  private expiryQueue: Bull.Queue;

  constructor() {
    this.reminderQueue = new Bull('group-payment-reminders', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });

    this.expiryQueue = new Bull('group-payment-expiry', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });

    this.setupQueues();
  }

  async createGroupPayment(
    organizerId: string,
    eventId: string,
    ticketSelections: TicketSelection[],
    members: Array<{ email: string; name: string; ticketCount: number }>
  ): Promise<GroupPayment> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const totalAmount = ticketSelections.reduce(
        (sum, ts) => sum + (ts.price * ts.quantity),
        0
      );

      const totalTickets = ticketSelections.reduce(
        (sum, ts) => sum + ts.quantity,
        0
      );

      const pricePerTicket = totalAmount / totalTickets;

      const groupId = uuidv4();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const groupQuery = `
        INSERT INTO group_payments (
          id, organizer_id, event_id, total_amount,
          ticket_selections, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const groupValues = [
        groupId,
        organizerId,
        eventId,
        totalAmount,
        JSON.stringify(ticketSelections),
        expiresAt,
        GroupPaymentStatus.COLLECTING
      ];

      const groupResult = await client.query(groupQuery, groupValues);
      const groupPayment = groupResult.rows[0];

      const groupMembers: GroupMember[] = [];

      for (const member of members) {
        const memberId = uuidv4();
        const amountDue = pricePerTicket * member.ticketCount;

        const memberQuery = `
          INSERT INTO group_payment_members (
            id, group_payment_id, email, name,
            amount_due, ticket_count
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;

        const memberValues = [
          memberId,
          groupId,
          member.email,
          member.name,
          amountDue,
          member.ticketCount
        ];

        const memberResult = await client.query(memberQuery, memberValues);
        groupMembers.push({
          ...memberResult.rows[0],
          paid: false,
          remindersSent: 0
        });
      }

      await client.query('COMMIT');

      await this.expiryQueue.add(
        'check-expiry',
        { groupId },
        { delay: 10 * 60 * 1000 }
      );

      await this.sendGroupInvitations(groupPayment, groupMembers);

      return {
        ...groupPayment,
        members: groupMembers
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async recordMemberPayment(
    groupId: string,
    memberId: string,
    paymentMethodId: string
  ): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const memberQuery = `
        SELECT * FROM group_payment_members
        WHERE id = $1 AND group_payment_id = $2
      `;
      const memberResult = await client.query(memberQuery, [memberId, groupId]);
      const member = memberResult.rows[0];

      if (!member) {
        throw new Error('Member not found');
      }

      if (member.paid) {
        throw new Error('Member already paid');
      }

      const paymentId = await this.processMemberPayment(
        member,
        paymentMethodId
      );

      const updateQuery = `
        UPDATE group_payment_members
        SET paid = true,
            paid_at = CURRENT_TIMESTAMP,
            payment_id = $3
        WHERE id = $1 AND group_payment_id = $2
      `;
      await client.query(updateQuery, [memberId, groupId, paymentId]);

      const statusCheck = await client.query(
        `SELECT COUNT(*) as unpaid FROM group_payment_members
         WHERE group_payment_id = $1 AND paid = false`,
        [groupId]
      );

      if (parseInt(statusCheck.rows[0].unpaid) === 0) {
        await client.query(
          `UPDATE group_payments
           SET status = $2, completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [groupId, GroupPaymentStatus.COMPLETED]
        );

        await this.completePurchase(groupId);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async sendReminders(groupId: string): Promise<void> {
    const unpaidMembers = await this.getUnpaidMembers(groupId);

    for (const member of unpaidMembers) {
      if (member.remindersSent < 3) {
        await this.reminderQueue.add('send-reminder', {
          groupId,
          memberId: member.id,
          email: member.email,
          name: member.name,
          amountDue: member.amountDue
        });

        await query(
          `UPDATE group_payment_members
           SET reminders_sent = reminders_sent + 1
           WHERE id = $1`,
          [member.id]
        );
      }
    }
  }

  async handleExpiredGroup(groupId: string): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const group = await this.getGroupPayment(groupId);

      if (group.status !== GroupPaymentStatus.COLLECTING) {
        return;
      }

      const paidMembers = group.members.filter(m => m.paid);

      if (paidMembers.length === 0) {
        await this.cancelGroup(groupId, 'expired_no_payment');
      } else {
        await this.processPartialGroup(groupId, paidMembers);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  private setupQueues() {
    this.reminderQueue.process('send-reminder', async (job) => {
      const { email, name, amountDue } = job.data;

      log.info({ email, name, amountDue }, 'Sending group payment reminder');

      return { sent: true };
    });

    this.expiryQueue.process('check-expiry', async (job) => {
      const { groupId } = job.data;
      await this.handleExpiredGroup(groupId);
      return { processed: true };
    });
  }

  private async sendGroupInvitations(
    group: GroupPayment,
    members: GroupMember[]
  ): Promise<void> {
    for (const member of members) {
      const paymentLink = this.generatePaymentLink(group.id, member.id);

      log.info({
        name: member.name,
        email: member.email,
        paymentLink,
        amountDue: member.amountDue
      }, 'Sending group payment invitation');
    }
  }

  private generatePaymentLink(groupId: string, memberId: string): string {
    return `https://tickettoken.com/group-payment/${groupId}/${memberId}`;
  }

  private async processMemberPayment(
    member: any,
    paymentMethodId: string
  ): Promise<string> {
    return `payment_${uuidv4()}`;
  }

  private async completePurchase(groupId: string): Promise<void> {
    const group = await this.getGroupPayment(groupId);

    log.info({
      groupId,
      totalAmount: group.totalAmount,
      ticketSelections: group.ticketSelections
    }, 'Completing group purchase');
  }

  private async cancelGroup(groupId: string, reason: string): Promise<void> {
    await query(
      `UPDATE group_payments
       SET status = $2,
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $3
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.CANCELLED, reason]
    );
  }

  private async processPartialGroup(
    groupId: string,
    paidMembers: GroupMember[]
  ): Promise<void> {
    await query(
      `UPDATE group_payments
       SET status = $2
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.PARTIALLY_PAID]
    );

    log.info({
      groupId,
      paidMemberCount: paidMembers.length
    }, 'Processing partial group payment');
  }

  private async getGroupPayment(groupId: string): Promise<GroupPayment> {
    const groupResult = await query(
      'SELECT * FROM group_payments WHERE id = $1',
      [groupId]
    );

    const membersResult = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1',
      [groupId]
    );

    return {
      ...groupResult.rows[0],
      members: membersResult.rows
    };
  }

  private async getUnpaidMembers(groupId: string): Promise<GroupMember[]> {
    const result = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1 AND paid = false',
      [groupId]
    );

    return result.rows;
  }

  async getGroupStatus(groupId: string): Promise<{
    group: GroupPayment;
    summary: {
      totalMembers: number;
      paidMembers: number;
      totalExpected: number;
      totalCollected: number;
      percentageCollected: number;
    };
  }> {
    const group = await this.getGroupPayment(groupId);

    const paidMembers = group.members.filter(m => m.paid);
    const totalCollected = paidMembers.reduce((sum, m) => sum + m.amountDue, 0);

    return {
      group,
      summary: {
        totalMembers: group.members.length,
        paidMembers: paidMembers.length,
        totalExpected: group.totalAmount,
        totalCollected,
        percentageCollected: (totalCollected / group.totalAmount) * 100
      }
    };
  }
}
