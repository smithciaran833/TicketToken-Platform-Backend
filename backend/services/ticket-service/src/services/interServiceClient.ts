import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId?: string;
    traceId?: string;
    duration?: number;
  };
}

interface RequestOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  headers?: Record<string, any>;
}

class InterServiceClientClass {
  private clients: Map<string, AxiosInstance> = new Map();
  private log = logger.child({ component: 'InterServiceClient' });
  private healthStatus: Map<string, boolean> = new Map();

  constructor() {
    this.initializeClients();
    this.startHealthChecks();
  }

  private initializeClients() {
    const services = ['auth', 'event', 'payment', 'user', 'notification'];

    for (const service of services) {
      const serviceUrl = this.getServiceUrl(service);
      const client = axios.create({
        baseURL: serviceUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Request interceptor to add tracing headers
      client.interceptors.request.use(
        (config) => {
          // Add service headers
          const additionalHeaders = {
            'X-Service': 'ticket-service',
            'X-Target-Service': service,
            'X-Request-Id': Math.random().toString(36).substr(2, 9)
          };

          config.headers = {
            ...config.headers,
            ...additionalHeaders
          } as any;

          // Log outgoing request
          this.log.debug('Outgoing request', {
            service,
            method: config.method,
            url: config.url
          });

          // Record request start time
          (config as any).metadata = { startTime: Date.now() };

          return config;
        },
        (error) => {
          this.log.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging and error handling
      client.interceptors.response.use(
        (response) => {
          const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());

          this.log.debug('Response received', {
            service,
            status: response.status,
            duration
          });

          // Mark service as healthy
          this.healthStatus.set(service, true);

          return response;
        },
        (error: AxiosError) => {
          const duration = Date.now() - ((error.config as any)?.metadata?.startTime || Date.now());

          this.log.error('Service request failed', {
            service,
            error: error.message,
            status: error.response?.status,
            duration,
            url: error.config?.url
          });

          // Mark service as unhealthy on certain errors
          if (!error.response || error.response.status >= 500) {
            this.healthStatus.set(service, false);
          }

          return Promise.reject(error);
        }
      );

      this.clients.set(service, client);
    }
  }

  private getServiceUrl(service: string): string {
    const urls: Record<string, any> = {
      auth: config.services?.auth || 'http://auth-service:3001',
      event: config.services?.event || 'http://event-service:3003',
      payment: config.services?.payment || 'http://payment-service:3006',
      user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
      notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007'
    };

    return urls[service] || `http://${service}-service:3000`;
  }

  async request<T = any>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const client = this.clients.get(service);

    if (!client) {
      throw new Error(`Service client not found: ${service}`);
    }

    const startTime = Date.now();

    try {
      // Check if service is healthy
      if (!this.healthStatus.get(service)) {
        this.log.warn(`Service ${service} is marked as unhealthy`);
      }

      const response = await client.request<T>({
        method: method as any,
        url: path,
        data,
        timeout: options?.timeout || 10000,
        headers: options?.headers
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: response.headers['x-request-id'],
          traceId: response.headers['x-trace-id'],
          duration
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        this.log.error('Inter-service request failed', {
          service,
          path,
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
          duration
        });

        // Retry logic for transient errors
        if (options?.retry && this.shouldRetry(error)) {
          return this.retryRequest(service, method, path, data, options);
        }

        return {
          success: false,
          error: error.response?.data?.error || error.message,
          metadata: {
            requestId: error.response?.headers?.['x-request-id'],
            traceId: error.response?.headers?.['x-trace-id'],
            duration
          }
        };
      }

      throw error;
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx errors
    if (!error.response) return true;
    if (error.response.status >= 500) return true;
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    return false;
  }

  private async retryRequest<T>(
    service: string,
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ServiceResponse<T>> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        return await this.request(service, method, path, data, {
          ...options,
          retry: false // Don't retry again
        });
      } catch (error) {
        lastError = error;
        this.log.warn(`Retry ${i + 1}/${maxRetries} failed`, {
          service,
          path,
          error
        });
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All retries failed'
    };
  }

  // Convenience methods
  async get<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'GET', path, undefined, options);
  }

  async post<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'POST', path, data, options);
  }

  async put<T = any>(service: string, path: string, data?: any, options?: RequestOptions) {
    return this.request<T>(service, 'PUT', path, data, options);
  }

  async delete<T = any>(service: string, path: string, options?: RequestOptions) {
    return this.request<T>(service, 'DELETE', path, undefined, options);
  }

  // Health check methods
  private startHealthChecks() {
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks() {
    for (const [service, client] of this.clients.entries()) {
      try {
        const response = await client.get('/health', {
          timeout: 2000,
          headers: {
            'X-Service': 'ticket-service',
            'X-Health-Check': 'true'
          }
        });

        this.healthStatus.set(service, response.status === 200);
      } catch (error) {
        this.healthStatus.set(service, false);
        this.log.debug(`Health check failed for ${service}`);
      }
    }
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [service, status] of this.healthStatus.entries()) {
      health[service] = status;
    }

    return health;
  }

  getHealthStatus(service: string): boolean {
    return this.healthStatus.get(service) || false;
  }
}

export const InterServiceClient = new InterServiceClientClass();
