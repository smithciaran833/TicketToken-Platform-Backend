import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export class AuthServiceClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async validateToken(token: string): Promise<{ userId: string; email: string }> {
    try {
      const response = await this.client.post('/internal/v1/validate-token', {
        token,
      });
      return response.data;
    } catch (error) {
      logger.error('Error validating token', { error });
      throw new Error('Invalid or expired token');
    }
  }

  async getUser(userId: string): Promise<any> {
    try {
      const response = await this.client.get(`/internal/v1/users/${userId}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching user', { error, userId });
      throw new Error('User not found');
    }
  }
}
