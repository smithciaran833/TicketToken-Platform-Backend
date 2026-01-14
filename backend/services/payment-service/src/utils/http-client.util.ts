/**
 * Secure HTTP Client for Internal Services
 *
 * HIGH FIX: Enforces HTTPS for all internal service communication in production.
 * Provides TLS certificate validation, request signing, and automatic retry.
 *
 * LOW FIX: Added circuit breaker for S2S calls to prevent cascade failures.
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { logger } from './logger';
import { generateHmacSignature, verifyHmacSignature } from './crypto.util';
import { config } from '../config';

const log = logger.child({ component: 'HttpClient' });

// =============================================================================
// CONFIGURATION
// =============================================================================

interface HttpClientConfig {
  enforceHttps: boolean;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  hmacSecret?: string;
  serviceName: string;
  tlsOptions?: {
    rejectUnauthorized: boolean;
    ca?: string | Buffer;
    cert?: string | Buffer;
    key?: string | Buffer;
  };
}

const defaultConfig: HttpClientConfig = {
  enforceHttps: config.server.env === 'production',
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
  hmacSecret: config.serviceAuth.hmacSecret,
  serviceName: 'payment-service',
  tlsOptions: {
    rejectUnauthorized: config.server.env === 'production',
  },
};

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  skipHmac?: boolean;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  data: T;
  duration: number;
}

// =============================================================================
// HTTP CLIENT CLASS
// =============================================================================

export class SecureHttpClient {
  private baseUrl: URL;
  private config: HttpClientConfig;
  private agent: https.Agent | http.Agent;

  constructor(baseUrl: string, options: Partial<HttpClientConfig> = {}) {
    this.config = { ...defaultConfig, ...options };
    this.baseUrl = this.validateAndUpgradeUrl(baseUrl);

    if (this.baseUrl.protocol === 'https:') {
      this.agent = new https.Agent({
        keepAlive: true,
        maxSockets: 50,
        timeout: this.config.timeoutMs,
        ...this.config.tlsOptions,
      });
    } else {
      this.agent = new http.Agent({
        keepAlive: true,
        maxSockets: 50,
        timeout: this.config.timeoutMs,
      });
    }

    log.info({
      baseUrl: this.baseUrl.toString(),
      protocol: this.baseUrl.protocol,
      enforceHttps: this.config.enforceHttps,
    }, 'HTTP client initialized');
  }

  private validateAndUpgradeUrl(urlString: string): URL {
    const url = new URL(urlString);

    if (this.config.enforceHttps && url.protocol === 'http:') {
      const isInternalService = url.hostname.endsWith('.svc.cluster.local') ||
                                url.hostname.includes('-service') ||
                                url.hostname === 'localhost' ||
                                url.hostname === '127.0.0.1';

      if (config.server.env === 'production') {
        log.warn({
          original: urlString,
          hostname: url.hostname,
        }, 'Upgrading HTTP to HTTPS for internal service');
        url.protocol = 'https:';
      } else if (!isInternalService) {
        log.warn({ url: urlString }, 'Non-HTTPS URL used in non-production environment');
      }
    }

    return url;
  }

  private signRequest(
    method: string,
    path: string,
    body?: unknown
  ): { signature: string; timestamp: string; nonce: string } {
    if (!this.config.hmacSecret) {
      throw new Error('HMAC secret not configured for request signing');
    }

    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const bodyString = body ? JSON.stringify(body) : '';

    const payload = `${timestamp}:${nonce}:${method}:${path}:${bodyString}`;
    const hmacResult = generateHmacSignature(payload, this.config.hmacSecret);

    return { signature: hmacResult.signature, timestamp, nonce };
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const maxRetries = options.retries ?? this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.doRequest<T>(options, attempt);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message.includes('4') && lastError.message.match(/\b4\d{2}\b/)) {
          throw lastError;
        }

        if (attempt >= maxRetries) {
          break;
        }

        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        log.warn({
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: lastError.message,
        }, 'Request failed, retrying');

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private doRequest<T>(options: HttpRequestOptions, attempt: number): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const fullPath = `${this.baseUrl.pathname}${options.path}`.replace(/\/+/g, '/');
      const url = new URL(fullPath, this.baseUrl);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': `${this.config.serviceName}/1.0`,
        'X-Request-ID': crypto.randomUUID(),
        'X-Source-Service': this.config.serviceName,
        ...options.headers,
      };

      if (this.config.hmacSecret && !options.skipHmac) {
        const sig = this.signRequest(options.method, fullPath, options.body);
        headers['X-Signature'] = sig.signature;
        headers['X-Timestamp'] = sig.timestamp;
        headers['X-Nonce'] = sig.nonce;
      }

      const bodyString = options.body ? JSON.stringify(options.body) : undefined;
      if (bodyString) {
        headers['Content-Length'] = Buffer.byteLength(bodyString).toString();
      }

      const requestFn = url.protocol === 'https:' ? https.request : http.request;

      const req = requestFn({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method,
        headers,
        agent: this.agent,
        timeout: options.timeout ?? this.config.timeoutMs,
      }, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const body = Buffer.concat(chunks).toString('utf8');

          let data: T;
          try {
            data = body ? JSON.parse(body) : ({} as T);
          } catch {
            data = body as unknown as T;
          }

          const responseHeaders: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            responseHeaders[key] = value;
          }

          log.info({
            method: options.method,
            path: options.path,
            status: res.statusCode,
            duration,
            attempt: attempt + 1,
          }, 'HTTP request completed');

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(data)}`));
            return;
          }

          resolve({
            status: res.statusCode || 200,
            headers: responseHeaders,
            data,
            duration,
          });
        });
      });

      req.on('error', (error) => {
        log.error({
          method: options.method,
          path: options.path,
          error: error.message,
          attempt: attempt + 1,
        }, 'HTTP request failed');
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (bodyString) {
        req.write(bodyString);
      }
      req.end();
    });
  }

  async get<T = unknown>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', path, headers });
  }

  async post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', path, body, headers });
  }

  async put<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', path, body, headers });
  }

  async patch<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', path, body, headers });
  }

  async delete<T = unknown>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', path, headers });
  }
}

// =============================================================================
// PRE-CONFIGURED SERVICE CLIENTS
// =============================================================================

export function createServiceClient(serviceName: keyof typeof config.services): SecureHttpClient {
  const baseUrl = config.services[serviceName];

  return new SecureHttpClient(baseUrl, {
    serviceName: 'payment-service',
    enforceHttps: config.server.env === 'production',
    hmacSecret: config.serviceAuth.hmacSecret,
  });
}

let authClient: SecureHttpClient | null = null;
let eventClient: SecureHttpClient | null = null;
let ticketClient: SecureHttpClient | null = null;
let venueClient: SecureHttpClient | null = null;
let marketplaceClient: SecureHttpClient | null = null;

export const serviceClients = {
  get auth(): SecureHttpClient {
    if (!authClient) authClient = createServiceClient('authUrl');
    return authClient;
  },

  get event(): SecureHttpClient {
    if (!eventClient) eventClient = createServiceClient('eventUrl');
    return eventClient;
  },

  get ticket(): SecureHttpClient {
    if (!ticketClient) ticketClient = createServiceClient('ticketUrl');
    return ticketClient;
  },

  get venue(): SecureHttpClient {
    if (!venueClient) venueClient = createServiceClient('venueUrl');
    return venueClient;
  },

  get marketplace(): SecureHttpClient {
    if (!marketplaceClient) marketplaceClient = createServiceClient('marketplaceUrl');
    return marketplaceClient;
  },
};

// =============================================================================
// LOW FIX: CIRCUIT BREAKER FOR S2S CALLS
// =============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenRequests: 1,
};

function getCircuitBreaker(serviceName: string): CircuitBreakerState {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
    });
  }
  return circuitBreakers.get(serviceName)!;
}

function canMakeRequest(serviceName: string): boolean {
  const cb = getCircuitBreaker(serviceName);

  if (cb.state === 'closed') {
    return true;
  }

  if (cb.state === 'open') {
    if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
      cb.state = 'half-open';
      return true;
    }
    return false;
  }

  return true;
}

function recordSuccess(serviceName: string): void {
  const cb = getCircuitBreaker(serviceName);
  cb.failures = 0;
  cb.state = 'closed';
}

function recordFailure(serviceName: string): void {
  const cb = getCircuitBreaker(serviceName);
  cb.failures++;
  cb.lastFailure = Date.now();

  if (cb.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    cb.state = 'open';
    log.warn({ serviceName, failures: cb.failures }, 'Circuit breaker opened for service');
  }
}

export async function makeS2SRequest<T = unknown>(
  serviceName: string,
  client: SecureHttpClient,
  options: HttpRequestOptions
): Promise<HttpResponse<T>> {
  if (!canMakeRequest(serviceName)) {
    throw new Error(`Circuit breaker open for ${serviceName}`);
  }

  try {
    const response = await client.request<T>(options);
    recordSuccess(serviceName);
    return response;
  } catch (error) {
    recordFailure(serviceName);
    throw error;
  }
}

export function getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
  const status: Record<string, CircuitBreakerState> = {};
  circuitBreakers.forEach((state, name) => {
    status[name] = { ...state };
  });
  return status;
}

export function resetCircuitBreaker(serviceName: string): void {
  const cb = getCircuitBreaker(serviceName);
  cb.failures = 0;
  cb.state = 'closed';
  cb.lastFailure = 0;
  log.info({ serviceName }, 'Circuit breaker reset');
}
