import axios, { AxiosInstance, AxiosError } from 'axios';
import { FastifyInstance } from 'fastify';
import { AuthServiceUser, AuthServiceErrorResponse } from '../types/auth-service.types';
import { serviceUrls } from '../config/services';
import { getCircuitBreaker } from '../middleware/circuit-breaker.middleware';

export class AuthServiceClient {
  private httpClient: AxiosInstance;
  private server: FastifyInstance;
  private serviceUrl: string;

  constructor(server: FastifyInstance) {
    this.server = server;
    this.serviceUrl = serviceUrls.auth;
    
    this.httpClient = axios.create({
      baseURL: this.serviceUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-internal': 'true'
      }
    });
  }

  /**
   * Get user by ID from auth-service
   * Uses circuit breaker for resilience
   */
  async getUserById(userId: string): Promise<AuthServiceUser | null> {
    const circuitBreaker = getCircuitBreaker('auth-service');
    
    try {
      const makeRequest = async () => {
        const response = await this.httpClient.get<AuthServiceUser>(`/users/${userId}`);
        return response.data;
      };

      // Use circuit breaker if available, otherwise make direct request
      const user = circuitBreaker 
        ? (await circuitBreaker.fire(makeRequest) as AuthServiceUser)
        : await makeRequest();

      return user;
    } catch (error) {
      return this.handleError(error, 'getUserById');
    }
  }

  /**
   * Validate token with auth-service
   * This can be used as an alternative to JWT verification
   */
  async validateToken(token: string): Promise<{ valid: boolean; user?: AuthServiceUser }> {
    const circuitBreaker = getCircuitBreaker('auth-service');

    try {
      const makeRequest = async () => {
        const response = await this.httpClient.post<{ valid: boolean; user?: AuthServiceUser }>(
          '/auth/validate',
          { token }
        );
        return response.data;
      };

      const result = circuitBreaker
        ? (await circuitBreaker.fire(makeRequest) as { valid: boolean; user?: AuthServiceUser })
        : await makeRequest();

      return result;
    } catch (error) {
      return this.handleError(error, 'validateToken', { valid: false });
    }
  }

  /**
   * Handle errors from auth-service
   */
  private handleError(error: any, method: string, defaultReturn?: any): any {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<AuthServiceErrorResponse>;
      
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
        this.server.log.error({
          method,
          error: 'Auth service unavailable',
          code: axiosError.code
        }, 'AuthServiceClient error');
        
        // Service unavailable - return null to indicate failure
        return defaultReturn !== undefined ? defaultReturn : null;
      }

      if (axiosError.response?.status === 404) {
        // User not found
        this.server.log.warn({
          method,
          status: 404
        }, 'User not found in auth service');
        return null;
      }

      this.server.log.error({
        method,
        status: axiosError.response?.status,
        message: axiosError.response?.data?.message || axiosError.message
      }, 'AuthServiceClient error');
    } else {
      this.server.log.error({
        method,
        error: error.message
      }, 'AuthServiceClient unexpected error');
    }

    return defaultReturn !== undefined ? defaultReturn : null;
  }

  /**
   * Health check for auth service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', { timeout: 2000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
