import { DataSource } from '../types';
import { ProxyService } from './proxy.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('aggregator-service');

export class AggregatorService {
  constructor(private proxyService: ProxyService) {}

  async aggregate(dataSources: DataSource[], request: any): Promise<any> {
    const required = dataSources.filter(ds => ds.required);
    const optional = dataSources.filter(ds => !ds.required);

    // Execute required requests first
    const requiredResults = await this.executeRequired(required, request);

    // Execute optional requests with timeout
    const optionalResults = await this.executeOptional(optional, request);

    // Merge all results
    return this.mergeResults(requiredResults, optionalResults, dataSources);
  }

  private async executeRequired(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute in parallel
    const promises = dataSources.map(async (ds) => {
      try {
        const response = await this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const data = ds.transform ? ds.transform(response.data) : response.data;
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.error({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Required data source failed');
        
        throw new Error(`Failed to fetch required data: ${ds.name}`);
      }
    });

    const responses = await Promise.all(promises);

    for (const response of responses) {
      results[response.name] = response.data;
    }

    return results;
  }

  private async executeOptional(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute with timeout and fallback
    const promises = dataSources.map(async (ds) => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 2000);
        });

        const dataPromise = this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const response = await Promise.race([dataPromise, timeoutPromise]);
        const data = ds.transform ? ds.transform(response.data) : response.data;
        
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.warn({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Optional data source failed, using fallback');

        return { name: ds.name, data: ds.fallback, success: false };
      }
    });

    const responses = await Promise.allSettled(promises);

    for (const response of responses) {
      if (response.status === 'fulfilled') {
        results[response.value.name] = response.value.data;
      }
    }

    return results;
  }

  private mergeResults(
    required: Record<string, any>,
    optional: Record<string, any>,
    dataSources: DataSource[]
  ): any {
    const merged = {
      ...required,
      ...optional,
      _metadata: {
        timestamp: new Date().toISOString(),
        sources: dataSources.map(ds => ({
          name: ds.name,
          required: ds.required,
          success: required[ds.name] !== undefined || optional[ds.name] !== undefined,
        })),
      },
    };

    return merged;
  }

  // Pre-defined aggregation patterns for TicketToken
  async getEventDetails(eventId: string, request: any): Promise<any> {
    const dataSources: DataSource[] = [
      {
        name: 'event',
        service: 'event-service',
        endpoint: `/events/${eventId}`,
        required: true,
      },
      {
        name: 'venue',
        service: 'venue-service',
        endpoint: `/events/${eventId}/venue`,
        required: true,
      },
      {
        name: 'tickets',
        service: 'ticket-service',
        endpoint: `/events/${eventId}/availability`,
        required: true,
        transform: (data: any) => ({
          available: data.available_count,
          soldOut: data.available_count === 0,
          tiers: data.ticket_tiers,
        }),
      },
      {
        name: 'nftStatus',
        service: 'nft-service',
        endpoint: `/events/${eventId}/nft-config`,
        required: false,
        fallback: { enabled: false },
      },
      {
        name: 'analytics',
        service: 'analytics-service',
        endpoint: `/events/${eventId}/stats`,
        required: false,
        fallback: null,
      },
    ];

    return this.aggregate(dataSources, request);
  }

  async getUserDashboard(userId: string, request: any): Promise<any> {
    const dataSources: DataSource[] = [
      {
        name: 'profile',
        service: 'user-service',
        endpoint: `/users/${userId}`,
        required: true,
      },
      {
        name: 'tickets',
        service: 'ticket-service',
        endpoint: `/users/${userId}/tickets`,
        required: true,
        transform: (data: any) => ({
          upcoming: data.filter((t: any) => new Date(t.event_date) > new Date()),
          past: data.filter((t: any) => new Date(t.event_date) <= new Date()),
        }),
      },
      {
        name: 'nfts',
        service: 'nft-service',
        endpoint: `/users/${userId}/nfts`,
        required: false,
        fallback: [],
      },
      {
        name: 'transactions',
        service: 'payment-service',
        endpoint: `/users/${userId}/transactions?limit=10`,
        required: false,
        fallback: [],
      },
    ];

    return this.aggregate(dataSources, request);
  }
}
