import { HTTPClient } from '../client/http-client';
import { User, PaginationParams, PaginatedResponse } from '../types/api';

/**
 * Users resource for managing user operations
 */
export class Users {
  private client: HTTPClient;

  constructor(client: HTTPClient) {
    this.client = client;
  }

  /**
   * Get current user
   */
  async me(): Promise<User> {
    return this.client.get<User>('/users/me');
  }

  /**
   * Get user by ID
   */
  async get(userId: string): Promise<User> {
    return this.client.get<User>(`/users/${userId}`);
  }

  /**
   * Update current user
   */
  async update(data: Partial<User>): Promise<User> {
    return this.client.patch<User>('/users/me', data);
  }

  /**
   * List users (admin only)
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<User>> {
    return this.client.get<PaginatedResponse<User>>('/users', { params });
  }
}
