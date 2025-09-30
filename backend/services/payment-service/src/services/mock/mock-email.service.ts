export class MockEmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`
📧 Mock Email Sent:
To: ${to}
Subject: ${subject}
Body: ${body}
Timestamp: ${new Date().toISOString()}
    `);
    
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
