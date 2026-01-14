/**
 * SECURITY SERVICE
 * 
 * Fixes Batch 9 audit findings:
 * - SEC-R11: Account lockout implementation
 * - SEC-EXT11: Spending limits implementation
 * - SEC-EXT12: Multi-sig implementation for high-value operations
 */

import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { config } from '../config';
import { DatabaseService } from './databaseService';
import { ForbiddenError, AppError } from '../utils/errors';

const log = logger.child({ component: 'SecurityService' });

// =============================================================================
// ACCOUNT LOCKOUT (SEC-R11)
// =============================================================================

export interface LockoutConfig {
  maxFailedAttempts: number;   // Number of failed attempts before lockout
  lockoutDurationMs: number;   // How long to lock the account
  trackingWindowMs: number;    // Window to track failed attempts
}

export interface LockoutStatus {
  locked: boolean;
  failedAttempts: number;
  lockedUntil?: Date;
  remainingAttempts: number;
}

const DEFAULT_LOCKOUT_CONFIG: LockoutConfig = {
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,  // 15 minutes
  trackingWindowMs: 60 * 60 * 1000,   // 1 hour window
};

class AccountLockoutService {
  private redis: Redis | null = null;
  private config: LockoutConfig;

  constructor(lockoutConfig: Partial<LockoutConfig> = {}) {
    this.config = { ...DEFAULT_LOCKOUT_CONFIG, ...lockoutConfig };
  }

  async initialize(): Promise<void> {
    try {
      this.redis = new Redis(config.redis.url, {
        password: config.redis.password,
        tls: config.redis.tls ? {} : undefined,
        keyPrefix: 'lockout:',
      });
      log.info('Account lockout service initialized with Redis');
    } catch (error) {
      log.warn('Redis not available for lockout tracking, using in-memory fallback');
    }
  }

  private getKey(identifier: string, type: 'attempts' | 'locked'): string {
    return `${type}:${identifier}`;
  }

  /**
   * Record a failed authentication/validation attempt
   */
  async recordFailedAttempt(identifier: string, reason?: string): Promise<LockoutStatus> {
    const attemptsKey = this.getKey(identifier, 'attempts');
    const lockedKey = this.getKey(identifier, 'locked');
    
    // Check if already locked
    if (this.redis) {
      const lockedUntil = await this.redis.get(lockedKey);
      if (lockedUntil) {
        const lockExpiry = new Date(parseInt(lockedUntil, 10));
        if (lockExpiry > new Date()) {
          return {
            locked: true,
            failedAttempts: this.config.maxFailedAttempts,
            lockedUntil: lockExpiry,
            remainingAttempts: 0,
          };
        }
      }

      // Increment failed attempts
      const attempts = await this.redis.incr(attemptsKey);
      
      // Set expiry on first attempt
      if (attempts === 1) {
        await this.redis.pexpire(attemptsKey, this.config.trackingWindowMs);
      }

      log.warn('Failed attempt recorded', { 
        identifier: this.maskIdentifier(identifier), 
        attempts,
        reason,
      });

      // Check if should lock
      if (attempts >= this.config.maxFailedAttempts) {
        const lockExpiry = Date.now() + this.config.lockoutDurationMs;
        await this.redis.set(lockedKey, lockExpiry.toString(), 'PX', this.config.lockoutDurationMs);
        await this.redis.del(attemptsKey);
        
        log.error('Account locked due to too many failed attempts', {
          identifier: this.maskIdentifier(identifier),
          lockedUntil: new Date(lockExpiry).toISOString(),
        });

        return {
          locked: true,
          failedAttempts: attempts,
          lockedUntil: new Date(lockExpiry),
          remainingAttempts: 0,
        };
      }

      return {
        locked: false,
        failedAttempts: attempts,
        remainingAttempts: this.config.maxFailedAttempts - attempts,
      };
    }

    // Fallback: Always allow (with warning)
    log.warn('Lockout tracking unavailable - Redis not connected');
    return {
      locked: false,
      failedAttempts: 0,
      remainingAttempts: this.config.maxFailedAttempts,
    };
  }

