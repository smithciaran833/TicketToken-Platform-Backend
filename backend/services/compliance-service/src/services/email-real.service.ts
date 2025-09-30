export class RealEmailService {
  private sgMail: any;
  
  constructor() {
    // In production, uncomment:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // this.sgMail = sgMail;
  }
  
  async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<void> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log(`📧 [MOCK] Email to ${to}: ${subject}`);
      return;
    }
    
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'compliance@tickettoken.com',
      subject,
      html,
      attachments
    };
    
    try {
      await this.sgMail.send(msg);
      console.log(`📧 Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }
  
  async send1099Notification(
    venueEmail: string, 
    venueName: string, 
    year: number, 
    amount: number,
    pdfPath: string
  ): Promise<void> {
    const subject = `Your ${year} Form 1099-K from TicketToken`;
    const html = `
      <h2>Your ${year} Tax Form is Ready</h2>
      <p>Dear ${venueName},</p>
      <p>Your Form 1099-K for tax year ${year} has been generated.</p>
      <p><strong>Total Gross Payments: $${amount.toFixed(2)}</strong></p>
      <p>The form is attached to this email. Please keep it for your tax records.</p>
      <p>This form has also been filed with the IRS.</p>
      <br>
      <p>Best regards,<br>TicketToken Compliance Team</p>
    `;
    
    const attachment = {
      content: Buffer.from(pdfPath).toString('base64'), // In prod: read file
      filename: `1099K_${year}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment'
    };
    
    await this.sendEmail(venueEmail, subject, html, [attachment]);
  }
}

export const realEmailService = new RealEmailService();
