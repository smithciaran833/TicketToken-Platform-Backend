import axios, { AxiosInstance, AxiosError } from 'axios';
import { FastifyInstance } from 'fastify';
import { Venue, VenueAccessCheck, VenueServiceErrorResponse } from '../types/venue-service.types';
import { serviceUrls } from '../config/services';
import { getCircuitBreaker } from '../middleware/circuit-breaker.middleware';
import { logSecurityEvent } from '../utils/logger';
import { generateInternalAuthHeaders } from '../utils/internal-auth';

export class VenueServiceClient {
  private httpClient: AxiosInstance;
  private server: FastifyInstance;
  private serviceUrl: string;

  constructor(server: FastifyInstance) {
    this.server = server;
    this.serviceUrl = serviceUrls.venue;

    this.httpClient = axios.create({
      baseURL: this.serviceUrl,
      timeout: 3000,  // Faster timeout for access checks
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check if user has access to a specific venue with a given permission
   * This is a critical security function - must fail secure
   */
  async checkUserVenueAccess(
    userId: string,
    venueId: string,
    permission: string
  ): Promise<boolean> {
    const circuitBreaker = getCircuitBreaker('venue-service');
    const path = '/internal/access-check';
    const body = { userId, venueId, permission };

    try {
      const makeRequest = async () => {
        const internalHeaders = generateInternalAuthHeaders('POST', path, body);
        const response = await this.httpClient.post<VenueAccessCheck>(
          path,
          body,
          { headers: internalHeaders }
        );
        return response.data;
      };

      const result = circuitBreaker
        ? (await circuitBreaker.fire(makeRequest) as VenueAccessCheck)
        : await makeRequest();

      // Log security-relevant access checks
      if (!result.hasAccess) {
        logSecurityEvent('venue_access_denied', {
          userId,
          venueId,
          permission,
          result
        }, 'medium');
      }

      return result.hasAccess;
    } catch (error) {
      // CRITICAL: On error, fail secure (deny access)
      this.handleError(error, 'checkUserVenueAccess', { userId, venueId, permission });

      logSecurityEvent('venue_access_check_failed', {
        userId,
        venueId,
        permission,
        error: (error as any).message
      }, 'high');

      // Fail secure - deny access when service unavailable
      return false;
    }
  }

  /**
   * Get all venues accessible by a user
   */
  async getUserVenues(userId: string): Promise<Venue[]> {
    const circuitBreaker = getCircuitBreaker('venue-service');
    const path = `/internal/users/${userId}/venues`;

    try {
      const makeRequest = async () => {
        const internalHeaders = generateInternalAuthHeaders('GET', path);
        const response = await this.httpClient.get<Venue[]>(path, {
          headers: internalHeaders
        });
        return response.data;
      };

      const venues = circuitBreaker
        ? (await circuitBreaker.fire(makeRequest) as Venue[])
        : await makeRequest();

      return venues;
    } catch (error) {
      this.handleError(error, 'getUserVenues', { userId });
      return [];
    }
  }

  /**
   * Get venue by ID
   */
  async getVenueById(venueId: string): Promise<Venue | null> {
    const circuitBreaker = getCircuitBreaker('venue-service');
    const path = `/api/v1/venues/${venueId}`;

    try {
      const makeRequest = async () => {
        const internalHeaders = generateInternalAuthHeaders('GET', path);
        const response = await this.httpClient.get<Venue>(path, {
          headers: internalHeaders
        });
        return response.data;
      };

      const venue = circuitBreaker
        ? (await circuitBreaker.fire(makeRequest) as Venue)
        : await makeRequest();

      return venue;
    } catch (error) {
      return this.handleError(error, 'getVenueById', { venueId });
    }
  }

  /**
   * Handle errors from venue-service
   */
  private handleError(error: any, method: string, context?: any): any {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<VenueServiceErrorResponse>;

      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
        this.server.log.error({
          method,
          context,
          error: 'Venue service unavailable',
          code: axiosError.code
        }, 'VenueServiceClient error');

        return null;
      }

      if (axiosError.response?.status === 404) {
        this.server.log.warn({
          method,
          context,
          status: 404
        }, 'Venue not found');
        return null;
      }

      this.server.log.error({
        method,
        context,
        status: axiosError.response?.status,
        message: axiosError.response?.data?.message || axiosError.message
      }, 'VenueServiceClient error');
    } else {
      this.server.log.error({
        method,
        context,
        error: error.message
      }, 'VenueServiceClient unexpected error');
    }

    return null;
  }

  /**
   * Health check for venue service
   * Note: Health checks don't need internal auth - they're public endpoints
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', { timeout: 2000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