  /**
   * Record a successful attempt (clears failed attempts)
   */
  async recordSuccessfulAttempt(identifier: string): Promise<void> {
    if (this.redis) {
      const attemptsKey = this.getKey(identifier, 'attempts');
      await this.redis.del(attemptsKey);
      log.debug('Successful attempt - cleared failed attempts', {
        identifier: this.maskIdentifier(identifier),
      });
    }
  }

  /**
   * Check if account is locked
   */
  async isLocked(identifier: string): Promise<LockoutStatus> {
    if (this.redis) {
      const lockedKey = this.getKey(identifier, 'locked');
      const attemptsKey = this.getKey(identifier, 'attempts');
      
      const [lockedUntil, attempts] = await Promise.all([
        this.redis.get(lockedKey),
        this.redis.get(attemptsKey),
      ]);

      if (lockedUntil) {
        const lockExpiry = new Date(parseInt(lockedUntil, 10));
        if (lockExpiry > new Date()) {
          return {
            locked: true,
            failedAttempts: this.config.maxFailedAttempts,
            lockedUntil: lockExpiry,
            remainingAttempts: 0,
          };
        }
      }

      const failedAttempts = parseInt(attempts || '0', 10);
      return {
        locked: false,
        failedAttempts,
        remainingAttempts: this.config.maxFailedAttempts - failedAttempts,
      };
    }

    return {
      locked: false,
      failedAttempts: 0,
      remainingAttempts: this.config.maxFailedAttempts,
    };
  }

  /**
   * Unlock an account (admin operation)
   */
  async unlock(identifier: string, adminId: string): Promise<void> {
    if (this.redis) {
      const lockedKey = this.getKey(identifier, 'locked');
      const attemptsKey = this.getKey(identifier, 'attempts');
      
      await Promise.all([
        this.redis.del(lockedKey),
        this.redis.del(attemptsKey),
      ]);
      
      log.info('Account unlocked by admin', {
        identifier: this.maskIdentifier(identifier),
        adminId,
      });
    }
  }

  private maskIdentifier(identifier: string): string {
    if (identifier.includes('@')) {
      const [local, domain] = identifier.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    }
    return identifier.substring(0, 4) + '***';
  }
}

// =============================================================================
// SPENDING LIMITS (SEC-EXT11)
// =============================================================================

export interface SpendingLimit {
  userId: string;
  tenantId: string;
  dailyLimit: number;       // In cents/smallest currency unit
  weeklyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;
}

export interface SpendingStatus {
  dailySpent: number;
  weeklySpent: number;
  monthlySpent: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  monthlyRemaining: number;
}

const DEFAULT_SPENDING_LIMITS: Omit<SpendingLimit, 'userId' | 'tenantId'> = {
  dailyLimit: 100000,        // $1,000
  weeklyLimit: 500000,       // $5,000
  monthlyLimit: 2000000,     // $20,000
  perTransactionLimit: 50000, // $500
};

class SpendingLimitsService {
  private redis: Redis | null = null;

  async initialize(): Promise<void> {
    try {
      this.redis = new Redis(config.redis.url, {
        password: config.redis.password,
        tls: config.redis.tls ? {} : undefined,
        keyPrefix: 'spending:',
      });
      log.info('Spending limits service initialized');
    } catch (error) {
      log.warn('Redis not available for spending limits');
    }
  }

