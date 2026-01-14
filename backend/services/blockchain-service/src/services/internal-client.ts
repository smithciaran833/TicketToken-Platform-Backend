/**
 * Internal Service HTTP Client
 * 
 * AUDIT FIX #27: HTTPS for internal service communication
 * 
 * Features:
 * - TLS verification enabled in production
 * - Circuit breaker for resilience
 * - Automatic retries with exponential backoff
 * - Request correlation ID forwarding
 * - Timeout configuration
 */

import https from 'https';
import http from 'http';
import { logger } from '../utils/logger';
import { internalServices, validateServiceUrls } from '../config/services';
import { CircuitBreaker, CircuitBreakerState } from '../utils/circuit-breaker';

// Environment checks
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * TLS Agent configuration for HTTPS requests
 * AUDIT FIX #27: TLS verification in production
 */
function createHttpsAgent(): https.Agent {
  const rejectUnauthorized = process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED !== 'false';
  
  // Warn if TLS verification is disabled
  if (!rejectUnauthorized && isProduction) {
    logger.warn('TLS certificate verification is DISABLED for internal services', {
      hint: 'This is insecure! Set INTERNAL_TLS_REJECT_UNAUTHORIZED=true in production',
      security: 'WARNING'
    });
  }

  return new https.Agent({
    rejectUnauthorized,
    // Optional: custom CA for internal services
    ca: process.env.INTERNAL_TLS_CA || undefined,
    // Keep connections alive for better performance
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: parseInt(process.env.INTERNAL_HTTP_TIMEOUT || '30000', 10)
  });
}

/**
 * HTTP Agent for development/local connections
 */
function createHttpAgent(): http.Agent {
  return new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: parseInt(process.env.INTERNAL_HTTP_TIMEOUT || '30000', 10)
  });
}

// Singleton agents
const httpsAgent = createHttpsAgent();
const httpAgent = createHttpAgent();

// Circuit breakers per service
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create circuit breaker for a service
 */
function getCircuitBreaker(serviceName: string): CircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, new CircuitBreaker({
      name: `internal-${serviceName}`,
      threshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    }));
  }
  return circuitBreakers.get(serviceName)!;
}

/**
 * Request options interface
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  correlationId?: string;
  tenantId?: string;
  retries?: number;
  retryDelay?: number;
}

/**
 * Response interface
 */
interface InternalResponse<T = any> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}

/**
 * Validate URL uses HTTPS in production
 * AUDIT FIX #27: Fail fast for HTTP in production
 */
function validateUrl(url: string, serviceName: string): void {
  try {
    const parsed = new URL(url);
    const isLocalhost = 
      parsed.hostname === 'localhost' || 
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    
    if (isProduction && parsed.protocol === 'http:' && !isLocalhost) {
      throw new Error(
        `SECURITY: HTTP is not allowed in production for ${serviceName}. ` +
        `URL ${url} must use HTTPS.`
      );
    }
    
    if (!isProduction && parsed.protocol === 'http:') {
      logger.debug(`Using HTTP for ${serviceName} (development mode)`, { url });
    }
  } catch (error) {
    if ((error as Error).message.includes('SECURITY')) {
      throw error;
    }
    throw new Error(`Invalid URL for ${serviceName}: ${url}`);
  }
}

/**
 * Make HTTP/HTTPS request with retries
 */
