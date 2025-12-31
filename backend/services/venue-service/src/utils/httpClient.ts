import axios from 'axios';
import https from 'https';
import CircuitBreaker from 'opossum';
import { randomUUID, createHmac } from 'crypto';

// SECURITY FIX (NS13): TLS configuration for secure connections
const isProduction = process.env.NODE_ENV === 'production';
const httpsAgent = new https.Agent({
  rejectUnauthorized: isProduction, // Strict in production, relaxed in development
  minVersion: 'TLSv1.2', // Minimum TLS version
  maxVersion: 'TLSv1.3', // Maximum TLS version
  // Optional: Add CA certs for internal services
  // ca: process.env.INTERNAL_CA_CERT ? Buffer.from(process.env.INTERNAL_CA_CERT, 'base64') : undefined,
});

// SECURITY FIX (RS9): Service identity for outbound requests
const SERVICE_NAME = process.env.SERVICE_NAME || 'venue-service';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

// SECURITY FIX (SC1): Internal service authentication
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;

export interface HttpClientOptions {
  baseURL: string;
  timeout?: number;
  enableInternalAuth?: boolean;
}

export class HttpClient {
  private client: any;
  private circuitBreaker: CircuitBreaker;
  private enableInternalAuth: boolean;

  constructor(options: string | HttpClientOptions, private logger: any) {
    const config = typeof options === 'string' 
      ? { baseURL: options, timeout: 10000, enableInternalAuth: false }
      : { timeout: 10000, enableInternalAuth: false, ...options };
    
    this.enableInternalAuth = config.enableInternalAuth ?? false;
    
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      // SECURITY FIX (NS13): Use HTTPS agent with TLS cert validation
      httpsAgent,
      // SECURITY FIX (RS9): Add service identity headers to all requests
      headers: {
        'X-Service-Name': SERVICE_NAME,
        'X-Service-Version': SERVICE_VERSION,
        'User-Agent': `${SERVICE_NAME}/${SERVICE_VERSION}`,
      }
    });

    // Circuit breaker configuration
    this.circuitBreaker = new CircuitBreaker(
      async (config: any) => this.client.request(config),
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: any) => {
        // SECURITY FIX (RS9/RS10): Add request ID for correlation tracking
        const requestId = config.headers?.['X-Request-ID'] || randomUUID();
        const correlationId = config.headers?.['X-Correlation-ID'] || requestId;
        
        config.headers = {
          ...config.headers,
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        };

        // SECURITY FIX (SC1): Add internal service authentication
        if (this.enableInternalAuth && INTERNAL_SERVICE_SECRET) {
          const timestamp = Date.now().toString();
          const method = config.method?.toUpperCase() || 'GET';
          const url = config.url || '';
          
          // Create HMAC signature for request authentication
          const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}`;
          const signature = createHmac('sha256', INTERNAL_SERVICE_SECRET)
            .update(payload)
            .digest('hex');
          
          config.headers['X-Internal-Service'] = SERVICE_NAME;
          config.headers['X-Internal-Timestamp'] = timestamp;
          config.headers['X-Internal-Signature'] = signature;
        }
        
        this.logger.debug({ 
          url: config.url, 
          method: config.method,
          requestId,
          correlationId,
          serviceName: SERVICE_NAME,
          hasInternalAuth: this.enableInternalAuth && !!INTERNAL_SERVICE_SECRET
        }, 'HTTP request');
        return config;
      },
      (error: any) => {
        this.logger.error({ error }, 'HTTP request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: any) => {
        this.logger.debug({ url: response.config.url, status: response.status }, 'HTTP response');
        return response;
      },
      (error: any) => {
        this.logger.error({ 
          url: error.config?.url,
          status: error.response?.status,
          error: error.message 
        }, 'HTTP response error');
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make GET request with optional correlation ID propagation
   */
  async get(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'GET', url });
  }

  /**
   * Make POST request with optional correlation ID propagation
   */
  async post(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'POST', url, data });
  }

  /**
   * Make PUT request with optional correlation ID propagation
   */
  async put(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'PUT', url, data });
  }

  /**
   * Make DELETE request with optional correlation ID propagation
   */
  async delete(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'DELETE', url });
  }

  /**
   * Set correlation ID for subsequent requests (for request-scoped tracking)
   */
  setCorrelationId(correlationId: string): void {
    this.client.defaults.headers.common['X-Correlation-ID'] = correlationId;
  }
}

/**
 * Create HTTP client with internal service authentication enabled
 * Use for service-to-service communication
 */
export function createInternalHttpClient(baseURL: string, logger: any): HttpClient {
  return new HttpClient({ baseURL, enableInternalAuth: true }, logger);
}
