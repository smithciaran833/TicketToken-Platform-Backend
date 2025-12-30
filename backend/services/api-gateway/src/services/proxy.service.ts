import { serviceUrls } from '../config/services';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';

// Custom error classes for proper error categorization
export class ProxyError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    service: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ProxyError';
    this.statusCode = statusCode;
    this.code = code;
    this.service = service;
    this.originalError = originalError;
  }
}

export class ServiceNotFoundError extends ProxyError {
  constructor(service: string) {
    super(`Service ${service} not found`, 500, 'SERVICE_NOT_FOUND', service);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceUnavailableError extends ProxyError {
  constructor(service: string, originalError?: Error) {
    super(`${service} is unavailable`, 503, 'SERVICE_UNAVAILABLE', service, originalError);
    this.name = 'ServiceUnavailableError';
  }
}

export class ServiceTimeoutError extends ProxyError {
  constructor(service: string, timeout: number, originalError?: Error) {
    super(`${service} timed out after ${timeout}ms`, 504, 'SERVICE_TIMEOUT', service, originalError);
    this.name = 'ServiceTimeoutError';
  }
}

export class BadGatewayError extends ProxyError {
  constructor(service: string, message: string, originalError?: Error) {
    super(`${service} error: ${message}`, 502, 'BAD_GATEWAY', service, originalError);
    this.name = 'BadGatewayError';
  }
}

export class ProxyService {
  private serviceMap: Record<string, string>;

  constructor() {
    this.serviceMap = {
      'auth-service': serviceUrls.auth,
      'venue-service': serviceUrls.venue,
      'event-service': serviceUrls.event,
      'ticket-service': serviceUrls.ticket,
      'payment-service': serviceUrls.payment,
      'nft-service': serviceUrls.marketplace,
      'notification-service': serviceUrls.notification,
      'analytics-service': serviceUrls.analytics,
      'marketplace-service': serviceUrls.marketplace,
      'integration-service': serviceUrls.integration,
      'compliance-service': serviceUrls.compliance,
      'queue-service': serviceUrls.queue,
      'search-service': serviceUrls.search,
      'file-service': serviceUrls.file,
      'monitoring-service': serviceUrls.monitoring,
      'blockchain-service': serviceUrls.blockchain,
      'order-service': serviceUrls.order,
      'scanning-service': serviceUrls.scanning,
      'minting-service': serviceUrls.minting,
      'transfer-service': serviceUrls.transfer,
    };
  }

  getServiceUrl(serviceName: string): string {
    return this.serviceMap[serviceName];
  }

  setForwardedHeaders(request: any, headers: any): void {
    headers['x-forwarded-for'] = request.ip;
    headers['x-forwarded-proto'] = request.protocol;
    headers['x-forwarded-host'] = request.hostname || request.headers.host || 'api-gateway';
    headers['x-forwarded-port'] = request.socket.localPort;
  }

  async forward(request: any, service: string, options?: any): Promise<any> {
    const serviceUrl = this.getServiceUrl(service);
    if (!serviceUrl) {
      throw new ServiceNotFoundError(service);
    }

    const headers = { ...request.headers };
    this.setForwardedHeaders(request, headers);

    const timeout = options?.timeout || 10000;
    const config: AxiosRequestConfig = {
      method: request.method || 'GET',
      url: `${serviceUrl}${request.url || ''}`,
      headers,
      data: request.body || request.data,
      timeout,
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      throw this.transformError(error, service, timeout);
    }
  }

  /**
   * Transform axios errors into categorized proxy errors
   * This provides consistent error handling and prevents information leakage
   */
  private transformError(error: unknown, service: string, timeout: number): ProxyError {
    if (!axios.isAxiosError(error)) {
      // Unknown error type
      return new BadGatewayError(
        service,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }

    const axiosError = error as AxiosError;

    // Connection refused - service is down
    if (axiosError.code === 'ECONNREFUSED') {
      return new ServiceUnavailableError(service, axiosError);
    }

    // Timeout errors
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new ServiceTimeoutError(service, timeout, axiosError);
    }

    // DNS resolution failed
    if (axiosError.code === 'ENOTFOUND') {
      return new ServiceUnavailableError(service, axiosError);
    }

    // Connection reset
    if (axiosError.code === 'ECONNRESET') {
      return new ServiceUnavailableError(service, axiosError);
    }

    // Response received but indicates error
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = (axiosError.response.data as any)?.message || axiosError.message;

      // 5xx errors from downstream service
      if (status >= 500) {
        return new BadGatewayError(service, message, axiosError);
      }

      // 4xx errors - pass through but wrap for consistency
      // Note: These are typically client errors that should be returned as-is
      return new ProxyError(message, status, 'DOWNSTREAM_ERROR', service, axiosError);
    }

    // Default: unknown axios error
    return new BadGatewayError(service, axiosError.message, axiosError);
  }
}
