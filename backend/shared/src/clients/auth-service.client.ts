/**
 * Auth Service Client
 * 
 * Client for communicating with auth-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';
import {
  ValidatePermissionsResponse,
  ValidateUsersResponse,
  TenantContext,
  GetUserTenantResponse,
  User,
  GetUserResponse,
  GetUserByEmailResponse,
  AdminUser,
  GetAdminUsersResponse,
  // Phase 5b types
  GetUserTaxInfoResponse,
  GetUserChargebackCountResponse,
  BatchVerificationCheckResponse,
} from './types';

/**
 * Options for getAdminUsers query
 */
export interface GetAdminUsersOptions {
  /** Filter by specific roles */
  roles?: string[];
}

/**
 * Client for auth-service internal APIs
 * 
 * @example
 * ```typescript
 * const client = new AuthServiceClient();
 * const user = await client.getUser('user-123', {
 *   tenantId: 'tenant-456',
 *   traceId: 'trace-789'
 * });
 * ```
 */
export class AuthServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      serviceName: 'auth-service',
      timeout: 10000,
    });
  }

  /**
   * Validate user permissions for an operation
   * 
   * @param userId - The user ID to check
   * @param permissions - Array of permission names to validate
   * @param ctx - Request context with tenant info
   * @param venueId - Optional venue ID for venue-specific permissions
   * @returns Permission validation results
   */
  async validatePermissions(
    userId: string,
    permissions: string[],
    ctx: RequestContext,
    venueId?: string
  ): Promise<ValidatePermissionsResponse> {
    const response = await this.post<ValidatePermissionsResponse>(
      '/internal/validate-permissions',
      ctx,
      { userId, permissions, venueId }
    );
    return response.data;
  }

  /**
   * Validate that multiple users exist and are active
   * 
   * @param userIds - Array of user IDs to validate
   * @param ctx - Request context with tenant info
   * @returns User validation results
   */
  async validateUsers(userIds: string[], ctx: RequestContext): Promise<ValidateUsersResponse> {
    const response = await this.post<ValidateUsersResponse>(
      '/internal/validate-users',
      ctx,
      { userIds }
    );
    return response.data;
  }

  /**
   * Get tenant context for a user
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @returns User's tenant context including role and permissions
   */
  async getUserTenant(userId: string, ctx: RequestContext): Promise<TenantContext> {
    const response = await this.get<GetUserTenantResponse>(
      `/internal/user-tenant/${userId}`,
      ctx
    );
    return response.data.tenant;
  }

  /**
   * Get full user details by ID
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @returns Full user details
   */
  async getUser(userId: string, ctx: RequestContext): Promise<User> {
    const response = await this.get<GetUserResponse>(
      `/internal/users/${userId}`,
      ctx
    );
    return response.data.user;
  }

  /**
   * Get user by email address
   * 
   * @param email - The email address
   * @param ctx - Request context with tenant info
   * @returns User if found, null otherwise
   */
  async getUserByEmail(email: string, ctx: RequestContext): Promise<User | null> {
    try {
      const response = await this.get<GetUserByEmailResponse>(
        `/internal/users/by-email/${encodeURIComponent(email)}`,
        ctx
      );
      return response.data.user;
    } catch (error) {
      // Return null for 404 errors (user not found)
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get list of admin users
   * 
   * @param ctx - Request context with tenant info
   * @param options - Optional filters
   * @returns List of admin users
   */
  async getAdminUsers(
    ctx: RequestContext,
    options?: GetAdminUsersOptions
  ): Promise<AdminUser[]> {
    // Build query string
    const params = new URLSearchParams();
    if (options?.roles?.length) {
      params.append('roles', options.roles.join(','));
    }
    
    const queryString = params.toString();
    const path = `/internal/users/admins${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<GetAdminUsersResponse>(path, ctx);
    return response.data.admins;
  }

  /**
   * Check if a user has a specific permission (helper method)
   * 
   * @param userId - The user ID
   * @param permission - The permission to check
   * @param ctx - Request context with tenant info
   * @returns true if user has permission
   */
  async hasPermission(
    userId: string,
    permission: string,
    ctx: RequestContext
  ): Promise<boolean> {
    const result = await this.validatePermissions(userId, [permission], ctx);
    return result.allGranted;
  }

  /**
   * Check if a user exists and is active (helper method)
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @returns true if user exists and is active
   */
  async isUserActive(userId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.validateUsers([userId], ctx);
    return result.allValid;
  }

  // ==========================================================================
  // PHASE 5b NEW METHODS - Methods for new internal endpoints
  // ==========================================================================

  /**
   * Get user tax information for 1099 forms
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @returns User with tax info
   */
  async getUserTaxInfo(userId: string, ctx: RequestContext): Promise<GetUserTaxInfoResponse> {
    const response = await this.get<GetUserTaxInfoResponse>(
      `/internal/users/${userId}/tax-info`,
      ctx
    );
    return response.data;
  }

  /**
   * Get user chargeback count for risk assessment
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @param periodMonths - Period to check (default: 12)
   * @returns User chargeback metrics
   */
  async getUserChargebackCount(
    userId: string,
    ctx: RequestContext,
    periodMonths?: number
  ): Promise<GetUserChargebackCountResponse> {
    const params = new URLSearchParams();
    if (periodMonths) params.append('periodMonths', periodMonths.toString());
    
    const queryString = params.toString();
    const path = `/internal/users/${userId}/chargeback-count${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<GetUserChargebackCountResponse>(path, ctx);
    return response.data;
  }

  /**
   * Batch check identity verification status for multiple users
   * 
   * @param userIds - Array of user IDs to check
   * @param ctx - Request context with tenant info
   * @returns Verification status map
   */
  async batchVerificationCheck(
    userIds: string[],
    ctx: RequestContext
  ): Promise<BatchVerificationCheckResponse> {
    const response = await this.post<BatchVerificationCheckResponse>(
      '/internal/users/batch-verification-check',
      ctx,
      { userIds }
    );
    return response.data;
  }

  /**
   * Check if a user is identity verified (helper method)
   * 
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @returns true if user is identity verified
   */
  async isUserVerified(userId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.batchVerificationCheck([userId], ctx);
    return result.users[userId]?.identityVerified ?? false;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Transfer Service Support
  // ==========================================================================

  /**
   * Get or create user by email (for transfer recipients)
   * 
   * @param email - The email address
   * @param ctx - Request context with tenant info
   * @param source - Source of user creation (e.g., 'gift_transfer')
   * @returns User ID (existing or newly created)
   */
  async getOrCreateUser(
    email: string,
    ctx: RequestContext,
    source?: string
  ): Promise<{ userId: string; email: string; isNew: boolean }> {
    const response = await this.post<{ userId: string; email: string; isNew: boolean }>(
      '/internal/users/get-or-create',
      ctx,
      { email, source }
    );
    return response.data;
  }

  /**
   * Batch check identity verification for multiple users
   * Used for transfer identity rules
   * 
   * @param userIds - Array of user IDs to check
   * @param ctx - Request context with tenant info
   * @returns Verification status for all users
   */
  async batchIdentityCheck(
    userIds: string[],
    ctx: RequestContext
  ): Promise<{ users: Record<string, { identityVerified: boolean }>; allVerified: boolean }> {
    const response = await this.post<{ users: Record<string, { identityVerified: boolean }>; allVerified: boolean }>(
      '/internal/users/batch-identity-check',
      ctx,
      { userIds }
    );
    return response.data;
  }
}

/** Singleton instance of AuthServiceClient */
export const authServiceClient = new AuthServiceClient();
