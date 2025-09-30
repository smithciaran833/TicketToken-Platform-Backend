import { query } from '../../config/database';

export class ContributionTrackerService {
  async trackContribution(
    groupId: string,
    memberId: string,
    amount: number,
    paymentId: string
  ): Promise<void> {
    const trackingQuery = `
      INSERT INTO group_contributions (
        group_id, member_id, amount, payment_id,
        status, contributed_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `;
    
    await query(trackingQuery, [
      groupId,
      memberId,
      amount,
      paymentId,
      'completed'
    ]);
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
    // Get all contributions
    const contributionsQuery = `
      SELECT 
        c.member_id,
        m.name as member_name,
        c.amount,
        c.contributed_at,
        c.status
      FROM group_contributions c
      JOIN group_payment_members m ON c.member_id = m.id
      WHERE c.group_id = $1
      ORDER BY c.contributed_at DESC
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
        contributed_at as timestamp,
        'member_paid' as event,
        json_build_object('member_id', member_id, 'amount', amount) as details
      FROM group_contributions
      WHERE group_id = $1
      
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
    // Record failed attempt
    await query(
      `INSERT INTO group_contribution_failures 
       (group_id, member_id, reason, failed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [groupId, memberId, reason]
    );
    
    // Check if member has too many failures
    const failureCount = await this.getFailureCount(groupId, memberId);
    
    if (failureCount >= 3) {
      // Mark member as problematic
      await query(
        `UPDATE group_payment_members 
         SET status = 'payment_failed', 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND group_payment_id = $2`,
        [memberId, groupId]
      );
    }
  }
  
  private async getFailureCount(
    groupId: string,
    memberId: string
  ): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count 
       FROM group_contribution_failures 
       WHERE group_id = $1 AND member_id = $2`,
      [groupId, memberId]
    );
    
    return parseInt(result.rows[0].count);
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
      totalGroups: parseInt(statsRow.total_groups),
      successRate: (parseInt(statsRow.successful_groups) / parseInt(statsRow.total_groups)) * 100,
      averageGroupSize: parseFloat(statsRow.avg_group_size),
      averageCompletionTime: parseFloat(statsRow.avg_completion_minutes),
      commonFailureReasons: failures.rows
    };
  }
}
