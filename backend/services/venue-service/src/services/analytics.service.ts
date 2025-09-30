import { HttpClient } from '../utils/httpClient';

export class AnalyticsService {
  private httpClient: HttpClient;
  private logger: any;

  constructor(dependencies: { logger: any }) {
    this.logger = dependencies.logger;
    this.httpClient = new HttpClient(
      process.env.ANALYTICS_API_URL || 'http://analytics-service:3000',
      this.logger
    );
  }

  async getVenueAnalytics(venueId: string, options: any = {}) {
    try {
      const response: any = await this.httpClient.get(`/venues/${venueId}/analytics`, {
        params: options
      });
      return response.data;
    } catch (error) {
      this.logger.error({ error, venueId }, 'Failed to fetch venue analytics');
      throw error;
    }
  }

  async trackEvent(eventData: any) {
    try {
      const response: any = await this.httpClient.post('/events', eventData);
      return response.data;
    } catch (error) {
      this.logger.error({ error, eventData }, 'Failed to track event');
      throw error;
    }
  }
}