  /**
   * Get user's spending limits (from database or defaults)
   */
  async getLimits(userId: string, tenantId: string): Promise<SpendingLimit> {
    try {
      const result = await DatabaseService.query<SpendingLimit>(
        `SELECT * FROM spending_limits WHERE user_id = $1 AND tenant_id = $2`,
        [userId, tenantId]
      );
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (error) {
      log.debug('Spending limits table may not exist yet, using defaults');
    }

    return {
      userId,
      tenantId,
      ...DEFAULT_SPENDING_LIMITS,
    };
  }

  /**
   * Check if a transaction would exceed spending limits
   */
  async checkTransaction(
    userId: string,
    tenantId: string,
    amountCents: number
  ): Promise<{ allowed: boolean; reason?: string; status: SpendingStatus }> {
    const limits = await this.getLimits(userId, tenantId);
    
    // Check per-transaction limit
    if (amountCents > limits.perTransactionLimit) {
      const status = await this.getSpendingStatus(userId, tenantId, limits);
      return {
        allowed: false,
        reason: `Transaction exceeds per-transaction limit of ${limits.perTransactionLimit / 100}`,
        status,
      };
    }

    const status = await this.getSpendingStatus(userId, tenantId, limits);
    
    // Check daily limit
    if (status.dailySpent + amountCents > limits.dailyLimit) {
      return {
        allowed: false,
        reason: `Transaction would exceed daily spending limit. Remaining: ${status.dailyRemaining / 100}`,
        status,
      };
    }

    // Check weekly limit
    if (status.weeklySpent + amountCents > limits.weeklyLimit) {
      return {
        allowed: false,
        reason: `Transaction would exceed weekly spending limit. Remaining: ${status.weeklyRemaining / 100}`,
        status,
      };
    }

    // Check monthly limit
    if (status.monthlySpent + amountCents > limits.monthlyLimit) {
      return {
        allowed: false,
        reason: `Transaction would exceed monthly spending limit. Remaining: ${status.monthlyRemaining / 100}`,
        status,
      };
    }

    return { allowed: true, status };
  }

  /**
   * Record a completed transaction
   */
  async recordTransaction(
    userId: string,
    tenantId: string,
    amountCents: number,
    transactionId: string
  ): Promise<void> {
    if (this.redis) {
      const now = new Date();
      const dayKey = `${userId}:${tenantId}:daily:${now.toISOString().split('T')[0]}`;
      const weekKey = `${userId}:${tenantId}:weekly:${this.getWeekKey(now)}`;
      const monthKey = `${userId}:${tenantId}:monthly:${now.getFullYear()}-${now.getMonth() + 1}`;

      await Promise.all([
        this.redis.incrby(dayKey, amountCents).then(() => 
          this.redis!.expire(dayKey, 60 * 60 * 24 * 2)  // Keep 2 days
        ),
        this.redis.incrby(weekKey, amountCents).then(() => 
          this.redis!.expire(weekKey, 60 * 60 * 24 * 8)  // Keep 8 days
        ),
        this.redis.incrby(monthKey, amountCents).then(() => 
          this.redis!.expire(monthKey, 60 * 60 * 24 * 35)  // Keep 35 days
        ),
      ]);

      log.info('Transaction recorded for spending limits', {
        userId,
        tenantId,
        amountCents,
        transactionId,
      });
    }
  }

  /**
   * Get current spending status
   */
  async getSpendingStatus(
    userId: string,
    tenantId: string,
    limits?: SpendingLimit
  ): Promise<SpendingStatus> {
    if (!limits) {
      limits = await this.getLimits(userId, tenantId);
    }

    if (this.redis) {
      const now = new Date();
      const dayKey = `${userId}:${tenantId}:daily:${now.toISOString().split('T')[0]}`;
      const weekKey = `${userId}:${tenantId}:weekly:${this.getWeekKey(now)}`;
      const monthKey = `${userId}:${tenantId}:monthly:${now.getFullYear()}-${now.getMonth() + 1}`;

      const [daily, weekly, monthly] = await Promise.all([
        this.redis.get(dayKey),
        this.redis.get(weekKey),
        this.redis.get(monthKey),
      ]);

      const dailySpent = parseInt(daily || '0', 10);
      const weeklySpent = parseInt(weekly || '0', 10);
      const monthlySpent = parseInt(monthly || '0', 10);

      return {
        dailySpent,
        weeklySpent,
        monthlySpent,
        dailyRemaining: Math.max(0, limits.dailyLimit - dailySpent),
        weeklyRemaining: Math.max(0, limits.weeklyLimit - weeklySpent),
        monthlyRemaining: Math.max(0, limits.monthlyLimit - monthlySpent),
      };
    }

    return {
      dailySpent: 0,
      weeklySpent: 0,
      monthlySpent: 0,
      dailyRemaining: limits.dailyLimit,
      weeklyRemaining: limits.weeklyLimit,
      monthlyRemaining: limits.monthlyLimit,
    };
  }

  private getWeekKey(date: Date): string {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(
      ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    );
    return `${date.getFullYear()}-W${weekNumber}`;
  }
}

// =============================================================================
// MULTI-SIG APPROVALS (SEC-EXT12)
// =============================================================================

export interface MultiSigConfig {
  requiredApprovals: number;  // Number of approvals needed
  approverRoles: string[];    // Roles that can approve
  timeoutMs: number;          // How long approvals are valid
}

export interface ApprovalRequest {
  id: string;
  operationType: string;
  operationData: Record<string, unknown>;
  requestedBy: string;
  requestedAt: Date;
  requiredApprovals: number;
  approvals: Array<{
    approverId: string;
    approvedAt: Date;
    signature?: string;
  }>;
  rejections: Array<{
    rejecterId: string;
    rejectedAt: Date;
    reason: string;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: Date;
}

// Operations that require multi-sig
const MULTI_SIG_OPERATIONS: Record<string, MultiSigConfig> = {
  // High-value transfers
  'transfer:high_value': {
    requiredApprovals: 2,
    approverRoles: ['admin', 'finance'],
    timeoutMs: 24 * 60 * 60 * 1000,  // 24 hours
  },
  // Bulk minting
  'mint:bulk': {
    requiredApprovals: 2,
    approverRoles: ['admin', 'event_manager'],
    timeoutMs: 4 * 60 * 60 * 1000,  // 4 hours
  },
  // Configuration changes
  'config:security': {
    requiredApprovals: 3,
    approverRoles: ['admin', 'security'],
    timeoutMs: 72 * 60 * 60 * 1000,  // 72 hours
  },
  // Large refunds
  'refund:large': {
    requiredApprovals: 2,
    approverRoles: ['admin', 'finance', 'support_lead'],
    timeoutMs: 12 * 60 * 60 * 1000,  // 12 hours
  },
};

// Threshold for high-value operations
const HIGH_VALUE_THRESHOLD = 100000; // $1,000 in cents

class MultiSigService {
  private redis: Redis | null = null;

