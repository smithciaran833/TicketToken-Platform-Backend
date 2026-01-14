/**
 * Base Service Client
 * 
 * Provides a standardized HTTP client for service-to-service communication
 * with built-in circuit breaker, retry logic, and distributed tracing.
 * 
 * All internal service clients should extend this base class.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { CircuitBreaker, CircuitBreakerOptions, createDefaultCircuitBreaker } from './circuit-breaker';
import { withRetry, RetryOptions, RetryPresets } from './retry';

/**
 * Configuration for the base service client
 */
export interface ServiceClientConfig {
  /** Base URL of the service (e.g., http://ticket-service:3000) */
  baseURL: string;
  /** Service name for logging and circuit breaker */
  serviceName: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerOptions;
  /** Retry configuration */
  retry?: RetryOptions;
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Service-to-service API key or token */
  apiKey?: string;
  /** Enable request/response logging */
  enableLogging?: boolean;
}

/**
 * Request context for tracing and tenant isolation
 */
export interface RequestContext {
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** User ID making the request (optional) */
  userId?: string;
  /** Request trace ID for distributed tracing */
  traceId?: string;
  /** Request span ID for distributed tracing */
  spanId?: string;
  /** Additional headers to include */
  headers?: Record<string, string>;
}

/**
 * Standardized service response wrapper
 */
export interface ServiceResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  duration: number;
}

/**
 * Service client error with additional context
 */
export class ServiceClientError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly statusCode?: number,
    public readonly responseData?: any,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ServiceClientError';
    Object.setPrototypeOf(this, ServiceClientError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      serviceName: this.serviceName,
      statusCode: this.statusCode,
      responseData: this.responseData,
    };
  }
}

/**
 * Base class for all service clients
 * 
 * Usage:
 * ```typescript
 * class TicketServiceClient extends BaseServiceClient {
 *   constructor() {
 *     super({
 *       baseURL: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3000',
 *       serviceName: 'ticket-service',
 *     });
 *   }
 * 
 *   async getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket> {
 *     const response = await this.get<Ticket>(`/internal/tickets/${ticketId}`, ctx);
 *     return response.data;
 *   }
 * }
 * ```
 */
export abstract class BaseServiceClient {
  protected readonly axios: AxiosInstance;
  protected readonly circuitBreaker: CircuitBreaker;
  protected readonly config: Required<ServiceClientConfig>;
  protected readonly retryOptions: RetryOptions;

