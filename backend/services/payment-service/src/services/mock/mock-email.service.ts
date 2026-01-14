import { logger } from '../../utils/logger';

const log = logger.child({ component: 'MockEmailService' });

export class MockEmailService {
  async sendEmail(to: string, subject: string, body: string) {
    log.info({ to, subject, body }, 'Mock email sent');
    
    return {
      id: `email_${Date.now()}`,
      to,
      subject,
      status: 'sent',
      mockData: true
    };
  }

  async sendGroupPaymentInvite(email: string, groupId: string, amount: number) {
    return this.sendEmail(
      email,
      'You have been invited to a group payment',
      `Please pay $${amount} for your ticket. Link: http://localhost:3000/group/${groupId}`
    );
  }
}