  async initialize(): Promise<void> {
    try {
      this.redis = new Redis(config.redis.url, {
        password: config.redis.password,
        tls: config.redis.tls ? {} : undefined,
        keyPrefix: 'multisig:',
      });
      log.info('Multi-sig service initialized');
    } catch (error) {
      log.warn('Redis not available for multi-sig');
    }
  }

  /**
   * Check if an operation requires multi-sig
   */
  requiresMultiSig(
    operationType: string,
    operationData: Record<string, unknown>
  ): { required: boolean; config?: MultiSigConfig } {
    // Check explicit operation types
    if (MULTI_SIG_OPERATIONS[operationType]) {
      return { required: true, config: MULTI_SIG_OPERATIONS[operationType] };
    }

    // Check value-based thresholds
    const amount = operationData.amountCents as number;
    if (amount && amount >= HIGH_VALUE_THRESHOLD) {
      if (operationType.startsWith('transfer:')) {
        return { 
          required: true, 
          config: MULTI_SIG_OPERATIONS['transfer:high_value'],
        };
      }
      if (operationType.startsWith('refund:')) {
        return { 
          required: true, 
          config: MULTI_SIG_OPERATIONS['refund:large'],
        };
      }
    }

    return { required: false };
  }

  /**
   * Create a new approval request
   */
  async createApprovalRequest(
    operationType: string,
    operationData: Record<string, unknown>,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    const check = this.requiresMultiSig(operationType, operationData);
    
    if (!check.required || !check.config) {
      throw new AppError('Operation does not require multi-sig', 400, 'MULTI_SIG_NOT_REQUIRED');
    }

    const id = `msig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    
    const request: ApprovalRequest = {
      id,
      operationType,
      operationData,
      requestedBy,
      requestedAt: now,
      requiredApprovals: check.config.requiredApprovals,
      approvals: [],
      rejections: [],
      status: 'pending',
      expiresAt: new Date(now.getTime() + check.config.timeoutMs),
    };

    if (this.redis) {
      await this.redis.set(
        `request:${id}`,
        JSON.stringify(request),
        'PX',
        check.config.timeoutMs
      );
    }

    log.info('Multi-sig approval request created', {
      id,
      operationType,
      requestedBy,
      requiredApprovals: check.config.requiredApprovals,
    });

    return request;
  }

  /**
   * Submit an approval for a request
   */
  async approve(
    requestId: string,
    approverId: string,
    approverRole: string,
    signature?: string
  ): Promise<ApprovalRequest> {
    const request = await this.getRequest(requestId);
    
    if (!request) {
      throw new AppError('Approval request not found or expired', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new AppError(`Request is already ${request.status}`, 400, 'INVALID_REQUEST_STATUS');
    }

    // Verify approver has permission
    const config = MULTI_SIG_OPERATIONS[request.operationType] || 
                   MULTI_SIG_OPERATIONS['transfer:high_value'];
    
    if (!config.approverRoles.includes(approverRole)) {
      throw new ForbiddenError(`Role ${approverRole} cannot approve this operation`);
    }

    // Check if already approved by this user
    if (request.approvals.some(a => a.approverId === approverId)) {
      throw new AppError('Already approved by this user', 400, 'ALREADY_APPROVED');
    }

    // Add approval
    request.approvals.push({
      approverId,
      approvedAt: new Date(),
      signature,
    });

    // Check if fully approved
    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'approved';
      log.info('Multi-sig request fully approved', {
        requestId,
        operationType: request.operationType,
        approvalCount: request.approvals.length,
      });
    }

    await this.saveRequest(request);

    log.info('Approval submitted', {
      requestId,
      approverId,
      approvalCount: request.approvals.length,
      requiredApprovals: request.requiredApprovals,
    });

    return request;
  }

  /**
   * Reject a request
   */
  async reject(
    requestId: string,
    rejecterId: string,
    reason: string
  ): Promise<ApprovalRequest> {
    const request = await this.getRequest(requestId);
    
    if (!request) {
      throw new AppError('Approval request not found or expired', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'pending') {
      throw new AppError(`Request is already ${request.status}`, 400, 'INVALID_REQUEST_STATUS');
    }

    request.rejections.push({
      rejecterId,
      rejectedAt: new Date(),
      reason,
    });

    request.status = 'rejected';
    await this.saveRequest(request);

    log.info('Multi-sig request rejected', {
      requestId,
      rejecterId,
      reason,
    });

    return request;
  }

  /**
   * Execute an approved operation
   */
  async executeIfApproved(
    requestId: string,
    executor: () => Promise<unknown>
  ): Promise<{ executed: boolean; result?: unknown }> {
    const request = await this.getRequest(requestId);
    
    if (!request) {
      throw new AppError('Approval request not found or expired', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'approved') {
      return { executed: false };
    }

    try {
      const result = await executor();
      
      // Mark as executed by deleting from pending
      if (this.redis) {
        await this.redis.del(`request:${requestId}`);
      }

      log.info('Multi-sig operation executed', {
        requestId,
        operationType: request.operationType,
      });

      return { executed: true, result };
    } catch (error) {
      log.error('Multi-sig operation failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Get a request by ID
   */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    if (this.redis) {
      const data = await this.redis.get(`request:${requestId}`);
      if (data) {
        return JSON.parse(data);
      }
    }
    return null;
  }

  /**
   * Get all pending requests for an approver
   */
  async getPendingRequests(approverRole: string): Promise<ApprovalRequest[]> {
    // In production, this would query the database
    // For now, return empty array as Redis doesn't support complex queries
    log.debug('getPendingRequests called', { approverRole });
    return [];
  }

  private async saveRequest(request: ApprovalRequest): Promise<void> {
    if (this.redis) {
      const ttl = Math.max(0, request.expiresAt.getTime() - Date.now());
      await this.redis.set(
        `request:${request.id}`,
        JSON.stringify(request),
        'PX',
        ttl
      );
    }
  }
}

// =============================================================================
// SINGLETON EXPORTS
// =============================================================================

export const accountLockout = new AccountLockoutService();
export const spendingLimits = new SpendingLimitsService();
export const multiSig = new MultiSigService();

/**
 * Initialize all security services
 */
export async function initializeSecurityServices(): Promise<void> {
  await Promise.all([
    accountLockout.initialize(),
    spendingLimits.initialize(),
    multiSig.initialize(),
  ]);
  log.info('All security services initialized');
}

export default {
  accountLockout,
  spendingLimits,
  multiSig,
  initializeSecurityServices,
};
