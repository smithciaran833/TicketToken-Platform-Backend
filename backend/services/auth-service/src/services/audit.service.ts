import { db } from '../config/database';
import { auditLogger } from '../config/logger';

export interface AuditEvent {
  userId?: string;
  action: string;
  actionType: 'authentication' | 'authorization' | 'security' | 'data_access';
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    try {
      // Log to database
      await db('audit_logs').insert({
        service: 'auth-service',
        action_type: event.actionType,
        resource_type: event.resourceType || 'unknown',
        user_id: event.userId,
        action: event.action,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date()
      });

      // Also log to file/stdout for centralized logging
      auditLogger.info({
        ...event,
        timestamp: new Date().toISOString()
      }, `Audit: ${event.action}`);
    } catch (error) {
      // Don't fail the request if audit logging fails
      auditLogger.error({ error, event }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string) {
    await this.log({
      userId,
      action: 'user.login',
      actionType: 'authentication',
      resourceType: 'user',
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.registration',
      actionType: 'authentication',
      resourceType: 'user',
      ipAddress,
      metadata: { email },
      status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.password_changed',
      actionType: 'security',
      resourceType: 'user',
      ipAddress,
      status: 'success'
    });
  }

  async logMFAEnabled(userId: string) {
    await this.log({
      userId,
      action: 'user.mfa_enabled',
      actionType: 'security',
      resourceType: 'user',
      status: 'success'
    });
  }

  async logTokenRefresh(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'token.refreshed',
      actionType: 'authentication',
      resourceType: 'token',
      ipAddress,
      status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string) {
    await this.log({
      userId: grantedBy,
      action: 'role.granted',
      actionType: 'authorization',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { targetUserId: userId, role },
      status: 'success'
    });
  }
}
