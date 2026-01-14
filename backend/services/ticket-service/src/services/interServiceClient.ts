import axios, { AxiosInstance, AxiosError } from 'axios';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
// Import new S2S auth with JWT tokens, circuit breaker, per-service credentials
import { 
  serviceAuth, 
  circuitBreaker, 
  generateServiceToken,
  computeBodyHash,
  SERVICE_CREDENTIALS,
  CircuitBreakerState
} from '../config/service-auth';

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

  /**
   * SECURITY: Generate HMAC signature for service-to-service authentication
   * The signature includes: service name, timestamp, URL, and optionally request body
   * This prevents replay attacks and ensures request integrity
   */
  private generateSignature(
    serviceName: string,
    timestamp: string,
    url: string,
    body?: string
  ): string {
    const secret = config.internalServiceSecret;
    if (!secret) {
      this.log.warn('INTERNAL_SERVICE_SECRET not configured - S2S auth disabled');
      return '';
    }

    // Include body hash in signature to prevent tampering
    const bodyHash = body ? createHmac('sha256', secret).update(body).digest('hex') : '';
    const payload = `${serviceName}:${timestamp}:${url}:${bodyHash}`;
    
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * SECURITY: Timing-safe comparison of HMAC signatures
   * Uses crypto.timingSafeEqual to prevent timing attacks
   * 
   * IMPORTANT: Regular === comparison leaks timing information that attackers
   * can use to guess the correct signature byte-by-byte
   */
  public verifySignature(
    expectedSignature: string,
    actualSignature: string
  ): boolean {
    if (!expectedSignature || !actualSignature) {
      return false;
    }

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(actualSignature, 'hex');

      // SECURITY: Length check must happen before timingSafeEqual
      // timingSafeEqual throws if lengths differ, so we return false instead
      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (error) {
      this.log.error('Signature verification error', { error });
      return false;
    }
  }

  /**
   * SECURITY: Validate incoming service-to-service request signature
   * Checks timestamp to prevent replay attacks (5 minute window)
   */
  public validateIncomingSignature(
    serviceName: string,
    timestamp: string,
    url: string,
    providedSignature: string,
    body?: string
  ): boolean {
    // Check timestamp freshness (prevent replay attacks)
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
      this.log.warn('S2S request timestamp out of range', {
        serviceName,
        requestTime,
        now,
        diff: Math.abs(now - requestTime)
      });
      return false;
    }

    const expectedSignature = this.generateSignature(serviceName, timestamp, url, body);
    
    if (!expectedSignature) {
      // No secret configured - allow in development, deny in production
      if (config.env === 'production') {
        this.log.error('S2S auth required in production but secret not configured');
        return false;
      }
      return true;
    }

    return this.verifySignature(expectedSignature, providedSignature);
  }

  /**
   * Generate a nonce for request uniqueness
   */
  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  private initializeClients() {
    const services = ['auth', 'event', 'payment', 'notification'];

    for (const service of services) {
      const serviceUrl = this.getServiceUrl(service);
      const client = axios.create({
        baseURL: serviceUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Request interceptor to add JWT tokens and circuit breaker
      client.interceptors.request.use(
        (requestConfig) => {
          // CIRCUIT BREAKER: Check if service requests are allowed
          const fullServiceName = `${service}-service`;
          if (!circuitBreaker.allowRequest(fullServiceName)) {
            const state = circuitBreaker.getState(fullServiceName);
            this.log.warn('Circuit breaker OPEN - request blocked', {
              service: fullServiceName,
              state: state.state,
              nextAttempt: state.nextAttempt
            });
            throw new Error(`Circuit breaker OPEN for ${fullServiceName}`);
          }

          const timestamp = Date.now().toString();
          const nonce = this.generateNonce();
          const fullUrl = `${requestConfig.baseURL}${requestConfig.url}`;
          const bodyString = requestConfig.data ? JSON.stringify(requestConfig.data) : '';
          
          // SECURITY FIX: Generate body hash for integrity verification
          const bodyHash = bodyString ? computeBodyHash(bodyString) : undefined;
          
          // SECURITY FIX: Generate short-lived JWT token for S2S auth
          // Fixes: "Short-lived tokens - Static API key"
          // Fixes: "Audience validated - No audience validation"
          // Fixes: "Request body in signature"
          let jwtToken: string | undefined;
          try {
            jwtToken = generateServiceToken(fullServiceName, {
              subject: requestConfig.url,
              bodyHash,
              expiresIn: 60  // 60 second expiry
            });
          } catch (err) {
            this.log.warn('Failed to generate JWT token, falling back to HMAC', { error: err });
          }
          
          // Also generate legacy HMAC signature for backwards compatibility
          const signature = this.generateSignature(
            'ticket-service',
            timestamp,
            fullUrl,
            bodyString
          );

          // Add service headers with JWT and HMAC authentication
          const additionalHeaders: Record<string, string> = {
            'X-Service': 'ticket-service',
            'X-Target-Service': service,
            'X-Request-Id': this.generateNonce().substring(0, 16),
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
          };

          // Add JWT Bearer token (preferred)
          if (jwtToken) {
            additionalHeaders['Authorization'] = `Bearer ${jwtToken}`;
          }

          // Also add legacy signature for services not yet upgraded
          if (signature) {
            additionalHeaders['X-Signature'] = signature;
          }

          requestConfig.headers = {
            ...requestConfig.headers,
            ...additionalHeaders
          } as any;

          // Log outgoing request (without sensitive data)
          this.log.debug('Outgoing request', {
            service,
            method: requestConfig.method,
            url: requestConfig.url,
            hasJwt: !!jwtToken,
            hasSignature: !!signature
          });

          // Record request start time
          (requestConfig as any).metadata = { startTime: Date.now(), service: fullServiceName };

          return requestConfig;
        },
        (error) => {
          this.log.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging, error handling, and circuit breaker
      client.interceptors.response.use(
        (response) => {
          const metadata = (response.config as any).metadata || {};
          const duration = Date.now() - (metadata.startTime || Date.now());
          const fullServiceName = metadata.service || `${service}-service`;

          this.log.debug('Response received', {
            service: fullServiceName,
            status: response.status,
            duration
          });

          // CIRCUIT BREAKER: Record success
          circuitBreaker.recordSuccess(fullServiceName);

          // Mark service as healthy
          this.healthStatus.set(service, true);

          return response;
        },
        (error: AxiosError) => {
          const metadata = (error.config as any)?.metadata || {};
          const duration = Date.now() - (metadata.startTime || Date.now());
          const fullServiceName = metadata.service || `${service}-service`;

          this.log.error('Service request failed', {
            service: fullServiceName,
            error: error.message,
            status: error.response?.status,
            duration,
            url: error.config?.url
          });

          // CIRCUIT BREAKER: Record failure for 5xx errors and network errors
          if (!error.response || error.response.status >= 500) {
            circuitBreaker.recordFailure(fullServiceName, error);
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

  // ==========================================================================
  // CIRCUIT BREAKER METHODS - Fixes "Circuit breaker - Health tracking, no breaker"
  // ==========================================================================

  /**
   * Get circuit breaker state for a specific service
   */
  getCircuitState(service: string): CircuitBreakerState {
    const fullServiceName = service.endsWith('-service') ? service : `${service}-service`;
    return circuitBreaker.getState(fullServiceName);
  }

  /**
   * Get all circuit breaker states (for monitoring/health endpoints)
   */
  getAllCircuitStates(): Record<string, CircuitBreakerState> {
    return circuitBreaker.getAllStates();
  }

  /**
   * Manually reset a circuit breaker (admin operation)
   */
  resetCircuit(service: string): void {
    const fullServiceName = service.endsWith('-service') ? service : `${service}-service`;
    circuitBreaker.reset(fullServiceName);
    this.log.info('Circuit breaker manually reset', { service: fullServiceName });
  }

  /**
   * Check if a service request would be allowed by circuit breaker
   */
  isCircuitAllowed(service: string): boolean {
    const fullServiceName = service.endsWith('-service') ? service : `${service}-service`;
    return circuitBreaker.allowRequest(fullServiceName);
  }
}

export const InterServiceClient = new InterServiceClientClass();
