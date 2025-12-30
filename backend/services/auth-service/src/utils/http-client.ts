import axios, { AxiosInstance, AxiosError } from 'axios';
import { FastifyRequest } from 'fastify';
import { getCorrelationId, logger } from './logger';
import { withCircuitBreaker } from './circuit-breaker';

const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface RetryConfig {
  retries: number;
  retryDelay: number;
  retryCount?: number;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(attempt: number, baseDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * Math.random();
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Check if error is retryable
 */
function isRetryable(error: AxiosError): boolean {
  // Network errors
  if (!error.response) {
    return true;
  }
  
  // Retry on 5xx errors (server errors)
  const status = error.response.status;
  if (status >= 500 && status <= 599) {
    return true;
  }
  
  // Retry on 429 (rate limited)
  if (status === 429) {
    return true;
  }
  
  // Don't retry client errors (4xx except 429)
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createHttpClient(options: HttpClientOptions = {}): AxiosInstance {
  const retryConfig: RetryConfig = {
    retries: options.retries ?? 3,
    retryDelay: options.retryDelay ?? 1000,
  };

  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout || 5000,
  });

  // Request interceptor - add correlation ID
  client.interceptors.request.use((config) => {
    const correlationId = getCorrelationId();
    if (correlationId) {
      config.headers = config.headers || {};
      config.headers[CORRELATION_HEADER] = correlationId;
      config.headers[REQUEST_ID_HEADER] = correlationId;
    }
    logger.debug('Outbound HTTP request', {
      correlationId,
      method: config.method,
      url: config.url,
    });
    return config;
  });

  // Response interceptor - handle success
  client.interceptors.response.use(
    (response) => {
      logger.debug('Outbound HTTP response', {
        correlationId: getCorrelationId(),
        status: response.status,
        url: response.config.url,
      });
      return response;
    }
  );

  // Error interceptor with retry logic
  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as any;
    
    // Initialize retry count
    config.__retryCount = config.__retryCount || 0;

    const correlationId = getCorrelationId();
    
    // Check if we should retry
    if (config.__retryCount < retryConfig.retries && isRetryable(error)) {
      config.__retryCount += 1;
      
      const delay = calculateBackoff(config.__retryCount, retryConfig.retryDelay);
      
      logger.warn('Retrying HTTP request', {
        correlationId,
        attempt: config.__retryCount,
        maxRetries: retryConfig.retries,
        delay,
        url: config.url,
        status: error.response?.status,
        message: error.message,
      });

      await sleep(delay);
      
      return client.request(config);
    }

    // No more retries - log and throw
    logger.error('Outbound HTTP error (no more retries)', {
      correlationId,
      attempts: config.__retryCount + 1,
      status: error.response?.status,
      url: config.url,
      message: error.message,
    });

    throw error;
  });

  return client;
}

export function getCorrelationHeaders(request?: FastifyRequest): Record<string, string> {
  const correlationId = request?.correlationId || getCorrelationId() || '';
  return {
    [CORRELATION_HEADER]: correlationId,
    [REQUEST_ID_HEADER]: correlationId,
  };
}

export function createProtectedRequest<T>(
  name: string,
  requestFn: () => Promise<T>,
  options: { timeout?: number; fallback?: () => T } = {}
): () => Promise<T> {
  return withCircuitBreaker<T>(
    name,
    async () => requestFn(),
    options.fallback,
    { timeout: options.timeout || 5000 }
  );
}

// Pre-configured clients for internal services
export const internalClients = {
  venueService: createHttpClient({
    baseURL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    timeout: 5000,
    retries: 3,
    retryDelay: 500,
  }),
  notificationService: createHttpClient({
    baseURL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008',
    timeout: 5000,
    retries: 3,
    retryDelay: 500,
  }),
  apiGateway: createHttpClient({
    baseURL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    timeout: 5000,
    retries: 2,
    retryDelay: 1000,
  }),
};
