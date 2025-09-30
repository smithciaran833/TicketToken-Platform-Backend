import { AuthExtendedService } from '../services/auth-extended.service';

export class AuthExtendedController {
  constructor(
    private authExtendedService: AuthExtendedService
  ) {}

  async forgotPassword(request: any, reply: any) {
    const { email } = request.body;
    const ipAddress = request.ip;

    await this.authExtendedService.requestPasswordReset(email, ipAddress);

    // Always return success to prevent email enumeration
    reply.send({
      message: 'If an account exists with this email, you will receive password reset instructions.'
    });
  }

  async resetPassword(request: any, reply: any) {
    const { token, password } = request.body;
    const ipAddress = request.ip;

    await this.authExtendedService.resetPassword(token, password, ipAddress);

    reply.send({
      message: 'Password has been reset successfully'
    });
  }

  async verifyEmail(request: any, reply: any) {
    const { token } = request.query;

    await this.authExtendedService.verifyEmail(token);

    reply.send({
      message: 'Email verified successfully'
    });
  }

  async resendVerification(request: any, reply: any) {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    await this.authExtendedService.resendVerificationEmail(request.user.id);

    reply.send({
      message: 'Verification email sent'
    });
  }

  async changePassword(request: any, reply: any) {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = request.body;

    await this.authExtendedService.changePassword(
      request.user.id,
      currentPassword,
      newPassword
    );

    reply.send({
      message: 'Password changed successfully'
    });
  }
}
