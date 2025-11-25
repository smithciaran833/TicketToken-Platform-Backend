import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * MintingServiceClient
 * 
 * Client for communicating with the minting-service to create NFT tickets.
 * Implements Option B: Delegate minting to specialized minting-service.
 * 
 * Features:
 * - Internal service authentication
 * - Automatic retries with exponential backoff
 * - Circuit breaker pattern
 * - Request/response logging
 * - Error handling and metrics
 */

export interface MintTicketRequest {
  ticketId: string;
  userId: string;
  eventId: string;
  ticketTypeId: string;
  metadata: {
    eventName: string;
    eventDate: string;
    venue: string;
    seatInfo?: string;
    ticketType: string;
    price: number;
  };
  tenantId: string;
}

export interface MintTicketResponse {
  success: boolean;
  mintAddress?: string;
  transactionSignature?: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
  estimatedConfirmationTime?: number;
}

export interface MintStatusResponse {
  ticketId: string;
  mintAddress?: string;
  transactionSignature?: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmed: boolean;
  error?: string;
  confirmedAt?: string;
}

export class MintingServiceClient {
  private client: AxiosInstance;
  private readonly serviceName = 'minting-service';
  private circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime?: number;
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 1 minute

  constructor() {
    const baseURL = config.services.minting || 'http://minting-service:3007';
    const timeout = config.serviceTimeout || 30000;

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'ticket-service',
        'X-Internal-Auth': config.internalServiceSecret || '',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Minting service request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('Minting service request error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and circuit breaker
    this.client.interceptors.response.use(
      (response) => {
        this.onSuccess();
        logger.debug('Minting service response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        this.onFailure();
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Mint an NFT ticket
   * Sends ticket data to minting-service for NFT creation
   */
  async mintTicket(request: MintTicketRequest): Promise<MintTicketResponse> {
    try {
      // Check circuit breaker
      if (!this.canMakeRequest()) {
        throw new Error('Circuit breaker is open - minting service unavailable');
      }

      logger.info('Requesting NFT mint', { 
        ticketId: request.ticketId,
        userId: request.userId,
        eventId: request.eventId 
      });

      const response = await this.retryRequest(async () => {
        return await this.client.post<MintTicketResponse>('/api/v1/mint/ticket', request);
      });

      logger.info('NFT mint request successful', {
        ticketId: request.ticketId,
        status: response.data.status,
        mintAddress: response.data.mintAddress,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to mint NFT ticket', {
        ticketId: request.ticketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return failure response instead of throwing
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown minting error',
      };
    }
  }

  /**
   * Check minting status for a ticket
   * Polls minting-service for confirmation status
   */
  async getMintStatus(ticketId: string): Promise<MintStatusResponse> {
    try {
      if (!this.canMakeRequest()) {
        throw new Error('Circuit breaker is open - minting service unavailable');
      }

      logger.debug('Checking mint status', { ticketId });

      const response = await this.client.get<MintStatusResponse>(
        `/api/v1/mint/status/${ticketId}`
      );

      logger.debug('Mint status retrieved', {
        ticketId,
        status: response.data.status,
        confirmed: response.data.confirmed,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get mint status', {
        ticketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Batch mint multiple tickets
   * Optimized for bulk minting operations
   */
  async batchMintTickets(requests: MintTicketRequest[]): Promise<MintTicketResponse[]> {
    try {
      if (!this.canMakeRequest()) {
        throw new Error('Circuit breaker is open - minting service unavailable');
      }

      logger.info('Requesting batch NFT mint', { 
        count: requests.length,
        ticketIds: requests.map(r => r.ticketId) 
      });

      const response = await this.client.post<{ results: MintTicketResponse[] }>(
        '/api/v1/mint/batch',
        { tickets: requests }
      );

      logger.info('Batch mint request successful', {
        count: requests.length,
        successful: response.data.results.filter(r => r.success).length,
      });

      return response.data.results;
    } catch (error) {
      logger.error('Failed batch mint', {
        count: requests.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return failure responses for all tickets
      return requests.map(req => ({
        success: false,
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Batch minting failed',
      }));
    }
  }

  /**
   * Health check for minting service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.warn('Minting service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Retry request with exponential backoff
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on client errors (4xx)
        if (axios.isAxiosError(error) && error.response?.status && error.response.status < 500) {
          throw error;
        }

        // Last attempt - throw error
        if (attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Circuit breaker: Check if requests can be made
   */
  private canMakeRequest(): boolean {
    // Check if circuit should reset
    if (this.circuitBreakerState === 'open' && this.lastFailureTime) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        logger.info('Circuit breaker moving to half-open state');
        this.circuitBreakerState = 'half-open';
        this.failureCount = 0;
      } else {
        logger.warn('Circuit breaker is open', {
          failureCount: this.failureCount,
          threshold: this.failureThreshold,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Circuit breaker: Record successful request
   */
  private onSuccess(): void {
    if (this.circuitBreakerState === 'half-open') {
      logger.info('Circuit breaker moving to closed state');
      this.circuitBreakerState = 'closed';
      this.failureCount = 0;
      this.lastFailureTime = undefined;
    }
  }

  /**
   * Circuit breaker: Record failed request
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      logger.error('Circuit breaker opening', {
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
      });
      this.circuitBreakerState = 'open';
    }
  }

  /**
   * Handle and log errors
   */
  private handleError(error: AxiosError | Error): void {
    if (axios.isAxiosError(error)) {
      logger.error('Minting service error', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
    } else {
      logger.error('Minting service error', {
        message: error.message,
      });
    }
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: string;
    failureCount: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.circuitBreakerState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// Export singleton instance
export const mintingServiceClient = new MintingServiceClient();
