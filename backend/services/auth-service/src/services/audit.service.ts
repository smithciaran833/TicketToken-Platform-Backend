import { db } from '../config/database';
import { logger, getCorrelationId } from '../utils/logger';

export interface AuditEvent {
  userId?: string;
  tenantId?: string;
  action: string;
  actionType: 'authentication' | 'authorization' | 'security' | 'data_access' | 'session';
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  status: 'success' | 'failure';
  errorMessage?: string;
  correlationId?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    const correlationId = event.correlationId || getCorrelationId();

    try {
      await db('audit_logs').insert({
        service: 'auth-service',
        action_type: event.actionType,
        resource_type: event.resourceType || 'unknown',
        user_id: event.userId,
        tenant_id: event.tenantId,
        action: event.action,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify({ ...event.metadata, correlationId }) : JSON.stringify({ correlationId }),
        success: event.status === 'success',
        error_message: event.errorMessage,
        created_at: new Date()
      });

      logger.info(`Audit: ${event.action}`, {
        ...event,
        correlationId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to log audit event', { error, event, correlationId });
    }
  }

  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.login', actionType: 'authentication',
      resourceType: 'user', resourceId: userId, ipAddress, userAgent,
      status: success ? 'success' : 'failure', errorMessage
    });
  }

  async logLogout(userId: string, ipAddress?: string, userAgent?: string, sessionId?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.logout', actionType: 'authentication',
      resourceType: 'session', resourceId: sessionId, ipAddress, userAgent,
      metadata: { sessionId }, status: 'success'
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.registration', actionType: 'authentication',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { email }, status: 'success'
    });
  }

  /**
   * Log token refresh to dedicated token_refresh_log table
   */
  async logTokenRefresh(userId: string, ipAddress: string, tenantId: string, userAgent?: string): Promise<void> {
    try {
      await db('token_refresh_log').insert({
        user_id: userId,
        tenant_id: tenantId,
        ip_address: ipAddress,
        user_agent: userAgent,
        refreshed_at: new Date(),
        metadata: JSON.stringify({ correlationId: getCorrelationId() })
      });

      logger.info('Token refresh logged', {
        userId,
        tenantId,
        ipAddress,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to log token refresh', { error, userId, tenantId });
    }
  }

  async logSessionCreated(userId: string, sessionId: string, ipAddress?: string, userAgent?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'session.created', actionType: 'session',
      resourceType: 'session', resourceId: sessionId, ipAddress, userAgent,
      metadata: { sessionId }, status: 'success'
    });
  }

  async logSessionRevoked(userId: string, sessionId: string, revokedBy: string, reason?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'session.revoked', actionType: 'session',
      resourceType: 'session', resourceId: sessionId,
      metadata: { sessionId, revokedBy, reason }, status: 'success'
    });
  }

  async logAllSessionsRevoked(userId: string, revokedBy: string, reason?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'session.all_revoked', actionType: 'session',
      resourceType: 'user', resourceId: userId,
      metadata: { revokedBy, reason }, status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.password_changed', actionType: 'security',
      resourceType: 'user', resourceId: userId, ipAddress, status: 'success'
    });
  }

  async logPasswordReset(userId: string, ipAddress: string, method: 'email' | 'admin', tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.password_reset', actionType: 'security',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { method }, status: 'success'
    });
  }

  async logMFAEnabled(userId: string, method: 'totp' | 'sms' | 'email' = 'totp', ipAddress?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.mfa_enabled', actionType: 'security',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { method }, status: 'success'
    });
  }

  async logMFADisabled(userId: string, disabledBy: string, reason?: string, ipAddress?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.mfa_disabled', actionType: 'security',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { disabledBy, reason }, status: 'success'
    });
  }

  async logMFAVerification(userId: string, success: boolean, method: 'totp' | 'sms' | 'email' | 'backup_code' = 'totp', ipAddress?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: success ? 'user.mfa_verified' : 'user.mfa_failed',
      actionType: 'security', resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { method }, status: success ? 'success' : 'failure'
    });
  }

  async logFailedLoginAttempt(email: string, ipAddress?: string, userAgent?: string, reason?: string, tenantId?: string): Promise<void> {
    await this.log({
      tenantId, action: 'user.login_failed', actionType: 'security',
      resourceType: 'user', ipAddress, userAgent,
      metadata: { email, reason }, status: 'failure', errorMessage: reason
    });
  }

  async logAccountLockout(userId: string, email: string, ipAddress: string, lockoutDuration: number, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'user.account_locked', actionType: 'security',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { email, lockoutDuration }, status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string, tenantId?: string): Promise<void> {
    await this.log({
      userId: grantedBy, tenantId, action: 'role.granted', actionType: 'authorization',
      resourceType: 'venue', resourceId: venueId,
      metadata: { targetUserId: userId, role }, status: 'success'
    });
  }

  async logRoleRevoke(revokedBy: string, userId: string, venueId: string, role: string, tenantId?: string): Promise<void> {
    await this.log({
      userId: revokedBy, tenantId, action: 'role.revoked', actionType: 'authorization',
      resourceType: 'venue', resourceId: venueId,
      metadata: { targetUserId: userId, role }, status: 'success'
    });
  }

  async logPermissionDenied(userId: string, resource: string, action: string, ipAddress?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'permission.denied', actionType: 'authorization',
      resourceType: resource, ipAddress,
      metadata: { attemptedAction: action }, status: 'failure'
    });
  }

  async logDataExport(userId: string, exportType: string, ipAddress?: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'data.exported', actionType: 'data_access',
      resourceType: 'user', resourceId: userId, ipAddress,
      metadata: { exportType }, status: 'success'
    });
  }

  async logDataDeletion(userId: string, deletedBy: string, reason: string, tenantId?: string): Promise<void> {
    await this.log({
      userId, tenantId, action: 'data.deleted', actionType: 'data_access',
      resourceType: 'user', resourceId: userId,
      metadata: { deletedBy, reason }, status: 'success'
    });
  }

  // ============================================
  // BIOMETRIC AUDIT METHODS
  // ============================================

  async logBiometricRegistration(
    userId: string,
    credentialId: string,
    deviceId: string,
    biometricType: string,
    ipAddress?: string,
    tenantId?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action: 'biometric.registered',
      actionType: 'security',
      resourceType: 'biometric_credential',
      resourceId: credentialId,
      ipAddress,
      metadata: { deviceId, biometricType },
      status: 'success'
    });
  }

  async logBiometricAuth(
    userId: string,
    credentialId: string,
    ipAddress?: string,
    userAgent?: string,
    success: boolean = true,
    tenantId?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action: success ? 'biometric.authenticated' : 'biometric.auth_failed',
      actionType: 'authentication',
      resourceType: 'biometric_credential',
      resourceId: credentialId,
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logBiometricDeviceDeleted(
    userId: string,
    credentialId: string,
    ipAddress?: string,
    tenantId?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action: 'biometric.device_deleted',
      actionType: 'security',
      resourceType: 'biometric_credential',
      resourceId: credentialId,
      ipAddress,
      status: 'success'
    });
  }
}

export const auditService = new AuditService();
