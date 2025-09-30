import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Configuration } from './generated';
import { AuthApi } from './generated/api/auth-api';
import { EventsApi } from './generated/api/events-api';
import { TicketsApi } from './generated/api/tickets-api';
import { PaymentsApi } from './generated/api/payments-api';

export interface SDKConfig {
  baseURL?: string;
  accessToken?: string;
  refreshToken?: string;
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
  debug?: boolean;
}

export class TicketTokenSDK {
  private axiosInstance: AxiosInstance;
  private config: SDKConfig;
  private accessToken?: string;
  private refreshToken?: string;
  
  // API instances
  public auth: AuthApi;
  public events: EventsApi;
  public tickets: TicketsApi;
  public payments: PaymentsApi;

  constructor(config: SDKConfig = {}) {
    this.config = config;
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;

    // Create axios instance with interceptors
    this.axiosInstance = axios.create({
      baseURL: config.baseURL || 'http://localhost:3000/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        if (this.config.debug) {
          console.log('SDK Request:', config.method?.toUpperCase(), config.url);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (this.config.debug) {
          console.log('SDK Response:', response.status, response.config.url);
        }
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // If 401 and we have a refresh token, try to refresh
        if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const response = await this.refreshAccessToken();
            if (response) {
              originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
              return this.axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, user needs to login again
            this.clearTokens();
            throw refreshError;
          }
        }

        if (this.config.debug) {
          console.error('SDK Error:', error.response?.status, error.message);
        }
        return Promise.reject(error);
      }
    );

    // Initialize API instances
    const apiConfig = new Configuration({
      basePath: config.baseURL || 'http://localhost:3000/api/v1',
    });

    this.auth = new AuthApi(apiConfig, undefined, this.axiosInstance);
    this.events = new EventsApi(apiConfig, undefined, this.axiosInstance);
    this.tickets = new TicketsApi(apiConfig, undefined, this.axiosInstance);
    this.payments = new PaymentsApi(apiConfig, undefined, this.axiosInstance);
  }

  /**
   * Login user and store tokens
   */
  async login(email: string, password: string) {
    try {
      const response = await this.auth.login({ email, password });
      
      if (response.data) {
        // The response structure depends on your actual API
        // We need to handle the response properly based on the generated types
        const responseData = response.data as any;
        
        // Extract token data - adjust based on actual response structure
        let token: string | undefined;
        let refreshToken: string | undefined;
        let user: any | undefined;
        
        // Handle different possible response structures
        if (responseData.data) {
          token = responseData.data.token;
          refreshToken = responseData.data.refreshToken;
          user = responseData.data.user;
        } else if (responseData.token) {
          token = responseData.token;
          refreshToken = responseData.refreshToken;
          user = responseData.user;
        }
        
        if (token) {
          this.setTokens(token, refreshToken);
          return { user, token, refreshToken };
        }
      }
      
      throw new Error('Invalid response from login');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Register new user
   */
  async register(email: string, password: string, username: string, role?: 'user' | 'venue') {
    try {
      const response = await this.auth.register({ 
        email, 
        password, 
        username, 
        role: role || 'user' 
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.auth.refreshToken({ 
        refreshToken: this.refreshToken 
      });
      
      if (response.data) {
        const responseData = response.data as any;
        
        let token: string | undefined;
        let refreshToken: string | undefined;
        
        if (responseData.data) {
          token = responseData.data.token || responseData.data.accessToken;
          refreshToken = responseData.data.refreshToken;
        } else if (responseData.token || responseData.accessToken) {
          token = responseData.token || responseData.accessToken;
          refreshToken = responseData.refreshToken;
        }
        
        if (token) {
          this.setTokens(token, refreshToken);
          return { token, refreshToken };
        }
      }
      
      return null;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Set authentication tokens
   */
  setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }

    // Notify consumer about token update
    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh({
        accessToken,
        refreshToken: refreshToken || this.refreshToken || '',
      });
    }
  }

  /**
   * Clear all tokens (logout)
   */
  clearTokens() {
    this.accessToken = undefined;
    this.refreshToken = undefined;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  /**
   * Handle and format errors
   */
  private handleError(error: any) {
    if (error.response?.data?.error) {
      return new Error(error.response.data.error.message || 'API Error');
    }
    return error;
  }
}

// Export types from generated code
export * from './generated/models';
export * from './generated/api';

// Default export
export default TicketTokenSDK;
