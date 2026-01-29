import { v4 as uuidv4 } from 'uuid';
import { GroupPayment, GroupMember, GroupPaymentStatus, TicketSelection } from '../../types';
import { query, getClient } from '../../config/database';
import Bull from 'bull';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'GroupPayment' });

/**
 * SECURITY: Explicit field lists to prevent SELECT * from exposing sensitive data.
 */

// Safe group payment fields (excludes ticket_selections which contains pricing details)
const SAFE_GROUP_PAYMENT_FIELDS = [
  'id',
  'tenant_id',
  'organizer_id',
  'event_id',
  'total_amount',
  'status',
  'expires_at',
  'completed_at',
  'cancelled_at',
  'created_at',
  'updated_at',
].join(', ');

// All group payment fields for internal operations
const ALL_GROUP_PAYMENT_FIELDS = [
  'id',
  'tenant_id',
  'organizer_id',
  'event_id',
  'total_amount',
  'ticket_selections',
  'status',
  'expires_at',
  'completed_at',
  'cancelled_at',
  'cancellation_reason',
  'created_at',
  'updated_at',
].join(', ');

// Safe member fields (excludes payment_id, email visible only to organizer)
const SAFE_MEMBER_FIELDS = [
  'id',
  'tenant_id',
  'group_payment_id',
  'name',
  'amount_due',
  'ticket_count',
  'paid',
  'paid_at',
  'status',
  'created_at',
  'updated_at',
].join(', ');

// Member fields for organizer view (includes email)
const ORGANIZER_MEMBER_FIELDS = [
  'id',
  'tenant_id',
  'group_payment_id',
  'email',
  'name',
  'amount_due',
  'ticket_count',
  'paid',
  'paid_at',
  'reminders_sent',
  'status',
  'created_at',
  'updated_at',
].join(', ');

// All member fields for internal operations
const ALL_MEMBER_FIELDS = [
  'id',
  'tenant_id',
  'group_payment_id',
  'user_id',
  'email',
  'name',
  'amount_due',
  'ticket_count',
  'paid',
  'paid_at',
  'payment_id',
  'reminders_sent',
  'status',
  'created_at',
  'updated_at',
].join(', ');

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

      // SECURITY: Use explicit RETURNING fields, not *
      const groupQuery = `
        INSERT INTO group_payments (
          id, organizer_id, event_id, total_amount,
          ticket_selections, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${ALL_GROUP_PAYMENT_FIELDS}
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

        // SECURITY: Use explicit RETURNING fields, not *
        const memberQuery = `
          INSERT INTO group_payment_members (
            id, group_payment_id, email, name,
            amount_due, ticket_count
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING ${ORGANIZER_MEMBER_FIELDS}
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

      // SECURITY: Select only fields needed for payment processing
      const memberQuery = `
        SELECT id, group_payment_id, amount_due, paid, email, name
        FROM group_payment_members
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

      const group = await this.getGroupPaymentInternal(groupId);

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
    const group = await this.getGroupPaymentInternal(groupId);

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

  /**
   * Get group payment - INTERNAL version with all fields.
   * Use for service layer operations that need ticket_selections.
   */
  private async getGroupPaymentInternal(groupId: string): Promise<GroupPayment> {
    // SECURITY: Use explicit field list instead of SELECT *
    const groupResult = await query(
      `SELECT ${ALL_GROUP_PAYMENT_FIELDS} FROM group_payments WHERE id = $1`,
      [groupId]
    );

    // SECURITY: Use organizer fields (includes email for internal processing)
    const membersResult = await query(
      `SELECT ${ORGANIZER_MEMBER_FIELDS} FROM group_payment_members WHERE group_payment_id = $1`,
      [groupId]
    );

    return {
      ...groupResult.rows[0],
      members: membersResult.rows
    };
  }

  /**
   * Get unpaid members for reminder processing.
   * INTERNAL: Needs email for sending reminders.
   */
  private async getUnpaidMembers(groupId: string): Promise<GroupMember[]> {
    // SECURITY: Use explicit field list, includes email for reminders
    const result = await query(
      `SELECT ${ORGANIZER_MEMBER_FIELDS} FROM group_payment_members
       WHERE group_payment_id = $1 AND paid = false`,
      [groupId]
    );

    return result.rows;
  }

  /**
   * Get group payment by ID - PUBLIC version with safe fields.
   * Use for authorization checks and external API responses.
   */
  async getGroupPayment(groupId: string): Promise<GroupPayment | null> {
    // SECURITY: Use safe fields - excludes ticket_selections and sensitive data
    const groupResult = await query(
      `SELECT ${SAFE_GROUP_PAYMENT_FIELDS} FROM group_payments WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return null;
    }

    const row = groupResult.rows[0];
    // Map database snake_case to TypeScript camelCase
    return {
      id: row.id,
      organizerId: row.organizer_id,
      eventId: row.event_id,
      totalAmount: parseInt(row.total_amount) || 0,
      ticketSelections: [], // Not included in safe fields
      members: [], // Not fetched in this method
      expiresAt: row.expires_at,
      status: row.status,
      createdAt: row.created_at,
    } as GroupPayment;
  }

  /**
   * Get group status for external API.
   * Returns summary data without sensitive internal fields.
   */
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
    // SECURITY: Use safe fields for external-facing method
    const groupResult = await query(
      `SELECT ${SAFE_GROUP_PAYMENT_FIELDS} FROM group_payments WHERE id = $1`,
      [groupId]
    );

    // SECURITY: Use safe member fields (no email for external view)
    const membersResult = await query(
      `SELECT ${SAFE_MEMBER_FIELDS} FROM group_payment_members WHERE group_payment_id = $1`,
      [groupId]
    );

    const group = {
      ...groupResult.rows[0],
      members: membersResult.rows
    };

    const paidMembers = group.members.filter((m: any) => m.paid);
    const totalCollected = paidMembers.reduce((sum: number, m: any) => sum + (m.amount_due || 0), 0);

    return {
      group,
      summary: {
        totalMembers: group.members.length,
        paidMembers: paidMembers.length,
        totalExpected: group.total_amount || 0,
        totalCollected,
        percentageCollected: group.total_amount ? (totalCollected / group.total_amount) * 100 : 0
      }
    };
  }
}
