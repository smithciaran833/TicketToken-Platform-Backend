/**
 * Extended Service Clients
 *
 * These extend the shared library clients to add methods that are needed
 * by ticket-service but haven't been added to @tickettoken/shared yet.
 *
 * Once methods are added to the shared library, these can be removed.
 */

import axios, { AxiosInstance } from 'axios';
import {
  OrderServiceClient as BaseOrderServiceClient,
  EventServiceClient as BaseEventServiceClient,
  AuthServiceClient as BaseAuthServiceClient,
  createRequestContext,
  HmacSigner,
  isHmacEnabled,
} from '@tickettoken/shared';

// Types for responses
export interface UserOrdersResponse {
  orders: Array<{
    id: string;
    status: string;
    eventName?: string;
    eventId: string;
    totalCents: number;
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
}

export interface EventTransferRestrictions {
  allowTransfers: boolean;
  requireIdentityVerification?: boolean;
  maxTransfersPerTicket?: number;
  transferDeadlineHours?: number;
  transferBlackoutStart?: string;
  transferBlackoutEnd?: string;
  startDate?: string;
}

export interface UserBasicInfo {
  id: string;
  email: string;
  emailVerified: boolean;
  identityVerified?: boolean;
  accountStatus: string;
}

export interface UserTransferEligibility {
  userId: string;
  accountStatus: string;
  canReceiveTransfers: boolean;
  emailVerified: boolean;
}

/**
 * Create HMAC-signed headers for internal requests
 */
function createInternalHeaders(
  method: string,
  path: string,
  body?: unknown,
  tenantId?: string,
  userId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Service': 'ticket-service',
  };

  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }
  if (userId) {
    headers['X-User-ID'] = userId;
  }

  // Add HMAC authentication if enabled
  const secret = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
  if (secret && isHmacEnabled()) {
    const signer = new HmacSigner({ secret, serviceName: 'ticket-service' });
    const hmacHeaders = signer.sign(method, path, body);
    Object.assign(headers, hmacHeaders);
  }

  return headers;
}

/**
 * Extended OrderServiceClient with additional methods for ticket-service
 */
export class ExtendedOrderServiceClient extends BaseOrderServiceClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    super();
    this.axiosInstance = axios.create({
      baseURL: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
      timeout: 10000,
    });
  }

  /**
   * Get user's orders
   *
   * NOTE: This method isn't in the base client yet.
   * Once added to @tickettoken/shared, this override can be removed.
   */
  async getUserOrders(
    userId: string,
    options: { status?: string; limit?: number; offset?: number },
    ctx: { tenantId: string; userId?: string; traceId?: string }
  ): Promise<UserOrdersResponse> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const path = `/internal/orders/user/${userId}${params.toString() ? `?${params}` : ''}`;
    const headers = createInternalHeaders('GET', path, undefined, ctx.tenantId, ctx.userId);

    try {
      const response = await this.axiosInstance.get(path, { headers });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { orders: [], total: 0 };
      }
      throw error;
    }
  }
}

/**
 * Extended EventServiceClient with transfer restriction methods
 */
export class ExtendedEventServiceClient extends BaseEventServiceClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    super();
    this.axiosInstance = axios.create({
      baseURL: process.env.EVENT_SERVICE_URL || 'http://event-service:3002',
      timeout: 10000,
    });
  }

  /**
   * Get event transfer restrictions
   *
   * NOTE: This method isn't in the base client yet.
   */
  async getEventTransferRestrictions(
    eventId: string,
    ctx: { tenantId: string; userId?: string; traceId?: string }
  ): Promise<EventTransferRestrictions> {
    const path = `/internal/events/${eventId}/transfer-restrictions`;
    const headers = createInternalHeaders('GET', path, undefined, ctx.tenantId, ctx.userId);

    try {
      const response = await this.axiosInstance.get(path, { headers });
      return response.data;
    } catch (error: any) {
      // If endpoint doesn't exist yet, return permissive defaults
      if (error.response?.status === 404) {
        return { allowTransfers: true };
      }
      throw error;
    }
  }
}

/**
 * Extended AuthServiceClient with user info methods
 */
export class ExtendedAuthServiceClient extends BaseAuthServiceClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    super();
    this.axiosInstance = axios.create({
      baseURL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      timeout: 10000,
    });
  }

  /**
   * Get basic user info for transfers
   *
   * NOTE: This method isn't in the base client yet.
   * Uses the existing getUser endpoint and extracts needed fields.
   */
  async getUserBasicInfo(
    userId: string,
    ctx: { tenantId: string; userId?: string; traceId?: string }
  ): Promise<UserBasicInfo> {
    const path = `/internal/users/${userId}`;
    const headers = createInternalHeaders('GET', path, undefined, ctx.tenantId, ctx.userId);

    try {
      const response = await this.axiosInstance.get(path, { headers });
      const user = response.data.user || response.data;
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified ?? user.emailVerified ?? false,
        identityVerified: user.identity_verified ?? user.identityVerified ?? false,
        accountStatus: user.status || user.accountStatus || 'ACTIVE',
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        const notFoundError = new Error('User not found') as Error & { statusCode: number };
        notFoundError.statusCode = 404;
        throw notFoundError;
      }
      throw error;
    }
  }

  /**
   * Get user transfer eligibility
   *
   * NOTE: This method isn't in the base client yet.
   */
  async getUserTransferEligibility(
    userId: string,
    ctx: { tenantId: string; userId?: string; traceId?: string }
  ): Promise<UserTransferEligibility> {
    // Use the same endpoint as getUserBasicInfo and extract eligibility
    const userInfo = await this.getUserBasicInfo(userId, ctx);
    return {
      userId: userInfo.id,
      accountStatus: userInfo.accountStatus,
      canReceiveTransfers: userInfo.accountStatus === 'ACTIVE',
      emailVerified: userInfo.emailVerified,
    };
  }
}

// Export singleton instances
export const extendedOrderServiceClient = new ExtendedOrderServiceClient();
export const extendedEventServiceClient = new ExtendedEventServiceClient();
export const extendedAuthServiceClient = new ExtendedAuthServiceClient();
