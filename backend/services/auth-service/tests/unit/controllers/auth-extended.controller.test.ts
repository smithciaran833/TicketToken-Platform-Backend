import { AuthExtendedController } from '../../../src/controllers/auth-extended.controller';
import { AuthExtendedService } from '../../../src/services/auth-extended.service';

// Mock dependencies
jest.mock('../../../src/services/auth-extended.service');

describe('AuthExtendedController', () => {
  let authExtendedController: AuthExtendedController;
  let mockAuthExtendedService: jest.Mocked<AuthExtendedService>;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthExtendedService = {
      requestPasswordReset: jest.fn(),
      resetPassword: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerificationEmail: jest.fn(),
      changePassword: jest.fn(),
    } as any;

    authExtendedController = new AuthExtendedController(mockAuthExtendedService);

    mockRequest = {
      body: {},
      query: {},
      ip: '127.0.0.1',
      user: { id: 'user-123', email: 'test@example.com' }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // GROUP 1: forgotPassword() - 6 test cases
  // =============================================================================

  describe('forgotPassword()', () => {
    it('should successfully process forgot password request', async () => {
      // Arrange
      mockAuthExtendedService.requestPasswordReset.mockResolvedValue(undefined);
      mockRequest.body = { email: 'user@example.com' };

      // Act
      await authExtendedController.forgotPassword(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.requestPasswordReset).toHaveBeenCalledWith(
        'user@example.com',
        '127.0.0.1'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    });

    it('should prevent email enumeration by always returning success', async () => {
      // Arrange - email doesn't exist
      mockAuthExtendedService.requestPasswordReset.mockResolvedValue(undefined);
      mockRequest.body = { email: 'nonexistent@example.com' };

      // Act
      await authExtendedController.forgotPassword(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    });

    it('should capture IP address from request', async () => {
      // Arrange
      mockAuthExtendedService.requestPasswordReset.mockResolvedValue(undefined);
      mockRequest.body = { email: 'user@example.com' };
      mockRequest.ip = '192.168.1.100';

      // Act
      await authExtendedController.forgotPassword(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.requestPasswordReset).toHaveBeenCalledWith(
        'user@example.com',
        '192.168.1.100'
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockAuthExtendedService.requestPasswordReset.mockRejectedValue(new Error('Service error'));
      mockRequest.body = { email: 'user@example.com' };

      // Act & Assert
      await expect(authExtendedController.forgotPassword(mockRequest, mockReply))
        .rejects.toThrow('Service error');
    });

    it('should handle invalid email format', async () => {
      // Arrange
      mockAuthExtendedService.requestPasswordReset.mockRejectedValue(new Error('Invalid email format'));
      mockRequest.body = { email: 'notanemail' };

      // Act & Assert
      await expect(authExtendedController.forgotPassword(mockRequest, mockReply))
        .rejects.toThrow('Invalid email format');
    });

    it('should handle rate limiting on password reset requests', async () => {
      // Arrange
      mockAuthExtendedService.requestPasswordReset.mockRejectedValue(new Error('Too many requests'));
      mockRequest.body = { email: 'user@example.com' };

      // Act & Assert
      await expect(authExtendedController.forgotPassword(mockRequest, mockReply))
        .rejects.toThrow('Too many requests');
    });
  });

  // =============================================================================
  // GROUP 2: resetPassword() - 8 test cases
  // =============================================================================

  describe('resetPassword()', () => {
    it('should successfully reset password with valid token', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockResolvedValue(undefined);
      mockRequest.body = { token: 'valid-reset-token', password: 'NewSecurePass123!' };

      // Act
      await authExtendedController.resetPassword(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.resetPassword).toHaveBeenCalledWith(
        'valid-reset-token',
        'NewSecurePass123!',
        '127.0.0.1'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Password has been reset successfully'
      });
    });

    it('should reject expired reset token', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Reset token expired'));
      mockRequest.body = { token: 'expired-token', password: 'NewPass123!' };

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Reset token expired');
    });

    it('should reject invalid reset token', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Invalid reset token'));
      mockRequest.body = { token: 'invalid-token', password: 'NewPass123!' };

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Invalid reset token');
    });

    it('should reject weak passwords', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Password too weak'));
      mockRequest.body = { token: 'valid-token', password: '123' };

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Password too weak');
    });

    it('should capture IP address during password reset', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockResolvedValue(undefined);
      mockRequest.body = { token: 'token', password: 'NewPass123!' };
      mockRequest.ip = '10.0.0.1';

      // Act
      await authExtendedController.resetPassword(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.resetPassword).toHaveBeenCalledWith(
        'token',
        'NewPass123!',
        '10.0.0.1'
      );
    });

    it('should reject already used reset token', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Token already used'));
      mockRequest.body = { token: 'used-token', password: 'NewPass123!' };

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Token already used');
    });

    it('should reject password same as old password', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Password cannot be same as previous'));
      mockRequest.body = { token: 'token', password: 'OldPass123!' };

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Password cannot be same as previous');
    });

    it('should handle missing token or password', async () => {
      // Arrange
      mockAuthExtendedService.resetPassword.mockRejectedValue(new Error('Token and password required'));
      mockRequest.body = { token: 'token' }; // missing password

      // Act & Assert
      await expect(authExtendedController.resetPassword(mockRequest, mockReply))
        .rejects.toThrow('Token and password required');
    });
  });

  // =============================================================================
  // GROUP 3: verifyEmail() - 6 test cases
  // =============================================================================

  describe('verifyEmail()', () => {
    it('should successfully verify email with valid token', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockResolvedValue(undefined);
      mockRequest.query = { token: 'valid-verification-token' };

      // Act
      await authExtendedController.verifyEmail(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.verifyEmail).toHaveBeenCalledWith('valid-verification-token');
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Email verified successfully'
      });
    });

    it('should reject expired verification token', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockRejectedValue(new Error('Verification token expired'));
      mockRequest.query = { token: 'expired-token' };

      // Act & Assert
      await expect(authExtendedController.verifyEmail(mockRequest, mockReply))
        .rejects.toThrow('Verification token expired');
    });

    it('should reject invalid verification token', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockRejectedValue(new Error('Invalid verification token'));
      mockRequest.query = { token: 'invalid-token' };

      // Act & Assert
      await expect(authExtendedController.verifyEmail(mockRequest, mockReply))
        .rejects.toThrow('Invalid verification token');
    });

    it('should reject already verified email', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockRejectedValue(new Error('Email already verified'));
      mockRequest.query = { token: 'token' };

      // Act & Assert
      await expect(authExtendedController.verifyEmail(mockRequest, mockReply))
        .rejects.toThrow('Email already verified');
    });

    it('should handle missing verification token', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockRejectedValue(new Error('Token required'));
      mockRequest.query = {};

      // Act & Assert
      await expect(authExtendedController.verifyEmail(mockRequest, mockReply))
        .rejects.toThrow('Token required');
    });

    it('should handle database errors during verification', async () => {
      // Arrange
      mockAuthExtendedService.verifyEmail.mockRejectedValue(new Error('Database error'));
      mockRequest.query = { token: 'token' };

      // Act & Assert
      await expect(authExtendedController.verifyEmail(mockRequest, mockReply))
        .rejects.toThrow('Database error');
    });
  });

  // =============================================================================
  // GROUP 4: resendVerification() - 5 test cases
  // =============================================================================

  describe('resendVerification()', () => {
    it('should successfully resend verification email', async () => {
      // Arrange
      mockAuthExtendedService.resendVerificationEmail.mockResolvedValue(undefined);
      mockRequest.user = { id: 'user-123' };

      // Act
      await authExtendedController.resendVerification(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.resendVerificationEmail).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Verification email sent'
      });
    });

    it('should reject unauthenticated requests', async () => {
      // Arrange
      mockRequest.user = null;

      // Act
      await authExtendedController.resendVerification(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockAuthExtendedService.resendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should reject when email already verified', async () => {
      // Arrange
      mockAuthExtendedService.resendVerificationEmail.mockRejectedValue(new Error('Email already verified'));
      mockRequest.user = { id: 'user-123' };

      // Act & Assert
      await expect(authExtendedController.resendVerification(mockRequest, mockReply))
        .rejects.toThrow('Email already verified');
    });

    it('should handle rate limiting on resend requests', async () => {
      // Arrange
      mockAuthExtendedService.resendVerificationEmail.mockRejectedValue(new Error('Too many requests'));
      mockRequest.user = { id: 'user-123' };

      // Act & Assert
      await expect(authExtendedController.resendVerification(mockRequest, mockReply))
        .rejects.toThrow('Too many requests');
    });

    it('should handle email service failures', async () => {
      // Arrange
      mockAuthExtendedService.resendVerificationEmail.mockRejectedValue(new Error('Failed to send email'));
      mockRequest.user = { id: 'user-123' };

      // Act & Assert
      await expect(authExtendedController.resendVerification(mockRequest, mockReply))
        .rejects.toThrow('Failed to send email');
    });
  });

  // =============================================================================
  // GROUP 5: changePassword() - 8 test cases
  // =============================================================================

  describe('changePassword()', () => {
    it('should successfully change password with valid credentials', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockResolvedValue(undefined);
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewSecurePass456!'
      };

      // Act
      await authExtendedController.changePassword(mockRequest, mockReply);

      // Assert
      expect(mockAuthExtendedService.changePassword).toHaveBeenCalledWith(
        'user-123',
        'OldPass123!',
        'NewSecurePass456!'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Password changed successfully'
      });
    });

    it('should reject unauthenticated requests', async () => {
      // Arrange
      mockRequest.user = null;
      mockRequest.body = { currentPassword: 'old', newPassword: 'new' };

      // Act
      await authExtendedController.changePassword(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockAuthExtendedService.changePassword).not.toHaveBeenCalled();
    });

    it('should reject incorrect current password', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('Current password is incorrect'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'WrongPass123!',
        newPassword: 'NewPass456!'
      };

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('Current password is incorrect');
    });

    it('should reject weak new password', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('Password too weak'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'OldPass123!',
        newPassword: '123'
      };

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('Password too weak');
    });

    it('should reject when new password same as current', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('New password must be different'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'SamePass123!',
        newPassword: 'SamePass123!'
      };

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('New password must be different');
    });

    it('should reject password from password history', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('Password recently used'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'Current123!',
        newPassword: 'PreviousPass123!'
      };

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('Password recently used');
    });

    it('should handle missing current or new password', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('Both passwords required'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { currentPassword: 'OldPass123!' }; // missing newPassword

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('Both passwords required');
    });

    it('should handle database errors during password change', async () => {
      // Arrange
      mockAuthExtendedService.changePassword.mockRejectedValue(new Error('Database error'));
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!'
      };

      // Act & Assert
      await expect(authExtendedController.changePassword(mockRequest, mockReply))
        .rejects.toThrow('Database error');
    });
  });
});