  constructor(config: ServiceClientConfig) {
    this.config = {
      baseURL: config.baseURL,
      serviceName: config.serviceName,
      timeout: config.timeout ?? 10000,
      circuitBreaker: config.circuitBreaker ?? {},
      retry: config.retry ?? RetryPresets.standard,
      headers: config.headers ?? {},
      apiKey: config.apiKey ?? process.env.INTERNAL_API_KEY ?? '',
      enableLogging: config.enableLogging ?? true,
    };

    this.retryOptions = this.config.retry;
    
    // Create circuit breaker
    this.circuitBreaker = createDefaultCircuitBreaker(this.config.serviceName);
    
    // Create axios instance
    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
    });

    // Add request interceptor
    this.axios.interceptors.request.use(
      (config) => this.onRequest(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor
    this.axios.interceptors.response.use(
      (response) => this.onResponse(response),
      (error) => this.onResponseError(error)
    );
  }

  /**
   * Request interceptor - adds auth, tracing, and logging
   */
  protected onRequest(config: any): any {
    // Add timing
    config.metadata = { startTime: Date.now() };
    
    // Log request
    if (this.config.enableLogging) {
      console.log(`[${this.config.serviceName}] ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    return config;
  }

  /**
   * Response interceptor - adds logging
   */
  protected onResponse(response: AxiosResponse): AxiosResponse {
    const duration = Date.now() - (response.config as any).metadata?.startTime || 0;
    
    if (this.config.enableLogging) {
      console.log(`[${this.config.serviceName}] ${response.status} ${duration}ms`);
    }
    
    return response;
  }

  /**
   * Response error interceptor - transforms errors
   */
  protected onResponseError(error: AxiosError): Promise<never> {
    const duration = Date.now() - (error.config as any)?.metadata?.startTime || 0;
    
    if (this.config.enableLogging) {
      console.error(`[${this.config.serviceName}] Error ${error.response?.status || 'NETWORK'} ${duration}ms`);
    }
    
    return Promise.reject(error);
  }

/**
 * Build headers for a request including tenant context and tracing.
 * Throws if tenantId is missing or invalid.
 */
  protected buildHeaders(context: RequestContext): Record<string, string> {
    // Validate tenantId is present and valid
    if (!context.tenantId || context.tenantId === 'undefined' || context.tenantId === 'null') {
      throw new ServiceClientError(
        'tenantId is required for service-to-service requests',
        this.config.serviceName,
        400,
        { error: 'MISSING_TENANT_ID' }
      );
    }

    const headers: Record<string, string> = {
      'X-Tenant-ID': context.tenantId,
      'X-Internal-Service': 'true',
    };

    // Add API key authentication
    if (this.config.apiKey) {
      headers['X-Internal-API-Key'] = this.config.apiKey;
    }

    // Add user context
    if (context.userId) {
      headers['X-User-ID'] = context.userId;
    }

    // Add distributed tracing headers
    if (context.traceId) {
      headers['X-Trace-ID'] = context.traceId;
    }
    if (context.spanId) {
      headers['X-Span-ID'] = context.spanId;
    }

    // Add any additional headers
    if (context.headers) {
      Object.assign(headers, context.headers);
    }

    return headers;
  }

  /**
   * Make a GET request
   */
  protected async get<T>(
    path: string,
    context: RequestContext,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    return this.request<T>('GET', path, context, undefined, config);
  }

  /**
   * Make a POST request
   */
  protected async post<T>(
    path: string,
    context: RequestContext,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    return this.request<T>('POST', path, context, data, config);
  }

  /**
   * Make a PUT request
   */
  protected async put<T>(
    path: string,
    context: RequestContext,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    return this.request<T>('PUT', path, context, data, config);
  }

  /**
   * Make a PATCH request
   */
  protected async patch<T>(
    path: string,
    context: RequestContext,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    return this.request<T>('PATCH', path, context, data, config);
  }

  /**
   * Make a DELETE request
   */
  protected async delete<T>(
    path: string,
    context: RequestContext,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    return this.request<T>('DELETE', path, context, undefined, config);
  }

  /**
   * Core request method with circuit breaker, retry, and idempotency
   */
  protected async request<T>(
    method: string,
    path: string,
    context: RequestContext,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ServiceResponse<T>> {
    const startTime = Date.now();
    const headers = this.buildHeaders(context);

    // Add idempotency key for mutation requests to prevent duplicate operations on retry
    const isMutationRequest = ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
    if (isMutationRequest) {
      // Generate a stable idempotency key based on request parameters
      // This ensures retries use the same key but different requests get different keys
      headers['Idempotency-Key'] = this.generateIdempotencyKey(method, path, context, data);
    }

    const executeRequest = async (): Promise<ServiceResponse<T>> => {
      try {
        const response = await this.axios.request<T>({
          method,
          url: path,
          data,
          headers,
          ...config,
        });

        return {
          data: response.data,
          status: response.status,
          headers: response.headers as Record<string, string>,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        throw this.transformError(error as AxiosError);
      }
    };

    // Wrap with circuit breaker
    const withCircuitBreaker = () => this.circuitBreaker.execute(executeRequest);

    // Wrap with retry
    return withRetry(withCircuitBreaker, {
      ...this.retryOptions,
      onRetry: (error, attempt, delay) => {
        console.warn(
          `[${this.config.serviceName}] Retry attempt ${attempt} for ${method} ${path} after ${delay}ms`,
          error.message
        );
      },
    });
  }

  /**
   * Transform axios error to service client error
   */
  protected transformError(error: AxiosError): ServiceClientError {
    if (error.response) {
      // Server responded with error status
      return new ServiceClientError(
        `${this.config.serviceName} responded with ${error.response.status}: ${error.message}`,
        this.config.serviceName,
        error.response.status,
        error.response.data,
        error
      );
    } else if (error.request) {
      // No response received
      return new ServiceClientError(
        `No response from ${this.config.serviceName}: ${error.message}`,
        this.config.serviceName,
        undefined,
        undefined,
        error
      );
    } else {
      // Request setup error
      return new ServiceClientError(
        `Request to ${this.config.serviceName} failed: ${error.message}`,
        this.config.serviceName,
        undefined,
        undefined,
        error
      );
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(context: RequestContext): Promise<boolean> {
    try {
      await this.get('/health', context, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Generate a stable idempotency key for mutation requests.
   * The key is based on the request parameters so retries get the same key,
   * but different requests get different keys.
   * 
   * @param method - HTTP method
   * @param path - Request path
   * @param context - Request context
   * @param data - Request body data
   * @returns Idempotency key string
   */
  protected generateIdempotencyKey(
    method: string,
    path: string,
    context: RequestContext,
    data?: any
  ): string {
    // Create a stable hash from the request parameters
    const components = [
      this.config.serviceName,
      method.toUpperCase(),
      path,
      context.tenantId,
      context.userId || '',
      context.traceId || '',
      data ? JSON.stringify(data) : '',
    ];
    
    // Simple hash function for idempotency key
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Return a readable key format with hash
    return `${this.config.serviceName}-${method.toLowerCase()}-${Math.abs(hash).toString(36)}`;
  }
}

/**
 * Create a simple request context from tenant and user
 */
export function createRequestContext(
  tenantId: string,
  userId?: string,
  traceId?: string
): RequestContext {
  return {
    tenantId,
    userId,
    traceId: traceId || generateTraceId(),
  };
}

/**
 * Generate a random trace ID
 */
function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Helper to extract request context from Express request
 */
export function extractRequestContext(req: any): RequestContext {
  return {
    tenantId: req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'],
    userId: req.userId || req.user?.id || req.headers['x-user-id'],
    traceId: req.traceId || req.headers['x-trace-id'],
    spanId: req.spanId || req.headers['x-span-id'],
  };
}
