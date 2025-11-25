/**
 * MFA Enforcement Middleware
 * 
 * PCI-DSS Requirement: Multi-Factor Authentication for admin access to payment data
 * Enforces MFA verification for sensitive operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database';
import { MFAService } from '../services/mfa.service';
import { logger } from '../utils/logger';
import { isAdmin, isSuperAdmin } from '../utils/auth-guards';

export interface MFARequest extends FastifyRequest {
  mfaVerified?: boolean;
}

/**
 * Check if MFA is required for this request
 */
function requiresMFA(request: FastifyRequest): boolean {
  const path = request.url;
  
  // MFA required for all admin routes
  if (path.startsWith('/api/v1/admin')) {
    return true;
  }
  
  // MFA required for payment-related endpoints
  if (path.includes('/payment') || path.includes('/refund')) {
    return true;
  }
  
  // MFA required for privacy/GDPR endpoints
  if (path.startsWith('/api/v1/privacy')) {
    return true;
  }
  
  // MFA required for reports endpoints
  if (path.startsWith('/api/v1/reports')) {
    return true;
  }
  
  return false;
}

/**
 * Middleware to enforce MFA for admin users
 */
export async function mfaMiddleware(
  request: MFARequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Skip if user not authenticated
    if (!request.user) {
      return;
    }

    // Only enforce MFA for admin users
    if (!isAdmin(request.user) && !isSuperAdmin(request.user)) {
      return;
    }

    // Check if this endpoint requires MFA
    if (!requiresMFA(request)) {
      return;
    }

    const pool = getDatabase();
    const mfaService = new MFAService(pool);

    // Check if user has MFA enabled
    const hasMFA = await mfaService.hasMFAEnabled(request.user.id, request.user.tenantId);

    if (!hasMFA) {
      // Admin user must have MFA enabled
      reply.code(403).send({
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication must be enabled for admin accounts',
        setupUrl: '/api/v1/mfa/setup',
      });
      return;
    }

    // Check for MFA code in headers
    const mfaCode = request.headers['x-mfa-code'] as string;

    if (!mfaCode) {
      reply.code(401).send({
        error: 'MFA_CODE_REQUIRED',
        message: 'MFA verification code required for this operation',
      });
      return;
    }

    // Get IP and user agent for audit logging
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] || request.ip;
    const userAgent = request.headers['user-agent'] as string;

    // Validate MFA code
    const isValid = await mfaService.validateTOTP(
      request.user.id,
      request.user.tenantId,
      mfaCode,
      ipAddress,
      userAgent
    );

    if (!isValid) {
      // Check for rate limiting
      const failedAttempts = await mfaService.getRecentFailedAttempts(
        request.user.id,
        request.user.tenantId,
        15
      );

      if (failedAttempts >= 5) {
        logger.warn('MFA rate limit exceeded', {
          userId: request.user.id,
          tenantId: request.user.tenantId,
          failedAttempts,
          ipAddress,
        });

        reply.code(429).send({
          error: 'MFA_RATE_LIMIT_EXCEEDED',
          message: 'Too many failed MFA attempts. Please try again later.',
          retryAfter: 900, // 15 minutes
        });
        return;
      }

      reply.code(401).send({
        error: 'MFA_CODE_INVALID',
        message: 'Invalid MFA verification code',
        attemptsRemaining: 5 - failedAttempts,
      });
      return;
    }

    // MFA verified successfully
    request.mfaVerified = true;
    logger.info('MFA verification successful', {
      userId: request.user.id,
      tenantId: request.user.tenantId,
      path: request.url,
    });
  } catch (error) {
    logger.error('MFA middleware error', { error });
    reply.code(500).send({
      error: 'MFA_ERROR',
      message: 'Failed to verify MFA',
    });
  }
}
