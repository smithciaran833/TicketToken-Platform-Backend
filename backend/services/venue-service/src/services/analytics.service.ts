import { HttpClient } from '../utils/httpClient';
import { getConfig } from '../config/index';

// Circuit Breaker for Analytics Service reliability
class AnalyticsCircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;
  private readonly threshold = 5;
  private readonly resetTimeout = 30000; // 30 seconds

  async execute<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (this.isOpen) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.isOpen = false;
        this.failures = 0;
      } else {
        return fallback;
      }
    }
    
    try {
      const result = await operation();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) {
        this.isOpen = true;
      }
      return fallback;
    }
  }
}

export class AnalyticsService {
  private httpClient: HttpClient;
  private logger: any;
  private circuitBreaker = new AnalyticsCircuitBreaker();

  constructor(dependencies: { logger: any }) {
    this.logger = dependencies.logger;
    const config = getConfig();
    this.httpClient = new HttpClient(
      config.services.analyticsService,
      this.logger
    );
  }

  // Timeout wrapper for HTTP calls
  private async withTimeout<T>(promise: Promise<T>, ms: number = 10000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Analytics service timeout')), ms)
      )
    ]);
  }

  async getVenueAnalytics(venueId: string, options: any = {}): Promise<any> {
    const fallback = { metrics: [], timeRange: options.timeRange, venueId };
    
    try {
      const response = await this.withTimeout(
        this.circuitBreaker.execute(
          async () => {
            const res: any = await this.httpClient.get(`/venues/${venueId}/analytics`, {
              params: options
            });
            return res.data;
          },
          fallback
        )
      );
      return response;
    } catch (error) {
      this.logger.warn({ error, venueId }, 'Analytics service unavailable');
      return fallback;
    }
  }

  async trackEvent(eventData: any): Promise<boolean> {
    try {
      await this.withTimeout(
        this.circuitBreaker.execute(
          async () => {
            const response: any = await this.httpClient.post('/events', eventData);
            return response.data;
          },
          null
        )
      );
      return true;
    } catch (error) {
      this.logger.warn({ error, eventData }, 'Failed to track event (non-critical)');
      return false;
    }
  }
}
