import axios, { AxiosInstance } from 'axios';
import { FastifyRequest } from 'fastify';
import { getCorrelationId, logger } from './logger';
import { withCircuitBreaker } from './circuit-breaker';

const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
}

export function createHttpClient(options: HttpClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout || 5000,
  });

  client.interceptors.request.use((config) => {
    const correlationId = getCorrelationId();
    if (correlationId) {
      config.headers = config.headers || {};
      config.headers[CORRELATION_HEADER] = correlationId;
      config.headers[REQUEST_ID_HEADER] = correlationId;
    }
    logger.debug('Outbound HTTP request', { correlationId, method: config.method, url: config.url });
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      logger.debug('Outbound HTTP response', { correlationId: getCorrelationId(), status: response.status, url: response.config.url });
      return response;
    },
    (error) => {
      logger.error('Outbound HTTP error', { correlationId: getCorrelationId(), status: error.response?.status, url: error.config?.url, message: error.message });
      throw error;
    }
  );

  return client;
}

export function getCorrelationHeaders(request?: FastifyRequest): Record<string, string> {
  const correlationId = request?.correlationId || getCorrelationId() || '';
  return { [CORRELATION_HEADER]: correlationId, [REQUEST_ID_HEADER]: correlationId };
}

export function createProtectedRequest<T>(
  name: string,
  requestFn: () => Promise<T>,
  options: { timeout?: number; fallback?: () => T } = {}
): () => Promise<T> {
  return withCircuitBreaker<T>(name, async () => requestFn(), options.fallback, { timeout: options.timeout || 5000 });
}

export const internalClients = {
  venueService: createHttpClient({ baseURL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002', timeout: 5000 }),
  notificationService: createHttpClient({ baseURL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008', timeout: 5000 }),
  apiGateway: createHttpClient({ baseURL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000', timeout: 5000 }),
};
