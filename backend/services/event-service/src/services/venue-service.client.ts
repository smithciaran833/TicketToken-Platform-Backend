import fetch from 'node-fetch';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger';
import { config } from '../config';
import { ValidationError } from '../utils/errors';

export class VenueServiceClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.baseUrl = config.services.venueServiceUrl || process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
    
    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    };
    
    this.circuitBreaker = new CircuitBreaker(this.request.bind(this), options);
  }

  private async request(path: string, options: any = {}) {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Venue service error: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        throw error;
      }
      
      return response.json();
    } catch (error) {
      logger.error({ error, url }, 'Venue service request failed');
      throw error;
    }
  }

  async validateVenueAccess(venueId: string, authToken: string): Promise<boolean> {
    try {
      // Just try to get the venue - if it exists and user has access, this succeeds
      const venue = await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'Authorization': authToken
        }
      });
      logger.info({ venueId, exists: true }, 'Venue exists and accessible');
      return true;
    } catch (error: any) {
      logger.error({ error, venueId }, 'Venue validation failed');
      // Check if it's a 404 (doesn't exist) or 403 (no access)
      if (error.message?.includes('404')) {
        throw new ValidationError('Venue does not exist');
      } else if (error.message?.includes('403')) {
        throw new ValidationError('No access to venue');
      }
      // For other errors, return false
      return false;
    }
  }

  async getVenue(venueId: string, authToken: string): Promise<any> {
    try {
      return await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'Authorization': authToken
        }
      });
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to get venue details');
      throw new ValidationError("Failed to retrieve venue details");
    }
  }
}

export const venueServiceClient = new VenueServiceClient();
