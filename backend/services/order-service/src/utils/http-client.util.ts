import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { logger } from './logger';
import https from 'https';

/**
 * SC1, SC2, OR1, OR2, OR3, OR4: Secure HTTP client for S2S communication
 * - Enforces HTTPS in production
 * - Adds authentication headers
 * - Propagates correlation IDs
 * - Includes retry logic with jitter
 */

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

// SC5: TLS configuration for production
const httpsAgent = new https.Agent({
  rejectUnauthorized: NODE_ENV === 'production', // SC2: Strict cert validation in prod
  minVersion: 'TLSv1.2',
});

interface ServiceClientConfig {
  baseUrl: string;
  serviceName: string;
  timeout?: number;
  retries?: number;
}

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

/**
 * Create HMAC signature for internal service authentication
 */
function createAuthSignature(
  serviceName: string,
  timestamp: string,
  nonce: string,
  method: string,
  path: string
): string {
  if (!INTERNAL_SERVICE_SECRET) {
    throw new Error('INTERNAL_SERVICE_SECRET not configured');
  }
  return crypto
    .createHmac('sha256', INTERNAL_SERVICE_SECRET)
    .update(`${serviceName}:${timestamp}:${nonce}:${method}:${path}`)
    .digest('hex');
}

/**
 * Generate a random nonce for replay protection
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Add jitter to retry delay for thundering herd prevention
 */
function calculateRetryDelay(attempt: number, baseDelay: number = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * exponentialDelay * 0.3; // 30% jitter
  return exponentialDelay + jitter;
}

/**
 * Secure service client factory
 * Creates an axios instance with S2S authentication and security features
 */
export function createSecureServiceClient(config: ServiceClientConfig): AxiosInstance {
  // SC1: Enforce HTTPS in production
  let baseURL = config.baseUrl;
  if (NODE_ENV === 'production' && !baseURL.startsWith('https://')) {
    logger.error(`Service URL must use HTTPS in production: ${config.serviceName}`);
    throw new Error(`HTTPS required for ${config.serviceName} in production`);
  }

  const client = axios.create({
    baseURL,
    timeout: config.timeout || 10000,
    httpsAgent: NODE_ENV === 'production' ? httpsAgent : undefined,
    validateStatus: (status) => status < 500, // Don't throw on 4xx
  });

  // Request interceptor to add authentication headers
  client.interceptors.request.use((axiosConfig) => {
    const timestamp = Date.now().toString();
    const nonce = generateNonce();
    const method = axiosConfig.method?.toUpperCase() || 'GET';
    const path = axiosConfig.url || '/';

    // OR1: Add authentication headers
    axiosConfig.headers['X-Service-Name'] = SERVICE_NAME;
    axiosConfig.headers['X-Request-Timestamp'] = timestamp;
    axiosConfig.headers['X-Request-Nonce'] = nonce;

    // Create HMAC signature
    try {
      const signature = createAuthSignature(SERVICE_NAME, timestamp, nonce, method, path);
      axiosConfig.headers['X-Internal-Auth'] = signature;
    } catch (error) {
      logger.error('Failed to create auth signature', { error, serviceName: config.serviceName });
    }

    // OR2: Propagate correlation ID from request context if available
    const context = (axiosConfig as any).context as RequestContext;
    if (context?.requestId) {
      axiosConfig.headers['X-Request-ID'] = context.requestId;
    }
    if (context?.traceId) {
      axiosConfig.headers['X-Trace-ID'] = context.traceId;
    }
    if (context?.spanId) {
      axiosConfig.headers['X-Span-ID'] = context.spanId;
    }

    // OR3: Propagate tenant context
    if (context?.tenantId) {
      axiosConfig.headers['X-Tenant-ID'] = context.tenantId;
    }

    // OR4: Propagate user context
    if (context?.userId) {
      axiosConfig.headers['X-User-ID'] = context.userId;
    }

    return axiosConfig;
  });

  // Response interceptor for logging
  client.interceptors.response.use(
    (response) => {
      logger.debug('S2S request successful', {
        service: config.serviceName,
        url: response.config.url,
        status: response.status,
        duration: response.headers['x-response-time'],
      });
      return response;
    },
    (error) => {
      logger.error('S2S request failed', {
        service: config.serviceName,
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      });
      throw error;
    }
  );

  return client;
}

/**
 * Execute request with retry and exponential backoff with jitter
 */
export async function executeWithRetry<T>(
  fn: () => Promise<AxiosResponse<T>>,
  maxRetries: number = 3,
  serviceName: string = 'unknown'
): Promise<AxiosResponse<T>> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on 4xx errors (client errors)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with jitter
      const delay = calculateRetryDelay(attempt);
      logger.warn(`Retrying ${serviceName} request`, {
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Service URL configuration with HTTPS enforcement in production
 */
export function getServiceUrl(serviceName: string, defaultUrl: string): string {
  const envVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_URL`;
  let url = process.env[envVar] || defaultUrl;

  // SC1: Enforce HTTPS in production
  if (NODE_ENV === 'production' && !url.startsWith('https://')) {
    logger.warn(`Converting ${serviceName} URL to HTTPS for production`);
    url = url.replace('http://', 'https://');
  }

  return url;
}

export default createSecureServiceClient;