async function makeRequest<T>(
  url: string,
  options: RequestOptions = {}
): Promise<InternalResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    correlationId,
    tenantId,
    retries = 3,
    retryDelay = 1000
  } = options;

  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const agent = isHttps ? httpsAgent : httpAgent;
  const transport = isHttps ? https : http;

  // Build request headers
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'blockchain-service/1.0',
    ...headers
  };

  // Add correlation ID for request tracing
  if (correlationId) {
    requestHeaders['X-Correlation-ID'] = correlationId;
    requestHeaders['X-Request-ID'] = correlationId;
  }

  // Add tenant ID for multi-tenant requests
  if (tenantId) {
    requestHeaders['X-Tenant-ID'] = tenantId;
  }

  // Add internal service auth token if configured
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (internalToken) {
    requestHeaders['Authorization'] = `Bearer ${internalToken}`;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await new Promise<InternalResponse<T>>((resolve, reject) => {
        const requestOptions = {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method,
          headers: requestHeaders,
          agent,
          timeout
        };

        const req = transport.request(requestOptions, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const jsonData = data ? JSON.parse(data) : null;
              const responseHeaders: Record<string, string> = {};
              
              for (const [key, value] of Object.entries(res.headers)) {
                if (typeof value === 'string') {
                  responseHeaders[key] = value;
                }
              }

              resolve({
                status: res.statusCode || 500,
                statusText: res.statusMessage || 'Unknown',
                data: jsonData,
                headers: responseHeaders
              });
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${(parseError as Error).message}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Request timeout after ${timeout}ms`));
        });

        // Send body for POST/PUT/PATCH
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          req.write(JSON.stringify(body));
        }

        req.end();
      });

      // Check for server errors that should trigger retry
      if (response.status >= 500 && attempt < retries) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
      
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        logger.warn('Internal request retry', {
          url,
          attempt: attempt + 1,
          maxRetries: retries,
          delay,
          error: lastError.message
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Request failed');
}

/**
 * Internal service client
 */
export class InternalServiceClient {
  private serviceName: string;
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor(serviceName: string, baseUrl: string) {
    this.serviceName = serviceName;
    this.baseUrl = baseUrl;
    this.circuitBreaker = getCircuitBreaker(serviceName);
    
    // Validate URL on construction
    validateUrl(baseUrl, serviceName);
  }

  /**
   * GET request
   */
  async get<T>(path: string, options: RequestOptions = {}): Promise<InternalResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body: any, options: RequestOptions = {}): Promise<InternalResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body: any, options: RequestOptions = {}): Promise<InternalResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, options: RequestOptions = {}): Promise<InternalResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, body: any, options: RequestOptions = {}): Promise<InternalResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  /**
   * Make request with circuit breaker
   */
  private async request<T>(path: string, options: RequestOptions): Promise<InternalResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    return this.circuitBreaker.execute(async () => {
      const startTime = Date.now();
      
      try {
        const response = await makeRequest<T>(url, options);
        
        logger.debug('Internal service request', {
          service: this.serviceName,
          method: options.method,
          path,
          status: response.status,
          duration: Date.now() - startTime
        });
        
        return response;
      } catch (error) {
        logger.error('Internal service request failed', {
          service: this.serviceName,
          method: options.method,
          path,
          error: (error as Error).message,
          duration: Date.now() - startTime
        });
        throw error;
      }
    });
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }
}

// =============================================================================
// PRE-CONFIGURED SERVICE CLIENTS
// =============================================================================

export const mintingServiceClient = new InternalServiceClient(
  'minting-service',
  internalServices.mintingService
);

export const orderServiceClient = new InternalServiceClient(
  'order-service',
  internalServices.orderService
);

export const eventServiceClient = new InternalServiceClient(
  'event-service',
  internalServices.eventService
);

export const ticketServiceClient = new InternalServiceClient(
  'ticket-service',
  internalServices.ticketService
);

export const authServiceClient = new InternalServiceClient(
  'auth-service',
  internalServices.authService
);

export const notificationServiceClient = new InternalServiceClient(
  'notification-service',
  internalServices.notificationService
);

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize internal clients
 * Call this at startup to validate configuration
 */
export function initializeInternalClients(): void {
  const validation = validateServiceUrls();
  
  if (!validation.valid) {
    if (isProduction) {
      throw new Error(
        `Internal service URL validation failed:\n${validation.errors.join('\n')}`
      );
    } else {
      logger.warn('Internal service URL validation warnings', {
        errors: validation.errors
      });
    }
  }
  
  logger.info('Internal service clients initialized', {
    services: Object.keys(internalServices).length,
    httpsAgent: 'enabled',
    circuitBreakers: circuitBreakers.size
  });
}

export default {
  InternalServiceClient,
  mintingServiceClient,
  orderServiceClient,
  eventServiceClient,
  ticketServiceClient,
  authServiceClient,
  notificationServiceClient,
  initializeInternalClients
};
