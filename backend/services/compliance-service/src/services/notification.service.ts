import { db } from './database.service';

export class NotificationService {
  async sendEmail(
    to: string, 
    subject: string, 
    template: string, 
    data: any
  ): Promise<void> {
    // In production: Use SendGrid
    console.log(`📧 Email sent to ${to}: ${subject}`);
    console.log(`   Template: ${template}`);
    console.log(`   Data:`, data);
    
    // Log notification
    await db.query(
      `INSERT INTO notification_log 
       (type, recipient, subject, template, status, created_at)
       VALUES ('email', $1, $2, $3, 'sent', NOW())`,
      [to, subject, template]
    );
  }
  
  async sendSMS(to: string, message: string): Promise<void> {
    // In production: Use Twilio
    console.log(`📱 SMS sent to ${to}: ${message}`);
    
    // Log notification
    await db.query(
      `INSERT INTO notification_log 
       (type, recipient, message, status, created_at)
       VALUES ('sms', $1, $2, 'sent', NOW())`,
      [to, message]
    );
  }
  
  async notifyThresholdReached(venueId: string, amount: number): Promise<void> {
    // Get venue details
    const result = await db.query(
      'SELECT * FROM venue_verifications WHERE venue_id = $1',
      [venueId]
    );
    
    if (result.rows.length > 0) {
      const venue = result.rows[0];
      
      await this.sendEmail(
        'venue@example.com', // In production: Get from venue record
        '1099-K Threshold Reached',
        'threshold-reached',
        {
          businessName: venue.business_name,
          amount: amount,
          threshold: 600,
          action: 'Please ensure your W-9 is up to date'
        }
      );
    }
  }
  
  async notifyVerificationStatus(
    venueId: string, 
    status: 'approved' | 'rejected' | 'needs_info'
  ): Promise<void> {
    const templates = {
      approved: 'verification-approved',
      rejected: 'verification-rejected',
      needs_info: 'verification-needs-info'
    };
    
    await this.sendEmail(
      'venue@example.com',
      `Verification ${status}`,
      templates[status],
      { venueId, status }
    );
  }
}

export const notificationService = new NotificationService();
