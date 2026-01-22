/**
 * Auth Service Client
 *
 * HMAC-authenticated client for communication with auth-service.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
} from '@tickettoken/shared';

interface UserDetails {
  id: string;
  email: string;
  name: string;
  phone?: string;
  preferences?: Record<string, unknown>;
}

interface UserResponse {
  user: UserDetails;
}

export class AuthServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      serviceName: 'auth-service',
      timeout: 5000,
      ...config,
    });
  }

  /**
   * Get user details by ID
   */
  async getUserById(userId: string, ctx: RequestContext): Promise<UserDetails | null> {
    try {
      const response = await this.get<UserResponse>(`/api/v1/users/${userId}`, ctx);
      return response.data.user;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string, ctx: RequestContext): Promise<Record<string, unknown> | null> {
    try {
      const user = await this.getUserById(userId, ctx);
      return user?.preferences || null;
    } catch {
      return null;
    }
  }
}

// Singleton instance
let authServiceClient: AuthServiceClient | null = null;

export function getAuthServiceClient(): AuthServiceClient {
  if (!authServiceClient) {
    authServiceClient = new AuthServiceClient();
  }
  return authServiceClient;
}

export default AuthServiceClient;
