import { AuthExtendedService } from '../services/auth-extended.service';
import { ValidationError, AuthenticationError } from '../errors';

export class AuthExtendedController {
  constructor(
    private authExtendedService: AuthExtendedService
  ) {}

  async forgotPassword(request: any, reply: any) {
    try {
      const { email } = request.body;
      const ipAddress = request.ip;

      await this.authExtendedService.requestPasswordReset(email, ipAddress);

      // Always return success to prevent email enumeration
      reply.send({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    } catch (error: any) {
      // Handle rate limit errors
      if (error.message?.includes('rate limit') || error.message?.includes('Too many')) {
        return reply.status(429).send({
          error: 'Too many password reset requests. Please try again later.'
        });
      }

      // For all other errors, return generic message to prevent enumeration
      return reply.status(200).send({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    }
  }

  async resetPassword(request: any, reply: any) {
    try {
      const { token, newPassword } = request.body;
      const ipAddress = request.ip;

      await this.authExtendedService.resetPassword(token, newPassword, ipAddress);

      reply.send({
        message: 'Password has been reset successfully'
      });
    } catch (error: any) {
      // Log the raw error FIRST before any processing/sanitization
      console.error('Password reset error - Raw error:', {
        name: error.name,
        message: error.message,
        type: error.constructor.name,
        errors: error.errors,
        stack: error.stack?.split('\n').slice(0, 3) // First 3 lines of stack
      });

      // Handle validation errors (expired/invalid token, weak password)
      if (error instanceof ValidationError || error.message?.includes('expired') || error.message?.includes('Invalid')) {
        return reply.status(400).send({
          error: error.errors?.[0] || error.message || 'Invalid or expired reset token'
        });
      }

      // If we reach here, it's an unexpected error - already logged above
      return reply.status(500).send({
        error: 'Failed to reset password'
      });
    }
  }

  async verifyEmail(request: any, reply: any) {
    try {
      const { token } = request.query;

      if (!token) {
        return reply.status(400).send({
          error: 'Verification token is required'
        });
      }

      await this.authExtendedService.verifyEmail(token as string);

      reply.send({
        message: 'Email verified successfully'
      });
    } catch (error: any) {
      // Handle validation errors (invalid/expired token)
      if (error instanceof ValidationError || error.message?.includes('Invalid') || error.message?.includes('expired')) {
        return reply.status(400).send({
          error: error.errors?.[0] || error.message || 'Invalid or expired verification token'
        });
      }

      console.error('Email verification error:', error);
      return reply.status(500).send({
        error: 'Failed to verify email'
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
      // Handle validation errors (rate limit, already verified)
      if (error instanceof ValidationError || error.message?.includes('already verified') || error.message?.includes('Too many')) {
        return reply.status(400).send({
          error: error.errors?.[0] || error.message || 'Unable to resend verification email'
        });
      }

      console.error('Resend verification error:', error);
      return reply.status(500).send({
        error: 'Failed to send verification email'
      });
    }
  }

  async changePassword(request: any, reply: any) {
    try {
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
