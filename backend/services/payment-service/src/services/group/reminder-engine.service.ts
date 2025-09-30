import Bull from 'bull';
import { config } from '../../config';
import { query } from '../../config/database';

export class ReminderEngineService {
  private reminderQueue: Bull.Queue;
  
  constructor() {
    this.reminderQueue = new Bull('payment-reminders', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.setupProcessor();
  }
  
  async scheduleReminders(groupId: string): Promise<void> {
    // Schedule reminders at:
    // - 5 minutes after creation
    // - 8 minutes after creation
    // - 9.5 minutes after creation (final warning)
    
    const delays = [5 * 60 * 1000, 8 * 60 * 1000, 9.5 * 60 * 1000];
    
    for (let i = 0; i < delays.length; i++) {
      await this.reminderQueue.add(
        'send-group-reminder',
        {
          groupId,
          reminderNumber: i + 1,
          isFinal: i === delays.length - 1
        },
        {
          delay: delays[i],
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 5000
          }
        }
      );
    }
  }
  
  private setupProcessor() {
    this.reminderQueue.process('send-group-reminder', async (job) => {
      const { groupId, reminderNumber, isFinal } = job.data;
      
      // Get unpaid members
      const unpaidQuery = `
        SELECT 
          m.*,
          g.expires_at,
          g.event_id,
          e.name as event_name
        FROM group_payment_members m
        JOIN group_payments g ON m.group_payment_id = g.id
        JOIN events e ON g.event_id = e.id
        WHERE g.id = $1 AND m.paid = false
      `;
      
      const unpaidMembers = await query(unpaidQuery, [groupId]);
      
      if (unpaidMembers.rows.length === 0) {
        return { status: 'no_unpaid_members' };
      }
      
      // Send reminders
      for (const member of unpaidMembers.rows) {
        await this.sendReminder(member, reminderNumber, isFinal);
      }
      
      // Update reminder count
      await query(
        `UPDATE group_payment_members 
         SET reminders_sent = $2 
         WHERE group_payment_id = $1 AND paid = false`,
        [groupId, reminderNumber]
      );
      
      return {
        status: 'sent',
        count: unpaidMembers.rows.length
      };
    });
  }
  
  private async sendReminder(
    member: any,
    reminderNumber: number,
    isFinal: boolean
  ): Promise<void> {
    const timeRemaining = new Date(member.expires_at).getTime() - Date.now();
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    
    const template = this.getReminderTemplate(
      reminderNumber,
      isFinal,
      minutesRemaining
    );
    
    // In production, integrate with email service
    console.log(`Sending reminder #${reminderNumber} to ${member.email}`);
    console.log(`Event: ${member.event_name}`);
    console.log(`Amount due: $${member.amount_due}`);
    console.log(`Time remaining: ${minutesRemaining} minutes`);
    console.log(`Message: ${template.subject}`);
    
    // Record reminder sent
    await query(
      `INSERT INTO reminder_history 
       (group_id, member_id, reminder_number, sent_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [member.group_payment_id, member.id, reminderNumber]
    );
  }
  
  private getReminderTemplate(
    reminderNumber: number,
    isFinal: boolean,
    minutesRemaining: number
  ): { subject: string; urgency: string } {
    if (isFinal) {
      return {
        subject: `FINAL REMINDER: ${minutesRemaining} minutes left to secure your tickets!`,
        urgency: 'critical'
      };
    }
    
    switch (reminderNumber) {
      case 1:
        return {
          subject: `Reminder: Complete your ticket payment (${minutesRemaining} minutes remaining)`,
          urgency: 'normal'
        };
      case 2:
        return {
          subject: `Don't miss out! Only ${minutesRemaining} minutes left to pay`,
          urgency: 'high'
        };
      default:
        return {
          subject: `Payment reminder for your tickets`,
          urgency: 'normal'
        };
    }
  }
  
  async getReminderEffectiveness(venueId: string): Promise<{
    reminderStats: Array<{
      reminderNumber: number;
      conversionRate: number;
      averageResponseTime: number;
    }>;
    optimalTiming: {
      firstReminder: number;
      secondReminder: number;
      finalReminder: number;
    };
  }> {
    // Analyze reminder effectiveness
    const statsQuery = `
      SELECT 
        rh.reminder_number,
        COUNT(DISTINCT rh.member_id) as reminders_sent,
        COUNT(DISTINCT CASE WHEN m.paid = true THEN m.id END) as conversions,
        AVG(EXTRACT(EPOCH FROM (m.paid_at - rh.sent_at))/60) as avg_response_minutes
      FROM reminder_history rh
      JOIN group_payment_members m ON rh.member_id = m.id
      JOIN group_payments g ON m.group_payment_id = g.id
      JOIN events e ON g.event_id = e.id
      WHERE e.venue_id = $1
      GROUP BY rh.reminder_number
      ORDER BY rh.reminder_number
    `;
    
    const stats = await query(statsQuery, [venueId]);
    
    const reminderStats = stats.rows.map(row => ({
      reminderNumber: row.reminder_number,
      conversionRate: (row.conversions / row.reminders_sent) * 100,
      averageResponseTime: parseFloat(row.avg_response_minutes) || 0
    }));
    
    // Calculate optimal timing based on historical data
    // This is simplified - in production would use ML
    const optimalTiming = {
      firstReminder: 5,   // 5 minutes
      secondReminder: 8,  // 8 minutes
      finalReminder: 9.5  // 9.5 minutes
    };
    
    return {
      reminderStats,
      optimalTiming
    };
  }
}
