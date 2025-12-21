import { query } from '../../config/database';

export class ContributionTrackerService {
  async trackContribution(
    groupId: string,
    memberId: string,
    amount: number,
    paymentId: string
  ): Promise<void> {
    // Contribution data is stored in group_payment_members table
    const trackingQuery = `
      UPDATE group_payment_members
      SET paid = true,
          paid_at = CURRENT_TIMESTAMP,
          payment_id = $4,
          status = 'completed'
      WHERE group_payment_id = $1 AND id = $2
    `;

    await query(trackingQuery, [groupId, memberId, amount, paymentId]);
  }

  async getContributionHistory(groupId: string): Promise<{
    contributions: Array<{
      memberId: string;
      memberName: string;
      amount: number;
      contributedAt: Date;
      status: string;
    }>;
    timeline: Array<{
      timestamp: Date;
      event: string;
      details: any;
    }>;
  }> {
    // Get all contributions from group_payment_members (paid members)
    const contributionsQuery = `
      SELECT
        m.id as member_id,
        m.name as member_name,
        m.amount_due as amount,
        m.paid_at as contributed_at,
        m.status
      FROM group_payment_members m
      WHERE m.group_payment_id = $1 AND m.paid = true
      ORDER BY m.paid_at DESC
    `;

    const contributions = await query(contributionsQuery, [groupId]);

    // Build timeline
    const timelineQuery = `
      SELECT
        created_at as timestamp,
        'group_created' as event,
        json_build_object('total_amount', total_amount) as details
      FROM group_payments
      WHERE id = $1

      UNION ALL

      SELECT
        paid_at as timestamp,
        'member_paid' as event,
        json_build_object('member_id', id, 'amount', amount_due) as details
      FROM group_payment_members
      WHERE group_payment_id = $1 AND paid = true

      ORDER BY timestamp ASC
    `;

    const timeline = await query(timelineQuery, [groupId]);

    return {
      contributions: contributions.rows,
      timeline: timeline.rows
    };
  }

  async handleFailedContribution(
    groupId: string,
    memberId: string,
    reason: string
  ): Promise<void> {
    // Record failed attempt by updating member status
    // Note: We track failure count in reminders_sent field repurposed, 
    // or we just mark as failed after any failure
    await query(
      `UPDATE group_payment_members
       SET status = 'payment_failed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND group_payment_id = $2`,
      [memberId, groupId]
    );
  }

  private async getFailureCount(
    groupId: string,
    memberId: string
  ): Promise<number> {
    // Count based on status being payment_failed
    const result = await query(
      `SELECT CASE WHEN status = 'payment_failed' THEN 1 ELSE 0 END as count
       FROM group_payment_members
       WHERE group_payment_id = $1 AND id = $2`,
      [groupId, memberId]
    );

    return result.rows[0]?.count || 0;
  }

  async getGroupAnalytics(venueId: string): Promise<{
    totalGroups: number;
    successRate: number;
    averageGroupSize: number;
    averageCompletionTime: number;
    commonFailureReasons: Array<{
      reason: string;
      count: number;
    }>;
  }> {
    // Get overall stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_groups,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_groups,
        AVG(member_count) as avg_group_size,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_completion_minutes
      FROM (
        SELECT
          gp.*,
          COUNT(gpm.id) as member_count
        FROM group_payments gp
        JOIN group_payment_members gpm ON gp.id = gpm.group_payment_id
        JOIN events e ON gp.event_id = e.id
        WHERE e.venue_id = $1
        GROUP BY gp.id
      ) as group_stats
    `;

    const stats = await query(statsQuery, [venueId]);

    // Get failure reasons
    const failuresQuery = `
      SELECT
        cancellation_reason as reason,
        COUNT(*) as count
      FROM group_payments gp
      JOIN events e ON gp.event_id = e.id
      WHERE e.venue_id = $1
        AND gp.status = 'cancelled'
        AND gp.cancellation_reason IS NOT NULL
      GROUP BY cancellation_reason
      ORDER BY count DESC
      LIMIT 5
    `;

    const failures = await query(failuresQuery, [venueId]);

    const statsRow = stats.rows[0];
    return {
      totalGroups: parseInt(statsRow.total_groups) || 0,
      successRate: statsRow.total_groups > 0 
        ? (parseInt(statsRow.successful_groups) / parseInt(statsRow.total_groups)) * 100 
        : 0,
      averageGroupSize: parseFloat(statsRow.avg_group_size) || 0,
      averageCompletionTime: parseFloat(statsRow.avg_completion_minutes) || 0,
      commonFailureReasons: failures.rows
    };
  }
}
