import crypto from 'crypto';
import { Resend } from 'resend';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { redisKeys } from '../utils/redisKeys';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY || 'key_placeholder_for_dev');
  }

  async sendVerificationEmail(userId: string, email: string, firstName: string, tenantId?: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');

    // Store token in Redis with tenant prefix
    const redis = getRedis();
    await redis.setex(
      redisKeys.emailVerify(token, tenantId),
      24 * 60 * 60,
      JSON.stringify({ userId, email, tenantId })
    );

    const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;

    const template: EmailTemplate = {
      subject: 'Verify your TicketToken account',
      html: `
        <h2>Welcome to TicketToken, ${firstName}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        <p>Or copy this link: ${verifyUrl}</p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `,
      text: `Welcome to TicketToken, ${firstName}!

Please verify your email address by visiting:
${verifyUrl}

This link expires in 24 hours.

If you didn't create this account, please ignore this email.`
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordResetEmail(userId: string, email: string, firstName: string, tenantId?: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');

    // Store token in Redis with tenant prefix
    const redis = getRedis();
    await redis.setex(
      redisKeys.passwordReset(token, tenantId),
      60 * 60,
      JSON.stringify({ userId, email, tenantId })
    );

    const resetUrl = `${env.API_GATEWAY_URL}/auth/reset-password?token=${token}`;

    const template: EmailTemplate = {
      subject: 'Reset your TicketToken password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
      `,
      text: `Password Reset Request

Hi ${firstName},

We received a request to reset your password. Visit the link below to create a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email and your password will remain unchanged.`
    };

    await this.sendEmail(email, template);
  }

  async sendMFABackupCodesEmail(email: string, firstName: string, backupCodes: string[]): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Your TicketToken MFA backup codes',
      html: `
        <h2>MFA Backup Codes</h2>
        <p>Hi ${firstName},</p>
        <p>Here are your MFA backup codes. Store them safely:</p>
        <ul>
          ${backupCodes.map(code => `<li><code>${code}</code></li>`).join('')}
        </ul>
        <p>Each code can only be used once. Keep them secure!</p>
      `,
      text: `MFA Backup Codes

Hi ${firstName},

Here are your MFA backup codes. Store them safely:

${backupCodes.join('\n')}

Each code can only be used once. Keep them secure!`
    };

    await this.sendEmail(email, template);
  }

  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      console.log('📧 Email would be sent:', {
        to,
        subject: template.subject,
        preview: template.text.substring(0, 100) + '...'
      });
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: env.EMAIL_FROM,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      if (error) {
        console.error('Resend email error:', error);
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log('✅ Email sent successfully via Resend:', data?.id);
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send email. Please try again later.');
    }
  }
}
