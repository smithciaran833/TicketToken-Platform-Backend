import axios from 'axios';
import https from 'https';
import CircuitBreaker from 'opossum';
import { randomUUID, createHmac } from 'crypto';

// SECURITY FIX (NS13): TLS configuration for secure connections
const isProduction = process.env.NODE_ENV === 'production';
const httpsAgent = new https.Agent({
  rejectUnauthorized: isProduction,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
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
  private client: ReturnType<typeof axios.create>;
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
      headers: {
        'X-Service-Name': SERVICE_NAME,
        'X-Service-Version': SERVICE_VERSION,
        'User-Agent': `${SERVICE_NAME}/${SERVICE_VERSION}`,
      }
    } as any);
    
    // Apply httpsAgent after creation
    (this.client.defaults as any).httpsAgent = httpsAgent;

    this.circuitBreaker = new CircuitBreaker(
      async (requestConfig: any) => this.client.request(requestConfig),
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      (config: any) => {
        const requestId = config.headers?.['X-Request-ID'] || randomUUID();
        const correlationId = config.headers?.['X-Correlation-ID'] || requestId;

        config.headers = {
          ...config.headers,
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        };

        if (this.enableInternalAuth && INTERNAL_SERVICE_SECRET) {
          const timestamp = Date.now().toString();
          const method = config.method?.toUpperCase() || 'GET';
          const url = config.url || '';

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

  async get(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'GET', url });
  }

  async post(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'POST', url, data });
  }

  async put(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'PUT', url, data });
  }

  async delete(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'DELETE', url });
  }

  setCorrelationId(correlationId: string): void {
    this.client.defaults.headers.common['X-Correlation-ID'] = correlationId;
  }
}

export function createInternalHttpClient(baseURL: string, logger: any): HttpClient {
  return new HttpClient({ baseURL, enableInternalAuth: true }, logger);
}
