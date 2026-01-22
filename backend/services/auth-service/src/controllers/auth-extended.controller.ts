import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthExtendedService } from '../services/auth-extended.service';
import { AuthenticationError, ValidationError } from '../errors';

export class AuthExtendedController {
  private authExtendedService: AuthExtendedService;

  constructor(authExtendedService: AuthExtendedService) {
    this.authExtendedService = authExtendedService;
  }

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email } = request.body as { email: string };
      await this.authExtendedService.forgotPassword(email);
      reply.send({
        message: 'If an account exists with that email, a password reset link has been sent'
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      // Always return success to prevent email enumeration
      reply.send({
        message: 'If an account exists with that email, a password reset link has been sent'
      });
    }
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { token, newPassword } = request.body as { token: string; newPassword: string };
      await this.authExtendedService.resetPassword(token, newPassword);
      reply.send({
        message: 'Password reset successfully'
      });
    } catch (error: any) {
      console.error('Reset password error:', error);
      return reply.status(400).send({
        error: error.message || 'Invalid or expired reset token'
      });
    }
  }

  async verifyEmail(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { token } = request.query as { token: string };
      await this.authExtendedService.verifyEmail(token);
      reply.send({
        message: 'Email verified successfully'
      });
    } catch (error: any) {
      console.error('Verify email error:', error);
      return reply.status(400).send({
        error: error.message || 'Invalid or expired verification token'
      });
    }
  }

  async resendVerification(request: any, reply: any) {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      await this.authExtendedService.resendVerificationEmail(request.user.id);
      reply.send({
        message: 'Verification email sent'
      });
    } catch (error: any) {
      console.error('Resend verification error:', error);
      return reply.status(400).send({
        error: error.message || 'Failed to resend verification email'
      });
    }
  }

  async changePassword(request: any, reply: any) {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      const { currentPassword, newPassword } = request.body;
      
      // Pass request metadata for session management
      await this.authExtendedService.changePassword(
        request.user.id,
        currentPassword,
        newPassword,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          tenantId: request.user.tenant_id
        }
      );
      
      reply.send({
        message: 'Password changed successfully. You have been logged out of other devices.'
      });
    } catch (error: any) {
      // Handle authentication errors (wrong current password)
      if (error instanceof AuthenticationError || error.message?.includes('incorrect') || error.message?.includes('Current password')) {
        return reply.status(401).send({
          error: error.message || 'Current password is incorrect'
        });
      }
      // Handle validation errors (weak password, same password)
      if (error instanceof ValidationError || error.message?.includes('must') || error.message?.includes('different')) {
        return reply.status(400).send({
          error: error.errors?.[0] || error.message || 'Invalid password'
        });
      }
      console.error('Change password error:', error);
      return reply.status(500).send({
        error: 'Failed to change password'
      });
    }
  }
}
